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

module.exports = endpoint(async function ({ company, body, db }) {
  const planId = body && body.plan;
  if (!planId || !Model.PLANS[planId]) {
    return { status: 400, body: { message: 'Unknown plan' } };
  }

  const name = process.env.BILLING_PROVIDER || 'mock';
  const provider = providers[name];
  if (!provider || !provider.createCheckout) {
    return { status: 501, body: { message: 'Billing provider cannot open a checkout: ' + name } };
  }

  /* התוכנית נשמרת מיד; הכרטיס יגיע מההודעה החוזרת של הספק.
     מצב המנוי והתוקף אינם נוגעים כאן – רק ה-webhook וה-cron
     משנים אותם. */
  await db('/companies?id=eq.' + encodeURIComponent(company.id), {
    method: 'PATCH', body: { plan: planId }
  });

  const checkout = await provider.createCheckout({
    companyId: company.id,
    companyName: company.name,
    plan: planId,
    amount: Model.PLANS[planId].priceMonthly,
    currency: 'ILS',
    /* הכרטיס נשמר עכשיו, החיוב יגיע בתום הניסיון */
    saveCardOnly: company.status === 'trial',
    returnUrl: (process.env.PUBLIC_BASE_URL || '') + '/app/?billing=done',
    cancelUrl: (process.env.PUBLIC_BASE_URL || '') + '/app/?billing=canceled'
  });

  return { body: { ok: true, checkoutUrl: checkout && checkout.url } };
});
