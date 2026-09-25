import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'dist');
const APP = url('app.html');
const browser = await chromium.launch();

async function newSession() {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', async d => { await d.accept(); });
  return { ctx, page, errors };
}

// --- חברה א נרשמת ---
const a = await newSession();
await skipWizard(a.page);
await a.page.goto(APP);
await a.page.waitForTimeout(400);
console.log('1. שער התחברות מוצג:', await a.page.locator('#auth-gate').isVisible(),
  '| האפליקציה מוסתרת:', await a.page.locator('#app-root').isHidden());

await a.page.click('[data-auth-mode="signup"]');
await a.page.waitForTimeout(200);
await a.page.fill('input[name="companyName"]', 'מייפון בע״מ');
await a.page.fill('input[name="name"]', 'פז');
await a.page.fill('input[name="email"]', 'boss@maiphone.co.il');
await a.page.fill('input[name="password"]', 'secret123');
/* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
   עם הלקוח כשמשהו בחשבון דורש טיפול. */
await a.page.fill('input[name="phone"]', '054-1234567');
await a.page.click('#signup-form button[type="submit"]');
await a.page.waitForTimeout(1200);
console.log('2. אחרי הרשמה – האפליקציה גלויה:', await a.page.locator('#app-root').isVisible());
console.log('   שורת משתמש:', (await a.page.locator('#user-bar').innerText()).replace(/\n/g,' | '));

await a.page.click('#generate');
await a.page.waitForTimeout(1600);
const filled = await a.page.locator('#schedule-branch select.emp-select').evaluateAll(e => e.filter(x=>x.value).length);
console.log('3. סידור נבנה ונשמר לשרת:', filled, 'שיבוצים');
await a.page.screenshot({ path: OUT + '/saas-app.png' });

// רענון – הסשן והנתונים נשמרים
await a.page.reload();
await a.page.waitForTimeout(1500);
const afterReload = await a.page.locator('#schedule-branch select.emp-select').evaluateAll(e => e.filter(x=>x.value).length);
console.log('4. אחרי רענון – עדיין מחובר:', await a.page.locator('#app-root').isVisible(),
  '| שיבוצים נשמרו:', afterReload === filled, `(${afterReload})`);

// --- חברה ב בדפדפן נפרד ---
const b = await newSession();
await skipWizard(b.page);
await b.page.goto(APP);
await b.page.waitForTimeout(400);
await b.page.click('[data-auth-mode="signup"]');
await b.page.waitForTimeout(200);
await b.page.fill('input[name="companyName"]', 'חברה אחרת');
await b.page.fill('input[name="email"]', 'other@other.co.il');
await b.page.fill('input[name="password"]', 'secret123');
/* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
   עם הלקוח כשמשהו בחשבון דורש טיפול. */
await b.page.fill('input[name="phone"]', '054-1234567');
await b.page.click('#signup-form button[type="submit"]');
await b.page.waitForTimeout(1200);
const bFilled = await b.page.locator('#schedule-branch select.emp-select').evaluateAll(e => e.filter(x=>x.value).length);
console.log('5. חברה ב רואה סידור ריק:', bFilled === 0, `(${bFilled} שיבוצים)`);
console.log('   מי מחובר אצלה:', (await b.page.locator('.user-name').innerText()));

// --- התחברות שגויה ---
await b.page.click('#user-signout');
await b.page.waitForTimeout(1000);
await b.page.fill('input[name="email"]', 'other@other.co.il');
await b.page.fill('input[name="password"]', 'wrong');
await b.page.click('#signin-form button[type="submit"]');
await b.page.waitForTimeout(700);
console.log('6. סיסמה שגויה:', (await b.page.locator('.auth-error').innerText()));

// --- התחברות נכונה ---
await b.page.fill('input[name="password"]', 'secret123');
await b.page.click('#signin-form button[type="submit"]');
await b.page.waitForTimeout(1200);
console.log('7. התחברות מחדש הצליחה:', await b.page.locator('#app-root').isVisible());

console.log('errors A:', a.errors.length ? a.errors.join(' | ') : 'none');
console.log('errors B:', b.errors.length ? b.errors.join(' | ') : 'none');
await browser.close();
if (a.errors.length || b.errors.length) process.exit(1);
