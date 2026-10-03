/* שיווק: משפך שבועי, עלות לקוח לפי ערוץ, והוצאות פרסום.

   הנתונים מגיעים מהמערכת עצמה -- הרשמות, כרטיסים, חיובים, לידים --
   ורק ההוצאה על פרסום מוזנת ידנית (שבוע, ערוץ, סכום), כי ה-API של
   Meta ושל Google דורשים חשבונות וחיבורים שאינם כאן.

   מה נספר ומה לא:
   · הרשמה = חברה שנפתחה בשבוע, לא חשבון הדגמה. פיילוט ללא תשלום
     נספר כהרשמה אבל לעולם לא כמשלם.
   · משלם = חברה שיש לה חיוב מוצלח אחד לפחות. השבוע שלה הוא שבוע
     החיוב הראשון, לא שבוע ההרשמה: ההרשמה של השבוע שעבר עדיין לא
     שילמה, והחיוב שלה יירשם בשבוע שבו הוא קרה.
   · עלות רכישת לקוח (CAC) = הוצאה / משלמים חדשים באותו חלון. בשבוע
     בודד היא קופצת בגלל פער הזמנים בין פרסום לתשלום, ולכן הדוח
     מציג גם סיכום מצטבר, שהוא המספר שמחליטים לפיו.

   שבוע מתחיל ביום ראשון. */
'use strict';

const Money = require('./_money.js');

const DAY = 864e5;

function weekStart(iso) {
  const d = new Date(iso);
  const day = d.getUTCDay();   // 0 = ראשון
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return start.toISOString().slice(0, 10);
}

/* ערוץ אחיד: Meta מגיע בשמות רבים (facebook, fb, instagram...) והוצאה
   שהוזנה כ-"Meta" חייבת להתאים להרשמה שסומנה "facebook". */
const CHANNELS = {
  meta: ['meta', 'facebook', 'fb', 'instagram', 'ig', 'פייסבוק', 'אינסטגרם', 'מטא'],
  google: ['google', 'adwords', 'gads', 'גוגל'],
  tiktok: ['tiktok', 'טיקטוק'],
  linkedin: ['linkedin', 'לינקדאין'],
  agents: ['agents', 'agent', 'סוכנים', 'סוכן']
};
function channelName(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  for (const key of Object.keys(CHANNELS)) {
    if (CHANNELS[key].indexOf(v) !== -1) return key;
  }
  return v;
}
function channelOf(company) {
  if (company.source === 'agent') return 'agents';
  return channelName(company.utm_source) || 'direct';
}

function auditEntry(user, type, payload) {
  return {
    id: 'admin:marketing:' + type + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 8),
    provider: 'admin', company_id: null, type: 'admin.' + type,
    payload: Object.assign({ by: user.email, at: new Date().toISOString() }, payload)
  };
}

function ratio(a, b) { return b > 0 ? Math.round((a / b) * 100) / 100 : null; }

async function report(ctx) {
  const { body, db } = ctx;
  const weeks = Math.min(Math.max(Math.round(Number(body && body.weeks) || 12), 1), 52);
  const now = Date.now();
  const firstWeek = weekStart(new Date(now - (weeks - 1) * 7 * DAY).toISOString());

  const companiesCall = await db('/companies?select=id,name,created_at,is_demo,free_access,source,' +
    'agent_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term,click_id,billing_subscription_id,' +
    'status,plan&order=created_at.desc&limit=10000');
  if (!companiesCall.ok) {
    /* העמודות החדשות חסרות: המיגרציה לא רצה. אומרים את זה במפורש. */
    return { status: 500, body: { message: 'Could not read companies (has the marketing migration run?)' } };
  }
  const companies = (companiesCall.body || []).filter(function (c) { return !c.is_demo; });

  const chargesCall = await db('/billing_events?select=company_id,payload,received_at' +
    '&type=like.charge*&limit=50000');
  const firstCharge = {};
  const revenue = {};
  ((chargesCall.ok && chargesCall.body) || []).forEach(function (row) {
    if (!row.payload || row.payload.outcome !== 'charged') return;
    const at = (row.payload && row.payload.at) || row.received_at;
    const id = row.company_id;
    if (!firstCharge[id] || at < firstCharge[id]) firstCharge[id] = at;
    revenue[id] = (revenue[id] || 0) + (Number(row.payload.amount) || 0);
  });

  const usersCall = await db('/company_users?select=company_id&active=eq.true&limit=100000');
  const seats = {};
  ((usersCall.ok && usersCall.body) || []).forEach(function (u) {
    seats[u.company_id] = (seats[u.company_id] || 0) + 1;
  });

  const leadsCall = await db('/leads?select=*&order=created_at.desc&limit=10000');
  const leads = (leadsCall.ok && leadsCall.body) || [];

  const spendCall = await db('/marketing_spend?select=*&order=week_start.desc&limit=5000');
  const spend = (spendCall.ok && spendCall.body) || [];

  /* ===== שורה לכל שבוע ===== */
  const rows = {};
  for (let i = 0; i < weeks; i++) {
    const key = weekStart(new Date(now - i * 7 * DAY).toISOString());
    rows[key] = { week: key, leads: 0, signups: 0, withCard: 0, teamAdded: 0, paying: 0, spend: 0 };
  }
  function row(iso) { return rows[weekStart(iso)] || null; }

  leads.forEach(function (lead) { const r = row(lead.created_at); if (r) r.leads++; });
  companies.forEach(function (company) {
    const r = row(company.created_at);
    if (r) {
      r.signups++;
      if (company.billing_subscription_id) r.withCard++;
      if ((seats[company.id] || 0) > 1) r.teamAdded++;
    }
    if (firstCharge[company.id] && company.free_access !== true) {
      const p = row(firstCharge[company.id]);
      if (p) p.paying++;
    }
  });
  spend.forEach(function (s) { const r = rows[s.week_start]; if (r) r.spend += Number(s.amount) || 0; });

  const weekList = Object.keys(rows).sort().reverse().map(function (key) {
    const r = rows[key];
    return Object.assign({}, r, {
      costPerLead: ratio(r.spend, r.leads), costPerSignup: ratio(r.spend, r.signups),
      cac: ratio(r.spend, r.paying)
    });
  });

  /* ===== לפי ערוץ ולפי קמפיין, על כל החלון ===== */
  const channels = {};
  const campaigns = {};
  function bucket(map, key) {
    return map[key] || (map[key] = { key: key, signups: 0, withCard: 0, paying: 0, revenue: 0, spend: 0, leads: 0 });
  }
  companies.forEach(function (company) {
    if (company.created_at < firstWeek) return;
    const ch = bucket(channels, channelOf(company));
    ch.signups++;
    if (company.billing_subscription_id) ch.withCard++;
    if (firstCharge[company.id] && company.free_access !== true) {
      ch.paying++;
      ch.revenue += Money.split(revenue[company.id] || 0).gross;
    }
    if (company.utm_campaign) {
      const cp = bucket(campaigns, channelOf(company) + ' / ' + company.utm_campaign);
      cp.signups++;
      if (firstCharge[company.id] && company.free_access !== true) cp.paying++;
    }
  });
  leads.forEach(function (lead) {
    if (lead.created_at < firstWeek) return;
    bucket(channels, channelName(lead.utm_source) || 'direct').leads++;
  });
  spend.forEach(function (s) {
    if (s.week_start < firstWeek) return;
    bucket(channels, channelName(s.channel) || 'other').spend += Number(s.amount) || 0;
  });
  const channelList = Object.keys(channels).map(function (key) {
    const c = channels[key];
    return Object.assign({}, c, { cac: ratio(c.spend, c.paying), costPerLead: ratio(c.spend, c.leads),
      roas: ratio(c.revenue, c.spend) });
  }).sort(function (a, b) { return b.signups - a.signups; });
  const campaignList = Object.keys(campaigns).map(function (k) { return campaigns[k]; })
    .sort(function (a, b) { return b.signups - a.signups; });

  /* ===== סיכום החלון ===== */
  const totals = weekList.reduce(function (t, r) {
    t.leads += r.leads; t.signups += r.signups; t.withCard += r.withCard;
    t.teamAdded += r.teamAdded; t.paying += r.paying; t.spend += r.spend;
    return t;
  }, { leads: 0, signups: 0, withCard: 0, teamAdded: 0, paying: 0, spend: 0 });
  totals.cac = ratio(totals.spend, totals.paying);
  totals.costPerLead = ratio(totals.spend, totals.leads);
  totals.costPerSignup = ratio(totals.spend, totals.signups);

  /* כמה מההרשמות הגיעו בלי מקור שמיש. אם זה רוב, המדידה לא עובדת
     (הסכמה, פיקסל, או UTM בקישורים) והמספרים לפי ערוץ מטעים. */
  const windowCompanies = companies.filter(function (c) { return c.created_at >= firstWeek; });
  const untracked = windowCompanies.filter(function (c) { return channelOf(c) === 'direct'; }).length;

  const payingTotal = companies.filter(function (c) { return firstCharge[c.id] && c.free_access !== true; }).length;

  return {
    body: {
      ok: true, weeks: weeks, firstWeek: firstWeek,
      totals: totals, weekList: weekList, channels: channelList, campaigns: campaignList,
      payingTotal: payingTotal,
      untrackedShare: windowCompanies.length ? Math.round((untracked / windowCompanies.length) * 100) : null,
      spend: spend.map(function (s) {
        return { id: s.id, weekStart: s.week_start, channel: s.channel, amount: Number(s.amount),
          note: s.note || '' };
      }),
      /* שורות גולמיות לייצוא, כדי שהקובץ יכלול הכול ולא רק סיכומים */
      raw: {
        companies: companies.map(function (c) {
          return { id: c.id, name: c.name, createdAt: c.created_at, status: c.status, plan: c.plan,
            source: channelOf(c), campaign: c.utm_campaign || '', medium: c.utm_medium || '',
            content: c.utm_content || '', term: c.utm_term || '', clickId: c.click_id || '',
            free: c.free_access === true, hasCard: !!c.billing_subscription_id,
            users: seats[c.id] || 0, firstCharge: firstCharge[c.id] || '',
            revenueGross: Money.split(revenue[c.id] || 0).gross };
        }),
        leads: leads.map(function (l) {
          return { createdAt: l.created_at, business: l.business_name, name: l.contact_name,
            phone: l.phone, email: l.email, employees: l.employees, hours: l.hours_per_week,
            status: l.status, source: channelName(l.utm_source) || 'direct',
            campaign: l.utm_campaign || '', converted: !!l.converted_company_id };
        })
      }
    }
  };
}

module.exports = async function (ctx) {
  const { body, db, user } = ctx;
  const action = String((body && body.action) || 'report');

  if (action === 'report') return report(ctx);

  if (action === 'spend-save') {
    const week = String((body && body.weekStart) || '');
    const channel = String((body && body.channel) || '').trim().toLowerCase().slice(0, 40);
    const amount = Number(body && body.amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || isNaN(Date.parse(week))) {
      return { status: 400, body: { message: 'תאריך השבוע לא תקין.' } };
    }
    if (!channel) return { status: 400, body: { message: 'חסר ערוץ.' } };
    if (!isFinite(amount) || amount < 0 || amount > 10000000) {
      return { status: 400, body: { message: 'הסכום חייב להיות מספר אפס או יותר.' } };
    }
    /* תמיד ליום ראשון של אותו שבוע, כדי ששני תאריכים באותו שבוע יתמזגו */
    const start = weekStart(week);
    const call = await db('/marketing_spend?on_conflict=week_start,channel', {
      method: 'POST', prefer: 'return=representation,resolution=merge-duplicates',
      body: [{ week_start: start, channel: channel, amount: Math.round(amount * 100) / 100,
        note: String((body && body.note) || '').slice(0, 200) || null }]
    });
    if (!call.ok) return { status: 500, body: { message: 'Could not save the spend' } };
    await db('/billing_events', { method: 'POST', prefer: 'return=minimal',
      body: [auditEntry(user, 'spend-save', { week: start, channel: channel, amount: amount })] });
    return { body: { ok: true, weekStart: start } };
  }

  if (action === 'spend-delete') {
    const id = String((body && body.id) || '');
    if (!id) return { status: 400, body: { message: 'חסר מזהה.' } };
    const call = await db('/marketing_spend?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    if (!call.ok) return { status: 500, body: { message: 'Could not delete' } };
    await db('/billing_events', { method: 'POST', prefer: 'return=minimal',
      body: [auditEntry(user, 'spend-delete', { id: id })] });
    return { body: { ok: true } };
  }

  return { status: 400, body: { message: 'Unknown action: ' + action } };
};

module.exports._internals = { weekStart: weekStart, channelName: channelName, channelOf: channelOf };
