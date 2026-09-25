/* אזור קריאות השירות: פתיחת קריאה, הופעתה ברשימה, אימות קלט,
   והכלל החשוב מכולן – קריאה של חברה אחת אינה נראית לחברה אחרת.
   הרצה: node tests/support-browser-test.mjs */
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
const browser = await chromium.launch();

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

async function signUp(company, email) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 950 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.fill('input[name="companyName"]', company);
  await page.fill('input[name="name"]', 'מנהל');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(900);
  return { ctx, page, errors };
}

async function openTicket(page, subject, body, kind) {
  await page.click('.tab[data-tab="support"]');
  await page.waitForTimeout(300);
  if (kind) await page.selectOption('#support-kind', kind);
  await page.fill('#support-form input[name="subject"]', subject);
  await page.fill('#support-form textarea[name="body"]', body);
  await page.click('#support-form button[type="submit"]');
  await page.waitForTimeout(600);
}

try {
  console.log('\n== חברה א פותחת קריאה ==');
  const a = await signUp('קפה מרכז', 'a@cafe.test');
  check('לשונית התמיכה גלויה', await a.page.locator('.tab[data-tab="support"]').isVisible(), true);

  await a.page.click('.tab[data-tab="support"]');
  await a.page.waitForTimeout(300);
  /* זמן המענה מדורג: תקלה שחוסמת עבודה מקבלת מספר אחר משאלה,
     והמסך אומר את שניהם לפני שפותחים קריאה. */
  const promise = await a.page.locator('#support-promise').textContent();
  check('ההבטחה נוקבת בזמן לתקלה', /4 שעות/.test(promise), true);
  check('ובזמן לשאר הפניות', /48 שעות/.test(promise), true);
  check('ואומרת מהן שעות הפעילות', /09:00–18:00/.test(promise), true);
  check('כתובת המייל מוצגת כערוץ',
    await a.page.locator('#support-mail').getAttribute('href'), 'mailto:support@setshifts.com');
  check('רשימה ריקה בהתחלה',
    await a.page.locator('#support-list').textContent(), /עדיין לא נפתחו/);

  await openTicket(a.page, 'הסידור לא נשמר', 'לחצתי שמירה והשבוע חזר לקדמותו.', 'bug');
  /* האישור על תקלה מבטיח את הזמן של תקלה, ולא 48 שעות: אישור
     שמבטיח יומיים על סידור שלא מתפרסם היום הוא הרגע שבו הלקוח
     מחליט להתקשר במקום לחכות. */
  const bugMessage = await a.page.locator('#support-message').textContent();
  check('אישור התקלה נוקב ב-4 שעות', /4 שעות/.test(bugMessage), true);
  check('ולא מבטיח 48', /48/.test(bugMessage), false);
  check('הקריאה מופיעה ברשימה',
    await a.page.locator('.ticket-subject').first().textContent(), 'הסידור לא נשמר');
  check('הסטטוס ההתחלתי',
    await a.page.locator('.ticket-status').first().textContent(), 'נפתחה');
  check('סוג הפנייה מוצג',
    await a.page.locator('.ticket-kind').first().textContent(), 'משהו לא עובד');
  check('הטופס התרוקן',
    await a.page.locator('#support-form input[name="subject"]').inputValue(), '');

  console.log('\n== בקשת פיתוח, ושתי קריאות ברשימה ==');
  await openTicket(a.page, 'ייצוא לאקסל לפי עובד', 'נשמח לקובץ שמסודר לפי עובד ולא לפי יום.', 'feature');
  check('שתי קריאות', await a.page.locator('.ticket').count(), 2);
  check('החדשה למעלה',
    await a.page.locator('.ticket-subject').first().textContent(), 'ייצוא לאקסל לפי עובד');
  check('והסוג שלה נכון',
    await a.page.locator('.ticket-kind').first().textContent(), 'בקשת פיתוח');
  check('ובקשת פיתוח מקבלת את הזמן הארוך',
    await a.page.locator('#support-message').textContent(), /48/);

  console.log('\n== אימות קלט ==');
  await a.page.fill('#support-form input[name="subject"]', '   ');
  await a.page.fill('#support-form textarea[name="body"]', '   ');
  await a.page.click('#support-form button[type="submit"]');
  await a.page.waitForTimeout(400);
  check('קריאה ריקה נדחית', await a.page.locator('.ticket').count(), 2);

  console.log('\n== בידוד: חברה ב אינה רואה את הקריאות של חברה א ==');
  const b = await signUp('פיצה דרום', 'b@pizza.test');
  await b.page.click('.tab[data-tab="support"]');
  await b.page.waitForTimeout(400);
  check('אין לה קריאות', await b.page.locator('.ticket').count(), 0);
  check('והרשימה ריקה',
    await b.page.locator('#support-list').textContent(), /עדיין לא נפתחו/);
  check('הנושא של חברה א אינו מופיע אצלה',
    (await b.page.locator('#tab-support').textContent()).includes('הסידור לא נשמר'), false);

  await openTicket(b.page, 'שאלה על חיוב', 'מתי בדיוק מתבצע החיוב הראשון?', 'question');
  check('חברה ב רואה רק את שלה', await b.page.locator('.ticket').count(), 1);

  await a.page.click('.tab[data-tab="schedule"]');
  await a.page.click('.tab[data-tab="support"]');
  await a.page.waitForTimeout(500);
  check('וחברה א עדיין רואה רק את שתיים שלה',
    await a.page.locator('.ticket').count(), 2);

  console.log('\n== החלפת שפה ==');
  await a.page.selectOption('#user-language', 'en');
  await a.page.waitForTimeout(500);
  check('הסטטוס תורגם',
    await a.page.locator('.ticket-status').first().textContent(), 'Open');
  check('סוג הפנייה תורגם',
    await a.page.locator('.ticket-kind').first().textContent(), 'Feature request');
  check('והנושא שהלקוח כתב נשאר כמו שהוא',
    await a.page.locator('.ticket-subject').first().textContent(), 'ייצוא לאקסל לפי עובד');

  const errors = [...a.errors, ...b.errors];
  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות קריאות השירות עברו');
