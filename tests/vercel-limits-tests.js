/* שומרים על מגבלות הפריסה.

   למה זה קיים: תוכנית Hobby של Vercel מגבילה ל-12 פונקציות
   שרת. חמש נקודות קצה שנוספו למשרד האחורי העלו את הסכום ל-13,
   וכל פריסה נכשלה – כלומר האתר כולו הפסיק להתעדכן בגלל מסך
   פנימי שאף לקוח אינו רואה. גילינו את זה רק אחרי שבע פריסות
   כושלות, מתוך צילום מסך.

   תקרה שמתגלה בייצור היא תקרה שאיש לא ידע עליה. כאן היא נבדקת
   לפני כל דחיפה, ונכשלת עם הסבר במקום עם "Error" אדום ב-Vercel.

   הרצה: node tests/vercel-limits-tests.js */
'use strict';

var fs = require('fs');
var path = require('path');

/* תוכנית Hobby. אם תשודרג התוכנית – מעדכנים כאן, במקום אחד. */
var MAX_FUNCTIONS = 12;
/* מאיזה מספר כדאי כבר לדעת. שתיים לפני התקרה זה בדיוק הרגע
   שבו עוד אפשר לתכנן, ולא רק לכבות. */
var WARN_AT = 10;

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.log('  ✗ ' + name + '\n      ' + (err && err.message)); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

/* Vercel סופר כל קובץ ב-api/ כפונקציה, פרט לקבצים ולתיקיות
   שמתחילים בקו תחתון. */
function functionsIn(dir, prefix) {
  var out = [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    if (entry.name.charAt(0) === '_' || entry.name.charAt(0) === '.') return;
    var full = path.join(dir, entry.name);
    var route = prefix + '/' + entry.name;
    if (entry.isDirectory()) { out = out.concat(functionsIn(full, route)); return; }
    if (!/\.(js|mjs|ts)$/.test(entry.name)) return;
    out.push(route.replace(/\.(js|mjs|ts)$/, '').replace(/\/index$/, ''));
  });
  return out;
}

var api = path.join(__dirname, '..', 'api');
var routes = functionsIn(api, '/api').sort();

console.log('\n== פונקציות שרת ==');
routes.forEach(function (route) { console.log('    ' + route); });
console.log('    ─── ' + routes.length + ' מתוך ' + MAX_FUNCTIONS + ' ───\n');

test('מספר הפונקציות אינו חורג ממגבלת התוכנית', function () {
  assert(routes.length <= MAX_FUNCTIONS,
    'יש ' + routes.length + ' פונקציות, והמגבלה היא ' + MAX_FUNCTIONS + '.\n' +
    '      כל פריסה תיכשל, והאתר כולו יפסיק להתעדכן.\n' +
    '      הדרך לצמצם: לאחד נקודות קצה שחולקות את אותו שער הרשאה\n' +
    '      לנקודה אחת עם שדה ניתוב, כמו api/admin/index.js.\n' +
    '      הפונקציות: ' + routes.join(', '));
});

test('נשאר מרווח לפני התקרה', function () {
  assert(routes.length < WARN_AT,
    'יש ' + routes.length + ' פונקציות מתוך ' + MAX_FUNCTIONS + '.\n' +
    '      זה עדיין עובד, אבל נשארו ' + (MAX_FUNCTIONS - routes.length) +
    ' בלבד. כדאי לאחד עכשיו, כשזה בחירה,\n' +
    '      ולא בעוד שלוש נקודות קצה, כשזה כיבוי שריפה.');
});

/* תקרה שנייה שקל ליפול בה: Vercel מגביל את גודל הפריסה, וקובץ
   וידאו אחד יכול לקחת את רובה בלי שאיש ישים לב. */
var MAX_ASSET_MB = 25;
test('אין נכס בודד גדול מדי', function () {
  var assets = path.join(__dirname, '..', 'assets');
  var big = [];
  (function walk(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
      var full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      var mb = fs.statSync(full).size / 1048576;
      if (mb > MAX_ASSET_MB) big.push(entry.name + ' (' + mb.toFixed(1) + 'MB)');
    });
  })(assets);
  assert(!big.length, 'נכסים כבדים מדי: ' + big.join(', '));
});

console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
process.exit(failed ? 1 : 0);
