/* ימי חופש: סימון בתשלום / ללא חיוב, וסיכום חודשי.
   ואיפוס סניף לשבוע אחד.

   למה זה נבדק יחד: שניהם פעולות שמנהל עושה על השבוע שמוצג,
   ושתיהן נוגעות בכסף או בעבודה של שבוע שלם – טעות בהן יקרה.

   הרצה: node tests/leave-browser-test.mjs */
import { createRequire } from 'node:module';
import { loadSample } from './_sample.mjs';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const LOCAL = url('index.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('dialog', async (d) => { await d.accept(); });

try {
  await skipWizard(page);
  await page.goto(LOCAL);
  await page.waitForTimeout(600);

  console.log('\n== סימון יום חופש ==');
  await page.click('.tab[data-tab="constraints"]');
  await page.waitForTimeout(500);

  /* אין שבבים על יום עבודה רגיל – רק על יום שסומן כחופשי */
  check('יום רגיל אינו מציג סוג חופש',
    await page.locator('#constraints-grid .leave-chip').count(), 0);

  const firstOff = page.locator('#constraints-grid .day-off-btn').first();
  await firstOff.click();
  await page.waitForTimeout(500);
  const cell = page.locator('#constraints-grid td').filter({ has: page.locator('.leave-chip') }).first();
  check('אחרי סימון יום חופש מופיעות שתי אפשרויות',
    await cell.locator('.leave-chip').count(), 2);

  /* ברירת המחדל היא ללא תשלום, ולכן היא מסומנת כבר עכשיו */
  check('ברירת המחדל היא ללא תשלום',
    await cell.locator('.leave-chip.unpaid.on').count(), 1);

  const leaveOf = () => page.evaluate(() => {
    const Store = window.ShiftStore;
    const state = window.ShiftApp.getState();
    const week = state.weeks[Store.currentWeekKey()];
    const key = Object.keys(week.constraints)[0];
    if (!key) return null;
    const parts = key.split('|');
    return Store.leaveOf(week, parts[0], Number(parts[1]));
  });

  await cell.locator('.leave-chip.paid').click();
  await page.waitForTimeout(400);
  check('הסימון נשמר על היום', await leaveOf(), 'paid');

  await cell.locator('.leave-chip.unpaid').click();
  await page.waitForTimeout(400);
  check('החזרה לברירת המחדל', await leaveOf(), 'unpaid');
  check('וללא תשלום נשמר כהיעדר סימון', await page.evaluate(() => {
    const week = window.ShiftApp.getState().weeks[window.ShiftStore.currentWeekKey()];
    return Object.keys(week.constraints).filter((k) => week.constraints[k].leave).length;
  }), 0);

  console.log('\n== הסיכום החודשי ==');
  /* מנקים את היום שסומן, כדי שהחודש יתחיל ריק */
  await firstOff.click();
  await page.waitForTimeout(500);
  check('בלי ימי חופש – נאמר שאין',
    (await page.locator('#leave-summary').innerText()).trim(), /לא סומנו/);

  /* שני ימים בתשלום ואחד ללא חיוב, לשני עובדים */
  await page.evaluate(() => {
    const Store = window.ShiftStore;
    const state = window.ShiftApp.getState();
    const key = Store.currentWeekKey();
    const week = state.weeks[key];
    const staff = state.employees;
    [[staff[0].id, 1, 'paid'], [staff[0].id, 2, 'paid'], [staff[1].id, 3, null]]
      .forEach(([empId, day, kind]) => {
        week.constraints[empId + '|' + day] = { off: true, blocked: {}, preferred: {}, note: '' };
        /* null = לא סומן כלום. לפי ברירת המחדל זה יום ללא תשלום. */
        if (kind) Store.setLeave(week, empId, day, kind);
      });
    window.ShiftApp.persistConfig();
    window.ShiftApp.render();
  });
  await page.waitForTimeout(600);

  const table = (await page.locator('#leave-summary').innerText()).replace(/\n/g, ' · ');
  console.log('   ' + table);
  check('הסיכום סופר לפי עובד', table, /2/);
  check('ושורת סך הכל קיימת', table, /סך הכל/);
  check('שתי שורות עובדים',
    await page.locator('#leave-summary tbody tr').count(), 2);

  console.log('\n== מה שנשלח לעובד ==');
  /* מה שכתוב בהעתקה הוא מה שהעובד יעמיד מול התלוש */
  const copy = await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    const Store = window.ShiftStore;
    const week = state.weeks[Store.currentWeekKey()];
    const staff = state.employees;
    /* יום חופש בתשלום, יום חופש ללא תשלום, ומנוחה שבועית קבועה */
    week.constraints[staff[0].id + '|1'] = { off: true, blocked: {}, preferred: {}, note: '' };
    Store.setLeave(week, staff[0].id, 1, 'paid');
    week.constraints[staff[0].id + '|2'] = { off: true, blocked: {}, preferred: {}, note: '' };
    Store.setStanding(staff[0], 6, { off: true });
    window.ShiftApp.persistConfig();
    window.ShiftApp.render();
    return window.ShiftApp.personalText(staff[0].id);
  });
  console.log('   ' + copy.replace(/\n/g, ' · '));
  check('יום חופש בתשלום נכתב במפורש', copy, /יום חופש בתשלום/);
  check('יום שלא סומן נכתב כללא תשלום', copy, /יום חופש ללא תשלום/);
  check('והמנוחה השבועית נכתבת כשבועית', copy, /יום חופש שבועי/);
  /* "סה״כ 0 משמרות משמרות השבוע" – המילה הופיעה פעמיים, בדיוק
     בשורה שהעובד קורא. */
  check('שורת הסיכום אינה כופלת את המילה', copy, /^(?!.*משמרות משמרות)[\s\S]*$/);

  console.log('\n== איפוס סניף לשבוע אחד ==');
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(300);
  await page.click('#generate');
  await page.waitForTimeout(1600);
  const before = await page.evaluate(() => {
    const week = window.ShiftApp.getState().weeks[window.ShiftStore.currentWeekKey()];
    const byBranch = {};
    Object.keys(week.assignments).forEach((slot) => {
      const branch = slot.split('|')[1];
      byBranch[branch] = (byBranch[branch] || 0) + week.assignments[slot].length;
    });
    return byBranch;
  });
  const branchIds = Object.keys(before);
  console.log('   שיבוצים לפי סניף:', JSON.stringify(before));
  check('יש יותר מסניף אחד משובץ', branchIds.length > 1, true);

  await page.click('.tab[data-tab="branches"]');
  await page.waitForTimeout(400);
  const target = branchIds[0];
  await page.locator('.card[data-branch="' + target + '"] [data-action="reset-branch"]').click();
  await page.waitForTimeout(700);

  const after = await page.evaluate(() => {
    const week = window.ShiftApp.getState().weeks[window.ShiftStore.currentWeekKey()];
    const byBranch = {};
    Object.keys(week.assignments).forEach((slot) => {
      const branch = slot.split('|')[1];
      byBranch[branch] = (byBranch[branch] || 0) + week.assignments[slot].length;
    });
    return byBranch;
  });
  check('הסניף שנבחר התרוקן', after[target] === undefined, true);
  check('שאר הסניפים לא נגעו',
    branchIds.slice(1).every((id) => after[id] === before[id]), true);
  check('ונאמר כמה הוסרו',
    (await page.locator('#toast').innerText()).trim(), /הוסרו/);

  console.log('\n  שגיאות בדף: ' + (errors.length ? errors.join(' | ') : 'אין'));
  if (errors.length) failures.push('שגיאות בדף');
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:');
  failures.forEach((line) => console.log('  ' + line));
  process.exit(1);
}
console.log('\n✅ כל בדיקות ימי החופש עברו\n');
