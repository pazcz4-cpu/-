/* תזכורת אחת למי שהתחיל הרשמה ולא סיים.

   מה נחשב "נטישה": חברה שנפתחה, עברו עליה כמה שעות, ועדיין אין
   לה אמצעי תשלום. היא בתקופת ניסיון, יש לה טלפון שהוזן בטופס,
   והיא לא חזרה.

   שלוש שעות ולא יממה: מי שיצא באמצע חוזר באותו ערב או לא חוזר
   בכלל. תזכורת שמגיעה מחר בבוקר פוגשת אדם שכבר בחר מוצר אחר.

   מה שחשוב כאן יותר מהכול:

   1. הודעה אחת. לעולם. האילוץ הייחודי על (company_id, template)
      הוא מה שאוכף את זה -- לא בדיקה בקוד, שיכולה לרוץ פעמיים
      במקביל. השורה נכתבת לפני השליחה: מוטב שלא תישלח הודעה
      מאשר שתישלח פעמיים.

   2. הסכמה. הודעה פרסומית לטלפון בלי הסכמה היא עד 1,000 ש"ח
      להודעה בלי הוכחת נזק. מי שלא סימן -- לא מקבל, גם אם
      הטלפון שלו יושב אצלנו.

   3. הסרה גוברת על הסכמה. מי שביקש להסיר לא מקבל, גם אם הסימון
      עדיין רשום עליו.

   משתני סביבה:
     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
     WHATSAPP_TOKEN, WHATSAPP_PHONE_ID
     CRON_SECRET                Vercel שולח אותו בכותרת
     WA_ABANDONED_TEMPLATE      שם התבנית. ברירת מחדל: signup_abandoned_he
     WA_ABANDONED_COUPON        קוד הקופון שמוצע. לא חובה.
     WA_ABANDONED_AFTER_HOURS   ברירת מחדל: 3
*/
'use strict';

const { projectUrl } = require('./_supabase.js');
const wa = require('./_whatsapp.js');

const TEMPLATE_DEFAULT = 'signup_abandoned_he';
const AFTER_HOURS_DEFAULT = 3;
/* מעבר ליומיים זה כבר לא "נשאר לך שלב אחד" אלא פנייה קרה */
const WINDOW_DAYS = 2;
const MAX_PER_RUN = 100;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function db(path, options) {
  const opts = options || {};
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(projectUrl() + '/rest/v1' + path, {
    method: opts.method || 'GET',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation'
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const text = await response.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch (err) { body = { message: text }; } }
  return { ok: response.ok, status: response.status, body: body };
}

function templateName() {
  return String(process.env.WA_ABANDONED_TEMPLATE || '').trim() || TEMPLATE_DEFAULT;
}

function afterHours() {
  const hours = Number(process.env.WA_ABANDONED_AFTER_HOURS);
  return hours > 0 ? hours : AFTER_HOURS_DEFAULT;
}

/* תופסים את הזכות לשלוח. true = שלנו, false = כבר נשלח.

   הרישום קודם לשליחה בכוונה: אם השורה נכתבה ומטא נפלה, הלקוח
   לא יקבל הודעה -- וזה עדיף על פני שתי הודעות זהות אצל אדם
   שכבר מתלבט אם אנחנו מטרידים אותו. */
async function claim(company, template) {
  const result = await db('/wa_messages', {
    method: 'POST', prefer: 'return=minimal',
    body: [{
      company_id: company.id, template: template,
      to_phone: company.phone || '', status: 'claimed'
    }]
  });
  if (result.ok) return true;
  const duplicate = result.status === 409 ||
    (result.body && String(result.body.code) === '23505');
  if (duplicate) return false;
  throw new Error('could not claim: ' + result.status);
}

async function record(company, template, patch) {
  return db('/wa_messages?company_id=eq.' + encodeURIComponent(company.id) +
    '&template=eq.' + encodeURIComponent(template), {
    method: 'PATCH', prefer: 'return=minimal', body: patch
  });
}

/* מה הקופון נותן, במילים.

   {{2}} בתבנית יושב במשפט "ושמרנו לך ___", ולכן הוא חייב לתאר
   הטבה ולא להיות קוד. קודם נכנס שם הקוד עצמו, והלקוח היה מקבל
   "ושמרנו לך EXTRAMONTH" -- משפט שאינו שבור אבל נקרא כמו
   תקלה, בהודעה הראשונה שהוא מקבל מאיתנו.

   הכללים כאן הם אותם כללים של couponEffect במודל: ימים
   מאריכים תוקף, אחוז וסכום מוזילים חיוב אחד. */
function benefitText(row) {
  const value = Math.round(Number(row && row.value) || 0);
  if (!(value > 0)) return 'הטבה';
  if (row.kind === 'days') return 'עוד ' + value + ' ימי ניסיון';
  if (row.kind === 'percent') return value + '% הנחה על החיוב הראשון';
  if (row.kind === 'amount') return value + '₪ הנחה על החיוב הראשון';
  return 'הטבה';
}

/* הקופון עצמו, כדי לדעת מה הוא נותן. נקרא פעם אחת לריצה ולא
   פעם ללקוח: אותו קוד נשלח לכולם. */
async function couponRow(code) {
  if (!code) return null;
  const call = await db('/coupons?code=eq.' + encodeURIComponent(code) +
    '&select=code,kind,value&limit=1');
  return (call.ok && (call.body || [])[0]) || null;
}

/* מה נכנס לתבנית. הסדר הוא {{1}}..{{4}} כפי שהיא אושרה אצל
   מטא, ולכן הוא נקבע כאן ולא אצל הקורא. */
function values(company, coupon, benefit) {
  const until = new Date(Date.now() + 7 * 864e5);
  return [
    String(company.name || '').slice(0, 60),
    benefit || 'הטבה',
    coupon ? String(coupon) : '',
    until.getDate() + '.' + (until.getMonth() + 1)
  ];
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (!secret || auth !== 'Bearer ' + secret) {
    return send(res, 401, { message: 'Unauthorized' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return send(res, 500, { message: 'Server is not configured' });
  }
  /* בלי הגדרת וואטסאפ אין תקלה -- יש תכונה שלא הופעלה. הקרון
     מדווח על כך ואינו נופל. */
  if (!wa.ready()) {
    return send(res, 200, { ok: true, skipped: 'whatsapp-not-configured', sent: 0 });
  }

  const now = Date.now();
  const olderThan = new Date(now - afterHours() * 36e5).toISOString();
  const newerThan = new Date(now - WINDOW_DAYS * 864e5).toISOString();
  const template = templateName();
  const coupon = String(process.env.WA_ABANDONED_COUPON || '').trim();
  const benefit = benefitText(await couponRow(coupon));

  /* הסינון כולו בשאילתה, ולא בקוד: חברה שאינה עומדת בתנאי אינה
     אמורה לצאת מבסיס הנתונים בכלל. שורה עם טלפון של לקוח שלא
     הסכים לדיוור היא שורה שעדיף שלא תעבור כאן. */
  const due = await db('/companies' +
    '?status=eq.trial' +
    '&billing_subscription_id=is.null' +
    '&wa_opt_in=is.true' +
    '&wa_opt_out_at=is.null' +
    '&phone=not.is.null' +
    '&created_at=lt.' + encodeURIComponent(olderThan) +
    '&created_at=gt.' + encodeURIComponent(newerThan) +
    '&select=id,name,phone,created_at' +
    '&order=created_at.asc&limit=' + MAX_PER_RUN);

  if (!due.ok) return send(res, 500, { message: 'Could not read companies' });

  const results = [];
  for (const company of due.body || []) {
    let mine;
    try { mine = await claim(company, template); }
    catch (err) {
      results.push({ company: company.id, action: 'error', reason: err.message });
      continue;
    }
    if (!mine) continue;   // כבר נשלח פעם אחת. זה לא אירוע.

    /* בלי urlValues: הכפתור בתבנית מצביע על כתובת קבועה.

       זה אינו ניקוי אלא תיקון -- רכיב button שנשלח לתבנית שאין
       בכפתור שלה משתנה מוחזר מ-132000, כלומר אף הודעה לא
       הייתה יוצאת בכלל. */
    const answer = await wa.sendTemplate({
      to: company.phone,
      template: template,
      language: 'he',
      values: values(company, coupon, benefit)
    });

    if (answer.ok) {
      await record(company, template, { status: 'sent', wa_id: answer.id });
      results.push({ company: company.id, action: 'sent' });
    } else {
      /* הכישלון נשאר רשום ואינו נמחק: מחיקת השורה הייתה פותחת
         את הדלת לניסיון חוזר בכל ריצה, ולקוח שמספרו שגוי היה
         מייצר ניסיון כושל כל יום לנצח. */
      await record(company, template, {
        status: 'failed',
        error: String(answer.code || answer.reason || '') + ' ' + (answer.message || '')
      });
      results.push({ company: company.id, action: 'failed', reason: answer.reason });
    }
  }

  return send(res, 200, {
    ok: true,
    checked: (due.body || []).length,
    sent: results.filter((row) => row.action === 'sent').length,
    results: results
  });
};
