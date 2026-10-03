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
  coupons: {
    ok: true,
    coupons: [
      { code: 'EXTRAMONTH', kind: 'days', value: 30, uses: 3, max_uses: null,
        active: true, valid_until: null, note: 'קמפיין נטישה', redeemed: 3,
        created_at: days(-5) },
      { code: 'HALFOFF', kind: 'percent', value: 50, uses: 10, max_uses: 10,
        active: true, valid_until: null, note: '', redeemed: 10, created_at: days(-9) },
      { code: 'OLDONE', kind: 'amount', value: 50, uses: 0, max_uses: null,
        active: false, valid_until: days(-2), note: 'נגמר', redeemed: 0,
        created_at: days(-30) }
    ],
    redemptions: [
      { company_id: 'co-1', companyName: 'קפה מרכז', code: 'EXTRAMONTH',
        kind: 'days', value: 30, created_at: days(-1) }
    ]
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

const AGENTS = {
  list: { ok: true, agents: [
    { id: 'ag-1', name: 'רונית סוכנת', code: 'ronit-ab12', email: '', phone: '', commission: 400,
      qualifyCharges: 3, active: true, note: '', customers: 3, paying: 2, free: 1, qualified: 1,
      owed: 400, owedCount: 1, paidOut: 0 }
  ] },
  report: { ok: true, month: '2026-10',
    lines: [{ companyId: 'co-9', company: 'פיצה הכפר', agentId: 'ag-1', agent: 'רונית סוכנת',
      qualifiedAt: new Date().toISOString(), month: '2026-10', amount: 400, status: 'pending', paidAt: null }],
    older: [], upcoming: [{ companyId: 'co-8', company: 'מאפיית הים', agent: 'רונית סוכנת',
      nextChargeAt: new Date(Date.now() + 5 * 864e5).toISOString(), paidCharges: 2, amount: 400 }],
    byAgent: [{ agentId: 'ag-1', agent: 'רונית סוכנת', count: 1, amount: 400, pending: 400, paid: 0 }],
    totals: { count: 1, amount: 400, pending: 400, olderPending: 0 } },
  customers: { ok: true, agent: { id: 'ag-1', name: 'רונית סוכנת', qualifyCharges: 3, commission: 400 },
    customers: [{ id: 'co-9', name: 'פיצה הכפר', status: 'active', freeAccess: false, createdAt: new Date().toISOString(),
      paidCharges: 3, qualifiedAt: new Date().toISOString(), commission: { amount: 400, status: 'pending', month: '2026-10' } }] }
};
const NOW_ISO = new Date().toISOString();
const LEADS = {
  ok: true,
  counts: { all: 2, new: 1, contacted: 1, demo: 0, won: 0, lost: 0 },
  leads: [
    { id: 'ld-1', createdAt: NOW_ISO, updatedAt: NOW_ISO, business: 'קפה הנחל', name: 'דנה כהן',
      phone: '054-123 4567', email: 'dana@cafe.co.il', employees: 14, hours: '3-6', note: null,
      consent: true, lang: 'he', page: '/', source: 'facebook', medium: 'paid', campaign: 'owners-pain',
      content: null, term: null, clickId: 'FB1', status: 'new', adminNote: '', companyId: null },
    { id: 'ld-2', createdAt: NOW_ISO, updatedAt: NOW_ISO, business: 'מסעדת הים', name: 'רן',
      phone: '0521234567', email: 'ran@sea.co.il', employees: 30, hours: '6plus', note: null,
      consent: true, lang: 'he', page: '/', source: null, medium: null, campaign: null,
      content: null, term: null, clickId: null, status: 'contacted', adminNote: 'חזרו אליי ביום ג׳', companyId: null }
  ]
};
const MARKETING = {
  ok: true, weeks: 12, firstWeek: '2026-07-12', payingTotal: 2, untrackedShare: 60,
  sync: { meta: { configured: true, last: { at: NOW_ISO, ok: true, weeks: 6, error: null } },
    google: { configured: false, last: null } },
  totals: { leads: 2, signups: 5, withCard: 2, teamAdded: 1, paying: 1, spend: 1000,
    cac: 1000, costPerLead: 500, costPerSignup: 200 },
  weekList: [{ week: '2026-09-27', leads: 2, signups: 5, withCard: 2, teamAdded: 1, paying: 1, spend: 1000,
    costPerLead: 500, costPerSignup: 200, cac: 1000 }],
  channels: [{ key: 'meta', signups: 3, withCard: 1, paying: 1, revenue: 199, spend: 800, leads: 1, cac: 800, costPerLead: 800, roas: 0.25 },
    { key: 'direct', signups: 2, withCard: 1, paying: 0, revenue: 0, spend: 0, leads: 1, cac: null, costPerLead: null, roas: null }],
  campaigns: [{ key: 'meta / owners-pain', signups: 3, paying: 1 }],
  spend: [{ id: 'sp-1', weekStart: '2026-09-27', channel: 'meta', amount: 800, note: 'קמפיין כאב' }],
  raw: {
    companies: [{ id: 'co-1', name: 'קפה מרכז', createdAt: NOW_ISO, status: 'trial', plan: 'starter', source: 'meta',
      campaign: 'owners-pain', medium: 'paid', content: '', term: '', clickId: 'FB1', free: false, hasCard: true,
      users: 2, firstCharge: '', revenueGross: 0 }],
    leads: [{ createdAt: NOW_ISO, business: 'קפה הנחל', name: 'דנה כהן', phone: '054', email: 'dana@cafe.co.il',
      employees: 14, hours: '3-6', status: 'new', source: 'meta', campaign: 'owners-pain', converted: false }]
  }
};
const DEMO = {
  status: { ok: true, exists: false },
  enter: { ok: true, created: true, company: { id: 'demo-co', name: 'עסק לדוגמה' } }
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
    if (name === 'support') payload = { ok: true, company: 'מסעדת הגליל', as: 'gal@galil.co.il', role: 'owner',
      url: url('app.html') + '?support=tok123&co=' + encodeURIComponent('מסעדת הגליל') };
    if (name === 'customer') payload = { ok: true, companyId: 'co-2', email: 'dana@pilot.co.il',
      password: 'abcd-efgh-jkmn', emailed: false, emailError: 'not_configured', loginUrl: 'https://setshifts.com/app/' };
    if (name === 'card') payload = { ok: true, url: 'https://pay.example/page/abc', to: 'gal@galil.co.il',
      emailed: true, emailError: null, expiresInHours: 48 };
    if (name === 'agents') payload = AGENTS[body.do] || { ok: true };
    if (name === 'demo') payload = DEMO[body.do] || { ok: true };
    if (name === 'demo' && body.do === 'enter') payload = Object.assign({}, payload,
      { url: url('app.html') + '?support=demo-tok&co=' + encodeURIComponent('עסק לדוגמה') + '&demo=1' });
    if (name === 'leads') payload = body.action === 'list' ? LEADS : { ok: true, lead: LEADS.leads[0] };
    if (name === 'marketing') payload = body.action === 'report' ? MARKETING : { ok: true };
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(payload) });
  });

  await page.goto(PAGE);
  await page.waitForTimeout(300);

  console.log('\n== לפני התחברות ==');
  check('מסך הכניסה מוצג', await page.locator('#adm-signin').isVisible(), true);
  check('הנתונים מוסתרים', await page.locator('#adm-app').isHidden(), true);
  check('ואין כפתור יציאה למי שלא נכנס',
    await page.locator('#adm-signout').isHidden(), true);

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

  /* תעריף לעובד. המספר הגדול על הכרטיס משתנה מחודש לחודש,
     ולכן הכרטיס חייב לומר ממה הוא מורכב – ולכן גם טופס המחיר
     חייב להיפתח על מה שקיים היום, ולא על סכום קבוע ריק. */
  console.log('\n== תעריף לעובד ==');
  WORLD.company.company = Object.assign({}, WORLD.company.company, {
    planPrice: 480, customPrice: null, customPricePerEmployee: 12,
    pricedEmployees: 40, currentEmployees: 40
  });
  await page.click('#panel-companies tbody tr:nth-child(2) [data-open]');
  await page.waitForTimeout(500);
  const perEmp = await page.locator('#adm-company-detail').innerText();
  check('המחיר המחושב מוצג', perEmp, /480/);
  check('וגם התעריף שהוא מורכב ממנו', perEmp, /12/);
  check('וגם מספר העובדים שהוא מוכפל בו', perEmp, /40 \(שיא התקופה\)/);
  check('ובלי פער אין רעש מיותר', perEmp.includes('כעת'), false);

  await page.click('[data-act="set-price"]');
  await page.waitForTimeout(300);
  check('הטופס נפתח על צורת התמחור הקיימת',
    await page.locator('#adm-f-mode').inputValue(), 'per_employee');
  check('ועל התעריף הקיים', await page.locator('#adm-f-price').inputValue(), '12');
  check('והכיתוב מדבר על עובד',
    await page.locator('#adm-f-price-label').innerText(), /לעובד/);
  await page.click('#adm-modal-cancel');
  await page.waitForTimeout(200);

  /* התרחיש עצמו: מי שכיבה עובדים לפני החיוב. זה כבר לא עולה
     לנו כסף -- גובים לפי השיא -- אבל הפער חייב להיראות, כי
     כדאי לדעת מי ניסה. */
  WORLD.company.company = Object.assign({}, WORLD.company.company, {
    planPrice: 1200, pricedEmployees: 100, currentEmployees: 10
  });
  await page.click('#panel-companies tbody tr:nth-child(2) [data-open]');
  await page.waitForTimeout(500);
  const drained = await page.locator('#adm-company-detail').innerText();
  check('מחויב לפי השיא', drained, /1,?200/);
  check('והפער מול הנוכחי נראה', drained, /100 \(שיא התקופה\) · כעת 10/);

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

  console.log('\n== קופונים ==');
  await page.click('.adm-tab[data-panel="coupons"]');
  await page.waitForTimeout(500);

  const rows = await page.locator('#panel-coupons .adm-table').first()
    .locator('tbody tr').allInnerTexts();
  check('שלושת הקופונים מוצגים', rows.length, 3);
  /* כל סוג מוצג ביחידה שלו. "30" לבדו אינו אומר ימים או שקלים,
     וזו בדיוק הטעות שנותנת 30 ש"ח במקום 30 יום. */
  check('ימים מוצגים כימים', rows[0], /30 ימים/);
  check('אחוזים כאחוזים', rows[1], /50%/);
  check('ושקלים כשקלים', rows[2], /50 ₪/);

  /* מה מונע מקופון לעבוד עכשיו, בלי לחשב בראש */
  check('קופון פעיל מסומן', rows[0], /פעיל/);
  check('קופון שנוצל עד תום מסומן', rows[1], /נוצל/);
  check('וקופון כבוי מסומן', rows[2], /כבוי/);
  check('ומי מימש מופיע בשמו',
    await page.locator('#panel-coupons .adm-card').last().innerText(), /קפה מרכז/);

  console.log('\n== יצירה ==');
  /* שם השדה משתנה עם הסוג: "ימים" הוא לא "שקלים" */
  check('ברירת המחדל היא ימים',
    (await page.locator('#cp-value-label').innerText()).trim(), 'ימים');
  await page.selectOption('#cp-kind', 'amount');
  await page.waitForTimeout(200);
  check('ואחרי בחירת שקלים השדה משנה שם',
    (await page.locator('#cp-value-label').innerText()).trim(), 'שקלים');

  sent.length = 0;
  await page.fill('#cp-code', 'pilot 2026');
  await page.fill('#cp-value', '50');
  await page.fill('#cp-until', '2026-12-31');
  await page.fill('#cp-max', '25');
  await page.fill('#cp-note', 'קמפיין פיילוט');
  await page.click('#adm-coupon-form button[type="submit"]');
  await page.waitForTimeout(600);

  const created = sent.filter((call) => call.body.action === 'create')[0];
  check('הבקשה יצאה', !!created, true);
  check('עם הקוד שהוקלד', created && created.body.code, 'pilot 2026');
  check('עם הסוג', created && created.body.kind, 'amount');
  check('עם הערך', created && created.body.value, '50');
  check('עם התוקף', created && created.body.validUntil, '2026-12-31');
  check('ועם המכסה', created && created.body.maxUses, '25');

  console.log('\n== כיבוי ==');
  sent.length = 0;
  await page.click('[data-coupon-toggle="EXTRAMONTH"]');
  await page.waitForTimeout(500);
  const toggled = sent.filter((call) => call.body.action === 'toggle')[0];
  check('הבקשה יצאה', !!toggled, true);
  check('על הקוד הנכון', toggled && toggled.body.code, 'EXTRAMONTH');
  check('ובכיוון הנכון', toggled && toggled.body.active, false);

  console.log('\n== פיילוט ללא תשלום ושיוך לסוכן ==');
  WORLD.company.company = Object.assign({}, WORLD.company.company, {
    freeAccess: true, freeUntil: null, isDemo: false, source: 'agent',
    agent: { id: 'ag-1', name: 'רונית סוכנת', paidCharges: 0, qualifyCharges: 3,
      commissionAmount: 400, qualifiedAt: null, commission: null }
  });
  await page.click('.adm-tab[data-panel="companies"]');
  await page.waitForTimeout(300);
  await page.click('#panel-companies tbody tr:nth-child(2) [data-open]');
  await page.waitForTimeout(500);
  const freeCard = await page.locator('#adm-company-detail').innerText();
  check('הכרטיס אומר שזה פיילוט ללא תשלום', freeCard, /ללא תשלום/);
  check('ושהמקור הוא סוכן בשמו', freeCard, /רונית סוכנת/);
  check('וכפתור הפעולה הופך לסיום פיילוט', freeCard, /סיום פיילוט ללא תשלום/);

  WORLD.company.company = Object.assign({}, WORLD.company.company, { freeAccess: false });
  await page.click('#panel-companies tbody tr:nth-child(2) [data-open]');
  await page.waitForTimeout(500);
  check('אחרי הסיום מוצגת התקדמות החיובים',
    await page.locator('#adm-company-detail').innerText(), /0 מתוך 3 חיובים/);

  sent.length = 0;
  await page.click('[data-act="set-free"]');
  await page.waitForTimeout(300);
  await page.selectOption('#adm-f-on', '1');
  await page.fill('#adm-f-until', '2027-01-31');
  await page.fill('#adm-modal-reason', 'פיילוט עם קפה מרכז');
  await page.click('#adm-modal-ok');
  await page.waitForTimeout(600);
  const freeCall = sent.filter((call) => call.body.action === 'set-free').pop();
  check('בקשת הפיילוט יצאה', !!freeCall, true);
  check('עם on=true כבוליאני', freeCall && freeCall.body.on, true);
  check('ועם התאריך', freeCall && freeCall.body.until, '2027-01-31');

  sent.length = 0;
  await page.click('[data-act="set-agent"]');
  await page.waitForTimeout(500);
  check('בחירת הסוכן נטענת עם האתר ועם הסוכן',
    await page.locator('#adm-f-agent option').count(), 2);
  await page.selectOption('#adm-f-agent', 'ag-1');
  await page.fill('#adm-modal-reason', 'הוקם בטלפון');
  await page.click('#adm-modal-ok');
  await page.waitForTimeout(600);
  const agentCall = sent.filter((call) => call.body.action === 'set-agent').pop();
  check('בקשת השיוך יצאה עם הסוכן', agentCall && agentCall.body.agentId, 'ag-1');

  console.log('\n== ייצוא לקוחות ==');
  const [custFile] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#adm-export-companies')
  ]);
  check('ייצוא הלקוחות הוריד xlsx', custFile.suggestedFilename(), /^setshifts-customers-.*\.xlsx$/);
  check('ובתוכו שם עסק', (await import('node:fs')).readFileSync(await custFile.path())
    .includes(Buffer.from('מסעדת הגליל')), true);

  console.log('\n== החלפת כרטיס ==');
  sent.length = 0;
  /* אחרי פעולה הרשימה והכרטיס נטענים מחדש במקביל; מחכים שהכרטיס יחזור */
  await page.waitForSelector('[data-act="card-link"]', { timeout: 5000 });
  await page.waitForTimeout(400);
  await page.click('[data-act="card-link"]');
  await page.waitForTimeout(300);
  check('החלון נפתח עם סימון שליחה במייל כברירת מחדל',
    await page.locator('#adm-f-send').isChecked(), true);
  await page.fill('#adm-modal-reason', 'הכרטיס פג תוקף');
  await page.click('#adm-modal-ok');
  await page.waitForTimeout(500);
  const cardCall = sent.filter((call) => call.name === 'card').pop();
  check('הבקשה יצאה על הלקוח הנכון', cardCall && cardCall.body.id, 'co-2');
  check('עם בקשת שליחה במייל', cardCall && cardCall.body.send, true);
  check('הקישור מוצג להעתקה', await page.locator('#adm-card-url').inputValue(), 'https://pay.example/page/abc');
  check('ונאמר למי נשלח המייל', await page.locator('#adm-card-result').innerText(), /gal@galil\.co\.il/);
  await page.click('#adm-modal-cancel');
  await page.waitForTimeout(200);

  console.log('\n== כניסה למערכת הלקוח ==');
  await page.click('.adm-tab[data-panel="companies"]');
  await page.waitForTimeout(300);
  await page.click('#panel-companies tbody tr:nth-child(2) [data-open]');
  await page.waitForSelector('[data-act="support-access"]', { timeout: 5000 });
  await page.waitForTimeout(300);
  check('הכפתור מופיע בכרטיס הלקוח', await page.locator('#adm-company-detail [data-act="support-access"]').count(), 1);
  sent.length = 0;
  await page.click('#adm-company-detail [data-act="support-access"]');
  await page.waitForTimeout(300);
  check('נדרשת סיבה לפני הכניסה', await page.locator('#adm-modal-reason').isVisible(), true);
  await page.fill('#adm-modal-reason', 'הלקוח לא מצליח לפרסם סידור');
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.click('#adm-modal-ok')
  ]);
  await popup.waitForLoadState('domcontentloaded');
  await popup.waitForTimeout(800);
  const supportCall = sent.filter((call) => call.name === 'support').pop();
  check('הבקשה יצאה על הלקוח הנכון', supportCall && supportCall.body.id, 'co-2');
  check('ועם הסיבה', supportCall && supportCall.body.reason, 'הלקוח לא מצליח לפרסם סידור');
  check('נפתחה לשונית חדשה באפליקציה', popup.url(), /app\.html/);
  check('פס מצב התמיכה אדום וקבוע', await popup.locator('#support-banner').isVisible(), true);
  check('ונושא את שם הלקוח', await popup.locator('#support-banner').innerText(), /מסעדת הגליל/);
  check('וההתחברות יושבת בלשונית ולא בדפדפן', await popup.evaluate(
    () => !!sessionStorage.getItem('shift-support-mode-v1')), true);
  await popup.close();
  await page.waitForTimeout(300);

  console.log('\n== הקמת לקוח ללא כרטיס ==');
  await page.click('.adm-tab[data-panel="companies"]');
  await page.waitForTimeout(300);
  sent.length = 0;
  await page.click('[data-act="create-customer"]');
  await page.waitForTimeout(500);
  check('הטופס נפתח עם בחירת חבילה וסוכן',
    (await page.locator('#adm-f-plan option').count() > 0) && (await page.locator('#adm-f-agent option').count() > 0), true);
  await page.fill('#adm-f-company', 'קפה הפיילוט');
  await page.fill('#adm-f-owner', 'דנה');
  await page.fill('#adm-f-email', 'dana@pilot.co.il');
  await page.fill('#adm-f-phone', '054-1234567');
  await page.fill('#adm-modal-reason', 'פיילוט עם בית קפה');
  await page.click('#adm-modal-ok');
  await page.waitForTimeout(600);
  const created2 = sent.filter((call) => call.name === 'customer').pop();
  check('הבקשה יצאה עם שם העסק', created2 && created2.body.companyName, 'קפה הפיילוט');
  check('ועם מייל הבעלים', created2 && created2.body.email, 'dana@pilot.co.il');
  check('ועם הסיבה', created2 && created2.body.reason, 'פיילוט עם בית קפה');
  check('הסיסמה מוצגת להעתקה', await page.locator('#adm-card-url').inputValue(), /abcd-efgh-jkmn/);
  check('ונאמר שהמייל לא נשלח ולמה', await page.locator('#adm-create-result').innerText(), /שליחת מייל לא מוגדרת/);
  await page.click('#adm-modal-cancel');
  await page.waitForTimeout(300);

  console.log('\n== סינון לפי מקור ==');
  sent.length = 0;
  await page.selectOption('#adm-filter-source', 'agent');
  await page.waitForTimeout(500);
  const filterCall = sent.filter((call) => call.name === 'companies').pop();
  check('הסינון נשלח לשרת', filterCall && filterCall.body.source, 'agent');

  console.log('\n== סוכנים ובונוסים ==');
  await page.click('.adm-tab[data-panel="agents"]');
  await page.waitForTimeout(700);
  const agentsText = await page.locator('#panel-agents').innerText();
  check('הסוכן מוצג', agentsText, /רונית סוכנת/);
  check('ועם העמלה', agentsText, /400/);
  check('הדוח החודשי מציג מי הגיע ליעד', agentsText, /פיצה הכפר/);
  check('ומי יגיע בחיוב הבא', agentsText, /מאפיית הים/);
  check('כפתור העתקת קישור קיים עם הקוד',
    await page.locator('[data-copy-link]').first().getAttribute('data-copy-link'), /\/\?ref=ronit-ab12$/);

  /* כל שדה בטופס הסוכן נושא שם גלוי, לא רק placeholder */
  const labels = await page.locator('#adm-agent-form label.adm-field > span').allInnerTexts();
  check('לכל שדה בטופס הסוכן יש תווית', labels.join('|'),
    /שם הסוכן.*קוד בקישור.*עמלה ללקוח.*חיובים עד זכאות.*מייל.*טלפון.*הערה/);
  check('ולכל תווית שדה מקושר',
    await page.evaluate(() => [...document.querySelectorAll('#adm-agent-form label.adm-field')]
      .every((l) => l.htmlFor && document.getElementById(l.htmlFor))), true);

  const [agentsFile] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#adm-export-agents')
  ]);
  check('ייצוא הסוכנים הוריד קובץ xlsx', agentsFile.suggestedFilename(), /^setshifts-agents-\d{4}-\d{2}\.xlsx$/);
  const agentsPath = await agentsFile.path();
  const agentsZip = (await import('node:fs')).readFileSync(agentsPath);
  check('והקובץ הוא ZIP תקין של xlsx', agentsZip.slice(0, 2).toString(), 'PK');
  check('ובתוכו שם הסוכן', agentsZip.includes(Buffer.from('רונית סוכנת')), true);
  check('ושם הלקוח מהדוח', agentsZip.includes(Buffer.from('פיצה הכפר')), true);

  sent.length = 0;
  await page.fill('#ag-name', 'דוד סוכן');
  await page.fill('#ag-commission', '300');
  await page.fill('#ag-qualify', '3');
  await page.click('#adm-agent-form button[type="submit"]');
  await page.waitForTimeout(600);
  const saved = sent.filter((call) => call.name === 'agents' && call.body.do === 'save').pop();
  check('שמירת סוכן יצאה', !!saved, true);
  check('עם השם', saved && saved.body.name, 'דוד סוכן');
  check('ועם העמלה', saved && saved.body.commission, '300');

  sent.length = 0;
  await page.click('[data-pay="co-9"]');
  await page.waitForTimeout(500);
  const payCall = sent.filter((call) => call.body.do === 'pay').pop();
  check('סימון תשלום עמלה יצא', payCall && payCall.body.companyIds[0], 'co-9');
  check('כתשלום', payCall && payCall.body.paid, true);

  await page.click('[data-agent-customers="ag-1"]');
  await page.waitForTimeout(500);
  check('לקוחות הסוכן מוצגים עם החיובים',
    await page.locator('#adm-agent-customers').innerText(), /פיצה הכפר/);

  console.log('\n== מערכת הדגמה ==');
  await page.click('.adm-tab[data-panel="demo"]');
  await page.waitForTimeout(500);
  check('אין שדות מייל או סיסמה', await page.locator('#panel-demo input').count(), 0);
  check('יש כפתור כניסה', await page.locator('#adm-demo-enter').innerText(), /כניסה למערכת ההדגמה/);
  check('ההסבר אומר שהשינויים לא נשמרים', await page.locator('#panel-demo').innerText(), /לא נשמרים/);
  const demoBoxes = await page.evaluate(() => {
    const button = document.getElementById('adm-demo-enter').getBoundingClientRect();
    const note = document.querySelector('#panel-demo .adm-demo-note').getBoundingClientRect();
    return { buttonBottom: button.bottom, noteTop: note.top };
  });
  check('הכפתור אינו עולה על ההסבר', demoBoxes.buttonBottom <= demoBoxes.noteTop, true);
  if (process.env.SHOT) await page.locator('#panel-demo').screenshot({ path: process.env.SHOT });
  sent.length = 0;
  const [demoTab] = await Promise.all([
    page.waitForEvent('popup'),
    page.click('#adm-demo-enter')
  ]);
  await demoTab.waitForLoadState('domcontentloaded');
  await demoTab.waitForTimeout(800);
  const entered = sent.filter((call) => call.name === 'demo' && call.body.do === 'enter').pop();
  check('הכניסה יצאה לשרת', !!entered, true);
  check('נפתחה לשונית חדשה באפליקציה', demoTab.url(), /app\.html/);
  check('פס ההדגמה מופיע', await demoTab.locator('#support-banner').isVisible(), true);
  check('ואומר שהשינויים לא נשמרים', await demoTab.locator('#support-banner').innerText(), /מערכת הדגמה.*לא נשמרים/);
  check('הפס אינו אדום של מצב תמיכה', await demoTab.locator('#support-banner').evaluate(
    (node) => getComputedStyle(node).backgroundColor), 'rgb(67, 56, 202)');
  check('ההתחברות יושבת בלשונית', await demoTab.evaluate(
    () => JSON.parse(sessionStorage.getItem('shift-support-mode-v1') || '{}').demo), true);
  await demoTab.close();
  await page.waitForTimeout(300);

  console.log('\n== במסך צר ==');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('אין גלילה אופקית של הדף', overflow <= 1, true);


  console.log('\n== לידים ==');
  sent.length = 0;
  await page.click('.adm-tab[data-panel="leads"]');
  await page.waitForTimeout(600);
  const leadsText = await page.locator('#panel-leads').innerText();
  check('הליד מוצג עם שם העסק', leadsText, /קפה הנחל/);
  check('ועם כמות העובדים וזמן ההכנה', leadsText, /3–6 שעות/);
  check('ועם מקור ההגעה', leadsText, /facebook \/ owners-pain/);
  check('וליד בלי מקור מסומן כישיר', leadsText, /ישיר/);
  check('מוצג קישור וואטסאפ עם קידומת ישראל',
    await page.locator('#panel-leads a[href^="https://wa.me/972"]').first().getAttribute('href'), /^https:\/\/wa\.me\/972541234567$/);
  check('ספירה לפי סטטוס על המסננים', await page.locator('[data-lead-filter="new"]').innerText(), /חדש \(1\)/);
  await page.click('[data-lead-filter="contacted"]');
  await page.waitForTimeout(400);
  check('הסינון נשלח לשרת', sent.filter((c) => c.name === 'leads').pop().body.status, 'contacted');

  sent.length = 0;
  await page.selectOption('[data-lead-status="ld-1"]', 'demo');
  await page.waitForTimeout(400);
  const upd = sent.filter((c) => c.name === 'leads' && c.body.action === 'update').pop();
  check('שינוי סטטוס נשלח', upd && upd.body.status, 'demo');
  check('עבור הליד הנכון', upd && upd.body.id, 'ld-1');

  await page.click('[data-lead-customer="ld-1"]');
  await page.waitForTimeout(300);
  check('הקמת פיילוט מליד ממלאת את הטופס',
    (await page.inputValue('#adm-f-company')) + '|' + (await page.inputValue('#adm-f-email')),
    'קפה הנחל|dana@cafe.co.il');
  await page.click('#adm-modal-cancel');

  const [leadsFile] = await Promise.all([page.waitForEvent('download'), page.click('#adm-export-leads')]);
  check('ייצוא לידים הוריד קובץ', leadsFile.suggestedFilename(), /^setshifts-leads-\d{4}-\d{2}-\d{2}\.xlsx$/);

  console.log('\n== שיווק ==');
  sent.length = 0;
  await page.click('.adm-tab[data-panel="marketing"]');
  await page.waitForTimeout(700);
  const mkText = await page.locator('#panel-marketing').innerText();
  check('נטען דוח שיווק', sent.some((c) => c.name === 'marketing' && c.body.action === 'report'), true);
  check('מוצגת עלות רכישת לקוח', mkText, /עלות רכישת לקוח/);
  check('ומוצג ערוץ Meta', mkText, /Meta/);
  check('מוצג קמפיין', mkText, /owners-pain/);
  check('אזהרה כשרוב ההרשמות בלי מקור', mkText, /60% מההרשמות הגיעו בלי מקור/);
  check('מצב הסנכרון של Meta מוצג', mkText, /Meta: סונכרן .* \(6 שבועות\)/);
  check('וגוגל שאינו מחובר אומר שמזינים ידנית', mkText, /Google Ads: לא מחובר/);

  sent.length = 0;
  await page.fill('#mk-amount', '1250.5');
  await page.click('#mk-spend-form button[type="submit"]');
  await page.waitForTimeout(500);
  const spendCall = sent.filter((c) => c.name === 'marketing' && c.body.action === 'spend-save').pop();
  check('הוצאה נשלחת עם ערוץ וסכום', spendCall && spendCall.body.channel + '|' + spendCall.body.amount, 'meta|1250.5');
  check('לכל שדה בטופס ההוצאה יש תווית',
    await page.evaluate(() => [...document.querySelectorAll('#mk-spend-form label.adm-field')]
      .every((l) => l.htmlFor && document.getElementById(l.htmlFor))), true);

  const [mkFile] = await Promise.all([page.waitForEvent('download'), page.click('#mk-export')]);
  check('ייצוא כל הנתונים הוריד xlsx', mkFile.suggestedFilename(), /^setshifts-marketing-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const mkZip = (await import('node:fs')).readFileSync(await mkFile.path());
  check('הקובץ הוא ZIP תקין', mkZip.slice(0, 2).toString(), 'PK');
  check('כולל הרשמה גולמית', mkZip.includes(Buffer.from('קפה מרכז')), true);
  check('כולל ליד גולמי', mkZip.includes(Buffer.from('קפה הנחל')), true);
  check('כולל הוצאה', mkZip.includes(Buffer.from('קמפיין כאב')), true);
  check('כולל גיליון לפי ערוץ', mkZip.includes(Buffer.from('לפי ערוץ')), true);

  const overflowMk = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('אין גלילה אופקית בשיווק', overflowMk <= 1, true);

  console.log('\n== יציאה ==');
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.waitForTimeout(200);
  check('כפתור היציאה גלוי למי שנכנס',
    await page.locator('#adm-signout').isVisible(), true);
  await page.click('#adm-signout');
  await page.waitForTimeout(900);
  check('האסימון נמחק', await page.evaluate(
    () => sessionStorage.getItem('setshifts-admin-session-v1')), null);
  check('חוזרים למסך הכניסה', await page.locator('#adm-signin').isVisible(), true);
  /* לא רק הסתרה: הנתונים של כל הלקוחות אינם נשארים ב-DOM */
  check('נתוני הלקוחות ירדו מהמסך',
    (await page.locator('body').innerText()).indexOf('מסעדת הגליל'), -1);

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
