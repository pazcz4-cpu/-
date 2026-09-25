/* הזזת משמרות בין עובדים בתצוגה לפי עובד.

   החוקים עצמם נבדקים ב-run-tests.js מול הנתונים. כאן נבדק מה
   שקורה במסך: שהקוביות קיימות, שגרירה אמיתית מזיזה, שלחיצה
   מרימה ומניחה, ושהשינוי הגיע לשרת ולא רק לתצוגה.

   הרצה: npm run test:move */
import { createRequire } from 'node:module';
import { loadSample } from './_sample.mjs';
import { skipWizard } from './_wizard.mjs';
import { clickTool } from './_menu.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const APP = url('app.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async (d) => { await d.accept(); });

  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="email"]', 'boss@move.test');
  await page.fill('input[name="password"]', 'secret123');
  /* הטלפון נדרש בהרשמה: בלעדיו אין לנו דרך ליצור קשר
     עם הלקוח כשמשהו בחשבון דורש טיפול. */
  await page.fill('input[name="phone"]', '054-1234567');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1400);
  await loadSample(page);

  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(500);
  await page.click('#generate');
  await page.waitForTimeout(2200);

  console.log('\n== כל משמרת היא קובייה ==');
  check('התצוגה לפי עובד פעילה',
    await page.locator('.view-switch [data-view="employee"]').getAttribute('aria-pressed'), 'true');
  const tiles = await page.locator('#schedule-employee .shift-tile').count();
  check('יש קוביות על המסך', tiles > 0, true);
  check('הן ניתנות לגרירה',
    await page.locator('#schedule-employee .shift-tile').first().getAttribute('draggable'), 'true');
  check('ונגישות מהמקלדת',
    await page.locator('#schedule-employee .shift-tile').first().getAttribute('tabindex'), '0');
  check('שטח ההמתנה מוצג', await page.locator('#shift-tray').isVisible(), true);

  /* מוצאים שתי קוביות של שני עובדים שונים באותו יום – זה המהלך
     שבגללו הכל נבנה: להחליף בין שניים באותו בוקר. */
  const pair = await page.evaluate(() => {
    const byDay = {};
    document.querySelectorAll('#schedule-employee .shift-tile').forEach((tile) => {
      const day = tile.dataset.day;
      (byDay[day] = byDay[day] || []).push({
        id: tile.dataset.tile, emp: tile.dataset.emp,
        branch: tile.dataset.branch, shift: tile.dataset.shift
      });
    });
    for (const day of Object.keys(byDay)) {
      const list = byDay[day];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (list[i].emp !== list[j].emp && list[i].branch !== list[j].branch) {
            return { day: Number(day), a: list[i], b: list[j] };
          }
        }
      }
    }
    return null;
  });
  check('נמצאו שני עובדים באותו יום', !!pair, true);

  const whoIn = (day, branch, shift) => page.evaluate(([d, br, sh]) => {
    const w = window.ShiftApp.getState().weeks[window.ShiftApp.weekKey()];
    return (w.assignments[d + '|' + br + '|' + sh] || []).join(',');
  }, [day, branch, shift]);

  console.log('\n== גרירה אמיתית מחליפה בין שניים ==');
  const beforeA = await whoIn(pair.day, pair.a.branch, pair.a.shift);
  const beforeB = await whoIn(pair.day, pair.b.branch, pair.b.shift);
  const source = page.locator(`#schedule-employee .shift-tile[data-tile="${pair.a.id}"]`);
  const target = page.locator(`#schedule-employee td.drop-cell[data-drop-emp="${pair.b.emp}"][data-drop-day="${pair.day}"]`);
  await source.dragTo(target);
  await page.waitForTimeout(900);
  const afterA = await whoIn(pair.day, pair.a.branch, pair.a.shift);
  const afterB = await whoIn(pair.day, pair.b.branch, pair.b.shift);
  check('המשמרת הראשונה עברה לשני', afterA, beforeB);
  check('והשנייה עברה לראשון', afterB, beforeA);

  console.log('\n== השינוי הגיע לשרת, לא רק למסך ==');
  check('השרת מחזיק את אותו שיבוץ', await page.evaluate(([d, br, sh]) =>
    window.__backend.loadWeek(window.ShiftApp.weekKey())
      .then((w) => ((w.assignments || {})[d + '|' + br + '|' + sh] || []).join(',')),
  [pair.day, pair.a.branch, pair.a.shift]), afterA);
  check('והמשמרת סומנה כידנית, כדי שבנייה חוזרת לא תדרוס', await page.evaluate(([d, br, sh]) => {
    const w = window.ShiftApp.getState().weeks[window.ShiftApp.weekKey()];
    return !!(w.manual || {})[d + '|' + br + '|' + sh];
  }, [pair.day, pair.a.branch, pair.a.shift]), true);

  console.log('\n== שחרור לשטח ההמתנה מפנה את המשמרת ==');
  const freed = await page.evaluate(() => {
    const tile = document.querySelector('#schedule-employee .shift-tile');
    return { id: tile.dataset.tile, day: Number(tile.dataset.day),
      branch: tile.dataset.branch, shift: tile.dataset.shift, emp: tile.dataset.emp };
  });
  const trayBefore = await page.locator('#shift-tray .shift-tile').count();
  await page.locator(`#schedule-employee .shift-tile[data-tile="${freed.id}"]`)
    .dragTo(page.locator('#shift-tray'));
  await page.waitForTimeout(900);
  const left = await whoIn(freed.day, freed.branch, freed.shift);
  check('העובד ירד מהמשמרת', left.split(',').indexOf(freed.emp), -1);
  check('והמשמרת הופיעה בשטח ההמתנה',
    await page.locator('#shift-tray .shift-tile').count() > trayBefore, true);

  console.log('\n== משיכה משטח ההמתנה מאיישת ==');
  const back = await page.evaluate(() => {
    const tile = document.querySelector('#shift-tray .shift-tile');
    return tile ? { id: tile.dataset.tile, day: Number(tile.dataset.day),
      branch: tile.dataset.branch, shift: tile.dataset.shift } : null;
  });
  check('יש משמרת בשטח ההמתנה', !!back, true);
  /* מי שפנוי באותו יום: תא של עובד שאין לו משמרת אז */
  const freeEmp = await page.evaluate((day) => {
    const cells = Array.from(document.querySelectorAll(
      `#schedule-employee td.drop-cell[data-drop-day="${day}"]`));
    const empty = cells.find((cell) => !cell.querySelector('.shift-tile'));
    return empty ? empty.dataset.dropEmp : null;
  }, back.day);
  if (freeEmp) {
    await page.locator(`#shift-tray .shift-tile[data-tile="${back.id}"]`)
      .dragTo(page.locator(`#schedule-employee td.drop-cell[data-drop-emp="${freeEmp}"][data-drop-day="${back.day}"]`));
    await page.waitForTimeout(900);
    check('המשמרת אוישה',
      (await whoIn(back.day, back.branch, back.shift)).split(',').indexOf(freeEmp) !== -1, true);
  } else {
    check('דילוג: אין עובד פנוי ביום הזה', true, true);
  }

  console.log('\n== לחיצה: להרים, ואז להניח ==');
  /* זה המסלול של מגע ומקלדת. בלעדיו התכונה קיימת רק לעכבר. */
  const pick = await page.evaluate(() => {
    const tile = document.querySelector('#schedule-employee .shift-tile');
    return { id: tile.dataset.tile, day: Number(tile.dataset.day),
      branch: tile.dataset.branch, shift: tile.dataset.shift, emp: tile.dataset.emp };
  });
  await page.locator(`#schedule-employee .shift-tile[data-tile="${pick.id}"]`).click();
  await page.waitForTimeout(400);
  check('הקובייה סומנה כמורמת',
    await page.locator(`#schedule-employee .shift-tile[data-tile="${pick.id}"]`)
      .getAttribute('aria-pressed'), 'true');
  const other = await page.evaluate(([day, emp]) => {
    const cells = Array.from(document.querySelectorAll(
      `#schedule-employee td.drop-cell[data-drop-day="${day}"]`))
      .filter((cell) => cell.dataset.dropEmp !== emp);
    /* תא ריק אם יש, אחרת תא תפוס – שם המהלך הוא החלפה, וגם
       אותו צריך לבדוק דרך לחיצה ולא רק דרך גרירה. */
    const empty = cells.find((cell) => !cell.querySelector('.shift-tile'));
    const found = empty || cells[0];
    return found ? found.dataset.dropEmp : null;
  }, [pick.day, pick.emp]);
  if (other) {
    await page.locator(`#schedule-employee td.drop-cell[data-drop-emp="${other}"][data-drop-day="${pick.day}"]`).click();
    await page.waitForTimeout(900);
    check('הונחה אצל השני',
      (await whoIn(pick.day, pick.branch, pick.shift)).split(',').indexOf(other) !== -1, true);
    check('ואין יותר קובייה מורמת',
      await page.locator('#schedule-employee .shift-tile.picked').count(), 0);
  } else {
    check('דילוג: אין תא פנוי ביום הזה', true, true);
  }

  console.log('\n== Escape מבטל הרמה ==');
  /* מתחילים ממצב נקי: לחיצה על קובייה שכבר מורמת מורידה אותה */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.locator('#schedule-employee .shift-tile').first().click();
  await page.waitForTimeout(300);
  check('הורמה', await page.locator('.shift-tile.picked').count() > 0, true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('בוטלה', await page.locator('.shift-tile.picked').count(), 0);

  console.log('\n== במצב צפייה אין הזזה ==');
  await clickTool(page, '#view-only-toggle');
  await page.waitForTimeout(700);
  check('שטח ההמתנה נסגר', await page.locator('#shift-tray').isVisible(), false);
  const locked = await page.evaluate(() => {
    const w = window.ShiftApp.getState().weeks[window.ShiftApp.weekKey()];
    return JSON.stringify(w.assignments);
  });
  await page.locator('#schedule-employee .shift-tile').first().click();
  await page.waitForTimeout(500);
  check('לחיצה אינה מרימה', await page.locator('.shift-tile.picked').count(), 0);
  check('והשיבוץ לא זז', await page.evaluate(() => {
    const w = window.ShiftApp.getState().weeks[window.ShiftApp.weekKey()];
    return JSON.stringify(w.assignments);
  }), locked);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות ההזזה עברו');
