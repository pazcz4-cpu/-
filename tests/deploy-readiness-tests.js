/* מוכנות לפריסה: מה קורה כשמשתנה סביבה חסר.

   פריסה אמיתית תמיד מתחילה בלי חלק מההגדרות – שוכחים אחת,
   מוסיפים אותה רק ל-Preview, או מגלים אותה אחרי הפריסה. השאלה
   אינה אם זה יקרה אלא מה קורה אז.

   הכלל: לסרב בבירור. לא לקרוס, ובעיקר לא להתנהג כאילו הכל
   תקין – שער שנפתח כשההגדרה חסרה גרוע משער שלא נבנה בכלל.

   הרצה: node tests/deploy-readiness-tests.js */
const nodePath = require('path');
const path = nodePath.join(__dirname, '..') + '/';
let bad = 0;
function ok(label, cond, extra) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label + (extra !== undefined ? ' → ' + extra : ''));
  if (!cond) bad++;
}
function res() {
  return { statusCode: 0, payload: null, headers: {},
    setHeader(k,v){this.headers[k]=v;}, end(t){this.payload = t?JSON.parse(t):null;} };
}
function req(extra) {
  return Object.assign({ method:'POST', headers:{}, body:'{}' }, extra||{});
}
function clear() {
  ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PLATFORM_OWNER_EMAILS',
   'CRON_SECRET','BILLING_WEBHOOK_SECRET','BILLING_PROVIDER','PAYPLUS_READY']
    .forEach(k => delete process.env[k]);
}

(async () => {
console.log('\n== בלי הגדרות כלל ==');
clear();
for (const [name, file] of [['משרד אחורי','api/admin/index.js'],
                            ['חיוב: checkout','api/billing/checkout.js'],
                            ['חיוב: webhook','api/billing/webhook.js'],
                            ['חיוב: cron','api/billing/cron.js']]) {
  delete require.cache[require.resolve(path+file)];
  const h = require(path+file);
  const r = res();
  await h(req({ headers:{ authorization:'Bearer x' } }), r);
  ok(name + ' מסרב ולא קורס', r.statusCode >= 400 && r.statusCode < 600, r.statusCode);
}

console.log('\n== cron בלי סוד ==');
process.env.SUPABASE_URL='https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='k';
delete require.cache[require.resolve(path+'api/billing/cron.js')];
{
  const h = require(path+'api/billing/cron.js');
  const r = res();
  await h(req({ headers:{} }), r);
  ok('בלי CRON_SECRET הריצה נדחית', r.statusCode === 401, r.statusCode);
  const r2 = res();
  process.env.CRON_SECRET = 'secret';
  await h(req({ headers:{ authorization:'Bearer wrong' } }), r2);
  ok('עם סוד שגוי נדחית', r2.statusCode === 401, r2.statusCode);
}

console.log('\n== המשרד האחורי בלי רשימת בעלים ==');
delete process.env.PLATFORM_OWNER_EMAILS;
delete require.cache[require.resolve(path+'api/admin/index.js')];
{
  const h = require(path+'api/admin/index.js');
  const r = res();
  await h(req({ headers:{ authorization:'Bearer x' }, body:'{"op":"overview"}' }), r);
  ok('סגור לגמרי (503), ולא פתוח', r.statusCode === 503, r.statusCode);
  ok('ולא מחזיר נתונים', !r.payload || !r.payload.counts);
}

console.log('\n== webhook בלי ספק מוגדר ==');
process.env.BILLING_WEBHOOK_SECRET='s';
delete require.cache[require.resolve(path+'api/billing/webhook.js')];
{
  const h = require(path+'api/billing/webhook.js');
  const r = res();
  await h(req({ headers:{}, body:'{"id":"x"}' }), r);
  ok('הודעה בלי חתימה נדחית', r.statusCode === 401, r.statusCode);
}

console.log('\n== PayPlus לא מוכן ==');
delete require.cache[require.resolve(path+'api/billing/_providers.js')];
{
  const P = require(path+'api/billing/_providers.js').payplus;
  ok('verify מחזיר false', P.verify('{}', {'user-agent':'PayPlus', hash:'x'}, 's') === false);
  let threw = false;
  try { await P.charge({ subscriptionId:'t', amount:1, idempotencyKey:'k' }); }
  catch (e) { threw = /not configured/.test(e.message); }
  ok('charge זורק עם סיבה ברורה', threw);
}

console.log('\n' + (bad ? '❌ ' + bad + ' כשלים' : '✅ הכל עבר') + '\n');
process.exit(bad ? 1 : 0);
})();
