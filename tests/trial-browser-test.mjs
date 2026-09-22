/* מסלול הניסיון עם כרטיס מראש:
   הרשמה → אין כרטיס → שמירת כרטיס → החיוב הראשון בתום התקופה →
   ביטול לפני החיוב → חידוש. כולל בדיקה שהחיוב באמת מתבצע בתום
   התקופה כשהספק מודיע על כך.
   הרצה: npm run test:trial */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = 'file://' + path.join(here, '..', 'app.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('dialog', async d => { await d.accept(); });

async function billingRow(label) {
  const rows = await page.locator('.billing-row').allInnerTexts();
  const row = rows.find(r => r.startsWith(label));
  return row ? row.replace(/\n/g, ': ') : null;
}

try {
  console.log('\n== מסך ההרשמה מצהיר על תנאי הניסיון ==');
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  const note = await page.locator('.auth-trial-note').textContent();
  check('מספר ימי הניסיון מופיע', /14/.test(note), true);
  check('התאריך שבו התקופה נגמרת מופיע', /\d{2}[./]\d{2}[./]\d{4}/.test(note), true);
  /* ההרשמה באמת אינה מבקשת כרטיס, ולכן זה מה שכתוב. טקסט שמבטיח
     "החיוב הראשון בתאריך" היה סתירה למה שקורה בפועל. */
  check('נאמר במפורש שאין צורך בכרטיס', /בלי כרטיס אשראי/.test(note), true);
  check('ההסכמה לתנאים מופיעה עם קישורים',
    await page.locator('.auth-form a[href="/terms/"]').count(), 1);

  await page.fill('input[name="companyName"]', 'עסק ניסיון');
  await page.fill('input[name="email"]', 'trial@test.co.il');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1300);

  console.log('\n== ברירת המחדל: פיילוט, בלי סליקה ==');
  /* כל עוד אין ספק תשלומים אמיתי, אסור לבקש מלקוח אמצעי תשלום:
     אין לאן להזין אותו, ו"ספק מדומה (פיתוח)" על מסך של לקוח
     משלם הוא בדיוק המשפט שגורם לו לסגור את הלשונית. */
  await page.click('.tab[data-tab="billing"]');
  await page.waitForTimeout(500);
  const panel = () => page.locator('#billing-panel').innerText();
  check('נאמר שזה פיילוט ושאין חיוב', await panel(), /פיילוט/);
  check('אין כפתור הוספת אמצעי תשלום',
    await page.locator('#billing-add-card').count(), 0);
  check('אין כפתורי בחירת תוכנית',
    await page.locator('#billing-panel [data-plan]').count(), 0);
  check('אין אזהרה על כרטיס חסר',
    await page.locator('.billing-trial.warn').count(), 0);
  check('ואין זכר למילה "מדומה" במסך', /מדומה|פיתוח בלבד/.test(await panel()), false);
  check('המחירים כן מוצגים, כדי שידע למה לצפות', await panel(), /199/);
  check('גם שורת המשתמש אומרת פיילוט ולא "הוסיפו אמצעי תשלום"',
    await page.locator('#user-bar').innerText(), /פיילוט/);

  console.log('\n== משחררים את הסליקה: מכאן זו בדיקת מסלול החיוב ==');
  /* מצב הסליקה נקבע מהספק. כאן מדמים ספק מחובר, כדי לבדוק את
     כל מחזור החיים שייכנס לתוקף ברגע ש-PayPlus יחובר. */
  await page.evaluate(() => {
    window.ShiftModel.setBillingLive(true);
    window.ShiftBillingUI.render();
  });
  await page.waitForTimeout(400);
  check('אמצעי תשלום', await billingRow('אמצעי תשלום'), /לא הוזן/);
  check('אזהרה שאין כרטיס', await page.locator('.billing-trial.warn').isVisible(), true);
  check('כפתור הוספת אמצעי תשלום', await page.locator('#billing-add-card').isVisible(), true);
  check('אין עדיין כפתור ביטול-לפני-חיוב',
    await page.locator('#billing-cancel-trial').count(), 0);

  console.log('\n== אחרי שמירת כרטיס ==');
  await page.click('#billing-add-card');
  await page.waitForTimeout(600);
  check('אמצעי תשלום', await billingRow('אמצעי תשלום'), /שמור/);
  check('שורת חיוב ראשון', await billingRow('חיוב ראשון'), /\d{2}[./]\d{2}[./]\d{4}/);
  const notice = await page.locator('.billing-trial').textContent();
  check('ההודעה מפרטת 14 ימים ללא חיוב', /14/.test(notice), true);
  check('ההודעה מפרטת את הסכום', /199/.test(notice), true);
  check('ההודעה אינה מסומנת כאזהרה',
    await page.locator('.billing-trial.warn').count(), 0);
  check('הסטטוס עדיין ניסיון', await billingRow('סטטוס'), /תקופת ניסיון/);
  check('כפתור ביטול לפני החיוב', await page.locator('#billing-cancel-trial').isVisible(), true);

  console.log('\n== ביטול לפני החיוב ==');
  await page.click('#billing-cancel-trial');
  await page.waitForTimeout(600);
  const banner = await page.locator('.billing-note').first().textContent();
  check('נאמר במפורש שלא יהיה חיוב', /לא תחויבו/.test(banner), true);
  check('הגישה נשמרת', await page.evaluate(() => window.__backend.session().access.allowed), true);
  check('כפתור חידוש', await page.locator('#billing-resume').isVisible(), true);
  check('אין יותר כפתור ביטול', await page.locator('#billing-cancel-trial').count(), 0);

  console.log('\n== חידוש ==');
  await page.click('#billing-resume');
  await page.waitForTimeout(600);
  check('חזרנו למצב ניסיון פעיל',
    await page.evaluate(() => window.__backend.session().access.reason), 'trial');

  console.log('\n== החיוב האוטומטי בתום 14 הימים ==');
  /* מדמים את מה שספק התשלומים עושה: התקופה נגמרה, והוא חייב.
     כאן זה נעשה ישירות על השרת המדומה, בדיוק כמו webhook. */
  await page.evaluate(() => {
    const backend = window.__backend;
    const company = backend.db.companies[backend.session().company.id];
    company.validUntil = new Date(Date.now() - 60 * 1000).toISOString();
    backend._save();
  });
  check('רגע אחרי תום התקופה – עדיין בפנים (החיוב בעיבוד)',
    await page.evaluate(() => window.__backend.session().access.reason), 'charging');

  await page.evaluate(() => {
    const backend = window.__backend;
    const company = backend.db.companies[backend.session().company.id];
    company.status = 'active';
    company.validUntil = new Date(Date.now() + 30 * 864e5).toISOString();
    backend._save();
  });
  await page.reload();
  await page.waitForTimeout(1200);
  await page.click('.tab[data-tab="billing"]');
  await page.waitForTimeout(500);
  check('הסטטוס הפך לפעיל', await billingRow('סטטוס'), /מנוי פעיל/);
  check('עכשיו זה "החיוב הבא"', await billingRow('החיוב הבא'), /199/);
  check('אין יותר הודעת ניסיון', await page.locator('.billing-trial').count(), 0);

  console.log('\n== ניסיון שנגמר בלי כרטיס נחסם ==');
  await page.evaluate(() => {
    const backend = window.__backend;
    const company = backend.db.companies[backend.session().company.id];
    company.status = 'trial';
    company.billingSubscriptionId = null;
    company.validUntil = new Date(Date.now() - 864e5).toISOString();
    backend._save();
  });
  check('הגישה נחסמת', await page.evaluate(() => window.__backend.session().access.allowed), false);
  check('ההסבר מכוון להוספת אמצעי תשלום',
    await page.evaluate(() => window.__backend.session().access.text), /אמצעי תשלום/);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות מסלול הניסיון עברו');
