/* סימון וביטול של "יסתיים בסוף התקופה".

   שתי הפעולות היו שתי נקודות קצה נפרדות, בנות שמונה־עשרה שורות
   כל אחת, שעושות בדיוק אותו דבר בכיוון הפוך: הופכות ערך בוליאני
   אחד בשורת החברה. הן אוחדו כי במסלול Hobby של Vercel יש תקרה
   של שתים־עשרה פונקציות, וזו הייתה הדרך הזולה ביותר להחזיר
   מרווח — לפני שהוא נגמר ומשהו שצריך לעלות לא יכול.

   הן אינן נוגעות בספק התשלומים ואינן מחייבות דבר: הביטול אינו
   מנתק גישה מיד — הלקוח ממשיך עד סוף התקופה ששולמה (או סוף
   תקופת הניסיון) ופשוט אינו מחויב שוב. מנוע החיוב היומי רואה
   את הסימון ומדלג. */
'use strict';


module.exports = async function ({ company, body, db }) {
  const op = String((body && body.op) || '');

  if (op === 'cancel') {
    if (company.cancel_at_period_end) {
      return { body: { ok: true, alreadyCanceled: true } };
    }
    const updated = await db('/companies?id=eq.' + encodeURIComponent(company.id), {
      method: 'PATCH', body: { cancel_at_period_end: true }
    });
    if (!updated.ok) return { status: 500, body: { message: 'Could not cancel' } };
    return { body: { ok: true, until: company.valid_until } };
  }

  if (op === 'resume') {
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
  }

  return { status: 400, body: { message: 'Unknown op: ' + op } };
};
