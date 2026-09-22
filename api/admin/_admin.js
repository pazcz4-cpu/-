/* שער המשרד האחורי.

   ההבחנה שהכל כאן נשען עליה: "בעלים של חברה" ו"בעלים של המוצר"
   הם שני דברים שונים לגמרי. ב-company_users יש role='owner' –
   זה הלקוח, הבעלים של העסק שלו. הוא אינו אמור לראות אף לקוח אחר.
   בעלים של המוצר הוא מי שרואה את כולם.

   ולכן הזהות הזו אינה יושבת בבסיס הנתונים. לו הייתה שם, היא
   הייתה שורה שאפשר לכתוב אליה – ובאג הרשאות אחד היה הופך לקוח
   לבעל המוצר. היא יושבת במשתנה סביבה, שרק מי שיש לו גישה לחשבון
   ה-Vercel יכול לשנות:

     PLATFORM_OWNER_EMAILS   כתובות, מופרדות בפסיק

   בלי המשתנה הזה אין משרד אחורי בכלל. זו ברירת מחדל נכונה: פריסה
   שנשכח בה משתנה תיסגר, לא תיפתח לכולם.

   קובץ שמתחיל בקו תחתון אינו נקודת קצה ב-Vercel. */
'use strict';

const { projectUrl } = require('../_supabase.js');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  /* המשרד האחורי אינו עמוד ציבורי ואינו נשמר במטמון בשום שלב */
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/* גישה לבסיס הנתונים עם מפתח השרת, כלומר בלי כללי הבידוד.
   זו בדיוק הסיבה שהשער שמעל חייב להיות הדוק. */
async function db(path, options) {
  const opts = options || {};
  const url = projectUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(url + '/rest/v1' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation'
    }, opts.headers || {}),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const text = await response.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch (err) { body = { message: text }; } }
  return { ok: response.ok, status: response.status, body };
}

function ownerEmails() {
  return String(process.env.PLATFORM_OWNER_EMAILS || '')
    .split(',')
    .map(function (item) { return item.trim().toLowerCase(); })
    .filter(Boolean);
}

/* מחזיר { user } או { error }.
   הזהות נקראת תמיד מהאסימון מול Supabase, ולעולם לא מגוף הבקשה. */
async function requirePlatformOwner(req) {
  const allowed = ownerEmails();
  if (!allowed.length) return { error: 503, message: 'Back office is not enabled' };

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { error: 401, message: 'not signed in' };

  const url = projectUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const me = await fetch(url + '/auth/v1/user', {
    headers: { apikey: key, Authorization: 'Bearer ' + token }
  });
  if (!me.ok) return { error: 401, message: 'not signed in' };
  const user = await me.json();
  if (!user || !user.id || !user.email) return { error: 401, message: 'not signed in' };

  /* אותה תשובה בדיוק כמו למי שאינו מחובר. מי שמנסה לנחש אינו
     אמור ללמוד מכאן שהכתובת שלו קיימת אבל אינה מורשית. */
  if (allowed.indexOf(String(user.email).toLowerCase()) === -1) {
    return { error: 403, message: 'not allowed' };
  }
  return { user: user };
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch (err) { return Promise.resolve({}); }
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (err) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

/* שלד אחיד לכל נקודת קצה של המשרד האחורי */
function endpoint(handle) {
  return async function (req, res) {
    if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return send(res, 500, { message: 'Server is not configured' });
    }
    const who = await requirePlatformOwner(req);
    if (who.error) return send(res, who.error, { message: who.message });

    try {
      const body = await readBody(req);
      const result = await handle({ user: who.user, body: body, db: db });
      return send(res, result.status || 200, result.body || { ok: true });
    } catch (err) {
      return send(res, 500, { message: (err && err.message) || 'Unexpected error' });
    }
  };
}

module.exports = {
  send: send, db: db, endpoint: endpoint,
  requirePlatformOwner: requirePlatformOwner, ownerEmails: ownerEmails, readBody: readBody
};
