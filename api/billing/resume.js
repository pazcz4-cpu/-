/* חזרה מביטול, כל עוד התקופה לא הסתיימה. */
'use strict';

const { endpoint } = require('./_shared.js');

module.exports = endpoint(async function ({ company, db }) {
  if (!company.cancel_at_period_end) {
    return { body: { ok: true, alreadyActive: true } };
  }
  /* אחרי שהתקופה נגמרה כבר אין מה לחדש – צריך לפתוח מנוי מחדש */
  if (company.valid_until && new Date(company.valid_until) < new Date()) {
    return { status: 409, body: { message: 'The period has already ended' } };
  }
  const updated = await db('/companies?id=eq.' + encodeURIComponent(company.id), {
    method: 'PATCH', body: { cancel_at_period_end: false }
  });
  if (!updated.ok) return { status: 500, body: { message: 'Could not resume' } };
  return { body: { ok: true } };
});
