/* חישובי סוכנים: טהורים, בלי רשת ובלי בסיס נתונים.

   מתי לקוח "הגיע ליעד": כשהוא שילם את החיוב ה-N בפועל, כשה-N הוא
   qualify_charges של הסוכן (ברירת מחדל 3). נספרים רק חיובים שעברו
   וגבו סכום גדול מאפס. חודש הניסיון בחינם אינו חיוב, ולכן אינו
   נספר; פיילוט ללא תשלום לעולם אינו מגיע ליעד כי אין בו חיובים.

   למה חיובים ולא "שלושה חודשים מההרשמה": סוכן מקבל עמלה על לקוח
   שבאמת שילם שלוש פעמים, לא על לקוח שעבר שלושה חודשים בלי
   לשלם. זה גם מה שנראה בדוחות הכסף, ולכן אפשר לבדוק את זה. */
'use strict';

const Money = require('./_money.js');

/* חיובים שעברו, בסדר כרונולוגי. events הם שורות billing_events. */
function paidCharges(events) {
  return (events || [])
    .filter(function (row) {
      return row && row.payload && row.payload.outcome === 'charged' &&
        (Number(row.payload.amount) || 0) > 0;
    })
    .map(function (row) {
      return {
        at: (row.payload && row.payload.at) || row.received_at,
        amount: Number(row.payload.amount) || 0
      };
    })
    .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
}

/* מתי הגיע ליעד, או null אם עוד לא */
function qualifiedAt(charges, needed) {
  const n = Math.max(1, Number(needed) || 3);
  return charges.length >= n ? charges[n - 1].at : null;
}

function monthOf(iso) { return Money.monthKey(iso); }

/* החודש הבא בפורמט YYYY-MM */
function nextMonth(key) {
  const parts = String(key).split('-');
  let year = Number(parts[0]);
  let month = Number(parts[1]) + 1;
  if (month > 12) { month = 1; year++; }
  return String(year) + '-' + String(month).padStart(2, '0');
}

module.exports = {
  paidCharges: paidCharges, qualifiedAt: qualifiedAt,
  monthOf: monthOf, nextMonth: nextMonth
};
