/* כרטיס לקוח אחד, מלא.

   הכלל כאן: המשרד האחורי מראה מי הלקוח, מה מצבו ומה קרה לו –
   ולא את הסידורים שלו. הנתונים בתוך company_weeks הם שמות של
   עובדים ואילוצים אישיים, ואין סיבה עסקית לפתוח אותם מכאן.
   מספר השבועות ותאריך העדכון האחרון אומרים מה שצריך לדעת:
   אם הוא משתמש במערכת. */
'use strict';

const Money = require('./_money.js');
const Model = require('../../js/backend/model.js');

module.exports = async function ({ body, db }) {
  const id = String((body && body.id) || '').trim();
  if (!id) return { status: 400, body: { message: 'Missing company id' } };
  const key = encodeURIComponent(id);

  const companyCall = await db('/companies?id=eq.' + key + '&select=*');
  const company = companyCall.ok && companyCall.body && companyCall.body[0];
  if (!company) return { status: 404, body: { message: 'Company not found' } };

  const usersCall = await db('/company_users?company_id=eq.' + key +
    '&select=id,email,name,role,active,invited_at,joined_at,created_at&order=created_at.asc');
  const eventsCall = await db('/billing_events?company_id=eq.' + key +
    '&select=id,type,payload,received_at&order=received_at.desc&limit=200');
  const ticketsCall = await db('/support_tickets?company_id=eq.' + key +
    '&select=*&order=created_at.desc&limit=200');
  const configCall = await db('/company_configs?company_id=eq.' + key + '&select=updated_at');
  const weeksCall = await db('/company_weeks?company_id=eq.' + key +
    '&select=week_key,published,updated_at&order=updated_at.desc&limit=200');

  const events = (eventsCall.ok && eventsCall.body) || [];
  const charged = events.filter(function (row) {
    return row.payload && row.payload.outcome === 'charged';
  });
  const total = Money.split(Money.sum(charged.map(function (row) {
    return Number(row.payload.amount) || 0;
  })));

  const weeks = (weeksCall.ok && weeksCall.body) || [];
  const plan = Model.PLANS[company.plan];

  return {
    body: {
      ok: true,
      company: {
        id: company.id, name: company.name, plan: company.plan,
        planPrice: Money.monthlyOf(company, Model.PLANS) || null,
        listPrice: plan ? plan.priceMonthly : null,
        customPrice: company.custom_price_monthly == null
          ? null : Number(company.custom_price_monthly),
        byQuote: !!(plan && plan.quote),
        status: company.status, validUntil: company.valid_until,
        currentPeriodEnd: company.current_period_end,
        cancelAtPeriodEnd: !!company.cancel_at_period_end,
        createdAt: company.created_at,
        /* הטלפון של הלקוח. זו הסיבה שהוא נדרש בהרשמה: כשמנוי
           נכשל או כשלקוח פיילוט נתקע, המשרד האחורי הוא המקום
           שבו מחפשים איך להגיע אליו. */
        phone: company.phone || null,
        taxId: company.tax_id || null,
        billingProvider: company.billing_provider || null,
        /* מזהה הטוקן עצמו אינו נחוץ כאן, ומה שאינו מוצג אינו
           יכול להישלח בצילום מסך */
        hasCard: !!company.billing_subscription_id
      },
      users: (usersCall.ok && usersCall.body) || [],
      payments: {
        count: charged.length,
        gross: total.gross, net: total.net, vat: total.vat,
        history: charged.map(function (row) {
          return {
            at: (row.payload && row.payload.at) || row.received_at,
            amount: Number(row.payload.amount) || 0,
            plan: row.payload.plan || null,
            transactionId: row.payload.transaction_id || null
          };
        })
      },
      /* כולל ניסיונות שנכשלו – זה מה שמסביר למה לקוח בפיגור */
      events: events.map(function (row) {
        return {
          id: row.id, type: row.type, at: row.received_at,
          outcome: (row.payload && row.payload.outcome) || null,
          reason: (row.payload && row.payload.reason) || null,
          amount: (row.payload && row.payload.amount) || null
        };
      }),
      tickets: (ticketsCall.ok && ticketsCall.body) || [],
      usage: {
        configUpdatedAt: (configCall.ok && configCall.body && configCall.body[0] &&
          configCall.body[0].updated_at) || null,
        weeks: weeks.length,
        published: weeks.filter(function (week) { return week.published; }).length,
        lastWeekAt: weeks.length ? weeks[0].updated_at : null
      }
    }
  };
};
