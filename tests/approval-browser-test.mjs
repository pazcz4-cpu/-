/* מסלול אישור אילוצים: עובד מבקש, מנהל מאשר, והשיבוץ מתחשב רק במה שאושר.
   הערה: השרת המדומה שומר הכל ב-localStorage של אותו דפדפן, ולכן הבדיקה
   מחליפה משתמשים בזה אחר זה. בשרת אמיתי שניהם עובדים במקביל.
   הרצה: npm run test:approval */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = 'file://' + path.join(here, '..', 'app.html');
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

await page.goto(APP);
await page.waitForTimeout(400);
await page.click('[data-auth-mode="signup"]');
await page.waitForTimeout(200);
await page.fill('input[name="companyName"]', 'עסק');
await page.fill('input[name="email"]', 'mgr@ap.co.il');
await page.fill('input[name="password"]', 'secret123');
await page.click('#signup-form button[type="submit"]');
await page.waitForTimeout(1400);

await page.click('.tab[data-tab="users"]');
await page.waitForTimeout(600);
const opts = await page.locator('#invite-form select[name="employeeId"] option')
  .evaluateAll(o => o.map(x => ({ v: x.value, t: x.textContent })).filter(x => x.v));
await page.fill('#invite-form input[name="name"]', 'רונית');
await page.fill('#invite-form input[name="email"]', 'ronit@ap.co.il');
await page.fill('#invite-form input[name="password"]', 'secret123');
await page.selectOption('#invite-form select[name="employeeId"]', opts[0].v);
await page.click('#invite-form button[type="submit"]');
await page.waitForTimeout(900);
console.log('1. העובדת הוזמנה וקושרה לכרטיס', opts[0].t);

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
const after = (await page.locator('#issues .issue').allTextContents()).filter(t => t.includes('ממתינ'));
console.log('   האזהרה נעלמה:', after.length === 0);

// --- העובדת רואה שאושר ---
await signIn('ronit@ap.co.il', 'secret123');
console.log('6. אצל העובדת:', (await page.locator('.req-badge').first().innerText()).trim());

console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
if (errors.length) process.exit(1);
