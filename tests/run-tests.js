/* בדיקות למנוע השיבוץ ולבדיקות התקינות. הרצה: node tests/run-tests.js */
'use strict';

var Data = require('../js/data.js');
var Store = require('../js/store.js');
var Scheduler = require('../js/scheduler.js');
var Validate = require('../js/validate.js');

var passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.log('  ✗ ' + name + '\n      ' + err.message); }
}
function assert(condition, message) { if (!condition) throw new Error(message || 'assertion failed'); }
function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error((message || 'ערכים שונים') + ': התקבל ' + actual + ', ציפינו ל-' + expected);
}

function freshState() { return Store.emptyState(); }
function build(state, weekData, opts) {
  var result = Scheduler.generate(state, weekData, Object.assign({ attempts: 150, seed: 12345 }, opts || {}));
  weekData.assignments = result.assignments;
  return result;
}
function issuesOfType(report, type) {
  return report.issues.filter(function (i) { return i.type === type; });
}

console.log('\n== מנוע השיבוץ ==');

/* האם עובד כלשהו היה יכול לאייש את המשמרת הזו במצב הסופי? */
function anyoneCouldFill(state, weekData, demand) {
  return state.employees.some(function (emp) {
    if (!emp.active) return false;
    if (emp.shifts.indexOf(demand.shiftId) === -1) return false;
    if (emp.branches.length && emp.branches.indexOf(demand.branchId) === -1) return false;
    var constraint = Store.getConstraint(weekData, emp.id, demand.dayIdx);
    if (constraint.off || (constraint.blocked && constraint.blocked[demand.shiftId])) return false;
    if (Store.employeeDayAssignments(state, weekData, emp.id, demand.dayIdx).length) return false;
    if (Store.employeeWeekCount(state, weekData, emp.id) >= emp.maxShifts) return false;
    if (state.settings.restEveningMorning && demand.shiftId === 'morning' && demand.dayIdx > 0) {
      var prev = Store.employeeDayAssignments(state, weekData, emp.id, demand.dayIdx - 1);
      if (prev.some(function (s) { return s.shiftId === 'evening'; })) return false;
    }
    return true;
  });
}

test('לא נותרת משמרת ריקה שהיה אפשר לאייש', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  var result = build(state, weekData);
  result.unfilled.forEach(function (demand) {
    assert(!anyoneCouldFill(state, weekData, demand),
      'נותרה ריקה משמרת שהיה אפשר לאייש: יום ' + demand.dayIdx + ' ' + demand.branchId + ' ' + demand.shiftId);
  });
});

test('חוסר באיוש נובע ממחסור אמיתי בעובדים', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  var result = build(state, weekData);
  // ביום חול נדרשות 9 משמרות ויש 8 עובדים, ועובד עושה משמרת אחת ביום
  var weekdaySlots = Store.weekDemands(state)
    .filter(function (d) { return d.dayIdx === 0; })
    .reduce(function (sum, d) { return sum + d.need; }, 0);
  assert(weekdaySlots > state.employees.length, 'ההנחה של הבדיקה: ביום חול יש יותר משמרות מעובדים');
  assert(result.unfilled.length >= weekdaySlots - state.employees.length, 'חוסר מינימלי צפוי');
});

test('הסידור האוטומטי אינו יוצר שגיאות תקינות', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  var report = Validate.validate(state, weekData);
  assertEqual(report.errors, 0, 'לא אמורות להיות שגיאות: ' +
    report.issues.filter(function (i) { return i.level === 'error'; }).map(function (i) { return i.text; }).join(' | '));
});

test('כל עובד משובץ למשמרת אחת ביום לכל היותר', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  state.employees.forEach(function (emp) {
    for (var day = 0; day < 7; day++) {
      assert(Store.employeeDayAssignments(state, weekData, emp.id, day).length <= 1,
        emp.name + ' שובץ ליותר ממשמרת אחת ביום ' + day);
    }
  });
});

test('אילוץ "יום חופש" נשמר', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  state.employees.forEach(function (emp) {
    Store.setConstraint(weekData, emp.id, 2, { off: true, blocked: {}, preferred: {}, note: '' });
  });
  build(state, weekData);
  state.employees.forEach(function (emp) {
    assertEqual(Store.employeeDayAssignments(state, weekData, emp.id, 2).length, 0,
      emp.name + ' שובץ למרות יום חופש');
  });
});

test('אילוץ חסימת משמרת ספציפית נשמר', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  state.employees.forEach(function (emp) {
    Store.setConstraint(weekData, emp.id, 0, { off: false, blocked: { morning: true }, preferred: {}, note: '' });
  });
  build(state, weekData);
  state.employees.forEach(function (emp) {
    var slots = Store.employeeDayAssignments(state, weekData, emp.id, 0);
    assert(slots.every(function (s) { return s.shiftId !== 'morning'; }), emp.name + ' שובץ לבוקר חסום');
  });
});

test('מכסת משמרות שבועית אינה נחרגת', function () {
  var state = freshState();
  state.employees.forEach(function (emp) { emp.maxShifts = 3; });
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  state.employees.forEach(function (emp) {
    assert(Store.employeeWeekCount(state, weekData, emp.id) <= 3, emp.name + ' חרג ממכסת 3 משמרות');
  });
});

test('שיוך לסניף בכרטיס העובד נשמר', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  state.employees.forEach(function (emp) {
    if (!emp.branches.length) return;
    for (var day = 0; day < 7; day++) {
      Store.employeeDayAssignments(state, weekData, emp.id, day).forEach(function (slot) {
        assert(emp.branches.indexOf(slot.branchId) !== -1, emp.name + ' שובץ לסניף שאינו מוגדר לו');
      });
    }
  });
});

test('סוגי משמרות שאינם מוגדרים לעובד אינם משובצים', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  state.employees.forEach(function (emp) {
    for (var day = 0; day < 7; day++) {
      Store.employeeDayAssignments(state, weekData, emp.id, day).forEach(function (slot) {
        assert(emp.shifts.indexOf(slot.shiftId) !== -1, emp.name + ' שובץ לסוג משמרת לא מורשה');
      });
    }
  });
});

test('עובד לא פעיל אינו משובץ', function () {
  var state = freshState();
  state.employees[0].active = false;
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  assertEqual(Store.employeeWeekCount(state, weekData, state.employees[0].id), 0, 'עובד לא פעיל שובץ');
});

test('כלל המנוחה: אין בוקר אחרי ערב של היום הקודם', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  var report = Validate.validate(state, weekData);
  assertEqual(issuesOfType(report, 'rest').length, 0, 'נמצאה הפרת מנוחה');
});

test('שיבוץ ידני נשמר כאשר מסומן "שמירת שיבוצים ידניים"', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  var branchId = state.branches[0].id;
  var empId = state.employees[4].id; // עובד/ת 5 – משויך לדרום בלבד
  Store.setAssigned(weekData, 0, branchId, 'morning', [empId]);
  weekData.manual[Store.slotKey(0, branchId, 'morning')] = true;
  var result = Scheduler.generate(state, weekData, { attempts: 60, keepManual: true, seed: 999 });
  assertEqual((result.assignments[Store.slotKey(0, branchId, 'morning')] || [])[0], empId,
    'השיבוץ הידני לא נשמר');
});

test('סניף לא פעיל אינו מקבל שיבוצים', function () {
  var state = freshState();
  state.branches[1].active = false;
  var weekData = Store.getWeek(state, '2026-09-13');
  var result = build(state, weekData);
  Object.keys(result.assignments).forEach(function (key) {
    assert(key.split('|')[1] !== state.branches[1].id, 'סניף לא פעיל קיבל שיבוץ');
  });
});

test('שישי: שני עובדים בבוקר וללא משמרות אמצע וערב', function () {
  var state = freshState();
  var friday = Store.weekDemands(state).filter(function (d) { return d.dayIdx === 5; });
  assertEqual(friday.length, state.branches.length, 'משמרת אחת בכל סניף בשישי');
  friday.forEach(function (demand) {
    assertEqual(demand.shiftId, 'morning', 'בשישי רק משמרת בוקר כברירת מחדל');
    assertEqual(demand.need, 2, 'בשישי נדרשים שני עובדים');
  });
});

test('מוצ״ש: משמרת ערב אחת בכל סניף', function () {
  var state = freshState();
  var motzash = Store.weekDemands(state).filter(function (d) { return d.dayIdx === 6; });
  assertEqual(motzash.length, state.branches.length, 'משמרת מוצ״ש בכל סניף');
  motzash.forEach(function (demand) { assertEqual(demand.shiftId, 'evening', 'מוצ״ש היא משמרת ערב'); });
});

console.log('\n== בדיקות תקינות (כפל משמרת וחוסרים) ==');

test('מזהה כפל משמרת: שני עובדים באותה משמרת באותו סניף', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  var branchId = state.branches[0].id; // נדרש עובד אחד בבוקר
  Store.setAssigned(weekData, 0, branchId, 'morning', [state.employees[0].id, state.employees[1].id]);
  var report = Validate.validate(state, weekData);
  var found = issuesOfType(report, 'duplicate-shift');
  assertEqual(found.length, 1, 'לא זוהה כפל משמרת');
  assert(found[0].text.indexOf('כפל משמרת') === 0, 'הניסוח אינו מציין כפל משמרת');
  assert(found[0].text.indexOf(state.employees[0].name) !== -1 &&
    found[0].text.indexOf(state.employees[1].name) !== -1, 'שמות שני העובדים אינם מופיעים בהתראה');
});

test('מזהה אותו עובד פעמיים באותה משמרת', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  var branchId = state.branches[0].id;
  var empId = state.employees[0].id;
  weekData.assignments[Store.slotKey(0, branchId, 'morning')] = [empId, empId];
  var report = Validate.validate(state, weekData);
  assert(issuesOfType(report, 'duplicate-employee-slot').length >= 1, 'לא זוהה עובד כפול באותה משמרת');
});

test('מזהה כפל משמרת לעובד באותו יום בשני סניפים', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  var empId = state.employees[6].id; // מחליף כללי
  Store.setAssigned(weekData, 1, state.branches[0].id, 'morning', [empId]);
  Store.setAssigned(weekData, 1, state.branches[1].id, 'evening', [empId]);
  var report = Validate.validate(state, weekData);
  var found = issuesOfType(report, 'double-booked');
  assertEqual(found.length, 1, 'לא זוהה כפל משמרת לעובד');
  assertEqual(found[0].level, 'error', 'כפל משמרת לעובד אמור להיות שגיאה');
  assert(found[0].text.indexOf('בסניפים שונים') !== -1, 'ההתראה לא מציינת סניפים שונים');
});

test('מזהה חוסר באיוש', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  var report = Validate.validate(state, weekData); // שבוע ריק לגמרי
  var demandSlots = Store.weekDemands(state).length;
  assertEqual(issuesOfType(report, 'understaffed').length, demandSlots, 'לא כל החוסרים זוהו');
});

test('מזהה הפרת אילוץ בשיבוץ ידני', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  var empId = state.employees[0].id;
  Store.setConstraint(weekData, empId, 0, { off: true, blocked: {}, preferred: {}, note: '' });
  Store.setAssigned(weekData, 0, state.branches[0].id, 'morning', [empId]);
  var report = Validate.validate(state, weekData);
  assertEqual(issuesOfType(report, 'constraint-off').length, 1, 'לא זוהתה הפרת יום חופש');
});

test('מזהה שיבוץ בסניף שאינו מוגדר לעובד', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  var empId = state.employees[0].id; // משויך למרכז בלבד
  Store.setAssigned(weekData, 0, state.branches[2].id, 'morning', [empId]);
  var report = Validate.validate(state, weekData);
  assertEqual(issuesOfType(report, 'branch-mismatch').length, 1, 'לא זוהה שיבוץ בסניף לא מורשה');
});

test('מזהה חריגה ממכסת המשמרות', function () {
  var state = freshState();
  state.employees.forEach(function (emp) { emp.maxShifts = 1; });
  var weekData = Store.getWeek(state, '2026-09-13');
  var empId = state.employees[0].id;
  Store.setAssigned(weekData, 0, state.branches[0].id, 'morning', [empId]);
  Store.setAssigned(weekData, 2, state.branches[0].id, 'morning', [empId]);
  var report = Validate.validate(state, weekData);
  assertEqual(issuesOfType(report, 'over-max').length, 1, 'לא זוהתה חריגה ממכסה');
});

test('העדפת משמרת מכובדת כשהיא אפשרית', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  var emp = state.employees[0];
  Store.setConstraint(weekData, emp.id, 3, { off: false, blocked: {}, preferred: { evening: true }, note: '' });
  build(state, weekData);
  var slots = Store.employeeDayAssignments(state, weekData, emp.id, 3);
  assert(slots.some(function (s) { return s.shiftId === 'evening'; }),
    'ההעדפה לא כובדה: ' + JSON.stringify(slots));
});

console.log('\n== מצב ושמירה ==');

test('מפתח השבוע הוא תמיד יום ראשון', function () {
  assertEqual(Store.currentWeekKey(new Date(2026, 8, 17)), '2026-09-13', 'חישוב תחילת השבוע שגוי');
  assertEqual(Store.currentWeekKey(new Date(2026, 8, 13)), '2026-09-13', 'יום ראשון עצמו');
});

test('מעבר בין שבועות מחשב תאריכים נכון', function () {
  assertEqual(Store.shiftWeekKey('2026-09-13', 1), '2026-09-20', 'שבוע הבא');
  assertEqual(Store.shiftWeekKey('2026-09-13', -1), '2026-09-06', 'שבוע קודם');
});

test('migrate משלים שדות חסרים בנתונים ישנים', function () {
  var migrated = Store.migrate({ employees: [{ id: 'x', name: 'בדיקה' }], branches: [{ id: 'b', name: 'ס' }] });
  assertEqual(migrated.employees[0].maxShifts, 6, 'ברירת מחדל למכסה');
  assert(Array.isArray(migrated.employees[0].branches), 'מערך סניפים הושלם');
  assert(migrated.branches[0].schedule, 'לוח הימים והשעות של הסניף הושלם');
  assertEqual(migrated.settings.onePerDay, true, 'הגדרות הושלמו');
});

test('migrate ממיר את המבנה הישן (need + dayShifts) ללוח לפי יום', function () {
  var legacy = {
    settings: { onePerDay: true, dayShifts: { 0: ['morning', 'evening'], 1: ['morning'], 5: ['morning'], 6: [] } },
    branches: [{ id: 'b1', name: 'סניף ותיק', active: true, need: { morning: 1, middle: 1, evening: 2 } }],
    employees: [{ id: 'e1', name: 'עובד ותיק', active: true, branches: [], shifts: ['morning', 'evening'], maxShifts: 5 }],
    weeks: {}
  };
  var migrated = Store.migrate(legacy);
  var branch = migrated.branches[0];
  assertEqual(Store.slotNeed(branch, 0, 'morning'), 1, 'בוקר ביום ראשון נשמר');
  assertEqual(Store.slotNeed(branch, 0, 'evening'), 2, 'כמות הערב נשמרה');
  assertEqual(Store.slotNeed(branch, 0, 'middle'), 0, 'משמרת שלא הייתה פעילה ביום ראשון נשארה סגורה');
  assertEqual(Store.slotNeed(branch, 1, 'evening'), 0, 'יום שני היה בוקר בלבד');
  assert(!branch.need, 'השדה הישן הוסר');
  assert(Store.slotConfig(branch, 6, 'evening'), 'משמרת מוצ״ש נוספה לנתונים ישנים');
  assert(migrated.branches[0].schedule[0].morning.from, 'הושלמו שעות ברירת מחדל');
});

console.log('\n== ימים, שעות ומוצ״ש ==');

test('שעת מוצ״ש מחושבת חצי שעה אחרי צאת השבת', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  weekData.shabbatEnd = '19:42';
  var hours = Store.slotHours(weekData, state.branches[0], 6, 'evening');
  assertEqual(hours.from, '20:12', 'התחלה = צאת שבת + 30 דקות');
  assertEqual(hours.to, '23:00', 'סיום ברירת המחדל');
  assertEqual(Store.hoursLabel(hours), '20:12-23:00', 'תווית השעות');
});

test('קלט שעה מתקבל בכמה פורמטים ותמיד נשמר כ-24 שעות', function () {
  assertEqual(Store.normalizeTimeInput('830'), '08:30', 'ארבע ספרות ללא נקודתיים');
  assertEqual(Store.normalizeTimeInput('1430'), '14:30', 'שעה אחר הצהריים');
  assertEqual(Store.normalizeTimeInput('8:5'), '08:05', 'השלמת אפסים');
  assertEqual(Store.normalizeTimeInput('9'), '09:00', 'שעה עגולה');
  assertEqual(Store.normalizeTimeInput('20.30'), '20:30', 'נקודה כמפריד');
  assertEqual(Store.normalizeTimeInput(''), '', 'ריק נשאר ריק');
  assertEqual(Store.normalizeTimeInput('25:00'), null, 'שעה לא קיימת');
  assertEqual(Store.normalizeTimeInput('12:75'), null, 'דקות לא קיימות');
  assertEqual(Store.normalizeTimeInput('בוקר'), null, 'טקסט חופשי');
});

test('חציית חצות בחישוב שעת מוצ״ש', function () {
  assertEqual(Store.addMinutes('23:45', 30), '00:15', 'מעבר חצות');
  assertEqual(Store.addMinutes('20:00', 30), '20:30', 'חישוב רגיל');
  assertEqual(Store.addMinutes('לא שעה', 30), null, 'קלט לא תקין');
});

test('ללא שעת צאת שבת – אין שעת התחלה והמערכת מתריעה', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  weekData.shabbatEnd = '';
  assertEqual(Store.slotHours(weekData, state.branches[0], 6, 'evening').from, '', 'אין שעת התחלה');
  var report = Validate.validate(state, weekData);
  assertEqual(issuesOfType(report, 'missing-shabbat-end').length, 1, 'לא הוצגה התראה על צאת שבת');
});

test('שעות נערכות לכל סניף ויום בנפרד', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  state.branches[0].schedule[5].morning.from = '08:30';
  state.branches[0].schedule[5].morning.to = '15:00';
  assertEqual(Store.hoursLabel(Store.slotHours(weekData, state.branches[0], 5, 'morning')), '08:30-15:00',
    'השעות של הסניף הראשון השתנו');
  assertEqual(Store.hoursLabel(Store.slotHours(weekData, state.branches[1], 5, 'morning')), '09:00-14:30',
    'הסניף השני לא הושפע');
});

test('סגירת יום בסניף אחד אינה משפיעה על האחרים', function () {
  var state = freshState();
  delete state.branches[0].schedule[5];
  var friday = Store.weekDemands(state).filter(function (d) { return d.dayIdx === 5; });
  assertEqual(friday.length, state.branches.length - 1, 'נותרו דרישות שישי רק בשאר הסניפים');
  assert(Store.activeShiftsForDay(state, 5).indexOf('morning') !== -1, 'שישי עדיין יום פעיל במערכת');
});

test('שינוי כמות העובדים ליום מסוים משפיע על הדרישה ועל זיהוי הכפל', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  var branch = state.branches[0];
  branch.schedule[5].morning.need = 2;
  Store.setAssigned(weekData, 5, branch.id, 'morning', [state.employees[0].id, state.employees[1].id]);
  assertEqual(issuesOfType(Validate.validate(state, weekData), 'duplicate-shift').length, 0,
    'שני עובדים תקינים כשנדרשים שניים');
  branch.schedule[5].morning.need = 1;
  assertEqual(issuesOfType(Validate.validate(state, weekData), 'duplicate-shift').length, 1,
    'אותו שיבוץ הופך לכפל משמרת כשנדרש עובד אחד');
});

test('שיבוץ מוצ״ש מכבד את מגבלת משמרת אחת ביום', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  weekData.shabbatEnd = '20:00';
  build(state, weekData);
  state.employees.forEach(function (emp) {
    assert(Store.employeeDayAssignments(state, weekData, emp.id, 6).length <= 1,
      emp.name + ' שובץ ליותר ממשמרת אחת במוצ״ש');
  });
});

console.log('\n' + (failed === 0 ? '✅ ' : '❌ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
process.exit(failed === 0 ? 0 : 1);
