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
                            ['חיוב','api/billing/index.js'],
                            ['חיוב: webhook','api/billing/webhook.js'],
                            ['חיוב: cron','api/billing/cron.js'],
                            ['וואטסאפ','api/wa.js']]) {
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

/* ===== שדה שנשכח בשמירה אינו "לא נשמר" אלא נמחק =====

   השמירה של שבוע נבנית שדה-שדה ב-saas.js, וזו רשימה לבנה
   מכוונת. הצד השני של המטבע הוא שכל שדה חדש על השבוע שלא
   יתווסף שם יימחק בכתיבה הבאה -- והמסך ימשיך להראות אותו עד
   הרענון, כך שאיש לא יבחין.

   ככה בדיוק נעלמו שעות מיוחדות ליום: המנהל הזין "ערב חג עד
   14:00", זה עבד על המסך, ובטעינה הבאה זה כבר לא היה שם.

   הבדיקה משווה בין הצורה המלאה של שבוע לבין מה שנשמר בפועל. */
console.log('\n== שמירת שבוע מכסה את כל השדות ==');
{
  const fs = require('fs');
  const Store = require(path + 'js/store.js');
  const src = fs.readFileSync(path + 'js/backend/saas.js', 'utf8');

  /* ההערות מוסרות לפני הפירוק. בלעדיהן הסימן שלפני שם השדה
     הוא פסיק או סוגר; איתן הוא '/', ושדה מתועד היה נקרא כחסר
     -- כלומר הבדיקה הייתה מתריעה דווקא על מה שמישהו טרח
     להסביר. */
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const expected = Object.keys(Store.emptyWeek());

  const call = /backend\.saveWeek\(weekKey,\s*\{([\s\S]*?)\n\s*\}\);/.exec(bare);
  ok('נמצאה הקריאה לשמירת שבוע ב-saas.js', !!call);
  if (call) {
    const saved = new Set();
    call[1].replace(/(?:^|[,{])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g,
      (all, name) => { saved.add(name); return all; });
    const missing = expected.filter((name) => !saved.has(name));
    ok('כל שדה בשבוע נשמר', missing.length === 0,
      missing.length ? 'חסרים: ' + missing.join(', ') : String(expected.length) + ' שדות');
  }

  /* והכיוון ההפוך: שדה שנשמר ואינו נטען חוזר ריק, והשמירה
     הבאה כותבת את הריק הזה לשרת. */
  const read = /if \(remote\) \{([\s\S]*?)\n\s*\}/.exec(bare);
  ok('נמצאה טעינת השבוע ב-saas.js', !!read);
  if (read) {
    const loaded = new Set();
    read[1].replace(/target\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g,
      (all, name) => { loaded.add(name); return all; });
    const missing = expected.filter((name) => !loaded.has(name));
    ok('וכל שדה בשבוע נטען', missing.length === 0,
      missing.length ? 'חסרים: ' + missing.join(', ') : String(expected.length) + ' שדות');
  }
}

console.log('\n' + (bad ? '❌ ' + bad + ' כשלים' : '✅ הכל עבר') + '\n');
process.exit(bad ? 1 : 0);
})();
