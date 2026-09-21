/* עזרים משותפים לנקודות הקצה של החיוב:
   זיהוי הקורא, בדיקת הרשאה, וגישה לבסיס הנתונים עם מפתח השרת.

   העיקרון: התפקיד והחברה נקראים תמיד מהשרת לפי האסימון, ולעולם
   לא מגוף הבקשה. אחרת כל אחד יכול לשלוח "אני הבעלים של חברה X". */
'use strict';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function db(path, options) {
  const opts = options || {};
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(url + '/rest/v1' + path, {
    method: opts.method || 'GET',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation'
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const text = await response.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch (err) { body = { message: text }; } }
  return { ok: response.ok, status: response.status, body };
}

/* מחזיר { company, user } או null. מי שאינו בעלים אינו רשאי לגעת
   במנוי – גם מנהל לא. */
async function requireOwner(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { error: 401, message: 'not signed in' };

  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const me = await fetch(url + '/auth/v1/user', {
    headers: { apikey: key, Authorization: 'Bearer ' + token }
  });
  if (!me.ok) return { error: 401, message: 'not signed in' };
  const user = await me.json();
  if (!user || !user.id) return { error: 401, message: 'not signed in' };

  const profile = await db('/company_users?id=eq.' + encodeURIComponent(user.id) +
    '&select=company_id,role,active');
  const row = profile.ok && profile.body && profile.body[0];
  if (!row || !row.active) return { error: 403, message: 'not allowed' };
  if (row.role !== 'owner') return { error: 403, message: 'not allowed' };

  const company = await db('/companies?id=eq.' + encodeURIComponent(row.company_id) +
    '&select=*');
  const found = company.ok && company.body && company.body[0];
  if (!found) return { error: 404, message: 'company not found' };

  return { user: user, company: found };
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

/* שלד אחיד לכל נקודת קצה של חיוב */
function endpoint(handle) {
  return async function (req, res) {
    if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return send(res, 500, { message: 'Server is not configured' });
    }
    const who = await requireOwner(req);
    if (who.error) return send(res, who.error, { message: who.message });

    try {
      const body = await readBody(req);
      const result = await handle({ company: who.company, user: who.user, body: body, db: db });
      return send(res, result.status || 200, result.body || { ok: true });
    } catch (err) {
      return send(res, 500, { message: (err && err.message) || 'Unexpected error' });
    }
  };
}

module.exports = { send, db, requireOwner, readBody, endpoint };
