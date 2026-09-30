/* צאת שבת אוטומטי: השדה במסך הסידור מציג את השעה של אותו שבוע לפי
   תל אביב, אי אפשר לערוך אותו, והוא מתחלף עם השבוע.
   הרצה: node tests/shabbat-browser-test.mjs */
import { createRequire } from 'node:module';
import { loadSample } from './_sample.mjs';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const Shabbat = require('../js/shabbat.js');
const Store = require('../js/store.js');

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
  await skipWizard(page, { defaultWeek: true });
  await page.goto(url('app.html'));
  await page.waitForTimeout(500);
  await page.click('[data-auth-mode="signup"]');
  await page.fill('input[name="companyName"]', 'קפה הגן');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@demo.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1500);
  await loadSample(page);
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(300);

  const weekKey = await page.evaluate(() => window.ShiftApp.getWeekKey());
  const expected = Shabbat.endForWeek(weekKey);
  check('בשדה מוצגת השעה המחושבת של השבוע', await page.innerText('#shabbat-end'), expected);
  check('השעה בפורמט שעה:דקה', expected, /^\d\d:\d\d$/);
  check('זה טקסט ולא שדה קלט', await page.evaluate(() => document.querySelector('#shabbat-end').tagName), 'SPAN');

  /* ניסיון לשנות ידנית: אין מטפל, והשעה לא זזה גם אחרי רענון התצוגה */
  await page.evaluate(() => {
    const field = document.querySelector('#shabbat-end');
    field.textContent = '23:59';
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#next-week');
  await page.click('#prev-week');
  await page.waitForTimeout(300);
  check('עריכה ידנית לא משנה את השעה', await page.innerText('#shabbat-end'), expected);
  check('גם בנתוני השבוע', await page.evaluate((k) => window.ShiftApp.getState().weeks[k].shabbatEnd, weekKey), expected);

  /* שבוע אחר: שעה אחרת, לפי החישוב */
  await page.click('#next-week');
  await page.waitForTimeout(300);
  const nextKey = Store.shiftWeekKey(weekKey, 1);
  check('בשבוע הבא מוצגת השעה שלו', await page.innerText('#shabbat-end'), Shabbat.endForWeek(nextKey));

  /* שעת התחלה של משמרת מוצ״ש בשבוע הנוכחי נגזרת מהשעה */
  const motzash = await page.evaluate((k) => {
    const s = window.ShiftApp.getState();
    const branch = s.branches.find((b) => b.active && window.ShiftStore.slotConfig(b, 6, 'evening', s.weeks[k]));
    return branch ? window.ShiftStore.slotHours(s.weeks[k], branch, 6, 'evening') : null;
  }, nextKey);
  check('משמרת מוצ״ש מתחילה חצי שעה אחרי', motzash && motzash.from, Store.addMinutes(Shabbat.endForWeek(nextKey), 30));

  /* בהגדרות: אין שדה להקלדת השעה, ויש שדה להפרש ההתחלה */
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(300);
  check('אין שדה ברירת מחדל לצאת שבת בהגדרות', await page.locator('#default-shabbat').count(), 0);
  check('ההסבר על החישוב מופיע בהגדרות', await page.locator('[data-i18n="settings.sabbathHint"]').innerText(), /תל אביב/);
  check('ברירת המחדל של ההפרש', await page.inputValue('#motzash-offset'), '30');
  await page.fill('#motzash-offset', '45');
  await page.locator('#motzash-offset').dispatchEvent('change');
  await page.waitForTimeout(400);
  check('ההפרש החדש נשמר בהגדרות העסק', await page.evaluate(() => window.ShiftApp.getState().settings.motzashOffsetMinutes), 45);
  await page.fill('#motzash-offset', '999');
  await page.locator('#motzash-offset').dispatchEvent('change');
  await page.waitForTimeout(400);
  check('ערך לא חוקי נדחה וחוזר לקודם', await page.inputValue('#motzash-offset'), '45');

  /* שעת ההתחלה של מוצ״ש זזה, וצאת השבת עצמו לא */
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(300);
  check('צאת השבת לא השתנה', await page.innerText('#shabbat-end'), Shabbat.endForWeek(nextKey));
  const moved = await page.evaluate((k) => {
    const s = window.ShiftApp.getState();
    const week = window.ShiftStore.getWeek(s, k);
    const branch = s.branches.find((b) => b.active && window.ShiftStore.slotConfig(b, 6, 'evening', week));
    return window.ShiftStore.slotHours(week, branch, 6, 'evening').from;
  }, nextKey);
  check('משמרת מוצ״ש מתחילה 45 דקות אחרי', moved, Store.addMinutes(Shabbat.endForWeek(nextKey), 45));
  check('אין שגיאות בדף', errors.length, 0);
  if (errors.length) console.log(errors);
} finally {
  await browser.close();
}
if (failures.length) { console.log('\n❌ ' + failures.length + ' נכשלו'); process.exit(1); }
console.log('\n✅ צאת שבת אוטומטי ונעול לעריכה');
