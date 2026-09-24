/* שעון נוכחות בחומרה: נקודת הקצה שאליה המכשירים מדווחים.

   ═══ מי מדבר כאן ═══
   מכשירי ZKTeco (ודומיהם) במצב ADMS / "Cloud Server" / PUSH.
   המכשיר הוא שיוזם: הוא פותח חיבור החוצה לכתובת שהוקלדה בו,
   ודוחף אליה את הדיווחים. זו הסיבה היחידה שהמוצר הזה ניתן
   למכירה מרחוק — בשיטה ההפוכה, שבה השרת מושך מהמכשיר, כל
   התקנה אצל לקוח היא ביקור טכנאי בראוטר של הסניף.

   ═══ הפרוטוקול, בקצרה ═══
     GET  /iclock/cdata?SN=..&options=all   לחיצת יד. תשובה:
                                            OK ושורות תצורה
     POST /iclock/cdata?SN=..&table=ATTLOG  דיווחי נוכחות,
                                            שורות מופרדות ב-Tab
     GET  /iclock/getrequest?SN=..          שאילתת פקודות
     POST /iclock/devicecmd?SN=..           תוצאות פקודות

   ═══ שני דברים שקובעים את ההתנהגות כאן ═══

   1. המכשיר אינו מבחין בין קודי שגיאה. כל 2xx נקרא אצלו
      "נקלט, אפשר למחוק מהזיכרון המקומי", וכל דבר אחר נקרא
      "אנסה שוב". לכן מכשיר שאיננו מכירים מקבל 503 על דיווחים
      ולא 200: כך הדיווחים נשמרים אצלו עד שהמנהל ירשום אותו,
      במקום להימחק אצלו ולהיזרק אצלנו.

   2. השעה שהמכשיר שולח היא השעה המקומית שלו, בלי אזור זמן.
      היא מומרת כאן ל-UTC לפי אזור הזמן של העסק. בלי ההמרה,
      כל מעבר שעון קיץ היה מזיז את כל הדוח בשעה.

   ═══ מה מגן ═══
   מכשיר מזוהה לפי מספר סידורי שהמנהל רשם בהגדרות. מספר שלא
   נרשם אינו קשור לשום עסק, ולכן אי אפשר לדחוף דיווחים בשם
   לקוח אחר בלי לדעת מספר סידורי רשום. דיווח על מספר עובד
   שאינו קיים בעסק נספר כנדחה ואינו נשמר.

   משתני סביבה (Vercel → Settings → Environment Variables):
     SUPABASE_URL              כתובת הפרויקט
     SUPABASE_SERVICE_ROLE_KEY מפתח service_role  (סודי!)
*/
'use strict';

const { projectUrl } = require('./_supabase.js');
const Store = require('../js/store.js');

/* תשובות הפרוטוקול הן טקסט, לא JSON. מכשיר שיקבל JSON פשוט
   לא יבין, ויתחיל לנסות שוב בלולאה. */
function text(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(body === undefined ? 'OK' : String(body));
}

async function rest(path, options) {
  const url = projectUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase not configured');
  const opts = options || {};
  const response = await fetch(url + '/rest/v1' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json'
    }, opts.headers || {}),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const raw = await response.text();
  let body = null;
  if (raw) { try { body = JSON.parse(raw); } catch (err) { body = { message: raw }; } }
  return { ok: response.ok, status: response.status, body: body };
}

/* גוף הבקשה כטקסט. הדיווחים אינם JSON אלא שורות עם Tab, ולכן
   לא ניתן להסתמך על הפענוח האוטומטי של הסביבה. */
function readBody(req) {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    /* הסביבה פענחה במקומנו משהו שאינו JSON אמיתי; אין מה
       לעשות איתו, ועדיף להתייחס לבקשה כריקה מאשר להמציא. */
    return Promise.resolve('');
  }
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
  return new Promise(function (resolve) {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', function (chunk) { data += chunk; });
    req.on('end', function () { resolve(data); });
    req.on('error', function () { resolve(''); });
  });
}

/* המרת "2026-09-24 08:03:11" באזור זמן נתון לרגע ב-UTC.

   נעשה בשתי איטרציות ולא בנוסחה: ההיסט עצמו תלוי ברגע (שעון
   קיץ), ולכן מחשבים היסט משוער, מתקנים, ובודקים שוב. הלילה
   שבו השעון זז הוא בדיוק המקרה שבו חישוב חד-פעמי טועה בשעה. */
function zonedToUtc(localText, timeZone) {
  const match = String(localText || '').trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const parts = match.slice(1).map(function (value) { return Number(value || 0); });
  const asUtc = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    const offset = offsetAt(guess, timeZone);
    if (offset === null) return new Date(asUtc);
    guess = asUtc - offset;
  }
  return new Date(guess);
}

/* ההיסט של אזור הזמן ברגע מסוים, בדקות-מילישניות */
function offsetAt(stamp, timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const parts = {};
    formatter.formatToParts(new Date(stamp)).forEach(function (part) {
      if (part.type !== 'literal') parts[part.type] = Number(part.value);
    });
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day,
      parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second);
    return asUtc - stamp;
  } catch (err) {
    /* אזור זמן שאינו מוכר: עדיף לרשום את השעה כפי שהיא מאשר
       לזרוק דיווח. המנהל יראה סטייה ויתקן, ודיווח שנזרק
       אי אפשר לשחזר. */
    return null;
  }
}

/* שורת ATTLOG: מספר עובד, תאריך ושעה, סוג, אופן זיהוי, ועוד.
   הפורמט משתנה מעט בין דגמים, ולכן נקראים שני השדות הראשונים
   בלבד — הם היחידים שאנחנו באמת צריכים. */
function parseAttlog(body) {
  return String(body || '').split(/\r?\n/).map(function (line) {
    if (!line.trim()) return null;
    const cells = line.split('\t');
    if (cells.length < 2) return null;
    return { pin: String(cells[0] || '').trim(), at: String(cells[1] || '').trim() };
  }).filter(Boolean);
}

/* בלוק התצורה שהמכשיר מצפה לו בלחיצת היד. Realtime=1 הוא מה
   שגורם לו לדחוף כל העברת כרטיס מיד, ולא אחת לכמה דקות. */
function handshake(sn) {
  return [
    'GET OPTION FROM: ' + sn,
    'Stamp=9999',
    'OpStamp=9999',
    'ErrorDelay=60',
    'Delay=30',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=1111000000',
    'Realtime=1',
    'Encrypt=0'
  ].join('\n');
}

/* איתור העסק לפי המספר הסידורי. המכשירים רשומים בהגדרות העסק,
   ולכן החיפוש הוא הכלה ב-jsonb: שאילתה אחת, בלי טבלה נוספת
   ובלי מעבר על כל הלקוחות. */
async function findDevice(sn) {
  const filter = encodeURIComponent(JSON.stringify({
    settings: { timeclock: { devices: [{ sn: sn }] } }
  }));
  const result = await rest('/company_configs?select=company_id,config&config=cs.' + filter);
  if (!result.ok || !Array.isArray(result.body) || !result.body.length) return null;
  const row = result.body[0];
  const config = row.config || {};
  const settings = config.settings || {};
  const clock = settings.timeclock || {};
  const device = (clock.devices || []).filter(function (item) {
    return item && String(item.sn) === sn;
  })[0] || {};
  return {
    companyId: row.company_id,
    config: config,
    device: device,
    enabled: clock.enabled === true && (clock.mode === 'device' || clock.mode === 'both'),
    timeZone: String(clock.timeZone || 'Asia/Jerusalem')
  };
}

async function loadWeek(companyId, weekKey) {
  const result = await rest('/company_weeks?company_id=eq.' + encodeURIComponent(companyId) +
    '&week_key=eq.' + encodeURIComponent(weekKey) + '&select=week,published');
  if (!result.ok || !Array.isArray(result.body) || !result.body.length) return null;
  return result.body[0].week || {};
}

async function saveWeek(companyId, weekKey, week, published) {
  return rest('/company_weeks', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: [{
      company_id: companyId, week_key: weekKey, week: week,
      published: !!published, updated_at: new Date().toISOString()
    }]
  });
}

/* הדיווחים נכתבים שבוע-שבוע: אצווה אחת של מכשיר יכולה לחצות
   חצות שבת ולגעת בשני שבועות. */
async function storePunches(context, rows) {
  const byWeek = {};
  const state = {
    settings: (context.config.settings || {}),
    employees: (context.config.employees || []),
    branches: (context.config.branches || [])
  };
  let stored = 0, unknown = 0, duplicate = 0, bad = 0;

  rows.forEach(function (row) {
    const emp = Store.employeeByClockId(state, row.pin);
    if (!emp) { unknown++; return; }
    const when = zonedToUtc(row.at, context.timeZone);
    if (!when || isNaN(when.getTime())) { bad++; return; }
    /* מפתח השבוע נגזר מהתאריך המקומי של הדיווח, ולא מהיום
       שבו הוא הגיע אלינו: אצווה שנתקעה ונשלחה למחרת שייכת
       לשבוע שבו היא נרשמה. */
    const localParts = new Date(when.getTime() + (offsetAt(when.getTime(), context.timeZone) || 0));
    const weekKey = Store.currentWeekKey(new Date(
      localParts.getUTCFullYear(), localParts.getUTCMonth(), localParts.getUTCDate()));
    if (!byWeek[weekKey]) byWeek[weekKey] = [];
    byWeek[weekKey].push({ empId: emp.id, at: when.toISOString() });
  });

  const keys = Object.keys(byWeek);
  for (let i = 0; i < keys.length; i++) {
    const weekKey = keys[i];
    const remote = await loadWeek(context.companyId, weekKey);
    const week = remote || {};
    if (!Array.isArray(week.punches)) week.punches = [];
    /* מיון לפי זמן לפני הכתיבה: הכיוון (כניסה או יציאה) נגזר
       מהדיווח הקודם, ואצווה שהגיעה בסדר אחר הייתה הופכת את
       הכניסות ליציאות. */
    byWeek[weekKey].sort(function (a, b) { return Date.parse(a.at) - Date.parse(b.at); });
    byWeek[weekKey].forEach(function (item) {
      const kind = Store.punchState(week, item.empId) === Store.PUNCH.IN
        ? Store.PUNCH.OUT : Store.PUNCH.IN;
      const result = Store.addPunch(week, {
        empId: item.empId, kind: kind, at: item.at,
        src: Store.PUNCH_SRC.DEVICE, deviceSn: context.device.sn,
        branchId: context.device.branchId || ''
      });
      if (result.ok) stored++;
      else if (result.reason === 'duplicate') duplicate++;
      else bad++;
    });
    await saveWeek(context.companyId, weekKey, week, remote ? undefined : false);
  }
  return { stored: stored, unknown: unknown, duplicate: duplicate, bad: bad };
}

/* פרמטרים של הבקשה.

   הסביבה מספקת req.query, אבל לא בכל מסלול ולא בכל גרסה —
   ונקודת קצה שמדברת עם מכשיר בסניף של לקוח היא המקום הגרוע
   ביותר לגלות בו הבדל כזה. לכן מה שחסר מושלם מהכתובת עצמה. */
function queryOf(req) {
  const out = Object.assign({}, req.query || {});
  const raw = String(req.url || '');
  const mark = raw.indexOf('?');
  if (mark !== -1) {
    const params = new URLSearchParams(raw.slice(mark + 1));
    params.forEach(function (value, key) {
      if (out[key] === undefined) out[key] = value;
    });
  }
  return out;
}

module.exports = async function handler(req, res) {
  const query = queryOf(req);
  const action = String(query.action || '').replace(/\.(aspx|asp|php)$/i, '').toLowerCase();
  const sn = String(query.SN || query.sn || '').trim();

  /* בדיקת חיבור מהמכשיר. חייבת לענות גם בלי מספר סידורי. */
  if (action === 'test' || action === 'ping') return text(res, 200, 'OK');
  if (!sn) return text(res, 200, 'OK');

  let context = null;
  try {
    context = await findDevice(sn);
  } catch (err) {
    /* תקלה אצלנו אינה סיבה שהמכשיר ימחק דיווחים */
    return text(res, 500, 'ERROR');
  }

  const isData = req.method === 'POST';
  if (!context || !context.enabled) {
    /* מכשיר שאינו רשום (או שהעסק כיבה את מצב החומרה): בקשות
       קריאה מקבלות OK כדי שימשיך לנסות בלי להציף לוגים,
       ודיווחים מקבלים 503 כדי שיישמרו אצלו עד שיירשם. */
    return isData ? text(res, 503, 'RETRY') : text(res, 200, 'OK');
  }

  if (action === 'getrequest') return text(res, 200, 'OK');
  if (action === 'devicecmd') return text(res, 200, 'OK');

  if (action === 'cdata' && req.method === 'GET') {
    return text(res, 200, handshake(sn));
  }

  if (action === 'cdata' && req.method === 'POST') {
    const table = String(query.table || '').toUpperCase();
    if (table && table !== 'ATTLOG') return text(res, 200, 'OK');
    const body = await readBody(req);
    const rows = parseAttlog(body);
    if (!rows.length) return text(res, 200, 'OK: 0');
    let summary;
    try {
      summary = await storePunches(context, rows);
    } catch (err) {
      return text(res, 500, 'ERROR');
    }
    /* מספר השורות שנקלטו חוזר למכשיר, וגם נרשם ביומן שלנו:
       "unknown" גבוה פירושו שמספרי העובדים במכשיר אינם אלה
       שבמערכת, וזו התקלה הראשונה בכל התקנה. */
    console.log('[timeclock]', sn, JSON.stringify(summary));
    return text(res, 200, 'OK: ' + rows.length);
  }

  return text(res, 200, 'OK');
};

module.exports._internals = {
  zonedToUtc: zonedToUtc, parseAttlog: parseAttlog, handshake: handshake,
  queryOf: queryOf
};
