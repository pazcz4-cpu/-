/* נקודת הקצה של שעון החומרה (ADMS).

   כאן אין דפדפן ואין מסך: יש מכשיר שדוחף שורות טקסט, ושרת
   שצריך להפוך אותן לשעות נכונות. מה שנבדק הוא בדיוק המקומות
   שבהם זה משתבש בשקט:

     · שעה מקומית של מכשיר מול UTC, משני צדי מעבר שעון הקיץ.
     · מכשיר שאינו רשום — חייב לקבל תשובה שגורמת לו לשמור את
       הדיווחים, ולא למחוק אותם.
     · מספר עובד שאינו קיים בעסק.
     · אצווה שהגיעה בסדר הפוך, שבלי מיון הייתה הופכת כניסות
       ליציאות.

   הרצה: node tests/timeclock-api-tests.js */
'use strict';

var I18n = require('../js/i18n/core.js');
I18n.use('he');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

var handler = require('../api/timeclock.js');
var internals = handler._internals;

var passed = 0, failed = 0;
var queue = Promise.resolve();
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.log('  ✗ ' + name + '\n      ' + (err && err.message)); }
}
function asyncTest(name, fn) {
  queue = queue.then(function () {
    return Promise.resolve().then(fn).then(function () {
      passed++; console.log('  ✓ ' + name);
    }, function (err) {
      failed++; console.log('  ✗ ' + name + '\n      ' + (err && err.message));
    });
  });
}
function assert(condition, message) { if (!condition) throw new Error(message || 'assertion failed'); }
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'ערכים שונים') + ': התקבל ' + actual + ', ציפינו ל-' + expected);
  }
}

console.log('\n== פענוח שורות הדיווח ==');

test('שורות מופרדות ב-Tab', function () {
  var rows = internals.parseAttlog(
    '1\t2026-09-24 08:03:11\t0\t1\t\t0\t0\r\n4\t2026-09-24 16:41:02\t0\t1\t\t0\t0');
  assertEqual(rows.length, 2, 'מספר השורות');
  assertEqual(rows[0].pin, '1', 'מספר העובד');
  assertEqual(rows[1].at, '2026-09-24 16:41:02', 'חותמת הזמן');
});

test('שורה ריקה או פגומה אינה מפילה את האצווה', function () {
  var rows = internals.parseAttlog('\n\nגיבריש\n1\t2026-09-24 08:00:00\t0\n');
  assertEqual(rows.length, 1, 'מספר השורות התקינות');
});

console.log('\n== שעון מקומי מול UTC ==');

test('קיץ בישראל: שעון מקדים בשלוש שעות', function () {
  /* יולי — שעון קיץ פעיל, UTC+3 */
  assertEqual(internals.zonedToUtc('2026-07-15 08:00:00', 'Asia/Jerusalem').toISOString(),
    '2026-07-15T05:00:00.000Z', 'קיץ');
});

test('חורף בישראל: שעתיים', function () {
  assertEqual(internals.zonedToUtc('2026-12-15 08:00:00', 'Asia/Jerusalem').toISOString(),
    '2026-12-15T06:00:00.000Z', 'חורף');
});

test('ושעה זהה בשני הצדדים של המעבר אינה אותו רגע', function () {
  var summer = internals.zonedToUtc('2026-10-24 08:00:00', 'Asia/Jerusalem').getTime();
  var winter = internals.zonedToUtc('2026-11-01 08:00:00', 'Asia/Jerusalem').getTime();
  /* אותה שעה על השעון, הפרש של שבוע ועוד שעה של שינוי */
  assert((winter - summer) % (24 * 3600 * 1000) !== 0,
    'המעבר לא השפיע – כנראה שההמרה מתעלמת מאזור הזמן');
});

test('אזור זמן אחר, כי המוצר אינו רק בישראל', function () {
  assertEqual(internals.zonedToUtc('2026-01-15 08:00:00', 'Europe/Lisbon').toISOString(),
    '2026-01-15T08:00:00.000Z', 'ליסבון בחורף');
});

test('חותמת שאינה נקראת מחזירה null ולא תאריך שגוי', function () {
  assertEqual(internals.zonedToUtc('מתישהו', 'Asia/Jerusalem'), null, 'טקסט חופשי');
});

console.log('\n== קריאת הפרמטרים ==');

test('פרמטרים נקראים גם כשהסביבה לא פענחה אותם', function () {
  var query = internals.queryOf({ url: '/api/timeclock?action=cdata&SN=ABC&table=ATTLOG' });
  assertEqual(query.action, 'cdata', 'הפעולה');
  assertEqual(query.SN, 'ABC', 'המספר הסידורי');
  assertEqual(query.table, 'ATTLOG', 'הטבלה');
});

test('ומה שהסביבה כן פענחה גובר', function () {
  var query = internals.queryOf({ query: { SN: 'FROM-ENV' }, url: '/x?SN=FROM-URL&table=ATTLOG' });
  assertEqual(query.SN, 'FROM-ENV', 'המספר הסידורי');
  assertEqual(query.table, 'ATTLOG', 'הושלם מהכתובת');
});

console.log('\n== לחיצת היד ==');

test('בלוק התצורה כולל את מה שגורם לדחיפה מיידית', function () {
  var body = internals.handshake('ABC123');
  assert(body.indexOf('GET OPTION FROM: ABC123') === 0, 'שורת הפתיחה');
  assert(body.indexOf('Realtime=1') !== -1, 'דחיפה מיידית');
});

console.log('\n== המסלול המלא, מול שרת מדומה ==');

/* שרת מדומה במקום Supabase. מחזיק עסק אחד עם מכשיר רשום,
   ומאפשר לבדוק מה נכתב בפועל. */
function fakeServer(options) {
  var opts = options || {};
  var weeks = {};
  var published = {};
  var config = {
    settings: {
      shifts: [{ id: 'morning', name: 'בוקר', from: '08:00', to: '16:00' }],
      timeclock: {
        enabled: opts.enabled !== false,
        mode: opts.mode || 'device',
        timeZone: 'Asia/Jerusalem',
        devices: [{ sn: 'SN-1', branchId: 'br-1', name: 'סניף מרכז' }]
      }
    },
    branches: [{ id: 'br-1', name: 'מרכז' }],
    employees: [
      { id: 'emp-1', name: 'דנה', clockId: 1, active: true },
      { id: 'emp-2', name: 'יוסי', clockId: 2, active: true }
    ]
  };
  global.fetch = function (url, init) {
    var path = String(url);
    var method = (init && init.method) || 'GET';
    function reply(body, status) {
      return Promise.resolve({
        ok: (status || 200) < 400, status: status || 200,
        text: function () { return Promise.resolve(JSON.stringify(body)); }
      });
    }
    if (path.indexOf('/company_configs') !== -1) {
      /* מחקה הכלה ב-jsonb: מחזיר את העסק רק אם המספר הסידורי
         שבשאילתה הוא של מכשיר רשום. */
      var found = config.settings.timeclock.devices.some(function (device) {
        return path.indexOf(encodeURIComponent('"sn":"' + device.sn + '"')) !== -1 ||
          decodeURIComponent(path).indexOf('"sn":"' + device.sn + '"') !== -1;
      });
      return reply(found ? [{ company_id: 'co-1', config: config }] : []);
    }
    if (path.indexOf('/company_weeks') !== -1 && method === 'GET') {
      var match = decodeURIComponent(path).match(/week_key=eq\.([\d-]+)/);
      var key = match ? match[1] : '';
      return reply(weeks[key]
        ? [{ week: weeks[key], published: !!published[key] }] : []);
    }
    if (path.indexOf('/company_weeks') !== -1 && method === 'POST') {
      var rows = JSON.parse(init.body);
      rows.forEach(function (row) {
        weeks[row.week_key] = row.week;
        published[row.week_key] = row.published;
      });
      return reply([], 201);
    }
    return reply([], 404);
  };
  return { weeks: weeks, published: published, config: config };
}

function call(options) {
  var opts = options || {};
  var res = {
    statusCode: 0, headers: {}, body: '',
    setHeader: function (name, value) { this.headers[name] = value; },
    end: function (value) { this.body = value === undefined ? '' : String(value); }
  };
  var req = {
    method: opts.method || 'GET',
    query: opts.query,
    url: opts.url,
    body: opts.body === undefined ? '' : opts.body
  };
  return Promise.resolve(handler(req, res)).then(function () { return res; });
}

asyncTest('בדיקת חיבור עונה גם בלי מספר סידורי', function () {
  fakeServer();
  return call({ query: { action: 'test' } }).then(function (res) {
    assertEqual(res.statusCode, 200, 'קוד התשובה');
    assertEqual(res.body, 'OK', 'גוף התשובה');
  });
});

asyncTest('לחיצת יד עובדת גם כשהפרמטרים רק בכתובת', function () {
  fakeServer();
  return call({ url: '/api/timeclock?action=cdata&SN=SN-1&options=all' }).then(function (res) {
    assertEqual(res.statusCode, 200, 'קוד התשובה');
    assert(res.body.indexOf('Realtime=1') !== -1, 'התצורה לא חזרה');
  });
});

asyncTest('לחיצת יד של מכשיר רשום מחזירה תצורה', function () {
  fakeServer();
  return call({ query: { action: 'cdata', SN: 'SN-1', options: 'all' } }).then(function (res) {
    assertEqual(res.statusCode, 200, 'קוד התשובה');
    assert(res.body.indexOf('Realtime=1') !== -1, 'התצורה לא חזרה');
  });
});

asyncTest('מכשיר שאינו רשום: דיווחים מקבלים 503 כדי שיישמרו אצלו', function () {
  fakeServer();
  return call({
    method: 'POST', query: { action: 'cdata', SN: 'לא-רשום', table: 'ATTLOG' },
    body: '1\t2026-09-24 08:00:00\t0\t1'
  }).then(function (res) {
    assertEqual(res.statusCode, 503, 'קוד התשובה');
  });
});

asyncTest('ובקשת קריאה שלו מקבלת OK, כדי שלא יציף ניסיונות', function () {
  fakeServer();
  return call({ query: { action: 'getrequest', SN: 'לא-רשום' } }).then(function (res) {
    assertEqual(res.statusCode, 200, 'קוד התשובה');
  });
});

asyncTest('עסק שכיבה את מצב החומרה אינו קולט דיווחים', function () {
  fakeServer({ mode: 'phone' });
  return call({
    method: 'POST', query: { action: 'cdata', SN: 'SN-1', table: 'ATTLOG' },
    body: '1\t2026-09-24 08:00:00\t0\t1'
  }).then(function (res) {
    assertEqual(res.statusCode, 503, 'קוד התשובה');
  });
});

asyncTest('דיווחים נכתבים לשבוע הנכון, בזמן UTC, ובכיוון מתחלף', function () {
  var server = fakeServer();
  return call({
    method: 'POST', query: { action: 'cdata', SN: 'SN-1', table: 'ATTLOG' },
    body: '1\t2026-09-24 08:00:00\t0\t1\n1\t2026-09-24 16:30:00\t0\t1'
  }).then(function (res) {
    assertEqual(res.statusCode, 200, 'קוד התשובה');
    /* 24/09/2026 הוא יום חמישי; השבוע מתחיל ביום ראשון 20/09 */
    var week = server.weeks['2026-09-20'];
    assert(week, 'לא נכתב שבוע');
    assertEqual(week.punches.length, 2, 'מספר הדיווחים');
    assertEqual(week.punches[0].kind, 'in', 'הראשון');
    assertEqual(week.punches[1].kind, 'out', 'השני');
    assertEqual(week.punches[0].at, '2026-09-24T05:00:00.000Z', 'שעת הכניסה ב-UTC');
    assertEqual(week.punches[0].src, 'device', 'מקור הדיווח');
    assertEqual(week.punches[0].branchId, 'br-1', 'הסניף של המכשיר');
  });
});

asyncTest('אצווה שהגיעה בסדר הפוך אינה הופכת כניסה ליציאה', function () {
  var server = fakeServer();
  return call({
    method: 'POST', query: { action: 'cdata', SN: 'SN-1', table: 'ATTLOG' },
    body: '1\t2026-09-24 16:30:00\t0\t1\n1\t2026-09-24 08:00:00\t0\t1'
  }).then(function () {
    var punches = server.weeks['2026-09-20'].punches;
    assertEqual(punches[0].kind, 'in', 'המוקדם בזמן');
    assertEqual(punches[0].at, '2026-09-24T05:00:00.000Z', 'השעה של הראשון');
  });
});

asyncTest('מספר עובד שאינו קיים בעסק אינו נשמר', function () {
  var server = fakeServer();
  return call({
    method: 'POST', query: { action: 'cdata', SN: 'SN-1', table: 'ATTLOG' },
    body: '77\t2026-09-24 08:00:00\t0\t1'
  }).then(function (res) {
    assertEqual(res.statusCode, 200, 'קוד התשובה');
    assertEqual(Object.keys(server.weeks).length, 0, 'נכתב שבוע על עובד שאינו קיים');
  });
});

asyncTest('אצווה שנשלחה פעמיים אינה נספרת פעמיים', function () {
  var server = fakeServer();
  var batch = { method: 'POST', query: { action: 'cdata', SN: 'SN-1', table: 'ATTLOG' },
    body: '1\t2026-09-24 08:00:00\t0\t1' };
  return call(batch).then(function () { return call(batch); }).then(function () {
    assertEqual(server.weeks['2026-09-20'].punches.length, 1, 'מספר הדיווחים');
  });
});

asyncTest('שתי משמרות בשני שבועות נכתבות לשתי שורות', function () {
  var server = fakeServer();
  return call({
    method: 'POST', query: { action: 'cdata', SN: 'SN-1', table: 'ATTLOG' },
    body: '1\t2026-09-26 22:00:00\t0\t1\n1\t2026-09-27 02:00:00\t0\t1'
  }).then(function () {
    assert(server.weeks['2026-09-20'], 'השבוע הראשון לא נכתב');
    assert(server.weeks['2026-09-27'], 'השבוע השני לא נכתב');
  });
});

asyncTest('דיווח לשבוע מפורסם אינו מבטל את הפרסום שלו', function () {
  /* השמירה דורסת את השורה. בלי שמירת מצב הפרסום, העברת כרטיס
     אחת באמצע השבוע הייתה מעלימה את הסידור מכל הצוות. */
  var server = fakeServer();
  server.weeks['2026-09-20'] = { assignments: {}, constraints: {}, punches: [] };
  server.published['2026-09-20'] = true;
  return call({
    method: 'POST', query: { action: 'cdata', SN: 'SN-1', table: 'ATTLOG' },
    body: '1\t2026-09-24 08:00:00\t0\t1'
  }).then(function () {
    assertEqual(server.published['2026-09-20'], true, 'מצב הפרסום אחרי הדיווח');
    assertEqual(server.weeks['2026-09-20'].punches.length, 1, 'הדיווח נשמר');
  });
});

asyncTest('טבלה אחרת (יומן פעולות) נקלטת בלי להיכתב', function () {
  var server = fakeServer();
  return call({
    method: 'POST', query: { action: 'cdata', SN: 'SN-1', table: 'OPERLOG' },
    body: 'OPLOG 4\t0\t0\t0'
  }).then(function (res) {
    assertEqual(res.statusCode, 200, 'קוד התשובה');
    assertEqual(Object.keys(server.weeks).length, 0, 'נכתב שבוע מיומן פעולות');
  });
});

queue.then(function () {
  console.log('\n' + (failed === 0 ? '✅ ' : '❌ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
  process.exit(failed === 0 ? 0 : 1);
});
