/* מנוע החיוב האוטומטי. רץ פעם ביום (Vercel Cron).

   זה מה שגורם ל"14 ימים ללא חיוב ואז חיוב אוטומטי" לקרות בפועל:
     · ניסיון שהסתיים ויש לו כרטיס  → חיוב ראשון
     · מנוי פעיל שהתקופה שלו נגמרה  → חידוש חודשי
     · חיוב שנכשל                    → ניסיון חוזר בתוך ימי החסד
     · מנוי שבוטל והתקופה נגמרה      → סגירה, בלי חיוב
     · ניסיון שהסתיים בלי כרטיס      → פקיעה, בלי חיוב

   הכלל החשוב ביותר כאן הוא שאסור לחייב פעמיים. לכן לפני כל חיוב
   נרשמת "תביעה" על התקופה המסוימת הזו ביומן האירועים. אם הרישום
   נכשל כי הוא כבר קיים – מישהו כבר חייב, ואנחנו מדלגים. זה מחזיק
   גם אם ה-cron רץ פעמיים, גם אם הוא רץ במקביל, וגם אם נפל באמצע.

   משתני סביבה:
     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
     BILLING_PROVIDER        paddle | stripe | payplus | mock
     CRON_SECRET             Vercel שולח אותו; בלעדיו כל אחד יכול להריץ
*/
'use strict';

const { projectUrl } = require('../_supabase.js');

const providers = require('./_providers.js');

const MONTH_DAYS = 30;
const GRACE_DAYS = 7;        // כמה זמן ממשיכים לנסות אחרי כישלון
const MAX_COMPANIES = 500;   // תקרה לריצה אחת, כדי לא לחרוג מזמן הריצה

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function addDays(date, days) {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

/* מפתח התקופה שעליה משלמים. שני חיובים לאותה תקופה = אותו מפתח. */
function periodKey(companyId, periodStart) {
  return 'charge:' + companyId + ':' + new Date(periodStart).toISOString().slice(0, 10);
}

async function db(path, options) {
  const opts = options || {};
  const url = projectUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(url + '/rest/v1' + path, {
    method: opts.method || 'GET',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation'
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const text = await response.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch (err) { body = { message: text }; } }
  return { ok: response.ok, status: response.status, body };
}

/* תופסים בלעדיות על מזהה אחד. true = שלנו, false = כבר נתפס. */
async function claim(id, company, type, payload) {
  const result = await db('/billing_events', {
    method: 'POST',
    prefer: 'return=minimal',
    body: [{
      id: id,
      provider: process.env.BILLING_PROVIDER || 'mock',
      company_id: company.id,
      type: type,
      payload: payload
    }]
  });
  if (result.ok) return true;
  const duplicate = result.status === 409 ||
    (result.body && String(result.body.code) === '23505');
  if (duplicate) return false;
  throw new Error('Could not claim the billing period: ' + result.status);
}

/* התוצאה נרשמת על התביעה עצמה, כי היא שקובעת אם מותר לנסות שוב.
     charged   – הכסף עבר. הסכום נשמר כאן, וזו שורת ההכנסה.
     declined  – חברת האשראי אמרה לא. מחר אולי תהיה מסגרת.
     uncertain – לא קיבלנו תשובה. ייתכן שהכרטיס חויב, ולכן לא
                 מנסים שוב לבד; זה עולה לדוח ומחכה לאדם.

   מיזוג ולא החלפה: בשורה כבר יושבים התוכנית ותחילת התקופה,
   ודריסה שלהם הייתה מוחקת את מה שהדוח נשען עליו. */
async function recordOutcome(id, outcome, extra) {
  const current = await db('/billing_events?id=eq.' + encodeURIComponent(id) + '&select=payload');
  const before = (current.ok && current.body && current.body[0] && current.body[0].payload) || {};
  const payload = Object.assign({}, before, extra || {}, {
    outcome: outcome, at: new Date().toISOString()
  });
  return db('/billing_events?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH', prefer: 'return=minimal', body: { payload: payload }
  });
}

async function lastAttempt(id) {
  const row = await db('/billing_events?id=eq.' + encodeURIComponent(id) + '&select=payload');
  const found = row.ok && row.body && row.body[0];
  const payload = (found && found.payload) || {};
  return {
    outcome: payload.outcome || null,
    day: payload.at ? String(payload.at).slice(0, 10) : null
  };
}

/* מי רשאי לנסות עכשיו.
   הניסיון הראשון על תקופה נתפס פעם אחת ולתמיד, ולכן שום תקלה
   ושום ריצה כפולה אינן יכולות לחייב פעמיים. ניסיון חוזר בימי
   החסד נתפס ליום, ורק אם הכישלון הקודם היה סירוב ברור.

   מחזיר { id } אם מותר לנסות, או null. */
async function claimAttempt(company, periodStart, type, now) {
  const periodId = periodKey(company.id, periodStart);
  const payload = { plan: company.plan, period_start: periodStart };

  if (await claim(periodId, company, type, payload)) {
    return { id: periodId, periodId: periodId };
  }

  /* התקופה כבר נתפסה. ניסיון חוזר מותר רק אחרי סירוב ברור,
     ורק ביום אחר – כרטיס שסורב לפני שעה יסורב גם עכשיו. */
  const today = now.toISOString().slice(0, 10);
  const last = await lastAttempt(periodId);
  if (last.outcome !== 'declined') return null;
  if (last.day === today) return null;

  const retryId = periodId + ':retry:' + today;
  const mine = await claim(retryId, company, type + '.retry',
    Object.assign({ retry_of: periodId }, payload));
  return mine ? { id: retryId, periodId: periodId } : null;
}

async function patchCompany(id, patch) {
  return db('/companies?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: patch });
}

/* כמה עובדים פעילים יש לחברה עכשיו.

   נקרא מההגדרות ולא מטבלה: העובדים יושבים ב-jsonb של החברה,
   ואין להם שורות משלהם. נקרא רק כשצריך -- כלומר רק לחברות
   שסגרו תעריף לעובד -- ולא בכל חיוב. */
async function activeEmployees(companyId) {
  const call = await db('/company_configs?company_id=eq.' +
    encodeURIComponent(companyId) + '&select=config');
  if (!call.ok) return null;
  const config = ((call.body || [])[0] || {}).config || {};
  const list = config.employees;
  if (!Array.isArray(list)) return null;
  return list.filter(function (employee) {
    return employee && employee.active !== false;
  }).length;
}

/* המחיר לחיוב הקרוב, לפני הנחות.

   מחזיר { amount } או { reason } -- כי "אין מחיר" אינו סכום,
   וכל מי שיחזיר כאן 0 יגרום לבקשת חיוב על אפס שהספק דוחה. */
async function priceFor(company, plan) {
  const rate = Number(company.custom_price_per_employee);
  if (rate > 0) {
    const count = await activeEmployees(company.id);
    /* ההגדרות לא נקראו, או שאין בהן רשימת עובדים. ניחוש כאן
       הוא חיוב שגוי, ולכן מדלגים ומחכים לריצה הבאה. */
    if (count === null) return { reason: 'employees-unknown' };
    /* רשת בלי עובדים פעילים אינה חייבת דבר החודש. זה מצב תקין
       ולא תקלה, והוא עולה בדוח הריצה כדי שמישהו ישים לב אם
       הוא נמשך. */
    if (count === 0) return { reason: 'no-active-employees' };
    return { amount: Math.round(rate * count) };
  }

  const flat = Number(company.custom_price_monthly);
  if (flat > 0) return { amount: Math.round(flat) };
  if (plan.priceMonthly > 0) return { amount: plan.priceMonthly };
  return { reason: 'price-not-set' };
}

/* חיוב אחד, כולל הטיפול בהצלחה ובכישלון */
async function chargeCompany(provider, company, plans, now) {
  const plan = plans[company.plan];
  if (!plan) return { company: company.id, action: 'skipped', reason: 'unknown-plan' };

  /* הסכום שנגבה: מחיר שסוכם עם הלקוח גובר על המחירון. לרשת אין
     מחירון כלל – המחיר נסגר בפגישה ומוזן במשרד האחורי.

     אם אין מחיר, מדלגים ולא גובים אפס. חיוב על סכום אפס אינו
     "חינם" אלא בקשה שהספק דוחה, ובמקרה הרע חיוב שמופיע ללקוח
     על כלום. הדילוג עולה בדוח הריצה כל יום עד שהמחיר יוזן. */
  /* המחיר המוסכם גובר על המחירון, בשתי צורותיו. תעריף לעובד
     דורש לספור -- וזו הסיבה שהחישוב אינו שורה אחת כאן אלא
     פונקציה שיודעת גם להיכשל בשקט כשאין מה לספור. */
  const priced = await priceFor(company, plan);
  if (priced.reason) {
    return { company: company.id, action: 'skipped', reason: priced.reason };
  }
  const base = priced.amount;

  /* ההנחה מהקופון. שני מצבים שונים לגמרי מגיעים לאפס, ורק אחד
     מהם תקין:

       base = 0          המחיר עוד לא סוכם. מדלגים ומחכים לאדם.
       הנחה של 100%      "חודש חינם" שהובטח ללקוח. התקופה מוארכת
                         בלי לגבות, ובלי לגשת לספק בכלל -- בקשת
                         חיוב על אפס היא בקשה שהספק דוחה.

     הבדיקה על base נעשתה למעלה, ולכן מכאן ואילך אפס פירושו
     הטבה ולא תקלה. */
  const hasDiscount = Number(company.discount_charges_left) > 0;
  const off = hasDiscount ? Math.max(0, Math.round(Number(company.discount_amount) || 0)) : 0;
  const percent = hasDiscount && !off
    ? Math.max(0, Math.min(100, Number(company.discount_percent) || 0))
    : 0;
  const discount = off || percent;
  const amount = off
    ? Math.max(0, base - off)
    : (percent ? Math.max(0, Math.round(base * (100 - percent) / 100)) : base);

  /* התקופה שעליה משלמים מתחילה בדיוק כשהקודמת נגמרה */
  const periodStart = company.valid_until || now.toISOString();
  const first = company.status === 'trial';

  let attempt;
  try {
    attempt = await claimAttempt(company, periodStart,
      first ? 'charge.first' : 'charge.renewal', now);
  } catch (err) {
    return { company: company.id, action: 'error', reason: err.message };
  }
  if (!attempt) return { company: company.id, action: 'skipped', reason: 'already-charged' };

  /* חודש חינם: אין מה לגבות, ויש מה להאריך. נרשם ביומן כמו כל
     חיוב אחר, עם הסכום שנחסך -- אחרת חודש שלא נגבה נראה בדוח
     כמו חודש שנשכח. */
  if (amount === 0) {
    const freeEnd = addDays(new Date(periodStart) > now ? new Date(periodStart) : now, MONTH_DAYS);
    await recordOutcome(attempt.periodId, 'granted', {
      amount: 0, waived: base, currency: 'ILS',
      plan: company.plan, coupon: company.coupon_code || null
    });
    await patchCompany(company.id, {
      status: 'active',
      valid_until: freeEnd.toISOString(),
      current_period_end: freeEnd.toISOString(),
      discount_charges_left: Math.max(0, Number(company.discount_charges_left) - 1)
    });
    return {
      company: company.id, action: 'granted', waived: base,
      until: freeEnd.toISOString()
    };
  }

  let result, thrown;
  try {
    result = await provider.charge({
      subscriptionId: company.billing_subscription_id,
      customerId: company.billing_customer_id,
      amount: amount,
      currency: 'ILS',
      plan: company.plan,
      /* הספק מקבל את מפתח התקופה – לא את מפתח הניסיון – כדי
         שגם הוא יראה ניסיון חוזר כאותה תקופה ולא כחיוב חדש */
      idempotencyKey: attempt.periodId
    });
    thrown = null;
  } catch (err) {
    thrown = (err && err.message) || 'charge threw';
  }

  /* הספק זרק. זה כמעט תמיד תקלה אצלנו – מפתח חסר, ספק שאינו
     מוגדר – ולא סירוב של חברת האשראי. לכן לא מסמנים את הלקוח
     כמי שהתשלום שלו נכשל: הוא ממשיך לעבוד, והתקלה עולה בדוח
     הריצה כל יום עד שמישהו מתקן אותה. גם לא מנסים שוב לבד, כי
     איננו יודעים אם הבקשה הספיקה להגיע. */
  if (thrown) {
    await recordOutcome(attempt.periodId, 'uncertain', { reason: thrown });
    return { company: company.id, action: 'error', reason: thrown };
  }

  if (result && result.ok) {
    const nextEnd = addDays(new Date(periodStart) > now ? new Date(periodStart) : now, MONTH_DAYS);
    /* שורת ההכנסה. בלי הסכום כאן אי אפשר לדעת כמה נכנס בפועל –
       רק שמשהו נכנס – והמשרד האחורי היה מחשב מחזור מתוך המחירון
       ולא מתוך מה שנגבה. */
    await recordOutcome(attempt.periodId, 'charged', {
      amount: amount,
      currency: 'ILS',
      plan: company.plan,
      /* מה היה המחיר לפני ההנחה, ואיזה קופון הוזיל אותו. בלי
         שתי השורות האלה שורת הכנסה נמוכה נראית כמו טעות. */
      list_price: discount ? base : undefined,
      coupon: discount ? (company.coupon_code || null) : undefined,
      transaction_id: result.transactionId || null
    });
    await patchCompany(company.id, Object.assign({
      status: 'active',
      valid_until: nextEnd.toISOString(),
      current_period_end: nextEnd.toISOString()
    }, discount ? {
      /* ההנחה נוצלה. יורדת רק אחרי חיוב שעבר: כרטיס שנדחה
         והתקבל מחר אינו אמור לגבות את המחיר המלא. */
      discount_charges_left: Math.max(0, Number(company.discount_charges_left) - 1)
    } : null));
    return {
      company: company.id, action: first ? 'first-charge' : 'renewal',
      until: nextEnd.toISOString(), transaction: result.transactionId || null
    };
  }

  /* כישלון: עוברים ל-past_due ומשאירים את התוקף כדי שימי החסד
     ייספרו ממנו. אחרי ימי החסד accessState חוסם את הגישה. */
  const reason = (result && result.reason) || 'unknown';
  const declined = !!(result && result.retryable);
  /* התוצאה נרשמת על שורת התקופה, כי היא שנקראת מחר */
  await recordOutcome(attempt.periodId, declined ? 'declined' : 'uncertain', { reason: reason });
  await patchCompany(company.id, { status: 'past_due' });
  return {
    company: company.id, action: 'failed', reason: reason,
    /* סירוב ברור יינוסה שוב מחר; חוסר ודאות מחכה לאדם, כי ניסיון
       חוזר על חיוב שאולי עבר הוא חיוב כפול */
    retry: declined ? 'tomorrow' : 'stopped'
  };
}

module.exports = async function handler(req, res) {
  /* Vercel Cron שולח את הסוד בכותרת. בלי הבדיקה הזו כל אחד
     שמכיר את הכתובת יכול להפעיל סבב חיובים. */
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (!secret || auth !== 'Bearer ' + secret) {
    return send(res, 401, { message: 'Unauthorized' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return send(res, 500, { message: 'Server is not configured' });
  }

  const name = process.env.BILLING_PROVIDER || 'mock';
  const provider = providers[name];
  if (!provider || !provider.charge) {
    return send(res, 500, { message: 'Billing provider cannot charge: ' + name });
  }

  const Model = require('../../js/backend/model.js');
  const plans = Model.PLANS;
  const now = new Date();
  const nowIso = now.toISOString();

  /* כל מי שהתקופה שלו נגמרה. שאר ההחלטות נעשות כאן, בקוד, כדי
     שיהיה אפשר לקרוא אותן במקום אחד. */
  const due = await db('/companies?valid_until=lte.' + encodeURIComponent(nowIso) +
    '&status=in.(trial,active,past_due)' +
    /* הרשימה הזו היא מה שחושב עליו החיוב. עמודה שנשכחת כאן
       אינה שגיאה אלא undefined: המחיר המוסכם של רשת נקרא בקוד
       ולא נשאב מכאן, ולכן רשתות דולגו בשקט בתור "מחיר לא
       נקבע". הבדיקות מחזירות רק את מה שנתבקש, כדי שהשכחה
       הבאה תיפול שם ולא אצל לקוח. */
    '&select=id,plan,status,valid_until,cancel_at_period_end,' +
    'billing_subscription_id,billing_customer_id,custom_price_monthly,' +
    'custom_price_per_employee,' +
    'coupon_code,discount_percent,discount_amount,discount_charges_left' +
    '&order=valid_until.asc&limit=' + MAX_COMPANIES);

  if (!due.ok) return send(res, 500, { message: 'Could not read companies' });

  const results = [];
  for (const company of due.body || []) {
    /* ביטל – לא מחייבים, רק סוגרים */
    if (company.cancel_at_period_end) {
      await patchCompany(company.id, { status: 'canceled' });
      results.push({ company: company.id, action: 'canceled' });
      continue;
    }

    /* ניסיון שנגמר בלי כרטיס – אין ממה לגבות */
    if (!company.billing_subscription_id) {
      await patchCompany(company.id, { status: 'expired' });
      results.push({ company: company.id, action: 'expired', reason: 'no-payment-method' });
      continue;
    }

    /* כישלון קודם: ממשיכים לנסות רק בתוך ימי החסד, ופעם ביום.
       התביעה על התקופה חוסמת ניסיון שני באותו יום ממילא. */
    if (company.status === 'past_due') {
      const graceEnds = addDays(new Date(company.valid_until), GRACE_DAYS);
      if (now > graceEnds) {
        await patchCompany(company.id, { status: 'expired' });
        results.push({ company: company.id, action: 'expired', reason: 'grace-ended' });
        continue;
      }
    }

    results.push(await chargeCompany(provider, company, plans, now));
  }

  const summary = results.reduce((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1;
    return acc;
  }, {});

  return send(res, 200, { ok: true, checked: (due.body || []).length, summary, results });
};

/* נחשף לבדיקות */
module.exports.periodKey = periodKey;
module.exports.GRACE_DAYS = GRACE_DAYS;
module.exports.MONTH_DAYS = MONTH_DAYS;
