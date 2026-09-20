/* מסלול המנוי: תקופת ניסיון, מגבלת עובדים, שדרוג תוכנית וחסימה.
   הרצה: npm run test:billing */
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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('dialog', async d => { await d.accept(); });

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

// מגבלת עובדים: ברירת המחדל 8 עובדים בתוכנית עד 10 => אפשר להוסיף 2
await page.click('.tab[data-tab="employees"]');
await page.waitForTimeout(400);
const before = await page.locator('#employees-list .card').count();
console.log('3. עובדים כרגע:', before);
for (let i = 0; i < 3; i++) {
  await page.click('#add-employee');
  await page.waitForTimeout(400);
}
const after = await page.locator('#employees-list .card').count();
console.log('   אחרי 3 ניסיונות הוספה:', after, '| נעצר על המגבלה:', after === 10);
console.log('   הודעה:', (await page.locator('#toast').innerText()).trim());

// שדרוג לתוכנית בינוני
await page.click('.tab[data-tab="billing"]');
await page.waitForTimeout(500);
await page.click('.plan-card:not(.current) [data-plan="growth"]');
await page.waitForTimeout(900);
console.log('4. אחרי שדרוג:', (await page.locator('#billing-message').innerText()).trim());
const nowRows = (await page.locator('.billing-row').allInnerTexts()).map(t => t.replace(/\n/g, ': '));
console.log('   ' + nowRows[1]);
console.log('   ' + nowRows[0]);
console.log('   שורת המשתמש:', (await page.locator('#user-bar').innerText()).replace(/\n/g, ' | '));

// עכשיו אפשר להוסיף עוד עובדים
await page.click('.tab[data-tab="employees"]');
await page.waitForTimeout(400);
await page.click('#add-employee');
await page.waitForTimeout(500);
console.log('5. אחרי השדרוג אפשר להוסיף:', (await page.locator('#employees-list .card').count()) === 11);

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
console.log('6. מנוי שפג – האפליקציה חסומה:', await page.locator('#app-root').isHidden(),
  '| מסך חסימה:', (await page.locator('.auth-blocked h2').innerText()).trim());
console.log('   הסבר:', (await page.locator('.auth-blocked p').first().innerText()).trim());

console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
if (errors.length) process.exit(1);
