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

  var SHIFTS = [
    { id: 'morning', name: 'בוקר' },
    { id: 'middle', name: 'אמצע' },
    { id: 'evening', name: 'ערב' }
  ];

  var ALL_SHIFT_IDS = ['morning', 'middle', 'evening'];

  /* מוצ״ש: ההתחלה נגזרת משעת צאת השבת של אותו שבוע ועד 23:00 */
  var MOTZASH = { dayIdx: 6, offsetMinutes: 30, defaultEnd: '23:00' };

  /* תבנית ברירת מחדל לסניף חדש: ימים, שעות וכמות עובדים בכל משמרת */
  function defaultSchedule() {
    var schedule = {};
    [0, 1, 2, 3, 4].forEach(function (day) {
      schedule[day] = {
        morning: { need: 1, from: '09:00', to: '14:00' },
        middle: { need: 1, from: '13:00', to: '17:30' },
        evening: { need: 1, from: '17:00', to: '22:00' }
      };
    });
    schedule[5] = { // שישי – שני עובדים בבוקר וסגירה מוקדמת
      morning: { need: 2, from: '09:00', to: '14:30' }
    };
    schedule[6] = { // מוצ״ש – חצי שעה מצאת שבת עד 23:00
      evening: { need: 1, auto: 'motzash', to: MOTZASH.defaultEnd }
    };
    return schedule;
  }

  /* סניפים מוגדרים מראש – ניתנים לעריכה במסך "סניפים" */
  function defaultBranches() {
    return [
      { id: 'br-center', name: 'מייפון מרכז', active: true, schedule: defaultSchedule() },
      { id: 'br-north', name: 'מייפון צפון', active: true, schedule: defaultSchedule() },
      { id: 'br-south', name: 'מייפון דרום', active: true, schedule: defaultSchedule() }
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
    defaultShabbatEnd: '20:00'
  };

  var API = {
    DAYS: DAYS,
    SHIFTS: SHIFTS,
    ALL_SHIFT_IDS: ALL_SHIFT_IDS,
    MOTZASH: MOTZASH,
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
