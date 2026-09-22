/* מחוון השמירה: המסך מדווח לאן הנתונים באמת הלכו ומתי.
   הרצה: node tests/save-state-browser-test.mjs

   הבדיקה נכתבה אחרי סתירה אמיתית שלקוח ראה: מסך הסידור הבטיח
   "נשמר במכשיר הזה" בזמן שמסך ההגדרות הבטיח ענן. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clickTool, openMenuFor } from './_menu.mjs';
import { skipWizard } from './_wizard.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const LOCAL = 'file://' + path.join(here, '..', 'index.html');
const APP = 'file://' + path.join(here, '..', 'app.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();

async function newPage(options) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('dialog', async (d) => { await d.accept(); });
  /* השרת המדומה יושב בדפדפן. כדי לבדוק גם את הנוסח של החיבור
     האמיתי, מסמנים אותו כענן לפני שהאפליקציה עולה. */
  if (options && options.cloud) {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'ShiftMockBackend', {
        configurable: true,
        set(value) {
          value.MockBackend.prototype.isCloud = true;
          Object.defineProperty(window, 'ShiftMockBackend',
            { value, writable: true, configurable: true });
        },
        get() { return undefined; }
      });
    });
  }
  return page;
}

async function signUp(page, email) {
  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'בדיקת שמירה');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1200);
}

const stateOf = (page) => page.evaluate(() => {
  const node = document.getElementById('sync-state');
  return { text: node.textContent, cls: node.className, title: node.title };
});

try {
  console.log('\n== הכלי המקומי: המכשיר הזה, וזו האמת ==');
  const local = await newPage();
  await local.goto(LOCAL);
  await local.waitForTimeout(500);
  check('לפני שינוי – נשמר במכשיר הזה', (await stateOf(local)).text, /נשמר במכשיר הזה/);
  await local.click('#generate');
  await local.waitForTimeout(1200);
  const afterLocal = await stateOf(local);
  check('אחרי שינוי – עם שעת השמירה', afterLocal.text, /נשמר במכשיר הזה · \d+:\d+/);
  check('ואין הבטחת ענן', afterLocal.text.includes('ענן'), false);
  check('הסימון מסמן מכשיר', afterLocal.cls, /local/);

  console.log('\n== מצב הדגמה: יש שרת, אין ענן ==');
  const demo = await newPage();
  await signUp(demo, 'demo@example.com');
  await demo.click('#generate');
  await demo.waitForTimeout(1500);
  const demoState = await stateOf(demo);
  check('שרת מדומה אינו מבטיח ענן', demoState.text.includes('ענן'), false);
  check('הסימון מסמן מכשיר', demoState.cls, /local/);

  console.log('\n== חיבור אמיתי: נשמר בענן ==');
  const cloud = await newPage({ cloud: true });
  await signUp(cloud, 'cloud@example.com');
  await cloud.click('#generate');
  await cloud.waitForTimeout(1500);
  const cloudState = await stateOf(cloud);
  check('נשמר בענן עם שעה', cloudState.text, /נשמרו בענן · \d+:\d+/);
  check('הסימון מסמן ענן', cloudState.cls, /live/);

  console.log('\n== בזמן השמירה ==');
  await cloud.evaluate(() => {
    const backend = window.__backend;
    const original = backend.saveWeek.bind(backend);
    backend.saveWeek = function (key, week) {
      return new Promise((resolve) => setTimeout(() => resolve(original(key, week)), 1500));
    };
  });
  await clickTool(cloud, '#clear-week');
  await cloud.waitForTimeout(400);
  const saving = await stateOf(cloud);
  check('מוצג "שומר"', saving.text, /שומר/);
  check('והסימון בהתאם', saving.cls, /saving/);
  await cloud.waitForTimeout(1800);
  check('ובסוף חוזר לנשמר', (await stateOf(cloud)).text, /נשמרו בענן/);

  console.log('\n== כשהשמירה נכשלת ==');
  await cloud.evaluate(() => {
    const backend = window.__backend;
    backend._savedWeek = backend.saveWeek.bind(backend);
    backend.saveWeek = function () { return Promise.reject(new Error('offline')); };
  });
  await cloud.click('#generate');
  await cloud.waitForTimeout(1500);
  const broken = await stateOf(cloud);
  check('נאמר שלא ניתן לשמור', broken.text, /לא ניתן לשמור/);
  check('והסימון מסמן תקלה', broken.cls, /error/);
  check('וההסבר מכוון לחיבור', broken.title, /חיבור/);

  await cloud.evaluate(() => { window.__backend.saveWeek = window.__backend._savedWeek; });
  await clickTool(cloud, '#clear-week');
  await cloud.waitForTimeout(2600);   /* השמירה המושהית מקודם עדיין בתוקף */
  check('שמירה מוצלחת מנקה את התקלה', (await stateOf(cloud)).text, /נשמרו בענן/);
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות מחוון השמירה עברו');
