/* ניהול מצב: טעינה/שמירה ב-localStorage, מפתחות שבוע, אילוצים ושיבוצים */
(function (root) {
  'use strict';

  var Data = root.ShiftData || (typeof require === 'function' ? require('./data.js') : null);
  var STORAGE_KEY = 'maiphone-shifts-v1';
  var VERSION = 1;

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function toKey(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  /* תחילת השבוע = יום ראשון */
  function weekStart(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  function currentWeekKey(today) {
    return toKey(weekStart(today || new Date()));
  }

  function shiftWeekKey(weekKey, deltaWeeks) {
    var parts = weekKey.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + deltaWeeks * 7);
    return toKey(d);
  }

  function dateOfDay(weekKey, dayIdx) {
    var parts = weekKey.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + dayIdx);
    return d;
  }

  function formatDate(date) { return pad(date.getDate()) + '/' + pad(date.getMonth() + 1); }

  function emptyState() {
    return {
      version: VERSION,
      settings: clone(Data.DEFAULT_SETTINGS),
      branches: clone(Data.DEFAULT_BRANCHES),
      employees: clone(Data.DEFAULT_EMPLOYEES),
      weeks: {}
    };
  }

  function emptyWeek() {
    return { constraints: {}, assignments: {}, manual: {}, note: '', generatedAt: null };
  }

  function getWeek(state, weekKey) {
    if (!state.weeks[weekKey]) { state.weeks[weekKey] = emptyWeek(); }
    var w = state.weeks[weekKey];
    if (!w.constraints) w.constraints = {};
    if (!w.assignments) w.assignments = {};
    if (!w.manual) w.manual = {};
    return w;
  }

  function slotKey(dayIdx, branchId, shiftId) { return dayIdx + '|' + branchId + '|' + shiftId; }
  function constraintKey(empId, dayIdx) { return empId + '|' + dayIdx; }

  function getConstraint(week, empId, dayIdx) {
    return week.constraints[constraintKey(empId, dayIdx)] || { off: false, blocked: {}, preferred: {}, note: '' };
  }

  function setConstraint(week, empId, dayIdx, value) {
    var key = constraintKey(empId, dayIdx);
    var isEmpty = !value.off && !value.note &&
      Object.keys(value.blocked || {}).length === 0 &&
      Object.keys(value.preferred || {}).length === 0;
    if (isEmpty) { delete week.constraints[key]; } else { week.constraints[key] = value; }
  }

  function getAssigned(week, dayIdx, branchId, shiftId) {
    return week.assignments[slotKey(dayIdx, branchId, shiftId)] || [];
  }

  function setAssigned(week, dayIdx, branchId, shiftId, empIds) {
    var key = slotKey(dayIdx, branchId, shiftId);
    var clean = (empIds || []).filter(function (id) { return !!id; });
    if (clean.length === 0) { delete week.assignments[key]; } else { week.assignments[key] = clean; }
  }

  /* כל המשמרות של עובד ביום מסוים – הבסיס לזיהוי כפל משמרת */
  function employeeDayAssignments(state, week, empId, dayIdx) {
    var out = [];
    state.branches.forEach(function (branch) {
      Data.ALL_SHIFT_IDS.forEach(function (shiftId) {
        var list = getAssigned(week, dayIdx, branch.id, shiftId);
        for (var i = 0; i < list.length; i++) {
          if (list[i] === empId) { out.push({ branchId: branch.id, shiftId: shiftId }); }
        }
      });
    });
    return out;
  }

  function employeeWeekCount(state, week, empId) {
    var count = 0;
    for (var day = 0; day < 7; day++) { count += employeeDayAssignments(state, week, empId, day).length; }
    return count;
  }

  function activeShiftsForDay(state, dayIdx) {
    var list = (state.settings.dayShifts && state.settings.dayShifts[dayIdx]) || [];
    return Data.ALL_SHIFT_IDS.filter(function (id) { return list.indexOf(id) !== -1; });
  }

  /* כל הדרישות של השבוע: יום × סניף × משמרת × כמות נדרשת */
  function weekDemands(state) {
    var demands = [];
    for (var day = 0; day < 7; day++) {
      var shifts = activeShiftsForDay(state, day);
      state.branches.forEach(function (branch) {
        if (!branch.active) return;
        shifts.forEach(function (shiftId) {
          var need = Number((branch.need || {})[shiftId] || 0);
          if (need > 0) { demands.push({ dayIdx: day, branchId: branch.id, shiftId: shiftId, need: need }); }
        });
      });
    }
    return demands;
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  function migrate(state) {
    if (!state || typeof state !== 'object') return emptyState();
    var base = emptyState();
    state.version = VERSION;
    state.settings = Object.assign({}, base.settings, state.settings || {});
    state.settings.dayShifts = Object.assign({}, base.settings.dayShifts, state.settings.dayShifts || {});
    if (!Array.isArray(state.branches) || !state.branches.length) state.branches = base.branches;
    if (!Array.isArray(state.employees) || !state.employees.length) state.employees = base.employees;
    if (!state.weeks || typeof state.weeks !== 'object') state.weeks = {};
    state.employees.forEach(function (emp) {
      if (!Array.isArray(emp.branches)) emp.branches = [];
      if (!Array.isArray(emp.shifts)) emp.shifts = Data.ALL_SHIFT_IDS.slice();
      if (typeof emp.maxShifts !== 'number') emp.maxShifts = 6;
      if (typeof emp.active !== 'boolean') emp.active = true;
    });
    state.branches.forEach(function (branch) {
      if (!branch.need) branch.need = { morning: 1, middle: 1, evening: 1 };
      if (typeof branch.active !== 'boolean') branch.active = true;
    });
    return state;
  }

  function load() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      return migrate(JSON.parse(raw));
    } catch (err) {
      console.warn('טעינת הנתונים נכשלה, נטענת ברירת מחדל', err);
      return emptyState();
    }
  }

  function save(state) {
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.warn('שמירת הנתונים נכשלה', err);
      return false;
    }
  }

  function newId(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 8);
  }

  var API = {
    STORAGE_KEY: STORAGE_KEY,
    clone: clone,
    toKey: toKey,
    weekStart: weekStart,
    currentWeekKey: currentWeekKey,
    shiftWeekKey: shiftWeekKey,
    dateOfDay: dateOfDay,
    formatDate: formatDate,
    emptyState: emptyState,
    emptyWeek: emptyWeek,
    getWeek: getWeek,
    slotKey: slotKey,
    constraintKey: constraintKey,
    getConstraint: getConstraint,
    setConstraint: setConstraint,
    getAssigned: getAssigned,
    setAssigned: setAssigned,
    employeeDayAssignments: employeeDayAssignments,
    employeeWeekCount: employeeWeekCount,
    activeShiftsForDay: activeShiftsForDay,
    weekDemands: weekDemands,
    byId: byId,
    migrate: migrate,
    load: load,
    save: save,
    newId: newId
  };

  root.ShiftStore = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
