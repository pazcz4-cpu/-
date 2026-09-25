/* שבוע שפורסם אינו נערך בלחיצה אחת.

   מנהל שפתח את המערכת בבוקר אינו זוכר איזה שבוע כבר פורסם. שינוי
   קטן מגיע לטלפונים של כל העובדים מיד ובלי הודעה, והם כבר בנו את
   השבוע שלהם סביב מה שראו.

   הנקודה המרכזית כאן: הפעולה הראשונה אינה נשמרת ואז מבקשת אישור –
   היא פשוט לא קורית. לחיצה בטעות אינה יכולה לשנות דבר.

   הרצה: npm run test:locked */
import { createRequire } from 'node:module';
import { loadSample } from './_sample.mjs';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const APP = url('app.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  const shown = JSON.stringify(actual);
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' +
    (shown && shown.length > 80 ? shown.slice(0, 80) + '…"' : shown));
  if (!ok) failures.push(label + ': ' + shown + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async (d) => { await d.accept(); });

  const snapshot = () => page.evaluate(() => {
    const w = window.ShiftApp.getState().weeks[window.ShiftApp.weekKey()] || {};
    return JSON.stringify({ a: w.assignments || {}, c: w.constraints || {} });
  });
  const published = () => page.evaluate(() => {
    const w = window.ShiftApp.getState().weeks[window.ShiftApp.weekKey()] || {};
    return !!w.published;
  });

  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="email"]', 'boss@lock.test');
  await page.fill('input[name="password"]', 'secret123');
  /* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
     עם הלקוח כשמשהו בחשבון דורש טיפול. */
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1400);
  await loadSample(page);

  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(500);
  await page.click('#generate');
  await page.waitForTimeout(2200);

  console.log('\n== לפני פרסום אין שום חסימה ==');
  const draftBefore = await snapshot();
  await page.locator('#schedule-employee .shift-tile').first().click();
  await page.waitForTimeout(300);
  check('קובייה נתפסת מיד', await page.locator('.shift-tile.picked').count(), 1);
  check('ואין חלון אזהרה', await page.locator('#confirm-overlay').isHidden(), true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('ואין באנר', await page.locator('#live-edit-banner').isVisible(), false);

  console.log('\n== מפרסמים ==');
  await page.click('#publish-week');
  await page.waitForTimeout(600);
  await page.click('[data-confirm-yes]');
  await page.waitForTimeout(1500);
  check('השבוע פורסם', await published(), true);

  console.log('\n== השינוי הראשון פשוט לא קורה ==');
  const afterPublish = await snapshot();
  await page.locator('#schedule-employee .shift-tile').first().click();
  await page.waitForTimeout(600);
  check('הקובייה לא נתפסה', await page.locator('.shift-tile.picked').count(), 0);
  check('נפתחה אזהרה', await page.locator('#confirm-overlay .confirm-card').isVisible(), true);
  check('והיא אומרת שהשבוע פורסם',
    await page.locator('#confirm-overlay').innerText(), /כבר פורסם/);
  check('ומראה כמה אנשים תלויים בו',
    await page.locator('#confirm-overlay .confirm-fact').count(), 2);
  check('שום דבר לא זז', await snapshot(), afterPublish);

  console.log('\n== "לא לשנות" מחזיר הכל לקדמותו ==');
  await page.click('[data-confirm-no]');
  await page.waitForTimeout(500);
  check('החלון נסגר', await page.locator('#confirm-overlay').isHidden(), true);
  check('הסידור לא נגע', await snapshot(), afterPublish);
  check('והשבוע עדיין מפורסם', await published(), true);

  console.log('\n== אזהרה ראשונה, ואז בחירה אמיתית ==');
  await page.locator('#schedule-employee .shift-tile').first().click();
  await page.waitForTimeout(500);
  await page.click('[data-confirm-yes]');
  await page.waitForTimeout(500);
  check('נפתחה שאלה שנייה',
    await page.locator('#confirm-overlay').innerText(), /איך להמשיך/);
  check('ויש בה שלוש אפשרויות',
    await page.locator('#confirm-overlay .confirm-actions button').count(), 3);
  check('עדיין לא זז כלום', await snapshot(), afterPublish);

  console.log('\n== "עריכה ישירה" פותחת, עם באנר ==');
  await page.click('[data-confirm-alt]');
  await page.waitForTimeout(700);
  check('הבאנר עלה', await page.locator('#live-edit-banner').isVisible(), true);
  check('והוא אומר שזה סידור חי',
    await page.locator('#live-edit-banner').innerText(), /מגיע לעובדים מיד/);
  check('השבוע נשאר מפורסם', await published(), true);
  check('ועדיין לא נשמר שינוי', await snapshot(), afterPublish);

  /* עכשיו העריכה עצמה עובדת, בלי אזהרה נוספת על כל לחיצה */
  await page.locator('#schedule-employee .shift-tile').first().click();
  await page.waitForTimeout(400);
  check('מכאן הקובייה נתפסת', await page.locator('.shift-tile.picked').count(), 1);
  await page.keyboard.press('Escape');

  console.log('\n== "סיום עריכה" נועל בחזרה ==');
  await page.click('#live-edit-stop');
  await page.waitForTimeout(600);
  check('הבאנר ירד', await page.locator('#live-edit-banner').isVisible(), false);
  await page.locator('#schedule-employee .shift-tile').first().click();
  await page.waitForTimeout(600);
  check('והחסימה חזרה', await page.locator('#confirm-overlay .confirm-card').isVisible(), true);
  await page.click('[data-confirm-no]');
  await page.waitForTimeout(400);

  console.log('\n== ההיתר אינו עובר לשבוע אחר ==');
  await page.locator('#schedule-employee .shift-tile').first().click();
  await page.waitForTimeout(500);
  await page.click('[data-confirm-yes]');
  await page.waitForTimeout(500);
  await page.click('[data-confirm-alt]');
  await page.waitForTimeout(700);
  check('פתוח לעריכה', await page.locator('#live-edit-banner').isVisible(), true);
  await page.click('#next-week');
  await page.waitForTimeout(1200);
  await page.click('#prev-week');
  await page.waitForTimeout(1200);
  check('אחרי מעבר שבוע ההיתר נסגר',
    await page.locator('#live-edit-banner').isVisible(), false);

  console.log('\n== "החזרה לטיוטה" היא הדרך הבטוחה ==');
  await page.locator('#schedule-employee .shift-tile').first().click();
  await page.waitForTimeout(500);
  await page.click('[data-confirm-yes]');
  await page.waitForTimeout(500);
  await page.click('[data-confirm-yes]');
  await page.waitForTimeout(900);
  check('השבוע חזר לטיוטה', await published(), false);
  check('אין באנר – זו כבר טיוטה',
    await page.locator('#live-edit-banner').isVisible(), false);
  check('והשרת יודע על כך', await page.evaluate(() =>
    window.__backend.loadWeek(window.ShiftApp.weekKey())
      .then((w) => !!(w && w.published))), false);
  await page.locator('#schedule-employee .shift-tile').first().click();
  await page.waitForTimeout(400);
  check('ומכאן עורכים חופשי', await page.locator('.shift-tile.picked').count(), 1);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות הנעילה עברו');
