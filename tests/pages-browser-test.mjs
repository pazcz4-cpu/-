/* עמודי התוכן: מי אנחנו, איפה זה עוזר, שאלות נפוצות, צור קשר.

   מה שנבדק כאן ולמה:

   1. שתי השפות קיימות בכל עמוד ורק אחת מוצגת. עמוד שמציג את שתי
      הגרסאות יחד נראה כמו תקלה, ועמוד שלא מציג אף אחת הוא עמוד ריק.
   2. הטופס באמת שולח. טופס יצירת קשר שנראה טוב ולא שולח הוא
      הדרך הבטוחה ביותר לאבד לקוח שכבר רצה לדבר.
   3. ההגנות של הטופס. הפיתיון והבדיקות המקומיות הם מה שמונע
      מנקודת קצה ציבורית ששולחת דואר להפוך לכלי ספאם.
   4. עמוד "איפה זה עוזר" מתאר סוגי עסקים ולא לקוחות. אין בו שם
      של חברה, שם של אדם או ציטוט, והוא כתוב בהווה — כך שהוא
      אינו נקרא כמקרה שקרה אצל מישהו. זה מה שמחזיק אותו נכון
      בלי הבהרה בראשו, ולכן זה נבדק.

   הרצה: npm run test:pages */
import { createRequire } from 'node:module';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

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
  /* מסלולי השגיאה נבדקים כאן במכוון, ולכן 4xx/5xx מהם אינם
     "שגיאה בדף" אלא בדיוק מה שהבדיקה ביקשה. */
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(text)) return;
    errors.push('CONSOLE: ' + text);
  });

  console.log('\n== עמודי התוכן עולים, בשתי שפות ==');
  for (const [name, file] of [['מי אנחנו', 'about.html'], ['איפה זה עוזר', 'stories.html'],
    ['מחירים', 'pricing.html'], ['שאלות נפוצות', 'faq.html'],
    ['צור קשר', 'contact.html'], ['העמוד לא נמצא', '404.html']]) {
    await page.goto(url(file));
    await page.waitForTimeout(400);
    check(name + ': שתי גרסאות בקוד', await page.locator('article[data-legal]').count(), 2);
    check(name + ': אחת מוצגת',
      await page.locator('article[data-legal]:not([hidden])').count(), 1);
    check(name + ': יש כותרת', (await page.locator('h1').first().textContent()).length > 3, true);
    /* תבניות {{...}} מוחלפות בזמן הבנייה, ולכן בקוד המקור הן
       תקינות. שהן באמת הוחלפו נבדק על האתר הבנוי, ב-test:site. */

    /* מעבר לאנגלית ובחזרה */
    await page.click('[data-legal-lang="en"]');
    await page.waitForTimeout(250);
    check(name + ': אנגלית מתחלפת',
      await page.locator('article[data-legal="en"]').isVisible(), true);
    check(name + ': והעברית נסגרת',
      await page.locator('article[data-legal="he"]').isVisible(), false);
    await page.click('[data-legal-lang="he"]');
    await page.waitForTimeout(250);
  }

  console.log('\n== "איפה זה עוזר" מתאר סוגי עסקים, לא לקוחות ==');
  await page.goto(url('stories.html'));
  await page.waitForTimeout(400);
  for (const lang of ['he', 'en']) {
    await page.click('[data-legal-lang="' + lang + '"]');
    await page.waitForTimeout(250);
    /* מה שהופך תיאור לעדות הוא ציטוט מיוחס: blockquote, cite,
       או שם של אדם וחברה. מרכאות על צירוף ("ארבעה אנשים") הן
       הדגשה ולא ציטוט, ולכן אינן נבדקות כאן. */
    const article = 'article[data-legal="' + lang + '"] ';
    check(lang + ': אין ציטוט מיוחס',
      await page.locator(article + 'blockquote, ' + article + 'cite, ' +
        article + 'q').count(), 0);
    check(lang + ': ואין הבהרה בראש העמוד',
      await page.locator('article[data-legal="' + lang + '"] .legal-callout').count(), 0);
  }
  await page.click('[data-legal-lang="he"]');
  await page.waitForTimeout(250);
  /* הווה ולא עבר: "כל סניף בונה" מתאר עסק כזה, "כל סניף בנה"
     מתאר מקרה שקרה — ואת זה קורא הקורא כעדות. */
  const scenarios = await page.locator('article[data-legal="he"]').innerText();
  check('התיאור בהווה ולא בעבר', /כל סניף בונה/.test(scenarios), true);
  check('ואין בו ניסוח של מקרה שקרה', /כל סניף בנה/.test(scenarios), false);

  console.log('\n== טופס יצירת הקשר באמת שולח ==');
  await page.goto(url('contact.html'));
  await page.waitForTimeout(400);
  /* בחירת השפה נזכרת בין עמודים, והמקטע הקודם השאיר אנגלית.
     הטופס העברי מוסתר אז, ובלי השורה הזו הבדיקה נופלת על
     "אלמנט אינו גלוי" כאילו יש באג במוצר. */
  await page.click('[data-legal-lang="he"]');
  await page.waitForTimeout(250);

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

  console.log('\n== הפיתיון אינו נגיש לבני אדם ==');
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
  /* הכתובת עצמה מוחלפת בבנייה, ולכן כאן נבדק המבנה: היא יושבת
     בטקסט שאפשר לסמן, ולא רק מאחורי כפתור. */
  const mail = page.locator('article[data-legal="he"] .contact-value').first();
  check('יש טקסט כתובת', await mail.count(), 1);
  check('והוא גם קישור מייל', await mail.getAttribute('href'), /^mailto:/);
  check('ויש כפתור העתקה', await page.locator('[data-copy]').first().count(), 1);

  console.log('\n== וואטסאפ מוצג רק כשיש מספר ==');
  const hasNumber = await page.evaluate(() => !!(window.ShiftModel || {}).WHATSAPP_NUMBER);
  check('בלי מספר – אין בלוק',
    await page.locator('#contact-whatsapp').isVisible(), hasNumber);

  console.log('\n== לשוניות בראש כל עמוד ==');
  for (const [file, slug, label] of [['about.html', 'about', 'מי אנחנו'],
    ['stories.html', 'stories', 'איפה זה עוזר'], ['pricing.html', 'pricing', 'מחירים'],
    ['faq.html', 'faq', 'שאלות נפוצות'],
    ['contact.html', 'contact', 'צור קשר'], ['privacy.html', 'privacy', null]]) {
    await page.goto(url(file));
    await page.waitForTimeout(400);
    check(slug + ': חמש לשוניות', await page.locator('.lp-tabs a').count(), 5);
    const current = await page.locator('.lp-tabs a[aria-current="page"]');
    if (label) {
      check(slug + ': הלשונית הנוכחית מסומנת', await current.count(), 1);
      check(slug + ': והיא הנכונה', (await current.innerText()).trim(), label);
      /* הסימון אינו בצבע בלבד: מי שאינו מבחין בצבע רואה את הקו */
      check(slug + ': הסימון אינו רק צבע', await current.evaluate((n) =>
        getComputedStyle(n).borderBottomWidth), '2px');
    } else {
      /* עמוד שאינו אחת מהלשוניות אינו מסמן אף אחת מהן */
      check(slug + ': אין לשונית מסומנת', await current.count(), 0);
    }
  }

  console.log('\n== הלשוניות בטלפון: נגללות, ולא נחתכות מהמסך ==');
  {
    const phone = await browser.newContext({ viewport: { width: 360, height: 700 }, locale: 'he-IL' });
    const pp = await phone.newPage();
    for (const file of ['about.html', 'stories.html', 'pricing.html', 'faq.html',
      'contact.html']) {
      await pp.goto(url(file));
      await pp.waitForTimeout(400);
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
      check(file + ': הלשונית הנוכחית נראית', seen.visible, true);
      check(file + ': והעמוד אינו נגלל הצידה', seen.overflow <= 0, true);
    }
    await phone.close();
  }

  console.log('\n== הקישורים בין העמודים עובדים ==');
  await page.goto(url('landing.html'));
  await page.waitForTimeout(900);
  for (const dir of ['about', 'stories', 'pricing', 'faq', 'contact']) {
    check('דף המכירה מקשר אל /' + dir + '/',
      await page.locator('a[href="' + dir + '/"]').count() > 0, true);
  }
  check('ויש בו שורת לשוניות', await page.locator('.lp-tabs a').count(), 5);
  /* בדף המכירה הלשוניות עוברות במערכת התרגום המלאה */
  check('שהתוויות בה מתורגמות ולא מפתחות',
    /landing\./.test(await page.locator('.lp-tabs').innerText()), false);
  await page.selectOption('#landing-language', 'en');
  await page.waitForTimeout(400);
  check('והן מתחלפות עם השפה',
    (await page.locator('.lp-tabs a').first().innerText()).trim(), 'About');

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות עמודי התוכן עברו');
