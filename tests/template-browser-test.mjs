/* תבנית האקסל: הורדה, מילוי, והעלאה בחזרה.
   הרצה: node tests/template-browser-test.mjs

   הבדיקה המרכזית כאן היא מעגל סגור: הקובץ שהמערכת נותנת חוזר
   אליה ומתקבל. תבנית שהמערכת שלנו עצמה לא יודעת לקרוא היא הדבר
   הגרוע ביותר שאפשר לתת ללקוח חדש. */
import { createRequire } from 'node:module';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const LOCAL = url('index.html');

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

try {
  await skipWizard(page);
  await page.goto(LOCAL);
  await page.waitForTimeout(500);
  await page.click('.tab[data-tab="employees"]');
  await page.waitForTimeout(300);
  await page.click('#import-employees');
  await page.waitForTimeout(400);

  console.log('\n== הכפתור קיים ==');
  check('כפתור התבנית מוצג', await page.locator('#import-template').isVisible(), true);
  check('הכיתוב בעברית',
    (await page.locator('#import-template').innerText()).trim(), /תבנית/);

  console.log('\n== מה יש בקובץ שנבנה ==');
  const built = await page.evaluate(() => {
    const bytes = window.ShiftTemplate.build(window.ShiftApp.getState());
    /* הלוך ושוב דרך הקורא שלנו, בדיוק כמו קובץ שהלקוח מעלה */
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return window.ShiftXlsxRead.readRows(buffer).then((rows) => ({
      headers: rows[0],
      rowCount: rows.length,
      fileName: window.ShiftTemplate.fileName()
    }));
  });
  check('שם הקובץ', built.fileName, /\.xlsx$/);
  check('הטור הראשון הוא השם', built.headers[0], 'שם');
  check('תשעה טורים', built.headers.length, 9);
  check('יש טור תפקידים', built.headers.indexOf('תפקידים') > 0, true);
  check('ויש טור טלפון', built.headers.indexOf('טלפון') > 0, true);
  /* שורת דוגמה בגיליון הנתונים הייתה נכנסת כעובד אמיתי אצל כל
     מי ששכח למחוק אותה */
  check('גיליון הנתונים מכיל כותרות בלבד', built.rowCount, 1);

  console.log('\n== לשונית ההסבר מכירה את העסק הזה ==');
  const help = await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    const sheet = window.ShiftTemplate.helpSheet(state);
    const flat = sheet.rows.map((row) => (row.cells || row)
      .map((cell) => (cell && cell.v !== undefined ? cell.v : cell)).join(' | ')).join('\n');
    return {
      text: flat,
      firstShift: window.ShiftStore.shifts(state)[0].name,
      firstBranch: (state.branches[0] || {}).name || ''
    };
  });
  check('המשמרות של העסק מופיעות', help.text.indexOf(help.firstShift) !== -1, true);
  check('הסניפים של העסק מופיעים', help.text.indexOf(help.firstBranch) !== -1, true);
  check('נאמר מה חובה', help.text, /חובה/);

  console.log('\n== מילוי והעלאה בחזרה ==');
  const before = await page.evaluate(() => window.ShiftApp.getState().employees.length);

  /* בונים קובץ כמו לקוח שמילא את התבנית, ומעלים אותו דרך אותו
     שדה קובץ שהלקוח משתמש בו */
  await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    const labels = window.ShiftImport.columnLabels();
    const shift = window.ShiftStore.shifts(state)[0].name;
    const branch = (state.branches[0] || {}).name || 'סניף חדש';
    const bytes = window.ShiftXlsx.build([{
      name: 'עובדים',
      rows: [
        labels,
        ['מיכל ברק', branch, shift, '', '4', 'michal@example.com', '', ''],
        ['אורי שדה', 'סניף שלא היה', shift, '', '3', '', 'חדש', '']
      ]
    }]);
    const file = new File([bytes], 'staff.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const input = document.getElementById('import-file');
    const data = new DataTransfer();
    data.items.add(file);
    input.files = data.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(900);

  const counts = (await page.locator('.import-counts').innerText()).trim();
  check('שני עובדים זוהו מהקובץ', counts, /2 עובדים ייווצרו/);
  check('גם הסניף החדש זוהה', counts, /סניף חדש אחד ייפתח/);
  check('הכותרות לא נכנסו כעובד',
    (await page.locator('#import-preview').innerText()).indexOf('מיכל ברק') !== -1, true);

  await page.click('#import-confirm');
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => window.ShiftApp.getState().employees.length);
  check('שני עובדים נוספו בפועל', after - before, 2);

  const added = await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    const emp = state.employees.filter((e) => e.name === 'מיכל ברק')[0];
    const branch = state.branches.filter((b) => b.name === 'סניף שלא היה')[0];
    return { email: emp && emp.email, max: emp && emp.maxShifts, newBranch: !!branch };
  });
  check('המייל נקלט', added.email, 'michal@example.com');
  check('המכסה נקלטה', added.max, 4);
  check('הסניף החדש נפתח', added.newBranch, true);

  console.log('\n== קובץ שאינו אקסל ==');
  await page.click('#import-employees');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'broken.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const input = document.getElementById('import-file');
    const data = new DataTransfer();
    data.items.add(file);
    input.files = data.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  check('נאמר שהקובץ אינו תקין',
    (await page.locator('#toast').innerText()).trim(), /אקסל/);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות התבנית עברו');
