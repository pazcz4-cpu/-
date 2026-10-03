/* הסכמת עובד לעדכונים שוטפים: תיבה חובה בכניסה הראשונה, לפני שהוא
   רואה משהו. מנהל אינו נחסם. הרצה: node tests/updates-consent-browser-test.mjs */
import { createRequire } from 'node:module';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const APP = url('app.html');
const browser = await chromium.launch();
const errors = [];
const failures = [];

function check(name, condition, detail) {
  if (condition) { console.log('  ✓ ' + name); return; }
  failures.push(name + (detail ? ' — ' + detail : ''));
  console.log('  ✗ ' + name + (detail ? ' — ' + detail : ''));
}

const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'he-IL' });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await skipWizard(page);
await page.goto(APP);
await page.waitForTimeout(400);
await page.click('[data-auth-mode="signup"]');
await page.fill('input[name="companyName"]', 'קפה הסכמה');
await page.fill('input[name="email"]', 'mgr@consent.co.il');
await page.fill('input[name="password"]', 'secret123');
await page.fill('input[name="phone"]', '054-1234567');
await page.click('#signup-form button[type="submit"]');
await page.waitForTimeout(1300);

/* הדרישה כבויה כברירת מחדל במוק; כאן מדליקים אותה כמו בשרת האמיתי */
await page.evaluate(() => { window.__backend.db.requireUpdatesConsent = true; window.__backend._save(); });
await page.click('.tab[data-tab="users"]');
await page.waitForTimeout(400);
await page.fill('#invite-form input[name="email"]', 'worker@consent.co.il');
await page.click('#invite-form button[type="submit"]');
await page.waitForTimeout(700);

console.log('\n== מנהל אינו נחסם ==');
await page.reload();
await page.waitForTimeout(900);
check('המנהל נכנס ישר לאפליקציה', !(await page.locator('#auth-updates-check').count()));

console.log('\n== עובד בכניסה ראשונה ==');
const worker = await ctx.newPage();
worker.on('pageerror', e => errors.push('PAGE: ' + e.message));
worker.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await skipWizard(worker);
await worker.goto(APP);
await worker.waitForTimeout(500);
await worker.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
await worker.evaluate(() => window.__backend.followLink('worker@consent.co.il', 'invite'));
await worker.reload();
await worker.waitForTimeout(600);
await worker.fill('#password-form input[name="password"]', 'secret123');
await worker.fill('#password-form input[name="confirm"]', 'secret123');
await worker.click('#password-form button[type="submit"]');
await worker.waitForSelector('#auth-updates-check', { timeout: 10000 });

check('מוצג מסך ההסכמה', await worker.locator('#auth-updates-check').isVisible());
check('המסך של העובד עדיין חסום', !(await worker.locator('#employee-root').isVisible()));
check('התיבה לא מסומנת מראש', !(await worker.locator('#auth-updates-check').isChecked()));
const text = await worker.locator('.auth-consent').innerText();
check('הנוסח מזכיר מייל, אפליקציה ווואטסאפ', /מייל/.test(text) && /אפליקציה/.test(text) && /וואטסאפ|וואטסאפ/.test(text), text.slice(0, 160));
check('הנוסח אומר שזה לא שיווק', /שיווק/.test(text));

await worker.click('#auth-updates-continue');
await worker.waitForTimeout(300);
check('בלי סימון לא ממשיכים ומוצגת הודעה',
  (await worker.locator('#auth-updates-check').isVisible()) &&
  (await worker.locator('.auth-error').isVisible()));

await worker.check('#auth-updates-check');
await worker.click('#auth-updates-continue');
await worker.waitForSelector('#employee-root:not(.hidden)', { timeout: 10000 });
check('אחרי סימון העובד נכנס', await worker.locator('#employee-root').isVisible());

const saved = await worker.evaluate(() => {
  const users = window.__backend.db.users;
  const u = Object.values(users).find(x => x.email === 'worker@consent.co.il');
  return { at: u.updatesConsentAt, version: u.updatesConsentVersion, text: u.updatesConsentText };
});
check('נשמרו תאריך, גרסה והנוסח כפי שהוצג',
  !!saved.at && saved.version === 'updates-1' && /מייל/.test(saved.text || ''), JSON.stringify(saved));

await worker.reload();
await worker.waitForTimeout(900);
check('בכניסה הבאה לא נשאל שוב',
  !(await worker.locator('#auth-updates-check').count()) && await worker.locator('#employee-root').isVisible());

await browser.close();
if (errors.length) { console.log('\nשגיאות דפדפן:\n' + errors.join('\n')); }
if (failures.length || errors.length) { console.log('\n❌ נכשלו: ' + failures.length); process.exit(1); }
console.log('\n✅ הכל עבר');
