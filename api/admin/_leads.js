/* לידים מהאתר: מי השאיר פרטים, ובאיזה שלב הוא נמצא.

   הטבלה נכתבת מ-api/contact.js (kind: 'lead'), וכאן רק נקראת
   ומטופלת. הסטטוס הוא סדר העבודה של מי שמתקשר:
     new → contacted → demo → won | lost

   "won" אינו יוצר לקוח: ליד שהפך ללקוח מקבל companyId (קישור
   ללקוח הקיים) כדי שאפשר יהיה לחשב כמה לידים הפכו ללקוחות, ומאיזה
   מקור. את הלקוח עצמו פותחים בנקודת "customer", עם הפרטים
   שהליד השאיר.

   מחיקה קיימת בשביל בקשת "מחקו אותי": זה מידע אישי, והוא נשמר
   רק כל עוד יש סיבה. */
'use strict';

const STATUSES = ['new', 'contacted', 'demo', 'won', 'lost'];
const MAX_LIST = 1000;

function auditEntry(user, type, payload) {
  return {
    id: 'admin:leads:' + type + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 8),
    provider: 'admin', company_id: null, type: 'admin.' + type,
    payload: Object.assign({ by: user.email, at: new Date().toISOString() }, payload)
  };
}

function shape(row) {
  return {
    id: row.id, createdAt: row.created_at, updatedAt: row.updated_at,
    business: row.business_name, name: row.contact_name, phone: row.phone, email: row.email,
    employees: row.employees, hours: row.hours_per_week, note: row.note,
    consent: row.contact_consent === true, lang: row.lang, page: row.page,
    source: row.utm_source || null, medium: row.utm_medium || null,
    campaign: row.utm_campaign || null, content: row.utm_content || null,
    term: row.utm_term || null, clickId: row.click_id || null,
    status: row.status, adminNote: row.admin_note || '',
    companyId: row.converted_company_id || null
  };
}

module.exports = async function (ctx) {
  const { body, db, user } = ctx;
  const action = String((body && body.action) || 'list');

  if (action === 'list') {
    const filter = STATUSES.indexOf(String(body.status || '')) !== -1
      ? '&status=eq.' + encodeURIComponent(body.status) : '';
    const call = await db('/leads?select=*&order=created_at.desc&limit=' + MAX_LIST + filter);
    if (!call.ok) {
      return { status: 500, body: { message: 'Could not read leads (has the migration run?)' } };
    }
    const leads = (call.body || []).map(shape);
    const counts = { all: 0 };
    STATUSES.forEach(function (s) { counts[s] = 0; });
    /* הספירה על כל הטבלה, לא על הסינון: מי שבחר "חדשים" רוצה לראות
       גם כמה נשארו בשאר השלבים. */
    const all = await db('/leads?select=status&limit=50000');
    ((all.ok && all.body) || []).forEach(function (row) {
      counts.all++;
      if (counts[row.status] !== undefined) counts[row.status]++;
    });
    return { body: { ok: true, leads: leads, counts: counts } };
  }

  if (action === 'update') {
    const id = String((body && body.id) || '');
    if (!id) return { status: 400, body: { message: 'חסר מזהה ליד.' } };
    const patch = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) {
      if (STATUSES.indexOf(String(body.status)) === -1) {
        return { status: 400, body: { message: 'סטטוס לא מוכר: ' + body.status } };
      }
      patch.status = String(body.status);
    }
    if (body.adminNote !== undefined) patch.admin_note = String(body.adminNote).slice(0, 2000);
    if (body.companyId !== undefined) {
      patch.converted_company_id = body.companyId ? String(body.companyId) : null;
      if (body.companyId && patch.status === undefined) patch.status = 'won';
    }
    const call = await db('/leads?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: patch });
    if (!call.ok) return { status: 500, body: { message: 'Could not update the lead' } };
    if (!call.body || !call.body.length) return { status: 404, body: { message: 'הליד לא נמצא.' } };
    await db('/billing_events', { method: 'POST', prefer: 'return=minimal',
      body: [auditEntry(user, 'lead-update', { lead: id, status: patch.status || null,
        linkedCompany: patch.converted_company_id || null })] });
    return { body: { ok: true, lead: shape(call.body[0]) } };
  }

  if (action === 'delete') {
    const id = String((body && body.id) || '');
    if (!id) return { status: 400, body: { message: 'חסר מזהה ליד.' } };
    const call = await db('/leads?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    if (!call.ok) return { status: 500, body: { message: 'Could not delete the lead' } };
    /* ביומן נרשם שנמחק ליד, בלי הפרטים שלו */
    await db('/billing_events', { method: 'POST', prefer: 'return=minimal',
      body: [auditEntry(user, 'lead-delete', { lead: id })] });
    return { body: { ok: true } };
  }

  return { status: 400, body: { message: 'Unknown action: ' + action } };
};
