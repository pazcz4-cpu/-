/* סוכני מכירות: רשימה, הגדרה, דוח חודשי ותשלום עמלות.

   מה נקבע כאן:
   · לכל סוכן קוד, וקישור הפניה: setshifts.com/?ref=<code>. לקוח
     שנרשם דרך הקישור משויך אליו אוטומטית (attach_referral), ולקוח
     שנרשם בלי קישור הוא "האתר". המשרד האחורי יכול לשייך ידנית
     (set-agent בנקודת הפעולות).
   · עמלה: סכום קבוע בשקלים לכל לקוח שהגיע ליעד, וה"יעד" הוא
     qualify_charges חיובים מוצלחים (ברירת מחדל 3). ראו
     _agents-core.js.
   · הדוח החודשי: מי הגיע ליעד באותו חודש, כמה מגיע לכל סוכן, מה
     עוד לא שולם מחודשים קודמים, ומי יגיע בחודש הבא.

   שורת עמלה נוצרת בפעם הראשונה שהדוח נקרא ורואה שלקוח הגיע
   ליעד, והסכום נשמר בה: שינוי העמלה אחר כך לא משכתב עמלה שכבר
   נוצרה. תשלום הוא סימון בלבד; הכסף עצמו מועבר מחוץ למערכת. */
'use strict';

const Money = require('./_money.js');
const Core = require('./_agents-core.js');

const MAX_COMMISSION = 100000;

function cleanCode(raw) { return String(raw || '').trim().toLowerCase(); }

function randomCode(name) {
  /* שם בעברית אינו נותן קוד לטיני: מוסיפים ספרות אקראיות. הקוד
     נראה בקישור, ולכן קצר וקריא. */
  const latin = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 20);
  const tail = Math.random().toString(36).slice(2, 6);
  return (latin ? latin + '-' : 'agent-') + tail;
}

async function readAgents(db) {
  const call = await db('/sales_agents?select=*&order=created_at.asc&limit=1000');
  if (!call.ok) {
    return { error: { status: 500, body: { message: 'Could not read agents (has the migration run?)' } } };
  }
  return { agents: call.body || [] };
}

/* הלקוחות המשויכים, והחיובים שלהם. אחת לכל הקריאה, ולא שאילתה
   לכל לקוח. */
async function readCustomers(db, agentId) {
  const filter = agentId ? '&agent_id=eq.' + encodeURIComponent(agentId) : '&agent_id=not.is.null';
  const companiesCall = await db('/companies?select=id,name,status,plan,created_at,valid_until,' +
    'free_access,is_demo,agent_id,billing_subscription_id,cancel_at_period_end' +
    filter + '&order=created_at.desc&limit=5000');
  const companies = ((companiesCall.ok && companiesCall.body) || [])
    .filter(function (company) { return !company.is_demo; });
  const chargesByCompany = {};
  if (companies.length) {
    const ids = companies.map(function (company) { return encodeURIComponent(company.id); }).join(',');
    const eventsCall = await db('/billing_events?company_id=in.(' + ids + ')' +
      '&type=like.charge*&select=company_id,payload,received_at&limit=50000');
    ((eventsCall.ok && eventsCall.body) || []).forEach(function (row) {
      (chargesByCompany[row.company_id] = chargesByCompany[row.company_id] || []).push(row);
    });
  }
  return { companies: companies, chargesByCompany: chargesByCompany };
}

/* יוצר שורות עמלה ללקוחות שהגיעו ליעד ועוד אין להם שורה */
async function syncCommissions(db, agents, customers) {
  const agentById = {};
  agents.forEach(function (agent) { agentById[agent.id] = agent; });

  const existingCall = await db('/agent_commissions?select=company_id&limit=50000');
  const have = {};
  ((existingCall.ok && existingCall.body) || []).forEach(function (row) { have[row.company_id] = true; });

  const fresh = [];
  customers.companies.forEach(function (company) {
    const agent = agentById[company.agent_id];
    if (!agent || have[company.id] || company.free_access) return;
    const paid = Core.paidCharges(customers.chargesByCompany[company.id]);
    const when = Core.qualifiedAt(paid, agent.qualify_charges);
    if (!when) return;
    fresh.push({
      company_id: company.id, agent_id: agent.id,
      qualified_at: when, month: Core.monthOf(when),
      amount: Number(agent.commission) || 0, status: 'pending'
    });
  });
  if (fresh.length) {
    await db('/agent_commissions', {
      method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: fresh
    });
  }
  return fresh.length;
}

function auditEntry(user, type, payload) {
  return {
    id: 'admin:agents:' + type + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 8),
    provider: 'admin', company_id: null, type: 'admin.' + type,
    payload: Object.assign({ by: user.email, at: new Date().toISOString() }, payload)
  };
}

/* ===== רשימה ===== */
async function list(ctx) {
  const read = await readAgents(ctx.db);
  if (read.error) return read.error;
  const agents = read.agents;
  const customers = await readCustomers(ctx.db, null);
  await syncCommissions(ctx.db, agents, customers);

  const commissionsCall = await ctx.db('/agent_commissions?select=agent_id,amount,status&limit=50000');
  const commissions = (commissionsCall.ok && commissionsCall.body) || [];

  const rows = agents.map(function (agent) {
    const mine = customers.companies.filter(function (company) { return company.agent_id === agent.id; });
    let paying = 0, free = 0, qualified = 0;
    mine.forEach(function (company) {
      if (company.free_access) { free++; return; }
      const paid = Core.paidCharges(customers.chargesByCompany[company.id]);
      if (paid.length) paying++;
      if (Core.qualifiedAt(paid, agent.qualify_charges)) qualified++;
    });
    const owed = commissions.filter(function (row) { return row.agent_id === agent.id && row.status === 'pending'; });
    const paidOut = commissions.filter(function (row) { return row.agent_id === agent.id && row.status === 'paid'; });
    return {
      id: agent.id, name: agent.name, code: agent.code, email: agent.email || '',
      phone: agent.phone || '', commission: agent.commission,
      qualifyCharges: agent.qualify_charges, active: agent.active, note: agent.note || '',
      customers: mine.length, paying: paying, free: free, qualified: qualified,
      owed: Money.sum(owed.map(function (row) { return row.amount; })),
      owedCount: owed.length,
      paidOut: Money.sum(paidOut.map(function (row) { return row.amount; }))
    };
  });
  return { body: { ok: true, agents: rows } };
}

/* ===== הגדרה ===== */
async function save(ctx) {
  const body = ctx.body || {};
  const name = String(body.name || '').trim();
  if (!name || name.length > 120) {
    return { status: 400, body: { message: 'name is required (up to 120 characters)' } };
  }
  const commission = Math.round(Number(body.commission));
  if (!isFinite(commission) || commission < 0 || commission > MAX_COMMISSION) {
    return { status: 400, body: { message: 'commission must be between 0 and ' + MAX_COMMISSION } };
  }
  const qualifyCharges = body.qualifyCharges === undefined || body.qualifyCharges === ''
    ? 3 : Math.round(Number(body.qualifyCharges));
  if (!isFinite(qualifyCharges) || qualifyCharges < 1 || qualifyCharges > 24) {
    return { status: 400, body: { message: 'qualifyCharges must be between 1 and 24' } };
  }
  const row = {
    name: name, commission: commission, qualify_charges: qualifyCharges,
    email: String(body.email || '').trim().slice(0, 200) || null,
    phone: String(body.phone || '').trim().slice(0, 40) || null,
    note: String(body.note || '').trim().slice(0, 500) || null
  };
  if (body.active !== undefined) row.active = body.active === true;

  const id = String(body.id || '').trim();
  let result;
  if (id) {
    /* הקוד אינו משתנה אחרי שנוצר: קישורים כבר נשלחו ללקוחות */
    result = await ctx.db('/sales_agents?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: row });
    if (result.ok && (!result.body || !result.body.length)) {
      return { status: 404, body: { message: 'Agent not found' } };
    }
  } else {
    const code = cleanCode(body.code) || randomCode(name);
    if (!/^[a-z0-9][a-z0-9_-]{1,38}$/.test(code)) {
      return { status: 400, body: { message: 'code may contain lowercase letters, digits, - and _ (2–39 characters)' } };
    }
    row.code = code;
    result = await ctx.db('/sales_agents', { method: 'POST', body: [row] });
    if (!result.ok && result.status === 409) {
      return { status: 409, body: { message: 'That code is already used by another agent' } };
    }
  }
  if (!result.ok) {
    return { status: result.status === 409 ? 409 : 500, body: { message: 'Could not save the agent' } };
  }
  await ctx.db('/billing_events', { method: 'POST', prefer: 'return=minimal',
    body: [auditEntry(ctx.user, 'agent-save', { agent: name, commission: commission,
      qualifyCharges: qualifyCharges, created: !id })] });
  return { body: { ok: true, agent: result.body && result.body[0] } };
}

/* ===== לקוחות של סוכן ===== */
async function customersOf(ctx) {
  const agentId = String((ctx.body && ctx.body.agentId) || '').trim();
  if (!agentId) return { status: 400, body: { message: 'Missing agentId' } };
  const read = await readAgents(ctx.db);
  if (read.error) return read.error;
  const agent = read.agents.filter(function (item) { return item.id === agentId; })[0];
  if (!agent) return { status: 404, body: { message: 'Agent not found' } };

  const customers = await readCustomers(ctx.db, agentId);
  await syncCommissions(ctx.db, [agent], customers);
  const commissionsCall = await ctx.db('/agent_commissions?agent_id=eq.' + encodeURIComponent(agentId) + '&select=*');
  const commissionByCompany = {};
  ((commissionsCall.ok && commissionsCall.body) || []).forEach(function (row) {
    commissionByCompany[row.company_id] = row;
  });

  return {
    body: {
      ok: true,
      agent: { id: agent.id, name: agent.name, qualifyCharges: agent.qualify_charges,
        commission: agent.commission },
      customers: customers.companies.map(function (company) {
        const paid = Core.paidCharges(customers.chargesByCompany[company.id]);
        const row = commissionByCompany[company.id];
        return {
          id: company.id, name: company.name, status: company.status,
          freeAccess: company.free_access === true, createdAt: company.created_at,
          paidCharges: paid.length,
          qualifiedAt: Core.qualifiedAt(paid, agent.qualify_charges),
          commission: row ? { amount: row.amount, status: row.status, month: row.month } : null
        };
      })
    }
  };
}

/* ===== דוח חודשי ===== */
async function report(ctx) {
  const month = String((ctx.body && ctx.body.month) || '').trim() || Money.monthKey(new Date());
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { status: 400, body: { message: 'month must be YYYY-MM' } };
  }
  const read = await readAgents(ctx.db);
  if (read.error) return read.error;
  const agents = read.agents;
  const agentById = {};
  agents.forEach(function (agent) { agentById[agent.id] = agent; });

  const customers = await readCustomers(ctx.db, null);
  await syncCommissions(ctx.db, agents, customers);
  const nameById = {};
  customers.companies.forEach(function (company) { nameById[company.id] = company.name; });

  const commissionsCall = await ctx.db('/agent_commissions?select=*&order=qualified_at.asc&limit=50000');
  const all = (commissionsCall.ok && commissionsCall.body) || [];

  function line(row) {
    const agent = agentById[row.agent_id] || {};
    return {
      companyId: row.company_id, company: nameById[row.company_id] || row.company_id,
      agentId: row.agent_id, agent: agent.name || '—',
      qualifiedAt: row.qualified_at, month: row.month,
      amount: row.amount, status: row.status, paidAt: row.paid_at || null
    };
  }

  const thisMonth = all.filter(function (row) { return row.month === month; }).map(line);
  const older = all.filter(function (row) { return row.month < month && row.status === 'pending'; }).map(line);

  /* מי יגיע ליעד עם החיוב הבא: חסר לו חיוב אחד */
  const upcoming = [];
  customers.companies.forEach(function (company) {
    const agent = agentById[company.agent_id];
    if (!agent || company.free_access || !agent.active) return;
    if (company.status !== 'active' || company.cancel_at_period_end) return;
    const paid = Core.paidCharges(customers.chargesByCompany[company.id]);
    if (paid.length === Number(agent.qualify_charges) - 1) {
      upcoming.push({ companyId: company.id, company: company.name, agent: agent.name,
        nextChargeAt: company.valid_until, paidCharges: paid.length,
        amount: Number(agent.commission) || 0 });
    }
  });

  /* סיכום לפי סוכן, לחודש הנבחר */
  const byAgent = {};
  thisMonth.forEach(function (item) {
    const entry = byAgent[item.agentId] || (byAgent[item.agentId] = {
      agentId: item.agentId, agent: item.agent, count: 0, amount: 0, pending: 0, paid: 0 });
    entry.count++;
    entry.amount = Money.round(entry.amount + item.amount);
    if (item.status === 'paid') entry.paid = Money.round(entry.paid + item.amount);
    else entry.pending = Money.round(entry.pending + item.amount);
  });

  return {
    body: {
      ok: true, month: month, lines: thisMonth, older: older, upcoming: upcoming,
      byAgent: Object.keys(byAgent).map(function (key) { return byAgent[key]; }),
      totals: {
        count: thisMonth.length,
        amount: Money.sum(thisMonth.map(function (item) { return item.amount; })),
        pending: Money.sum(thisMonth.filter(function (item) { return item.status !== 'paid'; })
          .map(function (item) { return item.amount; })),
        olderPending: Money.sum(older.map(function (item) { return item.amount; }))
      }
    }
  };
}

/* ===== סימון תשלום ===== */
async function pay(ctx) {
  const ids = Array.isArray(ctx.body && ctx.body.companyIds)
    ? ctx.body.companyIds.map(String).filter(Boolean) : [];
  if (!ids.length || ids.length > 500) {
    return { status: 400, body: { message: 'companyIds is required (1–500)' } };
  }
  const paid = (ctx.body && ctx.body.paid) !== false;
  const patch = paid
    ? { status: 'paid', paid_at: new Date().toISOString() }
    : { status: 'pending', paid_at: null };
  const note = String((ctx.body && ctx.body.note) || '').trim().slice(0, 300);
  if (note) patch.note = note;

  const updated = await ctx.db('/agent_commissions?company_id=in.(' +
    ids.map(encodeURIComponent).join(',') + ')', { method: 'PATCH', body: patch });
  if (!updated.ok) return { status: 500, body: { message: 'Could not update the commissions' } };

  await ctx.db('/billing_events', { method: 'POST', prefer: 'return=minimal',
    body: [auditEntry(ctx.user, 'agent-pay', { paid: paid, companies: ids,
      count: (updated.body || []).length, note: note })] });
  return { body: { ok: true, updated: (updated.body || []).length } };
}

const DO = { list: list, save: save, customers: customersOf, report: report, pay: pay };

module.exports = async function (ctx) {
  const name = String((ctx.body && ctx.body.do) || 'list');
  const handler = Object.prototype.hasOwnProperty.call(DO, name) ? DO[name] : null;
  if (!handler) return { status: 400, body: { message: 'Unknown agents action: ' + name } };
  return handler(ctx);
};
