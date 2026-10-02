/* החלטת מנהל על בקשת אילוץ מוצגת לעובד רק אחרי פרסום הסידור.
   עובד שמבקש יום חופש רואה "ממתין" גם אחרי שהמנהל אישר או דחה,
   ורק כשהסידור מתפרסם הוא רואה את התשובה.
   הרצה: npm run test:decisionhidden */
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
const ctx = await browser.newContext({ viewport: { width: 1450, height: 1000 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('dialog', async d => { await d.accept(); });

async function signIn(email, password) {
  await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await page.reload();
  await page.waitForTimeout(600);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('#signin-form button[type="submit"]');
  await page.waitForTimeout(1400);
}

/* כל הבדג'ים במסך העובד, גם בתוך מגירה סגורה (אחרי פרסום) */
async function badges() {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.req-badge')).map((b) => b.textContent.trim()));
}

try {
  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.fill('input[name="companyName"]', 'עסק');
  await page.fill('input[name="email"]', 'mgr@dh.co.il');
  await page.fill('input[name="password"]', 'secret123');
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1400);
  await loadSample(page);

  await page.click('.tab[data-tab="users"]');
  await page.waitForTimeout(600);
  const opts = await page.locator('#invite-form select[name="employeeId"] option')
    .evaluateAll(o => o.map(x => ({ v: x.value, t: x.textContent })).filter(x => x.v));
  await page.fill('#invite-form input[name="email"]', 'emp@dh.co.il');
  await page.selectOption('#invite-form select[name="employeeId"]', opts[0].v);
  await page.click('#invite-form button[type="submit"]');
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    window.__backend.followLink('emp@dh.co.il', 'invite');
    await window.__backend.setPassword('secret123');
  });

  console.log('\n== העובד מבקש ==');
  await signIn('emp@dh.co.il', 'secret123');
  await page.locator('.employee-days .m-card').nth(2).locator('.cstate').last().click();
  await page.waitForTimeout(1000);
  check('הבקשה ממתינה', (await badges()).join('|'), /ממתי/);

  console.log('\n== המנהל מאשר: העובד עדיין רואה ממתין ==');
  await signIn('mgr@dh.co.il', 'secret123');
  await page.click('.tab[data-tab="constraints"]');
  await page.waitForTimeout(700);
  const hint = await page.locator('#constraints-legend').innerText();
  check('למנהל נאמר שההחלטה מוצגת אחרי פרסום', hint, /אחרי פרסום/);
  await page.click('.pending-item .approve');
  await page.waitForTimeout(1100);
  check('המנהל רואה שאין בקשות ממתינות', await page.locator('.pending-item').count(), 0);

  await signIn('emp@dh.co.il', 'secret123');
  const before = await badges();
  check('העובד עדיין רואה ממתין', before.join('|'), /ממתי/);
  check('ולא רואה אושר', /אושר/.test(before.join('|')), false);
  check('ונאמר לו שהתשובה תופיע אחרי הפרסום',
    (await page.locator('.employee-note').allInnerTexts()).join(' '), /אחרי שהסידור יפורסם/);

  console.log('\n== המנהל מפרסם: עכשיו העובד רואה ==');
  await signIn('mgr@dh.co.il', 'secret123');
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(400);
  await page.click('#generate');
  await page.waitForTimeout(1800);
  await page.click('#publish-week');
  await page.waitForTimeout(400);
  await page.click('[data-confirm-yes]');
  await page.waitForTimeout(1000);

  await signIn('emp@dh.co.il', 'secret123');
  const after = await badges();
  check('אחרי פרסום העובד רואה אושר', after.join('|'), /אושר/);
  check('ולא ממתין', /ממתי/.test(after.join('|')), false);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ בדיקת "החלטה מוצגת אחרי פרסום" עברה');
