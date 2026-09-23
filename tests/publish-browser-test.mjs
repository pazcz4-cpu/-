/* טיוטה ופרסום: עד שהמנהל מפרסם, העובד אינו רואה סידור.
   הרצה: node tests/publish-browser-test.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSample } from './_sample.mjs';
import { clickTool, openMenuFor } from './_menu.mjs';
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

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', async (d) => { await d.accept(); });
  return page;
}

const stateOf = (page) => page.evaluate(() => ({
  label: document.getElementById('publish-state').textContent,
  cls: document.getElementById('publish-state').className,
  button: document.getElementById('publish-week').textContent,
  disabled: document.getElementById('publish-week').disabled,
  revertHidden: document.getElementById('unpublish-week').classList.contains('hidden')
}));

try {
  const page = await newPage();
  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'בדיקת פרסום');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@publish.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1200);
  await loadSample(page);

  console.log('\n== הזהות במסך ==');
  check('הכותרת היא שם המוצר', await page.locator('.brand h1').textContent(), 'SetShifts');
  /* הלוגו האמיתי, ולא אימוג'י ולא ציור מקומי: הוא נטען מקובץ,
     נראה על המסך, והדפדפן באמת הצליח לפענח אותו. */
  check('הלוגו מוצג ונטען בפועל', await page.evaluate(() => {
    const mark = document.querySelector('.brand .brand-img');
    return !!mark && mark.complete && mark.naturalWidth > 0 &&
      mark.getBoundingClientRect().width > 20;
  }), true);
  check('והוא מגיע מקובץ הלוגו', await page.evaluate(() => {
    const mark = document.querySelector('.brand .brand-img');
    return mark ? mark.getAttribute('src') : '';
  }), /brand\/logo-mark/);
  check('אין אייקון כפול באף כפתור', await page.evaluate(() => {
    const doubled = /([\u2190-\u2BFF\u2600-\u27BF])\s*\1/;
    return Array.from(document.querySelectorAll('button'))
      .filter((node) => doubled.test(node.textContent))
      .map((node) => node.textContent.trim()).join(' | ');
  }), '');

  console.log('\n== סידור חדש הוא טיוטה ==');
  await page.click('#generate');
  await page.waitForTimeout(1600);
  const draft = await stateOf(page);
  check('הסטטוס אומר טיוטה', draft.label, /טיוטה/);
  check('ומסביר שהעובדים אינם רואים', draft.label, /אינם רואים/);
  check('הכפתור מציע לבדוק ולפרסם', draft.button, 'בדיקה ופרסום');
  check('והוא פעיל', draft.disabled, false);
  check('אין החזרה לטיוטה במצב טיוטה', draft.revertHidden, true);

  console.log('\n== אישור לפני פרסום ==');
  await page.click('#publish-week');
  await page.waitForTimeout(400);
  check('נפתח חלון אישור, ולא פורסם מיד',
    await page.locator('#confirm-overlay .confirm-card').isVisible(), true);
  check('עדיין טיוטה', (await stateOf(page)).label, /טיוטה/);
  const facts = await page.locator('.confirm-fact').allInnerTexts();
  check('שני מספרים מוצגים', facts.length, 2);
  /* המספר בחלון חייב להיות אותו מספר שבהתראות. שני מקורות אמת
     לאותו נתון הם בדיוק מה שמפיל אמון. */
  check('המספרים הם אלה שבהתראות',
    facts.map((text) => (text.match(/\d+/) || ['?'])[0]).join(','),
    await page.evaluate(() => {
      const chips = Array.from(document.querySelectorAll('.issue-chip'));
      const num = (name) => {
        const chip = chips.find((c) => c.dataset.group === name);
        return (chip.textContent.match(/\d+/) || ['0'])[0];
      };
      return num('staffing') + ',' + num('violations');
    }));
  check('התווית היא שם הקבוצה', facts.join(' '), /בעיות איוש[\s\S]*הפרות/);
  check('נאמר שהעובדים יראו מיד',
    (await page.locator('.confirm-line').allInnerTexts()).join(' '), /רואים את הסידור מיד/);

  console.log('\n== ביטול משאיר בטיוטה ==');
  await page.click('[data-confirm-no]');
  await page.waitForTimeout(400);
  check('החלון נסגר', await page.locator('#confirm-overlay').isHidden(), true);
  check('והסידור נשאר טיוטה', (await stateOf(page)).label, /טיוטה/);
  check('והשרת לא יודע על פרסום', await page.evaluate(
    () => window.__backend.loadWeek(window.ShiftApp.weekKey()).then((w) => !!w.published)), false);

  console.log('\n== פרסום ==');
  await page.click('#publish-week');
  await page.waitForTimeout(400);
  await page.click('[data-confirm-yes]');
  await page.waitForTimeout(900);
  const published = await stateOf(page);
  check('הסטטוס מציג תאריך ושעה', published.label, /פורסם ב־\d+\/\d+ בשעה \d+:\d+/);
  check('הסימון ירוק', published.cls, /published/);
  check('הכפתור כבר לא מזמין ללחוץ', published.disabled, true);
  check('והחזרה לטיוטה זמינה', published.revertHidden, false);
  check('העובד היה מקבל התראה', await page.evaluate(
    () => window.__backend.loadWeek(window.ShiftApp.weekKey()).then((w) => !!w.published)), true);

  console.log('\n== שינוי אחרי פרסום ==');
  const dropOne = () => page.evaluate(() => {
    const select = Array.from(document.querySelectorAll('#schedule-branch select.emp-select'))
      .find((node) => node.value);
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* שבוע שפורסם נעול: הניסיון הראשון נעצר ומציג אזהרה, והמסך
     מוחזר למה שבאמת שמור – כדי שלא יישאר על המסך שיבוץ שלא נשמר.
     זו ההגנה, ולכן היא נבדקת כאן ולא נעקפת. */
  await dropOne();
  await page.waitForTimeout(600);
  check('שבוע מפורסם אינו משתנה בלחיצה אחת',
    await page.locator('#confirm-overlay .confirm-card').isVisible(), true);
  check('והשינוי לא נכנס', (await stateOf(page)).cls, /published/);

  /* אישור ראשון – להמשיך; אישור שני – לערוך את המפורסם עצמו
     (הכפתור השלישי הוא "להחזיר לטיוטה"). */
  await page.click('[data-confirm-yes]');
  await page.waitForTimeout(500);
  await page.click('[data-confirm-alt]');
  await page.waitForTimeout(800);
  await dropOne();
  await page.waitForTimeout(900);
  const changed = await stateOf(page);
  check('הסטטוס אומר "שונה מאז הפרסום"', changed.label, /שונה מאז הפרסום ב־\d+\/\d+/);
  check('הסימון מתריע', changed.cls, /changed/);
  check('הכפתור מציע לבדוק ולפרסם את העדכונים', changed.button, 'בדיקה ופרסום העדכונים');
  check('והוא פעיל שוב', changed.disabled, false);

  await page.click('#publish-week');
  await page.waitForTimeout(400);
  await page.click('[data-confirm-yes]');
  await page.waitForTimeout(900);
  check('פרסום העדכונים מחזיר למצב "פורסם"', (await stateOf(page)).cls, /published/);

  console.log('\n== שינוי שאינו נראה לעובד אינו "שינוי" ==');
  await page.evaluate(() => {
    const week = window.ShiftApp.getState().weeks[window.ShiftApp.weekKey()];
    week.manual['0|x|morning'] = true;
    window.ShiftApp.render();
  });
  await page.waitForTimeout(300);
  check('סימון שיבוץ ידני אינו מסמן "שונה"', (await stateOf(page)).cls, /published/);

  console.log('\n== החזרה לטיוטה ==');
  await page.click('#unpublish-week');
  await page.waitForTimeout(900);
  const back = await stateOf(page);
  check('חוזר לטיוטה', back.label, /טיוטה/);
  check('והשרת יודע', await page.evaluate(
    () => window.__backend.loadWeek(window.ShiftApp.weekKey()).then((w) => !!w.published)), false);

  console.log('\n== מצב צפייה חוסם פרסום ==');
  await clickTool(page, '#view-only-toggle');
  await page.waitForTimeout(400);
  check('הכפתור נעול', (await stateOf(page)).disabled, true);
  await clickTool(page, '#view-only-toggle');
  await page.waitForTimeout(300);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות הפרסום עברו');
