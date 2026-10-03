/* תזכורת על כניסה שלא נרשמה: מי מקבל, מתי, ופעם אחת בלבד.
   הרצה: node tests/missed-punch-tests.js */
'use strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.RESEND_API_KEY = 're_test';
process.env.MAIL_FROM = 'SetShifts <no-reply@setshifts.com>';
process.env.CRON_SECRET = 'cron-secret';

var I18n = require('../js/i18n/core.js');
I18n.use('he');
var Store = require('../js/store.js');
var Missed = require('../api/_missed-punch.js');
var timeclock = require('../api/timeclock.js');
var wa = require('../api/wa.js');
var M = Missed._internals;

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

/* שני 14/09/2026, משמרת בוקר 09:30–16:00 בירושלים = 06:30Z–13:00Z */
var KEY = '2026-09-13';
function makeState(clock) {
  var state = Store.emptyState();
  state.settings.timeclock = Object.assign({ enabled: true, mode: 'phone', devices: [] }, clock || {});
  var week = Store.getWeek(state, KEY);
  Store.setAssigned(week, 1, state.branches[0].id, 'morning', [state.employees[0].id]);
  week.published = true;
  return state;
}
function find(state, iso, extra) {
  var weeks = {};
  weeks[KEY] = { week: state.weeks[KEY], published: state.weeks[KEY].published };
  return M.findMissed(Object.assign({ state: state, weeks: weeks, now: new Date(iso),
    rule: M.reminderSettings(state.settings) }, extra || {}));
}

console.log('\n== מתי ==');

test('לפני שעברו 10 דקות מתחילת המשמרת אין תזכורת', function () {
  assertEqual(find(makeState(), '2026-09-14T06:39:00Z').length, 0);
});

test('אחרי 10 דקות, בלי כניסה: תזכורת אחת, עם תחילת המשמרת ב-UTC', function () {
  var due = find(makeState(), '2026-09-14T06:41:00Z');
  assertEqual(due.length, 1);
  assertEqual(due[0].start, '2026-09-14T06:30:00.000Z', 'שעון ירושלים לא הומר נכון');
  assertEqual(due[0].empId, makeState().employees[0].id);
});

test('המנהל בחר 30 דקות: אחרי 10 עוד לא', function () {
  assertEqual(find(makeState({ remindAfter: 30 }), '2026-09-14T06:41:00Z').length, 0);
  assertEqual(find(makeState({ remindAfter: 30 }), '2026-09-14T07:01:00Z').length, 1);
});

test('מעבר לחלון השליחה (30 דקות) לא שולחים על משמרת של הבוקר', function () {
  assertEqual(find(makeState(), '2026-09-14T07:15:00Z').length, 0);
});

test('עובד שנכנס, גם קצת לפני ההתחלה, לא מקבל תזכורת', function () {
  var state = makeState();
  Store.addPunch(state.weeks[KEY], { empId: state.employees[0].id, kind: 'in', at: '2026-09-14T06:20:00Z' });
  assertEqual(find(state, '2026-09-14T06:45:00Z').length, 0);
});

test('כניסה של אתמול אינה נחשבת כניסה למשמרת של היום', function () {
  var state = makeState();
  Store.addPunch(state.weeks[KEY], { empId: state.employees[0].id, kind: 'in', at: '2026-09-13T05:00:00Z' });
  assertEqual(find(state, '2026-09-14T06:45:00Z').length, 1);
});

console.log('\n== למי ==');

test('שעון נוכחות כבוי: אין תזכורות בכלל', function () {
  var state = makeState({ enabled: false });
  assertEqual(M.reminderSettings(state.settings).on, false);
});

test('המנהל כיבה את התזכורת אבל השעון דלוק: אין תזכורות', function () {
  assertEqual(M.reminderSettings(makeState({ remindMissed: false }).settings).on, false);
  assertEqual(M.reminderSettings(makeState().settings).on, true, 'ברירת המחדל: דלוק');
});

test('סידור בטיוטה: אין תזכורת', function () {
  var state = makeState();
  state.weeks[KEY].published = false;
  assertEqual(find(state, '2026-09-14T06:45:00Z').length, 0);
});

test('עובד שהושבת: אין תזכורת', function () {
  var state = makeState();
  state.employees[0].active = false;
  assertEqual(find(state, '2026-09-14T06:45:00Z').length, 0);
});

console.log('\n== הנוסח ==');

test('מייל בעברית מכוון לאפליקציה במצב טלפון', function () {
  var mail = M.buildMail({ lang: 'he', name: 'דנה', time: '09:30', shift: 'בוקר', branch: '',
    company: 'קפה', mode: 'phone', appUrl: 'https://setshifts.com/app/' });
  assert(/09:30/.test(mail.subject), 'השעה בכותרת');
  assert(/לחץ\/י "כניסה"/.test(mail.text), 'הוראה לטלפון');
  assert(mail.html.indexOf('dir="rtl"') !== -1, 'כיוון');
});

test('במצב שעון בסניף: הוראה להחתים בשעון, בלי כפתור לאפליקציה', function () {
  var mail = M.buildMail({ lang: 'he', name: 'דנה', time: '09:30', shift: 'בוקר', branch: 'מרכז',
    company: 'קפה', mode: 'device', appUrl: 'https://setshifts.com/app/' });
  assert(/בשעון שבסניף/.test(mail.text), 'הוראה למכשיר');
  assert(mail.html.indexOf('href=') === -1, 'כפתור לאפליקציה במצב מכשיר');
});

test('שמונה שפות, אותם שדות', function () {
  var keys = Object.keys(M.COPY.he).sort().join(',');
  Object.keys(M.COPY).forEach(function (lang) {
    assertEqual(Object.keys(M.COPY[lang]).sort().join(','), keys, lang);
  });
  assertEqual(Object.keys(M.COPY).length, 8);
});

console.log('\n== הריצה המלאה (שרת מדומה) ==');

function fakeServer(opts) {
  var state = makeState(opts.clock);
  var sentMail = [];
  var reminders = opts.reminders || {};
  global.fetch = function (url, init) {
    url = String(url);
    var method = (init && init.method) || 'GET';
    function reply(status, body) {
      return Promise.resolve({ ok: status < 300, status: status,
        text: function () { return Promise.resolve(body === undefined ? '' : JSON.stringify(body)); },
        json: function () { return Promise.resolve(body); } });
    }
    if (url.indexOf('resend.com') !== -1) { sentMail.push(JSON.parse(init.body)); return reply(200, { id: 'm1' }); }
    if (url.indexOf('/company_configs') !== -1) {
      return reply(200, [{ company_id: 'co-1', config: { settings: state.settings, employees: state.employees, branches: state.branches } }]);
    }
    if (url.indexOf('/companies?') !== -1) {
      return reply(200, [{ id: 'co-1', name: 'קפה הנחל', status: opts.status || 'active',
        valid_until: opts.validUntil || '2099-01-01T00:00:00Z', cancel_at_period_end: false, billing_subscription_id: 'sub' }]);
    }
    if (url.indexOf('/company_weeks') !== -1) {
      return reply(200, [{ week_key: KEY, week: state.weeks[KEY], published: true }]);
    }
    if (url.indexOf('/company_users') !== -1) {
      /* השרת האמיתי מסנן updates_consent_at=not.is.null */
      assert(url.indexOf('updates_consent_at=not.is.null') !== -1, 'לא סוננו עובדים בלי הסכמה');
      return reply(200, opts.noConsent ? [] : [{ email: 'dana@cafe.co.il', name: 'דנה' }]);
    }
    if (url.indexOf('/punch_reminders') !== -1 && method === 'POST') {
      var row = JSON.parse(init.body)[0];
      var k = row.company_id + '|' + row.employee_id + '|' + row.shift_start;
      if (reminders[k]) return reply(201, []);
      reminders[k] = true;
      return reply(201, [row]);
    }
    return reply(404, {});
  };
  return { sentMail: sentMail, reminders: reminders };
}

test('ריצה שולחת מייל אחד, וריצה שנייה לא שולחת שוב', async function () {
  var server = fakeServer({});
  var first = await M.run(new Date('2026-09-14T06:41:00Z'));
  assertEqual(first.sent, 1, 'ריצה ראשונה');
  assertEqual(server.sentMail[0].to[0], 'dana@cafe.co.il');
  var second = await M.run(new Date('2026-09-14T06:46:00Z'));
  assertEqual(second.sent, 0, 'נשלח פעמיים');
  assertEqual(server.sentMail.length, 1);
});

test('עובד בלי הסכמה לעדכונים: לא נשלח, ולא נרשם', async function () {
  var server = fakeServer({ noConsent: true });
  var result = await M.run(new Date('2026-09-14T06:41:00Z'));
  assertEqual(result.sent, 0); assertEqual(Object.keys(server.reminders).length, 0);
});

test('עסק שהמנוי שלו פג: לא שולחים לעובדים שלו', async function () {
  var server = fakeServer({ status: 'trial', validUntil: '2026-09-01T00:00:00Z' });
  var result = await M.run(new Date('2026-09-14T06:41:00Z'));
  assertEqual(result.sent, 0); assertEqual(server.sentMail.length, 0);
});

console.log('\n== הדלת ==');

function call(handler, req) {
  var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; }, end: function (b) { this.body = b; } };
  return Promise.resolve(handler(req, res)).then(function () { return res; });
}

test('בלי CRON_SECRET נדחה, גם דרך נקודת הקצה של השעון', async function () {
  var res = await call(timeclock, { method: 'GET', url: '/api/timeclock?action=missed', query: { action: 'missed' }, headers: {} });
  assertEqual(res.statusCode, 401);
});

test('עם הסוד, ב-GET כמו ש-Vercel קורא ל-cron: רץ', async function () {
  fakeServer({ clock: { enabled: false } });
  var res = await call(timeclock, { method: 'GET', url: '/api/timeclock?action=missed', query: { action: 'missed' },
    headers: { authorization: 'Bearer cron-secret' } });
  assertEqual(res.statusCode, 200, res.body);
});

test('וואטסאפ: cron ב-GET מגיע לסריקת הנטישות ולא לאימות של מטא', async function () {
  var res = await call(wa, { method: 'GET', url: '/api/wa?action=abandoned', headers: {} });
  /* בלי הסוד הסריקה עונה 401. האימות של מטא היה עונה 403 */
  assertEqual(res.statusCode, 401, res.body);
});

console.log('\n== צד הלקוח (Store.missedClockIn) ==');

test('אותו כלל במסך העובד, בשעון המקומי', function () {
  var state = makeState();
  var week = state.weeks[KEY];
  var emp = state.employees[0].id;
  assertEqual(Store.missedClockIn(state, week, KEY, emp, new Date(2026, 8, 14, 9, 35)), null, 'לפני 10 דקות');
  assert(Store.missedClockIn(state, week, KEY, emp, new Date(2026, 8, 14, 9, 45)), 'אחרי 10 דקות');
  assertEqual(Store.missedClockIn(state, week, KEY, emp, new Date(2026, 8, 14, 16, 5)), null, 'אחרי סוף המשמרת');
  state.settings.timeclock.enabled = false;
  assertEqual(Store.missedClockIn(state, week, KEY, emp, new Date(2026, 8, 14, 9, 45)), null, 'שעון כבוי');
});

queue.then(function () {
  console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו');
  process.exit(failed ? 1 : 0);
});
