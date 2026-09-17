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
    { idx: 6, name: 'שבת', short: "ש'" }
  ];

  var SHIFTS = [
    { id: 'morning', name: 'בוקר', hours: '09:00-14:00', color: '#f6c453' },
    { id: 'middle', name: 'אמצע', hours: '13:00-17:30', color: '#7ec8a9' },
    { id: 'evening', name: 'ערב', hours: '17:00-22:00', color: '#8ea8e8' }
  ];

  /* ברירת מחדל: אילו משמרות פעילות בכל יום (שישי מקוצר, שבת סגור) */
  var DEFAULT_DAY_SHIFTS = {
    0: ['morning', 'middle', 'evening'],
    1: ['morning', 'middle', 'evening'],
    2: ['morning', 'middle', 'evening'],
    3: ['morning', 'middle', 'evening'],
    4: ['morning', 'middle', 'evening'],
    5: ['morning', 'middle'],
    6: []
  };

  /* סניפים מוגדרים מראש – ניתנים לעריכה במסך "סניפים" */
  var DEFAULT_BRANCHES = [
    { id: 'br-center', name: 'מייפון מרכז', active: true, need: { morning: 1, middle: 1, evening: 1 } },
    { id: 'br-north', name: 'מייפון צפון', active: true, need: { morning: 1, middle: 1, evening: 1 } },
    { id: 'br-south', name: 'מייפון דרום', active: true, need: { morning: 1, middle: 0, evening: 1 } }
  ];

  var ALL_SHIFT_IDS = ['morning', 'middle', 'evening'];

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
    dayShifts: DEFAULT_DAY_SHIFTS
  };

  var API = {
    DAYS: DAYS,
    SHIFTS: SHIFTS,
    ALL_SHIFT_IDS: ALL_SHIFT_IDS,
    DEFAULT_DAY_SHIFTS: DEFAULT_DAY_SHIFTS,
    DEFAULT_BRANCHES: DEFAULT_BRANCHES,
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
