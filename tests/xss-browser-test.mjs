/* הזרקת HTML: מה קורה כששם של עובד, סניף, תפקיד או עסק הוא קוד.

   שתי זירות נבדקות כאן, והשנייה חשובה יותר:

   1. מסך המנהל – נתונים שהמנהל עצמו הקליד.
   2. המשרד האחורי – שם העסק, שם הבעלים והמייל שלו מגיעים
      מלקוחות. כלומר תוקף שולט בהם והם מוצגים במסך שרואה את כל
      הלקוחות. זה הגבול הרגיש במערכת.

   הרצה: node tests/xss-browser-test.mjs */
import { createRequire } from 'node:module';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const P = '<img src=x onerror="window.__pwned=1">';
const days = (n) => new Date(Date.now() + n * 864e5).toISOString();

const failures = [];
function check(label, actual, expected) {
  const ok = actual === expected;
  console.log((ok ? '  \u2713 ' : '  \u2717 ') + label + ' \u2192 ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' \u2260 ' + expected);
}

const browser = await chromium.launch();

async function probe(page) {
  return {
    pwned: await page.evaluate(() => !!window.__pwned),
    injected: await page.evaluate(() => document.querySelectorAll('img[src="x"]').length),
    asText: await page.evaluate((p) => document.body.innerText.includes(p), P)
  };
}

try {
  console.log('\n== מסך המנהל ==');
  {
    const page = await (await browser.newContext({ locale: 'he-IL' })).newPage();
    await skipWizard(page);
    await page.goto(url('index.html'));
    await page.waitForTimeout(600);
    await page.evaluate((payload) => {
      const App = window.ShiftApp;
      const state = App.getState();
      state.employees[0].name = payload;
      state.employees[0].note = payload;
      state.branches[0].name = payload;
      state.settings.roles = [{ id: 'r1', name: payload }];
      state.employees[0].roles = ['r1'];
      state.settings.companyName = payload;
      App.render();
    }, P);
    await page.waitForTimeout(600);
    const r = await probe(page);
    check('לא רץ קוד זר', r.pwned, false);
    check('לא נוצר אלמנט מהשם', r.injected, 0);
    check('והשם מוצג כטקסט', r.asText, true);
    await page.context().close();
  }

const WORLD = {
  overview: { ok: true, generatedAt: new Date().toISOString(),
    vat: { rate: 18, pricesInclude: true },
    counts: { companies: 1, byStatus: { trial: 1 }, byPlan: { starter: 1 }, users: 1,
      tickets: { open: 1 } },
    money: { recurring: { companies: 0, gross: 0, net: 0, vat: 0 },
      thisMonth: { month: '2026-09', charges: 0, gross: 0, net: 0, vat: 0 },
      allTime: { gross: 0, net: 0, vat: 0 },
      months: [{ month: '2026-09', charges: 0, gross: 0, net: 0, vat: 0 }] },
    attention: { trialsEnding: [{ id: 'c1', name: P, plan: 'starter', days: 2, hasCard: false }],
      failing: [{ id: 'c1', name: P, plan: 'starter', days: 1 }],
      canceling: [{ id: 'c1', name: P, until: days(5) }] },
    plans: [{ id: 'starter', priceMonthly: 199, net: 168, vat: 31, gross: 199 }] },
  companies: { ok: true, total: 1, shown: 1, companies: [{ id: 'c1', name: P,
    plan: 'starter', status: 'trial', validUntil: days(3), cancelAtPeriodEnd: false,
    hasCard: false, createdAt: days(-5), ownerEmail: P, ownerName: P,
    users: 1, openTickets: 1, paidGross: 0, paidNet: 0 }] },
  company: { ok: true, company: { id: 'c1', name: P, plan: 'starter', planPrice: 199,
      status: 'trial', validUntil: days(3), cancelAtPeriodEnd: false, createdAt: days(-5),
      billingProvider: P, hasCard: false },
    users: [{ id: 'u1', email: P, name: P, role: 'owner', active: true, joined_at: days(-5) }],
    payments: { count: 0, gross: 0, net: 0, vat: 0, history: [] },
    events: [{ id: 'e1', type: P, at: days(-1), outcome: 'declined', reason: P, amount: null }],
    tickets: [{ id: 't1', created_at: days(-1), subject: P, status: 'open' }],
    usage: { configUpdatedAt: days(-1), weeks: 1, published: 0, lastWeekAt: days(-1) } },
  tickets: { ok: true, tickets: [{ id: 't1', company_id: 'c1', companyName: P, kind: 'bug',
    status: 'open', subject: P, body: P, created_at: days(-1), reply: P }] }
};

  console.log('\n== המשרד האחורי, עם נתונים של תוקף ==');
  {
    const page = await (await browser.newContext({ locale: 'he-IL' })).newPage();
    await page.route('**/api/admin', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(WORLD[body.op] || { ok: true }) });
    });
    await page.goto(url('admin.html'));
    await page.evaluate(() => sessionStorage.setItem('setshifts-admin-session-v1',
      JSON.stringify({ access_token: 't', user: { email: 'boss@setshifts.com' } })));
    await page.reload();
    await page.waitForTimeout(900);
    for (const tab of ['companies', 'money', 'tickets', 'overview']) {
      await page.click('.adm-tab[data-panel="' + tab + '"]');
      await page.waitForTimeout(400);
      if (tab === 'companies') {
        await page.click('#panel-companies tbody tr [data-open]').catch(() => {});
        await page.waitForTimeout(500);
      }
    }
    const r = await probe(page);
    check('לא רץ קוד זר', r.pwned, false);
    check('לא נוצר אלמנט משם של לקוח', r.injected, 0);
    check('והשם מוצג כטקסט', r.asText, true);
    await page.context().close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n\u274c נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n\u2705 שום קלט לא הפך לקוד');
