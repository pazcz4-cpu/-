/* כרטיס לקוח אחד, מלא.

   הכלל כאן: המשרד האחורי מראה מי הלקוח, מה מצבו ומה קרה לו –
   ולא את הסידורים שלו. הנתונים בתוך company_weeks הם שמות של
   עובדים ואילוצים אישיים, ואין סיבה עסקית לפתוח אותם מכאן.
   מספר השבועות ותאריך העדכון האחרון אומרים מה שצריך לדעת:
   אם הוא משתמש במערכת. */
'use strict';

const Money = require('./_money.js');
const Seats = require('../_seats.js');
const Model = require('../../js/backend/model.js');
const Agents = require('./_agents-core.js');

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

  /* מקור הלקוח, ואם הגיע דרך סוכן – כמה חיובים שילם עד היום
     ומתי יגיע ליעד. טבלת הסוכנים עוד לא קיימת לפני המיגרציה, ואז
     הכרטיס נטען בלי החלק הזה. */
  let agent = null;
  if (company.agent_id) {
    const agentCall = await db('/sales_agents?id=eq.' + encodeURIComponent(company.agent_id) + '&select=*');
    const row = agentCall.ok && agentCall.body && agentCall.body[0];
    if (row) {
      const paid = Agents.paidCharges(events);
      const when = Agents.qualifiedAt(paid, row.qualify_charges);
      const commissionCall = await db('/agent_commissions?company_id=eq.' + key + '&select=*');
      const commission = commissionCall.ok && commissionCall.body && commissionCall.body[0];
      agent = {
        id: row.id, name: row.name, code: row.code,
        commissionAmount: row.commission, qualifyCharges: row.qualify_charges,
        paidCharges: paid.length, qualifiedAt: when,
        commission: commission
          ? { amount: commission.amount, status: commission.status, month: commission.month,
              paidAt: commission.paid_at }
          : null
      };
    }
  }


  return {
    body: {
      ok: true,
      company: {
        id: company.id, name: company.name, plan: company.plan,
        planPrice: Money.monthlyOf(company, Model.PLANS) || null,
        listPrice: plan ? plan.priceMonthly : null,
        customPrice: company.custom_price_monthly == null
          ? null : Number(company.custom_price_monthly),
        customPricePerEmployee: company.custom_price_per_employee == null
          ? null : Number(company.custom_price_per_employee),
        /* מה שמחייבים עליו, ומה שיש כרגע. המספרים נקראים
           מעמודות שהטריגר מתחזק, ולא מההגדרות: המשרד האחורי
           אינו צריך לפתוח את רשימת העובדים כדי לספור אותה. */
        pricedEmployees: Seats.billable(company),
        currentEmployees: Seats.current(company),
        /* תוספת התראות הוואטסאפ, והסכום שהיא מוסיפה. מוצג כאן
           כי "למה החשבון שלו גדל" היא שאלה שנשאלת מהמסך הזה. */
        waEmployeeAddon: company.wa_employee_addon === true,
        /* מי חתם על הצהרת האחריות לשליחת וואטסאפ, ומתי */
        waDeclaration: company.wa_declaration_at ? {
          at: company.wa_declaration_at,
          name: company.wa_declaration_name || '',
          version: company.wa_declaration_version || ''
        } : null,
        waAddonPrice: Model.WA_EMPLOYEE_PRICE,
        waAddonMonthly: company.wa_employee_addon === true
          ? Model.WA_EMPLOYEE_PRICE * (Seats.billable(company) || 0) : 0,
        byQuote: !!(plan && plan.quote),
        freeAccess: company.free_access === true,
        freeUntil: company.free_until || null,
        isDemo: company.is_demo === true,
        source: company.source === 'agent' ? 'agent' : 'direct',
        agent: agent,
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
