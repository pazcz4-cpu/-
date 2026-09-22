/* פתיחת מנוי או החלפת תוכנית.
   מחזיר כתובת לדף תשלום מאובטח של הספק, שבו הלקוח מזין כרטיס.
   הכרטיס נשמר, אבל החיוב הראשון אינו מתבצע שם – הוא מתבצע רק
   בתום תקופת הניסיון, בידי מנוע החיוב היומי (cron.js).

   זה בכוונה: כך "14 ימים ללא חיוב" הוא התנהגות שאנחנו מבטיחים
   ולא הימור על יכולת התזמון של הספק. */
'use strict';

const { endpoint } = require('./_shared.js');
const providers = require('./_providers.js');
const Model = require('../../js/backend/model.js');

module.exports = endpoint(async function ({ company, user, body, db }) {
  const planId = body && body.plan;
  if (!planId || !Model.PLANS[planId]) {
    return { status: 400, body: { message: 'Unknown plan' } };
  }

  const name = process.env.BILLING_PROVIDER || 'mock';
  const provider = providers[name];
  if (!provider || !provider.createCheckout) {
    return { status: 501, body: { message: 'Billing provider cannot open a checkout: ' + name } };
  }

  const base = process.env.PUBLIC_BASE_URL || '';
  const checkout = await provider.createCheckout({
    companyId: company.id,
    companyName: company.name,
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

  /* התוכנית נשמרת רק אחרי שדף התשלום נפתח. אחרת ספק שנפל משאיר
     את הלקוח עם תוכנית שהוא לא הספיק לאשר – ובתקופה הבאה הוא
     מחויב עליה. מצב המנוי והתוקף אינם נוגעים כאן: רק ה-webhook
     וה-cron משנים אותם. */
  await db('/companies?id=eq.' + encodeURIComponent(company.id), {
    method: 'PATCH', body: { plan: planId }
  });

  return { body: { ok: true, checkoutUrl: checkout && checkout.url } };
});
