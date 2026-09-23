/* המייל שהעובד מקבל: הנוסח, הסיסמה, והמסלול בשרת.

   למה זה קיים: המייל הזה הוא המפגש הראשון של העובד עם המערכת,
   והוא גם המקום היחיד שבו סיסמה אמיתית נוסעת בטקסט. שלוש
   שאלות שחייבות תשובה בבדיקה ולא בייצור:

   1. האם הנוסח קיים בכל שמונה השפות, עם אותם מפתחות?
   2. האם הסיסמה אקראית באמת, ובלי תווים שמתבלבלים?
   3. האם הסיסמה נשארת בין השרת לדואר – ולא חוזרת למסך של
      המנהל, שממנו היא תמשיך לוואטסאפ?

   הרצה: node tests/access-email-tests.js */
'use strict';

var path = require('path');
var root = path.join(__dirname, '..');
var accessMail = require(path.join(root, 'api/_access-email.js'));
var mail = require(path.join(root, 'api/_mail.js'));

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.log('  ✗ ' + name + '\n      ' + (err && err.message)); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function eq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || '') + ' → ' + JSON.stringify(actual) +
      ' ≠ ' + JSON.stringify(expected));
  }
}

/* ===== הנוסח ===== */
console.log('\n== נוסח המייל בכל השפות ==');

var BASE = accessMail.COPY.he;
var LANGS = accessMail.LANGS;

test('שמונה שפות', function () { eq(LANGS.length, 8, 'מספר השפות'); });

test('לכל שפה אותם מפתחות בדיוק', function () {
  var wanted = Object.keys(BASE).sort().join(',');
  LANGS.forEach(function (lang) {
    eq(Object.keys(accessMail.COPY[lang]).sort().join(','), wanted, lang);
  });
});

test('אותן תבניות {param} בכל שפה', function () {
  function params(value) {
    return (String(value).match(/\{\w+\}/g) || []).sort().join(',');
  }
  Object.keys(BASE).forEach(function (key) {
    if (Array.isArray(BASE[key])) return;
    LANGS.forEach(function (lang) {
      eq(params(accessMail.COPY[lang][key]), params(BASE[key]), lang + '.' + key);
    });
  });
});

test('אין תבנית שאינה מוכרת', function () {
  var known = { '{company}': true, '{name}': true };
  LANGS.forEach(function (lang) {
    Object.keys(accessMail.COPY[lang]).forEach(function (key) {
      var value = accessMail.COPY[lang][key];
      if (Array.isArray(value)) value = value.join(' ');
      (String(value).match(/\{\w+\}/g) || []).forEach(function (token) {
        assert(known[token], lang + '.' + key + ' מכיל ' + token);
      });
    });
  });
});

test('הוראות ההתקנה שלמות בכל שפה', function () {
  LANGS.forEach(function (lang) {
    var words = accessMail.COPY[lang];
    eq(words.iphoneSteps.length, 4, lang + ' אייפון');
    eq(words.androidSteps.length, 4, lang + ' אנדרואיד');
    words.iphoneSteps.concat(words.androidSteps).forEach(function (step) {
      /* "أكّد" הוא שלב שלם בערבית. הסף כאן הוא נגד שלב ריק
         או מקף, ולא נגד שפה שמילותיה קצרות. */
      assert(String(step).trim().length >= 3, lang + ': שלב ריק');
    });
  });
});

test('אין ערכים ריקים', function () {
  LANGS.forEach(function (lang) {
    Object.keys(accessMail.COPY[lang]).forEach(function (key) {
      var value = accessMail.COPY[lang][key];
      if (Array.isArray(value)) return;
      assert(String(value).trim() !== '', lang + '.' + key);
    });
  });
});

/* ===== הסיסמה ===== */
console.log('\n== הסיסמה ==');

test('מבנה קבוע: שלוש קבוצות של ארבעה', function () {
  for (var i = 0; i < 200; i++) {
    var password = accessMail.newPassword();
    assert(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(password), password);
  }
});

test('בלי תווים שמתבלבלים', function () {
  for (var i = 0; i < 500; i++) {
    var password = accessMail.newPassword().replace(/-/g, '');
    assert(!/[01lio]/.test(password), 'תו מתבלבל בסיסמה ' + password);
  }
});

test('אקראית: אלף הגרלות ללא חזרה', function () {
  var seen = {};
  for (var i = 0; i < 1000; i++) {
    var password = accessMail.newPassword();
    assert(!seen[password], 'סיסמה חזרה על עצמה: ' + password);
    seen[password] = true;
  }
});

test('כל האלפבית בשימוש, בלי הטיה לתחילתו', function () {
  var counts = {};
  var total = 0;
  for (var i = 0; i < 2000; i++) {
    accessMail.newPassword().replace(/-/g, '').split('').forEach(function (ch) {
      counts[ch] = (counts[ch] || 0) + 1;
      total++;
    });
  }
  var letters = Object.keys(counts);
  eq(letters.length, 31, 'כמה תווים שונים הופיעו');
  var expected = total / 31;
  letters.forEach(function (ch) {
    /* דגימה עם דחייה אמורה לתת התפלגות אחידה. סטייה של פי שניים
       על 24,000 תווים אינה מקרה – היא modulo מוטה. */
    assert(counts[ch] > expected * 0.6 && counts[ch] < expected * 1.4,
      'התו ' + ch + ' הופיע ' + counts[ch] + ' פעמים מול ' + Math.round(expected));
  });
});

/* ===== בניית המייל ===== */
console.log('\n== המייל שנבנה ==');

function letter(lang) {
  return accessMail.build({
    lang: lang, name: 'דנה כהן', company: 'מייפון',
    email: 'dana@maiphone.test', password: 'abcd-efgh-jkmn',
    appUrl: 'https://www.setshifts.com/app/',
    logoUrl: 'https://www.setshifts.com/brand/logo-lockup.png'
  });
}

test('הכותרת נושאת את שם העסק', function () {
  assert(letter('he').subject.indexOf('מייפון') !== -1, letter('he').subject);
});

test('הסיסמה, שם המשתמש והקישור בגוף הטקסט', function () {
  var text = letter('he').text;
  assert(text.indexOf('abcd-efgh-jkmn') !== -1, 'אין סיסמה');
  assert(text.indexOf('dana@maiphone.test') !== -1, 'אין שם משתמש');
  assert(text.indexOf('https://www.setshifts.com/app/') !== -1, 'אין קישור');
});

test('הוראות ההתקנה בגוף המייל, לשתי המערכות', function () {
  var html = letter('he').html;
  assert(html.indexOf('Safari') !== -1, 'אין אייפון');
  assert(html.indexOf('Chrome') !== -1, 'אין אנדרואיד');
  eq((html.match(/<li /g) || []).length, 8, 'מספר השלבים');
});

test('כיוון כתיבה לפי השפה', function () {
  assert(letter('he').html.indexOf('dir="rtl"') !== -1, 'עברית אינה מימין');
  assert(letter('ar').html.indexOf('dir="rtl"') !== -1, 'ערבית אינה מימין');
  assert(letter('en').html.indexOf('dir="ltr"') !== -1, 'אנגלית אינה משמאל');
});

test('שפה שאינה מוכרת נופלת לאנגלית', function () {
  eq(accessMail.build({ lang: 'zz', company: 'X', name: 'Y', email: 'a@b.co',
    password: 'p', appUrl: 'https://x.test/' }).lang, 'en');
  eq(accessMail.build({ company: 'X', name: 'Y', email: 'a@b.co',
    password: 'p', appUrl: 'https://x.test/' }).lang, 'en');
});

test('כל השפות נבנות בלי תבנית שנשארה פתוחה', function () {
  LANGS.forEach(function (lang) {
    var built = letter(lang);
    assert(built.subject.indexOf('{') === -1, lang + ': כותרת');
    assert(built.text.indexOf('{') === -1, lang + ': טקסט');
  });
});

test('שם עסק עוין אינו הופך לתגית', function () {
  var built = accessMail.build({
    lang: 'he', name: '<img src=x onerror=alert(1)>', company: '<script>bad()</script>',
    email: 'a@b.co', password: 'p', appUrl: 'https://x.test/'
  });
  assert(built.html.indexOf('<script>') === -1, 'תגית script עברה');
  /* "onerror=" ממשיך להופיע כטקסט – זו בדיוק המטרה. מה שאסור
     הוא שהוא יופיע כתגית פתוחה עם התו < לפניו. */
  assert(built.html.indexOf('<img src=x') === -1, 'התגית נפתחה');
  assert(built.html.indexOf('&lt;img src=x onerror=') !== -1, 'לא בוצע escape לשם');
  assert(built.html.indexOf('&lt;script&gt;') !== -1, 'לא בוצע escape');
});

/* ===== שליחה בלי הגדרות ===== */
console.log('\n== שליחה בלי הגדרות ==');

test('בלי מפתח דואר אין נכונות לשלוח', function () {
  var keyBefore = process.env.RESEND_API_KEY;
  var fromBefore = process.env.MAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  eq(mail.ready(), false, 'ready');
  if (keyBefore !== undefined) process.env.RESEND_API_KEY = keyBefore;
  if (fromBefore !== undefined) process.env.MAIL_FROM = fromBefore;
});

test('בלי כתובת שולח גם מפתח אינו מספיק', function () {
  var keyBefore = process.env.RESEND_API_KEY;
  var fromBefore = process.env.MAIL_FROM;
  process.env.RESEND_API_KEY = 'k';
  delete process.env.MAIL_FROM;
  eq(mail.ready(), false, 'ready');
  if (keyBefore === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = keyBefore;
  if (fromBefore !== undefined) process.env.MAIL_FROM = fromBefore;
});

/* ===== המסלול בשרת ===== */
console.log('\n== המסלול בשרת: שליחת פרטי כניסה ==');

var handler = require(path.join(root, 'api/create-user.js'));

function fakeRes() {
  return {
    statusCode: 0, body: null, headers: {},
    setHeader: function (key, value) { this.headers[key] = value; },
    end: function (text) { this.body = text ? JSON.parse(text) : null; }
  };
}

/* שרת מדומה: Supabase ו-Resend. כל בקשה נרשמת, כדי שאפשר יהיה
   לשאול אחר כך מה בדיוק נשלח ולאן. */
function stub(options) {
  var opts = options || {};
  var calls = [];
  global.fetch = function (url, init) {
    var body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url: url, method: (init && init.method) || 'GET', body: body });

    function json(status, payload) {
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status: status,
        text: function () { return Promise.resolve(JSON.stringify(payload)); }
      });
    }

    if (url.indexOf('api.resend.com') !== -1) {
      return opts.mailFails ? json(422, { message: 'domain not verified' })
        : json(200, { id: 'mail-1' });
    }
    if (url.indexOf('/auth/v1/user') !== -1) return json(200, { id: 'u-mgr' });
    if (url.indexOf('/rest/v1/company_users?id=eq.u-mgr') !== -1) {
      return json(200, [{ company_id: 'co-1', role: 'manager', active: true }]);
    }
    if (url.indexOf('/rest/v1/companies?id=eq.') !== -1) {
      return json(200, [{ name: 'מייפון' }]);
    }
    if (url.indexOf('/rest/v1/company_users?company_id=eq.') !== -1 &&
        url.indexOf('email=eq.') !== -1) {
      return json(200, opts.existing ? [opts.existing] : []);
    }
    if (url.indexOf('/auth/v1/admin/users') !== -1) return json(200, { id: 'u-new' });
    if (url.indexOf('/rest/v1/company_users') !== -1) return json(200, [{ id: 'u-new' }]);
    return json(404, { message: 'unexpected ' + url });
  };
  return calls;
}

function run(input, options) {
  var calls = stub(options);
  var res = fakeRes();
  var req = {
    method: 'POST',
    headers: { authorization: 'Bearer caller-token', host: 'www.setshifts.com' },
    body: JSON.stringify(Object.assign({ mode: 'access' }, input))
  };
  return handler(req, res).then(function () { return { res: res, calls: calls }; });
}

process.env.SUPABASE_URL = 'https://demo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.RESEND_API_KEY = 'resend-key';
process.env.MAIL_FROM = 'SetShifts <no-reply@setshifts.test>';
delete process.env.APP_URL;

var results = [];
function asyncTest(name, fn) { results.push({ name: name, fn: fn }); }

asyncTest('עובד חדש: נוצר חשבון ונשלח מייל', function () {
  return run({ email: 'Dana@Maiphone.test', name: 'דנה', employeeId: 'emp-1' })
    .then(function (out) {
      eq(out.res.statusCode, 200, 'סטטוס');
      eq(out.res.body.created, true, 'נוצר');
      eq(out.res.body.sent, true, 'נשלח');
      eq(out.res.body.email, 'dana@maiphone.test', 'המייל מנורמל');
    });
});

asyncTest('הסיסמה אינה חוזרת למסך של המנהל', function () {
  return run({ email: 'dana@maiphone.test', name: 'דנה' }).then(function (out) {
    var payload = JSON.stringify(out.res.body);
    var created = out.calls.filter(function (call) {
      return call.url.indexOf('/auth/v1/admin/users') !== -1 && call.method === 'POST';
    })[0];
    assert(created && created.body.password, 'לא נקבעה סיסמה בכלל');
    assert(payload.indexOf(created.body.password) === -1,
      'הסיסמה חזרה בתשובה לדפדפן: ' + payload);
  });
});

asyncTest('הסיסמה שנקבעה היא הסיסמה שנשלחה בדואר', function () {
  return run({ email: 'dana@maiphone.test', name: 'דנה' }).then(function (out) {
    var created = out.calls.filter(function (call) {
      return call.url.indexOf('/auth/v1/admin/users') !== -1 && call.method === 'POST';
    })[0];
    var letterSent = out.calls.filter(function (call) {
      return call.url.indexOf('api.resend.com') !== -1;
    })[0];
    assert(letterSent, 'לא נשלח מייל');
    assert(letterSent.body.text.indexOf(created.body.password) !== -1,
      'המייל אינו מכיל את הסיסמה שנקבעה');
    eq(letterSent.body.to[0], 'dana@maiphone.test', 'הנמען');
  });
});

asyncTest('הקישור במייל נגזר בשרת ולא מהדפדפן', function () {
  return run({ email: 'dana@maiphone.test', name: 'דנה',
    appUrl: 'https://evil.test/steal/' }).then(function (out) {
    var letterSent = out.calls.filter(function (call) {
      return call.url.indexOf('api.resend.com') !== -1;
    })[0];
    assert(letterSent.body.text.indexOf('evil.test') === -1, 'כתובת מהדפדפן נכנסה למייל');
    assert(letterSent.body.text.indexOf('https://www.setshifts.com/app/') !== -1,
      'הכתובת הנכונה חסרה');
  });
});

asyncTest('שם העסק במייל מגיע מהשרת ולא מהבקשה', function () {
  return run({ email: 'dana@maiphone.test', name: 'דנה', company: 'בנק ישראל' })
    .then(function (out) {
      var letterSent = out.calls.filter(function (call) {
        return call.url.indexOf('api.resend.com') !== -1;
      })[0];
      assert(letterSent.body.subject.indexOf('מייפון') !== -1, letterSent.body.subject);
      assert(letterSent.body.subject.indexOf('בנק ישראל') === -1, 'שם מזויף עבר');
    });
});

asyncTest('משתמש קיים בחברה מקבל סיסמה חדשה ולא חשבון שני', function () {
  return run({ email: 'dana@maiphone.test', name: 'דנה' },
    { existing: { id: 'u-old', role: 'employee', employee_id: 'emp-1', name: 'דנה', active: true } })
    .then(function (out) {
      eq(out.res.statusCode, 200, 'סטטוס');
      eq(out.res.body.created, false, 'לא נוצר חדש');
      var newAccount = out.calls.filter(function (call) {
        return call.url.indexOf('/auth/v1/admin/users') !== -1 && call.method === 'POST';
      });
      eq(newAccount.length, 0, 'נפתח חשבון שני');
      var reset = out.calls.filter(function (call) {
        return call.url.indexOf('/auth/v1/admin/users/u-old') !== -1;
      })[0];
      assert(reset && reset.body.password, 'לא נקבעה סיסמה חדשה');
    });
});

asyncTest('הבעלים אינו מקבל סיסמה מהמנהל', function () {
  return run({ email: 'boss@maiphone.test', name: 'הבעלים' },
    { existing: { id: 'u-boss', role: 'owner', employee_id: null, name: 'הבעלים', active: true } })
    .then(function (out) {
      eq(out.res.statusCode, 403, 'סטטוס');
      var sent = out.calls.filter(function (call) {
        return call.url.indexOf('api.resend.com') !== -1;
      });
      eq(sent.length, 0, 'נשלח מייל בכל זאת');
    });
});

asyncTest('כשהדואר נופל – נאמר במפורש, ולא "נשלח"', function () {
  return run({ email: 'dana@maiphone.test', name: 'דנה' }, { mailFails: true })
    .then(function (out) {
      eq(out.res.statusCode, 502, 'סטטוס');
      assert(!out.res.body.sent, 'דווח כנשלח');
      assert(/not sent/.test(out.res.body.message), out.res.body.message);
    });
});

asyncTest('בלי הגדרת דואר – מסרב לפני שהוא יוצר חשבון', function () {
  var before = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  return run({ email: 'dana@maiphone.test', name: 'דנה' }).then(function (out) {
    process.env.RESEND_API_KEY = before;
    eq(out.res.statusCode, 503, 'סטטוס');
    var created = out.calls.filter(function (call) {
      return call.url.indexOf('/auth/v1/admin/users') !== -1;
    });
    eq(created.length, 0, 'נוצר חשבון למרות שאי אפשר לשלוח');
  }, function (err) { process.env.RESEND_API_KEY = before; throw err; });
});

(function next(index) {
  if (index >= results.length) {
    console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' +
      failed + ' נכשלו\n');
    process.exit(failed ? 1 : 0);
    return;
  }
  var item = results[index];
  item.fn().then(function () {
    passed++; console.log('  ✓ ' + item.name);
  }, function (err) {
    failed++; console.log('  ✗ ' + item.name + '\n      ' + (err && err.message));
  }).then(function () { next(index + 1); });
})(0);
