/* ספריית האייקונים.

   עד עכשיו הכפתורים נשאו אימוג'ים: ✨ 🔒 ⋯ 📋 ⬇ 🖨 🔔. אימוג'י
   אינו אייקון ממשק – הוא נראה אחרת בכל מערכת הפעלה (ובאנדרואיד
   לרוב צבעוני ומצויר), הוא אינו יורש את צבע הטקסט, והוא אינו
   מתיישר על קו הבסיס של המילה שלצידו.

   כאן כולם SVG בקו אחיד: אותה משיכה, אותו עיגול קצוות, ואותו
   צבע – currentColor, כך שכפתור ראשי לבן-על-כחול וכפתור רגיל
   כחול-על-לבן מקבלים את האייקון בצבע הנכון בלי שני קבצים.

   השימוש הוא <svg class="ico"><use href="#i-שם"></use></svg>,
   שנכתב ישירות ב-HTML ובמחרוזות של הציור. ה-sprite מוזרק פעם
   אחת בטעינה, ו-<use> פותר אותו חי – ולכן אין צורך לעבור על
   ה-DOM אחרי כל ציור מחדש. */
(function (root) {
  'use strict';

  /* כל הצורות מצוירות על רשת 24×24, בקו של 1.8 ובלי מילוי.
     מי שמוסיף אייקון חדש מתבקש להישאר בדיוק באותם פרמטרים –
     אייקון בודד בקו עבה יותר הוא מה שמסגיר ערכה שהורכבה
     ממקורות שונים. */
  var SHAPES = {
    /* בנה סידור אוטומטי – ניצוץ, לא מכונה */
    sparkle: '<path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z"/>' +
      '<path d="M18.5 3.5v3M20 5h-3"/>',
    /* מצב צפייה */
    lock: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/>' +
      '<path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    /* יציאה ממצב צפייה */
    unlock: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/>' +
      '<path d="M8 10.5V8a4 4 0 0 1 7.5-1.9"/>',
    /* עוד כלים */
    dots: '<circle cx="5.5" cy="12" r="1.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="18.5" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
    /* העתקה */
    copy: '<rect x="9" y="3.5" width="11.5" height="13" rx="2"/>' +
      '<path d="M15.5 16.5v2a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h2"/>',
    /* ייצוא / הורדה */
    download: '<path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/>' +
      '<path d="M4.5 17.5v1.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1.5"/>',
    /* ייבוא / העלאה */
    upload: '<path d="M12 20.5v-11"/><path d="m7.5 13.5 4.5-4.5 4.5 4.5"/>' +
      '<path d="M4.5 6.5V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1.5"/>',
    /* הדפסה */
    print: '<path d="M7 9V4.5h10V9"/>' +
      '<rect x="3.5" y="9" width="17" height="7.5" rx="2"/>' +
      '<path d="M7 14.5h10v5H7z"/>',
    /* התראות */
    bell: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9"/>' +
      '<path d="M13.7 19.5a2 2 0 0 1-3.4 0"/>',
    /* ניקוי */
    trash: '<path d="M4.5 6.5h15"/><path d="M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7"/>' +
      '<path d="M6.5 6.5 7.4 19a1.8 1.8 0 0 0 1.8 1.6h5.6a1.8 1.8 0 0 0 1.8-1.6l.9-12.5"/>',
    /* ניווט. אותה צורה לשני הכיוונים; הסיבוב נעשה ב-CSS, כדי
       שבעברית "שבוע קודם" יצביע ימינה ובאנגלית שמאלה בלי שני
       אייקונים שאפשר לשכוח לעדכן אחד מהם. */
    chevron: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
    /* אישור והפרה */
    check: '<path d="m5 12.5 4.8 4.8L19 7.5"/>',
    warn: '<path d="M12 3.8 21 19.5H3z"/><path d="M12 9.8v4.4"/>' +
      '<circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>',
    /* סגירה */
    close: '<path d="M6 6 18 18M18 6 6 18"/>',
    /* הוספה */
    plus: '<path d="M12 5.5v13M5.5 12h13"/>',
    /* אישור בתוך עיגול – שלב שהושלם באשף, ויכולת שהושלמה בדף המכירה */
    checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8.4 12.2 2.6 2.6 4.6-5"/>',
    /* הודעה נכנסת */
    mail: '<rect x="3.5" y="5" width="17" height="14" rx="2.2"/>' +
      '<path d="m4.5 7 6.4 5.1a1.8 1.8 0 0 0 2.2 0L19.5 7"/>',
    /* שאלה בלי תשובה */
    question: '<circle cx="12" cy="12" r="8.5"/>' +
      '<path d="M9.7 9.6a2.4 2.4 0 1 1 3.1 2.7c-.6.2-.8.7-.8 1.3v.4"/>' +
      '<circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none"/>',
    /* חיפוש והסבר */
    search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.6 15.6 4.4 4.4"/>',
    /* טלפון */
    phone: '<rect x="6.5" y="2.8" width="11" height="18.4" rx="2.4"/>' +
      '<path d="M10.5 18.4h3"/>',
    /* עובדים */
    users: '<circle cx="9" cy="8.5" r="3.5"/>' +
      '<path d="M3.5 20.5a5.5 5.5 0 0 1 11 0"/>' +
      '<path d="M16 5.4a3.5 3.5 0 0 1 0 6.2"/><path d="M17.5 15.6a5.5 5.5 0 0 1 3 4.9"/>',
    /* סניף */
    store: '<path d="M4 9.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V9.5"/>' +
      '<path d="M3 9.5 5 4h14l2 5.5a3 3 0 0 1-5.8 1 3 3 0 0 1-5.8 0 3 3 0 0 1-5.8-1Z"/>',
    /* משמרת / שעה */
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    /* ארבעת מצבי האילוץ. כל אחד בצורה שונה, לא רק בצבע שונה:
       מי שאינו מבחין בין ירוק לאדום צריך לדעת מה הוא סימן. */
    circleEmpty: '<circle cx="12" cy="12" r="7.5"/>',
    star: '<path d="m12 4.2 2.35 4.76 5.25.77-3.8 3.7.9 5.23L12 16.2l-4.7 2.46.9-5.23-3.8-3.7 5.25-.77z"/>',
    ban: '<circle cx="12" cy="12" r="8"/><path d="m6.6 6.6 10.8 10.8"/>',
    home: '<path d="M4 10.5 12 4l8 6.5"/>' +
      '<path d="M6 9.6V19a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V9.6"/>',
    /* ניגון */
    play: '<path d="M8.5 5.5v13l10-6.5z" fill="currentColor" stroke="none"/>',

    /* ===== הלשוניות התחתונות של האפליקציה =====
       אותה רשת 24x24 ואותו קו 1.8 כמו כל השאר. אייקון בודד
       בקו אחר הוא מה שמסגיר ערכה שהורכבה ממקורות שונים. */

    /* הסידור, והמשמרות שלי */
    calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2.2"/>' +
      '<path d="M3.5 10h17M8 3.5v4M16 3.5v4"/>',
    /* אילוצים – הגשת בקשה, כלומר כתיבה */
    edit: '<path d="M4.5 19.5h3.6l9.1-9.1a2.1 2.1 0 0 0 0-3l-.6-.6a2.1 2.1 0 0 0-3 0l-9.1 9.1z"/>' +
      '<path d="M14.2 6.6 17.4 9.8"/>',
    /* חופשה – שמש, ולא מזוודה: חופשה אינה בהכרח נסיעה */
    sun: '<circle cx="12" cy="12" r="4"/>' +
      '<path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4' +
      'M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>',
    /* בקשות שממתינות לאישור */
    inbox: '<path d="M3.5 13.5h4l1.2 2.4h6.6l1.2-2.4h4"/>' +
      '<path d="M6.2 4.5h11.6l2.7 9v4.2a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-4.2z"/>',

    /* ===== סוגי עסקים =====
       קו מתאר בלבד, באותה רשת 24x24 ובאותו קו 1.8. אלה אייקוני
       קטגוריה ולא איורים: מה שצריך מהם הוא שיזוהו בחצי שנייה
       בגודל 26 פיקסל, לא שיהיו יפים בגודל 200. */

    /* מסעדות ובתי קפה */
    utensils: '<path d="M7 3.5v7.5a2 2 0 0 0 4 0V3.5M9 11v9.5"/>' +
      '<path d="M16.5 20.5V3.5c2 .8 3 2.9 3 5.5s-1 4.2-3 4.6"/>',
    /* מרפאות ומוסדות בריאות */
    pulse: '<path d="M3.5 12h3.6l2-4.6 3 9.6 2.2-6 1.6 3h4.6"/>',
    /* שמירה ואבטחה */
    shield: '<path d="M12 3.3 19.5 6v5.6c0 4.2-2.9 7.5-7.5 9.1-4.6-1.6-7.5-4.9-7.5-9.1V6z"/>',
    /* מלונאות ואירוח */
    bed: '<path d="M3.5 19.5v-12M3.5 12.5h17v7M3.5 16h17"/>' +
      '<path d="M7.5 12.5v-2a2 2 0 0 1 2-2h7a4 4 0 0 1 4 4"/>',
    /* מוקדי שירות */
    headset: '<path d="M5 13.5v-1.7a7 7 0 0 1 14 0v1.7"/>' +
      '<rect x="3" y="13" width="4" height="6" rx="1.6"/>' +
      '<rect x="17" y="13" width="4" height="6" rx="1.6"/>' +
      '<path d="M19 19v.6a2.4 2.4 0 0 1-2.4 2.4H13"/>',
    /* ניקיון ותחזוקה */
    spray: '<rect x="7.5" y="9.5" width="8" height="11" rx="2"/>' +
      '<path d="M9.5 9.5v-4h4v4M13.5 6.5h3M18 4.2v.1M20.5 6.2v.1M18 8.7v.1M20.5 10.7v.1"/>',
    /* מפעלים וייצור */
    factory: '<path d="M3.5 20.5v-9l5.5 3.5v-3.5l5.5 3.5v-3.5l5.5 3.5v5.5z"/>' +
      '<path d="M3.5 11.5 4.6 4h3.3l.6 5"/>'
  };

  var NS = 'http://www.w3.org/2000/svg';

  function spriteHtml() {
    var parts = ['<svg xmlns="' + NS + '" class="icon-sprite" aria-hidden="true" focusable="false">'];
    Object.keys(SHAPES).forEach(function (name) {
      parts.push('<symbol id="i-' + name + '" viewBox="0 0 24 24" ' +
        'fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round">' + SHAPES[name] + '</symbol>');
    });
    parts.push('</svg>');
    return parts.join('');
  }

  /* מחרוזת לשיבוץ בתוך HTML שנבנה ב-JavaScript.
     aria-hidden תמיד: האייקון מלווה מילה, ואין לו מה להוסיף
     לקורא מסך מעבר לה. כפתור בלי מילה נושא aria-label משלו. */
  function svg(name, extraClass) {
    return '<svg class="ico' + (extraClass ? ' ' + extraClass : '') +
      '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
  }

  function has(name) { return Object.prototype.hasOwnProperty.call(SHAPES, name); }
  function names() { return Object.keys(SHAPES); }

  var injected = false;
  function inject(doc) {
    var target = doc || (typeof document !== 'undefined' ? document : null);
    if (!target || !target.body) return false;
    if (target.getElementById('shift-icon-sprite')) { injected = true; return true; }
    var holder = target.createElement('div');
    holder.id = 'shift-icon-sprite';
    holder.hidden = true;
    holder.innerHTML = spriteHtml();
    target.body.insertBefore(holder, target.body.firstChild);
    injected = true;
    return true;
  }

  if (typeof document !== 'undefined') {
    if (document.body) { inject(document); }
    else { document.addEventListener('DOMContentLoaded', function () { inject(document); }); }
  }

  var API = { svg: svg, has: has, names: names, inject: inject, spriteHtml: spriteHtml };
  root.ShiftIcons = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
