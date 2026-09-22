/* ביטול הזמנה תלויה – רץ בשרת של Vercel, לא בדפדפן.
   מחיקת משתמש דורשת את מפתח הניהול של Supabase, ומפתח כזה אסור
   שיגיע לדפדפן: מי שמחזיק בו יכול לקרוא ולשנות הכל בכל החברות.

   מה מותר למחוק כאן: אך ורק מוזמן שטרם נכנס, ואך ורק בחברה של
   הקורא. מי שכבר נכנס אינו הזמנה תלויה אלא משתמש – אותו מנטרלים
   (active=false) ולא מוחקים, כדי שלא ייעלמו איתו הרשומות שלו.

   משתני סביבה נדרשים (Vercel → Settings → Environment Variables):
     SUPABASE_URL              כתובת הפרויקט
     SUPABASE_SERVICE_ROLE_KEY מפתח service_role  (סודי!)
*/
'use strict';

const { projectUrl } = require('./_supabase.js');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function callSupabase(url, path, key, options) {
  const opts = options || {};
  const response = await fetch(url + path, {
    method: opts.method || 'GET',
    headers: Object.assign({
      apikey: key,
      Authorization: 'Bearer ' + (opts.token || key),
      'Content-Type': 'application/json'
    }, opts.headers || {}),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const text = await response.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch (err) { body = { message: text }; } }
  return { ok: response.ok, status: response.status, body };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { return send(res, 405, { message: 'Method not allowed' }); }

  const url = projectUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return send(res, 500, { message: 'Server is not configured' });
  }

  const auth = req.headers.authorization || '';
  const callerToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!callerToken) { return send(res, 401, { message: 'not signed in' }); }

  let input = req.body;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch (err) { input = null; } }
  const userId = input && typeof input.userId === 'string' ? input.userId.trim() : '';
  if (!userId) { return send(res, 400, { message: 'A user is required' }); }

  /* מי הקורא? נבדק מול Supabase עם האסימון שלו, ולא לפי מה שנשלח בגוף. */
  const me = await callSupabase(url, '/auth/v1/user', serviceKey, { token: callerToken });
  if (!me.ok || !me.body || !me.body.id) {
    return send(res, 401, { message: 'not signed in' });
  }

  const profile = await callSupabase(url,
    '/rest/v1/company_users?id=eq.' + encodeURIComponent(me.body.id) +
    '&select=company_id,role,active', serviceKey, {});
  const caller = profile.ok && profile.body && profile.body[0];
  if (!caller || !caller.active || !['owner', 'manager'].includes(caller.role)) {
    return send(res, 403, { message: 'not allowed' });
  }

  /* המטרה נקראת מהשרת. לא סומכים על מה שנשלח: חברה, תפקיד ומצב
     ההזמנה נקבעים לפי השורה עצמה. */
  const found = await callSupabase(url,
    '/rest/v1/company_users?id=eq.' + encodeURIComponent(userId) +
    '&select=id,company_id,role,joined_at', serviceKey, {});
  const target = found.ok && found.body && found.body[0];
  if (!target || target.company_id !== caller.company_id) {
    /* חברה אחרת נראית בדיוק כמו משתמש שאינו קיים */
    return send(res, 404, { message: 'user not found' });
  }
  if (target.role === 'owner') {
    return send(res, 403, { message: 'The account owner cannot be removed' });
  }
  if (target.joined_at) {
    return send(res, 409, { message: 'This user has already joined' });
  }

  /* מחיקה ב-auth מפילה בשרשור גם את השורה ב-company_users */
  const removed = await callSupabase(url, '/auth/v1/admin/users/' + encodeURIComponent(userId),
    serviceKey, { method: 'DELETE' });
  if (!removed.ok && removed.status !== 404) {
    return send(res, removed.status || 500, {
      message: (removed.body && (removed.body.msg || removed.body.message)) ||
        'Could not cancel the invitation'
    });
  }

  /* חגורה ושלייקס: אם ה-cascade לא הוגדר, השורה עדיין מוחקת */
  await callSupabase(url, '/rest/v1/company_users?id=eq.' + encodeURIComponent(userId),
    serviceKey, { method: 'DELETE' });

  return send(res, 200, { id: userId, cancelled: true });
};
