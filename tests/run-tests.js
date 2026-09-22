/* בדיקות למנוע השיבוץ ולבדיקות התקינות. הרצה: node tests/run-tests.js */
'use strict';

/* הבדיקות כתובות בעברית, ולכן קובעות במפורש את שפת המערכת */
var I18n = require('../js/i18n/core.js');
I18n.use('he');

var Data = require('../js/data.js');
var Store = require('../js/store.js');
var Scheduler = require('../js/scheduler.js');
var Validate = require('../js/validate.js');
var Xlsx = require('../js/xlsx.js');
var Explain = require('../js/explain.js');
var Model = require('../js/backend/model.js');
var fs = require('fs');
var path = require('path');

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
  var weekdaySlots = Store.weekDemands(state, weekData)
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

console.log('\n== בדיקות תקינות (עודף וחוסר באיוש) ==');

test('מזהה עודף באיוש: שני עובדים במשמרת שדורשת אחד', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  var branchId = state.branches[0].id; // נדרש עובד אחד בבוקר
  Store.setAssigned(weekData, 0, branchId, 'morning', [state.employees[0].id, state.employees[1].id]);
  var report = Validate.validate(state, weekData);
  var found = issuesOfType(report, 'duplicate-shift');
  assertEqual(found.length, 1, 'לא זוהה עודף באיוש');
  /* עודף באיוש אינו "כפל משמרת": האנשים שונים, והמקום אחד */
  assert(found[0].text.indexOf('עודף באיוש') === 0,
    'הניסוח אינו מציין עודף באיוש: ' + found[0].text);
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
  var demandSlots = Store.weekDemands(state, weekData).length;
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

console.log('\n== שעות ברירת מחדל ==');

test('שעות ברירת המחדל הן 09:30-16:00 / 12:30-20:00 / 15:00-22:00', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-20');
  var branch = state.branches[0];
  assertEqual(Store.hoursLabel(Store.slotHours(weekData, branch, 0, 'morning')), '09:30-16:00', 'בוקר');
  assertEqual(Store.hoursLabel(Store.slotHours(weekData, branch, 0, 'middle')), '12:30-20:00', 'אמצע');
  assertEqual(Store.hoursLabel(Store.slotHours(weekData, branch, 0, 'evening')), '15:00-22:00', 'ערב');
});

test('שישי נשאר מקוצר ומוצ״ש נשאר לפי צאת שבת', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-20');
  var branch = state.branches[0];
  assertEqual(Store.hoursLabel(Store.slotHours(weekData, branch, 5, 'morning')), '09:30-14:30', 'שישי מקוצר');
  assertEqual(Store.slotConfig(branch, 6, 'evening').auto, 'motzash', 'מוצ״ש אוטומטי');
});

test('החלת שעות ברירת מחדל שומרת על הימים ועל כמות העובדים', function () {
  var state = freshState();
  var branch = state.branches[0];
  branch.schedule[0].morning = { need: 3, from: '08:00', to: '13:00' };
  branch.schedule[1].evening = { need: 2, from: '16:00', to: '21:00' };
  delete branch.schedule[2]; // יום סגור

  var changed = Store.applyDefaultHours(state);
  assert(changed >= 2, 'עודכנו משמרות');
  assertEqual(branch.schedule[0].morning.from, '09:30', 'שעת ההתחלה עודכנה');
  assertEqual(branch.schedule[0].morning.to, '16:00', 'שעת הסיום עודכנה');
  assertEqual(branch.schedule[0].morning.need, 3, 'כמות העובדים נשמרה');
  assertEqual(branch.schedule[1].evening.need, 2, 'כמות העובדים נשמרה גם בערב');
  assert(branch.schedule[2] === undefined, 'יום סגור נשאר סגור');
});

test('החלת שעות אינה נוגעת בשישי ובמוצ״ש', function () {
  var state = freshState();
  var branch = state.branches[0];
  branch.schedule[5].morning.to = '13:45';
  Store.applyDefaultHours(state);
  assertEqual(branch.schedule[5].morning.to, '13:45', 'שישי לא הושפע');
  assertEqual(branch.schedule[6].evening.auto, 'motzash', 'מוצ״ש נשאר אוטומטי');
  assert(!branch.schedule[6].evening.from, 'למוצ״ש אין שעת התחלה קבועה');
});

test('שינוי שעות המשמרת משפיע על ההחלה ועל סניף חדש', function () {
  var state = freshState();
  state.settings.shifts[0].from = '07:00';
  state.settings.shifts[0].to = '12:00';
  Store.applyDefaultHours(state);
  assertEqual(state.branches[0].schedule[0].morning.from, '07:00', 'ההחלה לפי ההגדרה החדשה');

  var fresh = Data.defaultSchedule(null, state.settings.shifts);
  assertEqual(fresh[0].morning.from, '07:00', 'סניף חדש מקבל את השעות החדשות');
  assertEqual(fresh[0].evening.from, '15:00', 'משמרת שלא שונתה נשארת בברירת המחדל');
});

test('migrate משלים את רשימת המשמרות כשהיא חסרה', function () {
  var migrated = Store.migrate({
    settings: { onePerDay: true },
    branches: [{ id: 'b', name: 'ס' }],
    employees: [{ id: 'e', name: 'ע' }],
    weeks: {}
  });
  assertEqual(migrated.settings.shifts.length, 3, 'שלוש משמרות ברירת מחדל');
  assertEqual(migrated.settings.shifts[0].from, '09:30', 'שעות הבוקר');
  assertEqual(migrated.settings.shifts[2].to, '22:00', 'שעות הערב');
});

test('migrate משמר שעות שהוגדרו במבנה הישן', function () {
  var migrated = Store.migrate({
    settings: { onePerDay: true, defaultHours: { morning: { from: '07:15', to: '13:00' } } },
    branches: [{ id: 'b', name: 'ס' }],
    employees: [{ id: 'e', name: 'ע' }],
    weeks: {}
  });
  assertEqual(migrated.settings.shifts[0].from, '07:15', 'השעה הישנה נשמרה');
  assertEqual(migrated.settings.shifts[0].to, '13:00', 'שעת הסיום נשמרה');
  assert(!migrated.settings.defaultHours, 'המבנה הישן הוסר');
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
  assertEqual(Store.hoursLabel(Store.slotHours(weekData, state.branches[1], 5, 'morning')), '09:30-14:30',
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

console.log('\n== ימי חג ==');

test('יום חג מבטל את כל הדרישות של אותו יום', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-20');
  var before = Store.weekDemands(state, weekData).filter(function (d) { return d.dayIdx === 2; }).length;
  assert(before > 0, 'לפני החג יש דרישות ביום שלישי');
  Store.setHoliday(weekData, 2, 'ראש השנה');
  assertEqual(Store.weekDemands(state, weekData).filter(function (d) { return d.dayIdx === 2; }).length, 0,
    'ביום חג אין דרישות');
  assertEqual(Store.activeShiftsForDay(state, 2, weekData).length, 0, 'אין משמרות פעילות ביום חג');
  assertEqual(Store.holidayName(weekData, 2), 'ראש השנה', 'שם החג נשמר');
});

test('השיבוץ האוטומטי אינו משבץ אף אחד ביום חג', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-20');
  Store.setHoliday(weekData, 1, 'סוכות');
  Store.setHoliday(weekData, 2, '');
  build(state, weekData);
  state.employees.forEach(function (emp) {
    assertEqual(Store.employeeDayAssignments(state, weekData, emp.id, 1).length, 0, emp.name + ' שובץ בחג');
    assertEqual(Store.employeeDayAssignments(state, weekData, emp.id, 2).length, 0, emp.name + ' שובץ בחג');
  });
});

test('חג ללא שם מוצג כ"חג"', function () {
  var weekData = Store.emptyWeek();
  Store.setHoliday(weekData, 3, '');
  assert(Store.isHoliday(weekData, 3), 'היום מסומן כחג');
  assertEqual(Store.holidayName(weekData, 3), 'חג', 'שם ברירת מחדל');
});

test('ביטול חג מחזיר את הדרישות', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-20');
  var before = Store.weekDemands(state, weekData).length;
  Store.setHoliday(weekData, 4, 'פסח');
  Store.setHoliday(weekData, 4, null);
  assertEqual(Store.weekDemands(state, weekData).length, before, 'הדרישות חזרו');
  assert(!Store.isHoliday(weekData, 4), 'היום כבר לא חג');
});

test('שיבוץ ידני ביום חג מסומן כאזהרה', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-20');
  Store.setHoliday(weekData, 3, 'שבועות');
  Store.setAssigned(weekData, 3, state.branches[0].id, 'morning', [state.employees[0].id]);
  var report = Validate.validate(state, weekData);
  assertEqual(issuesOfType(report, 'holiday-assignment').length, 1, 'לא זוהה שיבוץ ביום חג');
});

test('חג משחרר קיבולת לשאר השבוע', function () {
  var state = freshState();
  var plain = Store.getWeek(state, '2026-09-20');
  var withoutHoliday = build(state, plain).unfilled.length;

  var state2 = freshState();
  var holidayWeek = Store.getWeek(state2, '2026-09-27');
  Store.setHoliday(holidayWeek, 1, 'חג');
  var withHoliday = build(state2, holidayWeek).unfilled.length;
  assert(withHoliday < withoutHoliday,
    'סגירת יום אמורה להקטין את החוסר (' + withHoliday + ' מול ' + withoutHoliday + ')');
});

console.log('\n== הסבר לחוסר באיוש ==');

test('כל חוסר באיוש מלווה בהסבר', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-20');
  build(state, weekData);
  var report = Validate.validate(state, weekData);
  var shortages = issuesOfType(report, 'understaffed');
  assert(shortages.length > 0, 'בנתוני הדוגמה יש חוסר');
  shortages.forEach(function (item) {
    assert(item.text.indexOf('הסיבה:') !== -1 || item.text.indexOf('אין עובד') !== -1,
      'ההתראה חייבת להסביר את הסיבה: ' + item.text);
  });
});

test('ההסבר מזהה שהעובדים כבר משובצים באותו יום', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-20');
  build(state, weekData);
  var report = Validate.validate(state, weekData);
  var busy = issuesOfType(report, 'understaffed').filter(function (item) {
    return item.text.indexOf('כבר משובצים במשמרת אחרת באותו יום') !== -1;
  });
  assert(busy.length > 0, 'ההסבר אמור לציין שהעובדים תפוסים באותו יום');
  assert(busy[0].text.indexOf('שתי משמרות ביום') !== -1, 'ההסבר מציע פתרון');
});

test('ההסבר מזהה מכסה שבועית מלאה', function () {
  var state = freshState();
  state.employees.forEach(function (emp) { emp.maxShifts = 1; });
  var weekData = Store.getWeek(state, '2026-09-20');
  build(state, weekData);
  var report = Validate.validate(state, weekData);
  var maxed = issuesOfType(report, 'understaffed').filter(function (item) {
    return item.text.indexOf('הגיעו למכסת המשמרות השבועית') !== -1;
  });
  assert(maxed.length > 0, 'ההסבר אמור לציין מכסה מלאה');
  assert(maxed[0].text.indexOf('להעלות את מכסת המשמרות') !== -1, 'ההסבר מציע פתרון');
});

test('ההסבר מזהה שאין עובד מתאים לסניף או למשמרת', function () {
  var state = freshState();
  state.employees.forEach(function (emp) { emp.shifts = ['morning']; });
  var weekData = Store.getWeek(state, '2026-09-20');
  build(state, weekData);
  var report = Validate.validate(state, weekData);
  var none = issuesOfType(report, 'understaffed').filter(function (item) {
    return item.text.indexOf('אין עובד שמוגדר') !== -1;
  });
  assert(none.length > 0, 'ההסבר אמור לציין שאין עובד מתאים');
});

test('לא נותר חוסר כשיש מספיק עובדים', function () {
  var state = freshState();
  // מספיק עובדים לכל משמרת בכל יום
  state.employees = [];
  for (var i = 0; i < 12; i++) {
    state.employees.push({
      id: 'emp-' + i, name: 'עובד/ת ' + (i + 1), active: true, branches: [],
      shifts: ['morning', 'middle', 'evening'], maxShifts: 7, note: ''
    });
  }
  var weekData = Store.getWeek(state, '2026-09-20');
  var result = build(state, weekData);
  assertEqual(result.unfilled.length, 0,
    'עם 12 עובדים ו-9 משמרות ביום הכל אמור להתאייש');
  assertEqual(Validate.validate(state, weekData).errors, 0, 'ללא שגיאות');
});

console.log('\n== סיכום יתרת זמינות ==');

test('בנתוני הדוגמה כל העובדים מנוצלים במלואם', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-20');
  build(state, weekData);
  var summary = Store.weekAvailability(state, weekData);
  assertEqual(summary.totalSpare, 0, 'אין יתרת מכסה');
  assertEqual(summary.freeSlots, 0, 'אין משמרות שאפשר עוד לשבץ');
  assertEqual(summary.rows.length, state.employees.length, 'שורה לכל עובד פעיל');
});

test('יתרת מכסה מחושבת נכון', function () {
  var state = freshState();
  state.employees.forEach(function (emp) { emp.maxShifts = 7; });
  var weekData = Store.getWeek(state, '2026-09-20');
  build(state, weekData);
  var summary = Store.weekAvailability(state, weekData);
  summary.rows.forEach(function (row) {
    assertEqual(row.spare, row.max - row.assigned, row.name + ': יתרה = מכסה פחות משובץ');
    assert(row.available <= row.spare, row.name + ': לא ניתן לשבץ יותר מהיתרה');
    assert(row.available <= row.freeDays.length, row.name + ': לא ניתן לשבץ יותר מהימים הפנויים');
  });
  assert(summary.totalSpare > 0, 'עם מכסה גדולה יותר נותרת יתרה');
});

test('יום שהעובד משובץ בו אינו נחשב יום פנוי', function () {
  var state = freshState();
  state.employees.forEach(function (emp) { emp.maxShifts = 7; });
  var weekData = Store.getWeek(state, '2026-09-20');
  build(state, weekData);
  Store.weekAvailability(state, weekData).rows.forEach(function (row) {
    row.freeDays.forEach(function (day) {
      assertEqual(Store.employeeDayAssignments(state, weekData, row.empId, day).length, 0,
        row.name + ' מסומן פנוי ביום שהוא משובץ בו');
    });
  });
});

test('יום חופש של העובד אינו נחשב יום פנוי', function () {
  var state = freshState();
  state.employees.forEach(function (emp) { emp.maxShifts = 7; });
  var weekData = Store.getWeek(state, '2026-09-20');
  var emp = state.employees[0];
  Store.setConstraint(weekData, emp.id, 3, { off: true, blocked: {}, preferred: {}, note: '' });
  build(state, weekData);
  var row = Store.weekAvailability(state, weekData).rows.filter(function (r) { return r.empId === emp.id; })[0];
  assert(row.freeDays.indexOf(3) === -1, 'יום שסומן כחופש לא נחשב פנוי');
});

test('יום חג אינו נחשב יום פנוי לאף עובד', function () {
  var state = freshState();
  state.employees.forEach(function (emp) { emp.maxShifts = 7; });
  var weekData = Store.getWeek(state, '2026-09-20');
  Store.setHoliday(weekData, 2, 'סוכות');
  build(state, weekData);
  Store.weekAvailability(state, weekData).rows.forEach(function (row) {
    assert(row.freeDays.indexOf(2) === -1, row.name + ': יום חג נספר כיום פנוי');
  });
});

test('עובד שסניפיו סגורים ביום מסוים אינו פנוי בו', function () {
  var state = freshState();
  state.employees.forEach(function (emp) { emp.maxShifts = 7; });
  var branch = state.branches[0];
  state.employees[0].branches = [branch.id];
  delete branch.schedule[5]; // הסניף סגור בשישי
  var weekData = Store.getWeek(state, '2026-09-20');
  build(state, weekData);
  var row = Store.weekAvailability(state, weekData).rows.filter(function (r) {
    return r.empId === state.employees[0].id;
  })[0];
  assert(row.freeDays.indexOf(5) === -1, 'שישי סגור בסניף של העובד ולכן אינו יום פנוי');
});

test('עובד לא פעיל אינו מופיע בסיכום', function () {
  var state = freshState();
  state.employees[0].active = false;
  var weekData = Store.getWeek(state, '2026-09-20');
  build(state, weekData);
  var summary = Store.weekAvailability(state, weekData);
  assertEqual(summary.rows.length, state.employees.length - 1, 'רק עובדים פעילים');
  assert(!summary.rows.some(function (row) { return row.empId === state.employees[0].id; }),
    'העובד הלא פעיל אינו ברשימה');
});

test('יתרה ללא ימים פנויים אינה נספרת כזמינה', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-20');
  var emp = state.employees[0];
  emp.maxShifts = 7;
  // חסימת כל ימות השבוע – נותרה מכסה אך אין יום פנוי
  for (var day = 0; day < 7; day++) {
    Store.setConstraint(weekData, emp.id, day, { off: true, blocked: {}, preferred: {}, note: '' });
  }
  build(state, weekData);
  var row = Store.weekAvailability(state, weekData).rows.filter(function (r) { return r.empId === emp.id; })[0];
  assertEqual(row.assigned, 0, 'לא שובץ כלל');
  assertEqual(row.spare, 7, 'כל המכסה נותרה');
  assertEqual(row.freeDays.length, 0, 'אין ימים פנויים');
  assertEqual(row.available, 0, 'לא ניתן לשבץ אותו בפועל');
});

console.log('\n== מדיניות יום חופש ==');

test('יעד המשמרות מוגבל במספר הימים שהעובד יכול לעבוד', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-20');
  var emp = state.employees[0];
  emp.maxShifts = 7;
  assertEqual(Store.targetShifts(state, weekData, emp), 7, 'ללא חופש – שבעה ימים');
  Store.setConstraint(weekData, emp.id, 3, { off: true, blocked: {}, preferred: {}, note: '' });
  assertEqual(Store.targetShifts(state, weekData, emp), 6, 'עם יום חופש אחד – שישה ימים');
  assertEqual(Store.requestedDaysOff(weekData, emp.id).length, 1, 'יום חופש אחד נספר');
});

test('מכסה נמוכה גוברת על מספר הימים הפנויים', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-20');
  var emp = state.employees[0];
  emp.maxShifts = 3;
  assertEqual(Store.targetShifts(state, weekData, emp), 3, 'המכסה היא הגבול');
});

test('מי שביקש יום חופש אחד משובץ בכל שאר הימים', function () {
  var state = freshState();
  state.employees.forEach(function (e) { e.maxShifts = 7; e.branches = []; });
  var weekData = Store.getWeek(state, '2026-09-20');
  var emp = state.employees[0];
  Store.setConstraint(weekData, emp.id, 3, { off: true, blocked: {}, preferred: {}, note: '' });
  build(state, weekData);
  assertEqual(Store.employeeDayAssignments(state, weekData, emp.id, 3).length, 0, 'יום החופש נשמר');
  assertEqual(Store.employeeWeekCount(state, weekData, emp.id),
    Store.targetShifts(state, weekData, emp), 'עובד בכל שאר הימים האפשריים');
});

test('סימון יותר מיום חופש אחד מפיק אזהרה', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-20');
  var emp = state.employees[1];
  Store.setConstraint(weekData, emp.id, 1, { off: true, blocked: {}, preferred: {}, note: '' });
  Store.setConstraint(weekData, emp.id, 4, { off: true, blocked: {}, preferred: {}, note: '' });
  var found = issuesOfType(Validate.validate(state, weekData), 'extra-days-off');
  assertEqual(found.length, 1, 'אזהרה אחת על ריבוי ימי חופש');
  assert(found[0].text.indexOf('שני, חמישי') !== -1, 'האזהרה מפרטת את הימים');
});

test('כיבוי המדיניות מבטל את האזהרה', function () {
  var state = freshState();
  state.settings.oneDayOffPerWeek = false;
  var weekData = Store.getWeek(state, '2026-09-20');
  var emp = state.employees[1];
  Store.setConstraint(weekData, emp.id, 1, { off: true, blocked: {}, preferred: {}, note: '' });
  Store.setConstraint(weekData, emp.id, 4, { off: true, blocked: {}, preferred: {}, note: '' });
  assertEqual(issuesOfType(Validate.validate(state, weekData), 'extra-days-off').length, 0,
    'ללא המדיניות אין אזהרה');
});

test('יום חג אינו נספר כיום חופש שהעובד ביקש', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-20');
  Store.setHoliday(weekData, 2, 'סוכות');
  var emp = state.employees[0];
  Store.setConstraint(weekData, emp.id, 3, { off: true, blocked: {}, preferred: {}, note: '' });
  assertEqual(Store.requestedDaysOff(weekData, emp.id).length, 1, 'רק היום שהעובד ביקש נספר');
  assertEqual(issuesOfType(Validate.validate(state, weekData), 'extra-days-off').length, 0,
    'חג אינו יוצר אזהרת ריבוי ימי חופש');
});

console.log('\n== ייצוא לאקסל ==');

function readZipEntries(bytes) {
  /* קריאת שמות הקבצים מתוך הספרייה המרכזית של ה-ZIP */
  var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  var names = [];
  for (var i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      var count = view.getUint16(i + 10, true);
      var offset = view.getUint32(i + 16, true);
      for (var n = 0; n < count; n++) {
        var nameLength = view.getUint16(offset + 28, true);
        var extraLength = view.getUint16(offset + 30, true);
        var commentLength = view.getUint16(offset + 32, true);
        names.push(Buffer.from(bytes.slice(offset + 46, offset + 46 + nameLength)).toString('utf8'));
        offset += 46 + nameLength + extraLength + commentLength;
      }
      return names;
    }
  }
  throw new Error('לא נמצאה ספריית ZIP מרכזית');
}

function sampleWorkbook() {
  return Xlsx.build([
    {
      name: 'לפי סניף', selected: true, cols: [18, 10], freeze: { row: 4, col: 2 },
      merges: [{ r1: 3, c1: 0, r2: 5, c2: 0 }],
      rows: [
        { cells: [{ v: 'סידור עבודה', s: Xlsx.STYLE.TITLE }], height: 22 },
        [{ v: 'צאת שבת 19:45 & "מוצ״ש"', s: Xlsx.STYLE.SUBTITLE }],
        [],
        [{ v: 'מייפון מרכז', s: Xlsx.STYLE.ROW_HEAD }, { v: '09:00-14:00\nעובד/ת 1', s: Xlsx.STYLE.MORNING }]
      ]
    },
    { name: 'לפי עובד', rows: [[{ v: 'עובד/ת 1', s: Xlsx.STYLE.ROW_HEAD }, { v: 6, s: Xlsx.STYLE.TOTAL }]] }
  ]);
}

test('נוצר קובץ ZIP תקין עם כל חלקי ה-xlsx', function () {
  var bytes = sampleWorkbook();
  assertEqual(bytes[0], 0x50, 'חתימת ZIP');
  assertEqual(bytes[1], 0x4B, 'חתימת ZIP');
  var names = readZipEntries(bytes);
  ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
    'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'].forEach(function (name) {
    assert(names.indexOf(name) !== -1, 'חסר הקובץ ' + name + ' (יש: ' + names.join(', ') + ')');
  });
});

test('שמות הגיליונות והתוכן נכתבים לקובץ', function () {
  var text = Buffer.from(sampleWorkbook()).toString('utf8');
  assert(text.indexOf('לפי סניף') !== -1, 'שם הגיליון הראשון');
  assert(text.indexOf('לפי עובד') !== -1, 'שם הגיליון השני');
  assert(text.indexOf('עובד/ת 1') !== -1, 'תוכן התא');
  assert(text.indexOf('rightToLeft="1"') !== -1, 'גיליון מימין לשמאל');
  assert(text.indexOf('state="frozen"') !== -1, 'הקפאת שורת הכותרת');
  assert(text.indexOf('<mergeCell ref="A4:A6"/>') !== -1, 'מיזוג תא שם הסניף');
});

test('תווים מיוחדים בטקסט מקודדים כראוי', function () {
  var text = Buffer.from(sampleWorkbook()).toString('utf8');
  assert(text.indexOf('&amp;') !== -1, 'הסימן & קודד');
  assert(text.indexOf('&quot;') !== -1, 'מרכאות קודדו');
  assert(text.indexOf('&#10;') !== -1, 'ירידת שורה בתוך תא קודדה');
  assert(text.indexOf('& "מוצ') === -1, 'לא נשאר טקסט לא מקודד');
});

test('מספרים נשמרים כמספרים ולא כטקסט', function () {
  var text = Buffer.from(sampleWorkbook()).toString('utf8');
  var expected = '<c r="B1" s="' + Xlsx.STYLE.TOTAL + '"><v>6</v></c>';
  assert(text.indexOf(expected) !== -1, 'תא מספרי נכתב ללא inlineStr (' + expected + ')');
});

test('לכל צבע משמרת יש עיצוב משלו בקובץ', function () {
  assertEqual(new Set(Xlsx.SHIFT_FILLS).size, Xlsx.SHIFT_FILLS.length, 'שמונה צבעים שונים');
  var styles = Xlsx.SHIFT_FILLS.map(function (_, index) { return Xlsx.shiftStyle(index); });
  assertEqual(new Set(styles).size, styles.length, 'מזהה עיצוב ייחודי לכל צבע');
  assertEqual(Xlsx.shiftStyle(99), Xlsx.shiftStyle(99 % Xlsx.SHIFT_FILLS.length), 'מספר חורג מתגלגל');

  var text = Buffer.from(Xlsx.build([
    { name: 'צבעים', rows: [Xlsx.SHIFT_FILLS.map(function (_, i) {
      return { v: 'משמרת ' + i, s: Xlsx.shiftStyle(i) }; })] }
  ])).toString('utf8');
  Xlsx.SHIFT_FILLS.forEach(function (rgb) {
    assert(text.indexOf(rgb) !== -1, 'הצבע ' + rgb + ' נכתב לקובץ');
  });
});

test('שמות עמודות מחושבים נכון', function () {
  assertEqual(Xlsx.colName(0), 'A', 'עמודה ראשונה');
  assertEqual(Xlsx.colName(8), 'I', 'עמודה תשיעית');
  assertEqual(Xlsx.colName(25), 'Z', 'עמודה 26');
  assertEqual(Xlsx.colName(26), 'AA', 'עמודה 27');
});

test('שמות לשוניות כפולים מקבלים סיומת ייחודית', function () {
  var names = Xlsx.uniqueSheetNames([
    { name: 'דני כהן' }, { name: 'דני כהן' }, { name: 'דני כהן' }, { name: 'מיכל לוי' }
  ]);
  assertEqual(names[0], 'דני כהן', 'הראשון נשאר כפי שהוא');
  assertEqual(names[1], 'דני כהן (2)', 'השני מקבל סיומת');
  assertEqual(names[2], 'דני כהן (3)', 'השלישי מקבל סיומת');
  assertEqual(names[3], 'מיכל לוי', 'שם אחר לא מושפע');
  assertEqual(new Set(names).size, names.length, 'כל השמות ייחודיים');
});

test('שמות שנעשים זהים אחרי ניקוי תווים אסורים נשארים ייחודיים', function () {
  var names = Xlsx.uniqueSheetNames([{ name: 'עובד/ת 1' }, { name: 'עובד:ת 1' }]);
  assertEqual(new Set(names).size, 2, 'שני שמות שונים גם אחרי הניקוי');
});

test('שם ארוך שחוזר על עצמו נשאר בגבול 31 תווים', function () {
  var long = 'שם עובד ארוך במיוחד שחורג בהרבה מהמגבלה';
  var names = Xlsx.uniqueSheetNames([{ name: long }, { name: long }, { name: long }]);
  names.forEach(function (name) { assert(name.length <= 31, 'אורך חוקי: ' + name + ' (' + name.length + ')'); });
  assertEqual(new Set(names).size, 3, 'שלושה שמות ייחודיים');
});

test('חוברת עם לשונית לכל עובד נבנית תקין', function () {
  var sheets = [{ name: 'לפי סניף', selected: true, rows: [[{ v: 'סיכום', s: Xlsx.STYLE.TITLE }]] }];
  ['דני', 'מיכל', 'יוסי'].forEach(function (name) {
    sheets.push({ name: name, rows: [[{ v: 'סידור אישי – ' + name, s: Xlsx.STYLE.TITLE }]] });
  });
  var text = Buffer.from(Xlsx.build(sheets)).toString('utf8');
  ['דני', 'מיכל', 'יוסי'].forEach(function (name) {
    assert(text.indexOf('<sheet name="' + name + '"') !== -1, 'לשונית ' + name + ' קיימת');
    assert(text.indexOf('סידור אישי – ' + name) !== -1, 'תוכן הלשונית של ' + name);
  });
  assert(text.indexOf('worksheets/sheet4.xml') !== -1, 'נוצרו ארבעה גיליונות');
});

test('שם גיליון ארוך או עם תווים אסורים מנוקה', function () {
  var text = Buffer.from(Xlsx.build([
    { name: 'סניף/מרכז: דוח [2026] ארוך מאוד מאוד מאוד מאוד', rows: [['א']] }
  ])).toString('utf8');
  var match = /<sheet name="([^"]*)"/.exec(text);
  assert(match, 'נמצא שם גיליון');
  assert(match[1].length <= 31, 'שם הגיליון קוצר ל-31 תווים');
  assert(!/[:\\\/?*\[\]]/.test(match[1]), 'הוסרו תווים אסורים: ' + match[1]);
});

console.log('\n== מועד סגירת ההגשות ==');

/* הפרש בימים בין תאריכים, בלי שעת היום. השוואת חותמות זמן
   ישירות נותנת 6.17 במקום 7, כי המועד הוא ב-20:00 והשבוע מתחיל
   בחצות – וזו טעות שקל מאוד לעשות בבדיקה ולא לשים לב. */
function daysApart(later, earlier) {
  function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  return Math.round((midnight(later) - midnight(earlier)) / 86400000);
}

function stateWithDeadline(patch) {
  var state = freshState();
  state.settings.constraintsDeadline = Object.assign(
    { enabled: true, dayIdx: 4, time: '20:00', remindHours: 24 }, patch || {});
  return state;
}

test('המועד נופל לפני תחילת השבוע, ביום שנבחר', function () {
  var state = stateWithDeadline();          // חמישי 20:00
  var at = Store.deadlineFor(state, '2026-09-27');   // שבוע שמתחיל בראשון
  assertEqual(at.getDay(), 4, 'היום בשבוע אינו חמישי');
  assert(at < Store.dateOfDay('2026-09-27', 0), 'המועד אינו לפני תחילת השבוע');
  assertEqual(at.getHours(), 20, 'השעה אינה 20');
  assertEqual(daysApart(Store.dateOfDay('2026-09-27', 0), at), 3,
    'המרחק מתחילת השבוע אינו שלושה ימים');
});

test('מועד ביום תחילת השבוע נופל שבוע קודם ולא באותו יום', function () {
  var state = stateWithDeadline({ dayIdx: 0 });      // ראשון
  var at = Store.deadlineFor(state, '2026-09-27');
  assertEqual(at.getDay(), 0, 'היום אינו ראשון');
  assertEqual(daysApart(Store.dateOfDay('2026-09-27', 0), at), 7,
    'המועד אינו שבוע לפני');
});

test('כשההגדרה כבויה אין מועד ואין חסימה', function () {
  var state = stateWithDeadline({ enabled: false });
  assertEqual(Store.deadlineFor(state, '2026-09-27'), null, 'הוחזר מועד למרות שכבוי');
  assertEqual(Store.deadlinePassed(state, '2026-09-27', new Date('2030-01-01')), false,
    'נחסם למרות שההגדרה כבויה');
});

test('הרגע המדויק: לפני המועד פתוח, אחריו סגור', function () {
  var state = stateWithDeadline();
  var at = Store.deadlineFor(state, '2026-09-27');
  assertEqual(Store.deadlinePassed(state, '2026-09-27', new Date(at.getTime() - 1000)), false,
    'נחסם שנייה לפני המועד');
  assertEqual(Store.deadlinePassed(state, '2026-09-27', at), false, 'נחסם בדיוק במועד');
  assertEqual(Store.deadlinePassed(state, '2026-09-27', new Date(at.getTime() + 1000)), true,
    'לא נחסם שנייה אחרי המועד');
});

test('התזכורת יוצאת רק בתוך החלון שהמנהל קבע', function () {
  var state = stateWithDeadline({ remindHours: 24 });
  var at = Store.deadlineFor(state, '2026-09-27');
  function at_(hoursBefore) { return new Date(at.getTime() - hoursBefore * 3600000); }
  assertEqual(Store.shouldRemind(state, '2026-09-27', at_(25)), false, 'תזכורת מוקדמת מדי');
  assertEqual(Store.shouldRemind(state, '2026-09-27', at_(23)), true, 'לא תוזכר בתוך החלון');
  assertEqual(Store.shouldRemind(state, '2026-09-27', at_(1)), true, 'לא תוזכר שעה לפני');
  assertEqual(Store.shouldRemind(state, '2026-09-27', new Date(at.getTime() + 1000)), false,
    'תוזכר אחרי שהמועד עבר');
});

test('חלון תזכורת אחר משנה רק את התזכורת ולא את המועד', function () {
  var wide = stateWithDeadline({ remindHours: 72 });
  var at = Store.deadlineFor(wide, '2026-09-27');
  assertEqual(Store.shouldRemind(wide, '2026-09-27', new Date(at.getTime() - 48 * 3600000)), true,
    'חלון של 72 שעות לא תפס 48 שעות לפני');
  var narrow = stateWithDeadline({ remindHours: 6 });
  assertEqual(Store.shouldRemind(narrow, '2026-09-27', new Date(at.getTime() - 48 * 3600000)), false,
    'חלון של 6 שעות תפס 48 שעות לפני');
  assertEqual(Store.deadlineFor(narrow, '2026-09-27').getTime(), at.getTime(),
    'המועד עצמו השתנה בגלל חלון התזכורת');
});

test('הסכימה אוכפת את המועד גם בשרת', function () {
  var schema = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  assert(schema.indexOf('constraints_deadline') !== -1,
    'אין פונקציית מועד בסכימה');
  var body = schema.slice(schema.indexOf('function public.save_own_constraint'));
  body = body.slice(0, body.indexOf('$$;'));
  assert(body.indexOf('constraints_deadline') !== -1,
    'save_own_constraint אינה בודקת את המועד – עובד יוכל לעקוף מהדפדפן');
  assert(body.indexOf("v_role = 'employee'") !== -1,
    'הבדיקה אינה מוגבלת לעובדים, ותחסום גם מנהל');
});

console.log('\n== טיוטה ופרסום ==');

/* בלי פרסום מפורש העובד אינו רואה סידור. לכן "מה מצב הפרסום" הוא
   נתון שנגזר מהמצב, ולא דגל שמישהו צריך לזכור לעדכן. */
test('סידור חדש הוא טיוטה', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  assertEqual(Store.publishState(weekData), Store.PUBLISH_STATE.DRAFT,
    'סידור שלא פורסם אינו טיוטה');
});

test('אחרי פרסום נשמרות גם השעה וגם החתימה', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  Store.markPublished(weekData, new Date('2026-09-11T20:30:00Z'));
  assertEqual(Store.publishState(weekData), Store.PUBLISH_STATE.PUBLISHED,
    'שבוע שפורסם אינו מסומן כמפורסם');
  assertEqual(weekData.publishedAt, '2026-09-11T20:30:00.000Z', 'שעת הפרסום לא נשמרה');
  assertEqual(weekData.publishedSignature, Store.scheduleSignature(weekData),
    'החתימה אינה של מה שפורסם');
});

test('שינוי בשיבוצים אחרי פרסום מסומן כשינוי', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  Store.markPublished(weekData);

  var key = Object.keys(weekData.assignments).filter(function (k) {
    return (weekData.assignments[k] || []).length;
  })[0];
  var slot = Explain.parseSlotKey(key);
  Store.setAssigned(weekData, slot.dayIdx, slot.branchId, slot.shiftId, []);

  assertEqual(Store.publishState(weekData), Store.PUBLISH_STATE.CHANGED,
    'שיבוץ שהוסר אחרי הפרסום אינו מסומן כשינוי');
  Store.markPublished(weekData);
  assertEqual(Store.publishState(weekData), Store.PUBLISH_STATE.PUBLISHED,
    'פרסום העדכונים אינו מאפס את הסימון');
});

test('שינוי בהערת השבוע נחשב שינוי, סימון ידני לא', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  Store.markPublished(weekData);

  /* סימון "שובץ ידנית" הוא זיכרון של המנוע ואינו מגיע למסך העובד */
  weekData.manual[Object.keys(weekData.assignments)[0]] = true;
  assertEqual(Store.publishState(weekData), Store.PUBLISH_STATE.PUBLISHED,
    'סימון ידני נחשב בטעות לשינוי בסידור');

  weekData.note = 'מי שמחליף – לתאם מראש';
  assertEqual(Store.publishState(weekData), Store.PUBLISH_STATE.CHANGED,
    'הערה חדשה לעובדים אינה נחשבת שינוי');
});

test('סדר העובדים באותה משמרת אינו שינוי', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  var key = Object.keys(weekData.assignments).filter(function (k) {
    return (weekData.assignments[k] || []).length > 1;
  })[0];
  if (!key) return;   // סידור בלי משמרת דו-אישית – אין מה לבדוק
  Store.markPublished(weekData);
  weekData.assignments[key] = weekData.assignments[key].slice().reverse();
  assertEqual(Store.publishState(weekData), Store.PUBLISH_STATE.PUBLISHED,
    'היפוך סדר באותה משמרת נחשב בטעות לשינוי');
});

test('החזרה לטיוטה מנקה את החתימה', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  Store.markPublished(weekData);
  Store.markDraft(weekData);
  assertEqual(Store.publishState(weekData), Store.PUBLISH_STATE.DRAFT,
    'החזרה לטיוטה לא החזירה לטיוטה');
  assertEqual(weekData.publishedSignature, '', 'החתימה נשארה אחרי החזרה לטיוטה');
});

test('שבוע ותיק שפורסם בלי חתימה אינו מוכרז כשונה', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  weekData.published = true;
  weekData.publishedSignature = '';
  assertEqual(Store.publishState(weekData), Store.PUBLISH_STATE.PUBLISHED,
    'טענה על שינוי בלי בסיס להשוואה');
});

console.log('\n== למה שובץ ככה ==');

/* ההסבר חייב להיגזר מאותם תנאים שהמנוע החליט לפיהם. בדיקה שמסתפקת
   ב"יש טקסט" מאשרת סיפור יפה; כאן נבדק שהעובדות נכונות. */
function everyAssignment(state, weekData, visit) {
  Object.keys(weekData.assignments || {}).forEach(function (key) {
    var slot = Explain.parseSlotKey(key);
    (weekData.assignments[key] || []).forEach(function (empId) { visit(slot, empId); });
  });
}

test('לכל שיבוץ בסידור יש הסבר', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  var checked = 0;
  everyAssignment(state, weekData, function (slot, empId) {
    var why = Explain.forAssignment(state, weekData, slot, empId);
    assert(why, 'אין הסבר לשיבוץ ' + empId + ' ביום ' + slot.dayIdx);
    assert(why.facts.length >= 3, 'הסבר דל מדי: ' + JSON.stringify(why.facts));
    checked++;
  });
  assert(checked > 20, 'נבדקו מעט מדי שיבוצים: ' + checked);
});

test('ההסבר טוען רק עובדות נכונות על העובד', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  everyAssignment(state, weekData, function (slot, empId) {
    var emp = Store.byId(state.employees, empId);
    var why = Explain.forAssignment(state, weekData, slot, empId);
    why.facts.forEach(function (fact) {
      if (fact.code === 'qualified') {
        assert(emp.shifts.indexOf(slot.shiftId) !== -1,
          'נטען שהעובד מוסמך למשמרת שאינה ברשימה שלו');
      }
      if (fact.code === 'assignedBranch') {
        assert(emp.branches && emp.branches.length,
          'נטען שהעובד משויך לסניף, אבל הוא מחליף כללי');
        assert(emp.branches.indexOf(slot.branchId) !== -1,
          'נטען שהעובד משויך לסניף הזה, והוא אינו');
      }
      if (fact.code === 'anyBranch') {
        assert(!emp.branches || !emp.branches.length,
          'נטען שהעובד מחליף כללי, אבל הוא משויך לסניפים');
      }
      if (fact.code === 'requested') {
        var constraint = Store.getConstraint(weekData, empId, slot.dayIdx);
        assert(constraint.preferred && constraint.preferred[slot.shiftId],
          'נטען שהעובד ביקש את המשמרת, והוא לא');
      }
      if (fact.code === 'quota') {
        /* המספר שאחרי השיבוץ הוא בדיוק המספר שמופיע בסיכום הסידור.
           אי-התאמה כאן היא סתירה גלויה על המסך. */
        assertEqual(fact.params.after,
          Store.employeeWeekCount(state, weekData, empId),
          'המספר בהסבר אינו זהה לזה שבסיכום הסידור');
        assertEqual(fact.params.before + 1, fact.params.after,
          'לפני ואחרי אינם עוקבים');
        assertEqual(fact.params.max, emp.maxShifts || 0,
          'ההסבר מציג מכסה שאינה המכסה של העובד');
        assert(fact.params.after <= (emp.maxShifts || 99),
          'המכסה בהסבר חורגת מהמכסה של העובד');
      }
      if (fact.code === 'capacity') {
        assert(fact.params.target < fact.params.max,
          'הערת הזמינות מוצגת כשאין מה להעיר');
        assertEqual(fact.params.target, Store.targetShifts(state, weekData, emp),
          'הזמינות בהערה אינה הזמינות שהמנוע מחשב');
      }
    });
  });
});

test('חלופה שנפסלה – הסיבה נבדקת מול הנתונים', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  var seen = {};
  everyAssignment(state, weekData, function (slot, empId) {
    var why = Explain.forAssignment(state, weekData, slot, empId);
    why.alternatives.blocked.forEach(function (item) {
      seen[item.reason.code] = (seen[item.reason.code] || 0) + 1;
      var other = Store.byId(state.employees, item.id);
      if (item.reason.code === 'notQualified') {
        assert(other.shifts.indexOf(slot.shiftId) === -1,
          'נטען שאינו מוסמך, והוא כן');
      }
      if (item.reason.code === 'otherBranch') {
        assert(other.branches.length && other.branches.indexOf(slot.branchId) === -1,
          'נטען שהוא שייך לסניף אחר, והוא כן מורשה כאן');
      }
      if (item.reason.code === 'requestedOff') {
        assert(Store.getConstraint(weekData, other.id, slot.dayIdx).off,
          'נטען שביקש חופש, ולא ביקש');
      }
      if (item.reason.code === 'atLimit') {
        assert(Store.employeeWeekCount(state, weekData, other.id) >= other.maxShifts,
          'נטען שהגיע למכסה, ולא הגיע');
      }
    });
  });
  /* אם אף חלופה לא נפסלה מעולם, הבדיקה לא בדקה כלום */
  assert(Object.keys(seen).length >= 2,
    'לא נמצאו מספיק סוגי פסילה: ' + JSON.stringify(seen));
});

test('עובד שאינו משובץ שם אינו מקבל הסבר', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);
  var slot = Explain.parseSlotKey(Object.keys(weekData.assignments)[0]);
  var assigned = Store.getAssigned(weekData, slot.dayIdx, slot.branchId, slot.shiftId);
  var outsider = state.employees.filter(function (emp) {
    return assigned.indexOf(emp.id) === -1;
  })[0];
  assertEqual(Explain.forAssignment(state, weekData, slot, outsider.id), null,
    'התקבל הסבר לעובד שאינו משובץ');
});

test('ההסבר נכון גם אחרי שינוי ידני של המנהל', function () {
  var state = freshState();
  var weekData = Store.getWeek(state, '2026-09-13');
  build(state, weekData);

  /* מוצאים משמרת ועובד שמותר לשבץ אליה, ומשבצים ביד */
  var slot = null, picked = null;
  Store.weekDemands(state, weekData).some(function (demand) {
    var assigned = Store.getAssigned(weekData, demand.dayIdx, demand.branchId, demand.shiftId);
    return state.employees.some(function (emp) {
      if (assigned.indexOf(emp.id) !== -1) return false;
      if (emp.shifts.indexOf(demand.shiftId) === -1) return false;
      if (emp.branches.length && emp.branches.indexOf(demand.branchId) === -1) return false;
      slot = demand; picked = emp;
      return true;
    });
  });
  assert(picked, 'לא נמצא עובד לשיבוץ ידני');

  var current = Store.getAssigned(weekData, slot.dayIdx, slot.branchId, slot.shiftId);
  Store.setAssigned(weekData, slot.dayIdx, slot.branchId, slot.shiftId,
    current.concat([picked.id]));

  var why = Explain.forAssignment(state, weekData, slot, picked.id);
  assert(why, 'אין הסבר לשיבוץ ידני');
  assertEqual(why.employee.id, picked.id, 'ההסבר מתייחס לעובד אחר');
  assert(why.facts.some(function (f) { return f.code === 'qualified'; }),
    'ההסבר אינו כולל את ההסמכה למשמרת');
});

console.log('\n== סכימת בסיס הנתונים ==');

/* שורת הערה שכל תוכנה סימנים — למשל מסגרת של "=" — מתהפכת
   בעורכים שמציגים מימין לשמאל, שני המקפים הולכים לאיבוד,
   וההרצה נכשלת בשורה הראשונה. זה קרה לנו באמת. */
test('אין בסכימה שורת הערה שמתהפכת בעורך מימין לשמאל', function () {
  var schema = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  var fragile = [];
  schema.split('\n').forEach(function (line, index) {
    var trimmed = line.trim();
    if (!trimmed || trimmed === '--') return;
    if (/^--\s*[^\w\u0590-\u05FF]+$/.test(trimmed)) {
      fragile.push((index + 1) + ': ' + trimmed);
    }
  });
  assert(fragile.length === 0, 'שורות שבריריות:\n      ' + fragile.join('\n      '));
});

test('הסכימה נפתחת בשורה באנגלית', function () {
  var schema = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  var first = schema.split('\n')[0];
  assert(/^-- [A-Za-z]/.test(first), 'השורה הראשונה אינה מתחילה בתווית לטינית: ' + first);
});

console.log('\n== העמודים המשפטיים ==');

/* בעמודים האלה יש עובדות שרק בעל העסק יודע (שם רשום, כתובת, אזור
   האחסון, הדין החל). הן מסומנות כ-{{PLACEHOLDER}} ומוזרקות בבנייה.
   מפתח שאינו מוכר לבנייה היה נשאר על העמוד כסוגריים – במסמך מחייב. */
var LEGAL_FILES = ['privacy.html', 'terms.html', 'security.html'];

function legalPlaceholders() {
  var found = {};
  LEGAL_FILES.forEach(function (name) {
    var html = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
    (html.match(/\{\{[A-Z_]+\}\}/g) || []).forEach(function (token) {
      found[token.slice(2, -2)] = name;
    });
  });
  return found;
}

test('כל מפתח בעמודים המשפטיים מוכר לבנייה', function () {
  var build = fs.readFileSync(path.join(__dirname, '..', 'build-site.js'), 'utf8');
  var block = build.slice(build.indexOf('const LEGAL = {'));
  block = block.slice(0, block.indexOf('};'));
  var known = {};
  (block.match(/^\s*([A-Z_]+):/gm) || []).forEach(function (line) {
    known[line.replace(/[^A-Z_]/g, '')] = true;
  });

  var used = legalPlaceholders();
  var names = Object.keys(used);
  assert(names.length >= 5, 'לא נמצאו מפתחות בעמודים המשפטיים: ' + names.length);
  names.forEach(function (key) {
    assert(known[key], key + ' מופיע ב-' + used[key] +
      ' אבל build-site.js אינו יודע למלא אותו');
  });
});

test('שלושת העמודים קיימים בשתי שפות ומקושרים זה לזה', function () {
  LEGAL_FILES.forEach(function (name) {
    var html = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
    assert(html.indexOf('data-legal="he"') !== -1, name + ': חסרה גרסה עברית');
    assert(html.indexOf('data-legal="en"') !== -1, name + ': חסרה גרסה אנגלית');
    /* כתובת התמיכה מגיעה ממקום אחד, ולא נכתבת שוב בכל עמוד */
    assert(html.indexOf('{{SUPPORT_EMAIL}}') !== -1,
      name + ': כתובת התמיכה נכתבה ידנית ולא דרך המפתח');
    ['/privacy/', '/terms/', '/security/'].forEach(function (href) {
      assert(html.indexOf(href) !== -1, name + ': אין קישור אל ' + href);
    });
  });
});

test('עמוד האבטחה אומר גם מה עוד לא קיים', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'security.html'), 'utf8');
  /* עמוד אבטחה שמבטיח הכל אינו עמוד אבטחה */
  assert(html.indexOf('אימות דו-שלבי') !== -1 && html.indexOf('SOC 2') !== -1,
    'העמוד מבטיח בלי לציין את הגבולות');
});

console.log('\n== כתובת התמיכה ==');

test('כתובת התמיכה מוגדרת במקום אחד ותקינה', function () {
  assert(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(Model.SUPPORT_EMAIL),
    'כתובת תמיכה לא תקינה: ' + Model.SUPPORT_EMAIL);
  assert(Model.SUPPORT_EMAIL.indexOf('setshifts.com') !== -1,
    'כתובת התמיכה אינה על הדומיין של המוצר: ' + Model.SUPPORT_EMAIL);
});

test('לכל שפה יש נוסח לפנייה לתמיכה', function () {
  I18n.list().forEach(function (lang) {
    I18n.use(lang.code);
    var text = I18n.t('common.emailUs');
    assert(text && text !== 'common.emailUs', lang.code + ': חסר תרגום');
  });
  I18n.use('he');
});

console.log('\n== מונחים ==');

/* שלושה מקרים שונים נשאו בכל השפות את אותו שם, ולכן ההתראה לא אמרה
   למנהל מה קרה: יותר אנשים ממה שנדרש במשמרת אחת, אותו אדם פעמיים
   באותה משמרת, ואותו אדם בשתי משמרות ביום. */
test('עודף באיוש, שיבוץ כפול וכפל משמרות אינם חולקים שם', function () {
  var types = ['duplicate-shift', 'duplicate-employee-slot', 'double-booked'];
  I18n.list().forEach(function (lang) {
    I18n.use(lang.code);
    var seen = {};
    types.forEach(function (type) {
      var label = I18n.t('issueTypes.' + type);
      assert(label && label !== 'issueTypes.' + type, lang.code + ': חסר תרגום ל-' + type);
      assert(!seen[label], lang.code + ': "' + label + '" משמש גם ל-' + seen[label] +
        ' וגם ל-' + type + ', ולכן המנהל אינו יודע מה קרה');
      seen[label] = type;
    });
  });
  I18n.use('he');
});

test('כל התראה נפתחת בשם המקרה שלה', function () {
  var pairs = [['alerts.duplicate', 'duplicate-shift'],
    ['alerts.duplicateSelf', 'duplicate-employee-slot'],
    ['alerts.doubleBooked', 'double-booked']];
  I18n.list().forEach(function (lang) {
    I18n.use(lang.code);
    pairs.forEach(function (pair) {
      var text = I18n.t(pair[0]);
      var label = I18n.t('issueTypes.' + pair[1]);
      assert(text.indexOf(label) === 0,
        lang.code + ' – ' + pair[0] + ' אינה נפתחת ב"' + label + '": ' + text);
    });
  });
  I18n.use('he');
});

test('באנגלית "double booking" אינו מתאר עודף באיוש', function () {
  I18n.use('en');
  assertEqual(I18n.t('issueTypes.duplicate-shift'), 'Overstaffed',
    'עודף באיוש נקרא באנגלית בשם של מקרה אחר');
  assertEqual(I18n.t('issueTypes.double-booked'), 'Double booking',
    'המקרה שהוא באמת double booking אינו נקרא כך');
  assert(I18n.t('alerts.duplicate').toLowerCase().indexOf('double') === -1,
    'ההתראה על עודף באיוש עדיין מדברת על double booking');
  I18n.use('he');
});

console.log('\n== אייקונים בכפתורים ==');

/* האייקון שייך לפריסה, והתרגום נותן רק את המילים. כשגם התרגום כלל
   אייקון, כפתורים בעברית הציגו "✨✨" ו-"🔒🔒" – ובשפות אחרות
   האייקון היה חסר. הבדיקה סוגרת את שתי הצורות בבת אחת. */
var EMOJI_START = /^[\u2190-\u2BFF\u2600-\u27BF\uD83C-\uDBFF]/;

/* מפתחות שהפריסה מקדימה להם אייקון בקוד ולא ב-HTML */
var PREFIXED_IN_JS = ['toolbar.viewOnly', 'toolbar.exitViewOnly',
  'toolbar.moreTools', 'toolbar.closeTools', 'auth.enableNotifications'];

function iconPrefixedKeys() {
  var keys = {};
  ['app.html', 'index.html'].forEach(function (file) {
    var html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    var pattern = /([\u2190-\u2BFF\u2600-\u27BF\uD83C-\uDBFF][\uDC00-\uDFFF]?)\s*<span data-i18n="([^"]+)"/g;
    var match;
    while ((match = pattern.exec(html))) { keys[match[2]] = file; }
  });
  PREFIXED_IN_JS.forEach(function (key) { keys[key] = 'js'; });
  return keys;
}

test('תרגום של כפתור עם אייקון בפריסה אינו כולל אייקון בעצמו', function () {
  var keys = iconPrefixedKeys();
  var names = Object.keys(keys);
  assert(names.length >= 6, 'לא נמצאו מספיק כפתורים עם אייקון: ' + names.length);
  I18n.list().forEach(function (lang) {
    I18n.use(lang.code);
    names.forEach(function (key) {
      var text = I18n.t(key);
      assert(!EMOJI_START.test(text),
        lang.code + ' – ' + key + ': האייקון מופיע גם בתרגום וגם ב-' + keys[key] +
        ', והכפתור יציג אותו פעמיים: ' + text);
    });
  });
  I18n.use('he');
});

test('אין אייקון כפול בטקסט של כפתור בשום שפה', function () {
  /* אותו תו פעמיים ברצף בתוך טקסט מתורגם – סימן לחיבור כפול */
  var doubled = /([\u2190-\u2BFF\u2600-\u27BF])\s*\1/;
  I18n.list().forEach(function (lang) {
    I18n.use(lang.code);
    ['toolbar', 'settings', 'auth', 'publish'].forEach(function (section) {
      var dict = (I18n.active() || {}).dict || {};
      dict = dict[section];
      if (!dict) return;
      Object.keys(dict).forEach(function (key) {
        if (typeof dict[key] !== 'string') return;
        assert(!doubled.test(dict[key]),
          lang.code + ' – ' + section + '.' + key + ': אייקון כפול בטקסט');
      });
    });
  });
  I18n.use('he');
});

console.log('\n' + (failed === 0 ? '✅ ' : '❌ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
process.exit(failed === 0 ? 0 : 1);
