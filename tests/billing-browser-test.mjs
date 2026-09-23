/* מסלול המנוי: תקופת ניסיון, מגבלת עובדים, שדרוג תוכנית וחסימה.
   הרצה: npm run test:billing */
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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('dialog', async d => { await d.accept(); });

await skipWizard(page);

await page.goto(APP);
await page.waitForTimeout(400);
await page.click('[data-auth-mode="signup"]');
await page.waitForTimeout(200);
await page.fill('input[name="companyName"]', 'עסק לבדיקה');
await page.fill('input[name="email"]', 'boss@test.co.il');
await page.fill('input[name="password"]', 'secret123');
await page.click('#signup-form button[type="submit"]');
await page.waitForTimeout(1300);

console.log('1. לשונית מנוי גלויה לבעלים:', await page.locator('.tab[data-tab="billing"]').isVisible());
await page.click('.tab[data-tab="billing"]');
await page.waitForTimeout(500);

/* ברירת המחדל היא פיילוט: אין ספק סליקה, ולכן אין מה ללחוץ.
   מסלול החיוב עצמו נבדק כאן על ספק "מחובר", בדיוק כפי שיהיה
   ברגע ש-PayPlus יחובר. */
/* גם בפיילוט יש מעבר תוכנית: התוכנית היא תקרה ומחיר, והמחיר
   נגבה בחיוב הבא – מסך שמציג מחירון בלי דרך לעבור משאיר לקוח
   תקוע בדיוק כשהוא רוצה לשלם יותר. */
console.log('   גם בפיילוט אפשר לעבור תוכנית:',
  (await page.locator('#billing-panel [data-plan]').count()) > 0);
await page.evaluate(() => {
  window.ShiftModel.setBillingLive(true);
  window.ShiftBillingUI.render();
});
await page.waitForTimeout(300);

const rows = (await page.locator('.billing-row').allInnerTexts()).map(t => t.replace(/\n/g, ': '));
rows.forEach(r => console.log('   ' + r));

const plans = await page.locator('.plan-card').evaluateAll(cards => cards.map(c => ({
  name: c.querySelector('.plan-name').textContent,
  price: c.querySelector('.plan-price').textContent.replace(/\s+/g, ''),
  range: c.querySelector('.plan-range').textContent,
  current: c.classList.contains('current')
})));
console.log('2. תוכניות:', plans.map(p => `${p.name} ${p.price} (${p.range})${p.current ? ' ← נוכחית' : ''}`).join(' | '));
await page.screenshot({ path: OUT + '/billing.png', fullPage: false });

// מגבלת עובדים: חשבון חדש נפתח ריק, ולכן טוענים את עסק הדוגמה
// (8 עובדים) ובודקים את המגבלה של התוכנית הקטנה – עד 10.
await page.click('.tab[data-tab="employees"]');
await page.waitForTimeout(400);
console.log('   חשבון חדש נפתח ריק:',
  (await page.locator('#employees-list .card').count()) === 0);
await loadSample(page);
await page.click('.tab[data-tab="employees"]');
await page.waitForTimeout(400);
const before = await page.locator('#employees-list .card').count();
console.log('3. עובדים כרגע:', before);
for (let i = 0; i < 2; i++) {
  await page.click('#add-employee');
  await page.waitForTimeout(400);
}
const after = await page.locator('#employees-list .card').count();
console.log('   מילוי עד התקרה:', after, '| זו התקרה של התוכנית הקטנה:', after === 10);

/* העובד ה-11: תקרה שמציעה מוצא, לא רק מודיעה שנחסמת */
await page.click('#add-employee');
await page.waitForTimeout(600);
console.log('4. ההצעה מופיעה:', await page.locator('.confirm-card').isVisible());
console.log('   ' + (await page.locator('.confirm-card').innerText()).replace(/\n/g, ' · '));
await page.click('.confirm-card [data-confirm-no]');
await page.waitForTimeout(400);
console.log('   ביטול אינו מוסיף ואינו משדרג:',
  (await page.locator('#employees-list .card').count()) === 10,
  await page.evaluate(() => window.__backend.session().company.plan));

await page.click('#add-employee');
await page.waitForTimeout(600);
await page.click('.confirm-card [data-confirm-yes]');
await page.waitForTimeout(1400);
console.log('5. אחרי אישור:',
  'עובדים', await page.locator('#employees-list .card').count(),
  '| תוכנית', await page.evaluate(() => window.__backend.session().company.plan));
console.log('   הודעה:', (await page.locator('#toast').innerText()).trim());

await page.click('.tab[data-tab="billing"]');
await page.waitForTimeout(600);
const nowRows = (await page.locator('.billing-row').allInnerTexts()).map(t => t.replace(/\n/g, ': '));
console.log('   ' + nowRows[1]);
console.log('   ' + nowRows[0]);
console.log('   שורת המשתמש:', (await page.locator('#user-bar').innerText()).replace(/\n/g, ' | '));

/* מעבר תוכנית מתוך מסך המנוי עובר דרך אותה שאלה בדיוק */
await page.click('.plan-card:not(.current) [data-plan="business"]');
await page.waitForTimeout(500);
console.log('6. גם מסך המנוי שואל לפני שינוי:',
  await page.locator('.confirm-card').isVisible());
await page.click('.confirm-card [data-confirm-yes]');
await page.waitForTimeout(900);
console.log('   אחרי שינוי:', (await page.locator('#billing-message').innerText()).trim(),
  '| תוכנית', await page.evaluate(() => window.__backend.session().company.plan));

// חסימה כשהמנוי פג
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('maiphone-mock-server-v1'));
  const id = Object.keys(raw.companies)[0];
  raw.companies[id].status = 'expired';
  raw.companies[id].validUntil = new Date(Date.now() - 86400000).toISOString();
  localStorage.setItem('maiphone-mock-server-v1', JSON.stringify(raw));
});
await page.reload();
await page.waitForTimeout(900);
console.log('7. מנוי שפג – האפליקציה חסומה:', await page.locator('#app-root').isHidden(),
  '| מסך חסימה:', (await page.locator('.auth-blocked h2').innerText()).trim());
console.log('   הסבר:', (await page.locator('.auth-blocked p').first().innerText()).trim());

console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
if (errors.length) process.exit(1);
