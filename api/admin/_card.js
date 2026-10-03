/* החלפת כרטיס ללקוח, מהמשרד האחורי.

   למה קישור ולא הזנה: מספר כרטיס אינו עובר דרך המערכת שלנו, לא
   בדפדפן של הלקוח ולא בדפדפן של בעל המוצר. הכרטיס מוזן בעמוד
   התשלום של הספק (PayPlus) ונשמר שם כטוקן, אצלנו נשמר רק המזהה.
   לכן "להחליף כרטיס ללקוח" פירושו: לפתוח לו עמוד תשלום חדש
   ולהעביר לו את הקישור -- ביד, או במייל מכאן, לבעלים של החשבון.

   מה קורה אחרי שהכרטיס נשמר: ה-webhook מחליף את הטוקן, ואם החשבון
   היה חסום בגלל תשלום (פג, או נדחה מעבר לימי החסד) הוא חוזר למצב
   "תשלום לא עבר" ומנוע החיוב גובה בריצה הבאה. ראו webhook.js.

   הקישור תקף יומיים (הלקוח לא תמיד פותח מיד). */
'use strict';

const providers = require('../billing/_providers.js');
const Model = require('../../js/backend/model.js');
const Mail = require('../_mail.js');

const EXPIRY_MINUTES = 2880;

function esc(text) {
  return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function emailFor(company, url) {
  const name = company.name || '';
  const subject = 'עדכון אמצעי תשלום ב-SetShifts';
  const text = 'שלום,\n\n' +
    'כדי להמשיך להשתמש ב-SetShifts עבור ' + name + ' צריך לעדכן אמצעי תשלום.\n' +
    'לעדכון בעמוד תשלום מאובטח (הקישור תקף יומיים):\n' + url + '\n\n' +
    'פרטי הכרטיס מוזנים בעמוד התשלום של חברת הסליקה בלבד, ולא אצלנו.\n' +
    'אם הקישור פג, אפשר להשיב למייל הזה ונשלח חדש.\n\nצוות SetShifts';
  const html = '<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">' +
    '<p>שלום,</p>' +
    '<p>כדי להמשיך להשתמש ב-SetShifts עבור <b>' + esc(name) + '</b> צריך לעדכן אמצעי תשלום.</p>' +
    '<p><a href="' + esc(url) + '" style="display:inline-block;background:#4f35d9;color:#fff;' +
    'padding:10px 18px;border-radius:8px;text-decoration:none">עדכון אמצעי תשלום</a></p>' +
    '<p style="color:#555;font-size:13px">הקישור תקף יומיים. פרטי הכרטיס מוזנים בעמוד התשלום ' +
    'של חברת הסליקה בלבד, ולא אצלנו. אם הקישור פג, אפשר להשיב למייל הזה ונשלח חדש.</p>' +
    '<p>צוות SetShifts</p></div>';
  return { subject: subject, text: text, html: html };
}

module.exports = async function ({ user, body, db }) {
  const id = String((body && body.id) || '').trim();
  const reason = String((body && body.reason) || '').trim();
  const send = (body && body.send) === true;
  if (!id) return { status: 400, body: { message: 'Missing company id' } };
  if (reason.length < 3) return { status: 400, body: { message: 'A reason is required' } };

  const key = encodeURIComponent(id);
  const call = await db('/companies?id=eq.' + key + '&select=*');
  const company = call.ok && call.body && call.body[0];
  if (!company) return { status: 404, body: { message: 'Company not found' } };

  const ownerCall = await db('/company_users?company_id=eq.' + key +
    '&role=eq.owner&active=eq.true&select=email,name&order=created_at.asc&limit=1');
  const owner = ownerCall.ok && ownerCall.body && ownerCall.body[0];
  if (!owner || !owner.email) {
    return { status: 409, body: { message: 'The company has no active owner to send the link to' } };
  }

  const name = process.env.BILLING_PROVIDER || 'mock';
  const provider = providers[name];
  if (!provider || !provider.createCheckout || !(provider.live && provider.live() === true)) {
    return { status: 501, body: { message: 'The payment provider is not live yet' } };
  }

  const plan = Model.PLANS[company.plan] || Model.PLANS[Model.DEFAULT_PLAN];
  const base = process.env.PUBLIC_BASE_URL || '';
  let checkout;
  try {
    checkout = await provider.createCheckout({
      companyId: company.id,
      companyName: company.name,
      taxId: company.tax_id || '',
      email: owner.email,
      language: company.language || 'he',
      plan: plan.id,
      amount: plan.priceMonthly,
      currency: 'ILS',
      /* החלפת כרטיס לעולם אינה מחייבת בעמוד עצמו */
      saveCardOnly: true,
      expiryMinutes: EXPIRY_MINUTES,
      returnUrl: base + '/app/?billing=done',
      failureUrl: base + '/app/?billing=failed',
      cancelUrl: base + '/app/?billing=canceled'
    });
  } catch (err) {
    console.error('admin card link failed:', (err && err.message) || err);
    return { status: 502, body: { message: 'The payment page could not be opened' } };
  }
  const url = checkout && checkout.url;
  if (!url) return { status: 502, body: { message: 'The payment page could not be opened' } };

  let sent = false;
  let sendError = null;
  if (send) {
    const mail = emailFor(company, url);
    const result = await Mail.send({ to: owner.email, subject: mail.subject, text: mail.text, html: mail.html });
    sent = result.ok === true;
    if (!sent) sendError = result.reason === 'not_configured' ? 'not_configured' : 'failed';
  }

  /* הקישור עצמו אינו נרשם ביומן: הוא נותן למי שמחזיק בו להזין כרטיס
     על החשבון. נרשם מי יצר, למי נשלח, ולמה. */
  await db('/billing_events', { method: 'POST', prefer: 'return=minimal', body: [{
    id: 'admin:' + id + ':card-link:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8),
    provider: 'admin', company_id: id, type: 'admin.card-link',
    payload: { by: user.email, reason: reason, at: new Date().toISOString(),
      detail: { to: owner.email, emailed: sent, status: company.status, hadCard: !!company.billing_subscription_id } }
  }] });

  return { body: { ok: true, url: url, to: owner.email, emailed: sent, emailError: sendError,
    expiresInHours: EXPIRY_MINUTES / 60 } };
};
