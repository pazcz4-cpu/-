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

  /* עסק לדוגמה לתוך מצב ריק.

     אין לזה יותר כפתור במסך: "סביבת הדגמה" בחשבון של לקוח היא
     נתונים שאפשר לפרסם בטעות, וזה סיכון שלא שווה את ההדגמה.
     הפונקציה נשארת ככלי בדיקות – מסלולי הדפדפן צריכים עסק מאויש
     כדי לבדוק שיבוץ, ולהקליד בהם שמונה עובדים בכל בדיקה זה קוד
     שנשבר ולא בודק כלום.

     אינה דורסת דבר: אם כבר יש עובדים או סניפים, היא לא נוגעת. */
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
      constraints: {}, assignments: {}, manual: {}, holidays: {}, punches: [],
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
    if (!Array.isArray(w.punches)) w.punches = [];
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

  /* ===================== אילוץ קבוע =====================

     יש אילוצים שאינם בקשה לשבוע מסוים אלא עובדה קבועה על העובד:
     מי שלומד כל שני בערב לא יוכל לעבוד בשני בערב גם בעוד חודשיים.
     עד היום הוא היה צריך להגיש את אותה בקשה כל שבוע מחדש, ולשרוף
     עליה מהמכסה השבועית – על משהו שכולם כבר יודעים.

     לכן ההסדר הקבוע יושב על כרטיס העובד ולא על השבוע:
       emp.standing = { 1: { off: true }, 3: { blocked: { evening: true } } }

     שתי תוצאות נובעות מזה ישירות. הוא חל על כל שבוע, כולל שבועות
     שעוד לא נוצרו; והוא אינו נספר בתקרת הבקשות, כי התקרה סופרת
     את week.constraints וההסדר אינו שם. זה לא טריק – זו בדיוק
     ההבחנה: בקשה היא משהו שמבקשים, והסדר הוא משהו שסוכם. */

  function standingMap(emp) {
    var map = (emp && emp.standing) || {};
    return (map && typeof map === 'object') ? map : {};
  }

  /* ההסדר הקבוע של העובד ליום מסוים, תמיד בצורה אחידה */
  /* ===== מחזור ההסדר הקבוע =====

     יש הסדרים שאינם שבועיים: "פעם בשבועיים הוא עובד חמישה ימים
     בלי שישי ומוצ"ש". אילוץ כזה נכון בשבוע אחד ושגוי בשני, ולכן
     הוא נושא מחזור: כל כמה שבועות הוא חל, ומאיזה שבוע סופרים.

     שבוע שבו ההסדר אינו חל הוא שבוע עבודה רגיל – לא יום חופש,
     ולכן הוא גם אינו נספר בשום מקום כחופשה. */
  function standingCycle(emp) {
    var cycle = emp && emp.standingCycle;
    if (!cycle) return null;
    var every = Math.round(Number(cycle.every) || 1);
    if (!(every > 1)) return null;
    var anchor = typeof cycle.anchor === 'string' ? cycle.anchor : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return null;
    return { every: Math.min(8, every), anchor: anchor };
  }

  /* מספר השבועות בין שני מפתחות שבוע. Math.round ולא חילוק
     שלם, כי מעבר שעון מזיז את היממה בשעה. */
  function weeksBetween(fromKey, toKey) {
    var from = dateOfDay(fromKey, 0);
    var to = dateOfDay(toKey, 0);
    return Math.round((to - from) / (7 * 24 * 60 * 60 * 1000));
  }

  /* בלי מפתח שבוע – ההסדר חל. זו ברירת המחדל הבטוחה: מסך
     שמציג את ההגדרה עצמה צריך לראות אותה תמיד. */
  function standingAppliesTo(emp, weekKey) {
    var cycle = standingCycle(emp);
    if (!cycle || !weekKey) return true;
    var diff = weeksBetween(cycle.anchor, weekKey);
    return ((diff % cycle.every) + cycle.every) % cycle.every === 0;
  }

  function setStandingCycle(emp, every, anchorWeekKey) {
    var count = Math.round(Number(every) || 1);
    if (!(count > 1) || !anchorWeekKey) { delete emp.standingCycle; return; }
    emp.standingCycle = { every: Math.min(8, count), anchor: anchorWeekKey };
  }

  /* מוצא את מפתח השבוע של אובייקט שבוע. הבודקים והמנוע מקבלים
     את השבוע ולא את המפתח שלו, והמחזור תלוי בתאריך – כך הם
     מקבלים אותו בלי לשנות את החתימה של כל אחד מהם. */
  function weekKeyOf(state, week) {
    var weeks = (state && state.weeks) || {};
    var keys = Object.keys(weeks);
    for (var i = 0; i < keys.length; i++) {
      if (weeks[keys[i]] === week) return keys[i];
    }
    return null;
  }

  function standingFor(emp, dayIdx, weekKey) {
    if (!standingAppliesTo(emp, weekKey)) return { off: false, blocked: {} };
    var day = standingMap(emp)[String(dayIdx)];
    if (!day) return { off: false, blocked: {} };
    return {
      off: !!day.off,
      blocked: (day.blocked && typeof day.blocked === 'object') ? day.blocked : {}
    };
  }

  /* האם ההסדר הקבוע חוסם את המשמרת הזו ביום הזה */
  function standingBlocks(emp, dayIdx, shiftId, weekKey) {
    var day = standingFor(emp, dayIdx, weekKey);
    if (day.off) return true;
    return !!day.blocked[shiftId];
  }

  function hasStanding(emp) {
    var map = standingMap(emp);
    return Object.keys(map).some(function (key) {
      var day = standingFor(emp, key);
      return day.off || Object.keys(day.blocked).length > 0;
    });
  }

  /* כתיבת ההסדר ליום אחד. יום ריק יורד מהמפה, כדי שכרטיס בלי
     הסדר ייראה בנתונים בדיוק כמו לפני שהתכונה קיימת. */
  function setStanding(emp, dayIdx, value) {
    if (!emp.standing) emp.standing = {};
    var key = String(dayIdx);
    var off = !!(value && value.off);
    var blocked = {};
    if (!off && value && value.blocked) {
      Object.keys(value.blocked).forEach(function (shiftId) {
        if (value.blocked[shiftId]) blocked[shiftId] = true;
      });
    }
    if (!off && !Object.keys(blocked).length) { delete emp.standing[key]; }
    else { emp.standing[key] = off ? { off: true } : { blocked: blocked }; }
    if (!Object.keys(emp.standing).length) delete emp.standing;
    return standingFor(emp, dayIdx);
  }

  /* האילוץ שתופס בפועל ביום הזה: ההסדר הקבוע ובקשת השבוע יחד.

     ההסדר אינו מבטל את הבקשה ולהפך – שניהם מגבילים, ולכן הם
     מתחברים. העדפות מגיעות רק מהבקשה: הסדר קבוע אומר מתי אי
     אפשר, ולא מתי מעדיפים. */
  function effectiveConstraint(state, week, empId, dayIdx, weekKey) {
    var weekly = getConstraint(week, empId, dayIdx);
    var emp = byId((state && state.employees) || [], empId);
    if (!emp || !hasStanding(emp)) return weekly;

    /* בלי מפתח שבוע מחפשים אותו במצב עצמו: הסדר דו-שבועי חל
       רק בחלק מהשבועות, ובלי לדעת באיזה שבוע אנחנו הוא היה
       חוסם תמיד. */
    var day = standingFor(emp, dayIdx, weekKey || weekKeyOf(state, week));
    if (!day.off && !Object.keys(day.blocked).length) return weekly;

    var merged = {
      off: weekly.off || day.off,
      blocked: {},
      preferred: weekly.preferred || {},
      note: weekly.note || '',
      /* כדי שהמסכים יוכלו לומר "זה הסדר קבוע" ולא "בקשה שאושרה" */
      standing: true
    };
    Object.keys(weekly.blocked || {}).forEach(function (id) {
      if (weekly.blocked[id]) merged.blocked[id] = true;
    });
    Object.keys(day.blocked).forEach(function (id) { merged.blocked[id] = true; });
    return merged;
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

  /* ===== ימי חופש =====

     "לא עובד ביום שישי" ו"לקח יום חופש" נראים אותו דבר בסידור,
     והם שני דברים שונים לגמרי בשכר. לכן יום חופש שהמנהל מסמן
     נושא סוג: בתשלום – יורד מהמכסה של העובד; ללא חיוב – יום
     שסוכם איתו ואינו נספר.

     הסימון יושב על אותה רשומה של היום החופשי ולא במבנה נפרד:
     יום שמסומן כחופש והבקשה שלו נמחקת אינו יכול להישאר תלוי
     במקום אחר ולהיספר לנצח. */
  var LEAVE = { PAID: 'paid', UNPAID: 'unpaid' };

  /* ברירת המחדל היא ללא תשלום. יום חופש שאיש לא סימן כמשולם
     אינו משולם – זו ההנחה היחידה שאינה עולה כסף למי שלא שם לב,
     והיא גם מה שכתוב בהעתקה שנשלחת לעובד.

     null פירושו "זה בכלל לא יום חופש". */
  function leaveOf(week, empId, dayIdx) {
    var record = getConstraintRecord(week, empId, dayIdx);
    if (!record || !record.off) return null;
    if (constraintStatus(record) === CONSTRAINT_STATUS.REJECTED) return null;
    return record.leave === LEAVE.PAID ? LEAVE.PAID : LEAVE.UNPAID;
  }

  /* leave = 'paid' | 'unpaid' | null. אפשרי רק על יום שמסומן
     כחופשי – אין "חופש" על יום עבודה. */
  /* "ללא תשלום" נשמר כהיעדר סימון, כי זו ברירת המחדל: כך יום
     ישן שלא נגעו בו מתנהג בדיוק כמו יום שסומן במפורש. */
  function setLeave(week, empId, dayIdx, leave) {
    var record = getConstraintRecord(week, empId, dayIdx);
    if (!record || !record.off) return false;
    if (leave === LEAVE.PAID) record.leave = LEAVE.PAID;
    else delete record.leave;
    return true;
  }

  /* ===== בקשת חופשה עתידית =====

     יום חופש בודד לשבוע הקרוב נשמר כבקשת אילוץ רגילה. חופשה
     היא משהו אחר: היא נמשכת כמה ימים, היא מבוקשת חודשיים
     מראש, ולעובד חשוב אם היא בתשלום.

     ובכל זאת היא נשמרת כאותן רשומות יומיות, ולא כמבנה נפרד.
     הסיבה אינה עצלנות: ליום יש כבר סטטוס, אישור, הערת מנהל
     והתראה לעובד, והוא כבר נספר בדוח החודשי ובסיכום החופשות.
     מבנה נפרד היה מחייב לשכפל את כל אלה, ולשמור על שניהם
     מסונכרנים — כלומר להמציא דרך חדשה שבה חופשה מאושרת אינה
     מופיעה בדוח.

     מה שמחבר את הימים הוא requestId משותף: המסך מציג אותם
     כבקשה אחת, והמנהל מאשר את כולה בלחיצה אחת. */
  var LEAVE_MAX_DAYS = 60;

  function parseDateKey(value) {
    var parts = String(value || '').split('-');
    if (parts.length !== 3) return null;
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(date.getTime())) return null;
    return date;
  }

  /* הימים שבטווח, כל אחד עם מפתח השבוע ומדד היום בתוכו.
     מחזיר null כשהטווח אינו תקין — קריאה שמייצרת אפס ימים היא
     שגיאה של הקורא, ולא תשובה. */
  function leaveDays(from, to) {
    var start = parseDateKey(from);
    var end = parseDateKey(to);
    if (!start || !end) return null;
    if (end < start) return null;
    var out = [];
    var cursor = new Date(start.getTime());
    while (cursor <= end) {
      out.push({
        date: new Date(cursor.getTime()),
        weekKey: currentWeekKey(cursor),
        dayIdx: cursor.getDay()
      });
      if (out.length > LEAVE_MAX_DAYS) return null;
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }

  /* הרשומה שנכתבת על כל יום בטווח */
  function leaveRecord(input) {
    var record = {
      off: true,
      blocked: {},
      preferred: {},
      note: String((input && input.note) || '').slice(0, 300),
      status: CONSTRAINT_STATUS.PENDING,
      requestedAt: (input && input.at) || new Date().toISOString(),
      managerNote: '',
      requestId: (input && input.requestId) || newId('lv'),
      leaveFrom: (input && input.from) || '',
      leaveTo: (input && input.to) || ''
    };
    /* בקשת חופשה מראש היא תמיד בקשה לחופשה בתשלום, ולכן אין
       כאן תנאי. עובד שמבקש חופשה מבקש חופשה; אם המנהל מחליט
       שיום מסוים אינו בתשלום, הוא משנה אותו בלוח האילוצים —
       וזו החלטה שלו, לא שאלה שנשאלת בטופס. */
    record.leave = LEAVE.PAID;
    return record;
  }

  /* הבקשות של עובד, מקובצות. מיועד למסך: יום בודד שהוגש כרגיל
     אינו בקשת חופשה ואינו מופיע כאן. */
  function leaveRequests(state, empId) {
    var groups = {};
    var order = [];
    Object.keys(state.weeks || {}).forEach(function (weekKey) {
      var constraints = (state.weeks[weekKey] || {}).constraints || {};
      Object.keys(constraints).forEach(function (key) {
        var parts = key.split('|');
        /* empId ריק = כל העובדים. זה מה שהמנהל רואה. */
        if (empId && parts[0] !== empId) return;
        var record = constraints[key];
        if (!record || !record.requestId) return;
        var group = groups[record.requestId];
        if (!group) {
          group = groups[record.requestId] = {
            requestId: record.requestId,
            empId: parts[0],
            from: record.leaveFrom || '',
            to: record.leaveTo || '',
            paid: record.leave === LEAVE.PAID,
            note: record.note || '',
            managerNote: record.managerNote || '',
            days: [],
            statuses: {}
          };
          order.push(record.requestId);
        }
        group.days.push({ weekKey: weekKey, dayIdx: Number(parts[1]), record: record });
        var status = constraintStatus(record);
        group.statuses[status] = (group.statuses[status] || 0) + 1;
        if (record.managerNote && !group.managerNote) group.managerNote = record.managerNote;
      });
    });
    return order.map(function (id) {
      var group = groups[id];
      /* בקשה שחלק מימיה אושר וחלק נדחה אינה "מאושרת": היא
         מוצגת כמעורבת, כי זה מה שקרה בפועל. */
      var kinds = Object.keys(group.statuses);
      group.status = kinds.length === 1 ? kinds[0] : 'mixed';
      group.days.sort(function (a, b) {
        if (a.weekKey === b.weekKey) return a.dayIdx - b.dayIdx;
        return a.weekKey < b.weekKey ? -1 : 1;
      });
      return group;
    });
  }

  function monthKeyOf(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1);
  }

  /* מפתחות השבועות שיש בהם ולו יום אחד מהחודש הזה. שבוע חוצה
     חודשים, ולכן הספירה נעשית לפי היום ולא לפי השבוע. */
  function weekKeysForMonth(monthKey) {
    var parts = String(monthKey || '').split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    if (!year || !month) return [];
    var first = new Date(year, month - 1, 1);
    var last = new Date(year, month, 0);
    var keys = [];
    var key = toKey(weekStart(first));
    var guard = 0;
    while (guard++ < 10) {
      keys.push(key);
      if (dateOfDay(key, 6) >= last) break;
      key = shiftWeekKey(key, 1);
    }
    return keys;
  }

  /* סיכום ימי החופש בחודש, לפי עובד. נספרים ימים – לא שבועות –
     ולכן שבוע שחוצה חודשים מתחלק נכון בין השניים. */
  function leaveSummary(state, monthKey) {
    var out = {};
    Object.keys(state.weeks || {}).forEach(function (weekKey) {
      var current = state.weeks[weekKey];
      var constraints = (current && current.constraints) || {};
      Object.keys(constraints).forEach(function (key) {
        var parts = key.split('|');
        var empId = parts[0];
        var dayIdx = Number(parts[1]);
        if (!(dayIdx >= 0 && dayIdx <= 6)) return;
        var kind = leaveOf(current, empId, dayIdx);
        if (!kind) return;
        if (monthKeyOf(dateOfDay(weekKey, dayIdx)) !== monthKey) return;
        var bucket = out[empId] || (out[empId] = { paid: 0, unpaid: 0 });
        if (kind === LEAVE.PAID) bucket.paid++; else bucket.unpaid++;
      });
    });
    return out;
  }


  /* ===== שעון נוכחות =====

     עד כאן המערכת ידעה מה מתוכנן. כאן מתחיל מה שקרה בפועל.

     דיווח אחד הוא רגע אחד: מי, מתי, נכנס או יצא, ומאיפה הגיע
     הדיווח. שעות אינן נשמרות – הן מחושבות מזוגות, כי דיווח הוא
     עובדה ושעה היא פרשנות שלה, ופרשנות שנשמרה פעם אחת אי אפשר
     לתקן כשמתברר שהייתה שגויה.

     הזמן נשמר כ-ISO ב-UTC. עסק בישראל עובר שעון קיץ פעמיים
     בשנה, ושמירת "08:00" מקומי הופכת את הלילה שבו השעון זז
     למריבה על שעה. */
  var PUNCH = { IN: 'in', OUT: 'out' };

  /* מאיפה הגיע הדיווח. נשמר, ומוצג בדוח, כי "המנהל תיקן" הוא
     מידע שהעובד זכאי לראות ולא פרט טכני. */
  var PUNCH_SRC = { PHONE: 'phone', DEVICE: 'device', MANAGER: 'manager' };

  /* חלון כפילות. שתי סיבות, ושתיהן שכיחות:

       · מכשיר חומרה ששלח אצווה ולא קיבל אישור שולח אותה שוב,
         וזה תקין מבחינתו. בלי החלון הזה כל ניתוק רשת בסניף
         היה מייצר לעובד משמרת כפולה.
       · ואדם שמעביר כרטיס פעמיים כי לא שמע ביפ. הכיוון אצלנו
         נגזר מהדיווח הקודם, ולכן ההעברה השנייה הייתה נרשמת
         כיציאה מיידית – והעובד היה מגלה בסוף החודש שעבד דקה.

     לכן החלון חוסם כל דיווח נוסף של אותו עובד, ולא רק דיווח
     באותו כיוון. משמרת בת דקה אינה משמרת. */
  var PUNCH_DEDUPE_MS = 90 * 1000;

  function punchList(week) {
    return Array.isArray(week && week.punches) ? week.punches : [];
  }

  function punchTime(punch) {
    var value = punch && punch.at ? Date.parse(punch.at) : NaN;
    return isNaN(value) ? 0 : value;
  }

  function sortPunches(list) {
    return list.sort(function (a, b) {
      var diff = punchTime(a) - punchTime(b);
      if (diff) return diff;
      /* שתי חותמות זהות: כניסה קודמת ליציאה, אחרת משמרת באורך
         אפס הייתה נקראת כמשמרת פתוחה. */
      return (a.kind === PUNCH.IN ? 0 : 1) - (b.kind === PUNCH.IN ? 0 : 1);
    });
  }

  /* הוספת דיווח. מחזיר { ok, reason, punch }.

     reason = 'duplicate' כשהדיווח נבלע בחלון הכפילות. זו אינה
     שגיאה: המכשיר עשה את הדבר הנכון, ואנחנו לא סופרים פעמיים. */
  function addPunch(week, input) {
    if (!week) return { ok: false, reason: 'no_week' };
    var empId = String((input && input.empId) || '');
    var kind = (input && input.kind) === PUNCH.OUT ? PUNCH.OUT : PUNCH.IN;
    var at = (input && input.at) || new Date().toISOString();
    if (!empId) return { ok: false, reason: 'no_employee' };
    if (isNaN(Date.parse(at))) return { ok: false, reason: 'bad_time' };

    if (!Array.isArray(week.punches)) week.punches = [];
    var stamp = Date.parse(at);
    var duplicate = null;
    /* force – תיקון של המנהל. הוא רואה את מה שכבר רשום ויודע
       מה הוא מוסיף, ולכן החלון אינו חוסם אותו. */
    if (!input.force) {
      week.punches.forEach(function (existing) {
        if (existing.empId !== empId) return;
        if (Math.abs(punchTime(existing) - stamp) <= PUNCH_DEDUPE_MS) duplicate = existing;
      });
    }
    if (duplicate) return { ok: false, reason: 'duplicate', punch: duplicate };

    var punch = {
      id: newId('pch'),
      empId: empId,
      kind: kind,
      at: new Date(stamp).toISOString(),
      src: input.src === PUNCH_SRC.DEVICE ? PUNCH_SRC.DEVICE
        : (input.src === PUNCH_SRC.MANAGER ? PUNCH_SRC.MANAGER : PUNCH_SRC.PHONE)
    };
    if (input.branchId) punch.branchId = String(input.branchId);
    if (input.deviceSn) punch.deviceSn = String(input.deviceSn);
    if (input.by) punch.by = String(input.by);
    if (input.note) punch.note = String(input.note).slice(0, 200);
    week.punches.push(punch);
    sortPunches(week.punches);
    return { ok: true, punch: punch };
  }

  function removePunch(week, punchId) {
    if (!week || !Array.isArray(week.punches)) return false;
    var before = week.punches.length;
    week.punches = week.punches.filter(function (punch) { return punch.id !== punchId; });
    return week.punches.length !== before;
  }

  function punchesOf(week, empId) {
    return punchList(week).filter(function (punch) { return punch.empId === empId; });
  }

  function firstPunchAt(week, empId) {
    var list = punchesOf(week, empId);
    return list.length ? list[0] : null;
  }

  /* האם העובד נמצא בפנים כרגע. זה מה שקובע איזה כפתור מוצג לו,
     ולכן הוא נגזר מהדיווח האחרון ולא נשמר כדגל: דגל שנשמר יכול
     לסתור את הדיווחים, והדיווחים הם האמת.

     prevWeek – השבוע שלפני. משמרת לילה של מוצאי שבת נכנסת ביום
     האחרון של השבוע ויוצאת ביום הראשון של הבא, ובלי השבוע
     הקודם העובד שפותח את האפליקציה ב-02:00 רואה "כניסה" בזמן
     שהוא בתוך משמרת. */
  function punchState(week, empId, prevWeek) {
    var list = punchesOf(week, empId);
    if (list.length) {
      return list[list.length - 1].kind === PUNCH.IN ? PUNCH.IN : PUNCH.OUT;
    }
    if (prevWeek) return punchState(prevWeek, empId);
    return PUNCH.OUT;
  }

  /* זוגות כניסה–יציאה, לפי סדר הזמן.

     משמרת שחוצה חצות היא המקרה הרגיל ולא הקצה: כניסה ב-22:00
     ויציאה ב-02:00 הן זוג אחד, והיום שאליו הוא נזקף הוא יום
     הכניסה – כך רואה את זה גם העובד וגם התלוש.

     כניסה בלי יציאה נשארת פתוחה ואינה נספרת כשעות. לא מנחשים
     מתי הוא יצא: ניחוש כזה נכנס לתלוש. */
  function punchSessions(week, empId, neighbours) {
    var near = neighbours || {};
    var out = [];
    var open = null;
    var list = punchesOf(week, empId);

    /* משמרת שחוצה את סוף השבוע. הכניסה במוצאי שבת נרשמת בשבוע
       אחד והיציאה בראשון בבוקר בשבוע הבא, ואז שני השבועות
       משקרים: באחד משמרת פתוחה, בשני יציאה יתומה, ובתלוש אפס
       שעות על לילה שלם של עבודה.

       הצד הכותב מכוון את היציאה לשבוע שבו הכניסה פתוחה, ולכן
       נתונים חדשים אינם מגיעים לכאן מפוצלים. השחבור כאן הוא
       רשת הביטחון: הוא מתקן גם את מה שכבר נרשם מפוצל, וגם כל
       מסלול כתיבה שעוד יתווסף. היציאה נספרת פעם אחת בלבד –
       בשבוע של הכניסה – והשבוע שאחריו מדלג עליה. */
    if (near.prev && list.length && list[0].kind === PUNCH.OUT &&
        punchState(near.prev, empId) === PUNCH.IN) {
      list = list.slice(1);
    }

    list.forEach(function (punch) {
      if (punch.kind === PUNCH.IN) {
        /* כניסה על כניסה: הראשונה נשארת פתוחה, וזו מתחילה
           מחדש. המנהל יראה את הפתוחה ויתקן. */
        if (open) out.push({ inAt: open.at, outAt: null, minutes: 0, open: true, punchIn: open });
        open = punch;
        return;
      }
      if (!open) {
        /* יציאה בלי כניסה – לרוב מכשיר שהותקן באמצע יום.
           נרשמת כיתומה כדי שתהיה גלויה, ואינה מייצרת שעות. */
        out.push({ inAt: null, outAt: punch.at, minutes: 0, orphan: true, punchOut: punch });
        return;
      }
      out.push({
        inAt: open.at,
        outAt: punch.at,
        minutes: Math.max(0, Math.round((punchTime(punch) - punchTime(open)) / 60000)),
        open: false,
        punchIn: open,
        punchOut: punch
      });
      open = null;
    });
    if (open) {
      var first = near.next ? firstPunchAt(near.next, empId) : null;
      var closer = (first && first.kind === PUNCH.OUT) ? first : null;
      if (closer) {
        out.push({
          inAt: open.at,
          outAt: closer.at,
          minutes: Math.max(0, Math.round((punchTime(closer) - punchTime(open)) / 60000)),
          open: false,
          punchIn: open,
          punchOut: closer
        });
      } else {
        out.push({ inAt: open.at, outAt: null, minutes: 0, open: true, punchIn: open });
      }
    }
    return out;
  }

  /* ===== לאן נרשם דיווח חדש, ומה הכיוון שלו =====

     שאלה אחת שכל מסלול כתיבה שואל: העובד לחץ על הכפתור, או
     העביר כרטיס במכשיר – זו כניסה או יציאה, ולאיזה שבוע היא
     נכנסת.

     התשובה הרגילה היא "לשבוע של החותמת, והכיוון הפוך מהדיווח
     הקודם". החריג היחיד הוא הרגע שאחרי חצות של מוצאי שבת:
     בשבוע החדש עוד אין לעובד אף דיווח, ובשבוע שלפניו הוא
     בפנים. אז היציאה נרשמת בשבוע שבו הכניסה פתוחה, והמשמרת
     נשארת שלמה במקום אחד.

     weeks – מפה של מפתח שבוע לאובייקט שבוע. די בשבוע הנוכחי
     ובזה שלפניו. */
  function punchTarget(weeks, empId, weekKey) {
    var map = weeks || {};
    var mine = punchesOf(map[weekKey], empId);
    if (!mine.length) {
      var prevKey = shiftWeekKey(weekKey, -1);
      if (map[prevKey] && punchState(map[prevKey], empId) === PUNCH.IN) {
        return { weekKey: prevKey, kind: PUNCH.OUT };
      }
    }
    var last = mine.length ? mine[mine.length - 1] : null;
    return {
      weekKey: weekKey,
      kind: last && last.kind === PUNCH.IN ? PUNCH.OUT : PUNCH.IN
    };
  }

  /* ===== שעות נוספות =====

     החוק בישראל סופר יום ושבוע, ולכן שניהם כאן. הסף נשמר
     בהגדרות ולא מקודד כאן: יש עסקים עם הסכם קיבוצי אחר, ומספר
     שקבוע בקוד הוא מספר שלא ניתן לתקן ללקוח. */
  function overtimeRule(state) {
    var value = (state && state.settings && state.settings.overtime) || {};
    return {
      enabled: value.enabled === true,
      dailyMinutes: Math.max(0, Math.round(Number(value.dailyMinutes) || 0)) || 516,
      weeklyMinutes: Math.max(0, Math.round(Number(value.weeklyMinutes) || 0)) || 2520
    };
  }

  function timeclock(state) {
    var value = (state && state.settings && state.settings.timeclock) || {};
    return {
      enabled: value.enabled === true,
      /* phone – העובד מדווח מהטלפון. device – רק שעון בסניף.
         both – שניהם, וכל סניף בוחר בפועל מה יש לו. */
      mode: value.mode === 'device' || value.mode === 'both' ? value.mode : 'phone',
      devices: Array.isArray(value.devices) ? value.devices : []
    };
  }

  function allowsPhonePunch(state) {
    var clock = timeclock(state);
    return clock.enabled && (clock.mode === 'phone' || clock.mode === 'both');
  }

  /* ===== ייצוא לשכר =====

     מה שמנהלת החשבונות צריכה אינו מה שהמנהל רואה על המסך.
     על המסך שעות נכתבות כ-"8:36", כי זה מה שמופיע בתלוש וזה
     מה שמשווים מולו; מערכת שכר רוצה 8.60, כי היא מכפילה את זה
     בתעריף. לכן שתי הצורות יוצאות זו לצד זו, והמייבא בוחר.

     שתי רמות פירוט, כי מערכות השכר חלוקות ביניהן: יש כאלה
     שקולטות שורה אחת לעובד לחודש, ויש כאלה שרוצות כל כניסה
     ויציאה בנפרד ומחשבות בעצמן. */

  /* שעות עשרוניות, מעוגלות למאיות. 8 שעות ו-36 דקות = 8.60 */
  function decimalHours(minutes) {
    return (Math.max(0, Math.round(Number(minutes) || 0)) / 60).toFixed(2);
  }

  function payrollIdentity(emp) {
    return {
      empId: emp.id,
      payrollId: payrollIdOf(emp),
      clockId: clockIdOf(emp) || '',
      name: emp.name || ''
    };
  }

  /* שורה אחת לעובד לחודש. רק עובדים שיש להם מה לדווח עליו:
     שורה של אפס שעות במערכת שכר היא בקשה לבדוק למה. */
  function payrollSummary(state, monthKey) {
    var report = monthlyReport(state, monthKey);
    var out = [];
    (state.employees || []).forEach(function (emp) {
      var row = report[emp.id];
      if (!row) return;
      if (!row.minutes && !row.plannedMinutes && !row.openSessions &&
          !row.paidLeaveDays && !row.unpaidLeaveDays) return;
      var line = payrollIdentity(emp);
      line.monthKey = monthKey;
      line.days = row.days;
      line.minutes = row.minutes;
      line.hours = decimalHours(row.minutes);
      line.clock = formatMinutes(row.minutes);
      line.plannedMinutes = row.plannedMinutes;
      line.plannedHours = decimalHours(row.plannedMinutes);
      line.overtimeMinutes = row.overtimeMinutes;
      line.overtimeHours = decimalHours(row.overtimeMinutes);
      line.paidLeaveDays = row.paidLeaveDays;
      line.unpaidLeaveDays = row.unpaidLeaveDays;
      /* משמרת פתוחה ודיווח יתום הם אותה בעיה מבחינת מי שמקבל
         את הקובץ: יש כאן שעות שאי אפשר לסמוך עליהן. */
      line.openSessions = row.openSessions + row.orphanPunches;
      out.push(line);
    });
    return out;
  }

  /* שורה לכל זוג כניסה–יציאה, לפי סדר הזמן. משמרת פתוחה נכללת
     עם שעת יציאה ריקה ואפס דקות – השמטה שקטה שלה הייתה מייצרת
     קובץ שנראה תקין וחסרות בו שעות. */
  function payrollPunches(state, monthKey) {
    var out = [];
    var weekKeys = weekKeysForMonth(monthKey);
    var byEmployee = {};
    (state.employees || []).forEach(function (emp) { byEmployee[emp.id] = emp; });

    weekKeys.forEach(function (weekKey) {
      var week = (state.weeks || {})[weekKey];
      if (!week) return;
      var near = {
        prev: (state.weeks || {})[shiftWeekKey(weekKey, -1)],
        next: (state.weeks || {})[shiftWeekKey(weekKey, 1)]
      };
      var seen = {};
      punchList(week).forEach(function (punch) { seen[punch.empId] = true; });
      Object.keys(seen).forEach(function (empId) {
        var emp = byEmployee[empId];
        if (!emp) return;
        punchSessions(week, empId, near).forEach(function (session) {
          var stamp = Date.parse(session.inAt || session.outAt);
          if (isNaN(stamp)) return;
          var start = new Date(stamp);
          /* המשמרת שייכת לחודש שבו היא נפתחה, כמו בדוח */
          if (monthKeyOf(start) !== monthKey) return;
          var line = payrollIdentity(emp);
          line.date = start.getFullYear() + '-' + pad(start.getMonth() + 1) + '-' + pad(start.getDate());
          line.inAt = session.inAt ? clockOf(new Date(Date.parse(session.inAt))) : '';
          line.outAt = session.outAt ? clockOf(new Date(Date.parse(session.outAt))) : '';
          line.minutes = session.minutes;
          line.hours = decimalHours(session.minutes);
          line.clock = formatMinutes(session.minutes);
          line.open = !!session.open;
          line.orphan = !!session.orphan;
          line.at = stamp;
          out.push(line);
        });
      });
    });
    return out.sort(function (a, b) {
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      return a.at - b.at;
    });
  }

  function clockOf(date) {
    return pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  /* ===== מספר העובד במערכת השכר =====

     זה לא אותו מספר כמו במכשיר השעון. במכשיר המספר מוקצה
     אוטומטית ומשרת רק את הקריאה של הכרטיס; במערכת השכר הוא כבר
     קיים, נקבע על ידי מי שמנהל את השכר, ולפיו מערכת השכר יודעת
     על מי השעות. בלעדיו כל ייצוא לשכר מזוהה בשם בלבד — ושני
     עובדים בשם "דוד כהן" הם בדיוק המקרה שבו זה נופל.

     לכן נשמר כטקסט ולא כמספר: יש מערכות שבהן המספר מתחיל באפס,
     ויש כאלה שבהן הוא כולל אות או מקף. */
  function payrollIdOf(emp) {
    return String((emp && emp.payrollId) || '').trim();
  }

  /* ===== המספר של העובד במכשיר =====

     מכשיר חומרה אינו מכיר מזהים כמו "emp-7". הוא מכיר מספר
     משתמש, והמנהל מקליד אותו במכשיר בעת רישום הכרטיס. לכן לכל
     עובד יש מספר קצר וקבוע, והמסך מציג אותו.

     המספרים מוקצים אוטומטית ולא מוקלדים: מנהל שמקליד מספרים
     בשתי מערכות שונות יטעה, וטעות כאן פירושה ששעות של אחד
     נרשמות על השני. הם גם אינם ממוחזרים אחרי מחיקת עובד, כדי
     שדיווח ישן שיגיע באיחור לא ייפול על מי שקיבל את מספרו. */
  function clockIdOf(emp) {
    var value = Number(emp && emp.clockId);
    return value > 0 ? Math.floor(value) : null;
  }

  function nextClockId(state) {
    var max = 0;
    (state.employees || []).forEach(function (emp) {
      var value = clockIdOf(emp);
      if (value && value > max) max = value;
    });
    return max + 1;
  }

  /* מחזיר את העובדים שקיבלו מספר עכשיו. מי שקורא חייב לשמור. */
  function assignClockIds(state) {
    var added = [];
    var next = nextClockId(state);
    (state.employees || []).forEach(function (emp) {
      if (clockIdOf(emp)) return;
      emp.clockId = next++;
      added.push(emp);
    });
    return added;
  }

  function employeeByClockId(state, clockId) {
    var wanted = Number(clockId);
    if (!(wanted > 0)) return null;
    var list = state.employees || [];
    for (var i = 0; i < list.length; i++) {
      if (clockIdOf(list[i]) === Math.floor(wanted)) return list[i];
    }
    return null;
  }

  /* דקות מתוכננות לעובד ביום, לפי שעות המשמרת שאליה שובץ.
     זה הצד השני של הדוח: מה היה אמור לקרות. */
  function plannedMinutes(state, week, empId, dayIdx) {
    var total = 0;
    employeeDayAssignments(state, week, empId, dayIdx).forEach(function (slot) {
      var shift = shiftById(state, slot.shiftId);
      if (!shift) return;
      total += shiftLengthMinutes(shift);
    });
    return total;
  }

  function parseClock(value) {
    var parts = String(value || '').split(':');
    var hours = Number(parts[0]);
    var minutes = Number(parts[1]);
    if (isNaN(hours) || isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }

  /* ===== מנוחה בין משמרות =====

     הכלל הזה היה פעם "אין בוקר אחרי ערב של אתמול", והוא הושווה
     לפי מזהי המשמרות morning ו-evening. זה עבד בדיוק על שלוש
     משמרות ברירת המחדל: עסק שהוסיף משמרת לילה 22:00–06:00 לא
     היה מוגן ממנה לבוקר שלמחרת, והיא בדיוק המשמרת שבה זה
     מסוכן.

     עכשיו נמדד הפער האמיתי בשעות, ולכן הוא עובד על כל משמרת
     שהעסק מגדיר, כולל כזו שחוצה חצות.

     ברירת המחדל היא 12 שעות ולא 8 (המינימום בחוק) מסיבה אחת:
     בשעות ברירת המחדל של המערכת זה מייצר בדיוק את אותו איסור
     שהיה קודם – ערב שנגמר ב-22:00 חוסם בוקר ב-09:30 (11.5
     שעות) ואינו חוסם שום צמד אחר. עסק שרוצה לרדת ל-8 משנה
     את המספר בהגדרות. */
  var DEFAULT_REST_MINUTES = 12 * 60;

  function restRule(state) {
    var settings = (state && state.settings) || {};
    var minutes = Math.round(Number(settings.restMinutes));
    return {
      /* עסק קיים נשמר עם restEveningMorning בלבד, והוא ממשיך
         לקבוע אם הכלל דלוק. */
      enabled: settings.restEveningMorning !== false,
      minutes: (isFinite(minutes) && minutes > 0) ? minutes : DEFAULT_REST_MINUTES
    };
  }

  /* תחילת המשמרת וסופה, בדקות מתחילת השבוע. שעות הסניף קודמות
     להגדרת המשמרת, כי מוצ״ש וסניף עם שעות משלו הם המקרה שבו
     ההפרש באמת שונה. */
  function shiftSpanAt(state, week, branchId, shiftId, dayIdx) {
    var branch = byId(state.branches, branchId);
    var hours = branch ? slotHours(week, branch, dayIdx, shiftId) : null;
    var shift = shiftById(state, shiftId) || {};
    var from = parseClock((hours && hours.from) || shift.from);
    var to = parseClock((hours && hours.to) || shift.to);
    if (from === null || to === null) return null;
    var length = to - from;
    if (length <= 0) length += 24 * 60;          // משמרת שחוצה חצות
    var start = Number(dayIdx) * 24 * 60 + from;
    return { start: start, end: start + length };
  }

  /* הפער בין שתי משמרות בדקות, בלי קשר לסדר שבו נשאלו.
     null = אי אפשר לחשב, ואז אין חסימה. */
  function restGapMinutes(state, week, a, b) {
    var first = shiftSpanAt(state, week, a.branchId, a.shiftId, a.dayIdx);
    var second = shiftSpanAt(state, week, b.branchId, b.shiftId, b.dayIdx);
    if (!first || !second) return null;
    var early = first.start <= second.start ? first : second;
    var late = first.start <= second.start ? second : first;
    return late.start - early.end;
  }

  function breaksRest(state, week, a, b) {
    var rule = restRule(state);
    if (!rule.enabled) return false;
    var gap = restGapMinutes(state, week, a, b);
    return gap !== null && gap < rule.minutes;
  }

  /* משמרת ערב שנגמרת ב-02:00 אינה באורך מינוס עשרים שעות */
  function shiftLengthMinutes(shift) {
    var from = parseClock(shift && shift.from);
    var to = parseClock(shift && shift.to);
    if (from === null || to === null) return 0;
    var length = to - from;
    if (length <= 0) length += 24 * 60;
    return length;
  }

  /* ===== הדוח החודשי =====

     מה שנשלח לחשב שכר. לכן הוא נבנה מהיום ולא מהשבוע: שבוע
     שחוצה חודשים מתחלק בין השניים, ועובד שעבד ב-31 וב-1 אינו
     מקבל את שניהם באותו חודש.

     מוחזר לכל עובד: דקות בפועל, דקות מתוכננות, שעות נוספות,
     ימי חופשה בתשלום ושלא בתשלום, ומשמרות פתוחות – כי דוח עם
     משמרת פתוחה הוא דוח שאסור לשלוח לחשב שכר לפני שמתקנים. */
  function monthlyReport(state, monthKey) {
    var rule = overtimeRule(state);
    var byEmployee = {};
    function bucket(empId) {
      if (!byEmployee[empId]) {
        byEmployee[empId] = {
          empId: empId, minutes: 0, plannedMinutes: 0, days: 0,
          overtimeMinutes: 0, dailyOvertimeMinutes: 0, weeklyOvertimeMinutes: 0,
          paidLeaveDays: 0, unpaidLeaveDays: 0, openSessions: 0, orphanPunches: 0,
          byDay: {}
        };
      }
      return byEmployee[empId];
    }

    /* דקות לפי עובד וליום קלנדרי, כדי לספור יום ושבוע בנפרד */
    var weekKeys = weekKeysForMonth(monthKey);
    weekKeys.forEach(function (weekKey) {
      var week = (state.weeks || {})[weekKey];
      if (!week) return;
      var seen = {};
      punchList(week).forEach(function (punch) { seen[punch.empId] = true; });
      /* השבוע שלפני והשבוע שאחרי, כדי שמשמרת לילה של מוצאי
         שבת תיספר פעם אחת ובשלמותה. אם הם לא נטענו – התוצאה
         היא מה שהייתה קודם, ולא שגיאה. */
      var near = {
        prev: (state.weeks || {})[shiftWeekKey(weekKey, -1)],
        next: (state.weeks || {})[shiftWeekKey(weekKey, 1)]
      };
      Object.keys(seen).forEach(function (empId) {
        punchSessions(week, empId, near).forEach(function (session) {
          /* היום שאליו נזקפת המשמרת הוא יום הכניסה, וגם משמרת
             שנפתחה ב-30 בחודש ונסגרה ב-1 בבא שייכת כולה לחודש
             שנפתחה בו. חצייה אינה מקרה קצה אלא משמרת ערב.

             שורה נפתחת רק אחרי הסינון הזה: דוח אוקטובר שמופיע
             בו עובד עם אפס שעות, רק מפני שעבד בספטמבר באותו
             שבוע, הוא דוח שקשה להאמין לו. */
          var stamp = Date.parse(session.inAt || session.outAt);
          if (isNaN(stamp)) return;
          var start = new Date(stamp);
          if (monthKeyOf(start) !== monthKey) return;
          var row = bucket(empId);
          if (session.orphan) { row.orphanPunches++; return; }
          if (session.open) { row.openSessions++; return; }
          var dayKey = start.getFullYear() + '-' + pad(start.getMonth() + 1) + '-' + pad(start.getDate());
          var day = row.byDay[dayKey] || (row.byDay[dayKey] = { minutes: 0, weekKey: weekKey });
          day.minutes += session.minutes;
          row.minutes += session.minutes;
        });
      });

      /* המתוכנן נספר מהשיבוצים, ולכן הוא קיים גם לעובד שלא
         דיווח כלל – וזה בדיוק מה שהמנהל מחפש בדוח. */
      (state.employees || []).forEach(function (emp) {
        for (var dayIdx = 0; dayIdx <= 6; dayIdx++) {
          var date = dateOfDay(weekKey, dayIdx);
          if (monthKeyOf(date) !== monthKey) continue;
          var planned = plannedMinutes(state, week, emp.id, dayIdx);
          if (planned) bucket(emp.id).plannedMinutes += planned;
        }
      });
    });

    /* חופשות: נספרות מהבקשות שאושרו, ולא מהדיווחים. יום חופשה
       הוא יום שלא דיווחו בו, ולכן הוא חייב להגיע ממקור אחר. */
    var leave = leaveSummary(state, monthKey);
    Object.keys(leave).forEach(function (empId) {
      var row = bucket(empId);
      row.paidLeaveDays = leave[empId].paid;
      row.unpaidLeaveDays = leave[empId].unpaid;
    });

    Object.keys(byEmployee).forEach(function (empId) {
      var row = byEmployee[empId];
      var perWeek = {};
      Object.keys(row.byDay).forEach(function (dayKey) {
        var day = row.byDay[dayKey];
        row.days++;
        if (rule.enabled && day.minutes > rule.dailyMinutes) {
          row.dailyOvertimeMinutes += day.minutes - rule.dailyMinutes;
        }
        perWeek[day.weekKey] = (perWeek[day.weekKey] || 0) + day.minutes;
      });
      if (rule.enabled) {
        Object.keys(perWeek).forEach(function (weekKey) {
          if (perWeek[weekKey] > rule.weeklyMinutes) {
            row.weeklyOvertimeMinutes += perWeek[weekKey] - rule.weeklyMinutes;
          }
        });
        /* לא מחברים יומי ושבועי: שעה אחת אינה נוספת פעמיים.
           הגבוה מביניהם הוא מה שהחוק מכיר בו כשעות נוספות. */
        row.overtimeMinutes = Math.max(row.dailyOvertimeMinutes, row.weeklyOvertimeMinutes);
      }
    });

    return byEmployee;
  }

  /* שעות ודקות, לתצוגה. 512 דקות הן 8:32 ולא 8.53 – תלוש שכר
     מדבר בשעות ודקות, והמנהל משווה מול התלוש. */
  function formatMinutes(minutes) {
    var total = Math.max(0, Math.round(Number(minutes) || 0));
    return Math.floor(total / 60) + ':' + pad(total % 60);
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


  /* ===== העברת משמרת בין עובדים =====

     במסך "תצוגה לפי עובד" כל משמרת היא קובייה שאפשר לגרור. הצורך
     אינו אילוץ של עובד אלא החלטה של העסק: "את הבוקר בבאר שבע
     שייקח בן, ואת הבוקר בירושלים שייקח אור". עד היום זה דרש מעבר
     לתצוגת הסניפים, ביטול כאן והוספה שם – ארבע פעולות במקום גרירה
     אחת, וכל אחת מהן הזדמנות לטעות.

     הכללים כולם כאן ולא במסך, כי הם כללים של הנתונים ולא של
     הממשק – ואפשר לבדוק אותם בלי דפדפן.

     מה שמכוון את ההחלטות:
      · המשמרת שייכת ליום שלה. אין "לגרור משמרת ליום אחר" – זה
        לא אותה משמרת, זו משמרת אחרת שצריך לפתוח.
      · אותו אדם פעמיים באותה משמרת אינו שיבוץ, הוא טעות.
      · תא תפוס אינו חסימה אלא החלפה: זה בדיוק המהלך שביקשו.
      · אילוץ של עובד אינו חוסם גרירה. מנהל שגורר יודע מה הוא
        עושה, והבדיקות ממילא יסמנו את התא באדום. חסימה כאן הייתה
        הופכת "אני מחליט" ל"המערכת לא נותנת".
      · עובד מושבת כן חוסם: זו אינה החלטה, זו טעות. */

  /* מקומות פתוחים בשבוע: משמרת שדורשת אנשים ואין בה מספיק.
     זה מה שיושב בשטח ההמתנה שמעל הטבלה. */
  function openSlots(state, week) {
    var out = [];
    weekDemands(state, week).forEach(function (demand) {
      var assigned = getAssigned(week, demand.dayIdx, demand.branchId, demand.shiftId);
      var missing = demand.need - assigned.length;
      if (missing > 0) {
        out.push({
          dayIdx: demand.dayIdx, branchId: demand.branchId, shiftId: demand.shiftId,
          need: demand.need, assigned: assigned.length, missing: missing
        });
      }
    });
    return out;
  }

  /* סימון שיבוץ כידני, כדי שבנייה חוזרת לא תדרוס אותו */
  function markManual(week, dayIdx, branchId, shiftId) {
    if (!week.manual) week.manual = {};
    week.manual[slotKey(dayIdx, branchId, shiftId)] = true;
  }

  /* move = { dayIdx, branchId, shiftId, from, to }
       from  מי נמצא שם עכשיו, או null אם המשמרת הגיעה משטח ההמתנה
       to    למי היא עוברת, או null אם היא חוזרת לשטח ההמתנה

     מחזיר { ok: true, kind } או { ok: false, reason }. אינו זורק:
     גרירה שאינה חוקית היא אירוע רגיל בממשק, לא תקלה. */
  function moveShift(state, week, move) {
    var spec = move || {};
    var dayIdx = Number(spec.dayIdx);
    var branchId = spec.branchId;
    var shiftId = spec.shiftId;
    var from = spec.from || null;
    var to = spec.to || null;

    if (!(dayIdx >= 0 && dayIdx < 7) || !branchId || !shiftId) {
      return { ok: false, reason: 'bad-slot' };
    }
    if (!from && !to) return { ok: false, reason: 'nothing-to-do' };
    if (from && from === to) return { ok: true, kind: 'none' };

    var here = getAssigned(week, dayIdx, branchId, shiftId).slice();
    /* המסך אולי מציג מצב ישן – חבר צוות אחר הזיז בינתיים */
    if (from && here.indexOf(from) === -1) return { ok: false, reason: 'stale' };
    if (to && here.indexOf(to) !== -1) return { ok: false, reason: 'already-here' };

    /* שחרור לשטח ההמתנה: המשמרת נשארת, פשוט אין בה אף אחד */
    if (!to) {
      setAssigned(week, dayIdx, branchId, shiftId,
        here.filter(function (id) { return id !== from; }));
      markManual(week, dayIdx, branchId, shiftId);
      return { ok: true, kind: 'release' };
    }

    var target = byId(state.employees, to);
    if (!target) return { ok: false, reason: 'no-employee' };
    if (!target.active) return { ok: false, reason: 'inactive' };

    var busy = employeeDayAssignments(state, week, to, dayIdx);
    var onePerDay = !!(state.settings && state.settings.onePerDay);

    if (busy.length && onePerDay) {
      /* תא תפוס והכלל "משמרת אחת ביום" דלוק. החלפה היא המהלך
         הנכון, והיא אפשרית רק כשיש למי להחזיר וכשיש רק משמרת
         אחת להחליף איתה. */
      if (!from) return { ok: false, reason: 'target-busy' };
      if (busy.length > 1) return { ok: false, reason: 'target-busy' };

      var other = busy[0];
      var otherList = getAssigned(week, dayIdx, other.branchId, other.shiftId).slice();
      setAssigned(week, dayIdx, other.branchId, other.shiftId,
        otherList.map(function (id) { return id === to ? from : id; }));
      setAssigned(week, dayIdx, branchId, shiftId,
        here.map(function (id) { return id === from ? to : id; }));
      markManual(week, dayIdx, branchId, shiftId);
      markManual(week, dayIdx, other.branchId, other.shiftId);
      return {
        ok: true, kind: 'swap',
        swappedWith: { branchId: other.branchId, shiftId: other.shiftId }
      };
    }

    if (from) {
      setAssigned(week, dayIdx, branchId, shiftId,
        here.map(function (id) { return id === from ? to : id; }));
    } else {
      setAssigned(week, dayIdx, branchId, shiftId, here.concat([to]));
    }
    markManual(week, dayIdx, branchId, shiftId);
    return { ok: true, kind: from ? 'move' : 'fill' };
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

  /* ===================== תפקידים =====================

     עסק אינו צריך רק "שלושה אנשים במשמרת" אלא "קופאי, סדרן
     ומטבח". בית קפה מגדיר שתי משמרות בוקר – אחת למטבח מ-08:00
     ואחת לשירות מ-12:00 – וכל אחת מחפשת את התפקיד שלה.

     שני כללים, ושניהם פתוחים לרווחה בכוונה:
       · משמרת בלי תפקיד – כל אחד מתאים לה.
       · עובד בלי תפקיד – מתאים לכל משמרת.

     כך כל עסק שקיים היום ממשיך לעבוד בלי שנגענו בו, ומי שלא
     צריך תפקידים לא יודע שהם קיימים. */

  function roles(state) {
    var list = (state && state.settings && state.settings.roles) || [];
    return Array.isArray(list) ? list : [];
  }

  function roleById(state, roleId) {
    return byId(roles(state), roleId);
  }

  function roleName(state, roleId) {
    var role = roleById(state, roleId);
    return role ? role.name : '';
  }

  function roleColor(state, roleId) {
    var role = roleById(state, roleId);
    return role && typeof role.color === 'number' ? role.color : 0;
  }

  /* תמהיל התפקידים של המשמרת: כמה אנשים נדרשים בכל תפקיד.

     משמרת בוקר בבית קפה אינה "שלושה אנשים" אלא "מטבח אחד, מלצר
     אחד, וברמן אחד". לכן המשמרת מחזיקה מפה של תפקיד → כמות,
     וכמות האנשים הכוללת (need) היא הסכום שלה ועוד מקומות פתוחים
     שכל אחד מתאים להם.

     מחזיר רשימת שורות: [{ role: 'r1', count: 2 }, { role: '', count: 1 }].
     השורה הריקה בסוף היא המקומות הפתוחים. תפקיד שנמחק מההגדרות
     נחשב כאילו אינו – אחרת משמרת הייתה נשארת לנצח בלי מועמדים,
     בלי שאיש יבין למה. */
  function slotRoleNeeds(state, branch, dayIdx, shiftId) {
    var config = slotConfig(branch, dayIdx, shiftId);
    if (!config) return [];
    return roleNeedsOf(state, config, Number(config.need) || 0);
  }

  /* אותו חישוב, ישירות על הגדרת המשמרת. נפרד כדי שגם מסכים
     שמחזיקים config ביד יוכלו לשאול בלי לחפש את הסניף. */
  function roleNeedsOf(state, config, need) {
    var lines = [];
    var used = 0;
    var map = (config && config.roles) || {};

    /* הסדר הוא סדר ההגדרות, כדי שהתצוגה תהיה יציבה בין מסכים */
    roles(state).forEach(function (role) {
      var count = Math.max(0, Math.floor(Number(map[role.id]) || 0));
      if (!count) return;
      /* לא מבקשים יותר אנשים ממה שהמשמרת פתחה */
      count = Math.min(count, Math.max(0, need - used));
      if (!count) return;
      used += count;
      lines.push({ role: role.id, count: count });
    });

    var open = Math.max(0, need - used);
    if (open) lines.push({ role: '', count: open });
    return lines;
  }

  /* כמה אנשים מבוקשים בתפקיד מסוים במשמרת הזו */
  function slotRoleCount(state, config, roleId) {
    var map = (config && config.roles) || {};
    return Math.max(0, Math.floor(Number(map[roleId]) || 0));
  }

  /* סכום כל התפקידים שסומנו במשמרת. מתעלם מתפקידים שנמחקו. */
  function slotRoleTotal(state, config) {
    var map = (config && config.roles) || {};
    var sum = 0;
    roles(state).forEach(function (role) {
      sum += Math.max(0, Math.floor(Number(map[role.id]) || 0));
    });
    return sum;
  }

  /* כתיבת כמות לתפקיד במשמרת.

     סך האנשים במשמרת זז יחד עם השינוי, כך שמספר המקומות הפתוחים
     נשאר כפי שהיה: מי שביקש "עוד מלצר" ביקש עוד אדם, ולא לקחת
     אותו ממישהו אחר. הפונקציה מחזירה את הכמות שנרשמה בפועל. */
  function setSlotRoleCount(state, branch, dayIdx, shiftId, roleId, count) {
    var day = (branch.schedule || {})[dayIdx];
    var config = day && day[shiftId];
    if (!config || !roleById(state, roleId)) return 0;
    if (!config.roles) config.roles = {};

    var before = slotRoleCount(state, config, roleId);
    var next = Math.max(0, Math.floor(Number(count) || 0));
    var need = Math.max(0, Number(config.need) || 0);

    config.need = Math.max(0, need + (next - before));
    if (next) config.roles[roleId] = next;
    else delete config.roles[roleId];
    /* מפה ריקה היא רעש בייצוא ובשמירה */
    if (!Object.keys(config.roles).length) delete config.roles;
    return next;
  }

  /* אילו מקומות במשמרת עוד פתוחים, אחרי שחלק מהאנשים כבר שובצו
     בה ידנית.

     זו אינה ספירה פשוטה. אם המשמרת מבקשת מטבח אחד ומלצר אחד,
     והמנהל שיבץ ידנית מישהו שמסומן בשני התפקידים, השאלה "איזה
     מקום הוא תפס" קובעת אם נשאר לחפש מטבח או מלצר. תשובה חמדנית
     תיתן לו את המקום הראשון שמתאים, ולפעמים תשאיר מקום שאי אפשר
     לאייש למרות שיש פתרון.

     לכן זו התאמה מקסימלית בגרף דו-צדדי (אלגוריתם קון): כל עובד
     ששובץ נבדק מול כל המקומות, ומסלול משפר מזיז שיבוצים קודמים
     כדי לפנות מקום. התוצאה היא המספר הקטן ביותר של מקומות
     שנותרו – כלומר לא נמציא חוסר שאינו קיים.

     המקומות מסודרים כך שתפקידים ספציפיים קודמים למקום הפתוח,
     ולכן מי שמתאים לשניהם ייקח קודם את הספציפי. */
  function openSeats(state, roleNeeds, assignedIds) {
    var seats = [];
    (roleNeeds || []).forEach(function (line) {
      for (var i = 0; i < line.count; i++) seats.push(line.role);
    });
    if (!seats.length || !assignedIds || !assignedIds.length) return seats;

    var people = [];
    assignedIds.forEach(function (empId) {
      var emp = byId(state.employees || [], empId);
      if (emp) people.push(emp);
    });
    if (!people.length) return seats;

    var seatOwner = seats.map(function () { return -1; });

    function seat(personIdx, visited) {
      for (var i = 0; i < seats.length; i++) {
        if (visited[i]) continue;
        if (!employeeFitsRole(state, people[personIdx], seats[i])) continue;
        visited[i] = true;
        if (seatOwner[i] === -1 || seat(seatOwner[i], visited)) {
          seatOwner[i] = personIdx;
          return true;
        }
      }
      return false;
    }

    for (var p = 0; p < people.length; p++) { seat(p, seats.map(function () { return false; })); }

    var left = [];
    seats.forEach(function (role, i) { if (seatOwner[i] === -1) left.push(role); });
    return left;
  }

  /* האם העובד מתאים לפחות לאחת משורות התפקיד של המשמרת */
  function employeeFitsSlot(state, emp, roleNeeds) {
    if (!roleNeeds || !roleNeeds.length) return true;
    return roleNeeds.some(function (line) {
      return employeeFitsRole(state, emp, line.role);
    });
  }

  function employeeRoles(emp) {
    var list = (emp && emp.roles) || [];
    return Array.isArray(list) ? list : [];
  }

  /* האם העובד מתאים לתפקיד שהמשמרת מחפשת */
  function employeeFitsRole(state, emp, roleId) {
    if (!roleId) return true;                 // המשמרת אינה מחפשת תפקיד
    var list = employeeRoles(emp);
    if (!list.length) return true;            // העובד לא סומן, ולכן מתאים להכל
    return list.indexOf(roleId) !== -1;
  }

  /* מי מתאים למשמרת הזו מבחינת תפקיד בלבד. שאר התנאים – זמינות,
     סניף, אילוצים – נבדקים במנוע. */
  function employeesForRole(state, roleId) {
    return (state.employees || []).filter(function (emp) {
      return emp.active && employeeFitsRole(state, emp, roleId);
    });
  }

  /* הסרת תפקיד מההגדרות: מנקה אותו גם מכרטיסי העובדים וגם
     מלוחות הסניפים, כדי שלא יישארו הפניות למשהו שאינו קיים.

     מספר האנשים במשמרת אינו משתנה. מנהל שמוחק את "מלצר" לא אמר
     שהוא צריך פחות אנשים במשמרת, אלא שהתפקיד הזה כבר לא קיים –
     ולכן המקומות שהיו שמורים לו נפתחים לכולם. */
  function removeRole(state, roleId) {
    var removed = { employees: 0, slots: 0 };
    state.settings.roles = roles(state).filter(function (role) {
      return role.id !== roleId;
    });
    (state.employees || []).forEach(function (emp) {
      var list = employeeRoles(emp);
      if (list.indexOf(roleId) === -1) return;
      emp.roles = list.filter(function (id) { return id !== roleId; });
      removed.employees++;
    });
    (state.branches || []).forEach(function (branch) {
      Object.keys(branch.schedule || {}).forEach(function (day) {
        var dayMap = branch.schedule[day] || {};
        Object.keys(dayMap).forEach(function (shiftId) {
          var config = dayMap[shiftId];
          if (!config || !config.roles || !config.roles[roleId]) return;
          delete config.roles[roleId];
          if (!Object.keys(config.roles).length) delete config.roles;
          removed.slots++;
        });
      });
    });
    return removed;
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
          if (need > 0) {
            demands.push({
              dayIdx: day, branchId: branch.id, shiftId: shiftId, need: need,
              /* תמהיל התפקידים: כמה אנשים בכל תפקיד, ומה נשאר פתוח */
              roleNeeds: slotRoleNeeds(state, branch, day, shiftId)
            });
          }
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
        if (!employeeFitsSlot(state, emp, slotRoleNeeds(state, branch, dayIdx, shiftId))) return false;
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
      max: Math.max(1, Math.round(max)),
      /* ברירת המחדל היא שכן. ערך שאינו מוגדר כלל – עסק שנפתח
         לפני שההגדרה הייתה קיימת – מקבל את ברירת המחדל ולא
         "לא", אחרת שינוי גרסה היה משנה בשקט את המשמעות של
         התקרה אצל לקוחות קיימים. */
      countPreferences: value.countPreferences === undefined
        ? (defaults.countPreferences !== false)
        : !!value.countPreferences
    };
  }

  /* ===== מה עובד רואה מלבד עצמו =====

     ברירת המחדל היא שרואים רק את עצמך. מנהל שרוצה צוות שמתאם
     ביניהו מדליק, וזה חל על כל העובדים בעסק.

     ערך שאינו מוגדר כלל — עסק שנפתח לפני שההגדרה קיימת — מקבל
     סגור. שינוי גרסה לא אמור לפתוח בשקט את הסידור של כולם
     לכולם אצל לקוח קיים. */
  function teamVisibility(state) {
    var value = (state && state.settings && state.settings.teamVisibility) || {};
    return { shifts: value.shifts === true };
  }

  /* כל מי שעובד באותו יום, לפי סניף ומשמרת.

     מחזיר גם את העובד עצמו: המסך מסמן אותו, ולא משמיט אותו —
     רשימה שבה כולם חוץ ממך היא רשימה שקשה להבין בה מה מקומך. */
  function dayRoster(state, week, dayIdx) {
    var out = [];
    (state.branches || []).forEach(function (branch) {
      shiftIds(state).forEach(function (shiftId) {
        var list = getAssigned(week, dayIdx, branch.id, shiftId);
        if (!list.length) return;
        out.push({
          branchId: branch.id,
          shiftId: shiftId,
          /* שמות בלבד. מזהה מוחזר כדי שהמסך יסמן "זה אני",
             ושום שדה אחר מכרטיס העובד אינו עובר כאן. */
          people: list.map(function (id) {
            var emp = byId(state.employees || [], id) || {};
            return { id: id, name: emp.name || '' };
          })
        });
      });
    });
    return out;
  }

  /* האם הרשומה מגבילה זמינות בפועל. בקשה שנדחתה אינה מגבילה
     דבר, ולכן היא משחררת מקום. */
  function limitsAvailability(record) {
    if (!record) return false;
    if (constraintStatus(record) === CONSTRAINT_STATUS.REJECTED) return false;
    if (record.off) return true;
    return Object.keys(record.blocked || {}).length > 0;
  }

  /* העדפה: לא יכול/ה אינה העדפה, ולכן נבדק כאן רק preferred */
  function isPreference(record) {
    if (!record) return false;
    if (constraintStatus(record) === CONSTRAINT_STATUS.REJECTED) return false;
    return Object.keys(record.preferred || {}).length > 0;
  }

  /* האם הבקשה הזו נספרת בתקרה, לפי ההגדרה של העסק.

     שתי תשובות לגיטימיות לאותה שאלה, ולכן זו הגדרה ולא החלטה
     שלנו: יש מנהל שרוצה לראות בדיוק את מספר הבקשות שהגביל, ויש
     מנהל שרוצה שהעדפות יזרמו בחופשיות כי הן מידע ולא הגבלה. */
  function countsTowardLimit(state, record) {
    if (limitsAvailability(record)) return true;
    if (!constraintLimitSettings(state).countPreferences) return false;
    return isPreference(record);
  }

  /* כמה בקשות נספרות כבר יש לעובד בשבוע. exceptDay מוחרג, כדי
     שעריכה של יום קיים לא תיספר פעמיים. */
  function countCountedConstraints(state, week, empId, exceptDay) {
    var records = (week && week.constraints) || {};
    var prefix = empId + '|';
    var count = 0;
    Object.keys(records).forEach(function (key) {
      if (key.indexOf(prefix) !== 0) return;
      var dayIdx = Number(key.slice(prefix.length));
      if (exceptDay !== undefined && exceptDay !== null && dayIdx === Number(exceptDay)) return;
      if (countsTowardLimit(state, records[key])) count++;
    });
    return count;
  }

  /* הספירה הישנה, של בקשות שמגבילות זמינות בלבד. נשארת כי היא
     עדיין השאלה הנכונה במקומות שאינם התקרה. */
  function countLimitingConstraints(week, empId, exceptDay) {
    return countCountedConstraints({ settings: { constraintLimit: { countPreferences: false } } },
      week, empId, exceptDay);
  }

  /* כמה עוד מותר לו. null כשאין תקרה. */
  function constraintsLeft(state, week, empId) {
    var config = constraintLimitSettings(state);
    if (!config.enabled) return null;
    return Math.max(0, config.max - countCountedConstraints(state, week, empId));
  }

  /* האם ההגשה הזו חורגת מהתקרה. next הוא האילוץ שעומד להישמר
     (או null למחיקה), ולכן מחיקה לעולם אינה חורגת. */
  function overConstraintLimit(state, week, empId, dayIdx, next) {
    var config = constraintLimitSettings(state);
    if (!config.enabled) return false;
    if (!countsTowardLimit(state, next)) return false;   // אינה נספרת, או מחיקה
    return countCountedConstraints(state, week, empId, dayIdx) >= config.max;
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
       כולם בכוונה. */
    if (!Array.isArray(state.branches)) state.branches = [];
    if (!Array.isArray(state.employees)) state.employees = [];
    if (!state.weeks || typeof state.weeks !== 'object') state.weeks = {};
    /* תפקידים הם תוספת. עסק קיים ממשיך בלעדיהם: רשימה ריקה
       פירושה "אין תפקידים", וזה בדיוק המצב שהיה עד עכשיו. */
    if (!Array.isArray(state.settings.roles)) state.settings.roles = [];
    var knownRoles = {};
    state.settings.roles.forEach(function (role, index) {
      if (typeof role.color !== 'number') role.color = index % Data.SHIFT_COLORS.length;
      knownRoles[role.id] = true;
    });

    var knownShifts = {};
    shiftIds(state).forEach(function (id) { knownShifts[id] = true; });

    state.employees.forEach(function (emp) {
      if (!Array.isArray(emp.branches)) emp.branches = [];
      if (!Array.isArray(emp.shifts)) emp.shifts = Data.ALL_SHIFT_IDS.slice();
      /* תפקיד שנמחק מההגדרות אינו נשאר תלוי על כרטיס העובד */
      if (!Array.isArray(emp.roles)) emp.roles = [];
      else emp.roles = emp.roles.filter(function (id) { return knownRoles[id]; });
      if (typeof emp.maxShifts !== 'number') emp.maxShifts = 6;
      /* הסדר קבוע: רק ימים אמיתיים ורק משמרות שקיימות בעסק.
         משמרת שנמחקה מההגדרות לא תחסום לנצח יום שאיש לא מבין. */
      if (emp.standing && typeof emp.standing === 'object') {
        Object.keys(emp.standing).forEach(function (key) {
          var dayIdx = Number(key);
          var day = emp.standing[key];
          if (!(dayIdx >= 0 && dayIdx <= 6) || !day || typeof day !== 'object') {
            delete emp.standing[key];
            return;
          }
          if (day.off) { emp.standing[key] = { off: true }; return; }
          var blocked = {};
          Object.keys(day.blocked || {}).forEach(function (shiftId) {
            if (day.blocked[shiftId] && knownShifts[shiftId]) blocked[shiftId] = true;
          });
          if (Object.keys(blocked).length) emp.standing[key] = { blocked: blocked };
          else delete emp.standing[key];
        });
        if (!Object.keys(emp.standing).length) delete emp.standing;
      } else if (emp.standing !== undefined) {
        delete emp.standing;
      }
      /* מחזור פגום או מחזור על עובד בלי הסדר קבוע אינו נשאר
         תלוי: הוא היה משנה התנהגות בלי שיהיה לו מה להחיל. */
      if (emp.standingCycle && (!standingCycle(emp) || !hasStanding(emp))) {
        delete emp.standingCycle;
      }
      /* כתובת מייל אופציונלית על הכרטיס. היא לא נדרשת לשיבוץ,
         אבל היא מה שמבדיל בין שני עובדים עם שם דומה בייבוא. */
      if (typeof emp.email !== 'string') emp.email = '';
      /* טלפון: לא נדרש לשיבוץ, אבל מנהל שצריך לתפוס מישהו
         בבוקר של משמרת שנפלה מחפש אותו בדיוק כאן. */
      if (typeof emp.phone !== 'string') emp.phone = '';
      if (typeof emp.active !== 'boolean') emp.active = true;
    });
    state.branches.forEach(function (branch) {
      if (typeof branch.active !== 'boolean') branch.active = true;
      if (!branch.schedule) { branch.schedule = legacySchedule(branch, legacyDayShifts); }
      normalizeSchedule(branch.schedule);
      delete branch.need;
      Object.keys(branch.schedule).forEach(function (day) {
        var dayMap = branch.schedule[day] || {};
        Object.keys(dayMap).forEach(function (shiftId) {
          var config = dayMap[shiftId];
          if (!config) return;
          /* פעם המשמרת החזיקה תפקיד אחד, ומשמעותו הייתה שכל
             האנשים בה חייבים להיות בתפקיד הזה. אותה כוונה בדיוק
             נכתבת היום כתמהיל. */
          if (config.role) {
            if (!config.roles) config.roles = {};
            if (!config.roles[config.role]) {
              config.roles[config.role] = Math.max(1, Number(config.need) || 1);
            }
            delete config.role;
          }
          if (!config.roles) return;
          /* תפקיד שנמחק מההגדרות אינו נשאר תלוי על המשמרת */
          Object.keys(config.roles).forEach(function (roleId) {
            var count = Math.max(0, Math.floor(Number(config.roles[roleId]) || 0));
            if (!knownRoles[roleId] || !count) delete config.roles[roleId];
            else config.roles[roleId] = count;
          });
          if (!Object.keys(config.roles).length) delete config.roles;
        });
      });
    });
    Object.keys(state.weeks).forEach(function (key) {
      var weekData = state.weeks[key];
      if (typeof weekData.shabbatEnd !== 'string') weekData.shabbatEnd = '';
      if (!weekData.holidays || typeof weekData.holidays !== 'object') weekData.holidays = {};
      if (typeof weekData.published !== 'boolean') weekData.published = false;
      if (typeof weekData.publishedSignature !== 'string') weekData.publishedSignature = '';
      /* דיווחי שעון. שבוע ישן אינו נושא אותם, ורשימה פגומה
         מתאפסת ולא מפילה את המסך: דיווח בלי מזהה או בלי זמן
         אינו נתון, והוא גם לא יהפוך לשעות. */
      if (!Array.isArray(weekData.punches)) weekData.punches = [];
      else {
        weekData.punches = weekData.punches.filter(function (punch) {
          return punch && punch.empId && punch.at && !isNaN(Date.parse(punch.at));
        });
        sortPunches(weekData.punches);
      }
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
  /* מחזיר גם weeks: אילו שבועות נגעו בהם. מי שקורא חייב לשמור
     אותם, אחרת השינוי קיים בזיכרון בלבד וחוזר ברענון הבא. */
  function removeShift(state, shiftId) {
    var removed = { slots: 0, employees: 0, assignments: 0, weeks: [] };
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
      var changed = false;
      Object.keys(week.assignments || {}).forEach(function (key) {
        if (key.split('|')[2] === shiftId) {
          delete week.assignments[key];
          removed.assignments++;
          changed = true;
        }
      });
      Object.keys(week.constraints || {}).forEach(function (key) {
        var record = week.constraints[key];
        if (record.blocked && record.blocked[shiftId]) {
          delete record.blocked[shiftId];
          changed = true;
        }
        if (record.preferred && record.preferred[shiftId]) {
          delete record.preferred[shiftId];
          changed = true;
        }
      });
      if (changed) removed.weeks.push(weekKey);
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
    teamVisibility: teamVisibility, dayRoster: dayRoster,
    countsTowardLimit: countsTowardLimit, isPreference: isPreference,
    countCountedConstraints: countCountedConstraints,
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
    restRule: restRule,
    restGapMinutes: restGapMinutes,
    breaksRest: breaksRest,
    DEFAULT_REST_MINUTES: DEFAULT_REST_MINUTES,
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
    LEAVE: LEAVE,
    LEAVE_MAX_DAYS: LEAVE_MAX_DAYS,
    leaveDays: leaveDays,
    leaveRecord: leaveRecord,
    leaveRequests: leaveRequests,
    leaveOf: leaveOf,
    setLeave: setLeave,
    leaveSummary: leaveSummary,
    PUNCH: PUNCH,
    PUNCH_SRC: PUNCH_SRC,
    addPunch: addPunch,
    removePunch: removePunch,
    punchList: punchList,
    punchesOf: punchesOf,
    punchState: punchState,
    punchSessions: punchSessions,
    punchTarget: punchTarget,
    timeclock: timeclock,
    allowsPhonePunch: allowsPhonePunch,
    clockIdOf: clockIdOf,
    payrollIdOf: payrollIdOf,
    payrollSummary: payrollSummary,
    payrollPunches: payrollPunches,
    decimalHours: decimalHours,
    nextClockId: nextClockId,
    assignClockIds: assignClockIds,
    employeeByClockId: employeeByClockId,
    overtimeRule: overtimeRule,
    plannedMinutes: plannedMinutes,
    shiftLengthMinutes: shiftLengthMinutes,
    monthlyReport: monthlyReport,
    formatMinutes: formatMinutes,
    weekKeysForMonth: weekKeysForMonth,
    monthKeyOf: monthKeyOf,
    standingFor: standingFor,
    standingBlocks: standingBlocks,
    hasStanding: hasStanding,
    setStanding: setStanding,
    standingCycle: standingCycle,
    standingAppliesTo: standingAppliesTo,
    setStandingCycle: setStandingCycle,
    weeksBetween: weeksBetween,
    weekKeyOf: weekKeyOf,
    effectiveConstraint: effectiveConstraint,
    constraintStatus: constraintStatus,
    setConstraintStatus: setConstraintStatus,
    pendingConstraints: pendingConstraints,
    emptyConstraint: emptyConstraint,
    CONSTRAINT_STATUS: CONSTRAINT_STATUS,
    setConstraint: setConstraint,
    getAssigned: getAssigned,
    setAssigned: setAssigned,
    employeeDayAssignments: employeeDayAssignments,
    openSlots: openSlots, moveShift: moveShift, markManual: markManual,
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
    roles: roles,
    roleById: roleById,
    roleName: roleName,
    roleColor: roleColor,
    slotRoleNeeds: slotRoleNeeds,
    roleNeedsOf: roleNeedsOf,
    slotRoleCount: slotRoleCount,
    slotRoleTotal: slotRoleTotal,
    setSlotRoleCount: setSlotRoleCount,
    employeeFitsSlot: employeeFitsSlot,
    openSeats: openSeats,
    employeeRoles: employeeRoles,
    employeeFitsRole: employeeFitsRole,
    employeesForRole: employeesForRole,
    removeRole: removeRole,
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
