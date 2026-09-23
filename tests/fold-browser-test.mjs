/* אחרי הפרסום, מסך העובד מציג סידור – לא טופס.

   למה: עד הפרסום הבקשות הן המשימה של העובד, והן צריכות להיות
   פתוחות. אחרי הפרסום הן נעולות ממילא, ושבעה ימים של כפתורים
   מתים מתחת לסידור דוחפים אותו למעלה ומטשטשים את מה שהעובד בא
   לראות. לכן הם מתקפלים, ונפתחים בלחיצה למי שרוצה.

   הרצה: npm run test:fold */
import { createRequire } from 'node:module';
import { loadSample } from './_sample.mjs';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const APP = url('app.html');
const PHONE = { width: 390, height: 844 };

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: PHONE, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async (d) => { await d.accept(); });

  const asManager = async () => {
    await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
    await page.reload();
    await page.waitForTimeout(800);
    await page.fill('input[name="email"]', 'boss@fold.test');
    await page.fill('input[name="password"]', 'secret123');
    await page.click('#signin-form button[type="submit"]');
    await page.waitForTimeout(1600);
  };
  const asEmployee = async () => {
    await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
    await page.reload();
    await page.waitForTimeout(800);
    await page.fill('input[name="email"]', 'ronit@fold.test');
    await page.fill('input[name="password"]', 'secret123');
    await page.click('#signin-form button[type="submit"]');
    await page.waitForTimeout(1700);
  };

  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="email"]', 'boss@fold.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1400);
  await loadSample(page);

  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(600);
  await page.click('#generate');
  await page.waitForTimeout(2000);

  /* מצרפים דווקא את מי שיש לו הכי הרבה משמרות: עובד בלי אף
     משמרת אינו בודק את המצב שבגללו הבדיקה קיימת. */
  const busiest = await page.evaluate(() => {
    const app = window.ShiftApp;
    const week = app.getState().weeks[app.weekKey()] || {};
    const count = {};
    Object.keys(week.assignments || {}).forEach((slot) => {
      (week.assignments[slot] || []).forEach((id) => { count[id] = (count[id] || 0) + 1; });
    });
    return Object.keys(count).sort((a, b) => count[b] - count[a])[0] || null;
  });
  check('השיבוץ הפיק משמרות', !!busiest, true);

  await page.click('.tab[data-tab="users"]');
  await page.waitForTimeout(700);
  await page.fill('#invite-form input[name="email"]', 'ronit@fold.test');
  await page.selectOption('#invite-form select[name="employeeId"]', busiest);
  await page.click('#invite-form button[type="submit"]');
  await page.waitForTimeout(1000);
  /* setPassword מחבר את המוזמן, ולכן הפרסום חייב לרוץ אחרי
     חזרה למנהל. בלי זה הפרסום נכתב בזיכרון ולא בשרת. */
  await page.evaluate(async () => {
    window.__backend.followLink('ronit@fold.test', 'invite');
    await window.__backend.setPassword('secret123');
  });

  console.log('\n== לפני הפרסום: הבקשות הן המשימה, והן פתוחות ==');
  await asEmployee();
  check('אין מגירה', await page.locator('.employee-fold').count(), 0);
  check('ימי הבקשות גלויים',
    await page.locator('.employee-days .m-card').first().isVisible(), true);

  console.log('\n== אחרי הפרסום: הסידור למעלה, הבקשות מקופלות ==');
  await asManager();
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(800);
  await page.click('#publish-week');
  await page.waitForTimeout(700);
  await page.click('[data-confirm-yes]');
  await page.waitForTimeout(1600);

  await asEmployee();
  check('הסידור הגיע לעובדת',
    await page.locator('.employee-shift').count() > 0, true);
  check('נוצרה מגירה', await page.locator('.employee-fold').count(), 1);
  check('והיא סגורה', await page.locator('.employee-fold[open]').count(), 0);
  check('ימי הבקשות מוסתרים',
    await page.locator('.employee-days .m-card').first().isVisible(), false);
  check('הכותרת אומרת מה יש בפנים',
    await page.locator('.employee-fold-head').innerText(), /בקש/);

  /* המשמרות חייבות להיות מעל המגירה. זה כל הרעיון. */
  check('הסידור מוצג לפני הבקשות', await page.evaluate(() => {
    const shift = document.querySelector('.employee-shift').getBoundingClientRect().top;
    const fold = document.querySelector('.employee-fold').getBoundingClientRect().top;
    return shift < fold;
  }), true);

  console.log('\n== ומי שרוצה – פותח ==');
  await page.click('.employee-fold-head');
  await page.waitForTimeout(400);
  check('נפתחה', await page.locator('.employee-fold[open]').count(), 1);
  check('ימי הבקשות גלויים',
    await page.locator('.employee-days .m-card').first().isVisible(), true);

  /* ניווט שבוע מצייר מחדש. מגירה שנסגרת בדיוק כשקוראים בתוכה
     היא בדיוק סוג הפרט שמרגיש כמו תקלה. */
  console.log('\n== והיא נזכרת בין ציורים ==');
  await page.locator('[data-week-step]').first().click();
  await page.waitForTimeout(900);
  await page.locator('[data-week-step]').last().click();
  await page.waitForTimeout(900);
  check('נשארה פתוחה', await page.locator('.employee-fold[open]').count(), 1);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות המגירה עברו');
