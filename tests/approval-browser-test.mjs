/* מסלול אישור אילוצים: עובד מבקש, מנהל מאשר, והשיבוץ מתחשב רק במה שאושר.
   הערה: השרת המדומה שומר הכל ב-localStorage של אותו דפדפן, ולכן הבדיקה
   מחליפה משתמשים בזה אחר זה. בשרת אמיתי שניהם עובדים במקביל.
   הרצה: npm run test:approval */
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
const OUT = path.join(here, '..', 'dist');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1450, height: 1000 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('dialog', async d => { await d.accept(); });

/* עובד מוזמן קובע סיסמה בעצמו מהקישור שבמייל. כאן אין מייל,
   ולכן הבדיקה מדמה את הלחיצה על הקישור. */
async function acceptInvite(email, password) {
  await page.evaluate(async (args) => {
    window.__backend.followLink(args.email, 'invite');
    await window.__backend.setPassword(args.password);
  }, { email: email, password: password });
}

async function signIn(email, password) {
  await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await page.reload();
  await page.waitForTimeout(600);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('#signin-form button[type="submit"]');
  await page.waitForTimeout(1400);
}

await skipWizard(page);

await page.goto(APP);
await page.waitForTimeout(400);
await page.click('[data-auth-mode="signup"]');
await page.waitForTimeout(200);
await page.fill('input[name="companyName"]', 'עסק');
await page.fill('input[name="email"]', 'mgr@ap.co.il');
await page.fill('input[name="password"]', 'secret123');
/* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
   עם הלקוח כשמשהו בחשבון דורש טיפול. */
await page.fill('input[name="phone"]', '054-1234567');
await page.click('#signup-form button[type="submit"]');
await page.waitForTimeout(1400);
await loadSample(page);

await page.click('.tab[data-tab="users"]');
await page.waitForTimeout(600);
const opts = await page.locator('#invite-form select[name="employeeId"] option')
  .evaluateAll(o => o.map(x => ({ v: x.value, t: x.textContent })).filter(x => x.v));
await page.fill('#invite-form input[name="email"]', 'ronit@ap.co.il');
await page.selectOption('#invite-form select[name="employeeId"]', opts[0].v);
await page.click('#invite-form button[type="submit"]');
await page.waitForTimeout(900);
console.log('1. העובדת הוזמנה וקושרה לכרטיס', opts[0].t);
await acceptInvite('ronit@ap.co.il', 'secret123');

// --- העובדת מבקשת יום חופש ---
await signIn('ronit@ap.co.il', 'secret123');
console.log('2. מסך העובדת מציין שנדרש אישור:',
  (await page.locator('.employee-note').nth(1).innerText()).includes('אישור המנהל'));
await page.locator('.employee-days .m-card').nth(2).locator('.cstate').last().click();
await page.waitForTimeout(1000);
console.log('   תגית אחרי הבקשה:', (await page.locator('.req-badge').first().innerText()).trim());

// --- המנהל רואה, בונה סידור, ורואה שהבקשה לא תפסה ---
await signIn('mgr@ap.co.il', 'secret123');
await page.click('.tab[data-tab="constraints"]');
await page.waitForTimeout(700);
console.log('3. פאנל הבקשות:', (await page.locator('.pending-title').innerText()).trim());
console.log('   פירוט:', (await page.locator('.pending-info').first().innerText()).replace(/\n/g, ' · '));
console.log('   סימון בלוח:', (await page.locator('.c-status.pending').first().innerText()).trim());

await page.click('.tab[data-tab="schedule"]');
await page.waitForTimeout(400);
await page.click('#generate');
await page.waitForTimeout(1800);
/* ההתראות מסוכמות; בקשה שממתינה לאישור היא "המלצה" */
await page.click('.issue-chip[data-group="advice"]');
await page.waitForTimeout(250);
const warn = (await page.locator('#issues .issue').allTextContents()).filter(t => t.includes('ממתינ'));
console.log('4. אזהרה על בקשה ממתינה:', warn.length > 0);
if (warn.length) console.log('   ' + warn[0]);

// --- אישור ---
await page.click('.tab[data-tab="constraints"]');
await page.waitForTimeout(600);
await page.click('.pending-item .approve');
await page.waitForTimeout(1100);
console.log('5. אחרי אישור – בקשות שנותרו:', await page.locator('.pending-item').count());
await page.screenshot({ path: OUT + '/approval.png' });

await page.click('.tab[data-tab="schedule"]');
await page.waitForTimeout(400);
await page.click('#generate');
await page.waitForTimeout(1800);
await page.click('.issue-chip[data-group="advice"]').catch(() => {});
await page.waitForTimeout(250);
const after = (await page.locator('#issues .issue').allTextContents()).filter(t => t.includes('ממתינ'));
console.log('   האזהרה נעלמה:', after.length === 0);

// --- העובדת רואה שאושר ---
await signIn('ronit@ap.co.il', 'secret123');
console.log('6. אצל העובדת:', (await page.locator('.req-badge').first().innerText()).trim());

/* ===== מי עוד ביקש את אותו דבר =====

   מנהל מאשר בקשות אחת-אחת, ולכן הוא אינו רואה שכמה אנשים
   ביקשו את אותה משמרת. השורה הזו היא כל ההבדל בין אישור
   אוטומטי לבין החלטה, ולכן היא יושבת ליד כפתור האישור. */
await signIn('mgr@ap.co.il', 'secret123');
await page.click('.tab[data-tab="constraints"]');
await page.waitForTimeout(700);
await page.evaluate(() => {
  const app = window.ShiftApp, Store = window.ShiftStore;
  const state = app.getState();
  const week = Store.getWeek(state, Store.currentWeekKey());
  state.employees.slice(0, 3).forEach((emp) => {
    Store.setConstraint(week, emp.id, 4, { off: true, status: 'pending' });
  });
  app.render();
});
await page.waitForTimeout(600);
const notes = await page.locator('#pending-constraints .c-same').count();
console.log('7. אזהרת חפיפה ליד כל בקשה:', notes, notes === 3 ? '✓' : '✗');
if (notes !== 3) errors.push('אזהרת החפיפה לא הופיעה ליד שלוש הבקשות');
/* סגורה כברירת מחדל: המספר קובע אם לעצור, השמות נחוצים למי שעצר */
console.log('   סגורה בהתחלה:', await page.locator('#pending-constraints .c-same-list').count() === 0);
await page.locator('#pending-constraints .c-same').first().click();
await page.waitForTimeout(400);
const who = await page.locator('#pending-constraints .c-same-list li').count();
console.log('   ואחרי לחיצה רואים מי:', who, who === 2 ? '✓' : '✗');
if (who !== 2) errors.push('רשימת השמות לא נפתחה');
/* הלחיצה על האזהרה אינה מאשרת ואינה דוחה דבר */
const stillPending = await page.locator('.pending-item').count();
console.log('   והבקשות עדיין ממתינות:', stillPending, stillPending >= 3 ? '✓' : '✗');
if (stillPending < 3) errors.push('הלחיצה על האזהרה שינתה את הבקשות');

console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
if (errors.length) process.exit(1);
