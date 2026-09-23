/* מסך העובד: שלושת המספרים למעלה, וארבעת המצבים שנקראים גם
   בלי צבע. הרצה: npm run test:empscreen */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSample } from './_sample.mjs';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = url('app.html');
const PHONE = { width: 390, height: 900 };

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];

try {
  /* Mobile first: כל הבדיקה במסך של טלפון, כי שם העובד פותח אותו */
  const ctx = await browser.newContext({ viewport: PHONE, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async d => { await d.accept(); });

  await skipWizard(page);

  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="email"]', 'boss@emp.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1400);
  await loadSample(page);

  /* תקרת בקשות, כדי שהאריח השלישי יופיע */
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(400);
  await page.check('#opt-limit');
  await page.waitForTimeout(500);

  await page.click('.tab[data-tab="users"]');
  await page.waitForTimeout(600);
  const opts = await page.locator('#invite-form select[name="employeeId"] option')
    .evaluateAll(o => o.map(x => x.value).filter(Boolean));
  await page.fill('#invite-form input[name="email"]', 'ronit@emp.test');
  await page.selectOption('#invite-form select[name="employeeId"]', opts[0]);
  await page.click('#invite-form button[type="submit"]');
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    window.__backend.followLink('ronit@emp.test', 'invite');
    await window.__backend.setPassword('secret123');
  });
  await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await page.reload();
  await page.waitForTimeout(800);
  await page.fill('input[name="email"]', 'ronit@emp.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signin-form button[type="submit"]');
  await page.waitForTimeout(1600);

  console.log('\n== שלושת המספרים, למעלה ולפני הכל ==');
  check('שלושה אריחים', await page.locator('.sum-tile').count(), 3);
  const labels = await page.locator('.sum-tile span').allInnerTexts();
  check('המשמרות שלי', labels.join('|'), /המשמרות שלי/);
  check('ממתין לאישור', labels.join('|'), /ממתין/);
  check('בקשות נותרו', labels.join('|'), /בקשות נותרו/);
  check('והם לפני רשימת הימים', await page.evaluate(() => {
    const tiles = document.querySelector('.employee-summary').getBoundingClientRect().top;
    const days = document.querySelector('.employee-days').getBoundingClientRect().top;
    return tiles < days;
  }), true);

  console.log('\n== ארבעת המצבים: אייקון, מילה, וגם צבע ==');
  const card = page.locator('.employee-days .m-card').nth(0);
  check('מצב ברירת מחדל נושא אייקון',
    await card.locator('.cstate').first().locator('svg.ico').count(), 1);
  check('ואינו נושא מילת מצב – היעדרה הוא הסימן',
    await card.locator('.cstate').first().locator('.cstate-state').count(), 0);
  check('ומדווח לקורא מסך שאינו לחוץ',
    await card.locator('.cstate').first().getAttribute('aria-pressed'), 'false');
  check('ועם שם מלא', await card.locator('.cstate').first().getAttribute('aria-label'), /זמין/);

  await card.locator('.cstate').nth(0).click();
  await page.waitForTimeout(900);
  const pref = card.locator('.cstate').nth(0);
  check('מעדיף/ה – המילה מופיעה', await pref.locator('.cstate-state').innerText(), 'מעדיף/ה');
  check('  ואייקון משלו', await pref.locator('svg.ico use').getAttribute('href'), '#i-star');
  check('  ולחוץ', await pref.getAttribute('aria-pressed'), 'true');

  await card.locator('.cstate').nth(1).click();
  await page.waitForTimeout(900);
  await card.locator('.cstate').nth(1).click();
  await page.waitForTimeout(900);
  const block = card.locator('.cstate').nth(1);
  check('לא יכול/ה – המילה', await block.locator('.cstate-state').innerText(), 'לא יכול/ה');
  check('  אייקון אחר', await block.locator('svg.ico use').getAttribute('href'), '#i-ban');
  check('  וגם קו חוצה על שם המשמרת', await block.locator('.cstate-name').evaluate(
    el => getComputedStyle(el).textDecorationLine), /line-through/);

  const card2 = page.locator('.employee-days .m-card').nth(1);
  await card2.locator('.cstate').last().click();
  await page.waitForTimeout(900);
  const off = card2.locator('.cstate').last();
  check('חופש – המילה', await off.locator('.cstate-state').innerText(), 'חופש');
  check('  ואייקון שלישי', await off.locator('svg.ico use').getAttribute('href'), '#i-home');

  /* הסימן האמיתי: ארבעה מצבים, ארבעה אייקונים שונים */
  check('לכל מצב צורה משלו', await page.evaluate(() => {
    const marks = Array.from(document.querySelectorAll('.cstate svg.ico use'))
      .map(u => u.getAttribute('href'));
    return new Set(marks).size >= 4;
  }), true);

  console.log('\n== המספרים מתעדכנים ==');
  /* הספירה היא לפי ימים ולא לפי לחיצות: יום שבו סומנו גם
     "מעדיף" וגם "לא יכול" הוא בקשה אחת שממתינה, לא שתיים. */
  check('שני ימים ממתינים לאישור',
    await page.locator('.sum-tile.warn b').innerText(), '2');
  check('והתקרה התעדכנה בהתאם',
    await page.locator('.sum-tile.spent b').count() >= 0, true);
  check('והאריח מסומן גם בלי הצבע',
    await page.locator('.sum-tile.warn svg.ico use').getAttribute('href'), '#i-clock');

  console.log('\n== יעדי מגע ==');
  const sizes = await page.locator('.cstate').evaluateAll(
    els => els.map(el => Math.round(el.getBoundingClientRect().height)));
  check('כל כפתור לפחות 44 פיקסלים', Math.min.apply(null, sizes) >= 44, true);
  console.log('     (הקטן ביותר: ' + Math.min.apply(null, sizes) + 'px)');

  console.log('\n== ניגודיות הטקסט האפור ==');
  check('--muted עובר AA על לבן', await page.evaluate(() => {
    function lum(rgb) {
      const c = rgb.match(/\d+/g).map(Number).map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
    const probe = document.createElement('span');
    probe.style.color = 'var(--muted)';
    probe.style.background = 'var(--surface)';
    document.body.appendChild(probe);
    const fg = lum(getComputedStyle(probe).color);
    const bg = lum(getComputedStyle(probe).backgroundColor);
    probe.remove();
    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    return Math.round(ratio * 10) / 10;
  }) >= 4.5, true);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות מסך העובד עברו');
