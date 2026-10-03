/* סנכרון הוצאות פרסום. שני מסלולים, וכל אחד עם הסוד שלו:

     GET  ?action=meta     cron יומי של Vercel.      Bearer CRON_SECRET
     POST ?action=google   סקריפט בתוך Google Ads.   Bearer GOOGLE_ADS_SYNC_SECRET

   הלוגיקה ב-_ads-sync.js. */
'use strict';

const Ads = require('./_ads-sync.js');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body || '{}')); } catch (err) { return Promise.resolve(null); }
  }
  return new Promise(function (resolve) {
    let raw = '';
    req.on('data', function (chunk) { raw += chunk; if (raw.length > 200000) req.destroy(); });
    req.on('end', function () { try { resolve(JSON.parse(raw || '{}')); } catch (err) { resolve(null); } });
    req.on('error', function () { resolve(null); });
  });
}

function bearer(req, secretName) {
  const secret = String(process.env[secretName] || '').trim();
  const auth = String((req.headers && req.headers.authorization) || '');
  return !!secret && auth === 'Bearer ' + secret;
}

module.exports = async function handler(req, res) {
  const action = new URL(req.url, 'https://setshifts.com').searchParams.get('action');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return send(res, 500, { message: 'Server is not configured' });
  }

  if (action === 'meta') {
    if (!bearer(req, 'CRON_SECRET')) return send(res, 401, { message: 'Unauthorized' });
    const result = await Ads.syncMeta(new Date());
    console.log('[ads-sync] meta', JSON.stringify(result));
    return send(res, result.ok ? 200 : 502, result);
  }

  if (action === 'google') {
    if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
    if (!bearer(req, 'GOOGLE_ADS_SYNC_SECRET')) return send(res, 401, { message: 'Unauthorized' });
    const body = await readJson(req);
    if (!body) return send(res, 400, { message: 'Bad JSON' });
    const result = await Ads.receiveGoogle(body);
    console.log('[ads-sync] google', JSON.stringify(result));
    return send(res, result.ok ? 200 : 400, result);
  }

  return send(res, 404, { message: 'Unknown action' });
};
