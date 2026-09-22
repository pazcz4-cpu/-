/* קליטת אירועי חיוב מספק התשלומים.
   זו הנקודה שבה מנוי הופך ל"משלם": בתום 14 ימי הניסיון הספק מחייב
   את הכרטיס בעצמו ושולח לכאן אירוע, וכאן מתעדכן מצב המנוי.

   שלושה עקרונות:
   1. הדפדפן לעולם אינו קובע את מצב המנוי – רק האירוע הזה.
   2. כל אירוע מעובד פעם אחת. ספקים שולחים את אותו אירוע שוב ושוב,
      ובלי מניעת כפילות לקוח עלול לקבל חודש כפול.
   3. אירוע בלי חתימה תקפה נדחה. בלי זה כל אחד יכול לשלוח לכאן
      "המנוי שולם".

   משתני סביבה:
     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
     BILLING_PROVIDER        paddle | stripe | payplus | mock
     BILLING_WEBHOOK_SECRET  הסוד לאימות החתימה
*/
'use strict';

const { projectUrl } = require('../_supabase.js');

const providers = require('./_providers.js');
const Model = require('../../js/backend/model.js');

/* אורך תקופת חיוב, זהה לזה שבמנוע החיוב היומי */
const MONTH_DAYS = 30;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function db(path, options) {
  const opts = options || {};
  const url = projectUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(url + '/rest/v1' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation'
    }, opts.headers || {}),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const text = await response.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch (err) { body = { message: text }; } }
  return { ok: response.ok, status: response.status, body };
}

/* Vercel מפרק גוף JSON מראש, אבל אימות חתימה דורש את הבייטים
   המקוריים – שינוי של רווח אחד שובר את החתימה. */
function rawBody(req) {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
  if (req.body && typeof req.body === 'object') return Promise.resolve(JSON.stringify(req.body));
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return send(res, 500, { message: 'Server is not configured' });
  }

  const name = process.env.BILLING_PROVIDER || 'mock';
  const provider = providers[name];
  if (!provider) return send(res, 500, { message: 'Unknown billing provider: ' + name });

  const raw = await rawBody(req);

  /* 1. חתימה */
  if (!provider.verify(raw, req.headers, process.env.BILLING_WEBHOOK_SECRET)) {
    return send(res, 401, { message: 'Invalid signature' });
  }

  /* 2. תרגום לאירוע אחיד */
  let event;
  try {
    event = provider.parse(JSON.parse(raw));
  } catch (err) {
    return send(res, 400, { message: 'Could not parse event: ' + err.message });
  }
  if (!event || !event.id) return send(res, 400, { message: 'Event has no id' });

  /* אירוע שאינו נוגע למנוי – מאשרים ולא עושים כלום, אחרת הספק
     ינסה לשלוח אותו שוב ושוב. */
  if (!event.subscriptionId) return send(res, 200, { ok: true, ignored: true });

  /* 3. מניעת עיבוד כפול. ההכנסה היא שקובעת: אם המזהה כבר קיים,
     בסיס הנתונים דוחה אותה ואנחנו יוצאים. */
  const claim = await db('/billing_events', {
    method: 'POST',
    prefer: 'return=minimal',
    body: [{
      id: event.id, provider: name, type: event.type, payload: event.payload || null
    }]
  });
  if (!claim.ok) {
    const duplicate = claim.status === 409 ||
      (claim.body && String(claim.body.code) === '23505');
    if (duplicate) return send(res, 200, { ok: true, duplicate: true });
    return send(res, 500, { message: 'Could not record the event' });
  }

  /* 4. אימות מול הספק עצמו.
     ספק שיודע לאמת עסקה (PayPlus, דרך ipn-full) הוא מקור האמת,
     וההודעה הנכנסת משמשת רק כדי לדעת איזו עסקה לבדוק. הכלל הזה
     כתוב בתיעוד שלהם במפורש: הפניה מוצלחת אינה הוכחת תשלום.

     ספק בלי יכולת אימות (הספק המדומה) ממשיך להתנהג כקודם. */
  let verified = null;
  if (typeof provider.verifyTransaction === 'function') {
    try {
      verified = await provider.verifyTransaction(event);
    } catch (err) {
      verified = { verified: false, reason: (err && err.message) || 'verify-failed' };
    }
  }

  /* 5. איתור החברה.
     באירוע הראשון של מנוי חדש הטוקן עדיין אינו מקושר, ולכן
     מאתרים לפי המזהה שנשלח בפתיחת התשלום. */
  const lookup = event.companyId
    ? '/companies?id=eq.' + encodeURIComponent(event.companyId) + '&select=*'
    : '/companies?billing_subscription_id=eq.' +
      encodeURIComponent(event.subscriptionId) + '&select=*';
  const found = await db(lookup);
  if (!found.ok) return send(res, 500, { message: 'Could not read the company' });
  const company = found.body && found.body[0];
  if (!company) {
    /* אין חברה כזו. מאשרים בכל זאת, אחרת הספק ינסה לנצח. */
    return send(res, 200, { ok: true, unmatched: true });
  }

  /* 6. קישור אמצעי התשלום. זה בטוח תמיד: טוקן שמור אינו כסף
     שעבר, והוא מה שמאפשר למנוע החיוב לגבות בתום הניסיון. */
  const patch = { billing_provider: name };
  if (event.customerId) patch.billing_customer_id = event.customerId;
  if (event.companyId || !company.billing_subscription_id) {
    patch.billing_subscription_id = event.subscriptionId;
  }

  /* 7. מה שמשנה כסף.
     אצל ספק מאומת: רק תוצאה שחזרה מהספק, ורק אם הסכום והמטבע
     תואמים למה שאמורים לגבות. אחרת מקשרים את הכרטיס ולא נוגעים
     במצב המנוי – עדיף לקוח שנשאר בניסיון יום נוסף על לקוח
     שסומן כמשלם בלי ששילם. */
  let note = null;
  if (verified) {
    if (!verified.verified) {
      /* שמירת כרטיס בלי חיוב – אין עסקה לאמת, וזה תקין */
      note = verified.reason === 'no-transaction' ? 'card-saved' : 'unverified';
    } else if (verified.outcome === 'approved') {
      const plan = Model.PLANS[company.plan] || Model.PLANS[Model.DEFAULT_PLAN];
      const expected = plan.priceMonthly;
      const currency = String(verified.currency || 'ILS').toUpperCase();
      if (Number(verified.amount) !== Number(expected) || currency !== 'ILS') {
        /* לא מסמנים ששולם על סכום שלא ביקשנו. האירוע נשמר, וההפרש
           ייראה ביומן. */
        note = 'amount-mismatch';
      } else {
        const until = new Date(Date.now() + MONTH_DAYS * 864e5).toISOString();
        patch.status = 'active';
        patch.valid_until = until;
        patch.current_period_end = until;
        note = 'charged';
      }
    } else if (verified.outcome === 'declined') {
      patch.status = 'past_due';
      note = 'declined';
    } else {
      note = 'status-' + (verified.rawStatus || 'unknown');
    }
  } else {
    /* ספק בלי אימות: מה שכתוב באירוע הוא מה שיש */
    if (event.status) patch.status = event.status;
    if (event.currentPeriodEnd) {
      patch.valid_until = event.currentPeriodEnd;
      patch.current_period_end = event.currentPeriodEnd;
    }
    if (typeof event.cancelAtPeriodEnd === 'boolean') {
      patch.cancel_at_period_end = event.cancelAtPeriodEnd;
    }
    if (event.plan) patch.plan = event.plan;
  }

  const updated = await db('/companies?id=eq.' + encodeURIComponent(company.id),
    { method: 'PATCH', body: patch });
  if (!updated.ok) return send(res, 500, { message: 'Could not update the subscription' });

  await db('/billing_events?id=eq.' + encodeURIComponent(event.id), {
    method: 'PATCH', prefer: 'return=minimal',
    body: { company_id: company.id }
  });

  return send(res, 200, {
    ok: true, company: company.id, status: patch.status || null, note: note
  });
};

/* Vercel מפרק גוף JSON מראש, ואז החתימה נבדקת על בייטים שנבנו
   מחדש ולא על אלה שנשלחו. כאן קוראים את הגוף בעצמנו. */
module.exports.config = { api: { bodyParser: false } };
