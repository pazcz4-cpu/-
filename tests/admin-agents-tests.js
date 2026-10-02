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

    if (parsed.pathname === '/auth/v1/user') {
      var token = ((opts.headers && opts.headers.Authorization) || '').replace('Bearer ', '');
      return self.sessions[token] ? reply(200, self.sessions[token]) : reply(401, { message: 'bad token' });
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

var DEMO_FORM = { op: 'demo', do: 'build', password: 'demo-pass-123',
  managerEmail: 'demo@setshifts.com', employeeEmail: 'demo.employee@setshifts.com' };

test('לפני שנוצר, הסטטוס אומר שאין חשבון הדגמה', function () {
  return withDb({}, function () {
    return call({ op: 'demo', do: 'status' }).then(function (res) {
      assertEqual(res.payload.exists, false, 'קיים');
    });
  });
});

test('יצירה: חברה מסומנת הדגמה, פעילה וללא תשלום, עם שני משתמשים', function () {
  return withDb({}, function (db) {
    return call(DEMO_FORM).then(function (res) {
      assertEqual(res.statusCode, 200, JSON.stringify(res.payload));
      var company = db.tables.companies[0];
      assertEqual(company.is_demo, true, 'הדגמה');
      assertEqual(company.free_access, true, 'ללא תשלום');
      assertEqual(company.status, 'active', 'פעילה');
      assertEqual(db.tables.company_users.length, 2, 'משתמשים');
      var roles = db.tables.company_users.map(function (u) { return u.role; }).sort().join(',');
      assertEqual(roles, 'employee,owner', 'תפקידים');
      var employee = db.tables.company_users.filter(function (u) { return u.role === 'employee'; })[0];
      assertEqual(employee.employee_id, 'emp-1', 'העובד קשור לכרטיס');
      assert(employee.joined_at, 'העובד אמור להופיע כמי שהצטרף');
      assertEqual(db.authCalls.filter(function (c) { return c.method === 'POST'; }).length, 2, 'משתמשי Auth');
      assertEqual(db.authCalls[0].body.password, 'demo-pass-123', 'הסיסמה נקבעת ב-Auth');
    });
  });
});

test('הנתונים: עובדים בשמות, שני שבועות שפורסמו ושבוע הבא כטיוטה', function () {
  return withDb({}, function (db) {
    return call(DEMO_FORM).then(function () {
      var config = db.tables.company_configs[0].config;
      assertEqual(config.employees.length, 8, 'עובדים');
      assert(config.employees.every(function (e) { return !/עובד\/ת/.test(e.name); }), 'שמות גנריים');
      assertEqual(config.settings.onboardingDone, true, 'האשף אינו נפתח בהדגמה');
      var weeks = db.tables.company_weeks.slice().sort(function (a, b) { return a.week_key < b.week_key ? -1 : 1; });
      assertEqual(weeks.length, 3, 'שלושה שבועות');
      assertEqual(weeks[0].published, true, 'שבוע קודם מפורסם');
      assertEqual(weeks[1].published, true, 'שבוע נוכחי מפורסם');
      assertEqual(weeks[2].published, false, 'שבוע הבא טיוטה');
      assertEqual(Object.keys(weeks[2].week.assignments).length, 0, 'שבוע הבא ריק, לבנייה מול הלקוח');
      assert(Object.keys(weeks[2].week.constraints).length >= 3, 'בקשות ממתינות לשבוע הבא');
      assert(weeks[0].week.punches.length > 20, 'דיווחי שעון לדוח השעות');
      assert(Object.keys(weeks[0].week.assignments).length > 20, 'סידור מלא');
      assert(!('published' in weeks[0].week), 'published נשמר בעמודה ולא בתוך השבוע');
    });
  });
});

test('איפוס: אותה חברה, אותם משתמשים, נתונים חדשים בלי כפילות', function () {
  return withDb({}, function (db) {
    return call(DEMO_FORM).then(function () {
      db.tables.company_weeks.push({ company_id: db.tables.companies[0].id, week_key: '2030-01-06', week: {}, published: true });
      db.tables.company_configs[0].config.employees.push({ id: 'extra', name: 'נוסף' });
      return call(DEMO_FORM);
    }).then(function (res) {
      assertEqual(res.payload.created, false, 'לא נוצר מחדש');
      assertEqual(db.tables.companies.length, 1, 'חברה כפולה');
      assertEqual(db.tables.company_users.length, 2, 'משתמשים כפולים');
      assertEqual(db.tables.company_weeks.length, 3, 'שבועות שנוספו בהדגמה נמחקו');
      assertEqual(db.tables.company_configs[0].config.employees.length, 8, 'העובדים חזרו למצב ההתחלה');
      assertEqual(db.authCalls.filter(function (c) { return c.method === 'PUT'; }).length, 2, 'הסיסמאות נקבעו מחדש');
    });
  });
});

test('סיסמה חלשה או מייל לא תקין נדחים לפני שנוגעים בשרת', function () {
  return withDb({}, function (db) {
    return call(Object.assign({}, DEMO_FORM, { password: 'short' })).then(function (res) {
      assertEqual(res.statusCode, 400, 'סיסמה קצרה');
      return call(Object.assign({}, DEMO_FORM, { managerEmail: 'לא-מייל' }));
    }).then(function (res) {
      assertEqual(res.statusCode, 400, 'מייל');
      return call(Object.assign({}, DEMO_FORM, { employeeEmail: DEMO_FORM.managerEmail }));
    }).then(function (res) {
      assertEqual(res.statusCode, 400, 'אותו מייל לשניים');
      assertEqual(db.tables.companies.length, 0, 'נוצרה חברה');
      assertEqual(db.authCalls.length, 0, 'נוצר משתמש');
    });
  });
});

test('כתובת שכבר שייכת לחשבון אחר נדחית ואינה נדרסת', function () {
  return withDb({ authEmails: ['demo@setshifts.com'] }, function (db) {
    return call(DEMO_FORM).then(function (res) {
      assertEqual(res.statusCode, 409, 'כתובת תפוסה');
      assert(/Choose another/.test(res.payload.message), res.payload.message);
      assertEqual(db.authCalls.filter(function (c) { return c.method === 'PUT'; }).length, 0, 'סיסמה של חשבון זר שונתה');
    });
  });
});

test('אחרי היצירה הסטטוס מראה את החברה ואת שני המשתמשים', function () {
  return withDb({}, function () {
    return call(DEMO_FORM).then(function () { return call({ op: 'demo', do: 'status' }); }).then(function (res) {
      assertEqual(res.payload.exists, true, 'קיים');
      assertEqual(res.payload.users.length, 2, 'משתמשים');
      assert(res.payload.resetAt, 'מתי אופס');
    });
  });
});

queue.then(function () {
  console.log('\n' + (failed === 0 ? '✅ ' : '❌ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
  process.exit(failed === 0 ? 0 : 1);
});
