/* ביטול מנוי.
   הביטול אינו מנתק גישה מיד: הלקוח ממשיך עד סוף התקופה ששולמה
   (או עד סוף תקופת הניסיון), ופשוט לא מחויב שוב. מנוע החיוב היומי
   רואה את הסימון ומדלג. */
'use strict';

const { endpoint } = require('./_shared.js');

module.exports = endpoint(async function ({ company, db }) {
  if (company.cancel_at_period_end) {
    return { body: { ok: true, alreadyCanceled: true } };
  }
  const updated = await db('/companies?id=eq.' + encodeURIComponent(company.id), {
    method: 'PATCH', body: { cancel_at_period_end: true }
  });
  if (!updated.ok) return { status: 500, body: { message: 'Could not cancel' } };
  return { body: { ok: true, until: company.valid_until } };
});
