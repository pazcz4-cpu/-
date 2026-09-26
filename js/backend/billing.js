/* שכבת חיוב מופשטת.
   המערכת לעולם אינה מדברת ישירות עם ספק תשלומים – היא מדברת עם הממשק
   הזה. כדי לחבר ספק אמיתי מוסיפים מימוש נוסף ומחליפים אותו באתחול.

   חשוב: מפתחות API של ספק תשלומים אינם יכולים לשבת בקוד שרץ בדפדפן.
   מימוש אמיתי קורא לפונקציית שרת, והשרת הוא שמדבר עם הספק ומעדכן את
   סטטוס המנוי אחרי אישור. ראו PayPlusProvider בהמשך. */
(function (root) {
  'use strict';

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
  }

  var Model = root.ShiftModel || (typeof require === 'function' ? require('./model.js') : null);

  /* ===== ספק מדומה לפיתוח: מאשר כל תשלום מיד ===== */
  function MockProvider(options) {
    this.backend = (options || {}).backend;
    this.now = (options || {}).now || function () { return new Date(); };
  }

  MockProvider.prototype.name = 'mock';

  MockProvider.prototype.describe = function () {
    return {
      name: t('payments.mockProvider'),
      live: false,
      note: t('payments.mockNote')
    };
  };

  /* פתיחת מנוי. בספק אמיתי זה מחזיר כתובת לדף תשלום מאובטח שבו
     הלקוח מזין כרטיס. הכרטיס נשמר מיד, אבל החיוב הראשון נדחה לסוף
     תקופת הניסיון – כך הלקוח לא משלם כלום ב-14 הימים הראשונים.

     בספק המדומה מדלגים על דף התשלום ומדמים כרטיס שנשמר. */
  MockProvider.prototype.startCheckout = function (input) {
    var plan = Model.PLANS[input.planId];
    if (!plan) return Promise.reject(new Error(t('payments.unknownPlan')));

    var session = this.backend.session();
    var company = session ? session.company : null;
    var onTrial = company && company.status === Model.SUBSCRIPTION.TRIAL;

    var patch = {
      action: 'checkout',
      plan: plan.id,
      billingProvider: 'mock',
      billingCustomerId: 'mock-cus-' + plan.id,
      billingSubscriptionId: 'mock-sub-' + plan.id,
      cancelAtPeriodEnd: false
    };

    /* בתוך תקופת ניסיון רק שומרים כרטיס ובוחרים תוכנית. הסטטוס
       נשאר "ניסיון" והתוקף נשאר סוף הניסיון – החיוב יגיע משם. */
    if (!onTrial) {
      patch.status = Model.SUBSCRIPTION.ACTIVE;
      patch.validUntil = Model.addDays(this.now(), 30).toISOString();
    }

    return this.backend.setSubscription(patch).then(function (updated) {
      return { status: onTrial ? 'trialing' : 'paid', company: updated, redirectUrl: null };
    });
  };

  /* הוספת אמצעי תשלום בלי לשנות תוכנית */
  MockProvider.prototype.addPaymentMethod = function () {
    var session = this.backend.session();
    var plan = session ? Model.planOf(session.company).id : Model.DEFAULT_PLAN;
    return this.backend.setSubscription({
      action: 'payment-method',
      billingProvider: 'mock',
      billingCustomerId: 'mock-cus-' + plan,
      billingSubscriptionId: 'mock-sub-' + plan,
      cancelAtPeriodEnd: false
    }).then(function (company) {
      return { company: company, redirectUrl: null };
    });
  };

  /* ביטול אינו מנתק גישה מיד: הלקוח ממשיך עד סוף התקופה ששולמה
     (או עד סוף הניסיון), ופשוט לא מחויב שוב. */
  MockProvider.prototype.cancel = function () {
    return this.backend.setSubscription({ action: 'cancel', cancelAtPeriodEnd: true });
  };

  MockProvider.prototype.resume = function () {
    return this.backend.setSubscription({ action: 'resume', cancelAtPeriodEnd: false });
  };

  /* ===== שלד לספק אמיתי (PayPlus) =====
     המימוש הזה מכוון לשרת, לא לספק. כשיהיה שרת, endpoint אחד פותח
     עסקה ומחזיר כתובת לדף תשלום, ו-endpoint שני מקבל את האישור מהספק
     ומעדכן את המנוי. מה שחסר כדי להשלים: כתובות ה-API של החשבון,
     מזהי התוכניות אצל הספק, ואופן אימות החתימה על ההודעה החוזרת. */
  function ServerProvider(options) {
    var opts = options || {};
    this.backend = opts.backend;
    this.endpoint = opts.endpoint;          // לדוגמה: /api/billing
    this.fetchImpl = opts.fetch || (typeof fetch === 'function' ? fetch.bind(root) : null);
    this.providerName = opts.providerName || 'payplus';
  }

  ServerProvider.prototype.name = 'server';

  /* כל הפעולות עוברות דרך backend.setSubscription, שמעביר אותן
     לשרת. השדה action קובע לאיזו נקודת קצה. */
  ServerProvider.prototype.startCheckout = function (input) {
    return this.backend.setSubscription({ action: 'checkout', plan: input.planId })
      .then(function (company) { return { status: 'pending', company: company, redirectUrl: null }; });
  };

  ServerProvider.prototype.addPaymentMethod = function () {
    return this.backend.setSubscription({ action: 'payment-method' })
      .then(function (company) { return { company: company, redirectUrl: null }; });
  };

  ServerProvider.prototype.cancel = function () {
    return this.backend.setSubscription({ action: 'cancel' });
  };

  ServerProvider.prototype.resume = function () {
    return this.backend.setSubscription({ action: 'resume' });
  };

  ServerProvider.prototype.describe = function () {
    return { name: t('payments.serverProvider', { name: this.providerName }), live: true, note: '' };
  };

  ServerProvider.prototype._call = function (action, body) {
    if (!this.fetchImpl || !this.endpoint) {
      return Promise.reject(new Error(t('payments.notConfigured')));
    }
    /* נקודת קצה אחת, ו-op בגוף הבקשה. ראו api/billing/index.js */
    return this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(Object.assign({ op: action }, body || {}))
    }).then(function (response) {
      if (!response.ok) { throw new Error(t('payments.requestFailed', { status: response.status })); }
      return response.json();
    });
  };

  /* השרת מחזיר כתובת לדף התשלום; החיוב עצמו לעולם אינו עובר בדפדפן */
  ServerProvider.prototype.startCheckout = function (input) {
    return this._call('checkout', { planId: input.planId }).then(function (result) {
      return { status: result.status || 'redirect', redirectUrl: result.redirectUrl || null };
    });
  };

  ServerProvider.prototype.cancel = function () {
    return this._call('cancel', {});
  };

  /* ===== שירות החיוב שהממשק משתמש בו ===== */
  function BillingService(options) {
    this.provider = options.provider;
    this.backend = options.backend;
  }

  BillingService.prototype.describe = function () { return this.provider.describe(); };

  BillingService.prototype.plans = function () {
    return Model.PLAN_ORDER.map(function (id) { return Model.PLANS[id]; });
  };

  /* מצב המנוי של החברה המחוברת, יחד עם הנתונים שצריך כדי להציג אותו */
  BillingService.prototype.state = function (employeeCount) {
    var session = this.backend.session();
    if (!session) return null;
    var company = session.company;
    var plan = Model.planOf(company);
    var limits = Model.withinPlanLimits(company, { employees: employeeCount });
    return {
      company: company,
      plan: plan,
      access: session.access,
      employeeCount: employeeCount,
      employeesLeft: Model.employeesLeft(company, employeeCount),
      suggestedPlan: Model.planForEmployees(employeeCount),
      overLimit: !limits.ok,
      problems: limits.problems,
      canManage: Model.can(session.user.role, 'billing.manage')
    };
  };

  BillingService.prototype.choosePlan = function (planId) {
    return this.provider.startCheckout({ planId: planId });
  };

  BillingService.prototype.addPaymentMethod = function () {
    if (!this.provider.addPaymentMethod) {
      return Promise.reject(new Error(t('payments.notConnected')));
    }
    return this.provider.addPaymentMethod();
  };

  /* מימוש קופון. עובר לשרת ולא לספק התשלומים: קופון הוא הטבה
     שלנו על המנוי, ולא עסקה אצל הסולק. */
  BillingService.prototype.redeemCoupon = function (code) {
    if (!this.backend || !this.backend.redeemCoupon) {
      return Promise.reject(new Error(t('payments.notConnected')));
    }
    return this.backend.redeemCoupon(code);
  };

  BillingService.prototype.cancel = function () { return this.provider.cancel(); };

  BillingService.prototype.resume = function () {
    if (!this.provider.resume) {
      return Promise.reject(new Error(t('payments.notConnected')));
    }
    return this.provider.resume();
  };

  var API = {
    MockProvider: MockProvider,
    ServerProvider: ServerProvider,
    BillingService: BillingService
  };
  root.ShiftBilling = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
