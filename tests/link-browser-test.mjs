/* קישור אישי קבוע לעובד.

   יש עובדים שהדפדפן שלהם חוסם אחסון לגמרי, ואצלם אסימון ההתחברות
   אינו שורד סגירת לשונית. הקישור הוא ההזדהות: שומרים אותו במסך
   הבית, וכל פתיחה מנפיקה התחברות טרייה.

   מה שנבדק כאן הוא כל המסלול: המנהל מייצר, העובד נכנס עם הקישור
   בלי להקליד דבר, והמנהל מבטל — והקישור מפסיק לעבוד.

   הרצה: npm run test:link */
import { createRequire } from 'node:module';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const APP = url('app.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  const shown = JSON.stringify(actual);
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' +
    (shown && shown.length > 90 ? shown.slice(0, 90) + '…"' : shown));
  if (!ok) failures.push(label + ': ' + shown + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL' });
  const mgr = await ctx.newPage();
  mgr.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  mgr.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  mgr.on('dialog', async (d) => { await d.accept(); });

  await skipWizard(mgr);
  await mgr.goto(APP);
  await mgr.waitForTimeout(400);
  await mgr.click('[data-auth-mode="signup"]');
  await mgr.waitForTimeout(200);
  await mgr.fill('input[name="companyName"]', 'קפה מרכז');
  await mgr.fill('input[name="email"]', 'boss@link.test');
  await mgr.fill('input[name="password"]', 'secret123');
  await mgr.click('#signup-form button[type="submit"]');
  await mgr.waitForTimeout(1400);

  await mgr.click('.tab[data-tab="employees"]');
  await mgr.waitForTimeout(400);
  await mgr.click('#add-employee');
  await mgr.waitForTimeout(600);

  await mgr.click('.tab[data-tab="users"]');
  await mgr.waitForTimeout(700);
  const options = await mgr.locator('#invite-form select[name="employeeId"] option')
    .evaluateAll((o) => o.map((x) => x.value).filter(Boolean));
  await mgr.fill('#invite-form input[name="email"]', 'ronit@link.test');
  if (options.length) {
    await mgr.selectOption('#invite-form select[name="employeeId"]', options[0]);
  }
  await mgr.click('#invite-form button[type="submit"]');
  await mgr.waitForTimeout(1200);

  console.log('\n== לפני שיוצרים – אין קישור ==');
  check('יש עמודת קישור אישי',
    await mgr.locator('#users-list th', { hasText: 'קישור אישי' }).count(), 1);
  check('ונאמר שאין',
    await mgr.locator('#users-list').innerText(), /אין קישור/);
  check('יש כפתור יצירה',
    await mgr.locator('[data-action="link-create"]').count(), 1);

  console.log('\n== יצירה: הקישור מוצג פעם אחת ==');
  await mgr.click('[data-action="link-create"]');
  await mgr.waitForTimeout(1200);
  const link = await mgr.locator('[data-link-url]').inputValue();
  check('התקבלה כתובת עם אסימון', /\?k=.+/.test(link), true);
  check('ונאמר שזו ההזדמנות היחידה',
    await mgr.locator('#users-list').innerText(), /הרגע היחיד/);
  check('יש כפתור העתקה', await mgr.locator('[data-action="link-copy"]').count(), 1);

  /* ציור מחדש אינו אמור להחזיר את הכתובת: בשרת יש רק גיבוב */
  await mgr.click('.tab[data-tab="employees"]');
  await mgr.waitForTimeout(400);
  await mgr.click('.tab[data-tab="users"]');
  await mgr.waitForTimeout(900);
  check('אחרי מעבר מסך הכתובת כבר אינה מוצגת',
    await mgr.locator('[data-link-url]').count(), 0);
  check('אבל נאמר שהקישור פעיל',
    await mgr.locator('#users-list').innerText(), /קישור פעיל/);
  check('וטרם נעשה בו שימוש',
    await mgr.locator('#users-list').innerText(), /טרם נעשה בו שימוש/);

  console.log('\n== העובדת נכנסת עם הקישור, בלי להקליד דבר ==');
  /* לשונית חדשה באותו הקשר, ולא דפדפן נפרד: השרת כאן מדומה
     ויושב ב-localStorage של אותו הקשר. הקשר נפרד היה מסד נתונים
     ריק, כלומר בדיקה של כלום. */
  const emp = await ctx.newPage();
  emp.on('pageerror', (e) => errors.push('EMP: ' + e.message));
  await skipWizard(emp);
  const target = APP + (APP.indexOf('?') === -1 ? '?' : '&') + 'k=' + link.split('?k=')[1];
  await emp.goto(target);
  await emp.waitForTimeout(2000);
  check('מסך העובדת נפתח', await emp.locator('#employee-root').isVisible(), true);
  check('בלי מסך התחברות', await emp.locator('#signin-form').count(), 0);
  check('והאסימון ירד מהכתובת', /[?&]k=/.test(emp.url()), false);

  console.log('\n== המנהל רואה שנכנסו ==');
  /* השרת כאן מדומה ויושב באחסון אחד, ולכן הכניסה של העובדת
     החליפה את ההתחברות בלשונית של המנהל. בשרת אמיתי לכל מכשיר
     התחברות משלו; כאן נכנסים חזרה כמנהל כדי לקרוא את הנתון. */
  const signInAsManager = async () => {
    await mgr.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
    await mgr.reload();
    await mgr.waitForTimeout(900);
    await mgr.fill('input[name="email"]', 'boss@link.test');
    await mgr.fill('input[name="password"]', 'secret123');
    await mgr.click('#signin-form button[type="submit"]');
    await mgr.waitForTimeout(1600);
    await mgr.click('.tab[data-tab="users"]');
    await mgr.waitForTimeout(1100);
  };
  await signInAsManager();
  check('נרשם שימוש אחרון',
    await mgr.locator('#users-list').innerText(), /שימוש אחרון/);

  console.log('\n== ביטול: הקישור מפסיק לעבוד ==');
  await mgr.click('[data-action="link-revoke"]');
  await mgr.waitForTimeout(1200);
  check('חזר למצב "אין קישור"',
    await mgr.locator('#users-list').innerText(), /אין קישור/);

  const emp2 = await ctx.newPage();
  await emp2.evaluate(() => {}).catch(() => {});
  await emp2.goto(target);
  await emp2.waitForTimeout(1800);
  check('הקישור המבוטל אינו מכניס', await emp2.locator('#signin-form').count(), 1);
  check('ונאמר לעובדת מה לעשות',
    await emp2.locator('.auth-card').innerText(), /אינו תקף|קישור חדש/);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות הקישור האישי עברו');
