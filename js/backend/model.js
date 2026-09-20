/* מודל הנתונים של המוצר הרב-חברתי.
   כאן מוגדרים התפקידים, סטטוסי המנוי והכללים שקובעים מי רשאי לעשות מה.
   הקובץ הזה חף מכל תלות בדפדפן או בשרת מסוים, וישמש גם את צד השרת. */
(function (root) {
  'use strict';

  /* תפקידים בתוך חברה. owner הוא מי שפתח את החשבון ומשלם. */
  var ROLES = ['owner', 'manager', 'employee'];

  var ROLE_NAMES = {
    owner: 'בעלים',
    manager: 'מנהל/ת',
    employee: 'עובד/ת'
  };

  /* יכולות. כל בדיקת הרשאה במערכת עוברת דרך can(). */
  var CAPABILITIES = {
    owner: {
      'schedule.edit': true, 'schedule.generate': true, 'schedule.publish': true,
      'config.edit': true, 'constraints.editAny': true, 'constraints.editOwn': true,
      'users.manage': true, 'billing.manage': true, 'data.export': true, 'data.import': true
    },
    manager: {
      'schedule.edit': true, 'schedule.generate': true, 'schedule.publish': true,
      'config.edit': true, 'constraints.editAny': true, 'constraints.editOwn': true,
      'users.manage': true, 'billing.manage': false, 'data.export': true, 'data.import': true
    },
    employee: {
      'schedule.edit': false, 'schedule.generate': false, 'schedule.publish': false,
      'config.edit': false, 'constraints.editAny': false, 'constraints.editOwn': true,
      'users.manage': false, 'billing.manage': false, 'data.export': false, 'data.import': false
    }
  };

  function can(role, capability) {
    var table = CAPABILITIES[role];
    return !!(table && table[capability]);
  }

  /* ===== מנוי ===== */
  var SUBSCRIPTION = {
    TRIAL: 'trial',
    ACTIVE: 'active',
    PAST_DUE: 'past_due',   // תשלום נכשל – עדיין בתוך תקופת חסד
    CANCELED: 'canceled',
    EXPIRED: 'expired'
  };

  var TRIAL_DAYS = 14;
  var GRACE_DAYS = 7; // ימי חסד אחרי כישלון תשלום, לפני חסימה

  /* התוכניות נקבעות לפי מספר העובדים בלבד. אין הגבלת סניפים.
     maxEmployees ערך 0 = ללא הגבלה. */
  var PLANS = {
    starter: {
      id: 'starter', name: 'קטן', range: 'עד 10 עובדים',
      minEmployees: 1, maxEmployees: 10, priceMonthly: 199
    },
    growth: {
      id: 'growth', name: 'בינוני', range: '11 עד 30 עובדים',
      minEmployees: 11, maxEmployees: 30, priceMonthly: 399
    },
    business: {
      id: 'business', name: 'גדול', range: '31 עובדים ומעלה',
      minEmployees: 31, maxEmployees: 0, priceMonthly: 599
    }
  };

  var PLAN_ORDER = ['starter', 'growth', 'business'];
  var DEFAULT_PLAN = 'starter';

  function planOf(company) {
    return PLANS[(company && company.plan) || DEFAULT_PLAN] || PLANS[DEFAULT_PLAN];
  }

  /* התוכנית המתאימה למספר עובדים נתון */
  function planForEmployees(count) {
    var employees = Math.max(0, Number(count) || 0);
    for (var i = 0; i < PLAN_ORDER.length; i++) {
      var plan = PLANS[PLAN_ORDER[i]];
      if (!plan.maxEmployees || employees <= plan.maxEmployees) return plan;
    }
    return PLANS[PLAN_ORDER[PLAN_ORDER.length - 1]];
  }

  /* כמה עובדים אפשר עוד להוסיף בתוכנית הנוכחית (null = ללא הגבלה) */
  function employeesLeft(company, currentCount) {
    var plan = planOf(company);
    if (!plan.maxEmployees) return null;
    return Math.max(0, plan.maxEmployees - (Number(currentCount) || 0));
  }

  /* האם לחברה יש גישה למערכת כרגע, ומה הסיבה אם לא. */
  function accessState(company, now) {
    var today = now ? new Date(now) : new Date();
    if (!company) return { allowed: false, reason: 'no-company', text: 'לא נמצאה חברה' };

    var validUntil = company.validUntil ? new Date(company.validUntil) : null;
    var expired = validUntil ? today > validUntil : false;
    var daysLeft = validUntil
      ? Math.ceil((validUntil - today) / (24 * 60 * 60 * 1000))
      : null;

    if (company.status === SUBSCRIPTION.TRIAL) {
      if (expired) {
        return { allowed: false, reason: 'trial-ended', daysLeft: 0,
          text: 'תקופת הניסיון הסתיימה. יש להפעיל מנוי כדי להמשיך.' };
      }
      return { allowed: true, reason: 'trial', daysLeft: daysLeft,
        text: 'תקופת ניסיון – נותרו ' + daysLeft + ' ימים.' };
    }

    if (company.status === SUBSCRIPTION.ACTIVE) {
      if (expired) {
        return { allowed: false, reason: 'expired', daysLeft: 0,
          text: 'המנוי פג. יש לחדש כדי להמשיך.' };
      }
      return { allowed: true, reason: 'active', daysLeft: daysLeft, text: '' };
    }

    if (company.status === SUBSCRIPTION.PAST_DUE) {
      if (expired) {
        return { allowed: false, reason: 'past-due-expired', daysLeft: 0,
          text: 'התשלום לא התקבל והגישה נחסמה. יש לעדכן אמצעי תשלום.' };
      }
      return { allowed: true, reason: 'past-due', daysLeft: daysLeft,
        text: 'התשלום האחרון לא עבר. הגישה תיחסם בעוד ' + daysLeft + ' ימים.' };
    }

    if (company.status === SUBSCRIPTION.EXPIRED) {
      return { allowed: false, reason: 'expired', daysLeft: 0,
        text: 'המנוי פג ולא חודש. בחירת תוכנית תחזיר את הגישה מיד, והנתונים שמורים.' };
    }
    if (company.status === SUBSCRIPTION.CANCELED) {
      return { allowed: false, reason: 'canceled', daysLeft: 0,
        text: 'המנוי בוטל. אפשר לחדש בכל רגע – הנתונים שמורים.' };
    }
    return { allowed: false, reason: company.status || 'canceled', daysLeft: 0,
      text: 'המנוי אינו פעיל.' };
  }

  /* בדיקת מגבלת התוכנית לפי מספר העובדים */
  function withinPlanLimits(company, counts) {
    var plan = planOf(company);
    var employees = Number((counts && counts.employees) || 0);
    if (!plan.maxEmployees || employees <= plan.maxEmployees) {
      return { ok: true, problems: [], suggested: null };
    }
    var suggested = planForEmployees(employees);
    return {
      ok: false,
      suggested: suggested,
      problems: ['תוכנית ' + plan.name + ' כוללת עד ' + plan.maxEmployees + ' עובדים. ' +
        'יש ' + employees + ' עובדים – נדרשת תוכנית ' + suggested.name +
        ' (' + suggested.range + ', ' + suggested.priceMonthly + '₪ לחודש).']
    };
  }

  function addDays(date, days) {
    var out = new Date(date);
    out.setDate(out.getDate() + days);
    return out;
  }

  function newTrialCompany(name, now) {
    var today = now ? new Date(now) : new Date();
    return {
      name: name,
      plan: DEFAULT_PLAN,
      status: SUBSCRIPTION.TRIAL,
      validUntil: addDays(today, TRIAL_DAYS).toISOString(),
      createdAt: today.toISOString()
    };
  }

  var API = {
    ROLES: ROLES, ROLE_NAMES: ROLE_NAMES, CAPABILITIES: CAPABILITIES, can: can,
    SUBSCRIPTION: SUBSCRIPTION, TRIAL_DAYS: TRIAL_DAYS, GRACE_DAYS: GRACE_DAYS,
    PLANS: PLANS, PLAN_ORDER: PLAN_ORDER, DEFAULT_PLAN: DEFAULT_PLAN,
    planOf: planOf, planForEmployees: planForEmployees, employeesLeft: employeesLeft,
    accessState: accessState, withinPlanLimits: withinPlanLimits,
    newTrialCompany: newTrialCompany, addDays: addDays
  };

  root.ShiftModel = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
