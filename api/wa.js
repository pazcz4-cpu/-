/* נקודת הקצה של וואטסאפ. אחת, ולא שתיים.

   תוכנית Hobby של Vercel מגבילה ל-12 פונקציות שרת, ושתי נקודות
   קצה נפרדות -- האירועים שחוזרים ממטא והסריקה אחר הרשמות
   שנטשו -- היו מביאות אותנו בדיוק לתקרה. הקוד עצמו נשאר מופרד
   בשני קבצים; מה שמאוחד הוא הדלת.

   שלושה מסלולים, וכל אחד עם ההרשאה שלו:

     GET                         אימות מול מטא. טוקן האימות.
     POST + x-hub-signature-256  אירוע ממטא. חתימת HMAC.
     POST + Bearer CRON_SECRET   סריקת נטישות. הסוד של Vercel.

   הסדר אינו שרירותי: החתימה נבדקת לפני הסוד, כי אירוע ממטא
   לעולם אינו נושא את הסוד שלנו -- ובקשה שנושאת את שניהם היא
   בקשה שמישהו הרכיב ביד. */
'use strict';

const webhook = require('./_wa-webhook.js');
const abandoned = require('./_wa-abandoned.js');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return webhook(req, res);

  if (req.method === 'POST') {
    const url = new URL(req.url, 'https://setshifts.com');
    if (url.searchParams.get('action') === 'abandoned') return abandoned(req, res);

    /* כל POST אחר הוא אירוע ממטא, וה-webhook דורש חתימה תקפה.
       אין כאן ענף "בקשה שאינה מוכרת": בקשה בלי חתימה תיפול על
       בדיקת החתימה, וזה בדיוק המקום שבו היא צריכה ליפול. */
    return webhook(req, res);
  }

  res.statusCode = 405;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify({ message: 'Method not allowed' }));
};
