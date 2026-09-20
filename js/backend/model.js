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

  var PLANS = {
    basic: { id: 'basic', name: 'בסיסי', maxBranches: 3, maxEmployees: 15, priceMonthly: 99 },
    pro: { id: 'pro', name: 'מורחב', maxBranches: 10, maxEmployees: 60, priceMonthly: 199 },
    unlimited: { id: 'unlimited', name: 'ללא הגבלה', maxBranches: 0, maxEmployees: 0, priceMonthly: 349 }
  };

  function planOf(company) {
    return PLANS[(company && company.plan) || 'basic'] || PLANS.basic;
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

    return { allowed: false, reason: company.status || 'canceled', daysLeft: 0,
      text: 'המנוי אינו פעיל.' };
  }

  /* בדיקת מגבלות התוכנית לפני הוספת סניף או עובד */
  function withinPlanLimits(company, counts) {
    var plan = planOf(company);
    var problems = [];
    if (plan.maxBranches && counts.branches > plan.maxBranches) {
      problems.push('תוכנית ' + plan.name + ' מוגבלת ל-' + plan.maxBranches + ' סניפים');
    }
    if (plan.maxEmployees && counts.employees > plan.maxEmployees) {
      problems.push('תוכנית ' + plan.name + ' מוגבלת ל-' + plan.maxEmployees + ' עובדים');
    }
    return { ok: problems.length === 0, problems: problems };
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
      plan: 'basic',
      status: SUBSCRIPTION.TRIAL,
      validUntil: addDays(today, TRIAL_DAYS).toISOString(),
      createdAt: today.toISOString()
    };
  }

  var API = {
    ROLES: ROLES, ROLE_NAMES: ROLE_NAMES, CAPABILITIES: CAPABILITIES, can: can,
    SUBSCRIPTION: SUBSCRIPTION, TRIAL_DAYS: TRIAL_DAYS, GRACE_DAYS: GRACE_DAYS,
    PLANS: PLANS, planOf: planOf, accessState: accessState,
    withinPlanLimits: withinPlanLimits, newTrialCompany: newTrialCompany, addDays: addDays
  };

  root.ShiftModel = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
