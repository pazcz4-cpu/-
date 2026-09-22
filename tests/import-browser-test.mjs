/* ייבוא רשימת עובדים: הדבקה, תצוגה מקדימה, אישור.
   הרצה: node tests/import-browser-test.mjs

   זה המסך שמחליט אם לקוח עם 30 עובדים באקסל נשאר או סוגר את
   הלשונית, ולכן נבדק כאן המסלול המלא ולא רק הפענוח. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clickTool, openMenuFor } from './_menu.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const LOCAL = 'file://' + path.join(here, '..', 'index.html');

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
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', async (d) => { await d.accept(); });

async function paste(text) {
  await page.evaluate((value) => {
    const field = document.getElementById('import-text');
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await page.waitForTimeout(400);
}

try {
  await page.goto(LOCAL);
  await page.waitForTimeout(500);
  await page.click('.tab[data-tab="employees"]');
  await page.waitForTimeout(300);

  const before = await page.evaluate(() => window.ShiftApp.getState().employees.length);
  const branchesBefore = await page.evaluate(() => window.ShiftApp.getState().branches.length);

  console.log('\n== פתיחת המסך ==');
  await page.click('#import-employees');
  await page.waitForTimeout(400);
  check('המסך נפתח', await page.locator('#import-overlay .import-card').isVisible(), true);
  check('אין מה לייבא לפני שהדביקו',
    (await page.locator('#import-preview').innerText()).trim(), /אין מה לייבא/);
  check('כפתור הייבוא כבוי', await page.locator('#import-confirm').isDisabled(), true);

  console.log('\n== הדבקה מאקסל (טורים מופרדים ב-Tab) ==');
  await paste([
    'שם\tסניף\tמשמרות\tמכסה',
    'דנה כהן\tסניף מרכז\tבוקר;ערב\t5',
    'יוסי לוי\tסניף הרצליה\t\t4',
    'רות אבני\t\tערב\t3',
    'עובד/ת 1\tסניף מרכז\t\t6',
    '\tסניף מרכז\t\t',
    'נועה גל\tסניף מרכז\tלילה\t4',
    'דנה כהן\tסניף מרכז\t\t5'
  ].join('\n'));

  const counts = (await page.locator('.import-counts').innerText()).trim();
  check('שלושה ייווצרו', counts, /3 עובדים ייווצרו/);
  check('שניים ידולגו', counts, /2 קיימים כבר וידולגו/);
  check('שתי שורות לא יובאו', counts, /2 שורות לא יובאו/);
  check('מוזכר הסניף החדש',
    (await page.locator('.import-note').innerText()).trim(), /סניף הרצליה/);

  const rows = await page.locator('.import-table tbody tr').allInnerTexts();
  check('שלוש שורות בתצוגה המקדימה', rows.length, 3);
  check('מי שאין לו סניף מסומן כמחליף כללי',
    rows.some((r) => r.includes('רות אבני') && r.includes('כל הסניפים')), true);
  check('מי שאין לו משמרות מקבל את כולן',
    rows.some((r) => r.includes('יוסי לוי') && r.includes('כל המשמרות')), true);
  check('הבעיות מוסברות בשורה ובסיבה',
    (await page.locator('.import-list.import-bad').innerText()),
    /שורה 6.*אין שם[\s\S]*שורה 7.*לילה/);
  check('הדילוגים מוסברים',
    (await page.locator('.import-list').first().innerText()), /כבר קיים במערכת/);

  console.log('\n== אישור הייבוא ==');
  check('הכפתור אומר כמה ייווצרו',
    (await page.locator('#import-confirm').innerText()).trim(), 'ייבוא 3 עובדים');
  await page.click('#import-confirm');
  await page.waitForTimeout(700);
  check('המסך נסגר', await page.locator('#import-overlay').isHidden(), true);
  check('ההודעה מסכמת', (await page.locator('#toast').innerText()).trim(),
    /יובאו 3 עובדים\. נפתח גם סניף חדש אחד\./);

  const after = await page.evaluate(() => window.ShiftApp.getState().employees);
  check('שלושה עובדים נוספו', after.length, before + 3);
  check('הסניף החדש נוסף',
    await page.evaluate(() => window.ShiftApp.getState().branches.length), branchesBefore + 1);

  const dana = after.filter((emp) => emp.name === 'דנה כהן')[0];
  check('דנה נוצרה', !!dana, true);
  check('עם המכסה מהקובץ', dana.maxShifts, 5);
  check('ועם שתי המשמרות שנכתבו', dana.shifts.join(','), 'morning,evening');
  const yossi = after.filter((emp) => emp.name === 'יוסי לוי')[0];
  check('יוסי קושר לסניף שנפתח בדרך', await page.evaluate((id) => {
    const state = window.ShiftApp.getState();
    const branch = state.branches.filter((b) => b.id === id)[0];
    return branch ? branch.name : null;
  }, yossi.branches[0]), 'סניף הרצליה');
  check('ולסניף החדש יש כבר ימים ושעות', await page.evaluate((id) => {
    const state = window.ShiftApp.getState();
    const branch = state.branches.filter((b) => b.id === id)[0];
    return Object.keys(branch.schedule || {}).length;
  }, yossi.branches[0]), 7);

  console.log('\n== הכרטיסים באמת על המסך ==');
  check('הכרטיסים נוספו לרשימה',
    await page.locator('#employees-list .card').count(), before + 3);

  console.log('\n== ייבוא שני: אותה רשימה לא תיווצר פעמיים ==');
  await page.click('#import-employees');
  await page.waitForTimeout(300);
  await paste('דנה כהן\nיוסי לוי\nרות אבני');
  check('הכל מדולג',
    (await page.locator('.import-counts').innerText()).trim(), /0 עובדים ייווצרו/);
  check('הכפתור כבוי שוב', await page.locator('#import-confirm').isDisabled(), true);

  console.log('\n== רשימת שמות בלבד, בלי טורים ==');
  await paste('אורי\nמיכל\nשירה');
  check('שלושה חדשים',
    (await page.locator('.import-counts').innerText()).trim(), /3 עובדים ייווצרו/);
  await page.click('#import-confirm');
  await page.waitForTimeout(700);
  check('נוספו', await page.evaluate(
    () => window.ShiftApp.getState().employees.length), before + 6);

  console.log('\n== אחרי רענון הנתונים נשמרו ==');
  await page.reload();
  await page.waitForTimeout(700);
  check('העובדים נשמרו', await page.evaluate(
    () => window.ShiftApp.getState().employees.length), before + 6);

  console.log('\n== ההתראות מסוכמות לשלושה מספרים ==');
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(300);
  check('שלושה מספרים', await page.locator('.issue-chip').count(), 3);
  check('המגירה סגורה, והסידור על המסך',
    await page.locator('.issues-drawer').count(), 0);
  const labels = await page.locator('.issue-chip').allInnerTexts();
  check('כל מספר נקרא כמשפט', labels.join(' | '),
    /איוש[\s\S]*הפר[\s\S]*המלצ/);
  await page.click('.issue-chip[data-group="staffing"]');
  await page.waitForTimeout(250);
  check('המגירה נפתחה', await page.locator('.issues-drawer .issue').count() > 0, true);
  check('ורק הקבוצה שנבחרה מוצגת', await page.evaluate(() =>
    Array.from(document.querySelectorAll('.issues-drawer .issue'))
      .every((node) => /חוסר באיוש|עודף באיוש|משמרת שאינה/.test(node.textContent))), true);
  await page.click('.issue-chip[data-group="staffing"]');
  await page.waitForTimeout(250);
  check('לחיצה שנייה סוגרת', await page.locator('.issues-drawer').count(), 0);
  check('קבוצה ריקה אינה נלחצת',
    await page.locator('.issue-chip[data-group="violations"]').isDisabled(), true);
  await page.click('.tab[data-tab="employees"]');
  await page.waitForTimeout(200);

  console.log('\n== הורדת שורה מהייבוא ==');
  const baseCount = await page.evaluate(() => window.ShiftApp.getState().employees.length);
  const baseBranches = await page.evaluate(() => window.ShiftApp.getState().branches.length);
  await page.click('#import-employees');
  await page.waitForTimeout(300);
  await paste([
    'שם\tסניף',
    'אביב רון\tסניף חולון',
    'גלי שדה\tסניף חולון',
    'תמר בר\tסניף רעננה'
  ].join('\n'));
  check('שלוש שורות מסומנות',
    await page.locator('.import-table tbody input[data-pick]:checked').count(), 3);
  check('הסיכום סופר גם סניפים',
    (await page.locator('.import-counts').innerText()).trim(), /2 סניפים חדשים ייפתחו/);

  await page.uncheck('.import-table tbody tr:nth-child(3) input[data-pick]');
  await page.waitForTimeout(250);
  check('הכפתור מתעדכן למה שנשאר',
    (await page.locator('#import-confirm').innerText()).trim(), 'ייבוא 2 עובדים');
  check('השורה שהורדה מסומנת חזותית',
    await page.locator('.import-table tbody tr.import-off').count(), 1);
  check('והסניף שאיש כבר לא צריך יורד מהסיכום',
    (await page.locator('.import-counts').innerText()).trim(), /סניף חדש אחד ייפתח/);
  check('ונאמר כמה שורות הוסרו',
    (await page.locator('.import-counts').innerText()).trim(), /שורה אחת הוסרה/);

  await page.click('#import-confirm');
  await page.waitForTimeout(700);
  const names = await page.evaluate(() =>
    window.ShiftApp.getState().employees.map((e) => e.name));
  check('רק המסומנים נוצרו', names.includes('אביב רון') && names.includes('גלי שדה'), true);
  check('ומי שהורד לא נוצר', names.includes('תמר בר'), false);
  check('וסניף רעננה לא נפתח', await page.evaluate(
    () => window.ShiftApp.getState().branches.some((b) => b.name === 'סניף רעננה')), false);

  console.log('\n== ביטול ייבוא ==');
  check('ההודעה מציעה ביטול', await page.locator('.toast-action').isVisible(), true);
  await page.click('.toast-action');
  await page.waitForTimeout(600);
  check('הכרטיסים הוסרו', await page.evaluate(
    () => window.ShiftApp.getState().employees.length), baseCount);
  check('והסניף שנפתח בייבוא הוסר איתם', await page.evaluate(
    () => window.ShiftApp.getState().branches.length), baseBranches);
  check('ונאמר שהייבוא בוטל',
    (await page.locator('#toast').innerText()).trim(), /הייבוא בוטל/);
  check('גם הרשימה על המסך התעדכנה',
    await page.locator('#employees-list .card').count(), baseCount);

  console.log('\n== כפילות לפי מייל ==');
  await page.click('#import-employees');
  await page.waitForTimeout(300);
  await paste([
    'שם\tמייל',
    'נועם דר\tnoam@x.co.il',
    'נ. דר\tNOAM@X.CO.IL',
    'שקד לוי\tלא-מייל'
  ].join('\n'));
  check('רק אחד ייווצר',
    (await page.locator('.import-counts').innerText()).trim(), /עובד אחד ייווצר/);
  check('הכפילות במייל מוסברת',
    (await page.locator('.import-list').first().innerText()), /מופיע יותר מפעם אחת/);
  check('ומייל שבור נעצר',
    (await page.locator('.import-list.import-bad').innerText()), /כתובת מייל שאינה תקינה/);
  check('טור המייל מוצג בתצוגה המקדימה',
    (await page.locator('.import-table tbody').innerText()), /noam@x\.co\.il/);
  await page.click('#import-confirm');
  await page.waitForTimeout(700);

  check('המייל נשמר על הכרטיס', await page.evaluate(() =>
    (window.ShiftApp.getState().employees.filter((e) => e.name === 'נועם דר')[0] || {}).email),
    'noam@x.co.il');

  await page.click('#import-employees');
  await page.waitForTimeout(300);
  await paste('שם\tמייל\nמישהו אחר לגמרי\tnoam@x.co.il');
  check('מייל שכבר על כרטיס קיים חוסם ייבוא חוזר',
    (await page.locator('.import-counts').innerText()).trim(), /0 עובדים ייווצרו/);
  check('והסיבה נאמרת',
    (await page.locator('.import-list').first().innerText()), /כבר יש כרטיס עם המייל/);
  await page.click('[data-import-close]');
  await page.waitForTimeout(300);

  console.log('\n== מצב צפייה חוסם ייבוא ==');
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(200);
  await clickTool(page, '#view-only-toggle');
  await page.waitForTimeout(300);
  await page.click('.tab[data-tab="employees"]');
  await page.waitForTimeout(300);
  check('הכפתור נעול', await page.locator('#import-employees').isDisabled(), true);
  await page.click('.tab[data-tab="schedule"]');
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
console.log('\n✅ כל בדיקות הייבוא עברו');
