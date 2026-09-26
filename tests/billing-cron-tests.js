/* בדיקות למנוע החיוב האוטומטי.
   כאן עובר כסף, ולכן הדגש הוא על מה שאסור שיקרה: חיוב כפול,
   חיוב של מי שביטל, חיוב בלי כרטיס, והרצה בידי מי שאינו מורשה.

   הרצה: node tests/billing-cron-tests.js */
'use strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.BILLING_PROVIDER = 'mock';
process.env.CRON_SECRET = 'cron-secret';

var cron = require('../api/billing/cron.js');

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
function daysAhead(n) { return new Date(Date.now() + n * 864e5).toISOString(); }

/* ===== בסיס נתונים מדומה ===== */
function FakeDb(companies) {
  this.companies = {};
  (companies || []).forEach(function (company) { this.companies[company.id] = company; }, this);
  this.events = {};
  this.charges = [];   // כל קריאה לספק התשלומים
}

FakeDb.prototype.install = function () {
  var self = this;
  globalThis.fetch = function (url, options) {
    var opts = options || {};
    var parsed = new URL(url);
    var path = parsed.pathname.replace('/rest/v1', '');
    var query = decodeURIComponent(parsed.search.slice(1));
    var body = opts.body ? JSON.parse(opts.body) : null;

    function reply(status, payload) {
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status: status,
        text: function () {
          return Promise.resolve(payload === undefined ? '' : JSON.stringify(payload));
        }
      });
    }

    if (path === '/billing_events') {
      if (opts.method === 'POST') {
        var row = body[0];
        if (self.events[row.id]) return reply(409, { code: '23505' });
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

    if (path === '/companies' && (opts.method || 'GET') === 'GET') {
      /* מחקים את הסינון שהקוד מבקש: תוקף שעבר וסטטוס מתאים */
      var untilMatch = query.match(/valid_until=lte\.([^&]+)/);
      var statusMatch = query.match(/status=in\.\(([^)]+)\)/);
      var statuses = statusMatch ? statusMatch[1].split(',') : null;
      var rows = Object.keys(self.companies)
        .map(function (id) { return self.companies[id]; })
        .filter(function (company) {
          if (untilMatch && !(new Date(company.valid_until) <= new Date(untilMatch[1]))) return false;
          if (statuses && statuses.indexOf(company.status) === -1) return false;
          return true;
        });
      /* מחזירים רק את העמודות שהקוד ביקש, כמו PostgREST אמיתי.
         בלי זה הבדיקה מזריקה שורה מלאה, הקוד קורא עמודה שהוא
         שכח לבקש, והכול עובר -- בעוד שבאוויר הערך הוא undefined.
         בדיוק ככה מחיר מוסכם של רשת לא נגבה חודשים. */
      var selectMatch = query.match(/select=([^&]+)/);
      var fields = selectMatch ? selectMatch[1].split(',') : null;
      if (fields) {
        rows = rows.map(function (company) {
          var out = {};
          fields.forEach(function (field) {
            if (field in company) out[field] = company[field];
          });
          return out;
        });
      }
      return reply(200, rows);
    }

    if (path === '/companies' && opts.method === 'PATCH') {
      var idMatch = query.match(/id=eq\.([^&]+)/);
      var company = idMatch && self.companies[idMatch[1]];
      if (!company) return reply(200, []);
      Object.assign(company, body);
      return reply(200, [company]);
    }

    return reply(404, { message: 'no route: ' + path });
  };

  /* עוטפים את הספק כדי לתעד כל חיוב */
  var providers = require('../api/billing/_providers.js');
  var original = providers.mock.charge;
  providers.mock.charge = function (input) {
    self.charges.push(input);
    return original(input);
  };
  this.restore = function () { providers.mock.charge = original; };
};

function run(options) {
  var opts = options || {};
  var req = { headers: { authorization: opts.auth !== undefined ? opts.auth : 'Bearer cron-secret' } };
  var res = {
    statusCode: 0, payload: null,
    setHeader: function () {},
    end: function (text) { this.payload = text ? JSON.parse(text) : null; }
  };
  return Promise.resolve(cron(req, res)).then(function () { return res; });
}

function company(overrides) {
  return Object.assign({
    id: 'co-1', plan: 'starter', status: 'trial',
    valid_until: daysAgo(1),
    cancel_at_period_end: false,
    billing_subscription_id: 'tok-1',
    billing_customer_id: 'cus-1'
  }, overrides || {});
}

console.log('\n== הרשאה ==');

test('בלי סוד נכון הריצה נדחית ואיש אינו מחויב', function () {
  var db = new FakeDb([company()]);
  db.install();
  return run({ auth: 'Bearer wrong' }).then(function (res) {
    assertEqual(res.statusCode, 401, 'ריצה לא מורשית התקבלה');
    assertEqual(db.charges.length, 0, 'בוצע חיוב בריצה לא מורשית');
    db.restore();
  });
});

test('בלי כותרת בכלל הריצה נדחית', function () {
  var db = new FakeDb([company()]);
  db.install();
  return run({ auth: '' }).then(function (res) {
    assertEqual(res.statusCode, 401, 'ריצה בלי הזדהות התקבלה');
    db.restore();
  });
});

console.log('\n== החיוב הראשון בתום הניסיון ==');

test('ניסיון שהסתיים עם כרטיס מחויב והופך לפעיל', function () {
  var db = new FakeDb([company()]);
  db.install();
  return run().then(function (res) {
    assertEqual(res.statusCode, 200, 'הריצה נכשלה');
    assertEqual(db.charges.length, 1, 'לא בוצע חיוב');
    assertEqual(db.charges[0].amount, 199, 'הסכום אינו לפי התוכנית');
    assertEqual(db.charges[0].currency, 'ILS', 'המטבע שגוי');
    var updated = db.companies['co-1'];
    assertEqual(updated.status, 'active', 'הסטטוס לא הפך לפעיל');
    assert(new Date(updated.valid_until) > new Date(), 'התוקף לא הוארך');
    db.restore();
  });
});

test('ניסיון שעדיין בתוקף אינו מחויב', function () {
  var db = new FakeDb([company({ valid_until: daysAhead(5) })]);
  db.install();
  return run().then(function (res) {
    assertEqual(db.charges.length, 0, 'חויב לקוח שהניסיון שלו עדיין פעיל');
    assertEqual(res.payload.checked, 0, 'נבדקו חברות שלא היה צריך');
    db.restore();
  });
});

test('הסכום נגזר מהתוכנית של החברה', function () {
  var db = new FakeDb([company({ id: 'co-big', plan: 'business' })]);
  db.install();
  return run().then(function () {
    assertEqual(db.charges[0].amount, 599, 'הסכום אינו לפי תוכנית גדול');
    db.restore();
  });
});

/* ===== רשתות: מחיר שסוכם, ולא מחירון =====

   לתוכנית הרשתות אין מחיר מחירון. בלי המחיר המוסכם אין מה
   לגבות, והמנוע חייב לדלג ולא לשלוח לספק בקשה על אפס. */
test('מחיר מוסכם גובר על מחיר התוכנית', function () {
  var db = new FakeDb([company({
    id: 'co-chain', plan: 'enterprise', custom_price_monthly: 1450
  })]);
  db.install();
  return run().then(function () {
    assertEqual(db.charges.length, 1, 'רשת עם מחיר מוסכם לא חויבה');
    assertEqual(db.charges[0].amount, 1450, 'הסכום אינו המחיר שסוכם');
    db.restore();
  });
});

test('רשת בלי מחיר מוסכם מדולגת ואינה מחויבת באפס', function () {
  var db = new FakeDb([company({ id: 'co-chain2', plan: 'enterprise' })]);
  db.install();
  return run().then(function (res) {
    assertEqual(db.charges.length, 0, 'נשלח חיוב בלי מחיר מוסכם');
    var mine = (res.payload.results || []).filter(function (row) {
      return row.company === 'co-chain2';
    })[0];
    assertEqual(mine && mine.action, 'skipped', 'הלקוח לא דולג');
    assertEqual(mine && mine.reason, 'price-not-set', 'הסיבה לדילוג אינה ברורה בדוח');
    db.restore();
  });
});

test('מחיר מוסכם עובד גם בתוכנית רגילה', function () {
  var db = new FakeDb([company({
    id: 'co-deal', plan: 'starter', custom_price_monthly: 150
  })]);
  db.install();
  return run().then(function () {
    assertEqual(db.charges[0].amount, 150, 'המחיר שסוכם לא נלקח בתוכנית רגילה');
    db.restore();
  });
});

console.log('\n== מניעת חיוב כפול ==');

test('שתי ריצות באותו יום מחייבות פעם אחת', function () {
  var db = new FakeDb([company()]);
  db.install();
  return run().then(function () {
    assertEqual(db.charges.length, 1, 'הריצה הראשונה לא חייבה');
    /* מחזירים את המצב לאחור כאילו העדכון לא קרה, כדי לוודא שדווקא
       התביעה על התקופה היא שמונעת את החיוב השני */
    db.companies['co-1'].status = 'trial';
    db.companies['co-1'].valid_until = daysAgo(1);
    return run();
  }).then(function (res) {
    assertEqual(db.charges.length, 1, 'הלקוח חויב פעמיים');
    var skipped = res.payload.results.filter(function (r) { return r.reason === 'already-charged'; });
    assertEqual(skipped.length, 1, 'הדילוג לא דווח');
    db.restore();
  });
});

test('אותו מפתח מניעת כפילות נשלח גם לספק', function () {
  var db = new FakeDb([company()]);
  db.install();
  return run().then(function () {
    var key = db.charges[0].idempotencyKey;
    assert(key && key.indexOf('charge:co-1:') === 0, 'מפתח הכפילות חסר או שגוי: ' + key);
    db.restore();
  });
});

test('חודש חדש מחייב שוב, כי זו תקופה אחרת', function () {
  /* הניסיון הסתיים לפני חודש ויום, ומאז עברה תקופה שלמה */
  var db = new FakeDb([company({ valid_until: daysAgo(31) })]);
  db.install();
  return run().then(function () {
    assertEqual(db.charges.length, 1, 'החיוב הראשון לא בוצע');
    assertEqual(db.companies['co-1'].status, 'active', 'הסטטוס לא הפך לפעיל');
    /* התקופה החדשה נגמרה גם היא */
    db.companies['co-1'].valid_until = daysAgo(1);
    return run();
  }).then(function () {
    assertEqual(db.charges.length, 2, 'החידוש החודשי לא בוצע');
    assert(db.charges[0].idempotencyKey !== db.charges[1].idempotencyKey,
      'שתי התקופות קיבלו את אותו מפתח');
    db.restore();
  });
});

test('אותה תקופה בדיוק לעולם אינה מחויבת פעמיים', function () {
  /* אותו תאריך תקופה = אותו מפתח, גם אם הנתונים התאפסו בדרך.
     זו ההגנה האחרונה מפני חיוב כפול. */
  var db = new FakeDb([company({ valid_until: daysAgo(3) })]);
  db.install();
  return run().then(function () {
    assertEqual(db.charges.length, 1, 'החיוב הראשון לא בוצע');
    db.companies['co-1'].status = 'trial';
    db.companies['co-1'].valid_until = daysAgo(3);
    return run();
  }).then(function () {
    assertEqual(db.charges.length, 1, 'אותה תקופה חויבה פעמיים');
    db.restore();
  });
});

console.log('\n== מי שאסור לחייב ==');

test('מי שביטל אינו מחויב, והמנוי נסגר', function () {
  var db = new FakeDb([company({ cancel_at_period_end: true })]);
  db.install();
  return run().then(function () {
    assertEqual(db.charges.length, 0, 'חויב לקוח שביטל');
    assertEqual(db.companies['co-1'].status, 'canceled', 'המנוי לא נסגר');
    db.restore();
  });
});

test('ניסיון שהסתיים בלי כרטיס פג ואינו מחויב', function () {
  var db = new FakeDb([company({ billing_subscription_id: null })]);
  db.install();
  return run().then(function () {
    assertEqual(db.charges.length, 0, 'בוצע ניסיון חיוב בלי כרטיס');
    assertEqual(db.companies['co-1'].status, 'expired', 'הסטטוס לא עודכן');
    db.restore();
  });
});

console.log('\n== קופונים ==');

test('הנחה מקופון מופחתת מהחיוב, ונוצלת פעם אחת', function () {
  var db = new FakeDb([company({
    id: 'co-cut', plan: 'starter',
    discount_percent: 20, discount_charges_left: 1
  })]);
  db.install();
  return run().then(function () {
    assertEqual(db.charges.length, 1, 'לא בוצע חיוב');
    assertEqual(db.charges[0].amount, 159, 'ההנחה לא הופחתה');
    assertEqual(db.companies['co-cut'].discount_charges_left, 0, 'ההנחה לא נוצלה');
    db.restore();
  });
});

/* ההנחה יורדת רק אחרי חיוב שעבר. כרטיס שנדחה היום והתקבל מחר
   אינו אמור לגבות את המחיר המלא. */
test('הנחה אינה נוצלת כשהחיוב נכשל', function () {
  var db = new FakeDb([company({
    id: 'co-fail-cut', plan: 'starter', billing_subscription_id: 'fail-1',
    discount_percent: 20, discount_charges_left: 1
  })]);
  db.install();
  return run().then(function () {
    assertEqual(db.companies['co-fail-cut'].discount_charges_left, 1,
      'ההנחה נשרפה על חיוב שנכשל');
    db.restore();
  });
});

/* "חודש חינם" ו"מחיר שלא נקבע" מגיעים שניהם לאפס. הראשון מאריך
   את התקופה בלי לגשת לספק בכלל; השני מדלג ומחכה לאדם. */
test('הנחה מלאה מאריכה את התקופה בלי לחייב', function () {
  var db = new FakeDb([company({
    id: 'co-free', plan: 'starter',
    discount_percent: 100, discount_charges_left: 1
  })]);
  db.install();
  return run().then(function (res) {
    assertEqual(db.charges.length, 0, 'נשלחה בקשת חיוב על אפס');
    assertEqual(db.companies['co-free'].status, 'active', 'החברה לא הופעלה');
    assertEqual(db.companies['co-free'].discount_charges_left, 0, 'ההטבה לא נוצלה');
    assert(new Date(db.companies['co-free'].valid_until) > new Date(), 'התוקף לא הוארך');
    assertEqual(res.payload.results[0].action, 'granted', 'הפעולה לא נרשמה כהטבה');
    db.restore();
  });
});

test('רשת בלי מחיר מוסכם אינה מקבלת חודש חינם בטעות', function () {
  var db = new FakeDb([company({ id: 'co-quote', plan: 'enterprise' })]);
  db.install();
  return run().then(function (res) {
    assertEqual(db.charges.length, 0, 'נגבה כסף בלי מחיר');
    assertEqual(res.payload.results[0].reason, 'price-not-set', 'לא דווח שהמחיר חסר');
    db.restore();
  });
});

console.log('\n== כישלון תשלום ==');

test('חיוב שנכשל מסמן past_due ואינו מאריך את התוקף', function () {
  var db = new FakeDb([company({ billing_subscription_id: 'fail-tok' })]);
  db.install();
  var before = db.companies['co-1'].valid_until;
  return run().then(function () {
    assertEqual(db.companies['co-1'].status, 'past_due', 'הסטטוס לא עודכן');
    assertEqual(db.companies['co-1'].valid_until, before, 'התוקף הוארך למרות שהחיוב נכשל');
    db.restore();
  });
});

test('בתוך ימי החסד ממשיכים לנסות', function () {
  var db = new FakeDb([company({
    status: 'past_due', billing_subscription_id: 'fail-tok', valid_until: daysAgo(2)
  })]);
  db.install();
  return run().then(function (res) {
    assertEqual(db.charges.length, 1, 'לא בוצע ניסיון חוזר בתוך ימי החסד');
    assertEqual(db.companies['co-1'].status, 'past_due', 'הסטטוס השתנה');
    assert(res.payload.summary.failed, 'הכישלון לא דווח');
    db.restore();
  });
});

test('אחרי ימי החסד המנוי פג ומפסיקים לנסות', function () {
  var db = new FakeDb([company({
    status: 'past_due', billing_subscription_id: 'fail-tok',
    valid_until: daysAgo(cron.GRACE_DAYS + 2)
  })]);
  db.install();
  return run().then(function () {
    assertEqual(db.charges.length, 0, 'נעשה ניסיון חיוב אחרי ימי החסד');
    assertEqual(db.companies['co-1'].status, 'expired', 'המנוי לא פג');
    db.restore();
  });
});

test('כישלון אצל לקוח אחד אינו עוצר את השאר', function () {
  var db = new FakeDb([
    company({ id: 'co-a', billing_subscription_id: 'fail-tok' }),
    company({ id: 'co-b' }),
    company({ id: 'co-c' })
  ]);
  db.install();
  return run().then(function (res) {
    assertEqual(res.statusCode, 200, 'הריצה נכשלה כולה');
    assertEqual(db.companies['co-b'].status, 'active', 'לקוח תקין לא חויב');
    assertEqual(db.companies['co-c'].status, 'active', 'לקוח תקין לא חויב');
    assertEqual(db.companies['co-a'].status, 'past_due', 'הכישלון לא סומן');
    db.restore();
  });
});

console.log('\n== שורת ההכנסה ==');

test('חיוב מוצלח רושם כמה נגבה, לא רק שנגבה', function () {
  /* בלי הסכום, המשרד האחורי מחשב מחזור מתוך המחירון ולא מתוך
     מה שנגבה בפועל – וכל שינוי מחיר היסטורי מזייף את הדוח. */
  var db = new FakeDb([company({ plan: 'growth' })]);
  db.install();
  return run().then(function () {
    var row = db.events[Object.keys(db.events)[0]];
    assertEqual(row.payload.outcome, 'charged', 'התוצאה לא נרשמה');
    assertEqual(row.payload.amount, 399, 'הסכום לא נרשם');
    assertEqual(row.payload.currency, 'ILS', 'המטבע לא נרשם');
    assert(!!row.payload.period_start, 'תחילת התקופה נמחקה בעדכון');
    assertEqual(row.payload.plan, 'growth', 'התוכנית נמחקה בעדכון');
    db.restore();
  }, function (err) { db.restore(); throw err; });
});

test('כישלון אינו מוחק את מה שכבר נרשם על התקופה', function () {
  var db = new FakeDb([company({ billing_subscription_id: 'fail-tok' })]);
  db.install();
  return run().then(function () {
    var row = db.events[Object.keys(db.events)[0]];
    assertEqual(row.payload.outcome, 'declined', 'התוצאה לא נרשמה');
    assert(!!row.payload.period_start, 'תחילת התקופה נמחקה');
    assert(!row.payload.amount, 'נרשם סכום על חיוב שלא עבר');
    db.restore();
  }, function (err) { db.restore(); throw err; });
});

console.log('\n== ניסיון חוזר ביום שאחרי ==');

/* הבדיקות למטה מריצות את ה-cron פעמיים על אותה חברה, כשבין
   הריצות רק הזמן עבר. זה בדיוק המקרה שנשבר קודם: התביעה על
   התקופה נתפסה ביום הראשון ולא שוחררה לעולם, ולכן ימי החסד
   ספרו ימים בלי שאיש ניסה לגבות בהם. */

test('סירוב ברור מנסים שוב למחרת, על אותה תקופה', function () {
  var db = new FakeDb([company({
    status: 'trial', billing_subscription_id: 'fail-tok', valid_until: daysAgo(1)
  })]);
  db.install();
  return run().then(function (first) {
    assertEqual(first.payload.summary.failed, 1, 'הניסיון הראשון לא נכשל כצפוי');
    assertEqual(db.charges.length, 1, 'הניסיון הראשון לא יצא לדרך');
    assertEqual(first.payload.results[0].retry, 'tomorrow', 'לא סומן שמנסים שוב');
    /* מריצים שוב "מחר": מזיזים את חותמת הזמן של הניסיון הקודם
       יום אחורה, בדיוק כפי שהיא תיראה בבסיס הנתונים מחר. */
    var periodRow = db.events[Object.keys(db.events)[0]];
    periodRow.payload.at = daysAgo(1);
    return run();
  }).then(function (second) {
    assertEqual(db.charges.length, 2, 'הניסיון החוזר לא יצא לדרך');
    assertEqual(second.payload.results[0].action, 'failed', 'הניסיון החוזר לא בוצע');
    db.restore();
  }, function (err) { db.restore(); throw err; });
});

test('שתי ריצות באותו יום אינן מייצרות שני ניסיונות חוזרים', function () {
  var db = new FakeDb([company({
    status: 'past_due', billing_subscription_id: 'fail-tok', valid_until: daysAgo(2)
  })]);
  db.install();
  return run().then(function () {
    assertEqual(db.charges.length, 1, 'הניסיון הראשון לא יצא לדרך');
    return run();
  }).then(function (second) {
    assertEqual(db.charges.length, 1, 'נעשה ניסיון שני באותו יום');
    assertEqual(second.payload.results[0].reason, 'already-charged', 'הסיבה אינה נכונה');
    db.restore();
  }, function (err) { db.restore(); throw err; });
});

test('חיוב שלא קיבל תשובה אינו נוסה שוב לבד', function () {
  /* ספק שנופל באמצע: איננו יודעים אם הכרטיס חויב. ניסיון חוזר
     כאן הוא חיוב כפול, ולכן עוצרים ומחכים לאדם. */
  var providers = require('../api/billing/_providers.js');
  var db = new FakeDb([company()]);
  db.install();
  var saved = providers.mock.charge;
  providers.mock.charge = function (input) {
    db.charges.push(input);
    return Promise.resolve({ ok: false, reason: 'timeout', retryable: false, uncertain: true });
  };
  function undo() { providers.mock.charge = saved; db.restore(); }
  return run().then(function (first) {
    assertEqual(first.payload.results[0].retry, 'stopped', 'חוסר ודאות סומן כניתן לניסיון חוזר');
    return run();
  }).then(function (second) {
    assertEqual(db.charges.length, 1, 'נעשה ניסיון חוזר על חיוב שתוצאתו אינה ידועה');
    assertEqual(second.payload.results[0].reason, 'already-charged', 'הסיבה אינה נכונה');
    undo();
  }, function (err) { undo(); throw err; });
});

test('תקלה אצלנו אינה מסמנת את הלקוח כמי שלא שילם', function () {
  /* ספק שזורק זו כמעט תמיד הגדרה חסרה אצלנו. הלקוח לא עשה כלום
     רע, ואסור שהמסך שלו ייחסם בגלל משתנה סביבה. */
  var providers = require('../api/billing/_providers.js');
  var db = new FakeDb([company()]);
  db.install();
  var saved = providers.mock.charge;
  providers.mock.charge = function () { throw new Error('PAYPLUS_API_KEY is missing'); };
  function undo() { providers.mock.charge = saved; db.restore(); }
  return run().then(function (res) {
    assertEqual(res.payload.results[0].action, 'error', 'התקלה לא דווחה כתקלה');
    assertEqual(db.companies['co-1'].status, 'trial', 'הלקוח סומן כמי שהתשלום שלו נכשל');
    undo();
  }, function (err) { undo(); throw err; });
});

console.log('\n== ספק שאינו מוכן ==');

test('PayPlus לפני הגדרה אינו מחייב אף אחד', function () {
  var db = new FakeDb([company()]);
  db.install();
  process.env.BILLING_PROVIDER = 'payplus';
  delete process.env.PAYPLUS_READY;
  return run().then(function (res) {
    process.env.BILLING_PROVIDER = 'mock';
    /* charge זורק, וזה נתפס ומדווח ככישלון – לא כחיוב מוצלח */
    var charged = (res.payload.results || []).filter(function (r) {
      return r.action === 'first-charge' || r.action === 'renewal';
    });
    assertEqual(charged.length, 0, 'ספק שאינו מוכן ביצע חיוב');
    assert(db.companies['co-1'].status !== 'active', 'הסטטוס הפך לפעיל בלי חיוב אמיתי');
    db.restore();
  }, function (err) {
    process.env.BILLING_PROVIDER = 'mock';
    db.restore();
    throw err;
  });
});

queue.then(function () {
  console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
  process.exit(failed ? 1 : 0);
});
