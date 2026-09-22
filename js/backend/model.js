/* מודל הנתונים של המוצר הרב-חברתי.
   כאן מוגדרים התפקידים, סטטוסי המנוי והכללים שקובעים מי רשאי לעשות מה.
   הקובץ הזה חף מכל תלות בדפדפן או בשרת מסוים, וישמש גם את צד השרת. */
(function (root) {
  'use strict';

  /* תפקידים בתוך חברה. owner הוא מי שפתח את החשבון ומשלם. */
  var ROLES = ['owner', 'manager', 'employee'];

  function translate(key, fallback, params) {
    var i18n = root.I18n;
    if (!i18n) return fallback;
    var text = i18n.t(key, params);
    return text === key ? fallback : text;
  }

  var ROLE_FALLBACK = { owner: 'בעלים', manager: 'מנהל/ת', employee: 'עובד/ת' };

  /* אובייקט שמתרגם בכל קריאה, כדי שהחלפת שפה תשתקף מיד */
  var ROLE_NAMES = {};
  ROLES.forEach(function (role) {
    Object.defineProperty(ROLE_NAMES, role, {
      enumerable: true,
      get: function () { return translate('roles.' + role, ROLE_FALLBACK[role]); }
    });
  });

  function roleName(role) { return ROLE_NAMES[role] || role; }

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

  /* כתובת התמיכה. מקום אחד, כדי שדף המכירה והמערכת לא יציגו
     לעולם שתי כתובות שונות. */
  var SUPPORT_EMAIL = 'support@setshifts.com';

  /* זמן המענה האנושי שאנחנו מתחייבים אליו. מספר אחד, כדי שההבטחה
     בדף המכירה, במסך התמיכה ובמענה האוטומטי בוואטסאפ תהיה זהה. */
  var SUPPORT_REPLY_HOURS = 48;

  /* מספר הוואטסאפ העסקי, בפורמט בינלאומי ובלי סימנים: 9725xxxxxxxx.
     כל עוד הוא ריק, הכפתור אינו מוצג בשום מקום – קישור שבור לערוץ
     תמיכה גרוע מאין ערוץ. */
  var WHATSAPP_NUMBER = '';

  /* ===== קריאות שירות =====
     הבדיקות כאן חוזרות על הבדיקות שבסכימה. זו כפילות מכוונת:
     בדפדפן כדי שהלקוח יקבל הודעה מובנת לפני ששולחים, ובבסיס
     הנתונים כי על הדפדפן אי אפשר לסמוך. */
  var TICKET_KINDS = ['bug', 'feature', 'question'];
  var TICKET_STATUSES = ['open', 'in_progress', 'answered', 'closed'];
  var TICKET_LIMITS = { subject: 200, body: 5000 };

  function ticketError(code, key, fallback, params) {
    var error = new Error(translate(key, fallback, params));
    error.code = code;
    return error;
  }

  /* מחזיר { kind, subject, body } או { error }. */
  function normalizeTicket(input) {
    var data = input || {};
    var kind = String(data.kind || 'bug');
    if (TICKET_KINDS.indexOf(kind) === -1) kind = 'bug';

    var subject = String(data.subject == null ? '' : data.subject).trim();
    var body = String(data.body == null ? '' : data.body).trim();

    if (!subject) {
      return { error: ticketError('invalid_input', 'support.errorSubject',
        'צריך לכתוב נושא לקריאה.') };
    }
    if (!body) {
      return { error: ticketError('invalid_input', 'support.errorBody',
        'צריך לתאר מה קרה.') };
    }
    if (subject.length > TICKET_LIMITS.subject) {
      return { error: ticketError('invalid_input', 'support.errorSubjectLong',
        'הנושא ארוך מדי.', { max: TICKET_LIMITS.subject }) };
    }
    if (body.length > TICKET_LIMITS.body) {
      return { error: ticketError('invalid_input', 'support.errorBodyLong',
        'התיאור ארוך מדי.', { max: TICKET_LIMITS.body }) };
    }
    return { kind: kind, subject: subject, body: body };
  }

  /* ===== מצב ההזמנה =====
     מנהל שמזמין עובד רואה רק "נשלח" – ומשם ואילך הוא מנחש. ארבעה
     מצבים, ושלושתם הראשונים נגזרים משני תאריכים בלבד:
       joined    המוזמן כבר נכנס פעם אחת. סוף הסיפור.
       pending   נשלחה הזמנה, הקישור עדיין בתוקף.
       expired   הקישור פג. שליחה חוזרת היא הפעולה היחידה שעוזרת.
       unknown   אין תאריכים – שורה שנוצרה לפני שהמעקב היה קיים,
                 או הבעלים עצמו. לא ממציאים לו סטטוס.
     חלון התוקף הוא של Supabase (ברירת מחדל 24 שעות למייל), ולכן
     שינוי שם חייב להיות שינוי גם שם. */
  var INVITE_TTL_HOURS = 24;
  var INVITE = {
    JOINED: 'joined', PENDING: 'pending', EXPIRED: 'expired', UNKNOWN: 'unknown'
  };

  function inviteState(user, now) {
    var at = user && (user.joinedAt || user.joined_at);
    if (at) return INVITE.JOINED;
    var sent = user && (user.invitedAt || user.invited_at);
    if (!sent) return INVITE.UNKNOWN;
    var sentAt = new Date(sent).getTime();
    if (!sentAt) return INVITE.UNKNOWN;
    var at_now = (now ? new Date(now) : new Date()).getTime();
    return (at_now - sentAt) > INVITE_TTL_HOURS * 3600 * 1000
      ? INVITE.EXPIRED : INVITE.PENDING;
  }

  /* הזמנה אפשר לבטל רק כל עוד היא לא נוצלה. מי שכבר נכנס אינו
     "הזמנה תלויה" אלא משתמש – ואותו מנטרלים, לא מוחקים, כדי שלא
     ייעלמו איתו הרשומות שלו. */
  function canCancelInvite(user, now) {
    if (!user || user.role === 'owner') return false;
    var state = inviteState(user, now);
    return state === INVITE.PENDING || state === INVITE.EXPIRED;
  }

  var TRIAL_DAYS = 14;

  /* מדיניות הניסיון, במקום אחד. פתיחת חשבון אינה דורשת כרטיס, ולכן
     כל טקסט שמבטיח "החיוב הראשון בתום התקופה" הוא הבטחה שאינה
     נכונה – והסתירה הזו עולה עסקה. אם המדיניות תשתנה, היא משתנה
     כאן, והבדיקה תפנה למי ששינה אותה גם אל נוסח דף המכירה. */
  var TRIAL_REQUIRES_CARD = false;
  var GRACE_DAYS = 7; // ימי חסד אחרי כישלון תשלום, לפני חסימה
  /* חלון להמתנה לאישור החיוב הראשון מספק התשלומים */
  var CHARGE_GRACE_DAYS = 2;

  /* התוכניות נקבעות לפי מספר העובדים בלבד. אין הגבלת סניפים.
     maxEmployees ערך 0 = ללא הגבלה. */
  var PLAN_FALLBACK = { starter: 'קטן', growth: 'בינוני', business: 'גדול' };
  var PLAN_SPEC = [
    { id: 'starter', minEmployees: 1, maxEmployees: 10, priceMonthly: 199 },
    { id: 'growth', minEmployees: 11, maxEmployees: 30, priceMonthly: 399 },
    { id: 'business', minEmployees: 31, maxEmployees: 0, priceMonthly: 599 }
  ];

  /* השם והטווח נקראים בכל גישה, כדי שהחלפת שפה תשתקף מיד */
  var PLANS = {};
  PLAN_SPEC.forEach(function (spec) {
    var plan = {
      id: spec.id, minEmployees: spec.minEmployees,
      maxEmployees: spec.maxEmployees, priceMonthly: spec.priceMonthly
    };
    Object.defineProperty(plan, 'name', {
      enumerable: true,
      get: function () { return translate('plans.' + spec.id, PLAN_FALLBACK[spec.id]); }
    });
    Object.defineProperty(plan, 'range', {
      enumerable: true,
      get: function () { return planRange(plan); }
    });
    PLANS[spec.id] = plan;
  });

  var PLAN_ORDER = ['starter', 'growth', 'business'];
  var DEFAULT_PLAN = 'starter';

  function planOf(company) {
    return PLANS[(company && company.plan) || DEFAULT_PLAN] || PLANS[DEFAULT_PLAN];
  }

  /* טווח התוכנית בשפה הפעילה */
  function planRange(plan) {
    if (!plan.maxEmployees) {
      return translate('plans.from', plan.minEmployees + '+', { count: plan.minEmployees });
    }
    if (plan.minEmployees <= 1) {
      return translate('plans.upTo', '≤ ' + plan.maxEmployees, { count: plan.maxEmployees });
    }
    return translate('plans.between', plan.minEmployees + '–' + plan.maxEmployees,
      { from: plan.minEmployees, to: plan.maxEmployees });
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

  /* ===== האם הסליקה מחוברת =====
     כל עוד אין ספק תשלומים אמיתי, אסור לבקש מלקוח אמצעי תשלום:
     אין לאן להזין אותו, וההבטחה שהוא הזין משהו היא שקר. המצב
     נקבע מהספק עצמו (describe().live) ולא מדגל שמישהו זוכר
     לעדכן – דגל כזה תמיד נשאר על true יום אחרי שהוא הפסיק
     להיות נכון. */
  /* ברירת המחדל היא "לא מחובר", ולא להפך. דגל שמתחיל ב"אפשר
     לחייב" ומתוקן אחר כך נותן, ברגע שמישהו שוכח לחבר אותו,
     בדיוק את התוצאה הגרועה: מסך שמבקש כרטיס בלי שיש לאן. */
  var billingLive = false;
  function setBillingLive(value) { billingLive = value === true; }
  function isBillingLive() { return billingLive; }

  /* האם לחברה יש גישה למערכת כרגע, ומה הסיבה אם לא. */
  function accessState(company, now) {
    var today = now ? new Date(now) : new Date();
    if (!company) return { allowed: false, reason: 'no-company', text: translate('access.noCompany', 'לא נמצאה חברה') };

    var validUntil = company.validUntil ? new Date(company.validUntil) : null;
    var expired = validUntil ? today > validUntil : false;
    var daysLeft = validUntil
      ? Math.ceil((validUntil - today) / (24 * 60 * 60 * 1000))
      : null;

    if (company.status === SUBSCRIPTION.TRIAL) {
      var card = hasPaymentMethod(company);
      var endsOn = formatDate(validUntil);

      /* ביטול בתוך תקופת הניסיון: הגישה נשמרת עד הסוף, ולא יהיה חיוב */
      if (company.cancelAtPeriodEnd) {
        if (expired) {
          return { allowed: false, reason: 'canceled', daysLeft: 0,
            text: translate('access.canceled', 'המנוי בוטל.') };
        }
        return { allowed: true, reason: 'trial-canceled', daysLeft: daysLeft,
          text: translate('access.trialCanceled', 'המנוי בוטל ולא יבוצע חיוב.',
            { date: endsOn }) };
      }

      if (expired) {
        if (!card) {
          return { allowed: false, reason: 'trial-ended', daysLeft: 0,
            text: translate('access.trialEndedNoCard', 'תקופת הניסיון הסתיימה.') };
        }
        /* יש כרטיס: הספק אמור לחייב בדיוק עכשיו. אישור החיוב מגיע
           ב-webhook, ולפעמים באיחור של שעות – ולכן חלון חסד קצר,
           כדי שלא ננעל לקוח משלם בגלל עיכוב טכני. */
        var sinceEnd = Math.floor((today - validUntil) / (24 * 60 * 60 * 1000));
        if (sinceEnd <= CHARGE_GRACE_DAYS) {
          return { allowed: true, reason: 'charging', daysLeft: 0,
            text: translate('access.charging', 'החיוב הראשון בעיבוד.') };
        }
        return { allowed: false, reason: 'trial-ended', daysLeft: 0,
          text: translate('access.trialEndedNoCard', 'תקופת הניסיון הסתיימה.') };
      }

      if (!card) {
        /* בלי סליקה מחוברת אין מה לבקש מהלקוח. הוא בפיילוט,
           ונאמר לו בדיוק את זה. */
        if (!billingLive) {
          return { allowed: true, reason: 'trial-pilot', daysLeft: daysLeft,
            text: translate('access.trialPilot', 'תקופת ניסיון.',
              { days: daysLeft, date: endsOn }) };
        }
        return { allowed: true, reason: 'trial-no-card', daysLeft: daysLeft,
          text: translate('access.trialNoCard', 'תקופת ניסיון.',
            { days: daysLeft, date: endsOn }) };
      }
      return { allowed: true, reason: 'trial', daysLeft: daysLeft,
        text: translate('access.trialWithCard', 'תקופת ניסיון.',
          { days: daysLeft, date: endsOn, price: priceLabel(company) }) };
    }

    if (company.status === SUBSCRIPTION.ACTIVE) {
      if (expired) {
        return { allowed: false, reason: 'expired', daysLeft: 0,
          text: translate('access.expired', 'המנוי פג.') };
      }
      if (company.cancelAtPeriodEnd) {
        return { allowed: true, reason: 'active-canceled', daysLeft: daysLeft,
          text: translate('access.canceledAtPeriodEnd', 'המנוי בוטל.',
            { date: formatDate(validUntil) }) };
      }
      return { allowed: true, reason: 'active', daysLeft: daysLeft, text: '' };
    }

    if (company.status === SUBSCRIPTION.PAST_DUE) {
      if (expired) {
        return { allowed: false, reason: 'past-due-expired', daysLeft: 0,
          text: translate('access.pastDueBlocked', 'התשלום לא התקבל והגישה נחסמה.') };
      }
      return { allowed: true, reason: 'past-due', daysLeft: daysLeft,
        text: translate('access.pastDue', 'התשלום האחרון לא עבר.', { days: daysLeft }) };
    }

    if (company.status === SUBSCRIPTION.EXPIRED) {
      return { allowed: false, reason: 'expired', daysLeft: 0,
        text: translate('access.expiredKept', 'המנוי פג ולא חודש.') };
    }
    if (company.status === SUBSCRIPTION.CANCELED) {
      return { allowed: false, reason: 'canceled', daysLeft: 0,
        text: translate('access.canceled', 'המנוי בוטל.') };
    }
    return { allowed: false, reason: company.status || 'canceled', daysLeft: 0,
      text: translate('access.inactive', 'המנוי אינו פעיל.') };
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
      problems: [translate('access.overLimit', 'חריגה ממגבלת התוכנית', {
        plan: plan.name, max: plan.maxEmployees, count: employees,
        suggested: suggested.name, range: suggested.range,
        price: translate('billing.priceMonthly', suggested.priceMonthly + '₪',
          { amount: suggested.priceMonthly })
      })]
    };
  }

  function addDays(date, days) {
    var out = new Date(date);
    out.setDate(out.getDate() + days);
    return out;
  }

  /* תאריך קצר בשפה הפעילה. נדרש כדי להגיד ללקוח מתי בדיוק
     יתבצע החיוב הראשון – "עוד 14 ימים" אינו מספיק ברור. */
  function formatDate(value) {
    if (!value) return '';
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    var locale = root.I18n && root.I18n.active ? root.I18n.active().locale : undefined;
    try {
      return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (err) {
      return date.toISOString().slice(0, 10);
    }
  }

  /* האם יש כרטיס שמור אצל ספק התשלומים. בלעדיו אין מה לחייב
     בתום תקופת הניסיון. */
  function hasPaymentMethod(company) {
    return !!(company && company.billingSubscriptionId);
  }

  /* מחיר התוכנית כפי שהוא מוצג ללקוח */
  function priceLabel(company) {
    var plan = planOf(company);
    return translate('billing.priceMonthly', plan.priceMonthly + '₪',
      { amount: plan.priceMonthly });
  }

  function newTrialCompany(name, now) {
    var today = now ? new Date(now) : new Date();
    return {
      name: name,
      plan: DEFAULT_PLAN,
      status: SUBSCRIPTION.TRIAL,
      validUntil: addDays(today, TRIAL_DAYS).toISOString(),
      createdAt: today.toISOString(),
      /* מתמלאים כשהלקוח מזין כרטיס בעמוד התשלום של הספק */
      billingProvider: null,
      billingCustomerId: null,
      billingSubscriptionId: null,
      cancelAtPeriodEnd: false
    };
  }

  var API = {
    ROLES: ROLES, ROLE_NAMES: ROLE_NAMES, CAPABILITIES: CAPABILITIES, can: can,
    SUPPORT_EMAIL: SUPPORT_EMAIL,
    SUPPORT_REPLY_HOURS: SUPPORT_REPLY_HOURS, WHATSAPP_NUMBER: WHATSAPP_NUMBER,
    TICKET_KINDS: TICKET_KINDS, TICKET_STATUSES: TICKET_STATUSES,
    TICKET_LIMITS: TICKET_LIMITS, normalizeTicket: normalizeTicket,
    setBillingLive: setBillingLive, isBillingLive: isBillingLive,
    INVITE: INVITE, INVITE_TTL_HOURS: INVITE_TTL_HOURS,
    inviteState: inviteState, canCancelInvite: canCancelInvite,
    SUBSCRIPTION: SUBSCRIPTION, TRIAL_DAYS: TRIAL_DAYS,
    TRIAL_REQUIRES_CARD: TRIAL_REQUIRES_CARD, GRACE_DAYS: GRACE_DAYS,
    CHARGE_GRACE_DAYS: CHARGE_GRACE_DAYS,
    hasPaymentMethod: hasPaymentMethod, formatDate: formatDate, priceLabel: priceLabel,
    PLANS: PLANS, PLAN_ORDER: PLAN_ORDER, DEFAULT_PLAN: DEFAULT_PLAN,
    planOf: planOf, planRange: planRange, roleName: roleName,
    planForEmployees: planForEmployees, employeesLeft: employeesLeft,
    accessState: accessState, withinPlanLimits: withinPlanLimits,
    newTrialCompany: newTrialCompany, addDays: addDays
  };

  root.ShiftModel = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
