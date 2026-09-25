/* משמרת שכבתה אחרי שהסידור כבר נבנה: ההתראה, ומה שסוגר אותה.
   הרצה: npm run test:inactive */
import { createRequire } from 'node:module';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const APP = url('index.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 }, locale: 'he-IL' });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async d => { await d.accept(); });

  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(500);

  console.log('\n== סידור אוטומטי נקי מהפרות ==');
  await page.click('#generate');
  await page.waitForTimeout(900);

  const clean = await page.evaluate(() => {
    const app = window.ShiftApp;
    const state = app.getState();
    const week = state.weeks[window.ShiftStore.currentWeekKey()];
    const report = window.ShiftValidate.validate(state, week);
    const by = {};
    report.issues.forEach(i => { by[i.type] = (by[i.type] || 0) + 1; });
    return by;
  });
  /* מנוע השיבוץ והבדיקה חולקים את אותה פונקציה
     employeeAllowedInBranch, ולכן שיבוץ אוטומטי אינו יכול לייצר
     הפרת סניף. אם זה משתנה – זו רגרסיה אמיתית. */
  check('אין שיבוץ בסניף שאינו על הכרטיס', clean['branch-mismatch'] || 0, 0);
  check('אין שיבוץ במשמרת שאינה על הכרטיס', clean['shift-mismatch'] || 0, 0);
  check('אין שיבוץ במשמרת שאינה פעילה', clean['inactive-slot'] || 0, 0);

  console.log('\n== המנהל מכבה משמרת אחרי שהסידור נבנה ==');
  const before = await page.evaluate(() => {
    const app = window.ShiftApp;
    const state = app.getState();
    const week = state.weeks[window.ShiftStore.currentWeekKey()];
    const branch = state.branches[0];
    /* בדיוק מה שקורה בהגדרות הסניף: העמודה מקבלת 0 ונמחקת */
    let closed = 0;
    Object.keys(branch.schedule).forEach(day => {
      if (branch.schedule[day].evening) { delete branch.schedule[day].evening; closed++; }
    });
    app.render();
    return { closed, slots: Object.keys(week.assignments).length };
  });
  check('כובו משמרות ערב בסניף אחד', before.closed > 0, true);

  await page.click('.issue-chip[data-group="staffing"]');
  await page.waitForTimeout(300);
  const orphanText = await page.locator('#issues').innerText();
  check('ההתראה מסבירה שהמשמרת אינה פעילה', /שיבוץ במשמרת שאינה פעילה/.test(orphanText), true);
  check('ויש פעולה שסוגרת אותה', await page.locator('#drop-inactive').count(), 1);
  check('והפעולה אומרת כמה שיבוצים תסיר',
    await page.locator('#drop-inactive').innerText(), /הסרת .*שיבוצים|הסרת השיבוץ/);

  console.log('\n== לחיצה מסירה רק את מה שנשאר במשמרות שכבו ==');
  await page.click('#drop-inactive');
  await page.waitForTimeout(700);

  const after = await page.evaluate(() => {
    const app = window.ShiftApp;
    const state = app.getState();
    const week = state.weeks[window.ShiftStore.currentWeekKey()];
    const report = window.ShiftValidate.validate(state, week);
    const by = {};
    report.issues.forEach(i => { by[i.type] = (by[i.type] || 0) + 1; });
    return { by, slots: Object.keys(week.assignments).length };
  });
  check('לא נותרו שיבוצים במשמרות שכבו', after.by['inactive-slot'] || 0, 0);
  check('ושאר הסידור לא נמחק', after.slots > 0 && after.slots < before.slots, true);
  check('והפעולה נעלמה מהמסך', await page.locator('#drop-inactive').count(), 0);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות המשמרת שכבתה עברו');
