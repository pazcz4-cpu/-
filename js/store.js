/* ניהול מצב: טעינה/שמירה ב-localStorage, מפתחות שבוע, אילוצים ושיבוצים */
(function (root) {
  'use strict';

  var Data = root.ShiftData || (typeof require === 'function' ? require('./data.js') : null);
  var I18n = root.I18n || (typeof require === 'function' ? require('./i18n/core.js') : null);

  /* טקסטים למשתמש מגיעים משכבת התרגום; בלעדיה מוצג המפתח */
  function t(key, params) {
    var i18n = I18n || root.I18n;
    if (!i18n) return key;
    try { return i18n.t(key, params); } catch (err) { return key; }
  }
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

  /* מצב פתיחה עם נתוני דוגמה. נכון לכלי המקומי, שנפתח בלי חשבון
     ובלי הקשר: מסך ריק שם לא מלמד כלום. */
  function emptyState() {
    return {
      version: VERSION,
      settings: clone(Data.DEFAULT_SETTINGS),
      branches: Data.defaultBranches(null, Data.DEFAULT_SETTINGS.shifts),
      employees: clone(Data.DEFAULT_EMPLOYEES),
      weeks: {}
    };
  }

  /* מצב פתיחה ריק, לעסק אמיתי שנפתח עכשיו.
     שמונה "עובד/ת 1..8" בחשבון של לקוח הם לא עזרה אלא מטלה: הוא
     מייבא שלושים עובדים ומקבל שלושים ושמונה, ועלול לפרסם סידור
     שמשבץ אנשים שאינם קיימים. */
  function blankState() {
    return {
      version: VERSION,
      settings: clone(Data.DEFAULT_SETTINGS),
      branches: [],
      employees: [],
      weeks: {}
    };
  }

  /* טעינת נתוני הדוגמה לתוך חשבון ריק, לפי בקשה מפורשת.
     אינה דורסת דבר: אם כבר יש עובדים או סניפים, אין מה להדגים. */
  function loadSampleData(state) {
    if (!state) return { branches: 0, employees: 0 };
    if ((state.employees && state.employees.length) ||
        (state.branches && state.branches.length)) {
      return { branches: 0, employees: 0 };
    }
    state.branches = Data.defaultBranches(null, shifts(state));
    state.employees = clone(Data.DEFAULT_EMPLOYEES);
    return { branches: state.branches.length, employees: state.employees.length };
  }

  function emptyWeek() {
    return {
      constraints: {}, assignments: {}, manual: {}, holidays: {},
      shabbatEnd: '', note: '', generatedAt: null,
      published: false, publishedAt: null, publishedSignature: ''
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

  /* ===== סוגי המשמרות של העסק ===== */

  /* רשימת המשמרות המוגדרות. לעולם אינה ריקה. */
  function shifts(state) {
    var list = (state && state.settings && state.settings.shifts) || [];
    return list.length ? list : Data.DEFAULT_SHIFTS;
  }

  function shiftIds(state) {
    return shifts(state).map(function (shift) { return shift.id; });
  }

  function shiftById(state, shiftId) {
    var list = shifts(state);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === shiftId) return list[i];
    }
    return null;
  }

  function shiftName(state, shiftId) {
    var shift = shiftById(state, shiftId);
    return shift ? shift.name : shiftId;
  }

  /* מספר הצבע בלוח, לשימוש בממשק ובייצוא */
  function shiftColor(state, shiftId) {
    var shift = shiftById(state, shiftId);
    var count = Data.SHIFT_COLORS.length;
    if (!shift) return 6;
    var color = Number(shift.color);
    return isNaN(color) ? 6 : ((color % count) + count) % count;
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
    if (!hours.from) return hours.to ? t('ui.until', { time: hours.to }) : '';
    return hours.from + '-' + (hours.to || '');
  }

  function slotKey(dayIdx, branchId, shiftId) { return dayIdx + '|' + branchId + '|' + shiftId; }
  function constraintKey(empId, dayIdx) { return empId + '|' + dayIdx; }

  /* סטטוס בקשת אילוץ. אילוץ שהמנהל הזין בעצמו אינו נושא סטטוס
     ונחשב מאושר, כך שנתונים קיימים ממשיכים לעבוד כרגיל. */
  var CONSTRAINT_STATUS = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' };

  function emptyConstraint() {
    return { off: false, blocked: {}, preferred: {}, note: '' };
  }

  /* הרשומה כפי שנשמרה, כולל הסטטוס – לשימוש הממשק */
  function getConstraintRecord(week, empId, dayIdx) {
    return week.constraints[constraintKey(empId, dayIdx)] || null;
  }

  function constraintStatus(record) {
    if (!record) return null;
    return record.status || CONSTRAINT_STATUS.APPROVED;
  }

  function isEffective(record) {
    return !!record && constraintStatus(record) === CONSTRAINT_STATUS.APPROVED;
  }

  /* האילוץ שתופס בפועל: רק בקשות שאושרו משפיעות על השיבוץ */
  function getConstraint(week, empId, dayIdx) {
    var record = getConstraintRecord(week, empId, dayIdx);
    return isEffective(record) ? record : emptyConstraint();
  }

  /* עדכון סטטוס בקשה בידי מנהל */
  function setConstraintStatus(week, empId, dayIdx, status, managerNote) {
    var key = constraintKey(empId, dayIdx);
    var record = week.constraints[key];
    if (!record) return null;
    record.status = status;
    record.managerNote = managerNote || '';
    record.decidedAt = new Date().toISOString();
    return record;
  }

  /* כל הבקשות הממתינות לאישור בשבוע */
  function pendingConstraints(week) {
    var out = [];
    Object.keys(week.constraints || {}).forEach(function (key) {
      var record = week.constraints[key];
      if (constraintStatus(record) !== CONSTRAINT_STATUS.PENDING) return;
      var parts = key.split('|');
      out.push({ empId: parts[0], dayIdx: Number(parts[1]), record: record });
    });
    out.sort(function (a, b) { return a.dayIdx - b.dayIdx; });
    return out;
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
      shiftIds(state).forEach(function (shiftId) {
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
    return week.holidays[dayIdx] || t('toast.holidayDefault');
  }

  function setHoliday(week, dayIdx, name) {
    if (name === null) { delete week.holidays[dayIdx]; }
    else { week.holidays[dayIdx] = name || ''; }
  }

  /* אילו משמרות פעילות ביום מסוים – איחוד של כל הסניפים הפעילים */
  function activeShiftsForDay(state, dayIdx, week) {
    if (isHoliday(week, dayIdx)) return [];
    return shiftIds(state).filter(function (shiftId) {
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
        shiftIds(state).forEach(function (shiftId) {
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
      return shiftIds(state).some(function (shiftId) {
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

  /* ===== תקרת בקשות לעובד בשבוע =====
     בלי תקרה, עובד אחד שמבקש חמישה ימי חופש מוריד את כל הסידור
     על השאר, והמנהל מגלה את זה רק כשהוא מנסה לשבץ.

     מה נספר: יום שבו העובד הגביל את הזמינות שלו – ביקש חופש או
     חסם משמרת. העדפה אינה נספרת: היא עוזרת לשיבוץ, ואין סיבה
     להגביל אותה. בקשה שנדחתה אינה מגבילה דבר ולכן אינה נספרת –
     כך שעובד שנדחה יכול לבקש יום אחר במקומו.

     הספירה היא לפי ימים, ולא לפי משמרות: "עד 2 בקשות" פירושו
     שני ימים, וזו הצורה שבה מנהל חושב על זה. */
  function constraintLimitSettings(state) {
    var defaults = (Data.DEFAULT_SETTINGS && Data.DEFAULT_SETTINGS.constraintLimit) || {};
    var value = (state && state.settings && state.settings.constraintLimit) || {};
    var max = typeof value.max === 'number' ? value.max : (defaults.max || 2);
    return {
      enabled: !!value.enabled,
      max: Math.max(1, Math.round(max))
    };
  }

  /* האם הרשומה מגבילה זמינות בפועל */
  function limitsAvailability(record) {
    if (!record) return false;
    if (constraintStatus(record) === CONSTRAINT_STATUS.REJECTED) return false;
    if (record.off) return true;
    return Object.keys(record.blocked || {}).length > 0;
  }

  /* כמה בקשות מגבילות כבר יש לעובד בשבוע. exceptDay מוחרג, כדי
     שעריכה של יום קיים לא תיספר פעמיים. */
  function countLimitingConstraints(week, empId, exceptDay) {
    var records = (week && week.constraints) || {};
    var prefix = empId + '|';
    var count = 0;
    Object.keys(records).forEach(function (key) {
      if (key.indexOf(prefix) !== 0) return;
      var dayIdx = Number(key.slice(prefix.length));
      if (exceptDay !== undefined && exceptDay !== null && dayIdx === Number(exceptDay)) return;
      if (limitsAvailability(records[key])) count++;
    });
    return count;
  }

  /* כמה עוד מותר לו. null כשאין תקרה. */
  function constraintsLeft(state, week, empId) {
    var config = constraintLimitSettings(state);
    if (!config.enabled) return null;
    return Math.max(0, config.max - countLimitingConstraints(week, empId));
  }

  /* האם ההגשה הזו חורגת מהתקרה. next הוא האילוץ שעומד להישמר
     (או null למחיקה), ולכן מחיקה לעולם אינה חורגת. */
  function overConstraintLimit(state, week, empId, dayIdx, next) {
    var config = constraintLimitSettings(state);
    if (!config.enabled) return false;
    if (!limitsAvailability(next)) return false;   // העדפה או מחיקה
    return countLimitingConstraints(week, empId, dayIdx) >= config.max;
  }

  /* ===== מועד סגירת ההגשות =====
     המנהל קובע יום ושעה. המועד חל על היום הזה *לפני* תחילת השבוע
     שאליו מגישים – כך שהגשות לשבוע הבא נסגרות בשבוע הנוכחי.
     הכול מחושב מהתאריך ולא נשמר, כדי שלא יהיה מצב שבו השעון של
     המערכת והשעון של המשתמש אומרים דברים שונים. */
  function deadlineSettings(state) {
    var defaults = (Data.DEFAULT_SETTINGS && Data.DEFAULT_SETTINGS.constraintsDeadline) || {};
    var value = (state && state.settings && state.settings.constraintsDeadline) || {};
    return {
      enabled: !!value.enabled,
      dayIdx: typeof value.dayIdx === 'number' ? value.dayIdx : (defaults.dayIdx || 0),
      time: value.time || defaults.time || '20:00',
      remindHours: typeof value.remindHours === 'number'
        ? value.remindHours : (defaults.remindHours || 24)
    };
  }

  /* מתי בדיוק נסגרות ההגשות לשבוע הזה. null אם לא הוגדר מועד. */
  function deadlineFor(state, weekKey) {
    var config = deadlineSettings(state);
    if (!config.enabled || !weekKey) return null;

    var weekStart = dateOfDay(weekKey, 0);
    var date = new Date(weekStart);
    /* אחורה עד היום המבוקש, תמיד לפני תחילת השבוע */
    do { date.setDate(date.getDate() - 1); } while (date.getDay() !== config.dayIdx);

    var parts = String(config.time).split(':');
    date.setHours(Number(parts[0]) || 0, Number(parts[1]) || 0, 0, 0);
    return date;
  }

  function deadlinePassed(state, weekKey, now) {
    var at = deadlineFor(state, weekKey);
    if (!at) return false;
    return (now || new Date()) > at;
  }

  /* כמה שעות נותרו. null אם אין מועד, שלילי אם עבר. */
  function hoursToDeadline(state, weekKey, now) {
    var at = deadlineFor(state, weekKey);
    if (!at) return null;
    return (at - (now || new Date())) / 3600000;
  }

  /* האם זה הרגע לתזכר: בתוך חלון התזכורת, ולפני שנסגר */
  function shouldRemind(state, weekKey, now) {
    var config = deadlineSettings(state);
    if (!config.enabled) return false;
    var left = hoursToDeadline(state, weekKey, now);
    if (left === null) return false;
    return left > 0 && left <= config.remindHours;
  }

  /* כמה משמרות ראוי שהעובד יעבוד השבוע: המכסה השבועית, אך לא יותר
     ממספר הימים שבהם הוא יכול לעבוד בפועל. */
  function targetShifts(state, week, emp) {
    return Math.min(Number(emp.maxShifts) || 0, workableDays(state, week, emp).length);
  }

  /* ===== טיוטה ופרסום ===== */

  /* חתימה של מה שהעובד רואה בפועל. אחרי פרסום, שינוי בחתימה הזו
     הוא בדיוק "שונה מאז הפרסום" – ולכן היא נגזרת מהשיבוצים ומהערת
     השבוע, ולא מדברים שאינם מגיעים למסך שלו (סימון שיבוץ ידני,
     למשל, אינו שינוי בסידור). */
  function scheduleSignature(week) {
    var assignments = (week && week.assignments) || {};
    var parts = Object.keys(assignments).filter(function (key) {
      return (assignments[key] || []).length;
    }).sort().map(function (key) {
      return key + '=' + (assignments[key] || []).slice().sort().join(',');
    });
    parts.push('note=' + ((week && week.note) || ''));
    return parts.join(';');
  }

  var PUBLISH_STATE = { DRAFT: 'draft', PUBLISHED: 'published', CHANGED: 'changed' };

  function publishState(week) {
    if (!week || !week.published) return PUBLISH_STATE.DRAFT;
    /* שבוע שפורסם לפני שהחתימה נשמרה – אין במה להשוות, וטענה
       ש"שונה מאז הפרסום" בלי בסיס גרועה מלא לטעון כלום. */
    if (!week.publishedSignature) return PUBLISH_STATE.PUBLISHED;
    return week.publishedSignature === scheduleSignature(week)
      ? PUBLISH_STATE.PUBLISHED : PUBLISH_STATE.CHANGED;
  }

  /* מסמן את השבוע כמפורסם *במצבו הנוכחי*. השעה והחתימה נשמרות יחד,
     כי בלעדיהן אין דרך לדעת שמאז הפרסום הסידור השתנה. */
  function markPublished(week, when) {
    week.published = true;
    week.publishedAt = (when || new Date()).toISOString();
    week.publishedSignature = scheduleSignature(week);
    return week;
  }

  function markDraft(week) {
    week.published = false;
    week.publishedSignature = '';
    return week;
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
    var days = opts.days || Data.WEEKDAYS;
    var changed = 0;

    state.branches.forEach(function (branch) {
      days.forEach(function (day) {
        var dayConfig = (branch.schedule || {})[day];
        if (!dayConfig) return;
        shifts(state).forEach(function (shift) {
          var shiftId = shift.id;
          var config = dayConfig[shiftId];
          if (!config || config.auto) return; // משמרת אוטומטית (מוצ״ש) אינה מושפעת
          var range = { from: shift.from, to: shift.to };
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
    var legacyHours = (state.settings && state.settings.defaultHours) || null;
    state.settings = Object.assign({}, base.settings, state.settings || {});
    delete state.settings.dayShifts;
    state.settings.shifts = normalizeShifts(state.settings.shifts, legacyHours);
    delete state.settings.defaultHours;
    /* רשימה ריקה היא רשימה ריקה. פעם היא מולאה כאן בנתוני הדוגמה,
       וזה החזיר שמונה "עובד/ת" לכל חשבון חדש – ולכל מי שמחק את
       כולם בכוונה. את הדוגמה טוענים בלחיצה, ב-loadSampleData. */
    if (!Array.isArray(state.branches)) state.branches = [];
    if (!Array.isArray(state.employees)) state.employees = [];
    if (!state.weeks || typeof state.weeks !== 'object') state.weeks = {};
    state.employees.forEach(function (emp) {
      if (!Array.isArray(emp.branches)) emp.branches = [];
      if (!Array.isArray(emp.shifts)) emp.shifts = Data.ALL_SHIFT_IDS.slice();
      if (typeof emp.maxShifts !== 'number') emp.maxShifts = 6;
      /* כתובת מייל אופציונלית על הכרטיס. היא לא נדרשת לשיבוץ,
         אבל היא מה שמבדיל בין שני עובדים עם שם דומה בייבוא. */
      if (typeof emp.email !== 'string') emp.email = '';
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
      if (typeof weekData.published !== 'boolean') weekData.published = false;
      if (typeof weekData.publishedSignature !== 'string') weekData.publishedSignature = '';
    });
    return state;
  }

  /* רשימת משמרות תקינה: מזהים ייחודיים, שמות, שעות וצבע.
     legacyHours – מבנה השעות הישן, אם קיים, כדי לא לאבד התאמות. */
  function normalizeShifts(list, legacyHours) {
    var source = Array.isArray(list) && list.length ? list : Data.DEFAULT_SHIFTS;
    var seen = {};
    var out = [];

    source.forEach(function (item, index) {
      if (!item) return;
      var id = String(item.id || '').trim() || ('shift-' + (index + 1));
      if (seen[id]) return;
      seen[id] = true;

      var fallback = Data.DEFAULT_SHIFTS[index] || Data.DEFAULT_SHIFTS[0];
      var hours = (legacyHours && legacyHours[id]) || {};
      out.push({
        id: id,
        name: String(item.name || '').trim() || fallback.name || t('toast.newShift', { n: index + 1 }),
        from: hours.from || item.from || fallback.from,
        to: hours.to || item.to || fallback.to,
        color: typeof item.color === 'number' ? item.color : (index % Data.SHIFT_COLORS.length)
      });
    });

    return out.length ? out : Data.DEFAULT_SHIFTS.slice();
  }

  /* הסרת סוג משמרת: מנקה אותו מלוחות הסניפים ומכרטיסי העובדים */
  function removeShift(state, shiftId) {
    var removed = { slots: 0, employees: 0, assignments: 0 };
    state.settings.shifts = (state.settings.shifts || []).filter(function (shift) {
      return shift.id !== shiftId;
    });
    if (!state.settings.shifts.length) {
      state.settings.shifts = Data.DEFAULT_SHIFTS.slice();
    }

    state.branches.forEach(function (branch) {
      Object.keys(branch.schedule || {}).forEach(function (day) {
        if (branch.schedule[day] && branch.schedule[day][shiftId]) {
          delete branch.schedule[day][shiftId];
          removed.slots++;
        }
        if (branch.schedule[day] && !Object.keys(branch.schedule[day]).length) {
          delete branch.schedule[day];
        }
      });
    });

    state.employees.forEach(function (emp) {
      var before = emp.shifts.length;
      emp.shifts = emp.shifts.filter(function (id) { return id !== shiftId; });
      if (emp.shifts.length !== before) removed.employees++;
      if (!emp.shifts.length) { emp.shifts = shiftIds(state).slice(); }
    });

    Object.keys(state.weeks || {}).forEach(function (weekKey) {
      var week = state.weeks[weekKey];
      Object.keys(week.assignments || {}).forEach(function (key) {
        if (key.split('|')[2] === shiftId) {
          delete week.assignments[key];
          removed.assignments++;
        }
      });
      Object.keys(week.constraints || {}).forEach(function (key) {
        var record = week.constraints[key];
        if (record.blocked) delete record.blocked[shiftId];
        if (record.preferred) delete record.preferred[shiftId];
      });
    });

    return removed;
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
      console.warn(t('ui.loadFailed'), err);
      return emptyState();
    }
  }

  function save(state) {
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.warn(t('ui.saveFailed'), err);
      return false;
    }
  }

  function newId(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* ===== ביטול ייבוא =====
     ייבוא שגוי הוא שלושים כרטיסים שצריך למחוק ביד אחד-אחד, ולכן
     בפועל הלקוח פשוט לא מייבא. הפונקציה מסירה בדיוק את מה שנוצר
     בייבוא – לפי מזהים, לא לפי שם – ומנקה אחריה: סניף שנמחק יורד
     גם מהכרטיסים שנשארו, ושיבוץ שמפנה למי שנמחק נמחק גם הוא,
     אחרת הסידור מציג "עובד לא ידוע". */
  function removeImported(state, created) {
    var empIds = {};
    var branchIds = {};
    (created.employees || []).forEach(function (item) { empIds[item.id || item] = true; });
    (created.branches || []).forEach(function (item) { branchIds[item.id || item] = true; });
    var removed = { employees: 0, branches: 0, assignments: 0, constraints: 0 };

    state.employees = state.employees.filter(function (emp) {
      if (!empIds[emp.id]) return true;
      removed.employees++;
      return false;
    });
    state.branches = state.branches.filter(function (branch) {
      if (!branchIds[branch.id]) return true;
      removed.branches++;
      return false;
    });

    state.employees.forEach(function (emp) {
      emp.branches = (emp.branches || []).filter(function (id) { return !branchIds[id]; });
    });

    Object.keys(state.weeks || {}).forEach(function (weekKey) {
      var week = state.weeks[weekKey];
      Object.keys(week.assignments || {}).forEach(function (key) {
        if (branchIds[key.split('|')[1]]) {
          delete week.assignments[key];
          removed.assignments++;
          return;
        }
        var list = week.assignments[key] || [];
        var kept = list.filter(function (id) { return !empIds[id]; });
        if (kept.length === list.length) return;
        removed.assignments += list.length - kept.length;
        if (kept.length) { week.assignments[key] = kept; }
        else { delete week.assignments[key]; }
      });
      Object.keys(week.constraints || {}).forEach(function (key) {
        if (!empIds[key.split('|')[0]]) return;
        delete week.constraints[key];
        removed.constraints++;
      });
    });

    return removed;
  }

  var API = {
    deadlineSettings: deadlineSettings, deadlineFor: deadlineFor,
    constraintLimitSettings: constraintLimitSettings,
    countLimitingConstraints: countLimitingConstraints,
    constraintsLeft: constraintsLeft,
    overConstraintLimit: overConstraintLimit,
    limitsAvailability: limitsAvailability,
    deadlinePassed: deadlinePassed, hoursToDeadline: hoursToDeadline,
    shouldRemind: shouldRemind,
    STORAGE_KEY: STORAGE_KEY,
    clone: clone,
    toKey: toKey,
    weekStart: weekStart,
    currentWeekKey: currentWeekKey,
    shiftWeekKey: shiftWeekKey,
    dateOfDay: dateOfDay,
    formatDate: formatDate,
    emptyState: emptyState, blankState: blankState,
    loadSampleData: loadSampleData,
    emptyWeek: emptyWeek,
    getWeek: getWeek,
    slotKey: slotKey,
    constraintKey: constraintKey,
    getConstraint: getConstraint,
    getConstraintRecord: getConstraintRecord,
    constraintStatus: constraintStatus,
    setConstraintStatus: setConstraintStatus,
    pendingConstraints: pendingConstraints,
    emptyConstraint: emptyConstraint,
    CONSTRAINT_STATUS: CONSTRAINT_STATUS,
    setConstraint: setConstraint,
    getAssigned: getAssigned,
    setAssigned: setAssigned,
    employeeDayAssignments: employeeDayAssignments,
    employeeWeekCount: employeeWeekCount,
    shifts: shifts,
    shiftIds: shiftIds,
    shiftById: shiftById,
    shiftName: shiftName,
    shiftColor: shiftColor,
    normalizeShifts: normalizeShifts,
    removeShift: removeShift,
    removeImported: removeImported,
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
    scheduleSignature: scheduleSignature,
    publishState: publishState,
    PUBLISH_STATE: PUBLISH_STATE,
    markPublished: markPublished,
    markDraft: markDraft,
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
