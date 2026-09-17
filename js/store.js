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
      branches: Data.defaultBranches(Data.DEFAULT_SETTINGS.defaultHours),
      employees: clone(Data.DEFAULT_EMPLOYEES),
      weeks: {}
    };
  }

  function emptyWeek() {
    return {
      constraints: {}, assignments: {}, manual: {}, holidays: {},
      shabbatEnd: '', note: '', generatedAt: null
    };
  }

  function getWeek(state, weekKey) {
    if (!state.weeks[weekKey]) { state.weeks[weekKey] = emptyWeek(); }
    var w = state.weeks[weekKey];
    if (!w.constraints) w.constraints = {};
    if (!w.assignments) w.assignments = {};
    if (!w.manual) w.manual = {};
    if (!w.holidays) w.holidays = {};
    return w;
  }

  /* ===== שעות ===== */
  function parseTime(value) {
    var match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;
    var hours = Number(match[1]), minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function formatTime(totalMinutes) {
    var wrapped = ((totalMinutes % 1440) + 1440) % 1440;
    return pad(Math.floor(wrapped / 60)) + ':' + pad(wrapped % 60);
  }

  /* קלט שעה גמיש: "830" → 08:30, "8:5" → 08:05, "1430" → 14:30. null אם לא תקין. */
  function normalizeTimeInput(raw) {
    var text = String(raw == null ? '' : raw).trim().replace(/[.\u05f4"']/g, ':');
    if (!text) return '';
    var hours, minutes, match;
    if ((match = /^(\d{1,2}):(\d{1,2})$/.exec(text))) {
      hours = Number(match[1]); minutes = Number(match[2]);
    } else if ((match = /^(\d{1,2})(\d{2})$/.exec(text))) {
      hours = Number(match[1]); minutes = Number(match[2]);
    } else if ((match = /^(\d{1,2})$/.exec(text))) {
      hours = Number(match[1]); minutes = 0;
    } else {
      return null;
    }
    if (hours > 23 || minutes > 59) return null;
    return pad(hours) + ':' + pad(minutes);
  }

  function addMinutes(value, minutes) {
    var base = parseTime(value);
    return base === null ? null : formatTime(base + minutes);
  }

  /* הגדרת משמרת בסניף ביום מסוים, או null אם הסניף סגור אז */
  function slotConfig(branch, dayIdx, shiftId) {
    var day = (branch.schedule || {})[dayIdx];
    var config = day && day[shiftId];
    if (!config || Number(config.need) <= 0) return null;
    return config;
  }

  function slotNeed(branch, dayIdx, shiftId) {
    var config = slotConfig(branch, dayIdx, shiftId);
    return config ? Number(config.need) || 0 : 0;
  }

  /* שעות בפועל. במוצ״ש ההתחלה נגזרת משעת צאת השבת של אותו שבוע. */
  function slotHours(week, branch, dayIdx, shiftId) {
    var config = slotConfig(branch, dayIdx, shiftId);
    if (!config) return null;
    var from = config.from || '';
    if (config.auto === 'motzash') {
      var shabbatEnd = (week && week.shabbatEnd) || '';
      from = shabbatEnd ? addMinutes(shabbatEnd, Data.MOTZASH.offsetMinutes) : '';
    }
    return { from: from, to: config.to || '', auto: config.auto || null };
  }

  function hoursLabel(hours) {
    if (!hours) return '';
    if (!hours.from) return hours.to ? 'עד ' + hours.to : '';
    return hours.from + '-' + (hours.to || '');
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

  /* ===== ימי חג: כל הסניפים סגורים והיום נחשב חופש לכל העובדים ===== */
  function isHoliday(week, dayIdx) {
    return !!(week && week.holidays && week.holidays[dayIdx] !== undefined);
  }

  function holidayName(week, dayIdx) {
    if (!isHoliday(week, dayIdx)) return '';
    return week.holidays[dayIdx] || 'חג';
  }

  function setHoliday(week, dayIdx, name) {
    if (name === null) { delete week.holidays[dayIdx]; }
    else { week.holidays[dayIdx] = name || ''; }
  }

  /* אילו משמרות פעילות ביום מסוים – איחוד של כל הסניפים הפעילים */
  function activeShiftsForDay(state, dayIdx, week) {
    if (isHoliday(week, dayIdx)) return [];
    return Data.ALL_SHIFT_IDS.filter(function (shiftId) {
      return state.branches.some(function (branch) {
        return branch.active && slotNeed(branch, dayIdx, shiftId) > 0;
      });
    });
  }

  /* כל הדרישות של השבוע: יום × סניף × משמרת × כמות נדרשת */
  function weekDemands(state, week) {
    var demands = [];
    for (var day = 0; day < 7; day++) {
      if (isHoliday(week, day)) continue; // ביום חג הסניפים סגורים
      state.branches.forEach(function (branch) {
        if (!branch.active) return;
        Data.ALL_SHIFT_IDS.forEach(function (shiftId) {
          var need = slotNeed(branch, day, shiftId);
          if (need > 0) { demands.push({ dayIdx: day, branchId: branch.id, shiftId: shiftId, need: need }); }
        });
      });
    }
    return demands;
  }

  /* האם העובד יכול בכלל לעבוד ביום הזה – קיימת משמרת פתוחה שמתאימה לו */
  function employeeCanWorkDay(state, week, emp, dayIdx) {
    if (!emp.active) return false;
    if (isHoliday(week, dayIdx)) return false;
    var constraint = getConstraint(week, emp.id, dayIdx);
    if (constraint.off) return false;

    return state.branches.some(function (branch) {
      if (!branch.active) return false;
      if (emp.branches.length && emp.branches.indexOf(branch.id) === -1) return false;
      return Data.ALL_SHIFT_IDS.some(function (shiftId) {
        if (slotNeed(branch, dayIdx, shiftId) === 0) return false;
        if (emp.shifts.indexOf(shiftId) === -1) return false;
        if (constraint.blocked && constraint.blocked[shiftId]) return false;
        return true;
      });
    });
  }

  /* ===== ימי חופש ומכסת עבודה ===== */

  /* הימים שהעובד ביקש כחופש בשבוע הזה */
  function requestedDaysOff(week, empId) {
    var days = [];
    for (var day = 0; day < 7; day++) {
      if (getConstraint(week, empId, day).off) days.push(day);
    }
    return days;
  }

  /* כמה ימים בשבוע העובד יכול בכלל לעבוד (אחרי אילוצים, חגים וסניפים סגורים) */
  function workableDays(state, week, emp) {
    var days = [];
    for (var day = 0; day < 7; day++) {
      if (employeeCanWorkDay(state, week, emp, day)) days.push(day);
    }
    return days;
  }

  /* כמה משמרות ראוי שהעובד יעבוד השבוע: המכסה השבועית, אך לא יותר
     ממספר הימים שבהם הוא יכול לעבוד בפועל. */
  function targetShifts(state, week, emp) {
    return Math.min(Number(emp.maxShifts) || 0, workableDays(state, week, emp).length);
  }

  /* ===== יתרת זמינות: מה נשאר פנוי אחרי בניית הסידור ===== */

  /* סיכום לכל עובד פעיל: כמה משמרות נותרו במכסה ובאילו ימים הוא פנוי */
  function weekAvailability(state, week) {
    var rows = [];
    var totalSpare = 0;
    var freeSlots = 0;

    state.employees.forEach(function (emp) {
      if (!emp.active) return;
      var assigned = employeeWeekCount(state, week, emp.id);
      var max = Number(emp.maxShifts) || 0;
      var spare = Math.max(0, max - assigned);

      var freeDays = [];
      for (var day = 0; day < 7; day++) {
        if (employeeDayAssignments(state, week, emp.id, day).length) continue;
        if (!employeeCanWorkDay(state, week, emp, day)) continue;
        freeDays.push(day);
      }

      totalSpare += spare;
      // בפועל אפשר לשבץ רק את המינימום בין יתרת המכסה למספר הימים הפנויים
      freeSlots += Math.min(spare, freeDays.length);

      rows.push({
        empId: emp.id, name: emp.name, assigned: assigned, max: max,
        spare: spare, freeDays: freeDays,
        available: Math.min(spare, freeDays.length)
      });
    });

    rows.sort(function (a, b) {
      return (b.available - a.available) || (b.spare - a.spare) || a.name.localeCompare(b.name);
    });

    return {
      rows: rows,
      totalSpare: totalSpare,
      freeSlots: freeSlots,
      withSpare: rows.filter(function (row) { return row.available > 0; })
    };
  }

  /* החלת שעות ברירת המחדל על משמרות קיימות בימי חול.
     נשמרים: אילו ימים פתוחים, כמות העובדים, שישי ומוצ״ש. */
  function applyDefaultHours(state, options) {
    var opts = options || {};
    var hours = state.settings.defaultHours || Data.DEFAULT_HOURS;
    var days = opts.days || Data.WEEKDAYS;
    var changed = 0;

    state.branches.forEach(function (branch) {
      days.forEach(function (day) {
        var dayConfig = (branch.schedule || {})[day];
        if (!dayConfig) return;
        Data.ALL_SHIFT_IDS.forEach(function (shiftId) {
          var config = dayConfig[shiftId];
          if (!config || config.auto) return; // משמרת אוטומטית (מוצ״ש) אינה מושפעת
          var range = hours[shiftId] || Data.DEFAULT_HOURS[shiftId];
          if (config.from === range.from && config.to === range.to) return;
          config.from = range.from;
          config.to = range.to;
          changed++;
        });
      });
    });
    return changed;
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  function migrate(state) {
    if (!state || typeof state !== 'object') return emptyState();
    var base = emptyState();
    state.version = VERSION;
    var legacyDayShifts = (state.settings && state.settings.dayShifts) || null;
    state.settings = Object.assign({}, base.settings, state.settings || {});
    delete state.settings.dayShifts;
    state.settings.defaultHours = Object.assign({}, base.settings.defaultHours,
      state.settings.defaultHours || {});
    Data.ALL_SHIFT_IDS.forEach(function (shiftId) {
      var range = state.settings.defaultHours[shiftId] || {};
      if (!range.from || !range.to) {
        state.settings.defaultHours[shiftId] = Object.assign({}, base.settings.defaultHours[shiftId]);
      }
    });
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
      if (typeof branch.active !== 'boolean') branch.active = true;
      if (!branch.schedule) { branch.schedule = legacySchedule(branch, legacyDayShifts); }
      normalizeSchedule(branch.schedule);
      delete branch.need;
    });
    Object.keys(state.weeks).forEach(function (key) {
      var weekData = state.weeks[key];
      if (typeof weekData.shabbatEnd !== 'string') weekData.shabbatEnd = '';
      if (!weekData.holidays || typeof weekData.holidays !== 'object') weekData.holidays = {};
    });
    return state;
  }

  /* המרת המבנה הישן (need לכל סניף + dayShifts גלובלי) למבנה לפי יום */
  function legacySchedule(branch, legacyDayShifts) {
    var template = Data.defaultSchedule();
    if (!branch.need && !legacyDayShifts) return template;
    var schedule = {};
    for (var day = 0; day < 7; day++) {
      var allowed = legacyDayShifts ? (legacyDayShifts[day] || []) : Data.ALL_SHIFT_IDS;
      var dayConfig = {};
      Data.ALL_SHIFT_IDS.forEach(function (shiftId) {
        if (allowed.indexOf(shiftId) === -1) return;
        var need = Number((branch.need || {})[shiftId] || 0);
        if (need <= 0) return;
        var fallback = (template[day] && template[day][shiftId]) ||
          (template[0] && template[0][shiftId]) || { from: '09:00', to: '17:00' };
        dayConfig[shiftId] = { need: need, from: fallback.from, to: fallback.to };
        if (fallback.auto) { dayConfig[shiftId].auto = fallback.auto; delete dayConfig[shiftId].from; }
      });
      if (Object.keys(dayConfig).length) schedule[day] = dayConfig;
    }
    // המשמרת החדשה של מוצ״ש לא קיימת בנתונים ישנים – מוסיפים אותה
    if (!schedule[6] && template[6]) { schedule[6] = clone(template[6]); }
    return schedule;
  }

  function normalizeSchedule(schedule) {
    Object.keys(schedule).forEach(function (day) {
      var dayConfig = schedule[day];
      Object.keys(dayConfig).forEach(function (shiftId) {
        var config = dayConfig[shiftId];
        config.need = Math.max(0, Number(config.need) || 0);
        if (config.need === 0) { delete dayConfig[shiftId]; return; }
        if (config.auto !== 'motzash') { delete config.auto; }
        config.to = config.to || '';
        if (config.auto === 'motzash') { delete config.from; } else { config.from = config.from || ''; }
      });
      if (!Object.keys(dayConfig).length) delete schedule[day];
    });
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
    isHoliday: isHoliday,
    holidayName: holidayName,
    setHoliday: setHoliday,
    slotConfig: slotConfig,
    slotNeed: slotNeed,
    slotHours: slotHours,
    hoursLabel: hoursLabel,
    parseTime: parseTime,
    normalizeTimeInput: normalizeTimeInput,
    formatTime: formatTime,
    addMinutes: addMinutes,
    normalizeSchedule: normalizeSchedule,
    applyDefaultHours: applyDefaultHours,
    weekDemands: weekDemands,
    employeeCanWorkDay: employeeCanWorkDay,
    requestedDaysOff: requestedDaysOff,
    workableDays: workableDays,
    targetShifts: targetShifts,
    weekAvailability: weekAvailability,
    byId: byId,
    migrate: migrate,
    load: load,
    save: save,
    newId: newId
  };

  root.ShiftStore = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
