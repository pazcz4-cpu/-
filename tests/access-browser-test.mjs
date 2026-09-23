/* מייל וטלפון על כרטיס העובד, ושליחת פרטי כניסה – אחד אחד
   ולכולם בבת אחת.

   מה שנבדק כאן הוא הדבר שמנהל עושה ביום הראשון: מקים שלושים
   כרטיסים ורוצה שכולם ייכנסו למערכת. אם השליחה לכולם אינה
   עובדת, הוא שולח שלושים מיילים ביד – או לא שולח בכלל.

   הרצה: node tests/access-browser-test.mjs */
import { createRequire } from 'node:module';
import { loadSample } from './_sample.mjs';
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
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('dialog', async (d) => { await d.accept(); });

try {
  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'קפה גישה');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@acc.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1300);
  await loadSample(page);

  console.log('\n== מייל וטלפון על הכרטיס ==');
  await page.click('.tab[data-tab="employees"]');
  await page.waitForTimeout(500);
  const firstCard = page.locator('#employees-list .card').first();
  await firstCard.locator('.card-toggle').click();
  await page.waitForTimeout(250);
  check('יש שדה טלפון', await firstCard.locator('[data-field="phone"]').count(), 1);

  await firstCard.locator('[data-field="email"]').fill('dana@acc.test');
  await firstCard.locator('[data-field="email"]').blur();
  await page.waitForTimeout(300);
  await firstCard.locator('[data-field="phone"]').fill(' 050-1234567 ');
  await firstCard.locator('[data-field="phone"]').blur();
  await page.waitForTimeout(500);
  check('הטלפון נשמר בלי רווחים מיותרים', await page.evaluate(
    () => window.ShiftApp.getState().employees[0].phone), '050-1234567');

  await page.reload();
  await page.waitForTimeout(1400);
  check('והוא שרד רענון', await page.evaluate(
    () => window.ShiftApp.getState().employees[0].phone), '050-1234567');

  console.log('\n== שליחת פרטי כניסה מהכרטיס ==');
  await page.click('.tab[data-tab="employees"]');
  await page.waitForTimeout(400);
  const card = page.locator('#employees-list .card').first();
  await card.locator('.card-toggle').click();
  await page.waitForTimeout(250);
  check('יש כפתור שליחה', await card.locator('[data-action="send-access"]').count(), 1);
  await card.locator('[data-action="send-access"]').click();
  await page.waitForTimeout(900);
  check('נאמר שנשלח', (await page.locator('#toast').innerText()).trim(), /dana@acc\.test/);
  check('ונפתח משתמש לעובד', await page.evaluate(async () => {
    const users = await window.__backend.listUsers();
    return users.some((u) => u.email === 'dana@acc.test');
  }), true);

  /* עובד בלי מייל: הכפתור אומר מה חסר, ולא נכשל בשקט */
  const second = page.locator('#employees-list .card').nth(1);
  await second.locator('.card-toggle').click();
  await page.waitForTimeout(250);
  await second.locator('[data-action="send-access"]').click();
  await page.waitForTimeout(500);
  check('בלי מייל – נאמר מה חסר',
    (await page.locator('#toast').innerText()).trim(), /כתובת מייל/);

  console.log('\n== עמוד המשתמשים: בחירה ממלאת את המייל ==');
  await page.click('.tab[data-tab="users"]');
  await page.waitForTimeout(600);
  check('אין שדה שם בטופס',
    await page.locator('#invite-form input[name="name"]').count(), 0);

  const withEmail = await page.evaluate(() => {
    const emp = window.ShiftApp.getState().employees.filter((e) => e.email)[0];
    return emp ? emp.id : null;
  });
  await page.selectOption('#invite-form select[name="employeeId"]', withEmail);
  await page.waitForTimeout(300);
  check('המייל התמלא לבד',
    await page.locator('#invite-form input[name="email"]').inputValue(), 'dana@acc.test');

  /* ביטול הבחירה מחזיר את התיבה לריקה. תיבה שנשארת מלאה אחרי
     "ללא קישור" נראית מוכנה לשליחה, והכפתור בינתיים כבר מדבר
     על משהו אחר לגמרי. */
  await page.selectOption('#invite-form select[name="employeeId"]', '');
  await page.waitForTimeout(300);
  check('ביטול הבחירה מנקה את המייל',
    await page.locator('#invite-form input[name="email"]').inputValue(), '');
  check('והכפתור חוזר לשליחה לכולם',
    (await page.locator('#invite-submit').innerText()).trim(), /שליחה לכל/);

  /* אבל כתובת שהוקלדה ביד אינה נמחקת מתחת לידיים של המנהל */
  await page.fill('#invite-form input[name="email"]', 'handtyped@acc.test');
  await page.selectOption('#invite-form select[name="employeeId"]', withEmail);
  await page.waitForTimeout(250);
  await page.selectOption('#invite-form select[name="employeeId"]', '');
  await page.waitForTimeout(250);
  check('כתובת שמולאה מהכרטיס נמחקת גם אחרי הקלדה קודמת',
    await page.locator('#invite-form input[name="email"]').inputValue(), '');

  await page.fill('#invite-form input[name="email"]', 'handtyped@acc.test');
  await page.waitForTimeout(200);
  await page.selectOption('#invite-form select[name="employeeId"]', '');
  await page.waitForTimeout(250);
  check('כתובת שהוקלדה ביד נשארת',
    await page.locator('#invite-form input[name="email"]').inputValue(), 'handtyped@acc.test');
  await page.fill('#invite-form input[name="email"]', '');
  await page.waitForTimeout(200);

  const noMail = await page.evaluate(() => {
    const emp = window.ShiftApp.getState().employees.filter((e) => !e.email)[0];
    return emp ? emp.id : null;
  });
  const labels = await page.locator('#invite-form select[name="employeeId"] option')
    .evaluateAll((nodes) => nodes.map((n) => n.textContent));
  check('מי שאין לו מייל כתוב עליו שאין',
    labels.filter((text) => /אין מייל/.test(text)).length > 0, true);

  console.log('\n== בחירה שלא הגיעה כאירוע ==');
  /* מה שקרה אצל לקוח: העובד נבחר, תיבת המייל נשארה ריקה, והמסך
     אמר "צריך לבחור עובד". המייל יושב על הכרטיס — השליחה חייבת
     לקחת אותו משם, בלי להישען על אירוע הבחירה. */
  await page.evaluate((id) => {
    const form = document.getElementById('invite-form');
    form.employeeId.value = id;
    form.email.value = '';
  }, withEmail);
  await page.click('#invite-submit');
  await page.waitForTimeout(1000);
  check('נשלח בכל זאת, מהמייל שעל הכרטיס',
    (await page.locator('#users-message').innerText()).trim(), /נשלחו פרטי כניסה אל dana@acc\.test/);

  console.log('\n== עובד בלי מייל: נאמר מה חסר, ולא "צריך לבחור עובד" ==');
  await page.evaluate((id) => {
    const form = document.getElementById('invite-form');
    form.employeeId.value = id;
    form.email.value = '';
  }, noMail);
  await page.click('#invite-submit');
  await page.waitForTimeout(600);
  check('ההודעה מכוונת לכרטיס',
    (await page.locator('#users-message').innerText()).trim(), /אין כתובת מייל/);

  console.log('\n== שליחה לכולם בלחיצה אחת ==');
  /* ממלאים מייל לשני עובדים נוספים, כדי שיהיה למי לשלוח */
  await page.evaluate(() => {
    const employees = window.ShiftApp.getState().employees;
    employees[1].email = 'a@acc.test';
    employees[2].email = 'b@acc.test';
    return window.ShiftApp.persistConfig();
  });
  await page.selectOption('#invite-form select[name="employeeId"]', '');
  await page.fill('#invite-form input[name="email"]', '');
  await page.waitForTimeout(400);
  const label = (await page.locator('#invite-submit').innerText()).trim();
  check('הכפתור אומר לכמה הוא שולח', label, /3/);

  await page.click('#invite-submit');
  await page.waitForTimeout(400);
  check('השליחה לכולם עוברת דרך שאלה',
    await page.locator('.confirm-card').isVisible(), true);
  await page.click('.confirm-card [data-confirm-yes]');
  await page.waitForTimeout(3000);
  check('הדיווח מסכם כמה נשלחו',
    (await page.locator('#users-message').innerText()).trim(), /נשלחו פרטי כניסה ל-3/);
  check('ונאמר גם למי אין מייל',
    (await page.locator('#users-message').innerText()).trim(), /אין כתובת מייל/);
  check('כל השלושה קיבלו חשבון', await page.evaluate(async () => {
    const users = await window.__backend.listUsers();
    return ['dana@acc.test', 'a@acc.test', 'b@acc.test']
      .filter((mail) => users.some((u) => u.email === mail)).length;
  }), 3);

  console.log('\n== מייל שהוקלד נשמר על הכרטיס ==');
  /* אחרת השליחה הבאה תשאל עליו שוב, וגם "שליחה לכולם" תדלג
     עליו לנצח. */
  const stillNone = await page.evaluate(() => {
    const emp = window.ShiftApp.getState().employees.filter((e) => !e.email)[0];
    return emp ? emp.id : null;
  });
  await page.selectOption('#invite-form select[name="employeeId"]', stillNone);
  await page.fill('#invite-form input[name="email"]', 'typed@acc.test');
  await page.click('#invite-submit');
  await page.waitForTimeout(1000);
  check('המייל נשמר על הכרטיס', await page.evaluate((id) => {
    const emp = window.ShiftApp.getState().employees.filter((e) => e.id === id)[0];
    return emp ? emp.email : null;
  }, stillNone), 'typed@acc.test');

  console.log('\n  שגיאות בדף: ' + (errors.length ? errors.join(' | ') : 'אין'));
  if (errors.length) failures.push('שגיאות בדף');
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:');
  failures.forEach((line) => console.log('  ' + line));
  process.exit(1);
}
console.log('\n✅ כל בדיקות הגישה עברו\n');
