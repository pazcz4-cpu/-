/* וואטסאפ: המספר, התבנית, סריקת הנטישות, וההסרה.

   כאן יושבת התכונה היחידה במערכת שיוזמת פנייה ללקוח שלא ביקש
   אותה כרגע, ולכן הדגש הוא על מה שאסור שיקרה: הודעה למי שלא
   הסכים, הודעה למי שביקש להסיר, הודעה פעמיים, ו-webhook שמקבל
   פקודות ממי שאינו מטא.

   הרצה: node tests/whatsapp-tests.js */
'use strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.CRON_SECRET = 'cron-secret';
process.env.WHATSAPP_TOKEN = 'wa-token';
process.env.WHATSAPP_PHONE_ID = '111222333';
process.env.WHATSAPP_APP_SECRET = 'app-secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';

var crypto = require('node:crypto');
var wa = require('../api/_whatsapp.js');
var endpoint = require('../api/wa.js');
var webhook = require('../api/_wa-webhook.js');

var passed = 0, failed = 0;
function assert(condition, message) { if (!condition) throw new Error(message); }
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'ערכים שונים') + ': התקבל ' + JSON.stringify(actual) +
      ', ציפינו ל-' + JSON.stringify(expected));
  }
}

var queue = Promise.resolve();
function test(name, fn) {
  queue = queue.then(function () {
    return Promise.resolve().then(fn).then(function () {
      passed++; console.log('  ✓ ' + name);
    }, function (err) {
      failed++; console.log('  ✗ ' + name + '\n      ' + (err && err.message));
    });
  });
}

function daysAgo(n) { return new Date(Date.now() - n * 864e5).toISOString(); }
function hoursAgo(n) { return new Date(Date.now() - n * 36e5).toISOString(); }

/* ===== שרת מדומה: בסיס הנתונים ומטא ===== */
function Fake(companies) {
  this.companies = {};
  (companies || []).forEach(function (row) { this.companies[row.id] = row; }, this);
  this.messages = [];    // שורות wa_messages
  this.sent = [];        // מה נשלח למטא בפועל
  this.reply = { ok: true };
}

Fake.prototype.install = function () {
  var self = this;
  globalThis.fetch = function (url, options) {
    var opts = options || {};
    var parsed = new URL(url);
    var query = decodeURIComponent(parsed.search.slice(1));

    function reply(status, payload) {
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status: status,
        text: function () {
          return Promise.resolve(payload === undefined ? '' : JSON.stringify(payload));
        }
      });
    }

    /* מטא */
    if (parsed.hostname === 'graph.facebook.com') {
      self.sent.push(JSON.parse(opts.body));
      if (!self.reply.ok) {
        return reply(400, { error: { code: self.reply.code || 131030, message: 'nope' } });
      }
      return reply(200, { messages: [{ id: 'wamid.' + self.sent.length }] });
    }

    var path = parsed.pathname.replace('/rest/v1', '');
    var body = opts.body ? JSON.parse(opts.body) : null;

    if (path === '/wa_messages') {
      if (opts.method === 'POST') {
        var row = body[0];
        var exists = self.messages.some(function (m) {
          return m.company_id === row.company_id && m.template === row.template;
        });
        if (exists) return reply(409, { code: '23505' });
        self.messages.push(row);
        return reply(201, []);
      }
      if (opts.method === 'PATCH') {
        var id = (query.match(/company_id=eq\.([^&]+)/) || [])[1];
        self.messages.forEach(function (m) {
          if (m.company_id === id) Object.assign(m, body);
        });
        return reply(200, []);
      }
    }

    if (path === '/companies' && (opts.method || 'GET') === 'GET') {
      /* מחקים את הסינון שהקוד מבקש. הנקודה כאן אינה הדיוק של
         בסיס הנתונים אלא שהתנאים באמת נשלחים: חברה שלא הסכימה
         אינה אמורה לצאת מהשאילתה בכלל. */
      var rows = Object.keys(self.companies).map(function (id) { return self.companies[id]; });
      if (/status=eq\.trial/.test(query)) {
        rows = rows.filter(function (c) { return c.status === 'trial'; });
      }
      if (/billing_subscription_id=is\.null/.test(query)) {
        rows = rows.filter(function (c) { return !c.billing_subscription_id; });
      }
      if (/wa_opt_in=is\.true/.test(query)) {
        rows = rows.filter(function (c) { return c.wa_opt_in === true; });
      }
      if (/wa_opt_out_at=is\.null/.test(query)) {
        rows = rows.filter(function (c) { return !c.wa_opt_out_at; });
      }
      if (/phone=not\.is\.null/.test(query)) {
        rows = rows.filter(function (c) { return !!c.phone; });
      }
      var older = (query.match(/created_at=lt\.([^&]+)/) || [])[1];
      if (older) rows = rows.filter(function (c) { return new Date(c.created_at) < new Date(older); });
      var newer = (query.match(/created_at=gt\.([^&]+)/) || [])[1];
      if (newer) rows = rows.filter(function (c) { return new Date(c.created_at) > new Date(newer); });
      return reply(200, rows);
    }

    if (path === '/companies' && opts.method === 'PATCH') {
      var cid = (query.match(/id=eq\.([^&]+)/) || [])[1];
      if (self.companies[cid]) Object.assign(self.companies[cid], body);
      return reply(200, []);
    }

    return reply(404, { message: 'no route: ' + path });
  };
};

function company(overrides) {
  return Object.assign({
    id: 'co-1', name: 'קפה מרכז', phone: '054-1234567',
    status: 'trial', billing_subscription_id: null,
    wa_opt_in: true, wa_opt_out_at: null,
    created_at: hoursAgo(5)
  }, overrides || {});
}

function res() {
  return {
    statusCode: 0, payload: null, body: '',
    setHeader: function () {},
    end: function (text) {
      this.body = text || '';
      try { this.payload = text ? JSON.parse(text) : null; } catch (err) { this.payload = null; }
    }
  };
}

function runCron(auth) {
  var req = {
    method: 'POST', url: '/api/wa?action=abandoned',
    headers: { authorization: auth === undefined ? 'Bearer cron-secret' : auth }
  };
  var out = res();
  return Promise.resolve(endpoint(req, out)).then(function () { return out; });
}

function sign(raw) {
  return 'sha256=' + crypto.createHmac('sha256', 'app-secret').update(raw, 'utf8').digest('hex');
}

function runWebhook(payload, signature) {
  var raw = JSON.stringify(payload);
  var req = {
    method: 'POST', url: '/api/wa', body: raw,
    headers: { 'x-hub-signature-256': signature === undefined ? sign(raw) : signature }
  };
  var out = res();
  return Promise.resolve(endpoint(req, out)).then(function () { return out; });
}

function incoming(from, text) {
  return { entry: [{ changes: [{ value: { messages: [{ from: from, text: { body: text } }] } }] }] };
}

console.log('\n== המספר ==');

test('מספר מקומי הופך לבינלאומי', function () {
  assertEqual(wa.toWaNumber('054-1234567'), '972541234567', 'מספר ישראלי');
  assertEqual(wa.toWaNumber('054 123 4567'), '972541234567', 'רווחים');
  assertEqual(wa.toWaNumber('+972-54-1234567'), '972541234567', 'כבר בינלאומי');
  assertEqual(wa.toWaNumber('00972541234567'), '972541234567', 'קידומת חיוג 00');
});

/* לקוח בגרמניה שהזין מספר מקומי אינו אמור לקבל קידומת ישראלית */
test('מספר עם קידומת מדינה אחרת נשמר כפי שהוא', function () {
  assertEqual(wa.toWaNumber('+49 151 23456789'), '4915123456789', 'מספר גרמני');
  assertEqual(wa.toWaNumber('0049 151 23456789'), '4915123456789', 'גרמני עם 00');
});

test('מה שאינו מספר אינו הופך למספר', function () {
  assertEqual(wa.toWaNumber('שלום'), '', 'טקסט');
  assertEqual(wa.toWaNumber(''), '', 'ריק');
  assertEqual(wa.toWaNumber('12'), '', 'קצר מדי');
  assertEqual(wa.toWaNumber('0541234567890123456'), '', 'ארוך מדי');
});

console.log('\n== התבנית ==');

test('הערכים נכנסים לגוף לפי הסדר', function () {
  var body = wa.templateBody('972541234567', 'signup_abandoned_he', 'he', ['פז', 'הטבה'], []);
  assertEqual(body.template.name, 'signup_abandoned_he', 'שם התבנית');
  assertEqual(body.template.language.code, 'he', 'השפה');
  assertEqual(body.template.components[0].parameters[1].text, 'הטבה', 'הערך השני');
});

/* כפתור עם משתנה בכתובת הוא רכיב נפרד עם index אצל מטא, ולא
   עוד פרמטר בגוף. טעות כאן מחזירה 132000. */
test('משתנה בכפתור הוא רכיב נפרד', function () {
  var body = wa.templateBody('972541234567', 'x', 'he', ['a'], ['token-1']);
  var button = body.template.components.filter(function (c) { return c.type === 'button'; })[0];
  assert(button, 'אין רכיב כפתור');
  assertEqual(button.sub_type, 'url', 'סוג הכפתור');
  assertEqual(button.index, '0', 'המיקום');
  assertEqual(button.parameters[0].text, 'token-1', 'הערך בכפתור');
});

console.log('\n== סריקת הנטישות ==');

test('מי שנטש מקבל הודעה אחת', function () {
  var db = new Fake([company()]);
  db.install();
  return runCron().then(function (out) {
    assertEqual(out.statusCode, 200, 'קוד תשובה');
    assertEqual(db.sent.length, 1, 'מספר ההודעות שנשלחו');
    assertEqual(db.sent[0].to, '972541234567', 'הנמען');
    assertEqual(db.messages[0].status, 'sent', 'השורה לא סומנה כנשלחה');
  });
});

/* האילוץ בבסיס הנתונים הוא מה שאוכף את זה, ולא בדיקה בקוד:
   הקרון רץ כל שעה, ושתי ריצות שחופפות הן דבר שקורה. */
test('ריצה שנייה אינה שולחת שוב', function () {
  var db = new Fake([company()]);
  db.install();
  return runCron().then(function () { return runCron(); }).then(function () {
    assertEqual(db.sent.length, 1, 'נשלחה הודעה שנייה');
  });
});

test('מי שלא הסכים לדיוור אינו מקבל', function () {
  var db = new Fake([company({ wa_opt_in: false })]);
  db.install();
  return runCron().then(function () {
    assertEqual(db.sent.length, 0, 'נשלחה הודעה בלי הסכמה');
  });
});

/* הסרה גוברת על הסכמה: מי שביקש להסיר ביקש להסיר */
test('מי שביקש להסיר אינו מקבל, גם אם הסכים בעבר', function () {
  var db = new Fake([company({ wa_opt_in: true, wa_opt_out_at: daysAgo(1) })]);
  db.install();
  return runCron().then(function () {
    assertEqual(db.sent.length, 0, 'נשלחה הודעה אחרי בקשת הסרה');
  });
});

test('מי שכבר הזין כרטיס אינו "נטש"', function () {
  var db = new Fake([company({ billing_subscription_id: 'tok-1' })]);
  db.install();
  return runCron().then(function () {
    assertEqual(db.sent.length, 0, 'נשלחה תזכורת ללקוח משלם');
  });
});

test('מי שנרשם לפני רגע מקבל עוד זמן', function () {
  var db = new Fake([company({ created_at: hoursAgo(1) })]);
  db.install();
  return runCron().then(function () {
    assertEqual(db.sent.length, 0, 'נשלחה תזכורת מוקדם מדי');
  });
});

/* מעבר ליומיים זו כבר לא תזכורת אלא פנייה קרה */
test('מי שנטש לפני שבוע אינו מקבל תזכורת', function () {
  var db = new Fake([company({ created_at: daysAgo(7) })]);
  db.install();
  return runCron().then(function () {
    assertEqual(db.sent.length, 0, 'נשלחה תזכורת מאוחר מדי');
  });
});

test('בלי סוד הקרון נדחה', function () {
  var db = new Fake([company()]);
  db.install();
  return runCron('Bearer wrong').then(function (out) {
    assertEqual(out.statusCode, 401, 'קוד תשובה');
    assertEqual(db.sent.length, 0, 'נשלחה הודעה בלי הרשאה');
  });
});

/* כישלון נשאר רשום ואינו נמחק: מחיקה הייתה פותחת ניסיון חוזר
   בכל ריצה, ולקוח עם מספר שגוי היה מייצר ניסיון כושל לנצח. */
test('כישלון נרשם ואינו מנוסה שוב', function () {
  var db = new Fake([company()]);
  db.reply = { ok: false, code: 131030 };
  db.install();
  return runCron().then(function () {
    assertEqual(db.messages[0].status, 'failed', 'הכישלון לא נרשם');
    assert(/131030/.test(db.messages[0].error || ''), 'קוד השגיאה לא נשמר');
    db.reply = { ok: true };
    return runCron();
  }).then(function () {
    assertEqual(db.sent.length, 1, 'נעשה ניסיון חוזר');
  });
});

console.log('\n== מה שחוזר מוואטסאפ ==');

test('אימות מול מטא מחזיר את האתגר', function () {
  var out = res();
  return Promise.resolve(endpoint({
    method: 'GET',
    url: '/api/wa?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345',
    headers: {}
  }, out)).then(function () {
    assertEqual(out.statusCode, 200, 'קוד תשובה');
    assertEqual(out.body, '12345', 'האתגר לא הוחזר');
  });
});

test('טוקן אימות שגוי נדחה', function () {
  var out = res();
  return Promise.resolve(endpoint({
    method: 'GET',
    url: '/api/wa?hub.mode=subscribe&hub.verify_token=guess&hub.challenge=12345',
    headers: {}
  }, out)).then(function () {
    assertEqual(out.statusCode, 403, 'קוד תשובה');
  });
});

test('"הסר" מסמן את הלקוח ומפסיק את הדיוור', function () {
  var db = new Fake([company()]);
  db.install();
  return runWebhook(incoming('972541234567', 'הסר')).then(function (out) {
    assertEqual(out.statusCode, 200, 'קוד תשובה');
    assert(db.companies['co-1'].wa_opt_out_at, 'הלקוח לא סומן כמוסר');
    /* ומכאן הוא לא מקבל עוד */
    return runCron();
  }).then(function () {
    assertEqual(db.sent.length, 0, 'נשלחה הודעה אחרי הסרה');
  });
});

/* "הסר אותי בבקשה" היא אותה בקשה בדיוק. עדיף להסיר יותר מדי
   מאשר להחמיץ בקשה אחת. */
test('גם ניסוח חופשי נתפס כהסרה', function () {
  var db = new Fake([company()]);
  db.install();
  return runWebhook(incoming('972541234567', 'הסר אותי בבקשה מהרשימה')).then(function () {
    assert(db.companies['co-1'].wa_opt_out_at, 'הבקשה לא זוהתה');
  });
});

test('הודעה רגילה אינה מסירה אף אחד', function () {
  var db = new Fake([company()]);
  db.install();
  return runWebhook(incoming('972541234567', 'מעוניין לשמוע עוד')).then(function () {
    assertEqual(db.companies['co-1'].wa_opt_out_at, null, 'לקוח מתעניין הוסר מהדיוור');
  });
});

/* בלי אימות חתימה כל מי שמכיר את הכתובת יכול להסיר לקוח אחר,
   או להפוך את היומן שלנו לזבל. */
test('בקשה בלי חתימה נדחית', function () {
  var db = new Fake([company()]);
  db.install();
  return runWebhook(incoming('972541234567', 'הסר'), '').then(function (out) {
    assertEqual(out.statusCode, 401, 'קוד תשובה');
    assertEqual(db.companies['co-1'].wa_opt_out_at, null, 'בוצעה הסרה בלי חתימה');
  });
});

test('חתימה שגויה נדחית', function () {
  var db = new Fake([company()]);
  db.install();
  return runWebhook(incoming('972541234567', 'הסר'), 'sha256=' + 'a'.repeat(64))
    .then(function (out) {
      assertEqual(out.statusCode, 401, 'קוד תשובה');
      assertEqual(db.companies['co-1'].wa_opt_out_at, null, 'בוצעה הסרה עם חתימה שגויה');
    });
});

/* המספר אצלנו נשמר כפי שהלקוח הקליד, ומוואטסאפ הוא מגיע
   בינלאומי. בלי ההשוואה על הספרות האחרונות אף הסרה לא תעבוד. */
test('המספר מזוהה גם כשהוא כתוב אחרת אצלנו', function () {
  var db = new Fake([company({ phone: '+972 54-123-4567' })]);
  db.install();
  return runWebhook(incoming('972541234567', 'STOP')).then(function () {
    assert(db.companies['co-1'].wa_opt_out_at, 'המספר לא זוהה');
  });
});

test('מספר שאינו מוכר אינו מפיל את הבקשה', function () {
  var db = new Fake([company()]);
  db.install();
  return runWebhook(incoming('972500000000', 'הסר')).then(function (out) {
    assertEqual(out.statusCode, 200, 'קוד תשובה');
    assertEqual(out.payload.actions[0].action, 'unknown-number', 'הפעולה שדווחה');
  });
});

console.log('\n== בלי הגדרה ==');

test('בלי טוקן אין שליחה, ואין קריסה', function () {
  var db = new Fake([company()]);
  db.install();
  var real = process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_TOKEN;
  return runCron().then(function (out) {
    process.env.WHATSAPP_TOKEN = real;
    assertEqual(out.statusCode, 200, 'קוד תשובה');
    assertEqual(out.payload.skipped, 'whatsapp-not-configured', 'לא דווח שהתכונה כבויה');
    assertEqual(db.sent.length, 0, 'נשלחה הודעה בלי טוקן');
  }, function (err) {
    process.env.WHATSAPP_TOKEN = real;
    throw err;
  });
});

/* שער פתוח אינו ברירת מחדל סבירה גם בפיתוח: בדיוק כך הוא
   נשאר פתוח באוויר. */
test('בלי סוד אפליקציה אין אימות חתימה, ולכן אין קבלה', function () {
  var real = process.env.WHATSAPP_APP_SECRET;
  delete process.env.WHATSAPP_APP_SECRET;
  var ok = webhook.signatureOk('{}', 'sha256=whatever');
  process.env.WHATSAPP_APP_SECRET = real;
  assertEqual(ok, false, 'בקשה התקבלה בלי סוד מוגדר');
});

queue.then(function () {
  console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
  process.exit(failed ? 1 : 0);
});
