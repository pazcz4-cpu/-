/* אשף הפתיחה: ארבעה שלבים, מה שנשמר בכל אחד, והדילוג.
   הרצה: npm run test:onboarding */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = url('app.html');
const DESK = { width: 1440, height: 950 };
const PHONE = { width: 390, height: 844 };

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];

async function signUp(viewport, email, role) {
  const ctx = await browser.newContext({ viewport, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async d => { await d.accept(); });
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'פ.ט אינטק סחר');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'secret123');
  /* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
     עם הלקוח כשמשהו בחשבון דורש טיפול. */
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1500);
  return page;
}

try {
  console.log('\n== חשבון חדש נפתח על האשף, ולא על טבלה ריקה ==');
  const page = await signUp(DESK, 'boss@wiz.test');
  check('האשף פתוח', await page.locator('#onboarding').isVisible(), true);
  check('ארבעה שלבים', await page.locator('.wiz-step').count(), 4);
  check('הראשון פעיל', await page.locator('.wiz-step.now .wiz-step-name').innerText(), 'פרטי העסק');
  check('והוא מוכרז לקורא מסך',
    await page.locator('.wiz-step.now').getAttribute('aria-current'), 'step');
  check('הלוגו בראש', await page.locator('.wiz-brand img').count() > 0, true);

  console.log('\n== שלב 1: פרטי העסק ==');
  check('השם מההרשמה מופיע', await page.inputValue('#wiz-company'), 'פ.ט אינטק סחר');
  await page.fill('#wiz-company', '');
  await page.click('#wiz-next');
  await page.waitForTimeout(400);
  check('שם ריק נחסם', await page.locator('#wiz-error').innerText(), /שם עסק/);
  check('ולא התקדמנו', await page.locator('.wiz-step.now .wiz-step-name').innerText(), 'פרטי העסק');
  await page.fill('#wiz-company', 'קפה מרכז');
  await page.fill('#wiz-me', 'פז');
  await page.click('#wiz-next');
  await page.waitForTimeout(800);
  check('השם המסחרי נשמר ומופיע מיד בשורה העליונה',
    await page.locator('#user-bar .user-company').innerText(), 'קפה מרכז');
  check('וגם שם המשתמש', await page.locator('#user-bar .user-name').innerText(), /פז/);

  console.log('\n== שלב 2: סניפים ==');
  check('עברנו', await page.locator('.wiz-step.now .wiz-step-name').innerText(), 'סניפים');
  check('והשלב הקודם סומן כהושלם', await page.locator('.wiz-step.done').count(), 1);
  await page.click('#wiz-next');
  await page.waitForTimeout(400);
  check('בלי סניף אי אפשר להמשיך', await page.locator('#wiz-error').innerText(), /סניף/);
  await page.fill('.wiz-branch', 'סניף מרכז');
  await page.click('#wiz-add-branch');
  await page.waitForTimeout(250);
  await page.locator('.wiz-branch').nth(1).fill('סניף צפון');
  check('שתי שורות', await page.locator('.wiz-branch').count(), 2);
  /* חזרה ושוב קדימה לא יוצרת סניפים כפולים */
  await page.click('#wiz-next');
  await page.waitForTimeout(700);
  await page.click('#wiz-back');
  await page.waitForTimeout(400);
  check('החזרה מציגה את מה שנשמר', await page.locator('.wiz-branch').count(), 2);
  await page.click('#wiz-next');
  await page.waitForTimeout(700);
  check('ולא נוצרו כפולים',
    await page.evaluate(() => window.ShiftApp.getState().branches.length), 2);

  console.log('\n== שלב 3: משמרות ושעות ==');
  check('עברנו', await page.locator('.wiz-step.now .wiz-step-name').innerText(), 'משמרות ושעות');
  check('שלוש משמרות ברירת מחדל', await page.locator('.wiz-shift').count(), 3);
  await page.locator('.wiz-shift-from').first().fill('בבב');
  await page.click('#wiz-next');
  await page.waitForTimeout(400);
  check('שעה לא תקינה נחסמת', await page.locator('#wiz-error').innerText(), /שעה/);
  await page.locator('.wiz-shift-from').first().fill('08:00');
  await page.locator('.wiz-shift-name').first().fill('פתיחה');
  await page.click('#wiz-next');
  await page.waitForTimeout(800);
  check('השם והשעה נשמרו', await page.evaluate(() => {
    const shift = window.ShiftApp.getState().settings.shifts[0];
    return shift.name + ' ' + shift.from;
  }), 'פתיחה 08:00');
  check('והמזהה נשמר, כדי שהשיבוצים לא ינותקו',
    await page.evaluate(() => window.ShiftApp.getState().settings.shifts[0].id), 'morning');

  console.log('\n== שלב 4: עובדים ==');
  check('עברנו', await page.locator('.wiz-step.now .wiz-step-name').innerText(), 'עובדים');
  check('שתי דרכים', await page.locator('.wiz-option').count(), 2);
  check('עוד אין עובדים', await page.locator('#wiz-count').innerText(), /עוד לא נוספו/);
  await page.fill('#wiz-emp', 'דני');
  await page.click('#wiz-add-emp');
  await page.waitForTimeout(500);
  await page.fill('#wiz-emp', 'רונית');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  check('המונה מתעדכן', await page.locator('#wiz-count').innerText(), /2/);
  await page.click('#wiz-next');
  await page.waitForTimeout(900);

  console.log('\n== סיום ==');
  check('האשף נסגר', await page.locator('#onboarding').isHidden(), true);
  check('הסניפים בשרת',
    await page.evaluate(() => window.ShiftApp.getState().branches.length), 2);
  check('העובדים בשרת',
    await page.evaluate(() => window.ShiftApp.getState().employees.length), 2);
  check('הכל שרד רענון', await (async () => {
    await page.reload();
    await page.waitForTimeout(1500);
    return page.evaluate(() => {
      const state = window.ShiftApp.getState();
      return state.branches.length + '/' + state.employees.length;
    });
  })(), '2/2');
  check('והאשף אינו חוזר', await page.locator('#onboarding').isHidden(), true);

  console.log('\n== דילוג ==');
  const skipper = await signUp(DESK, 'skip@wiz.test');
  check('האשף עלה', await skipper.locator('#onboarding').isVisible(), true);
  await skipper.click('#wiz-skip');
  await skipper.waitForTimeout(500);
  check('נסגר', await skipper.locator('#onboarding').isHidden(), true);
  check('והמערכת מאחוריו פעילה', await skipper.locator('#generate').isVisible(), true);
  await skipper.reload();
  await skipper.waitForTimeout(1500);
  check('ולא חוזר אחרי רענון', await skipper.locator('#onboarding').isHidden(), true);

  console.log('\n== עובד אינו רואה אשף ==');
  /* אין לו מה להגדיר, ומסך שמכסה לו את הכל הוא רק מכשול */
  const boss = await signUp(DESK, 'boss2@wiz.test');
  await boss.click('#wiz-skip');
  await boss.waitForTimeout(400);
  await boss.click('.tab[data-tab="employees"]');
  await boss.waitForTimeout(400);
  await boss.click('#add-employee');
  await boss.waitForTimeout(600);
  await boss.click('.tab[data-tab="users"]');
  await boss.waitForTimeout(600);
  const opts = await boss.locator('#invite-form select[name="employeeId"] option')
    .evaluateAll(o => o.map(x => x.value).filter(Boolean));
  await boss.fill('#invite-form input[name="email"]', 'ronit@wiz.test');
  if (opts.length) await boss.selectOption('#invite-form select[name="employeeId"]', opts[0]);
  await boss.click('#invite-form button[type="submit"]');
  await boss.waitForTimeout(900);
  await boss.evaluate(async () => {
    window.__backend.followLink('ronit@wiz.test', 'invite');
    await window.__backend.setPassword('secret123');
  });
  await boss.evaluate(() => {
    localStorage.removeItem('maiphone-mock-session-v1');
    localStorage.removeItem('setshifts-onboarding');
  });
  await boss.reload();
  await boss.waitForTimeout(900);
  await boss.fill('input[name="email"]', 'ronit@wiz.test');
  await boss.fill('input[name="password"]', 'secret123');
  await boss.click('#signin-form button[type="submit"]');
  await boss.waitForTimeout(1600);
  check('לעובדת אין אשף', await boss.locator('#onboarding').isHidden(), true);
  check('והמסך שלה נטען', await boss.locator('#employee-root').isVisible(), true);

  console.log('\n== בטלפון האשף הוא המסך ==');
  const phone = await signUp(PHONE, 'phone@wiz.test');
  const box = await phone.locator('.wiz-card').boundingBox();
  check('ברוחב מלא', Math.round(box.width), 390);
  check('הכפתור הראשי נגיש לאגודל',
    Math.round((await phone.locator('#wiz-next').boundingBox()).height) >= 44, true);
  check('ורק שם השלב הנוכחי מוצג, כדי שארבעה לא ידחסו',
    await phone.locator('.wiz-step-name:visible').count(), 1);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות האשף עברו');
