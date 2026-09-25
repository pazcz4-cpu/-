/* צילומי המסך למדריך העובד.

   למה כלי ולא צילום ידני: המסך משתנה. צילום שצולם פעם אחת
   מראה גרסה שכבר אינה קיימת, והעובד שמחזיק את המדריך מחפש
   כפתור שאינו שם. כאן הצילומים נוצרים מהמערכת עצמה, ואפשר
   לייצר אותם מחדש בפקודה אחת אחרי כל שינוי במסך.

   הרצה: npm run guide:shots
   הפלט: assets/guide/*.png – נכנסים ל-guide.html.

   השרת מדומה בדפדפן (mock), ולכן אין כאן שום נתון של לקוח
   אמיתי: העסק, העובדים והמשמרות נולדים ומתים בתוך ההרצה. */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSample } from '../tests/_sample.mjs';
import { skipWizard } from '../tests/_wizard.mjs';
import { url } from '../tests/_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'assets', 'guide');
const APP = url('app.html');
/* רוחב טלפון אמיתי. deviceScaleFactor 2 כדי שהתמונה תישאר חדה
   גם בהדפסה, שבה הפיקסלים נדחסים. */
const PHONE = { width: 390, height: 844 };

fs.mkdirSync(OUT, { recursive: true });

const saved = [];

/* מה שאינו שייך למדריך של העובד: באנר "מצב הדגמה" (הוא נכון
   לסביבת הפיתוח ומבלבל במסמך), ושורת החשבון עם הודעת הניסיון,
   בורר השפה וכפתור היציאה – פרטים של החשבון, לא של המסך. */
async function clean(page) {
  await page.evaluate(() => {
    ['#demo-banner', '#user-bar'].forEach((sel) => {
      const node = document.querySelector(sel);
      if (node) node.style.display = 'none';
    });
  });
  await page.waitForTimeout(150);
}

/* חיתוך מאלמנט אחד עד אלמנט אחר. מסך העובד ארוך – שבעה ימים
   וכל המשמרות – ותמונה בגובה 4500 פיקסל במסמך היא עמוד שלם
   שאיש לא יקרא. כאן נחתך בדיוק החלק שהכיתוב מדבר עליו. */
async function shotBetween(page, name, fromSel, toSel) {
  await clean(page);
  /* "בורר|2" פירושו ההתאמה השנייה. כותרת "האילוצים שלי" היא
     ה-employee-title השנייה במסך, ואין לה מחלקה משלה. */
  const box = await page.evaluate(([a, b]) => {
    const pick = (spec) => {
      if (!spec) return null;
      const [sel, nth] = String(spec).split('|');
      return document.querySelectorAll(sel)[Number(nth || 0)] || null;
    };
    const start = pick(a);
    const stop = pick(b);
    if (!start) return null;
    const top = start.getBoundingClientRect().top + window.scrollY;
    const bottom = stop
      ? stop.getBoundingClientRect().top + window.scrollY
      : document.body.scrollHeight;
    const width = start.getBoundingClientRect().width;
    return {
      x: Math.round(start.getBoundingClientRect().left + window.scrollX),
      y: Math.round(top), width: Math.round(width), height: Math.round(bottom - top)
    };
  }, [fromSel, toSel]);
  if (!box || box.height < 20) throw new Error('לא נמצא אזור לצילום: ' + name);
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, clip: box });
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  saved.push({ name, kb });
  console.log('  ✓ ' + name + '.png  (' + kb + ' KB)');
}

async function shot(page, name, selector) {
  const file = path.join(OUT, name + '.png');
  await clean(page);
  const target = selector ? page.locator(selector).first() : page;
  await target.screenshot({ path: file });
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  saved.push({ name, kb });
  console.log('  ✓ ' + name + '.png  (' + kb + ' KB)');
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: PHONE, locale: 'he-IL', deviceScaleFactor: 2
  });
  const page = await ctx.newPage();
  page.on('dialog', async (d) => { await d.accept(); });

  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);

  console.log('\n== מסך הכניסה ==');
  await shot(page, 'signin', '.auth-card');

  /* עסק לדוגמה, ובתוכו עובדת אחת שתהיה הגיבורה של המדריך */
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="email"]', 'boss@guide.test');
  await page.fill('input[name="password"]', 'secret123');
  /* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
     עם הלקוח כשמשהו בחשבון דורש טיפול. */
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1400);
  await loadSample(page);

  /* תקרת בקשות דלוקה, כדי שהאריח השלישי במסך העובד יופיע */
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(400);
  await page.check('#opt-limit');
  await page.waitForTimeout(500);

  /* קודם משבצים, ורק אז בוחרים את מי לצרף. עובד שיצא מהשיבוץ בלי
     ולו משמרת אחת מייצר מדריך שמראה מסך ריק במקום מסך מלא. */
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(600);
  await page.click('#generate');
  await page.waitForTimeout(1800);

  const busiest = await page.evaluate(() => {
    const app = window.ShiftApp;
    const week = app.getState().weeks[app.weekKey()] || {};
    const count = {};
    Object.keys(week.assignments || {}).forEach((key) => {
      (week.assignments[key] || []).forEach((id) => { count[id] = (count[id] || 0) + 1; });
    });
    return Object.keys(count).sort((a, b) => count[b] - count[a])[0] || null;
  });
  if (!busiest) throw new Error('השיבוץ לא הפיק אף משמרת – אין את מי לצלם');

  await page.click('.tab[data-tab="users"]');
  await page.waitForTimeout(600);
  await page.fill('#invite-form input[name="email"]', 'ronit@guide.test');
  await page.selectOption('#invite-form select[name="employeeId"]', busiest);
  await page.click('#invite-form button[type="submit"]');
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    window.__backend.followLink('ronit@guide.test', 'invite');
    await window.__backend.setPassword('secret123');
  });

  await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await page.reload();
  await page.waitForTimeout(800);
  await page.fill('input[name="email"]', 'ronit@guide.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signin-form button[type="submit"]');
  await page.waitForTimeout(1700);

  console.log('\n== מסך העובד, לפני שהמנהל פרסם ==');
  await shotBetween(page, 'employee-before', '.employee-summary', '.employee-title|1');

  console.log('\n== הגשת בקשות ==');
  const card = page.locator('.employee-days .m-card').nth(0);
  await card.locator('.cstate').nth(0).click();          // מעדיף/ה
  await page.waitForTimeout(800);
  await card.locator('.cstate').nth(1).click();
  await page.waitForTimeout(700);
  await card.locator('.cstate').nth(1).click();          // לא יכול/ה
  await page.waitForTimeout(800);
  await shot(page, 'states', '.employee-days .m-card');

  const second = page.locator('.employee-days .m-card').nth(1);
  await second.locator('.cstate').last().click();        // יום חופש
  await page.waitForTimeout(900);
  await shot(page, 'dayoff', '.employee-days .m-card >> nth=1');

  console.log('\n== שלושת המספרים ==');
  await shot(page, 'summary', '.employee-summary');

  console.log('\n== אחרי שהמנהל פרסם ==');
  /* חוזרים למנהל, מפרסמים, וחוזרים לעובדת */
  await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await page.reload();
  await page.waitForTimeout(800);
  await page.fill('input[name="email"]', 'boss@guide.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signin-form button[type="submit"]');
  await page.waitForTimeout(1600);
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(600);
  await page.click('#publish-week');
  await page.waitForTimeout(500);
  /* הפרסום עובר דרך חלון אישור, בכוונה: העובדים רואים מיד */
  await page.click('[data-confirm-yes]');
  await page.waitForTimeout(1500);

  await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await page.reload();
  await page.waitForTimeout(800);
  await page.fill('input[name="email"]', 'ronit@guide.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signin-form button[type="submit"]');
  await page.waitForTimeout(1700);
  /* מהמספרים ועד כותרת "האילוצים שלי": בדיוק "המשמרות שלי" */
  await shotBetween(page, 'employee-after', '.employee-summary', '.employee-title|1');

  console.log('\nנוצרו ' + saved.length + ' צילומים ב-assets/guide/');
} finally {
  await browser.close();
}
