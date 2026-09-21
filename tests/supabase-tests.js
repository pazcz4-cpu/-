/* בדיקות למתאם Supabase.
   אי אפשר לפנות לשרת אמיתי מכאן, ולכן במקומו רץ שרת מדומה שמחקה
   את ממשק ה-HTTP של Supabase: /auth/v1, /rest/v1 ו-rpc. כך נבדק
   מה המתאם באמת שולח, איך הוא ממפה את התשובות, ומה קורה בשגיאה.

   הרצה: node tests/supabase-tests.js */
'use strict';

var I18n = require('../js/i18n/core.js');
I18n.use('he');

var Model = require('../js/backend/model.js');
var Supabase = require('../js/backend/supabase.js');

var passed = 0, failed = 0;
function test(name, fn) {
  try {
    var result = fn();
    if (result && typeof result.then === 'function') { return result; }
    passed++; console.log('  ✓ ' + name);
  } catch (err) {
    failed++; console.log('  ✗ ' + name + '\n      ' + err.message);
  }
}
/* גרסה אסינכרונית – כל הבדיקות כאן מחזירות Promise */
function asyncTest(name, fn) {
  return Promise.resolve().then(fn).then(function () {
    passed++; console.log('  ✓ ' + name);
  }, function (err) {
    failed++; console.log('  ✗ ' + name + '\n      ' + (err && err.message));
  });
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'ערכים שונים') + ': התקבל ' + JSON.stringify(actual) +
      ', ציפינו ל-' + JSON.stringify(expected));
  }
}

/* ===== שרת Supabase מדומה ===== */
function base64url(value) {
  return Buffer.from(value, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function makeToken(userId) {
  return 'x.' + base64url(JSON.stringify({ sub: userId })) + '.y';
}

function FakeSupabase() {
  this.users = {};         // id -> { id, email, password }
  this.companies = {};
  this.companyUsers = {};  // id -> row
  this.configs = {};
  this.weeks = {};         // companyId|weekKey -> row
  this.calls = [];         // תיעוד כל הבקשות, לבדיקות
  this.nextId = 1;
  this.failNext = null;
}

FakeSupabase.prototype.id = function (prefix) {
  return prefix + '-' + (this.nextId++);
};

FakeSupabase.prototype._userFromAuth = function (headers) {
  var auth = headers.Authorization || '';
  var token = auth.replace('Bearer ', '');
  var parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    var payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    return this.companyUsers[payload.sub] ? payload.sub : payload.sub;
  } catch (err) { return null; }
};

/* מפרק מחרוזת סינון של PostgREST: field=eq.value */
function filters(query) {
  var out = {};
  (query || '').split('&').forEach(function (pair) {
    var index = pair.indexOf('=');
    if (index === -1) return;
    var key = decodeURIComponent(pair.slice(0, index));
    var value = pair.slice(index + 1);
    if (value.indexOf('eq.') === 0) out[key] = decodeURIComponent(value.slice(3));
    else if (value.indexOf('neq.') === 0) out['!' + key] = decodeURIComponent(value.slice(4));
  });
  return out;
}

FakeSupabase.prototype.fetch = function (url, options) {
  var self = this;
  var opts = options || {};
  /* נתיב יחסי = נקודת קצה של השרת שלנו (Vercel), ולא של Supabase */
  var parsed = new URL(url, 'https://app.example.com');
  var path = parsed.pathname;
  var query = parsed.search.slice(1);
  var body = opts.body ? JSON.parse(opts.body) : null;
  var headers = opts.headers || {};

  this.calls.push({ method: opts.method || 'GET', path: path, query: query, body: body });

  function reply(status, payload) {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status: status,
      text: function () { return Promise.resolve(payload === undefined ? '' : JSON.stringify(payload)); }
    });
  }

  if (this.failNext) {
    var failure = this.failNext;
    this.failNext = null;
    return reply(failure.status, failure.body);
  }

  /* השרת שלנו. serverRoutes מאפשר לבדיקה להחליט מה הוא מחזיר;
     בלעדיו התשובה היא 404, בדיוק כמו נקודת קצה שלא נפרסה. */
  if (path.indexOf('/api/') === 0) {
    var route = this.serverRoutes && this.serverRoutes[path];
    if (!route) return reply(404, { message: 'not found' });
    return reply(route.status || 200, route.body);
  }

  /* ---- התחברות ---- */
  if (path === '/auth/v1/signup') {
    var exists = Object.keys(this.users).some(function (id) {
      return self.users[id].email === body.email;
    });
    if (exists) return reply(422, { msg: 'User already registered' });
    var newId = this.id('user');
    this.users[newId] = { id: newId, email: body.email, password: body.password };
    return reply(200, {
      access_token: makeToken(newId), refresh_token: 'r-' + newId, expires_in: 3600
    });
  }

  if (path === '/auth/v1/token') {
    if (parsed.searchParams.get('grant_type') === 'refresh_token') {
      var owner = Object.keys(this.users).find(function (id) {
        return 'r-' + id === body.refresh_token;
      });
      if (!owner) return reply(401, { message: 'invalid refresh token' });
      return reply(200, { access_token: makeToken(owner), refresh_token: 'r-' + owner, expires_in: 3600 });
    }
    var match = Object.keys(this.users).find(function (id) {
      return self.users[id].email === body.email && self.users[id].password === body.password;
    });
    if (!match) return reply(400, { error_description: 'Invalid login credentials' });
    return reply(200, { access_token: makeToken(match), refresh_token: 'r-' + match, expires_in: 3600 });
  }

  if (path === '/auth/v1/logout') return reply(204);

  /* ---- פונקציות ---- */
  if (path === '/rest/v1/rpc/create_company') {
    var caller = this._userFromAuth(headers);
    var companyId = this.id('co');
    this.companies[companyId] = {
      id: companyId, name: body.p_name, plan: 'starter', status: 'trial',
      valid_until: new Date(Date.now() + body.p_trial_days * 864e5).toISOString(),
      created_at: new Date().toISOString()
    };
    this.companyUsers[caller] = {
      id: caller, company_id: companyId, email: this.users[caller].email,
      name: body.p_user_name || this.users[caller].email,
      role: 'owner', employee_id: null, active: true, created_at: new Date().toISOString()
    };
    this.configs[companyId] = { company_id: companyId, config: {}, updated_at: new Date().toISOString() };
    return reply(200, this.companies[companyId]);
  }

  if (path === '/rest/v1/rpc/decide_constraint') {
    var actor = this.companyUsers[this._userFromAuth(headers)];
    if (!actor || ['owner', 'manager'].indexOf(actor.role) === -1) {
      return reply(403, { message: 'not allowed' });
    }
    var rowKey = actor.company_id + '|' + body.p_week_key;
    var row = this.weeks[rowKey];
    var constraintKey = body.p_employee_id + '|' + body.p_day_idx;
    if (!row || !row.week.constraints || !row.week.constraints[constraintKey]) {
      return reply(400, { message: 'request not found' });
    }
    row.week.constraints[constraintKey].status = body.p_decision;
    row.week.constraints[constraintKey].managerNote = body.p_note || '';
    row.updated_at = new Date().toISOString();
    return reply(200, row);
  }

  if (path === '/rest/v1/rpc/save_own_constraint') {
    var employee = this.companyUsers[this._userFromAuth(headers)];
    if (!employee || !employee.employee_id) {
      return reply(400, { message: 'user is not linked to a staff card' });
    }
    var key = employee.company_id + '|' + body.p_week_key;
    if (!this.weeks[key]) {
      this.weeks[key] = {
        company_id: employee.company_id, week_key: body.p_week_key,
        week: { constraints: {}, assignments: {} }, published: false,
        updated_at: new Date().toISOString()
      };
    }
    var target = this.weeks[key];
    if (target.published && employee.role === 'employee') {
      return reply(400, { message: 'week already published' });
    }
    var slot = employee.employee_id + '|' + body.p_day_idx;
    if (body.p_constraint === null) { delete target.week.constraints[slot]; }
    else {
      target.week.constraints[slot] = Object.assign({}, body.p_constraint, {
        status: 'pending', managerNote: ''
      });
    }
    target.updated_at = new Date().toISOString();
    return reply(200, target);
  }

  /* ---- טבלאות ---- */
  var table = path.replace('/rest/v1/', '');
  var where = filters(query);
  var method = opts.method || 'GET';

  if (table === 'companies') {
    if (method === 'GET') {
      return reply(200, Object.keys(this.companies)
        .map(function (id) { return self.companies[id]; })
        .filter(function (row) { return !where.id || row.id === where.id; }));
    }
    if (method === 'PATCH') {
      var company = this.companies[where.id];
      if (!company) return reply(200, []);
      Object.assign(company, body);
      return reply(200, [company]);
    }
  }

  if (table === 'company_users') {
    if (method === 'GET') {
      return reply(200, Object.keys(this.companyUsers)
        .map(function (id) { return self.companyUsers[id]; })
        .filter(function (row) {
          if (where.id && row.id !== where.id) return false;
          if (where.company_id && row.company_id !== where.company_id) return false;
          return true;
        }));
    }
    if (method === 'PATCH') {
      var user = this.companyUsers[where.id];
      if (!user) return reply(200, []);
      if (where['!role'] && user.role === where['!role']) return reply(200, []);
      Object.assign(user, body);
      return reply(200, [user]);
    }
  }

  if (table === 'company_configs') {
    if (method === 'GET') {
      var config = this.configs[where.company_id];
      return reply(200, config ? [config] : []);
    }
    if (method === 'POST') {
      var incoming = body[0];
      this.configs[incoming.company_id] = incoming;
      return reply(200, [incoming]);
    }
  }

  if (table === 'company_weeks') {
    if (method === 'GET') {
      return reply(200, Object.keys(this.weeks)
        .map(function (id) { return self.weeks[id]; })
        .filter(function (row) {
          if (where.company_id && row.company_id !== where.company_id) return false;
          if (where.week_key && row.week_key !== where.week_key) return false;
          return true;
        }));
    }
    if (method === 'POST') {
      var incomingWeek = body[0];
      this.weeks[incomingWeek.company_id + '|' + incomingWeek.week_key] = incomingWeek;
      return reply(200, [incomingWeek]);
    }
    if (method === 'PATCH') {
      var found = this.weeks[where.company_id + '|' + where.week_key];
      if (!found) return reply(200, []);
      Object.assign(found, body);
      return reply(200, [found]);
    }
  }

  return reply(404, { message: 'no route: ' + method + ' ' + path });
}

/* ===== תשתית לבדיקות ===== */
function memoryStorage() {
  var data = {};
  return {
    getItem: function (k) { return k in data ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; }
  };
}

function makeBackend(server, storage) {
  return new Supabase.SupabaseBackend({
    url: 'https://example.supabase.co',
    anonKey: 'anon-key',
    storage: storage || memoryStorage(),
    fetch: function (url, options) { return server.fetch(url, options); }
  });
}

/* atob נדרש לפענוח האסימון; ב-Node הוא לא תמיד גלובלי */
if (typeof globalThis.atob !== 'function') {
  globalThis.atob = function (value) { return Buffer.from(value, 'base64').toString('binary'); };
}

var chain = Promise.resolve();
function run(name, fn) { chain = chain.then(function () { return asyncTest(name, fn); }); }

console.log('\n== הרשמה והתחברות ==');

run('הרשמת חברה יוצרת בעלים עם תקופת ניסיון', function () {
  var server = new FakeSupabase();
  var backend = makeBackend(server);
  return backend.signUpCompany({
    email: 'Boss@Test.CO.il', password: 'secret123', name: 'דנה', companyName: 'רשת הבדיקה'
  }).then(function (session) {
    assertEqual(session.user.role, 'owner', 'מי שנרשם אינו בעלים');
    assertEqual(session.user.email, 'boss@test.co.il', 'האימייל לא עבר נרמול');
    assertEqual(session.company.name, 'רשת הבדיקה', 'שם החברה לא נשמר');
    assertEqual(session.company.status, 'trial', 'החברה לא נפתחה בתקופת ניסיון');
    assert(session.access.allowed, 'אין גישה בתקופת ניסיון');
    var rpc = server.calls.filter(function (c) { return c.path.indexOf('rpc/create_company') !== -1; });
    assertEqual(rpc.length, 1, 'create_company לא נקרא בדיוק פעם אחת');
    assertEqual(rpc[0].body.p_trial_days, Model.TRIAL_DAYS, 'מספר ימי הניסיון אינו לפי המודל');
  });
});

run('סיסמה קצרה נדחית לפני פנייה לשרת', function () {
  var server = new FakeSupabase();
  var backend = makeBackend(server);
  return backend.signUpCompany({
    email: 'a@b.co', password: '123', companyName: 'X'
  }).then(function () { throw new Error('הסיסמה הקצרה התקבלה'); }, function (err) {
    assertEqual(err.code, 'weak_password', 'קוד שגיאה לא נכון');
    assertEqual(server.calls.length, 0, 'נשלחה בקשה לשרת למרות שהקלט פסול');
  });
});

run('הרשמה בלי שם חברה נדחית', function () {
  var backend = makeBackend(new FakeSupabase());
  return backend.signUpCompany({ email: 'a@b.co', password: 'secret123', companyName: '  ' })
    .then(function () { throw new Error('התקבלה חברה בלי שם'); }, function (err) {
      assertEqual(err.code, 'invalid_input', 'קוד שגיאה לא נכון');
    });
});

run('אימייל תפוס מוחזר כהודעה מתורגמת', function () {
  var server = new FakeSupabase();
  return makeBackend(server).signUpCompany({
    email: 'a@b.co', password: 'secret123', companyName: 'X'
  }).then(function () {
    return makeBackend(server).signUpCompany({
      email: 'a@b.co', password: 'secret123', companyName: 'Y'
    });
  }).then(function () { throw new Error('אותו אימייל נרשם פעמיים'); }, function (err) {
    assertEqual(err.code, 'email_taken', 'קוד שגיאה לא נכון');
    assertEqual(err.message, I18n.t('server.emailTaken'), 'ההודעה אינה מתורגמת');
  });
});

run('סיסמה שגויה מחזירה הודעה מתורגמת', function () {
  var server = new FakeSupabase();
  return makeBackend(server).signUpCompany({
    email: 'a@b.co', password: 'secret123', companyName: 'X'
  }).then(function () {
    return makeBackend(server).signIn({ email: 'a@b.co', password: 'wrong' });
  }).then(function () { throw new Error('ההתחברות הצליחה עם סיסמה שגויה'); }, function (err) {
    assertEqual(err.code, 'bad_credentials', 'קוד שגיאה לא נכון');
    assertEqual(err.message, I18n.t('server.badCredentials'), 'ההודעה אינה מתורגמת');
  });
});

run('restore משחזר התחברות אחרי רענון העמוד', function () {
  var server = new FakeSupabase();
  var storage = memoryStorage();
  return makeBackend(server, storage).signUpCompany({
    email: 'a@b.co', password: 'secret123', name: 'דנה', companyName: 'X'
  }).then(function () {
    /* מכשיר חדש עם אותו אחסון = רענון העמוד */
    var fresh = makeBackend(server, storage);
    assertEqual(fresh.session(), null, 'היה מידע לפני restore');
    return fresh.restore().then(function (session) {
      assert(session, 'ההתחברות לא שוחזרה');
      assertEqual(session.user.email, 'a@b.co', 'שוחזר משתמש אחר');
      assert(fresh.session(), 'session() לא מחזיר את מה ש-restore טען');
    });
  });
});

run('יציאה מוחקת את האסימון גם אם השרת לא נענה', function () {
  var server = new FakeSupabase();
  var storage = memoryStorage();
  var backend = makeBackend(server, storage);
  return backend.signUpCompany({
    email: 'a@b.co', password: 'secret123', companyName: 'X'
  }).then(function () {
    server.fetch = function () { return Promise.reject(new Error('אין רשת')); };
    return backend.signOut();
  }).then(function () {
    assertEqual(backend.session(), null, 'נשארה התחברות אחרי יציאה');
    assertEqual(storage.getItem(Supabase.TOKEN_KEY), null, 'האסימון לא נמחק מהאחסון');
  });
});

console.log('\n== נתוני החברה ==');

function signedIn() {
  var server = new FakeSupabase();
  var backend = makeBackend(server);
  return backend.signUpCompany({
    email: 'boss@test.co', password: 'secret123', name: 'דנה', companyName: 'רשת'
  }).then(function (session) {
    return { server: server, backend: backend, session: session };
  });
}

run('הגדרות נשמרות ונטענות חזרה', function () {
  return signedIn().then(function (ctx) {
    return ctx.backend.loadConfig().then(function (empty) {
      assertEqual(empty, null, 'חברה חדשה החזירה הגדרות');
      return ctx.backend.saveConfig({ employees: [{ id: 'emp-1', name: 'דני' }], branches: [] });
    }).then(function () {
      return ctx.backend.loadConfig();
    }).then(function (config) {
      assertEqual(config.employees[0].name, 'דני', 'ההגדרות לא חזרו כפי שנשמרו');
    });
  });
});

run('שבוע נשמר עם דגל פרסום נפרד מה-JSON', function () {
  return signedIn().then(function (ctx) {
    return ctx.backend.saveWeek('2026-09-20', {
      assignments: { 'a|b|c': ['emp-1'] }, constraints: {}, published: true
    }).then(function () {
      var row = ctx.server.weeks[ctx.session.company.id + '|2026-09-20'];
      assertEqual(row.published, true, 'הפרסום לא נשמר בעמודה');
      assert(!('published' in row.week), 'הפרסום נשמר גם בתוך ה-JSON, וזו כפילות');
      return ctx.backend.loadWeek('2026-09-20');
    }).then(function (week) {
      assertEqual(week.published, true, 'הפרסום לא הוחזר לאפליקציה');
      assertEqual(week.assignments['a|b|c'][0], 'emp-1', 'השיבוצים לא חזרו');
    });
  });
});

run('רשימת השבועות מוחזרת ממוינת', function () {
  return signedIn().then(function (ctx) {
    return ctx.backend.saveWeek('2026-09-27', {})
      .then(function () { return ctx.backend.saveWeek('2026-09-13', {}); })
      .then(function () { return ctx.backend.listWeeks(); })
      .then(function (keys) {
        assertEqual(keys.length, 2, 'מספר שבועות לא נכון');
        assert(keys.indexOf('2026-09-13') !== -1, 'שבוע חסר ברשימה');
      });
  });
});

run('פרסום שבוע שאינו קיים מחזיר שגיאה', function () {
  return signedIn().then(function (ctx) {
    return ctx.backend.publishWeek('2030-01-01', true)
      .then(function () { throw new Error('פורסם שבוע שלא קיים'); }, function (err) {
        assertEqual(err.code, 'not_found', 'קוד שגיאה לא נכון');
      });
  });
});

console.log('\n== אילוצים ==');

run('עובד בלי כרטיס עובד מקבל הודעה ברורה', function () {
  return signedIn().then(function (ctx) {
    return ctx.backend.saveOwnConstraint('2026-09-20', 2, { off: true })
      .then(function () { throw new Error('התקבל אילוץ בלי קישור לכרטיס'); }, function (err) {
        assertEqual(err.code, 'no_employee_link', 'קוד שגיאה לא נכון');
        assertEqual(err.message, I18n.t('server.notLinked'), 'ההודעה אינה מתורגמת');
      });
  });
});

run('בקשת אילוץ נשמרת תמיד כממתינה לאישור', function () {
  return signedIn().then(function (ctx) {
    /* מקשרים את הבעלים לכרטיס עובד, כדי שיוכל להגיש בקשה */
    ctx.server.companyUsers[ctx.session.user.id].employee_id = 'emp-1';
    return ctx.backend.saveOwnConstraint('2026-09-20', 2, { off: true, status: 'approved' })
      .then(function (week) {
        assertEqual(week.constraints['emp-1|2'].status, 'pending',
          'הבקשה לא חזרה למצב המתנה');
      });
  });
});

run('אישור בקשה נשלח לפונקציה הנכונה עם כל הפרטים', function () {
  return signedIn().then(function (ctx) {
    ctx.server.companyUsers[ctx.session.user.id].employee_id = 'emp-1';
    return ctx.backend.saveOwnConstraint('2026-09-20', 2, { off: true }).then(function () {
      return ctx.backend.decideConstraint('2026-09-20', 'emp-1', 2, 'approved', 'בסדר');
    }).then(function (week) {
      assertEqual(week.constraints['emp-1|2'].status, 'approved', 'הבקשה לא אושרה');
      assertEqual(week.constraints['emp-1|2'].managerNote, 'בסדר', 'הערת המנהל לא נשמרה');
      var call = ctx.server.calls.filter(function (c) {
        return c.path.indexOf('rpc/decide_constraint') !== -1;
      })[0];
      assertEqual(call.body.p_day_idx, 2, 'מספר היום נשלח שגוי');
      assertEqual(call.body.p_employee_id, 'emp-1', 'מזהה העובד נשלח שגוי');
    });
  });
});

run('החלטה על בקשה שאינה קיימת מחזירה שגיאה', function () {
  return signedIn().then(function (ctx) {
    return ctx.backend.decideConstraint('2026-09-20', 'emp-9', 1, 'approved', '')
      .then(function () { throw new Error('אושרה בקשה שלא קיימת'); }, function (err) {
        assertEqual(err.code, 'not_found', 'קוד שגיאה לא נכון');
      });
  });
});

console.log('\n== משתמשים ומנוי ==');

run('רשימת המשתמשים ממופה לשמות שהאפליקציה מכירה', function () {
  return signedIn().then(function (ctx) {
    return ctx.backend.listUsers().then(function (users) {
      assertEqual(users.length, 1, 'מספר משתמשים לא נכון');
      assert('employeeId' in users[0], 'employee_id לא מומר ל-employeeId');
      assertEqual(users[0].role, 'owner', 'תפקיד שגוי');
    });
  });
});

run('עדכון משתמש שולח שמות עמודות של בסיס הנתונים', function () {
  return signedIn().then(function (ctx) {
    /* מוסיפים עובד שאינו הבעלים, כי בעלים חסום לשינוי */
    ctx.server.companyUsers['user-2'] = {
      id: 'user-2', company_id: ctx.session.company.id, email: 'e@e.co',
      name: 'עובד', role: 'employee', employee_id: null, active: true
    };
    return ctx.backend.updateUser('user-2', { employeeId: 'emp-3', active: false })
      .then(function (user) {
        assertEqual(user.employeeId, 'emp-3', 'הקישור לכרטיס לא נשמר');
        assertEqual(user.active, false, 'ההשבתה לא נשמרה');
        var call = ctx.server.calls.filter(function (c) {
          return c.method === 'PATCH' && c.path.indexOf('company_users') !== -1;
        })[0];
        assert('employee_id' in call.body, 'נשלח employeeId במקום employee_id');
        assert(call.query.indexOf('role=neq.owner') !== -1, 'הבקשה אינה מגנה על הבעלים');
      });
  });
});

run('בעלים אינו ניתן לשינוי', function () {
  return signedIn().then(function (ctx) {
    return ctx.backend.updateUser(ctx.session.user.id, { role: 'employee' })
      .then(function () { throw new Error('הבעלים שונה'); }, function (err) {
        assertEqual(err.code, 'not_found', 'קוד שגיאה לא נכון');
      });
  });
});

run('שינוי תוכנית עובר דרך השרת ולא נכתב מהדפדפן', function () {
  return signedIn().then(function (ctx) {
    /* השרת מאשר, ורק אחר כך המצב מתעדכן */
    ctx.server.serverRoutes = { '/api/billing/change-plan': { status: 200, body: { ok: true } } };
    ctx.server.calls.length = 0;
    return ctx.backend.setSubscription({ plan: 'growth' }).then(function () {
      var toServer = ctx.server.calls.filter(function (c) {
        return c.path === '/api/billing/change-plan';
      });
      assertEqual(toServer.length, 1, 'הבקשה לא נשלחה לשרת');
      assertEqual(toServer[0].body.plan, 'growth', 'התוכנית לא נשלחה');

      /* הנקודה המרכזית: אסור שהדפדפן יכתוב את מצב המנוי בעצמו */
      var directWrite = ctx.server.calls.filter(function (c) {
        return c.method === 'PATCH' && c.path.indexOf('companies') !== -1;
      });
      assertEqual(directWrite.length, 0,
        'הדפדפן כתב ישירות לטבלת החברות – כך לקוח יכול להעניק לעצמו מנוי');
    });
  });
});

run('מצב המנוי נטען מחדש מהשרת אחרי אישור', function () {
  return signedIn().then(function (ctx) {
    ctx.server.serverRoutes = { '/api/billing/change-plan': { status: 200, body: { ok: true } } };
    /* "הספק אישר" – השרת עדכן את השורה */
    ctx.server.companies[ctx.session.company.id].plan = 'growth';
    ctx.server.companies[ctx.session.company.id].status = 'active';
    return ctx.backend.setSubscription({ plan: 'growth' }).then(function (company) {
      assertEqual(company.plan, 'growth', 'התוכנית לא נטענה מחדש');
      assertEqual(ctx.backend.session().company.status, 'active',
        'מצב ההתחברות בזיכרון לא התעדכן');
    });
  });
});

run('כשהחיוב לא חובר מתקבלת הודעה ברורה ולא שגיאה סתומה', function () {
  return signedIn().then(function (ctx) {
    ctx.server.serverRoutes = {};   // נקודת הקצה לא נפרסה
    return ctx.backend.setSubscription({ plan: 'growth' })
      .then(function () { throw new Error('שינוי התוכנית הצליח בלי שרת חיוב'); }, function (err) {
        assertEqual(err.code, 'not_configured', 'קוד שגיאה לא נכון');
        assertEqual(err.message, I18n.t('payments.notConnected'), 'ההודעה אינה מתורגמת');
      });
  });
});

run('ביטול מנוי פונה לנקודת הקצה של הביטול', function () {
  return signedIn().then(function (ctx) {
    ctx.server.serverRoutes = { '/api/billing/cancel': { status: 200, body: { ok: true } } };
    return ctx.backend.setSubscription({ status: 'canceled' }).then(function () {
      var cancel = ctx.server.calls.filter(function (c) { return c.path === '/api/billing/cancel'; });
      assertEqual(cancel.length, 1, 'בקשת הביטול לא נשלחה');
    });
  });
});

run('יצירת משתמש נשלחת לשרת ולא ל-Supabase ישירות', function () {
  return signedIn().then(function (ctx) {
    ctx.server.serverRoutes = {
      '/api/create-user': { status: 200, body: { id: 'u-9', email: 'e@e.co', role: 'employee' } }
    };
    ctx.server.calls.length = 0;
    return ctx.backend.createUser({
      email: 'E@E.co', password: 'secret123', name: 'עובד', role: 'employee'
    }).then(function (user) {
      assertEqual(user.id, 'u-9', 'המשתמש לא הוחזר');
      var admin = ctx.server.calls.filter(function (c) {
        return c.path.indexOf('/auth/v1/admin') !== -1;
      });
      assertEqual(admin.length, 0, 'הדפדפן פנה ל-API הניהולי של Supabase');
      var toServer = ctx.server.calls.filter(function (c) { return c.path === '/api/create-user'; });
      assertEqual(toServer[0].body.email, 'e@e.co', 'האימייל לא עבר נרמול');
    });
  });
});

console.log('\n== עדכונים חיים ==');

run('שינוי שבוע ממכשיר אחר מגיע למאזין', function () {
  return signedIn().then(function (ctx) {
    var seen = [];
    var stop = ctx.backend.subscribe(function (change) { seen.push(change); });
    /* הסבב הראשון רק רושם את המצב הקיים */
    return ctx.backend._poll().then(function () {
      assertEqual(seen.length, 0, 'הוכרז שינוי בסבב הראשון');
      /* "מכשיר אחר" כותב ישירות לשרת */
      ctx.server.weeks[ctx.session.company.id + '|2026-09-20'] = {
        company_id: ctx.session.company.id, week_key: '2026-09-20',
        week: { assignments: { x: ['emp-1'] }, constraints: {} },
        published: false, updated_at: new Date(Date.now() + 1000).toISOString()
      };
      return ctx.backend._poll();
    }).then(function () {
      assertEqual(seen.length, 1, 'השינוי לא הגיע למאזין');
      assertEqual(seen[0].type, 'week', 'סוג השינוי שגוי');
      assertEqual(seen[0].weekKey, '2026-09-20', 'מפתח השבוע שגוי');
      assertEqual(seen[0].week.assignments.x[0], 'emp-1', 'תוכן השבוע לא הגיע');
      stop();
      assertEqual(ctx.backend.pollTimer, null, 'התשאול לא נעצר אחרי ביטול ההאזנה');
    });
  });
});

run('שינוי הגדרות ממכשיר אחר מגיע למאזין', function () {
  return signedIn().then(function (ctx) {
    var seen = [];
    ctx.backend.subscribe(function (change) { seen.push(change); });
    return ctx.backend._poll().then(function () {
      ctx.server.configs[ctx.session.company.id] = {
        company_id: ctx.session.company.id,
        config: { branches: [{ id: 'br-1', name: 'סניף חדש' }] },
        updated_at: new Date(Date.now() + 1000).toISOString()
      };
      return ctx.backend._poll();
    }).then(function () {
      var configChanges = seen.filter(function (c) { return c.type === 'config'; });
      assertEqual(configChanges.length, 1, 'שינוי ההגדרות לא הוכרז');
      assertEqual(configChanges[0].config.branches[0].name, 'סניף חדש', 'התוכן לא הגיע');
    });
  });
});

run('ניתוק רשת בתשאול אינו מפיל את האפליקציה', function () {
  return signedIn().then(function (ctx) {
    ctx.backend.subscribe(function () {});
    var original = ctx.server.fetch;
    ctx.server.fetch = function () { return Promise.reject(new Error('אין רשת')); };
    return ctx.backend._poll().then(function () {
      ctx.server.fetch = original;   // הצליח לשרוד את הניתוק
    });
  });
});

console.log('\n== חידוש אסימון ==');

run('אסימון שפג מחודש אוטומטית לפני הבקשה', function () {
  var server = new FakeSupabase();
  var backend = makeBackend(server);
  return backend.signUpCompany({
    email: 'a@b.co', password: 'secret123', companyName: 'X'
  }).then(function () {
    backend.tokens.expires_at = Math.floor(Date.now() / 1000) - 60;   // כבר פג
    server.calls.length = 0;
    return backend.listWeeks();
  }).then(function () {
    var refresh = server.calls.filter(function (c) {
      return c.path === '/auth/v1/token' && c.query.indexOf('refresh_token') !== -1;
    });
    assertEqual(refresh.length, 1, 'האסימון לא חודש');
    assert(backend.tokens.expires_at * 1000 > Date.now(), 'האסימון החדש כבר פג');
  });
});

run('פעולה בלי התחברות נדחית בלי לפנות לשרת', function () {
  var server = new FakeSupabase();
  var backend = makeBackend(server);
  return backend.loadConfig().then(function () {
    throw new Error('התקבלו נתונים בלי התחברות');
  }, function (err) {
    assertEqual(err.code, 'not_signed_in', 'קוד שגיאה לא נכון');
    assertEqual(server.calls.length, 0, 'נשלחה בקשה לשרת בלי התחברות');
  });
});

chain.then(function () {
  console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
  process.exit(failed ? 1 : 0);
});
