/* מועד סגירת ההגשות: המנהל מגדיר, העובד רואה, ואחרי המועד חסום.
   הרצה: node tests/deadline-browser-test.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSample } from './_sample.mjs';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = url('app.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', async d => { await d.accept(); });

try {
  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@cafe.test');
  await page.fill('input[name="password"]', 'secret123');
  /* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
     עם הלקוח כשמשהו בחשבון דורש טיפול. */
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1000);
  await loadSample(page);

  console.log('\n== ההגדרה אצל המנהל ==');
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(300);
  check('כבוי כברירת מחדל', await page.locator('#opt-deadline').isChecked(), false);
  check('השדות נעולים כשכבוי', await page.locator('#deadline-day').isDisabled(), true);
  check('אין תצוגת מועד', await page.locator('#deadline-preview').textContent(), '');

  await page.check('#opt-deadline');
  await page.waitForTimeout(400);
  check('השדות נפתחו', await page.locator('#deadline-day').isDisabled(), false);
  const preview = await page.locator('#deadline-preview').textContent();
  check('מוצג תאריך מלא ולא רק יום בשבוע', preview, /\d{2}\/\d{2}/);
  check('ומוזכרת בו שעה', preview, /\d{2}:\d{2}/);

  await page.selectOption('#deadline-day', '2');
  await page.waitForTimeout(400);
  check('שינוי היום משתקף בתצוגה',
    await page.locator('#deadline-preview').textContent(), /שלישי/);

  await page.fill('#deadline-time', '18:30');
  await page.locator('#deadline-time').blur();
  await page.waitForTimeout(400);
  check('שינוי השעה משתקף', await page.locator('#deadline-preview').textContent(), /18:30/);

  console.log('\n== ההגדרה נשמרת ==');
  await page.reload();
  await page.waitForTimeout(1200);
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(400);
  check('נשאר דלוק', await page.locator('#opt-deadline').isChecked(), true);
  check('היום נשמר', await page.locator('#deadline-day').inputValue(), '2');
  check('השעה נשמרה', await page.locator('#deadline-time').inputValue(), '18:30');

  console.log('\n== מה העובד רואה ==');
  await page.click('#user-preview');
  await page.waitForTimeout(300);
  await page.locator('.preview-pick').first().click();
  await page.waitForTimeout(700);

  const strip = page.locator('.deadline-strip');
  check('רצועת המועד מוצגת לעובד', await strip.count(), 1);
  /* לשבוע הנוכחי המועד כבר מאחורינו – הוא חל לפני שהשבוע התחיל */
  check('לשבוע שכבר התחיל ההגשות סגורות',
    (await strip.getAttribute('class')).includes('is-closed'), true);
  check('והטקסט אומר את זה', await strip.textContent(), /נסגרו/);

  /* שלושה שבועות קדימה – המועד בוודאות עוד לפנינו, בכל יום שהוא
     היום בשבוע ובלי תלות בתאריך שבו הבדיקה רצה */
  for (let i = 0; i < 3; i++) {
    await page.locator('#employee-root [data-week-step]').last().click();
    await page.waitForTimeout(500);
  }
  check('לשבוע רחוק ההגשות פתוחות',
    (await strip.getAttribute('class')).includes('is-closed'), false);
  check('ומוצג מתי הן נסגרות', await strip.textContent(), /\d{2}\/\d{2}|שעות/);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות מועד ההגשות עברו');
