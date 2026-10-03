/* מערכת ההדגמה למכירות.

   בעל המוצר מגיע לבית עסק, לוחץ במשרד האחורי "כניסה למערכת
   ההדגמה", ומראה את המוצר על עסק שנראה אמיתי: 11 עובדים בשמות,
   2 סניפים, 4 משמרות ביום, סידור שפורסם, דוח שעות, בקשות אילוץ
   שממתינות לאישור – ושבוע הבא ריק, כדי לבנות בו סידור בלחיצה מול
   העיניים של הלקוח. משם מתאימים אותו לעסק שמולך.

   בלי מיילים ובלי סיסמאות: המשתמש של ההדגמה פנימי
   (demo.owner@setshifts.com), נוצר כאן עם סיסמה אקראית שאיש אינו
   יודע, והכניסה היא אסימון חד־פעמי כמו בכניסת התמיכה.

   כל כניסה מתחילה מאפס: לפני שהאסימון נמסר, כל מה ששונה בהדגמה
   הקודמת נמחק והנתונים נכתבים מחדש. אין צורך לזכור לאפס.

   מה שמבדיל אותו מלקוח אמיתי:
   · is_demo: אינו נספר בלוח, בהכנסה ובעמלות סוכנים.
   · free_access: פעיל, לא מחויב ולא פג.
   · לעובדים אין מייל וטלפון, ולכן פרסום סידור בהדגמה אינו שולח
     הודעה לאף אחד.

   אין כאן "סביבת הדגמה" בחשבונות של לקוחות: זה נשאר כמו שהוחלט
   (נתוני דוגמה בחשבון אמיתי הם נתונים שאפשר לפרסם בטעות). זה
   חשבון נפרד, בבעלות בעל המוצר בלבד, והדרך היחידה להיכנס אליו
   היא שער המשרד האחורי. */
'use strict';

const crypto = require('crypto');
const { projectUrl } = require('../_supabase.js');
const Data = require('../../js/data.js');
const Store = require('../../js/store.js');
const Scheduler = require('../../js/scheduler.js');
const Shabbat = require('../../js/shabbat.js');

const OPEN_ENDED = '2099-12-31T00:00:00.000Z';
const COMPANY_NAME = 'עסק לדוגמה';
/* התוכנית הבינונית (11–30): בתוכנית הקטנה 11 עובדים חורגים מהתקרה,
   ואין מקום להוסיף עובד מול הלקוח */
const PLAN = 'growth';
const OWNER = { email: 'demo.owner@setshifts.com', name: 'בעל העסק' };

/* ארבע משמרות ביום, חופפות, כמו בבית קפה או מסעדה */
const SHIFTS = [
  { id: 'morning', name: 'בוקר', from: '07:00', to: '13:00', color: 0 },
  { id: 'noon', name: 'צהריים', from: '11:00', to: '17:00', color: 1 },
  { id: 'afternoon', name: 'אחר הצהריים', from: '15:00', to: '21:00', color: 3 },
  { id: 'evening', name: 'ערב', from: '18:00', to: '23:00', color: 2 }
];
const BRANCHES = [{ id: 'br-center', name: 'סניף מרכז' }, { id: 'br-north', name: 'סניף צפון' }];
const ALL = SHIFTS.map(function (shift) { return shift.id; });
/* ארבעה קבועים בכל סניף, שני מחליפים בשניהם, וסטודנטית בלי בקרים.
   11 ולא 8: עם 8 בדיוק יש מקום לכל המשמרות רק כשאף אחד לא ביקש
   חופש, ובשבוע הבא יש בקשות – והסידור שנבנה מול הלקוח יצא עם חורים. */
const EMPLOYEES = [
  { branches: ['br-center'], shifts: ALL, maxShifts: 6, note: '' },
  { branches: ['br-center'], shifts: ALL, maxShifts: 6, note: '' },
  { branches: ['br-center'], shifts: ALL, maxShifts: 6, note: '' },
  { branches: ['br-north'], shifts: ALL, maxShifts: 6, note: '' },
  { branches: ['br-north'], shifts: ALL, maxShifts: 6, note: '' },
  { branches: ['br-north'], shifts: ALL, maxShifts: 6, note: '' },
  { branches: [], shifts: ALL, maxShifts: 6, note: 'מחליף בשני הסניפים' },
  { branches: [], shifts: ['noon', 'afternoon', 'evening'], maxShifts: 5, note: 'סטודנטית – בלי בקרים' },
  { branches: ['br-center'], shifts: ALL, maxShifts: 6, note: '' },
  { branches: ['br-north'], shifts: ALL, maxShifts: 6, note: '' },
  { branches: [], shifts: ALL, maxShifts: 6, note: 'מחליפה בשני הסניפים' }
];

const NAMES = ['דנה כהן', 'יוסי לוי', 'מיכל אברהם', 'רועי ביטון',
  'נועה פרידמן', 'עידו מזרחי', 'שירה דהן', 'אורי שפירא',
  'תמר גולן', 'אביב חדד', 'ליאור כץ'];

/* מחולל דטרמיניסטי: אותו איפוס נותן אותה הדגמה, וגם אפשר לבדוק */
function lcg(seed) {
  let value = seed >>> 0;
  return function () {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/* התאריך בישראל כתאריך מקומי של השרת: Store עובד עם getDay()
   מקומי, ושרת ב-UTC ליד חצות היה מציג את השבוע הלא נכון. */
function israelToday(now) {
  const off = Shabbat.israelOffsetHours(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  const shifted = new Date(now.getTime() + off * 3600e3);
  return new Date(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

function israelIso(date, hhmm, plusDays) {
  const parts = String(hhmm || '00:00').split(':');
  const hour = Number(parts[0]) || 0;
  const minute = Number(parts[1]) || 0;
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate() + (plusDays || 0);
  const off = Shabbat.israelOffsetHours(y, m, d);
  return new Date(Date.UTC(y, m - 1, d, hour - off, minute)).toISOString();
}

function minutesOf(hhmm) {
  const parts = String(hhmm || '').split(':');
  return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
}

/* ===== נתוני ההדגמה =====
   פונקציה טהורה: מקבלת "עכשיו" ומחזירה מה לכתוב בבסיס הנתונים. */
function buildDemoData(now) {
  const state = Store.emptyState();
  state.settings.onboardingDone = true;
  state.settings.shifts = SHIFTS.map(function (shift) { return Object.assign({}, shift); });
  /* שעון הנוכחות דלוק: דוח השעות הוא חלק ממה שמראים */
  state.settings.timeclock = Object.assign({}, state.settings.timeclock, { enabled: true, mode: 'phone' });
  state.branches = BRANCHES.map(function (branch) {
    const schedule = Data.defaultSchedule(null, SHIFTS);
    schedule[5] = { morning: { need: 2, from: '07:00', to: '14:00' } };
    return { id: branch.id, name: branch.name, active: true, schedule: schedule };
  });
  state.employees = EMPLOYEES.map(function (seed, index) {
    return { id: 'emp-' + (index + 1), name: NAMES[index], active: true,
      branches: seed.branches.slice(), shifts: seed.shifts.slice(),
      maxShifts: seed.maxShifts, note: seed.note };
  });

  const today = israelToday(now || new Date());
  const thisWeek = Store.currentWeekKey(today);
  const prevWeek = Store.shiftWeekKey(thisWeek, -1);
  const nextWeek = Store.shiftWeekKey(thisWeek, 1);
  const rand = lcg(20261001);

  function generate(weekKey, seed) {
    const week = Store.getWeek(state, weekKey);
    const result = Scheduler.generate(state, week, { attempts: 120, seed: seed });
    week.assignments = result.assignments;
    week.generatedAt = new Date(now || Date.now()).toISOString();
    return week;
  }

  /* שבוע קודם ושבוע נוכחי: סידור שנבנה ופורסם */
  const prev = generate(prevWeek, 11);
  const current = generate(thisWeek, 23);

  /* בקשות אילוץ בשבוע הנוכחי, כבר מוכרעות: כך מסך העובד מראה
     איך נראית בקשה שאושרה */
  Store.setConstraint(current, 'emp-6', 2, { off: false, blocked: { evening: true }, preferred: {},
    note: 'שיעור ערב', status: 'pending' });
  Store.setConstraintStatus(current, 'emp-6', 2, 'approved', '');

  Store.markPublished(prev, new Date(now || Date.now()));
  Store.markPublished(current, new Date(now || Date.now()));

  /* שבוע הבא: טיוטה ריקה, עם בקשות שממתינות לאישור */
  const next = Store.getWeek(state, nextWeek);
  Store.setConstraint(next, 'emp-1', 3, { off: true, blocked: {}, preferred: {},
    note: 'תור לרופא', status: 'pending' });
  Store.setConstraint(next, 'emp-2', 4, { off: true, blocked: {}, preferred: {},
    note: 'אירוע משפחתי', status: 'pending' });
  Store.setConstraint(next, 'emp-4', 0, { off: false, blocked: {}, preferred: { morning: true },
    note: '', status: 'pending' });
  Store.setConstraint(next, 'emp-5', 2, { off: false, blocked: { morning: true }, preferred: {},
    note: 'לימודים', status: 'pending' });
  Store.setConstraint(next, 'emp-6', 1, { off: true, blocked: {}, preferred: {},
    note: '', status: 'pending' });
  Store.setConstraintStatus(next, 'emp-6', 1, 'approved', '');

  /* דיווחי שעון: כל השבוע הקודם, והימים שעברו בשבוע הנוכחי.
     דוח השעות נראה אמיתי ולא ריק. */
  const branchById = {};
  state.branches.forEach(function (branch) { branchById[branch.id] = branch; });
  function addPunches(week, weekKey, daysBefore) {
    Object.keys(week.assignments).forEach(function (key) {
      const parts = key.split('|');
      const dayIdx = Number(parts[0]);
      if (dayIdx >= daysBefore) return;
      const branch = branchById[parts[1]];
      const hours = branch ? Store.slotHours(week, branch, dayIdx, parts[2]) : null;
      if (!hours || !hours.from || !hours.to) return;
      const day = Store.dateOfDay(weekKey, dayIdx);
      const overnight = minutesOf(hours.to) <= minutesOf(hours.from);
      (week.assignments[key] || []).forEach(function (empId) {
        const lateIn = Math.round(rand() * 9 - 2);       // בין 2 דקות מוקדם ל-7 מאוחר
        const lateOut = Math.round(rand() * 14);
        const inAt = new Date(Date.parse(israelIso(day, hours.from)) + lateIn * 60000).toISOString();
        const outAt = new Date(Date.parse(israelIso(day, hours.to, overnight ? 1 : 0)) + lateOut * 60000).toISOString();
        Store.addPunch(week, { empId: empId, kind: 'in', at: inAt, src: 'phone', branchId: parts[1], force: true });
        Store.addPunch(week, { empId: empId, kind: 'out', at: outAt, src: 'phone', branchId: parts[1], force: true });
      });
    });
  }
  addPunches(prev, prevWeek, 7);
  /* היום עצמו אינו נכלל: משמרת שעוד לא הסתיימה אינה "יצאה" */
  addPunches(current, thisWeek, today.getDay());

  const weeks = {};
  [prevWeek, thisWeek, nextWeek].forEach(function (key) {
    const week = state.weeks[key];
    weeks[key] = {
      published: !!week.published,
      week: {
        constraints: week.constraints, assignments: week.assignments, manual: week.manual || {},
        holidays: week.holidays || {}, dayHours: week.dayHours || {}, calendarAsked: !!week.calendarAsked,
        punches: week.punches || [], shabbatEnd: Store.shabbatEnd(week), note: week.note || '',
        generatedAt: week.generatedAt || null,
        publishedAt: week.publishedAt || null, publishedSignature: week.publishedSignature || ''
      }
    };
  });

  return {
    config: { settings: state.settings, branches: state.branches, employees: state.employees },
    weeks: weeks,
    companyName: COMPANY_NAME
  };
}

/* ===== שרת ===== */

async function authCall(path, options) {
  const opts = options || {};
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(projectUrl() + path, {
    method: opts.method || 'GET',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const text = await response.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch (err) { body = { message: text }; } }
  return { ok: response.ok, status: response.status, body: body };
}

async function findDemo(db) {
  const call = await db('/companies?is_demo=eq.true&select=*&order=created_at.asc&limit=1');
  if (!call.ok) return { error: { status: 500, body: { message: 'Could not read the demo account (has the migration run?)' } } };
  return { company: (call.body && call.body[0]) || null };
}

/* משתמש בחברה: אם כבר קיים – רק מעדכנים סיסמה; אחרת יוצרים */
async function ensureUser(db, company, spec) {
  const existing = await db('/company_users?company_id=eq.' + encodeURIComponent(company.id) +
    '&email=eq.' + encodeURIComponent(spec.email) + '&select=id');
  const found = existing.ok && existing.body && existing.body[0];
  if (found) {
    const updated = await authCall('/auth/v1/admin/users/' + encodeURIComponent(found.id), {
      method: 'PUT', body: { password: spec.password, email_confirm: true }
    });
    if (!updated.ok) {
      return { error: { status: updated.status || 500, body: { message:
        (updated.body && (updated.body.msg || updated.body.message)) || 'Could not set the password' } } };
    }
    await db('/company_users?id=eq.' + encodeURIComponent(found.id), {
      method: 'PATCH', prefer: 'return=minimal',
      body: { role: spec.role, employee_id: spec.employeeId || null, name: spec.name, active: true }
    });
    return { id: found.id, created: false };
  }

  const fresh = await authCall('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: spec.email, password: spec.password, email_confirm: true,
      user_metadata: { name: spec.name } }
  });
  if (!fresh.ok || !fresh.body || !fresh.body.id) {
    const message = (fresh.body && (fresh.body.msg || fresh.body.message)) || 'Could not create the user';
    /* כתובת שכבר קיימת בחשבון אחר אינה שייכת להדגמה, ואיננו נוגעים בה */
    return { error: { status: fresh.status === 422 ? 409 : (fresh.status || 500),
      body: { message: fresh.status === 422
        ? 'The address ' + spec.email + ' already has an account. Choose another demo address.'
        : message } } };
  }
  const now = new Date().toISOString();
  const linked = await db('/company_users', {
    method: 'POST', prefer: 'return=minimal',
    body: [{ id: fresh.body.id, company_id: company.id, email: spec.email, name: spec.name,
      role: spec.role, employee_id: spec.employeeId || null, active: true,
      invited_at: now, joined_at: now }]
  });
  if (!linked.ok) {
    await authCall('/auth/v1/admin/users/' + encodeURIComponent(fresh.body.id), { method: 'DELETE' });
    return { error: { status: 500, body: { message: 'Could not link the user to the demo account' } } };
  }
  return { id: fresh.body.id, created: true };
}

async function status(ctx) {
  const found = await findDemo(ctx.db);
  if (found.error) return found.error;
  if (!found.company) return { body: { ok: true, exists: false } };
  const company = found.company;
  const usersCall = await ctx.db('/company_users?company_id=eq.' + encodeURIComponent(company.id) +
    '&select=email,name,role,employee_id&order=created_at.asc');
  const configCall = await ctx.db('/company_configs?company_id=eq.' + encodeURIComponent(company.id) +
    '&select=updated_at');
  return {
    body: {
      ok: true, exists: true,
      company: { id: company.id, name: company.name },
      users: (usersCall.ok && usersCall.body) || [],
      resetAt: (configCall.ok && configCall.body && configCall.body[0] && configCall.body[0].updated_at) || null
    }
  };
}

/* החברה עצמה: נוצרת בפעם הראשונה, ובכל כניסה מוודאים שהיא פעילה
   וללא תשלום (מישהו יכול היה לשנות אותה ממסך הלקוח) */
async function ensureCompany(db, existing) {
  if (!existing) {
    const created = await db('/companies', { method: 'POST', body: [{
      name: COMPANY_NAME, plan: PLAN, status: 'active',
      valid_until: OPEN_ENDED, current_period_end: OPEN_ENDED,
      free_access: true, is_demo: true
    }] });
    const company = created.ok && created.body && created.body[0];
    return company ? { company: company }
      : { error: { status: 500, body: { message: 'Could not create the demo account (has the migration run?)' } } };
  }
  await db('/companies?id=eq.' + encodeURIComponent(existing.id), {
    method: 'PATCH', prefer: 'return=minimal',
    body: { name: COMPANY_NAME, plan: PLAN, status: 'active', valid_until: OPEN_ENDED, current_period_end: OPEN_ENDED,
      free_access: true, cancel_at_period_end: false }
  });
  return { company: Object.assign({}, existing, { name: COMPANY_NAME }) };
}

/* מי נכנס: בעלים או מנהל פעיל שכבר קיים בהדגמה, ואם אין –
   המשתמש הפנימי, עם סיסמה אקראית שאינה נשמרת ואינה מוצגת */
async function ensureOwner(db, company) {
  const call = await db('/company_users?company_id=eq.' + encodeURIComponent(company.id) +
    '&active=eq.true&role=in.(owner,manager)&select=id,email,role&order=created_at.asc&limit=20');
  const people = (call.ok && call.body) || [];
  const found = people.filter(function (p) { return p.role === 'owner'; })[0] || people[0];
  if (found && found.email) return { email: found.email };
  const made = await ensureUser(db, company, {
    email: OWNER.email, password: crypto.randomBytes(24).toString('base64url'),
    name: OWNER.name, role: 'owner', employeeId: null });
  return made.error ? made : { email: OWNER.email };
}

/* מחיקת כל מה שהיה, וכתיבת ההדגמה מההתחלה */
async function writeData(db, company, data) {
  const key = encodeURIComponent(company.id);
  const wiped = await db('/company_weeks?company_id=eq.' + key, { method: 'DELETE', prefer: 'return=minimal' });
  if (!wiped.ok) return { status: 500, body: { message: 'Could not clear the old demo data' } };

  const now = new Date().toISOString();
  const config = await db('/company_configs', {
    method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates',
    body: [{ company_id: company.id, config: data.config, updated_at: now }]
  });
  if (!config.ok) return { status: 500, body: { message: 'Could not write the demo settings' } };

  const weeks = await db('/company_weeks', {
    method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates',
    body: Object.keys(data.weeks).map(function (weekKey) {
      return { company_id: company.id, week_key: weekKey, week: data.weeks[weekKey].week,
        published: data.weeks[weekKey].published, updated_at: now };
    })
  });
  if (!weeks.ok) return { status: 500, body: { message: 'Could not write the demo schedule' } };
  return null;
}

/* כניסה: איפוס מלא, ואז אסימון חד־פעמי לבעלים של ההדגמה */
async function enter(ctx) {
  const found = await findDemo(ctx.db);
  if (found.error) return found.error;
  const ensured = await ensureCompany(ctx.db, found.company);
  if (ensured.error) return ensured.error;
  const company = ensured.company;

  const owner = await ensureOwner(ctx.db, company);
  if (owner.error) return owner.error;

  const data = buildDemoData(new Date());
  const failed = await writeData(ctx.db, company, data);
  if (failed) return failed;

  const generated = await authCall('/auth/v1/admin/generate_link', {
    method: 'POST', body: { type: 'magiclink', email: owner.email }
  });
  const hash = generated.ok && generated.body &&
    (generated.body.hashed_token || (generated.body.properties && generated.body.properties.hashed_token));
  if (!hash) return { status: 502, body: { message: 'Could not open the demo' } };

  /* האסימון עצמו אינו נרשם ביומן */
  await ctx.db('/billing_events', { method: 'POST', prefer: 'return=minimal', body: [{
    id: 'admin:' + company.id + ':demo-enter:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8),
    provider: 'admin', company_id: company.id, type: 'admin.demo-enter',
    payload: { by: ctx.user.email, at: new Date().toISOString(), created: !found.company }
  }] });

  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  return {
    body: {
      ok: true, created: !found.company,
      company: { id: company.id, name: company.name },
      url: base + '/app/?support=' + encodeURIComponent(hash) +
        '&co=' + encodeURIComponent(company.name) + '&demo=1'
    }
  };
}

const DO = { status: status, enter: enter };

module.exports = async function (ctx) {
  const name = String((ctx.body && ctx.body.do) || 'status');
  const handler = Object.prototype.hasOwnProperty.call(DO, name) ? DO[name] : null;
  if (!handler) return { status: 400, body: { message: 'Unknown demo action: ' + name } };
  return handler(ctx);
};

module.exports.buildDemoData = buildDemoData;
