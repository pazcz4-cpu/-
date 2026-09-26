/* הזהות בשורה העליונה: מי העסק, מי המשתמש, ועריכה של כל אחד
   מהם בנפרד. הרצה: npm run test:account */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = url('app.html');

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
  await skipWizard(page);
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
  /* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
     עם הלקוח כשמשהו בחשבון דורש טיפול. */
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1300);

  console.log('\n== שני השמות בשורה העליונה, זה מעל זה ==');
  const company = await page.locator('#user-bar .user-company').innerText();
  const user = await page.locator('#user-bar .user-name').innerText();
  check('שם העסק בשורה העליונה', company, 'פ.ט אינטק סחר');
  check('ומתחתיו המשתמש והתפקיד', user, /מייפון הכיסוי המושלם בעמ · בעלים/);
  /* שני שמות באותה שורה נראים כמו שני חשבונות פתוחים. אחד מעל
     השני נקרא כ"העסק, ובתוכו אני". */
  check('הם זה מעל זה ולא זה לצד זה', await page.evaluate(() => {
    const el = document.querySelector('#user-id, #user-account');
    return getComputedStyle(el).flexDirection;
  }), 'column');
  check('והעסק בולט מהמשתמש', await page.evaluate(() => {
    const weight = (sel) => Number(getComputedStyle(document.querySelector(sel)).fontWeight);
    return weight('#user-bar .user-company') > weight('#user-bar .user-name');
  }), true);
  check('שניהם כפתור אחד שפותח את החשבון',
    await page.locator('#user-account .user-company').count(), 1);

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
    await page.locator('#user-bar .user-company').innerText(), 'פ.ט אינטק סחר');

  console.log('\n== פרטי העסק נערכים בהגדרות, ולא בשני מקומות ==');
  /* שני טפסים לאותו שדה נראים כמו שני ערכים. בחשבון שלי השם רק
     מוצג, והמשתמש מופנה למקום שבו הוא נערך יחד עם הח.פ. */
  check('אין שדה לשם העסק בחשבון שלי',
    await page.locator('#account-company').count(), 0);
  check('ונאמר לבעלים איפה כן',
    await page.locator('#account-panel').innerText(), /בהגדרות/);
  await page.click('#account-close');
  await page.waitForTimeout(200);

  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(400);
  check('הבלוק גלוי לבעלים',
    await page.locator('#company-details').isVisible(), true);
  check('השם הנוכחי מופיע בשדה',
    await page.locator('#company-name').inputValue(), 'פ.ט אינטק סחר');
  await page.fill('#company-name', 'מייפון');
  /* כפי שלקוח מקליד אותו בפועל: עם רווחים */
  await page.fill('#company-tax-id', ' 51-234 567 8 ');
  await page.click('#save-company-details');
  await page.waitForTimeout(700);
  check('נאמר שנשמר', await page.locator('#company-message').innerText(), /נשמר/);
  check('שם העסק התחלף בשורה העליונה',
    await page.locator('#user-bar .user-company').innerText(), 'מייפון');
  check('ושם המשתמש לא זז',
    await page.locator('#user-bar .user-name').innerText(), /פז · בעלים/);
  check('והמספר חזר למסך נקי',
    await page.locator('#company-tax-id').inputValue(), '51-2345678');

  console.log('\n== השינוי נשמר בשרת, לא רק על המסך ==');
  await page.reload();
  await page.waitForTimeout(1300);
  check('אחרי רענון – שם המשתמש', await page.locator('#user-bar .user-name').innerText(), /פז/);
  check('אחרי רענון – שם העסק', await page.locator('#user-bar .user-company').innerText(), 'מייפון');
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(400);
  check('אחרי רענון – מספר העוסק',
    await page.locator('#company-tax-id').inputValue(), '51-2345678');
  await page.click('#user-account');
  await page.waitForTimeout(400);
  await page.click('#user-account');
  await page.waitForTimeout(300);

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
    await page.locator('#account-panel .account-static').innerText(), 'מייפון');
  /* ובמקום שבו הוא באמת נחוץ הוא כן מופיע: מסך העובד, שצריך
     לומר לעובדת היכן היא עובדת. שם הוא לא מתחרה במיתוג. */
  check('שם העסק מופיע בכותרת מסך העובד',
    await page.locator('.employee-company').innerText(), 'מייפון');
  check('ולצידו הלוגו של SetShifts',
    await page.locator('.employee-head .brand-img, .employee-head img').count() > 0, true);

  /* וגם בשרת: ניסיון ישיר לשנות את שם העסק כעובדת נדחה */
  const denied = await page.evaluate(async () => {
    try { await window.__backend.renameCompany('לא שלי'); return 'עבר'; }
    catch (err) { return err.code || 'נדחה'; }
  });
  check('עובדת אינה יכולה לשנות את שם העסק גם בקריאה ישירה', denied, 'forbidden');

  /* ===== אותו שם בשני השדות =====
     בעלים רבים ממלאים את שם העסק גם בשדה "שם מלא", ואז הכפתור
     הציג את אותו שם פעמיים, זה מעל זה. */
  console.log('\n== שם עסק זהה לשם המשתמש אינו מופיע פעמיים ==');
  const twin = await mk();
  await skipWizard(twin);
  await twin.goto(APP);
  await twin.waitForTimeout(400);
  await twin.click('[data-auth-mode="signup"]');
  await twin.waitForTimeout(200);
  await twin.fill('input[name="companyName"]', 'סטשיפטס בעמ');
  await twin.fill('input[name="name"]', 'סטשיפטס בעמ');
  await twin.fill('input[name="email"]', 'twin@id.test');
  await twin.fill('input[name="password"]', 'secret123');
  /* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
     עם הלקוח כשמשהו בחשבון דורש טיפול. */
  await twin.fill('input[name="phone"]', '054-1234567');
  await twin.click('#signup-form button[type="submit"]');
  await twin.waitForTimeout(1300);
  check('שם העסק מופיע פעם אחת בלבד', await twin.evaluate(() => {
    const text = document.querySelector('#user-account').innerText;
    return (text.match(/סטשיפטס בעמ/g) || []).length;
  }), 1);
  check('ובשורה השנייה נשאר התפקיד',
    await twin.locator('#user-bar .user-name').innerText(), 'בעלים');

  /* ===== ההסכמה לדיוור =====

     תיבה שאינה מסומנת מראש, ונוסח שנשמר כפי שהוצג. השאלה
     שנשאלת בדיעבד אינה "האם הוא הסכים" אלא "מתי, ומה עמד מול
     העיניים שלו" -- ולכן גם התאריך וגם הטקסט נבדקים כאן. */
  console.log('\n== הסכמה לדיוור ==');
  const third = await mk();
  await skipWizard(third);
  await third.goto(APP);
  await third.waitForTimeout(400);
  await third.click('[data-auth-mode="signup"]');
  await third.waitForTimeout(250);

  check('התיבה אינה מסומנת מראש',
    await third.locator('input[name="waOptIn"]').isChecked(), false);

  await third.fill('input[name="companyName"]', 'עסק שהסכים');
  await third.fill('input[name="email"]', 'optin@test.co.il');
  await third.fill('input[name="password"]', 'secret123');
  await third.fill('input[name="phone"]', '054-7654321');
  const shown = (await third.locator('.auth-check span').innerText()).trim();
  await third.check('input[name="waOptIn"]');
  await third.click('#signup-form button[type="submit"]');
  await third.waitForTimeout(1300);

  const consent = await third.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('maiphone-mock-server-v1'));
    const company = Object.values(raw.companies).filter((c) => c.name === 'עסק שהסכים')[0];
    return company && {
      optIn: company.waOptIn, at: company.waOptInAt, text: company.waOptInText
    };
  });
  check('ההסכמה נשמרה', consent && consent.optIn, true);
  check('עם תאריך', !!(consent && consent.at), true);
  /* הנוסח שנשמר הוא הנוסח שהוצג, ולא תיאור שלו */
  check('והנוסח שנשמר הוא זה שהוצג', consent && consent.text, shown);

  /* ומי שלא סימן -- לא רשום כמי שהסכים */
  const fourth = await mk();
  await skipWizard(fourth);
  await fourth.goto(APP);
  await fourth.waitForTimeout(400);
  await fourth.click('[data-auth-mode="signup"]');
  await fourth.waitForTimeout(250);
  await fourth.fill('input[name="companyName"]', 'עסק ששתק');
  await fourth.fill('input[name="email"]', 'quiet@test.co.il');
  await fourth.fill('input[name="password"]', 'secret123');
  await fourth.fill('input[name="phone"]', '054-1111111');
  await fourth.click('#signup-form button[type="submit"]');
  await fourth.waitForTimeout(1300);
  check('מי שלא סימן אינו רשום כמסכים', await fourth.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('maiphone-mock-server-v1'));
    const company = Object.values(raw.companies).filter((c) => c.name === 'עסק ששתק')[0];
    return company && company.waOptIn;
  }), false);

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
