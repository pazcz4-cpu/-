/* משיכת הוצאות הפרסום אוטומטית, במקום הזנה ידנית בלשונית "שיווק".

   ═══ Meta (פייסבוק ואינסטגרם) ═══
   השרת מושך פעם ביום מ-Marketing API את ההוצאה היומית של חשבון
   המודעות, 5 שבועות אחורה (Meta מעדכנת הוצאה בדיעבד), ומסכם לפי
   שבוע שמתחיל ביום ראשון.
     META_ADS_TOKEN       טוקן של משתמש מערכת עם הרשאת ads_read  (סודי!)
     META_AD_ACCOUNT_ID   מספר חשבון המודעות (עם או בלי act_)
     META_GRAPH_VERSION   לא חובה. ברירת מחדל כמו בוואטסאפ.

   ═══ Google Ads ═══
   ה-API של גוגל דורש developer token שעובר אישור ידני של גוגל. הדרך
   הקצרה: סקריפט קטן בתוך חשבון Google Ads (Tools → Scripts) שרץ פעם
   ביום ושולח לכאן את ההוצאה היומית של 30 הימים האחרונים. הסקריפט
   המוכן נמצא ב-docs/marketing-strategy.md.
     GOOGLE_ADS_SYNC_SECRET  סוד משותף לסקריפט ולשרת  (סודי!)

   ═══ מה נכתב ═══
   marketing_spend, שורה לכל (שבוע, ערוץ), עם note שמתחיל ב"אוטומטי".
   שורה של אותו שבוע וערוץ שהוזנה ביד מוחלפת: האמת היא מה שהפלטפורמה
   גבתה. שבוע שהטווח שנשלח אינו מכסה מתחילתו אינו נכתב, כדי ששבוע
   מלא לא יוחלף בחלק ממנו. כל סנכרון נרשם ביומן (billing_events)
   והמשרד האחורי מציג מתי היה האחרון ואם הצליח. */
'use strict';

const { projectUrl } = require('./_supabase.js');

const DAY = 864e5;
const META_WEEKS_BACK = 5;
const DEFAULT_GRAPH = 'v26.0';

function weekStartOf(dateText) {
  const d = new Date(String(dateText).slice(0, 10) + 'T00:00:00Z');
  return new Date(d.getTime() - d.getUTCDay() * DAY).toISOString().slice(0, 10);
}

/* ימים → שבועות. רק שבועות שהטווח מכסה מיום ראשון שלהם. */
function weeklyTotals(days) {
  const valid = days.filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d.date)) && isFinite(Number(d.cost)); });
  if (!valid.length) return [];
  const first = valid.map(function (d) { return d.date; }).sort()[0];
  const totals = {};
  valid.forEach(function (d) {
    const week = weekStartOf(d.date);
    totals[week] = (totals[week] || 0) + Number(d.cost);
  });
  return Object.keys(totals).sort()
    .filter(function (week) { return week >= first; })
    .map(function (week) { return { week: week, amount: Math.round(totals[week] * 100) / 100 }; });
}

async function rest(path, options) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const opts = options || {};
  const response = await fetch(projectUrl() + '/rest/v1' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({ apikey: key, Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json' }, opts.headers || {}),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  return { ok: response.ok, status: response.status };
}

async function store(channel, weeks, source) {
  if (!weeks.length) return { ok: true, weeks: 0 };
  const result = await rest('/marketing_spend?on_conflict=week_start,channel', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: weeks.map(function (w) {
      return { week_start: w.week, channel: channel, amount: w.amount, note: 'אוטומטי: ' + source };
    })
  });
  return { ok: result.ok, weeks: weeks.length };
}

async function logSync(channel, outcome) {
  await rest('/billing_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: [{
    id: 'sync:' + channel + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 8),
    provider: 'marketing', company_id: null, type: 'marketing.sync',
    payload: Object.assign({ channel: channel, at: new Date().toISOString() }, outcome)
  }] });
}

function metaReady() {
  return !!(String(process.env.META_ADS_TOKEN || '').trim() && String(process.env.META_AD_ACCOUNT_ID || '').trim());
}

/* ההוצאה היומית מ-Meta. now נחשף לבדיקות. */
async function fetchMeta(now) {
  const token = String(process.env.META_ADS_TOKEN || '').trim();
  const account = 'act_' + String(process.env.META_AD_ACCOUNT_ID || '').trim().replace(/^act_/, '');
  const version = String(process.env.META_GRAPH_VERSION || '').trim() || DEFAULT_GRAPH;
  const until = new Date(now.getTime() - DAY).toISOString().slice(0, 10);
  const since = new Date(new Date(weekStartOf(until) + 'T00:00:00Z').getTime() - META_WEEKS_BACK * 7 * DAY)
    .toISOString().slice(0, 10);
  const base = 'https://graph.facebook.com/' + version + '/' + encodeURIComponent(account);

  /* מטבע: הסכומים נשמרים בשקלים. חשבון במטבע אחר נעצר עם שגיאה ברורה
     ולא נכתב כמספר שגוי. */
  const accountRes = await fetch(base + '?fields=currency&access_token=' + encodeURIComponent(token));
  const accountBody = await accountRes.json().catch(function () { return {}; });
  if (!accountRes.ok) throw new Error('meta: ' + ((accountBody.error && accountBody.error.message) || accountRes.status));
  if (accountBody.currency && accountBody.currency !== 'ILS') {
    throw new Error('meta: ad account currency is ' + accountBody.currency + ', expected ILS');
  }

  let url = base + '/insights?level=account&fields=spend&time_increment=1&limit=100' +
    '&time_range=' + encodeURIComponent(JSON.stringify({ since: since, until: until })) +
    '&access_token=' + encodeURIComponent(token);
  const days = [];
  for (let page = 0; url && page < 20; page++) {
    const res = await fetch(url);
    const body = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error('meta: ' + ((body.error && body.error.message) || res.status));
    (body.data || []).forEach(function (row) { days.push({ date: row.date_start, cost: Number(row.spend) || 0 }); });
    url = body.paging && body.paging.next;
  }
  /* יום בלי הוצאה אינו מופיע בתשובה. מוסיפים את תחילת הטווח כיום אפס,
     כדי ששבוע ראשון בלי פרסום לא ייחשב "לא מכוסה". */
  days.push({ date: since, cost: 0 });
  return days;
}

async function syncMeta(now) {
  if (!metaReady()) return { ok: true, skipped: 'not configured' };
  try {
    const weeks = weeklyTotals(await fetchMeta(now || new Date()));
    const saved = await store('meta', weeks, 'Meta API');
    const outcome = { ok: saved.ok, weeks: saved.weeks,
      total: weeks.reduce(function (t, w) { return t + w.amount; }, 0) };
    await logSync('meta', outcome);
    return outcome;
  } catch (err) {
    const outcome = { ok: false, error: String(err && err.message || err).slice(0, 300) };
    await logSync('meta', outcome);
    return outcome;
  }
}

/* מה שהסקריפט של Google Ads שולח: { currency, rows: [{date, cost}] } */
async function receiveGoogle(body) {
  const rows = Array.isArray(body && body.rows) ? body.rows.slice(0, 400) : [];
  if (body && body.currency && body.currency !== 'ILS') {
    const outcome = { ok: false, error: 'google: account currency is ' + body.currency + ', expected ILS' };
    await logSync('google', outcome);
    return outcome;
  }
  const days = rows.map(function (r) {
    return { date: String(r.date || '').slice(0, 10), cost: Number(r.cost) };
  });
  /* יום בלי הוצאה אינו מופיע בדוח של גוגל. since הוא תחילת הטווח
     שהסקריפט ביקש, וכך שבוע ראשון בלי פרסום עדיין נחשב מכוסה. */
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(body && body.since))) days.push({ date: body.since, cost: 0 });
  const weeks = weeklyTotals(days);
  const saved = await store('google', weeks, 'Google Ads');
  const outcome = { ok: saved.ok, weeks: saved.weeks,
    total: weeks.reduce(function (t, w) { return t + w.amount; }, 0) };
  await logSync('google', outcome);
  return outcome;
}

module.exports = { syncMeta: syncMeta, receiveGoogle: receiveGoogle, metaReady: metaReady,
  _internals: { weeklyTotals: weeklyTotals, weekStartOf: weekStartOf, fetchMeta: fetchMeta } };
