/* איפוס דרישות השבוע: מאפס את כמות העובדים הנדרשת לשבוע אחד, ולא
   נוגע בשיבוצים, בתבנית הקבועה של הסניף ובשבועות אחרים.
   הרצה: node tests/week-needs-browser-test.mjs */
import { createRequire } from 'node:module';
import { loadSample } from './_sample.mjs';
import { skipWizard } from './_wizard.mjs';
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', async (d) => { await d.accept(); });

const needs = () => page.evaluate(() =>
  Array.from(document.querySelectorAll('#branches-list > .card:first-child input[data-sched="need"]'))
    .map((i) => Number(i.value)));
const assigned = () => page.evaluate(() => {
  const s = window.ShiftApp.getState();
  const key = window.ShiftStore.currentWeekKey();
  const a = (s.weeks[key] || {}).assignments || {};
  return Object.keys(a).reduce((n, k) => n + (a[k] || []).length, 0);
});

try {
  await skipWizard(page);
  await page.goto(url('app.html'));
  await page.waitForTimeout(500);
  await page.click('[data-auth-mode="signup"]');
  await page.fill('input[name="companyName"]', 'קפה הגן');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@demo.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1500);
  await loadSample(page);

  await page.click('.tab[data-tab="schedule"]');
  await page.click('#generate');
  await page.waitForTimeout(1500);
  const before = await assigned();
  check('נבנה סידור לפני האיפוס', before > 0, true);

  await page.click('.tab[data-tab="branches"]');
  await page.waitForTimeout(400);
  const template = await needs();
  check('בתבנית יש דרישות', template.some((n) => n > 0), true);
  check('אין באנר לפני איפוס', await page.locator('.week-needs-banner').count(), 0);

  await page.locator('#branches-list > .card:first-child [data-action="reset-branch"]').click();
  await page.waitForTimeout(500);
  check('כל הדרישות אופסו', (await needs()).every((n) => n === 0), true);
  check('מופיע באנר של השבוע', await page.locator('.week-needs-banner').count(), 1);
  check('השיבוצים לא נגעו', await assigned(), before);

  /* מקלידים דרישה חדשה: היא נשמרת לשבוע בלבד */
  await page.locator('#branches-list > .card:first-child input[data-sched="need"]').first().fill('2');
  await page.locator('#branches-list > .card:first-child input[data-sched="need"]').first().dispatchEvent('change');
  await page.waitForTimeout(500);
  check('הדרישה החדשה נשמרה', (await needs())[0], 2);

  /* הטעינה מחדש מהשרת מחזירה את אותו מצב */
  await page.reload();
  await page.waitForTimeout(1500);
  await page.click('.tab[data-tab="branches"]');
  await page.waitForTimeout(500);
  check('האיפוס שרד טעינה מחדש', await page.locator('.week-needs-banner').count(), 1);
  check('הדרישה שהוקלדה שרדה', (await needs())[0], 2);

  /* שבוע הבא ממשיך מהאיפוס, ושבוע קודם נשאר כמו שהיה */
  await page.click('.tab[data-tab="schedule"]');
  await page.click('#next-week');
  await page.waitForTimeout(500);
  await page.click('.tab[data-tab="branches"]');
  await page.waitForTimeout(400);
  check('בשבוע הבא יש באנר', await page.locator('.week-needs-banner').count(), 1);
  check('בשבוע הבא הדרישה שהוקלדה נשמרה', (await needs())[0], 2);

  await page.click('.tab[data-tab="schedule"]');
  await page.click('#prev-week');
  await page.click('#prev-week');
  await page.waitForTimeout(500);
  await page.click('.tab[data-tab="branches"]');
  await page.waitForTimeout(400);
  check('בשבוע קודם אין באנר', await page.locator('.week-needs-banner').count(), 0);
  check('בשבוע קודם התבנית שלמה', (await needs()).join(), template.join());
  check('אין כפתור חזרה לתבנית', await page.locator('[data-action="week-template"]').count(), 0);
  check('השיבוצים עדיין שם', await assigned(), before);
  check('אין שגיאות בדף', errors.length, 0);
  if (errors.length) console.log(errors);
} finally {
  await browser.close();
}
if (failures.length) { console.log('\n❌ ' + failures.length + ' נכשלו'); process.exit(1); }
console.log('\n✅ איפוס דרישות השבוע עובד');
