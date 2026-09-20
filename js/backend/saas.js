/* נקודת הכניסה של הגרסה המסחרית: מחברת את השרת, מסך ההתחברות
   והאפליקציה עצמה, ומגדירה את מקור הנתונים שלה. */
(function (root) {
  'use strict';

  var Store = root.ShiftStore;
  var Data = root.ShiftData;
  var Model = root.ShiftModel;

  /* מקור נתונים שמדבר עם השרת במקום עם הדפדפן */
  function backendSource(backend, session) {
    var role = session.user.role;

    return {
      mode: 'backend',
      role: role,
      session: session,

      loadState: function () {
        var state = Store.emptyState();
        return backend.loadConfig().then(function (config) {
          if (config) {
            if (config.settings) state.settings = config.settings;
            if (config.branches) state.branches = config.branches;
            if (config.employees) state.employees = config.employees;
          }
          return backend.listWeeks();
        }).then(function (keys) {
          // נטענים רק מפתחות השבועות; תוכן כל שבוע נטען בעת הצפייה בו
          keys.forEach(function (key) {
            if (!state.weeks[key]) state.weeks[key] = Store.emptyWeek();
          });
          return Store.migrate(state);
        });
      },

      /* מביא את תוכן השבוע מהשרת אם טרם נטען */
      ensureWeek: function (state, weekKey) {
        var week = state.weeks[weekKey];
        if (week && week._loaded) return Promise.resolve(week);
        return backend.loadWeek(weekKey).then(function (remote) {
          var target = Store.getWeek(state, weekKey);
          if (remote) {
            target.constraints = remote.constraints || {};
            target.assignments = remote.assignments || {};
            target.manual = remote.manual || {};
            target.holidays = remote.holidays || {};
            target.shabbatEnd = remote.shabbatEnd || '';
            target.note = remote.note || '';
            target.published = !!remote.published;
          }
          target._loaded = true;
          return target;
        }, function () { return null; });
      },

      saveConfig: function (state) {
        if (!Model.can(role, 'config.edit')) return Promise.resolve();
        return backend.saveConfig({
          settings: state.settings,
          branches: state.branches,
          employees: state.employees
        });
      },

      saveWeek: function (state, weekKey) {
        var week = state.weeks[weekKey];
        if (!week) return Promise.resolve();
        if (Model.can(role, 'schedule.edit')) {
          return backend.saveWeek(weekKey, {
            constraints: week.constraints, assignments: week.assignments,
            manual: week.manual, holidays: week.holidays,
            shabbatEnd: week.shabbatEnd, note: week.note, published: week.published
          });
        }
        return Promise.resolve();
      }
    };
  }

  function boot(options) {
    var opts = options || {};
    var backend = opts.backend;
    var authUI = new root.ShiftAuthUI.AuthUI({
      backend: backend,
      onSignedIn: function (session) { return enterApp(backend, session); },
      onSignedOut: function () { root.location.reload(); }
    });
    return authUI.start();
  }

  var started = false;

  function enterApp(backend, session) {
    if (started) { root.location.reload(); return Promise.resolve(); }
    started = true;

    document.body.setAttribute('data-role', session.user.role);

    /* עובד מקבל מסך משלו ולא את מערכת הניהול */
    if (session.user.role === 'employee') {
      document.getElementById('manager-root').classList.add('hidden');
      document.getElementById('employee-root').classList.remove('hidden');
      var employeeUI = new root.ShiftEmployeeUI.EmployeeUI({ backend: backend, session: session });
      backend.subscribe(function (change) {
        if (change.type === 'week' && change.weekKey === employeeUI.weekKey) { employeeUI.load(); }
      });
      return employeeUI.start().then(function () { return session; });
    }

    document.getElementById('employee-root').classList.add('hidden');
    document.getElementById('manager-root').classList.remove('hidden');

    var source = backendSource(backend, session);

    return root.ShiftApp.start({ source: source }).then(function () {
      // עדכונים חיים מחברי צוות אחרים באותה חברה
      backend.subscribe(function (change) {
        if (change.type === 'config') {
          root.ShiftApp.applyRemoteConfig({
            settings: change.config.settings,
            branches: change.config.branches,
            employees: change.config.employees
          });
        } else if (change.type === 'week') {
          root.ShiftApp.applyRemoteWeek(change.weekKey, change.week);
        }
      });
      if (root.ShiftUsersUI) {
        root.ShiftUsersUI.init({ backend: backend, session: session,
          getEmployees: function () { return root.ShiftApp.getState().employees; } });
      }
      return session;
    });
  }

  var API = { boot: boot, backendSource: backendSource };
  root.ShiftSaas = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
