/* התא התקין שקט, והחריגה היא מה שצבוע.
   הרצה: npm run test:cells */
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

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async d => { await d.accept(); });

  await skipWizard(page);

  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@cells.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1300);
  await loadSample(page);
  await page.click('.view-switch .chip[data-view="branch"]');
  await page.waitForTimeout(500);
  await page.click('#generate');
  await page.waitForTimeout(1700);

  const bg = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? getComputedStyle(el).backgroundColor : null;
  }, sel);
  const surface = await page.evaluate(
    () => getComputedStyle(document.documentElement).getPropertyValue('--surface').trim());

  console.log('\n== התא התקין לבן ==');
  const plain = await page.locator('#schedule-branch td.cell:not(.has-error):not(.has-warning)').first();
  check('יש תאים תקינים',
    await page.locator('#schedule-branch td.cell:not(.has-error):not(.has-warning)').count() > 10, true);
  const plainBg = await plain.evaluate(el => getComputedStyle(el).backgroundColor);
  check('הרקע שלו הוא צבע המשטח ולא צבע המשמרת',
    plainBg, await page.evaluate((hex) => {
      const probe = document.createElement('div');
      probe.style.backgroundColor = hex;
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    }, surface));

  console.log('\n== אבל סוג המשמרת עדיין נקרא ==');
  check('מהפס שבקצה התא', await plain.evaluate(el => {
    const shadow = getComputedStyle(el).boxShadow;
    return shadow && shadow !== 'none';
  }), true);
  check('ומכותרת השורה, שנשארה בצבע מלא', await page.evaluate(() => {
    const head = document.querySelector('#schedule-branch td.row-head.sh');
    if (!head) return 'אין כותרת';
    const bg = getComputedStyle(head).backgroundColor;
    const surface = getComputedStyle(document.querySelector('.table-wrap')).backgroundColor;
    return bg !== surface ? 'צבועה' : 'לבנה';
  }), 'צבועה');
  check('ושלוש המשמרות אינן באותו צבע', await page.evaluate(() => {
    const heads = Array.from(document.querySelectorAll('#schedule-branch td.row-head.sh'))
      .slice(0, 3).map(el => getComputedStyle(el).backgroundColor);
    return new Set(heads).size;
  }), 3);

  console.log('\n== החריגה היא מה שצבוע ==');
  /* מייצרים חוסר איוש ודאי: מרוקנים משבצת מאוישת */
  await page.evaluate(() => {
    const select = document.querySelector('#schedule-branch td.cell select.emp-select:not(.extra)');
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  const flagged = page.locator('#schedule-branch td.cell.has-error, #schedule-branch td.cell.has-warning');
  check('נוצר תא חורג', await flagged.count() > 0, true);
  const flaggedBg = await flagged.first().evaluate(el => getComputedStyle(el).backgroundColor);
  check('והוא נצבע', flaggedBg !== plainBg, true);
  check('ויש לו גם מסגרת', await flagged.first().evaluate(
    el => getComputedStyle(el).outlineStyle !== 'none'), true);
  check('והפס של סוג המשמרת נשאר גם בו', await flagged.first().evaluate(el => {
    const shadow = getComputedStyle(el).boxShadow;
    return shadow && shadow !== 'none';
  }), true);

  console.log('\n== היחס: מעט צבע, ולכן הוא נראה ==');
  const ratio = await page.evaluate(() => {
    const cells = document.querySelectorAll('#schedule-branch td.cell');
    const loud = document.querySelectorAll('#schedule-branch td.cell.has-error, #schedule-branch td.cell.has-warning');
    return Math.round((loud.length / cells.length) * 100);
  });
  /* פעם כל תא מאויש היה צבוע, כלומר כמעט 100%. עכשיו רק החריגות. */
  check('אחוז התאים הצבועים בסידור תקין-כמעט', ratio < 25, true);
  console.log('     (' + ratio + '% מהתאים)');

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות התאים עברו');
