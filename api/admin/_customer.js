/* הקמת לקוח חדש מהמשרד האחורי, בלי כרטיס אשראי.

   זו הדרך היחידה להקים לקוח בלי כרטיס. הרשמה מהאתר או מקישור של
   סוכן דורשת כרטיס כשהסליקה חיה (ראו accessState: card-required),
   וההרשמה עצמה אינה יכולה לסמן "ללא תשלום": העמודות free_access
   ו-source אינן ברשימת העמודות שהלקוח רשאי לכתוב.

   מה נוצר: משתמש בבעלים (Supabase Auth), חברה בפיילוט ללא תשלום
   (פעילה, לא מחויבת, ללא תאריך סיום או עד תאריך שנבחר), שורת בעלים
   וקובץ הגדרות ריק -- כמו שנוצר בהרשמה רגילה, כדי שהלקוח ייפתח באשף
   ההקמה הרגיל. אפשר לשייך לסוכן מהרגע הראשון.

   הסיסמה נוצרת כאן ומוחזרת למסך (ואפשר גם לשלוח במייל); היא אינה
   נשמרת בשום מקום אצלנו. הבעלים מחליף אותה ב"שכחתי סיסמה". */
'use strict';

const { projectUrl } = require('../_supabase.js');
const AccessEmail = require('../_access-email.js');
const Mail = require('../_mail.js');
const Model = require('../../js/backend/model.js');

const OPEN_ENDED = '2099-12-31T00:00:00.000Z';

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200;
}

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

function emailFor(name, company, email, password) {
  const base = (process.env.PUBLIC_BASE_URL || 'https://setshifts.com').replace(/\/+$/, '');
  const link = base + '/app/';
  const subject = 'פרטי הכניסה שלך ל-SetShifts';
  const text = 'שלום ' + name + ',\n\nנפתח עבורך חשבון ל-' + company + ' ב-SetShifts.\n' +
    'כניסה: ' + link + '\nשם משתמש: ' + email + '\nסיסמה: ' + password + '\n\n' +
    'אפשר להחליף סיסמה בכל רגע: במסך הכניסה לוחצים "שכחתי סיסמה".\nצוות SetShifts';
  const html = '<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">' +
    '<p>שלום ' + escapeHtml(name) + ',</p>' +
    '<p>נפתח עבורך חשבון ל-<b>' + escapeHtml(company) + '</b> ב-SetShifts.</p>' +
    '<p><a href="' + escapeHtml(link) + '">כניסה למערכת</a></p>' +
    '<p>שם משתמש: <b dir="ltr">' + escapeHtml(email) + '</b><br>סיסמה: <b dir="ltr">' +
    escapeHtml(password) + '</b></p>' +
    '<p style="color:#555;font-size:13px">אפשר להחליף סיסמה בכל רגע: במסך הכניסה לוחצים "שכחתי סיסמה".</p>' +
    '<p>צוות SetShifts</p></div>';
  return { subject: subject, text: text, html: html };
}

function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = async function ({ user, body, db }) {
  const b = body || {};
  const reason = String(b.reason || '').trim();
  const companyName = String(b.companyName || '').trim();
  const ownerName = String(b.ownerName || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const phone = String(b.phone || '').trim();
  const taxId = String(b.taxId || '').trim();
  const planId = String(b.plan || 'starter');
  const agentId = String(b.agentId || '').trim();
  const send = b.send === true;

  if (reason.length < 3) return { status: 400, body: { message: 'A reason is required' } };
  if (!companyName || companyName.length > 120) {
    return { status: 400, body: { message: 'Business name is required (up to 120 characters)' } };
  }
  if (!validEmail(email)) return { status: 400, body: { message: 'Enter a valid owner email' } };
  if (phone.replace(/\D/g, '').length < 7) {
    return { status: 400, body: { message: 'A contact phone number is required' } };
  }
  if (!Model.PLANS[planId]) return { status: 400, body: { message: 'Unknown plan' } };

  let until = null;
  const rawUntil = String(b.until || '').trim();
  if (rawUntil) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawUntil)) {
      return { status: 400, body: { message: 'until must be a date (YYYY-MM-DD)' } };
    }
    until = new Date(rawUntil + 'T23:59:59.000Z');
    if (isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      return { status: 400, body: { message: 'until must be in the future' } };
    }
  }

  let agent = null;
  if (agentId) {
    const found = await db('/sales_agents?id=eq.' + encodeURIComponent(agentId) + '&select=id,code,name');
    agent = found.ok && found.body && found.body[0];
    if (!agent) return { status: 404, body: { message: 'Agent not found' } };
  }

  const password = String(b.password || '') || AccessEmail.newPassword();
  if (password.length < 8 || password.length > 72) {
    return { status: 400, body: { message: 'password must be 8–72 characters' } };
  }

  const created = await authCall('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: email, password: password, email_confirm: true,
      user_metadata: { name: ownerName || email } }
  });
  if (!created.ok || !created.body || !created.body.id) {
    if (created.status === 422) {
      return { status: 409, body: { message: 'The address ' + email + ' already has an account' } };
    }
    return { status: created.status || 500, body: { message: 'Could not create the user' } };
  }
  const authId = created.body.id;
  async function rollback(companyId) {
    if (companyId) {
      await db('/companies?id=eq.' + encodeURIComponent(companyId), { method: 'DELETE', prefer: 'return=minimal' });
    }
    await authCall('/auth/v1/admin/users/' + encodeURIComponent(authId), { method: 'DELETE' });
  }

  const end = until ? until.toISOString() : OPEN_ENDED;
  const now = new Date().toISOString();
  const row = {
    name: companyName, phone: phone, plan: planId, status: 'active',
    valid_until: end, current_period_end: end,
    free_access: true, free_until: until ? until.toISOString() : null,
    source: agent ? 'agent' : 'direct'
  };
  if (taxId) row.tax_id = taxId;
  if (agent) { row.agent_id = agent.id; row.referral_code = agent.code; row.attributed_at = now; }

  const company = await db('/companies', { method: 'POST', body: [row] });
  const companyRow = company.ok && company.body && company.body[0];
  if (!companyRow) {
    await rollback(null);
    return { status: 500, body: { message: 'Could not create the company (has the migration run?)' } };
  }

  const linked = await db('/company_users', {
    method: 'POST', prefer: 'return=minimal',
    body: [{ id: authId, company_id: companyRow.id, email: email,
      name: ownerName || email, role: 'owner', active: true, invited_at: now }]
  });
  const config = linked.ok
    ? await db('/company_configs', { method: 'POST', prefer: 'return=minimal',
      body: [{ company_id: companyRow.id, config: {} }] })
    : null;
  if (!linked.ok || !config || !config.ok) {
    await rollback(companyRow.id);
    return { status: 500, body: { message: 'Could not finish creating the customer' } };
  }

  let emailed = false;
  let emailError = null;
  if (send) {
    const mail = emailFor(ownerName || email, companyName, email, password);
    const result = await Mail.send({ to: email, subject: mail.subject, text: mail.text, html: mail.html });
    emailed = result.ok === true;
    if (!emailed) emailError = result.reason === 'not_configured' ? 'not_configured' : 'failed';
  }

  /* הסיסמה אינה נרשמת ביומן */
  await db('/billing_events', { method: 'POST', prefer: 'return=minimal', body: [{
    id: 'admin:' + companyRow.id + ':create-customer:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8),
    provider: 'admin', company_id: companyRow.id, type: 'admin.create-customer',
    payload: { by: user.email, reason: reason, at: now,
      detail: { owner: email, plan: planId, freeUntil: until ? until.toISOString() : null,
        agentId: agent ? agent.id : null, emailed: emailed } }
  }] });

  return { body: { ok: true, companyId: companyRow.id, email: email, password: password,
    emailed: emailed, emailError: emailError, loginUrl: (process.env.PUBLIC_BASE_URL || 'https://setshifts.com').replace(/\/+$/, '') + '/app/' } };
};
