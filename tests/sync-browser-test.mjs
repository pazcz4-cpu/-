/* בדיקת הסנכרון בין מחשבים, מול שרת ענן מדומה שמחקה את ממשק האחסון.
   הרצה: npm run test:sync  (דורש playwright מותקן) */
import { createRequire } from 'node:module';

/* playwright עשוי להיות מותקן גלובלית ולא בפרויקט */
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (err) {
  ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs'));
}
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = 'file://' + path.join(here, '..', 'dist', 'sidur-mishmarot.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// שרת ענן מדומה, כדי לבדוק את לוגיקת הסנכרון בלי שירות אמיתי
await page.addInitScript(() => {
  const docs = {};
  const listeners = {};
  window.__writes = [];
  window.__docs = docs;
  const notify = (path) => (listeners[path] || []).forEach(fn =>
    fn({ exists: path in docs, data: () => docs[path], metadata: {} }));
  window.__remoteWrite = (path, data) => { docs[path] = data; notify(path); };
  const db = {
    doc(path) {
      return {
        path,
        get: () => Promise.resolve({ exists: path in docs, data: () => docs[path] }),
        set: (data) => { docs[path] = data; window.__writes.push(path); notify(path); return Promise.resolve(); },
        onSnapshot(next) {
          (listeners[path] = listeners[path] || []).push(next);
          setTimeout(() => next({ exists: path in docs, data: () => docs[path], metadata: {} }), 10);
          return () => {};
        }
      };
    }
  };
  window.claude = { use: (name) => Promise.resolve(name === 'db' ? db : null) };
});

await page.goto(appPath);
await page.waitForTimeout(800);
console.log('1. indicator:', (await page.locator('#sync-state').textContent()).trim());

// שמירה לענן אחרי בניית סידור
await page.click('#generate');
await page.waitForTimeout(1800);
const writes = await page.evaluate(() => window.__writes.slice());
console.log('2. cloud writes after generate:', JSON.stringify([...new Set(writes)]));
console.log('   indicator now:', (await page.locator('#sync-state').textContent()).trim());

// המחשב השני משנה את שם הסניף
await page.evaluate(() => {
  const cfg = JSON.parse(JSON.stringify(window.__docs['config/main']));
  cfg.branches[0].name = 'מייפון רמת גן';
  cfg.updatedAt = Date.now();
  window.__remoteWrite('config/main', cfg);
});
await page.waitForTimeout(900);
const html = await page.locator('#schedule-branch').innerText();
console.log('3. branch rename from other computer applied:', html.includes('מייפון רמת גן'));
console.log('   toast:', (await page.locator('#toast').textContent()).trim());

// המחשב השני משנה שיבוץ בשבוע
const weekPath = (await page.evaluate(() => Object.keys(window.__docs).find(k => k.startsWith('weeks/'))));
await page.evaluate((path) => {
  const wk = JSON.parse(JSON.stringify(window.__docs[path]));
  wk.assignments = {};
  wk.note = 'נוקה מהמחשב השני';
  wk.updatedAt = Date.now();
  window.__remoteWrite(path, wk);
}, weekPath);
await page.waitForTimeout(900);
const filled = await page.locator('#schedule-branch select.emp-select').evaluateAll(e => e.filter(x => x.value).length);
console.log('4. week cleared from other computer -> filled selects now:', filled);

// עריכה מקומית נשמרת חזרה לענן
await page.evaluate(() => { window.__writes.length = 0; });
const sel = page.locator('#schedule-branch select.emp-select').first();
const opts = await sel.locator('option').evaluateAll(o => o.map(x => x.value).filter(Boolean));
await sel.selectOption(opts[0]);
await page.waitForTimeout(1500);
console.log('5. local edit written back to cloud:', (await page.evaluate(() => window.__writes.slice())).length > 0);
console.log('   indicator:', (await page.locator('#sync-state').textContent()).trim());

console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
if (errors.length) process.exit(1);
