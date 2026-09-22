/* המשרד האחורי – נקודת קצה אחת לכל הפעולות.

   למה אחת ולא חמש: Vercel סופר כל קובץ ב-api/ כפונקציה נפרדת,
   ובתוכנית Hobby יש תקרה של 12. חמש נקודות קצה למשרד האחורי
   העלו את הסכום ל-13, וכל פריסה נכשלה – כלומר האתר כולו הפסיק
   להתעדכן בגלל מסך פנימי.

   האיחוד אינו רק עקיפה של תקרה, הוא גם נכון: לכל הפעולות כאן
   אותו שער הרשאה בדיוק, ועכשיו הוא נכתב פעם אחת במקום חמש.

   הניתוב לפי השדה op, ולא action – כי action כבר תפוס במשמעות
   "איזו פעולה לבצע על הלקוח" (הארכה, שינוי חבילה), ושני שדות
   באותו שם היו בלבול שממתין לקרות. */
'use strict';

const { endpoint } = require('./_admin.js');

const ROUTES = {
  overview: require('./_overview.js'),
  companies: require('./_companies.js'),
  company: require('./_company.js'),
  action: require('./_action.js'),
  tickets: require('./_tickets.js')
};

module.exports = endpoint(async function (ctx) {
  const op = String((ctx.body && ctx.body.op) || '');
  const route = Object.prototype.hasOwnProperty.call(ROUTES, op) ? ROUTES[op] : null;
  if (!route) {
    return { status: 400, body: { message: 'Unknown op: ' + (op || '(ריק)') } };
  }
  return route(ctx);
});

/* נחשף לבדיקות, כדי שאפשר יהיה לבדוק כל מסלול בנפרד */
module.exports.ROUTES = ROUTES;
