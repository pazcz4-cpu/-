/* מסך העובד אחרי פרסום: בכל פתיחה העובד בוחר איזה שבוע לראות, הנוכחי
   או הבא, ואחר כך ממשיך לנווט כרגיל. המקרה שהתלונה עליו: המנהל על
   השבוע הבא, ותצוגת העובד נפתחה על הנוכחי והראתה "משמרת ישנה".
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
  await skipWizard(page, { defaultWeek: true, weekPick: true });
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

  console.log('\n== בפתיחה העובד בוחר איזה שבוע לראות ==');
  check('נפתח חלון בחירה', await page.locator('#week-pick').isVisible(), true);
  check('הוא שואל איזה שבוע', await page.locator('#week-pick-title').innerText(), /איזה שבוע/);
  const optionsText = await page.locator('.week-pick-option').allInnerTexts();
  check('שתי אפשרויות', optionsText.length, 2);
  check('הראשונה: השבוע הנוכחי עם התאריכים', optionsText[0], new RegExp('השבוע הנוכחי[\\s\\S]*' + rangeOf(Store.currentWeekKey())));
  check('השנייה: השבוע הבא עם התאריכים', optionsText[1], new RegExp('השבוע הבא[\\s\\S]*' + rangeOf(nextKey)));
  check('והיא אומרת שהשבוע הבא פורסם', optionsText[1], /פורסם/);
  check('התצוגה לא נפתחה על שבוע המנהל מאחורי החלון', await page.locator('.employee-weeknav strong').innerText(), rangeOf(Store.currentWeekKey()));

  console.log('\n== בחירה בשבוע הבא ==');
  await page.click('[data-pick-week="1"]');
  await page.waitForTimeout(900);
  check('החלון נסגר', await page.locator('#week-pick').count(), 0);
  check('מוצג השבוע הבא', await page.locator('.employee-weeknav strong').innerText(), rangeOf(nextKey));
  const countText = await page.locator('#employee-root').innerText();
  check('מספר המשמרות שלי תואם למנהל', new RegExp('\\b' + expectedShifts + '\\b').test(countText), true);

  console.log('\n== אחרי הבחירה אפשר לנווט כמו קודם ==');
  await page.click('[data-week-step="-1"]');
  await page.waitForTimeout(700);
  check('שבוע קודם', await page.locator('.employee-weeknav strong').innerText(), rangeOf(Store.currentWeekKey()));
  check('החלון לא חוזר', await page.locator('#week-pick').count(), 0);

  console.log('\n== פתיחה חדשה שואלת שוב, ובחירה בשבוע הנוכחי ==');
  await page.click('#preview-exit');
  await page.waitForTimeout(400);
  await page.click('#user-preview');
  await page.waitForTimeout(300);
  await page.locator('.preview-pick').first().click();
  await page.waitForTimeout(900);
  check('החלון נפתח שוב', await page.locator('#week-pick').isVisible(), true);
  await page.click('[data-pick-week="0"]');
  await page.waitForTimeout(500);
  check('מוצג השבוע הנוכחי', await page.locator('.employee-weeknav strong').innerText(), rangeOf(Store.currentWeekKey()));
  check('החלון נסגר', await page.locator('#week-pick').count(), 0);
  check('אין שגיאות בדף', errors.length, 0);
  if (errors.length) console.log(errors);
} finally {
  await browser.close();
}
if (failures.length) { console.log('\n❌ ' + failures.length + ' נכשלו'); process.exit(1); }
console.log('\n✅ תצוגת העובד נפתחת על השבוע הנכון');
