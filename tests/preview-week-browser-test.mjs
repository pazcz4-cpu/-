/* תצוגת עובד אחרי פרסום: נפתחת על השבוע שהמנהל עומד עליו, מראה בדיוק
   את מה שפורסם לאותו עובד, ומי שעומד על השבוע הנוכחי רואה שהשבוע הבא
   פורסם. המקרה שהתלונה עליו: המנהל על השבוע הבא, ותצוגת העובד נפתחה
   על השבוע הנוכחי והראתה "משמרת ישנה".
   הרצה: node tests/preview-week-browser-test.mjs */
import { createRequire } from 'node:module';
import { loadSample } from './_sample.mjs';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const Store = require('../js/store.js');

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
page.on('dialog', async (d) => { await d.accept(); });

const rangeOf = (weekKey) =>
  Store.formatDate(Store.dateOfDay(weekKey, 0)) + ' – ' + Store.formatDate(Store.dateOfDay(weekKey, 6));

try {
  await skipWizard(page, { defaultWeek: true });
  await page.goto(url('app.html'));
  await page.waitForTimeout(500);
  await page.click('[data-auth-mode="signup"]');
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@pw.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1500);
  await loadSample(page);

  const nextKey = await page.evaluate(() => window.ShiftApp.getWeekKey());
  check('המנהל עומד על השבוע הבא', nextKey, Store.shiftWeekKey(Store.currentWeekKey(), 1));

  await page.click('#generate');
  await page.waitForTimeout(1500);
  await page.click('#publish-week');
  await page.waitForTimeout(400);
  await page.click('[data-confirm-yes]');
  await page.waitForTimeout(1000);
  check('השבוע פורסם', await page.evaluate((k) => window.__backend.loadWeek(k).then((w) => !!w.published), nextKey), true);

  /* מי שובץ אצל המנהל, ומה העובד הראשון אמור לראות */
  await page.click('#user-preview');
  await page.waitForTimeout(300);
  const empId = await page.locator('.preview-pick').first().getAttribute('data-preview-employee');
  const expectedShifts = await page.evaluate(({ k, id }) => {
    const s = window.ShiftApp.getState();
    const a = (s.weeks[k] || {}).assignments || {};
    return Object.keys(a).filter((slot) => (a[slot] || []).indexOf(id) !== -1).length;
  }, { k: nextKey, id: empId });
  check('לעובד יש משמרות בשבוע שפורסם', expectedShifts > 0, true);

  await page.locator('.preview-pick').first().click();
  await page.waitForTimeout(900);

  console.log('\n== התצוגה נפתחת על שבוע המנהל ==');
  check('השבוע בתצוגה הוא השבוע הבא', await page.locator('.employee-weeknav strong').innerText(), rangeOf(nextKey));
  const shown = await page.locator('#employee-root .shift-card, #employee-root [data-my-shift]').count();
  const countText = await page.locator('#employee-root').innerText();
  check('מספר המשמרות שלי תואם למנהל', new RegExp('\\b' + expectedShifts + '\\b').test(countText), true);
  check('אין הודעת "לא רשום" על שבוע ריק', /לא רשום כרגע/.test(countText) && expectedShifts > 0 ? 'bad' : 'ok', 'ok');

  console.log('\n== עובד שעומד על השבוע הנוכחי רואה שהשבוע הבא פורסם ==');
  check('בשבוע הבא אין הודעה', await page.locator('.next-week-notice').count(), 0);
  await page.click('[data-week-step="-1"]');
  await page.waitForTimeout(900);
  check('חזרנו לשבוע הנוכחי', await page.locator('.employee-weeknav strong').innerText(), rangeOf(Store.currentWeekKey()));
  check('מופיעה הודעה שהשבוע הבא פורסם', await page.locator('.next-week-notice').count(), 1);
  await page.click('.next-week-notice');
  await page.waitForTimeout(900);
  check('לחיצה עליה מביאה לשבוע הבא', await page.locator('.employee-weeknav strong').innerText(), rangeOf(nextKey));
  check('וההודעה נעלמת', await page.locator('.next-week-notice').count(), 0);
  check('אין שגיאות בדף', errors.length, 0);
  if (errors.length) console.log(errors);
} finally {
  await browser.close();
}
if (failures.length) { console.log('\n❌ ' + failures.length + ' נכשלו'); process.exit(1); }
console.log('\n✅ תצוגת העובד נפתחת על השבוע הנכון');
