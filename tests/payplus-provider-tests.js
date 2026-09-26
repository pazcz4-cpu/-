/* בדיקות למתאם PayPlus.
   כאן עובר כסף אמיתי, ולכן הבדיקות מתמקדות במה שאסור שיקרה:
   הודעה מזויפת שמתקבלת, שמירת כרטיס שהופכת לחיוב, חיוב שנכשל
   ומנוסה שוב בעיוורון, ומפתח סודי שדולף להודעת שגיאה.

   הרצה: node tests/payplus-provider-tests.js */
'use strict';

var crypto = require('crypto');

var API_KEY = 'test-api-key-9f3a';
var SECRET_KEY = 'test-secret-key-51cc';
var WEBHOOK_SECRET = 'webhook-secret-7b2d';

process.env.PAYPLUS_SANDBOX = 'true';
process.env.PAYPLUS_API_KEY = API_KEY;
process.env.PAYPLUS_SECRET_KEY = SECRET_KEY;
process.env.PAYPLUS_TERMINAL_UID = 'term-1';
process.env.PAYPLUS_PAYMENT_PAGE_UID = 'page-1';
process.env.PUBLIC_BASE_URL = 'https://setshifts.com';

var providers = require('../api/billing/_providers.js');
var payplus = providers.payplus;

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

function ready(on) {
  if (on) process.env.PAYPLUS_READY = 'true';
  else delete process.env.PAYPLUS_READY;
}

/* ===== PayPlus מדומה =====
   מתעד כל קריאה, ומחזיר מה שביקשו ממנו להחזיר. */
function FakePayPlus() { this.calls = []; this.replies = []; }

FakePayPlus.prototype.reply = function (status, body) {
  this.replies.push({ status: status, body: body });
  return this;
};

FakePayPlus.prototype.install = function () {
  var self = this;
  this.original = globalThis.fetch;
  globalThis.fetch = function (url, options) {
    var opts = options || {};
    self.calls.push({
      url: url,
      headers: opts.headers || {},
      body: opts.body ? JSON.parse(opts.body) : null
    });
    var next = self.replies.shift() || { status: 200, body: { results: { status: 'success' } } };
    if (next.throws) return Promise.reject(new Error(next.throws));
    return Promise.resolve({
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: function () { return Promise.resolve(JSON.stringify(next.body)); }
    });
  };
  return this;
};

FakePayPlus.prototype.fail = function (message) {
  this.replies.push({ throws: message });
  return this;
};

FakePayPlus.prototype.restore = function () { globalThis.fetch = this.original; };

FakePayPlus.prototype.last = function () { return this.calls[this.calls.length - 1]; };

function withFake(setup, run) {
  var fake = new FakePayPlus();
  if (setup) setup(fake);
  fake.install();
  return Promise.resolve().then(function () { return run(fake); })
    .then(function (value) { fake.restore(); return value; },
      function (err) { fake.restore(); throw err; });
}

function signBase64(raw) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw, 'utf8').digest('base64');
}

console.log('\n== לפני שהחיבור הופעל ==');

test('לא מקבלים הודעות', function () {
  ready(false);
  var raw = JSON.stringify({ transaction_uid: 'tx-1' });
  assertEqual(payplus.verify(raw, { 'user-agent': 'PayPlus', hash: signBase64(raw) },
    WEBHOOK_SECRET), false, 'הודעה התקבלה לפני שהחיבור הופעל');
});

test('ולא מחייבים אף כרטיס', function () {
  ready(false);
  return Promise.resolve().then(function () {
    return payplus.charge({ subscriptionId: 'tok-1', amount: 199, idempotencyKey: 'k' });
  }).then(function () {
    throw new Error('החיוב לא נחסם');
  }, function (err) {
    assert(/not configured/.test(err.message), 'הסיבה אינה ברורה: ' + err.message);
  });
});

console.log('\n== הזדהות ==');

test('שתי כותרות נפרדות, לא מסמך JSON בכותרת אחת', function () {
  ready(true);
  return withFake(function (fake) {
    fake.reply(200, { results: { status: 'success' },
      data: { payment_page_link: 'https://payplus.co.il/x', page_request_uid: 'req-1' } });
  }, function (fake) {
    return payplus.createCheckout({
      companyId: 'co-1', companyName: 'קפה', amount: 199, saveCardOnly: true,
      returnUrl: 'https://setshifts.com/app/', cancelUrl: 'https://setshifts.com/app/'
    }).then(function () {
      var headers = fake.last().headers;
      assertEqual(headers['api-key'], API_KEY, 'מפתח ה-API לא נשלח בכותרת שלו');
      assertEqual(headers['secret-key'], SECRET_KEY, 'המפתח הסודי לא נשלח בכותרת שלו');
      assertEqual(headers.Authorization, undefined, 'נשלחה כותרת Authorization מיותרת');
    });
  });
});

test('סביבת הבדיקות ניגשת לכתובת של סביבת הבדיקות', function () {
  ready(true);
  return withFake(function (fake) {
    fake.reply(200, { results: { status: 'success' },
      data: { payment_page_link: 'https://payplus.co.il/x' } });
  }, function (fake) {
    return payplus.createCheckout({
      companyId: 'co-1', amount: 199, saveCardOnly: true,
      returnUrl: 'r', cancelUrl: 'c'
    }).then(function () {
      assert(fake.last().url.indexOf('restapidev.payplus.co.il') !== -1,
        'הבקשה לא הלכה לסביבת הבדיקות: ' + fake.last().url);
    });
  });
});

console.log('\n== אימות ההודעה החוזרת ==');

test('חתימה תקינה מתקבלת', function () {
  ready(true);
  var raw = JSON.stringify({ transaction_uid: 'tx-1', more_info: 'co-1' });
  assertEqual(payplus.verify(raw, { 'user-agent': 'PayPlus', hash: signBase64(raw) },
    WEBHOOK_SECRET), true, 'חתימה תקינה נדחתה');
});

test('חתימה על גוף אחר נדחית', function () {
  ready(true);
  var signed = JSON.stringify({ transaction_uid: 'tx-1', amount: 1 });
  var sent = JSON.stringify({ transaction_uid: 'tx-1', amount: 9999 });
  assertEqual(payplus.verify(sent, { 'user-agent': 'PayPlus', hash: signBase64(signed) },
    WEBHOOK_SECRET), false, 'גוף ששונה אחרי החתימה התקבל');
});

test('אותה חתימה בקידוד hex נדחית', function () {
  ready(true);
  var raw = JSON.stringify({ transaction_uid: 'tx-1' });
  var hex = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw, 'utf8').digest('hex');
  assertEqual(payplus.verify(raw, { 'user-agent': 'PayPlus', hash: hex }, WEBHOOK_SECRET),
    false, 'קידוד שאינו base64 התקבל');
});

test('הודעה בלי user-agent של PayPlus נדחית', function () {
  ready(true);
  var raw = JSON.stringify({ transaction_uid: 'tx-1' });
  assertEqual(payplus.verify(raw, { 'user-agent': 'curl/8', hash: signBase64(raw) },
    WEBHOOK_SECRET), false, 'שולח לא מזוהה התקבל');
});

test('הודעה בלי חתימה נדחית', function () {
  ready(true);
  var raw = JSON.stringify({ transaction_uid: 'tx-1' });
  assertEqual(payplus.verify(raw, { 'user-agent': 'PayPlus' }, WEBHOOK_SECRET), false,
    'הודעה בלי חתימה התקבלה');
});

test('בלי שום סוד אין אימות, וגם אין קבלה', function () {
  ready(true);
  var saved = process.env.PAYPLUS_SECRET_KEY;
  delete process.env.PAYPLUS_SECRET_KEY;
  var raw = JSON.stringify({ transaction_uid: 'tx-1' });
  var result = payplus.verify(raw, { 'user-agent': 'PayPlus', hash: signBase64(raw) }, '');
  process.env.PAYPLUS_SECRET_KEY = saved;
  assertEqual(result, false, 'הודעה התקבלה בלי סוד מוגדר');
});

test('בלי סוד ייעודי נופלים ל-secret-key, כי בו PayPlus חותם', function () {
  /* כך אין סוד שלישי לנהל, ואין דרך להגדיר אותו לא נכון */
  ready(true);
  var raw = JSON.stringify({ transaction_uid: 'tx-1' });
  var hash = crypto.createHmac('sha256', SECRET_KEY).update(raw, 'utf8').digest('base64');
  assertEqual(payplus.verify(raw, { 'user-agent': 'PayPlus', hash: hash }, ''), true,
    'חתימה ב-secret-key נדחתה');
});

test('גוף שסודר מחדש בדרך עדיין מתקבל', function () {
  /* אם שכבה כלשהי פירקה והרכיבה מחדש את ה-JSON, הבייטים אינם
     מה ש-PayPlus חתם עליו. עדיין צריך סוד כדי לזייף. */
  ready(true);
  var original = '{ "transaction_uid": "tx-1",  "more_info": "co-1" }';
  var reassembled = JSON.stringify(JSON.parse(original));
  assertEqual(payplus.verify(reassembled,
    { 'user-agent': 'PayPlus', hash: signBase64(reassembled) }, WEBHOOK_SECRET), true,
  'גוף מסודר מחדש נדחה');
});

console.log('\n== תרגום ההודעה ==');

test('שמירת כרטיס מקשרת טוקן לחברה ואינה משנה סטטוס', function () {
  var event = payplus.parse({
    transaction_uid: 'tx-1', more_info: 'co-42',
    data: { token: 'tok-abc', customer_uid: 'cus-9' }
  });
  assertEqual(event.companyId, 'co-42', 'מזהה החברה לא נקרא');
  assertEqual(event.subscriptionId, 'tok-abc', 'הטוקן לא נקרא');
  assertEqual(event.customerId, 'cus-9', 'מזהה הלקוח לא נקרא');
  assertEqual(event.status, null, 'ההודעה קבעה סטטוס במקום ipn-full');
  assertEqual(event.id, 'payplus:tx-1', 'מזהה האירוע אינו יציב');
});

test('הודעה על חיוב שלנו אינה מנסה לקשר חברה מחדש', function () {
  /* בחיוב more_info נושא את מפתח התקופה, לא מזהה חברה */
  var event = payplus.parse({
    transaction_uid: 'tx-2', more_info: 'charge:co-42:2026-10-05', token: 'tok-abc'
  });
  assertEqual(event.companyId, null, 'מפתח תקופה פורש כמזהה חברה');
  assertEqual(event.moreInfo, 'charge:co-42:2026-10-05', 'more_info לא נשמר');
});

test('הודעה בלי מזהה מקבלת מזהה יציב משלה, ולא נדחית', function () {
  /* הודעה שנדחית נשלחת שוב ושוב. עדיף לזהות אותה לפי תוכנה. */
  var body = { more_info: 'co-1', data: { token: 'tok-1' } };
  var first = payplus.parse(body).id;
  var second = payplus.parse(JSON.parse(JSON.stringify(body))).id;
  assert(!!first, 'לא נוצר מזהה');
  assertEqual(first, second, 'אותה הודעה קיבלה שני מזהים, ותעובד פעמיים');
  assert(payplus.parse({ more_info: 'co-2' }).id !== first,
    'שתי הודעות שונות קיבלו אותו מזהה, והשנייה תיבלע');
});

test('שדות שיושבים תחת data נקראים גם משם', function () {
  var event = payplus.parse({ data: { transaction_uid: 'tx-3', token: 'tok-3' } });
  assertEqual(event.transactionId, 'tx-3', 'מזהה העסקה לא נמצא תחת data');
  assertEqual(event.subscriptionId, 'tok-3', 'הטוקן לא נמצא תחת data');
});

console.log('\n== אימות מול ipn-full ==');

test('עסקה מאושרת חוזרת עם סכום ומטבע', function () {
  ready(true);
  return withFake(function (fake) {
    fake.reply(200, { results: { status: 'success' },
      data: { status_code: '000', amount: 199, currency_code: 'ILS', approval_num: '12345' } });
  }, function (fake) {
    return payplus.verifyTransaction({ transactionId: 'tx-1' }).then(function (result) {
      assertEqual(result.verified, true, 'העסקה לא אומתה');
      assertEqual(result.outcome, 'approved', 'התוצאה לא זוהתה כאישור');
      assertEqual(result.amount, 199, 'הסכום לא נקרא');
      assertEqual(result.currency, 'ILS', 'המטבע לא נקרא');
      assert(fake.last().url.indexOf('/PaymentPages/ipn-full') !== -1,
        'הפנייה לא הלכה ל-ipn-full');
      assertEqual(fake.last().body.transaction_uid, 'tx-1', 'מזהה העסקה לא נשלח');
    });
  });
});

test('שמירת כרטיס בלי עסקה אינה מתחזה לאימות', function () {
  ready(true);
  return payplus.verifyTransaction({ transactionId: null }).then(function (result) {
    assertEqual(result.verified, false, 'אומתה עסקה שאינה קיימת');
    assertEqual(result.reason, 'no-transaction', 'הסיבה אינה ברורה');
  });
});

test('תקלה מול PayPlus אינה נחשבת אימות', function () {
  ready(true);
  return withFake(function (fake) { fake.reply(500, { message: 'boom' }); }, function () {
    return payplus.verifyTransaction({ transactionId: 'tx-1' }).then(function (result) {
      assertEqual(result.verified, false, 'תקלה נחשבה כאימות');
    });
  });
});

console.log('\n== דף התשלום ==');

test('שמירת כרטיס היא בדיקת כרטיס, לא חיוב ולא זיכוי', function () {
  ready(true);
  return withFake(function (fake) {
    fake.reply(200, { results: { status: 'success' },
      data: { payment_page_link: 'https://payplus.co.il/pay/1', page_request_uid: 'req-1' } });
  }, function (fake) {
    return payplus.createCheckout({
      companyId: 'co-1', companyName: 'קפה מרכז', plan: 'starter', amount: 199,
      saveCardOnly: true, returnUrl: 'https://setshifts.com/app/?billing=done',
      cancelUrl: 'https://setshifts.com/app/?billing=canceled'
    }).then(function (result) {
      var sent = fake.last().body;
      /* 0 = J2 בדיקת כרטיס. 4 הוא זיכוי – ערך שגוי כאן עולה כסף. */
      assertEqual(sent.charge_method, 0, 'שמירת כרטיס נשלחה בסוג עסקה שגוי');
      assertEqual(sent.create_token, true, 'לא נתבקש טוקן, ואז אין ממה לגבות בהמשך');
      assertEqual(sent.more_info, 'co-1', 'מזהה החברה לא נשלח');
      assertEqual(sent.initial_invoice, undefined, 'הונפקה חשבונית על עסקה בלי כסף');
      assertEqual(sent.refURL_callback, 'https://setshifts.com/api/billing/webhook',
        'כתובת ההודעה החוזרת שגויה');
      assertEqual(result.url, 'https://payplus.co.il/pay/1', 'הכתובת לא הוחזרה');
    });
  });
});

test('אמצעי תשלום אינם נשלחים עד שהוגדרו', function () {
  /* ערך שכולל אמצעי שאינו פעיל על החשבון עלול להפיל את פתיחת
     הדף כולה. בלי השדה, הדף מציג את מה שמוגדר אצלם. */
  ready(true);
  return withFake(function (fake) {
    fake.reply(200, { results: { status: 'success' }, data: { payment_page_link: 'x' } });
    fake.reply(200, { results: { status: 'success' }, data: { payment_page_link: 'x' } });
  }, function (fake) {
    return payplus.createCheckout({ companyId: 'co-1', amount: 199, saveCardOnly: true,
      returnUrl: 'r', cancelUrl: 'c' }).then(function () {
      assertEqual(fake.last().body.allowed_charge_methods, undefined,
        'נשלחה רשימת אמצעים בלי שהוגדרה');
      process.env.PAYPLUS_CHARGE_METHODS = 'credit-card, apple-pay , google-pay';
      return payplus.createCheckout({ companyId: 'co-1', amount: 199, saveCardOnly: true,
        returnUrl: 'r', cancelUrl: 'c' });
    }).then(function () {
      var sent = fake.last().body.allowed_charge_methods;
      assertEqual(JSON.stringify(sent),
        JSON.stringify(['credit-card', 'apple-pay', 'google-pay']),
        'הרשימה לא נשלחה כפי שהוגדרה');
      delete process.env.PAYPLUS_CHARGE_METHODS;
    }, function (err) { delete process.env.PAYPLUS_CHARGE_METHODS; throw err; });
  });
});

test('ח.פ. של הלקוח נוסע לספק, ורק כשהוא קיים', function () {
  /* זה מה שיופיע על החשבונית. שדה ריק בבקשה אינו נתון – הוא רק
     דרך להיכשל – ולכן הוא נשלח רק כשהלקוח הזין אותו. */
  ready(true);
  return withFake(function (fake) {
    fake.reply(200, { results: { status: 'success' }, data: { payment_page_link: 'x' } });
    fake.reply(200, { results: { status: 'success' }, data: { payment_page_link: 'x' } });
  }, function (fake) {
    return payplus.createCheckout({
      companyId: 'co-1', companyName: 'קפה מרכז', amount: 199, saveCardOnly: true,
      email: 'owner@example.com', returnUrl: 'r', cancelUrl: 'c'
    }).then(function () {
      var sent = fake.last().body.customer;
      assertEqual(sent.customer_name, 'קפה מרכז', 'שם העסק לא נשלח');
      assertEqual(sent.identification_number, undefined,
        'נשלח שדה ח.פ. ריק ללא צורך');
      return payplus.createCheckout({
        companyId: 'co-1', companyName: 'קפה מרכז', taxId: '512345678', amount: 199,
        saveCardOnly: true, email: 'owner@example.com', returnUrl: 'r', cancelUrl: 'c'
      });
    }).then(function () {
      assertEqual(fake.last().body.customer.identification_number, '512345678',
        'הח.פ. לא הגיע לספק');
    });
  });
});

test('חיוב מיידי הוא J4 ומנפיק חשבונית', function () {
  ready(true);
  return withFake(function (fake) {
    fake.reply(200, { results: { status: 'success' },
      data: { payment_page_link: 'https://payplus.co.il/pay/2' } });
  }, function (fake) {
    return payplus.createCheckout({
      companyId: 'co-1', amount: 399, saveCardOnly: false,
      returnUrl: 'r', cancelUrl: 'c'
    }).then(function () {
      assertEqual(fake.last().body.charge_method, 1, 'חיוב מיידי נשלח בסוג עסקה שגוי');
    });
  });
});

test('חשבונית אינה מתבקשת עד שמאשרים שהמודול פעיל', function () {
  /* שדה של מודול שאינו פעיל עלול להפיל את הבקשה כולה, וכישלון
     כזה מתגלה דווקא ברגע שעובר כסף. */
  ready(true);
  return withFake(function (fake) {
    fake.reply(200, { results: { status: 'success' },
      data: { payment_page_link: 'x' } });
    fake.reply(200, { results: { status: 'success' },
      data: { payment_page_link: 'x' } });
  }, function (fake) {
    return payplus.createCheckout({ companyId: 'co-1', amount: 399, saveCardOnly: false,
      returnUrl: 'r', cancelUrl: 'c' }).then(function () {
      assertEqual(fake.last().body.initial_invoice, undefined,
        'נתבקשה חשבונית בלי שהמודול אושר');
      process.env.PAYPLUS_INVOICES = 'true';
      return payplus.createCheckout({ companyId: 'co-1', amount: 399, saveCardOnly: false,
        returnUrl: 'r', cancelUrl: 'c' });
    }).then(function () {
      assertEqual(fake.last().body.initial_invoice, true, 'החשבונית לא הופעלה');
      delete process.env.PAYPLUS_INVOICES;
    }, function (err) { delete process.env.PAYPLUS_INVOICES; throw err; });
  });
});

test('סירוב לפתוח דף תשלום אינו מוצג כהצלחה', function () {
  ready(true);
  return withFake(function (fake) {
    fake.reply(200, { results: { status: 'error', description: 'invalid page uid' } });
  }, function () {
    return payplus.createCheckout({ companyId: 'co-1', amount: 199, saveCardOnly: true,
      returnUrl: 'r', cancelUrl: 'c' })
      .then(function () { throw new Error('סירוב הוצג כהצלחה'); },
        function (err) {
          assert(/invalid page uid/.test(err.message), 'הסיבה לא הועברה: ' + err.message);
        });
  });
});

test('תשובה בלי כתובת דף אינה נחשבת הצלחה', function () {
  ready(true);
  return withFake(function (fake) {
    fake.reply(200, { results: { status: 'success' }, data: {} });
  }, function () {
    return payplus.createCheckout({ companyId: 'co-1', amount: 199, saveCardOnly: true,
      returnUrl: 'r', cancelUrl: 'c' })
      .then(function () { throw new Error('תשובה ריקה התקבלה כהצלחה'); },
        function (err) { assert(/no payment page link/.test(err.message), err.message); });
  });
});

console.log('\n== חיוב מטוקן שמור ==');

test('החיוב נשלח עם הטוקן, לא עם פרטי כרטיס', function () {
  ready(true);
  return withFake(function (fake) {
    fake.reply(200, { results: { status: 'success' },
      data: { transaction_uid: 'tx-9', approval_num: '77' } });
  }, function (fake) {
    return payplus.charge({
      subscriptionId: 'tok-abc', customerId: 'cus-1', amount: 199,
      idempotencyKey: 'charge:co-1:2026-10-05'
    }).then(function (result) {
      var sent = fake.last().body;
      assertEqual(sent.use_token, true, 'לא סומן שימוש בטוקן');
      assertEqual(sent.credit_card.token, 'tok-abc', 'הטוקן לא נשלח');
      assertEqual(sent.credit_card.card_number, undefined, 'נשלחו פרטי כרטיס');
      assertEqual(sent.terminal_uid, 'term-1', 'המסוף לא נשלח');
      assertEqual(sent.amount, 199, 'הסכום שגוי');
      assertEqual(sent.more_info, 'charge:co-1:2026-10-05',
        'מפתח מניעת הכפילות לא נשלח לספק');
      assertEqual(result.ok, true, 'חיוב מוצלח דווח ככישלון');
      assertEqual(result.transactionId, 'tx-9', 'מזהה העסקה לא נשמר');
    });
  });
});

test('בלי טוקן לא יוצאים לדרך בכלל', function () {
  ready(true);
  return withFake(null, function (fake) {
    return payplus.charge({ amount: 199, idempotencyKey: 'k' }).then(function (result) {
      assertEqual(result.ok, false, 'חיוב בלי טוקן דווח כהצלחה');
      assertEqual(result.retryable, false, 'חיוב בלי טוקן סומן כניתן לניסיון חוזר');
      assertEqual(fake.calls.length, 0, 'נשלחה בקשה למרות שאין טוקן');
    });
  });
});

test('סירוב של חברת האשראי יינוסה שוב מחר', function () {
  ready(true);
  return withFake(function (fake) {
    fake.reply(200, { results: { status: 'error', code: '033', description: 'no funds' } });
  }, function () {
    return payplus.charge({ subscriptionId: 'tok-abc', amount: 199, idempotencyKey: 'k' })
      .then(function (result) {
        assertEqual(result.ok, false, 'סירוב דווח כהצלחה');
        assertEqual(result.retryable, true, 'סירוב לא סומן לניסיון חוזר');
        assert(/no funds/.test(result.reason), 'הסיבה לא הועברה: ' + result.reason);
      });
  });
});

test('בקשה פסולה אינה חוזרת על עצמה', function () {
  ready(true);
  return withFake(function (fake) {
    fake.reply(400, { results: { status: 'error', description: 'bad terminal' } });
  }, function () {
    return payplus.charge({ subscriptionId: 'tok-abc', amount: 199, idempotencyKey: 'k' })
      .then(function (result) {
        assertEqual(result.retryable, false, 'בקשה פסולה סומנה לניסיון חוזר');
        assertEqual(result.uncertain, false, 'בקשה שנדחתה סומנה כתוצאה לא ידועה');
      });
  });
});

test('תקלה אצל PayPlus אינה מנוסה שוב בעיוורון', function () {
  /* 500 אצלם: ייתכן שהכרטיס חויב וייתכן שלא. ניסיון חוזר כאן
     הוא חיוב כפול אפשרי. */
  ready(true);
  return withFake(function (fake) { fake.reply(500, { message: 'boom' }); }, function () {
    return payplus.charge({ subscriptionId: 'tok-abc', amount: 199, idempotencyKey: 'k' })
      .then(function (result) {
        assertEqual(result.ok, false, 'תקלה דווחה כהצלחה');
        assertEqual(result.retryable, false, 'תוצאה לא ידועה סומנה לניסיון חוזר');
        assertEqual(result.uncertain, true, 'התוצאה לא סומנה כלא ידועה');
      });
  });
});

test('רשת שנופלת באמצע נחשבת תוצאה לא ידועה', function () {
  ready(true);
  return withFake(function (fake) { fake.fail('ECONNRESET'); }, function () {
    return payplus.charge({ subscriptionId: 'tok-abc', amount: 199, idempotencyKey: 'k' })
      .then(function (result) {
        assertEqual(result.ok, false, 'נפילת רשת דווחה כהצלחה');
        assertEqual(result.retryable, false, 'נפילת רשת סומנה לניסיון חוזר');
        assertEqual(result.uncertain, true, 'התוצאה לא סומנה כלא ידועה');
      });
  });
});

console.log('\n== סודות ==');

test('מפתח חסר נאמר בשמו, בלי לחשוף את הערך של האחרים', function () {
  ready(true);
  var saved = process.env.PAYPLUS_TERMINAL_UID;
  delete process.env.PAYPLUS_TERMINAL_UID;
  return payplus.charge({ subscriptionId: 'tok-1', amount: 199, idempotencyKey: 'k' })
    .then(function () {
      process.env.PAYPLUS_TERMINAL_UID = saved;
      throw new Error('חיוב בלי מסוף לא נחסם');
    }, function (err) {
      process.env.PAYPLUS_TERMINAL_UID = saved;
      assert(/PAYPLUS_TERMINAL_UID/.test(err.message), 'לא נאמר מה חסר');
      assert(err.message.indexOf(API_KEY) === -1, 'מפתח ה-API דלף להודעת שגיאה');
      assert(err.message.indexOf(SECRET_KEY) === -1, 'המפתח הסודי דלף להודעת שגיאה');
    });
});

/* הכותרת נכנסת לתור, כמו הבדיקות עצמן – אחרת היא מודפסת
   בטעינת הקובץ ומופיעה מעל בדיקות שרצות אחריה. */
queue = queue.then(function () {
  console.log('\n== שדרוג תוכנית כשאין עדיין סליקה ==');
});

/* למה הבדיקה הזו קיימת: לקוח בפיילוט ניסה לפתוח עובד אחד-עשר,
   אישר את השדרוג, וקיבל על המסך

     "PayPlus is not configured yet – set PAYPLUS_READY=true
      once the staging smoke test passes"

   הודעת מפתחים, באנגלית, על משתנה סביבה – באמצע מסך בעברית,
   בדיוק ברגע שבו הוא רצה לשלם לנו יותר.

   החלפת תוכנית אינה דורשת סליקה: היא שינוי תקרה ומחיר, והכסף
   נגבה בחיוב הבא. */

/* המסלול עצמו, בלי השרת. מאז שכל פעולות החיוב יושבות בנקודת
   קצה אחת, כל מסלול הוא פונקציה רגילה שמקבלת הקשר -- ואין
   צורך להחליף את _shared.js במטמון כדי להגיע אליה. */
function loadCheckout() {
  return { handler: require('../api/billing/_checkout.js'), writes: [] };
}

function runCheckout(company, plan) {
  var loaded = loadCheckout();
  return loaded.handler({
    company: company, user: { email: 'boss@test.co.il' },
    body: { plan: plan },
    db: function (path, options) {
      loaded.writes.push({ path: path, options: options });
      return Promise.resolve([]);
    }
  }).then(function (result) {
    return { result: result, writes: loaded.writes };
  });
}

var TRIAL = { id: 'co-1', name: 'קפה מרכז', status: 'trial', plan: 'starter' };

test('בלי סליקה מחוברת – התוכנית מתחלפת, ואין דף תשלום', function () {
  ready(false);
  process.env.BILLING_PROVIDER = 'payplus';
  return runCheckout(TRIAL, 'growth').then(function (out) {
    assertEqual(out.result.status || 200, 200, 'קוד תשובה');
    assertEqual(out.result.body.planChanged, true, 'התוכנית לא סומנה כמוחלפת');
    assertEqual(out.result.body.plan, 'growth', 'התוכנית שהוחזרה');
    assertEqual(out.result.body.checkoutUrl, null, 'נשלח דף תשלום למרות שאין סליקה');
    var patch = out.writes.filter(function (w) {
      return w.options && w.options.method === 'PATCH';
    }).pop();
    assert(!!patch, 'התוכנית לא נשמרה בשרת');
    assertEqual(JSON.stringify(patch.options.body), '{"plan":"growth"}',
      'נכתבו עמודות נוספות מעבר לתוכנית');
    delete process.env.BILLING_PROVIDER;
  }, function (err) { delete process.env.BILLING_PROVIDER; throw err; });
});

test('גם ספק מדומה אינו נחשב סליקה', function () {
  /* אחרת לקוח היה מופנה לדף תשלום שאינו מחייב כלום */
  process.env.BILLING_PROVIDER = 'mock';
  return runCheckout(TRIAL, 'business').then(function (out) {
    assertEqual(out.result.body.planChanged, true, 'התוכנית לא הוחלפה');
    assertEqual(out.result.body.checkoutUrl, null, 'נפתח דף תשלום מדומה');
    delete process.env.BILLING_PROVIDER;
  }, function (err) { delete process.env.BILLING_PROVIDER; throw err; });
});

test('הערת המפתחים של הספק אינה מגיעה ללקוח', function () {
  /* הנוסח המדויק שהלקוח ראה. הוא אינו אמור להופיע באף תשובה. */
  ready(false);
  process.env.BILLING_PROVIDER = 'payplus';
  return runCheckout(TRIAL, 'growth').then(function (out) {
    var body = JSON.stringify(out.result.body);
    assert(body.indexOf('PAYPLUS_READY') === -1, 'שם משתנה הסביבה דלף ללקוח');
    assert(body.indexOf('smoke test') === -1, 'הערת הפיתוח דלפה ללקוח');
    delete process.env.BILLING_PROVIDER;
  }, function (err) { delete process.env.BILLING_PROVIDER; throw err; });
});

test('כרטיס שמור ממשיך לעבוד כמו קודם', function () {
  process.env.BILLING_PROVIDER = 'mock';
  var withCard = Object.assign({}, TRIAL, { billing_subscription_id: 'tok-1' });
  return runCheckout(withCard, 'growth').then(function (out) {
    assertEqual(out.result.body.planChanged, true, 'התוכנית לא הוחלפה');
    delete process.env.BILLING_PROVIDER;
  }, function (err) { delete process.env.BILLING_PROVIDER; throw err; });
});

queue.then(function () {
  ready(false);
  console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
  process.exit(failed ? 1 : 0);
});
