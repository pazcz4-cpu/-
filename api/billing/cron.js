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

/* תופסים בלעדיות על חיוב התקופה. true = שלנו, false = כבר נתפס. */
async function claimPeriod(company, periodStart, type) {
  const claim = await db('/billing_events', {
    method: 'POST',
    prefer: 'return=minimal',
    body: [{
      id: periodKey(company.id, periodStart),
      provider: process.env.BILLING_PROVIDER || 'mock',
      company_id: company.id,
      type: type,
      payload: { plan: company.plan, period_start: periodStart }
    }]
  });
  if (claim.ok) return true;
  const duplicate = claim.status === 409 ||
    (claim.body && String(claim.body.code) === '23505');
  if (duplicate) return false;
  throw new Error('Could not claim the billing period: ' + claim.status);
}

async function patchCompany(id, patch) {
  return db('/companies?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: patch });
}

/* חיוב אחד, כולל הטיפול בהצלחה ובכישלון */
async function chargeCompany(provider, company, plans, now) {
  const plan = plans[company.plan];
  if (!plan) return { company: company.id, action: 'skipped', reason: 'unknown-plan' };

  /* התקופה שעליה משלמים מתחילה בדיוק כשהקודמת נגמרה */
  const periodStart = company.valid_until || now.toISOString();
  const first = company.status === 'trial';

  let mine;
  try {
    mine = await claimPeriod(company, periodStart, first ? 'charge.first' : 'charge.renewal');
  } catch (err) {
    return { company: company.id, action: 'error', reason: err.message };
  }
  if (!mine) return { company: company.id, action: 'skipped', reason: 'already-charged' };

  let result;
  try {
    result = await provider.charge({
      subscriptionId: company.billing_subscription_id,
      customerId: company.billing_customer_id,
      amount: plan.priceMonthly,
      currency: 'ILS',
      plan: company.plan,
      /* הספק מקבל את אותו מפתח, כדי שגם הוא לא יחייב פעמיים */
      idempotencyKey: periodKey(company.id, periodStart)
    });
  } catch (err) {
    result = { ok: false, reason: err.message, retryable: true };
  }

  if (result && result.ok) {
    const nextEnd = addDays(new Date(periodStart) > now ? new Date(periodStart) : now, MONTH_DAYS);
    await patchCompany(company.id, {
      status: 'active',
      valid_until: nextEnd.toISOString(),
      current_period_end: nextEnd.toISOString()
    });
    return {
      company: company.id, action: first ? 'first-charge' : 'renewal',
      until: nextEnd.toISOString(), transaction: result.transactionId || null
    };
  }

  /* כישלון: עוברים ל-past_due ומשאירים את התוקף כדי שימי החסד
     ייספרו ממנו. אחרי ימי החסד accessState חוסם את הגישה. */
  await patchCompany(company.id, { status: 'past_due' });
  return {
    company: company.id, action: 'failed',
    reason: (result && result.reason) || 'unknown'
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
    '&select=id,plan,status,valid_until,cancel_at_period_end,billing_subscription_id,billing_customer_id' +
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
