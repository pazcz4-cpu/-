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

  /* 4. עדכון החברה. מאתרים לפי מזהה המנוי אצל הספק. */
  const patch = { billing_provider: name };
  if (event.status) patch.status = event.status;
  if (event.currentPeriodEnd) {
    patch.valid_until = event.currentPeriodEnd;
    patch.current_period_end = event.currentPeriodEnd;
  }
  if (event.customerId) patch.billing_customer_id = event.customerId;
  if (typeof event.cancelAtPeriodEnd === 'boolean') {
    patch.cancel_at_period_end = event.cancelAtPeriodEnd;
  }
  if (event.plan) patch.plan = event.plan;

  let target = '/companies?billing_subscription_id=eq.' + encodeURIComponent(event.subscriptionId);

  /* האירוע הראשון של מנוי חדש: המנוי עדיין לא מקושר לחברה, ולכן
     מאתרים לפי המזהה שנשלח בפתיחת התשלום ומקשרים עכשיו. */
  if (event.companyId) {
    target = '/companies?id=eq.' + encodeURIComponent(event.companyId);
    patch.billing_subscription_id = event.subscriptionId;
  }

  const updated = await db(target, { method: 'PATCH', body: patch });
  if (!updated.ok) return send(res, 500, { message: 'Could not update the subscription' });
  if (!updated.body || !updated.body.length) {
    /* אין חברה כזו. מאשרים בכל זאת, אחרת הספק ינסה לנצח. */
    return send(res, 200, { ok: true, unmatched: true });
  }

  await db('/billing_events?id=eq.' + encodeURIComponent(event.id), {
    method: 'PATCH', prefer: 'return=minimal',
    body: { company_id: updated.body[0].id }
  });

  return send(res, 200, { ok: true, company: updated.body[0].id, status: patch.status });
};
