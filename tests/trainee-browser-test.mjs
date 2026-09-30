/* עובד בהתלמדות: הוי בכרטיס, בחירת מי מכשיר, ושהסידור שנבנה מכבד את זה.
   הרצה: node tests/trainee-browser-test.mjs */
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
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual));
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 }, locale: 'he-IL' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', async (d) => { await d.accept(); });

const emp = (id) => page.evaluate((x) => {
  const e = window.ShiftApp.getState().employees.find((item) => item.id === x);
  return e ? { trainee: e.trainee === true, mentors: e.mentors || [] } : null;
}, id);

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

  console.log('\n== הוי בכרטיס העובד ==');
  await page.click('.tab[data-tab="employees"]');
  await page.waitForTimeout(400);
  const first = page.locator('.card[data-emp]').first();
  const id = await first.getAttribute('data-emp');
  await first.locator('[data-action="toggle-card"]').first().click();
  await page.waitForTimeout(300);
  check('יש תיבת סימון "בהתלמדות"', await first.locator('input[data-field="trainee"]').count(), 1);
  check('אין בחירת מלווים לפני הסימון', await first.locator('[data-action="toggle-mentor"]').count(), 0);

  await first.locator('input[data-field="trainee"]').check();
  await page.waitForTimeout(400);
  check('העובד נשמר כמתלמד', (await emp(id)).trainee, true);
  const card = page.locator('.card[data-emp="' + id + '"]');
  const pool = await card.locator('[data-action="toggle-mentor"]').count();
  check('נפתחת בחירת מלווים', pool > 0, true);
  const ownName = await card.locator('input.name').inputValue();
  const pillNames = (await card.locator('.mentor-pills').innerText()).split('\n');
  check('העובד עצמו אינו ברשימת המלווים', pillNames.indexOf(ownName), -1);

  await card.locator('[data-action="toggle-mentor"]').first().click();
  await page.waitForTimeout(300);
  check('נבחר מלווה אחד', (await emp(id)).mentors.length, 1);
  await page.locator('.card[data-emp="' + id + '"] [data-action="toggle-mentor"]').first().click();
  await page.waitForTimeout(300);
  check('לחיצה נוספת מבטלת', (await emp(id)).mentors.length, 0);

  console.log('\n== בנייה: המתלמד אינו לבד ולא במקום עובד נדרש ==');
  await page.locator('.card[data-emp="' + id + '"] [data-action="toggle-mentor"]').first().click();
  await page.waitForTimeout(300);
  await page.click('.tab[data-tab="schedule"]');
  await page.click('#generate');
  await page.waitForTimeout(2500);
  const result = await page.evaluate((traineeId) => {
    const app = window.ShiftApp, Store = window.ShiftStore;
    const state = app.getState(), week = state.weeks[app.getWeekKey()];
    let together = 0, alone = 0;
    Object.keys(week.assignments).forEach((key) => {
      const list = week.assignments[key];
      if (list.indexOf(traineeId) === -1) return;
      const staff = list.filter((x) => !Store.isTrainee(state, x));
      if (!staff.length) alone++; else together++;
    });
    const problems = window.ShiftValidate.validate(state, week).issues
      .filter((i) => /^trainee-/.test(i.type)).length;
    return { together, alone, problems };
  }, id);
  check('המתלמד לא נשאר לבד באף משמרת', result.alone, 0);
  check('אין התראות מתלמד בסידור שנבנה', result.problems, 0);
  console.log('   משמרות ליד מלווה:', result.together);

  console.log('\n== במשבצת: המתלמד אינו תופס מקום נדרש ==');
  await page.click('.tab[data-tab="schedule"]');
  await page.click('.view-switch [data-view="branch"]');
  await page.waitForTimeout(400);
  const cellInfo = await page.evaluate((traineeId) => {
    const app = window.ShiftApp, Store = window.ShiftStore;
    const state = app.getState(), week = state.weeks[app.getWeekKey()];
    const branch = state.branches[0];
    let target = null;
    for (let d = 0; d < 7 && !target; d++) {
      Store.shiftIds(state).forEach((shiftId) => {
        if (!target && Store.slotNeed(branch, d, shiftId, week) >= 1) target = { d, shiftId };
      });
    }
    const other = state.employees.find((e) => e.id !== traineeId && !e.trainee).id;
    Store.setAssigned(week, target.d, branch.id, target.shiftId, [traineeId, other]);
    app.render();
    const cell = document.querySelector('#schedule-branch td.cell[data-day="' + target.d +
      '"][data-branch="' + branch.id + '"][data-shift="' + target.shiftId + '"]');
    const values = Array.from(cell.querySelectorAll('select.emp-select')).map((sel) => sel.value);
    const need = Store.slotNeed(branch, target.d, target.shiftId, week);
    return { values, need, other, traineeId };
  }, id);
  check('המקום הנדרש הראשון הוא של העובד, לא של המתלמד', cellInfo.values[0], cellInfo.other);
  check('המתלמד מוצג אחרי המקומות הנדרשים', cellInfo.values[cellInfo.need], cellInfo.traineeId);

  console.log('\n== ביטול הסימון מנקה את הבחירה ==');
  await page.click('.tab[data-tab="employees"]');
  await page.waitForTimeout(300);
  const again = page.locator('.card[data-emp="' + id + '"]');
  if (!(await again.locator('input[data-field="trainee"]').isVisible())) {
    await again.locator('[data-action="toggle-card"]').first().click();
    await page.waitForTimeout(200);
  }
  await again.locator('input[data-field="trainee"]').uncheck();
  await page.waitForTimeout(300);
  const cleared = await emp(id);
  check('כבר לא מתלמד', cleared.trainee, false);
  check('והמלווים נמחקו', cleared.mentors.length, 0);
  check('אין שגיאות בדף', errors.length, 0);
  if (errors.length) console.log(errors);
} finally {
  await browser.close();
}
if (failures.length) { console.log('\n❌ ' + failures.length + ' נכשלו'); process.exit(1); }
console.log('\n✅ עובד בהתלמדות עובד');
