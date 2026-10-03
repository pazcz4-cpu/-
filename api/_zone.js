/* אזורי זמן בשרת. Vercel רץ ב-UTC, והעסק עובד בשעון שלו (ברירת
   מחדל: Asia/Jerusalem). משותף לשעון החומרה ולתזכורת על כניסה
   שלא נרשמה. קובץ שמתחיל בקו תחתון אינו נקודת קצה. */
'use strict';

/* המרת "2026-09-24 08:03:11" באזור זמן נתון לרגע ב-UTC.

   נעשה בשתי איטרציות ולא בנוסחה: ההיסט עצמו תלוי ברגע (שעון
   קיץ), ולכן מחשבים היסט משוער, מתקנים, ובודקים שוב. הלילה
   שבו השעון זז הוא בדיוק המקרה שבו חישוב חד-פעמי טועה בשעה. */
function zonedToUtc(localText, timeZone) {
  const match = String(localText || '').trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const parts = match.slice(1).map(function (value) { return Number(value || 0); });
  const asUtc = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    const offset = offsetAt(guess, timeZone);
    if (offset === null) return new Date(asUtc);
    guess = asUtc - offset;
  }
  return new Date(guess);
}

/* ההיסט של אזור הזמן ברגע מסוים, בדקות-מילישניות */
function offsetAt(stamp, timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const parts = {};
    formatter.formatToParts(new Date(stamp)).forEach(function (part) {
      if (part.type !== 'literal') parts[part.type] = Number(part.value);
    });
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day,
      parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second);
    return asUtc - stamp;
  } catch (err) {
    /* אזור זמן שאינו מוכר: עדיף לרשום את השעה כפי שהיא מאשר
       לזרוק דיווח. המנהל יראה סטייה ויתקן, ודיווח שנזרק
       אי אפשר לשחזר. */
    return null;
  }
}

module.exports = { zonedToUtc: zonedToUtc, offsetAt: offsetAt };
