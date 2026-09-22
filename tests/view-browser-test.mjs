/* המעבר בין "לפי סניף" ל"לפי עובד", במחשב ובטלפון, וברירת
   המחדל שנזכרת. הרצה: npm run test:view */
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
/* מסך של אייפון: שם התצוגה הזו באמת נדרשת */
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1400, height: 1000 };

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];
async function mk(viewport) {
  const ctx = await browser.newContext({ viewport: viewport, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async d => { await d.accept(); });
  return page;
}

async function signUp(page, email) {
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
  await page.waitForTimeout(1200);
  await loadSample(page);
}

try {
  console.log('\n== בטלפון: הכפתורים קיימים, וזו הייתה כל הבעיה ==');
  const phone = await mk(PHONE);
  await signUp(phone, 'boss@view.test');
  check('שני הכפתורים מוצגים גם בטלפון',
    await phone.locator('.view-switch .chip').count(), 2);
  check('"לפי סניף" נראה על המסך',
    await phone.locator('.view-switch .chip[data-view="branch"]').isVisible(), true);
  check('"לפי עובד" נראה על המסך',
    await phone.locator('.view-switch .chip[data-view="employee"]').isVisible(), true);

  console.log('\n== ברירת המחדל היא לפי עובד ==');
  check('הכפתור הפעיל',
    await phone.locator('.view-switch .chip.active').getAttribute('data-view'), 'employee');
  check('וגם לקורא מסך',
    await phone.locator('.view-switch .chip[data-view="employee"]').getAttribute('aria-pressed'), 'true');
  const cards = await phone.locator('#schedule-mobile .m-card-head').allInnerTexts();
  check('הכרטיסים הם עובדים ולא סניפים', /עובד\/ת 1/.test(cards.join('|')), true);
  check('ולכל אחד מוצג כמה משמרות יצאו לו',
    await phone.locator('#schedule-mobile .m-emp-total').count() > 0, true);
  check('כל כרטיס מציג שבוע שלם',
    await phone.locator('#schedule-mobile .m-card').first().locator('.m-emp-day').count(), 7);
  check('לוח הימים מוסתר – אין יום נבחר בתצוגה הזו',
    await phone.locator('#day-nav').isVisible(), false);
  check('ונאמר איפה כן משבצים',
    await phone.locator('.view-edit-hint').innerText(), /תצוגה לפי סניף/);

  console.log('\n== מעבר לתצוגה לפי סניף ==');
  await phone.click('.view-switch .chip[data-view="branch"]');
  await phone.waitForTimeout(600);
  const branchCards = await phone.locator('#schedule-mobile .m-card-head').allInnerTexts();
  check('הכרטיסים הם סניפים', /סניף/.test(branchCards.join('|')), true);
  check('לוח הימים חזר', await phone.locator('#day-nav').isVisible(), true);
  check('ויש בוררי שיבוץ', await phone.locator('#schedule-mobile select').count() > 0, true);
  check('אין יותר שורת "לעריכה"', await phone.locator('.view-edit-hint').count(), 0);

  console.log('\n== הבחירה נזכרת במכשיר ==');
  await phone.reload();
  await phone.waitForTimeout(1400);
  check('אחרי רענון נשארנו בתצוגה לפי סניף',
    await phone.locator('.view-switch .chip.active').getAttribute('data-view'), 'branch');
  await phone.click('.view-switch .chip[data-view="employee"]');
  await phone.waitForTimeout(600);
  await phone.reload();
  await phone.waitForTimeout(1400);
  check('וחזרה ללפי עובד גם היא נזכרת',
    await phone.locator('.view-switch .chip.active').getAttribute('data-view'), 'employee');

  console.log('\n== במחשב: אותן שתי טבלאות, אותה ברירת מחדל ==');
  const desk = await mk(DESK);
  await signUp(desk, 'boss2@view.test');
  check('טבלת העובדים מוצגת', await desk.locator('#schedule-employee').isVisible(), true);
  check('טבלת הסניפים מוסתרת', await desk.locator('#schedule-branch').isVisible(), false);
  await desk.click('.view-switch .chip[data-view="branch"]');
  await desk.waitForTimeout(500);
  check('אחרי המעבר – טבלת הסניפים', await desk.locator('#schedule-branch').isVisible(), true);
  check('וטבלת העובדים מוסתרת', await desk.locator('#schedule-employee').isVisible(), false);

  console.log('\n== סידור שנבנה מופיע בתצוגה לפי עובד ==');
  await desk.click('#generate');
  await desk.waitForTimeout(1600);
  await desk.click('.view-switch .chip[data-view="employee"]');
  await desk.waitForTimeout(500);
  check('יש שיבוצים בטבלת העובדים',
    await desk.locator('#schedule-employee .emp-chip').count() > 5, true);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות התצוגה עברו');
