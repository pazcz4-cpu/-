/* המשרד האחורי במסך.
   הרצה: node tests/admin-browser-test.mjs

   השרת מדומה כאן בכוונה: את ההרשאות בודק admin-tests.js מול
   הקוד האמיתי של נקודות הקצה. מה שנבדק כאן הוא מה שהבעלים
   רואה בפועל, ושפעולה יוצאת לדרך עם מה שהוא הקליד. */
import { createRequire } from 'node:module';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const PAGE = url('admin.html');

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  /* טבלאות שלמות בפלט הופכות אותו לבלתי קריא. מה שנכשל מוצג
     במלואו למטה; מה שעבר מוצג מקוצר. */
  const shown = JSON.stringify(actual);
  const brief = shown.length > 90 ? shown.slice(0, 90) + '…"' : shown;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + (ok ? brief : shown));
  if (!ok) failures.push(label + ': ' + shown + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

const days = (n) => new Date(Date.now() + n * 864e5).toISOString();

const WORLD = {
  overview: {
    ok: true,
    generatedAt: new Date().toISOString(),
    vat: { rate: 18, pricesInclude: true },
    counts: {
      companies: 4,
      byStatus: { active: 2, trial: 1, past_due: 1 },
      byPlan: { starter: 2, growth: 1 },
      users: 17,
      tickets: { open: 2, closed: 5 }
    },
    money: {
      recurring: { companies: 2, gross: 598, net: 506.78, vat: 91.22 },
      thisMonth: { month: '2026-09', charges: 3, gross: 797, net: 675.42, vat: 121.58 },
      allTime: { gross: 4582, net: 3883.05, vat: 698.95 },
      months: [
        { month: '2026-07', charges: 2, gross: 398, net: 337.29, vat: 60.71 },
        { month: '2026-08', charges: 0, gross: 0, net: 0, vat: 0 },
        { month: '2026-09', charges: 3, gross: 797, net: 675.42, vat: 121.58 }
      ]
    },
    attention: {
      trialsEnding: [
        { id: 'co-2', name: 'מסעדת הגליל', plan: 'growth', days: 3, hasCard: false }
      ],
      failing: [{ id: 'co-3', name: 'רשת הדרום', plan: 'business', days: 2 }],
      canceling: [{ id: 'co-4', name: 'בייק שופ', until: days(20) }]
    },
    plans: [
      { id: 'starter', priceMonthly: 199, net: 168.64, vat: 30.36, gross: 199 },
      { id: 'growth', priceMonthly: 399, net: 338.14, vat: 60.86, gross: 399 },
      { id: 'business', priceMonthly: 599, net: 507.63, vat: 91.37, gross: 599 }
    ]
  },
  companies: {
    ok: true, total: 4, shown: 4,
    companies: [
      { id: 'co-1', name: 'קפה מרכז', plan: 'starter', status: 'active',
        validUntil: days(12), cancelAtPeriodEnd: false, hasCard: true,
        createdAt: days(-90), ownerEmail: 'avi@cafe.co.il', ownerName: 'אבי',
        users: 8, openTickets: 1, paidGross: 1194, paidNet: 1011.86 },
      { id: 'co-2', name: 'מסעדת הגליל', plan: 'growth', status: 'trial',
        validUntil: days(3), cancelAtPeriodEnd: false, hasCard: false,
        createdAt: days(-11), ownerEmail: 'gal@galil.co.il', ownerName: 'גל',
        users: 4, openTickets: 0, paidGross: 0, paidNet: 0 }
    ]
  },
  company: {
    ok: true,
    company: { id: 'co-2', name: 'מסעדת הגליל', plan: 'growth', planPrice: 399,
      status: 'trial', validUntil: days(3), cancelAtPeriodEnd: false,
      createdAt: days(-11), billingProvider: null, hasCard: false },
    users: [
      { id: 'u1', email: 'gal@galil.co.il', name: 'גל', role: 'owner',
        active: true, joined_at: days(-11) }
    ],
    payments: { count: 0, gross: 0, net: 0, vat: 0, history: [] },
    events: [
      { id: 'e1', type: 'charge.first', at: days(-1), outcome: 'declined',
        reason: 'no funds', amount: null }
    ],
    tickets: [],
    usage: { configUpdatedAt: days(-2), weeks: 3, published: 2, lastWeekAt: days(-1) }
  },
  tickets: {
    ok: true,
    tickets: [
      { id: 't1', company_id: 'co-1', companyName: 'קפה מרכז', kind: 'bug',
        status: 'open', subject: 'הסידור לא נשמר', body: 'לחצתי שמירה ולא קרה כלום',
        created_at: days(-1), reply: null }
    ]
  }
};

const sent = [];

try {
  /* השרת מדומה ברמת הרשת, כדי שהדף עצמו ירוץ בדיוק כמו שהוא */
  /* נקודת קצה אחת, וה-op בגוף הבקשה קובע את המסלול */
  await page.route('**/api/admin', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const name = body.op;
    sent.push({ name, body });
    let payload = WORLD[name] || { ok: true };
    if (name === 'action') payload = { ok: true, company: WORLD.company.company, detail: {} };
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(payload) });
  });

  await page.goto(PAGE);
  await page.waitForTimeout(300);

  console.log('\n== לפני התחברות ==');
  check('מסך הכניסה מוצג', await page.locator('#adm-signin').isVisible(), true);
  check('הנתונים מוסתרים', await page.locator('#adm-app').isHidden(), true);

  /* מדלגים על GoTrue ומזריקים חיבור, כמו משתמש שכבר נכנס */
  await page.evaluate(() => {
    sessionStorage.setItem('setshifts-admin-session-v1', JSON.stringify({
      access_token: 'owner-token', user: { email: 'boss@setshifts.com' }
    }));
  });
  await page.reload();
  await page.waitForTimeout(600);

  console.log('\n== לוח המחוונים ==');
  check('המסך נפתח', await page.locator('#adm-app').isVisible(), true);
  check('הכתובת מוצגת', (await page.locator('#adm-who').innerText()).trim(),
    'boss@setshifts.com');

  const tiles = await page.locator('#panel-overview .adm-tile').allInnerTexts();
  const all = tiles.join(' | ');
  check('הכנסה חוזרת מוצגת', all, /598/);
  check('ומסומנת כמספר המרכזי',
    await page.locator('#panel-overview .adm-tile.is-key').count(), 1);
  check('נטו מוצג לצד הברוטו', all, /507/);
  check('מספר הלקוחות', all, /\b4\b/);
  check('נאמר איך מתייחסים למע"מ',
    (await page.locator('#panel-overview .adm-note').innerText()).trim(), /כוללים מע"מ 18%/);

  console.log('\n== רשימות שאפשר לפעול לפיהן ==');
  const ending = await page.locator('#panel-overview .adm-card').first().innerText();
  check('ניסיון שנגמר מופיע בשמו', ending, /מסעדת הגליל/);
  check('וסימון שאין לו כרטיס', ending, /אין כרטיס/);

  console.log('\n== לקוחות ==');
  await page.click('.adm-tab[data-panel="companies"]');
  await page.waitForTimeout(500);
  check('הטבלה נטענה', await page.locator('#panel-companies .adm-table tbody tr').count(), 2);
  const firstRow = await page.locator('#panel-companies tbody tr').first().innerText();
  check('מייל הבעלים מוצג', firstRow, /avi@cafe\.co\.il/);
  check('וכמה שילם', firstRow, /1,?194/);

  console.log('\n== כרטיס לקוח ==');
  await page.click('#panel-companies tbody tr:nth-child(2) [data-open]');
  await page.waitForTimeout(500);
  const detail = await page.locator('#adm-company-detail').innerText();
  check('הכרטיס נפתח', detail, /מסעדת הגליל/);
  check('מוצג שאין אמצעי תשלום', detail, /אין/);
  check('והכישלון מוסבר', detail, /no funds/);

  console.log('\n== מתן תקופה ללא תשלום ==');
  await page.click('[data-act="extend-trial"]');
  await page.waitForTimeout(300);
  check('החלון נפתח', await page.locator('#adm-modal').isVisible(), true);

  /* בלי סיבה – השרת דוחה, אבל גם המסך צריך לשלוח את מה שהוקלד */
  await page.fill('#adm-f-days', '30');
  await page.fill('#adm-modal-reason', 'סגרנו איתו פיילוט של חודש');
  await page.click('#adm-modal-ok');
  await page.waitForTimeout(700);

  const action = sent.filter((call) => call.name === 'action').pop();
  check('הפעולה נשלחה', !!action, true);
  check('עם מספר הימים שהוקלד', action.body.days, 30);
  check('ועם הסיבה', action.body.reason, 'סגרנו איתו פיילוט של חודש');
  check('ועל הלקוח הנכון', action.body.id, 'co-2');
  check('החלון נסגר', await page.locator('#adm-modal').isHidden(), true);

  console.log('\n== כסף ==');
  await page.click('.adm-tab[data-panel="money"]');
  await page.waitForTimeout(400);
  const money = await page.locator('#panel-money').innerText();
  check('פירוט חודשי מוצג', money, /2026-09/);
  check('חודש ריק אינו נעלם', money, /2026-08/);
  check('מע"מ מוצג בעמודה משלו', money, /121\.58/);
  check('גרף העמודות צויר',
    await page.locator('#panel-money .adm-bar').count(), 3);

  console.log('\n== קריאות שירות ==');
  await page.click('.adm-tab[data-panel="tickets"]');
  await page.waitForTimeout(400);
  const tickets = await page.locator('#panel-tickets').innerText();
  check('הקריאה מוצגת עם שם הלקוח', tickets, /קפה מרכז/);
  check('וגוף הפנייה', tickets, /לחצתי שמירה/);
  check('והמצב בעברית', tickets, /פתוחה/);

  console.log('\n== במסך צר ==');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('אין גלילה אופקית של הדף', overflow <= 1, true);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות המשרד האחורי עברו');
