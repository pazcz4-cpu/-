/* קריאות השירות מכל החברות, במקום אחד – וגם המענה עליהן.

   בלי זה קריאת שירות היא שורה בבסיס נתונים שאיש אינו רואה.
   עם זה יש תור עבודה. */
'use strict';

const { endpoint } = require('./_admin.js');

const STATUSES = ['open', 'in_progress', 'answered', 'closed'];

module.exports = endpoint(async function ({ user, body, db }) {
  const action = String((body && body.action) || 'list');

  if (action === 'list') {
    const status = String((body && body.status) || '');
    const limit = Math.min(Math.max(Number((body && body.limit) || 200), 1), 1000);
    let path = '/support_tickets?select=*&order=created_at.desc&limit=' + limit;
    if (status) path += '&status=eq.' + encodeURIComponent(status);

    const call = await db(path);
    if (!call.ok) return { status: 500, body: { message: 'Could not read tickets' } };
    const tickets = call.body || [];

    /* שם החברה, כדי שהתור לא יהיה רשימת מזהים */
    const ids = Object.keys(tickets.reduce(function (acc, ticket) {
      acc[ticket.company_id] = true; return acc;
    }, {}));
    const names = {};
    if (ids.length) {
      const companiesCall = await db('/companies?select=id,name,plan,status&id=in.(' +
        ids.map(encodeURIComponent).join(',') + ')');
      ((companiesCall.ok && companiesCall.body) || []).forEach(function (company) {
        names[company.id] = company;
      });
    }

    return {
      body: {
        ok: true,
        tickets: tickets.map(function (ticket) {
          const company = names[ticket.company_id] || {};
          return Object.assign({}, ticket, {
            companyName: company.name || null,
            companyPlan: company.plan || null,
            companyStatus: company.status || null
          });
        })
      }
    };
  }

  if (action === 'reply') {
    const id = String((body && body.id) || '').trim();
    const reply = String((body && body.reply) || '').trim();
    const status = String((body && body.status) || 'answered');
    if (!id) return { status: 400, body: { message: 'Missing ticket id' } };
    if (STATUSES.indexOf(status) === -1) {
      return { status: 400, body: { message: 'Unknown status' } };
    }
    if (status === 'answered' && !reply) {
      return { status: 400, body: { message: 'A reply is required' } };
    }

    const patch = { status: status, updated_at: new Date().toISOString() };
    if (reply) patch.reply = reply;

    const updated = await db('/support_tickets?id=eq.' + encodeURIComponent(id),
      { method: 'PATCH', body: patch });
    if (!updated.ok || !updated.body || !updated.body.length) {
      return { status: 404, body: { message: 'Ticket not found' } };
    }
    return { body: { ok: true, ticket: updated.body[0], by: user.email } };
  }

  return { status: 400, body: { message: 'Unknown action: ' + action } };
});
