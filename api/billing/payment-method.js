/* הוספה או החלפה של אמצעי תשלום, בלי לשנות תוכנית.
   משמש גם כשלקוח הגיע לתום הניסיון בלי כרטיס, וגם כשכרטיס פג. */
'use strict';

const { endpoint } = require('./_shared.js');
const providers = require('./_providers.js');
const Model = require('../../js/backend/model.js');

module.exports = endpoint(async function ({ company }) {
  const name = process.env.BILLING_PROVIDER || 'mock';
  const provider = providers[name];
  if (!provider || !provider.createCheckout) {
    return { status: 501, body: { message: 'Billing provider cannot open a checkout: ' + name } };
  }

  const plan = Model.PLANS[company.plan] || Model.PLANS[Model.DEFAULT_PLAN];
  const checkout = await provider.createCheckout({
    companyId: company.id,
    companyName: company.name,
    plan: plan.id,
    amount: plan.priceMonthly,
    currency: 'ILS',
    saveCardOnly: true,
    returnUrl: (process.env.PUBLIC_BASE_URL || '') + '/app/?billing=done',
    cancelUrl: (process.env.PUBLIC_BASE_URL || '') + '/app/?billing=canceled'
  });

  return { body: { ok: true, checkoutUrl: checkout && checkout.url } };
});
