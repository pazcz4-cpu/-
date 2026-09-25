/* בדיקות למילוני השפות: התאמת מפתחות לאנגלית, תבניות {param} זהות,
   ושכל שפה רשומה כראוי. הרצה: node tests/i18n-tests.js */
'use strict';

var fs = require('fs');
var path = require('path');

var I18n = require('../js/i18n/core.js');
var dir = path.join(__dirname, '..', 'js', 'i18n');

/* טוענים כל קובץ שפה שנמצא בתיקייה, ולא רשימה קבועה, כדי ששפה חדשה
   תיבדק אוטומטית ברגע שהיא נוספת. */
fs.readdirSync(dir).forEach(function (file) {
  if (!/\.js$/.test(file) || file === 'core.js' || file === 'dom.js') return;
  require(path.join(dir, file));
});

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.log('  ✗ ' + name + '\n      ' + err.message); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

function flatten(obj, prefix, out) {
  out = out || {};
  Object.keys(obj).forEach(function (key) {
    var value = obj[key];
    var full = prefix ? prefix + '.' + key : key;
    if (typeof value === 'string') { out[full] = value; }
    else if (value && typeof value === 'object') { flatten(value, full, out); }
  });
  return out;
}

function params(text) {
  return (text.match(/\{\w+\}/g) || []).sort().join(',');
}

/* אין מקטעים שמותר לתרגם חלקית.
   דף המכירה היה פעם פטור, בהנחה שנפילה לאנגלית היא פשרה סבירה –
   אבל דף המכירה הוא בדיוק מה שמוכרים בו, ולקוח בברזיל שנוחת על
   עמוד באנגלית לא קונה. הפטור הוסר, והבדיקה נועלת את זה. */
var OPTIONAL_SECTIONS = [];
function optional(key) {
  return OPTIONAL_SECTIONS.indexOf(key.split('.')[0]) !== -1;
}

var languages = I18n.list();
I18n.use('en');
var base = flatten(I18n.active().dict);
var baseKeys = Object.keys(base);

console.log('\n== מילוני השפות ==');
console.log('  שפות רשומות: ' + languages.map(function (l) { return l.code; }).join(', '));

test('אנגלית היא שפת הבסיס וקיימת', function () {
  assert(I18n.has('en'), 'חסר מילון אנגלית');
  assert(baseKeys.length > 400, 'מילון הבסיס קטן מדי: ' + baseKeys.length);
});

test('נרשמה יותר משפה אחת', function () {
  assert(languages.length >= 2, 'נדרשות לפחות שתי שפות');
});

languages.forEach(function (lang) {
  I18n.use(lang.code);
  var dict = flatten(I18n.active().dict);

  test(lang.code + ': כל מפתחות הבסיס קיימים', function () {
    var missing = baseKeys.filter(function (key) {
      return dict[key] === undefined && !optional(key);
    });
    assert(!missing.length, 'חסרים ' + missing.length + ' מפתחות: ' + missing.slice(0, 8).join(', '));
  });

  test(lang.code + ': אין מפתחות עודפים שאינם בבסיס', function () {
    var extra = Object.keys(dict).filter(function (key) { return base[key] === undefined; });
    assert(!extra.length, 'מפתחות שאינם בבסיס: ' + extra.slice(0, 8).join(', '));
  });

  test(lang.code + ': אותן תבניות {param} כמו בבסיס', function () {
    var bad = baseKeys.filter(function (key) {
      return dict[key] !== undefined && params(base[key]) !== params(dict[key]);
    });
    assert(!bad.length, 'תבניות שונות ב-' + bad.length + ' מפתחות: ' +
      bad.slice(0, 5).map(function (k) {
        return k + ' [' + params(base[k]) + '] ≠ [' + params(dict[k]) + ']';
      }).join(' | '));
  });

  test(lang.code + ': אין ערכים ריקים', function () {
    var empty = Object.keys(dict).filter(function (key) { return !String(dict[key]).trim(); });
    assert(!empty.length, 'ערכים ריקים: ' + empty.slice(0, 5).join(', '));
  });

  test(lang.code + ': דף המכירה מתורגם במלואו', function () {
    var landingKeys = baseKeys.filter(optional);
    var have = landingKeys.filter(function (key) { return dict[key] !== undefined; }).length;
    /* אין כאן כישלון – רק דרישה שלא יהיה תרגום חלקי שמערבב שפות */
    assert(have === 0 || have === landingKeys.length,
      'תרגום חלקי של דף המכירה: ' + have + ' מתוך ' + landingKeys.length +
      '. או לתרגם הכל, או להשאיר את המקטע ריק ולתת לו ליפול לאנגלית.');
  });

  test(lang.code + ': הגדרות השפה תקינות', function () {
    var def = I18n.active();
    assert(def.name && def.name.trim(), 'חסר שם שפה');
    assert(def.dir === 'rtl' || def.dir === 'ltr', 'כיוון כתיבה לא תקין: ' + def.dir);
    assert(def.weekStart >= 0 && def.weekStart <= 6, 'תחילת שבוע לא תקינה');
    assert(def.currency && def.currency.code, 'חסרה הגדרת מטבע');
  });
});

test('מפתח חסר נופל לאנגלית ולא שובר', function () {
  I18n.register({ code: 'zz', name: 'Test', dict: { app: { title: 'ZZ' } } });
  I18n.use('zz');
  assert(I18n.t('app.title') === 'ZZ', 'לא נלקח הערך מהשפה עצמה');
  assert(I18n.t('tabs.schedule') === 'Schedule', 'לא נפל לאנגלית: ' + I18n.t('tabs.schedule'));
  assert(I18n.t('no.such.key') === 'no.such.key', 'מפתח לא קיים היה צריך לחזור כמו שהוא');
});

test('החלפת תבניות עובדת בכל שפה', function () {
  languages.forEach(function (lang) {
    I18n.use(lang.code);
    var text = I18n.t('billing.of', { count: 3, max: 10 });
    assert(text.indexOf('3') !== -1 && text.indexOf('10') !== -1,
      lang.code + ': התבנית לא הוחלפה – ' + text);
  });
});

console.log('\n== מפתחות שהקוד באמת מבקש ==');

/* בדיקת ההתאמה למעלה משווה כל שפה לאנגלית, ולכן מפתח שחסר בכל
   שמונה השפות במידה שווה עובר אותה בשקט. בדיוק זה קרה עם
   leave.paid: הצ'יפ "בתשלום" במסך האילוצים הציג את המחרוזת
   leave.paid עצמה, בכל שפה, והבדיקות היו ירוקות.

   לכן סורקים כאן את קוד המוצר עצמו: כל מפתח שכתוב כמחרוזת בתוך
   t('...') חייב להתקיים במילון הבסיס. */
function sourceFiles(dir, out) {
  out = out || [];
  fs.readdirSync(dir).forEach(function (name) {
    var full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { if (name !== 'i18n') sourceFiles(full, out); }
    else if (/\.js$/.test(name)) out.push(full);
  });
  return out;
}

var jsDir = path.join(__dirname, '..', 'js');

test('כל מפתח שכתוב ישירות בקוד קיים במילון', function () {
  I18n.use('en');
  var missing = [];
  sourceFiles(jsDir).forEach(function (file) {
    var src = fs.readFileSync(file, 'utf8');
    /* רק קריאה שנסגרת מיד – t('a.b') או t('a.b', {...}).
       t('a.b' + x) הוא מפתח מורכב ונבדק ברשימה שמתחת. */
    var re = /\bt\(\s*'([a-zA-Z][\w]*(?:\.[\w]+)+)'\s*(\)|,)/g;
    var match;
    while ((match = re.exec(src))) {
      if (I18n.t(match[1]) === match[1]) {
        missing.push(path.basename(file) + ': ' + match[1]);
      }
    }
  });
  assert(!missing.length, 'מפתחות שהקוד מבקש ואינם במילון: ' + missing.join(', '));
});

/* מפתחות שנבנים בזמן ריצה מצירוף מחרוזות. סריקה אוטומטית לא
   יכולה לגלות אותם, ולכן הם רשומים כאן במפורש – וכשמוסיפים
   ערך חדש למשפחה כזו, מוסיפים אותו גם לכאן. */
var COMPOSED_KEYS = [
  'leave.paid', 'leave.unpaid',                 // js/app.js – צ'יפ סוג יום החופש
  'leave.paidTitle', 'leave.unpaidTitle',
  'hours.src_phone', 'hours.src_device', 'hours.src_manager',   // js/app.js – דוח השעות
  'leaveRequest.status_pending', 'leaveRequest.status_approved', // js/backend/employee-ui.js
  'leaveRequest.status_rejected', 'leaveRequest.status_mixed',
  'alerts.dropInactiveOne', 'alerts.dropInactiveOther',           // js/app.js – tCount
  'alerts.dropInactiveDoneOne', 'alerts.dropInactiveDoneOther'
];

languages.forEach(function (lang) {
  test(lang.code + ': מפתחות מורכבים מתורגמים ולא חוזרים כמו שהם', function () {
    I18n.use(lang.code);
    var raw = COMPOSED_KEYS.filter(function (key) { return I18n.t(key) === key; });
    assert(!raw.length, 'מוצגים כמחרוזת גולמית על המסך: ' + raw.join(', '));
  });
});
I18n.use('he');

console.log('\n== שפת ברירת המחדל ==');

/* מדמים דפדפן. ב-Node navigator הוא מאפיין לקריאה בלבד, ולכן
   מחליפים אותו דרך defineProperty ומחזירים את המקורי בסוף. */
function withBrowserLanguages(list, fn) {
  var root = typeof window !== 'undefined' ? window : globalThis;
  var before = Object.getOwnPropertyDescriptor(root, 'navigator');
  Object.defineProperty(root, 'navigator', {
    value: { languages: list, language: list[0] },
    configurable: true, writable: true
  });
  try { fn(); } finally {
    if (before) { Object.defineProperty(root, 'navigator', before); }
    else { delete root.navigator; }
  }
}

test('האתר נפתח בעברית', function () {
  assert(I18n.initial() === 'he', 'ברירת המחדל אינה עברית: ' + I18n.initial());
});

test('דפדפן באנגלית עדיין מקבל עברית', function () {
  withBrowserLanguages(['en-US', 'en'], function () {
    assert(I18n.initial() === 'he', 'דפדפן אנגלי גרר אנגלית: ' + I18n.initial());
  });
});

test('גם דפדפן בשפה אחרת מקבל את ברירת המחדל', function () {
  withBrowserLanguages(['fr-FR'], function () {
    assert(I18n.initial() === 'he', 'זיהוי הדפדפן פעל למרות שהוא כבוי');
  });
});

test('מפתח חסר נופל לאנגלית ולא לעברית', function () {
  /* כל השפות מתורגמות במלואן, ולכן אין מפתח חסר אמיתי לבדוק עליו.
     רושמים שפה זמנית חלקית ובודקים את המנגנון עצמו – וזו בדיקה
     טובה יותר, כי היא אינה תלויה במקריות שבנתונים. */
  I18n.register({
    code: 'zz', name: 'Test', dir: 'ltr',
    dict: { app: { title: 'Only this key' } }
  });
  I18n.use('zz');
  var missing = I18n.t('tabs.schedule');
  I18n.use('en');
  var english = I18n.t('tabs.schedule');
  I18n.use('he');
  var hebrew = I18n.t('tabs.schedule');
  I18n.use('he');

  assert(missing === english, 'מפתח חסר לא נפל לאנגלית: ' + missing);
  assert(missing !== hebrew, 'מפתח חסר נפל לעברית: ' + missing);
});

test('אפשר להחזיר זיהוי לפי הדפדפן לקראת חו"ל', function () {
  I18n.setDefault('en', { autoDetect: true });
  withBrowserLanguages(['fr-FR'], function () {
    assert(I18n.initial() === 'fr', 'זיהוי הדפדפן לא חזר: ' + I18n.initial());
  });
  withBrowserLanguages(['ja-JP'], function () {
    assert(I18n.initial() === 'en', 'שפה שאיננו תומכים בה לא נפלה לברירת המחדל');
  });
  I18n.setDefault('he', { autoDetect: false });   // החזרה למצב האמיתי
  assert(I18n.initial() === 'he', 'לא חזרנו לעברית אחרי הבדיקה');
});

console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
process.exit(failed ? 1 : 0);
