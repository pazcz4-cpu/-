/* חישובי כסף למשרד האחורי.

   הקובץ הזה טהור בכוונה: הוא מקבל מספרים ומחזיר מספרים, בלי
   רשת ובלי בסיס נתונים. כך אפשר לבדוק אותו, וכך גם ברור שאין
   מקום שני שבו מחשבים מע"מ אחרת.

   ═══ ההנחה שצריכה החלטה ═══
   המחירים בדף המכירה (199 / 399 / 599 ₪) אינם אומרים אם המע"מ
   כלול. זו אינה שאלה טכנית אלא החלטה עסקית, והיא משנה את ההכנסה
   ב-15 אחוז. כאן היא מוגדרת במקום אחד:

     PRICES_INCLUDE_VAT   ברירת מחדל true – המחיר המוצג הוא מה
                          שהלקוח משלם בפועל, והמע"מ בתוכו
     VAT_RATE             ברירת מחדל 18 – שיעור המע"מ בישראל

   מה שחשוב הוא שהמספר בדף המכירה ובחיוב בפועל יהיה אותו מספר.
   הסכום שנשלח ל-PayPlus הוא priceMonthly, כלומר מה שכתוב בדף –
   ולכן ברירת המחדל כאן היא "כלול". אם תוחלט אחרת, צריך לשנות גם
   את מה שכתוב בדף וגם את המשתנה. */
'use strict';

function vatRate() {
  const raw = Number(process.env.VAT_RATE);
  return isFinite(raw) && raw >= 0 ? raw : 18;
}

function pricesIncludeVat() {
  return process.env.PRICES_INCLUDE_VAT !== 'false';
}

/* מעגל לאגורות. חיבור של מספרים עשרוניים צובר שארית, וסכום
   שנתי שמסתיים ב-0.00000000004 נראה כמו באג – כי הוא כזה. */
function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/* מפרק סכום אחד לשלושת המספרים שרואים בדוח */
function split(amount) {
  const total = Number(amount) || 0;
  const rate = vatRate() / 100;
  if (!rate) return { gross: round(total), net: round(total), vat: 0 };
  if (pricesIncludeVat()) {
    const net = total / (1 + rate);
    return { gross: round(total), net: round(net), vat: round(total - net) };
  }
  const vat = total * rate;
  return { gross: round(total + vat), net: round(total), vat: round(vat) };
}

function sum(amounts) {
  return round((amounts || []).reduce(function (acc, value) {
    return acc + (Number(value) || 0);
  }, 0));
}

/* המפתח שלפיו מקבצים לחודשים. ISO ולא שם חודש, כדי שמיון
   אלפביתי יהיה גם מיון כרונולוגי. */
function monthKey(when) {
  return new Date(when).toISOString().slice(0, 7);
}

/* רשימת החודשים ברצף, כולל חודשים בלי הכנסה.
   חודש שנעלם מהגרף נראה כמו חודש טוב, וזו בדיוק הטעות שאסור
   לתת לדוח לעשות. */
function monthsBetween(from, to) {
  const out = [];
  const start = new Date(from);
  const end = new Date(to);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  const lastYear = end.getUTCFullYear();
  const lastMonth = end.getUTCMonth();
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    out.push(String(year) + '-' + String(month + 1).padStart(2, '0'));
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return out;
}

/* חיובים → שורה לכל חודש.
   charges: [{ at, amount, currency }] */
function byMonth(charges, from, to) {
  const buckets = {};
  (charges || []).forEach(function (charge) {
    const key = monthKey(charge.at);
    if (!buckets[key]) buckets[key] = { amounts: [], count: 0 };
    buckets[key].amounts.push(charge.amount);
    buckets[key].count++;
  });

  const keys = from && to ? monthsBetween(from, to) : Object.keys(buckets).sort();
  return keys.map(function (key) {
    const bucket = buckets[key] || { amounts: [], count: 0 };
    const total = sum(bucket.amounts);
    const parts = split(total);
    return {
      month: key, charges: bucket.count,
      gross: parts.gross, net: parts.net, vat: parts.vat
    };
  });
}

/* הכנסה חודשית חוזרת: מה צפוי להיכנס בחודש הבא מהמנויים
   שמשלמים היום. זה המספר שאומר אם העסק גדל, ולא סכום החיובים
   של החודש שעבר – שמושפע מתאריכי חידוש. */
function recurring(companies, plans) {
  const paying = (companies || []).filter(function (company) {
    return company.status === 'active' && !company.cancel_at_period_end;
  });
  const total = sum(paying.map(function (company) {
    const plan = plans[company.plan];
    return plan ? plan.priceMonthly : 0;
  }));
  const parts = split(total);
  return {
    companies: paying.length,
    gross: parts.gross, net: parts.net, vat: parts.vat
  };
}

module.exports = {
  vatRate: vatRate, pricesIncludeVat: pricesIncludeVat,
  round: round, split: split, sum: sum,
  monthKey: monthKey, monthsBetween: monthsBetween,
  byMonth: byMonth, recurring: recurring
};
