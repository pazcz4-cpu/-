/* שעון הנוכחות מהטלפון, מקצה לקצה.

   מה שנבדק כאן הוא הדברים שאי אפשר לבדוק ביחידה: שהכפתור אינו
   מופיע לעסק שלא הדליק את השעון, שהעובד – עובד אמיתי, לא תצוגה
   מקדימה – מצליח לדווח, ושהמסך מראה אחר כך את המצב הנכון.

   הרצה: npm run test:clockui */
import { createRequire } from 'node:module';
import { loadSample } from './_sample.mjs';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const APP = url('app.html');
const PHONE = { width: 390, height: 844 };
const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: PHONE, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async (d) => { await d.accept(); });

  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(500);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'קפה שעון');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@clock.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1500);
  await loadSample(page);

  console.log('\n== ברירת המחדל: אין שעון ==');
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(600);
  check('התיבה קיימת במסך ההגדרות', await page.locator('#opt-clock').isVisible(), true);
  check('והיא כבויה', await page.isChecked('#opt-clock'), false);
  check('בורר אופן הדיווח כבוי כל עוד השעון כבוי',
    await page.locator('#clock-mode').isDisabled(), true);

  console.log('\n== המנהל מדליק ==');
  await page.check('#opt-clock');
  await page.waitForTimeout(800);
  check('ההגדרה נשמרה', await page.evaluate(() =>
    window.ShiftStore.timeclock(window.ShiftApp.getState()).enabled), true);
  check('וברירת המחדל היא דיווח מהטלפון', await page.evaluate(() =>
    window.ShiftStore.timeclock(window.ShiftApp.getState()).mode), 'phone');
  check('והבורר נפתח', await page.locator('#clock-mode').isDisabled(), false);

  console.log('\n== שעות נוספות ==');
  check('התיבה קיימת', await page.locator('#opt-overtime').isVisible(), true);
  await page.check('#opt-overtime');
  await page.waitForTimeout(700);
  check('הסף היומי מוצג בשעות ולא בדקות',
    await page.inputValue('#overtime-daily'), '8.6');
  check('והשבועי', await page.inputValue('#overtime-weekly'), '42');
  await page.fill('#overtime-daily', '9');
  await page.dispatchEvent('#overtime-daily', 'change');
  await page.waitForTimeout(700);
  check('שינוי בשעות נשמר בדקות', await page.evaluate(() =>
    window.ShiftStore.overtimeRule(window.ShiftApp.getState()).dailyMinutes), 540);

  console.log('\n== רישום מכשיר חומרה ==');
  check('במצב "מהטלפון" אין אזור מכשירים',
    await page.locator('#clock-devices').isHidden(), true);
  await page.selectOption('#clock-mode', 'both');
  await page.waitForTimeout(800);
  check('ובמצב משולב הוא נפתח', await page.locator('#clock-devices').isVisible(), true);
  /* בלי מספר לכל עובד אי אפשר לרשום לו כרטיס במכשיר, ולכן
     המספרים מוקצים ברגע שהעסק עובר לעבוד עם חומרה. */
  check('לכל עובד הוקצה מספר במכשיר', await page.evaluate(() =>
    window.ShiftApp.getState().employees.every((emp) => emp.clockId > 0)), true);
  check('והמספרים ייחודיים', await page.evaluate(() => {
    const ids = window.ShiftApp.getState().employees.map((e) => e.clockId);
    return new Set(ids).size === ids.length;
  }), true);
  check('והם מוצגים למתקין', await page.locator('#clock-numbers tbody tr').count() > 0, true);

  await page.fill('#device-sn', 'ZK-TEST-1');
  await page.click('#device-add');
  await page.waitForTimeout(800);
  check('המכשיר נרשם', await page.evaluate(() =>
    window.ShiftStore.timeclock(window.ShiftApp.getState()).devices.length), 1);
  check('עם שיוך לסניף', await page.evaluate(() =>
    !!window.ShiftStore.timeclock(window.ShiftApp.getState()).devices[0].branchId), true);
  /* מספר סידורי הוא המפתח שמזהה מכשיר. רישום כפול שלו היה
     מייצר שני שיוכים לאותו מכשיר, ואחד מהם היה נשאר תלוי. */
  await page.fill('#device-sn', 'ZK-TEST-1');
  await page.click('#device-add');
  await page.waitForTimeout(700);
  check('ואותו מספר אינו נרשם פעמיים', await page.evaluate(() =>
    window.ShiftStore.timeclock(window.ShiftApp.getState()).devices.length), 1);
  await page.click('[data-device-remove]');
  await page.waitForTimeout(700);
  check('והסרה עובדת', await page.evaluate(() =>
    window.ShiftStore.timeclock(window.ShiftApp.getState()).devices.length), 0);

  /* חזרה לדיווח מהטלפון, כי זה מה שנבדק בהמשך */
  await page.selectOption('#clock-mode', 'phone');
  await page.waitForTimeout(800);

  console.log('\n== עובד אמיתי מדווח ==');
  await page.click('.tab[data-tab="users"]');
  await page.waitForTimeout(700);
  const cards = await page.locator('#invite-form select[name="employeeId"] option')
    .evaluateAll((list) => list.map((o) => o.value).filter(Boolean));
  await page.selectOption('#invite-form select[name="employeeId"]', cards[0]);
  await page.waitForTimeout(200);
  await page.fill('#invite-form input[name="email"]', 'ronit@clock.test');
  await page.click('#invite-form button[type="submit"]');
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    window.__backend.followLink('ronit@clock.test', 'invite');
    await window.__backend.setPassword('secret123');
  });
  await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await page.reload();
  await page.waitForTimeout(900);
  await page.fill('#signin-form input[name="email"]', 'ronit@clock.test');
  await page.fill('#signin-form input[name="password"]', 'secret123');
  await page.click('#signin-form button[type="submit"]');
  await page.waitForTimeout(1800);

  check('כרטיס השעון מוצג לעובד', await page.locator('.punch-card').count(), 1);
  check('והכפתור אומר "כניסה"',
    await page.locator('.punch-btn').innerText(), /כניסה/);
  check('והמצב הוא "לא רשום"',
    await page.locator('.punch-state b').innerText(), /לא רשום/);

  await page.click('.punch-btn');
  await page.waitForTimeout(1200);
  check('אחרי הדיווח המצב הוא "בפנים"',
    await page.locator('.punch-state b').innerText(), /בפנים מאז/);
  check('והכפתור התחלף ל"יציאה"',
    await page.locator('.punch-btn').innerText(), /יציאה/);
  check('ונשמר דיווח אחד בשרת', await page.evaluate(async () => {
    const week = await window.__backend.loadWeek(window.ShiftStore.currentWeekKey());
    return (week.punches || []).length;
  }), 1);
  check('והוא כניסה, עם מקור "טלפון"', await page.evaluate(async () => {
    const week = await window.__backend.loadWeek(window.ShiftStore.currentWeekKey());
    return week.punches[0].kind + '/' + week.punches[0].src;
  }), 'in/phone');

  console.log('\n== לחיצה כפולה ==');
  await page.click('.punch-btn');
  await page.waitForTimeout(1200);
  check('לא נוצר דיווח שני', await page.evaluate(async () => {
    const week = await window.__backend.loadWeek(window.ShiftStore.currentWeekKey());
    return (week.punches || []).length;
  }), 1);
  check('והמסך עדיין מראה "בפנים"',
    await page.locator('.punch-state b').innerText(), /בפנים מאז/);

  console.log('\n== יציאה, אחרי שחלון הכפילות עבר ==');
  /* החותמת נדחפת עשר דקות אחורה במקום להמתין: מה שנבדק הוא
     ההתנהגות, לא הסבלנות של מי שמריץ את הבדיקה. */
  await page.evaluate(() => {
    const db = window.__backend.db;
    Object.keys(db.data).forEach((companyId) => {
      const weeks = db.data[companyId].weeks || {};
      Object.keys(weeks).forEach((key) => {
        (weeks[key].punches || []).forEach((punch) => {
          punch.at = new Date(Date.parse(punch.at) - 10 * 60 * 1000).toISOString();
        });
      });
    });
    window.__backend._save();
  });
  await page.click('.punch-btn');
  await page.waitForTimeout(1200);
  check('נרשמה יציאה', await page.evaluate(async () => {
    const week = await window.__backend.loadWeek(window.ShiftStore.currentWeekKey());
    return week.punches.map((p) => p.kind).join(',');
  }), 'in,out');
  check('והמסך חזר ל"לא רשום"',
    await page.locator('.punch-state b').innerText(), /לא רשום/);
  check('ומוצג סיכום השעות של היום',
    await page.locator('.punch-state span').innerText(), /0:1[0-9]/);

  console.log('\n== כיבוי מסיר את הכפתור ==');
  await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await page.reload();
  await page.waitForTimeout(900);
  await page.fill('#signin-form input[name="email"]', 'boss@clock.test');
  await page.fill('#signin-form input[name="password"]', 'secret123');
  await page.click('#signin-form button[type="submit"]');
  await page.waitForTimeout(1600);
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(600);
  await page.uncheck('#opt-clock');
  await page.waitForTimeout(800);
  await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await page.reload();
  await page.waitForTimeout(900);
  await page.fill('#signin-form input[name="email"]', 'ronit@clock.test');
  await page.fill('#signin-form input[name="password"]', 'secret123');
  await page.click('#signin-form button[type="submit"]');
  await page.waitForTimeout(1800);
  check('הכרטיס נעלם', await page.locator('.punch-card').count(), 0);
  /* והדיווחים לא נמחקו: כיבוי הוא הפסקת דיווח, לא מחיקת
     היסטוריה. דוח של חודש שעבר חייב להישאר נכון. */
  check('אבל הדיווחים שנשמרו נשארו', await page.evaluate(async () => {
    const week = await window.__backend.loadWeek(window.ShiftStore.currentWeekKey());
    return (week.punches || []).length;
  }), 2);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות שעון הנוכחות עברו');
