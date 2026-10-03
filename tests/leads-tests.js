/* ליד מהאתר: אימות, שמירה, והתנהגות כשאחד הערוצים נופל.
   הרצה: node tests/leads-tests.js */
'use strict';

process.env.SUPABASE_URL = 'https://example.supabase.co/rest/v1/';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.RESEND_API_KEY = 're_test';
process.env.MAIL_FROM = 'SetShifts <no-reply@setshifts.com>';

var handler = require('../api/contact.js');

var passed = 0, failed = 0;
function assert(c, m) { if (!c) throw new Error(m); }
function assertEqual(a, e, m) {
  if (a !== e) throw new Error((m || 'ערכים שונים') + ': התקבל ' + JSON.stringify(a) + ', ציפינו ל-' + JSON.stringify(e));
}
var queue = Promise.resolve();
function test(name, fn) {
  queue = queue.then(function () {
    handler._internals.seen.clear();
    return Promise.resolve().then(fn).then(function () { passed++; console.log('  ✓ ' + name); },
      function (err) { failed++; console.log('  ✗ ' + name + '\n      ' + err.message); });
  });
}

var calls;
var behaviour;
global.fetch = function (url, opts) {
  calls.push({ url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null, headers: opts && opts.headers });
  var isMail = String(url).indexOf('resend.com') !== -1;
  var ok = isMail ? behaviour.mailOk : behaviour.dbOk;
  return Promise.resolve({ ok: ok, status: ok ? 200 : 500, text: function () { return Promise.resolve('{}'); }, json: function () { return Promise.resolve({ id: 'x' }); } });
};

function call(body) {
  calls = [];
  var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; }, end: function (t) { this.text = t; } };
  return handler({ method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' }, body: body }, res).then(function () {
    return { status: res.statusCode, body: JSON.parse(res.text || '{}') };
  });
}

function lead(over) {
  return Object.assign({
    kind: 'lead', business: 'קפה הנחל', name: 'דנה כהן', phone: '054-123 4567',
    email: 'dana@cafe.co.il', employees: 14, hours: '3-6', consent: true,
    consentText: 'מאשר/ת שיחזרו אליי', lang: 'he', page: '/',
    utm: { utm_source: 'facebook', utm_campaign: 'owners-pain', fbclid: 'FB1' },
    openedAt: Date.now() - 60000
  }, over || {});
}

console.log('\n== ליד מהאתר ==');

test('ליד תקין נשמר בטבלה עם מקור ההגעה, ונשלח במייל', function () {
  behaviour = { dbOk: true, mailOk: true };
  return call(lead()).then(function (r) {
    assertEqual(r.status, 200, 'סטטוס');
    var db = calls.filter(function (c) { return /\/rest\/v1\/leads$/.test(c.url); })[0];
    assert(db, 'לא נכתב לטבלת leads (או שהכתובת מכילה /rest/v1 כפול)');
    assertEqual(db.body.business_name, 'קפה הנחל');
    assertEqual(db.body.employees, 14);
    assertEqual(db.body.hours_per_week, '3-6');
    assertEqual(db.body.utm_source, 'facebook');
    assertEqual(db.body.click_id, 'FB1', 'מזהה הלחיצה');
    assertEqual(db.body.contact_consent, true);
    assert(calls.some(function (c) { return c.url.indexOf('resend.com') !== -1; }), 'לא נשלח מייל');
    assert(db.headers.Authorization.indexOf('service-key') !== -1, 'לא נכתב עם מפתח השירות');
  });
});

test('בלי הסכמה לפנייה אין ליד', function () {
  behaviour = { dbOk: true, mailOk: true };
  return call(lead({ consent: false })).then(function (r) {
    assertEqual(r.status, 400); assertEqual(r.body.field, 'consent');
    assertEqual(calls.length, 0, 'נשלח משהו בלי הסכמה');
  });
});

test('שדה חסר מזוהה בשמו', function () {
  behaviour = { dbOk: true, mailOk: true };
  var cases = [['business', ''], ['name', ''], ['phone', '12'], ['email', 'x'], ['employees', 0], ['employees', 'abc']];
  return cases.reduce(function (p, c) {
    return p.then(function () {
      var over = {}; over[c[0]] = c[1];
      return call(lead(over)).then(function (r) {
        assertEqual(r.status, 400, c[0]); assertEqual(r.body.field, c[0], 'שדה');
      });
    });
  }, Promise.resolve());
});

test('ערך לא מוכר בשאלת הזמן הופך ל"לא יודע" ולא נכנס כמו שהוא', function () {
  behaviour = { dbOk: true, mailOk: true };
  return call(lead({ hours: '<script>' })).then(function () {
    var db = calls.filter(function (c) { return /leads$/.test(c.url); })[0];
    assertEqual(db.body.hours_per_week, 'unknown');
  });
});

test('הפיתיון מחזיר הצלחה ולא שומר', function () {
  behaviour = { dbOk: true, mailOk: true };
  return call(lead({ website: 'http://spam' })).then(function (r) {
    assertEqual(r.status, 200); assertEqual(calls.length, 0, 'בוט נשמר כליד');
  });
});

test('מילוי מהיר מדי נדחה בשקט', function () {
  behaviour = { dbOk: true, mailOk: true };
  return call(lead({ openedAt: Date.now() - 500 })).then(function (r) {
    assertEqual(r.status, 200); assertEqual(calls.length, 0);
  });
});

test('הטבלה נופלת אבל המייל יצא: האדם לא מקבל שגיאה', function () {
  behaviour = { dbOk: false, mailOk: true };
  return call(lead()).then(function (r) { assertEqual(r.status, 200); });
});

test('המייל נופל אבל הטבלה נשמרה: האדם לא מקבל שגיאה', function () {
  behaviour = { dbOk: true, mailOk: false };
  return call(lead()).then(function (r) { assertEqual(r.status, 200); });
});

test('שני הערוצים נופלים: שגיאה אמיתית', function () {
  behaviour = { dbOk: false, mailOk: false };
  return call(lead()).then(function (r) { assertEqual(r.status, 502); });
});

test('טלפון מנוקה מתווים שאינם טלפון', function () {
  assertEqual(handler._internals.digitsPhone('054<b>1234567</b>'), '0541234567');
});

test('הגבלת קצב חלה גם על לידים', function () {
  behaviour = { dbOk: true, mailOk: true };
  return call(lead()).then(function () { return call(lead()); }).then(function () { return call(lead()); })
    .then(function () { return call(lead()); }).then(function (r) { assertEqual(r.status, 429); });
});

queue.then(function () {
  console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו');
  process.exit(failed ? 1 : 0);
});
