/* שכבת חיוב מופשטת.
   המערכת לעולם אינה מדברת ישירות עם ספק תשלומים – היא מדברת עם הממשק
   הזה. כדי לחבר ספק אמיתי מוסיפים מימוש נוסף ומחליפים אותו באתחול.

   חשוב: מפתחות API של ספק תשלומים אינם יכולים לשבת בקוד שרץ בדפדפן.
   מימוש אמיתי קורא לפונקציית שרת, והשרת הוא שמדבר עם הספק ומעדכן את
   סטטוס המנוי אחרי אישור. ראו PayPlusProvider בהמשך. */
(function (root) {
  'use strict';

  var Model = root.ShiftModel || (typeof require === 'function' ? require('./model.js') : null);

  /* ===== ספק מדומה לפיתוח: מאשר כל תשלום מיד ===== */
  function MockProvider(options) {
    this.backend = (options || {}).backend;
    this.now = (options || {}).now || function () { return new Date(); };
  }

  MockProvider.prototype.name = 'mock';

  MockProvider.prototype.describe = function () {
    return {
      name: 'ספק מדומה (פיתוח)',
      live: false,
      note: 'התשלום מאושר מיד ללא חיוב אמיתי. משמש לפיתוח ולהדגמה בלבד.'
    };
  };

  /* פתיחת תשלום. בספק אמיתי זה יחזיר כתובת לדף תשלום מאובטח. */
  MockProvider.prototype.startCheckout = function (input) {
    var plan = Model.PLANS[input.planId];
    if (!plan) return Promise.reject(new Error('תוכנית לא מוכרת'));

    var validUntil = Model.addDays(this.now(), 30).toISOString();
    return this.backend.setSubscription({
      plan: plan.id,
      status: Model.SUBSCRIPTION.ACTIVE,
      validUntil: validUntil
    }).then(function (company) {
      return { status: 'paid', company: company, redirectUrl: null };
    });
  };

  MockProvider.prototype.cancel = function () {
    return this.backend.setSubscription({ status: Model.SUBSCRIPTION.CANCELED });
  };

  /* ===== שלד לספק אמיתי (PayPlus) =====
     המימוש הזה מכוון לשרת, לא לספק. כשיהיה שרת, endpoint אחד פותח
     עסקה ומחזיר כתובת לדף תשלום, ו-endpoint שני מקבל את האישור מהספק
     ומעדכן את המנוי. מה שחסר כדי להשלים: כתובות ה-API של החשבון,
     מזהי התוכניות אצל הספק, ואופן אימות החתימה על ההודעה החוזרת. */
  function ServerProvider(options) {
    var opts = options || {};
    this.endpoint = opts.endpoint;          // לדוגמה: /api/billing
    this.fetchImpl = opts.fetch || (typeof fetch === 'function' ? fetch.bind(root) : null);
    this.providerName = opts.providerName || 'payplus';
  }

  ServerProvider.prototype.name = 'server';

  ServerProvider.prototype.describe = function () {
    return { name: 'חיוב דרך השרת (' + this.providerName + ')', live: true, note: '' };
  };

  ServerProvider.prototype._call = function (action, body) {
    if (!this.fetchImpl || !this.endpoint) {
      return Promise.reject(new Error('שכבת החיוב אינה מוגדרת בסביבה הזו'));
    }
    return this.fetchImpl(this.endpoint + '/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body || {})
    }).then(function (response) {
      if (!response.ok) { throw new Error('בקשת החיוב נכשלה (' + response.status + ')'); }
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

  BillingService.prototype.cancel = function () { return this.provider.cancel(); };

  var API = {
    MockProvider: MockProvider,
    ServerProvider: ServerProvider,
    BillingService: BillingService
  };
  root.ShiftBilling = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
