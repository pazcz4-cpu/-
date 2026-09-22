/* סרגל הסידור: שורה ראשית קצרה, שתי פעולות, ושני תפריטים.
   הרצה: npm run test:toolbar */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSample } from './_sample.mjs';
import { skipWizard } from './_wizard.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = 'file://' + path.join(here, '..', 'app.html');
const DESK = { width: 1440, height: 950 };
const PHONE = { width: 390, height: 844 };

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];
async function boot(viewport, email) {
  const ctx = await browser.newContext({ viewport, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async d => { await d.accept(); });
  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1300);
  await loadSample(page);
  return page;
}

/* כל הכלים שפעם היו פרושים מעל הסידור */
const HIDDEN = ['#export-excel', '#export-csv', '#copy-text', '#print',
  '#personal-employee', '#personal-excel', '#personal-text',
  '#view-only-toggle', '#clear-week', '#keep-manual', '#shabbat-end'];

try {
  const page = await boot(DESK, 'boss@tb.test');

  console.log('\n== השורה הראשית נושאת שלושה דברים בלבד ==');
  check('בחירת שבוע', await page.locator('.tb-where .week-nav').isVisible(), true);
  check('מצב שמירה', await page.locator('.tb-where #sync-state').isVisible(), true);
  check('מצב טיוטה/פרסום', await page.locator('.tb-where #publish-state').count(), 1);
  /* מה שהיה כאן פעם: שתי שורות כפתורים, ייצוא אישי וימי חג */
  const exposed = await page.evaluate((list) => list.filter((sel) => {
    const el = document.querySelector(sel);
    return el && el.getBoundingClientRect().height > 0;
  }), HIDDEN);
  check('שום כלי אינו פרוש מעל הסידור', exposed.join(',') || 'אף אחד', 'אף אחד');

  console.log('\n== שתי הפעולות המרכזיות בולטות ==');
  check('בנה סידור', await page.locator('#generate').isVisible(), true);
  check('והוא הכפתור הראשי', await page.evaluate(
    () => document.querySelector('#generate').classList.contains('primary')), true);
  check('בדיקה ופרסום', await page.locator('#publish-week').isVisible(), true);

  console.log('\n== תפריט הייצוא ==');
  check('סגור בהתחלה', await page.locator('#export-pop').isVisible(), false);
  check('והכפתור מדווח על כך',
    await page.locator('#export-menu').getAttribute('aria-expanded'), 'false');
  await page.click('#export-menu');
  await page.waitForTimeout(300);
  check('נפתח', await page.locator('#export-pop').isVisible(), true);
  /* "לאחד את כל אפשרויות הייצוא תחת כפתור אחד" */
  for (const id of ['#export-excel', '#export-csv', '#copy-text', '#print',
                    '#personal-employee', '#personal-excel', '#personal-text']) {
    check('  ' + id, await page.locator('#export-pop ' + id).isVisible(), true);
  }

  console.log('\n== תפריט אחד פתוח בכל רגע ==');
  await page.click('#tools-menu');
  await page.waitForTimeout(300);
  check('הכלים נפתחו', await page.locator('#tools-pop').isVisible(), true);
  check('והייצוא נסגר', await page.locator('#export-pop').isVisible(), false);
  for (const id of ['#view-only-toggle', '#clear-week', '#keep-manual',
                    '#shabbat-end', '#holiday-days']) {
    check('  ' + id, await page.locator('#tools-pop ' + id).isVisible(), true);
  }

  console.log('\n== סגירה ==');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Escape סוגר', await page.locator('#tools-pop').isVisible(), false);
  check('והפוקוס חוזר לכפתור שפתח',
    await page.evaluate(() => document.activeElement.id), 'tools-menu');
  await page.click('#tools-menu');
  await page.waitForTimeout(250);
  await page.click('h2, .issues-summary, #schedule-branch', { position: { x: 5, y: 5 } }).catch(() => {});
  await page.mouse.click(700, 700);
  await page.waitForTimeout(300);
  check('לחיצה בחוץ סוגרת', await page.locator('#tools-pop').isVisible(), false);

  console.log('\n== הגדרה משאירה את התפריט פתוח, פעולה סוגרת אותו ==');
  await page.click('#tools-menu');
  await page.waitForTimeout(250);
  await page.uncheck('#keep-manual');
  await page.waitForTimeout(250);
  check('תיבת סימון אינה סוגרת', await page.locator('#tools-pop').isVisible(), true);
  await page.click('#view-only-toggle');
  await page.waitForTimeout(400);
  check('פעולה כן סוגרת', await page.locator('#tools-pop').isVisible(), false);
  check('ומצב הצפייה באמת נדלק',
    await page.locator('#view-only-banner').isVisible(), true);
  await page.click('#tools-menu');
  await page.waitForTimeout(250);
  await page.click('#view-only-toggle');
  await page.waitForTimeout(400);

  console.log('\n== הייצוא עדיין עובד מתוך התפריט ==');
  await page.click('#export-menu');
  await page.waitForTimeout(250);
  await page.click('#copy-text');
  await page.waitForTimeout(600);
  check('ההודעה מאשרת', (await page.locator('#toast').innerText()).trim().length > 0, true);
  check('והתפריט נסגר אחרי הפעולה', await page.locator('#export-pop').isVisible(), false);

  console.log('\n== בטלפון: אותם תפריטים, ביעדי מגע גדולים ==');
  const phone = await boot(PHONE, 'boss@tb2.test');
  check('שני התפריטים מוצגים', await phone.locator('.tb-do .menu-btn').count(), 2);
  await phone.click('#tools-menu');
  await phone.waitForTimeout(350);
  check('נפתח', await phone.locator('#tools-pop').isVisible(), true);
  const box = await phone.locator('#tools-pop').boundingBox();
  check('אינו נחתך בקצה המסך', box.x >= 0 && box.x + box.width <= 390, true);
  const item = await phone.locator('#tools-pop .menu-item').first().boundingBox();
  check('יעד מגע נוח', item.height >= 44, true);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות הסרגל עברו');
