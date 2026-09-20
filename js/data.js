/* נתוני בסיס: ימים, משמרות, סניפים ועובדים מוגדרים מראש */
(function (root) {
  'use strict';

  var DAYS = [
    { idx: 0, name: 'ראשון', short: "א'" },
    { idx: 1, name: 'שני', short: "ב'" },
    { idx: 2, name: 'שלישי', short: "ג'" },
    { idx: 3, name: 'רביעי', short: "ד'" },
    { idx: 4, name: 'חמישי', short: "ה'" },
    { idx: 5, name: 'שישי', short: "ו'" },
    { idx: 6, name: 'מוצ״ש', short: "ש'" }
  ];

  /* לוח צבעים קבוע למשמרות. כל עסק בוחר מתוכו, וכך הצבעים נשארים
     תקינים גם במצב כהה ובייצוא לאקסל. */
  var SHIFT_COLORS = [
    { id: 0, name: 'חמרה' },
    { id: 1, name: 'ירוק' },
    { id: 2, name: 'כחול' },
    { id: 3, name: 'סגול' },
    { id: 4, name: 'ורוד' },
    { id: 5, name: 'טורקיז' },
    { id: 6, name: 'אפור' },
    { id: 7, name: 'חום' }
  ];

  /* משמרות ברירת המחדל לעסק חדש. מכאן ואילך כל עסק מגדיר לעצמו. */
  var DEFAULT_SHIFTS = [
    { id: 'morning', name: 'בוקר', from: '09:30', to: '16:00', color: 0 },
    { id: 'middle', name: 'אמצע', from: '12:30', to: '20:00', color: 1 },
    { id: 'evening', name: 'ערב', from: '15:00', to: '22:00', color: 2 }
  ];

  /* נשמר לתאימות לאחור בקוד שעדיין לא עודכן */
  var SHIFTS = DEFAULT_SHIFTS;
  var ALL_SHIFT_IDS = DEFAULT_SHIFTS.map(function (shift) { return shift.id; });

  /* מוצ״ש: ההתחלה נגזרת משעת צאת השבת של אותו שבוע ועד 23:00 */
  var MOTZASH = { dayIdx: 6, offsetMinutes: 30, defaultEnd: '23:00' };

  /* שעות ברירת המחדל, נגזרות מרשימת המשמרות */
  var DEFAULT_HOURS = (function () {
    var map = {};
    DEFAULT_SHIFTS.forEach(function (shift) { map[shift.id] = { from: shift.from, to: shift.to }; });
    return map;
  })();

  /* שישי מקוצר – מתחיל כמו הבוקר הרגיל ונסגר לפני שבת */
  var DEFAULT_FRIDAY = { from: '09:30', to: '14:30' };

  /* ימי חול רגילים, שבהם חלות שעות ברירת המחדל */
  var WEEKDAYS = [0, 1, 2, 3, 4];

  function hoursOf(source, shiftId) {
    var hours = (source || {})[shiftId] || DEFAULT_HOURS[shiftId];
    return { from: hours.from, to: hours.to };
  }

  /* תבנית ברירת מחדל לסניף חדש: ימים, שעות וכמות עובדים בכל משמרת */
  /* shifts – רשימת המשמרות של העסק. hours – דריסת שעות אופציונלית. */
  function defaultSchedule(hours, shifts) {
    var list = shifts && shifts.length ? shifts : DEFAULT_SHIFTS;
    var schedule = {};

    WEEKDAYS.forEach(function (day) {
      schedule[day] = {};
      list.forEach(function (shift) {
        var range = (hours && hours[shift.id]) || { from: shift.from, to: shift.to };
        schedule[day][shift.id] = { need: 1, from: range.from, to: range.to };
      });
    });

    var first = list[0];
    var last = list[list.length - 1];

    schedule[5] = {};   // שישי – המשמרת הראשונה בלבד, מקוצרת
    if (first) {
      schedule[5][first.id] = { need: 2, from: DEFAULT_FRIDAY.from, to: DEFAULT_FRIDAY.to };
    }

    schedule[6] = {};   // מוצ״ש – המשמרת האחרונה, לפי צאת שבת
    if (last) {
      schedule[6][last.id] = { need: 1, auto: 'motzash', to: MOTZASH.defaultEnd };
    }
    return schedule;
  }

  /* סניפים מוגדרים מראש – ניתנים לעריכה במסך "סניפים" */
  function defaultBranches(hours, shifts) {
    return [
      { id: 'br-center', name: 'סניף מרכז', active: true, schedule: defaultSchedule(hours, shifts) },
      { id: 'br-north', name: 'סניף צפון', active: true, schedule: defaultSchedule(hours, shifts) },
      { id: 'br-south', name: 'סניף דרום', active: true, schedule: defaultSchedule(hours, shifts) }
    ];
  }

  /* עובדים מוגדרים מראש – ניתנים לעריכה במסך "עובדים" */
  var DEFAULT_EMPLOYEES = [
    { id: 'emp-1', name: 'עובד/ת 1', active: true, branches: ['br-center'], shifts: ALL_SHIFT_IDS.slice(), maxShifts: 6, note: '' },
    { id: 'emp-2', name: 'עובד/ת 2', active: true, branches: ['br-center', 'br-north'], shifts: ALL_SHIFT_IDS.slice(), maxShifts: 6, note: '' },
    { id: 'emp-3', name: 'עובד/ת 3', active: true, branches: ['br-north'], shifts: ALL_SHIFT_IDS.slice(), maxShifts: 5, note: '' },
    { id: 'emp-4', name: 'עובד/ת 4', active: true, branches: ['br-north', 'br-south'], shifts: ALL_SHIFT_IDS.slice(), maxShifts: 6, note: '' },
    { id: 'emp-5', name: 'עובד/ת 5', active: true, branches: ['br-south'], shifts: ALL_SHIFT_IDS.slice(), maxShifts: 5, note: '' },
    { id: 'emp-6', name: 'עובד/ת 6', active: true, branches: ['br-center', 'br-south'], shifts: ALL_SHIFT_IDS.slice(), maxShifts: 6, note: '' },
    { id: 'emp-7', name: 'עובד/ת 7', active: true, branches: [], shifts: ALL_SHIFT_IDS.slice(), maxShifts: 6, note: 'מחליף/ה בכל הסניפים' },
    { id: 'emp-8', name: 'עובד/ת 8', active: true, branches: [], shifts: ['middle', 'evening'], maxShifts: 4, note: 'סטודנט/ית – ללא בקרים' }
  ];

  var DEFAULT_SETTINGS = {
    onePerDay: true,          // עובד משובץ למשמרת אחת ביום לכל היותר
    restEveningMorning: true, // אין בוקר אחרי ערב של היום הקודם
    oneDayOffPerWeek: true,   // יום החופש שסומן באילוצים הוא יום החופש היחיד בשבוע
    shifts: DEFAULT_SHIFTS.map(function (shift) {
      return { id: shift.id, name: shift.name, from: shift.from, to: shift.to, color: shift.color };
    }),
    defaultShabbatEnd: '20:00'
  };

  var API = {
    DAYS: DAYS,
    SHIFTS: SHIFTS,
    ALL_SHIFT_IDS: ALL_SHIFT_IDS,
    MOTZASH: MOTZASH,
    SHIFT_COLORS: SHIFT_COLORS,
    DEFAULT_SHIFTS: DEFAULT_SHIFTS,
    DEFAULT_HOURS: DEFAULT_HOURS,
    DEFAULT_FRIDAY: DEFAULT_FRIDAY,
    WEEKDAYS: WEEKDAYS,
    defaultSchedule: defaultSchedule,
    defaultBranches: defaultBranches,
    DEFAULT_EMPLOYEES: DEFAULT_EMPLOYEES,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    shiftById: function (id) {
      for (var i = 0; i < SHIFTS.length; i++) { if (SHIFTS[i].id === id) return SHIFTS[i]; }
      return null;
    }
  };

  root.ShiftData = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
