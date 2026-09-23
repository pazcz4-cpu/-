/* סיבה אופציונלית לבקשת אילוץ, ותשתית ההתראות.
   הרצה: npm run test:reason */
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
await page.fill('input[name="email"]', 'mgr@r.co.il');
await page.fill('input[name="password"]', 'secret123');
await page.click('#signup-form button[type="submit"]');
await page.waitForTimeout(1400);
await loadSample(page);

await page.click('.tab[data-tab="users"]');
await page.waitForTimeout(600);
const opts = await page.locator('#invite-form select[name="employeeId"] option')
  .evaluateAll(o => o.map(x => x.value).filter(Boolean));
await page.fill('#invite-form input[name="email"]', 'ronit@r.co.il');
await page.selectOption('#invite-form select[name="employeeId"]', opts[0]);
await page.click('#invite-form button[type="submit"]');
await page.waitForTimeout(900);

/* המנהל אינו קובע סיסמה לעובדת; היא מקבלת קישור במייל וקובעת
   אותה בעצמה. כאן אין מייל, ולכן מדמים את הלחיצה על הקישור. */
await page.evaluate(async () => {
  window.__backend.followLink('ronit@r.co.il', 'invite');
  await window.__backend.setPassword('secret123');
});
await page.waitForTimeout(600);

// --- העובדת מבקשת ומוסיפה סיבה ---
await signIn('ronit@r.co.il', 'secret123');
console.log('1. לפני בקשה – שדה סיבה מוצג:', await page.locator('[data-note-day]').count() > 0);

const card = page.locator('.employee-days .m-card').nth(2);
await card.locator('.cstate').last().click();
await page.waitForTimeout(1000);
const noteInput = page.locator('.employee-days .m-card').nth(2).locator('[data-note-day]');
console.log('2. אחרי בקשה – שדה סיבה הופיע:', await noteInput.count() === 1);
console.log('   תווית:', (await page.locator('.req-reason label').first().innerText()).split('\n')[0]);

await noteInput.fill('חתונה של אחותי');
await noteInput.dispatchEvent('change');
await page.waitForTimeout(1000);
console.log('3. הודעה:', (await page.locator('.employee-flash').innerText()).trim());

// הסטטוס לא השתנה בגלל עריכת הסיבה בלבד
console.log('   הסטטוס נשאר:', (await page.locator('.req-badge').first().innerText()).trim());

// --- המנהל רואה את הסיבה ---
await signIn('mgr@r.co.il', 'secret123');
await page.click('.tab[data-tab="constraints"]');
await page.waitForTimeout(700);
console.log('4. בפאנל האישורים:', (await page.locator('.pending-info').first().innerText()).replace(/\n/g, ' · '));
console.log('   בתא שבלוח:', (await page.locator('.c-status.pending').first().innerText()).trim());
await page.screenshot({ path: OUT + '/reason.png' });

// --- אישור והסיבה נשמרת ---
await page.click('.pending-item .approve');
await page.waitForTimeout(1000);
console.log('5. אחרי אישור – הסיבה עדיין מוצגת:',
  (await page.locator('.c-status.approved').first().innerText()).trim());

// --- תשתית ההתראות ---
const notify = await page.evaluate(() => ({
  supported: window.ShiftNotify.supported(),
  permission: window.ShiftNotify.permission(),
  enabled: window.ShiftNotify.enabled(),
  hasButton: !!document.querySelector('#user-notify')
}));
console.log('6. התראות:', JSON.stringify(notify));

// ההודעות שיישלחו בכל אירוע
const messages = await page.evaluate(() => {
  const S = window.ShiftStore;
  const before = { constraints: {}, published: false };
  const afterPending = { constraints: { 'emp-1|2': { off: true, status: 'pending' } }, published: false };
  const afterApproved = { constraints: { 'emp-1|2': { off: true, status: 'approved' } }, published: false };
  const afterPublished = { constraints: {}, published: true };
  const fn = window.ShiftSaas.notificationsFor;
  return {
    managerNewRequest: fn('manager', null, before, afterPending),
    employeeApproved: fn('employee', 'emp-1', afterPending, afterApproved),
    employeePublished: fn('employee', 'emp-1', before, afterPublished)
  };
});
{
  console.log('   מנהל – בקשה חדשה:', messages.managerNewRequest.map(m => m.title + ': ' + m.body).join(''));
  console.log('   עובד – אושר:', messages.employeeApproved.map(m => m.title).join(''));
  console.log('   עובד – פורסם:', messages.employeePublished.map(m => m.title).join(''));
}

console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
if (errors.length) process.exit(1);
