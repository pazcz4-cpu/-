/* פעולות על לקוח.

   ארבע פעולות, וכולן דרך נקודת קצה אחת – כי כולן צריכות בדיוק
   את אותם שני דברים: אימות שהמבצע הוא בעל המוצר, ורישום ביומן.

     extend-trial   הארכת ניסיון או תקופה, במתנה
     set-plan       שינוי חבילה
     set-status     שינוי מצב מנוי ידנית
     set-cancel     סימון או ביטול "יסתיים בסוף התקופה"

   ═══ למה יש יומן ═══
   פעולה שמזיזה כסף ואינה מתועדת היא פעולה שאי אפשר להסביר
   חצי שנה אחרי. "למה החברה הזו לא חויבה בינואר" צריכה להיות
   שאלה עם תשובה, לא עם ניחוש. לכן כל פעולה נרשמת: מי, מתי,
   מה השתנה, ולמה – והסיבה היא שדה חובה.

   היומן יושב ב-billing_events, אותה טבלה שבה יושבים החיובים,
   עם מזהה שמתחיל ב-admin:. כך "כל מה שקרה ללקוח הזה" הוא שאילתה
   אחת, ולא איחוד של שתי טבלאות שצריך לזכור לעשות. */
'use strict';

const Model = require('../../js/backend/model.js');

const DAY = 864e5;
const MAX_GIFT_DAYS = 365;
const STATUSES = ['trial', 'active', 'past_due', 'canceled', 'expired'];

function laterOf(a, b) {
  const first = a ? new Date(a).getTime() : 0;
  const second = b ? new Date(b).getTime() : 0;
  return new Date(Math.max(first, second));
}

module.exports = async function ({ user, body, db }) {
  const action = String((body && body.action) || '');
  const id = String((body && body.id) || '').trim();
  const reason = String((body && body.reason) || '').trim();

  if (!id) return { status: 400, body: { message: 'Missing company id' } };
  /* סיבה אינה פורמליות: בלעדיה היומן הופך לרשימת תאריכים */
  if (reason.length < 3) {
    return { status: 400, body: { message: 'A reason is required' } };
  }

  const key = encodeURIComponent(id);
  const call = await db('/companies?id=eq.' + key + '&select=*');
  const company = call.ok && call.body && call.body[0];
  if (!company) return { status: 404, body: { message: 'Company not found' } };

  const patch = {};
  const detail = {};

  if (action === 'extend-trial') {
    const days = Math.floor(Number(body && body.days));
    if (!(days > 0) || days > MAX_GIFT_DAYS) {
      return { status: 400, body: { message: 'days must be between 1 and ' + MAX_GIFT_DAYS } };
    }
    /* מרחיבים מהמאוחר מבין התוקף הנוכחי והיום. הארכה של לקוח
       שפג לפני חודש צריכה לתת לו את הימים מעכשיו, לא להעלים
       שלושים מהם. */
    const from = laterOf(company.valid_until, new Date().toISOString());
    const until = new Date(from.getTime() + days * DAY).toISOString();
    patch.valid_until = until;
    patch.current_period_end = until;
    /* לקוח שפג או בפיגור חוזר להיות פעיל בתקופה שניתנה לו */
    if (company.status === 'expired' || company.status === 'past_due') {
      patch.status = company.billing_subscription_id ? 'active' : 'trial';
    }
    detail.days = days;
    detail.until = until;
    detail.from = company.valid_until;

  } else if (action === 'set-plan') {
    const plan = String((body && body.plan) || '');
    if (!Model.PLANS[plan]) return { status: 400, body: { message: 'Unknown plan' } };
    patch.plan = plan;
    detail.from = company.plan;
    detail.to = plan;

  } else if (action === 'set-status') {
    const status = String((body && body.status) || '');
    if (STATUSES.indexOf(status) === -1) {
      return { status: 400, body: { message: 'Unknown status' } };
    }
    patch.status = status;
    detail.from = company.status;
    detail.to = status;

  } else if (action === 'set-cancel') {
    const cancel = !!(body && body.cancel);
    patch.cancel_at_period_end = cancel;
    detail.from = !!company.cancel_at_period_end;
    detail.to = cancel;

  } else {
    return { status: 400, body: { message: 'Unknown action: ' + action } };
  }

  /* היומן נכתב לפני השינוי. אם השינוי ייכשל, נשארה שורה שאומרת
     שניסינו – וזה עדיף על שינוי בלי שורה. */
  const entry = {
    id: 'admin:' + id + ':' + Date.now(),
    provider: 'admin',
    company_id: id,
    type: 'admin.' + action,
    payload: {
      by: user.email,
      reason: reason,
      at: new Date().toISOString(),
      detail: detail
    }
  };
  const logged = await db('/billing_events', {
    method: 'POST', prefer: 'return=minimal', body: [entry]
  });
  if (!logged.ok) return { status: 500, body: { message: 'Could not write the audit log' } };

  const updated = await db('/companies?id=eq.' + key, { method: 'PATCH', body: patch });
  if (!updated.ok || !updated.body || !updated.body.length) {
    return { status: 500, body: { message: 'Could not update the company' } };
  }

  return { body: { ok: true, company: updated.body[0], logged: entry.id, detail: detail } };
};
