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
  if (!input || !input.email) {
    return send(res, 400, { message: 'An email address is required' });
  }
  /* סיסמה אינה נדרשת: ברירת המחדל היא הזמנה בדואר, והמשתמש קובע
     סיסמה בעצמו. סיסמה מפורשת נתמכת כמסלול חילופי – למשל כשאין
     שירות דואר מוגדר – ואז היא חייבת להיות תקינה. */
  const withPassword = input.password !== undefined && input.password !== null &&
    String(input.password) !== '';
  if (withPassword && String(input.password).length < 6) {
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

  const email = String(input.email).trim().toLowerCase();

  /* ההזמנה יוצרת את המשתמש ושולחת לו קישור לקביעת סיסמה. כך אף
     סיסמה אינה עוברת דרך המנהל, דרך הדפדפן שלו או דרך וואטסאפ.
     redirect_to מחזיר את המוזמן לאותה כתובת שממנה הוזמן, כדי
     שהקישור יעבוד גם בסביבת בדיקה וגם בדומיין האמיתי. */
  const redirect = typeof input.redirectTo === 'string' && /^https?:\/\//.test(input.redirectTo)
    ? input.redirectTo
    : '';

  const created = withPassword
    ? await callSupabase(url, '/auth/v1/admin/users', serviceKey, {
      method: 'POST',
      body: {
        email: email,
        password: String(input.password),
        email_confirm: true,
        user_metadata: { name: input.name || '' }
      }
    })
    : await callSupabase(url, '/auth/v1/invite' +
      (redirect ? '?redirect_to=' + encodeURIComponent(redirect) : ''), serviceKey, {
      method: 'POST',
      body: { email: email, data: { name: input.name || '' } }
    });

  if (!created.ok || !created.body || !created.body.id) {
    const message = (created.body && (created.body.msg || created.body.message)) || 'Could not create the user';
    return send(res, created.status === 422 ? 409 : created.status || 500, { message });
  }

  const row = {
    id: created.body.id,
    company_id: caller.company_id,
    email: email,
    name: String(input.name || '').trim() || email,
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
    role: saved.role, employeeId: saved.employee_id, active: saved.active,
    /* המסך אומר למנהל מה בעצם קרה: נשלחה הזמנה, או נקבעה סיסמה */
    invited: !withPassword
  });
};
