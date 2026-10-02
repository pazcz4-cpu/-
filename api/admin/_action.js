/* פעולות על לקוח.

   חמש פעולות, וכולן דרך נקודת קצה אחת – כי כולן צריכות בדיוק
   את אותם שני דברים: אימות שהמבצע הוא בעל המוצר, ורישום ביומן.

     extend-trial   הארכת ניסיון או תקופה, במתנה
     set-plan       שינוי חבילה
     set-price      מחיר חודשי מוסכם, שגובר על המחירון
     set-status     שינוי מצב מנוי ידנית
     set-cancel     סימון או ביטול "יסתיים בסוף התקופה"
     set-free       פיילוט ללא תשלום: הדלקה (עד תאריך או בלי הגבלה) וכיבוי
     set-agent      שיוך הלקוח לסוכן, או החזרה ל"האתר" (מקור עצמאי)

   ═══ למה יש יומן ═══
   פעולה שמזיזה כסף ואינה מתועדת היא פעולה שאי אפשר להסביר
   חצי שנה אחרי. "למה החברה הזו לא חויבה בינואר" צריכה להיות
   שאלה עם תשובה, לא עם ניחוש. לכן כל פעולה נרשמת: מי, מתי,
   מה השתנה, ולמה – והסיבה היא שדה חובה.

   היומן יושב ב-billing_events, אותה טבלה שבה יושבים החיובים,
   עם מזהה שמתחיל ב-admin:. כך "כל מה שקרה ללקוח הזה" הוא שאילתה
   אחת, ולא איחוד של שתי טבלאות שצריך לזכור לעשות. */
'use strict';

const Model = require('../../js/backend/model.js');

const DAY = 864e5;
const MAX_GIFT_DAYS = 365;
/* תוקף "ללא הגבלה" של פיילוט. תאריך רחוק ולא null: כל מקום בקוד
   שקורא valid_until ממשיך לעבוד, והחשבון אינו נתפס כ"פג". */
const OPEN_ENDED = '2099-12-31T00:00:00.000Z';
const STATUSES = ['trial', 'active', 'past_due', 'canceled', 'expired'];

function laterOf(a, b) {
  const first = a ? new Date(a).getTime() : 0;
  const second = b ? new Date(b).getTime() : 0;
  return new Date(Math.max(first, second));
}

module.exports = async function ({ user, body, db }) {
  const action = String((body && body.action) || '');
  const id = String((body && body.id) || '').trim();
  const reason = String((body && body.reason) || '').trim();

  if (!id) return { status: 400, body: { message: 'Missing company id' } };
  /* סיבה אינה פורמליות: בלעדיה היומן הופך לרשימת תאריכים */
  if (reason.length < 3) {
    return { status: 400, body: { message: 'A reason is required' } };
  }

  const key = encodeURIComponent(id);
  const call = await db('/companies?id=eq.' + key + '&select=*');
  const company = call.ok && call.body && call.body[0];
  if (!company) return { status: 404, body: { message: 'Company not found' } };

  const patch = {};
  const detail = {};
  let cleanup = null;

  if (action === 'extend-trial') {
    const days = Math.floor(Number(body && body.days));
    if (!(days > 0) || days > MAX_GIFT_DAYS) {
      return { status: 400, body: { message: 'days must be between 1 and ' + MAX_GIFT_DAYS } };
    }
    /* מרחיבים מהמאוחר מבין התוקף הנוכחי והיום. הארכה של לקוח
       שפג לפני חודש צריכה לתת לו את הימים מעכשיו, לא להעלים
       שלושים מהם. */
    const from = laterOf(company.valid_until, new Date().toISOString());
    const until = new Date(from.getTime() + days * DAY).toISOString();
    patch.valid_until = until;
    patch.current_period_end = until;
    /* לקוח שפג או בפיגור חוזר להיות פעיל בתקופה שניתנה לו */
    if (company.status === 'expired' || company.status === 'past_due') {
      patch.status = company.billing_subscription_id ? 'active' : 'trial';
    }
    detail.days = days;
    detail.until = until;
    detail.from = company.valid_until;

  } else if (action === 'set-plan') {
    const plan = String((body && body.plan) || '');
    if (!Model.PLANS[plan]) return { status: 400, body: { message: 'Unknown plan' } };
    patch.plan = plan;
    detail.from = company.plan;
    detail.to = plan;

  } else if (action === 'set-wa-addon') {
    /* הדלקה וכיבוי של תוספת הוואטסאפ מהמשרד האחורי. הלקוח
       מדליק אותה בעצמו במסך המנוי; כאן זה נועד לשיחה שבה מבקשים
       ממנו לכבות, או להפעלה שסוכמה בטלפון. נרשם ביומן כמו כל
       פעולה שנוגעת בכסף. */
    const on = (body && body.on) === true;
    /* הפעלה מהמשרד האחורי אינה עוקפת את ההצהרה: בלי הצהרת אחריות
       שאושרה על ידי הלקוח, שליחה לעובדים אינה נפתחת */
    if (on && !company.wa_declaration_at) {
      return { status: 409, body: { message: 'The customer has not signed the WhatsApp responsibility declaration' } };
    }
    patch.wa_employee_addon = on;
    patch.wa_employee_addon_at = new Date().toISOString();
    detail.from = company.wa_employee_addon === true;
    detail.to = on;

  } else if (action === 'set-price') {
    /* המחיר שסוכם בפגישה. זו הדרך היחידה לחייב רשת, כי לתוכנית
       שלה אין מחירון – ולכן זו גם פעולה שמזיזה כסף אמיתי
       ונרשמת ביומן כמו כל פעולה אחרת.

       ריק או null מבטל את המחיר המוסכם וחוזר למחירון; בתוכנית
       הצעת־מחיר פירושו שהחיוב חוזר לדלג. אפס אינו מתקבל: מי
       שרוצה לתת שימוש חינם משתמש ב-set-free (פיילוט ללא תשלום),
       לא במחיר אפס שנראה בדוחות כמו לקוח משלם. */
    /* שתי צורות: סכום חודשי לכל הרשת, או תעריף לעובד פעיל.
       שתיהן נכתבות יחד ואחת מהן מתאפסת -- שורה שבה שתיהן
       מלאות היא שורה שאיש לא יידע לקרוא, ובינתיים מישהו
       יחויב לפי הלא נכונה. */
    const mode = String((body && body.mode) || 'flat');
    if (mode !== 'flat' && mode !== 'per_employee') {
      return { status: 400, body: { message: 'Unknown pricing mode: ' + mode } };
    }
    const raw = body ? body.price : null;
    let value = null;
    if (!(raw === null || raw === '' || typeof raw === 'undefined')) {
      value = Math.round(Number(raw));
      if (!isFinite(value) || value <= 0 || value > 1000000) {
        return {
          status: 400,
          body: { message: 'price must be a positive amount, or empty to clear' }
        };
      }
    }
    patch.custom_price_monthly = mode === 'flat' ? value : null;
    patch.custom_price_per_employee = mode === 'per_employee' ? value : null;

    /* ביומן נרשמת הצורה ולא רק המספר: "1450" ו-"12" הם אותו
       שדה מספרי, ובלי הצורה אי אפשר לדעת מה סוכם. */
    function priceOf(row) {
      const perEmployee = row && row.custom_price_per_employee;
      if (perEmployee !== null && typeof perEmployee !== 'undefined') {
        return { mode: 'per_employee', amount: Number(perEmployee) };
      }
      const flat = row && row.custom_price_monthly;
      if (flat !== null && typeof flat !== 'undefined') {
        return { mode: 'flat', amount: Number(flat) };
      }
      return null;
    }
    detail.from = priceOf(company);
    detail.to = value === null ? null : { mode: mode, amount: value };

  } else if (action === 'set-free') {
    /* פיילוט ללא תשלום. מי שמביא כמה עסקים לנסות את המערכת בלי
       לשלם משתמש בזה, ולא במחיר אפס: מחיר אפס נראה בדוחות כמו
       לקוח משלם שהמחיר שלו הוזן לא נכון, ופיילוט הוא החלטה
       שרוצים לראות בשמה, עם תאריך סיום אם יש.

       מדליקים: החשבון פעיל, אינו מחויב, ואינו פג עד התאריך
       שנקבע (או בלי הגבלה). מכבים: החשבון חוזר להיות לקוח רגיל
       עם מספר ימי ניסיון שנקבע כאן, ואז או מחייבים או נסגר. */
    const on = (body && body.on) === true;
    if (on) {
      let until = null;
      const rawUntil = String((body && body.until) || '').trim();
      if (rawUntil) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rawUntil)) {
          return { status: 400, body: { message: 'until must be a date (YYYY-MM-DD)' } };
        }
        /* עד סוף היום שנבחר, כמו תוקף של קופון */
        until = new Date(rawUntil + 'T23:59:59.000Z');
        if (isNaN(until.getTime()) || until.getTime() <= Date.now()) {
          return { status: 400, body: { message: 'until must be in the future' } };
        }
      }
      const end = until ? until.toISOString() : OPEN_ENDED;
      patch.free_access = true;
      patch.free_until = until ? until.toISOString() : null;
      patch.status = 'active';
      patch.valid_until = end;
      patch.current_period_end = end;
      patch.cancel_at_period_end = false;
      detail.from = { free: company.free_access === true, status: company.status,
        validUntil: company.valid_until };
      detail.to = { free: true, until: until ? until.toISOString() : null };
    } else {
      let days = Math.floor(Number(body && body.days));
      if (!isFinite(days)) days = 14;
      if (days < 0 || days > 90) {
        return { status: 400, body: { message: 'days must be between 0 and 90' } };
      }
      const end = new Date(Date.now() + days * DAY).toISOString();
      patch.free_access = false;
      patch.free_until = null;
      patch.valid_until = end;
      patch.current_period_end = end;
      patch.status = company.billing_subscription_id ? 'active' : 'trial';
      detail.from = { free: company.free_access === true, until: company.free_until || null };
      detail.to = { free: false, days: days, validUntil: end };
    }

  } else if (action === 'set-agent') {
    /* מאיפה הלקוח הגיע. הקישור קובע את זה אוטומטית בהרשמה; כאן
       מתקנים או משייכים ידנית, למשל כשסוכן הקים עסק בטלפון בלי
       קישור. ריק מחזיר ל"האתר". */
    const agentId = String((body && body.agentId) || '').trim();
    let agent = null;
    if (agentId) {
      const found = await db('/sales_agents?id=eq.' + encodeURIComponent(agentId) + '&select=id,code,name');
      agent = found.ok && found.body && found.body[0];
      if (!agent) return { status: 404, body: { message: 'Agent not found' } };
    }
    /* עמלה ששולמה כבר אינה משתנה בשקט. עמלה שעוד לא שולמה נמחקת,
       והדוח יחשב אותה מחדש לסוכן החדש. */
    const existing = await db('/agent_commissions?company_id=eq.' + key + '&select=status');
    const commission = existing.ok && existing.body && existing.body[0];
    if (commission && commission.status === 'paid' &&
        String(company.agent_id || '') !== String(agentId)) {
      return { status: 409, body: { message: 'A commission was already paid for this customer; it cannot move to another source' } };
    }
    patch.agent_id = agent ? agent.id : null;
    patch.source = agent ? 'agent' : 'direct';
    patch.referral_code = agent ? agent.code : null;
    patch.attributed_at = agent ? new Date().toISOString() : null;
    detail.from = { source: company.source || 'direct', agentId: company.agent_id || null };
    detail.to = { source: patch.source, agentId: patch.agent_id };
    if (commission && String(company.agent_id || '') !== String(agentId)) {
      cleanup = function () {
        return db('/agent_commissions?company_id=eq.' + key, { method: 'DELETE', prefer: 'return=minimal' });
      };
    }

  } else if (action === 'set-status') {
    const status = String((body && body.status) || '');
    if (STATUSES.indexOf(status) === -1) {
      return { status: 400, body: { message: 'Unknown status' } };
    }
    patch.status = status;
    detail.from = company.status;
    detail.to = status;

  } else if (action === 'set-cancel') {
    const cancel = !!(body && body.cancel);
    patch.cancel_at_period_end = cancel;
    detail.from = !!company.cancel_at_period_end;
    detail.to = cancel;

  } else {
    return { status: 400, body: { message: 'Unknown action: ' + action } };
  }

  /* היומן נכתב לפני השינוי. אם השינוי ייכשל, נשארה שורה שאומרת
     שניסינו – וזה עדיף על שינוי בלי שורה. */
  /* המזהה נושא גם את שם הפעולה וגם רכיב אקראי, ולא חותמת זמן
     בלבד: שתי פעולות על אותו לקוח באותה מילישנייה קיבלו את אותו
     מזהה, והשנייה נדחתה ככפילות והוחזרה כשגיאת שרת. */
  const entry = {
    id: 'admin:' + id + ':' + action + ':' + Date.now() + ':' +
      Math.random().toString(36).slice(2, 8),
    provider: 'admin',
    company_id: id,
    type: 'admin.' + action,
    payload: {
      by: user.email,
      reason: reason,
      at: new Date().toISOString(),
      detail: detail
    }
  };
  const logged = await db('/billing_events', {
    method: 'POST', prefer: 'return=minimal', body: [entry]
  });
  if (!logged.ok) return { status: 500, body: { message: 'Could not write the audit log' } };

  if (cleanup) await cleanup();
  const updated = await db('/companies?id=eq.' + key, { method: 'PATCH', body: patch });
  if (!updated.ok || !updated.body || !updated.body.length) {
    return { status: 500, body: { message: 'Could not update the company' } };
  }

  return { body: { ok: true, company: updated.body[0], logged: entry.id, detail: detail } };
};
