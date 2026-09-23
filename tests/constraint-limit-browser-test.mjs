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

  /* מנהל שהגביל ל-3 וראה שש שורות על המסך חשב שיש באג. ברירת
     המחדל היא שכל בקשה נספרת, כולל העדפה, ומי שרוצה מכבה. */
  check('העדפות נספרות כברירת מחדל',
    await mgr.locator('#opt-limit-prefs').isChecked(), true);
  check('וההסבר אומר שכולן נספרות',
    (await mgr.locator('#limit-hint').textContent()).trim(), /גם העדפה/);
  await mgr.uncheck('#opt-limit-prefs');
  await mgr.waitForTimeout(500);
  check('אחרי כיבוי – ההסבר מתחלף',
    (await mgr.locator('#limit-hint').textContent()).trim(), /העדפה אינה נספרת/);
  check('וההגדרה נשמרה בשרת', await mgr.evaluate(() =>
    window.__backend.loadConfig().then((c) =>
      c.settings.constraintLimit.countPreferences)), false);
  await mgr.check('#opt-limit-prefs');
  await mgr.waitForTimeout(500);
  check('והדלקה חוזרת נשמרת גם היא', await mgr.evaluate(() =>
    window.__backend.loadConfig().then((c) =>
      c.settings.constraintLimit.countPreferences)), true);
  check('הבחירה נעולה כשהתקרה כבויה', await mgr.evaluate(async () => {
    document.querySelector('#opt-limit').click();
    await new Promise((r) => setTimeout(r, 400));
    const locked = document.querySelector('#opt-limit-prefs').disabled;
    document.querySelector('#opt-limit').click();
    await new Promise((r) => setTimeout(r, 400));
    return locked;
  }), true);

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

  console.log('\n== המנהל אינו מוגבל ==');
  /* התקרה מגבילה את מה שהעובד מגיש, לא את מה שהמנהל יודע. עובד
     שלקח שבוע חופשה – המנהל מסמן לו את כל הימים, גם כשהתקרה
     היא בקשה אחת. */
  await mgr.click('.tab[data-tab="constraints"]');
  await mgr.waitForTimeout(800);
  const empId = await mgr.evaluate(() => {
    /* הכרטיס נפתח מתוך שליחת פרטי הכניסה, ולכן הוא מזוהה לפי
       המייל ולא לפי שם שהמנהל כבר אינו מקליד */
    const emp = window.ShiftApp.getState().employees
      .find(e => e.email === 'dani@cap.test');
    return emp && emp.id;
  });
  check('כרטיס העובד נמצא', !!empId, true);

  /* חמישה ימי חופש ברצף, בזה אחר זה, דרך המסך של המנהל */
  for (const day of [0, 1, 2, 3, 4]) {
    await mgr.locator('#constraints-grid .cstate[data-off]' +
      '[data-emp="' + empId + '"][data-day="' + day + '"]').click();
    await mgr.waitForTimeout(350);
  }
  check('כל חמשת הימים נשמרו, למרות תקרה של בקשה אחת',
    await mgr.evaluate((id) => {
      const app = window.ShiftApp, S = window.ShiftStore;
      const state = app.getState();
      const week = S.getWeek(state, app.weekKey());
      return [0, 1, 2, 3, 4].filter(d => S.getConstraint(week, id, d).off).length;
    }, empId), 5);
  check('ולא הוצגה הודעת תקרה למנהל',
    (await mgr.locator('#toast').innerText()).indexOf('הגביל') === -1, true);

  console.log('\n== והכלל יושב בשרת, לא רק במסך ==');
  /* העובד נכנס אחרון, ושני הדפים חולקים אותו אחסון – ולכן
     מתחברים שוב כמנהל לפני הקריאה הישירה. */
  const direct2 = await mgr.evaluate(async (id) => {
    const backend = window.__backend;
    await backend.signIn({ email: 'boss@cap.test', password: 'secret123' });
    const weeks = await backend.listWeeks();
    const weekKey = weeks[weeks.length - 1];
    const week = await backend.loadWeek(weekKey);
    const constraints = Object.assign({}, (week && week.constraints) || {});
    [5, 6].forEach((day) => {
      constraints[id + '|' + day] = { off: true, blocked: {}, preferred: {}, status: 'approved' };
    });
    try {
      const saved = await backend.saveWeek(weekKey, {
        constraints: constraints, assignments: (week && week.assignments) || {},
        manual: {}, holidays: {}, shabbatEnd: '', note: ''
      });
      return Object.keys(saved.constraints).filter(k => k.indexOf(id + '|') === 0).length;
    } catch (err) { return (err && err.code) || 'unknown'; }
  }, empId);
  /* הנקודה היא שהשרת לא דחה: העובד קיבל constraint_limit על
     בקשה שנייה, והמנהל שמר שניים בבת אחת באותה תקרה. */
  check('שמירה ישירה של המנהל אינה נחסמת', typeof direct2 === 'number', true);
  check('ושני הימים נשמרו', direct2 >= 2, true);

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
