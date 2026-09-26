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
      'users.manage': true, 'billing.manage': true, 'data.export': true, 'data.import': true,
      'company.rename': true, 'timeclock.punchOwn': true, 'leave.requestOwn': true
    },
    manager: {
      'schedule.edit': true, 'schedule.generate': true, 'schedule.publish': true,
      'config.edit': true, 'constraints.editAny': true, 'constraints.editOwn': true,
      'users.manage': true, 'billing.manage': false, 'data.export': true, 'data.import': true,
      'company.rename': false, 'timeclock.punchOwn': true, 'leave.requestOwn': true
    },
    employee: {
      'schedule.edit': false, 'schedule.generate': false, 'schedule.publish': false,
      'config.edit': false, 'constraints.editAny': false, 'constraints.editOwn': true,
      'users.manage': false, 'billing.manage': false, 'data.export': false, 'data.import': false,
      'company.rename': false,
      /* דיווח שעון ובקשת חופשה הם על עצמו בלבד. מי העובד נקבע
         בשרת מהסשן ולא מהבקשה, ולכן אין כאן "על מי". */
      'timeclock.punchOwn': true, 'leave.requestOwn': true
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

  /* ===== זמן המענה האנושי =====

     הבטחה אחת ל"משהו לא עובד" ול"יש לי רעיון" היא הבטחה שגויה
     בשני הכיוונים: היא ארוכה מדי למנהל שלא מצליח לפרסם סידור
     היום, ומהודקת מדי לבקשת פיתוח שתתוכנן בעוד חודש.

     לכן שני מספרים. התקלה היא היחידה שנמדדת בשעות עבודה, כי
     היא היחידה שאפשר באמת לענות עליה מהר, ורק כשיש מי שיענה.
     שאר הפניות נמדדות בשעות יומן.

     כל המספרים כאן, ומשם הם מגיעים למסך התמיכה, לעמודי האתר
     ולמענה האוטומטי בוואטסאפ. */
  var SUPPORT_REPLY_HOURS = 48;        // שאלה או בקשת פיתוח
  var SUPPORT_URGENT_HOURS = 4;        // "משהו לא עובד", בשעות הפעילות
  var SUPPORT_HOURS_FROM = '09:00';
  var SUPPORT_HOURS_TO = '18:00';

  function supportReplyHours(kind) {
    return kind === 'bug' ? SUPPORT_URGENT_HOURS : SUPPORT_REPLY_HOURS;
  }

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

  /* מדיניות הניסיון, במקום אחד.

     המדיניות שאליה מכוונים: הלקוח מזין כרטיס בהרשמה ואינו מחויב
     במשך 14 יום. אבל היא יכולה להיות נכונה רק כשיש סליקה מחוברת –
     בלעדיה מסך שמבקש כרטיס אין לו לאן לשלוח אותו, ואף אחד לא
     יוכל להירשם בכלל.

     לכן זו אינה קבועה אלא נגזרת ממצב הסליקה. כך אין רגע שבו הדף
     מבטיח דבר אחד והמערכת עושה אחר: בלי סליקה נאמר "בלי כרטיס
     אשראי", ועם סליקה נאמר "מזינים כרטיס, החיוב הראשון בתום
     התקופה" – ושניהם נכונים במצב שלהם.

     הנוסח בדף המכירה נבחר לפי אותה פונקציה בדיוק, ולכן אי אפשר
     לשנות אחד בלי השני. */
  function trialRequiresCard() { return isBillingLive(); }
  var GRACE_DAYS = 7; // ימי חסד אחרי כישלון תשלום, לפני חסימה
  /* חלון להמתנה לאישור החיוב הראשון מספק התשלומים */
  var CHARGE_GRACE_DAYS = 2;

  /* התוכניות נקבעות לפי מספר העובדים בלבד. אין הגבלת סניפים.
     maxEmployees ערך 0 = ללא הגבלה. */
  var PLAN_FALLBACK = {
    starter: 'קטן', growth: 'בינוני', business: 'גדול', enterprise: 'רשתות'
  };

  /* quote: אין מחירון. רשת בגודל כזה סוגרת מחיר בפגישה, ולכן
     אי אפשר להציג לה מספר ואי אפשר לתת לה לבחור את התוכנית
     לבד – היא פונה, ואנחנו מזינים את המחיר שסוכם. */
  var PLAN_SPEC = [
    { id: 'starter', minEmployees: 1, maxEmployees: 10, priceMonthly: 199 },
    { id: 'growth', minEmployees: 11, maxEmployees: 30, priceMonthly: 399 },
    { id: 'business', minEmployees: 31, maxEmployees: 99, priceMonthly: 599 },
    { id: 'enterprise', minEmployees: 100, maxEmployees: 0, priceMonthly: 0, quote: true }
  ];

  /* השם והטווח נקראים בכל גישה, כדי שהחלפת שפה תשתקף מיד */
  var PLANS = {};
  PLAN_SPEC.forEach(function (spec) {
    var plan = {
      id: spec.id, minEmployees: spec.minEmployees,
      maxEmployees: spec.maxEmployees, priceMonthly: spec.priceMonthly,
      quote: spec.quote === true
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

  var PLAN_ORDER = ['starter', 'growth', 'business', 'enterprise'];
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

  /* לאן פונה לקוח שצריך הצעת מחיר. וואטסאפ אם יש מספר, אחרת
     מייל – אותו כלל בדיוק כמו במסך התמיכה, כי קישור וואטסאפ בלי
     מספר הוא קישור שבור.

     נבנה כאן ולא בכל מסך בנפרד: שלושה מסכים מציעים את הפנייה
     הזו, ושלוש כתובות שונות הן שלוש דרכים לפספס לקוח. */
  function quoteHref() {
    var text = translate('landing.quoteMessage', 'SetShifts');
    if (WHATSAPP_NUMBER) {
      return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(text);
    }
    return 'mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent(text);
  }

  /* המחיר שבאמת נגבה מהחברה הזו.

     לרשת עם מאה עובדים ומעלה אין מחירון – המחיר נסגר בפגישה
     ומוזן ידנית במשרד האחורי. המחיר המותאם גובר גם בתוכנית
     רגילה, כי לפעמים סוגרים מחיר אחר גם שם, ואם הוא קיים הוא
     האמת: הוא מה שהלקוח הסכים לשלם.

     מחזיר 0 כשאין מחיר כלל – כלומר "עוד לא סוכם", ולא "חינם".
     מי שקורא חייב להבדיל בין השניים: אסור לחייב 0. */
  function effectivePrice(company) {
    var custom = Number(company && company.customPriceMonthly);
    if (isFinite(custom) && custom > 0) return Math.round(custom);
    return planOf(company).priceMonthly || 0;
  }

  /* האם המחיר של החברה הזו עוד לא נקבע. תוכנית הצעת־מחיר בלי
     מחיר מוזן היא בדיוק המצב הזה, והחיוב האוטומטי חייב לדלג
     עליה ולא לנסות לגבות אפס. */
  function awaitingQuote(company) {
    return planOf(company).quote === true && effectivePrice(company) <= 0;
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

  /* ===== קופונים =====

     שני סוגים בלבד, ובכוונה:

       days     מאריך את תקופת הניסיון או את התקופה המשולמת.
                "חודש נוסף ללא עלות" הוא days=30.
       percent  הנחה על החיוב הבא. 100 פירושו חיוב אחד שלא נגבה.

     למה לא "סכום קבוע בשקלים": מוצר שנמכר בכמה מדינות אינו יכול
     להחזיק הנחה של "50" בלי לדעת של מה. אחוז עובד בכל מטבע.

     ההנחה חלה על החיוב הבא בלבד, ולא "לתמיד": קופון שיווקי שנשאר
     פעיל שנה הוא הכנסה שנעלמה בלי שאיש החליט על כך. מי שרוצה
     הנחה קבועה מזין מחיר מוסכם במשרד האחורי -- שם זו החלטה
     מודעת, והיא רשומה על שם מי שקיבל אותה. */
  var COUPON = { DAYS: 'days', PERCENT: 'percent' };

  /* הקוד מנורמל לפני כל השוואה: הלקוח יקליד "extra month",
     "Extra-Month" ו-"EXTRAMONTH ", וכולם אותו קופון. */
  function normalizeCouponCode(code) {
    return String(code == null ? '' : code)
      .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
  }

  /* מה לא בסדר בקופון הזה, או null אם הוא תקף.
     מחזיר מפתח קצר ולא משפט: המשפט נבחר במסך, בשפה של הלקוח. */
  function couponProblem(coupon, company, now) {
    if (!coupon || !normalizeCouponCode(coupon.code)) return 'notFound';
    if (coupon.active === false) return 'notFound';
    if (COUPON.DAYS !== coupon.kind && COUPON.PERCENT !== coupon.kind) return 'notFound';
    if (!(Number(coupon.value) > 0)) return 'notFound';
    if (coupon.kind === COUPON.PERCENT && Number(coupon.value) > 100) return 'notFound';

    var today = now ? new Date(now) : new Date();
    if (coupon.validUntil && new Date(coupon.validUntil) < today) return 'expired';

    var max = Number(coupon.maxUses);
    if (isFinite(max) && max > 0 && Number(coupon.uses || 0) >= max) return 'exhausted';

    /* קופון אחד ללקוח, לכל החיים. בלי הכלל הזה לקוח שקיבל שלוש
       הודעות שיווקיות מממש שלושה קופונים ומגיע לחיוב אפס. */
    if (company && normalizeCouponCode(company.couponCode)) return 'already';
    return null;
  }

  /* מה הקופון עושה לחברה. מחזיר את השינוי בלבד, ולא נוגע בשום
     דבר -- מי שמחיל אותו הוא השרת, וכאן רק מחושב מה מגיע. */
  function couponEffect(coupon, company, now) {
    if (couponProblem(coupon, company, now)) return null;
    var value = Math.round(Number(coupon.value));
    if (coupon.kind === COUPON.DAYS) {
      /* מהתוקף הקיים, ולא מהיום: לקוח שנותרו לו עשרה ימי ניסיון
         ומימש "חודש נוסף" אמור לקבל ארבעים, לא שלושים. תוקף
         שכבר עבר אינו מקצר -- מונים מהיום. */
      var from = company && company.validUntil ? new Date(company.validUntil) : null;
      var base = now ? new Date(now) : new Date();
      if (from && from > base) base = from;
      return { kind: COUPON.DAYS, days: value, validUntil: addDays(base, value) };
    }
    return { kind: COUPON.PERCENT, percent: Math.min(100, value), charges: 1 };
  }

  /* הסכום שייגבה בפועל בחיוב הקרוב, אחרי ההנחה.

     base מגיע מבחוץ ולא מחושב כאן, כי הוא כבר עבר את הכלל של
     "מחיר מוסכם גובר על המחירון" -- ושכפול הכלל הזה היה מייצר
     שני מחירים שונים לאותו לקוח. */
  function discountedPrice(base, company) {
    var amount = Math.max(0, Math.round(Number(base) || 0));
    if (!company || !(Number(company.discountChargesLeft) > 0)) return amount;
    var percent = Math.max(0, Math.min(100, Number(company.discountPercent) || 0));
    if (!percent) return amount;
    return Math.max(0, Math.round(amount * (100 - percent) / 100));
  }

  /* האם החיוב הקרוב נופל לאפס בגלל הנחה מלאה. זה מצב תקין --
     "חודש חינם" -- ואסור לבלבל אותו עם "אין מחיר", שבו אין מה
     לגבות כי המחיר עוד לא סוכם. הראשון מאריך את התקופה בלי
     לגבות; השני מדלג ומחכה לאדם. */
  function isFullyDiscounted(base, company) {
    return Number(base) > 0 && discountedPrice(base, company) === 0;
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
      /* ימי חסד אחרי כישלון תשלום.

         מנוע החיוב ממשיך לנסות GRACE_DAYS ימים אחרי שהתוקף עבר,
         והטקסט אומר ללקוח "הגישה תיחסם בעוד X ימים". קודם לכן
         המספר הזה היה הבטחה בלבד: החסימה התרחשה ברגע שהתוקף עבר,
         כלומר באותו יום שבו הכרטיס נדחה.

         זה פגע דווקא בלקוח משלם – כרטיס שפג או יום בלי מסגרת
         נעלו לו את הסידור מיד, בזמן שאנחנו עוד מנסים לגבות ממנו.
         עכשיו שני הצדדים משתמשים באותו מספר. */
      var sinceDue = validUntil
        ? Math.floor((today - validUntil) / (24 * 60 * 60 * 1000))
        : 0;
      if (validUntil && sinceDue > GRACE_DAYS) {
        return { allowed: false, reason: 'past-due-expired', daysLeft: 0,
          text: translate('access.pastDueBlocked', 'התשלום לא התקבל והגישה נחסמה.') };
      }
      /* כמה ימים נשארו לתקן, ולא כמה נשארו לתוקף שכבר עבר */
      var graceLeft = Math.max(0, GRACE_DAYS - Math.max(0, sinceDue));
      return { allowed: true, reason: 'past-due', daysLeft: graceLeft,
        text: translate('access.pastDue', 'התשלום האחרון לא עבר.', { days: graceLeft }) };
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
    /* התוכנית המוצעת עשויה להיות תוכנית הצעת־מחיר. אז אין מספר
       להציג ואין לאן ללחוץ "שדרג" – הפנייה היא אלינו. */
    var price = suggested.quote
      ? translate('plans.quotePrice', 'לפי הצעת מחיר')
      : translate('billing.priceMonthly', suggested.priceMonthly + '₪',
        { amount: suggested.priceMonthly });
    return {
      ok: false,
      quote: suggested.quote === true,
      /* הקישור נבנה כאן כי כאן יושבות שתי הכתובות. המסך שמציג
         את החסימה אינו צריך לדעת איך פונים אלינו. */
      quoteHref: suggested.quote ? quoteHref() : null,
      /* התוכנית הנוכחית והמחיר המוצע חוזרים כאן ולא רק בתוך
         המשפט: המסך שמציע שדרוג צריך את המספרים עצמם, ולא
         משפט שהוא ינסה לפרק בחזרה. */
      plan: plan,
      suggested: suggested,
      price: price,
      problems: [translate(suggested.quote ? 'access.overLimitQuote' : 'access.overLimit',
        'חריגה ממגבלת התוכנית', {
          plan: plan.name, max: plan.maxEmployees, count: employees,
          suggested: suggested.name, range: suggested.range, price: price
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
  /* מספר עוסק / ח.פ.

     המוצר עובד בכמה מדינות, ולכן אין כאן ולידציה לפי מבנה
     ישראלי: מספר תקין בגרמניה אינו נראה כמו מספר תקין בישראל,
     וחסימה לפי תבנית אחת פירושה לקוח שאינו יכול להזין את המספר
     האמיתי שלו. מה שכן: מנקים רווחים ותווים שאינם שייכים, כדי
     שמה שמגיע לחשבונית יהיה מה שהוא התכוון לכתוב. */
  function normalizeTaxId(value) {
    return String(value == null ? '' : value)
      .replace(/[^0-9A-Za-z\-]/g, '')
      .slice(0, 30);
  }

  /* טלפון ליצירת קשר עם הלקוח.

     אותו שיקול כמו במספר העוסק, ומסיבה חזקה יותר: מספר תקין
     בגרמניה, בברזיל ובישראל אינו נראה אותו דבר, וחסימה לפי
     תבנית ישראלית פירושה לקוח מחו"ל שאינו יכול להירשם בכלל.
     לכן נשמרים התווים שמרכיבים מספר בעולם — ספרות, קידומת
     בינלאומית, וסימני הפרדה — והבדיקה היחידה היא שיש מספיק
     ספרות כדי שזה יהיה מספר ולא הקלדה מקרית.

     שבע ספרות הוא המינימום: מספר מקומי קצר ביותר בעולם. */
  function normalizePhone(value) {
    var clean = String(value == null ? '' : value)
      .replace(/[^0-9+()\-. ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30);
    /* פלוס אחד בלבד, ורק בהתחלה: "+" באמצע אינו חלק משום מספר */
    return clean.replace(/(?!^)\+/g, '');
  }

  function phoneDigits(value) {
    return String(value == null ? '' : value).replace(/\D/g, '').length;
  }

  function isValidPhone(value) {
    return phoneDigits(normalizePhone(value)) >= 7;
  }

  /* לוגו העסק.

     נשמר כ-data URI בשורת החברה ולא כקובץ באחסון נפרד. הסיבה
     אינה עצלות: אחסון קבצים דורש דלי, מדיניות גישה משלו וכתובת
     ציבורית לכל לוגו — כלומר עוד מקום שבו בידוד בין חברות יכול
     להישבר, בשביל תמונה שגודלה כמה עשרות קילובייט. הלוגו נוסע
     ממילא עם שורת החברה שנטענת בכל כניסה.

     בגלל זה יש תקרה, והיא נאכפת גם כאן וגם בשרת: שורה שמגיעה
     למאה קילובייט מאטה כל טעינה של כל משתמש בחברה. הדפדפן
     מקטין את התמונה לפני השליחה (js/company-logo.js), וזה מוריד
     כמעט כל קובץ אל מתחת לתקרה.

     רק שלושת הפורמטים האלה. SVG אינו ברשימה בכוונה: הוא מסמך
     שיכול להכיל סקריפט, ולוגו שמנהל מעלה מוצג אצל כל העובדים
     שלו. */
  var LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  var LOGO_MAX_BYTES = 64 * 1024;

  function isLogoType(type) {
    return LOGO_TYPES.indexOf(String(type || '').toLowerCase()) !== -1;
  }

  /* גודל ה-data URI במספר בייטים בפועל */
  function logoBytes(value) {
    var text = String(value == null ? '' : value);
    var comma = text.indexOf(',');
    if (comma === -1) return 0;
    var body = text.slice(comma + 1);
    var padding = body.slice(-2) === '==' ? 2 : (body.slice(-1) === '=' ? 1 : 0);
    return Math.max(0, Math.floor(body.length * 3 / 4) - padding);
  }

  /* מחזיר את הלוגו אם הוא תקין, ומחרוזת ריקה אם לא. ריק פירושו
     "אין לוגו", וזה מצב חוקי לגמרי. */
  function normalizeLogo(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return '';
    var head = text.match(/^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/i);
    if (!head) return '';
    if (!isLogoType(head[1])) return '';
    if (logoBytes(text) > LOGO_MAX_BYTES) return '';
    return text;
  }

  function hasPaymentMethod(company) {
    return !!(company && company.billingSubscriptionId);
  }

  /* מחיר התוכנית כפי שהוא מוצג ללקוח. מחיר שסוכם איתו גובר על
     המחירון, ותוכנית שעוד אין בה מחיר אומרת זאת במילים – מספר
     אפס על מסך חיוב נקרא כמו "חינם". */
  function priceLabel(company) {
    if (awaitingQuote(company)) {
      return translate('plans.quotePrice', 'לפי הצעת מחיר');
    }
    var amount = effectivePrice(company);
    return translate('billing.priceMonthly', amount + '₪', { amount: amount });
  }

  function newTrialCompany(name, now, phone, consent) {
    var today = now ? new Date(now) : new Date();
    return {
      name: name,
      /* מספר העוסק / ח.פ. – הלקוח מזין אותו בהגדרות כשהוא צריך
         חשבונית על שם העסק */
      taxId: '',
      /* טלפון ליצירת קשר. נדרש בהרשמה ולא אופציונלי: כשמנוי
         נכשל, כשלקוח פיילוט נתקע, או כשצריך להודיע על משהו
         דחוף — מייל שאינו נקרא אינו דרך ליצירת קשר. */
      phone: normalizePhone(phone),
      /* לוגו העסק, כ-data URI. ריק עד שהלקוח מעלה אחד. */
      logo: '',
      plan: DEFAULT_PLAN,
      status: SUBSCRIPTION.TRIAL,
      validUntil: addDays(today, TRIAL_DAYS).toISOString(),
      createdAt: today.toISOString(),
      /* ההסכמה לדיוור, עם התאריך ועם הנוסח שהוצג. דגל לבדו
         אינו הוכחה: השאלה שנשאלת בדיעבד היא "איזה נוסח עמד
         מול העיניים שלו, ומתי". */
      waOptIn: !!(consent && consent.optIn),
      waOptInAt: consent && consent.optIn ? (now ? new Date(now) : new Date()).toISOString() : null,
      waOptInText: consent && consent.optIn ? String(consent.text || '').slice(0, 400) : '',
      waOptOutAt: null,
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
    SUPPORT_REPLY_HOURS: SUPPORT_REPLY_HOURS,
    SUPPORT_URGENT_HOURS: SUPPORT_URGENT_HOURS,
    SUPPORT_HOURS_FROM: SUPPORT_HOURS_FROM, SUPPORT_HOURS_TO: SUPPORT_HOURS_TO,
    supportReplyHours: supportReplyHours,
    WHATSAPP_NUMBER: WHATSAPP_NUMBER,
    TICKET_KINDS: TICKET_KINDS, TICKET_STATUSES: TICKET_STATUSES,
    TICKET_LIMITS: TICKET_LIMITS, normalizeTicket: normalizeTicket,
    setBillingLive: setBillingLive, isBillingLive: isBillingLive,
    INVITE: INVITE, INVITE_TTL_HOURS: INVITE_TTL_HOURS,
    inviteState: inviteState, canCancelInvite: canCancelInvite,
    SUBSCRIPTION: SUBSCRIPTION, TRIAL_DAYS: TRIAL_DAYS,
    trialRequiresCard: trialRequiresCard, GRACE_DAYS: GRACE_DAYS,
    CHARGE_GRACE_DAYS: CHARGE_GRACE_DAYS,
    hasPaymentMethod: hasPaymentMethod, formatDate: formatDate, priceLabel: priceLabel,
    normalizeTaxId: normalizeTaxId,
    normalizePhone: normalizePhone, isValidPhone: isValidPhone,
    normalizeLogo: normalizeLogo, isLogoType: isLogoType,
    logoBytes: logoBytes, LOGO_TYPES: LOGO_TYPES, LOGO_MAX_BYTES: LOGO_MAX_BYTES,
    PLANS: PLANS, PLAN_ORDER: PLAN_ORDER, DEFAULT_PLAN: DEFAULT_PLAN,
    planOf: planOf, planRange: planRange, roleName: roleName,
    planForEmployees: planForEmployees, employeesLeft: employeesLeft,
    effectivePrice: effectivePrice, awaitingQuote: awaitingQuote,
    COUPON: COUPON, normalizeCouponCode: normalizeCouponCode,
    couponProblem: couponProblem, couponEffect: couponEffect,
    discountedPrice: discountedPrice, isFullyDiscounted: isFullyDiscounted,
    quoteHref: quoteHref,
    accessState: accessState, withinPlanLimits: withinPlanLimits,
    newTrialCompany: newTrialCompany, addDays: addDays
  };

  root.ShiftModel = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
