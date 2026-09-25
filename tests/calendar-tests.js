/* לוח השנה: חגים ומועדים מחושבים.

   לוח שנה אי אפשר לבדוק בכמה תאריכים שזכורים למישהו — טעות
   באלגוריתם מייצרת בדיוק כמה תאריכים נכונים וכמה לא. לכן מה
   שנבדק כאן הוא התכונות של הלוח עצמו, על פני מאות שנים:
   כללים שחייבים להתקיים תמיד, ושנשברים מיד כשהחישוב שגוי.

   הרצה: node tests/calendar-tests.js */
'use strict';

var Cal = require('../js/calendar.js');

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

var FROM = 5700, TO = 5900;          // 1939 עד 2140 בערך
var DOW = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
function dow(fixed) { return ((fixed % 7) + 7) % 7; }
function label(fixed) {
  var g = Cal.gregorianFromFixed(fixed);
  return g.day + '/' + g.month + '/' + g.year + ' (' + DOW[dow(fixed)] + ')';
}
function holidaysOf(year) {
  var map = {};
  Cal.hebrewYearHolidays(year).forEach(function (item) {
    (map[item.id] = map[item.id] || []).push(item);
  });
  return map;
}

console.log('\n== מבנה השנה העברית ==');

test('אורך השנה הוא תמיד אחד משישה ערכים חוקיים', function () {
  var allowed = [353, 354, 355, 383, 384, 385];
  for (var y = FROM; y <= TO; y++) {
    var length = Cal.hebrewYearLength(y);
    assert(allowed.indexOf(length) !== -1, 'שנה ' + y + ' באורך ' + length);
  }
});

test('שנה מעוברת ארוכה משנה פשוטה, תמיד', function () {
  for (var y = FROM; y <= TO; y++) {
    var length = Cal.hebrewYearLength(y);
    var leap = Cal.isHebrewLeapYear(y);
    assert(leap ? length >= 383 : length <= 355, 'שנה ' + y + ': מעוברת=' + leap + ' אורך=' + length);
  }
});

test('שבע שנים מעוברות בכל מחזור של תשע עשרה', function () {
  for (var start = FROM; start + 18 <= TO; start += 19) {
    var count = 0;
    for (var y = start; y < start + 19; y++) if (Cal.isHebrewLeapYear(y)) count++;
    assertEqual(count, 7, 'מחזור שמתחיל ב-' + start);
  }
});

console.log('\n== הכללים שהדחיות נועדו להבטיח ==');

test('לא אד״ו ראש: ראש השנה אינו ראשון, רביעי או שישי', function () {
  for (var y = FROM; y <= TO; y++) {
    var day = dow(Cal.hebrewNewYear(y));
    assert([0, 3, 5].indexOf(day) === -1,
      'ראש השנה ' + y + ' נפל ביום ' + DOW[day]);
  }
});

test('לא בד״ו פסח: ט״ו בניסן אינו שני, רביעי או שישי', function () {
  for (var y = FROM; y <= TO; y++) {
    var day = dow(Cal.fixedFromHebrew(y, Cal.MONTH.NISAN, 15));
    assert([1, 3, 5].indexOf(day) === -1, 'פסח ' + y + ' נפל ביום ' + DOW[day]);
  }
});

test('יום כיפור לעולם אינו צמוד לשבת', function () {
  /* היה נופל בשישי או בראשון – שני ימי שביתה רצופים */
  for (var y = FROM; y <= TO; y++) {
    var day = dow(Cal.fixedFromHebrew(y, Cal.MONTH.TISHREI, 10));
    assert([5, 0].indexOf(day) === -1, 'יום כיפור ' + y + ' נפל ביום ' + DOW[day]);
  }
});

console.log('\n== המועדים ==');

test('כל מועד נופל פעם אחת בשנה, חוץ מאלה שנמשכים', function () {
  var multi = { hanukka: 8, cholHamoedSukkot: 5, cholHamoedPesach: 5 };
  for (var y = FROM; y <= FROM + 60; y++) {
    var map = holidaysOf(y);
    Object.keys(map).forEach(function (id) {
      assertEqual(map[id].length, multi[id] || 1, 'שנה ' + y + ', ' + id);
    });
  }
});

test('חנוכה שמונה ימים רצופים', function () {
  for (var y = FROM; y <= FROM + 60; y++) {
    var days = holidaysOf(y).hanukka.map(function (i) { return i.fixed; }).sort(function (a, b) { return a - b; });
    assertEqual(days.length, 8, 'שנה ' + y);
    for (var i = 1; i < days.length; i++) {
      assertEqual(days[i] - days[i - 1], 1, 'רצף חנוכה בשנה ' + y);
    }
  }
});

test('בשנה מעוברת פורים באדר ב׳', function () {
  for (var y = FROM; y <= FROM + 60; y++) {
    if (!Cal.isHebrewLeapYear(y)) continue;
    var purim = holidaysOf(y).purim[0].fixed;
    assertEqual(purim, Cal.fixedFromHebrew(y, Cal.MONTH.ADAR_B, 14), 'פורים ' + y);
    /* ובאדר א׳ אין פורים – הוא חודש שלם אחר */
    assert(purim > Cal.fixedFromHebrew(y, Cal.MONTH.ADAR_A, 30), 'פורים ' + y + ' באדר א׳');
  }
});

test('צום שחל בשבת נדחה לראשון', function () {
  var fasts = ['tzomGedalia', 'taanitEsther', 'tzomTamuz', 'tishaBeav'];
  for (var y = FROM; y <= TO; y++) {
    var map = holidaysOf(y);
    fasts.forEach(function (id) {
      var day = dow(map[id][0].fixed);
      assert(day !== 6, id + ' בשנה ' + y + ' נפל בשבת');
    });
  }
});

console.log('\n== הדחיות של יום הזיכרון, העצמאות והשואה ==');

test('יום העצמאות אינו נופל בשישי, בשבת או בראשון', function () {
  /* אלה בדיוק הימים שהחוק נועד למנוע: יום זיכרון שנכנס
     במוצאי שבת, וחגיגות שנופלות על השבת. */
  for (var y = FROM; y <= TO; y++) {
    var day = dow(holidaysOf(y).yomHaatzmaut[0].fixed);
    assert([5, 6, 0].indexOf(day) === -1, 'יום העצמאות ' + y + ' נפל ביום ' + DOW[day]);
  }
});

test('יום הזיכרון תמיד יום אחד לפני יום העצמאות', function () {
  for (var y = FROM; y <= TO; y++) {
    var map = holidaysOf(y);
    assertEqual(map.yomHazikaron[0].fixed + 1, map.yomHaatzmaut[0].fixed, 'שנה ' + y);
  }
});

test('יום השואה אינו נופל בשישי או בראשון', function () {
  for (var y = FROM; y <= TO; y++) {
    var day = dow(holidaysOf(y).yomHashoa[0].fixed);
    assert([5, 0].indexOf(day) === -1, 'יום השואה ' + y + ' נפל ביום ' + DOW[day]);
  }
});

test('יום העצמאות זז מה׳ באייר רק כשצריך', function () {
  var moved = 0, same = 0;
  for (var y = FROM; y <= TO; y++) {
    var iyar5 = Cal.fixedFromHebrew(y, Cal.MONTH.IYAR, 5);
    if (holidaysOf(y).yomHaatzmaut[0].fixed === iyar5) same++; else moved++;
  }
  /* שני המצבים קיימים: אם אחד מהם אפס, ההיגיון לא רץ בכלל */
  assert(same > 0 && moved > 0, 'זז ' + moved + ' פעמים, נשאר ' + same);
});

console.log('\n== טווח תאריכים ==');

test('between מחזיר רק מה שבתוך הטווח, ממוין', function () {
  var from = new Date(2026, 0, 1), to = new Date(2026, 11, 31);
  var list = Cal.between(from, to, { hebrew: true, muslim: true, christian: true });
  assert(list.length > 30, 'מעט מדי מועדים: ' + list.length);
  var lowest = Cal.fixedFromDate(from), highest = Cal.fixedFromDate(to);
  for (var i = 0; i < list.length; i++) {
    assert(list[i].fixed >= lowest && list[i].fixed <= highest, 'מחוץ לטווח: ' + list[i].id);
    if (i) assert(list[i].fixed >= list[i - 1].fixed, 'לא ממוין');
    assert(/^\d{4}-\d{2}-\d{2}$/.test(list[i].date), 'תאריך לא תקין: ' + list[i].date);
  }
});

test('ברירת המחדל היא הלוח העברי בלבד', function () {
  var list = Cal.between(new Date(2026, 0, 1), new Date(2026, 11, 31));
  assert(list.length > 0, 'ריק');
  list.forEach(function (item) {
    assert(item.kind !== 'muslim' && item.kind !== 'christian',
      'לוח שלא נתבקש: ' + item.id);
  });
});

test('שבוע בודד מחזיר את המועדים שבו בלבד', function () {
  /* פסח תשפ״ו: 2 באפריל 2026 */
  var list = Cal.between(new Date(2026, 3, 1), new Date(2026, 3, 3));
  var ids = list.map(function (i) { return i.id; });
  assert(ids.indexOf('pesach') !== -1, 'פסח לא נמצא: ' + ids.join(','));
  assert(ids.indexOf('erevPesach') !== -1, 'ערב פסח לא נמצא');
  assert(ids.indexOf('roshHashana1') === -1, 'נכנס מועד מחוץ לטווח');
});

console.log('\n== מועדים מוסלמיים ונוצריים ==');

test('מועד מוסלמי מסומן כמקורב', function () {
  var list = Cal.between(new Date(2026, 0, 1), new Date(2026, 11, 31), { muslim: true });
  var muslim = list.filter(function (i) { return i.kind === 'muslim'; });
  assert(muslim.length >= 6, 'מעט מדי: ' + muslim.length);
  /* הלוח האמיתי נקבע בראיית ירח. ודאות שאינה קיימת גרועה
     מהודעה שאומרת "בערך". */
  muslim.forEach(function (item) {
    assertEqual(item.approximate, true, item.id + ' אינו מסומן כמקורב');
  });
});

test('עיד אל-פיטר שלושה ימים רצופים', function () {
  var list = Cal.between(new Date(2026, 0, 1), new Date(2026, 11, 31), { muslim: true });
  var days = list.filter(function (i) { return i.id === 'eidAlFitr'; })
    .map(function (i) { return i.fixed; });
  assertEqual(days.length, 3, 'מספר הימים');
  assertEqual(days[1] - days[0], 1, 'רצף');
  assertEqual(days[2] - days[1], 1, 'רצף');
});

test('פסחא תמיד ביום ראשון, בשתי הגרסאות', function () {
  for (var y = 2000; y <= 2100; y++) {
    assertEqual(dow(Cal.easterGregorian(y)), 0, 'פסחא מערבית ' + y);
    assertEqual(dow(Cal.easterJulian(y)), 0, 'פסחא אורתודוקסית ' + y);
  }
});

test('פסחא נופלת בטווח החוקי שלה', function () {
  /* בין 22 במרץ ל-25 באפריל בלוח הגרגוריאני */
  for (var y = 2000; y <= 2100; y++) {
    var easter = Cal.easterGregorian(y);
    var low = Cal.fixedFromGregorian(y, 3, 22);
    var high = Cal.fixedFromGregorian(y, 4, 25);
    assert(easter >= low && easter <= high, 'פסחא ' + y + ': ' + label(easter));
  }
});

test('פסחא האורתודוקסית לעולם אינה מקדימה את המערבית', function () {
  for (var y = 2000; y <= 2100; y++) {
    assert(Cal.easterJulian(y) >= Cal.easterGregorian(y), 'שנה ' + y);
  }
});

console.log('\n' + (failed === 0 ? '✅ ' : '❌ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
process.exit(failed === 0 ? 0 : 1);
