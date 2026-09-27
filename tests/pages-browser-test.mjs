/* עמודי התוכן: מי אנחנו, איפה זה עוזר, מחירים, שאלות נפוצות,
   צור קשר.

   הבדיקה רצה על האתר הבנוי ולא על קבצי המקור, וזה לא פרט טכני:
   לעמודים האלה אין יותר קובץ מקור שאפשר לפתוח. הטקסט יושב
   ב-content/<עמוד>/<שפה>.html, המסגרת ב-page.html, והעמוד קיים
   רק אחרי שהבנייה הרכיבה אותם — כלומר רק שם אפשר לבדוק אותו.

   מה שנבדק כאן ולמה:

   1. לכל שפה עמוד משלה, והבורר מעביר אליו. עד כאן כל העמודים
      האלה היו כתובת אחת עם שתי שפות בתוכה, ובורר שהחליף ביניהן
      במקום — כלומר הכתובת אמרה דבר אחד והעמוד הראה אחר.
   2. קישור ישן עם עוגן שפה (/faq/#en) עדיין מגיע לאנגלית.
   3. הטופס באמת שולח. טופס יצירת קשר שנראה טוב ולא שולח הוא
      הדרך הבטוחה ביותר לאבד לקוח שכבר רצה לדבר.
   4. ההגנות של הטופס. הפיתיון והבדיקות המקומיות הם מה שמונע
      מנקודת קצה ציבורית ששולחת דואר להפוך לכלי ספאם.
   5. עמוד "איפה זה עוזר" מתאר סוגי עסקים ולא לקוחות. אין בו שם
      של חברה, שם של אדם או ציטוט, והוא כתוב בהווה — כך שהוא
      אינו נקרא כמקרה שקרה אצל מישהו. זה מה שמחזיק אותו נכון
      בלי הבהרה בראשו, ולכן זה נבדק.
   6. בעמוד המשפטי, שנשאר עברית ואנגלית באותה כתובת, מעבר
      לאנגלית מפנה את הלשוניות ל-/en/ — אחרת לחיצה על לשונית
      מתוך המסמך באנגלית מחזירה לעברית.

   הרצה: npm run test:pages */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4183;
const BASE = 'http://localhost:' + PORT;

/* הפרטים המשפטיים נכנסים לבנייה כמו ב-Vercel. בלעדיהם העמודים
   נבנים עם סימון גלוי במקום השם והכתובת, וזה מה שהיה נבדק כאן
   במקום הטקסט עצמו. */
spawnSync(process.execPath, [path.join(here, '..', 'build-site.js')], {
  stdio: 'ignore',
  env: Object.assign({}, process.env, {
    LEGAL_ENTITY: 'בדיקות בע״מ', LEGAL_ID: '000000000',
    LEGAL_ADDRESS: 'רחוב הבדיקה 1, תל אביב',
    DATA_REGION: 'eu-central-1', PAYMENT_PROVIDER: 'PayPlus',
    LEGAL_JURISDICTION: 'ישראל', LEGAL_COURT: 'תל אביב',
    A11Y_CONTACT_NAME: 'רכז בדיקות', A11Y_CONTACT_PHONE: '03-0000000'
  })
});

const server = spawn(process.execPath,
  [path.join(here, '..', 'tools', 'serve.js'), String(PORT)], { stdio: 'ignore' });
await new Promise((resolve) => setTimeout(resolve, 700));

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(text)) return;
    errors.push('CONSOLE: ' + text);
  });

  const PAGES = [['מי אנחנו', 'about'], ['איפה זה עוזר', 'stories'],
    ['מחירים', 'pricing'], ['שאלות נפוצות', 'faq'], ['צור קשר', 'contact']];

  console.log('\n== עמוד אחד, שפה אחת, כתובת אחת ==');
  for (const [name, dir] of PAGES) {
    const response = await page.goto(BASE + '/' + dir + '/');
    await page.waitForTimeout(250);
    check(name + ': עולה', response.status(), 200);
    /* גרסה אחת בלבד. שתי גרסאות באותו עמוד היו המבנה הקודם,
       והן גם פי שניים ממשקל העמוד. */
    check(name + ': גרסה אחת בעמוד', await page.locator('main article').count(), 1);
    check(name + ': והיא מוצגת', await page.locator('main article').isVisible(), true);
    check(name + ': יש כותרת', (await page.locator('h1').first().textContent()).length > 3, true);
    check(name + ': שפת המסמך עברית',
      await page.evaluate(() => document.documentElement.lang), 'he');
    /* סימון שלא הוחלף בבנייה. {{...}} או [LEGAL_...] במקום השם
       והכתובת הוא עמוד שפורסם חצי. */
    const body = await page.locator('main').innerText();
    check(name + ': אין סימון שלא הוחלף', /\{\{|\[LEGAL_|\[A11Y_/.test(body), false);
  }

  console.log('\n== בורר השפה מעביר לעמוד של אותה שפה ==');
  await page.goto(BASE + '/faq/');
  await page.waitForTimeout(250);
  check('שמונה שפות בבורר', await page.locator('#page-language option').count(), 8);
  await page.selectOption('#page-language', { value: '/de/faq/' });
  await page.waitForTimeout(500);
  check('הכתובת היא של השפה', new URL(page.url()).pathname, '/de/faq/');
  check('והעמוד מצהיר עליה',
    await page.evaluate(() => document.documentElement.lang), 'de');
  check('הכותרת אינה בעברית',
    /[֐-׿]/.test(await page.locator('h1').first().textContent()), false);
  check('הלשוניות נשארות בגרמנית',
    await page.locator('.lp-tabs a[href="/de/about/"]').count(), 1);
  check('והבחירה נזכרת למערכת עצמה',
    await page.evaluate(() => localStorage.getItem('shift-schedule-lang')), 'de');

  /* ב-select סגור, חץ מטה מחליף את הבחירה ומפעיל change מיד.
     בלי ההפרדה בין מקלדת לעכבר, מי שגולש במקלדת היה מועבר לשפה
     שחלף עליה בדרך — לפני שהגיע לזו שרצה. */
  console.log('\n== במקלדת, חץ אינו מעביר עמוד ==');
  await page.goto(BASE + '/faq/');
  await page.waitForTimeout(250);
  await page.focus('#page-language');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(400);
  check('חץ מטה אינו מנווט', new URL(page.url()).pathname, '/faq/');
  check('אבל הבחירה בשדה כן זזה',
    await page.evaluate(() => document.getElementById('page-language').value), '/en/faq/');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  check('ו-Enter מעביר', new URL(page.url()).pathname, '/en/faq/');

  console.log('\n== קישור ישן עם עוגן שפה ==');
  await page.goto(BASE + '/faq/#en');
  await page.waitForTimeout(600);
  check('/faq/#en מגיע לאנגלית', new URL(page.url()).pathname, '/en/faq/');
  /* ובעמוד שכבר בשפה הנכונה אין הפניה, כדי שלא ייווצר לופ */
  await page.goto(BASE + '/en/faq/#en');
  await page.waitForTimeout(400);
  check('ובעמוד שכבר באנגלית אין הפניה נוספת',
    new URL(page.url()).pathname, '/en/faq/');

  console.log('\n== "איפה זה עוזר" מתאר סוגי עסקים, לא לקוחות ==');
  for (const code of ['', 'en/']) {
    await page.goto(BASE + '/' + code + 'stories/');
    await page.waitForTimeout(250);
    const label = code || 'he';
    /* מה שהופך תיאור לעדות הוא ציטוט מיוחס: blockquote, cite,
       או שם של אדם וחברה. מרכאות על צירוף ("ארבעה אנשים") הן
       הדגשה ולא ציטוט, ולכן אינן נבדקות כאן. */
    check(label + ': אין ציטוט מיוחס',
      await page.locator('main blockquote, main cite, main q').count(), 0);
    check(label + ': ואין הבהרה בראש העמוד',
      await page.locator('main .legal-callout').count(), 0);
  }
  await page.goto(BASE + '/stories/');
  await page.waitForTimeout(250);
  /* הווה ולא עבר: "כל סניף בונה" מתאר עסק כזה, "כל סניף בנה"
     מתאר מקרה שקרה — ואת זה קורא הקורא כעדות. */
  const scenarios = await page.locator('main article').innerText();
  check('התיאור בהווה ולא בעבר', /כל סניף בונה/.test(scenarios), true);
  check('ואין בו ניסוח של מקרה שקרה', /כל סניף בנה/.test(scenarios), false);

  console.log('\n== טופס יצירת הקשר באמת שולח ==');
  await page.goto(BASE + '/contact/');
  await page.waitForTimeout(300);

  /* שרת מדומה במקום נקודת הקצה: הבדיקה בודקת את הטופס, ולא
     שולחת דואר אמיתי בכל הרצה. */
  let sent = null;
  await page.route('**/api/contact', async (route) => {
    sent = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  const fill = async (name, email, message) => {
    await page.fill('#contact-name', name);
    await page.fill('#contact-email', email);
    await page.fill('#contact-message', message);
  };
  const status = () => page.locator('#contact-status').innerText();

  /* שדה חסר נעצר כאן ולא מגיע לשרת */
  await fill('', 'a@b.co', 'הודעה ארוכה מספיק כדי לעבור');
  await page.click('#contact-send');
  await page.waitForTimeout(250);
  check('בלי שם – נעצר', sent, null);
  check('ונאמר מה חסר', await status(), /שם/);

  await fill('פז', 'לא-כתובת', 'הודעה ארוכה מספיק כדי לעבור');
  await page.click('#contact-send');
  await page.waitForTimeout(250);
  check('כתובת שגויה – נעצרת', sent, null);
  check('וההסבר מכוון לכתובת', await status(), /כתובת/);

  await fill('פז', 'boss@cafe.co.il', 'קצר');
  await page.click('#contact-send');
  await page.waitForTimeout(250);
  check('הודעה קצרה מדי – נעצרת', sent, null);

  /* שליחה תקינה */
  await fill('פז', 'boss@cafe.co.il', 'יש לנו ארבעה סניפים ו-38 עובדים, נשמח להדגמה.');
  await page.fill('#contact-company', 'קפה מרכז');
  await page.click('#contact-send');
  await page.waitForTimeout(600);
  check('נשלח לשרת', !!sent, true);
  check('עם השם', sent && sent.name, 'פז');
  check('עם הכתובת', sent && sent.email, 'boss@cafe.co.il');
  check('עם שם העסק', sent && sent.company, 'קפה מרכז');
  check('והפיתיון ריק', sent && sent.website, '');
  /* openedAt הוא מה שמאפשר לשרת לדחות מילוי מהיר מדי */
  check('ונשלח מתי נפתח', !!(sent && sent.openedAt > 0), true);
  check('נאמר ללקוח שנשלח', await status(), /נשלחה/);
  check('והטופס התרוקן', await page.inputValue('#contact-message'), '');

  console.log('\n== הודעות שגיאה מהשרת מגיעות ללקוח ==');
  for (const [code, pattern, label] of [[429, /נסו שוב/, 'יותר מדי פניות'],
    [503, /ישירות למייל/, 'שליחה לא מוגדרת'], [502, /לא נשלחה/, 'תקלה בשליחה']]) {
    await page.unroute('**/api/contact');
    await page.route('**/api/contact', (route) =>
      route.fulfill({ status: code, contentType: 'application/json', body: '{}' }));
    await fill('פז', 'boss@cafe.co.il', 'יש לנו ארבעה סניפים ו-38 עובדים, נשמח להדגמה.');
    await page.click('#contact-send');
    await page.waitForTimeout(500);
    check(label + ' → נאמר ללקוח', await status(), pattern);
  }

  /* הטופס מדבר בשפת העמוד. עד כאן היו שני טפסים בעמוד — עברית
     ואנגלית — ובשש השפות האחרות לא היה אף אחד מהם. */
  console.log('\n== הטופס מדבר בשפה שהעמוד נשלח בה ==');
  await page.goto(BASE + '/de/contact/');
  await page.waitForTimeout(300);
  await page.fill('#contact-name', '');
  await page.fill('#contact-email', 'a@b.co');
  await page.fill('#contact-message', 'Eine Nachricht, die lang genug ist.');
  await page.click('#contact-send');
  await page.waitForTimeout(300);
  const german = await page.locator('#contact-status').innerText();
  check('ההודעה בגרמנית', /Namen/.test(german), true);
  check('ולא בעברית', /[֐-׿]/.test(german), false);

  console.log('\n== הפיתיון אינו נגיש לבני אדם ==');
  await page.goto(BASE + '/contact/');
  await page.waitForTimeout(300);
  /* לא isVisible: הדפוס כאן הוא visually-hidden, ו-Playwright
     מחשיב אותו גלוי. מה שקובע הוא שאי אפשר לראות אותו, לתפוס
     אותו במקלדת, או לשמוע אותו בקורא מסך. */
  /* מה שמסתיר הוא העוטף (1x1 עם overflow:hidden ו-clip), ולא
     שדה הקלט עצמו — הקופסה שלו גדולה, והוא פשוט נחתך. */
  const trap = await page.locator('.contact-trap').first().boundingBox();
  check('העוטף קטן מכדי להראות משהו',
    !!trap && trap.width <= 2 && trap.height <= 2, true);
  check('והוא חותך את מה שבתוכו', await page.evaluate(() =>
    getComputedStyle(document.querySelector('.contact-trap')).overflow), 'hidden');
  check('ואינו נתפס במקלדת',
    await page.getAttribute('#contact-website', 'tabindex'), '-1');
  check('ומוסתר מקורא מסך', await page.evaluate(() =>
    !!document.getElementById('contact-website').closest('[aria-hidden="true"]')), true);

  console.log('\n== כתובת המייל מוצגת כטקסט, לא רק כקישור ==');
  const mail = page.locator('main .contact-value').first();
  check('יש טקסט כתובת', await mail.count(), 1);
  check('והוא גם קישור מייל', await mail.getAttribute('href'), /^mailto:/);
  check('ויש כפתור העתקה', await page.locator('[data-copy]').first().count(), 1);

  console.log('\n== וואטסאפ מוצג רק כשיש מספר ==');
  const hasNumber = await page.evaluate(() => !!(window.ShiftModel || {}).WHATSAPP_NUMBER);
  check('בלי מספר – אין בלוק',
    await page.locator('#contact-whatsapp').isVisible(), hasNumber);

  console.log('\n== לשוניות בראש כל עמוד ==');
  for (const [label, dir] of PAGES) {
    await page.goto(BASE + '/' + dir + '/');
    await page.waitForTimeout(250);
    check(dir + ': חמש לשוניות', await page.locator('.lp-tabs a').count(), 5);
    const current = page.locator('.lp-tabs a[aria-current="page"]');
    check(dir + ': הלשונית הנוכחית מסומנת', await current.count(), 1);
    check(dir + ': והיא הנכונה', (await current.innerText()).trim(), label);
    /* הסימון אינו בצבע בלבד: מי שאינו מבחין בצבע רואה את הקו */
    check(dir + ': הסימון אינו רק צבע', await current.evaluate((n) =>
      getComputedStyle(n).borderBottomWidth), '2px');
  }

  console.log('\n== העמוד המשפטי: שתי שפות, וקישורים שנשארים בשפה ==');
  await page.goto(BASE + '/privacy/');
  await page.waitForTimeout(400);
  check('privacy: שתי גרסאות בקוד', await page.locator('article[data-legal]').count(), 2);
  check('privacy: אחת מוצגת',
    await page.locator('article[data-legal]:not([hidden])').count(), 1);
  check('privacy: אין לשונית מסומנת',
    await page.locator('.lp-tabs a[aria-current="page"]').count(), 0);
  /* הבורר זוכר את הבחירה הקודמת, ובמקטע שלפני כאן נבחרה
     גרמנית — ולכן העמוד נפתח באנגלית. הבדיקה מתחילה מעברית
     במפורש, ולא מסתמכת על מה שנשאר מהמקטע הקודם. */
  await page.click('[data-legal-lang="he"]');
  await page.waitForTimeout(300);
  check('בעברית הלשוניות מובילות לעברית',
    await page.locator('.lp-tabs a[href="/faq/"]').count(), 1);
  await page.click('[data-legal-lang="en"]');
  await page.waitForTimeout(300);
  check('אנגלית מתחלפת',
    await page.locator('article[data-legal="en"]').isVisible(), true);
  /* וזה מה שנשבר בלי ההפניה: לחיצה על לשונית מתוך המסמך
     באנגלית הייתה מחזירה את הקורא לעברית. */
  check('ואז הן מובילות לאנגלית',
    await page.locator('.lp-tabs a[href="/en/faq/"]').count(), 1);

  /* בעמוד 404 הדרך חזרה יושבת בתוך הטקסט עצמו, ולא בלשוניות.
     בגרסה האנגלית היא הובילה לעברית — כלומר מי שהגיע לכתובת
     שבורה באנגלית קיבל דרך חזרה לשפה שהוא אינו קורא. */
  console.log('\n== עמוד 404: הדרך חזרה נשארת בשפה ==');
  /* הקובץ עצמו, ולא כתובת שאינה קיימת: Vercel מגיש את 404.html
     לכל כתובת שלא נמצאה, ושרת הבדיקות המקומי מחזיר 404 חשוף. */
  await page.goto(BASE + '/404.html');
  await page.waitForTimeout(400);
  await page.click('[data-legal-lang="en"]');
  await page.waitForTimeout(300);
  check('באנגלית, "שאלות נפוצות" שבטקסט מוביל לאנגלית',
    await page.locator('article[data-legal="en"] a[href="/en/faq/"]').count(), 1);
  check('וגם דף הבית',
    await page.locator('article[data-legal="en"] a[href="/en/"]').count(), 1);
  check('והמדריך לעובד, שאינו מתורגם, מקבל עוגן',
    await page.locator('article[data-legal="en"] a[href="/guide/#en"]').count(), 1);
  await page.click('[data-legal-lang="he"]');
  await page.waitForTimeout(300);
  check('ובחזרה לעברית הקישורים חוזרים',
    await page.locator('article[data-legal="he"] a[href="/faq/"]').count(), 1);
  check('בלי עוגן שנשאר',
    await page.locator('article[data-legal="he"] a[href="/guide/"]').count(), 1);

  console.log('\n== הלשוניות בטלפון: נגללות, ולא נחתכות מהמסך ==');
  {
    const phone = await browser.newContext({ viewport: { width: 360, height: 700 }, locale: 'he-IL' });
    const pp = await phone.newPage();
    for (const [, dir] of PAGES) {
      await pp.goto(BASE + '/' + dir + '/');
      await pp.waitForTimeout(300);
      const seen = await pp.evaluate(() => {
        const a = document.querySelector('.lp-tabs a[aria-current="page"]');
        const strip = document.querySelector('.lp-tabs');
        const ar = a.getBoundingClientRect(), sr = strip.getBoundingClientRect();
        return {
          visible: ar.left >= sr.left - 1 && ar.right <= sr.right + 1,
          overflow: document.documentElement.scrollWidth - window.innerWidth
        };
      });
      /* הלשונית של העמוד הנוכחי גלויה בפתיחה, גם כשהיא האחרונה
         בשורה שנגללת — אחרת המבקר אינו רואה איפה הוא נמצא. */
      check(dir + ': הלשונית הנוכחית נראית', seen.visible, true);
      check(dir + ': והעמוד אינו נגלל הצידה', seen.overflow <= 0, true);
    }
    await phone.close();
  }

  console.log('\n== הקישורים מדף המכירה ==');
  await page.goto(BASE + '/');
  await page.waitForTimeout(900);
  for (const [, dir] of PAGES) {
    check('דף המכירה מקשר אל /' + dir + '/',
      await page.locator('a[href="/' + dir + '/"]').count() > 0, true);
  }
  check('ויש בו שורת לשוניות', await page.locator('.lp-tabs a').count(), 5);
  /* בדף המכירה הלשוניות עוברות במערכת התרגום המלאה */
  check('שהתוויות בה מתורגמות ולא מפתחות',
    /landing\./.test(await page.locator('.lp-tabs').innerText()), false);

  /* ובדף שפה, הקישורים מובילים לעמוד התוכן באותה שפה — לא
     לעברית עם עוגן, וגם לא לכתובת שאינה קיימת. */
  await page.goto(BASE + '/de/');
  await page.waitForTimeout(900);
  check('דף המכירה בגרמנית מקשר אל /de/faq/',
    await page.locator('.lp-tabs a[href="/de/faq/"]').count(), 1);
  check('והלוגו מוביל לדף הבית בגרמנית',
    await page.getAttribute('.lp-brand', 'href'), '/de/');
  const talk = await page.getAttribute('.lp-talk', 'href');
  check('וכפתור "דברו איתנו" נשאר בגרמנית', talk, '/de/contact/');
  check('גם התווית שלו',
    /[֐-׿]/.test(await page.locator('.lp-talk-text').innerText()), false);

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
console.log('\n✅ כל בדיקות עמודי התוכן עברו');
