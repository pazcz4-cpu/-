/* מה שחוזר מוואטסאפ: תשובות של לקוחות, סטטוסי מסירה, ובעיקר
   בקשות הסרה.

   למה זה קיים: אפשר לשלוח בלי זה. אסור לשלוח בלי זה. מי שכתב
   "הסר" ולא הוסר מקבל את ההודעה הבאה, חוסם את המספר, ומדווח --
   וברמה המשפטית, "דרך פשוטה להסיר" היא דרישה בחוק ולא נימוס.

   שני מסלולים:

   GET   אימות ראשוני מול מטא. היא שולחת אתגר, ואנחנו מחזירים
         אותו אם הטוקן תואם.
   POST  אירועים. מגיעים גם כשאיש לא כתב כלום -- סטטוס "נמסר",
         סטטוס "נקרא" -- ולכן הכול נרשם והשאר מסונן.

   החתימה נבדקת בכל POST. בלעדיה כל מי שמכיר את הכתובת יכול
   לשלוח "הסר" בשם לקוח אחר, או להפוך את היומן שלנו לזבל.

   משתני סביבה:
     WHATSAPP_VERIFY_TOKEN   מחרוזת שאתה ממציא, ומזין גם אצל מטא
     WHATSAPP_APP_SECRET     App settings -> Basic
     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
*/
'use strict';

const crypto = require('node:crypto');
const { projectUrl } = require('./_supabase.js');

/* מילות ההסרה. לא רשימה של שפה אחת: הלקוח כותב במה שנוח לו,
   והמערכת נמכרת בשמונה שפות. הבדיקה היא על ההודעה כולה אחרי
   ניקוי, כי "הסר אותי בבקשה" הוא אותה בקשה בדיוק. */
const STOP_WORDS = [
  'הסר', 'הסירו', 'הסירני', 'הסרה', 'להסיר', 'תסירו', 'תסיר', 'די', 'הפסיקו',
  'stop', 'unsubscribe', 'remove', 'optout', 'quit', 'cancel',
  'توقف', 'إلغاء', 'الغاء',
  'stopp', 'abmelden', 'baja', 'parar', 'arret', 'arrêt',
  'стоп', 'отписаться', 'отпишите'
];

function send(res, status, body, type) {
  res.statusCode = status;
  res.setHeader('Content-Type', type || 'application/json; charset=utf-8');
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function db(path, options) {
  const opts = options || {};
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(projectUrl() + '/rest/v1' + path, {
    method: opts.method || 'GET',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=minimal'
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const text = await response.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch (err) { body = { message: text }; } }
  return { ok: response.ok, status: response.status, body: body };
}

/* הגוף הגולמי, ולא מפורק. החתימה מחושבת על הבתים שנשלחו, ולא
   על JSON שנבנה מחדש -- סדר מפתחות או רווח שהשתנה שוברים אותה. */
function rawBody(req) {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(JSON.stringify(req.body));
  }
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

/* השוואה בזמן קבוע. השוואת מחרוזות רגילה נעצרת בתו הראשון
   שנבדל, וההפרש הזה נמדד. */
function sameSignature(expected, given) {
  const a = Buffer.from(String(expected || ''), 'utf8');
  const b = Buffer.from(String(given || ''), 'utf8');
  if (a.length !== b.length || !a.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function signatureOk(raw, header) {
  const secret = String(process.env.WHATSAPP_APP_SECRET || '').trim();
  /* בלי סוד אין אימות, ואז אין קבלה. שער פתוח אינו ברירת מחדל
     סבירה גם בפיתוח: בדיוק כך הוא נשאר פתוח באוויר. */
  if (!secret) return false;
  const given = String(header || '');
  if (given.indexOf('sha256=') !== 0) return false;
  const digest = 'sha256=' + crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  return sameSignature(digest, given);
}

function normalizeText(value) {
  return String(value == null ? '' : value)
    .toLowerCase().replace(/[\s‏‎.,!?"'()-]+/g, '');
}

function isStopRequest(text) {
  const clean = normalizeText(text);
  if (!clean) return false;
  return STOP_WORDS.some(function (word) {
    const target = normalizeText(word);
    /* הכלה ולא שוויון: "הסר אותי בבקשה" ו"please stop" הם אותה
       בקשה. הכיוון הזה עלול לתפוס יותר מדי, וזה בכוונה -- הסרה
       שגויה עולה לנו לקוח אחד ברשימה, והחמצה עולה תביעה. */
    return clean.indexOf(target) !== -1;
  });
}

/* המספר כפי שוואטסאפ שולח אותו: ספרות בלבד, בינלאומי. הטלפון
   אצלנו נשמר כפי שהלקוח הקליד אותו ("054-1234567"), ולכן
   ההשוואה נעשית על הספרות בלבד, ומהסוף: 972541234567 מול
   0541234567 חולקים תשע ספרות אחרונות. */
function tail(value, count) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.slice(-(count || 9));
}

async function optOut(from) {
  const suffix = tail(from);
  if (suffix.length < 7) return null;
  /* PostgREST אינו יודע להשוות "רק ספרות", ולכן נשלפות החברות
     שסיומת המספר שלהן מתאימה, והבדיקה המדויקת נעשית כאן. */
  const rows = await db('/companies?select=id,phone&wa_opt_out_at=is.null' +
    '&phone=not.is.null&limit=500', { prefer: 'return=representation' });
  if (!rows.ok) return null;
  const match = (rows.body || []).filter(function (row) {
    return tail(row.phone) === suffix;
  })[0];
  if (!match) return null;
  await db('/companies?id=eq.' + encodeURIComponent(match.id), {
    method: 'PATCH', body: { wa_opt_out_at: new Date().toISOString() }
  });
  return match.id;
}

module.exports = async function handler(req, res) {
  /* האימות מול מטא. נעשה פעם אחת בהגדרה, וגם כשמטא מחדשת את
     המנוי לאירועים. */
  if (req.method === 'GET') {
    const url = new URL(req.url, 'https://setshifts.com');
    const token = String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
    const mode = url.searchParams.get('hub.mode');
    const given = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (token && mode === 'subscribe' && given === token) {
      return send(res, 200, String(challenge || ''), 'text/plain; charset=utf-8');
    }
    return send(res, 403, { message: 'Forbidden' });
  }

  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });

  const raw = await rawBody(req);
  if (!signatureOk(raw, req.headers['x-hub-signature-256'])) {
    return send(res, 401, { message: 'Bad signature' });
  }

  let payload = null;
  try { payload = JSON.parse(raw || '{}'); } catch (err) { payload = null; }
  if (!payload) return send(res, 200, { ok: true, ignored: 'unreadable' });

  const actions = [];
  const entries = payload.entry || [];
  for (const entry of entries) {
    for (const change of (entry.changes || [])) {
      const value = (change && change.value) || {};
      for (const message of (value.messages || [])) {
        const text = (message.text && message.text.body) ||
          (message.button && message.button.text) ||
          (message.interactive && message.interactive.button_reply &&
            message.interactive.button_reply.title) || '';
        if (!isStopRequest(text)) { actions.push({ from: message.from, action: 'ignored' }); continue; }
        let company = null;
        try { company = await optOut(message.from); }
        catch (err) { actions.push({ from: message.from, action: 'error' }); continue; }
        actions.push({ from: message.from, action: company ? 'opted-out' : 'unknown-number' });
      }
    }
  }

  /* תמיד 200. מטא מנסה שוב על כל תשובה אחרת, ואירוע שאיננו
     יודעים לטפל בו אינו סיבה לקבל אותו שוב ושוב. */
  return send(res, 200, { ok: true, actions: actions });
};

module.exports.isStopRequest = isStopRequest;
module.exports.signatureOk = signatureOk;
module.exports.tail = tail;
