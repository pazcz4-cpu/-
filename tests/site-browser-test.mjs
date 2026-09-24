/* בדיקת האתר שנבנה ל-site/: שלוש הכתובות עולות, ה-PWA שלם
   (manifest, אייקונים, service worker), וקישורי דף המכירה מגיעים למערכת.
   הרצה: node tests/site-browser-test.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4179;
const BASE = 'http://localhost:' + PORT;

/* בונים כאן, ועם משתני סביבה – בדיוק כמו Vercel. אין בקוד ערך
   ברירת מחדל לפרויקט, ולכן בנייה בלי המשתנים היא בנייה להדגמה. */
const BUILD_URL = 'https://build-test.supabase.co';
const BUILD_KEY = 'sb_publishable_build_test_0123456789';
function build(env) {
  spawnSync(process.execPath, [path.join(here, '..', 'build-site.js')], {
    stdio: 'ignore', env: Object.assign({}, process.env, env)
  });
}
build({ SUPABASE_URL: BUILD_URL, SUPABASE_ANON_KEY: BUILD_KEY });

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
  check('כותרת ראשית מוכרת את התוצאה, לא את התכונה',
    await page.locator('h1').textContent(), /בלחיצה אחת/);
  check('ארבע תוכניות', await page.locator('.lp-plan').count(), 4);
  check('המחיר מגיע מהמודל', await page.locator('.lp-plan-price').first().textContent(), /199/);
  /* חבילת הרשתות היא הצעת מחיר: אין לה מספר, ואין לה קישור
     להרשמה עצמית – הכפתור שלה מוביל לשיחה. */
  check('חבילת הרשתות בלי מספר', await page.locator('.lp-plan-quote').count(), 1);
  check('ובלי הרשמה עצמית',
    await page.locator('.lp-plan-quote-card a[href*="signup"]').count(), 0);
  check('אלא עם פנייה אלינו',
    await page.locator('.lp-plan-quote-card a[href^="mailto:"], ' +
      '.lp-plan-quote-card a[href^="https://wa.me/"]').count(), 1);

  /* ארבעת הכרטיסים חולקים שלד אחד, ולכן הם חייבים להתיישר.
     כשההסבר הארוך של חבילת הרשתות נדחס לתווית שנבנתה למשפט קצר,
     הכרטיס נראה שבור – וזה נראה על המסך בלי ששום בדיקה נפלה. */
  {
    const row = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.lp-plan')];
      const tops = cards.map((c) => Math.round(c.getBoundingClientRect().top));
      const heights = cards.map((c) => Math.round(c.getBoundingClientRect().height));
      const buttons = cards.map((c) =>
        Math.round(c.querySelector('.lp-btn').getBoundingClientRect().top));
      return {
        sameRow: new Set(tops).size === 1,
        sameHeight: new Set(heights).size === 1,
        buttonsAligned: new Set(buttons).size === 1,
        clipped: cards.some((c) => c.scrollWidth > c.clientWidth + 1)
      };
    });
    check('כל הכרטיסים בשורה אחת', row.sameRow, true);
    check('ובאותו גובה', row.sameHeight, true);
    check('והכפתורים מתיישרים', row.buttonsAligned, true);
    check('ואין טקסט חתוך', row.clipped, false);
  }
  check('בורר שפה', await page.locator('#landing-language option').count(), 8);
  check('קישור התחברות', await page.locator('a[href="app/"]').count(), 1);

  /* גלילה הצידה בטלפון: הסרגל העליון גלש מהמסך, וכל העמוד נגלל
     איתו. זה לא נראה בשום בדיקה קודמת כי כולן רצו במסך רחב. */
  for (const width of [390, 360]) {
    const narrow = await browser.newContext({
      viewport: { width: width, height: 780 }, locale: 'he-IL'
    });
    const np = await narrow.newPage();
    await np.goto(BASE + '/');
    await np.waitForTimeout(500);
    const over = await np.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth);
    check(width + 'px: העמוד אינו נגלל הצידה', over <= 0, true);
    await narrow.close();
  }

  console.log('\n== "למה דווקא הוא" בדף המכירה ==');
  check('יש סקשן ייעודי', await page.locator('#why').isVisible(), true);
  check('והוא מופיע לפני מקטע הבעיות', await page.evaluate(() => {
    const why = document.querySelector('#why');
    const features = document.querySelector('#features');
    return !!(why && features &&
      (why.compareDocumentPosition(features) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
  }), true);
  check('ההדגמה מציגה הסבר מלא',
    await page.locator('.lp-why-facts li').count(), 3);
  const verdict = await page.locator('.lp-why-verdict').textContent();
  check('ושורת ההכרעה מתורגמת ולא ריקה',
    verdict.trim().length > 20 && verdict.indexOf('landing.') === -1, true);
  check('הכותרת הראשית מזכירה AI',
    await page.locator('.lp-badge').first().textContent(), /AI/);
  check('ומשפט הפתיחה מבטיח הסבר לכל שיבוץ',
    await page.locator('.lp-lead').first().textContent(), /מסביר למה/);

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
    check('והכותרת בעברית', await enPage.locator('h1').first().textContent(), /בלחיצה אחת/);

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

  console.log('\n== כתובת יצירת קשר ==');
  {
    const mailto = page.locator('#footer-contact a');
    check('כתובת תמיכה בדף המכירה', await mailto.getAttribute('href'),
      'mailto:support@setshifts.com');
    check('והיא מוצגת ללקוח', await mailto.textContent(), 'support@setshifts.com');
    /* כפתור וואטסאפ מופיע רק כשיש מספר – קישור שבור גרוע מאין קישור */
    const hasNumber = await page.evaluate(() => !!window.ShiftModel.WHATSAPP_NUMBER);
    check('וואטסאפ מוצג רק כשיש מספר',
      await page.locator('#footer-whatsapp').isVisible(), hasNumber);
    if (hasNumber) {
      check('והקישור תקין',
        await page.locator('#footer-whatsapp').getAttribute('href'), /^https:\/\/wa\.me\/\d{8,}$/);
    }
  }

  console.log('\n== דף המכירה בכל שמונה השפות ==');
  {
    /* ההבטחה למכור בכל העולם נמדדת כאן: לא "יש בורר שפות" אלא
       שכל מילה בעמוד באמת מתחלפת, ושום שדה לא נשאר ריק. */
    const langs = await page.$$eval('#landing-language option', (nodes) =>
      nodes.map((n) => n.value));
    check('שמונה שפות בבורר', langs.length, 8);

    const titles = {};
    for (const code of langs) {
      await page.selectOption('#landing-language', code);
      await page.waitForTimeout(250);

      check(code + ': שפת המסמך', await page.getAttribute('html', 'lang'), code);

      const texts = await page.$$eval(
        '[data-i18n], [data-i18n-html]',
        (nodes) => nodes.map((n) => (n.textContent || '').trim()));
      const untranslated = texts.filter((v) => /^(landing|tabs|billing|common)\./.test(v));
      check(code + ': אין מפתח שלא תורגם', untranslated.length, 0);
      check(code + ': אין שדה ריק', texts.filter((v) => v === '').length, 0);

      const title = await page.locator('h1').first().textContent();
      titles[code] = title.trim();
      check(code + ': כותרת ראשית מלאה', titles[code].length > 10, true);

      check(code + ': המחירים נשארו',
        await page.locator('.lp-plan-price').first().textContent(), /199/);
      check(code + ': מקטע "למה דווקא הוא" מלא',
        await page.locator('.lp-why-facts li').count(), 3);
    }

    /* אם שתי שפות מציגות אותה כותרת, אחת מהן לא באמת תורגמה */
    const unique = new Set(Object.values(titles));
    check('כל שפה מציגה כותרת משלה', unique.size, langs.length);

    await page.selectOption('#landing-language', 'he');
    await page.waitForTimeout(250);
  }

  console.log('\n== דומיין, גוגל ושיתופים ==');
  const DOMAIN = 'https://setshifts.com';
  check('קישור קנוני לדומיין',
    await page.getAttribute('link[rel="canonical"]', 'href'), DOMAIN + '/');
  check('כותרת לשיתוף',
    (await page.getAttribute('meta[property="og:title"]', 'content') || '').length > 3, true);
  check('תיאור לשיתוף',
    (await page.getAttribute('meta[property="og:description"]', 'content') || '').length > 20, true);
  /* תמונת השיתוף היא הנעילה המלאה ולא אייקון ריבועי: בוואטסאפ
     ובסלאק ריבוע קטן נראה כמו קישור שבור. */
  check('תמונה לשיתוף',
    await page.getAttribute('meta[property="og:image"]', 'content'), DOMAIN + '/icons/social.png');
  check('התמונה לשיתוף קיימת באתר',
    (await page.request.get(BASE + '/icons/social.png')).status(), 200);
  check('ובמידות שהרשתות מצפות להן',
    await page.getAttribute('meta[property="og:image:width"]', 'content'), '1200');

  console.log('\n== הלוגו ==');
  for (const file of ['logo.png', 'logo-light.png', 'logo-lockup.png',
    'logo-lockup-light.png', 'logo-mark.png', 'logo-mark-white.png']) {
    check('/brand/' + file, (await page.request.get(BASE + '/brand/' + file)).status(), 200);
  }
  /* קובץ המקור אינו נדרש באתר החי – ממנו נגזרו כל השאר */
  check('קובץ המקור אינו מפורסם',
    (await page.request.get(BASE + '/brand/logo-source.png')).status(), 404);
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
  check('שם קצר לאייקון', manifest.short_name, 'SetShifts');
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

  /* המשפט הזה הוא הבטחה ללקוח. במערכת מחוברת הוא חייב לומר ענן
     וסנכרון, ולא "בדפדפן של המחשב הזה" – שקר שהורג אמינות. */
  const hint = await page.locator('#backup-hint').getAttribute('data-i18n');
  check('הטקסט על שמירת הנתונים תואם לשרת בפועל',
    hint, configured ? 'settings.backupHintCloud' : 'settings.backupHint');
  await page.click('.tab[data-tab="settings"]').catch(() => {});
  await page.waitForTimeout(200);

  console.log('\n== העמודים המשפטיים ==');

  /* עסק שמחפש "האם אפשר לסמוך עליהם" מגיע לעמודים האלה, ולכן הם
     חייבים לעלות, להיות מקושרים מדף המכירה, ולהיכנס למנועי החיפוש. */
  for (const dir of ['privacy', 'terms', 'security']) {
    const response = await page.goto(BASE + '/' + dir + '/');
    check('/' + dir + '/ עולה', response.status(), 200);
    check('  יש כותרת', (await page.locator('h1:visible').textContent()).trim().length > 2, true);
    check('  אינו מסומן noindex',
      await page.locator('meta[name="robots"]').count(), 0);
    check('  נמצא במפת האתר',
      sitemap.indexOf('<loc>' + DOMAIN + '/' + dir + '/</loc>') !== -1, true);
    /* גרסה אחת בלבד גלויה, אחרת שתי שפות רצות אחת על השנייה */
    check('  גרסה אחת גלויה', await page.locator('article[data-legal]:visible').count(), 1);
    check('  בורר השפה עובד', await (async () => {
      await page.click('[data-legal-lang="en"]');
      await page.waitForTimeout(150);
      return page.getAttribute('html', 'dir');
    })(), 'ltr');
    await page.click('[data-legal-lang="he"]');
    await page.waitForTimeout(150);
    check('  וחוזר לעברית', await page.getAttribute('html', 'dir'), 'rtl');
  }

  console.log('\n== המדריך לעובד ==');

  /* המנהל שולח את הקישור הזה לקבוצת העובדים, ולכן הוא חייב
     לעלות בלי התחברות, להיות קריא בשתי שפות, ולהיות ניתן
     להדפסה או לשמירה כ-PDF. */
  {
    const response = await page.goto(BASE + '/guide/');
    check('/guide/ עולה', response.status(), 200);
    check('  יש כותרת', (await page.locator('h1:visible').textContent()).trim().length > 2, true);
    check('  גרסה אחת גלויה', await page.locator('article[data-legal]:visible').count(), 1);
    check('  יש לוגו בתוך התוכן',
      await page.locator('article[data-legal]:visible .guide-logo').count() > 0, true);
    check('  יש כפתור הדפסה', await page.locator('[data-print]:visible').count(), 1);
    /* צילומי מסך: מדריך בלי תמונות הוא טקסט שאיש לא קורא, וצילום
       שבור במסמך שנשלח לכל העובדים הוא ריבוע ריק שלא ניתן לתקן
       אחרי ששלחו אותו. שתי הבדיקות נפרדות בכוונה. */
    check('  יש צילומי מסך מהמערכת',
      await page.locator('article[data-legal]:visible .guide-shot img').count() >= 4, true);
    check('  כולם נטענו',
      await page.evaluate(() => Array.from(document.querySelectorAll('.guide-shot img'))
        .filter((img) => !img.complete || img.naturalWidth === 0)
        .map((img) => img.getAttribute('src')).join(', ')), '');
    check('  ולכל אחד יש כיתוב שמסביר מה רואים',
      await page.evaluate(() => Array.from(
        document.querySelectorAll('article[data-legal]:not([hidden]) .guide-shot'))
        .every((fig) => (fig.querySelector('figcaption')?.textContent || '').trim().length > 20)),
      true);
    check('  יש קישור למערכת',
      await page.locator('article[data-legal]:visible a[href="/app/"]').count(), 1);
    check('  נמצא במפת האתר',
      sitemap.indexOf('<loc>' + DOMAIN + '/guide/</loc>') !== -1, true);
    check('  הכתובת של התמיכה הוחלפה',
      (await page.content()).indexOf('{{') === -1, true);
    await page.click('[data-legal-lang="en"]');
    await page.waitForTimeout(150);
    check('  ואנגלית עובדת', await page.getAttribute('html', 'dir'), 'ltr');
    await page.click('[data-legal-lang="he"]');
    await page.waitForTimeout(150);
  }

  /* ===== הטוקנים של העיצוב =====

     landing.css משתמש בכ-100 הפניות var(--...) ואינו מגדיר אף
     אחת מהן; ההגדרות יושבות ב-styles.css. עמוד פרוזה שטוען רק
     את landing.css נראה שחור על לבן בלי שום עיצוב — וכך בדיוק
     נראו מדיניות הפרטיות, התנאים והאבטחה, שהן העמודים שלקוח
     נכנס אליהם כדי להחליט אם לסמוך עלינו. */
  console.log('\n== עמודי הפרוזה מקבלים את טוקני העיצוב ==');
  for (const dir of ['privacy', 'terms', 'security', 'about', 'stories', 'faq', 'contact']) {
    await page.goto(BASE + '/' + dir + '/');
    await page.waitForTimeout(300);
    const paint = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      return {
        brand: root.getPropertyValue('--brand').trim(),
        /* רקע שקוף פירושו שהעמוד לא צבע כלום בעצמו */
        opaque: body.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
          body.backgroundColor !== 'transparent'
      };
    });
    check('/' + dir + '/ הצבעים מוגדרים', paint.brand.length > 0, true);
    check('/' + dir + '/ ויש רקע', paint.opaque, true);
  }

  console.log('\n== עמודי התוכן באתר הבנוי ==');
  for (const dir of ['about', 'stories', 'faq', 'contact']) {
    const response = await page.goto(BASE + '/' + dir + '/');
    check('/' + dir + '/ עולה', response.status(), 200);
    /* תבנית שלא הוחלפה היא בדיוק מה שהלקוח רואה ואנחנו לא:
       "מופעל על ידי {{LEGAL_ENTITY}}" על עמוד חי. */
    const body = await page.locator('body').innerText();
    check('/' + dir + '/ בלי תבנית שנשארה', /\{\{[A-Z_]+\}\}/.test(body), false);
    check('/' + dir + '/ שתי שפות', await page.locator('article[data-legal]').count(), 2);
  }

  console.log('\n== הקישורים מדף המכירה ==');
  await page.goto(BASE + '/');
  await page.waitForTimeout(400);
  for (const dir of ['privacy', 'terms', 'security']) {
    check('קישור אל /' + dir + '/',
      await page.locator('.lp-footer a[href$="' + dir + '/"]').count(), 1);
  }

  console.log('\n== נכסים משותפים ==');
  for (const asset of ['/css/styles.css', '/css/landing.css', '/js/app.js', '/js/i18n/ar.js', '/sw.js']) {
    check(asset, (await page.request.get(BASE + asset)).status(), 200);
  }

  /* ההפך: בנייה בלי משתני סביבה. עד היום הייתה כאן כתובת פרויקט
     קבועה בקוד, ובנייה כזו הייתה מפנה לקוחות לבסיס נתונים שאולי
     כבר כבוי – בשקט. עכשיו היא מוצהרת כהדגמה. */
  console.log('\n== בנייה בלי משתני סביבה ==');
  build({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '' });
  await page.goto(BASE + '/app/');
  await page.waitForTimeout(600);
  check('אין כתובת פרויקט קבועה בקוד',
    await page.evaluate(() => (window.SHIFT_CONFIG || {}).supabaseUrl || ''), '');
  check('והאתר מצהיר שהוא בהדגמה',
    await page.locator('#demo-banner').isVisible(), true);
  build({ SUPABASE_URL: BUILD_URL, SUPABASE_ANON_KEY: BUILD_KEY });

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
