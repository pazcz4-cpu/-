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
  /* שלושה טורים ותו לא. כל השאר -- סניפים, משמרות, תפקידים,
     מכסה -- נקבע באתר, ושם זו בחירה מרשימה ולא הקלדה שצריכה
     לתאום איות. קובץ של עשרה טורים ריקים גורם ללקוח לסגור
     אותו; שלושה טורים הוא ממלא. */
  check('שלושה טורים בדיוק', built.headers.length, 3);
  check('שם מלא', built.headers[0], 'שם מלא');
  check('מספר טלפון', built.headers[1], 'מספר טלפון');
  check('מייל', built.headers[2], 'מייל');
  check('אין טור סניפים', built.headers.indexOf('סניפים'), -1);
  check('אין טור משמרות', built.headers.indexOf('משמרות'), -1);
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
        ['מיכל ברק', '050-1234567', 'michal@example.com'],
        ['אורי שדה', '', '']
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
  /* אין טור סניפים בקובץ, ולכן אין סניף שנפתח ממנו. זו הנקודה:
     הקובץ מביא אנשים, והשיוך נעשה באתר. */
  check('ולא נפתח סניף מהקובץ', /סניף/.test(counts), false);
  check('הכותרות לא נכנסו כעובד',
    (await page.locator('#import-preview').innerText()).indexOf('מיכל ברק') !== -1, true);

  await page.click('#import-confirm');
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => window.ShiftApp.getState().employees.length);
  check('שני עובדים נוספו בפועל', after - before, 2);

  const added = await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    const emp = state.employees.filter((e) => e.name === 'מיכל ברק')[0];
    const bare = state.employees.filter((e) => e.name === 'אורי שדה')[0];
    return {
      email: emp && emp.email, phone: emp && emp.phone,
      bareCreated: !!bare, bareEmail: bare && bare.email
    };
  });
  check('המייל נקלט', added.email, 'michal@example.com');
  check('הטלפון נקלט', added.phone, '050-1234567');
  /* שם לבדו מספיק: הטלפון והמייל נחוצים כדי לשלוח פרטי כניסה,
     ולא כדי ליצור עובד */
  check('עובד עם שם בלבד נוצר', added.bareCreated, true);
  check('ובלי מייל', added.bareEmail, '');

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
