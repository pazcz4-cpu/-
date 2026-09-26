/* כמה עובדים מחייבים עליהם.

   כלל אחד, וקובץ משלו, כי שני צדדים שואלים אותו: מנוע החיוב
   כששולח את הסכום לספק, והמשרד האחורי כשמציג ללקוח מה ייגבה
   ממנו. שני הצדדים האלה חייבים לומר אותו מספר -- לקוח שרואה
   מספר אחד ומחויב על אחר הוא שיחת טלפון שאי אפשר לנצח בה.

   הכלל: לא כמה עובדים יש עכשיו, אלא כמה היו לכל היותר מאז
   החיוב הקודם.

   הסיבה היא שתאריך החיוב ידוע ללקוח -- הוא מופיע לו על מסך
   המנוי. ספירה ברגע החיוב היא ספירה שאפשר לתזמן סביבה: רשת
   שמכבה תשעים מתוך מאה עובדים ליום אחד (מתג, לא מחיקה, ואף
   נתון אינו אובד) הייתה משלמת עשירית על חודש מלא, כי חיוב
   שמצליח דוחף את התקופה חודש קדימה ואין ריצה שתתקן.

   מול השיא נלקח גם המספר הנוכחי, כחגורה שנייה: אם השיא חסר
   מסיבה כלשהי, לא נגבה פחות ממה שיש בפועל.

   null פירושו "אין מספר", ולא אפס. אפס הוא טענה שאין עובדים,
   ומי שיחייב לפיה יגבה אפס מלקוח אמיתי. */
'use strict';

/* עמודה ריקה אינה אפס.

   Number(null) הוא 0, ו-Number('') הוא 0 -- ולכן המרה ישירה
   הייתה הופכת "לא נמדד" ל"אין עובדים", כלומר בדיוק לטענה
   שהקובץ הזה קיים כדי לא להשמיע. */
function count(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return isFinite(number) && number >= 0 ? number : null;
}

function billable(company) {
  const known = [company && company.employee_peak, company && company.employee_count]
    .map(count)
    .filter(function (value) { return value !== null; });
  if (!known.length) return null;
  return Math.max.apply(null, known);
}

/* כמה יש כרגע, בנפרד מהשיא. המשרד האחורי מציג את שניהם:
   הפער ביניהם הוא כל הסיפור של מי שניסה להתרוקן לפני החיוב. */
function current(company) {
  return count(company && company.employee_count);
}

module.exports = { billable: billable, current: current };
