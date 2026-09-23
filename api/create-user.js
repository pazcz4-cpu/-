/* יצירת משתמש לחברה – רצה בשרת של Vercel, לא בדפדפן.
   יצירת משתמש דורשת את מפתח הניהול של Supabase, ומפתח כזה אסור
   שיגיע לדפדפן: מי שמחזיק בו יכול לקרוא ולשנות הכל בכל החברות.

   שני מסלולים יוצאים מכאן:

   1. הזמנה (ברירת המחדל) – המשתמש נוצר בלי סיסמה ומקבל קישור
      לקביעת אחת. אף סיסמה אינה עוברת דרך המנהל.

   2. שליחת פרטי כניסה (mode: 'access') – המערכת מגרילה סיסמה,
      קובעת אותה, ושולחת לעובד מייל עם שם המשתמש, הסיסמה והוראות
      להוספת המערכת למסך הבית. הסיסמה אינה חוזרת לדפדפן של
      המנהל: היא נולדת בשרת, הולכת לדואר, ונשכחת.

   משתני סביבה נדרשים (Vercel → Settings → Environment Variables):
     SUPABASE_URL              כתובת הפרויקט
     SUPABASE_SERVICE_ROLE_KEY מפתח service_role  (סודי!)
     RESEND_API_KEY, MAIL_FROM  לשליחת פרטי כניסה (ראו api/_mail.js)
     APP_URL                   לא חובה. כתובת המערכת במייל לעובד.
*/
'use strict';

const { projectUrl } = require('./_supabase.js');
const mail = require('./_mail.js');
const accessMail = require('./_access-email.js');

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


/* ===== שליחת פרטי כניסה =====

   הכתובת שבמייל נגזרת בשרת ולא מגיעה מהדפדפן: קישור שהמנהל
   שולט בו, שיוצא מהדומיין שלנו ולידו סיסמה אמיתית, הוא דף דיוג
   מוכן מראש. */
function appUrl(req) {
  const fromEnv = String(process.env.APP_URL || '').trim();
  if (/^https?:\/\//.test(fromEnv)) return fromEnv.replace(/\/+$/, '') + '/';
  const raw = req.headers['x-forwarded-host'] || req.headers.host || '';
  const host = String(raw).split(',')[0].trim();
  if (!host) return 'https://www.setshifts.com/app/';
  const local = /^(localhost|127\.|\[?::1)/.test(host);
  return (local ? 'http://' : 'https://') + host + '/app/';
}

function logoUrl(app) {
  try { return new URL('/brand/logo-lockup.png', app).toString(); }
  catch (err) { return ''; }
}

async function sendAccess(req, res, input, ctx) {
  const { url, serviceKey, caller } = ctx;
  const email = String(input.email).trim().toLowerCase();

  if (!mail.ready()) {
    return send(res, 503, { message: 'Email sending is not configured' });
  }

  /* שם העסק מגיע מהשרת. הוא מופיע במייל כשולח, ומנהל שיכול
     לכתוב אותו בעצמו יכול לשלוח מייל בשם עסק אחר. */
  const company = await callSupabase(url,
    '/rest/v1/companies?id=eq.' + encodeURIComponent(caller.company_id) + '&select=name',
    serviceKey, {});
  const companyName = (company.ok && company.body && company.body[0] &&
    company.body[0].name) || 'SetShifts';

  /* האם כבר יש למייל הזה חשבון בחברה הזו. חיפוש מוגבל לחברה של
     הקורא: מנהל אינו יכול לאפס סיסמה של מישהו בעסק אחר. */
  const existing = await callSupabase(url,
    '/rest/v1/company_users?company_id=eq.' + encodeURIComponent(caller.company_id) +
    '&email=eq.' + encodeURIComponent(email) +
    '&select=id,role,employee_id,name,active', serviceKey, {});
  const found = existing.ok && existing.body && existing.body[0];

  if (found && found.role === 'owner') {
    /* הבעלים מחליף סיסמה בעצמו, דרך "שכחתי סיסמה". מנהל שמאפס
       את הסיסמה של הבעלים משתלט על החשבון. */
    return send(res, 403, { message: 'The account owner sets their own password' });
  }

  const password = accessMail.newPassword();
  const name = String(input.name || '').trim() || (found && found.name) || email;
  const role = ROLES.includes(input.role) ? input.role : 'employee';
  let userId = found ? found.id : null;
  let created = false;

  if (found) {
    const updated = await callSupabase(url,
      '/auth/v1/admin/users/' + encodeURIComponent(found.id), serviceKey, {
        method: 'PUT',
        body: { password: password, email_confirm: true }
      });
    if (!updated.ok) {
      return send(res, updated.status || 500, {
        message: (updated.body && (updated.body.msg || updated.body.message)) ||
          'Could not set a password'
      });
    }
  } else {
    const fresh = await callSupabase(url, '/auth/v1/admin/users', serviceKey, {
      method: 'POST',
      body: {
        email: email, password: password, email_confirm: true,
        user_metadata: { name: name }
      }
    });
    if (!fresh.ok || !fresh.body || !fresh.body.id) {
      const message = (fresh.body && (fresh.body.msg || fresh.body.message)) ||
        'Could not create the user';
      return send(res, fresh.status === 422 ? 409 : fresh.status || 500, { message });
    }
    userId = fresh.body.id;
    created = true;

    const linked = await callSupabase(url, '/rest/v1/company_users', serviceKey, {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: [{
        id: userId, company_id: caller.company_id, email: email, name: name,
        role: role, employee_id: input.employeeId || null, active: true,
        invited_at: new Date().toISOString()
      }]
    });
    if (!linked.ok) {
      await callSupabase(url, '/auth/v1/admin/users/' + userId, serviceKey,
        { method: 'DELETE' });
      return send(res, 500, {
        message: (linked.body && linked.body.message) || 'Could not link the user'
      });
    }
  }

  /* הקישור לכרטיס העובד נשמר גם למי שכבר היה קיים: בלי כרטיס
     הוא נכנס למערכת ולא רואה בה כלום. */
  if (!created) {
    const patch = { invited_at: new Date().toISOString() };
    if (input.employeeId && !found.employee_id) patch.employee_id = input.employeeId;
    await callSupabase(url,
      '/rest/v1/company_users?id=eq.' + encodeURIComponent(userId) +
      '&company_id=eq.' + encodeURIComponent(caller.company_id), serviceKey,
      { method: 'PATCH', body: patch });
  }

  const app = appUrl(req);
  const letter = accessMail.build({
    lang: input.lang, name: name, company: companyName,
    email: email, password: password, appUrl: app, logoUrl: logoUrl(app)
  });
  const sent = await mail.send({
    to: email, subject: letter.subject, html: letter.html, text: letter.text
  });

  if (!sent.ok) {
    /* החשבון כבר קיים והסיסמה כבר נקבעה, ולכן אי אפשר לבטל –
       אבל אפשר להגיד את זה בדיוק, ושליחה חוזרת מגרילה סיסמה
       חדשה ממילא. */
    return send(res, 502, {
      message: 'The account is ready but the email was not sent: ' + (sent.message || '')
    });
  }

  return send(res, 200, {
    id: userId, email: email, name: name, role: role,
    employeeId: input.employeeId || (found && found.employee_id) || null,
    created: created, sent: true
  });
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

  /* שליחת פרטי כניסה היא מסלול נפרד: היא מגרילה סיסמה, שולחת
     אותה בדואר, ואינה מחזירה אותה לדפדפן. */
  if (input.mode === 'access') {
    return sendAccess(req, res, input, { url, serviceKey, caller });
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
    active: true,
    /* מתי נשלחה ההזמנה. בלי זה המנהל אינו יודע אם העובד עוד לא
       הספיק להיכנס או שהקישור פג לפני שבוע. משתמש שנוצר עם סיסמה
       לא הוזמן כלל, ולכן אין לו תאריך. */
    invited_at: withPassword ? null : new Date().toISOString()
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
    invitedAt: saved.invited_at || null, joinedAt: saved.joined_at || null,
    /* המסך אומר למנהל מה בעצם קרה: נשלחה הזמנה, או נקבעה סיסמה */
    invited: !withPassword
  });
};
