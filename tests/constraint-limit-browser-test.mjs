/* תקרת בקשות לעובד: המנהל מגדיר, העובד רואה כמה נותרו, ונחסם
   כשהן אוזלות. הרצה: node tests/constraint-limit-browser-test.mjs */
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
  await mgr.fill('input[name="email"]', 'boss@cap.test');
  await mgr.fill('input[name="password"]', 'secret123');
  await mgr.click('#signup-form button[type="submit"]');
  await mgr.waitForTimeout(1100);
  await loadSample(mgr);

  console.log('\n== ההגדרה אצל המנהל ==');
  await mgr.click('.tab[data-tab="settings"]');
  await mgr.waitForTimeout(300);
  check('כבוי כברירת מחדל', await mgr.locator('#opt-limit').isChecked(), false);
  check('השדה נעול כשכבוי', await mgr.locator('#limit-max').isDisabled(), true);

  await mgr.check('#opt-limit');
  await mgr.waitForTimeout(400);
  check('השדה נפתח', await mgr.locator('#limit-max').isDisabled(), false);
  check('ברירת מחדל שפויה', await mgr.locator('#limit-max').inputValue(), '2');
  check('היחידה נכתבת ברבים',
    (await mgr.locator('#limit-unit').textContent()).trim(), /בקשות בשבוע/);

  await mgr.fill('#limit-max', '1');
  await mgr.locator('#limit-max').blur();
  await mgr.waitForTimeout(400);
  check('היחידה עוברת ליחיד',
    (await mgr.locator('#limit-unit').textContent()).trim(), /^בקשה בשבוע$/);

  /* אפס אינו "בלי הגבלה" אלא "אסור להגיש כלום" */
  await mgr.fill('#limit-max', '0');
  await mgr.locator('#limit-max').blur();
  await mgr.waitForTimeout(500);
  check('אפס נדחה ולא נשמר', await mgr.locator('#limit-max').inputValue(), '1');
  check('ונאמר למה', (await mgr.locator('#toast').innerText()).trim(), /לפחות/);

  await mgr.fill('#limit-max', '2');
  await mgr.locator('#limit-max').blur();
  await mgr.waitForTimeout(400);

  console.log('\n== ההגדרה נשמרת ==');
  await mgr.reload();
  await mgr.waitForTimeout(1200);
  await mgr.click('.tab[data-tab="settings"]');
  await mgr.waitForTimeout(400);
  check('נשאר דלוק', await mgr.locator('#opt-limit').isChecked(), true);
  check('המספר נשמר', await mgr.locator('#limit-max').inputValue(), '2');

  console.log('\n== הזמנת עובד ==');
  await mgr.click('.tab[data-tab="users"]');
  await mgr.waitForTimeout(400);
  await mgr.fill('#invite-form input[name="name"]', 'דני');
  await mgr.fill('#invite-form input[name="email"]', 'dani@cap.test');
  await mgr.click('#invite-form button[type="submit"]');
  await mgr.waitForTimeout(800);
  check('ההזמנה נשלחה',
    (await mgr.locator('#users-message').innerText()).trim(), /dani@cap\.test/);

  console.log('\n== מה העובד רואה ==');
  const emp = await mk();
  await skipWizard(emp);
  await emp.goto(APP);
  await emp.waitForTimeout(500);
  await emp.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await emp.evaluate(() => window.__backend.followLink('dani@cap.test', 'invite'));
  await emp.reload();
  await emp.waitForTimeout(700);
  await emp.fill('#password-form input[name="password"]', 'secret123');
  await emp.fill('#password-form input[name="confirm"]', 'secret123');
  await emp.click('#password-form button[type="submit"]');
  await emp.waitForTimeout(1500);
  check('מסך העובד מוצג', await emp.locator('#employee-root').isVisible(), true);

  const note = () => emp.locator('.limit-note').innerText();
  check('המכסה נאמרת מראש', (await note()).trim(), /2 בקשות מתוך 2/);

  /* בקשת יום חופש ראשונה */
  const offButton = (day) => emp.locator('.cstate[data-off][data-day="' + day + '"]');
  await offButton(0).click();
  await emp.waitForTimeout(700);
  check('אחרי בקשה אחת נותרה אחת', (await note()).trim(), /בקשה אחת מתוך 2/);

  await offButton(1).click();
  await emp.waitForTimeout(700);
  check('אחרי שתיים המכסה אזלה', (await note()).trim(), /כל 2 הבקשות/);
  check('והמצב מסומן חזותית', await emp.locator('.limit-note.spent').count(), 1);

  console.log('\n== הבקשה השלישית נחסמת ==');
  await offButton(2).click();
  await emp.waitForTimeout(700);
  check('נאמר למה ומה לעשות',
    (await emp.locator('.employee-flash').innerText()).trim(), /2 בקשות בשבוע/);
  const saved = await emp.evaluate(() => {
    const state = window.__employeeState && window.__employeeState();
    return null;
  }).catch(() => null);
  check('והיום השלישי לא סומן',
    await emp.locator('.cstate[data-off][data-day="2"].off-day').count(), 0);

  console.log('\n== ביטול בקשה מפנה מקום ==');
  await offButton(0).click();
  await emp.waitForTimeout(700);
  check('נותרה בקשה אחת', (await note()).trim(), /בקשה אחת מתוך 2/);
  await offButton(2).click();
  await emp.waitForTimeout(700);
  check('והיום שנחסם קודם נשמר עכשיו',
    await emp.locator('.cstate[data-off][data-day="2"].off-day').count(), 1);

  console.log('\n== התקרה נאכפת גם בעקיפת המסך ==');
  /* עובד שיפתח את כלי הפיתוח שולח ישירות לשרת. אם ההגנה יושבת
     רק במסך, הוא עוקף אותה בשורה אחת. */
  const direct = await emp.evaluate(async () => {
    const weeks = await window.__backend.listWeeks();
    const weekKey = weeks[weeks.length - 1];
    try {
      await window.__backend.saveOwnConstraint(weekKey, 5, { off: true });
      return 'saved';
    } catch (err) { return (err && err.code) || 'unknown'; }
  });
  check('פנייה ישירה נדחית עם הסיבה הנכונה', direct, 'constraint_limit');

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות תקרת הבקשות עברו');
