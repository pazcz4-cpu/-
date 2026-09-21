/* בדיקת החלפת שפה: הממשק המקומי והמערכת המסחרית, עברית ואנגלית.
   הרצה: node tests/language-browser-test.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const LOCAL = 'file://' + path.join(here, '..', 'index.html');
const APP = 'file://' + path.join(here, '..', 'app.html');
const browser = await chromium.launch();

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(actual) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

async function computedDir(page, selector) {
  return page.locator(selector).first().evaluate(
    (node) => getComputedStyle(node).direction);
}

async function open(url, locale) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', async d => { await d.accept(); });
  await page.goto(url);
  await page.waitForTimeout(500);
  return { ctx, page, errors };
}

console.log('\n== הממשק המקומי עולה בעברית לדפדפן עברי ==');
{
  const { ctx, page, errors } = await open(LOCAL, 'he-IL');
  check('כיוון המסמך', await page.getAttribute('html', 'dir'), 'rtl');
  check('לשונית הסידור', await page.locator('.tab[data-tab="schedule"]').textContent(), 'סידור שבועי');
  check('כותרת הסניף בטבלה', await page.locator('#schedule-branch th.row-head').first().textContent(), 'סניף');
  check('סניף ברירת מחדל', await page.locator('#branches-list .name').first().inputValue(), 'סניף מרכז');

  console.log('\n== מעבר לאנגלית משנה את כל המסך ==');
  await page.click('.tab[data-tab="settings"]');
  await page.selectOption('#language-select', 'en');
  await page.waitForTimeout(400);
  check('כיוון המסמך', await page.getAttribute('html', 'dir'), 'ltr');
  check('כיוון בפועל של הגוף', await computedDir(page, 'body'), 'ltr');
  check('כיוון בפועל של הטבלה', await computedDir(page, '#schedule-branch table'), 'ltr');
  check('שפת המסמך', await page.getAttribute('html', 'lang'), 'en');
  check('לשונית הסידור', await page.locator('.tab[data-tab="schedule"]').textContent(), 'Schedule');
  check('כותרת הסניף בטבלה', await page.locator('#schedule-branch th.row-head').first().textContent(), 'Branch');
  check('שמות הימים', await page.locator('#schedule-branch th.day-head').first().textContent(), /^Sunday/);
  check('טקסט ההתראות', await page.locator('#issues .issue').first().textContent(), /Understaffed|No Sabbath/);
  check('סיכום הזמינות', await page.locator('#availability .summary-title').textContent(), 'What is still available');

  console.log('\n== ערבית: שפה שנייה עם כיוון כתיבה מימין לשמאל ==');
  await page.click('.tab[data-tab="settings"]');
  check('מספר השפות בבורר', await page.locator('#language-select option').count(), 8);
  await page.selectOption('#language-select', 'ar');
  await page.waitForTimeout(400);
  check('כיוון המסמך', await page.getAttribute('html', 'dir'), 'rtl');
  check('כיוון בפועל של הגוף', await computedDir(page, 'body'), 'rtl');
  check('לשונית הסידור', await page.locator('.tab[data-tab="schedule"]').textContent(), 'الجدول');
  await page.click('.tab[data-tab="schedule"]');
  check('כותרת הסניף בטבלה', await page.locator('#schedule-branch th.row-head').first().textContent(), 'الفرع');

  console.log('\n== חזרה לאנגלית ==');
  await page.click('.tab[data-tab="settings"]');
  await page.selectOption('#language-select', 'en');
  await page.waitForTimeout(300);
  await page.click('.tab[data-tab="schedule"]');
  check('כיוון המסמך', await page.getAttribute('html', 'dir'), 'ltr');
  check('כיוון בפועל של הגוף', await computedDir(page, 'body'), 'ltr');

  console.log('\n== הבחירה נשמרת בין טעינות ==');
  await page.reload();
  await page.waitForTimeout(500);
  check('נשארנו באנגלית', await page.locator('.tab[data-tab="schedule"]').textContent(), 'Schedule');
  await page.click('.tab[data-tab="schedule"]');
  check('חזרה לעברית', await (async () => {
    await page.click('.tab[data-tab="settings"]');
    await page.selectOption('#language-select', 'he');
    await page.waitForTimeout(300);
    return page.locator('.tab[data-tab="schedule"]').textContent();
  })(), 'סידור שבועי');
  console.log('  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות בממשק המקומי: ' + errors.join(' | '));
  await ctx.close();
}

console.log('\n== המערכת המסחרית: מסך הכניסה באנגלית ==');
{
  const { ctx, page, errors } = await open(APP, 'en-US');
  check('כותרת מסך הכניסה', await page.locator('.auth-tab').first().textContent(), 'Sign in');
  check('בורר שפה במסך הכניסה', await page.locator('#auth-language').isVisible(), true);

  await page.click('.auth-tab[data-auth-mode="signup"]');
  await page.fill('input[name="companyName"]', 'Global Coffee');
  await page.fill('input[name="name"]', 'Dana');
  await page.fill('input[name="email"]', 'dana@global.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(900);

  check('האפליקציה נפתחה', await page.locator('#manager-root').isVisible(), true);
  check('כיוון בפועל של הגוף', await computedDir(page, 'body'), 'ltr');
  check('לשונית המנוי', await page.locator('.tab[data-tab="billing"]').textContent(), 'Subscription');
  check('בורר שפה בשורת המשתמש', await page.locator('#user-language').isVisible(), true);

  console.log('\n== החלפה לעברית מתוך שורת המשתמש ==');
  await page.selectOption('#user-language', 'he');
  await page.waitForTimeout(500);
  check('כיוון המסמך', await page.getAttribute('html', 'dir'), 'rtl');
  check('כיוון בפועל של הגוף', await computedDir(page, 'body'), 'rtl');
  check('לשונית המנוי', await page.locator('.tab[data-tab="billing"]').textContent(), 'מנוי');
  await page.click('.tab[data-tab="billing"]');
  await page.waitForTimeout(300);
  check('פאנל המנוי בעברית', await page.locator('#billing-panel').textContent(), /תקופת ניסיון/);
  await page.click('.tab[data-tab="users"]');
  await page.waitForTimeout(300);
  check('טבלת המשתמשים בעברית', await page.locator('#users-list th').first().textContent(), 'שם');

  console.log('  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות במערכת המסחרית: ' + errors.join(' | '));
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות השפה עברו');
