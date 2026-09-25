/* טלפון חובה בהרשמה, ולוגו העסק שמופיע למנהל ולעובדים.

   שני הדברים האלה נבדקים יחד כי הם אותו מסך: פרטי העסק
   בהגדרות. הרצה: npm run test:brand */
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

/* לוגו אמיתי ולא מחרוזת מומצאת: הקוד מצייר אותו על canvas,
   וקובץ שאינו תמונה נכשל בשלב אחר לגמרי ולא היה בודק כלום.
   נוצר כאן במקודד של המאגר עצמו — מלבן כחול 8x4 — כדי שלא
   תשב בבדיקה מחרוזת base64 שאיש אינו יודע מה יש בה. */
const png = require('../tools/optimize-png.js');
const LOGO_PNG = (function () {
  const width = 8, height = 4;
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = 0x23; data[i * 3 + 1] = 0x49; data[i * 3 + 2] = 0x9f;
  }
  return png.encode({ width, height, channels: 3, colorType: 2, data });
})();

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

  console.log('\n== הטלפון נדרש בהרשמה ==');
  check('יש שדה טלפון בטופס', await page.locator('#signup-form input[name="phone"]').count(), 1);
  check('והוא מסומן חובה',
    await page.locator('#signup-form input[name="phone"]').getAttribute('required'), '');

  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@brand.test');
  await page.fill('input[name="password"]', 'secret123');

  /* מספר שאינו מספר. הדפדפן אינו חוסם type="tel", ולכן הבדיקה
     היא שלנו — ולקוח שיעקוף אותה יוצר חשבון שאין לנו דרך
     להגיע אליו. */
  await page.fill('input[name="phone"]', '123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(500);
  check('מספר קצר מדי נדחה',
    await page.locator('#auth-error, .auth-error').first().isVisible().catch(() => false), true);
  check('ולא נוצר חשבון', await page.locator('#signup-form').count(), 1);

  /* מספר מחו"ל חייב לעבור: המוצר נמכר בשמונה שפות, ותבנית
     ישראלית הייתה חוסמת כל לקוח שאינו מישראל. */
  await page.fill('input[name="phone"]', '+49 30 1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1400);
  check('מספר גרמני התקבל', await page.locator('#user-bar .user-company').count(), 1);

  await loadSample(page);
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(500);

  console.log('\n== הטלפון נשמר ואפשר לעדכן אותו ==');
  check('הטלפון שהוזן בהרשמה מופיע בהגדרות',
    await page.locator('#company-phone').inputValue(), '+49 30 1234567');
  await page.fill('#company-phone', '054-1234567');
  await page.click('#save-company-details');
  await page.waitForTimeout(700);
  check('נשמר', await page.locator('#company-message').innerText(), /נשמרו/);
  /* ריקון הטלפון אינו אפשרי: הוא נדרש בהרשמה בדיוק כדי שתמיד
     תהיה דרך ליצירת קשר. */
  await page.fill('#company-phone', '');
  await page.click('#save-company-details');
  await page.waitForTimeout(500);
  check('אי אפשר למחוק אותו', await page.locator('#company-message').innerText(), /טלפון/);
  await page.fill('#company-phone', '054-1234567');

  console.log('\n== העלאת לוגו ==');
  check('בהתחלה אין לוגו',
    await page.locator('#company-logo-preview').getAttribute('class'), /is-empty/);
  check('וכפתור ההסרה מוסתר',
    await page.locator('#company-logo-clear').isVisible(), false);

  await page.setInputFiles('#company-logo-file', {
    name: 'logo.png', mimeType: 'image/png', buffer: LOGO_PNG
  });
  await page.waitForTimeout(700);
  check('התצוגה המקדימה מציגה את הלוגו',
    await page.locator('#company-logo-preview img').count(), 1);
  /* הלוגו נשמר רק בלחיצה על "שמירת פרטי העסק", כמו שאר השדות
     במקטע — אחרת יש שתי דרכי שמירה באותו טופס. */
  check('ונאמר שהוא עוד לא נשמר',
    await page.locator('#company-message').innerText(), /שמירת פרטי העסק/);

  await page.click('#save-company-details');
  await page.waitForTimeout(900);

  console.log('\n== הלוגו מופיע למנהל ==');
  check('בשורה העליונה', await page.locator('#user-bar .user-logo').count(), 1);
  /* הלוגו בא לפני השם ולא במקומו: לוגו לבדו אינו אומר באיזה
     חשבון אני, ושם לבדו אינו נראה כמו המערכת של מקום העבודה. */
  check('לצד שם העסק ולא במקומו',
    await page.locator('#user-bar .user-company').innerText(), 'קפה מרכז');
  check('והסרגל לא קפץ בגובה', await page.evaluate(() => {
    const img = document.querySelector('#user-bar .user-logo');
    return Math.round(img.getBoundingClientRect().height);
  }), 28);

  console.log('\n== והוא מופיע גם לעובדים ==');
  /* "מה העובד יראה" פותח קודם רשימה לבחירת עובד, ורק אחריה
     את המסך עצמו. */
  await page.click('#user-preview');
  await page.waitForTimeout(400);
  await page.locator('.preview-pick').first().click();
  await page.waitForTimeout(1200);
  check('בכותרת מסך העובד', await page.locator('.employee-logo.is-company img').count(), 1);
  /* כשיש לוגו של הלקוח הוא מחליף את זה של SetShifts: העובד
     פותח את המסך מקישור במייל, ומה שצריך לענות לו בשנייה
     הראשונה הוא "זה מקום העבודה שלי". */
  check('במקום הלוגו של SetShifts',
    await page.locator('.employee-head .brand-img').count(), 0);
  check('לצד שם העסק',
    await page.locator('.employee-company').innerText(), 'קפה מרכז');

  console.log('\n== הסרת הלוגו מחזירה את המצב הקודם ==');
  const exit = page.locator('#preview-exit');
  if (await exit.isVisible().catch(() => false)) { await exit.click(); await page.waitForTimeout(900); }
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(500);
  await page.click('#company-logo-clear');
  await page.waitForTimeout(200);
  await page.click('#save-company-details');
  await page.waitForTimeout(900);
  check('הלוגו ירד מהסרגל', await page.locator('#user-bar .user-logo').count(), 0);
  check('והתצוגה המקדימה ריקה שוב',
    await page.locator('#company-logo-preview').getAttribute('class'), /is-empty/);

  console.log('\n== קובץ שאינו תמונה נדחה ==');
  await page.setInputFiles('#company-logo-file', {
    name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('לא תמונה')
  });
  await page.waitForTimeout(500);
  check('נאמר מה מקובל',
    await page.locator('#company-message').innerText(), /PNG/);
  check('ולא נשמר כלום', await page.locator('#company-logo-preview img').count(), 0);

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
console.log('\n✅ כל בדיקות הטלפון והלוגו עברו');
