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
}

FakeDb.prototype.install = function () {
  var self = this;
  globalThis.fetch = function (url, options) {
    var opts = options || {};
    var parsed = new URL(url);
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
      if (opts.method === 'PATCH') { return reply(200, []); }
    }

    if (path === '/companies' && opts.method === 'PATCH') {
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
      matches.forEach(function (company) { Object.assign(company, body); });
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

queue.then(function () {
  console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
  process.exit(failed ? 1 : 0);
});
