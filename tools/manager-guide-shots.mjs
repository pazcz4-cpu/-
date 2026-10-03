/* צילומי המסך למדריך השבועי של המנהל.

   אותה סיבה שבגללה צילומי מדריך העובד נוצרים בכלי ולא ביד: המסך
   משתנה, וצילום שצולם פעם אחת מראה כפתור שכבר אינו שם. כאן הצילומים
   נוצרים מהמערכת עצמה, והרצה אחת מחדשת את כולם אחרי כל שינוי במסך.

   הרצה: node tools/manager-guide-shots.mjs
   הפלט: assets/manager-guide/*.png – נכנסים ל-docs/manager-guide/index.html.

   השרת מדומה בדפדפן, ולכן אין כאן שום נתון של לקוח אמיתי: העסק,
   העובדים והבקשות נולדים ומתים בתוך ההרצה. השמות הם שמות דמיוניים. */
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
const OUT = path.join(here, '..', 'assets', 'manager-guide');
fs.mkdirSync(OUT, { recursive: true });

const NAMES = ['דנה כהן', 'יוסי לוי', 'מיכל אברהם', 'אורי מזרחי',
  'נועה פרץ', 'איתי ביטון', 'שירה דוד', 'רון כץ'];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 }, locale: 'he-IL', deviceScaleFactor: 2
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
page.on('dialog', async (d) => { await d.accept(); });

const saved = [];

/* סימון על גבי הצילום: מסגרת ומספר קטן, כדי שהטקסט במדריך יוכל
   להגיד "לחצו על 1" במקום לתאר איפה הכפתור נמצא. הסימון נוסף רק
   לצילום ומוסר מיד אחריו. */
async function mark(selector, number, nth) {
  await page.evaluate(([sel, num, index]) => {
    const nodes = document.querySelectorAll(sel);
    const node = nodes[index || 0];
    if (!node) throw new Error('אין אלמנט לסימון: ' + sel);
    node.dataset.guideMarked = '1';
    node.style.outline = '3px solid #e11d48';
    node.style.outlineOffset = '3px';
    node.style.borderRadius = node.style.borderRadius || '8px';
    const badge = document.createElement('span');
    badge.className = 'guide-badge';
    badge.textContent = String(num);
    badge.style.cssText = 'position:absolute;z-index:99999;width:26px;height:26px;' +
      'border-radius:50%;background:#e11d48;color:#fff;font:700 15px/26px sans-serif;' +
      'text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.35);pointer-events:none';
    const rect = node.getBoundingClientRect();
    badge.style.top = (rect.top + window.scrollY - 13) + 'px';
    badge.style.left = (rect.left + window.scrollX - 13) + 'px';
    document.body.appendChild(badge);
  }, [selector, number, nth || 0]);
}

async function unmark() {
  await page.evaluate(() => {
    document.querySelectorAll('.guide-badge').forEach((n) => n.remove());
    document.querySelectorAll('[data-guide-marked]').forEach((n) => {
      n.style.outline = ''; n.style.outlineOffset = ''; delete n.dataset.guideMarked;
    });
  });
}

async function hideNoise() {
  await page.evaluate(() => {
    ['#demo-banner', '#local-notice', '#toast', '.toast'].forEach((sel) => {
      const node = document.querySelector(sel);
      if (node) node.style.display = 'none';
    });
  });
}

/* צילום של אלמנט אחד */
async function shotEl(name, selector) {
  await hideNoise();
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const file = path.join(OUT, name + '.png');
  await el.screenshot({ path: file });
  saved.push(name + ' · ' + (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
}

/* צילום של החלק בדף שמקיף כמה אלמנטים (למשל כפתור ותפריט שנפתח
   ממנו). הגזירה נחתכת לגבולות החלון, כדי שתפריט שגולש מהקצה לא
   יפיל את הצילום. */
async function shotRegion(name, selectors, pad) {
  await hideNoise();
  const box = await page.evaluate(([sels, gap]) => {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    sels.forEach((sel) => {
      const node = document.querySelector(sel);
      if (!node) throw new Error('אין אלמנט: ' + sel);
      const rc = node.getBoundingClientRect();
      l = Math.min(l, rc.left); t = Math.min(t, rc.top);
      r = Math.max(r, rc.right); b = Math.max(b, rc.bottom);
    });
    const W = document.documentElement.clientWidth;
    const H = window.innerHeight;
    l = Math.max(0, l - gap); t = Math.max(0, t - gap);
    r = Math.min(W, r + gap); b = Math.min(H, b + gap);
    return { x: l, y: t, width: r - l, height: b - t };
  }, [selectors, pad || 0]);
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, clip: box, fullPage: true });
  saved.push(name + ' · ' + (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
}

/* צילום של רצועה: מראש האלמנט הראשון ועד ראש השני (או תחתית הראשון) */
async function shotBand(name, fromSel, toSel, extra) {
  await hideNoise();
  await page.locator(fromSel).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const box = await page.evaluate(([a, b, add]) => {
    const start = document.querySelector(a);
    const stop = b ? document.querySelector(b) : null;
    if (!start) return null;
    const s = start.getBoundingClientRect();
    const top = s.top + window.scrollY;
    const bottom = stop ? stop.getBoundingClientRect().top + window.scrollY
      : s.bottom + window.scrollY;
    return { x: 0, y: Math.max(0, top - 8), width: document.documentElement.clientWidth,
      height: bottom - top + 8 + (add || 0) };
  }, [fromSel, toSel, extra || 0]);
  if (!box || box.height < 20) throw new Error('לא נמצא אזור לצילום: ' + name);
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, clip: box });
  saved.push(name + ' · ' + (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
}

/* ===== הקמת העסק ===== */
await skipWizard(page, { defaultWeek: true });
await page.goto(url('app.html'));
await page.waitForTimeout(500);
await page.click('[data-auth-mode="signup"]');
await page.fill('input[name="companyName"]', 'קפה הגן');
await page.fill('input[name="name"]', 'פז');
await page.fill('input[name="email"]', 'boss@demo.test');
await page.fill('input[name="password"]', 'secret123');
await page.fill('input[name="phone"]', '054-1234567');
await page.click('#signup-form button[type="submit"]');
await page.waitForTimeout(1500);
await loadSample(page);

/* שמות אמיתיים במקום "עובד/ת 3": צילום עם שמות גנריים נראה כמו
   בדיקה, ומדריך צריך להיראות כמו העסק של הקורא. */
await page.evaluate((names) => {
  const app = window.ShiftApp;
  const state = app.getState();
  state.employees.forEach((emp, i) => { emp.name = names[i] || emp.name; });
  /* שיוך לסניפים כמו בעסק אמיתי: מי שעובד בסניף אחד, מי שבשניים,
     ומי שלא סומן בכלל (זמין בכל הסניפים) */
  state.employees[0].branches = ['br-center'];
  state.employees[1].branches = ['br-north', 'br-south'];
  state.employees[2].branches = [];
  app.applyRemoteConfig({
    settings: state.settings, branches: state.branches, employees: state.employees
  });
  app.persistConfig();
}, NAMES);
await page.waitForTimeout(600);

/* ===== זריעת בקשות דרך השרת =====

   בקשות שנכתבות רק לזיכרון של הדף לא קיימות בשרת, ולכן לחיצה על
   "אישור" מחזירה "הבקשה לא נמצאה" -- והצילום של הלוח היה מראה חמש
   בקשות שעדיין ממתינות אחרי שאושרו. כאן הן נכתבות למקום שבו עובד
   אמיתי היה כותב אותן, והדף נטען מחדש ממנו. */
await page.evaluate(() => {
  const b = window.__backend, Store = window.ShiftStore;
  const cid = Object.keys(b.db.data)[0];
  const data = b._companyData(cid);
  const emps = data.config.employees;
  const tmp = { weeks: {} };
  const put = (weekKey, key, record) => {
    if (!data.weeks[weekKey]) {
      data.weeks[weekKey] = JSON.parse(JSON.stringify(Store.getWeek(tmp, weekKey)));
    }
    data.weeks[weekKey].constraints[key] = record;
  };
  const base = () => ({
    off: false, blocked: {}, preferred: {}, note: '', status: 'pending',
    requestedAt: new Date().toISOString(), managerNote: ''
  });
  /* המנהל נפתח על השבוע הבא, ולכן הבקשות נזרעות אליו */
  const wk = Store.shiftWeekKey(Store.currentWeekKey(), 1);
  const req = (i, day, extra) => put(wk, emps[i].id + '|' + day, Object.assign(base(), extra));
  req(0, 4, { off: true, note: 'תור לרופא' });
  req(1, 2, { blocked: { evening: true }, note: 'לימודים בערב' });
  req(2, 0, { preferred: { morning: true } });
  req(3, 5, { off: true, note: 'חתונה במשפחה' });
  req(4, 5, { off: true, note: 'אירוע משפחתי' });

  /* חופשה מראש: איתי ביטון, חמישה ימים, בעוד שבועיים ומעלה */
  const d = new Date(); d.setDate(d.getDate() + 16);
  const e = new Date(d); e.setDate(e.getDate() + 4);
  const iso = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') +
    '-' + String(x.getDate()).padStart(2, '0');
  Store.leaveDays(iso(d), iso(e)).forEach((day) => {
    put(day.weekKey, emps[5].id + '|' + day.dayIdx, Store.leaveRecord({
      from: iso(d), to: iso(e), note: 'חתונה של אחי', requestId: 'lv-demo'
    }));
  });
  b._save();
});
await page.reload();
await page.waitForTimeout(1500);
await hideNoise();

/* ===== 1. בקשות אילוץ ממתינות ===== */
await page.click('.tab[data-tab="constraints"]');
await page.waitForTimeout(800);

/* קודם פותחים את רשימת "מי עוד ביקש": הלחיצה מציירת מחדש את
   הפאנל ומוחקת כל סימון שכבר הוצב עליו. */
await page.locator('#pending-constraints .c-same').first().click().catch(() => {});
await page.waitForTimeout(300);
await mark('#pending-constraints .pending-item .approve', 1, 0);
await mark('#pending-constraints .pending-item .reject', 2, 0);
await mark('#pending-constraints .c-same', 3, 0);
await shotEl('01-pending-requests', '#pending-constraints');
await unmark();

/* חופשה: לפני שמחליטים על הבקשות היומיות, כדי שהפאנל עדיין מלא */
await page.locator('#leave-requests-panel').scrollIntoViewIfNeeded();
await mark('#leave-requests .approve', 1, 0);
await mark('#leave-requests .reject', 2, 0);
await shotEl('03-leave-requests', '#leave-requests-panel');
await unmark();

/* מחליטים בפועל: אישור לשתיים, דחייה לאחת. כך הלוח מראה את שלושת
   המצבים בצילום הבא. */
await page.locator('#pending-constraints .pending-item .approve').first().click();
await page.waitForTimeout(600);
await page.locator('#pending-constraints .pending-item .approve').first().click();
await page.waitForTimeout(600);
await page.locator('#pending-constraints .pending-item .reject').first().click();
await page.waitForTimeout(800);
await shotEl('02-constraints-board', '#constraints-grid');

/* ===== 2. עובדים: שיוך לסניפים ===== */
await page.click('.tab[data-tab="employees"]');
await page.waitForTimeout(700);
await page.locator('.card[data-emp] [data-action="toggle-card"]').first().click();
await page.waitForTimeout(400);
await mark('.card[data-emp]:nth-of-type(1) [data-action="toggle-branch"]', 1, 0);
await mark('.card[data-emp]:nth-of-type(3) .card-summary', 2, 0);
await shotRegion('16-employee-branches', ['.card[data-emp]:nth-of-type(1)', '.card[data-emp]:nth-of-type(3)'], 10);
await unmark();

/* עובד בהתלמדות: וי, ובחירת מי מכשיר. מסמנים לצילום ומבטלים מיד,
   כדי שהסידור בהמשך המדריך לא ישתנה בגללו. הכרטיס נבחר לפי המזהה
   שלו: מיקום בין אחים משתנה כשכרטיס נפתח. */
const trainId = await page.locator('.card[data-emp]').nth(4).getAttribute('data-emp');
const trainCard = '.card[data-emp="' + trainId + '"]';
if (!(await page.locator(trainCard + ' input[data-field="trainee"]').isVisible())) {
  await page.locator(trainCard + ' [data-action="toggle-card"]').first().click();
  await page.waitForTimeout(300);
}
await page.locator(trainCard + ' input[data-field="trainee"]').check();
await page.waitForTimeout(400);
await page.locator(trainCard + ' [data-action="toggle-mentor"]').nth(0).click();
await page.waitForTimeout(300);
await page.locator(trainCard + ' [data-action="toggle-mentor"]').nth(1).click();
await page.waitForTimeout(300);
await mark(trainCard + ' input[data-field="trainee"]', 1);
await mark(trainCard + ' .mentor-pills', 2);
await shotEl('18-trainee', trainCard + ' .trainee-field');
await unmark();
await page.locator(trainCard + ' input[data-field="trainee"]').uncheck();
await page.waitForTimeout(300);

/* ===== 3. הגדרות השבוע והסניפים ===== */
await page.click('.tab[data-tab="branches"]');
await page.waitForTimeout(700);
await mark('#branches-list > .card:first-child [data-action="reset-branch"]', 1);
await shotEl('04-branch-definition', '#branches-list > *');
await unmark();

/* איפוס הדרישות של הסניף: הטבלה מתאפסת מהשבוע הזה והלאה */
await page.locator('#branches-list > .card:first-child [data-action="reset-branch"]').click();
await page.waitForTimeout(600);
await mark('#branches-list > .card:first-child .week-needs-banner', 2);
await shotEl('17-week-needs-reset', '#branches-list > .card:first-child');
await unmark();

/* משחזרים את הדרישות כדי שהמשך הצילומים ייעשה על סניף מלא. אין
   כפתור חזרה, ולכן מחזירים דרך הנתונים */
await page.evaluate(() => {
  const app = window.ShiftApp, state = app.getState();
  state.branches.forEach((b) => { delete b.needsFrom; });
  app.applyRemoteConfig({
    settings: state.settings, branches: state.branches, employees: state.employees
  });
  app.persistConfig();
});
await page.waitForTimeout(600);

await page.click('.tab[data-tab="schedule"]');
await page.waitForTimeout(700);
await page.evaluate(() => window.scrollTo(0, 0));
await page.click('#tools-menu');
await page.waitForTimeout(400);
console.log('tools rects', JSON.stringify(await page.evaluate(() =>
  ['#tools-menu', '#tools-pop'].map((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return [s, Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
  }))));
await shotRegion('05-week-tools-menu', ['#tools-menu', '#tools-pop'], 12);
await page.click('#tools-menu');
await page.waitForTimeout(250);

/* ===== 3. בנייה אוטומטית ===== */
await mark('#generate', 1);
await shotBand('06-toolbar', '.tb-do', '#issues');
await unmark();
await page.click('#generate');
await page.waitForTimeout(2500);
await shotBand('07-after-generate', '.tb-do', '#shift-tray', 20);

/* מה נשאר פתוח: לוחצים על הכיתוב הראשון, שנפתח לרשימה מפורטת */
await page.locator('.issue-chip').first().click();
await page.waitForTimeout(500);
await mark('.issue-chip', 1, 0);
await shotEl('08-issues-open', '#issues');
await unmark();
await page.locator('.issue-chip').first().click().catch(() => {});
await page.waitForTimeout(300);

/* ===== 4. התאמות ידניות ===== */
await page.waitForTimeout(300);
await mark('#shift-tray', 1);
await mark('#schedule-employee .shift-tile', 2, 0);
await shotBand('09-drag-area', '#shift-tray', '#workload');
await unmark();

await page.click('.view-switch [data-view="branch"]');
await page.waitForTimeout(600);
await shotEl('10-branch-view', '#schedule-branch');
await page.click('.view-switch [data-view="employee"]');
await page.waitForTimeout(500);

/* ===== 5. פרסום ===== */
await page.evaluate(() => window.scrollTo(0, 0));
await mark('#publish-week', 1);
await shotBand('11-publish-button', '.tb-do', '#issues', 10);
await unmark();
await page.click('#publish-week');
await page.waitForTimeout(700);
await mark('.confirm-card [data-confirm-yes]', 2);
await shotEl('12-publish-confirm', '.confirm-card');
await unmark();

/* מפרסמים בפועל, ומצלמים את הסרגל אחרי: זה המצב שהעובדים רואים,
   וזה גם המצב שבו הסידור ננעל. */
await page.click('.confirm-card [data-confirm-yes]');
await page.waitForTimeout(1200);
await page.evaluate(() => window.scrollTo(0, 0));
await shotBand('13-published', '.tb-do', '#issues', 10);

/* ניסיון לערוך סידור שפורסם: החלון שמבקש להחליט איך להמשיך */
await page.locator('#schedule-employee .shift-tile').first().click();
await page.waitForTimeout(800);
const lockCard = page.locator('.confirm-card, .why-card').first();
if (await lockCard.count()) {
  await lockCard.screenshot({ path: path.join(OUT, '14-locked-choice.png') });
  saved.push('14-locked-choice');
}
await page.locator('[data-confirm-no]').first().click().catch(() => {});
await page.waitForTimeout(400);

/* ייצוא: פותחים את התפריט ומצלמים אותו */
await page.evaluate(() => window.scrollTo(0, 0));
await page.click('#export-menu');
await page.waitForTimeout(400);
await shotRegion('15-export-menu', ['#export-menu', '#export-pop'], 12);
await page.click('#export-menu');

/* הגדרות: מועד סגירת אילוצים. הערכים בצילום הם דוגמה: אין מועד
   מראש, וכל עסק קובע לעצמו אם לסגור ומתי. */
await page.click('.tab[data-tab="settings"]');
await page.waitForTimeout(300);
await page.check('#opt-deadline');
await page.selectOption('#deadline-day', '3');
await page.fill('#deadline-time', '18:00');
await page.locator('#deadline-time').blur();
await page.waitForTimeout(400);
await page.locator('[data-i18n="settings.deadlineTitle"]').scrollIntoViewIfNeeded();
await mark('#opt-deadline', 1);
await mark('#deadline-day', 2);
await shotEl('19-settings-deadline', '.settings-block:has(#opt-deadline)');
await unmark();

console.log(saved.join('\n'));
console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
