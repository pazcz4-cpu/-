/* רשימת הלקוחות, עם חיפוש וסינון.

   מה שנמצא כאן לכל שורה הוא מה שצריך כדי להחליט אם להתקשר:
   מי הבעלים, כמה משתמשים, כמה שילם עד היום, ומתי התוקף נגמר. */
'use strict';

const Money = require('./_money.js');
const Model = require('../../js/backend/model.js');

function matches(company, owner, term) {
  if (!term) return true;
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  const hay = [company.name, company.id, owner && owner.email, owner && owner.name]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.indexOf(needle) !== -1;
}

module.exports = async function ({ body, db }) {
  const term = String((body && body.q) || '');
  const status = String((body && body.status) || '');
  const plan = String((body && body.plan) || '');
  const limit = Math.min(Math.max(Number((body && body.limit) || 200), 1), 1000);

  const companiesCall = await db('/companies?select=*&order=created_at.desc&limit=5000');
  if (!companiesCall.ok) return { status: 500, body: { message: 'Could not read companies' } };
  const companies = companiesCall.body || [];

  const usersCall = await db('/company_users?select=company_id,email,name,role,active,joined_at' +
    '&limit=50000');
  const users = (usersCall.ok && usersCall.body) || [];

  const chargesCall = await db('/billing_events?select=company_id,payload' +
    '&type=like.charge*&limit=20000');
  const charges = (chargesCall.ok && chargesCall.body) || [];

  const ticketsCall = await db('/support_tickets?select=company_id,status&limit=20000');
  const tickets = (ticketsCall.ok && ticketsCall.body) || [];

  /* קיבוץ מראש, כדי שלא נסרוק את כל המשתמשים לכל חברה */
  const owners = {};
  const seats = {};
  users.forEach(function (user) {
    if (user.active) seats[user.company_id] = (seats[user.company_id] || 0) + 1;
    if (user.role === 'owner' && !owners[user.company_id]) owners[user.company_id] = user;
  });

  const paid = {};
  charges.forEach(function (row) {
    if (!row.payload || row.payload.outcome !== 'charged') return;
    paid[row.company_id] = (paid[row.company_id] || 0) + (Number(row.payload.amount) || 0);
  });

  const openTickets = {};
  tickets.forEach(function (ticket) {
    if (ticket.status === 'closed') return;
    openTickets[ticket.company_id] = (openTickets[ticket.company_id] || 0) + 1;
  });

  const rows = companies
    .filter(function (company) {
      if (status && company.status !== status) return false;
      if (plan && company.plan !== plan) return false;
      return matches(company, owners[company.id], term);
    })
    .slice(0, limit)
    .map(function (company) {
      const owner = owners[company.id];
      const total = Money.split(paid[company.id] || 0);
      const planSpec = Model.PLANS[company.plan];
      return {
        id: company.id,
        name: company.name,
        plan: company.plan,
        planPrice: Money.monthlyOf(company, Model.PLANS) || null,
        listPrice: planSpec ? planSpec.priceMonthly : null,
        customPrice: company.custom_price_monthly == null
          ? null : Number(company.custom_price_monthly),
        byQuote: !!(planSpec && planSpec.quote),
        status: company.status,
        validUntil: company.valid_until,
        cancelAtPeriodEnd: !!company.cancel_at_period_end,
        hasCard: !!company.billing_subscription_id,
        createdAt: company.created_at,
        ownerEmail: owner ? owner.email : null,
        ownerName: owner ? owner.name : null,
        users: seats[company.id] || 0,
        openTickets: openTickets[company.id] || 0,
        paidGross: total.gross,
        paidNet: total.net
      };
    });

  return { body: { ok: true, total: companies.length, shown: rows.length, companies: rows } };
};
