/* צאת שבת: מחושב ולא מוקלד.

   למה בקוד ולא מ-API: אותו נימוק כמו בלוח השנה (calendar.js).
   סידור משמרות נבנה גם בלי רשת, וגם לשבוע שעוד אין עליו מידע בשום
   שירות. שירות חיצוני שנופל היה משאיר משמרת מוצ״ש בלי שעת התחלה
   בדיוק ביום שבו צריך לפרסם סידור.

   מה מחושב: השעה שבה השמש נמצאת 8.5 מעלות מתחת לאופק במוצאי
   שבת. זו השיטה ש-Hebcal ושאר לוחות הזמנים המקובלים בישראל
   מפרסמים כצאת השבת ("צאת הכוכבים"), והחישוב עצמו אסטרונומי
   (נוסחאות NOAA למיקום השמש), ולכן נכון לכל שנה בלי טבלה.

   מיקום: תל אביב, לכל הארץ. מנהל אינו יכול לשנות את השעה; אם
   צריך שעה אחרת, זו החלטה של המוצר ולא של העסק.

   שעון קיץ: כללי ישראל (מאז 2013). המעבר בשישי בבוקר ובראשון
   בבוקר, ולכן מוצאי שבת תמיד נופל בצד הנכון שלו ואין צורך
   לטפל בשעת המעבר עצמה. */
(function (root) {
  'use strict';

  var LAT = 32.08088;    // תל אביב
  var LON = 34.78057;
  var SUN_DEPRESSION = 8.5;

  var RAD = Math.PI / 180;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /* יום ב-UTC כמספר ימים מאז 1970 */
  function dayNumber(year, month, day) {
    return Math.round(Date.UTC(year, month - 1, day) / 86400000);
  }

  /* היום האחרון בחודש שחל בראשון, כמספר יום */
  function lastSunday(year, month) {
    var lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    var weekday = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
    return dayNumber(year, month, lastDay - weekday);
  }

  /* הפרש מ-UTC בשעות, לפי כללי שעון הקיץ בישראל: מהשישי שלפני
     יום ראשון האחרון של מרץ, ועד יום ראשון האחרון של אוקטובר. */
  function israelOffsetHours(year, month, day) {
    var n = dayNumber(year, month, day);
    var start = lastSunday(year, 3) - 2;
    var end = lastSunday(year, 10);
    return (n >= start && n < end) ? 3 : 2;
  }

  /* מיקום השמש לרגע נתון: נטייה ומשוואת הזמן (בדקות). t הוא
     מספר ימים מאז 1970 כולל שבר, ב-UTC. */
  function sunAt(t) {
    var jd = t + 2440587.5;
    var T = (jd - 2451545.0) / 36525;
    var L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
    var M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    var e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    var Mr = M * RAD;
    var C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
      Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
      Math.sin(3 * Mr) * 0.000289;
    var trueLong = L0 + C;
    var omega = 125.04 - 1934.136 * T;
    var appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
    var obliq = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 +
      0.00256 * Math.cos(omega * RAD);
    var decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(appLong * RAD));
    var y = Math.tan(obliq * RAD / 2);
    y = y * y;
    var L0r = L0 * RAD;
    var eot = 4 / RAD * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) +
      4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
    return { decl: decl, eot: eot };
  }

  /* הרגע (דקות UTC מחצות UTC של אותו יום) שבו השמש יורדת ל-8.5
     מעלות מתחת לאופק בערב. מחושב שלוש פעמים, כל פעם על הרגע
     שיצא בפעם הקודמת, כי מיקום השמש משתנה במהלך היום. */
  function eveningMinutesUtc(dayNum) {
    var minutes = 1020 - LON * 4;   // ניחוש ראשון: שקיעה בערך בשש
    for (var i = 0; i < 3; i++) {
      var sun = sunAt(dayNum + minutes / 1440);
      var cosHa = (Math.sin(-SUN_DEPRESSION * RAD) - Math.sin(LAT * RAD) * Math.sin(sun.decl)) /
        (Math.cos(LAT * RAD) * Math.cos(sun.decl));
      if (cosHa > 1 || cosHa < -1) return null;
      var ha = Math.acos(cosHa) / RAD;
      var noon = 720 - 4 * LON - sun.eot;
      minutes = noon + 4 * ha;
    }
    return minutes;
  }

  /* צאת שבת ביום שבת נתון, בשעון ישראל, כ-"HH:MM". מעוגל כלפי מעלה
     לדקה שלמה: עדיף דקה מאוחר מדי מדקה מוקדם מדי. */
  function endOnSaturday(year, month, day) {
    var minutes = eveningMinutesUtc(dayNumber(year, month, day));
    if (minutes === null) return '';
    var local = Math.ceil(minutes - 1e-9) + israelOffsetHours(year, month, day) * 60;
    local = ((local % 1440) + 1440) % 1440;
    return pad(Math.floor(local / 60)) + ':' + pad(local % 60);
  }

  var cache = {};

  /* צאת שבת של השבוע שמתחיל ביום ראשון weekKey ("YYYY-MM-DD").
     מפתח לא תקין מחזיר מחרוזת ריקה. */
  function endForWeek(weekKey) {
    if (typeof weekKey !== 'string') return '';
    if (cache.hasOwnProperty(weekKey)) return cache[weekKey];
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekKey);
    var out = '';
    if (m) {
      var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 6));
      out = endOnSaturday(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    cache[weekKey] = out;
    return out;
  }

  var API = {
    endForWeek: endForWeek,
    endOnSaturday: endOnSaturday,
    israelOffsetHours: israelOffsetHours,
    LOCATION: { name: 'Tel Aviv', lat: LAT, lon: LON, depression: SUN_DEPRESSION }
  };

  root.ShiftShabbat = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
