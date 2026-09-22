/* מצב ההזמנות במסך המשתמשים: נשלח, טרם נפתח, הצטרף, פג תוקף,
   שליחה חוזרת וביטול. הרצה: node tests/invite-browser-test.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = 'file://' + path.join(here, '..', 'app.html');
const browser = await chromium.launch();
const errors = [];
const failures = [];

function check(name, condition, detail) {
  if (condition) { console.log('  ✓ ' + name); return; }
  failures.push(name + (detail ? ' — ' + detail : ''));
  console.log('  ✗ ' + name + (detail ? ' — ' + detail : ''));
}

const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'he-IL' });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto(APP);
await page.waitForTimeout(400);
await page.click('[data-auth-mode="signup"]');
await page.waitForTimeout(200);
await page.fill('input[name="companyName"]', 'מייפון');
await page.fill('input[name="email"]', 'mgr@x.co.il');
await page.fill('input[name="password"]', 'secret123');
await page.click('#signup-form button[type="submit"]');
await page.waitForTimeout(1300);

await page.click('.tab[data-tab="users"]');
await page.waitForTimeout(500);

const chipOf = (email) => page.evaluate((mail) => {
  const rows = Array.from(document.querySelectorAll('#users-list tbody tr'));
  const row = rows.find(r => r.children[1].textContent.trim() === mail);
  if (!row) return null;
  const chip = row.querySelector('.invite-chip');
  return {
    text: chip ? chip.textContent.trim() : '',
    tone: chip ? chip.className.replace('invite-chip', '').trim() : '',
    canCancel: !!row.querySelector('[data-action="cancel-invite"]'),
    resend: (row.querySelector('[data-action="resend"]') || {}).textContent
  };
}, email);

console.log('\n== הזמנה שנשלחה ==');
await page.fill('#invite-form input[name="name"]', 'דני');
await page.fill('#invite-form input[name="email"]', 'dani@x.co.il');
await page.click('#invite-form button[type="submit"]');
await page.waitForTimeout(700);

let chip = await chipOf('dani@x.co.il');
check('ההזמנה מופיעה עם תאריך ובמצב "טרם נפתח"',
  !!chip && chip.text.includes('טרם נפתח') && /\d/.test(chip.text), JSON.stringify(chip));
check('אפשר לבטל הזמנה שטרם נוצלה', !!chip && chip.canCancel);
check('הכפתור מציע שליחה מחדש', !!chip && /מחדש/.test(chip.resend || ''), chip && chip.resend);

console.log('\n== הקישור פג ==');
/* מזיזים את תאריך ההזמנה יומיים אחורה – בדיוק מה שקורה ללקוח
   שהזמין ביום חמישי ובדק ביום ראשון. */
await page.evaluate(() => {
  const users = window.__backend.db.users;
  Object.keys(users).forEach(id => {
    if (users[id].email === 'dani@x.co.il') {
      users[id].invitedAt = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    }
  });
  window.__backend._save();
  window.ShiftUsersUI.render();
});
await page.waitForTimeout(400);
chip = await chipOf('dani@x.co.il');
check('אחרי יומיים הקישור מוצג כפג', !!chip && chip.text.includes('פג'), JSON.stringify(chip));
check('מצב "פג" מסומן כאזהרה', !!chip && chip.tone === 'warning', chip && chip.tone);

console.log('\n== שליחה חוזרת ==');
await page.click('#users-list [data-action="resend"]');
await page.waitForTimeout(700);
chip = await chipOf('dani@x.co.il');
check('שליחה חוזרת מחזירה את ההזמנה לתוקף',
  !!chip && chip.text.includes('טרם נפתח'), JSON.stringify(chip));
check('נאמר למנהל שהקישור נשלח',
  /dani@x\.co\.il/.test((await page.locator('#users-message').innerText()).trim()));

console.log('\n== ביטול הזמנה ==');
await page.click('#users-list [data-action="cancel-invite"]');
await page.waitForTimeout(400);
check('ביטול עובר דרך שאלה ולא מוחק מיד', await page.locator('.confirm-card').isVisible());
const askText = (await page.locator('.confirm-card').innerText()).trim();
check('השאלה אומרת מה קורה לקישור שכבר נשלח', /קישור/.test(askText), askText.slice(0, 80));

await page.click('.confirm-card [data-confirm-no]');
await page.waitForTimeout(400);
check('"השארה" באמת משאירה', !!(await chipOf('dani@x.co.il')));

await page.click('#users-list [data-action="cancel-invite"]');
await page.waitForTimeout(300);
await page.click('.confirm-card [data-confirm-yes]');
await page.waitForTimeout(700);
check('אחרי אישור ההזמנה נעלמה', (await chipOf('dani@x.co.il')) === null);
check('נאמר למנהל שההזמנה בוטלה',
  /בוטלה/.test((await page.locator('#users-message').innerText()).trim()));

console.log('\n== הצטרפות ==');
/* אותה כתובת פנויה שוב – זה כל הטעם בביטול */
await page.fill('#invite-form input[name="name"]', 'דני');
await page.fill('#invite-form input[name="email"]', 'dani@x.co.il');
await page.click('#invite-form button[type="submit"]');
await page.waitForTimeout(700);
check('אפשר להזמין שוב את אותה כתובת', !!(await chipOf('dani@x.co.il')));

const worker = await ctx.newPage();
worker.on('pageerror', e => errors.push('PAGE: ' + e.message));
await worker.goto(APP);
await worker.waitForTimeout(500);
await worker.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
await worker.evaluate(() => window.__backend.followLink('dani@x.co.il', 'invite'));
await worker.reload();
await worker.waitForTimeout(600);
await worker.fill('#password-form input[name="password"]', 'secret123');
await worker.fill('#password-form input[name="confirm"]', 'secret123');
await worker.click('#password-form button[type="submit"]');
await worker.waitForTimeout(1400);
check('העובד נכנס', await worker.locator('#employee-root').isVisible());
await worker.close();

await page.reload();
await page.waitForTimeout(1000);
/* המנהל חזר למסך – הכניסה של העובד רשומה, וההזמנה כבר לא תלויה */
await page.evaluate(() => { localStorage.removeItem('maiphone-mock-session-v1'); });
await page.reload();
await page.waitForTimeout(600);
await page.fill('#signin-form input[name="email"]', 'mgr@x.co.il');
await page.fill('#signin-form input[name="password"]', 'secret123');
await page.click('#signin-form button[type="submit"]');
await page.waitForTimeout(1300);
await page.click('.tab[data-tab="users"]');
await page.waitForTimeout(600);

chip = await chipOf('dani@x.co.il');
check('אחרי שהעובד נכנס המצב הוא "הצטרף"',
  !!chip && chip.text.includes('הצטרף'), JSON.stringify(chip));
check('מי שהצטרף אינו ניתן לביטול הזמנה', !!chip && chip.canCancel === false);
check('לו מוצע קישור לסיסמה, לא "שליחה מחדש"',
  !!chip && !/מחדש/.test(chip.resend || ''), chip && chip.resend);

console.log('\nשגיאות דפדפן: ' + (errors.length ? errors.join(' | ') : 'אין'));
console.log(failures.length === 0 ? '\n✅ כל הבדיקות עברו\n'
  : '\n❌ ' + failures.length + ' נכשלו:\n   ' + failures.join('\n   ') + '\n');
await browser.close();
process.exit(failures.length || errors.length ? 1 : 0);
