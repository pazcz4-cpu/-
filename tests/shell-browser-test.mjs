/* המעטפת המקומית: לשוניות תחתונות לפי תפקיד, גיליון "עוד",
   ופס מצב הרשת.

   הרצה: npm run test:shell

   למה יש בדיקה כזאת בכלל: המעטפת מופיעה רק כשהאפליקציה רצה
   בתוך Capacitor, ובניית קובץ iOS לכל שינוי אינה מסלול בדיקה.
   `?shell=1` מכריח אותה בדפדפן — ולכן אפשר לבדוק את הניווט
   המקומי כאן, בשניות, במקום בסבב בנייה.

   ובדיקה אחת כאן חשובה במיוחד: שהאתר עצמו לא זז. ממשק שמשתנה
   בדפדפן בגלל קוד שנועד לאפליקציה הוא מוצר שצריך לבדוק
   פעמיים. */
import { createRequire } from 'node:module';
import { loadSample } from './_sample.mjs';
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
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const PHONE = { width: 390, height: 844 };
const browser = await chromium.launch();
const errors = [];

/* פותח עסק מאויש ומחזיר את הדף. shell=false בודק את האתר. */
async function openApp(ctx, { shell }) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async (d) => { await d.accept(); });
  await skipWizard(page);
  await page.goto(url('app.html') + (shell ? '?shell=1' : ''));
  await page.waitForTimeout(500);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(250);
  await page.fill('input[name="companyName"]', 'קפה מעטפת');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@shell.test');
  await page.fill('input[name="password"]', 'secret123');
  /* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
     עם הלקוח כשמשהו בחשבון דורש טיפול. */
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1700);
  await loadSample(page);
  return page;
}

try {
  console.log('\n== באתר עצמו אין מעטפת ==');
  {
    const ctx = await browser.newContext({ viewport: PHONE, locale: 'he-IL' });
    const page = await openApp(ctx, { shell: false });
    check('אין לשוניות תחתונות', await page.locator('.shell-tab').count(), 0);
    check('ושורת הלשוניות העליונה במקומה', await page.locator('#tabs').isVisible(), true);
    await ctx.close();
  }

  console.log('\n== מנהל: חמש לשוניות ==');
  const ctx = await browser.newContext({ viewport: PHONE, locale: 'he-IL' });
  const page = await openApp(ctx, { shell: true });
  /* במעטפת הלשוניות העליונות מוסתרות, ולכן לחיצה עליהן היא
     דרך ה-DOM ולא דרך הדפדפן. */
  const tapTab = (name) => page.$eval(`.tab[data-tab="${name}"]`, (e) => e.click());

  check('הלשוניות של המנהל',
    (await page.locator('.shell-tab').allTextContents()).join('|'),
    'סידור|בקשות|שעות|צוות|עוד');
  check('והעליונה הוסתרה — אין ניווט כפול',
    await page.locator('#tabs').isVisible(), false);
  check('הראשונה פעילה',
    await page.locator('.shell-tab.is-on').getAttribute('data-shell-tab'), 'schedule');

  console.log('\n== לשונית מפעילה את המסך שלה ==');
  await tapTab('settings');
  await page.waitForTimeout(400);
  await page.check('#opt-clock');
  await page.waitForTimeout(600);
  await page.click('.shell-tab[data-shell-tab="hours"]');
  await page.waitForTimeout(800);
  check('דוח השעות נפתח',
    await page.$eval('.tab[data-tab="hours"]', (e) => e.classList.contains('active')), true);
  check('והלשונית התחתונה סומנה',
    await page.locator('.shell-tab.is-on').getAttribute('data-shell-tab'), 'hours');

  console.log('\n== "עוד" הוא תפריט, לא יעד ==');
  await page.click('.shell-tab[data-shell-tab="more"]');
  await page.waitForTimeout(400);
  check('הגיליון נפתח', await page.locator('.shell-sheet-card').isVisible(), true);
  check('ובו כל מה שלא נכנס לחמש',
    (await page.locator('.shell-sheet-item').allTextContents()).join('|'),
    'סניפים|משתמשים|מנוי|תמיכה|הגדרות');
  check('והלשונית הפעילה לא זזה',
    await page.locator('.shell-tab.is-on').getAttribute('data-shell-tab'), 'hours');
  await page.click('.shell-sheet-item[data-sheet-tab="users"]');
  await page.waitForTimeout(700);
  check('בחירה פותחת את המסך',
    await page.$eval('.tab[data-tab="users"]', (e) => e.classList.contains('active')), true);
  check('וסוגרת את הגיליון', await page.locator('.shell-sheet-card').count(), 0);

  console.log('\n== מסך שאינו קיים אינו מוצע ==');
  await tapTab('settings');
  await page.waitForTimeout(400);
  await page.uncheck('#opt-clock');
  await page.waitForTimeout(700);
  check('לשונית דוח השעות נעלמה מהמסך',
    await page.locator('.tab[data-tab="hours"]').isVisible(), false);

  console.log('\n== אין רשת ==');
  await ctx.setOffline(true);
  await page.waitForTimeout(600);
  check('פס ההסבר מוצג', await page.locator('#shell-net').isVisible(), true);
  check('והוא מסביר, ולא שגיאת דפדפן',
    (await page.locator('#shell-net').textContent()).trim(), /אין חיבור לאינטרנט/);
  check('והאפליקציה נשארה שמישה',
    await page.locator('.shell-tab').count(), 5);
  await ctx.setOffline(false);
  await page.waitForTimeout(600);
  check('החיבור חזר והפס נעלם', await page.locator('#shell-net').isVisible(), false);

  console.log('\n== עובד: ארבע לשוניות, והמסך מתחלף ==');
  {
    /* מסך העובד הוא רצף אחד ארוך. באפליקציה זו לא תצוגה אחת
       אלא ארבע, והלשונית התחתונה היא זו שמחליפה ביניהן —
       אחרת הלשוניות מצביעות כולן על אותו מסך, וזה לא ניווט. */
    await tapTab('settings');
    await page.waitForTimeout(400);
    await page.check('#opt-clock');
    await page.waitForTimeout(600);
    await tapTab('schedule');
    await page.waitForTimeout(500);
    await page.click('#generate');
    await page.waitForTimeout(1800);
    const busiest = await page.evaluate(() => {
      const app = window.ShiftApp;
      const week = app.getState().weeks[app.weekKey()] || {};
      const count = {};
      Object.keys(week.assignments || {}).forEach((key) => {
        (week.assignments[key] || []).forEach((id) => { count[id] = (count[id] || 0) + 1; });
      });
      return Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    });
    await tapTab('users');
    await page.waitForTimeout(600);
    /* בוחרים עובד ורק אז ממלאים מייל: הבחירה דורסת את השדה. */
    await page.selectOption('#invite-form select[name="employeeId"]', busiest);
    await page.fill('#invite-form input[name="email"]', 'ronit@shell.test');
    await page.click('#invite-form button[type="submit"]');
    await page.waitForTimeout(900);
    await page.evaluate(async () => {
      window.__backend.followLink('ronit@shell.test', 'invite');
      await window.__backend.setPassword('secret123');
    });
    await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
    await page.goto(url('app.html') + '?shell=1');
    await page.waitForTimeout(800);
    await page.fill('input[name="email"]', 'ronit@shell.test');
    await page.fill('input[name="password"]', 'secret123');
    await page.click('#signin-form button[type="submit"]');
    await page.waitForTimeout(2000);

    check('הלשוניות של העובד — ולא של המנהל',
      (await page.locator('.shell-tab').allTextContents()).join('|'),
      'המשמרות שלי|אילוצים|שעון|חופשה');

    /* סופר כמה בלוקים מכל סוג באמת מצוירים על המסך */
    const shown = () => page.evaluate(() => {
      const out = {};
      document.querySelectorAll('.employee-screen > [data-emp-part]').forEach((node) => {
        const part = node.dataset.empPart;
        out[part] = out[part] || 0;
        if (getComputedStyle(node).display !== 'none') out[part]++;
      });
      return out;
    });

    const first = await shown();
    check('בפתיחה מוצגות המשמרות', first.shifts > 0, true);
    check('והשעון לא', first.clock || 0, 0);

    for (const view of ['constraints', 'clock', 'leave']) {
      await page.click('.shell-tab[data-shell-tab="' + view + '"]');
      await page.waitForTimeout(600);
      const now = await shown();
      const others = Object.keys(now).filter((k) => k !== view)
        .reduce((sum, k) => sum + now[k], 0);
      check('תצוגת ' + view + ': מוצגת', now[view] > 0, true);
      check('תצוגת ' + view + ': ושום דבר אחר לא', others, 0);
    }
  }

  console.log('\n== הנעילה הביומטרית היא העדפה של המכשיר ==');
  {
    /* בדפדפן אין חיישן, ולכן אין מה לנעול — וחשוב שזה יישאר
       כך: אפליקציה שננעלת בלי דרך להיפתח היא תקלה, לא אבטחה. */
    check('אינה נתמכת בדפדפן',
      await page.evaluate(() => window.ShiftShell.lockSupported()), false);
    check('וברירת המחדל אינה לנעול',
      await page.evaluate(() => window.ShiftShell.lockEnabled()), false);
    check('ואין מסך נעילה על המסך',
      await page.locator('#shell-lock').count(), 0);
    check('גם אחרי שההעדפה נדלקה, כי אין חיישן', await page.evaluate(() => {
      window.ShiftShell.setLockEnabled(true);
      return window.ShiftShell.locked();
    }), false);
    await page.evaluate(() => window.ShiftShell.setLockEnabled(false));
  }

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות המעטפת עברו');
