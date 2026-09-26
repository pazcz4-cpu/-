/* החיוב מצד הלקוח – נקודת קצה אחת לכל הפעולות.

   למה אחת ולא שלוש: Vercel סופר כל קובץ ב-api/ כפונקציה נפרדת,
   ובתוכנית Hobby יש תקרה של 12. פתיחת מנוי, החלפת כרטיס וביטול
   הן שלוש נקודות קצה שמאחוריהן שער הרשאה זהה לחלוטין – הבעלים
   של החברה, ואיש מלבדו – ובזבוז שלוש מתוך שתים־עשרה על שער אחד
   שנכתב שלוש פעמים הוא בדיוק מה שמשאיר תכונה אמיתית בחוץ.

   הניתוב לפי op, כמו במשרד האחורי. ‏webhook ו-cron נשארים בחוץ
   בכוונה: הראשון הוא כתובת שספק התשלומים קורא לה והיא אינה
   יכולה לזוז, והשני מופעל בידי Vercel עם סוד משלו – ולשניהם
   אין את שער הבעלים שיושב כאן.

   התאימות לאחור אינה מקרית: הדפדפן שולח op, והשרת מקבל גם
   בקשה ישנה בלי op ומתייחס אליה כאל checkout. לקוח שפתוח לו
   טאב ישן באמצע רכישה אינו אמור לקבל שגיאה. */
'use strict';

const { endpoint } = require('./_shared.js');

const ROUTES = {
  checkout: require('./_checkout.js'),
  'payment-method': require('./_payment-method.js'),
  cancel: require('./_subscription.js'),
  resume: require('./_subscription.js')
};

module.exports = endpoint(async function (ctx) {
  const op = String((ctx.body && ctx.body.op) || 'checkout');
  const route = Object.prototype.hasOwnProperty.call(ROUTES, op) ? ROUTES[op] : null;
  if (!route) {
    return { status: 400, body: { message: 'Unknown op: ' + op } };
  }
  return route(ctx);
});

/* נחשף לבדיקות, כדי שאפשר יהיה לבדוק כל מסלול בנפרד */
module.exports.ROUTES = ROUTES;
