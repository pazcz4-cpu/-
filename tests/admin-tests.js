/* בדיקות למשרד האחורי.

   רוב הבדיקות כאן עוסקות במי לא נכנס. משרד אחורי רואה את כל
   הלקוחות של כל החברות ועוקף את כללי הבידוד במכוון, ולכן השער
   שלו הוא הדבר היחיד שמפריד בין "כלי ניהול" ל"דלת אחורית".

   הרצה: node tests/admin-tests.js */
'use strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.PLATFORM_OWNER_EMAILS = 'boss@setshifts.com, second@setshifts.com';

var Money = require('../api/admin/_money.js');
/* נקודת קצה אחת, וה-op קובע את המסלול. העטיפות למטה שומרות על
   הבדיקות קריאות: כל אחת עדיין נכתבת כאילו יש נקודת קצה נפרדת. */
var admin = require('../api/admin/index.js');
function route(op) {
  return function (req, res) {
    var body = JSON.parse(req.body || '{}');
    body.op = op;
    return admin(Object.assign({}, req, { body: JSON.stringify(body) }), res);
  };
}
var overview = route('overview');
var companies = route('companies');
var company = route('company');
var action = route('action');
var tickets = route('tickets');
var coupons = route('coupons');

var passed = 0, failed = 0;
function assert(condition, message) { if (!condition) throw new Error(message); }
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'ערכים שונים') + ': התקבל ' + JSON.stringify(actual) +
      ', ציפינו ל-' + JSON.stringify(expected));
  }
}
function close(actual, expected, message) {
  if (Math.abs(Number(actual) - Number(expected)) > 0.02) {
    throw new Error((message || 'ערכים שונים') + ': התקבל ' + actual + ', ציפינו ל-' + expected);
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

/* ===== שרת מדומה ===== */
function Fake(seed) {
  var data = seed || {};
  this.companies = data.companies || [];
  this.users = data.users || [];
  this.events = data.events || [];
  this.tickets = data.tickets || [];
  this.coupons = data.coupons || [];
  this.redemptions = data.redemptions || [];
  this.configs = data.configs || [];
  this.sessions = data.sessions || { 'owner-token': { id: 'u1', email: 'boss@setshifts.com' } };
  this.writes = [];
}

Fake.prototype.install = function () {
  var self = this;
  this.original = globalThis.fetch;
  globalThis.fetch = function (url, options) {
    var opts = options || {};
    var parsed = new URL(url);
    var body = opts.body ? JSON.parse(opts.body) : null;

    function reply(status, payload) {
      return Promise.resolve({
        ok: status >= 200 && status < 300, status: status,
        json: function () { return Promise.resolve(payload); },
        text: function () {
          return Promise.resolve(payload === undefined ? '' : JSON.stringify(payload));
        }
      });
    }

    /* GoTrue: מי מחזיק את האסימון */
    if (parsed.pathname === '/auth/v1/user') {
      var auth = (opts.headers && opts.headers.Authorization) || '';
      var token = auth.replace('Bearer ', '');
      var found = self.sessions[token];
      return found ? reply(200, found) : reply(401, { message: 'bad token' });
    }

    var path = parsed.pathname.replace('/rest/v1', '');
    var query = decodeURIComponent(parsed.search.slice(1));
    self.writes.push({ method: opts.method || 'GET', path: path, query: query, body: body });

    function idFilter(list) {
      var match = query.match(/(?:^|&)id=eq\.([^&]+)/);
      if (!match) return list;
      return list.filter(function (row) { return String(row.id) === match[1]; });
    }
    function companyFilter(list) {
      var match = query.match(/company_id=eq\.([^&]+)/);
      if (!match) return list;
      return list.filter(function (row) { return String(row.company_id) === match[1]; });
    }

    if (path === '/companies') {
      if (opts.method === 'PATCH') {
        var targets = idFilter(self.companies);
        targets.forEach(function (row) { Object.assign(row, body); });
        return reply(200, targets);
      }
      return reply(200, idFilter(self.companies));
    }
    if (path === '/company_users') return reply(200, companyFilter(self.users));
    if (path === '/billing_events') {
      if (opts.method === 'POST') {
        var row = body[0];
        if (self.events.some(function (e) { return e.id === row.id; })) {
          return reply(409, { code: '23505' });
        }
        self.events.push(row);
        return reply(201, []);
      }
      return reply(200, companyFilter(self.events));
    }
    if (path === '/support_tickets') {
      if (opts.method === 'PATCH') {
        var hit = idFilter(self.tickets);
        hit.forEach(function (row) { Object.assign(row, body); });
        return reply(200, hit);
      }
      var list = companyFilter(self.tickets);
      var statusMatch = query.match(/status=eq\.([^&]+)/);
      if (statusMatch) {
        list = list.filter(function (row) { return row.status === statusMatch[1]; });
      }
      return reply(200, list);
    }
    if (path === '/coupons') {
      if (opts.method === 'POST') {
        var fresh = body[0];
        if (self.coupons.some(function (c) { return c.code === fresh.code; })) {
          return reply(409, { code: '23505' });
        }
        self.coupons.push(Object.assign({ uses: 0, created_at: new Date().toISOString() }, fresh));
        return reply(201, [fresh]);
      }
      var codeMatch = query.match(/code=eq\.([^&]+)/);
      var picked = codeMatch
        ? self.coupons.filter(function (c) { return c.code === codeMatch[1]; })
        : self.coupons;
      if (opts.method === 'PATCH') {
        picked.forEach(function (row) { Object.assign(row, body); });
        return reply(200, picked);
      }
      return reply(200, picked);
    }
    if (path === '/coupon_redemptions') return reply(200, self.redemptions);
    if (path === '/company_configs') {
      /* התמחור לפי עובד קורא את ההגדרות של קבוצת לקוחות בבת
         אחת, ולכן גם המסנן הזה נדרש כאן */
      var inMatch = query.match(/company_id=in\.\(([^)]*)\)/);
      if (inMatch) {
        var wanted = inMatch[1].split(',');
        return reply(200, self.configs.filter(function (row) {
          return wanted.indexOf(String(row.company_id)) !== -1;
        }));
      }
      return reply(200, companyFilter(self.configs));
    }
    if (path === '/company_weeks') return reply(200, []);
    return reply(404, { message: 'no route: ' + path });
  };
};

Fake.prototype.restore = function () { globalThis.fetch = this.original; };

function call(handler, payload, options) {
  var opts = options || {};
  var req = {
    method: opts.method || 'POST',
    headers: { authorization: opts.token === null ? '' : 'Bearer ' + (opts.token || 'owner-token') },
    body: JSON.stringify(payload || {})
  };
  var res = {
    statusCode: 0, headers: {}, payload: null,
    setHeader: function (k, v) { this.headers[k] = v; },
    end: function (text) { this.payload = text ? JSON.parse(text) : null; }
  };
  return Promise.resolve(handler(req, res)).then(function () { return res; });
}

console.log('\n== נקודת קצה אחת ==');

test('op שאינו מוכר נדחה, ולא מחזיר נתונים', function () {
  var fake = new Fake(); fake.install();
  return call(route('אין-כזה'), {}).then(function (res) {
    assertEqual(res.statusCode, 400, 'op לא מוכר התקבל');
    assert(!res.payload.counts, 'דלפו נתונים');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('בקשה בלי op נדחית', function () {
  var fake = new Fake(); fake.install();
  return call(admin, {}).then(function (res) {
    assertEqual(res.statusCode, 400, 'בקשה בלי op התקבלה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('op אינו יכול להגיע לתכונות של Object', function () {
  /* 'constructor' ו-'toString' קיימים על כל אובייקט, ובלי בדיקת
     בעלות אמיתית הם היו נחשבים מסלול קיים. */
  var fake = new Fake(); fake.install();
  return call(route('constructor'), {}).then(function (res) {
    assertEqual(res.statusCode, 400, 'תכונה של Object נחשבה מסלול');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

console.log('\n== מי לא נכנס ==');

test('בלי אסימון אין משרד אחורי', function () {
  var fake = new Fake(); fake.install();
  return call(overview, {}, { token: null }).then(function (res) {
    assertEqual(res.statusCode, 401, 'בקשה בלי אסימון התקבלה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('אסימון שאינו תקף נדחה', function () {
  var fake = new Fake(); fake.install();
  return call(overview, {}, { token: 'made-up' }).then(function (res) {
    assertEqual(res.statusCode, 401, 'אסימון מזויף התקבל');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('בעלים של חברה אינו בעלים של המוצר', function () {
  /* זו ההבחנה שכל המשרד האחורי נשען עליה. לקוח עם role=owner
     הוא הבעלים של העסק שלו – ולא אמור לראות אף לקוח אחר. */
  var fake = new Fake({
    sessions: { 'customer-token': { id: 'u9', email: 'someone@customer.co.il' } },
    companies: [{ id: 'co-1', name: 'לקוח', plan: 'starter', status: 'active' }]
  });
  fake.install();
  return call(overview, {}, { token: 'customer-token' }).then(function (res) {
    assertEqual(res.statusCode, 403, 'לקוח נכנס למשרד האחורי');
    assert(!res.payload.counts, 'דלפו נתונים ללקוח');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('בלי משתנה הסביבה המשרד סגור לגמרי', function () {
  /* ברירת מחדל נכונה: פריסה שנשכח בה משתנה נסגרת, לא נפתחת */
  var saved = process.env.PLATFORM_OWNER_EMAILS;
  delete process.env.PLATFORM_OWNER_EMAILS;
  var fake = new Fake(); fake.install();
  return call(overview, {}).then(function (res) {
    process.env.PLATFORM_OWNER_EMAILS = saved;
    fake.restore();
    assertEqual(res.statusCode, 503, 'המשרד נפתח בלי הגדרה');
  }, function (e) {
    process.env.PLATFORM_OWNER_EMAILS = saved; fake.restore(); throw e;
  });
});

test('רישיות בכתובת אינה משנה', function () {
  var fake = new Fake({
    sessions: { 'caps-token': { id: 'u1', email: 'Boss@SetShifts.com' } }
  });
  fake.install();
  return call(overview, {}, { token: 'caps-token' }).then(function (res) {
    assertEqual(res.statusCode, 200, 'כתובת באותיות גדולות נדחתה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('GET אינו מתקבל', function () {
  var fake = new Fake(); fake.install();
  return call(overview, {}, { method: 'GET' }).then(function (res) {
    assertEqual(res.statusCode, 405, 'GET התקבל');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

console.log('\n== מע"מ ==');

test('מחיר שכולל מע"מ מתפרק נכון', function () {
  var parts = Money.split(199);
  assertEqual(parts.gross, 199, 'הסכום ברוטו השתנה');
  close(parts.net, 168.64, 'הסכום נטו שגוי');
  close(parts.vat, 30.36, 'המע"מ שגוי');
  close(parts.net + parts.vat, 199, 'החלקים אינם מסתכמים לשלם');
});

test('מחיר שאינו כולל מע"מ מתפרק נכון', function () {
  process.env.PRICES_INCLUDE_VAT = 'false';
  var parts = Money.split(199);
  delete process.env.PRICES_INCLUDE_VAT;
  assertEqual(parts.net, 199, 'הסכום נטו השתנה');
  close(parts.gross, 234.82, 'הסכום ברוטו שגוי');
});

test('חודש בלי הכנסה מופיע בדוח כאפס, ולא נעלם', function () {
  /* חודש שנעלם מהגרף נראה כמו חודש טוב */
  var rows = Money.byMonth(
    [{ at: '2026-01-10T00:00:00Z', amount: 199 },
      { at: '2026-03-10T00:00:00Z', amount: 399 }],
    '2026-01-01T00:00:00Z', '2026-03-31T00:00:00Z');
  assertEqual(rows.length, 3, 'מספר החודשים שגוי');
  assertEqual(rows[1].month, '2026-02', 'החודש האמצעי חסר');
  assertEqual(rows[1].gross, 0, 'חודש ריק אינו אפס');
  assertEqual(rows[2].gross, 399, 'החודש האחרון שגוי');
});

test('סכימה אינה צוברת שארית עשרונית', function () {
  var many = [];
  for (var i = 0; i < 100; i++) many.push(0.1);
  assertEqual(Money.sum(many), 10, 'הסכום צבר שארית');
});

test('מה שכתוב בדף המכירה הוא מה שהחישוב מניח', function () {
  /* הדף אמר "לא כולל מע״מ" בזמן שהקוד גבה 199 והתייחס אליהם
     ככוללים. סתירה כזו אינה מתגלה בשום מסך – היא מתגלה ברואה
     חשבון. שתי העובדות נבדקות כאן יחד, בשמונה השפות. */
  var fs = require('fs');
  var path = require('path');
  var dir = path.join(__dirname, '..', 'js', 'i18n');
  var langs = fs.readdirSync(dir).filter(function (file) {
    return /\.js$/.test(file) && file !== 'core.js' && file !== 'dom.js';
  });

  assertEqual(Money.pricesIncludeVat(), true, 'החישוב מניח שהמחיר אינו כולל מע"מ');
  assertEqual(Money.vatRate(), 18, 'שיעור המע"מ אינו 18');

  var NOT_INCLUDED = ['לא כולל מע', 'not included', 'غير شاملة', 'zzgl',
    'no incluido', 'hors TVA', 'não incluído', 'без НДС'];
  langs.forEach(function (file) {
    var text = fs.readFileSync(path.join(dir, file), 'utf8');
    var note = (text.match(/pricingNote: '((?:[^'\\]|\\.)*)'/) || [])[1] || '';
    assert(note, 'אין שורת מחירים ב-' + file);
    NOT_INCLUDED.forEach(function (phrase) {
      assert(note.indexOf(phrase) === -1,
        file + ' עדיין אומר שהמחיר אינו כולל מע"מ: ' + phrase);
    });
    /* השיעור עצמו אינו נכתב בדף – הוא משתנה בחקיקה, ושורת
       מחירים שנשארת עם מספר ישן גרועה מאחת שאומרת רק "כולל". */
    assert(note.indexOf('%') === -1, file + ' נוקב בשיעור מע"מ שעלול להתיישן');
  });
});

console.log('\n== המספרים ==');

function sampleWorld() {
  return new Fake({
    companies: [
      { id: 'co-1', name: 'קפה מרכז', plan: 'starter', status: 'active',
        valid_until: daysAhead(12), billing_subscription_id: 'tok-1',
        cancel_at_period_end: false, created_at: daysAgo(90) },
      { id: 'co-2', name: 'מסעדת הגליל', plan: 'growth', status: 'trial',
        valid_until: daysAhead(3), cancel_at_period_end: false, created_at: daysAgo(11) },
      { id: 'co-3', name: 'רשת הדרום', plan: 'business', status: 'past_due',
        valid_until: daysAgo(2), billing_subscription_id: 'tok-3',
        cancel_at_period_end: false, created_at: daysAgo(200) },
      { id: 'co-4', name: 'בייק שופ', plan: 'starter', status: 'active',
        valid_until: daysAhead(20), billing_subscription_id: 'tok-4',
        cancel_at_period_end: true, created_at: daysAgo(150) }
    ],
    users: [
      { company_id: 'co-1', email: 'a@x.co.il', name: 'אבי', role: 'owner', active: true },
      { company_id: 'co-1', email: 'b@x.co.il', name: 'בר', role: 'employee', active: true },
      { company_id: 'co-2', email: 'c@y.co.il', name: 'גל', role: 'owner', active: true },
      { company_id: 'co-3', email: 'd@z.co.il', name: 'דנה', role: 'owner', active: false }
    ],
    events: [
      { id: 'charge:co-1:a', company_id: 'co-1', type: 'charge.first',
        payload: { outcome: 'charged', amount: 199, plan: 'starter', at: daysAgo(40) },
        received_at: daysAgo(40) },
      { id: 'charge:co-1:b', company_id: 'co-1', type: 'charge.renewal',
        payload: { outcome: 'charged', amount: 199, plan: 'starter', at: daysAgo(10) },
        received_at: daysAgo(10) },
      { id: 'charge:co-3:a', company_id: 'co-3', type: 'charge.renewal',
        payload: { outcome: 'declined', reason: 'no funds', at: daysAgo(2) },
        received_at: daysAgo(2) }
    ],
    tickets: [
      { id: 't1', company_id: 'co-1', status: 'open', subject: 'תקלה', body: '...',
        kind: 'bug', created_at: daysAgo(1) },
      { id: 't2', company_id: 'co-2', status: 'closed', subject: 'שאלה', body: '...',
        kind: 'question', created_at: daysAgo(5) }
    ]
  });
}

test('לוח המחוונים סופר נכון לפי מצב ולפי חבילה', function () {
  var fake = sampleWorld(); fake.install();
  return call(overview, {}).then(function (res) {
    assertEqual(res.statusCode, 200, 'הבקשה נכשלה');
    var counts = res.payload.counts;
    assertEqual(counts.companies, 4, 'מספר החברות שגוי');
    assertEqual(counts.byStatus.active, 2, 'מספר הפעילות שגוי');
    assertEqual(counts.byStatus.trial, 1, 'מספר הניסיונות שגוי');
    assertEqual(counts.byStatus.past_due, 1, 'מספר הפיגורים שגוי');
    assertEqual(counts.users, 3, 'נספרו גם משתמשים מושבתים');
    assertEqual(counts.tickets.open, 1, 'קריאות פתוחות');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('הכנסה נספרת רק מחיובים שעברו', function () {
  /* co-3 נדחה. אם הוא ייספר, הדוח מראה כסף שלא נכנס. */
  var fake = sampleWorld(); fake.install();
  return call(overview, {}).then(function (res) {
    assertEqual(res.payload.money.allTime.gross, 398, 'סכום ההכנסות שגוי');
    close(res.payload.money.allTime.net, 337.29, 'הנטו שגוי');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('הכנסה חוזרת סופרת רק את מי שמשלם ולא ביטל', function () {
  /* co-4 פעיל אך ביטל, ולכן לא ייכנס ממנו כסף בחודש הבא */
  var fake = sampleWorld(); fake.install();
  return call(overview, {}).then(function (res) {
    var mrr = res.payload.money.recurring;
    assertEqual(mrr.companies, 1, 'מספר המשלמים שגוי');
    assertEqual(mrr.gross, 199, 'ההכנסה החוזרת שגויה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('ניסיונות שנגמרים השבוע עולים כרשימה, לא כמספר', function () {
  var fake = sampleWorld(); fake.install();
  return call(overview, {}).then(function (res) {
    var ending = res.payload.attention.trialsEnding;
    assertEqual(ending.length, 1, 'מספר הניסיונות הנגמרים שגוי');
    assertEqual(ending[0].name, 'מסעדת הגליל', 'החברה השגויה');
    assertEqual(ending[0].hasCard, false, 'סומן ככזה שיש לו כרטיס');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('מי שביטל ומי שבפיגור מופיעים בנפרד', function () {
  var fake = sampleWorld(); fake.install();
  return call(overview, {}).then(function (res) {
    assertEqual(res.payload.attention.failing.length, 1, 'רשימת הפיגורים שגויה');
    assertEqual(res.payload.attention.canceling.length, 1, 'רשימת המבטלים שגויה');
    assertEqual(res.payload.attention.canceling[0].name, 'בייק שופ', 'החברה השגויה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

console.log('\n== רשימת הלקוחות ==');

test('חיפוש לפי שם ולפי מייל של הבעלים', function () {
  var fake = sampleWorld(); fake.install();
  return call(companies, { q: 'הגליל' }).then(function (res) {
    assertEqual(res.payload.companies.length, 1, 'חיפוש לפי שם');
    return call(companies, { q: 'a@x.co.il' });
  }).then(function (res) {
    assertEqual(res.payload.companies.length, 1, 'חיפוש לפי מייל');
    assertEqual(res.payload.companies[0].name, 'קפה מרכז', 'נמצאה החברה השגויה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('סינון לפי מצב', function () {
  var fake = sampleWorld(); fake.install();
  return call(companies, { status: 'active' }).then(function (res) {
    assertEqual(res.payload.companies.length, 2, 'הסינון שגוי');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('לכל שורה יש מה שצריך כדי להחליט אם להתקשר', function () {
  var fake = sampleWorld(); fake.install();
  return call(companies, { q: 'קפה' }).then(function (res) {
    var row = res.payload.companies[0];
    assertEqual(row.ownerEmail, 'a@x.co.il', 'מייל הבעלים חסר');
    assertEqual(row.users, 2, 'מספר המשתמשים שגוי');
    assertEqual(row.paidGross, 398, 'הסכום ששולם שגוי');
    assertEqual(row.openTickets, 1, 'קריאות פתוחות');
    assertEqual(row.hasCard, true, 'סימון הכרטיס שגוי');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

console.log('\n== כרטיס לקוח ==');

test('הכרטיס אינו חושף את הטוקן של הכרטיס', function () {
  var fake = sampleWorld(); fake.install();
  return call(company, { id: 'co-1' }).then(function (res) {
    assertEqual(res.payload.company.hasCard, true, 'סימון הכרטיס שגוי');
    assertEqual(res.payload.company.billing_subscription_id, undefined,
      'מזהה הטוקן נחשף במשרד האחורי');
    assertEqual(JSON.stringify(res.payload).indexOf('tok-1'), -1,
      'הטוקן דלף לתשובה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('הכרטיס מראה גם ניסיונות שנכשלו', function () {
  var fake = sampleWorld(); fake.install();
  return call(company, { id: 'co-3' }).then(function (res) {
    assertEqual(res.payload.payments.count, 0, 'נספר חיוב שלא עבר');
    assertEqual(res.payload.events.length, 1, 'האירוע לא הוצג');
    assertEqual(res.payload.events[0].outcome, 'declined', 'התוצאה שגויה');
    assertEqual(res.payload.events[0].reason, 'no funds', 'הסיבה חסרה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('חברה שאינה קיימת מחזירה 404 ולא קורסת', function () {
  var fake = sampleWorld(); fake.install();
  return call(company, { id: 'לא-קיים' }).then(function (res) {
    assertEqual(res.statusCode, 404, 'קוד התשובה שגוי');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

console.log('\n== פעולות ==');

test('הארכת ניסיון מוסיפה ימים ונרשמת ביומן', function () {
  var fake = sampleWorld(); fake.install();
  return call(action, { action: 'extend-trial', id: 'co-2', days: 14,
    reason: 'הלקוח ביקש עוד שבועיים לפיילוט' }).then(function (res) {
    assertEqual(res.statusCode, 200, 'הפעולה נכשלה');
    assertEqual(res.payload.detail.days, 14, 'מספר הימים שגוי');
    var entry = fake.events.filter(function (e) {
      return String(e.id).indexOf('admin:') === 0;
    })[0];
    assert(!!entry, 'הפעולה לא נרשמה ביומן');
    assertEqual(entry.payload.by, 'boss@setshifts.com', 'מבצע הפעולה לא נרשם');
    assert(/פיילוט/.test(entry.payload.reason), 'הסיבה לא נרשמה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('פעולה בלי סיבה נדחית', function () {
  /* יומן בלי סיבות הוא רשימת תאריכים */
  var fake = sampleWorld(); fake.install();
  var before = fake.companies[1].valid_until;
  return call(action, { action: 'extend-trial', id: 'co-2', days: 7 }).then(function (res) {
    assertEqual(res.statusCode, 400, 'פעולה בלי סיבה התקבלה');
    assertEqual(fake.companies[1].valid_until, before, 'התוקף השתנה למרות שהפעולה נדחתה');
    assertEqual(fake.events.filter(function (e) {
      return String(e.id).indexOf('admin:') === 0;
    }).length, 0, 'נרשם יומן לפעולה שנדחתה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('הארכה ללקוח שפג נספרת מהיום, לא מהתאריך שעבר', function () {
  /* הארכה של שבוע ללקוח שפג לפני חודש צריכה לתת שבוע מעכשיו */
  var fake = new Fake({
    companies: [{ id: 'co-x', name: 'ישן', plan: 'starter', status: 'expired',
      valid_until: daysAgo(30), created_at: daysAgo(200) }]
  });
  fake.install();
  return call(action, { action: 'extend-trial', id: 'co-x', days: 7,
    reason: 'מחזירים לקוח' }).then(function (res) {
    var until = new Date(res.payload.company.valid_until).getTime();
    var expected = Date.now() + 7 * 864e5;
    assert(Math.abs(until - expected) < 60000,
      'התוקף חושב מהתאריך שעבר: ' + res.payload.company.valid_until);
    assertEqual(res.payload.company.status, 'trial', 'הסטטוס לא הוחזר לפעיל');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('הארכה בלתי סבירה נדחית', function () {
  var fake = sampleWorld(); fake.install();
  return call(action, { action: 'extend-trial', id: 'co-2', days: 4000,
    reason: 'בטעות' }).then(function (res) {
    assertEqual(res.statusCode, 400, 'הארכה של 11 שנים התקבלה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('שינוי חבילה לא מוכרת נדחה', function () {
  var fake = sampleWorld(); fake.install();
  return call(action, { action: 'set-plan', id: 'co-1', plan: 'platinum',
    reason: 'ניסיון' }).then(function (res) {
    assertEqual(res.statusCode, 400, 'חבילה לא מוכרת התקבלה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

/* ===== מחיר מוסכם לרשת =====

   לחבילת הרשתות אין מחירון: המחיר נסגר בפגישה ומוזן כאן. בלי
   הפעולה הזו אי אפשר לחייב רשת בכלל, ולכן היא נבדקת כמו כל
   פעולה שמזיזה כסף – כולל מה שהיא מסרבת לעשות. */
test('מעבר לחבילת רשתות אפשרי מהמשרד האחורי', function () {
  var fake = sampleWorld(); fake.install();
  return call(action, { action: 'set-plan', id: 'co-1', plan: 'enterprise',
    reason: 'נסגרה עסקה עם רשת של 140 עובדים' }).then(function (res) {
    assertEqual(res.payload.company.plan, 'enterprise', 'החבילה לא השתנתה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('מחיר מוסכם נשמר ונרשם ביומן', function () {
  var fake = sampleWorld(); fake.install();
  return call(action, { action: 'set-price', id: 'co-1', price: 1450,
    reason: 'סוכם בפגישה מול הרשת' }).then(function (res) {
    assertEqual(res.payload.company.custom_price_monthly, 1450, 'המחיר לא נשמר');
    /* ביומן נרשמת גם הצורה: "1450" ו-"12" הם אותו שדה מספרי,
       ובלי הצורה אי אפשר לדעת מה סוכם בפגישה. */
    assertEqual(res.payload.detail.to.mode, 'flat', 'הצורה לא נרשמה');
    assertEqual(res.payload.detail.to.amount, 1450, 'המחיר החדש לא נרשם ביומן');
    assertEqual(res.payload.detail.from, null, 'המצב הקודם לא נרשם');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('תעריף לעובד נשמר, ומאפס את הסכום הקבוע', function () {
  var fake = sampleWorld(); fake.install();
  return call(action, { action: 'set-price', id: 'co-1', price: 1450,
    reason: 'סוכם בפגישה' }).then(function () {
    return call(action, { action: 'set-price', id: 'co-1', mode: 'per_employee',
      price: 12, reason: 'עברנו לתמחור לפי עובד' });
  }).then(function (res) {
    assertEqual(res.payload.company.custom_price_per_employee, 12, 'התעריף לא נשמר');
    /* שורה עם שתי הצורות היא שורה שאיש לא יידע לקרוא */
    assertEqual(res.payload.company.custom_price_monthly, null, 'הסכום הקבוע לא אופס');
    assertEqual(res.payload.detail.to.mode, 'per_employee', 'הצורה שנרשמה');
    assertEqual(res.payload.detail.from.mode, 'flat', 'הצורה הקודמת לא נרשמה');
    assertEqual(res.payload.detail.from.amount, 1450, 'הסכום הקודם לא נרשם');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('צורת תמחור שאינה מוכרת נדחית', function () {
  var fake = sampleWorld(); fake.install();
  return call(action, { action: 'set-price', id: 'co-1', mode: 'per-hour',
    price: 5, reason: 'ניסיון' }).then(function (res) {
    assertEqual(res.statusCode, 400, 'קוד תשובה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('מחיר ריק מבטל את המחיר המוסכם', function () {
  var fake = sampleWorld(); fake.install();
  return call(action, { action: 'set-price', id: 'co-1', price: 900, reason: 'סוכם' })
    .then(function () {
      return call(action, { action: 'set-price', id: 'co-1', price: '',
        reason: 'חוזר למחירון' });
    })
    .then(function (res) {
      assertEqual(res.payload.company.custom_price_monthly, null, 'המחיר לא בוטל');
      fake.restore();
    }, function (e) { fake.restore(); throw e; });
});

/* אפס אינו "חינם": הוא היה מייצר לקוח שנראה בדוחות כמשלם ואינו
   משלם. מי שרוצה לתת שימוש בלי תשלום מאריך תקופה. */
test('מחיר אפס או שלילי נדחה', function () {
  var fake = sampleWorld(); fake.install();
  return call(action, { action: 'set-price', id: 'co-1', price: 0, reason: 'חינם' })
    .then(function (res) {
      assertEqual(res.statusCode, 400, 'מחיר אפס התקבל');
      return call(action, { action: 'set-price', id: 'co-1', price: -50, reason: 'טעות' });
    })
    .then(function (res) {
      assertEqual(res.statusCode, 400, 'מחיר שלילי התקבל');
      fake.restore();
    }, function (e) { fake.restore(); throw e; });
});

/* ===== תעריף לעובד: מה שהמסכים מציגים =====

   תעריף לעובד אינו מספר שנשמר אלא מספר שמחושב כל חודש מחדש,
   ולכן כל מסך שמציג אותו חייב גם לספור. מסך שמציג את התעריף
   בלבד נראה כאילו הרשת משלמת 12 שקלים בחודש. */
function chainWorld() {
  var fake = sampleWorld();
  fake.companies.push({
    id: 'co-5', name: 'רשת הצפון', plan: 'enterprise', status: 'active',
    valid_until: daysAhead(25), billing_subscription_id: 'tok-5',
    cancel_at_period_end: false, created_at: daysAgo(300),
    custom_price_per_employee: 12
  });
  fake.users.push({ company_id: 'co-5', email: 'e@n.co.il', name: 'הדר',
    role: 'owner', active: true });
  fake.configs.push({
    company_id: 'co-5',
    config: {
      employees: [
        { id: 'e1', name: 'א' }, { id: 'e2', name: 'ב', active: true },
        { id: 'e3', name: 'ג', active: false }
      ]
    }
  });
  return fake;
}

test('כרטיס הלקוח מציג את התעריף ואת מספר העובדים שהוא מוכפל בו', function () {
  var fake = chainWorld(); fake.install();
  return call(company, { id: 'co-5' }).then(function (res) {
    var c = res.payload.company;
    assertEqual(c.customPricePerEmployee, 12, 'התעריף לא הוצג');
    /* שניים פעילים מתוך שלושה: מי שאין לו active נחשב פעיל,
       ומי שסומן כלא פעיל אינו נספר */
    assertEqual(c.pricedEmployees, 2, 'מספר העובדים הפעילים');
    assertEqual(c.planPrice, 24, 'המחיר החודשי לא חושב מהתעריף');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('רשימת הלקוחות מחשבת גם היא, ולא מציגה את התעריף כמחיר', function () {
  var fake = chainWorld(); fake.install();
  return call(companies, {}).then(function (res) {
    var row = res.payload.companies.filter(function (c) { return c.id === 'co-5'; })[0];
    assertEqual(row.planPrice, 24, 'המחיר ברשימה');
    assertEqual(row.customPricePerEmployee, 12, 'התעריף ברשימה');
    assertEqual(row.pricedEmployees, 2, 'מספר העובדים ברשימה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

/* ההגדרות של לקוח שאינו מתומחר לפי עובד אינן נקראות כלל.
   בסיס הנתונים הזה מחזיק את שמות כל העובדים של כל הלקוחות,
   וקריאה שלו כדי לחשב מספר שאיש אינו צריך היא בדיוק סוג
   הקריאה שאין סיבה שתתקיים. */
test('בלי לקוח שמתומחר לפי עובד – ההגדרות לא נקראות בכלל', function () {
  var fake = sampleWorld(); fake.install();
  return call(companies, {}).then(function (res) {
    var reads = fake.writes.filter(function (w) {
      return w.path === '/company_configs';
    });
    assertEqual(reads.length, 0, 'ההגדרות נקראו לחינם');
    assertEqual(res.payload.companies.length, 4, 'הרשימה');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

/* רשת שההגדרות שלה לא נקראו אינה רשת שאינה משלמת. ההבדל
   חשוב: 0 על המסך הוא טענה, ו-null הוא הודאה שאין מידע. */
test('רשת בלי הגדרות – מספר העובדים ריק ולא אפס', function () {
  var fake = chainWorld();
  fake.configs = [];
  fake.install();
  return call(company, { id: 'co-5' }).then(function (res) {
    assertEqual(res.payload.company.pricedEmployees, null, 'אפס הוצג במקום "לא ידוע"');
    assertEqual(res.payload.company.planPrice, null, 'הומצא מחיר');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('התחזית החודשית סופרת את הרשת לפי עובדיה', function () {
  var fake = chainWorld(); fake.install();
  return call(overview, {}).then(function (res) {
    var mrr = res.payload.money.recurring;
    /* co-1 (199) + co-5 (12×2). co-2 בניסיון, co-3 בפיגור,
       co-4 מסומנת לסיום – אף אחת מהן אינה בתחזית. */
    assertEqual(mrr.gross, 223, 'התחזית לא כוללת את הרשת');
    assertEqual(mrr.companies, 2, 'מספר המשלמים');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('מחיר מוסכם דורש סיבה, כמו כל פעולה', function () {
  var fake = sampleWorld(); fake.install();
  return call(action, { action: 'set-price', id: 'co-1', price: 1200, reason: '' })
    .then(function (res) {
      assertEqual(res.statusCode, 400, 'מחיר נקבע בלי סיבה');
      fake.restore();
    }, function (e) { fake.restore(); throw e; });
});

test('שינוי חבילה תקין עובד ונרשם', function () {
  var fake = sampleWorld(); fake.install();
  return call(action, { action: 'set-plan', id: 'co-1', plan: 'growth',
    reason: 'הלקוח גדל ל-20 עובדים' }).then(function (res) {
    assertEqual(res.payload.company.plan, 'growth', 'החבילה לא השתנתה');
    assertEqual(res.payload.detail.from, 'starter', 'המצב הקודם לא נרשם');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('לקוח אינו יכול לבצע פעולה', function () {
  var fake = sampleWorld();
  fake.sessions['customer-token'] = { id: 'u9', email: 'someone@customer.co.il' };
  fake.install();
  return call(action, { action: 'extend-trial', id: 'co-1', days: 365,
    reason: 'שנה חינם לעצמי' }, { token: 'customer-token' }).then(function (res) {
    assertEqual(res.statusCode, 403, 'לקוח ביצע פעולה במשרד האחורי');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

console.log('\n== קריאות שירות ==');

test('התור מציג את שם החברה, לא רק מזהה', function () {
  var fake = sampleWorld(); fake.install();
  return call(tickets, { action: 'list' }).then(function (res) {
    assertEqual(res.payload.tickets.length, 2, 'מספר הקריאות שגוי');
    var open = res.payload.tickets.filter(function (t) { return t.status === 'open'; })[0];
    assertEqual(open.companyName, 'קפה מרכז', 'שם החברה חסר');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('מענה נשמר ומשנה את המצב', function () {
  var fake = sampleWorld(); fake.install();
  return call(tickets, { action: 'reply', id: 't1', reply: 'תוקן בגרסה האחרונה' })
    .then(function (res) {
      assertEqual(res.payload.ticket.status, 'answered', 'המצב לא השתנה');
      assertEqual(res.payload.ticket.reply, 'תוקן בגרסה האחרונה', 'המענה לא נשמר');
      fake.restore();
    }, function (e) { fake.restore(); throw e; });
});

test('מענה ריק נדחה', function () {
  var fake = sampleWorld(); fake.install();
  return call(tickets, { action: 'reply', id: 't1', reply: '  ' }).then(function (res) {
    assertEqual(res.statusCode, 400, 'מענה ריק התקבל');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

console.log('\n== קופונים ==');

function couponWorld(extra) {
  return new Fake(Object.assign({
    companies: [{ id: 'co-1', name: 'קפה מרכז', plan: 'starter', status: 'trial' }],
    coupons: [
      { code: 'EXTRAMONTH', kind: 'days', value: 30, uses: 2, max_uses: null,
        active: true, note: 'קמפיין ספטמבר', created_at: daysAgo(3) }
    ],
    redemptions: [
      { company_id: 'co-1', code: 'EXTRAMONTH', kind: 'days', value: 30,
        created_at: daysAgo(1) }
    ]
  }, extra || {}));
}

test('הרשימה מראה כמה מומש ועל ידי מי', function () {
  var fake = couponWorld(); fake.install();
  return call(coupons, { action: 'list' }).then(function (res) {
    assertEqual(res.payload.coupons.length, 1, 'מספר הקופונים');
    assertEqual(res.payload.coupons[0].redeemed, 1, 'מספר המימושים לא חושב');
    assertEqual(res.payload.redemptions[0].companyName, 'קפה מרכז',
      'שם הלקוח לא צורף למימוש');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('יצירת קופון בשקלים', function () {
  var fake = couponWorld(); fake.install();
  return call(coupons, { action: 'create', code: ' fifty-off ', kind: 'amount',
    value: 50, note: 'הנחה לפיילוט' }).then(function (res) {
    assertEqual(res.statusCode || 200, 200, 'קוד תשובה');
    /* הקוד מנורמל בדרך פנימה: מה שנשמר הוא מה שהלקוח יקליד */
    assertEqual(fake.coupons[1].code, 'FIFTYOFF', 'הקוד לא נורמל');
    assertEqual(fake.coupons[1].kind, 'amount', 'הסוג לא נשמר');
    assertEqual(fake.coupons[1].value, 50, 'הערך לא נשמר');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

/* תאריך בלבד מגיע מהטופס. קופון שתקף "עד 31.12" אמור לעבוד גם
   ב-31.12 בערב, ולא לפוג בחצות שלפניו. */
test('תוקף נשמר עד סוף היום', function () {
  var fake = couponWorld(); fake.install();
  return call(coupons, { action: 'create', code: 'DEC', kind: 'percent',
    value: 20, validUntil: '2026-12-31' }).then(function () {
    assertEqual(fake.coupons[1].valid_until, '2026-12-31T23:59:59Z', 'התוקף שנשמר');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

test('הנחה מעל מאה אחוז נדחית', function () {
  var fake = couponWorld(); fake.install();
  return call(coupons, { action: 'create', code: 'TOOMUCH', kind: 'percent', value: 150 })
    .then(function (res) {
      assertEqual(res.statusCode, 400, 'קוד תשובה');
      assertEqual(fake.coupons.length, 1, 'נוצר קופון פסול');
      fake.restore();
    }, function (e) { fake.restore(); throw e; });
});

test('סוג שאינו מוכר נדחה', function () {
  var fake = couponWorld(); fake.install();
  return call(coupons, { action: 'create', code: 'WEIRD', kind: 'bonus', value: 5 })
    .then(function (res) {
      assertEqual(res.statusCode, 400, 'קוד תשובה');
      fake.restore();
    }, function (e) { fake.restore(); throw e; });
});

test('קוד שכבר קיים נדחה בהודעה ברורה', function () {
  var fake = couponWorld(); fake.install();
  return call(coupons, { action: 'create', code: 'EXTRAMONTH', kind: 'days', value: 30 })
    .then(function (res) {
      assertEqual(res.statusCode, 409, 'קוד תשובה');
      assert(/כבר קיים/.test(res.payload.message), 'ההודעה אינה מסבירה');
      fake.restore();
    }, function (e) { fake.restore(); throw e; });
});

/* כיבוי ולא מחיקה: קופון שנשלח בהודעה ללקוחות הוא הבטחה שיצאה
   החוצה, והיומן שמצביע עליו צריך להישאר שלם. */
test('כיבוי משאיר את הקופון ואת ההיסטוריה', function () {
  var fake = couponWorld(); fake.install();
  return call(coupons, { action: 'toggle', code: 'EXTRAMONTH', active: false })
    .then(function (res) {
      assertEqual(res.payload.ok, true, 'הכיבוי נכשל');
      assertEqual(fake.coupons[0].active, false, 'הקופון לא כובה');
      assertEqual(fake.coupons.length, 1, 'הקופון נמחק');
      assertEqual(fake.redemptions.length, 1, 'היומן נמחק');
      fake.restore();
    }, function (e) { fake.restore(); throw e; });
});

test('לקוח אינו רשאי לגעת בקופונים', function () {
  var fake = couponWorld();
  fake.sessions['customer-token'] = { id: 'u9', email: 'someone@customer.co.il' };
  fake.install();
  return call(coupons, { action: 'create', code: 'FREE', kind: 'percent', value: 100 },
    { token: 'customer-token' }).then(function (res) {
    assertEqual(res.statusCode, 403, 'קוד תשובה');
    assertEqual(fake.coupons.length, 1, 'נוצר קופון בידי לקוח');
    fake.restore();
  }, function (e) { fake.restore(); throw e; });
});

queue.then(function () {
  console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
  process.exit(failed ? 1 : 0);
});
