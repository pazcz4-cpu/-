/* תצוגת עובד: המנהל רואה את המסך של עובד מסוים, חוזר ממנו,
   ובעיקר – אינו יכול לשנות שם דבר בשמו.
   הרצה: node tests/preview-browser-test.mjs */
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

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', async d => { await d.accept(); });

try {
  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@cafe.test');
  await page.fill('input[name="password"]', 'secret123');
  /* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
     עם הלקוח כשמשהו בחשבון דורש טיפול. */
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1000);
  await loadSample(page);

  console.log('\n== בניית סידור ==');
  await page.click('#generate');
  await page.waitForTimeout(1500);

  console.log('\n== פתיחת תצוגת עובד ==');
  check('הכפתור בשורת המשתמש', await page.locator('#user-preview').isVisible(), true);
  await page.click('#user-preview');
  await page.waitForTimeout(300);
  /* ההסבר בחלון הזה היה פעם הסבר על תפקידים – "קופאי, סדרן,
     מטבח" – שהועתק לכאן מהגדרות התפקידים ולא אמר דבר על מה
     שהחלון עושה. הוא צריך לענות על השאלה שהמנהל שואל כאן. */
  const dialogText = await page.locator('.why-card').innerText();
  check('ההסבר אינו הסבר על תפקידים', /קופאי|סדרן|מטבח/.test(dialogText), false);
  check('וההסבר אומר שזו צפייה בלבד', /צפייה בלבד/.test(dialogText), true);

  const picks = await page.locator('.preview-pick').count();
  check('רשימת העובדים נפתחה', picks > 3, true);
  const firstName = await page.locator('.preview-pick').first().textContent();

  await page.locator('.preview-pick').first().click();
  await page.waitForTimeout(700);

  check('מסך העובד מוצג', await page.locator('#employee-root').isVisible(), true);
  check('מערכת הניהול מוסתרת', await page.locator('#manager-root').isHidden(), true);
  check('יש רצועת אזהרה', await page.locator('.preview-bar').isVisible(), true);
  check('והיא נוקבת בשם העובד',
    await page.locator('.preview-bar span').textContent(), new RegExp(firstName));

  console.log('\n== צפייה בלבד ==');
  /* אילוץ נשמר בלחיצה על .cstate. בתצוגה מקדימה זה חייב לא לעשות כלום. */
  const toggles = await page.locator('#employee-root .cstate').count();
  if (toggles) {
    const before = await page.locator('#employee-root .cstate').first().getAttribute('class');
    await page.locator('#employee-root .cstate').first().click();
    await page.waitForTimeout(500);
    check('לחיצה על אילוץ אינה משנה דבר',
      await page.locator('#employee-root .cstate').first().getAttribute('class'), before);
  } else {
    console.log('  (אין כפתורי אילוץ במסך הזה)');
  }
  check('ולא נשמרה אף בקשה בשם העובד', await page.evaluate(() => {
    const backend = window.__backend;
    return backend.loadWeek(window.ShiftStore.currentWeekKey()).then((week) => {
      return Object.keys((week && week.constraints) || {}).length;
    });
  }), 0);

  console.log('\n== יציאה ==');
  await page.click('#preview-exit');
  await page.waitForTimeout(400);
  check('חזרנו לניהול', await page.locator('#manager-root').isVisible(), true);
  check('ומסך העובד נעלם', await page.locator('#employee-root').isHidden(), true);
  check('והסידור עדיין שם', await page.locator('#schedule-branch .emp-select').count() > 5, true);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות תצוגת העובד עברו');
