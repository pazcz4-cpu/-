/* העוזר בתוך האפליקציה: הכפתור, הפאנל, ושהתשובה אינה מוזרקת כ-HTML.
   השרת מדומה (אין מפתח ואין רשת), ולכן התשובה מסומנת "מצב פיתוח".
   הרצה: node tests/assistant-browser-test.mjs */
import { createRequire } from 'node:module';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual));
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'he-IL' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', async (d) => { await d.accept(); });

try {
  await skipWizard(page);
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

  console.log('\n== הכפתור והפאנל ==');
  check('כפתור העזרה מוצג לבעלים', await page.locator('#assistant-fab').isVisible(), true);
  check('הפאנל סגור בהתחלה', await page.locator('#assistant-panel').isHidden(), true);
  await page.click('#assistant-fab');
  check('הפאנל נפתח', await page.locator('#assistant-panel').isVisible(), true);
  check('יש שלוש שאלות לדוגמה', await page.locator('.assistant-examples [data-example]').count(), 3);
  check('ההערה על סיסמאות מוצגת', await page.locator('.assistant-note').innerText(), /סיסמאות/);

  console.log('\n== שאלה ותשובה ==');
  await page.click('.assistant-examples [data-example]');
  await page.waitForSelector('.assistant-msg.from-bot:not(.is-typing)');
  check('השאלה מוצגת', await page.locator('.assistant-msg.from-user').first().innerText(), /מפרסמים/);
  check('התשובה מוצגת', await page.locator('.assistant-msg.from-bot').first().innerText(), /תשובה מדומה/);
  check('שאלות הדוגמה נעלמו אחרי השאלה הראשונה', await page.locator('.assistant-examples').count(), 0);

  console.log('\n== תשובה אינה מוזרקת כ-HTML ==');
  await page.fill('#assistant-input', '<img src=x onerror="window.__pwned=1"> **מודגש**');
  await page.press('#assistant-input', 'Enter');
  await page.waitForSelector('.assistant-msg.from-bot:nth-of-type(4)');
  await page.waitForTimeout(300);
  check('לא נוצר אלמנט img מתוך התשובה', await page.locator('#assistant-log img').count(), 0);
  check('הקוד לא הורץ', await page.evaluate(() => window.__pwned === 1), false);
  check('הטקסט המודגש עוצב', await page.locator('#assistant-log strong').count() >= 1, true);

  console.log('\n== סגירה ==');
  await page.keyboard.press('Escape');
  check('Escape סוגר', await page.locator('#assistant-panel').isHidden(), true);

  console.log('\n== עובד אינו מקבל את העוזר ==');
  const employeeGetsIt = await page.evaluate(() => {
    document.getElementById('assistant-fab').remove();
    document.getElementById('assistant-panel').remove();
    window.ShiftAssistantUI.init({ backend: {}, session: { user: { role: 'employee' } } });
    return !!document.getElementById('assistant-fab');
  });
  check('בלי כפתור לעובד', employeeGetsIt, false);

  check('אין שגיאות בדף', errors.length, 0);
  if (errors.length) console.log(errors);
} finally {
  await browser.close();
}
if (failures.length) { console.log('\n❌ ' + failures.length + ' נכשלו'); process.exit(1); }
console.log('\n✅ העוזר בתוך האפליקציה עובד');
