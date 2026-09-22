/* "למה שובץ ככה": הכפתור, החלון, ותוכן ההסבר במסך.
   הרצה: node tests/why-browser-test.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { skipWizard } from './_wizard.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const LOCAL = 'file://' + path.join(here, '..', 'index.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', async d => { await d.accept(); });

try {
  await skipWizard(page);
  await page.goto(LOCAL);
  await page.waitForTimeout(500);
  /* כפתורי "למה שובץ ככה" יושבים על טבלת הסניפים. ברירת המחדל
     היא תצוגה לפי עובד, ולכן עוברים אליה במפורש. */
  await page.click('.view-switch .chip[data-view="branch"]');
  await page.waitForTimeout(400);

  console.log('\n== בניית סידור ==');
  await page.click('#generate');
  await page.waitForTimeout(1500);
  const filled = await page.locator('#schedule-branch .why-btn').count();
  check('יש כפתורי הסבר על המשמרות המאוישות', filled > 5, true);
  check('אין כפתור על משבצת ריקה', await page.evaluate(() => {
    /* כל כפתור חייב לשבת ליד select שיש בו עובד */
    return Array.from(document.querySelectorAll('#schedule-branch .why-btn'))
      .every((b) => (b.previousElementSibling || {}).value);
  }), true);

  console.log('\n== פתיחת ההסבר ==');
  await page.locator('#schedule-branch .why-btn').first().click();
  await page.waitForTimeout(300);
  check('החלון נפתח', await page.locator('#why-overlay .why-card').isVisible(), true);
  check('הכותרת שואלת "למה"',
    await page.locator('.why-title').textContent(), /^למה .+\?$/);
  check('מוצגת המשמרת המדויקת',
    await page.locator('.why-slot').textContent(), /·/);

  const facts = await page.locator('.why-facts li').allTextContents();
  check('לפחות שלוש עובדות', facts.length >= 3, true);
  check('אחת מהן היא המכסה השבועית, עם לפני ואחרי',
    facts.some((f) => /לפני השיבוץ \d+ .*אחריו \d+ מתוך מכסה של \d+/.test(f)), true);
  check('אף עובדה אינה מפתח תרגום חסר',
    facts.every((f) => f.indexOf('why.') === -1), true);

  check('יש שורת הכרעה', await page.locator('.why-verdict').count(), 1);
  const verdict = await page.locator('.why-verdict').textContent();
  check('וגם היא מתורגמת', verdict.indexOf('why.') === -1, true);

  console.log('\n== מי לא היה יכול ==');
  const blocked = await page.locator('.why-blocked').count();
  if (blocked) {
    await page.click('.why-blocked summary');
    await page.waitForTimeout(200);
    const reasons = await page.locator('.why-blocked li').allTextContents();
    check('לכל שם יש סיבה', reasons.every((r) => r.includes('—')), true);
    check('והסיבות מתורגמות', reasons.every((r) => r.indexOf('why.') === -1), true);
  } else {
    console.log('  (בסידור הזה לא נפסלה אף חלופה)');
  }

  console.log('\n== סגירה ==');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Escape סוגר', await page.locator('#why-overlay').isVisible(), false);

  await page.locator('#schedule-branch .why-btn').first().click();
  await page.waitForTimeout(250);
  await page.click('.why-close');
  await page.waitForTimeout(200);
  check('כפתור הסגירה סוגר', await page.locator('#why-overlay').isVisible(), false);

  console.log('\n== באנגלית ==');
  await page.click('.tab[data-tab="settings"]');
  await page.selectOption('#language-select', 'en');
  await page.waitForTimeout(400);
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(400);
  await page.locator('#schedule-branch .why-btn').first().click();
  await page.waitForTimeout(300);
  check('הכותרת באנגלית',
    await page.locator('.why-title').textContent(), /^Why .+\?$/);
  const enFacts = await page.locator('.why-facts li').allTextContents();
  check('והעובדות באנגלית',
    enFacts.some((f) => /Before this shift \d+, after it \d+ of a quota of \d+/.test(f)), true);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות ההסבר עברו');
