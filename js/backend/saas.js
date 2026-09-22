/* נקודת הכניסה של הגרסה המסחרית: מחברת את השרת, מסך ההתחברות
   והאפליקציה עצמה, ומגדירה את מקור הנתונים שלה. */
(function (root) {
  'use strict';

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
  }

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
      /* מסך הסידור מדווח למשתמש איפה השינוי שלו נשמר. במצב הדגמה
         יש שרת מדומה בדפדפן, וזה אינו ענן. */
      storage: backend.isCloud ? 'cloud' : 'device',

      /* מגבלת התוכנית – נבדקת לפני הוספת עובד */
      planLimit: function (employeeCount) {
        var current = backend.session();
        return Model.withinPlanLimits(current ? current.company : session.company,
          { employees: employeeCount });
      },
      /* הכתובות של מי שכבר יש לו חשבון בחברה. משמש את הייבוא כדי
         לא לפתוח כרטיס שני למי שכבר הוזמן. כישלון אינו שובר את
         הייבוא – הוא רק מוותר על בדיקת הכפילות הזו. */
      listUserEmails: function () {
        if (!Model.can(role, 'users.manage')) return Promise.resolve([]);
        return backend.listUsers().then(function (users) {
          return (users || []).map(function (user) { return user.email; });
        }, function () { return []; });
      },
      decideConstraint: function (weekKey, employeeId, dayIdx, decision) {
        return backend.decideConstraint(weekKey, employeeId, dayIdx, decision, '');
      },

      /* פרסום קיים רק כשיש למי לפרסם. בכלי המקומי אין עובדים
         שמתחברים, ולכן אין גם כפתור.

         הפרסום עצמו נשמר כמו כל שינוי אחר בשבוע, בכתיבה אחת: שעת
         הפרסום והחתימה שלו יושבות ב-JSON של השבוע, ואין דרך לעדכן
         רק אותן בשרת בלי לשלוח את השבוע כולו. שתי כתיבות היו
         משאירות חלון שבו השבוע מסומן כמפורסם בלי לדעת מה פורסם. */
      canPublish: Model.can(role, 'schedule.publish'),
      onPlanBlocked: function () {
        var tab = document.querySelector('.tab[data-tab="billing"]');
        if (tab && !tab.classList.contains('hidden')) { tab.click(); }
      },

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
            target.publishedAt = remote.publishedAt || null;
            target.publishedSignature = remote.publishedSignature || '';
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
            shabbatEnd: week.shabbatEnd, note: week.note, published: week.published,
            publishedAt: week.publishedAt, publishedSignature: week.publishedSignature
          });
        }
        return Promise.resolve();
      }
    };
  }

  var opts = {};
  var authRef = null;

  function boot(options) {
    opts = options || {};
    var backend = opts.backend;
    authRef = new root.ShiftAuthUI.AuthUI({
      backend: backend,
      onSignedIn: function (session) { return enterApp(backend, session); },
      onSignedOut: function () { root.location.reload(); }
    });
    /* שרת אמיתי צריך לשחזר את ההתחברות מהאסימון השמור לפני שמסך
       הכניסה מצויר, אחרת משתמש מחובר יראה לרגע מסך התחברות.
       לשרת המדומה אין restore, והוא ממשיך מיד. */
    var ready = backend.restore ? backend.restore() : Promise.resolve(null);
    return ready.then(function () { return authRef.start(); },
      function () { return authRef.start(); });
  }

  var started = false;

  /* משווה שבוע לפני ואחרי, ומחזיר את ההתראות שראוי להציג לתפקיד הזה */
  function notificationsFor(role, employeeId, before, after) {
    var out = [];
    var Store = root.ShiftStore;
    var Data = root.ShiftData;
    var beforeConstraints = (before && before.constraints) || {};
    var afterConstraints = (after && after.constraints) || {};

    if (role === 'employee') {
      if (after && after.published && !(before && before.published)) {
        out.push({ tag: 'published', title: t('notify.published'),
          body: t('notify.publishedBody') });
      }
      Object.keys(afterConstraints).forEach(function (key) {
        if (key.split('|')[0] !== employeeId) return;
        var now = afterConstraints[key];
        var was = beforeConstraints[key];
        var dayName = (Data.DAYS[Number(key.split('|')[1])] || {}).name || '';
        if (Store.constraintStatus(now) === Store.constraintStatus(was)) return;
        if (Store.constraintStatus(now) === Store.CONSTRAINT_STATUS.APPROVED) {
          out.push({ tag: 'decision-' + key, title: t('notify.requestApproved'),
            body: t('notify.requestApprovedBody', { day: dayName }) });
        } else if (Store.constraintStatus(now) === Store.CONSTRAINT_STATUS.REJECTED) {
          out.push({ tag: 'decision-' + key, title: t('notify.requestRejected'),
            body: t('notify.requestRejectedBody', { day: dayName }) +
              (now.managerNote ? ': ' + now.managerNote : '.') });
        }
      });
      return out;
    }

    /* מנהל – בקשות חדשות שממתינות לו */
    var fresh = [];
    Object.keys(afterConstraints).forEach(function (key) {
      var now = afterConstraints[key];
      if (Store.constraintStatus(now) !== Store.CONSTRAINT_STATUS.PENDING) return;
      var was = beforeConstraints[key];
      if (was && Store.constraintStatus(was) === Store.CONSTRAINT_STATUS.PENDING &&
        JSON.stringify(was) === JSON.stringify(now)) return;
      fresh.push(key);
    });
    if (fresh.length) {
      out.push({ tag: 'pending', title: t('notify.newRequest'),
        body: fresh.length === 1 ? t('notify.newRequestBody')
          : t('notify.newRequestsBody', { count: fresh.length }) });
    }
    return out;
  }

  function enterApp(backend, session) {
    if (started) { root.location.reload(); return Promise.resolve(); }
    started = true;

    document.body.setAttribute('data-role', session.user.role);

    var Notify = root.ShiftNotify;
    if (Notify) { Notify.register('sw.js'); }

    function announce(before, after) {
      if (!Notify) return;
      notificationsFor(session.user.role, session.user.employeeId, before, after)
        .forEach(function (item) { Notify.show(item); });
    }

    /* תצוגה מקדימה: המנהל רואה את המסך של עובד מסוים ויוצא ממנו.
       הסשן לא משתנה – רק מה שמצויר על המסך. */
    var previewUI = null;
    function exitPreview() {
      if (!previewUI) return;
      previewUI = null;
      document.getElementById('employee-root').classList.add('hidden');
      document.getElementById('employee-root').innerHTML = '';
      document.getElementById('manager-root').classList.remove('hidden');
    }
    function startPreview(employeeId) {
      if (!root.ShiftEmployeeUI) return Promise.resolve(null);
      document.getElementById('manager-root').classList.add('hidden');
      var employeeRoot = document.getElementById('employee-root');
      employeeRoot.classList.remove('hidden');
      previewUI = new root.ShiftEmployeeUI.EmployeeUI({
        backend: backend, session: session, preview: true, employeeId: employeeId
      });
      employeeRoot.addEventListener('click', function (event) {
        if (event.target.closest('#preview-exit')) exitPreview();
      });
      return previewUI.start();
    }
    root.ShiftPreview = { start: startPreview, exit: exitPreview };

    /* עובד מקבל מסך משלו ולא את מערכת הניהול */
    if (session.user.role === 'employee') {
      document.getElementById('manager-root').classList.add('hidden');
      document.getElementById('employee-root').classList.remove('hidden');
      var employeeUI = new root.ShiftEmployeeUI.EmployeeUI({ backend: backend, session: session });
      backend.subscribe(function (change) {
        if (change.type !== 'week' || change.weekKey !== employeeUI.weekKey) return;
        announce(employeeUI.week, change.week);
        employeeUI.load();
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
          var current = root.ShiftApp.getState().weeks[change.weekKey];
          announce(current, change.week);
          root.ShiftApp.applyRemoteWeek(change.weekKey, change.week);
        }
      });
      var getEmployees = function () { return root.ShiftApp.getState().employees; };

      if (root.ShiftUsersUI) {
        /* הזמנת עובד פותחת לו כרטיס אם אין לו, כי בלי כרטיס הוא
           נכנס למערכת ולא רואה בה כלום. */
        root.ShiftUsersUI.init({
          backend: backend, session: session, getEmployees: getEmployees,
          addEmployee: function (name) { return root.ShiftApp.addEmployee(name); }
        });
      }

      if (root.ShiftBillingUI && root.ShiftBilling) {
        var provider = opts.billingProvider ||
          new root.ShiftBilling.MockProvider({ backend: backend });
        var billing = new root.ShiftBilling.BillingService({ backend: backend, provider: provider });
        root.ShiftBillingUI.init({
          billing: billing, session: session, getEmployees: getEmployees,
          onChange: function () {
            var updated = backend.session();
            if (updated) { authRef.renderUserBar(updated); }
          }
        });
      }
      /* התמיכה פתוחה לכל מי שנכנס למערכת, ולא רק למנהלים:
         גם עובד נתקל בתקלות, ודיווח שעובר דרך המנהל לא מגיע. */
      if (root.ShiftPreviewUI) {
        root.ShiftPreviewUI.init({ getEmployees: getEmployees });
      }

      if (root.ShiftSupportUI) {
        root.ShiftSupportUI.init({ backend: backend, session: session });
      }

      return session;
    });
  }

  var API = { boot: boot, backendSource: backendSource, notificationsFor: notificationsFor };
  root.ShiftSaas = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
