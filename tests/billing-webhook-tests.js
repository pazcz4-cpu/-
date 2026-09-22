/* בדיקות לנקודת הקצה שמקבלת אירועי חיוב.
   זו הנקודה שבה מנוי הופך למשלם, ולכן נבדקים כאן דווקא המקרים
   הלא-נעימים: חתימה מזויפת, אותו אירוע פעמיים, ומנוי שלא מוכר.

   הרצה: node tests/billing-webhook-tests.js */
'use strict';

var crypto = require('crypto');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.BILLING_PROVIDER = 'mock';
process.env.BILLING_WEBHOOK_SECRET = 'top-secret';

var handler = require('../api/billing/webhook.js');

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

/* ===== בסיס נתונים מדומה ===== */
function FakeDb() {
  this.companies = {
    'co-1': {
      id: 'co-1', name: 'רשת הבדיקה', plan: 'starter', status: 'trial',
      valid_until: '2026-10-05T00:00:00Z',
      billing_subscription_id: 'sub-1', cancel_at_period_end: false
    }
  };
  this.events = {};
  this.calls = [];
  this.payplusCalls = [];
  this.payplusReply = null;
}

FakeDb.prototype.install = function () {
  var self = this;
  globalThis.fetch = function (url, options) {
    var opts = options || {};
    var parsed = new URL(url);

    /* PayPlus עצמו, כשהקוד הולך לאמת עסקה מול ipn-full */
    if (parsed.hostname.indexOf('payplus') !== -1) {
      self.payplusCalls.push({ path: parsed.pathname,
        body: opts.body ? JSON.parse(opts.body) : null });
      var reply = self.payplusReply || { results: { status: 'success' }, data: {} };
      return Promise.resolve({
        ok: true, status: 200,
        text: function () { return Promise.resolve(JSON.stringify(reply)); }
      });
    }

    var path = parsed.pathname.replace('/rest/v1', '');
    var query = parsed.search.slice(1);
    var body = opts.body ? JSON.parse(opts.body) : null;
    self.calls.push({ method: opts.method || 'GET', path: path, query: query, body: body });

    function reply(status, payload) {
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status: status,
        text: function () {
          return Promise.resolve(payload === undefined ? '' : JSON.stringify(payload));
        }
      });
    }

    /* יומן האירועים: מזהה כפול נדחה, בדיוק כמו מפתח ראשי אמיתי */
    if (path === '/billing_events') {
      if (opts.method === 'POST') {
        var row = body[0];
        if (self.events[row.id]) return reply(409, { code: '23505', message: 'duplicate key' });
        self.events[row.id] = row;
        return reply(201, []);
      }
      var eventId = decodeURIComponent((query.match(/id=eq\.([^&]+)/) || [])[1] || '');
      var existing = self.events[eventId];
      if (opts.method === 'PATCH') {
        if (existing) Object.assign(existing, body);
        return reply(200, existing ? [existing] : []);
      }
      return reply(200, existing ? [existing] : []);
    }

    if (path === '/companies') {
      var where = {};
      query.split('&').forEach(function (pair) {
        var index = pair.indexOf('=');
        if (index === -1) return;
        var value = pair.slice(index + 1);
        if (value.indexOf('eq.') === 0) {
          where[decodeURIComponent(pair.slice(0, index))] = decodeURIComponent(value.slice(3));
        }
      });
      var matches = Object.keys(self.companies)
        .map(function (id) { return self.companies[id]; })
        .filter(function (company) {
          if (where.id && company.id !== where.id) return false;
          if (where.billing_subscription_id &&
              company.billing_subscription_id !== where.billing_subscription_id) return false;
          return true;
        });
      if (opts.method === 'PATCH') {
        matches.forEach(function (company) { Object.assign(company, body); });
      }
      return reply(200, matches);
    }

    return reply(404, { message: 'no route: ' + path });
  };
};

/* ===== בקשה מדומה ===== */
function sign(raw) {
  return crypto.createHmac('sha256', process.env.BILLING_WEBHOOK_SECRET)
    .update(raw, 'utf8').digest('hex');
}

function post(event, options) {
  var opts = options || {};
  var raw = JSON.stringify(event);
  var req = {
    method: opts.method || 'POST',
    headers: { 'x-mock-signature': opts.signature !== undefined ? opts.signature : sign(raw) },
    body: raw
  };
  var res = {
    statusCode: 0, headers: {}, payload: null,
    setHeader: function (key, value) { this.headers[key] = value; },
    end: function (text) { this.payload = text ? JSON.parse(text) : null; }
  };
  return Promise.resolve(handler(req, res)).then(function () { return res; });
}

console.log('\n== אימות חתימה ==');

test('בקשה שאינה POST נדחית', function () {
  new FakeDb().install();
  return post({ id: 'e1' }, { method: 'GET' }).then(function (res) {
    assertEqual(res.statusCode, 405, 'קוד תשובה שגוי');
  });
});

test('חתימה שגויה נדחית ואינה נוגעת בנתונים', function () {
  var db = new FakeDb();
  db.install();
  return post({ id: 'e1', subscription_id: 'sub-1', status: 'active' },
    { signature: 'לא-נכון' }).then(function (res) {
    assertEqual(res.statusCode, 401, 'חתימה מזויפת התקבלה');
    assertEqual(db.calls.length, 0, 'בוצעה פנייה לבסיס הנתונים למרות חתימה פסולה');
    assertEqual(db.companies['co-1'].status, 'trial', 'מצב המנוי השתנה');
  });
});

test('חתימה חסרה נדחית', function () {
  var db = new FakeDb();
  db.install();
  return post({ id: 'e1', subscription_id: 'sub-1' }, { signature: '' }).then(function (res) {
    assertEqual(res.statusCode, 401, 'בקשה בלי חתימה התקבלה');
  });
});

test('גוף ששונה אחרי החתימה נדחה', function () {
  var db = new FakeDb();
  db.install();
  /* חותמים על אירוע אחד ושולחים אחר – בדיוק מה שתוקף היה מנסה */
  var honest = JSON.stringify({ id: 'e1', subscription_id: 'sub-1', status: 'trial' });
  return post({ id: 'e1', subscription_id: 'sub-1', status: 'active' },
    { signature: sign(honest) }).then(function (res) {
    assertEqual(res.statusCode, 401, 'גוף מזויף התקבל');
  });
});

console.log('\n== החיוב הראשון אחרי תקופת הניסיון ==');

test('מעבר מניסיון לפעיל מעדכן סטטוס ותאריך', function () {
  var db = new FakeDb();
  db.install();
  return post({
    id: 'e-activate', type: 'subscription.activated', subscription_id: 'sub-1',
    customer_id: 'cus-1', status: 'active', current_period_end: '2026-11-05T00:00:00Z'
  }).then(function (res) {
    assertEqual(res.statusCode, 200, 'האירוע נדחה');
    var company = db.companies['co-1'];
    assertEqual(company.status, 'active', 'הסטטוס לא עודכן');
    assertEqual(company.valid_until, '2026-11-05T00:00:00Z', 'התוקף לא עודכן');
    assertEqual(company.current_period_end, '2026-11-05T00:00:00Z', 'סוף התקופה לא נשמר');
    assertEqual(company.billing_customer_id, 'cus-1', 'מזהה הלקוח לא נשמר');
    assertEqual(company.billing_provider, 'mock', 'שם הספק לא נשמר');
  });
});

test('אותו אירוע פעמיים מעובד פעם אחת בלבד', function () {
  var db = new FakeDb();
  db.install();
  var event = {
    id: 'e-once', type: 'subscription.activated', subscription_id: 'sub-1',
    status: 'active', current_period_end: '2026-11-05T00:00:00Z'
  };
  return post(event).then(function (first) {
    assertEqual(first.statusCode, 200, 'האירוע הראשון נדחה');
    assert(!first.payload.duplicate, 'האירוע הראשון סומן ככפול');
    db.calls.length = 0;
    return post(event);
  }).then(function (second) {
    assertEqual(second.statusCode, 200, 'האירוע השני נדחה');
    assertEqual(second.payload.duplicate, true, 'האירוע השני לא זוהה ככפול');
    var updates = db.calls.filter(function (call) {
      return call.path === '/companies' && call.method === 'PATCH';
    });
    assertEqual(updates.length, 0, 'החברה עודכנה פעם שנייה');
  });
});

test('אירוע ראשון מקשר את המנוי לחברה', function () {
  var db = new FakeDb();
  db.companies['co-2'] = {
    id: 'co-2', name: 'חברה חדשה', plan: 'starter', status: 'trial',
    valid_until: '2026-10-05T00:00:00Z', billing_subscription_id: null
  };
  db.install();
  return post({
    id: 'e-link', type: 'subscription.created', subscription_id: 'sub-new',
    company_id: 'co-2', customer_id: 'cus-2', status: 'trial',
    current_period_end: '2026-10-05T00:00:00Z'
  }).then(function (res) {
    assertEqual(res.statusCode, 200, 'האירוע נדחה');
    assertEqual(db.companies['co-2'].billing_subscription_id, 'sub-new',
      'המנוי לא קושר לחברה');
    assertEqual(db.companies['co-2'].status, 'trial', 'הסטטוס לא אמור להשתנות עדיין');
  });
});

console.log('\n== ביטול וכישלון תשלום ==');

test('ביטול נשמר כ"פעיל עד סוף התקופה"', function () {
  var db = new FakeDb();
  db.install();
  return post({
    id: 'e-cancel', type: 'subscription.canceled', subscription_id: 'sub-1',
    cancel_at_period_end: true
  }).then(function () {
    assertEqual(db.companies['co-1'].cancel_at_period_end, true, 'הביטול לא נשמר');
    assertEqual(db.companies['co-1'].status, 'trial', 'הסטטוס השתנה למרות שהתקופה נמשכת');
  });
});

test('כישלון תשלום מסמן past_due', function () {
  var db = new FakeDb();
  db.install();
  return post({
    id: 'e-failed', type: 'transaction.payment_failed',
    subscription_id: 'sub-1', status: 'past_due'
  }).then(function () {
    assertEqual(db.companies['co-1'].status, 'past_due', 'הסטטוס לא עודכן');
  });
});

test('חידוש אחרי ביטול מנקה את הסימון', function () {
  var db = new FakeDb();
  db.companies['co-1'].cancel_at_period_end = true;
  db.install();
  return post({
    id: 'e-resume', type: 'subscription.resumed',
    subscription_id: 'sub-1', cancel_at_period_end: false
  }).then(function () {
    assertEqual(db.companies['co-1'].cancel_at_period_end, false, 'הביטול לא בוטל');
  });
});

console.log('\n== מקרי קצה ==');

test('אירוע בלי מזהה מנוי מאושר ולא משנה דבר', function () {
  var db = new FakeDb();
  db.install();
  return post({ id: 'e-other', type: 'customer.updated' }).then(function (res) {
    assertEqual(res.statusCode, 200, 'האירוע נדחה והספק ינסה שוב לנצח');
    assertEqual(res.payload.ignored, true, 'האירוע לא סומן כלא-רלוונטי');
    assertEqual(db.companies['co-1'].status, 'trial', 'מצב המנוי השתנה');
  });
});

test('מנוי שאינו מוכר מאושר ולא מייצר ניסיונות חוזרים', function () {
  var db = new FakeDb();
  db.install();
  return post({
    id: 'e-unknown', type: 'subscription.activated',
    subscription_id: 'sub-לא-קיים', status: 'active'
  }).then(function (res) {
    assertEqual(res.statusCode, 200, 'האירוע נדחה');
    assertEqual(res.payload.unmatched, true, 'לא סומן שאין התאמה');
  });
});

test('אירוע בלי מזהה נדחה', function () {
  new FakeDb().install();
  return post({ type: 'subscription.activated', subscription_id: 'sub-1' }).then(function (res) {
    assertEqual(res.statusCode, 400, 'אירוע בלי מזהה התקבל');
  });
});

test('ספק שאינו ממומש אינו מאשר שום דבר', function () {
  var db = new FakeDb();
  db.install();
  process.env.BILLING_PROVIDER = 'paddle';
  return post({ id: 'e-x', subscription_id: 'sub-1', status: 'active' }).then(function (res) {
    process.env.BILLING_PROVIDER = 'mock';
    /* ספק לא ממומש מחזיר verify=false, ולכן נדחה כבר בשלב החתימה */
    assertEqual(res.statusCode, 401, 'ספק לא ממומש אישר אירוע');
    assertEqual(db.companies['co-1'].status, 'trial', 'מצב המנוי השתנה');
  }, function (err) {
    process.env.BILLING_PROVIDER = 'mock';
    throw err;
  });
});

console.log('\n== PayPlus מקצה לקצה ==');

/* כאן נבדק המסלול האמיתי: חתימה בבסיס 64 בכותרת hash, ואימות
   העסקה מול PayPlus עצמו לפני שמישהו מסומן כמשלם. */

function payplusPost(body, options) {
  var opts = options || {};
  var raw = JSON.stringify(body);
  var hash = opts.signature !== undefined ? opts.signature
    : crypto.createHmac('sha256', process.env.BILLING_WEBHOOK_SECRET)
      .update(raw, 'utf8').digest('base64');
  var req = {
    method: 'POST',
    headers: { 'user-agent': opts.agent || 'PayPlus', hash: hash },
    body: raw
  };
  var res = {
    statusCode: 0, headers: {}, payload: null,
    setHeader: function (key, value) { this.headers[key] = value; },
    end: function (text) { this.payload = text ? JSON.parse(text) : null; }
  };
  return Promise.resolve(handler(req, res)).then(function () { return res; });
}

function withPayPlus(fn) {
  process.env.BILLING_PROVIDER = 'payplus';
  process.env.PAYPLUS_READY = 'true';
  process.env.PAYPLUS_SANDBOX = 'true';
  process.env.PAYPLUS_API_KEY = 'k';
  process.env.PAYPLUS_SECRET_KEY = 's';
  function undo() {
    process.env.BILLING_PROVIDER = 'mock';
    delete process.env.PAYPLUS_READY;
  }
  return Promise.resolve().then(fn).then(function (v) { undo(); return v; },
    function (err) { undo(); throw err; });
}

test('שמירת כרטיס מקשרת את הטוקן ומשאירה את הלקוח בניסיון', function () {
  var db = new FakeDb();
  db.install();
  return withPayPlus(function () {
    return payplusPost({
      page_request_uid: 'req-1', more_info: 'co-1',
      data: { token: 'tok-new', customer_uid: 'cus-7' }
    }).then(function (res) {
      assertEqual(res.statusCode, 200, 'ההודעה נדחתה');
      assertEqual(db.companies['co-1'].billing_subscription_id, 'tok-new',
        'הטוקן לא נשמר, ואז אין ממה לגבות בתום הניסיון');
      assertEqual(db.companies['co-1'].billing_customer_id, 'cus-7', 'הלקוח לא נשמר');
      assertEqual(db.companies['co-1'].status, 'trial',
        'שמירת כרטיס הפכה את הלקוח למשלם');
      assertEqual(res.payload.note, 'card-saved', 'הסיווג שגוי');
    });
  });
});

test('חיוב מאושר בסכום הנכון הופך את המנוי לפעיל', function () {
  var db = new FakeDb();
  db.install();
  /* starter = 199 */
  db.payplusReply = { results: { status: 'success' },
    data: { status_code: '000', amount: 199, currency_code: 'ILS' } };
  return withPayPlus(function () {
    return payplusPost({ transaction_uid: 'tx-1', more_info: 'co-1',
      data: { token: 'tok-1' } }).then(function (res) {
      assertEqual(db.companies['co-1'].status, 'active', 'המנוי לא הופעל');
      assert(db.companies['co-1'].valid_until > new Date().toISOString(),
        'התוקף לא הוארך');
      assertEqual(res.payload.note, 'charged', 'הסיווג שגוי');
      assertEqual(db.payplusCalls.length, 1, 'העסקה לא אומתה מול PayPlus');
    });
  });
});

test('חיוב בסכום שלא ביקשנו אינו מסמן ששולם', function () {
  var db = new FakeDb();
  db.install();
  db.payplusReply = { results: { status: 'success' },
    data: { status_code: '000', amount: 1, currency_code: 'ILS' } };
  return withPayPlus(function () {
    return payplusPost({ transaction_uid: 'tx-2', more_info: 'co-1',
      data: { token: 'tok-1' } }).then(function (res) {
      assertEqual(db.companies['co-1'].status, 'trial', 'סכום שגוי סומן כתשלום');
      assertEqual(res.payload.note, 'amount-mismatch', 'הפער לא דווח');
    });
  });
});

test('חיוב שנדחה מסמן past_due', function () {
  var db = new FakeDb();
  db.install();
  db.payplusReply = { results: { status: 'success' },
    data: { status_code: 'declined', amount: 199, currency_code: 'ILS' } };
  return withPayPlus(function () {
    return payplusPost({ transaction_uid: 'tx-3', more_info: 'co-1',
      data: { token: 'tok-1' } }).then(function () {
      assertEqual(db.companies['co-1'].status, 'past_due', 'הכישלון לא סומן');
    });
  });
});

test('עסקה שלא ניתן לאמת אינה משנה את מצב המנוי', function () {
  var db = new FakeDb();
  db.install();
  db.payplusReply = { results: { status: 'error', description: 'unknown transaction' } };
  return withPayPlus(function () {
    return payplusPost({ transaction_uid: 'tx-4', more_info: 'co-1',
      data: { token: 'tok-1' } }).then(function (res) {
      assertEqual(db.companies['co-1'].status, 'trial', 'עסקה שלא אומתה שינתה את המנוי');
      assertEqual(res.payload.note, 'unverified', 'הסיווג שגוי');
    });
  });
});

test('ריצה שמתה באמצע מושלמת כשההודעה נשלחת שוב', function () {
  /* הספק שולח את אותה הודעה שוב אם לא ענינו. אם הריצה הקודמת
     הספיקה לרשום את האירוע ולא להצמיד את הכרטיס, הלקוח היה
     מגיע לתום הניסיון בלי אמצעי תשלום – וזה מה שנבדק כאן. */
  var db = new FakeDb();
  db.install();
  /* אירוע רשום, אך בלי סימון שהטיפול הושלם */
  db.events['payplus:req-9'] = { id: 'payplus:req-9', company_id: null };
  return withPayPlus(function () {
    return payplusPost({
      page_request_uid: 'req-9', more_info: 'co-1',
      data: { token: 'tok-late' }
    }).then(function (res) {
      assertEqual(res.payload.duplicate, undefined, 'ההודעה נבלעה כאירוע כפול');
      assertEqual(db.companies['co-1'].billing_subscription_id, 'tok-late',
        'הכרטיס לא הוצמד גם בניסיון השני');
    });
  });
});

test('אירוע שהטיפול בו הושלם אינו מטופל שוב', function () {
  var db = new FakeDb();
  db.install();
  db.events['payplus:req-8'] = { id: 'payplus:req-8', company_id: 'co-1' };
  return withPayPlus(function () {
    return payplusPost({
      page_request_uid: 'req-8', more_info: 'co-1', data: { token: 'tok-other' }
    }).then(function (res) {
      assertEqual(res.payload.duplicate, true, 'אירוע שכבר טופל טופל שוב');
      assertEqual(db.companies['co-1'].billing_subscription_id, 'sub-1',
        'הכרטיס הוחלף על סמך אירוע שכבר טופל');
    });
  });
});

test('חיוב מאושר על מנוי שכבר פעיל אינו מחלק חודש מתנה', function () {
  var db = new FakeDb();
  db.companies['co-1'].status = 'active';
  db.companies['co-1'].valid_until = new Date(Date.now() + 20 * 864e5).toISOString();
  var before = db.companies['co-1'].valid_until;
  db.install();
  db.payplusReply = { results: { status: 'success' },
    data: { status_code: '000', amount: 199, currency_code: 'ILS' } };
  return withPayPlus(function () {
    return payplusPost({ transaction_uid: 'tx-dup', more_info: 'co-1',
      data: { token: 'tok-1' } }).then(function (res) {
      assertEqual(db.companies['co-1'].valid_until, before, 'התוקף הוארך שוב');
      assertEqual(res.payload.note, 'already-active', 'הסיווג שגוי');
    });
  });
});

test('חתימה בקידוד hex נדחית, גם אם הסוד נכון', function () {
  var db = new FakeDb();
  db.install();
  var raw = JSON.stringify({ transaction_uid: 'tx-5', more_info: 'co-1' });
  var hex = crypto.createHmac('sha256', process.env.BILLING_WEBHOOK_SECRET)
    .update(raw, 'utf8').digest('hex');
  return withPayPlus(function () {
    return payplusPost({ transaction_uid: 'tx-5', more_info: 'co-1' },
      { signature: hex }).then(function (res) {
      assertEqual(res.statusCode, 401, 'קידוד שגוי התקבל');
      assertEqual(db.companies['co-1'].status, 'trial', 'מצב המנוי השתנה');
    });
  });
});

test('הודעה שלא הגיעה מ-PayPlus נדחית', function () {
  var db = new FakeDb();
  db.install();
  return withPayPlus(function () {
    return payplusPost({ transaction_uid: 'tx-6', more_info: 'co-1' },
      { agent: 'curl/8.4' }).then(function (res) {
      assertEqual(res.statusCode, 401, 'שולח לא מזוהה התקבל');
      assertEqual(db.calls.length, 0, 'בוצעה פנייה לבסיס הנתונים');
    });
  });
});

queue.then(function () {
  console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
  process.exit(failed ? 1 : 0);
});
