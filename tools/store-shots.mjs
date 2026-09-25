/* צילומי המסך להגשה לחנויות האפליקציות.

   למה כלי ולא צילום ידני: כל חנות דורשת מידות פיקסלים מדויקות,
   וצילום ידני מהטלפון כמעט לעולם אינו יוצא בדיוק בהן. חוץ מזה
   המסך משתנה — וצילום שצולם פעם אחת מראה גרסה שכבר לא קיימת.
   כאן הכול נוצר מהמערכת עצמה, בפקודה אחת, בכל פעם מחדש.

   הרצה: npm run store:shots
   הפלט: assets/store/shots/<מכשיר>/*.png

   השרת מדומה בדפדפן, ולכן אין כאן שום נתון של לקוח אמיתי:
   העסק, העובדים והמשמרות נולדים ומתים בתוך ההרצה. */
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
const OUT = path.join(here, '..', 'assets', 'store', 'shots');
const APP = url('app.html');

/* המידות אינן שרירותיות. אפל מבקשת היום מערכה אחת של אייפון
   6.9" ומערכה אחת של אייפד 13" ומקטינה מהן לשאר הגדלים; גוגל
   דורשת יחס שבין 16:9 ל-9:16, ולכן 1080x1920 הוא הגבוה ביותר
   שמותר. הרוחב הלוגי נבחר כך שייפול בתוך אותה נקודת שבירה
   שבה נמצא מכשיר אמיתי מאותה משפחה. */
const DEVICES = [
  { key: 'ios-iphone-6.9', width: 440, height: 956, scale: 3, label: 'אייפון 6.9" — 1320x2868' },
  { key: 'ios-ipad-13', width: 1032, height: 1376, scale: 2, label: 'אייפד 13" — 2064x2752' },
  { key: 'android-phone', width: 360, height: 640, scale: 3, label: 'אנדרואיד — 1080x1920' },
  /* התמונה הגדולה בפתיחת דף המכירה. לא מכשיר — יחס רחב
     שיושב יפה לצד הכותרת, ובו המסך שבשבילו אנשים באים. */
  { key: 'landing', width: 1180, height: 760, scale: 2, label: 'דף המכירה — 2360x1520',
    landing: true }
];

const results = [];

/* מה שאסור להופיע בצילום לחנות:

   - #demo-banner — נכון לסביבת הפיתוח, מבלבל בחנות.
   - #user-bar — שורת החשבון: "יציאה", בורר שפה, והודעת תקופת
     הניסיון. אלה פרטי חשבון, לא המוצר, והודעת חיוב בצילום
     חנות נראית כמו שגיאה.
   - #toast — הודעה צפה שמכסה תוכן. היא מופיעה אחרי כל פעולה,
     ובצילום היא רק מסתירה.
   - #sync-state — "נשמר במכשיר הזה" הוא נוסח של השרת המדומה.
     במערכת האמיתית הנתונים נשמרים בשרת, ולכן הצגתו כאן היא
     פשוט לא נכונה.

   ההסתרה נעשית ב-CSS ולא בשינוי סגנון פר-אלמנט, כדי שגם מה
   שנוצר מאוחר יותר (toast חדש) לא יצוץ באמצע צילום. */
const HIDE = '#demo-banner,#user-bar,#toast,#sync-state{display:none !important}';

async function clean(page) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  /* שורת הלשוניות נגללת במסך צר, ולשונית חתוכה למחצה בקצה
     נראית כמו תקלה. מחזירים אותה להתחלה. */
  await page.evaluate(() => {
    const tabs = document.getElementById('tabs');
    if (tabs) tabs.scrollLeft = 0;
  });
  await page.waitForTimeout(150);
}

async function capture(page, dir, name) {
  await clean(page);
  const file = path.join(dir, name + '.png');
  /* צילום של החלון ולא של העמוד המלא: רק כך המידות יוצאות
     בדיוק מה שהחנות דורשת. */
  await page.screenshot({ path: file, fullPage: false });
  const kb = Math.round(fs.statSync(file).size / 1024);
  results.push({ name, kb, file });
  console.log('    ✓ ' + name + '.png  (' + kb + ' ק"ב)');
}

/* שני תיקונים לנתוני הדוגמה, לצורך הצילום בלבד.

   1. שמות. בדוגמה העובדים נקראים "עובד/ת 1" עד "עובד/ת 8".
      זה נכון לבדיקה אוטומטית, אבל בחנות זה נקרא כמו מוצר שלא
      סיימו לבנות. שמות אמיתיים מראים את אותו מסך בדיוק כפי
      שלקוח יראה אותו אצלו.

   2. מספר. שמונה עובדים מול שלושה סניפים וכל ימות השבוע הם
      פחות אנשים ממשמרות, ולכן השיבוץ משאיר עשר משמרות ללא
      איוש ומציג תג כתום. התג נכון — המערכת מדווחת מה לא
      הצליחה לאייש — אבל צילום חנות אמור להראות את המקרה
      התקין, לא את חוסר כוח האדם של עסק הדוגמה. */
const NAMES = [
  'רונית לוי', 'אבי כהן', 'מאיה בר', 'יוסי אלון',
  'נועה שרון', 'דני מזרחי', 'שירה גל', 'עומר ברק',
  'ליאת נחום', 'איתי רון', 'הילה דגן', 'ניר שפר',
  'יעל אורן', 'גיא סלע', 'תמר אביב', 'רועי פלד'
];

async function dressEmployees(page) {
  await page.evaluate((names) => {
    const app = window.ShiftApp;
    const state = app.getState();
    const base = state.employees.slice();
    const branches = state.branches.map((b) => b.id);
    const list = [];
    for (let i = 0; i < names.length; i++) {
      /* שכפול של אובייקט קיים ולא בנייה מאפס, כדי שהמבנה יישאר
         בדיוק מה שהמערכת מצפה לו גם אם יתווספו שדות. */
      const source = base[i % base.length];
      const employee = JSON.parse(JSON.stringify(source));
      employee.id = 'emp-shot-' + (i + 1);
      employee.name = names[i];
      employee.active = true;
      employee.maxShifts = 6;
      /* המחצית השנייה זמינה בכל הסניפים, כדי שהחוסר ייסגר. */
      if (i >= base.length) { employee.branches = branches.slice(); employee.shifts = null; }
      list.push(employee);
    }
    state.employees = list;
    app.applyRemoteConfig({
      settings: state.settings, branches: state.branches, employees: list
    });
    app.persistConfig();
  }, NAMES);
  await page.waitForTimeout(700);
}

/* בונה עסק מלא: עובדים, סניפים, שעון נוכחות, שעות נוספות,
   סידור משובץ ומפורסם. בלי זה כל מסך בצילום יוצא ריק, וחנות
   דוחה צילומים של מסך ריק. */
async function seed(page) {
  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(500);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(250);
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@store.shot');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1600);
  await loadSample(page);

  await dressEmployees(page);

  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(500);
  await page.check('#opt-clock');
  await page.waitForTimeout(500);
  await page.check('#opt-overtime');
  await page.waitForTimeout(600);

  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(600);
  await page.click('#generate');
  await page.waitForTimeout(2200);

  /* לפרסם. סידור במצב "טיוטה" אומר לצופה בחנות שהמוצר לא
     סיים את העבודה, וזה בדיוק ההפך ממה שהצילום אמור להראות. */
  const publish = page.locator('#publish-week');
  if (await publish.isVisible().catch(() => false)) {
    await publish.click();
    await page.waitForTimeout(600);
    const yes = page.locator('[data-confirm-yes]');
    if (await yes.isVisible().catch(() => false)) await yes.click();
    await page.waitForTimeout(1500);
  }
}

const browser = await chromium.launch();
try {
  for (const device of DEVICES) {
    console.log('\n== ' + device.label + ' ==');
    const dir = path.join(OUT, device.key);
    fs.mkdirSync(dir, { recursive: true });

    const ctx = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: device.scale,
      locale: 'he-IL'
    });
    const page = await ctx.newPage();
    page.on('dialog', async (d) => { await d.accept(); });

    await seed(page);

    /* דף המכירה צריך תמונה אחת בלבד, ולא מערכה. */
    if (device.landing) {
      const out = path.join(here, '..', 'assets', 'landing');
      fs.mkdirSync(out, { recursive: true });
      /* שטח ההמתנה הוא אזור גרירה, והוא ריק בהגדרה כשכל
         המשמרות מאוישות — כלומר תמיד בצילום. מלבן מקווקו ריק
         באמצע התמונה הראשית אינו אומר דבר על המוצר. הוא מוסתר
         כאן בלבד; במערכת הוא מופיע ברגע שגוררים אליו משמרת. */
      await page.addStyleTag({ content: '#shift-tray{display:none !important}' });
      await page.waitForTimeout(200);
      /* לא hero-schedule.png: שם יושב עכשיו האיור של דף
         המכירה, ולא צילום מסך. הכלי הזה היה דורס אותו בשקט
         בהרצה הבאה, והתמונה הראשית של האתר הייתה מתחלפת בלי
         שאיש ביקש. הצילום נשמר בשם משלו ומשמש את חומרי
         החנויות. */
      await capture(page, out, 'schedule-wide');
      await ctx.close();
      continue;
    }

    await capture(page, dir, '1-schedule');

    await page.click('.tab[data-tab="hours"]');
    await page.waitForTimeout(1200);
    await capture(page, dir, '2-hours');

    await page.click('.tab[data-tab="constraints"]');
    await page.waitForTimeout(900);
    await capture(page, dir, '3-constraints');

    await page.click('.tab[data-tab="users"]');
    await page.waitForTimeout(900);
    await capture(page, dir, '4-users');

    await page.click('.tab[data-tab="settings"]');
    await page.waitForTimeout(900);
    await capture(page, dir, '5-settings');

    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log('\nסה"כ ' + results.length + ' צילומים, ב-' + DEVICES.length + ' גדלים.');
console.log('נכתב אל assets/store/shots/');
