/* מה עובד רואה מלבד עצמו.

   ההגדרה נראית קטנה, והיא הגדרת פרטיות: היא קובעת אם עובד רואה
   את שמות חבריו לצוות. לכן נבדקים כאן שלושה דברים ולא אחד:

     1. ברירת המחדל סגורה, וגם אצל עסק שנפתח לפני שההגדרה קיימת.
        שינוי גרסה שפותח בשקט את הסידור של כולם לכולם הוא בדיוק
        סוג התקלה שלקוח מגלה מעובד כועס ולא מאיתנו.
     2. כשהמנהל מדליק — נחשפים שמות ומשמרות. זה מה שביקשו.
     3. וגם אז, ורק זה: אילוצים, הערות, מיילים, טלפונים ומכסות
        של עובדים אחרים אינם מגיעים למסך בשום מצב.

   הרצה: npm run test:team */
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
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'he-IL' });
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
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@team.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1500);
  await loadSample(page);

  /* עסק הדוגמה מגיע בלי מיילים וטלפונים, ולכן בדיקת דליפה עליו
     הייתה עוברת מפני שאין מה לדלוף. כאן נשתלים ערכים ייחודיים
     שקל לזהות, וזה מה שהופך את הבדיקה לבדיקה. */
  await page.evaluate(() => {
    const app = window.ShiftApp;
    const state = app.getState();
    state.employees.forEach((emp, i) => {
      emp.email = 'zzmail' + i + '@private.test';
      emp.phone = '050-99900' + i;
      emp.note = 'zznote-secret-' + i;
    });
    app.applyRemoteConfig({
      settings: state.settings, branches: state.branches, employees: state.employees
    });
    app.persistConfig();
  });
  await page.waitForTimeout(700);

  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(500);
  await page.click('#generate');
  await page.waitForTimeout(2000);
  await page.click('#publish-week');
  await page.waitForTimeout(400);
  await page.click('[data-confirm-yes]');
  await page.waitForTimeout(1200);

  const openEmployee = async () => {
    await page.click('#user-preview');
    await page.waitForTimeout(400);
    await page.locator('.preview-pick').first().click();
    await page.waitForTimeout(800);
  };
  const backToManager = async () => {
    await page.click('#preview-exit');
    await page.waitForTimeout(800);
  };

  console.log('\n== ברירת המחדל: כל אחד רואה רק את עצמו ==');
  check('ההגדרה סגורה במודל',
    await page.evaluate(() => window.ShiftStore.teamVisibility(
      window.ShiftApp.getState()).shifts), false);
  await openEmployee();
  check('אין מגירת צוות במסך העובד',
    await page.locator('.team-fold').count(), 0);
  await backToManager();

  console.log('\n== עסק ישן, בלי ההגדרה כלל ==');
  /* לקוח שנפתח לפני שההגדרה קיימת: settings בלי teamVisibility.
     הוא חייב לקבל סגור, ולא "לא הוגדר ולכן פתוח". */
  await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    delete state.settings.teamVisibility;
  });
  check('היעדר הגדרה נקרא כסגור',
    await page.evaluate(() => window.ShiftStore.teamVisibility(
      window.ShiftApp.getState()).shifts), false);

  console.log('\n== המנהל מדליק ==');
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(500);
  check('התיבה קיימת במסך ההגדרות',
    await page.locator('#opt-team-shifts').isVisible(), true);
  check('והיא כבויה', await page.isChecked('#opt-team-shifts'), false);
  await page.check('#opt-team-shifts');
  await page.waitForTimeout(800);
  check('ההגדרה נשמרה',
    await page.evaluate(() => window.ShiftStore.teamVisibility(
      window.ShiftApp.getState()).shifts), true);

  console.log('\n== ועכשיו העובד רואה את הצוות ==');
  await openEmployee();
  check('המגירה קיימת', await page.locator('.team-fold').count(), 1);
  check('והיא סגורה כברירת מחדל',
    await page.evaluate(() => document.querySelector('.team-fold').open), false);
  await page.locator('.team-fold summary').click();
  await page.waitForTimeout(400);
  const slots = await page.locator('.team-slot').count();
  check('יש בה משמרות של הצוות', slots > 0, true);
  check('ושמות של יותר מאדם אחד',
    await page.evaluate(() => {
      const names = new Set();
      document.querySelectorAll('.team-slot span').forEach((n) => {
        n.textContent.split(',').forEach((v) => { if (v.trim()) names.add(v.trim()); });
      });
      return names.size;
    }) > 1, true);
  check('והעובד עצמו מסומן ברשימה',
    await page.locator('.team-me').count() > 0, true);

  console.log('\n== ומה שעדיין לא נחשף ==');
  /* זו הבדיקה שבאמת חשובה. גם כשההגדרה דלוקה, מה שעובר למסך
     הוא שמות ומשמרות — ולא כרטיס העובד. */
  const leak = await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    const text = document.body.innerText;
    const seeded = state.employees.filter((e) => /^zzmail/.test(e.email || ''));
    return {
      seeded: seeded.length,
      emails: seeded.filter((e) => text.indexOf(e.email) !== -1).length,
      phones: seeded.filter((e) => text.indexOf(e.phone) !== -1).length,
      notes: seeded.filter((e) => text.indexOf(e.note) !== -1).length
    };
  });
  /* בלי השורה הזו כל השאר יכול לעבור מפני שאין נתונים בכלל */
  check('יש בכלל נתונים רגישים לבדוק עליהם', leak.seeded > 1, true);
  check('אף מייל אינו מגיע למסך העובד', leak.emails, 0);
  check('אף טלפון אינו מגיע', leak.phones, 0);
  check('ואף הערה שהמנהל כתב אינה מגיעה', leak.notes, 0);

  /* dayRoster הוא המקור שממנו המסך בונה — ולכן הוא שנבדק, ולא
     רק מה שבמקרה מוצג. שדה שיתווסף לו יגיע למסך בלי ששמנו לב. */
  const fields = await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    const week = state.weeks[window.ShiftApp.weekKey()];
    const roster = window.ShiftStore.dayRoster(state, week, 0);
    const keys = new Set();
    roster.forEach((slot) => (slot.people || []).forEach((p) =>
      Object.keys(p).forEach((k) => keys.add(k))));
    return [...keys].sort();
  });
  check('כל מה שעובר על עובד הוא מזהה ושם',
    JSON.stringify(fields), '["id","name"]');

  console.log('\n== כיבוי מחזיר את המסך לסגור ==');
  await backToManager();
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(500);
  await page.uncheck('#opt-team-shifts');
  await page.waitForTimeout(800);
  await openEmployee();
  check('המגירה נעלמה', await page.locator('.team-fold').count(), 0);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות תצוגת הצוות עברו');
