/* לידים, הוצאות פרסום ודוח השיווק במשרד האחורי.
   מקבל db מדומה בזיכרון ומריץ את הקוד האמיתי של שתי הנקודות.
   הרצה: node tests/admin-marketing-tests.js */
'use strict';

var Leads = require('../api/admin/_leads.js');
var Marketing = require('../api/admin/_marketing.js');
var internals = Marketing._internals;

var passed = 0, failed = 0;
function assert(c, m) { if (!c) throw new Error(m); }
function assertEqual(a, e, m) {
  if (a !== e) throw new Error((m || 'ערכים שונים') + ': התקבל ' + JSON.stringify(a) + ', ציפינו ל-' + JSON.stringify(e));
}
var queue = Promise.resolve();
function test(name, fn) {
  queue = queue.then(function () {
    return Promise.resolve().then(fn).then(function () { passed++; console.log('  ✓ ' + name); },
      function (err) { failed++; console.log('  ✗ ' + name + '\n      ' + (err && err.message)); });
  });
}
function daysAgo(n) { return new Date(Date.now() - n * 864e5).toISOString(); }

function makeDb(tables) {
  var calls = [];
  async function db(path, opts) {
    opts = opts || {};
    var method = opts.method || 'GET';
    calls.push({ path: path, method: method, body: opts.body });
    var parts = path.split('?');
    var table = parts[0].replace(/^\//, '');
    var params = new URLSearchParams(parts[1] || '');
    var rows = tables[table];
    if (!rows) return { ok: false, status: 404, body: { message: 'no table ' + table } };

    function matches(row) {
      var ok = true;
      params.forEach(function (value, key) {
        if (['select', 'order', 'limit', 'on_conflict'].indexOf(key) !== -1) return;
        if (value.indexOf('eq.') === 0) ok = ok && String(row[key]) === value.slice(3);
        else if (value.indexOf('like.') === 0) ok = ok && String(row[key] || '').indexOf(value.slice(5).replace('*', '')) === 0;
      });
      return ok;
    }
    if (method === 'GET') return { ok: true, status: 200, body: rows.filter(matches).map(function (r) { return Object.assign({}, r); }) };
    if (method === 'PATCH') {
      var hit = rows.filter(matches);
      hit.forEach(function (r) { Object.assign(r, opts.body); });
      return { ok: true, status: 200, body: hit };
    }
    if (method === 'DELETE') {
      tables[table] = rows.filter(function (r) { return !matches(r); });
      return { ok: true, status: 200, body: [] };
    }
    if (method === 'POST') {
      var conflict = params.get('on_conflict');
      opts.body.forEach(function (row) {
        if (conflict) {
          var keys = conflict.split(',');
          var existing = rows.filter(function (r) { return keys.every(function (k) { return r[k] === row[k]; }); })[0];
          if (existing) { Object.assign(existing, row); return; }
        }
        rows.push(Object.assign({ id: 'id-' + rows.length }, row));
      });
      return { ok: true, status: 201, body: opts.body };
    }
    return { ok: false, status: 400, body: {} };
  }
  db.calls = calls;
  return db;
}
var USER = { email: 'boss@setshifts.com' };

console.log('\n== עזרים ==');

test('השבוע מתחיל ביום ראשון', function () {
  /* 2026-10-03 הוא שבת; השבוע שלו התחיל ב-2026-09-27 */
  assertEqual(internals.weekStart('2026-10-03T10:00:00Z'), '2026-09-27');
  assertEqual(internals.weekStart('2026-09-27T00:00:00Z'), '2026-09-27');
});

test('שמות שונים של Meta הם ערוץ אחד', function () {
  ['facebook', 'Facebook', 'fb', 'instagram', 'IG', 'Meta', 'פייסבוק'].forEach(function (n) {
    assertEqual(internals.channelName(n), 'meta', n);
  });
  assertEqual(internals.channelName('google'), 'google');
  assertEqual(internals.channelName(''), '');
});

test('לקוח של סוכן הוא ערוץ סוכנים גם אם יש לו utm', function () {
  assertEqual(internals.channelOf({ source: 'agent', utm_source: 'facebook' }), 'agents');
  assertEqual(internals.channelOf({ source: 'direct' }), 'direct');
});

console.log('\n== לידים ==');

function leadsDb() {
  return makeDb({
    leads: [
      { id: 'l1', created_at: daysAgo(1), updated_at: daysAgo(1), business_name: 'קפה', contact_name: 'דנה', phone: '054', email: 'a@b.co', employees: 12, hours_per_week: '3-6', contact_consent: true, status: 'new', utm_source: 'facebook', utm_campaign: 'owners-pain' },
      { id: 'l2', created_at: daysAgo(2), updated_at: daysAgo(2), business_name: 'מסעדה', contact_name: 'רן', phone: '052', email: 'r@b.co', employees: 30, hours_per_week: '6plus', contact_consent: true, status: 'contacted' }
    ],
    billing_events: []
  });
}

test('רשימה מחזירה ספירה לפי סטטוס על כל הטבלה', async function () {
  var db = leadsDb();
  var r = await Leads({ body: { action: 'list', status: 'new' }, db: db, user: USER });
  assertEqual(r.body.leads.length, 1, 'הסינון');
  assertEqual(r.body.counts.all, 2); assertEqual(r.body.counts.contacted, 1);
  assertEqual(r.body.leads[0].source, 'facebook');
});

test('עדכון סטטוס והערה נרשמים ביומן', async function () {
  var db = leadsDb();
  var r = await Leads({ body: { action: 'update', id: 'l1', status: 'demo', adminNote: 'קבענו ליום ג׳' }, db: db, user: USER });
  assertEqual(r.body.lead.status, 'demo');
  assertEqual(r.body.lead.adminNote, 'קבענו ליום ג׳');
  assert(db.calls.some(function (c) { return c.method === 'POST' && c.path === '/billing_events'; }), 'לא נרשם ביומן');
});

test('סטטוס לא מוכר נדחה', async function () {
  var r = await Leads({ body: { action: 'update', id: 'l1', status: 'hacked' }, db: leadsDb(), user: USER });
  assertEqual(r.status, 400);
});

test('קישור ללקוח הופך את הליד ל"נסגר"', async function () {
  var r = await Leads({ body: { action: 'update', id: 'l1', companyId: 'c1' }, db: leadsDb(), user: USER });
  assertEqual(r.body.lead.status, 'won'); assertEqual(r.body.lead.companyId, 'c1');
});

test('ליד שלא קיים מחזיר 404', async function () {
  var r = await Leads({ body: { action: 'update', id: 'nope', status: 'lost' }, db: leadsDb(), user: USER });
  assertEqual(r.status, 404);
});

test('מחיקה מוחקת, וביומן אין את הפרטים', async function () {
  var db = leadsDb();
  await Leads({ body: { action: 'delete', id: 'l2' }, db: db, user: USER });
  var r = await Leads({ body: { action: 'list' }, db: db, user: USER });
  assertEqual(r.body.leads.length, 1);
  var audit = db.calls.filter(function (c) { return c.path === '/billing_events'; }).pop();
  assert(JSON.stringify(audit.body).indexOf('r@b.co') === -1, 'פרטי הליד נכנסו ליומן');
});

console.log('\n== הוצאות ==');

test('הוצאה נשמרת ליום ראשון של השבוע, ושני תאריכים באותו שבוע מתמזגים', async function () {
  var db = makeDb({ marketing_spend: [], billing_events: [] });
  await Marketing({ body: { action: 'spend-save', weekStart: '2026-09-29', channel: 'Meta', amount: 1000 }, db: db, user: USER });
  await Marketing({ body: { action: 'spend-save', weekStart: '2026-10-01', channel: 'meta', amount: 1200 }, db: db, user: USER });
  var rows = (await db('/marketing_spend?select=*')).body;
  assertEqual(rows.length, 1, 'נוצרו שתי שורות לאותו שבוע');
  assertEqual(rows[0].week_start, '2026-09-27'); assertEqual(rows[0].amount, 1200);
});

test('סכום שלילי או תאריך שבור נדחים', async function () {
  var db = makeDb({ marketing_spend: [], billing_events: [] });
  assertEqual((await Marketing({ body: { action: 'spend-save', weekStart: '2026-09-27', channel: 'meta', amount: -5 }, db: db, user: USER })).status, 400);
  assertEqual((await Marketing({ body: { action: 'spend-save', weekStart: 'yesterday', channel: 'meta', amount: 5 }, db: db, user: USER })).status, 400);
  assertEqual((await Marketing({ body: { action: 'spend-save', weekStart: '2026-09-27', channel: '', amount: 5 }, db: db, user: USER })).status, 400);
});

console.log('\n== דוח ==');

function reportDb() {
  var thisWeek = internals.weekStart(daysAgo(1));
  return makeDb({
    companies: [
      { id: 'c1', name: 'א', created_at: daysAgo(1), is_demo: false, free_access: false, source: 'direct', utm_source: 'facebook', utm_campaign: 'owners-pain', billing_subscription_id: 'sub1', status: 'trial', plan: 'starter' },
      { id: 'c2', name: 'ב', created_at: daysAgo(2), is_demo: false, free_access: false, source: 'direct', utm_source: 'instagram', utm_campaign: 'owners-pain', billing_subscription_id: null, status: 'trial', plan: 'starter' },
      { id: 'c3', name: 'ג', created_at: daysAgo(2), is_demo: false, free_access: false, source: 'direct', status: 'trial', plan: 'starter' },
      { id: 'c4', name: 'הדגמה', created_at: daysAgo(1), is_demo: true, free_access: false, source: 'direct', status: 'trial', plan: 'starter' },
      { id: 'c5', name: 'פיילוט', created_at: daysAgo(1), is_demo: false, free_access: true, source: 'direct', utm_source: 'facebook', status: 'active', plan: 'starter' }
    ],
    billing_events: [
      { company_id: 'c1', type: 'charge.ok', received_at: daysAgo(0), payload: { outcome: 'charged', amount: 199, at: daysAgo(0) } },
      { company_id: 'c5', type: 'charge.ok', received_at: daysAgo(0), payload: { outcome: 'charged', amount: 100, at: daysAgo(0) } },
      { company_id: 'c2', type: 'charge.ok', received_at: daysAgo(0), payload: { outcome: 'failed', amount: 199 } }
    ],
    company_users: [{ company_id: 'c1', active: true }, { company_id: 'c1', active: true }, { company_id: 'c2', active: true }],
    leads: [
      { created_at: daysAgo(1), business_name: 'קפה', contact_name: 'דנה', phone: '1', email: 'a@b.co', status: 'new', utm_source: 'fb' },
      { created_at: daysAgo(2), business_name: 'מסעדה', contact_name: 'רן', phone: '2', email: 'r@b.co', status: 'won', converted_company_id: 'c1' }
    ],
    marketing_spend: [{ id: 's1', week_start: thisWeek, channel: 'meta', amount: 800 }, { id: 's2', week_start: thisWeek, channel: 'google', amount: 200 }]
  });
}

test('הדוח סופר הרשמות בלי הדגמה, וכרטיסים, ומשלמים', async function () {
  var r = (await Marketing({ body: { action: 'report', weeks: 4 }, db: reportDb(), user: USER })).body;
  assertEqual(r.totals.signups, 4, 'הרשמות: הדגמה אינה נספרת, פיילוט כן');
  assertEqual(r.totals.withCard, 1);
  assertEqual(r.totals.teamAdded, 1, 'חברה עם יותר ממשתמש אחד');
  assertEqual(r.totals.paying, 1, 'פיילוט ללא תשלום וחיוב שנכשל אינם משלמים');
  assertEqual(r.totals.leads, 2);
  assertEqual(r.totals.spend, 1000);
  assertEqual(r.totals.cac, 1000, 'הוצאה / משלמים חדשים');
});

test('ערוץ meta מאחד facebook ו-instagram, כולל ההוצאה', async function () {
  var r = (await Marketing({ body: { action: 'report', weeks: 4 }, db: reportDb(), user: USER })).body;
  var meta = r.channels.filter(function (c) { return c.key === 'meta'; })[0];
  assert(meta, 'אין ערוץ meta');
  assertEqual(meta.signups, 3, 'c1 + c2 + c5');
  assertEqual(meta.spend, 800);
  assertEqual(meta.paying, 1);
  assertEqual(meta.leads, 1, 'הליד מ-fb');
  assert(meta.roas > 0, 'ROAS');
});

test('נאמר כמה מההרשמות הגיעו בלי מקור', async function () {
  var r = (await Marketing({ body: { action: 'report', weeks: 4 }, db: reportDb(), user: USER })).body;
  assertEqual(r.untrackedShare, 25, 'אחת מארבע');
});

test('ייצוא כולל את כל השורות הגולמיות', async function () {
  var r = (await Marketing({ body: { action: 'report', weeks: 4 }, db: reportDb(), user: USER })).body;
  assertEqual(r.raw.companies.length, 4); assertEqual(r.raw.leads.length, 2);
  assertEqual(r.raw.companies.filter(function (c) { return c.firstCharge; }).length, 2);
});

test('מיגרציה שלא רצה אומרת את זה במפורש', async function () {
  var db = makeDb({});
  var r = await Marketing({ body: { action: 'report' }, db: db, user: USER });
  assertEqual(r.status, 500); assert(/migration/.test(r.body.message), r.body.message);
});

queue.then(function () {
  console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו');
  process.exit(failed ? 1 : 0);
});
