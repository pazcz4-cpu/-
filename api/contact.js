/* טופס "צור קשר" מדף המכירה.

   ═══ למה זו נקודת קצה נפרדת ═══
   קריאות השירות של לקוח קיים עוברות ב-support_tickets, מאחורי
   התחברות. כאן הפונה עוד אינו לקוח ואין לו חשבון, ולכן אין מי
   לאמת – וזו בדיוק הסיבה שהיא דורשת הגנות שאין בשאר המסלולים.

   ═══ מה מגן עליה ═══
   נקודת קצה ציבורית ששולחת דואר היא כלי ספאם בשביל מי שימצא
   אותה, ובמקרה הרע הדומיין שלנו נשרף ומיילים ללקוחות מתחילים
   ליפול לספאם. לכן:

     1. שדה פיתיון (website) שאינו מוצג לבני אדם. בוט שממלא כל
        שדה בטופס ממלא גם אותו, ואנחנו מחזירים "נשלח" בלי לשלוח –
        בוט שמקבל שגיאה מנסה שוב, בוט שמקבל הצלחה הולך הלאה.
     2. זמן מילוי מינימלי. הטופס שולח מתי הוא נטען; מילוי בפחות
        משלוש שניות אינו אדם שכתב הודעה.
     3. תקרות אורך על כל שדה, כדי שלא יידחף גוף הודעה ענק.
     4. הגבלת קצב לפי כתובת, בזיכרון המופע. זו אינה הגנה מלאה –
        Vercel מרימה כמה מופעים – אבל היא עוצרת מבול מכתובת אחת,
        ומעליה יושבת גם מכסת השליחה של Resend.

   ═══ לאן זה הולך ═══
   אל כתובת התמיכה, עם reply-to של הפונה: תשובה במייל חוזרת
   אליו ישירות ולא אלינו.

   משתני סביבה (Vercel → Settings → Environment Variables):
     RESEND_API_KEY   מפתח מ-Resend                (סודי!)
     MAIL_FROM        למשל: SetShifts <no-reply@setshifts.com>
     CONTACT_TO       לא חובה. ברירת מחדל: support@setshifts.com
*/
'use strict';

const Mail = require('./_mail.js');

const SUPPORT_EMAIL = 'support@setshifts.com';

/* תקרות אורך. גדולות מספיק להודעה אמיתית, קטנות מספיק שלא
   יהפכו את הטופס לצינור. */
const LIMITS = { name: 120, email: 200, company: 160, phone: 40, message: 4000 };

/* זמן מילוי סביר מינימלי, במילישניות */
const MIN_FILL_MS = 3000;

/* הגבלת קצב: כמה פניות מאותה כתובת בחלון הזמן */
const RATE = { max: 3, windowMs: 10 * 60 * 1000 };
const seen = new Map();

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function clean(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/* הודעה נשמרת עם שורותיה: היא נכתבה בפסקאות והיא תיקרא בפסקאות */
function cleanBody(value, max) {
  return String(value == null ? '' : value)
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/* בדיקת כתובת מכוונת ל"האם נוכל לענות", לא לתקן RFC 5322. כתובת
   שנראית תקינה ואינה קיימת תתברר כשהתשובה תחזור; כתובת בלי @
   ודאי לא תקבל תשובה, ואין טעם לקבל אותה. */
function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

function callerIp(req) {
  const forwarded = String((req.headers && req.headers['x-forwarded-for']) || '');
  return forwarded.split(',')[0].trim() ||
    String((req.headers && req.headers['x-real-ip']) || '') || 'unknown';
}

function rateLimited(ip, now) {
  /* ניקוי עצל: מנקים כל פעם שנכנסים, כדי שהמפה לא תגדל לנצח
     במופע שנשאר חם זמן רב. */
  seen.forEach((times, key) => {
    const live = times.filter((at) => now - at < RATE.windowMs);
    if (live.length) seen.set(key, live); else seen.delete(key);
  });
  const times = seen.get(ip) || [];
  if (times.length >= RATE.max) return true;
  times.push(now);
  seen.set(ip, times);
  return false;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { message: 'Method not allowed' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (err) {
    return send(res, 400, { message: 'Bad request' });
  }

  const name = clean(body.name, LIMITS.name);
  const email = clean(body.email, LIMITS.email);
  const company = clean(body.company, LIMITS.company);
  const phone = clean(body.phone, LIMITS.phone);
  const message = cleanBody(body.message, LIMITS.message);

  /* פיתיון: מוחזרת הצלחה, ולא נשלח דבר. */
  if (clean(body.website, 80)) return send(res, 200, { ok: true });

  const openedAt = Number(body.openedAt);
  const now = Date.now();
  if (isFinite(openedAt) && openedAt > 0 && now - openedAt < MIN_FILL_MS) {
    return send(res, 200, { ok: true });
  }

  /* שדות חובה. ההודעה מזהה איזה שדה חסר, כי טופס שאומר רק
     "שגיאה" גורם לאדם לנטוש ולא לתקן. */
  if (!name) return send(res, 400, { message: 'name', field: 'name' });
  if (!looksLikeEmail(email)) return send(res, 400, { message: 'email', field: 'email' });
  if (message.length < 10) return send(res, 400, { message: 'message', field: 'message' });

  if (rateLimited(callerIp(req), now)) {
    return send(res, 429, { message: 'too many requests' });
  }

  if (!Mail.ready()) {
    /* הגדרה חסרה אצלנו, לא תקלה של הפונה. המסך מציג לו את כתובת
       המייל שלנו כדי שיוכל לפנות בכל זאת. */
    return send(res, 503, { message: 'not configured' });
  }

  const to = String(process.env.CONTACT_TO || SUPPORT_EMAIL).trim();
  const lines = [
    'שם: ' + name,
    'אימייל: ' + email,
    company ? 'עסק: ' + company : null,
    phone ? 'טלפון: ' + phone : null,
    '',
    message
  ].filter((line) => line !== null);

  const result = await Mail.send({
    to: to,
    /* שם הפונה בכותרת: תיבת דואר עם עשרים פניות צריכה להיות
       ניתנת לסריקה בלי לפתוח כל אחת. */
    subject: 'פנייה מהאתר — ' + name + (company ? ' (' + company + ')' : ''),
    text: lines.join('\n'),
    html: '<div style="font-family:system-ui,sans-serif;direction:rtl;text-align:right">' +
      '<p><b>שם:</b> ' + escapeHtml(name) + '<br>' +
      '<b>אימייל:</b> ' + escapeHtml(email) +
      (company ? '<br><b>עסק:</b> ' + escapeHtml(company) : '') +
      (phone ? '<br><b>טלפון:</b> ' + escapeHtml(phone) : '') +
      '</p><hr><p style="white-space:pre-wrap">' + escapeHtml(message) + '</p></div>',
    /* תשובה חוזרת אל הפונה ולא אלינו */
    replyTo: email
  });

  if (!result.ok) return send(res, 502, { message: 'send failed' });
  return send(res, 200, { ok: true });
};

/* חשוף לבדיקות: ההגנות הן הערך של הקובץ הזה, ואי אפשר לבדוק
   אותן דרך נקודת הקצה בלי לשלוח דואר אמיתי. */
module.exports._internals = {
  LIMITS: LIMITS, MIN_FILL_MS: MIN_FILL_MS, RATE: RATE,
  clean: clean, cleanBody: cleanBody, looksLikeEmail: looksLikeEmail,
  rateLimited: rateLimited, seen: seen
};
