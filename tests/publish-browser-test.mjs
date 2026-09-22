/* טיוטה ופרסום: עד שהמנהל מפרסם, העובד אינו רואה סידור.
   הרצה: node tests/publish-browser-test.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = 'file://' + path.join(here, '..', 'app.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', async (d) => { await d.accept(); });
  return page;
}

const stateOf = (page) => page.evaluate(() => ({
  label: document.getElementById('publish-state').textContent,
  cls: document.getElementById('publish-state').className,
  button: document.getElementById('publish-week').textContent,
  disabled: document.getElementById('publish-week').disabled,
  revertHidden: document.getElementById('unpublish-week').classList.contains('hidden')
}));

try {
  const page = await newPage();
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'בדיקת פרסום');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@publish.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1200);

  console.log('\n== הזהות במסך ==');
  check('הכותרת היא שם המוצר', await page.locator('.brand h1').textContent(), 'SetShifts');
  check('הסמל מצויר ואינו אימוג\'י', await page.evaluate(() => {
    const mark = document.querySelector('.brand svg.logo');
    return !!mark && mark.getBoundingClientRect().width > 20;
  }), true);
  check('אין אייקון כפול באף כפתור', await page.evaluate(() => {
    const doubled = /([\u2190-\u2BFF\u2600-\u27BF])\s*\1/;
    return Array.from(document.querySelectorAll('button'))
      .filter((node) => doubled.test(node.textContent))
      .map((node) => node.textContent.trim()).join(' | ');
  }), '');

  console.log('\n== סידור חדש הוא טיוטה ==');
  await page.click('#generate');
  await page.waitForTimeout(1600);
  const draft = await stateOf(page);
  check('הסטטוס אומר טיוטה', draft.label, /טיוטה/);
  check('ומסביר שהעובדים אינם רואים', draft.label, /אינם רואים/);
  check('הכפתור מציע לפרסם', draft.button, 'פרסום הסידור');
  check('והוא פעיל', draft.disabled, false);
  check('אין החזרה לטיוטה במצב טיוטה', draft.revertHidden, true);

  console.log('\n== פרסום ==');
  await page.click('#publish-week');
  await page.waitForTimeout(900);
  const published = await stateOf(page);
  check('הסטטוס מציג תאריך ושעה', published.label, /פורסם ב־\d+\/\d+ בשעה \d+:\d+/);
  check('הסימון ירוק', published.cls, /published/);
  check('הכפתור כבר לא מזמין ללחוץ', published.disabled, true);
  check('והחזרה לטיוטה זמינה', published.revertHidden, false);
  check('העובד היה מקבל התראה', await page.evaluate(
    () => window.__backend.loadWeek(window.ShiftApp.weekKey()).then((w) => !!w.published)), true);

  console.log('\n== שינוי אחרי פרסום ==');
  await page.evaluate(() => {
    const select = Array.from(document.querySelectorAll('#schedule-branch select.emp-select'))
      .find((node) => node.value);
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(900);
  const changed = await stateOf(page);
  check('הסטטוס אומר "שונה מאז הפרסום"', changed.label, /שונה מאז הפרסום ב־\d+\/\d+/);
  check('הסימון מתריע', changed.cls, /changed/);
  check('הכפתור מציע לפרסם את העדכונים', changed.button, 'פרסום העדכונים');
  check('והוא פעיל שוב', changed.disabled, false);

  await page.click('#publish-week');
  await page.waitForTimeout(900);
  check('פרסום העדכונים מחזיר למצב "פורסם"', (await stateOf(page)).cls, /published/);

  console.log('\n== שינוי שאינו נראה לעובד אינו "שינוי" ==');
  await page.evaluate(() => {
    const week = window.ShiftApp.getState().weeks[window.ShiftApp.weekKey()];
    week.manual['0|x|morning'] = true;
    window.ShiftApp.render();
  });
  await page.waitForTimeout(300);
  check('סימון שיבוץ ידני אינו מסמן "שונה"', (await stateOf(page)).cls, /published/);

  console.log('\n== החזרה לטיוטה ==');
  await page.click('#unpublish-week');
  await page.waitForTimeout(900);
  const back = await stateOf(page);
  check('חוזר לטיוטה', back.label, /טיוטה/);
  check('והשרת יודע', await page.evaluate(
    () => window.__backend.loadWeek(window.ShiftApp.weekKey()).then((w) => !!w.published)), false);

  console.log('\n== מצב צפייה חוסם פרסום ==');
  await page.click('#view-only-toggle');
  await page.waitForTimeout(400);
  check('הכפתור נעול', (await stateOf(page)).disabled, true);
  await page.click('#view-only-toggle');
  await page.waitForTimeout(300);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות הפרסום עברו');
