/* פתיחת מנוי או החלפת תוכנית.
   מחזיר כתובת לדף תשלום מאובטח של הספק, שבו הלקוח מזין כרטיס.
   הכרטיס נשמר, אבל החיוב הראשון אינו מתבצע שם – הוא מתבצע רק
   בתום תקופת הניסיון, בידי מנוע החיוב היומי (cron.js).

   זה בכוונה: כך "14 ימים ללא חיוב" הוא התנהגות שאנחנו מבטיחים
   ולא הימור על יכולת התזמון של הספק. */
'use strict';

const providers = require('./_providers.js');
const Model = require('../../js/backend/model.js');

module.exports = async function ({ company, user, body, db }) {
  const planId = body && body.plan;
  if (!planId || !Model.PLANS[planId]) {
    return { status: 400, body: { message: 'Unknown plan' } };
  }

  /* תוכנית הצעת־מחיר אינה נמכרת מהמסך. אין לה מחיר מחירון, ולכן
     מעבר אליה כאן היה מציב את החברה על תוכנית שעולה אפס – כלומר
     שימוש חופשי. המסך אינו מציע את הכפתור הזה, אבל המסך אינו
     ההגנה: בקשה אפשר לשלוח גם בלעדיו.

     המעבר נעשה מהמשרד האחורי, יחד עם המחיר שסוכם. */
  if (Model.PLANS[planId].quote) {
    return { status: 400, body: { message: 'This plan is set by quote, not self-serve' } };
  }

  const name = process.env.BILLING_PROVIDER || 'mock';
  const provider = providers[name];

  /* שני מקרים שונים לגמרי שמסתיימים באותו דבר: החלפת תוכנית בלי
     דף תשלום.

     1. ללקוח כבר יש כרטיס שמור. אין מה להזין שוב.
     2. אין עדיין סליקה מחוברת – תקופת הפיילוט. כאן זה קריטי:
        החלפת תוכנית היא שינוי תקרה ומחיר, והכסף נגבה בחיוב הבא.
        בלי המסלול הזה לקוח שרוצה לפתוח עובד אחד-עשר נחסם, ובמקום
        הודעה הוא קיבל את הערת המפתחים של הספק – באנגלית, על
        משתנה סביבה. זו הודעה אלינו, לא אליו.

     בשני המקרים לא מתבצע חיוב עכשיו, והחיוב הבא – שממילא נגזר
     מהתוכנית שרשומה על החברה – ייגבה לפי המחיר החדש.

     אין כאן יחסיות (proration) בכוונה: חיוב חלקי באמצע חודש הוא
     שורה שאיש אינו מבין בחשבונית. */
  const clearingLive = !!(provider && provider.live && provider.live() === true);
  if (company.billing_subscription_id || !clearingLive) {
    await db('/companies?id=eq.' + encodeURIComponent(company.id), {
      method: 'PATCH', body: { plan: planId }
    });
    return { body: { ok: true, plan: planId, planChanged: true, checkoutUrl: null } };
  }

  if (!provider.createCheckout) {
    return { status: 501, body: { message: 'Billing provider cannot open a checkout: ' + name } };
  }

  const base = process.env.PUBLIC_BASE_URL || '';
  /* כל כישלון של הספק חוזר כהודעה אחת יציבה שהדפדפן יודע לתרגם.
     ההסבר המדויק – מפתח חסר, עמוד תשלום שלא הוגדר, רשת שנפלה –
     הוא מידע שלנו, לא של הלקוח: הוא אינו יכול לעשות איתו דבר,
     והוא מגיע אליו באנגלית באמצע מסך בעברית. */
  let checkout;
  try {
    checkout = await provider.createCheckout({
      companyId: company.id,
      companyName: company.name,
      /* ח.פ. / מספר עוסק, כפי שהלקוח הזין בהגדרות. הוא מה שצריך
         להופיע על החשבונית, ולכן הוא נוסע לספק יחד עם השם. ריק
         נשאר ריק: לא לכל לקוח יש מספר כזה. */
      taxId: company.tax_id || '',
      email: (user && user.email) || '',
      language: company.language || 'he',
      plan: planId,
      amount: Model.PLANS[planId].priceMonthly,
      currency: 'ILS',
      /* הכרטיס נשמר עכשיו, החיוב יגיע בתום הניסיון */
      saveCardOnly: company.status === 'trial',
      returnUrl: base + '/app/?billing=done',
      failureUrl: base + '/app/?billing=failed',
      cancelUrl: base + '/app/?billing=canceled'
    });
  } catch (err) {
    console.error('checkout failed:', (err && err.message) || err);
    return { status: 502, body: { message: 'the payment page could not be opened' } };
  }

  /* התוכנית נשמרת רק אחרי שדף התשלום נפתח. אחרת ספק שנפל משאיר
     את הלקוח עם תוכנית שהוא לא הספיק לאשר – ובתקופה הבאה הוא
     מחויב עליה. מצב המנוי והתוקף אינם נוגעים כאן: רק ה-webhook
     וה-cron משנים אותם. */
  await db('/companies?id=eq.' + encodeURIComponent(company.id), {
    method: 'PATCH', body: { plan: planId }
  });

  return { body: { ok: true, checkoutUrl: checkout && checkout.url } };
};
