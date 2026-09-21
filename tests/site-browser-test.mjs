/* בדיקת האתר שנבנה ל-site/: שלוש הכתובות עולות, ה-PWA שלם
   (manifest, אייקונים, service worker), וקישורי דף המכירה מגיעים למערכת.
   הרצה: node tests/site-browser-test.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4179;
const BASE = 'http://localhost:' + PORT;

const server = spawn(process.execPath, [path.join(here, '..', 'tools', 'serve.js'), String(PORT)], {
  stdio: 'ignore'
});
await new Promise((resolve) => setTimeout(resolve, 700));

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

try {
  console.log('\n== שלוש הכתובות ==');
  for (const [label, url] of [['דף המכירה', '/'], ['המערכת', '/app/'], ['הכלי המקומי', '/tool/']]) {
    const response = await page.goto(BASE + url);
    check(label + ' עולה', response.status(), 200);
  }

  console.log('\n== דף המכירה ==');
  await page.goto(BASE + '/');
  await page.waitForTimeout(500);
  check('כותרת ראשית', await page.locator('h1').textContent(), /משמרת/);
  check('שלוש תוכניות', await page.locator('.lp-plan').count(), 3);
  check('המחיר מגיע מהמודל', await page.locator('.lp-plan-price').first().textContent(), /199/);
  check('בורר שפה', await page.locator('#landing-language option').count(), 8);
  check('קישור התחברות', await page.locator('a[href="app/"]').count(), 1);

  console.log('\n== שפת ברירת המחדל ==');
  /* דפדפן באנגלית נפוץ מאוד אצל משתמשים ישראלים, ואינו מעיד על
     העדפה. האתר חייב להיפתח בעברית גם בשבילו. */
  {
    const en = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const enPage = await en.newPage();
    await enPage.goto(BASE + '/');
    await enPage.waitForTimeout(500);
    check('דפדפן אנגלי נפתח בעברית',
      await enPage.getAttribute('html', 'lang'), 'he');
    check('והכיוון מימין לשמאל',
      await enPage.locator('body').evaluate((n) => getComputedStyle(n).direction), 'rtl');
    check('והכותרת בעברית', await enPage.locator('h1').first().textContent(), /משמרת/);

    /* בחירה מפורשת של המשתמש עדיין גוברת ונשמרת */
    await enPage.selectOption('#landing-language', 'en');
    await enPage.waitForTimeout(300);
    check('בחירה מפורשת עדיין עובדת',
      await enPage.getAttribute('html', 'lang'), 'en');
    await enPage.reload();
    await enPage.waitForTimeout(500);
    check('והיא נזכרת אחרי רענון',
      await enPage.getAttribute('html', 'lang'), 'en');
    await en.close();
  }

  console.log('\n== דומיין, גוגל ושיתופים ==');
  const DOMAIN = 'https://setshifts.com';
  check('קישור קנוני לדומיין',
    await page.getAttribute('link[rel="canonical"]', 'href'), DOMAIN + '/');
  check('כותרת לשיתוף',
    (await page.getAttribute('meta[property="og:title"]', 'content') || '').length > 3, true);
  check('תיאור לשיתוף',
    (await page.getAttribute('meta[property="og:description"]', 'content') || '').length > 20, true);
  check('תמונה לשיתוף',
    await page.getAttribute('meta[property="og:image"]', 'content'), DOMAIN + '/icons/icon-512.png');
  check('התמונה לשיתוף קיימת באתר',
    (await page.request.get(BASE + '/icons/icon-512.png')).status(), 200);
  check('דף המכירה פתוח למנועי חיפוש',
    await page.locator('meta[name="robots"]').count(), 0);

  const robots = await (await page.request.get(BASE + '/robots.txt')).text();
  check('robots.txt מפנה למפת האתר', robots, new RegExp('Sitemap: ' + DOMAIN + '/sitemap.xml'));
  const sitemap = await (await page.request.get(BASE + '/sitemap.xml')).text();
  check('מפת האתר מכילה את דף המכירה', sitemap, new RegExp('<loc>' + DOMAIN + '/</loc>'));

  /* המערכת והכלי אינם עמודי תוכן – אסור שיופיעו בתוצאות חיפוש */
  for (const [label, url] of [['המערכת', '/app/'], ['הכלי המקומי', '/tool/']]) {
    await page.goto(BASE + url);
    check(label + ' מסומן noindex',
      await page.getAttribute('meta[name="robots"]', 'content'), /noindex/);
  }
  await page.goto(BASE + '/');
  await page.waitForTimeout(300);

  console.log('\n== התקנה בטלפון (PWA) ==');
  const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
  check('הדף מצהיר על manifest', manifestHref, '/app/manifest.webmanifest');

  await page.goto(BASE + '/app/');
  await page.waitForTimeout(500);
  const manifest = await (await page.request.get(BASE + '/app/manifest.webmanifest')).json();
  check('שם קצר לאייקון', manifest.short_name, 'Shifts');
  check('נפתח כאפליקציה', manifest.display, 'standalone');
  check('נפתח בכתובת המערכת', manifest.start_url, '/app/');
  check('שלושה אייקונים', manifest.icons.length, 3);
  check('יש אייקון maskable', manifest.icons.some(i => i.purpose === 'maskable'), true);

  for (const icon of manifest.icons) {
    const res = await page.request.get(BASE + icon.src);
    check('האייקון ' + icon.src + ' קיים', res.status(), 200);
    const body = await res.body();
    /* חתימת PNG – מוודאת שזו באמת תמונה ולא דף שגיאה */
    check('  והוא PNG תקין', body.slice(1, 4).toString('ascii'), 'PNG');
  }

  check('תגית אייפון למסך הבית',
    await page.getAttribute('meta[name="apple-mobile-web-app-capable"]', 'content'), 'yes');
  check('אייקון אייפון',
    await page.getAttribute('link[rel="apple-touch-icon"]', 'href'), '/icons/apple-touch-icon.png');

  const sw = await page.evaluate(() =>
    navigator.serviceWorker.getRegistration().then(r => (r ? r.scope : null)));
  check('Service Worker נרשם על כל האתר', sw, BASE + '/');

  console.log('\n== בחירת שרת ==');
  await page.goto(BASE + '/app/');
  await page.waitForTimeout(600);
  const configured = await page.evaluate(() => {
    const c = window.SHIFT_CONFIG || {};
    return !!(c.supabaseUrl && c.supabaseAnonKey);
  });
  check('config.js נטען', await page.evaluate(() => !!window.SHIFT_CONFIG), true);
  check('מתאם Supabase זמין', await page.evaluate(() => !!window.ShiftSupabase), true);
  /* האתר הבנוי חייב להצביע לשרת אמיתי. קובץ ההגדרות שבמאגר נשאר
     ריק בכוונה, כדי שבדיקות ופתיחה מקומית לא ייגעו בנתוני אמת. */
  check('האתר הבנוי מחובר ל-Supabase',
    await page.evaluate(() => window.SHIFT_CONFIG.supabaseUrl), /^https:\/\/.+\.supabase\.co$/);
  check('ויש לו מפתח דפדפן',
    await page.evaluate(() => (window.SHIFT_CONFIG.supabaseAnonKey || '').length > 20), true);
  check('הדפדפן אינו מקבל מפתח סודי',
    await page.evaluate(() => JSON.stringify(window.SHIFT_CONFIG)), /^(?!.*sb_secret)(?!.*service_role).*$/);
  check('השרת שנבחר הוא Supabase ולא המדומה',
    await page.evaluate(() => !!(window.__backend && window.__backend.anonKey)), true);
  /* כל עוד לא הוגדר שרת, חייבת להופיע אזהרה שהנתונים מקומיים */
  check('שורת מצב ההדגמה תואמת להגדרות',
    await page.locator('#demo-banner').isVisible(), !configured);
  check('מסך ההתחברות מוצג', await page.locator('#auth-gate').isVisible(), true);

  console.log('\n== נכסים משותפים ==');
  for (const asset of ['/css/styles.css', '/css/landing.css', '/js/app.js', '/js/i18n/ar.js', '/sw.js']) {
    check(asset, (await page.request.get(BASE + asset)).status(), 200);
  }

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
  server.kill();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות האתר עברו');
