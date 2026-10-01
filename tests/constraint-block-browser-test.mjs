/* אילוץ שאושר חוסם שיבוץ ידני נגדו, עד שהמנהל מבטל אותו.
   הרצה: node tests/constraint-block-browser-test.mjs */
import { createRequire } from 'node:module';
import { loadSample } from './_sample.mjs';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', async (d) => { await d.accept(); });

try {
  await skipWizard(page);
  await page.goto(url('app.html'));
  await page.waitForTimeout(500);
  await page.click('[data-auth-mode="signup"]');
  await page.fill('input[name="companyName"]', 'קפה הגן');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@cb.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1500);
  await loadSample(page);

  const info = await page.evaluate(() => {
    const s = window.ShiftApp.getState();
    const emp = s.employees.find((e) => e.active);
    return { id: emp.id, name: emp.name, weekKey: window.ShiftApp.getWeekKey() };
  });

  /* המנהל מאשר לעובד יום חופש ביום ראשון, דרך לשונית האילוצים */
  await page.click('.tab[data-tab="constraints"]');
  await page.waitForTimeout(400);
  await page.click(`.cstate[data-emp="${info.id}"][data-day="0"][data-off]`);
  await page.waitForTimeout(500);
  check('היום חופש נשמר באילוץ', await page.evaluate(({ k, id }) =>
    !!window.ShiftApp.getState().weeks[k].constraints[id + '|0'].off, { k: info.weekKey, id: info.id }), true);

  /* בסידור, בתצוגה לפי סניף, אי אפשר לבחור אותו ביום הזה */
  await page.click('.tab[data-tab="schedule"]');
  await page.click('[data-view="branch"]');
  await page.waitForTimeout(500);
  const cell = page.locator('#schedule-branch td.cell[data-day="0"]').first();
  const select = cell.locator('.emp-select').first();
  const optionState = await select.evaluate((node, id) => {
    const opt = Array.from(node.options).find((o) => o.value === id);
    return opt ? { disabled: opt.disabled, label: opt.textContent } : null;
  }, info.id);
  check('העובד מופיע ברשימה', !!optionState, true);
  check('אבל אינו ניתן לבחירה', optionState && optionState.disabled, true);
  check('והתווית אומרת למה', optionState && optionState.label, /חופש/);

  /* גם בכוח (שינוי ערך ידני בדפדפן) השמירה נדחית ומוסברת */
  await select.evaluate((node, id) => {
    node.value = id;
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }, info.id);
  await page.waitForTimeout(500);
  check('הוא לא שובץ', await page.evaluate(({ k, id }) => {
    const a = window.ShiftApp.getState().weeks[k].assignments;
    return Object.keys(a).filter((slot) => slot.indexOf('0|') === 0 && (a[slot] || []).indexOf(id) !== -1).length;
  }, { k: info.weekKey, id: info.id }), 0);
  check('וההודעה מפנה לביטול האילוץ', await page.locator('#toast').innerText(), /בטלו קודם את האילוץ/);
  check('ההודעה נוקבת בשם', await page.locator('#toast').innerText(), new RegExp(info.name));

  /* המנהל מבטל את האילוץ – ואז אפשר */
  await page.click('.tab[data-tab="constraints"]');
  await page.waitForTimeout(300);
  await page.click(`.cstate[data-emp="${info.id}"][data-day="0"][data-off]`);
  await page.waitForTimeout(500);
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(400);
  const select2 = page.locator('#schedule-branch td.cell[data-day="0"]').first().locator('.emp-select').first();
  const after = await select2.evaluate((node, id) => {
    const opt = Array.from(node.options).find((o) => o.value === id);
    return opt ? opt.disabled : null;
  }, info.id);
  check('אחרי הביטול הוא ניתן לבחירה', after, false);
  await select2.selectOption(info.id);
  await page.waitForTimeout(500);
  check('והשיבוץ נקלט', await page.evaluate(({ k, id }) => {
    const a = window.ShiftApp.getState().weeks[k].assignments;
    return Object.keys(a).filter((slot) => slot.indexOf('0|') === 0 && (a[slot] || []).indexOf(id) !== -1).length;
  }, { k: info.weekKey, id: info.id }), 1);

  check('אין שגיאות בדף', errors.length, 0);
  if (errors.length) console.log(errors);
} finally {
  await browser.close();
}
if (failures.length) { console.log('\n❌ ' + failures.length + ' נכשלו'); process.exit(1); }
console.log('\n✅ אילוץ מאושר חוסם שיבוץ ידני');
