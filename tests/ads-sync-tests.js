/* סנכרון הוצאות פרסום: Meta (משיכה) ו-Google Ads (סקריפט ששולח).
   הרצה: node tests/ads-sync-tests.js */
'use strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.CRON_SECRET = 'cron-secret';
process.env.GOOGLE_ADS_SYNC_SECRET = 'g-secret';

var Ads = require('../api/_ads-sync.js');
var handler = require('../api/marketing-sync.js');
var I = Ads._internals;

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

var calls, metaPages, metaCurrency, metaFails;
function json(status, body) {
  return Promise.resolve({ ok: status < 300, status: status,
    json: function () { return Promise.resolve(body); },
    text: function () { return Promise.resolve(JSON.stringify(body)); } });
}
global.fetch = function (url, init) {
  url = String(url);
  calls.push({ url: url, method: (init && init.method) || 'GET', body: init && init.body ? JSON.parse(init.body) : null });
  if (url.indexOf('graph.facebook.com') !== -1) {
    if (metaFails) return json(400, { error: { message: 'Invalid OAuth access token' } });
    if (url.indexOf('/insights') === -1) return json(200, { currency: metaCurrency, id: 'act_1' });
    var page = /after=(\d)/.exec(url) ? Number(/after=(\d)/.exec(url)[1]) : 0;
    return json(200, metaPages[page]);
  }
  return json(201, []);
};
function reset() { calls = []; metaCurrency = 'ILS'; metaFails = false; metaPages = [{ data: [] }]; }
function spendWrites() {
  return calls.filter(function (c) { return c.url.indexOf('/marketing_spend') !== -1; });
}
function syncLogs() {
  return calls.filter(function (c) { return c.url.indexOf('/billing_events') !== -1; });
}

console.log('\n== סיכום שבועי ==');

test('ימים מסוכמים לשבוע שמתחיל ביום ראשון', function () {
  var weeks = I.weeklyTotals([{ date: '2026-09-27', cost: 100 }, { date: '2026-09-29', cost: 50.5 },
    { date: '2026-10-04', cost: 20 }]);
  assertEqual(JSON.stringify(weeks), JSON.stringify([{ week: '2026-09-27', amount: 150.5 }, { week: '2026-10-04', amount: 20 }]));
});

test('שבוע שהטווח לא מכסה מתחילתו אינו נכתב', function () {
  /* 2026-09-30 הוא רביעי: השבוע שלו התחיל ב-27, לפני הטווח */
  var weeks = I.weeklyTotals([{ date: '2026-09-30', cost: 100 }, { date: '2026-10-05', cost: 10 }]);
  assertEqual(weeks.length, 1); assertEqual(weeks[0].week, '2026-10-04');
});

console.log('\n== Meta ==');

test('בלי טוקן: לא מחובר, ולא נכתב כלום', async function () {
  reset();
  delete process.env.META_ADS_TOKEN; delete process.env.META_AD_ACCOUNT_ID;
  var r = await Ads.syncMeta(new Date('2026-10-04T05:00:00Z'));
  assertEqual(r.skipped, 'not configured'); assertEqual(calls.length, 0);
});

test('משיכה עם עמודים, וכתיבה לפי שבוע לערוץ meta', async function () {
  reset();
  process.env.META_ADS_TOKEN = 'tok'; process.env.META_AD_ACCOUNT_ID = '123';
  metaPages = [
    { data: [{ date_start: '2026-08-30', spend: '10.50' }], paging: { next: 'https://graph.facebook.com/v26.0/act_123/insights?after=1' } },
    { data: [{ date_start: '2026-09-28', spend: '100' }, { date_start: '2026-09-29', spend: '25.25' }] }
  ];
  var r = await Ads.syncMeta(new Date('2026-10-04T05:00:00Z'));
  assert(r.ok, JSON.stringify(r));
  var insights = calls.filter(function (c) { return c.url.indexOf('/insights') !== -1; });
  assertEqual(insights.length, 2, 'לא עבר לעמוד השני');
  assert(insights[0].url.indexOf('act_123') !== -1, 'מזהה החשבון בלי act_');
  var rows = spendWrites()[0].body;
  assert(rows.every(function (row) { return row.channel === 'meta' && /^אוטומטי/.test(row.note); }), 'ערוץ או סימון');
  var w = rows.filter(function (row) { return row.week_start === '2026-09-27'; })[0];
  assertEqual(w.amount, 125.25, 'סכום השבוע');
  assert(spendWrites()[0].url.indexOf('on_conflict=week_start,channel') !== -1, 'לא מחליף הזנה ידנית');
  assertEqual(syncLogs().length, 1, 'לא נרשם ביומן');
});

test('חשבון מודעות שאינו בשקלים נעצר, ונרשם כשגיאה', async function () {
  reset(); metaCurrency = 'USD';
  var r = await Ads.syncMeta(new Date('2026-10-04T05:00:00Z'));
  assertEqual(r.ok, false); assert(/USD/.test(r.error), r.error);
  assertEqual(spendWrites().length, 0, 'נכתב סכום בדולרים כשקלים');
  assertEqual(syncLogs()[0].body[0].payload.ok, false);
});

test('טוקן פג: שגיאה ברורה ביומן', async function () {
  reset(); metaFails = true;
  var r = await Ads.syncMeta(new Date('2026-10-04T05:00:00Z'));
  assertEqual(r.ok, false); assert(/OAuth/.test(r.error), r.error);
});

console.log('\n== Google Ads ==');

test('שורות מהסקריפט נכתבות לערוץ google, כולל שבוע ראשון בלי הוצאה', async function () {
  reset();
  var r = await Ads.receiveGoogle({ currency: 'ILS', since: '2026-09-06',
    rows: [{ date: '2026-09-28', cost: 80 }, { date: '2026-10-01', cost: 20 }] });
  assert(r.ok);
  var rows = spendWrites()[0].body;
  assert(rows.every(function (row) { return row.channel === 'google'; }));
  assertEqual(rows.filter(function (row) { return row.week_start === '2026-09-27'; })[0].amount, 100);
  assertEqual(rows.filter(function (row) { return row.week_start === '2026-09-06'; })[0].amount, 0, 'שבוע בלי פרסום');
});

test('חשבון Google שאינו בשקלים נדחה', async function () {
  reset();
  var r = await Ads.receiveGoogle({ currency: 'EUR', rows: [{ date: '2026-09-28', cost: 80 }] });
  assertEqual(r.ok, false); assertEqual(spendWrites().length, 0);
});

console.log('\n== הדלת ==');

function call(req) {
  var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; }, end: function (b) { this.body = b; } };
  return Promise.resolve(handler(req, res)).then(function () { return res; });
}

test('cron של Meta בלי CRON_SECRET נדחה', async function () {
  reset();
  var res = await call({ method: 'GET', url: '/api/marketing-sync?action=meta', headers: {} });
  assertEqual(res.statusCode, 401);
});

test('Google עם סוד שגוי נדחה, ועם הסוד הנכון נקלט', async function () {
  reset();
  var bad = await call({ method: 'POST', url: '/api/marketing-sync?action=google',
    headers: { authorization: 'Bearer cron-secret' }, body: { rows: [] } });
  assertEqual(bad.statusCode, 401, 'הסוד של ה-cron אינו הסוד של גוגל');
  var good = await call({ method: 'POST', url: '/api/marketing-sync?action=google',
    headers: { authorization: 'Bearer g-secret' }, body: { currency: 'ILS', rows: [{ date: '2026-09-28', cost: 5 }] } });
  assertEqual(good.statusCode, 200, good.body);
});

queue.then(function () {
  console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו');
  process.exit(failed ? 1 : 0);
});
