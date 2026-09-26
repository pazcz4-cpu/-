/* שליחת וואטסאפ מהשרת שלנו, דרך ה-Cloud API של מטא.

   למה זה קיים: לקוח שמתחיל הרשמה ולא מסיים אינו חוזר מעצמו.
   מייל אליו נבלע, והוא ממילא לא אישר לנו כלום מלבד הטלפון
   שהזין בטופס. הודעת וואטסאפ אחת, על אותו מספר שהוא כתב, היא
   ההבדל בין לקוח שנעלם לבין לקוח שחוזר לסיים.

   מה שחשוב להבין לפני שנוגעים כאן:

   1. מחוץ לחלון של 24 שעות מאז ההודעה האחרונה של הלקוח מותר
      לשלוח **רק תבנית שאושרה מראש** אצל מטא. טקסט חופשי נדחה
      בקוד 131047. לכן אין כאן פונקציה ששולחת טקסט חופשי בלי
      חלון -- היא הייתה נראית עובדת בפיתוח ונופלת אצל לקוח.

   2. תבנית שיווקית מחייבת הסכמה. זו אינה החלטה שלנו אלא חוק:
      הודעה פרסומית לטלפון היא "דבר פרסומת" לפי סעיף 30א לחוק
      התקשורת, והפיצוי הוא עד 1,000 ש"ח להודעה בלי הוכחת נזק.
      מי שקורא לפונקציה הזו אחראי לבדוק את ההסכמה -- הבדיקה
      עצמה יושבת ב-_consent.js, ליד הנתונים.

   3. הטוקן הוא של System User ותקף לנצח. הטוקן שמופיע במסך
      API Setup של מטא תקף 24 שעות, והוא בדיוק סוג הדבר שעובד
      יום אחד ונופל בשני.

   משתני סביבה (Vercel -> Settings -> Environment Variables):
     WHATSAPP_TOKEN        טוקן קבוע של System User      (סודי!)
     WHATSAPP_PHONE_ID     Phone number ID ממסך API Setup
     WHATSAPP_API_VERSION  לא חובה. ברירת מחדל: v21.0
*/
'use strict';

var DEFAULT_VERSION = 'v21.0';

function token() { return String(process.env.WHATSAPP_TOKEN || '').trim(); }
function phoneId() { return String(process.env.WHATSAPP_PHONE_ID || '').trim(); }
function version() {
  return String(process.env.WHATSAPP_API_VERSION || '').trim() || DEFAULT_VERSION;
}

/* האם אפשר לשלוח בכלל. בלי זה המסך אומר "לא מוגדר" במקום
   "נכשל", וזה ההבדל בין תקלה אצל הלקוח לבין הגדרה חסרה אצלנו. */
function ready() {
  return !!(token() && phoneId());
}

/* המספר כפי שמטא רוצה אותו: ספרות בלבד, בפורמט בינלאומי.

   ברירת המחדל לישראל אינה שרירותית -- הלקוחות הראשונים כותבים
   "054-1234567", וזה מספר ישראלי תקין שאין בו שום סימן לכך.
   מספר שכבר בא עם קידומת מדינה (+49, 00972) נשאר כפי שהוא.

   מחזיר מחרוזת ריקה כשאי אפשר להסיק -- ואז לא שולחים. ניחוש
   של קידומת מדינה פירושו הודעה שנוסעת לאדם אחר לגמרי. */
function toWaNumber(input, defaultCountry) {
  var raw = String(input == null ? '' : input).trim();
  if (!raw) return '';
  var plus = raw.charAt(0) === '+';
  var digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  /* 00 בתחילת מספר הוא קידומת חיוג בינלאומי באירופה וברוב
     העולם, והיא אינה חלק מהמספר עצמו. */
  if (digits.slice(0, 2) === '00') digits = digits.slice(2);
  else if (plus) { /* כבר בינלאומי */ }
  else {
    var country = String(defaultCountry || '972').replace(/\D/g, '');
    /* מספר מקומי מתחיל באפס, ובפורמט בינלאומי האפס יורד */
    if (digits.charAt(0) === '0') digits = country + digits.slice(1);
    else if (digits.slice(0, country.length) !== country) digits = country + digits;
  }
  if (digits.length < 8 || digits.length > 15) return '';
  return digits;
}

/* בניית גוף הבקשה לתבנית.

   components נבנה מרשימה שטוחה של ערכים, כי זו הצורה שבה
   התבנית נראית אצל מי שכתב אותה: {{1}}, {{2}}, {{3}}. מבנה
   מקונן היה מכריח כל קורא לזכור את הסכימה של מטא. */
function templateBody(to, template, language, values, urlValues) {
  var components = [];
  var body = (values || []).map(function (value) {
    return { type: 'text', text: String(value == null ? '' : value) };
  });
  if (body.length) components.push({ type: 'body', parameters: body });

  /* כפתור עם משתנה בכתובת. אצל מטא זה רכיב נפרד עם index,
     ולא עוד פרמטר בגוף -- וזו טעות שמחזירה 132000. */
  (urlValues || []).forEach(function (value, index) {
    components.push({
      type: 'button', sub_type: 'url', index: String(index),
      parameters: [{ type: 'text', text: String(value == null ? '' : value) }]
    });
  });

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'template',
    template: {
      name: String(template),
      language: { code: String(language || 'he') },
      components: components
    }
  };
}

/* שליחה. מחזיר { ok, status, id, reason, message } ואינו זורק:
   הודעה שלא נשלחה אינה סיבה להפיל את הקרון שקורא לה, והלקוח
   הבא בתור צריך לקבל את שלו.

   input: { to, template, language, values, urlValues, country } */
async function sendTemplate(input) {
  if (!ready()) {
    return { ok: false, status: 0, reason: 'not_configured',
      message: 'WhatsApp sending is not configured' };
  }
  var to = toWaNumber(input && input.to, input && input.country);
  if (!to) {
    return { ok: false, status: 0, reason: 'bad_number',
      message: 'The phone number cannot be used' };
  }
  if (!(input && input.template)) {
    return { ok: false, status: 0, reason: 'no_template',
      message: 'A template name is required' };
  }

  var url = 'https://graph.facebook.com/' + version() + '/' + phoneId() + '/messages';
  var response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(templateBody(to, input.template, input.language,
        input.values, input.urlValues))
    });
  } catch (err) {
    return { ok: false, status: 0, reason: 'network',
      message: (err && err.message) || 'network error' };
  }

  var text = await response.text();
  var parsed = null;
  if (text) { try { parsed = JSON.parse(text); } catch (err) { parsed = { message: text }; } }

  if (!response.ok) {
    var error = (parsed && parsed.error) || {};
    return {
      ok: false, status: response.status, reason: 'rejected',
      /* הקוד של מטא נשמר כפי שהוא: הוא מה שמבדיל בין "המספר
         אינו ברשימת הבדיקה" (131030) לבין "התבנית אינה קיימת
         בשפה הזו" (132001), ובלעדיו כל כישלון נראה אותו דבר. */
      code: error.code == null ? null : Number(error.code),
      message: error.message || 'Could not send the message'
    };
  }

  var sent = (parsed && parsed.messages && parsed.messages[0]) || {};
  return { ok: true, status: response.status, id: sent.id || null, to: to };
}

module.exports = {
  ready: ready,
  sendTemplate: sendTemplate,
  toWaNumber: toWaNumber,
  templateBody: templateBody
};
