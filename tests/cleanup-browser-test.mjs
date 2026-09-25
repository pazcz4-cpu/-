/* מחיקה מנקה את כל השבועות – גם בשרת, לא רק בזיכרון.

   למה הבדיקה הזו קיימת: מחיקת עובד, סניף או סוג משמרת מנקה את
   השיבוצים בכל השבועות שבזיכרון, אבל השמירה שלחה לשרת את השבוע
   המוצג בלבד. ברענון הבא השיבוצים חזרו – כולל בשבועות שכבר
   פורסמו. התוצאה במציאות: משמרת שנראית מאוישת, ואיש אינו מגיע
   אליה, כי העובד שמשובץ בה כבר אינו קיים.

   זה לא נראה במסך ולכן לא נתפס ידנית: בזיכרון הכול היה נקי.

   הרצה: npm run test:cleanup */
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
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async (d) => { await d.accept(); });

  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(500);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="email"]', 'boss@clean.test');
  await page.fill('input[name="password"]', 'secret123');
  /* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
     עם הלקוח כשמשהו בחשבון דורש טיפול. */
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1600);
  await loadSample(page);

  /* שני שבועות משובצים. הבדיקה כולה על השבוע שאינו מוצג – שם
     היה הבאג, ושם הוא בלתי נראה. */
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(500);
  await page.click('#generate');
  await page.waitForTimeout(2200);
  await page.click('#next-week');
  await page.waitForTimeout(900);
  await page.click('#generate');
  await page.waitForTimeout(2200);
  const otherWeek = await page.evaluate(() => window.ShiftApp.weekKey());
  await page.click('#this-week');
  await page.waitForTimeout(900);

  const onServer = (key, test) => page.evaluate(async ([k, t]) => {
    const w = await window.__backend.loadWeek(k);
    let n = 0;
    Object.keys((w && w.assignments) || {}).forEach((slot) => {
      const list = w.assignments[slot] || [];
      if (t.kind === 'emp') list.forEach((id) => { if (id === t.id) n++; });
      if (t.kind === 'branch' && slot.split('|')[1] === t.id) n += list.length;
      if (t.kind === 'shift' && slot.split('|')[2] === t.id) n += list.length;
    });
    return n;
  }, [key, test]);

  console.log('\n== מחיקת עובד מנקה גם שבוע שאינו מוצג ==');
  const victim = await page.evaluate((k) => {
    const w = window.ShiftApp.getState().weeks[k] || {};
    let who = null;
    Object.keys(w.assignments || {}).some((slot) => {
      const list = w.assignments[slot] || [];
      if (list.length) { who = list[0]; return true; }
      return false;
    });
    return who;
  }, otherWeek);
  check('נמצא עובד משובץ בשבוע האחר', !!victim, true);
  check('ולפני המחיקה הוא בשרת',
    await onServer(otherWeek, { kind: 'emp', id: victim }) > 0, true);

  await page.click('.tab[data-tab="employees"]');
  await page.waitForTimeout(700);
  await page.locator(`[data-emp="${victim}"] [data-action="delete-emp"]`).click();
  await page.waitForTimeout(2000);
  check('נמחק מרשימת העובדים', await page.evaluate((id) =>
    !window.ShiftApp.getState().employees.some((e) => e.id === id), victim), true);
  check('ואינו משובץ בשרת בשבוע האחר',
    await onServer(otherWeek, { kind: 'emp', id: victim }), 0);

  /* הרענון הוא הרגע שבו האמת מתגלה: אם השמירה לא יצאה, הזיכרון
     נטען מחדש מהשרת והעובד חוזר. */
  await page.reload();
  await page.waitForTimeout(1800);
  check('וגם אחרי רענון הוא לא חוזר',
    await onServer(otherWeek, { kind: 'emp', id: victim }), 0);

  console.log('\n== מחיקת סניף מנקה גם שבוע שאינו מוצג ==');
  /* מהשרת ולא מהזיכרון: אחרי הרענון נטען רק השבוע המוצג, ושבוע
     אחר עדיין אינו בזיכרון. */
  const branch = await page.evaluate(async (k) => {
    const w = await window.__backend.loadWeek(k);
    const slots = Object.keys((w && w.assignments) || {});
    const slot = slots.find((s) => (w.assignments[s] || []).length);
    return slot ? slot.split('|')[1] : null;
  }, otherWeek);
  check('נמצא סניף משובץ', !!branch, true);
  await page.click('.tab[data-tab="branches"]');
  await page.waitForTimeout(800);
  await page.locator(`[data-branch="${branch}"] [data-action="delete-branch"]`).first().click();
  await page.waitForTimeout(2000);
  check('הסניף אינו משובץ בשרת בשבוע האחר',
    await onServer(otherWeek, { kind: 'branch', id: branch }), 0);
  await page.reload();
  await page.waitForTimeout(1800);
  check('וגם אחרי רענון',
    await onServer(otherWeek, { kind: 'branch', id: branch }), 0);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות הניקוי עברו');
