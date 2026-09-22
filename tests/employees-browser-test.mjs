/* רשימת עובדים ארוכה: כרטיסים מקופלים, חיפוש, סינון ופעולות מרובות.
   הרצה: node tests/employees-browser-test.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const LOCAL = 'file://' + path.join(here, '..', 'index.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', async (d) => { await d.accept(); });

const visibleBodies = () => page.evaluate(() =>
  Array.from(document.querySelectorAll('#employees-list .card-body'))
    .filter((node) => node.offsetParent !== null).length);

try {
  await page.goto(LOCAL);
  await page.waitForTimeout(500);
  await page.click('.tab[data-tab="employees"]');
  await page.waitForTimeout(300);

  console.log('\n== כרטיסים מקופלים כברירת מחדל ==');
  const total = await page.locator('#employees-list .card').count();
  check('יש כרטיסים', total > 5, true);
  check('כולם מקופלים', await visibleBodies(), 0);
  check('הסיכום מוצג במקום', await page.locator('.card-summary').first().textContent(),
    /סניף|כל הסניפים/);
  check('והוא כולל מכסה',
    await page.locator('.card-summary').first().textContent(), /מכסה \d+/);
  check('המספר מוצג', (await page.locator('#emp-count').innerText()).trim(), /\d+ עובדים/);

  console.log('\n== פתיחה וסגירה ==');
  await page.locator('#employees-list .card-toggle').first().click();
  await page.waitForTimeout(250);
  check('כרטיס אחד נפתח', await visibleBodies(), 1);
  await page.locator('#employees-list .card-toggle').first().click();
  await page.waitForTimeout(250);
  check('ונסגר', await visibleBodies(), 0);
  await page.locator('.card-summary').first().click();
  await page.waitForTimeout(250);
  check('גם לחיצה על הסיכום פותחת', await visibleBodies(), 1);

  console.log('\n== פתיחת הכל וסגירת הכל ==');
  await page.click('#emp-expand-all');
  await page.waitForTimeout(300);
  check('כולם נפתחו', await visibleBodies(), total);
  check('הכפתור הפך לסגירה',
    (await page.locator('#emp-expand-all').innerText()).trim(), 'סגירת הכל');
  await page.click('#emp-expand-all');
  await page.waitForTimeout(300);
  check('כולם נסגרו', await visibleBodies(), 0);

  console.log('\n== חיפוש ==');
  const firstName = await page.locator('#employees-list .card .name').first().inputValue();
  await page.fill('#emp-search', firstName);
  await page.waitForTimeout(300);
  check('רק ההתאמה מוצגת', await page.locator('#employees-list .card').count(), 1);
  check('המספר מעודכן', (await page.locator('#emp-count').innerText()).trim(),
    new RegExp('מוצגים 1 מתוך ' + total));
  /* הסמן אינו נופל מהתיבה בכל הקשה – אחרת אי אפשר להקליד בה */
  check('הסמן נשאר בתיבת החיפוש',
    await page.evaluate(() => document.activeElement && document.activeElement.id), 'emp-search');

  await page.fill('#emp-search', 'שם שלא קיים כלל');
  await page.waitForTimeout(300);
  check('אין התאמה – יש הסבר',
    (await page.locator('.list-empty').innerText()).trim(), /אין עובד שתואם/);
  await page.fill('#emp-search', '');
  await page.waitForTimeout(300);
  check('ניקוי החיפוש מחזיר את כולם',
    await page.locator('#employees-list .card').count(), total);

  console.log('\n== סינון לפי סניף ==');
  const branchId = await page.evaluate(() => window.ShiftApp.getState().branches[0].id);
  await page.selectOption('#emp-branch-filter', branchId);
  await page.waitForTimeout(300);
  const filtered = await page.locator('#employees-list .card').count();
  check('הרשימה הצטמצמה', filtered < total && filtered > 0, true);
  check('מחליף כללי נשאר ברשימה', await page.evaluate((id) => {
    const state = window.ShiftApp.getState();
    const floaters = state.employees.filter((e) => !e.branches.length).map((e) => e.name);
    const shown = Array.from(document.querySelectorAll('#employees-list .card .name'))
      .map((node) => node.value);
    return floaters.every((name) => shown.includes(name));
  }, branchId), true);

  console.log('\n== פעולה על כל המוצגים ==');
  check('הכפתור נחשף רק כשיש סינון',
    await page.locator('#emp-bulk-inactive').isVisible(), true);
  const shownNames = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#employees-list .card .name')).map((n) => n.value));
  await page.click('#emp-bulk-inactive');
  await page.waitForTimeout(500);
  check('כל המוצגים הושבתו', await page.evaluate((names) => {
    const state = window.ShiftApp.getState();
    return state.employees.filter((e) => names.includes(e.name)).every((e) => !e.active);
  }, shownNames), true);
  check('ומי שלא הוצג לא נגע', await page.evaluate((names) => {
    const state = window.ShiftApp.getState();
    const others = state.employees.filter((e) => !names.includes(e.name));
    return others.length === 0 || others.some((e) => e.active);
  }, shownNames), true);

  await page.selectOption('#emp-branch-filter', '');
  await page.waitForTimeout(300);
  check('בלי סינון אין כפתור פעולה מרובה',
    await page.locator('#emp-bulk-inactive').isVisible(), false);

  console.log('\n== "רק פעילים" ==');
  await page.check('#emp-active-only');
  await page.waitForTimeout(300);
  check('המושבתים ירדו מהרשימה', await page.evaluate(() =>
    Array.from(document.querySelectorAll('#employees-list .card'))
      .every((card) => !card.classList.contains('inactive'))), true);
  await page.uncheck('#emp-active-only');
  await page.waitForTimeout(300);

  console.log('\n== עובד חדש נפתח מיד ==');
  await page.click('#add-employee');
  await page.waitForTimeout(400);
  check('הכרטיס החדש פתוח', await visibleBodies(), 1);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות רשימת העובדים עברו');
