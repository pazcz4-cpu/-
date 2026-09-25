/* לוח השנה במסך: מה נופל בשבוע, ושתי הפעולות לכל יום.

   הרצה: npm run test:calendar */
import { createRequire } from 'node:module';
import { skipWizard } from './_wizard.mjs';
import { loadSample } from './_sample.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

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
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async d => { await d.accept(); });

  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(250);
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@cal.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1500);
  await loadSample(page);
  await page.waitForTimeout(600);

  /* לוח השנה יושב בתפריט "כלים נוספים", לצד הגדרות השבוע
     וימי החג — שם המנהל כבר מחפש את ההחלטות של השבוע הזה. */
  await page.click('#tools-menu');
  await page.waitForTimeout(400);

  console.log('\n== המערכת מסמנת מה נופל בשבוע ==');
  check('הלוח אינו מוסתר כשיש מה להציג',
    await page.locator('#calendar-section').evaluate(n => n.hidden), false);
  const cards = await page.locator('#calendar-days .calendar-day').count();
  check('ארבעה מועדים בשבוע הזה', cards, 4);
  const text = await page.locator('#calendar-days').innerText();
  check('ערב יום כיפור מסומן', /ערב יום כיפור/.test(text), true);
  check('ויום כיפור מסומן', /יום כיפור/.test(text), true);
  /* הסוג מוצג לצד השם: "ערב חג" ו"חג שאסור בעבודה" הם מה
     שקובע מה עושים, והשם לבדו אינו אומר את זה. */
  check('הסוג של כל יום מוצג', /ערב חג/.test(text), true);

  console.log('\n== שתי פעולות לכל יום, ולא אחת ==');
  const first = page.locator('#calendar-days .calendar-day').first();
  check('כפתור סגירה', await first.locator('[data-cal-close]').count(), 1);
  check('וכפתור שעות מיוחדות', await first.locator('[data-cal-hours]').count(), 1);
  /* גם על חג וגם על ערב חג — זו הייתה הבקשה במפורש */
  const all = page.locator('#calendar-days .calendar-day');
  check('שני הכפתורים על כל יום',
    await all.evaluateAll(nodes => nodes.every(n =>
      n.querySelector('[data-cal-close]') && n.querySelector('[data-cal-hours]'))), true);

  console.log('\n== שעות מיוחדות: היום עובד, אבל אחרת ==');
  await page.evaluate(() => { window.prompt = () => '08:00-14:00'; });
  await first.locator('[data-cal-hours]').click();
  await page.waitForTimeout(800);
  const hours = await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    const week = state.weeks[window.ShiftStore.currentWeekKey()];
    return (week.dayHours && week.dayHours[0]) || null;
  });
  check('השעות נשמרו על השבוע', hours && hours.to, '14:00');
  /* משמרת ערב מתחילה אחרי שהעסק סגר, ולכן היא אינה מתקיימת
     ביום הזה. בלי זה הלוח היה מבקש לאייש אותה. */
  check('משמרת ערב אינה נדרשת יותר ביום הזה', await page.evaluate(() => {
    const app = window.ShiftApp;
    const state = app.getState();
    const week = state.weeks[window.ShiftStore.currentWeekKey()];
    return window.ShiftStore.slotNeed(state.branches[0], 0, 'evening', week);
  }), 0);
  /* והבוקר נשאר — מקוצר */
  check('והבוקר קוצר לשעת הסגירה', await page.evaluate(() => {
    const app = window.ShiftApp;
    const state = app.getState();
    const week = state.weeks[window.ShiftStore.currentWeekKey()];
    const hours = window.ShiftStore.slotHours(week, state.branches[0], 0, 'morning');
    return hours && hours.to;
  }), '14:00');
  /* השעות הן של השבוע הזה ולא של הסניף: שעות הסניף הן תבנית
     שחוזרת בכל שבוע, ושינוי שלה בגלל ערב חג אחד היה משנה את
     כל השנה. */
  check('שעות הסניף עצמן לא נגעו', await page.evaluate(() => {
    const branch = window.ShiftApp.getState().branches[0];
    const slot = (branch.schedule || {})[0] || {};
    return (slot.evening && slot.evening.need) || 0;
  }), 1);

  console.log('\n== סגירת יום: מציעה, והמנהל מאשר ==');
  if (!await page.locator('#calendar-days').isVisible()) {
    await page.click('#tools-menu');
    await page.waitForTimeout(400);
  }
  const second = page.locator('#calendar-days .calendar-day').nth(1);
  await second.locator('[data-cal-close]').click();
  await page.waitForTimeout(800);
  check('היום סומן כסגור', await page.evaluate(() => {
    const app = window.ShiftApp;
    const week = app.getState().weeks[window.ShiftStore.currentWeekKey()];
    return !!(week.holidays && week.holidays[1] !== undefined);
  }), true);
  check('והשם שנשמר הוא שם החג ולא "חג"', await page.evaluate(() => {
    const app = window.ShiftApp;
    return app.getState().weeks[window.ShiftStore.currentWeekKey()].holidays[1];
  }), 'יום כיפור');
  check('הכרטיס מציג שהיום סגור',
    await page.locator('#calendar-days .calendar-day.is-closed').count() > 0, true);
  check('ואפשר לפתוח אותו מחדש',
    await page.locator('#calendar-days [data-cal-open]').count() > 0, true);

  console.log('\n== ההגדרות: העסק מחליט מה כל סוג אומר אצלו ==');
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(600);
  check('שורת מדיניות לכל סוג יום',
    await page.locator('#cal-policy .cal-policy-row').count(), 8);
  check('שלושת הלוחות דלוקים', await page.evaluate(() => {
    return ['hebrew', 'muslim', 'christian']
      .every(name => document.getElementById('cal-set-' + name).checked);
  }), true);
  /* עסק שעובד ביום טוב — חברת שמירה, למשל — מכבה את ההצעה */
  await page.selectOption('#cal-policy [data-cal-kind="yomtov"]', 'note');
  await page.waitForTimeout(500);
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(700);
  check('ההצעה לסגור נעלמה מהימים שעוד לא נסגרו', await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    return window.ShiftStore.calendarSuggestions(
      state, state.weeks[window.ShiftStore.currentWeekKey()], window.ShiftStore.currentWeekKey()).length;
  }), 0);

  console.log('\n== אפשר לכבות את הלוח לגמרי ==');
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(500);
  await page.uncheck('#cal-enabled');
  await page.waitForTimeout(500);
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(700);
  check('המקטע נעלם', await page.locator('#calendar-section').evaluate(n => n.hidden), true);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות לוח השנה עברו');
