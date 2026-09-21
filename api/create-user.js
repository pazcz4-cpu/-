/* יצירת משתמש לחברה – רצה בשרת של Vercel, לא בדפדפן.
   יצירת משתמש דורשת את מפתח הניהול של Supabase, ומפתח כזה אסור
   שיגיע לדפדפן: מי שמחזיק בו יכול לקרוא ולשנות הכל בכל החברות.

   משתני סביבה נדרשים (Vercel → Settings → Environment Variables):
     SUPABASE_URL              כתובת הפרויקט
     SUPABASE_SERVICE_ROLE_KEY מפתח service_role  (סודי!)
*/
'use strict';

const ROLES = ['manager', 'employee'];

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

  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return send(res, 500, { message: 'Server is not configured' });
  }

  const auth = req.headers.authorization || '';
  const callerToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!callerToken) { return send(res, 401, { message: 'not signed in' }); }

  let input = req.body;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch (err) { input = null; } }
  if (!input || !input.email || !input.password) {
    return send(res, 400, { message: 'Email and password are required' });
  }
  if (String(input.password).length < 6) {
    return send(res, 400, { message: 'The password must be at least 6 characters' });
  }

  /* מי הקורא? נבדק מול Supabase עם האסימון שלו, ולא לפי מה שנשלח בגוף. */
  const me = await callSupabase(url, '/auth/v1/user', serviceKey, { token: callerToken });
  if (!me.ok || !me.body || !me.body.id) {
    return send(res, 401, { message: 'not signed in' });
  }

  /* התפקיד והחברה נקראים מהשרת, כדי שלא יהיה אפשר להתחזות למנהל */
  const profile = await callSupabase(url,
    '/rest/v1/company_users?id=eq.' + encodeURIComponent(me.body.id) +
    '&select=company_id,role,active', serviceKey, {});
  const caller = profile.ok && profile.body && profile.body[0];
  if (!caller || !caller.active || !['owner', 'manager'].includes(caller.role)) {
    return send(res, 403, { message: 'not allowed' });
  }

  const role = ROLES.includes(input.role) ? input.role : 'employee';

  /* יצירת המשתמש. email_confirm מוגדר כדי שהעובד יוכל להתחבר מיד
     עם הסיסמה הראשונית שהמנהל נתן לו. */
  const created = await callSupabase(url, '/auth/v1/admin/users', serviceKey, {
    method: 'POST',
    body: {
      email: String(input.email).trim().toLowerCase(),
      password: String(input.password),
      email_confirm: true,
      user_metadata: { name: input.name || '' }
    }
  });
  if (!created.ok || !created.body || !created.body.id) {
    const message = (created.body && (created.body.msg || created.body.message)) || 'Could not create the user';
    return send(res, created.status === 422 ? 409 : created.status || 500, { message });
  }

  const row = {
    id: created.body.id,
    company_id: caller.company_id,
    email: String(input.email).trim().toLowerCase(),
    name: String(input.name || '').trim() || String(input.email).trim().toLowerCase(),
    role: role,
    employee_id: input.employeeId || null,
    active: true
  };

  const linked = await callSupabase(url, '/rest/v1/company_users', serviceKey, {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: [row]
  });

  if (!linked.ok) {
    /* אם הקישור נכשל, אסור להשאיר משתמש יתום שיכול להתחבר לשום מקום */
    await callSupabase(url, '/auth/v1/admin/users/' + created.body.id, serviceKey,
      { method: 'DELETE' });
    return send(res, 500, {
      message: (linked.body && linked.body.message) || 'Could not link the user'
    });
  }

  const saved = (linked.body && linked.body[0]) || row;
  return send(res, 200, {
    id: saved.id, email: saved.email, name: saved.name,
    role: saved.role, employeeId: saved.employee_id, active: saved.active
  });
};
