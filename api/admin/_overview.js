/* לוח המחוונים: כל המספרים של העסק במסך אחד.

   העיקרון שקובע מה נכנס לכאן: מספר שאי אפשר לפעול לפיו הוא
   קישוט. "כמה לקוחות יש" הוא קישוט; "כמה ניסיונות נגמרים
   השבוע ואין להם כרטיס" הוא רשימת שיחות טלפון. */
'use strict';

const Money = require('./_money.js');
const Model = require('../../js/backend/model.js');

const DAY = 864e5;

function daysFromNow(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / DAY);
}

module.exports = async function ({ db }) {
  /* כל החברות. בקנה מידה של אלפי לקוחות זה יתחלף בצבירה בשרת,
     אבל אז גם יהיה ברור אילו מספרים באמת נחוצים. */
  const companiesCall = await db('/companies?select=*&order=created_at.desc&limit=5000');
  if (!companiesCall.ok) return { status: 500, body: { message: 'Could not read companies' } };
  const companies = companiesCall.body || [];

  const usersCall = await db('/company_users?select=company_id,role,active,joined_at&limit=50000');
  const users = (usersCall.ok && usersCall.body) || [];


  /* רק חיובים שעברו. שורת תביעה בלי outcome=charged היא ניסיון,
     לא הכנסה. */
  const chargesCall = await db('/billing_events?select=company_id,payload,received_at' +
    '&type=like.charge*&order=received_at.desc&limit=20000');
  const charges = ((chargesCall.ok && chargesCall.body) || [])
    .filter(function (row) { return row.payload && row.payload.outcome === 'charged'; })
    .map(function (row) {
      return {
        company: row.company_id,
        at: (row.payload && row.payload.at) || row.received_at,
        amount: Number(row.payload.amount) || 0,
        plan: row.payload.plan || null
      };
    });

  const ticketsCall = await db('/support_tickets?select=status&limit=20000');
  const tickets = (ticketsCall.ok && ticketsCall.body) || [];

  /* ===== לפי מצב ולפי חבילה ===== */
  const byStatus = {};
  const byPlan = {};
  companies.forEach(function (company) {
    byStatus[company.status] = (byStatus[company.status] || 0) + 1;
    if (company.status === 'active' || company.status === 'trial') {
      byPlan[company.plan] = (byPlan[company.plan] || 0) + 1;
    }
  });

  /* ===== משתמשים ===== */
  const usersPerCompany = {};
  users.forEach(function (user) {
    if (!usersPerCompany[user.company_id]) usersPerCompany[user.company_id] = 0;
    if (user.active) usersPerCompany[user.company_id]++;
  });

  /* ===== כסף ===== */
  const now = new Date();
  const firstCharge = charges.length ? charges[charges.length - 1].at : now.toISOString();
  const months = Money.byMonth(charges, firstCharge, now.toISOString());
  const thisMonth = months[months.length - 1] || { gross: 0, net: 0, vat: 0, charges: 0 };
  const allTime = Money.split(Money.sum(charges.map(function (c) { return c.amount; })));

  /* ===== מה דורש פעולה =====
     שלוש רשימות, לא שלושה מספרים: הן קצרות ואפשר להתקשר לפיהן. */
  const trialsEnding = companies
    .filter(function (company) {
      if (company.status !== 'trial' || !company.valid_until) return false;
      const days = daysFromNow(company.valid_until);
      return days !== null && days <= 7;
    })
    .map(function (company) {
      return {
        id: company.id, name: company.name, plan: company.plan,
        days: daysFromNow(company.valid_until),
        hasCard: !!company.billing_subscription_id
      };
    })
    .sort(function (a, b) { return a.days - b.days; });

  const failing = companies
    .filter(function (company) { return company.status === 'past_due'; })
    .map(function (company) {
      return {
        id: company.id, name: company.name, plan: company.plan,
        since: company.valid_until, days: -daysFromNow(company.valid_until)
      };
    });

  const canceling = companies
    .filter(function (company) {
      return company.cancel_at_period_end && company.status !== 'canceled';
    })
    .map(function (company) {
      return { id: company.id, name: company.name, until: company.valid_until };
    });

  return {
    body: {
      ok: true,
      generatedAt: now.toISOString(),
      vat: { rate: Money.vatRate(), pricesInclude: Money.pricesIncludeVat() },
      counts: {
        companies: companies.length,
        byStatus: byStatus,
        byPlan: byPlan,
        users: users.filter(function (u) { return u.active; }).length,
        tickets: tickets.reduce(function (acc, ticket) {
          acc[ticket.status] = (acc[ticket.status] || 0) + 1;
          return acc;
        }, {})
      },
      money: {
        /* מה צפוי להיכנס בחודש הבא מהמשלמים של היום */
        recurring: Money.recurring(companies, Model.PLANS),
        thisMonth: thisMonth,
        allTime: allTime,
        months: months
      },
      attention: {
        trialsEnding: trialsEnding,
        failing: failing,
        canceling: canceling
      },
      /* quote: לחבילה אין מחיר מחירון. המסך אינו אמור להציג לה
         ₪0 בעמודת המחיר – זו שורה שנקראת כמו חבילה חינמית. */
      plans: Model.PLAN_ORDER.map(function (id) {
        const plan = Model.PLANS[id];
        const parts = Money.split(plan.priceMonthly);
        return { id: id, priceMonthly: plan.priceMonthly, quote: plan.quote === true,
          net: parts.net, vat: parts.vat, gross: parts.gross };
      })
    }
  };
};
