/* מעקב שיווקי: כבוי עד שיש מזהה והסכמה, ולא נושא פרטים אישיים.
   הרצה: node tests/tracking-tests.js */
'use strict';

var passed = 0, failed = 0;
function assert(c, m) { if (!c) throw new Error(m); }
function assertEqual(a, b, m) {
  if (a !== b) throw new Error((m || 'ערכים שונים') + ': התקבל ' + JSON.stringify(a) + ', ציפינו ל-' + JSON.stringify(b));
}
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.log('  ✗ ' + name + '\n      ' + err.message); }
}

function setup(config, consent) {
  var storage = {};
  if (consent !== undefined) storage['setshifts-consent-v1'] = JSON.stringify({ analytics: consent, at: 1 });
  var scripts = [];
  var banners = [];
  var elements = {};
  globalThis.localStorage = {
    getItem: function (k) { return k in storage ? storage[k] : null; },
    setItem: function (k, v) { storage[k] = String(v); },
    removeItem: function (k) { delete storage[k]; }
  };
  globalThis.SHIFT_CONFIG = config;
  globalThis.location = { search: '', pathname: '/' };
  var body = { appendChild: function (n) { banners.push(n); n.parentNode = body; }, removeChild: function (n) { banners.splice(banners.indexOf(n), 1); } };
  function el(tag) {
    var node = { tag: tag, children: [], attrs: {}, listeners: {}, style: {},
      setAttribute: function (k, v) { this.attrs[k] = v; },
      appendChild: function (c) { this.children.push(c); c.parentNode = this; },
      addEventListener: function (e, f) { this.listeners[e] = f; },
      createTextNode: function () {} };
    return node;
  }
  globalThis.document = {
    readyState: 'complete', documentElement: { lang: 'he' }, body: body,
    head: { appendChild: function (n) { scripts.push(n.src); } },
    createElement: el, createTextNode: function (t) { return { text: t }; },
    getElementById: function (id) { return banners.filter(function (b) { return b.id === id; })[0] || null; },
    addEventListener: function () {}
  };
  delete globalThis.fbq; delete globalThis._fbq; delete globalThis.gtag; delete globalThis.dataLayer;
  delete require.cache[require.resolve('../js/tracking.js')];
  var Tracking = require('../js/tracking.js');
  Tracking._reset();
  return { Tracking: Tracking, scripts: scripts, banners: banners, storage: storage };
}

test('בלי מזהה בהגדרות: כבוי לגמרי, בלי סקריפט ובלי באנר', function () {
  var s = setup({ metaPixelId: '', ga4Id: '' });
  assertEqual(s.Tracking.enabled(), false, 'פעיל');
  s.Tracking.init();
  assertEqual(s.scripts.length, 0, 'נטען סקריפט');
  assertEqual(s.banners.length, 0, 'באנר בלי מה לעקוב');
  assertEqual(s.Tracking.track('lead'), false, 'אירוע נשלח');
});

test('יש מזהה אבל אין הסכמה: מציג באנר ולא טוען שום דבר', function () {
  var s = setup({ metaPixelId: '1234567890', ga4Id: 'G-ABC123' });
  s.Tracking.init();
  assertEqual(s.scripts.length, 0, 'נטען סקריפט לפני הסכמה');
  assertEqual(s.banners.length, 1, 'אין באנר');
  assertEqual(s.Tracking.track('signup'), false, 'אירוע נשלח לפני הסכמה');
});

test('הסכמה קיימת: נטענים Meta ו-GA4, בלי אירוע אישי', function () {
  var s = setup({ metaPixelId: '1234567890', ga4Id: 'G-ABC123' }, true);
  var calls = [];
  s.Tracking.init();
  assert(s.scripts.some(function (u) { return /connect\.facebook\.net/.test(u); }), 'Meta לא נטען');
  assert(s.scripts.some(function (u) { return /googletagmanager\.com\/gtag\/js\?id=G-ABC123/.test(u); }), 'GA4 לא נטען');
  assertEqual(s.banners.length, 0, 'באנר אחרי הסכמה');
  /* האירועים: הפרמטרים שעוברים הם רק value, currency, content_name */
  globalThis.fbq = function () { calls.push([].slice.call(arguments)); };
  globalThis.gtag = function () { calls.push([].slice.call(arguments)); };
  assertEqual(s.Tracking.track('signup', { email: 'a@b.co', phone: '054', value: 199, currency: 'ILS' }), true, 'לא נשלח');
  var all = JSON.stringify(calls);
  assert(all.indexOf('a@b.co') === -1 && all.indexOf('054') === -1, 'פרט אישי נשלח: ' + all);
  assert(all.indexOf('CompleteRegistration') !== -1 && all.indexOf('sign_up') !== -1, 'שמות האירועים: ' + all);
});

test('דחייה: לא נטען כלום, ומקור ההגעה שנשמר נמחק', function () {
  var s = setup({ metaPixelId: '1234567890', ga4Id: '' }, true);
  s.Tracking.captureUtm('?utm_source=facebook&utm_campaign=sep');
  assert(s.storage['setshifts-utm'], 'לא נשמר');
  s.Tracking.setConsent(false);
  assertEqual(s.storage['setshifts-utm'], undefined, 'מקור ההגעה נשאר אחרי דחייה');
  assertEqual(s.Tracking.consent(), false, 'ההחלטה לא נשמרה');
  assertEqual(s.Tracking.track('lead'), false, 'אירוע אחרי דחייה');
});

test('utm: נשמר, מוגבל באורך, ופג אחרי 60 יום', function () {
  var s = setup({ metaPixelId: '1' }, true);
  var found = s.Tracking.captureUtm('?utm_source=ig&utm_medium=paid&fbclid=' + new Array(300).join('x'), 1000);
  assertEqual(found.utm_source, 'ig', 'source');
  assert(found.fbclid.length <= 120, 'ארוך מדי');
  assert(s.Tracking.utm(1000 + 59 * 864e5), 'פג מוקדם');
  assertEqual(s.Tracking.utm(1000 + 61 * 864e5), null, 'לא פג');
  assertEqual(s.Tracking.captureUtm('?foo=bar'), null, 'פרמטר זר נשמר');
});

test('מזהה GA4 לא תקין מתעלמים ממנו', function () {
  var s = setup({ metaPixelId: '', ga4Id: 'UA-123; alert(1)' }, true);
  assertEqual(s.Tracking.enabled(), false, 'מזהה פגום הפעיל מעקב');
});

test('באנר ההסכמה בשפת העמוד, ובכל שמונה השפות יש כל המפתחות', function () {
  var s = setup({ metaPixelId: '1' });
  ['he', 'en', 'ar', 'de', 'es', 'fr', 'pt', 'ru'].forEach(function (lang) {
    var copy = s.Tracking.COPY[lang];
    assert(copy, 'חסרה שפה ' + lang);
    ['title', 'text', 'privacy', 'accept', 'decline'].forEach(function (key) {
      assert(copy[key] && copy[key].length > 1, lang + '.' + key);
    });
  });
});

test('הערת "ממתין לבדיקת עו״ד" נשארת במסמכים ואינה מופיעה באתר', function () {
  var fs = require('fs'), path = require('path');
  var root = path.join(__dirname, '..');
  var pages = ['privacy.html', 'security.html', 'terms.html', 'landing.html', 'page.html', 'accessibility.html'];
  ['about', 'contact', 'faq', 'pricing', 'stories'].forEach(function (dir) {
    ['he', 'en', 'ar', 'de', 'es', 'fr', 'pt', 'ru'].forEach(function (lang) {
      pages.push(path.join('content', dir, lang + '.html'));
    });
  });
  pages.forEach(function (file) {
    var full = path.join(root, file);
    if (!fs.existsSync(full)) return;
    var text = fs.readFileSync(full, 'utf8');
    assert(!/לבדיקת עו|ממתין לבדיקת עו|pending lawyer|awaiting legal review/i.test(text),
      file + ' מכיל הערה פנימית על בדיקה משפטית');
  });
});

console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
process.exit(failed ? 1 : 0);
