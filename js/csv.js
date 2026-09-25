/* כתיבת CSV לייצוא.

   למה מודול נפרד ולא שלוש שורות בתוך הייצוא: הקובץ הזה נוסע
   אל מערכת השכר של הלקוח, ושם אין מי שיתקן אותו ביד. שלושה
   דברים שוברים אותו בשקט, וכולם מטופלים כאן פעם אחת:

     · עברית בלי BOM. אקסל בווינדוס קורא קובץ UTF-8 בלי סימן
       פתיחה כ-Windows-1255, והשמות מגיעים כג׳יבריש. הקובץ
       נפתח, נראה תקין למי שמסתכל על המספרים, והשמות הרוסים.
     · פסיק בתוך שם. "כהן, דוד" בלי מרכאות הופך לשני טורים,
       וכל השורה זזה.
     · מספר שמתחיל באפס. מספר עובד "0417" נקרא באקסל כ-417,
       ומערכת השכר לא מוצאת אותו. */
(function (root) {
  'use strict';

  var BOM = '﻿';

  /* תא בודד. מצטט רק כשצריך – קובץ מצוטט לגמרי קריא פחות למי
     שפותח אותו בעורך טקסט כדי לבדוק. */
  function cell(value, separator) {
    var text = value === null || value === undefined ? '' : String(value);
    var needsQuote = text.indexOf(separator) !== -1 ||
      text.indexOf('"') !== -1 || /[\r\n]/.test(text);
    if (!needsQuote) return text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  /* rows = מערך של מערכי תאים. options.separator ברירת מחדל ','
     options.bom = false מבטל את סימן הפתיחה, למי שמייבא בכלי
     שדווקא נחנק ממנו. */
  function build(rows, options) {
    var opts = options || {};
    var separator = opts.separator || ',';
    var text = (rows || []).map(function (row) {
      return (row || []).map(function (value) {
        return cell(value, separator);
      }).join(separator);
    }).join('\r\n');
    /* CRLF ולא LF: זה מה שמערכות ווינדוס מצפות לו, ומערכות
       יוניקס קוראות את שניהם. */
    if (text) text += '\r\n';
    return (opts.bom === false ? '' : BOM) + text;
  }

  /* מספר שחייב להישמר כמחרוזת גם באקסל. מספר עובד "0417"
     שנקרא כ-417 הוא שורה שמערכת השכר לא תמצא לה בעלים.

     ="0417" הוא הנוסח שאקסל, גוגל שיטס וליברה אופיס מכבדים.
     ערך ריק נשאר ריק: ="" הוא תא שנראה תקין ואינו. */
  function asText(value) {
    var text = value === null || value === undefined ? '' : String(value);
    if (!text) return '';
    return '="' + text.replace(/"/g, '""') + '"';
  }

  var API = { build: build, cell: cell, asText: asText, BOM: BOM };
  root.ShiftCsv = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
