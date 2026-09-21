/* מתאמי ספקי תשלום.
   כל ספק מתרגם את האירוע שלו למבנה אחיד אחד, וכל שאר הקוד אינו
   יודע באיזה ספק מדובר:

     {
       id:                 מזהה האירוע אצל הספק (למניעת כפילות)
       type:               שם האירוע, לתיעוד בלבד
       subscriptionId:     מזהה המנוי אצל הספק
       customerId:         מזהה הלקוח אצל הספק
       companyId:          מזהה החברה אצלנו – רק באירוע הראשון,
                           כשהמנוי עדיין לא מקושר
       status:             trial | active | past_due | canceled | expired
       currentPeriodEnd:   ISO. עד מתי שולם, ומתי החיוב הבא
       cancelAtPeriodEnd:  בוטל אך פעיל עד סוף התקופה
       plan:               starter | growth | business
       payload:            האירוע המקורי, לתיעוד
     }

   להוספת ספק: מוסיפים כאן ערך אחד עם verify ו-parse. שום קובץ אחר
   אינו משתנה. */
'use strict';

const crypto = require('crypto');

/* השוואה בזמן קבוע – השוואת מחרוזות רגילה מדליפה מידע על החתימה */
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/* ===== ספק מדומה – לבדיקות ולסביבת פיתוח =====
   חותם ב-HMAC-SHA256 על גוף הבקשה, בדיוק כמו ספקים אמיתיים,
   כדי שנתיב האימות ייבדק באמת ולא יעקוף. */
const mock = {
  verify: function (raw, headers, secret) {
    if (!secret) return false;
    const sent = headers['x-mock-signature'] || '';
    const expected = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
    return safeEqual(sent, expected);
  },

  parse: function (body) {
    return {
      id: body.id,
      type: body.type,
      subscriptionId: body.subscription_id,
      customerId: body.customer_id,
      companyId: body.company_id,
      status: body.status,
      currentPeriodEnd: body.current_period_end,
      cancelAtPeriodEnd: body.cancel_at_period_end,
      plan: body.plan,
      payload: body
    };
  }
};

/* ===== ספקים אמיתיים =====
   מכוון: אלה עדיין לא ממומשים. כדי לכתוב אותם נכון צריך את מבנה
   האירוע המדויק של הספק ואת אופן החתימה שלו, ולנחש אותם פירושו
   קוד שנראה תקין ונכשל בייצור – דווקא בנקודה שבה עובר כסף.

   מה שצריך למלא לכל ספק:
     verify  – אלגוריתם החתימה ושם הכותרת שבה היא מגיעה
     parse   – שמות השדות באירוע, ומיפוי הסטטוסים לשלנו

   הסטטוסים שאליהם צריך למפות:
     תקופת ניסיון פעילה   → 'trial'
     חיוב ראשון עבר       → 'active'
     חיוב נכשל            → 'past_due'
     בוטל                 → 'canceled'  (או cancelAtPeriodEnd אם פעיל עד הסוף)
     פג ולא חודש          → 'expired' */
function notImplemented(name) {
  return {
    verify: function () { return false; },
    parse: function () {
      throw new Error('Billing provider "' + name + '" is not implemented yet');
    }
  };
}

module.exports = {
  mock: mock,
  paddle: notImplemented('paddle'),
  stripe: notImplemented('stripe'),
  payplus: notImplemented('payplus')
};
