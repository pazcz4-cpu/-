/* כשאימות מייל דלוק, ההרשמה אינה מסתיימת במסך אלא בתיבת המייל.
   זו בדיקה שהמסך אומר את זה כבשורה טובה ולא ככישלון: לקוח שיראה
   שגיאה אדומה ינסה להירשם שוב, יקבל "המשתמש כבר קיים", ויילך.
   הרצה: node tests/confirm-email-browser-test.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

try {
  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);

  /* מחליפים את ההרשמה בזו שמחזיר Supabase כשאימות מייל דלוק */
  await page.evaluate(() => {
    window.__backend.signUpCompany = function () {
      const err = new Error('בדקו את תיבת המייל ואשרו את הכתובת, ואז התחברו');
      err.code = 'confirm_email';
      return Promise.reject(err);
    };
  });

  console.log('\n== הרשמה כשאימות מייל דלוק ==');
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="name"]', 'דנה');
  await page.fill('input[name="email"]', 'dana@cafe.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(600);

  check('ההודעה מוצגת כבשורה ולא כשגיאה',
    await page.locator('.auth-notice').isVisible(), true);
  check('ותוכנה מפנה לתיבת המייל',
    await page.locator('.auth-notice').textContent(), /מייל/);
  check('אין שגיאה אדומה',
    await page.locator('.auth-error').isVisible(), false);
  check('עברנו ללשונית הכניסה',
    await page.locator('.auth-tab.active').textContent(), 'התחברות');
  check('וטופס הכניסה מוכן', await page.locator('#signin-form').isVisible(), true);
  check('האפליקציה עדיין נעולה', await page.locator('#app-root').isHidden(), true);

  console.log('\n== ההודעה נעלמת כשמתחילים פעולה חדשה ==');
  await page.fill('#signin-form input[name="email"]', 'dana@cafe.test');
  await page.fill('#signin-form input[name="password"]', 'secret123');
  await page.click('#signin-form button[type="submit"]');
  await page.waitForTimeout(600);
  check('ההודעה כבר לא מוצגת',
    await page.locator('.auth-notice').isVisible(), false);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות אישור המייל עברו');
