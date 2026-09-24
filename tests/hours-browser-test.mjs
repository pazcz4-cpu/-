/* דוח השעות החודשי.

   זה הדוח שנשלח לחשב שכר, ולכן נבדק כאן לא רק שהוא מצייר אלא
   שהמספרים שבו הם מה שנרשם: שעות בפועל מול מתוכנן, שעות נוספות
   לפי הסף שהעסק הגדיר, ומשמרת שנפתחה ולא נסגרה — שאינה הופכת
   לשעות ואינה נבלעת בשקט.

   הרצה: npm run test:hours */
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
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async (d) => { await d.accept(); });

  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(500);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'קפה שעות');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@hours.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1500);
  await loadSample(page);
  await page.click('#generate');
  await page.waitForTimeout(2000);

  console.log('\n== בלי שעון אין לשונית ==');
  check('הלשונית מוסתרת', await page.locator('.tab[data-tab="hours"]').isVisible(), false);

  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(500);
  await page.check('#opt-clock');
  await page.waitForTimeout(600);
  await page.check('#opt-overtime');
  await page.waitForTimeout(700);
  check('אחרי שהשעון הודלק הלשונית מופיעה',
    await page.locator('.tab[data-tab="hours"]').isVisible(), true);

  console.log('\n== דיווחים אמיתיים, ומה שהדוח עושה איתם ==');
  /* שלושה ימים של שמונה שעות לעובד אחד, יום אחד של עשר לעובד
     שני, ומשמרת אחת שנפתחה ולא נסגרה לשלישי. כל השאר נגזר. */
  const seeded = await page.evaluate(() => {
    const key = window.ShiftMockBackend.STORE_KEY;
    const db = JSON.parse(localStorage.getItem(key));
    const weekKey = window.ShiftStore.currentWeekKey();
    const now = new Date();
    /* היום השלישי בחודש: בתוך החודש בוודאות, ורחוק מגבולותיו */
    const day = (n, h, m) => new Date(now.getFullYear(), now.getMonth(), n, h, m).toISOString();
    let punches = [];
    for (let d = 0; d < 3; d++) {
      punches.push({ id: 'a' + d, empId: 'emp-1', kind: 'in', at: day(3 + d, 8, 0), src: 'device' });
      punches.push({ id: 'b' + d, empId: 'emp-1', kind: 'out', at: day(3 + d, 16, 0), src: 'device' });
    }
    punches.push({ id: 'c1', empId: 'emp-2', kind: 'in', at: day(3, 8, 0), src: 'phone' });
    punches.push({ id: 'c2', empId: 'emp-2', kind: 'out', at: day(3, 18, 0), src: 'phone' });
    punches.push({ id: 'd1', empId: 'emp-3', kind: 'in', at: day(4, 9, 0), src: 'phone' });
    Object.keys(db.data).forEach((companyId) => {
      const weeks = db.data[companyId].weeks || {};
      if (weeks[weekKey]) weeks[weekKey].punches = punches;
    });
    localStorage.setItem(key, JSON.stringify(db));
    return punches.length;
  });
  check('נזרעו דיווחים', seeded, 9);

  await page.reload();
  await page.waitForTimeout(1600);
  await page.click('.tab[data-tab="hours"]');
  await page.waitForTimeout(1500);

  const row = async (name) => page.evaluate((who) => {
    const tr = [...document.querySelectorAll('#hours-table tbody tr')]
      .find((r) => r.querySelector('.row-head').textContent.trim() === who);
    if (!tr) return null;
    return [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
  }, name);

  const first = await row('עובד/ת 1');
  check('שלושה ימים נספרו', first[1], '3');
  check('ועשרים וארבע שעות בפועל', first[2], '24:00');
  check('בלי שעות נוספות – אף יום לא חרג', first[4], '—');

  const second = await row('עובד/ת 2');
  check('יום של עשר שעות', second[2], '10:00');
  check('מייצר שעה ונ"ד שעות נוספות מעל הסף של 8.6', second[4], '1:24');

  const third = await row('עובד/ת 3');
  check('משמרת שנפתחה ולא נסגרה אינה שעות', third[2], '0:00');
  check('והיא נספרת כפתוחה', third[7], '1');
  check('והמסך אומר את זה במפורש',
    await page.locator('.hours-warn').innerText(), /לא נסגרו/);

  console.log('\n== כיבוי בקרת השעות הנוספות ==');
  const columns = async () => page.locator('#hours-table thead th').allInnerTexts();
  check('עמודת שעות נוספות קיימת', (await columns()).join('|'), /שעות נוספות/);
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(500);
  await page.uncheck('#opt-overtime');
  await page.waitForTimeout(700);
  await page.click('.tab[data-tab="hours"]');
  await page.waitForTimeout(1200);
  check('ונעלמה כשכיבו אותה', (await columns()).join('|'), /^((?!שעות נוספות).)*$/);
  check('אבל השעות בפועל נשארו', (await row('עובד/ת 1'))[2], '24:00');

  console.log('\n== כיבוי השעון ==');
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(500);
  await page.uncheck('#opt-clock');
  await page.waitForTimeout(800);
  check('הלשונית נעלמה', await page.locator('.tab[data-tab="hours"]').isVisible(), false);
  check('ולא נשארנו עומדים על מסך בלי לשונית',
    await page.locator('#tab-hours.active').count(), 0);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות דוח השעות עברו');
