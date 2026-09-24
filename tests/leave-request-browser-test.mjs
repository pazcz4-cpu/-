/* חופשה בתשלום: בקשה, אישור, והופעה בדוח.

   המסלול שנבדק כאן הוא זה שהלקוח מתאר: עובד מבקש חמישה ימים
   בעוד שלושה שבועות, המנהל רואה בקשה אחת (ולא חמש) ומאשר
   אותה בלחיצה, והימים מופיעים בדוח החודשי כחופשה בתשלום.

   הרצה: npm run test:leavereq */
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

/* חופשה בתוך אותו חודש קלנדרי, כדי שהדוח החודשי ייבדק על חודש
   אחד. אם התאריך של היום קרוב לסוף החודש – נבחר החודש הבא. */
function leaveRange() {
  const today = new Date();
  let start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14);
  if (start.getDate() > 20) start = new Date(today.getFullYear(), today.getMonth() + 1, 8);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 4);
  const iso = (d) => d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return { from: iso(start), to: iso(end), month: iso(start).slice(0, 7) };
}

const range = leaveRange();
const browser = await chromium.launch();
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async (d) => { await d.accept(); });

  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(500);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'קפה חופשה');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@leave.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1500);
  await loadSample(page);

  /* השעון מודלק כדי שדוח השעות יהיה זמין: שם החופשה אמורה
     להופיע, וזו הנקודה של כל התכונה. */
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(500);
  await page.check('#opt-clock');
  await page.waitForTimeout(700);

  await page.click('.tab[data-tab="users"]');
  await page.waitForTimeout(700);
  const cards = await page.locator('#invite-form select[name="employeeId"] option')
    .evaluateAll((list) => list.map((o) => o.value).filter(Boolean));
  await page.selectOption('#invite-form select[name="employeeId"]', cards[0]);
  await page.waitForTimeout(200);
  await page.fill('#invite-form input[name="email"]', 'ronit@leave.test');
  await page.click('#invite-form button[type="submit"]');
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    window.__backend.followLink('ronit@leave.test', 'invite');
    await window.__backend.setPassword('secret123');
  });

  const signIn = async (email) => {
    await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
    await page.reload();
    await page.waitForTimeout(900);
    await page.fill('#signin-form input[name="email"]', email);
    await page.fill('#signin-form input[name="password"]', 'secret123');
    await page.click('#signin-form button[type="submit"]');
    await page.waitForTimeout(1800);
  };

  console.log('\n== העובד מבקש ==');
  await signIn('ronit@leave.test');
  check('מגירת החופשה קיימת', await page.locator('.leave-fold').count(), 1);
  await page.locator('.leave-fold summary').click();
  await page.waitForTimeout(800);
  check('ועדיין אין בקשות', await page.locator('.leave-item').count(), 0);

  /* אין תיבת "בתשלום": בקשה מראש היא בקשה לחופשה בתשלום,
     ותיבה שאפשר להוריד אומרת לעובד שיש לו מה להפסיד בלחיצה. */
  check('אין תיבת סימון "בתשלום"', await page.locator('#leave-paid').count(), 0);
  await page.fill('#leave-from', range.from);
  await page.fill('#leave-to', range.to);
  await page.fill('#leave-note', 'חתונה של אחי');
  await page.click('[data-leave-send]');
  await page.waitForTimeout(1500);
  check('הבקשה נשלחה', await page.locator('.leave-item').count(), 1);
  check('והיא מופיעה כממתינה',
    await page.locator('.leave-item').innerText(), /ממתינה/);
  check('חמישה ימים', await page.locator('.leave-item').innerText(), /5 ימים/);
  check('והיא בתשלום בלי שנדרש לסמן דבר',
    await page.locator('.leave-item').innerText(), /בתשלום/);
  check('וכך היא נשמרה בשרת', await page.evaluate(() => {
    const db = window.__backend.db;
    const kinds = [];
    Object.keys(db.data).forEach((companyId) => {
      const weeks = db.data[companyId].weeks || {};
      Object.keys(weeks).forEach((key) => {
        Object.keys(weeks[key].constraints || {}).forEach((slot) => {
          const record = weeks[key].constraints[slot];
          if (record.requestId) kinds.push(record.leave || '-');
        });
      });
    });
    return [...new Set(kinds)].join(',');
  }), 'paid');
  /* חמישה ימים = חמש רשומות, עם מזהה בקשה אחד */
  const stored = await page.evaluate(async () => {
    const db = window.__backend.db;
    const ids = new Set();
    let days = 0;
    Object.keys(db.data).forEach((companyId) => {
      const weeks = db.data[companyId].weeks || {};
      Object.keys(weeks).forEach((key) => {
        Object.keys(weeks[key].constraints || {}).forEach((slot) => {
          const record = weeks[key].constraints[slot];
          if (!record.requestId) return;
          ids.add(record.requestId);
          days++;
        });
      });
    });
    return { days: days, requests: ids.size };
  });
  check('נכתבו חמש רשומות', stored.days, 5);
  check('תחת בקשה אחת', stored.requests, 1);

  console.log('\n== המנהל רואה בקשה אחת, ומאשר ==');
  await signIn('boss@leave.test');
  await page.click('.tab[data-tab="constraints"]');
  await page.waitForTimeout(2000);
  check('הבקשה מופיעה', await page.locator('[data-leave-request]').count(), 1);
  check('עם שם העובד והטווח',
    await page.locator('[data-leave-request] .pending-info').innerText(), /5 ימים/);
  check('והסיבה שהעובד כתב',
    await page.locator('[data-leave-request] .pending-info').innerText(), /חתונה/);

  await page.click('[data-leave-decision="approved"]');
  await page.waitForTimeout(1800);
  check('אחרי אישור היא יורדת מהרשימה',
    await page.locator('[data-leave-request]').count(), 0);
  check('וכל חמשת הימים אושרו', await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    let approved = 0;
    Object.keys(state.weeks).forEach((key) => {
      const constraints = state.weeks[key].constraints || {};
      Object.keys(constraints).forEach((slot) => {
        const record = constraints[slot];
        if (record.requestId && record.status === 'approved') approved++;
      });
    });
    return approved;
  }), 5);

  console.log('\n== ובדוח החודשי ==');
  await page.click('.tab[data-tab="hours"]');
  await page.waitForTimeout(1200);
  await page.fill('#hours-month', range.month);
  await page.dispatchEvent('#hours-month', 'change');
  await page.waitForTimeout(2000);
  /* העמודות נקראות לפי הכותרת ולא לפי מיקום: עמודת השעות
     הנוספות מופיעה רק כשהבקרה דלוקה, ומספר קבוע היה שובר את
     הבדיקה בדיוק כשההגדרה משתנה. */
  const cell = async (column) => page.evaluate((title) => {
    const heads = [...document.querySelectorAll('#hours-table thead th')]
      .map((th) => th.textContent.trim());
    const index = heads.indexOf(title);
    const tr = [...document.querySelectorAll('#hours-table tbody tr')]
      .find((r) => r.querySelector('.row-head').textContent.trim() === 'עובד/ת 1');
    if (!tr || index < 0) return null;
    return [...tr.querySelectorAll('td')][index].textContent.trim();
  }, column);

  check('לעובד יש שורה בדוח', await page.evaluate(() =>
    [...document.querySelectorAll('#hours-table tbody tr .row-head')]
      .some((td) => td.textContent.trim() === 'עובד/ת 1')), true);
  check('וחמישה ימי חופשה בתשלום', await cell('חופשה בתשלום'), '5');
  check('ואפס ימי חופשה ללא תשלום', await cell('חופשה ללא תשלום'), '—');

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות בקשת החופשה עברו');
