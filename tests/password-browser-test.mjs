/* סיסמאות: "שכחתי סיסמה" והזמנה שבה העובד קובע סיסמה בעצמו.
   הרצה: node tests/password-browser-test.mjs

   הבדיקה קיימת כי זו הדרך היחידה שבה לקוח שנעל את עצמו בחוץ חוזר
   למערכת, וכי סיסמה שמנהל קובע לעובד עוברת בפועל בוואטסאפ ונשארת
   שם. שני המסלולים חייבים לעבוד מקצה לקצה. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = 'file://' + path.join(here, '..', 'app.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'he-IL' });
const errors = [];

async function newPage() {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', async (d) => { await d.accept(); });
  return page;
}

try {
  const page = await newPage();
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'בדיקת סיסמאות');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@pw.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1200);

  console.log('\n== הזמנת עובד: בלי סיסמה, עם כרטיס ==');
  await page.click('.tab[data-tab="users"]');
  await page.waitForTimeout(500);
  check('אין שדה סיסמה ראשונית',
    await page.locator('#invite-form input[name="password"]').count(), 0);

  const before = await page.evaluate(() => window.ShiftApp.getState().employees.length);
  await page.fill('#invite-form input[name="name"]', 'רותם חדשה');
  await page.fill('#invite-form input[name="email"]', 'rotem@pw.test');
  await page.click('#invite-form button[type="submit"]');
  await page.waitForTimeout(900);
  const message = (await page.locator('#users-message').innerText()).trim();
  check('נאמר שנשלחה הזמנה', message, /נשלחה הזמנה/);
  check('ונפתח כרטיס עובד אוטומטית', message, /נפתח כרטיס עובד בשם רותם חדשה/);
  check('הכרטיס באמת נוסף',
    await page.evaluate(() => window.ShiftApp.getState().employees.length), before + 1);
  check('והמשתמש קושר אליו', await page.evaluate(async () => {
    const users = await window.__backend.listUsers();
    const user = users.filter((u) => u.email === 'rotem@pw.test')[0];
    const employees = window.ShiftApp.getState().employees;
    const card = employees.filter((e) => e.id === user.employeeId)[0];
    return card ? card.name : null;
  }), 'רותם חדשה');

  console.log('\n== הזמנה שנייה מתחברת לכרטיס קיים ==');
  const existing = await page.evaluate(
    () => window.ShiftApp.getState().employees[0].name);
  const count = await page.evaluate(() => window.ShiftApp.getState().employees.length);
  await page.fill('#invite-form input[name="name"]', existing);
  await page.fill('#invite-form input[name="email"]', 'existing@pw.test');
  await page.click('#invite-form button[type="submit"]');
  await page.waitForTimeout(900);
  check('קושר לכרטיס הקיים',
    (await page.locator('#users-message').innerText()).trim(), /קושר לכרטיס הקיים/);
  check('ולא נפתח כרטיס נוסף',
    await page.evaluate(() => window.ShiftApp.getState().employees.length), count);

  console.log('\n== מוזמן שטרם קבע סיסמה אינו יכול להתחבר ==');
  const invitee = await newPage();
  await invitee.goto(APP);
  await invitee.waitForTimeout(400);
  await invitee.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await invitee.reload();
  await invitee.waitForTimeout(500);
  await invitee.fill('input[name="email"]', 'rotem@pw.test');
  await invitee.fill('input[name="password"]', 'guess123');
  await invitee.click('#signin-form button[type="submit"]');
  await invitee.waitForTimeout(700);
  check('ההודעה מפנה לקישור ולא מאשימה בסיסמה',
    (await invitee.locator('.auth-error').innerText()).trim(), /הוזמן וטרם נקבעה/);

  console.log('\n== קישור ההזמנה: קביעת סיסמה וכניסה ==');
  await invitee.evaluate(() => window.__backend.followLink('rotem@pw.test', 'invite'));
  await invitee.reload();
  await invitee.waitForTimeout(600);
  check('מוצג מסך בחירת סיסמה', await invitee.locator('#password-form').isVisible(), true);
  check('והכיתוב הוא של הזמנה',
    await invitee.locator('.auth-card .auth-hint').first().textContent(), /הוזמנתם/);

  await invitee.fill('#password-form input[name="password"]', 'chosen123');
  await invitee.fill('#password-form input[name="confirm"]', 'different');
  await invitee.click('#password-form button[type="submit"]');
  await invitee.waitForTimeout(400);
  check('שתי סיסמאות שונות נעצרות',
    (await invitee.locator('.auth-error').innerText()).trim(), /אינן זהות/);

  await invitee.fill('#password-form input[name="confirm"]', 'chosen123');
  await invitee.click('#password-form button[type="submit"]');
  await invitee.waitForTimeout(1200);
  check('נכנס למערכת', await invitee.locator('#employee-root').isVisible(), true);
  check('והוא באמת העובד שהוזמן',
    await invitee.locator('#user-bar .user-name').textContent(), /רותם חדשה/);

  console.log('\n== שכחתי סיסמה ==');
  const forgot = await newPage();
  await forgot.goto(APP);
  await forgot.waitForTimeout(400);
  await forgot.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await forgot.reload();
  await forgot.waitForTimeout(500);
  check('יש קישור "שכחתי סיסמה"', await forgot.locator('#auth-forgot').isVisible(), true);
  await forgot.click('#auth-forgot');
  await forgot.waitForTimeout(300);
  check('מסך האיפוס אינו מבקש סיסמה',
    await forgot.locator('#reset-form input[name="password"]').count(), 0);

  await forgot.fill('#reset-form input[name="email"]', 'nobody@pw.test');
  await forgot.click('#reset-form button[type="submit"]');
  await forgot.waitForTimeout(600);
  const unknown = (await forgot.locator('.auth-notice').innerText()).trim();
  check('כתובת שאינה קיימת מקבלת אותה תשובה', unknown, /אם הכתובת רשומה/);
  check('וחוזרים למסך ההתחברות', await forgot.locator('#signin-form').isVisible(), true);

  await forgot.click('#auth-forgot');
  await forgot.waitForTimeout(300);
  await forgot.fill('#reset-form input[name="email"]', 'boss@pw.test');
  await forgot.click('#reset-form button[type="submit"]');
  await forgot.waitForTimeout(600);
  check('כתובת קיימת מקבלת בדיוק את אותה תשובה',
    (await forgot.locator('.auth-notice').innerText()).trim(), unknown);

  await forgot.evaluate(() => window.__backend.followLink('boss@pw.test', 'recovery'));
  await forgot.reload();
  await forgot.waitForTimeout(600);
  check('הקישור פותח מסך סיסמה חדשה',
    await forgot.locator('#password-form').isVisible(), true);
  check('והכיתוב הוא של איפוס',
    await forgot.locator('.auth-card .auth-hint').first().textContent(), /בחרו סיסמה חדשה/);
  await forgot.fill('#password-form input[name="password"]', 'brandnew1');
  await forgot.fill('#password-form input[name="confirm"]', 'brandnew1');
  await forgot.click('#password-form button[type="submit"]');
  await forgot.waitForTimeout(1300);
  check('הבעלים נכנס מיד עם הסיסמה החדשה',
    await forgot.locator('#manager-root').isVisible(), true);

  console.log('\n== הסיסמה הישנה כבר אינה עובדת ==');
  await forgot.click('#user-signout');
  await forgot.waitForTimeout(900);
  await forgot.fill('input[name="email"]', 'boss@pw.test');
  await forgot.fill('input[name="password"]', 'secret123');
  await forgot.click('#signin-form button[type="submit"]');
  await forgot.waitForTimeout(700);
  check('הסיסמה הישנה נדחית',
    (await forgot.locator('.auth-error').innerText()).trim(), /שגויים/);
  await forgot.fill('input[name="password"]', 'brandnew1');
  await forgot.click('#signin-form button[type="submit"]');
  await forgot.waitForTimeout(1200);
  check('והחדשה עובדת', await forgot.locator('#manager-root').isVisible(), true);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות הסיסמאות עברו');
