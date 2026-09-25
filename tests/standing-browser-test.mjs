/* אילוץ קבוע מקצה לקצה: המנהל מגדיר על כרטיס העובד, העובד רואה
   אותו נעול, המכסה השבועית אינה נוגעת בו, והשיבוץ מכבד אותו.
   הרצה: npm run test:standing */
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

const APP = url('app.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'he-IL' });
const errors = [];
async function mk() {
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async d => { await d.accept(); });
  return page;
}

try {
  const mgr = await mk();
  await skipWizard(mgr);
  await mgr.goto(APP);
  await mgr.waitForTimeout(400);
  await mgr.click('[data-auth-mode="signup"]');
  await mgr.fill('input[name="companyName"]', 'קפה מרכז');
  await mgr.fill('input[name="name"]', 'פז');
  await mgr.fill('input[name="email"]', 'boss@standing.test');
  await mgr.fill('input[name="password"]', 'secret123');
  /* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
     עם הלקוח כשמשהו בחשבון דורש טיפול. */
  await mgr.fill('input[name="phone"]', '054-1234567');
  await mgr.click('#signup-form button[type="submit"]');
  await mgr.waitForTimeout(1100);
  await loadSample(mgr);

  /* תקרה נמוכה, כדי שיהיה ברור אם האילוץ הקבוע גוזל ממנה */
  await mgr.click('.tab[data-tab="settings"]');
  await mgr.waitForTimeout(400);
  await mgr.check('#opt-limit');
  await mgr.waitForTimeout(300);
  await mgr.fill('#limit-max', '2');
  await mgr.locator('#limit-max').blur();
  await mgr.waitForTimeout(400);

  console.log('\n== העורך בכרטיס העובד ==');
  await mgr.click('.tab[data-tab="employees"]');
  await mgr.waitForTimeout(600);
  await mgr.locator('#employees-list .card .card-summary').first().click();
  await mgr.waitForTimeout(400);
  const card = mgr.locator('#employees-list .card').first();
  check('יש אזור אילוץ קבוע', await card.locator('.standing-grid').count(), 1);
  check('שורה לכל יום בשבוע', await card.locator('.standing-row').count(), 7);
  check('אף יום אינו מסומן מראש', await card.locator('.standing-row.on').count(), 0);
  check('נאמר במפורש שזה לא נספר במכסה',
    await card.locator('.standing-field .hint.quiet').innerText(), /מכסה|תקרת/);

  /* שני ערב: הדוגמה מהבקשה */
  const empId = await mgr.evaluate(() => window.ShiftApp.getState().employees[0].id);
  await card.locator('.standing-row').nth(1)
    .locator('[data-action="standing-shift"][data-shift="evening"]').click();
  await mgr.waitForTimeout(600);
  check('נשמר על הכרטיס', await mgr.evaluate((id) => {
    const emp = window.ShiftApp.getState().employees.find(e => e.id === id);
    return JSON.stringify(emp.standing);
  }, empId), '{"1":{"blocked":{"evening":true}}}');
  check('והיום מסומן במסך', await card.locator('.standing-row.on').count(), 1);

  console.log('\n== "כל היום" מחליף את המשמרות הבודדות ==');
  await card.locator('.standing-row').nth(1)
    .locator('[data-action="standing-off"]').click();
  await mgr.waitForTimeout(600);
  check('היום כולו חסום', await mgr.evaluate((id) => {
    const emp = window.ShiftApp.getState().employees.find(e => e.id === id);
    return JSON.stringify(emp.standing);
  }, empId), '{"1":{"off":true}}');
  /* חזרה למשמרת אחת בלבד, זו הדוגמה שביקשנו לבדוק */
  await card.locator('.standing-row').nth(1).locator('[data-action="standing-off"]').click();
  await mgr.waitForTimeout(500);
  await card.locator('.standing-row').nth(1)
    .locator('[data-action="standing-shift"][data-shift="evening"]').click();
  await mgr.waitForTimeout(600);

  console.log('\n== מסך האילוצים: נעול, ולא ניתן לבזבז עליו בקשה ==');
  await mgr.click('.tab[data-tab="constraints"]');
  await mgr.waitForTimeout(700);
  const locked = mgr.locator('#constraints-grid .cstate.standing');
  check('התא מסומן כקבוע', await locked.count() > 0, true);
  check('והוא נעול', await locked.first().isDisabled(), true);

  console.log('\n== המכסה השבועית לא נגעה ==');
  check('נותרו שתי בקשות מלאות', await mgr.evaluate((id) => {
    const app = window.ShiftApp, S = window.ShiftStore;
    const state = app.getState();
    return S.constraintsLeft(state, S.getWeek(state, app.weekKey()), id);
  }, empId), 2);

  console.log('\n== השיבוץ מכבד את האילוץ ==');
  await mgr.click('.tab[data-tab="schedule"]');
  await mgr.waitForTimeout(500);
  await mgr.click('#generate');
  await mgr.waitForTimeout(2500);
  check('לא שובץ בשני ערב', await mgr.evaluate((id) => {
    const app = window.ShiftApp, S = window.ShiftStore;
    const state = app.getState();
    const week = S.getWeek(state, app.weekKey());
    return state.branches.some(b =>
      S.getAssigned(week, 1, b.id, 'evening').indexOf(id) !== -1);
  }, empId), false);
  check('אבל כן שובץ בשבוע', await mgr.evaluate((id) => {
    const app = window.ShiftApp, S = window.ShiftStore;
    const state = app.getState();
    return S.employeeWeekCount(state, S.getWeek(state, app.weekKey()), id) > 0;
  }, empId), true);

  console.log('\n== מה העובד עצמו רואה ==');
  await mgr.click('.tab[data-tab="users"]');
  await mgr.waitForTimeout(500);
  await mgr.fill('#invite-form input[name="email"]', 'dani@standing.test');
  await mgr.click('#invite-form button[type="submit"]');
  await mgr.waitForTimeout(900);
  /* מקשרים את ההזמנה לאותו כרטיס שעליו הוגדר האילוץ */
  await mgr.evaluate((id) => {
    const backend = window.__backend;
    const company = backend.session().company.id;
    Object.keys(backend.db.users).forEach((key) => {
      const user = backend.db.users[key];
      if (user.email === 'dani@standing.test' && user.companyId === company) {
        user.employeeId = id;
      }
    });
    backend._save();
  }, empId);

  const emp = await mk();
  await skipWizard(emp);
  await emp.goto(APP);
  await emp.waitForTimeout(500);
  await emp.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await emp.evaluate(() => window.__backend.followLink('dani@standing.test', 'invite'));
  await emp.reload();
  await emp.waitForTimeout(700);
  await emp.fill('#password-form input[name="password"]', 'chosen123');
  await emp.fill('#password-form input[name="confirm"]', 'chosen123');
  await emp.click('#password-form button[type="submit"]');
  await emp.waitForTimeout(1600);

  const fixed = emp.locator('.cstate.standing');
  check('העובד רואה את האילוץ הקבוע', await fixed.count() > 0, true);
  check('והוא נעול אצלו', await fixed.first().isDisabled(), true);
  check('ונאמר בו במילים ולא רק בצבע',
    await fixed.first().innerText(), /קבוע/);

  /* לחיצה עליו אינה שומרת דבר ואינה גוזלת מהמכסה */
  await fixed.first().click({ force: true });
  await emp.waitForTimeout(600);
  check('לא נוצרה בקשה', await emp.evaluate(() => {
    const week = window.__employeeUI ? window.__employeeUI.week : null;
    return week ? Object.keys(week.constraints || {}).length : 0;
  }), 0);

  console.log('\n  שגיאות בדף: ' + (errors.length ? errors.join(' | ') : 'אין'));
  if (errors.length) failures.push('שגיאות דפדפן: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.error('\n❌ נכשלו:\n' + failures.map(f => '  - ' + f).join('\n'));
  process.exit(1);
}
console.log('\n✅ כל בדיקות האילוץ הקבוע עברו');
