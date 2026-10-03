/* פיילוט ללא תשלום, סוכני מכירות ועמלות, וחשבון הדגמה במשרד האחורי.

   השרת כאן הוא בסיס נתונים בזיכרון שמכיר את המסננים ש-PostgREST
   מקבל (eq, in, not.is.null, like) ואת ה-API של Supabase Auth. כך
   הבדיקות עוברות על הקוד האמיתי של המשרד האחורי, כולל בניית
   השאילתות, ולא על העתק שלו.

   הרצה: node tests/admin-agents-tests.js */
'use strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.PLATFORM_OWNER_EMAILS = 'boss@setshifts.com';

var admin = require('../api/admin/index.js');
var Core = require('../api/admin/_agents-core.js');

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

/* ===== בסיס נתונים בזיכרון ===== */
var PK = {
  companies: ['id'], company_users: ['id'], billing_events: ['id'], sales_agents: ['id'],
  agent_commissions: ['company_id'], company_configs: ['company_id'],
  company_weeks: ['company_id', 'week_key']
};
var uid = 0;

function Db(seed) {
  var data = seed || {};
  var self = this;
  this.tables = {};
  Object.keys(PK).forEach(function (name) { self.tables[name] = (data[name] || []).slice(); });
  this.authEmails = (data.authEmails || []).slice();
  this.authCalls = [];
  this.sessions = { 'owner-token': { id: 'u1', email: 'boss@setshifts.com' },
    'customer-token': { id: 'u2', email: 'customer@cafe.co.il' } };
}

function rowMatches(row, key, value) {
  var cell = row[key];
  if (value.indexOf('eq.') === 0) return String(cell) === value.slice(3);
  if (value.indexOf('in.(') === 0) return value.slice(4, -1).split(',').indexOf(String(cell)) !== -1;
  if (value === 'not.is.null') return cell !== null && cell !== undefined;
  if (value.indexOf('like.') === 0) return String(cell || '').indexOf(value.slice(5).replace('*', '')) === 0;
  return true;
}

Db.prototype.filter = function (rows, params) {
  var skip = { select: 1, order: 1, limit: 1 };
  var out = rows;
  params.forEach(function (value, key) {
    if (skip[key]) return;
    out = out.filter(function (row) { return rowMatches(row, key, value); });
  });
  return out;
};

Db.prototype.install = function () {
  var self = this;
  this.original = globalThis.fetch;
  globalThis.fetch = function (url, options) {
    var opts = options || {};
    var parsed = new URL(url);
    var body = opts.body ? JSON.parse(opts.body) : null;
    var method = opts.method || 'GET';
    var prefer = (opts.headers && opts.headers.Prefer) || '';

    function reply(status, payload) {
      return Promise.resolve({
        ok: status >= 200 && status < 300, status: status,
        json: function () { return Promise.resolve(payload); },
        text: function () { return Promise.resolve(payload === undefined ? '' : JSON.stringify(payload)); }
      });
    }

    if (parsed.host === 'api.resend.com') {
      self.mails = self.mails || [];
      self.mails.push(JSON.parse(opts.body));
      return reply(200, { id: 'mail-1' });
    }

    if (parsed.pathname === '/auth/v1/user') {
      var token = ((opts.headers && opts.headers.Authorization) || '').replace('Bearer ', '');
      return self.sessions[token] ? reply(200, self.sessions[token]) : reply(401, { message: 'bad token' });
    }

    if (parsed.pathname === '/auth/v1/admin/generate_link') {
      self.authCalls.push({ method: method, path: parsed.pathname, body: body });
      if (!body || body.type !== 'magiclink') return reply(400, { msg: 'bad type' });
      return reply(200, { action_link: 'https://x/verify?token=secret-link', hashed_token: 'hash-for-' + body.email });
    }

    if (parsed.pathname.indexOf('/auth/v1/admin/users') === 0) {
      self.authCalls.push({ method: method, path: parsed.pathname, body: body });
      if (method === 'POST') {
        if (self.authEmails.indexOf(body.email) !== -1) return reply(422, { msg: 'already registered' });
        self.authEmails.push(body.email);
        return reply(200, { id: 'auth-' + (++uid), email: body.email });
      }
      return reply(200, {});
    }

    var table = parsed.pathname.replace('/rest/v1/', '');
    if (!self.tables[table]) return reply(404, { message: 'no route: ' + table });
    var rows = self.tables[table];
    var keys = PK[table];

    if (method === 'GET') {
      return reply(200, self.filter(rows, parsed.searchParams).map(function (row) { return Object.assign({}, row); }));
    }
    if (method === 'POST') {
      var inserted = [];
      for (var i = 0; i < body.length; i++) {
        var row = Object.assign({}, body[i]);
        if (table === 'companies' || table === 'sales_agents') row.id = row.id || 'id-' + (++uid);
        if (table === 'sales_agents') {
          row = Object.assign({ active: true, created_at: new Date().toISOString() }, row);
          if (rows.some(function (r) { return r.code === row.code; })) return reply(409, { code: '23505' });
        }
        if (table === 'companies') {
          row = Object.assign({ source: 'direct', free_access: false, is_demo: false,
            created_at: new Date().toISOString() }, row);
        }
        if (table === 'agent_commissions') row = Object.assign({ status: 'pending' }, row);
        var existing = rows.filter(function (r) {
          return keys.every(function (k) { return r[k] === row[k]; });
        })[0];
        if (existing) {
          if (prefer.indexOf('ignore-duplicates') !== -1) continue;
          if (prefer.indexOf('merge-duplicates') !== -1) { Object.assign(existing, row); inserted.push(existing); continue; }
          return reply(409, { code: '23505' });
        }
        rows.push(row);
        inserted.push(row);
      }
      return prefer.indexOf('return=minimal') !== -1 ? reply(201, undefined) : reply(201, inserted);
    }
    if (method === 'PATCH') {
      var targets = self.filter(rows, parsed.searchParams);
      targets.forEach(function (row) { Object.assign(row, body); });
      return prefer.indexOf('return=minimal') !== -1 ? reply(204, undefined) : reply(200, targets);
    }
    if (method === 'DELETE') {
      var doomed = self.filter(rows, parsed.searchParams);
      self.tables[table] = rows.filter(function (row) { return doomed.indexOf(row) === -1; });
      return reply(204, undefined);
    }
    return reply(405, {});
  };
};

Db.prototype.restore = function () { globalThis.fetch = this.original; };

function call(payload, options) {
  var opts = options || {};
  var req = {
    method: 'POST',
    headers: { authorization: 'Bearer ' + (opts.token || 'owner-token') },
    body: JSON.stringify(payload)
  };
  var res = {
    statusCode: 0, payload: null,
    setHeader: function () {},
    end: function (text) { this.payload = text ? JSON.parse(text) : null; }
  };
  return Promise.resolve(admin(req, res)).then(function () { return res; });
}

function withDb(seed, fn) {
  var db = new Db(seed);
  db.install();
  return Promise.resolve().then(function () { return fn(db); }).then(
    function (value) { db.restore(); return value; },
    function (err) { db.restore(); throw err; });
}

function charge(companyId, amount, whenDaysAgo, outcome) {
  var at = daysAgo(whenDaysAgo);
  return { id: 'ch-' + (++uid), provider: 'payplus', company_id: companyId, type: 'charge',
    received_at: at, payload: { outcome: outcome || 'charged', amount: amount, at: at } };
}

function agent(overrides) {
  return Object.assign({ id: 'ag-1', name: 'דנה סוכנת', code: 'dana', commission: 300,
    qualify_charges: 3, active: true, created_at: daysAgo(100) }, overrides || {});
}

function customer(overrides) {
  return Object.assign({ id: 'co-1', name: 'קפה אחד', plan: 'starter', status: 'active',
    created_at: daysAgo(120), valid_until: daysAhead(10), free_access: false, is_demo: false,
    source: 'agent', agent_id: 'ag-1', cancel_at_period_end: false }, overrides || {});
}

/* ═══════════════ חישובים טהורים ═══════════════ */
console.log('\n== מתי לקוח הגיע ליעד ==');

test('נספרים רק חיובים שעברו וגבו סכום', function () {
  var events = [charge('c', 199, 90), charge('c', 199, 60, 'declined'),
    charge('c', 0, 50), charge('c', 199, 30), charge('c', 199, 1)];
  var paid = Core.paidCharges(events);
  assertEqual(paid.length, 3, 'מספר החיובים שנספרו');
  assert(Core.qualifiedAt(paid, 3), 'שלושה חיובים אמורים להגיע ליעד');
  assertEqual(Core.qualifiedAt(paid.slice(0, 2), 3), null, 'שני חיובים אינם יעד');
});

test('התאריך הוא של החיוב השלישי, לפי הסדר הכרונולוגי', function () {
  var events = [charge('c', 199, 1), charge('c', 199, 90), charge('c', 199, 30)];
  var paid = Core.paidCharges(events);
  assertEqual(Core.qualifiedAt(paid, 3), paid[2].at, 'השלישי הוא האחרון בזמן');
  assertEqual(Core.monthOf('2026-10-15T10:00:00Z'), '2026-10', 'מפתח חודש');
  assertEqual(Core.nextMonth('2026-12'), '2027-01', 'חודש הבא בסוף שנה');
});

/* ═══════════════ שער ═══════════════ */
console.log('\n== שער ==');

test('לקוח אינו רשאי לנהל סוכנים או חשבון הדגמה', function () {
  return withDb({}, function () {
    return call({ op: 'agents', do: 'list' }, { token: 'customer-token' }).then(function (res) {
      assertEqual(res.statusCode, 403, 'סוכנים');
      return call({ op: 'demo', do: 'status' }, { token: 'customer-token' });
    }).then(function (res) { assertEqual(res.statusCode, 403, 'הדגמה'); });
  });
});

/* ═══════════════ הגדרת סוכן ═══════════════ */
console.log('\n== הגדרת סוכן ==');

test('סוכן חדש נוצר עם קוד, ועם 3 חיובים כברירת מחדל', function () {
  return withDb({}, function (db) {
    return call({ op: 'agents', do: 'save', name: 'Dana Levi', commission: 250 }).then(function (res) {
      assertEqual(res.statusCode, 200, 'שמירה');
      var saved = db.tables.sales_agents[0];
      assert(/^[a-z0-9][a-z0-9_-]{1,38}$/.test(saved.code), 'קוד לא תקין: ' + saved.code);
      assertEqual(saved.qualify_charges, 3, 'ברירת מחדל');
      assertEqual(saved.commission, 250, 'עמלה');
      assert(db.tables.billing_events.some(function (e) { return e.type === 'admin.agent-save'; }), 'לא נרשם ביומן');
    });
  });
});

test('שם בעברית מקבל קוד לטיני שאפשר לשים בקישור', function () {
  return withDb({}, function (db) {
    return call({ op: 'agents', do: 'save', name: 'דנה כהן', commission: 100 }).then(function () {
      assert(/^agent-[a-z0-9]+$/.test(db.tables.sales_agents[0].code), db.tables.sales_agents[0].code);
    });
  });
});

test('עמלה לא תקינה, שם חסר וקוד שגוי נדחים', function () {
  return withDb({}, function () {
    return call({ op: 'agents', do: 'save', name: 'א', commission: -5 }).then(function (res) {
      assertEqual(res.statusCode, 400, 'עמלה שלילית');
      return call({ op: 'agents', do: 'save', name: '', commission: 10 });
    }).then(function (res) {
      assertEqual(res.statusCode, 400, 'בלי שם');
      return call({ op: 'agents', do: 'save', name: 'ב', commission: 10, code: 'Bad Code!' });
    }).then(function (res) { assertEqual(res.statusCode, 400, 'קוד שגוי'); });
  });
});

test('קוד שכבר קיים נדחה בהודעה ברורה', function () {
  return withDb({ sales_agents: [agent()] }, function () {
    return call({ op: 'agents', do: 'save', name: 'עוד אחד', commission: 10, code: 'dana' }).then(function (res) {
      assertEqual(res.statusCode, 409, 'כפילות');
      assert(/already used/.test(res.payload.message), res.payload.message);
    });
  });
});

test('עדכון סוכן אינו משנה את הקוד, כי הקישור כבר נשלח', function () {
  return withDb({ sales_agents: [agent()] }, function (db) {
    return call({ op: 'agents', do: 'save', id: 'ag-1', name: 'דנה', commission: 400, code: 'other' }).then(function (res) {
      assertEqual(res.statusCode, 200, 'עדכון');
      assertEqual(db.tables.sales_agents[0].code, 'dana', 'הקוד השתנה');
      assertEqual(db.tables.sales_agents[0].commission, 400, 'העמלה לא עודכנה');
    });
  });
});

/* ═══════════════ עמלות ═══════════════ */
console.log('\n== עמלות ודוח חודשי ==');

function seedThree() {
  return {
    sales_agents: [agent()],
    companies: [customer()],
    billing_events: [charge('co-1', 199, 70), charge('co-1', 199, 40), charge('co-1', 199, 5)]
  };
}

test('לקוח שהגיע ליעד מופיע בדוח של החודש שבו שילם בפעם השלישית', function () {
  return withDb(seedThree(), function (db) {
    var month = new Date(db.tables.billing_events[2].payload.at).toISOString().slice(0, 7);
    return call({ op: 'agents', do: 'report', month: month }).then(function (res) {
      assertEqual(res.statusCode, 200, 'דוח');
      assertEqual(res.payload.lines.length, 1, 'שורות');
      assertEqual(res.payload.lines[0].company, 'קפה אחד', 'שם הלקוח');
      assertEqual(res.payload.lines[0].amount, 300, 'עמלה');
      assertEqual(res.payload.byAgent[0].pending, 300, 'סכום ממתין לסוכן');
      assertEqual(res.payload.totals.amount, 300, 'סך הכול');
    });
  });
});

test('העמלה נשמרת ברגע היווצרותה ואינה משתנה כשמשנים את הסוכן', function () {
  return withDb(seedThree(), function (db) {
    return call({ op: 'agents', do: 'report' }).then(function () {
      assertEqual(db.tables.agent_commissions.length, 1, 'שורת עמלה');
      db.tables.sales_agents[0].commission = 999;
      return call({ op: 'agents', do: 'report' });
    }).then(function () {
      assertEqual(db.tables.agent_commissions.length, 1, 'שורה כפולה');
      assertEqual(db.tables.agent_commissions[0].amount, 300, 'ההיסטוריה שוכתבה');
    });
  });
});

test('לקוח עם שני חיובים אינו בדוח, אבל מופיע ב"יגיעו בקרוב"', function () {
  var seed = seedThree();
  seed.billing_events = seed.billing_events.slice(0, 2);
  return withDb(seed, function () {
    return call({ op: 'agents', do: 'report' }).then(function (res) {
      assertEqual(res.payload.lines.length, 0, 'שורות');
      assertEqual(res.payload.upcoming.length, 1, 'חסר לו חיוב אחד');
      assertEqual(res.payload.upcoming[0].amount, 300, 'העמלה הצפויה');
    });
  });
});

test('חיוב שנדחה אינו נספר', function () {
  var seed = seedThree();
  seed.billing_events[2] = charge('co-1', 199, 5, 'declined');
  return withDb(seed, function (db) {
    return call({ op: 'agents', do: 'report' }).then(function (res) {
      assertEqual(res.payload.lines.length, 0, 'נספר חיוב שנדחה');
      assertEqual(db.tables.agent_commissions.length, 0, 'נוצרה עמלה');
    });
  });
});

test('פיילוט ללא תשלום וחשבון הדגמה אינם מקבלים עמלה', function () {
  var seed = seedThree();
  seed.companies = [customer({ free_access: true }), customer({ id: 'co-2', is_demo: true })];
  seed.billing_events = seed.billing_events.concat([charge('co-2', 199, 70), charge('co-2', 199, 40), charge('co-2', 199, 5)]);
  return withDb(seed, function (db) {
    return call({ op: 'agents', do: 'report' }).then(function () {
      assertEqual(db.tables.agent_commissions.length, 0, 'נוצרה עמלה');
    });
  });
});

test('לקוח שהגיע ליעד בחודש קודם ועדיין לא שולם עולה כ"ממתין מחודשים קודמים"', function () {
  var seed = seedThree();
  seed.billing_events = [charge('co-1', 199, 200), charge('co-1', 199, 170), charge('co-1', 199, 140)];
  return withDb(seed, function () {
    return call({ op: 'agents', do: 'report' }).then(function (res) {
      assertEqual(res.payload.lines.length, 0, 'לא שייך לחודש הנוכחי');
      assertEqual(res.payload.older.length, 1, 'ממתין מחודשים קודמים');
      assertEqual(res.payload.totals.olderPending, 300, 'סכום');
    });
  });
});

test('סימון תשלום משנה מצב, נרשם ביומן, וניתן לבטל', function () {
  return withDb(seedThree(), function (db) {
    return call({ op: 'agents', do: 'report' }).then(function () {
      return call({ op: 'agents', do: 'pay', companyIds: ['co-1'], paid: true });
    }).then(function (res) {
      assertEqual(res.payload.updated, 1, 'עודכנו');
      assertEqual(db.tables.agent_commissions[0].status, 'paid', 'מצב');
      assert(db.tables.agent_commissions[0].paid_at, 'חסר תאריך תשלום');
      assert(db.tables.billing_events.some(function (e) { return e.type === 'admin.agent-pay'; }), 'לא נרשם ביומן');
      return call({ op: 'agents', do: 'pay', companyIds: ['co-1'], paid: false });
    }).then(function () {
      assertEqual(db.tables.agent_commissions[0].status, 'pending', 'ביטול תשלום');
    });
  });
});

test('רשימת הסוכנים מסכמת לקוחות, יעדים, חוב ושולם', function () {
  return withDb(seedThree(), function () {
    return call({ op: 'agents', do: 'report' }).then(function () {
      return call({ op: 'agents', do: 'list' });
    }).then(function (res) {
      var row = res.payload.agents[0];
      assertEqual(row.customers, 1, 'לקוחות');
      assertEqual(row.qualified, 1, 'הגיעו ליעד');
      assertEqual(row.owed, 300, 'חוב');
      assertEqual(row.paidOut, 0, 'שולם');
    });
  });
});

test('לקוחות של סוכן: כמה חיובים שילמו ומתי הגיעו ליעד', function () {
  return withDb(seedThree(), function () {
    return call({ op: 'agents', do: 'customers', agentId: 'ag-1' }).then(function (res) {
      var row = res.payload.customers[0];
      assertEqual(row.paidCharges, 3, 'חיובים');
      assert(row.qualifiedAt, 'חסר תאריך יעד');
      assertEqual(row.commission.amount, 300, 'עמלה');
    });
  });
});

test('חודש לא תקין נדחה', function () {
  return withDb({}, function () {
    return call({ op: 'agents', do: 'report', month: '2026-13' }).then(function (res) {
      assertEqual(res.statusCode, 400, 'חודש');
    });
  });
});

/* ═══════════════ מקור הלקוח ═══════════════ */
console.log('\n== שיוך לקוח לסוכן ==');

test('שיוך ידני לסוכן נרשם ביומן וקובע את המקור', function () {
  return withDb({ sales_agents: [agent()], companies: [customer({ source: 'direct', agent_id: null })] }, function (db) {
    return call({ op: 'action', action: 'set-agent', id: 'co-1', agentId: 'ag-1', reason: 'הביא אותו בטלפון' }).then(function (res) {
      assertEqual(res.statusCode, 200, 'שיוך');
      assertEqual(db.tables.companies[0].source, 'agent', 'מקור');
      assertEqual(db.tables.companies[0].agent_id, 'ag-1', 'סוכן');
      assertEqual(db.tables.companies[0].referral_code, 'dana', 'קוד');
      assert(db.tables.billing_events.some(function (e) { return e.type === 'admin.set-agent'; }), 'יומן');
    });
  });
});

test('החזרה ל"האתר" מנקה את הסוכן', function () {
  return withDb({ sales_agents: [agent()], companies: [customer()] }, function (db) {
    return call({ op: 'action', action: 'set-agent', id: 'co-1', agentId: '', reason: 'שויך בטעות' }).then(function (res) {
      assertEqual(res.statusCode, 200, 'שיוך');
      assertEqual(db.tables.companies[0].source, 'direct', 'מקור');
      assertEqual(db.tables.companies[0].agent_id, null, 'סוכן');
    });
  });
});

test('סוכן שאינו קיים נדחה', function () {
  return withDb({ companies: [customer()] }, function () {
    return call({ op: 'action', action: 'set-agent', id: 'co-1', agentId: 'nope', reason: 'בדיקה' }).then(function (res) {
      assertEqual(res.statusCode, 404, 'סוכן לא קיים');
    });
  });
});

test('העברת לקוח לסוכן אחר מוחקת עמלה שלא שולמה, וחוסמת עמלה ששולמה', function () {
  var seed = seedThree();
  seed.sales_agents.push(agent({ id: 'ag-2', code: 'moshe', name: 'משה' }));
  return withDb(seed, function (db) {
    return call({ op: 'agents', do: 'report' }).then(function () {
      assertEqual(db.tables.agent_commissions.length, 1, 'עמלה');
      return call({ op: 'action', action: 'set-agent', id: 'co-1', agentId: 'ag-2', reason: 'התברר שזה משה' });
    }).then(function (res) {
      assertEqual(res.statusCode, 200, 'העברה');
      assertEqual(db.tables.agent_commissions.length, 0, 'עמלה שלא שולמה אמורה להימחק');
      return call({ op: 'agents', do: 'report' });
    }).then(function () {
      assertEqual(db.tables.agent_commissions[0].agent_id, 'ag-2', 'העמלה לא חושבה מחדש לסוכן החדש');
      return call({ op: 'agents', do: 'pay', companyIds: ['co-1'], paid: true });
    }).then(function () {
      return call({ op: 'action', action: 'set-agent', id: 'co-1', agentId: 'ag-1', reason: 'עוד פעם' });
    }).then(function (res) {
      assertEqual(res.statusCode, 409, 'עמלה ששולמה אינה זזה');
    });
  });
});

test('רשימת הלקוחות מסננת לפי מקור ומראה שם סוכן', function () {
  var seed = {
    sales_agents: [agent()],
    companies: [customer(), customer({ id: 'co-2', name: 'ישיר', source: 'direct', agent_id: null }),
      customer({ id: 'co-3', name: 'פיילוט', source: 'direct', agent_id: null, free_access: true }),
      customer({ id: 'co-4', name: 'הדגמה', source: 'direct', agent_id: null, is_demo: true })]
  };
  return withDb(seed, function () {
    return call({ op: 'companies', source: 'agent' }).then(function (res) {
      assertEqual(res.payload.companies.length, 1, 'סוכנים');
      assertEqual(res.payload.companies[0].agentName, 'דנה סוכנת', 'שם הסוכן');
      return call({ op: 'companies', source: 'direct' });
    }).then(function (res) {
      assertEqual(res.payload.companies.length, 2, 'ישיר, בלי הדגמה');
      return call({ op: 'companies', source: 'free' });
    }).then(function (res) {
      assertEqual(res.payload.companies.length, 1, 'פיילוט');
      return call({ op: 'companies', source: 'demo' });
    }).then(function (res) {
      assertEqual(res.payload.companies[0].isDemo, true, 'הדגמה');
    });
  });
});

test('כרטיס הלקוח מראה את הסוכן, ואת ההתקדמות שלו ליעד', function () {
  return withDb(seedThree(), function () {
    return call({ op: 'company', id: 'co-1' }).then(function (res) {
      var c = res.payload.company;
      assertEqual(c.source, 'agent', 'מקור');
      assertEqual(c.agent.name, 'דנה סוכנת', 'סוכן');
      assertEqual(c.agent.paidCharges, 3, 'חיובים');
      assertEqual(c.agent.qualifyCharges, 3, 'יעד');
    });
  });
});

/* ═══════════════ פיילוט ללא תשלום ═══════════════ */
console.log('\n== פיילוט ללא תשלום ==');

test('הדלקת פיילוט בלי תאריך: פעיל, ללא תשלום, בלי תפוגה', function () {
  return withDb({ companies: [customer({ source: 'direct', agent_id: null, status: 'trial', valid_until: daysAhead(3) })] }, function (db) {
    return call({ op: 'action', action: 'set-free', id: 'co-1', on: true, reason: 'פיילוט עם קפה ברזילי' }).then(function (res) {
      assertEqual(res.statusCode, 200, 'הדלקה');
      var row = db.tables.companies[0];
      assertEqual(row.free_access, true, 'דגל');
      assertEqual(row.status, 'active', 'מצב');
      assert(new Date(row.valid_until).getFullYear() >= 2099, 'התוקף אמור להיות רחוק');
      assertEqual(row.free_until, null, 'בלי תאריך סיום');
      assert(db.tables.billing_events.some(function (e) { return e.type === 'admin.set-free'; }), 'יומן');
    });
  });
});

test('פיילוט עם תאריך סיום: התוקף הוא התאריך', function () {
  return withDb({ companies: [customer({ source: 'direct', agent_id: null })] }, function (db) {
    var until = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
    return call({ op: 'action', action: 'set-free', id: 'co-1', on: true, until: until, reason: 'חודש וחצי' }).then(function (res) {
      assertEqual(res.statusCode, 200, 'הדלקה');
      assertEqual(db.tables.companies[0].free_until.slice(0, 10), until, 'תאריך סיום');
      assertEqual(db.tables.companies[0].valid_until.slice(0, 10), until, 'תוקף');
    });
  });
});

test('תאריך בעבר או לא תקין נדחה, וגם בלי סיבה', function () {
  return withDb({ companies: [customer()] }, function () {
    return call({ op: 'action', action: 'set-free', id: 'co-1', on: true, until: '2020-01-01', reason: 'בדיקה' }).then(function (res) {
      assertEqual(res.statusCode, 400, 'עבר');
      return call({ op: 'action', action: 'set-free', id: 'co-1', on: true, until: 'מחר', reason: 'בדיקה' });
    }).then(function (res) {
      assertEqual(res.statusCode, 400, 'לא תקין');
      return call({ op: 'action', action: 'set-free', id: 'co-1', on: true, reason: '' });
    }).then(function (res) { assertEqual(res.statusCode, 400, 'בלי סיבה'); });
  });
});

test('כיבוי פיילוט מחזיר ללקוח רגיל עם ימי ניסיון שנקבעו', function () {
  return withDb({ companies: [customer({ free_access: true, status: 'active', valid_until: '2099-12-31T00:00:00.000Z',
    billing_subscription_id: null })] }, function (db) {
    return call({ op: 'action', action: 'set-free', id: 'co-1', on: false, days: 14, reason: 'הפיילוט הסתיים' }).then(function (res) {
      assertEqual(res.statusCode, 200, 'כיבוי');
      var row = db.tables.companies[0];
      assertEqual(row.free_access, false, 'דגל');
      assertEqual(row.status, 'trial', 'בלי כרטיס חוזר לניסיון');
      var days = Math.round((new Date(row.valid_until) - Date.now()) / 864e5);
      assert(days >= 13 && days <= 14, 'ימים: ' + days);
    });
  });
});

test('פיילוט אינו נספר בהכנסה החוזרת, והדגמה אינה נספרת בלוח', function () {
  var seed = { companies: [
    customer({ id: 'paid', source: 'direct', agent_id: null }),
    customer({ id: 'pilot', source: 'direct', agent_id: null, free_access: true }),
    customer({ id: 'demo', source: 'direct', agent_id: null, is_demo: true, free_access: true })] };
  return withDb(seed, function () {
    return call({ op: 'overview' }).then(function (res) {
      assertEqual(res.payload.money.recurring.companies, 1, 'רק משלם אחד בתחזית');
      assertEqual(res.payload.counts.companies, 2, 'הדגמה אינה לקוח');
      assertEqual(res.payload.counts.free, 1, 'פיילוטים');
      assertEqual(res.payload.counts.demo, 1, 'הדגמה');
    });
  });
});

test('הלוח מפריד בין לקוחות מהאתר ללקוחות של סוכנים', function () {
  var seed = { companies: [customer(), customer({ id: 'co-2', source: 'direct', agent_id: null }),
    customer({ id: 'co-3', source: 'direct', agent_id: null })] };
  return withDb(seed, function () {
    return call({ op: 'overview' }).then(function (res) {
      assertEqual(res.payload.counts.bySource.agent, 1, 'סוכנים');
      assertEqual(res.payload.counts.bySource.direct, 2, 'האתר');
    });
  });
});

/* ═══════════════ חשבון הדגמה ═══════════════ */
console.log('\n== חשבון הדגמה ==');

var DEMO_ENTER = { op: 'demo', do: 'enter' };

function demoWeeks(db) {
  return db.tables.company_weeks.slice().sort(function (a, b) { return a.week_key < b.week_key ? -1 : 1; });
}

test('לפני הכניסה הראשונה, הסטטוס אומר שאין חשבון הדגמה', function () {
  return withDb({}, function () {
    return call({ op: 'demo', do: 'status' }).then(function (res) {
      assertEqual(res.payload.exists, false, 'קיים');
    });
  });
});

test('כניסה ראשונה: חברת הדגמה פעילה וללא תשלום, משתמש פנימי בלי מייל אמיתי, וקישור חד־פעמי', function () {
  return withDb({}, function (db) {
    return call(DEMO_ENTER).then(function (res) {
      assertEqual(res.statusCode, 200, JSON.stringify(res.payload));
      var company = db.tables.companies[0];
      assertEqual(company.is_demo, true, 'הדגמה');
      assertEqual(company.free_access, true, 'ללא תשלום');
      assertEqual(company.status, 'active', 'פעילה');
      assertEqual(db.tables.company_users.length, 1, 'משתמש אחד');
      assertEqual(db.tables.company_users[0].role, 'owner', 'בעלים');
      assertEqual(db.tables.company_users[0].email, 'demo.owner@setshifts.com', 'מייל פנימי');
      var created = db.authCalls.filter(function (c) { return c.method === 'POST' && c.path === '/auth/v1/admin/users'; });
      assertEqual(created.length, 1, 'משתמש Auth');
      assert(String(created[0].body.password).length >= 24, 'סיסמה אקראית ארוכה');
      var link = db.authCalls.filter(function (c) { return c.path.indexOf('generate_link') !== -1; })[0];
      assertEqual(link.body.email, 'demo.owner@setshifts.com', 'האסימון לבעלים של ההדגמה');
      assert(/\/app\/\?support=hash-for-demo\.owner%40setshifts\.com&co=.+&demo=1$/.test(res.payload.url), res.payload.url);
      var log = db.tables.billing_events.filter(function (e) { return e.type === 'admin.demo-enter'; });
      assertEqual(log.length, 1, 'נרשם ביומן');
      assert(JSON.stringify(log[0]).indexOf('hash-for') === -1, 'האסימון נרשם ביומן');
    });
  });
});

test('הנתונים: 11 עובדים, 2 סניפים, 4 משמרות ביום, סידור מלא ושבוע הבא ריק', function () {
  return withDb({}, function (db) {
    return call(DEMO_ENTER).then(function () {
      var config = db.tables.company_configs[0].config;
      assertEqual(config.employees.length, 11, 'עובדים');
      assertEqual(db.tables.companies[0].plan, 'growth', 'תוכנית שמכילה 11 עובדים');
      assertEqual(config.branches.length, 2, 'סניפים');
      assertEqual(config.settings.shifts.length, 4, 'משמרות');
      assert(config.employees.every(function (e) { return !/עובד\/ת/.test(e.name); }), 'שמות גנריים');
      assert(config.employees.every(function (e) { return !e.email && !e.phone; }), 'לעובד בהדגמה יש מייל או טלפון');
      assertEqual(config.settings.onboardingDone, true, 'האשף אינו נפתח בהדגמה');
      assertEqual(config.settings.timeclock.enabled, true, 'שעון נוכחות דלוק');
      config.branches.forEach(function (branch) {
        assertEqual(Object.keys(branch.schedule[0]).length, 4, 'ארבע משמרות ביום חול ב' + branch.name);
      });
      var weeks = demoWeeks(db);
      assertEqual(weeks.length, 3, 'שלושה שבועות');
      assertEqual(weeks[0].published, true, 'שבוע קודם מפורסם');
      assertEqual(weeks[1].published, true, 'שבוע נוכחי מפורסם');
      assertEqual(weeks[2].published, false, 'שבוע הבא טיוטה');
      assertEqual(Object.keys(weeks[2].week.assignments).length, 0, 'שבוע הבא ריק, לבנייה מול הלקוח');
      assert(Object.keys(weeks[2].week.constraints).length >= 3, 'בקשות ממתינות לשבוע הבא');
      assert(weeks[0].week.punches.length > 20, 'דיווחי שעון לדוח השעות');
      var need = 0, got = 0;
      config.branches.forEach(function (branch) {
        Object.keys(branch.schedule).forEach(function (day) {
          Object.keys(branch.schedule[day]).forEach(function (shift) {
            var n = branch.schedule[day][shift].need;
            need += n;
            got += Math.min(n, (weeks[0].week.assignments[day + '|' + branch.id + '|' + shift] || []).length);
          });
        });
      });
      assertEqual(got, need, 'כל המשמרות בשבוע שפורסם מאוישות');
      assert(!('published' in weeks[0].week), 'published נשמר בעמודה ולא בתוך השבוע');
    });
  });
});

test('שבוע הבא מתמלא כולו בבנייה אוטומטית, גם עם בקשות החופש שממתינות', function () {
  var Demo = require('../api/admin/_demo.js');
  var Store = require('../js/store.js');
  var Scheduler = require('../js/scheduler.js');
  ['2026-10-03T12:00:00Z', '2026-10-08T10:00:00Z', '2026-12-25T05:00:00Z'].forEach(function (when) {
    var data = Demo.buildDemoData(new Date(when));
    var keys = Object.keys(data.weeks).sort();
    var state = Store.emptyState();
    state.settings = data.config.settings; state.branches = data.config.branches; state.employees = data.config.employees;
    state.weeks = {};
    keys.forEach(function (k) { state.weeks[k] = Object.assign(Store.emptyWeek(), data.weeks[k].week); });
    var week = state.weeks[keys[2]];
    var result = Scheduler.generate(state, week, { attempts: 120, seed: 5 });
    var need = 0, got = 0;
    state.branches.forEach(function (branch) {
      Object.keys(branch.schedule).forEach(function (day) {
        Object.keys(branch.schedule[day]).forEach(function (shift) {
          var n = branch.schedule[day][shift].need;
          need += n;
          got += Math.min(n, (result.assignments[day + '|' + branch.id + '|' + shift] || []).length);
        });
      });
    });
    assertEqual(got, need, 'משמרות חסרות בשבוע הבא (' + when + ')');
  });
});

test('כל כניסה מאפסת: מה ששונה בהדגמה נמחק, בלי חברה או משתמש כפולים', function () {
  return withDb({}, function (db) {
    return call(DEMO_ENTER).then(function () {
      db.tables.company_weeks.push({ company_id: db.tables.companies[0].id, week_key: '2030-01-06', week: {}, published: true });
      db.tables.company_configs[0].config.employees.push({ id: 'extra', name: 'נוסף' });
      db.tables.companies[0].status = 'canceled';
      return call(DEMO_ENTER);
    }).then(function (res) {
      assertEqual(res.statusCode, 200, JSON.stringify(res.payload));
      assertEqual(res.payload.created, false, 'לא נוצר מחדש');
      assertEqual(db.tables.companies.length, 1, 'חברה כפולה');
      assertEqual(db.tables.companies[0].status, 'active', 'החברה חזרה להיות פעילה');
      assertEqual(db.tables.company_users.length, 1, 'משתמשים כפולים');
      assertEqual(db.authCalls.filter(function (c) { return c.method === 'POST' && c.path === '/auth/v1/admin/users'; }).length, 1,
        'משתמש Auth נוצר פעמיים');
      assertEqual(db.authCalls.filter(function (c) { return c.path.indexOf('generate_link') !== -1; }).length, 2,
        'אסימון חדש בכל כניסה');
      assertEqual(db.tables.company_weeks.length, 3, 'שבועות שנוספו בהדגמה נמחקו');
      assertEqual(db.tables.company_configs[0].config.employees.length, 11, 'העובדים חזרו למצב ההתחלה');
    });
  });
});

test('הדגמה ישנה עם בעלים קיים: נכנסים כבעלים הזה, ואין משתמש פנימי חדש', function () {
  var seed = {
    companies: [{ id: 'demo-co', name: 'קפה לדוגמה', is_demo: true, free_access: true, status: 'active',
      created_at: daysAgo(30) }],
    company_users: [{ id: 'old-owner', company_id: 'demo-co', email: 'me@example.com', role: 'owner',
      active: true, created_at: daysAgo(30) }]
  };
  return withDb(seed, function (db) {
    return call(DEMO_ENTER).then(function (res) {
      assertEqual(res.statusCode, 200, JSON.stringify(res.payload));
      var link = db.authCalls.filter(function (c) { return c.path.indexOf('generate_link') !== -1; })[0];
      assertEqual(link.body.email, 'me@example.com', 'נכנסים כבעלים הקיים');
      assertEqual(db.authCalls.filter(function (c) { return c.method === 'POST' && c.path === '/auth/v1/admin/users'; }).length, 0,
        'נוצר משתמש מיותר');
      assertEqual(db.tables.companies[0].name, 'עסק לדוגמה', 'שם העסק עודכן');
    });
  });
});

test('אחרי כניסה הסטטוס מראה מתי נכתבו הנתונים', function () {
  return withDb({}, function () {
    return call(DEMO_ENTER).then(function () { return call({ op: 'demo', do: 'status' }); }).then(function (res) {
      assertEqual(res.payload.exists, true, 'קיים');
      assert(res.payload.resetAt, 'מתי אופס');
    });
  });
});

test('הפעולה הישנה עם מיילים וסיסמה אינה קיימת יותר', function () {
  return withDb({}, function (db) {
    return call({ op: 'demo', do: 'build', password: 'demo-pass-123',
      managerEmail: 'a@b.co', employeeEmail: 'c@d.co' }).then(function (res) {
      assertEqual(res.statusCode, 400, 'build');
      assertEqual(db.tables.companies.length, 0, 'נוצרה חברה');
    });
  });
});

/* ===== החלפת כרטיס ללקוח מהמשרד האחורי ===== */
var providers = require('../api/billing/_providers.js');

function withStubProvider(live, fn) {
  var seen = [];
  providers.stub = {
    live: function () { return live; },
    createCheckout: function (input) {
      seen.push(input);
      return Promise.resolve({ url: 'https://pay.example/page/abc' });
    }
  };
  process.env.BILLING_PROVIDER = 'stub';
  process.env.RESEND_API_KEY = 'k';
  process.env.MAIL_FROM = 'SetShifts <no-reply@setshifts.com>';
  function undo() {
    delete providers.stub; delete process.env.BILLING_PROVIDER;
    delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM;
  }
  return Promise.resolve().then(function () { return fn(seen); }).then(
    function (v) { undo(); return v; }, function (e) { undo(); throw e; });
}

var CARD_SEED = {
  companies: [customer({ id: 'co-1', name: 'קפה חסום', status: 'expired', billing_subscription_id: 'tok-old' })],
  company_users: [{ id: 'u-own', company_id: 'co-1', email: 'owner@cafe.co.il', name: 'בעלים',
    role: 'owner', active: true, created_at: daysAgo(100) }]
};

test('קישור להחלפת כרטיס נוצר בעמוד שמירה בלבד ונשלח במייל לבעלים', function () {
  return withDb(CARD_SEED, function (db) {
    return withStubProvider(true, function (seen) {
      return call({ op: 'card', id: 'co-1', reason: 'הכרטיס פג תוקף', send: true }).then(function (res) {
        assertEqual(res.statusCode, 200, JSON.stringify(res.payload));
        assertEqual(res.payload.url, 'https://pay.example/page/abc', 'הקישור לא חזר');
        assertEqual(res.payload.emailed, true, 'המייל לא נשלח');
        assertEqual(seen[0].saveCardOnly, true, 'עמוד החלפה חייב לשמור בלבד, בלי חיוב');
        assertEqual(seen[0].companyId, 'co-1', 'מזהה החברה לא נשלח לספק');
        assert(seen[0].expiryMinutes >= 1440, 'הקישור קצר מדי למשלוח במייל');
        assertEqual(db.mails.length, 1, 'מספר מיילים');
        assertEqual(db.mails[0].to[0], 'owner@cafe.co.il', 'נשלח לכתובת אחרת');
        assert(db.mails[0].text.indexOf('https://pay.example/page/abc') !== -1, 'הקישור אינו במייל');
      });
    });
  });
});

test('בלי סימון שליחה הקישור חוזר למסך ולא נשלח', function () {
  return withDb(CARD_SEED, function (db) {
    return withStubProvider(true, function () {
      return call({ op: 'card', id: 'co-1', reason: 'מוסר בטלפון', send: false }).then(function (res) {
        assertEqual(res.payload.emailed, false, 'נשלח בלי בקשה');
        assert(!db.mails || db.mails.length === 0, 'נשלח מייל');
      });
    });
  });
});

test('הקישור עצמו אינו נרשם ביומן, אבל נרשם מי יצר אותו ולמה', function () {
  return withDb(CARD_SEED, function (db) {
    return withStubProvider(true, function () {
      return call({ op: 'card', id: 'co-1', reason: 'הכרטיס פג תוקף', send: true }).then(function () {
        var entry = db.tables.billing_events.filter(function (e) { return e.type === 'admin.card-link'; })[0];
        assert(entry, 'אין שורת יומן');
        assertEqual(entry.payload.by, 'boss@setshifts.com', 'מי');
        assertEqual(entry.payload.reason, 'הכרטיס פג תוקף', 'למה');
        assert(JSON.stringify(entry).indexOf('pay.example') === -1, 'הקישור נשמר ביומן');
      });
    });
  });
});

test('בלי סיבה, או בלי סליקה חיה, או לא בעל מוצר: נדחה', function () {
  return withDb(CARD_SEED, function () {
    return withStubProvider(true, function () {
      return call({ op: 'card', id: 'co-1', reason: '', send: true }).then(function (res) {
        assertEqual(res.statusCode, 400, 'בלי סיבה');
        return call({ op: 'card', id: 'co-1', reason: 'בדיקה' }, { token: 'customer-token' });
      }).then(function (res) {
        assertEqual(res.statusCode, 403, 'לקוח רגיל קיבל קישור');
      });
    }).then(function () {
      return withStubProvider(false, function () {
        return call({ op: 'card', id: 'co-1', reason: 'בדיקה' }).then(function (res) {
          assertEqual(res.statusCode, 501, 'סליקה לא חיה');
        });
      });
    });
  });
});

test('חברה בלי בעלים פעיל לא מקבלת קישור', function () {
  return withDb({ companies: CARD_SEED.companies, company_users: [] }, function () {
    return withStubProvider(true, function () {
      return call({ op: 'card', id: 'co-1', reason: 'בדיקה' }).then(function (res) {
        assertEqual(res.statusCode, 409, 'נשלח בלי בעלים');
      });
    });
  });
});

test('כשהמייל לא מוגדר הקישור עדיין חוזר, עם הסיבה', function () {
  return withDb(CARD_SEED, function () {
    return withStubProvider(true, function () {
      delete process.env.RESEND_API_KEY;
      return call({ op: 'card', id: 'co-1', reason: 'בדיקה', send: true }).then(function (res) {
        assertEqual(res.statusCode, 200, 'נכשל כולו');
        assertEqual(res.payload.emailed, false, 'דווח כנשלח');
        assertEqual(res.payload.emailError, 'not_configured', 'סיבה');
        assert(res.payload.url, 'אין קישור למסירה ידנית');
      });
    });
  });
});

/* ===== הקמת לקוח ללא כרטיס מהמשרד האחורי ===== */
var NEW_CUSTOMER = { op: 'customer', reason: 'פיילוט עם בית קפה', companyName: 'קפה הפיילוט',
  ownerName: 'דנה', email: 'Dana@Pilot.co.il', phone: '054-1234567', plan: 'starter' };

test('לקוח פיילוט נוצר פעיל, ללא תשלום, עם בעלים ועם הגדרות ריקות', function () {
  return withDb({}, function (db) {
    return call(NEW_CUSTOMER).then(function (res) {
      assertEqual(res.statusCode, 200, JSON.stringify(res.payload));
      var company = db.tables.companies[0];
      assertEqual(company.free_access, true, 'לא ללא תשלום');
      assertEqual(company.status, 'active', 'לא פעיל');
      assert(company.valid_until.indexOf('2099') === 0, 'יש תאריך סיום');
      assertEqual(company.source, 'direct', 'מקור');
      var owner = db.tables.company_users[0];
      assertEqual(owner.role, 'owner', 'תפקיד');
      assertEqual(owner.email, 'dana@pilot.co.il', 'המייל לא נורמל');
      assertEqual(owner.company_id, company.id, 'שיוך');
      assertEqual(db.tables.company_configs.length, 1, 'אין שורת הגדרות');
      assert(res.payload.password && res.payload.password.length >= 12, 'לא נוצרה סיסמה');
      assertEqual(db.authCalls.filter(function (c) { return c.method === 'POST'; }).length, 1, 'משתמש');
    });
  });
});

test('אפשר לקבוע תאריך סיום, חבילה ושיוך לסוכן מהרגע הראשון', function () {
  return withDb({ sales_agents: [agent()] }, function (db) {
    return call(Object.assign({}, NEW_CUSTOMER, { until: '2099-01-31', plan: 'growth', agentId: 'ag-1' }))
      .then(function (res) {
        assertEqual(res.statusCode, 200, JSON.stringify(res.payload));
        var company = db.tables.companies[0];
        assertEqual(company.plan, 'growth', 'חבילה');
        assert(company.free_until.indexOf('2099-01-31') === 0, 'פיילוט עד');
        assertEqual(company.source, 'agent', 'מקור');
        assertEqual(company.agent_id, 'ag-1', 'סוכן');
      });
  });
});

test('לקוח פיילוט אינו מזכה בעמלה', function () {
  return withDb({ sales_agents: [agent()] }, function () {
    return call(Object.assign({}, NEW_CUSTOMER, { agentId: 'ag-1' })).then(function () {
      return call({ op: 'agents', do: 'report' });
    }).then(function (res) {
      assertEqual(res.payload.lines.length, 0, 'עמלה על פיילוט');
    });
  });
});

test('הקמת לקוח: בלי סיבה, בלי טלפון, מייל פגום, חבילה לא מוכרת, או לא בעל מוצר - נדחה', function () {
  return withDb({}, function (db) {
    return call(Object.assign({}, NEW_CUSTOMER, { reason: '' })).then(function (res) {
      assertEqual(res.statusCode, 400, 'בלי סיבה');
      return call(Object.assign({}, NEW_CUSTOMER, { phone: '12' }));
    }).then(function (res) {
      assertEqual(res.statusCode, 400, 'טלפון');
      return call(Object.assign({}, NEW_CUSTOMER, { email: 'nope' }));
    }).then(function (res) {
      assertEqual(res.statusCode, 400, 'מייל');
      return call(Object.assign({}, NEW_CUSTOMER, { plan: 'gold' }));
    }).then(function (res) {
      assertEqual(res.statusCode, 400, 'חבילה');
      return call(NEW_CUSTOMER, { token: 'customer-token' });
    }).then(function (res) {
      assertEqual(res.statusCode, 403, 'לקוח רגיל הקים לקוח');
      assertEqual(db.tables.companies.length, 0, 'נוצרה חברה');
      assertEqual(db.authCalls.length, 0, 'נוצר משתמש');
    });
  });
});

test('מייל שכבר רשום נדחה ולא נוצרת חברה יתומה', function () {
  return withDb({ authEmails: ['dana@pilot.co.il'] }, function (db) {
    return call(NEW_CUSTOMER).then(function (res) {
      assertEqual(res.statusCode, 409, 'כתובת תפוסה');
      assertEqual(db.tables.companies.length, 0, 'נוצרה חברה');
    });
  });
});

test('הסיסמה נשלחת במייל רק כשביקשו, והיא אינה נרשמת ביומן', function () {
  process.env.RESEND_API_KEY = 'k';
  process.env.MAIL_FROM = 'SetShifts <no-reply@setshifts.com>';
  return withDb({}, function (db) {
    return call(Object.assign({}, NEW_CUSTOMER, { send: true })).then(function (res) {
      assertEqual(res.payload.emailed, true, 'לא נשלח');
      assertEqual(db.mails[0].to[0], 'dana@pilot.co.il', 'נמען');
      assert(db.mails[0].text.indexOf(res.payload.password) !== -1, 'הסיסמה אינה במייל');
      var logged = JSON.stringify(db.tables.billing_events);
      assert(logged.indexOf(res.payload.password) === -1, 'הסיסמה נשמרה ביומן');
      assert(db.tables.billing_events.some(function (e) { return e.type === 'admin.create-customer'; }), 'אין יומן');
    });
  }).then(function () {
    delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM;
  });
});

/* ===== כניסת תמיכה ===== */
var SUPPORT_SEED = {
  companies: [customer({ id: 'co-1', name: 'קפה לתמיכה', status: 'expired' })],
  company_users: [
    { id: 'u-emp', company_id: 'co-1', email: 'emp@cafe.co.il', role: 'employee', active: true, created_at: daysAgo(90) },
    { id: 'u-own', company_id: 'co-1', email: 'owner@cafe.co.il', role: 'owner', active: true, created_at: daysAgo(100) }
  ]
};

test('כניסת תמיכה מחזירה כתובת עם אסימון חד־פעמי לבעלים, גם לחשבון חסום', function () {
  process.env.PUBLIC_BASE_URL = 'https://setshifts.com';
  return withDb(SUPPORT_SEED, function (db) {
    return call({ op: 'support', id: 'co-1', reason: 'טיפול בקריאה: הסידור לא נשמר' }).then(function (res) {
      assertEqual(res.statusCode, 200, JSON.stringify(res.payload));
      assertEqual(res.payload.as, 'owner@cafe.co.il', 'לא נכנס כבעלים');
      assert(res.payload.url.indexOf('https://setshifts.com/app/?support=hash-for-owner%40cafe.co.il') === 0, res.payload.url);
      assert(res.payload.url.indexOf('co=') !== -1, 'שם הלקוח לפס');
      var link = db.authCalls.filter(function (c) { return c.path.indexOf('generate_link') !== -1; })[0];
      assertEqual(link.body.email, 'owner@cafe.co.il', 'פנה למשתמש אחר');
    });
  });
});

test('כל כניסה נרשמת ביומן עם מי, למה ולאיזה משתמש, בלי האסימון', function () {
  return withDb(SUPPORT_SEED, function (db) {
    return call({ op: 'support', id: 'co-1', reason: 'בדיקת תקלה' }).then(function () {
      var entry = db.tables.billing_events.filter(function (e) { return e.type === 'admin.support-access'; })[0];
      assert(entry, 'אין שורת יומן');
      assertEqual(entry.payload.by, 'boss@setshifts.com', 'מי');
      assertEqual(entry.payload.reason, 'בדיקת תקלה', 'למה');
      assertEqual(entry.payload.detail.as, 'owner@cafe.co.il', 'כמי');
      assert(JSON.stringify(entry).indexOf('hash-for') === -1, 'האסימון נשמר ביומן');
    });
  });
});

test('כניסת תמיכה: בלי סיבה, לקוח רגיל, חברה לא קיימת, או חברה בלי בעלים/מנהל - נדחה', function () {
  return withDb(SUPPORT_SEED, function (db) {
    return call({ op: 'support', id: 'co-1', reason: '' }).then(function (res) {
      assertEqual(res.statusCode, 400, 'בלי סיבה');
      return call({ op: 'support', id: 'co-1', reason: 'בדיקה' }, { token: 'customer-token' });
    }).then(function (res) {
      assertEqual(res.statusCode, 403, 'לקוח רגיל קיבל כניסה');
      return call({ op: 'support', id: 'nope', reason: 'בדיקה' });
    }).then(function (res) {
      assertEqual(res.statusCode, 404, 'חברה לא קיימת');
      assertEqual(db.authCalls.filter(function (c) { return c.path.indexOf('generate_link') !== -1; }).length, 0,
        'נוצר אסימון בבקשה שנדחתה');
    });
  }).then(function () {
    return withDb({ companies: SUPPORT_SEED.companies, company_users: [SUPPORT_SEED.company_users[0]] }, function () {
      return call({ op: 'support', id: 'co-1', reason: 'בדיקה' }).then(function (res) {
        assertEqual(res.statusCode, 409, 'נכנס כעובד');
      });
    });
  });
});

test('בלי בעלים נכנסים כמנהל', function () {
  return withDb({ companies: SUPPORT_SEED.companies, company_users: [
    { id: 'u-mgr', company_id: 'co-1', email: 'mgr@cafe.co.il', role: 'manager', active: true, created_at: daysAgo(10) }
  ] }, function () {
    return call({ op: 'support', id: 'co-1', reason: 'בדיקה' }).then(function (res) {
      assertEqual(res.payload.as, 'mgr@cafe.co.il', 'מנהל');
      assertEqual(res.payload.role, 'manager', 'תפקיד');
    });
  });
});

queue.then(function () {
  console.log('\n' + (failed === 0 ? '✅ ' : '❌ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
  process.exit(failed === 0 ? 0 : 1);
});
