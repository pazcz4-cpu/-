/* תזכורת לעובד: המשמרת התחילה, ולא נרשמה כניסה בשעון הנוכחות.

   ═══ למי ═══
   רק בעסק שהמנהל הדליק בו שעון נוכחות (settings.timeclock.enabled),
   ולא כיבה את התזכורת (settings.timeclock.remindMissed !== false).
   עסק שהנוכחות שלו בקופה משאיר את השעון כבוי, ואז אין כאן כלום:
   לא כפתורי כניסה, לא לשונית שעות, ולא תזכורות.

   ורק לעובד שיש לו חשבון פעיל ושאישר בכניסה הראשונה קבלת עדכונים
   שוטפים (company_users.updates_consent_at). בלי הסכמה אין הודעה.

   ═══ מתי ═══
   ה-cron רץ כל 5 דקות. משמרת בסידור שפורסם שהתחילה לפני יותר מ-
   remindAfter דקות (ברירת מחדל 10), שעוד לא נגמרה, ושאין לעובד
   כניסה מאז שנפתח חלון הכניסה שלה. החלון לשליחה הוא 30 דקות: cron
   שהחמיץ ריצות לא ישלח בצהריים תזכורת על משמרת של הבוקר.

   כל משמרת מקבלת תזכורת אחת לכל היותר: השורה ב-punch_reminders
   נכתבת לפני השליחה, ומפתח ייחודי (עסק, עובד, תחילת משמרת) מונע
   כפילות גם כששתי ריצות חופפות.

   ═══ ערוץ ═══
   מייל (Resend) כבר עכשיו. דחיפה לאפליקציה תצטרף כשתהיה שליחת
   push מהשרת (מפתחות APNs/Firebase), ווואטסאפ עם #92. */
'use strict';

const { projectUrl } = require('./_supabase.js');
const { zonedToUtc, offsetAt } = require('./_zone.js');
const Store = require('../js/store.js');
const Model = require('../js/backend/model.js');
const Mail = require('./_mail.js');

const SEND_WINDOW_MIN = 30;
const DEFAULT_AFTER_MIN = 10;
const AFTER_CHOICES = [5, 10, 15, 30];

const COPY = {
  he: { subject: 'המשמרת שלך התחילה ב-{time} ולא נרשמה כניסה',
    hello: 'שלום {name},',
    body: 'המשמרת שלך ({shift}{branch}) התחילה היום ב-{time}, ועדיין לא נרשמה כניסה בשעון הנוכחות.',
    phone: 'אם כבר הגעת: פתח/י את האפליקציה ולחץ/י "כניסה".',
    device: 'אם כבר הגעת: החתם/י בשעון שבסניף.',
    late: 'אם יש עיכוב, עדכן/י את המנהל.', open: 'פתיחת האפליקציה',
    footer: 'נשלח מ-{company} דרך SetShifts. התזכורת נשלחת רק כשהעסק הפעיל שעון נוכחות.' },
  en: { subject: 'Your shift started at {time} and you haven’t clocked in',
    hello: 'Hi {name},',
    body: 'Your shift ({shift}{branch}) started today at {time}, and no clock-in has been recorded yet.',
    phone: 'If you’re already there, open the app and tap “Clock in”.',
    device: 'If you’re already there, clock in at the branch time clock.',
    late: 'If you’re running late, let your manager know.', open: 'Open the app',
    footer: 'Sent by {company} via SetShifts. This reminder is sent only when the business uses the time clock.' },
  ar: { subject: 'بدأت مناوبتك في {time} ولم يُسجَّل دخولك',
    hello: 'مرحبًا {name}،',
    body: 'بدأت مناوبتك ({shift}{branch}) اليوم في {time}، ولم يُسجَّل دخول في ساعة الحضور بعد.',
    phone: 'إذا وصلت بالفعل: افتح التطبيق واضغط "دخول".',
    device: 'إذا وصلت بالفعل: سجّل الدخول في ساعة الفرع.',
    late: 'إذا كنت متأخرًا، أبلغ المدير.', open: 'فتح التطبيق',
    footer: 'أُرسلت من {company} عبر SetShifts. يُرسل هذا التذكير فقط عندما يستخدم النشاط ساعة الحضور.' },
  de: { subject: 'Ihre Schicht hat um {time} begonnen, aber Sie haben sich nicht eingestempelt',
    hello: 'Hallo {name},',
    body: 'Ihre Schicht ({shift}{branch}) hat heute um {time} begonnen, und es ist noch kein Einstempeln erfasst.',
    phone: 'Wenn Sie schon da sind: App öffnen und auf „Einstempeln“ tippen.',
    device: 'Wenn Sie schon da sind: an der Stempeluhr der Filiale einstempeln.',
    late: 'Wenn Sie sich verspäten, informieren Sie bitte Ihre Führungskraft.', open: 'App öffnen',
    footer: 'Gesendet von {company} über SetShifts. Diese Erinnerung kommt nur, wenn der Betrieb die Zeiterfassung nutzt.' },
  es: { subject: 'Tu turno empezó a las {time} y no has fichado la entrada',
    hello: 'Hola {name}:',
    body: 'Tu turno ({shift}{branch}) empezó hoy a las {time} y todavía no se ha registrado la entrada.',
    phone: 'Si ya llegaste: abre la app y pulsa «Entrada».',
    device: 'Si ya llegaste: ficha en el reloj de la sucursal.',
    late: 'Si vas a llegar tarde, avisa a tu responsable.', open: 'Abrir la app',
    footer: 'Enviado por {company} a través de SetShifts. Este aviso solo se envía cuando el negocio usa el control horario.' },
  fr: { subject: 'Votre poste a commencé à {time} et votre arrivée n’est pas pointée',
    hello: 'Bonjour {name},',
    body: 'Votre poste ({shift}{branch}) a commencé aujourd’hui à {time}, et aucune arrivée n’a encore été pointée.',
    phone: 'Si vous êtes déjà sur place : ouvrez l’application et appuyez sur « Arrivée ».',
    device: 'Si vous êtes déjà sur place : pointez à la pointeuse du site.',
    late: 'En cas de retard, prévenez votre responsable.', open: 'Ouvrir l’application',
    footer: 'Envoyé par {company} via SetShifts. Ce rappel n’est envoyé que si l’entreprise utilise la pointeuse.' },
  pt: { subject: 'O seu turno começou às {time} e a entrada não foi registada',
    hello: 'Olá {name},',
    body: 'O seu turno ({shift}{branch}) começou hoje às {time} e ainda não foi registada a entrada no ponto.',
    phone: 'Se já chegou: abra a app e toque em «Entrada».',
    device: 'Se já chegou: registe a entrada no relógio da filial.',
    late: 'Se vai chegar atrasado, avise o seu gestor.', open: 'Abrir a app',
    footer: 'Enviado por {company} através da SetShifts. Este lembrete só é enviado quando o negócio usa o registo de ponto.' },
  ru: { subject: 'Ваша смена началась в {time}, а приход не отмечен',
    hello: 'Здравствуйте, {name}!',
    body: 'Ваша смена ({shift}{branch}) началась сегодня в {time}, но приход в табеле ещё не отмечен.',
    phone: 'Если вы уже на месте: откройте приложение и нажмите «Приход».',
    device: 'Если вы уже на месте: отметьтесь на терминале в филиале.',
    late: 'Если опаздываете, сообщите руководителю.', open: 'Открыть приложение',
    footer: 'Отправлено {company} через SetShifts. Напоминание приходит, только если бизнес использует учёт времени.' }
};
const RTL = { he: true, ar: true };

function fill(text, params) {
  return String(text).replace(/\{(\w+)\}/g, function (m, k) { return params[k] !== undefined ? String(params[k]) : m; });
}
function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ההגדרות של התזכורת, מנורמלות */
function reminderSettings(settings) {
  const clock = (settings && settings.timeclock) || {};
  const after = Number(clock.remindAfter);
  return {
    on: clock.enabled === true && clock.remindMissed !== false,
    after: AFTER_CHOICES.indexOf(after) !== -1 ? after : DEFAULT_AFTER_MIN,
    lang: COPY[clock.remindLang] ? clock.remindLang : 'he',
    mode: clock.mode === 'device' || clock.mode === 'both' ? clock.mode : 'phone',
    timeZone: String(clock.timeZone || 'Asia/Jerusalem'),
    leadMinutes: Store.punchWindowRule
      ? Store.punchWindowRule({ settings: settings }).leadMinutes : 120
  };
}

/* תאריך "נאיבי" של store.js (שעון הקיר של העסק, בשעון התהליך)
   לרגע אמיתי ב-UTC. */
function naiveToUtc(date, timeZone) {
  const p = function (n) { return (n < 10 ? '0' : '') + n; };
  return zonedToUtc(date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate()) +
    ' ' + p(date.getHours()) + ':' + p(date.getMinutes()), timeZone);
}

/* הלב: מי צריך תזכורת עכשיו. פונקציה טהורה, כדי שאפשר יהיה לבדוק
   אותה בלי רשת. weeks: { weekKey: { week, published } } */
function findMissed(input) {
  const state = input.state;
  const rule = input.rule;
  const now = input.now.getTime();
  const local = new Date(now + (offsetAt(now, rule.timeZone) || 0));
  const todayKey = Store.currentWeekKey(new Date(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const keys = [Store.shiftWeekKey(todayKey, -1), todayKey];
  const lead = (rule.leadMinutes || 120) * 60000;
  const out = [];

  (state.employees || []).forEach(function (emp) {
    if (!emp || emp.active === false) return;
    const punches = [];
    keys.forEach(function (key) {
      const entry = input.weeks[key];
      if (entry && entry.week) Store.punchesOf(entry.week, emp.id).forEach(function (pn) { punches.push(pn); });
    });
    keys.forEach(function (key) {
      const entry = input.weeks[key];
      /* רק סידור שפורסם: על טיוטה העובד עוד לא יודע שהוא משובץ */
      if (!entry || !entry.published || !entry.week) return;
      Store.employeeShiftTimes(state, entry.week, key, emp.id).forEach(function (shift) {
        const start = naiveToUtc(shift.start, rule.timeZone);
        const end = naiveToUtc(shift.end, rule.timeZone);
        if (!start || !end) return;
        const due = start.getTime() + rule.after * 60000;
        if (now < due || now >= due + SEND_WINDOW_MIN * 60000 || now >= end.getTime()) return;
        const clockedIn = punches.some(function (pn) {
          const at = Date.parse(pn.at);
          return pn.kind === Store.PUNCH.IN && at >= start.getTime() - lead && at <= now;
        });
        if (clockedIn) return;
        out.push({ empId: emp.id, weekKey: key, branchId: shift.branchId, shiftId: shift.shiftId,
          start: start.toISOString() });
      });
    });
  });
  return out;
}

function buildMail(input) {
  const w = COPY[input.lang] || COPY.he;
  const rtl = !!RTL[input.lang];
  const params = { name: input.name || '', time: input.time, shift: input.shift || '',
    branch: input.branch ? ', ' + input.branch : '', company: input.company || 'SetShifts' };
  const action = input.mode === 'device' ? w.device : w.phone;
  const lines = [fill(w.hello, params), fill(w.body, params), action, w.late];
  const text = lines.join('\n') + '\n\n' + input.appUrl + '\n\n' + fill(w.footer, params);
  const html = '<div dir="' + (rtl ? 'rtl' : 'ltr') + '" style="font-family:system-ui,Arial,sans-serif;' +
    'text-align:' + (rtl ? 'right' : 'left') + ';color:#1e293b;line-height:1.6">' +
    lines.map(function (l) { return '<p style="margin:0 0 10px">' + esc(l) + '</p>'; }).join('') +
    (input.mode === 'device' ? '' : '<p><a href="' + esc(input.appUrl) + '" style="display:inline-block;background:#23499f;' +
      'color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">' + esc(w.open) + '</a></p>') +
    '<p style="font-size:12px;color:#64748b">' + esc(fill(w.footer, params)) + '</p></div>';
  return { subject: fill(w.subject, params), text: text, html: html };
}

async function rest(path, options) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const opts = options || {};
  const response = await fetch(projectUrl() + '/rest/v1' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({ apikey: key, Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json' }, opts.headers || {}),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const raw = await response.text();
  let body = null;
  if (raw) { try { body = JSON.parse(raw); } catch (err) { body = { message: raw }; } }
  return { ok: response.ok, status: response.status, body: body };
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function timeIn(iso, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timeZone, hour: '2-digit', minute: '2-digit', hour12: false })
      .format(new Date(iso));
  } catch (err) { return iso.slice(11, 16); }
}

async function run(now) {
  const summary = { companies: 0, due: 0, sent: 0, skipped: 0, failed: 0 };
  const filter = encodeURIComponent(JSON.stringify({ settings: { timeclock: { enabled: true } } }));
  const configs = await rest('/company_configs?select=company_id,config&config=cs.' + filter);
  if (!configs.ok) throw new Error('could not read configs');
  const rows = configs.body || [];
  if (!rows.length) return summary;

  const ids = rows.map(function (r) { return encodeURIComponent(r.company_id); }).join(',');
  const companiesCall = await rest('/companies?id=in.(' + ids + ')&select=id,name,status,valid_until,' +
    'cancel_at_period_end,billing_subscription_id,is_demo');
  const companies = {};
  ((companiesCall.ok && companiesCall.body) || []).forEach(function (c) { companies[c.id] = c; });
  const appUrl = String(process.env.PUBLIC_BASE_URL || 'https://setshifts.com').replace(/\/+$/, '') + '/app/';

  for (const row of rows) {
    const config = row.config || {};
    const rule = reminderSettings(config.settings);
    const company = companies[row.company_id];
    if (!rule.on || !company) continue;
    /* עסק חסום (ניסיון שנגמר, מנוי שבוטל) אינו שולח לעובדים שלו */
    const access = Model.accessState({ status: company.status, validUntil: company.valid_until,
      cancelAtPeriodEnd: company.cancel_at_period_end,
      billingSubscriptionId: company.billing_subscription_id }, now);
    if (!access.allowed) continue;
    summary.companies++;

    const state = { settings: config.settings || {}, employees: config.employees || [],
      branches: config.branches || [] };
    const local = new Date(now.getTime() + (offsetAt(now.getTime(), rule.timeZone) || 0));
    const todayKey = Store.currentWeekKey(new Date(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
    const keys = [Store.shiftWeekKey(todayKey, -1), todayKey];
    const weeksCall = await rest('/company_weeks?company_id=eq.' + encodeURIComponent(row.company_id) +
      '&week_key=in.(' + keys.join(',') + ')&select=week_key,week,published');
    const weeks = {};
    ((weeksCall.ok && weeksCall.body) || []).forEach(function (w) {
      weeks[w.week_key] = { week: w.week || {}, published: !!w.published };
    });

    const missed = findMissed({ state: state, weeks: weeks, now: now, rule: rule });
    for (const item of missed) {
      summary.due++;
      const userCall = await rest('/company_users?company_id=eq.' + encodeURIComponent(row.company_id) +
        '&employee_id=eq.' + encodeURIComponent(item.empId) +
        '&active=eq.true&updates_consent_at=not.is.null&select=email,name&limit=1');
      const user = userCall.ok && userCall.body && userCall.body[0];
      if (!user || !user.email) { summary.skipped++; continue; }

      /* קודם רושמים, אחר כך שולחים: ריצה מקבילה תיתקל במפתח הקיים */
      const claim = await rest('/punch_reminders', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: [{ company_id: row.company_id, employee_id: item.empId, shift_start: item.start, channel: 'email' }]
      });
      if (!claim.ok || !Array.isArray(claim.body) || !claim.body.length) { summary.skipped++; continue; }

      const branch = (state.branches || []).filter(function (b) { return b.id === item.branchId; })[0];
      const shift = Store.shiftById(state, item.shiftId) || {};
      const emp = (state.employees || []).filter(function (e) { return e.id === item.empId; })[0] || {};
      const mail = buildMail({ lang: rule.lang, name: emp.name || user.name, time: timeIn(item.start, rule.timeZone),
        shift: shift.name || '', branch: (state.branches || []).length > 1 && branch ? branch.name : '',
        company: company.name, mode: rule.mode, appUrl: appUrl });
      const result = await Mail.send({ to: user.email, subject: mail.subject, text: mail.text, html: mail.html });
      if (result.ok) summary.sent++; else summary.failed++;
    }
  }
  return summary;
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers && req.headers.authorization) || '';
  if (!secret || auth !== 'Bearer ' + secret) return send(res, 401, { message: 'Unauthorized' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return send(res, 500, { message: 'Server is not configured' });
  }
  /* בלי מייל אין ערוץ. זו הגדרה חסרה, לא תקלה. */
  if (!Mail.ready()) return send(res, 200, { ok: true, skipped: 'mail not configured' });
  try {
    const summary = await run(new Date());
    console.log('[missed-punch]', JSON.stringify(summary));
    return send(res, 200, Object.assign({ ok: true }, summary));
  } catch (err) {
    return send(res, 500, { message: 'failed' });
  }
};

module.exports._internals = { findMissed: findMissed, buildMail: buildMail, reminderSettings: reminderSettings,
  naiveToUtc: naiveToUtc, run: run, COPY: COPY, AFTER_CHOICES: AFTER_CHOICES };
