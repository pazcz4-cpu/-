/* הלוגו של SetShifts במקום אחד.

   הקבצים עצמם יושבים ב-brand/ ונוצרים כולם מקובץ מקור יחיד
   (tools/logo.js). כאן רק מחליטים איזו גרסה להציג ואיך למצוא
   אותה – והסיבה שזה קובץ ולא שלוש שורות HTML היא שהלוגו חוזר
   בחמישה מסכים, ולוגו שמועתק חמש פעמים מתעדכן בארבע מהן.

   הנתיב נגזר מהמיקום של הקובץ הזה עצמו, ולא נכתב קשיח: המערכת
   מוגשת מ-/app/ באתר החי אבל נפתחת מהשורש בפתיחה מקומית, ונתיב
   קבוע היה נכון רק באחד מהשניים. */
(function (root) {
  'use strict';

  /* הכתובת נגזרת מהכתובת המוחלטת של הקובץ הזה, ולא ממה שכתוב
     בתגית: ב-HTML כתוב פעם "js/brand.js" ופעם "/js/brand.js",
     ופענוח ידני של השניים הוא בדיוק המקום שבו נופלים. הדפדפן
     כבר פתר את זה בשבילנו ב-script.src. */
  function base() {
    var doc = root.document;
    if (!doc) return '';
    var script = doc.currentScript ||
      doc.querySelector('script[src$="js/brand.js"], script[src$="/brand.js"]');
    if (!script) return '';
    var href = script.src || script.getAttribute('src') || '';
    return href.replace(/js\/brand\.js(\?.*)?$/, '');
  }

  /* נקבע עכשיו, בזמן שהקובץ נטען – ולא בקריאה הראשונה. אחר כך
     document.currentScript כבר מצביע על הקובץ שקרא לנו, ולא
     עלינו, וזה מייצר כתובת שאינה קיימת. */
  var prefix = base();

  /* קובץ אחד שנפתח בלי אינטרנט (dist/sidur-mishmarot.html) אינו
     יכול להצביע לתיקיית brand/: הסקריפטים בו מוטבעים, ולכן אין
     script[src] שממנו נגזר הנתיב, והתוצאה הייתה
     "brand/logo-mark-white.png" יחסית ל-dist/ — כתובת שאינה
     קיימת, כלומר לוגו שבור בכל פתיחה של הכלי המקומי.

     build-artifact.js מטביע שם את הקבצים עצמם כ-data URI ומניח
     אותם כאן. כשהמפה אינה קיימת — כלומר בכל שאר המסכים —
     שום דבר אינו משתנה. */
  function url(file) {
    var inline = root.SHIFT_BRAND_FILES;
    if (inline && inline[file]) return inline[file];
    return prefix + 'brand/' + file;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* הסמל לבדו, לכותרות שבהן השם כבר כתוב לידו בטקסט.
     variant='white' לרקע צבעוני: הלובה התחתונה של הסמל היא
     כחול־לילה, ועל כותרת כחולה היא נראית כמו כתם. */
  function markImg(alt, variant) {
    var file = variant === 'white' ? 'logo-mark-white.png' : 'logo-mark.png';
    return '<img class="brand-img" src="' + esc(url(file)) +
      '" alt="' + esc(alt || '') + '" decoding="async">';
  }

  /* הלוגו המלא: סמל ושם. לשימוש במקום שאין בו כותרת טקסט.

     שתי הגרסאות נטענות תמיד ונבחרות ב-CSS ולא ב-JavaScript: מצב
     כהה יכול להשתנות בזמן שהעמוד פתוח, ותמונה שנבחרה פעם אחת
     בטעינה הייתה נשארת שגויה עד לרענון. */
  function lockupImg(alt) {
    return '<img class="brand-img brand-img-dark" src="' + esc(url('logo-lockup.png')) +
      '" alt="' + esc(alt || 'SetShifts') + '" decoding="async">' +
      '<img class="brand-img brand-img-light" src="' + esc(url('logo-lockup-light.png')) +
      '" alt="" aria-hidden="true" decoding="async">';
  }

  /* ממלא כל מקום ב-HTML שסומן כמיועד ללוגו.
     data-brand-mark → הסמל, data-brand-lockup → הלוגו המלא. */
  function render(scope) {
    var where = scope || root.document;
    if (!where) return;
    Array.prototype.forEach.call(where.querySelectorAll('[data-brand-mark]'), function (node) {
      if (node.querySelector('img')) return;              // כבר צויר
      node.innerHTML = markImg(node.getAttribute('data-brand-alt') || '',
        node.getAttribute('data-brand-mark'));
    });
    Array.prototype.forEach.call(where.querySelectorAll('[data-brand-lockup]'), function (node) {
      if (node.querySelector('img')) return;
      node.innerHTML = lockupImg(node.getAttribute('data-brand-alt') || 'SetShifts');
    });
  }

  var API = { markImg: markImg, lockupImg: lockupImg, url: url, render: render };
  root.ShiftBrand = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
