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

console.log('\n' + (failed === 0 ? '✅ ' : '❌ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
process.exit(failed === 0 ? 0 : 1);
