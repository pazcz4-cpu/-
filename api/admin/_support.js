/* כניסת תמיכה: בעל המוצר נכנס למערכת של לקוח, עם כל הנתונים,
   בלי לבקש מהלקוח סיסמה או קוד.

   איך: Supabase מייצר אסימון חד־פעמי (magiclink) לבעלים של החברה,
   בלי לשלוח לו שום מייל. האסימון נמסר לדפדפן שלך בכתובת
   /app/?support=..., והאפליקציה מחליפה אותו בהתחברות רגילה כבעלים.
   הלקוח אינו מתנתק ואינו רואה כלום; האסימון נצרך בשימוש אחד ופג
   בתוך שעה.

   מה שמגן עליו:
   · רק בעל מוצר (שער המשרד האחורי), וסיבה היא שדה חובה.
   · כל כניסה נרשמת ביומן: מי, לאיזו חברה, מתי ולמה.
   · האפליקציה נפתחת במצב תמיכה: אחסון של הלשונית בלבד (נסגרת
     הלשונית -- נגמרת הכניסה), ופס אדום קבוע שאי אפשר לפספס.
   · הפעולות שתעשה בפנים מתבצעות כבעלים של הלקוח, כלומר הן נראות
     אצלו כשלו. לכן הפס. */
'use strict';

const { projectUrl } = require('../_supabase.js');

async function authCall(path, options) {
  const opts = options || {};
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(projectUrl() + path, {
    method: opts.method || 'GET',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const text = await response.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch (err) { body = { message: text }; } }
  return { ok: response.ok, status: response.status, body: body };
}

module.exports = async function ({ user, body, db }) {
  const id = String((body && body.id) || '').trim();
  const reason = String((body && body.reason) || '').trim();
  if (!id) return { status: 400, body: { message: 'Missing company id' } };
  if (reason.length < 3) return { status: 400, body: { message: 'A reason is required' } };

  const key = encodeURIComponent(id);
  const companyCall = await db('/companies?id=eq.' + key + '&select=id,name,is_demo');
  const company = companyCall.ok && companyCall.body && companyCall.body[0];
  if (!company) return { status: 404, body: { message: 'Company not found' } };

  /* בעלים פעיל קודם; אם אין, מנהל פעיל. עובד אינו נכנס: אין לו
     הרשאות לראות ולטפל במה שהלקוח פנה עליו. */
  const usersCall = await db('/company_users?company_id=eq.' + key +
    '&active=eq.true&role=in.(owner,manager)&select=id,email,name,role&order=created_at.asc&limit=20');
  const people = (usersCall.ok && usersCall.body) || [];
  const target = people.filter(function (p) { return p.role === 'owner'; })[0] || people[0];
  if (!target || !target.email) {
    return { status: 409, body: { message: 'The company has no active owner or manager to enter as' } };
  }

  const generated = await authCall('/auth/v1/admin/generate_link', {
    method: 'POST', body: { type: 'magiclink', email: target.email }
  });
  const hash = generated.ok && generated.body &&
    (generated.body.hashed_token || (generated.body.properties && generated.body.properties.hashed_token));
  if (!hash) return { status: 502, body: { message: 'Could not open a support session' } };

  /* האסימון עצמו אינו נרשם ביומן */
  await db('/billing_events', { method: 'POST', prefer: 'return=minimal', body: [{
    id: 'admin:' + id + ':support-access:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8),
    provider: 'admin', company_id: id, type: 'admin.support-access',
    payload: { by: user.email, reason: reason, at: new Date().toISOString(),
      detail: { as: target.email, role: target.role } }
  }] });

  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  const url = base + '/app/?support=' + encodeURIComponent(hash) +
    '&co=' + encodeURIComponent(company.name || '');
  return { body: { ok: true, url: url, company: company.name, as: target.email, role: target.role } };
};
