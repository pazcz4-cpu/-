/* שעון הנוכחות: מה שקרה בפועל, לעומת הסידור שהוא מה שתוכנן.

   כאן נבדקת השכבה שממנה נגזר דוח השעות שיישלח לחשב שכר. לכן
   רוב הבדיקות אינן על "המספר הנכון" אלא על המקרים שבהם מספר
   שגוי נכנס לתלוש בשקט: דיווח כפול ממכשיר שניתק, משמרת שחוצה
   חצות, כניסה בלי יציאה, ושבוע שחוצה חודשים.

   הרצה: node tests/timeclock-tests.js */
'use strict';

var I18n = require('../js/i18n/core.js');
I18n.use('he');

var Store = require('../js/store.js');

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.log('  ✗ ' + name + '\n      ' + (err && err.message)); }
}
function assert(condition, message) { if (!condition) throw new Error(message || 'assertion failed'); }
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'ערכים שונים') + ': התקבל ' + actual + ', ציפינו ל-' + expected);
  }
}

function freshWeek() { return Store.emptyWeek(); }
function punch(week, empId, kind, at, extra) {
  return Store.addPunch(week, Object.assign({ empId: empId, kind: kind, at: at }, extra || {}));
}

console.log('\n== דיווח בודד ==');

test('דיווח נשמר עם מזהה, זמן ומקור', function () {
  var week = freshWeek();
  var result = punch(week, 'emp-1', 'in', '2026-09-20T05:00:00Z');
  assert(result.ok, 'הדיווח לא נשמר');
  assertEqual(Store.punchList(week).length, 1, 'מספר הדיווחים');
  assert(result.punch.id, 'אין מזהה לדיווח');
  assertEqual(result.punch.src, 'phone', 'מקור ברירת המחדל');
});

test('דיווח בלי עובד או בלי זמן תקין נדחה', function () {
  var week = freshWeek();
  assertEqual(punch(week, '', 'in', '2026-09-20T05:00:00Z').reason, 'no_employee', 'בלי עובד');
  assertEqual(punch(week, 'emp-1', 'in', 'מתישהו').reason, 'bad_time', 'זמן לא תקין');
  assertEqual(Store.punchList(week).length, 0, 'נשמר דיווח פגום');
});

test('הדיווחים נשמרים לפי סדר הזמן, גם כשהגיעו הפוך', function () {
  var week = freshWeek();
  punch(week, 'emp-1', 'out', '2026-09-20T13:00:00Z');
  punch(week, 'emp-1', 'in', '2026-09-20T05:00:00Z');
  assertEqual(Store.punchList(week)[0].kind, 'in', 'הראשון ברשימה');
});

console.log('\n== כפילות: מכשיר ששלח פעמיים ==');

test('אותו דיווח בתוך חלון הכפילות אינו נספר פעמיים', function () {
  var week = freshWeek();
  punch(week, 'emp-1', 'in', '2026-09-20T05:00:00Z', { src: 'device' });
  var again = punch(week, 'emp-1', 'in', '2026-09-20T05:00:30Z', { src: 'device' });
  assertEqual(again.ok, false, 'הכפילות נשמרה');
  assertEqual(again.reason, 'duplicate', 'סיבת הדחייה');
  assertEqual(Store.punchList(week).length, 1, 'מספר הדיווחים');
});

test('אבל כניסה אמיתית אחרי הפסקה כן נספרת', function () {
  var week = freshWeek();
  punch(week, 'emp-1', 'in', '2026-09-20T05:00:00Z');
  punch(week, 'emp-1', 'out', '2026-09-20T09:00:00Z');
  var second = punch(week, 'emp-1', 'in', '2026-09-20T09:30:00Z');
  assert(second.ok, 'כניסה שנייה נבלעה');
  assertEqual(Store.punchList(week).length, 3, 'מספר הדיווחים');
});

test('העברת כרטיס פעמיים אינה יוצרת משמרת בת דקה', function () {
  /* המקרה השכיח בשטח: אדם לא שמע ביפ ומעביר שוב. הכיוון נגזר
     מהדיווח הקודם, ולכן בלי החסימה ההעברה השנייה הייתה נרשמת
     כיציאה מיידית. */
  var week = freshWeek();
  punch(week, 'emp-1', 'in', '2026-09-20T05:00:00Z', { src: 'device' });
  var second = punch(week, 'emp-1', 'out', '2026-09-20T05:00:20Z', { src: 'device' });
  assertEqual(second.ok, false, 'ההעברה השנייה נרשמה');
  assertEqual(Store.punchSessions(week, 'emp-1')[0].open, true, 'המשמרת נסגרה מיד');
});

test('תיקון של המנהל אינו נחסם בחלון הכפילות', function () {
  var week = freshWeek();
  punch(week, 'emp-1', 'in', '2026-09-20T05:00:00Z');
  var fix = punch(week, 'emp-1', 'out', '2026-09-20T05:00:20Z',
    { src: 'manager', by: 'boss', force: true });
  assert(fix.ok, 'תיקון של המנהל נחסם');
  assertEqual(fix.punch.src, 'manager', 'מקור התיקון');
});

test('וכניסה של עובד אחר באותה שנייה אינה כפילות', function () {
  var week = freshWeek();
  punch(week, 'emp-1', 'in', '2026-09-20T05:00:00Z', { src: 'device' });
  var other = punch(week, 'emp-2', 'in', '2026-09-20T05:00:00Z', { src: 'device' });
  assert(other.ok, 'דיווח של עובד אחר נבלע ככפילות');
});

console.log('\n== זוגות כניסה–יציאה ==');

test('משמרת רגילה', function () {
  var week = freshWeek();
  punch(week, 'emp-1', 'in', '2026-09-20T05:02:00Z');
  punch(week, 'emp-1', 'out', '2026-09-20T13:32:00Z');
  var sessions = Store.punchSessions(week, 'emp-1');
  assertEqual(sessions.length, 1, 'מספר המשמרות');
  assertEqual(sessions[0].minutes, 510, 'אורך המשמרת בדקות');
  assertEqual(sessions[0].open, false, 'המשמרת נשארה פתוחה');
});

test('משמרת שחוצה חצות היא משמרת אחת', function () {
  var week = freshWeek();
  punch(week, 'emp-1', 'in', '2026-09-20T19:00:00Z');
  punch(week, 'emp-1', 'out', '2026-09-20T23:30:00Z');
  var sessions = Store.punchSessions(week, 'emp-1');
  assertEqual(sessions.length, 1, 'מספר המשמרות');
  assertEqual(sessions[0].minutes, 270, 'אורך המשמרת');
});

test('כניסה בלי יציאה נשארת פתוחה ואינה מייצרת שעות', function () {
  var week = freshWeek();
  punch(week, 'emp-1', 'in', '2026-09-20T05:00:00Z');
  var sessions = Store.punchSessions(week, 'emp-1');
  assertEqual(sessions.length, 1, 'מספר המשמרות');
  assertEqual(sessions[0].open, true, 'המשמרת אינה מסומנת כפתוחה');
  assertEqual(sessions[0].minutes, 0, 'משמרת פתוחה קיבלה שעות');
});

test('כניסה על כניסה: הראשונה נשארת פתוחה והשנייה נסגרת', function () {
  var week = freshWeek();
  punch(week, 'emp-1', 'in', '2026-09-20T05:00:00Z');
  punch(week, 'emp-1', 'in', '2026-09-20T09:00:00Z');
  punch(week, 'emp-1', 'out', '2026-09-20T13:00:00Z');
  var sessions = Store.punchSessions(week, 'emp-1');
  assertEqual(sessions.length, 2, 'מספר המשמרות');
  assertEqual(sessions[0].open, true, 'הראשונה לא נשארה פתוחה');
  assertEqual(sessions[1].minutes, 240, 'אורך השנייה');
});

test('יציאה בלי כניסה נרשמת כיתומה ואינה מייצרת שעות', function () {
  var week = freshWeek();
  punch(week, 'emp-1', 'out', '2026-09-20T13:00:00Z');
  var sessions = Store.punchSessions(week, 'emp-1');
  assertEqual(sessions.length, 1, 'מספר הרשומות');
  assertEqual(sessions[0].orphan, true, 'לא סומנה כיתומה');
  assertEqual(sessions[0].minutes, 0, 'יתומה קיבלה שעות');
});

test('מצב העובד נגזר מהדיווח האחרון', function () {
  var week = freshWeek();
  assertEqual(Store.punchState(week, 'emp-1'), 'out', 'עובד שלא דיווח כלל');
  punch(week, 'emp-1', 'in', '2026-09-20T05:00:00Z');
  assertEqual(Store.punchState(week, 'emp-1'), 'in', 'אחרי כניסה');
  punch(week, 'emp-1', 'out', '2026-09-20T13:00:00Z');
  assertEqual(Store.punchState(week, 'emp-1'), 'out', 'אחרי יציאה');
});

test('דיווח של עמית אינו משפיע על המצב שלי', function () {
  var week = freshWeek();
  punch(week, 'emp-2', 'in', '2026-09-20T05:00:00Z');
  assertEqual(Store.punchState(week, 'emp-1'), 'out', 'מצב העובד הושפע מעמית');
});

console.log('\n== אורך משמרת מתוכננת ==');

test('משמרת ערב שנגמרת אחרי חצות אינה שלילית', function () {
  assertEqual(Store.shiftLengthMinutes({ from: '22:00', to: '02:00' }), 240, 'ערב עד שתיים');
  assertEqual(Store.shiftLengthMinutes({ from: '06:00', to: '14:00' }), 480, 'בוקר רגיל');
  assertEqual(Store.shiftLengthMinutes({ from: '', to: '' }), 0, 'משמרת בלי שעות');
});

console.log('\n== הדוח החודשי ==');

/* עסק קטן: שני סניפים לא נדרשים כאן, מה שנדרש הוא עובד אחד
   ושבוע אחד – והחודש שאליו הוא שייך. */
function monthState() {
  var state = Store.emptyState();
  state.employees = [{ id: 'emp-1', name: 'דנה', active: true, branches: [], shifts: [], maxShifts: 6 }];
  state.settings.overtime = { enabled: true, dailyMinutes: 516, weeklyMinutes: 2520 };
  return state;
}

test('שעות בפועל נספרות לחודש של יום הכניסה', function () {
  var state = monthState();
  var week = Store.getWeek(state, '2026-09-20');
  punch(week, 'emp-1', 'in', new Date(2026, 8, 21, 8, 0).toISOString());
  punch(week, 'emp-1', 'out', new Date(2026, 8, 21, 16, 0).toISOString());
  var report = Store.monthlyReport(state, '2026-09');
  assertEqual(report['emp-1'].minutes, 480, 'דקות בחודש');
  assertEqual(report['emp-1'].days, 1, 'ימי עבודה');
});

test('שבוע שחוצה חודשים מתחלק בין שני החודשים', function () {
  var state = monthState();
  /* השבוע שמתחיל ב-27/09 נמשך עד 03/10 */
  var week = Store.getWeek(state, '2026-09-27');
  punch(week, 'emp-1', 'in', new Date(2026, 8, 30, 8, 0).toISOString());
  punch(week, 'emp-1', 'out', new Date(2026, 8, 30, 16, 0).toISOString());
  punch(week, 'emp-1', 'in', new Date(2026, 9, 1, 8, 0).toISOString());
  punch(week, 'emp-1', 'out', new Date(2026, 9, 1, 14, 0).toISOString());
  assertEqual(Store.monthlyReport(state, '2026-09')['emp-1'].minutes, 480, 'ספטמבר');
  assertEqual(Store.monthlyReport(state, '2026-10')['emp-1'].minutes, 360, 'אוקטובר');
});

test('משמרת שנפתחה בסוף החודש ונסגרה בתחילת הבא שייכת לחודש שנפתחה בו', function () {
  var state = monthState();
  var week = Store.getWeek(state, '2026-09-27');
  punch(week, 'emp-1', 'in', new Date(2026, 8, 30, 22, 0).toISOString());
  punch(week, 'emp-1', 'out', new Date(2026, 9, 1, 2, 0).toISOString());
  assertEqual(Store.monthlyReport(state, '2026-09')['emp-1'].minutes, 240, 'ספטמבר');
  assertEqual(Store.monthlyReport(state, '2026-10')['emp-1'], undefined, 'נספר גם באוקטובר');
});

test('משמרת פתוחה אינה מייצרת שעות, אבל נספרת כדי שתהיה גלויה', function () {
  var state = monthState();
  var week = Store.getWeek(state, '2026-09-20');
  punch(week, 'emp-1', 'in', new Date(2026, 8, 21, 8, 0).toISOString());
  var report = Store.monthlyReport(state, '2026-09');
  assertEqual(report['emp-1'].minutes, 0, 'דקות');
  assertEqual(report['emp-1'].openSessions, 1, 'משמרות פתוחות');
});

console.log('\n== שעות נוספות ==');

test('יום ארוך מהסף מייצר שעות נוספות', function () {
  var state = monthState();
  var week = Store.getWeek(state, '2026-09-20');
  /* עשר שעות ביום אחד: 600 דקות, הסף 516 */
  punch(week, 'emp-1', 'in', new Date(2026, 8, 21, 8, 0).toISOString());
  punch(week, 'emp-1', 'out', new Date(2026, 8, 21, 18, 0).toISOString());
  var report = Store.monthlyReport(state, '2026-09');
  assertEqual(report['emp-1'].dailyOvertimeMinutes, 84, 'שעות נוספות יומיות');
  assertEqual(report['emp-1'].overtimeMinutes, 84, 'סך השעות הנוספות');
});

test('שבוע ארוך מהסף מייצר שעות נוספות גם בלי יום חריג', function () {
  var state = monthState();
  var week = Store.getWeek(state, '2026-09-20');
  /* שישה ימים של שמונה שעות = 2880 דקות, הסף השבועי 2520 */
  for (var day = 0; day <= 5; day++) {
    punch(week, 'emp-1', 'in', new Date(2026, 8, 20 + day, 8, 0).toISOString());
    punch(week, 'emp-1', 'out', new Date(2026, 8, 20 + day, 16, 0).toISOString());
  }
  var report = Store.monthlyReport(state, '2026-09');
  assertEqual(report['emp-1'].dailyOvertimeMinutes, 0, 'אף יום לא חרג');
  assertEqual(report['emp-1'].weeklyOvertimeMinutes, 360, 'חריגה שבועית');
});

test('שעה אחת אינה נספרת פעמיים – יומי ושבועי אינם מתחברים', function () {
  var state = monthState();
  var week = Store.getWeek(state, '2026-09-20');
  for (var day = 0; day <= 5; day++) {
    punch(week, 'emp-1', 'in', new Date(2026, 8, 20 + day, 8, 0).toISOString());
    punch(week, 'emp-1', 'out', new Date(2026, 8, 20 + day, 18, 0).toISOString());
  }
  var report = Store.monthlyReport(state, '2026-09');
  var row = report['emp-1'];
  assertEqual(row.overtimeMinutes, Math.max(row.dailyOvertimeMinutes, row.weeklyOvertimeMinutes),
    'הסכום אינו הגבוה מבין השניים');
  assert(row.overtimeMinutes < row.dailyOvertimeMinutes + row.weeklyOvertimeMinutes,
    'היומי והשבועי חוברו יחד');
});

test('כשבקרת השעות הנוספות כבויה – אין שעות נוספות', function () {
  var state = monthState();
  state.settings.overtime.enabled = false;
  var week = Store.getWeek(state, '2026-09-20');
  punch(week, 'emp-1', 'in', new Date(2026, 8, 21, 8, 0).toISOString());
  punch(week, 'emp-1', 'out', new Date(2026, 8, 21, 20, 0).toISOString());
  assertEqual(Store.monthlyReport(state, '2026-09')['emp-1'].overtimeMinutes, 0, 'שעות נוספות');
});

console.log('\n== הצגה ==');

test('דקות מוצגות כשעות ודקות, כמו בתלוש', function () {
  assertEqual(Store.formatMinutes(512), '8:32', '512 דקות');
  assertEqual(Store.formatMinutes(60), '1:00', 'שעה עגולה');
  assertEqual(Store.formatMinutes(0), '0:00', 'אפס');
  assertEqual(Store.formatMinutes(-5), '0:00', 'מספר שלילי');
});

console.log('\n== ההגדרה ==');

test('שעון הנוכחות כבוי כברירת מחדל', function () {
  var state = Store.emptyState();
  assertEqual(Store.timeclock(state).enabled, false, 'ברירת המחדל');
  assertEqual(Store.allowsPhonePunch(state), false, 'דיווח מהטלפון');
});

test('עסק ישן בלי ההגדרה נקרא ככבוי', function () {
  var state = Store.emptyState();
  delete state.settings.timeclock;
  assertEqual(Store.timeclock(state).enabled, false, 'היעדר הגדרה');
});

test('במצב מכשיר בלבד אין דיווח מהטלפון', function () {
  var state = Store.emptyState();
  state.settings.timeclock = { enabled: true, mode: 'device', devices: [] };
  assertEqual(Store.allowsPhonePunch(state), false, 'מצב מכשיר');
  state.settings.timeclock.mode = 'both';
  assertEqual(Store.allowsPhonePunch(state), true, 'מצב משולב');
});

/* ===== משמרת לילה שחוצה את סוף השבוע =====

   המקרה שהפיל את כל השרשרת. 19.09.2026 הוא שבת, היום האחרון
   של השבוע 2026-09-13. כניסה ב-22:00 ויציאה ב-02:00 הן משמרת
   אחת, אבל היציאה נופלת ביום הראשון של השבוע הבא – ובמערכת
   שבועית זה שבוע אחר.

   קודם היציאה נכתבה לשבוע החדש, ואז שבוע אחד נשאר עם משמרת
   פתוחה, השני עם דיווח יתום, ובדוח החודשי הופיעו אפס שעות על
   לילה שלם של עבודה. עסק שמאבד כך משמרת אחת בכל שבוע. */
console.log('\n== משמרת לילה שחוצה את סוף השבוע ==');

var SAT_IN = '2026-09-19T22:00:00.000Z';   // שבת, היום האחרון של השבוע
var SUN_OUT = '2026-09-20T06:00:00.000Z';  // ראשון בבוקר, כבר בשבוע הבא
var WEEK_A = '2026-09-13';
var WEEK_B = '2026-09-20';

test('שני צדי המשמרת נופלים בשני שבועות שונים', function () {
  assertEqual(Store.currentWeekKey(new Date(SAT_IN)), WEEK_A, 'שבוע הכניסה');
  assertEqual(Store.currentWeekKey(new Date(SUN_OUT)), WEEK_B, 'שבוע היציאה');
});

test('הדיווח מכוון לשבוע שבו הכניסה פתוחה', function () {
  var weeks = {};
  weeks[WEEK_A] = freshWeek();
  weeks[WEEK_B] = freshWeek();

  var first = Store.punchTarget(weeks, 'emp-1', WEEK_A);
  assertEqual(first.weekKey, WEEK_A, 'הכניסה נרשמת בשבוע שלה');
  assertEqual(first.kind, Store.PUNCH.IN, 'כיוון הכניסה');
  punch(weeks[WEEK_A], 'emp-1', first.kind, SAT_IN);

  /* ראשון ב-06:00. בשבוע החדש אין לעובד אף דיווח, ובשבוע
     שלפניו הוא בפנים – ולכן זו יציאה, והיא נרשמת שם. */
  var second = Store.punchTarget(weeks, 'emp-1', WEEK_B);
  assertEqual(second.weekKey, WEEK_A, 'היציאה נרשמת בשבוע של הכניסה');
  assertEqual(second.kind, Store.PUNCH.OUT, 'כיוון היציאה');
  punch(weeks[WEEK_A], 'emp-1', second.kind, SUN_OUT);

  var sessions = Store.punchSessions(weeks[WEEK_A], 'emp-1');
  assertEqual(sessions.length, 1, 'זוג אחד');
  assertEqual(sessions[0].open, false, 'המשמרת סגורה');
  assertEqual(sessions[0].minutes, 480, 'שמונה שעות');

  /* ואחרי היציאה, הדיווח הבא באמת נרשם בשבוע החדש */
  var third = Store.punchTarget(weeks, 'emp-1', WEEK_B);
  assertEqual(third.weekKey, WEEK_B, 'הכניסה הבאה בשבוע החדש');
  assertEqual(third.kind, Store.PUNCH.IN, 'וכיוונה כניסה');
});

test('העובד שפותח את האפליקציה אחרי חצות נראה בפנים', function () {
  var weekA = freshWeek();
  var weekB = freshWeek();
  punch(weekA, 'emp-1', Store.PUNCH.IN, SAT_IN);
  /* בלי השבוע הקודם המסך היה מציע לו "כניסה" בזמן שהוא בתוך
     משמרת – והלחיצה הייתה מפצלת את הלילה שלו לשניים. */
  assertEqual(Store.punchState(weekB, 'emp-1'), Store.PUNCH.OUT, 'בלי השבוע הקודם');
  assertEqual(Store.punchState(weekB, 'emp-1', weekA), Store.PUNCH.IN, 'עם השבוע הקודם');
});

test('נתונים שכבר נרשמו מפוצלים משתחברים בקריאה', function () {
  /* רשת הביטחון: כך זה נראה במערכות שרצו לפני התיקון, וכך
     נראה כל מסלול כתיבה שעוד יתווסף ויפספס את הכיוון. */
  var weekA = freshWeek();
  var weekB = freshWeek();
  punch(weekA, 'emp-1', Store.PUNCH.IN, SAT_IN);
  punch(weekB, 'emp-1', Store.PUNCH.OUT, SUN_OUT);

  var lone = Store.punchSessions(weekA, 'emp-1');
  assertEqual(lone[0].open, true, 'בלי השבוע הבא – משמרת פתוחה');

  var joined = Store.punchSessions(weekA, 'emp-1', { next: weekB });
  assertEqual(joined.length, 1, 'זוג אחד');
  assertEqual(joined[0].open, false, 'המשמרת נסגרה');
  assertEqual(joined[0].minutes, 480, 'שמונה שעות');

  /* והשבוע הבא אינו סופר את אותה יציאה שוב */
  var after = Store.punchSessions(weekB, 'emp-1', { prev: weekA });
  assertEqual(after.length, 0, 'היציאה נספרה פעם אחת בלבד');
});

test('הדוח החודשי נותן שמונה שעות ביום הכניסה', function () {
  var state = Store.emptyState();
  state.weeks[WEEK_A] = freshWeek();
  state.weeks[WEEK_B] = freshWeek();
  punch(state.weeks[WEEK_A], 'emp-1', Store.PUNCH.IN, SAT_IN);
  punch(state.weeks[WEEK_B], 'emp-1', Store.PUNCH.OUT, SUN_OUT);

  var row = Store.monthlyReport(state, '2026-09')['emp-1'];
  assert(row, 'העובד אינו בדוח');
  assertEqual(row.minutes, 480, 'דקות בדוח');
  assertEqual(row.days, 1, 'ימי עבודה');
  assertEqual(row.openSessions, 0, 'משמרות פתוחות');
  assertEqual(row.orphanPunches, 0, 'דיווחים יתומים');
  assertEqual(Object.keys(row.byDay).join(','), '2026-09-19', 'היום שאליו נזקפו השעות');
});

/* ===== הקובץ שנוסע למערכת השכר =====

   מה שנבדק כאן הוא לא "המספר הנכון" אלא המקומות שבהם קובץ
   נראה תקין ומגיע שבור אל מי שמייבא אותו. */
console.log('\n== ייצוא לשכר ==');

var Csv = require('../js/csv.js');

function payrollState() {
  var state = Store.emptyState();
  state.employees = [
    { id: 'emp-1', name: 'כהן, דוד', payrollId: '0417', clockId: 3,
      active: true, branches: [], shifts: ['morning'], maxShifts: 6, roles: [] },
    { id: 'emp-2', name: 'רות לוי', payrollId: '', clockId: 4,
      active: true, branches: [], shifts: ['morning'], maxShifts: 6, roles: [] }
  ];
  var week = Store.getWeek(state, '2026-09-13');
  punch(week, 'emp-1', Store.PUNCH.IN, '2026-09-14T06:00:00.000Z');
  punch(week, 'emp-1', Store.PUNCH.OUT, '2026-09-14T14:36:00.000Z');
  punch(week, 'emp-2', Store.PUNCH.IN, '2026-09-15T08:00:00.000Z');   // בלי יציאה
  return state;
}

test('סיכום חודשי: שעות בשתי הצורות, ומספר העובד בשכר', function () {
  var lines = Store.payrollSummary(payrollState(), '2026-09');
  assertEqual(lines.length, 2, 'מספר השורות');
  var david = lines.filter(function (l) { return l.empId === 'emp-1'; })[0];
  assertEqual(david.payrollId, '0417', 'מספר בשכר');
  assertEqual(david.clockId, 3, 'מספר בשעון');
  assertEqual(david.clock, '8:36', 'שעות לעין אנושית');
  /* 8 שעות ו-36 דקות הן 8.60 ולא 8.36. זו הטעות שמגיעה
     לתלוש כשמעתיקים את העמודה הלא נכונה. */
  assertEqual(david.hours, '8.60', 'שעות עשרוניות');
  var ruth = lines.filter(function (l) { return l.empId === 'emp-2'; })[0];
  assertEqual(ruth.openSessions, 1, 'משמרת פתוחה נספרת');
  assertEqual(ruth.hours, '0.00', 'משמרת פתוחה אינה מייצרת שעות');
});

test('פירוט דיווחים: שורה לכל זוג, ומשמרת פתוחה מסומנת', function () {
  var lines = Store.payrollPunches(payrollState(), '2026-09');
  assertEqual(lines.length, 2, 'מספר השורות');
  var david = lines.filter(function (l) { return l.empId === 'emp-1'; })[0];
  assertEqual(david.date, '2026-09-14', 'תאריך');
  assertEqual(david.hours, '8.60', 'שעות עשרוניות');
  assertEqual(david.open, false, 'סגורה');
  /* המשמרת הפתוחה יוצאת בקובץ ומסומנת. השמטה שקטה שלה הייתה
     מייצרת קובץ שנראה תקין וחסרות בו שעות. */
  var ruth = lines.filter(function (l) { return l.empId === 'emp-2'; })[0];
  assert(ruth, 'המשמרת הפתוחה הושמטה מהקובץ');
  assertEqual(ruth.open, true, 'מסומנת כפתוחה');
  assertEqual(ruth.outAt, '', 'בלי שעת יציאה');
  assertEqual(ruth.hours, '0.00', 'בלי שעות');
});

test('שעות עשרוניות: מאיות ולא דקות', function () {
  assertEqual(Store.decimalHours(0), '0.00', 'אפס');
  assertEqual(Store.decimalHours(30), '0.50', 'חצי שעה');
  assertEqual(Store.decimalHours(516), '8.60', 'יום עבודה');
  assertEqual(Store.decimalHours(485), '8.08', 'עיגול');
});

test('CSV: פסיק בשם, מרכאות, ומספר שמתחיל באפס', function () {
  var text = Csv.build([
    ['שם', 'מספר'],
    ['כהן, דוד', Csv.asText('0417')],
    ['עם "מרכאות"', '5']
  ]);
  /* בלי BOM אקסל בווינדוס קורא את העברית כג׳יבריש */
  assertEqual(text.charAt(0), '﻿', 'חסר BOM');
  var lines = text.split('\r\n');
  var q = String.fromCharCode(34);
  /* פסיק בתוך שם מחייב ציטוט, אחרת "כהן, דוד" הופך לשני טורים
     וכל השורה זזה. והמספר יוצא כ-="0417" כדי שאקסל לא יקרא
     אותו כ-417 ומערכת השכר לא תמצא לו בעלים. */
  assertEqual(lines[1],
    q + 'כהן, דוד' + q + ',' + q + '=' + q + q + '0417' + q + q + q,
    'ציטוט והגנה על האפס');
  assertEqual(lines[2],
    q + 'עם ' + q + q + 'מרכאות' + q + q + q + ',5',
    'מרכאות בתוך תא');
  /* CRLF, כי זה מה שמערכות ווינדוס מצפות לו */
  assert(text.indexOf('\r\n') !== -1, 'שורות אינן מסתיימות ב-CRLF');
});

test('CSV: תא ריק נשאר ריק ולא הופך למחרוזת ריקה מצוטטת', function () {
  /* ="" הוא תא שנראה תקין ואינו, ומערכת שכר עלולה לקלוט אותו
     כמחרוזת ולא כערך חסר. */
  assertEqual(Csv.asText(''), '', 'מחרוזת ריקה');
  assertEqual(Csv.asText(null), '', 'null');
  assertEqual(Csv.asText(undefined), '', 'undefined');
});

console.log('\n' + (failed === 0 ? '✅ ' : '❌ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
process.exit(failed === 0 ? 0 : 1);
