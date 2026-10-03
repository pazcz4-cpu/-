#!/usr/bin/env node
/* בדיקת יום העלייה: מה שאפשר לראות מבחוץ, בלי אף מפתח.

   מריצים מהמחשב שלך (השרת של Anthropic אינו מגיע לאתר):
     node tools/golive-check.js
     node tools/golive-check.js https://setshifts.com

   הכלי פונה לאתר החי בבקשות GET ו-POST ריקות ובודק שהדלתות
   סגורות ושהדפים תקינים. הוא אינו קורא משתני סביבה, אינו שולח
   נתונים אמיתיים ואינו מחייב אף אחד.

   ✓ תקין · ✗ לתקן לפני לקוח · ? לבדוק ידנית (הכלי לא יכול לדעת מבחוץ)
   קוד היציאה 1 אם יש ✗. */
'use strict';

const BASE = (process.argv[2] || 'https://setshifts.com').replace(/\/$/, '');
const RED = '\u001b[31m', GREEN = '\u001b[32m', YELLOW = '\u001b[33m', OFF = '\u001b[0m';

let failures = 0;
let unknown = 0;
function ok(text) { console.log(GREEN + '  ✓ ' + OFF + text); }
function bad(text) { failures++; console.log(RED + '  ✗ ' + OFF + text); }
function ask(text) { unknown++; console.log(YELLOW + '  ? ' + OFF + text); }
function title(text) { console.log('\n' + text); }

async function call(path, options) {
  try {
    const res = await fetch(BASE + path, Object.assign({ redirect: 'manual' }, options || {}));
    const body = await res.text();
    return { status: res.status, body: body, headers: res.headers };
  } catch (err) {
    return { status: 0, body: '', error: err.message, headers: new Map() };
  }
}

async function pages() {
  title('דפים ציבוריים');
  const list = ['/', '/pricing/', '/terms/', '/privacy/', '/accessibility/',
    '/security/', '/faq/', '/contact/', '/app/'];
  for (const path of list) {
    const res = await call(path);
    if (res.status === 0) { bad(path + ' – אין חיבור: ' + res.error); continue; }
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get('location') || '';
      if (to.indexOf(path) === -1 && path !== '/') { bad(path + ' – הפניה ל-' + to); continue; }
      ok(path + ' (הפניה ל-' + to + ')');
      continue;
    }
    if (res.status !== 200) { bad(path + ' – סטטוס ' + res.status); continue; }
    if (/\{\{[A-Z_]+\}\}/.test(res.body)) { bad(path + ' – נשארו סימוני {{...}} שלא הוחלפו'); continue; }
    ok(path);
  }
}

async function legal() {
  title('פרטי החברה בעמודים המשפטיים');
  for (const path of ['/terms/', '/privacy/', '/accessibility/']) {
    const res = await call(path);
    if (res.status !== 200) { bad(path + ' – לא נטען'); continue; }
    if (/HAREL ZEDEK SETSHIFTS/i.test(res.body)) ok(path + ' – שם החברה מופיע');
    else bad(path + ' – שם החברה לא מופיע. LEGAL_ENTITY ב-Vercel?');
    if (/\[[^\]\n]{2,40}\]/.test(res.body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' '))) {
      ask(path + ' – יש טקסט בסוגריים מרובעים. לוודא שזה לא מציין מקום');
    }
  }
}

async function server() {
  title('חיבור לשרת');
  const cfg = await call('/app/config.js');
  if (cfg.status !== 200) { bad('/app/config.js לא נטען (' + cfg.status + ')'); return; }
  const url = (cfg.body.match(/supabaseUrl:\s*'([^']*)'/) || [])[1] || '';
  const key = (cfg.body.match(/supabaseAnonKey:\s*'([^']*)'/) || [])[1] || '';
  if (url && key) ok('Supabase מחובר (' + url.replace(/^https:\/\//, '') + ')');
  else bad('config.js ריק: המערכת רצה במצב הדגמה. SUPABASE_URL / SUPABASE_ANON_KEY ב-Vercel?');
}

async function doors() {
  title('דלתות שחייבות להיות סגורות');

  // Vercel crons, PayPlus, Meta and ZKTeco devices don't follow redirects:
  // with "trailingSlash": true a path without "/" may answer 308.
  for (const p of ['/api/billing/cron', '/api/billing/webhook', '/api/wa', '/iclock/cdata']) {
    const r = await call(p);
    if (r.status === 308 || r.status === 301) {
      bad(p + ' מחזיר הפניה ' + r.status + ' ל-' + (r.headers.get('location') || '?') +
        '. מי שקורא לכתובת הזו בלי "/" בסוף (cron, סליקה, מטא, שעון) לא יגיע לשרת');
    } else if (r.status) ok(p + ' בלי הפניה (' + r.status + ')');
  }

  const cron = await call('/api/billing/cron');
  if (cron.status === 401) ok('/api/billing/cron בלי סוד: 401');
  else if (cron.status === 0) bad('/api/billing/cron – אין חיבור');
  else bad('/api/billing/cron בלי סוד החזיר ' + cron.status + ' (צריך 401). כל אחד יכול להפעיל חיובים');

  const hook = await call('/api/billing/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  if (hook.status === 401) ok('webhook החיוב בלי חתימה: 401');
  else if (hook.status === 500) bad('webhook החיוב: "Server is not configured" – SUPABASE_SERVICE_ROLE_KEY חסר ב-Vercel');
  else bad('webhook החיוב בלי חתימה החזיר ' + hook.status + ' (צריך 401)');

  const wa = await call('/api/wa?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1');
  if (wa.status === 403) ok('/api/wa עם טוקן שגוי: 403');
  else bad('/api/wa עם טוקן שגוי החזיר ' + wa.status + ' (צריך 403)');

  const wa2 = await call('/api/wa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (wa2.status === 401 || wa2.status === 403) ok('/api/wa POST בלי חתימה של מטא: ' + wa2.status);
  else ask('/api/wa POST בלי חתימה החזיר ' + wa2.status + '. אם WHATSAPP_APP_SECRET לא מוגדר זה צפוי');

  const admin = await call('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (admin.status === 401 || admin.status === 403) ok('/api/admin בלי כניסה: ' + admin.status);
  else bad('/api/admin בלי כניסה החזיר ' + admin.status + ' (צריך 401 או 403)');
}

async function headers() {
  title('כותרות אבטחה');
  const res = await call('/');
  if (/max-age=\d+/.test(res.headers.get('strict-transport-security') || '')) ok('HSTS');
  else bad('חסרה כותרת Strict-Transport-Security');
  if ((res.headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff') ok('nosniff');
  else bad('חסרה כותרת X-Content-Type-Options');
}

async function stores() {
  title('חנויות');
  const res = await call('/.well-known/assetlinks.json');
  if (res.status === 200 && /android_app/.test(res.body)) ok('assetlinks.json קיים (אנדרואיד)');
  else ask('assetlinks.json עדיין לא קיים. תקין עד שמגדירים ANDROID_PACKAGE ו-ANDROID_FINGERPRINT');
}

function manual() {
  title('מה שהכלי לא יכול לראות מבחוץ');
  ask('Vercel → Cron Jobs: שתי משימות (/api/billing/cron ו-/api/wa?action=abandoned) מופיעות כ-Active');
  ask('Vercel → Environment Variables: BILLING_PROVIDER, PAYPLUS_READY, PAYPLUS_SANDBOX (צריך להיעלם בייצור), CRON_SECRET');
  ask('PayPlus: כתובת ה-webhook מוגדרת אצלם, והחיוב החודשי הראשון נבדק עם כרטיס בדיקה');
  ask('Resend: מייל כניסה לעובד מגיע (נבדק 01/10)');
}

(async function main() {
  console.log('בדיקת עלייה לאוויר: ' + BASE);
  await pages();
  await legal();
  await server();
  await doors();
  await headers();
  await stores();
  manual();
  console.log('\n' + (failures
    ? RED + failures + ' דברים לתקן לפני לקוח.' + OFF
    : GREEN + 'כל מה שנבדק מבחוץ תקין.' + OFF) +
    (unknown ? '  ' + YELLOW + unknown + ' לבדיקה ידנית.' + OFF : ''));
  process.exit(failures ? 1 : 0);
})();
