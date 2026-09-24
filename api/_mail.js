/* שליחת דואר מהשרת שלנו.

   למה זה קיים: מייל ההזמנה של Supabase הוא תבנית שיושבת בלוח
   הבקרה שלו, והוא יודע לשלוח קישור – לא סיסמה ולא הוראות התקנה.
   המייל שהעובד מקבל הוא המפגש הראשון שלו עם המערכת, ולכן הוא
   נכתב אצלנו: מה שמו, מה הסיסמה, ואיך שמים את זה על מסך הבית.

   הספק: Resend, דרך HTTP. בלי חבילה חיצונית ובלי SMTP – פונקציה
   בת עשר שניות ב-Vercel לא אמורה לפתוח חיבור SMTP ולחכות לו.

   משתני סביבה (Vercel → Settings → Environment Variables):
     RESEND_API_KEY   מפתח מ-Resend                (סודי!)
     MAIL_FROM        למשל: SetShifts <no-reply@setshifts.com>
     MAIL_REPLY_TO    לא חובה. לאן ילכו תשובות של עובדים.
*/
'use strict';

var ENDPOINT = 'https://api.resend.com/emails';

function from() { return String(process.env.MAIL_FROM || '').trim(); }

/* האם אפשר לשלוח בכלל. בלי זה המסך אומר "לא מוגדר" במקום
   "נכשל", וזה ההבדל בין תקלה אצל הלקוח לבין הגדרה חסרה אצלנו. */
function ready() {
  return !!(String(process.env.RESEND_API_KEY || '').trim() && from());
}

/* message: { to, subject, html, text }
   מחזיר { ok, status, id, message } ולא זורק: שליחה שנכשלה היא
   תשובה, לא קריסה – החשבון של העובד כבר נוצר בשלב הזה. */
async function send(message) {
  if (!ready()) {
    return { ok: false, status: 0, reason: 'not_configured',
      message: 'Email sending is not configured' };
  }
  var body = {
    from: from(),
    to: [String(message.to || '').trim()],
    subject: String(message.subject || ''),
    html: String(message.html || ''),
    text: String(message.text || '')
  };
  /* message.replyTo גובר על ברירת המחדל: בפנייה מהאתר התשובה
     צריכה לחזור אל מי שפנה, ולא אל תיבת ברירת המחדל שלנו. */
  var replyTo = String(message.replyTo || process.env.MAIL_REPLY_TO || '').trim();
  if (replyTo) body.reply_to = replyTo;

  var response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + String(process.env.RESEND_API_KEY || '').trim(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    return { ok: false, status: 0, reason: 'network',
      message: (err && err.message) || 'network error' };
  }

  var text = await response.text();
  var parsed = null;
  if (text) { try { parsed = JSON.parse(text); } catch (err) { parsed = { message: text }; } }
  if (!response.ok) {
    return { ok: false, status: response.status, reason: 'rejected',
      message: (parsed && (parsed.message || parsed.name)) || 'Could not send the email' };
  }
  return { ok: true, status: response.status, id: (parsed && parsed.id) || null };
}

module.exports = { ready: ready, send: send, from: from };
