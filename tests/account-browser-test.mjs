/* הזהות בשורה העליונה: מי העסק, מי המשתמש, ועריכה של כל אחד
   מהם בנפרד. הרצה: npm run test:account */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = 'file://' + path.join(here, '..', 'app.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];
async function mk() {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async d => { await d.accept(); });
  return page;
}

try {
  const page = await mk();
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  /* בדיוק המצב שממנו זה התחיל: שם רשם החברות בשדה אחד, שם אחר
     לגמרי בשני, ושניהם מופיעים יחד בשורה העליונה. */
  await page.fill('input[name="companyName"]', 'פ.ט אינטק סחר');
  await page.fill('input[name="name"]', 'מייפון הכיסוי המושלם בעמ');
  await page.fill('input[name="email"]', 'boss@id.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1300);

  console.log('\n== שני השמות בשורה העליונה, כל אחד עם תווית ==');
  const company = await page.locator('#user-bar .user-company').innerText();
  const user = await page.locator('#user-bar .user-name').innerText();
  check('שם העסק נושא תווית', company, /^עסק/);
  check('ובתוכו השם שנקלט בהרשמה', company, /פ\.ט אינטק סחר/);
  check('שם המשתמש נושא תווית משלו', user, /^מחובר\/ת/);
  check('ובתוכו השם והתפקיד', user, /מייפון הכיסוי המושלם בעמ · בעלים/);
  check('שני השמות הם כפתור אחד שפותח את החשבון',
    await page.locator('#user-id, #user-account').count(), 1);

  console.log('\n== המגירה סגורה עד שלוחצים ==');
  check('סגורה', await page.locator('#account-panel').isVisible(), false);
  await page.click('#user-account');
  await page.waitForTimeout(300);
  check('נפתחה', await page.locator('#account-panel').isVisible(), true);
  check('הכפתור מדווח שהיא פתוחה',
    await page.locator('#user-account').getAttribute('aria-expanded'), 'true');
  check('המייל מוצג, כדי לדעת באיזה חשבון מדובר',
    await page.locator('#account-panel').innerText(), /boss@id\.test/);

  console.log('\n== עריכת שם המשתמש בלבד ==');
  await page.fill('#account-name', 'פז');
  await page.click('#account-save-name');
  await page.waitForTimeout(600);
  check('נאמר שנשמר', await page.locator('#account-message').innerText(), /נשמר/);
  check('השורה העליונה מציגה את השם החדש',
    await page.locator('#user-bar .user-name').innerText(), /פז · בעלים/);
  check('ושם העסק לא זז',
    await page.locator('#user-bar .user-company').innerText(), /פ\.ט אינטק סחר/);

  console.log('\n== עריכת שם העסק בלבד ==');
  await page.fill('#account-company', 'מייפון');
  await page.click('#account-save-company');
  await page.waitForTimeout(600);
  check('שם העסק התחלף',
    await page.locator('#user-bar .user-company').innerText(), /מייפון$/);
  check('ושם המשתמש לא זז',
    await page.locator('#user-bar .user-name').innerText(), /פז · בעלים/);

  console.log('\n== השינוי נשמר בשרת, לא רק על המסך ==');
  await page.reload();
  await page.waitForTimeout(1300);
  check('אחרי רענון – שם העסק', await page.locator('#user-bar .user-company').innerText(), /מייפון$/);
  check('אחרי רענון – שם המשתמש', await page.locator('#user-bar .user-name').innerText(), /פז/);

  console.log('\n== שם ריק אינו נשמר ==');
  await page.click('#user-account');
  await page.waitForTimeout(300);
  await page.fill('#account-name', '   ');
  await page.click('#account-save-name');
  await page.waitForTimeout(400);
  check('נאמר שצריך שם', await page.locator('#account-message').innerText(), /צריך להזין שם/);
  check('והשם הישן נשאר', await page.locator('#user-bar .user-name').innerText(), /פז/);

  console.log('\n== עובד: מתקן את שמו, ואינו נוגע בשם העסק ==');
  /* company_users_update דורש מנהל, ולכן עובד לא יכול היה לתקן
     שגיאת כתיב בשמו. השרת האמיתי עושה זאת דרך save_own_name. */
  await page.fill('#account-name', 'פז');
  await page.click('#account-save-name');
  await page.waitForTimeout(500);
  await page.click('.tab[data-tab="users"]');
  await page.waitForTimeout(500);
  const opts = await page.locator('#invite-form select[name="employeeId"] option')
    .evaluateAll(o => o.map(x => x.value).filter(Boolean));
  await page.fill('#invite-form input[name="name"]', 'רונית');
  await page.fill('#invite-form input[name="email"]', 'ronit@id.test');
  if (opts.length) await page.selectOption('#invite-form select[name="employeeId"]', opts[0]);
  await page.click('#invite-form button[type="submit"]');
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    window.__backend.followLink('ronit@id.test', 'invite');
    await window.__backend.setPassword('secret123');
  });
  await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await page.reload();
  await page.waitForTimeout(700);
  await page.fill('input[name="email"]', 'ronit@id.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signin-form button[type="submit"]');
  await page.waitForTimeout(1400);

  await page.click('#user-account');
  await page.waitForTimeout(300);
  check('לעובדת יש שדה שם משלה', await page.locator('#account-name').count(), 1);
  check('ואין לה שדה לשם העסק', await page.locator('#account-company').count(), 0);
  check('ונאמר לה למה', await page.locator('#account-panel').innerText(), /רק בעל החשבון/);
  await page.fill('#account-name', 'רונית כהן');
  await page.click('#account-save-name');
  await page.waitForTimeout(600);
  check('השם שלה התעדכן',
    await page.locator('#user-bar .user-name').innerText(), /רונית כהן/);
  check('ושם העסק נשאר של העסק',
    await page.locator('#user-bar .user-company').innerText(), /מייפון$/);

  /* וגם בשרת: ניסיון ישיר לשנות את שם העסק כעובדת נדחה */
  const denied = await page.evaluate(async () => {
    try { await window.__backend.renameCompany('לא שלי'); return 'עבר'; }
    catch (err) { return err.code || 'נדחה'; }
  });
  check('עובדת אינה יכולה לשנות את שם העסק גם בקריאה ישירה', denied, 'forbidden');

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות הזהות עברו');
