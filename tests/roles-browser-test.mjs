import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'dist');
const APP = 'file://' + path.join(here, '..', 'app.html');
const browser = await chromium.launch();
const errors = [];

async function mk(ctx) {
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async d => { await d.accept(); });
  return page;
}

// המנהל נרשם
const mgrCtx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
const mgr = await mk(mgrCtx);
await mgr.goto(APP);
await mgr.waitForTimeout(400);
await mgr.click('[data-auth-mode="signup"]');
await mgr.waitForTimeout(200);
await mgr.fill('input[name="companyName"]', 'מייפון');
await mgr.fill('input[name="email"]', 'mgr@x.co.il');
await mgr.fill('input[name="password"]', 'secret123');
await mgr.click('#signup-form button[type="submit"]');
await mgr.waitForTimeout(1300);

// לשונית משתמשים מופיעה למנהל
console.log('1. לשונית משתמשים גלויה למנהל:', await mgr.locator('.tab[data-tab="users"]').isVisible());
await mgr.click('.tab[data-tab="users"]');
await mgr.waitForTimeout(500);

// מזמין עובד ומקשר לכרטיס עובד
const empOptions = await mgr.locator('#invite-form select[name="employeeId"] option').evaluateAll(o => o.map(x => ({v:x.value,t:x.textContent})));
console.log('   כרטיסי עובד בבורר:', empOptions.length - 1);
await mgr.fill('#invite-form input[name="name"]', 'דני');
await mgr.fill('#invite-form input[name="email"]', 'dani@x.co.il');
await mgr.fill('#invite-form input[name="password"]', 'secret123');
await mgr.selectOption('#invite-form select[name="employeeId"]', empOptions[1].v);
await mgr.click('#invite-form button[type="submit"]');
await mgr.waitForTimeout(800);
console.log('2. הודעה:', (await mgr.locator('#users-message').innerText()).trim());
console.log('   שורות בטבלת המשתמשים:', await mgr.locator('#users-list tbody tr').count());

// המנהל בונה ומפרסם סידור
await mgr.click('.tab[data-tab="schedule"]');
await mgr.waitForTimeout(400);
await mgr.click('#generate');
await mgr.waitForTimeout(1600);
const weekKey = await mgr.evaluate(() => window.ShiftApp.weekKey());
await mgr.evaluate(async (wk) => { await window.__backend.publishWeek(wk, true); }, weekKey).catch(async () => {
  await mgr.evaluate(async (wk) => { await backend.publishWeek(wk, true); }, weekKey);
});
console.log('3. הסידור פורסם לשבוע', weekKey);

// העובד נכנס בדפדפן נפרד — אותו localStorage לא משותף, לכן נשתמש באותו context
const emp = await mk(mgrCtx);
await emp.goto(APP);
await emp.waitForTimeout(500);
// יציאה והתחברות כעובד
await emp.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
await emp.reload();
await emp.waitForTimeout(500);
await emp.fill('input[name="email"]', 'dani@x.co.il');
await emp.fill('input[name="password"]', 'secret123');
await emp.click('#signin-form button[type="submit"]');
await emp.waitForTimeout(1400);

console.log('4. מסך העובד מוצג:', await emp.locator('#employee-root').isVisible(),
  '| מערכת הניהול מוסתרת:', await emp.locator('#manager-root').isHidden());
console.log('   שורת משתמש:', (await emp.locator('#user-bar').innerText()).replace(/\n/g,' | '));
const myShifts = await emp.locator('.employee-shift').count();
console.log('5. המשמרות שלי:', myShifts);
await emp.screenshot({ path: OUT + '/employee-screen.png', fullPage: false });

console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
if (errors.length) process.exit(1);
