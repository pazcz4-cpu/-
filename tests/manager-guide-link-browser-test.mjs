/* קישור ההורדה של מדריך המנהל: מופיע בהגדרות, ומצביע לקובץ שהבנייה שולחת.
   הרצה: node tests/manager-guide-link-browser-test.mjs */
import { createRequire } from 'node:module';
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
  if (!ok) failures.push(label);
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'he-IL' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
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
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(300);
  const link = page.locator('#manager-guide-settings');
  check('הקישור מוצג בהגדרות', await link.isVisible(), true);
  check('הכיתוב בעברית', (await link.innerText()).trim(), 'הורדת המדריך (PDF)');
  check('הקישור מצביע לקובץ', await link.getAttribute('href'), '/guide/manager-guide-he.pdf');
  check('והוא להורדה', await link.getAttribute('download') !== null, true);
  check('אין שגיאות בדף', errors.length, 0);
} finally {
  await browser.close();
}
if (failures.length) { console.log('\n❌ ' + failures.length + ' נכשלו'); process.exit(1); }
console.log('\n✅ קישור המדריך עובד');
