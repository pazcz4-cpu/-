/* נתוני בסיס: ימים, משמרות, סניפים ועובדים מוגדרים מראש */
(function (root) {
  'use strict';

  /* שמות הימים מגיעים מהתרגום הפעיל. המערך נבנה מחדש בכל קריאה
     כדי שהחלפת שפה תשתקף מיד. */
  var I18n = root.I18n || (typeof require === 'function' ? require('./i18n/core.js') : null);

  function translate(key, fallback, params) {
    var i18n = I18n || root.I18n;
    if (!i18n) return fallback;
    var text;
    try { text = i18n.t(key, params); } catch (err) { return fallback; }
    return text === key ? fallback : text;
  }

  var DAY_FALLBACK = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'מוצ״ש'];
  var DAY_SHORT_FALLBACK = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

  function buildDays() {
    var out = [];
    for (var i = 0; i < 7; i++) {
      out.push({
        idx: i,
        name: translate('days.' + i, DAY_FALLBACK[i]),
        short: translate('daysShort.' + i, DAY_SHORT_FALLBACK[i])
      });
    }
    return out;
  }

  var DAYS = buildDays();

  function refreshDays() {
    var next = buildDays();
    for (var i = 0; i < next.length; i++) {
      DAYS[i].name = next[i].name;
      DAYS[i].short = next[i].short;
    }
    return DAYS;
  }

  if (I18n && I18n.onChange) { I18n.onChange(refreshDays); }

  /* לוח צבעים קבוע למשמרות. כל עסק בוחר מתוכו, וכך הצבעים נשארים
     תקינים גם במצב כהה ובייצוא לאקסל. */
  var COLOR_FALLBACK = ['חמרה', 'ירוק', 'כחול', 'סגול', 'ורוד', 'טורקיז', 'אפור', 'חום'];
  var SHIFT_COLORS = COLOR_FALLBACK.map(function (fallback, index) {
    var entry = { id: index };
    /* getter ולא ערך קבוע, כדי שהחלפת שפה תשתקף בלי לבנות מחדש */
    Object.defineProperty(entry, 'name', {
      enumerable: true,
      get: function () { return translate('colors.' + index, fallback); }
    });
    return entry;
  });

  /* משמרות ברירת המחדל לעסק חדש. מכאן ואילך כל עסק מגדיר לעצמו. */
  var DEFAULT_SHIFTS = [
    { id: 'morning', name: 'בוקר', from: '09:30', to: '16:00', color: 0 },
    { id: 'middle', name: 'אמצע', from: '12:30', to: '20:00', color: 1 },
    { id: 'evening', name: 'ערב', from: '15:00', to: '22:00', color: 2 }
  ];

  /* שמות המשמרות לעסק חדש, בשפה הפעילה */
  function defaultShifts() {
    return DEFAULT_SHIFTS.map(function (shift) {
      return {
        id: shift.id,
        name: translate('shifts.' + shift.id, shift.name),
        from: shift.from, to: shift.to, color: shift.color
      };
    });
  }

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
      { id: 'br-center', name: translate('seed.branchCenter', 'סניף מרכז'), active: true, schedule: defaultSchedule(hours, shifts) },
      { id: 'br-north', name: translate('seed.branchNorth', 'סניף צפון'), active: true, schedule: defaultSchedule(hours, shifts) },
      { id: 'br-south', name: translate('seed.branchSouth', 'סניף דרום'), active: true, schedule: defaultSchedule(hours, shifts) }
    ];
  }

  /* עובדים מוגדרים מראש – ניתנים לעריכה במסך "עובדים" */
  var EMPLOYEE_SEED = [
    { n: 1, branches: ['br-center'], shifts: null, maxShifts: 6, note: '' },
    { n: 2, branches: ['br-center', 'br-north'], shifts: null, maxShifts: 6, note: '' },
    { n: 3, branches: ['br-north'], shifts: null, maxShifts: 5, note: '' },
    { n: 4, branches: ['br-north', 'br-south'], shifts: null, maxShifts: 6, note: '' },
    { n: 5, branches: ['br-south'], shifts: null, maxShifts: 5, note: '' },
    { n: 6, branches: ['br-center', 'br-south'], shifts: null, maxShifts: 6, note: '' },
    { n: 7, branches: [], shifts: null, maxShifts: 6, noteKey: 'seed.noteFloater', noteFallback: 'מחליף/ה בכל הסניפים' },
    { n: 8, branches: [], shifts: ['middle', 'evening'], maxShifts: 4, noteKey: 'seed.noteStudent', noteFallback: 'סטודנט/ית – ללא בקרים' }
  ];

  function defaultEmployees() {
    return EMPLOYEE_SEED.map(function (seed) {
      return {
        id: 'emp-' + seed.n,
        name: translate('seed.employee', 'עובד/ת ' + seed.n, { n: seed.n }),
        active: true,
        branches: seed.branches.slice(),
        shifts: seed.shifts ? seed.shifts.slice() : ALL_SHIFT_IDS.slice(),
        maxShifts: seed.maxShifts,
        note: seed.noteKey ? translate(seed.noteKey, seed.noteFallback) : ''
      };
    });
  }

  var DEFAULT_SETTINGS = {
    /* האם אשף הפתיחה כבר נסגר בידי הלקוח.

       על העסק ולא על המכשיר, ובכוונה: הלקוח מאשר את המייל
       בטלפון, נכנס משם, ואת ההגדרה האמיתית הוא עושה במחשב.
       דגל שיושב בדפדפן אחד פירושו אשף שנעלם באמצע המעבר בין
       השניים -- ואז מי שבא להגדיר את העסק נוחת על טבלה ריקה
       בלי לדעת מאיפה מתחילים. */
    onboardingDone: false,
    onePerDay: true,          // עובד משובץ למשמרת אחת ביום לכל היותר
    restEveningMorning: true, // מנוחה מינימלית בין שתי משמרות
    /* הסף בדקות. 12 שעות ולא 8 (המינימום בחוק) מסיבה אחת:
       בשעות ברירת המחדל זה מייצר בדיוק את האיסור שהיה כאן קודם
       – ערב שנגמר ב-22:00 חוסם בוקר ב-09:30 ואינו חוסם שום צמד
       אחר. עסק שרוצה לרדת ל-8 משנה את המספר בהגדרות. */
    restMinutes: 12 * 60,
    oneDayOffPerWeek: true,   // יום החופש שסומן באילוצים הוא יום החופש היחיד בשבוע
    /* מועד סגירת ההגשות. dayIdx ו-time מתארים את המועד האחרון
       להגשת אילוצים לשבוע מסוים, ביום שלפני תחילת אותו שבוע.
       remindHours הוא כמה שעות לפני כן שולחים תזכורת. */
    constraintsDeadline: {
      enabled: false,
      dayIdx: 4,             // חמישי
      time: '20:00',
      remindHours: 24
    },
    /* תקרת בקשות לעובד בשבוע. נספרות רק בקשות שמגבילות זמינות –
       יום חופש או חסימת משמרת – ולא העדפות: העדפה עוזרת לשיבוץ
       ואין סיבה להגביל אותה. בקשה שנדחתה אינה מגבילה דבר, ולכן
       אינה נספרת, והעובד יכול לבקש יום אחר במקומה. */
    constraintLimit: {
      enabled: false,
      max: 2,
      /* האם גם העדפה נספרת בתקרה.

         דלוק כברירת מחדל, כי זה מה שמנהל מצפה לו: הגבלתי ל-3,
         ואני רוצה לראות 3 שורות ולא שש. מי שרוצה שהעדפות יישארו
         חופשיות – מכבה, ואז נספרות רק בקשות שמגבילות זמינות
         (יום חופש או חסימת משמרת). */
      countPreferences: true
    },
    /* מה עובד רואה במסך שלו מלבד המשמרות של עצמו.

       כבוי כברירת מחדל, וזו החלטה ולא עצלנות: עובד שרואה את
       הסידור של כולם רואה גם מי עובד פחות ממנו ומי קיבל את
       הערב שהוא ביקש. בחלק מהעסקים זה בדיוק מה שרוצים — צוות
       קטן שצריך לתאם ביניהם מי מחליף את מי — ובחלקם זה מקור
       לריב. לכן זו בחירה של המנהל, והברירה הבטוחה היא הסגורה.

       גם כשהיא דלוקה נחשפות רק המשמרות והשמות. אילוצים,
       הערות, מיילים, טלפונים ומכסות נשארים סגורים תמיד — אלה
       נתונים של העובד ולא של הסידור. */
    teamVisibility: {
      shifts: false
    },
    /* שעון נוכחות: מה שקרה בפועל, לעומת הסידור שהוא מה שתוכנן.

       כבוי כברירת מחדל. עסק שקנה מערכת סידור לא ביקש שכל עובד
       יתחיל לדווח כניסה ויציאה, ותכונה שנדלקת מעצמה הופכת את
       היום הראשון לשיחה על "למה זה מבקש ממני משהו".

       mode – phone: דיווח מהטלפון, לעובדי שטח. device: שעון
       בסניף בלבד. both: שניהם, וכל סניף עובד כפי שהותקן אצלו.
       devices – מכשירי החומרה של העסק, לפי מספר סידורי. */
    timeclock: {
      enabled: false,
      mode: 'phone',
      devices: []
    },
    /* שעות נוספות. הספים נשמרים ואינם מקודדים בקוד: יש עסקים
       עם הסכם קיבוצי אחר, ומספר שקבוע בקוד הוא מספר שאי אפשר
       לתקן ללקוח. ברירת המחדל היא המקובל בישראל — 8.6 שעות
       ליום ו-42 שעות לשבוע. */
    overtime: {
      enabled: false,
      dailyMinutes: 516,
      weeklyMinutes: 2520
    },
    /* getter כדי שעסק חדש יקבל את שמות המשמרות בשפה הפעילה */
    get shifts() { return defaultShifts(); },
    defaultShabbatEnd: '20:00'
  };

  var API = {
    DAYS: DAYS,
    SHIFTS: SHIFTS,
    ALL_SHIFT_IDS: ALL_SHIFT_IDS,
    MOTZASH: MOTZASH,
    SHIFT_COLORS: SHIFT_COLORS,
    DEFAULT_SHIFTS: DEFAULT_SHIFTS,
    defaultShifts: defaultShifts,
    refreshDays: refreshDays,
    DEFAULT_HOURS: DEFAULT_HOURS,
    DEFAULT_FRIDAY: DEFAULT_FRIDAY,
    WEEKDAYS: WEEKDAYS,
    defaultSchedule: defaultSchedule,
    defaultBranches: defaultBranches,
    get DEFAULT_EMPLOYEES() { return defaultEmployees(); },
    defaultEmployees: defaultEmployees,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    shiftById: function (id) {
      for (var i = 0; i < SHIFTS.length; i++) { if (SHIFTS[i].id === id) return SHIFTS[i]; }
      return null;
    }
  };

  root.ShiftData = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
