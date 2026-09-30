/* מסלול המנוי: תקופת ניסיון, מגבלת עובדים, שדרוג תוכנית וחסימה.
   הרצה: npm run test:billing */
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
const OUT = path.join(here, '..', 'dist');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('dialog', async d => { await d.accept(); });

await skipWizard(page);

await page.goto(APP);
await page.waitForTimeout(400);
await page.click('[data-auth-mode="signup"]');
await page.waitForTimeout(200);
await page.fill('input[name="companyName"]', 'עסק לבדיקה');
await page.fill('input[name="email"]', 'boss@test.co.il');
await page.fill('input[name="password"]', 'secret123');
/* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
   עם הלקוח כשמשהו בחשבון דורש טיפול. */
await page.fill('input[name="phone"]', '054-1234567');
await page.click('#signup-form button[type="submit"]');
await page.waitForTimeout(1300);

console.log('1. לשונית מנוי גלויה לבעלים:', await page.locator('.tab[data-tab="billing"]').isVisible());
await page.click('.tab[data-tab="billing"]');
await page.waitForTimeout(500);

/* ברירת המחדל היא פיילוט: אין ספק סליקה, ולכן אין מה ללחוץ.
   מסלול החיוב עצמו נבדק כאן על ספק "מחובר", בדיוק כפי שיהיה
   ברגע ש-PayPlus יחובר. */
/* גם בפיילוט יש מעבר תוכנית: התוכנית היא תקרה ומחיר, והמחיר
   נגבה בחיוב הבא – מסך שמציג מחירון בלי דרך לעבור משאיר לקוח
   תקוע בדיוק כשהוא רוצה לשלם יותר. */
console.log('   גם בפיילוט אפשר לעבור תוכנית:',
  (await page.locator('#billing-panel [data-plan]').count()) > 0);
await page.evaluate(() => {
  window.ShiftModel.setBillingLive(true);
  window.ShiftBillingUI.render();
});
await page.waitForTimeout(300);

const rows = (await page.locator('.billing-row').allInnerTexts()).map(t => t.replace(/\n/g, ': '));
rows.forEach(r => console.log('   ' + r));

/* לחבילת הרשתות אין .plan-price אלא .plan-quote: אין לה מחיר
   מחירון להציג. קריאה עיוורת ל-.plan-price הפילה כאן את כל
   הבדיקה ברגע שנוספה החבילה. */
const plans = await page.locator('.plan-card').evaluateAll(cards => cards.map(c => ({
  name: c.querySelector('.plan-name').textContent,
  price: (c.querySelector('.plan-price') || c.querySelector('.plan-quote'))
    .textContent.replace(/\s+/g, ''),
  range: c.querySelector('.plan-range').textContent,
  current: c.classList.contains('current'),
  quote: c.classList.contains('quote'),
  choosable: !!c.querySelector('[data-plan]')
})));
console.log('2. תוכניות:', plans.map(p => `${p.name} ${p.price} (${p.range})${p.current ? ' ← נוכחית' : ''}`).join(' | '));

/* חבילת הצעת־מחיר אינה נמכרת מהמסך: אין לה מחיר לגבות, ולחיצה
   עליה הייתה מעבירה לקוח לתוכנית שעולה אפס. */
const quoteCard = plans.filter((p) => p.quote);
if (quoteCard.length !== 1) {
  throw new Error('ציפינו לחבילת הצעת־מחיר אחת, התקבלו ' + quoteCard.length);
}
if (quoteCard[0].choosable) {
  throw new Error('חבילת הצעת־מחיר הוצעה לבחירה בלחיצה');
}
if (/\d/.test(quoteCard[0].price)) {
  throw new Error('חבילת הצעת־מחיר הציגה מספר: ' + quoteCard[0].price);
}
console.log('   חבילת הרשתות: ' + quoteCard[0].price + ' — בלי כפתור בחירה ✓');
await page.screenshot({ path: OUT + '/billing.png', fullPage: false });

// מגבלת עובדים: חשבון חדש נפתח ריק, ולכן טוענים את עסק הדוגמה
// (8 עובדים) ובודקים את המגבלה של התוכנית הקטנה – עד 10.
await page.click('.tab[data-tab="employees"]');
await page.waitForTimeout(400);
console.log('   חשבון חדש נפתח ריק:',
  (await page.locator('#employees-list .card').count()) === 0);
await loadSample(page);
await page.click('.tab[data-tab="employees"]');
await page.waitForTimeout(400);
const before = await page.locator('#employees-list .card').count();
console.log('3. עובדים כרגע:', before);
for (let i = 0; i < 2; i++) {
  await page.click('#add-employee');
  await page.waitForTimeout(400);
}
const after = await page.locator('#employees-list .card').count();
console.log('   מילוי עד התקרה:', after, '| זו התקרה של התוכנית הקטנה:', after === 10);

/* העובד ה-11: תקרה שמציעה מוצא, לא רק מודיעה שנחסמת */
await page.click('#add-employee');
await page.waitForTimeout(600);
console.log('4. ההצעה מופיעה:', await page.locator('.confirm-card').isVisible());
console.log('   ' + (await page.locator('.confirm-card').innerText()).replace(/\n/g, ' · '));
await page.click('.confirm-card [data-confirm-no]');
await page.waitForTimeout(400);
console.log('   ביטול אינו מוסיף ואינו משדרג:',
  (await page.locator('#employees-list .card').count()) === 10,
  await page.evaluate(() => window.__backend.session().company.plan));

await page.click('#add-employee');
await page.waitForTimeout(600);
await page.click('.confirm-card [data-confirm-yes]');
await page.waitForTimeout(1400);
console.log('5. אחרי אישור:',
  'עובדים', await page.locator('#employees-list .card').count(),
  '| תוכנית', await page.evaluate(() => window.__backend.session().company.plan));
console.log('   הודעה:', (await page.locator('#toast').innerText()).trim());

await page.click('.tab[data-tab="billing"]');
await page.waitForTimeout(600);
const nowRows = (await page.locator('.billing-row').allInnerTexts()).map(t => t.replace(/\n/g, ': '));
console.log('   ' + nowRows[1]);
console.log('   ' + nowRows[0]);
console.log('   שורת המשתמש:', (await page.locator('#user-bar').innerText()).replace(/\n/g, ' | '));

/* מעבר תוכנית מתוך מסך המנוי עובר דרך אותה שאלה בדיוק */
await page.click('.plan-card:not(.current) [data-plan="business"]');
await page.waitForTimeout(500);
console.log('6. גם מסך המנוי שואל לפני שינוי:',
  await page.locator('.confirm-card').isVisible());
await page.click('.confirm-card [data-confirm-yes]');
await page.waitForTimeout(900);
console.log('   אחרי שינוי:', (await page.locator('#billing-message').innerText()).trim(),
  '| תוכנית', await page.evaluate(() => window.__backend.session().company.plan));

/* ===== קופון =====

   הקופון נוגע בכסף: הוא מאריך תוקף או מוזיל חיוב. לכן נבדק
   כאן לא רק שהוא עובד, אלא גם מה שאסור -- קוד שאינו קיים,
   וקופון שני אחרי שכבר מומש אחד. */
console.log('\n== קופון ==');
/* השדה גלוי מיד, בלי לחיצה. קודם זו הייתה מגירה מקופלת, ומי
   שקיבל קוד פשוט לא מצא אותה. */
console.log('8. השדה גלוי בלי לפתוח כלום:',
  await page.locator('#coupon-code').isVisible());

/* קוד שאינו קיים אינו משנה דבר */
await page.fill('#coupon-code', 'NOSUCHCODE');
await page.click('#coupon-apply');
await page.waitForTimeout(700);
console.log('   קוד שאינו קיים:', (await page.locator('#billing-message').innerText()).trim());

const wasUntil = await page.evaluate(() => window.__backend.session().company.validUntil);
await page.fill('#coupon-code', 'extra-month');
await page.click('#coupon-apply');
await page.waitForTimeout(900);
const nowUntil = await page.evaluate(() => window.__backend.session().company.validUntil);
const added = Math.round((new Date(nowUntil) - new Date(wasUntil)) / 86400000);
console.log('9. קופון ימים:', (await page.locator('#billing-message').innerText()).trim());
console.log('   ימים שנוספו לתוקף:', added, added === 30 ? '✓' : '✗');
if (added !== 30) errors.push('הקופון לא הוסיף שלושים ימים');

/* קופון אחד ללקוח: השדה נעלם, ובמקומו הקוד שמומש */
console.log('10. השדה הוחלף בקוד שמומש:',
  await page.locator('#coupon-box').count() === 0,
  '|', (await page.locator('.coupon-used b').innerText()).trim());

/* וגם מי שינסה לעקוף את המסך נדחה */
const second = await page.evaluate(() => window.__backend.redeemCoupon('HALFOFF'));
console.log('    ניסיון שני נדחה:', second.result, second.result === 'already' ? '✓' : '✗');
if (second.result !== 'already') errors.push('אפשר היה לממש קופון שני');

/* תמחור לפי עובד: המסך חייב להציג את מה שייגבה בפועל.

   לקוח שכיבה עובדים ורואה מספר נמוך יתקשר בצדק כשיגיע חיוב
   אחר. המסך אומר את השיא, ואומר במילים למה. */
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('maiphone-mock-server-v1'));
  const id = Object.keys(raw.companies)[0];
  raw.companies[id].plan = 'enterprise';
  raw.companies[id].customPricePerEmployee = 12;
  raw.companies[id].employeePeak = 100;
  raw.companies[id].employeeCount = 3;
  localStorage.setItem('maiphone-mock-server-v1', JSON.stringify(raw));
});
await page.reload();
await page.waitForTimeout(900);
await page.click('[data-screen="billing"]').catch(() => {});
await page.waitForTimeout(500);
const perEmployee = await page.locator('#billing-panel').innerText();
/* ===== הודעת הקופון אומרת מה הקופון נתן =====

   הקופון בשקלים נוסף, והפונקציה שבוחרת את המשפט לא. קופון של
   100₪ נפל על הענף "מאה אחוז ומעלה" ואמר ללקוח שהחיוב הבא לא
   ייגבה כלל, וקופון של 50₪ נקרא כ-"50% הנחה". שתי הבטחות
   שאיש לא נתן, והחיוב בפועל היה אחר. */
const ilsMessage = await page.evaluate(() => {
  const B = window.ShiftBillingUI;
  if (!B || !B.couponMessage) return null;
  return [
    B.couponMessage({ result: 'ok', kind: 'amount', value: 100 }).text,
    B.couponMessage({ result: 'ok', kind: 'amount', value: 50 }).text,
    B.couponMessage({ result: 'ok', kind: 'percent', value: 100 }).text
  ];
});
if (ilsMessage) {
  console.log('11. קופון של 100₪ אינו נקרא כ"חינם":',
    /100/.test(ilsMessage[0]) && !/לא ייגבה/.test(ilsMessage[0]) ? '✓' : '✗',
    '|', ilsMessage[0]);
  console.log('    וקופון של 50₪ אינו נקרא כאחוזים:',
    !/%/.test(ilsMessage[1]) ? '✓' : '✗', '|', ilsMessage[1]);
  console.log('    ואילו 100% כן אומר "לא ייגבה":',
    /לא ייגבה/.test(ilsMessage[2]) ? '✓' : '✗');
  if (/%/.test(ilsMessage[1])) errors.push('קופון בשקלים הוצג כאחוזים');
  if (!/100/.test(ilsMessage[0])) errors.push('קופון של 100₪ לא הציג את הסכום');
} else {
  errors.push('couponMessage אינה חשופה לבדיקה');
}

console.log('12. תעריף לעובד מוצג כתעריף:', /12/.test(perEmployee) ? '✓' : '✗');
console.log('    והסכום לפי השיא ולא לפי הנוכחי:',
  /1,?200/.test(perEmployee) ? '✓' : '✗');
console.log('    והמסך מסביר שהחיוב לפי השיא:',
  /הגבוה ביותר/.test(perEmployee) ? '✓' : '✗');
if (!/1,?200/.test(perEmployee)) errors.push('מסך המנוי הציג מחיר שאינו מה שייגבה');
if (!/הגבוה ביותר/.test(perEmployee)) errors.push('המסך לא הסביר את שיטת החיוב');

/* ===== תוספת התראות הוואטסאפ לעובדים =====

   שירות בתשלום שהעסק מדליק לעצמו. מה שנבדק כאן הוא לא המתג
   אלא מה שקורה למחיר: לקוח שמדליק תוספת וממשיך לראות את אותו
   סכום ליד תאריך החיוב יגלה את ההפרש בכרטיס האשראי.

   מצב נקי ומפורש: תוכנית מהמחירון, בלי מחיר מוסכם, ושיא ידוע.
   כך 399 ו-669 הם מספרים שאפשר לבדוק ולא תוצאה של חישוב. */
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('maiphone-mock-server-v1'));
  const id = Object.keys(raw.companies)[0];
  raw.companies[id].plan = 'growth';
  raw.companies[id].customPricePerEmployee = null;
  raw.companies[id].customPriceMonthly = null;
  raw.companies[id].employeePeak = 30;
  raw.companies[id].employeeCount = 30;
  raw.companies[id].waEmployeeAddon = false;
  localStorage.setItem('maiphone-mock-server-v1', JSON.stringify(raw));
});
await page.reload();
await page.waitForTimeout(900);
/* הלשונית עצמה, ולא data-screen: אחרי רענון המסך חוזר לסידור,
   ו-innerText של פאנל מוסתר מחזיר מחרוזת ריקה — כלומר בדיקה
   שנראית עוברת ואינה בודקת דבר. */
await page.click('.tab[data-tab="billing"]');
await page.waitForTimeout(500);

const addonCard = page.locator('.billing-addon');
console.log('16. כרטיס התוספת מופיע במסך המנוי:',
  await addonCard.count() === 1 ? '✓' : '✗');
if (await addonCard.count() !== 1) errors.push('אין כרטיס לתוספת הוואטסאפ');

/* ===== ובלי ערוץ מחובר אין מה לקנות =====

   זו ההגנה החשובה יותר בבלוק הזה. הכרטיס, החיוב והחשבונית
   המפוצלת נבנו לפני שההודעות באמת יוצאות; לקוח שיכול להדליק
   את התוספת עכשיו ישלם 9 ₪ לעובד ולא יקבל דבר. ברירת המחדל
   של המערכת היא ערוץ כבוי, ולכן זה בדיוק המצב כאן. */
console.log('    וכל עוד הערוץ כבוי אין כפתור הפעלה:',
  await page.locator('#billing-addon-toggle').count() === 0 ? '✓' : '✗');
if (await page.locator('#billing-addon-toggle').count() !== 0) {
  errors.push('אפשר להדליק תוספת בתשלום לפני שההודעות לעובדים יוצאות');
}
console.log('    והכרטיס מסביר למה:',
  /עוד לא מחובר/.test(await addonCard.innerText()) ? '✓' : '✗');
if (!/עוד לא מחובר/.test(await addonCard.innerText())) {
  errors.push('הכרטיס אינו אומר שהשירות עוד לא מחובר');
}

/* מכאן הערוץ חי, כמו שיהיה ברגע שהמספר העסקי יאושר והמשתנים
   יוגדרו ב-Vercel. */
await page.evaluate(() => {
  window.ShiftModel.setWaStaffLive(true);
  window.ShiftBillingUI.render();
});
await page.waitForTimeout(300);
console.log('    ומשהערוץ מחובר הכפתור מופיע:',
  await page.locator('#billing-addon-toggle').count() === 1 ? '✓' : '✗');
if (await page.locator('#billing-addon-toggle').count() !== 1) {
  errors.push('הכפתור אינו מופיע גם כשהערוץ מחובר');
}

/* המחיר מופיע לפני הכפתור. מתג בלי מחיר הוא הפתעה בחיוב הבא. */
const addonPitch = await addonCard.innerText();
console.log('    והוא אומר כמה זה עולה:', /9/.test(addonPitch) ? '✓' : '✗');
if (!/9/.test(addonPitch)) errors.push('כרטיס התוספת אינו מציג מחיר');

const beforeAddon = await page.locator('.billing-current').innerText();
console.log('    ולפני ההפעלה הסכום הוא מחיר התוכנית:',
  /399/.test(beforeAddon) ? '✓' : '✗');

/* בלי הצהרה אי אפשר להפעיל: הכפתור כבוי עד ששם הוקלד והתיבה סומנה */
console.log('    ההצהרה מוצגת לפני ההפעלה:',
  await page.locator('.wa-declaration .wa-decl-text li').count() === 7 ? '✓' : '✗');
if (await page.locator('.wa-declaration .wa-decl-text li').count() !== 7) {
  errors.push('נוסח ההצהרה אינו מוצג בשבעה סעיפים');
}
console.log('    והכפתור כבוי בלעדיה:',
  await page.locator('#billing-addon-toggle').isDisabled() ? '✓' : '✗');
if (!(await page.locator('#billing-addon-toggle').isDisabled())) {
  errors.push('אפשר להפעיל את התוספת בלי הצהרה');
}
await page.fill('#wa-decl-name', 'פז');
await page.waitForTimeout(150);
if (!(await page.locator('#billing-addon-toggle').isDisabled())) {
  errors.push('שם בלי סימון התיבה פותח את הכפתור');
}
await page.check('#wa-decl-agree');
await page.waitForTimeout(150);
console.log('    ושם ותיבה פותחים אותו:',
  !(await page.locator('#billing-addon-toggle').isDisabled()) ? '✓' : '✗');
if (await page.locator('#billing-addon-toggle').isDisabled()) {
  errors.push('שם ותיבה מסומנת לא פתחו את הכפתור');
}

/* השרת עצמו סוגר את הדלת: קריאה ישירה בלי הצהרה נדחית */
const bypass = await page.evaluate(() =>
  window.__backend.setWaEmployeeAddon(true, null).then(() => 'accepted', () => 'rejected'));
console.log('    קריאה ישירה בלי הצהרה נדחית:', bypass === 'rejected' ? '✓' : '✗');
if (bypass !== 'rejected') errors.push('השרת קיבל הפעלה בלי הצהרה');

await page.click('#billing-addon-toggle');
await page.waitForTimeout(700);
const declared = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('maiphone-mock-server-v1'));
  const c = raw.companies[Object.keys(raw.companies)[0]];
  return { name: c.waDeclarationName, version: c.waDeclarationVersion, at: !!c.waDeclarationAt };
});
console.log('    ההצהרה נשמרה עם שם וגרסה:',
  declared.name === 'פז' && declared.version && declared.at ? '✓' : '✗');
if (declared.name !== 'פז' || !declared.version || !declared.at) {
  errors.push('ההצהרה לא נשמרה: ' + JSON.stringify(declared));
}
const afterAddon = await page.locator('.billing-current').innerText();

console.log('17. אחרי ההפעלה הסכום כולל את התוספת:',
  /669/.test(afterAddon) ? '✓' : '✗');
if (!/669/.test(afterAddon)) {
  errors.push('הסכום לא גדל בתוספת: ' + afterAddon.replace(/\s+/g, ' ').slice(0, 120));
}
console.log('    ומופיעות שתי שורות פירוט:',
  /דמי מנוי/.test(afterAddon) && /התראות וואטסאפ/.test(afterAddon) ? '✓' : '✗');
if (!/דמי מנוי/.test(afterAddon)) errors.push('אין פירוק לשני סעיפים במסך המנוי');
console.log('    והתוספת מוצגת כמכפלה:',
  /30/.test(afterAddon) && /270/.test(afterAddon) ? '✓' : '✗');

/* כיבוי מחזיר בדיוק. תוספת שנדלקת ואינה נכבית היא חיוב שאי
   אפשר לעצור מהמסך. */
await page.click('#billing-addon-toggle');
await page.waitForTimeout(700);
const offAddon = await page.locator('.billing-current').innerText();
console.log('18. הכיבוי מחזיר את הסכום:',
  /399/.test(offAddon) && !/669/.test(offAddon) ? '✓' : '✗');
if (/669/.test(offAddon)) errors.push('הכיבוי לא החזיר את הסכום');
console.log('    והפירוט נעלם:', !/דמי מנוי/.test(offAddon) ? '✓' : '✗');

// חסימה כשהמנוי פג
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('maiphone-mock-server-v1'));
  const id = Object.keys(raw.companies)[0];
  raw.companies[id].status = 'expired';
  raw.companies[id].validUntil = new Date(Date.now() - 86400000).toISOString();
  localStorage.setItem('maiphone-mock-server-v1', JSON.stringify(raw));
});
await page.reload();
await page.waitForTimeout(900);
console.log('7. מנוי שפג – האפליקציה חסומה:', await page.locator('#app-root').isHidden(),
  '| מסך חסימה:', (await page.locator('.auth-blocked h2').innerText()).trim());
console.log('   הסבר:', (await page.locator('.auth-blocked p').first().innerText()).trim());

/* ===== הקוד שמוקלד כבר בהרשמה =====

   הקוד נשלח כדי להביא אנשים להירשם, ועד כה המקום היחיד
   להקליד אותו היה מסך המנוי -- כלומר אחרי ההרשמה. הקשר הזה
   נבדק מקצה לקצה, בהקשר נקי: הרשמה עם קוד, ואז המסך שאומר
   מה הוא עשה. */
console.log('\n== קופון כבר בהרשמה ==');
const fresh = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'he-IL' });
const signup = await fresh.newPage();
signup.on('dialog', async d => { await d.accept(); });
await skipWizard(signup);
await signup.goto(APP);
await signup.waitForTimeout(400);
await signup.click('[data-auth-mode="signup"]');
await signup.waitForTimeout(200);

const couponField = await signup.locator('#signup-form input[name="coupon"]').count();
console.log('13. יש שדה קופון במסך ההרשמה:', couponField === 1 ? '✓' : '✗');
if (couponField !== 1) errors.push('אין שדה קופון במסך ההרשמה');

await signup.fill('input[name="companyName"]', 'עסק עם קוד');
await signup.fill('input[name="email"]', 'code@test.co.il');
await signup.fill('input[name="password"]', 'secret123');
await signup.fill('input[name="phone"]', '054-7654321');
await signup.fill('input[name="coupon"]', ' extra-month ');
await signup.click('#signup-form button[type="submit"]');
await signup.waitForTimeout(1600);

await signup.click('[data-screen="billing"]').catch(() => {});
await signup.waitForTimeout(600);
const billed = await signup.locator('#billing-panel').innerText();
/* הקוד מנורמל בדרך: רווחים ומקף אינם אמורים להפיל מימוש */
console.log('    והקוד מומש למרות הרווחים והמקף:',
  /EXTRAMONTH/.test(billed) ? '✓' : '✗');
if (!/EXTRAMONTH/.test(billed)) errors.push('הקוד מההרשמה לא מומש');
const said = await signup.locator('#billing-message').innerText().catch(() => '');
console.log('    ונאמר מה הוא עשה:', /30/.test(said) ? '✓' : '✗', '|', said.trim());
if (!/30/.test(said)) errors.push('לא נאמר מה הקופון עשה');

/* והשדה במסך המנוי גלוי, ולא מגירה מקופלת שצריך לחפש */
const visible = await signup.evaluate(() => {
  const box = document.getElementById('coupon-box');
  return box ? box.tagName.toLowerCase() : 'none';
});
console.log('14. שדה הקופון במסך המנוי אינו details מקופל:',
  visible !== 'details' ? '✓' : '✗', '|', visible);
if (visible === 'details') errors.push('שדה הקופון עדיין מקופל');
await fresh.close();

console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
if (errors.length) process.exit(1);
