/* תפקידים מקצה לקצה: הגדרה, סימון על עובד, דרישה במשמרת,
   והשיבוץ שמכבד אותם. הרצה: npm run test:rolesfeature */
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
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async d => { await d.accept(); });

  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'בית קפה');
  await page.fill('input[name="email"]', 'boss@roles.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1400);

  /* סניף אחד ועובד אחד, כדי שיהיה על מה להגדיר */
  await page.click('.tab[data-tab="branches"]');
  await page.waitForTimeout(400);
  await page.click('#add-branch');
  await page.waitForTimeout(700);

  console.log('\n== עסק בלי תפקידים לא רואה אותם בשום מסך ==');
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(500);
  check('המסך אומר שאין', await page.locator('#roles-list').innerText(), /עוד לא הוגדרו/);
  await page.click('.tab[data-tab="employees"]');
  await page.waitForTimeout(400);
  await page.click('#add-employee');
  await page.waitForTimeout(700);
  await page.click('#employees-list .card-toggle');
  await page.waitForTimeout(400);
  check('אין גלולות תפקיד בכרטיס העובד',
    await page.locator('.pill.role-pill').count(), 0);
  await page.click('.tab[data-tab="branches"]');
  await page.waitForTimeout(500);
  check('ואין בורר תפקיד בלוח הסניף', await page.locator('.sched-role').count(), 0);

  console.log('\n== הגדרת שני תפקידים ==');
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(400);
  await page.click('#add-role');
  await page.waitForTimeout(600);
  await page.locator('.role-name').first().fill('מטבח');
  await page.locator('.role-name').first().dispatchEvent('change');
  await page.waitForTimeout(600);
  await page.click('#add-role');
  await page.waitForTimeout(600);
  await page.locator('.role-name').nth(1).fill('מלצר');
  await page.locator('.role-name').nth(1).dispatchEvent('change');
  await page.waitForTimeout(600);
  check('שני תפקידים', await page.locator('.role-row').count(), 2);
  check('השמות', (await page.locator('.role-name').allTextContents()).length, 2);
  check('ואיש עוד לא מסומן בהם',
    await page.locator('.role-count.empty').count(), 2);

  console.log('\n== שם כפול נחסם ==');
  await page.locator('.role-name').nth(1).fill('מטבח');
  await page.locator('.role-name').nth(1).dispatchEvent('change');
  await page.waitForTimeout(700);
  check('ההודעה', (await page.locator('#toast').innerText()).trim(), /כבר יש תפקיד/);
  check('והשם הישן חזר', await page.inputValue('.role-row:nth-child(2) .role-name'), 'מלצר');

  console.log('\n== סימון תפקידים על עובד, יותר מאחד ==');
  await page.click('.tab[data-tab="employees"]');
  await page.waitForTimeout(500);
  await page.click('#employees-list .card-toggle');
  await page.waitForTimeout(400);
  check('שתי גלולות', await page.locator('.pill.role-pill').count(), 2);
  check('ונאמר מה המשמעות של לא לסמן',
    await page.locator('.card-body .hint:not(.hidden)').first().innerText(), /מתאים לכל/);
  await page.locator('.pill.role-pill').first().click();
  await page.waitForTimeout(600);
  await page.locator('.pill.role-pill').nth(1).click();
  await page.waitForTimeout(600);
  check('שתיהן דלוקות', await page.locator('.pill.role-pill.on').count(), 2);
  check('והכרטיס שמר', await page.evaluate(
    () => window.ShiftApp.getState().employees[0].roles.length), 2);

  console.log('\n== משמרת מחפשת תפקיד ==');
  await page.click('.tab[data-tab="branches"]');
  await page.waitForTimeout(600);
  check('לכל משבצת יש בורר תפקיד', await page.locator('.sched-role').count() > 0, true);
  const picker = page.locator('.sched-cell:not(.closed) select[data-sched="role"]').first();
  check('ברירת המחדל: כל אחד', await picker.inputValue(), '');
  const roleId = await page.evaluate(() => window.ShiftApp.getState().settings.roles[0].id);
  await picker.selectOption(roleId);
  await page.waitForTimeout(700);
  check('נשמר על המשבצת', await page.evaluate((id) => {
    const branch = window.ShiftApp.getState().branches[0];
    const days = Object.keys(branch.schedule);
    for (const day of days) {
      const shifts = branch.schedule[day];
      for (const shiftId of Object.keys(shifts)) {
        if (shifts[shiftId].role === id) return true;
      }
    }
    return false;
  }, roleId), true);

  console.log('\n== "כל אחד" חוזר למצב שבו התפקיד אינו קיים בנתונים ==');
  await page.locator('.sched-cell:not(.closed) select[data-sched="role"]').first().selectOption('');
  await page.waitForTimeout(700);
  check('השדה ירד מהנתונים ולא נשמר כמחרוזת ריקה', await page.evaluate(() => {
    const branch = window.ShiftApp.getState().branches[0];
    return JSON.stringify(branch.schedule).indexOf('"role"') === -1;
  }), true);

  console.log('\n== מחיקת תפקיד מנקה אותו מכל מקום ==');
  await page.evaluate((id) => {
    const state = window.ShiftApp.getState();
    const branch = state.branches[0];
    const day = Object.keys(branch.schedule)[0];
    const shiftId = Object.keys(branch.schedule[day])[0];
    branch.schedule[day][shiftId].role = id;
    window.ShiftApp.persistConfig();
  }, roleId);
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(500);
  await page.locator('.role-row [data-remove]').first().click();
  await page.waitForTimeout(800);
  check('נשאר תפקיד אחד', await page.locator('.role-row').count(), 1);
  check('ירד מכרטיס העובד', await page.evaluate(
    () => window.ShiftApp.getState().employees[0].roles.length), 1);
  check('וירד גם מהמשמרת', await page.evaluate((id) => {
    return JSON.stringify(window.ShiftApp.getState().branches[0].schedule).indexOf(id) === -1;
  }, roleId), true);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות התפקידים עברו');
