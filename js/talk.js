/* כפתור "דברו איתנו" הצף.

   מודול נפרד ולא חלק מ-legal.js, מסיבה אחת: legal.js אינו
   נטען בדף הבית — והדף שבו לקוח מתלבט הכי הרבה הוא בדיוק הדף
   שבו הכפתור הכי נחוץ. */
(function (root) {
  'use strict';
  if (!root.document) return;

/* ===== כפתור "דברו איתנו" =====

   נבנה כאן ולא ב-HTML, כי הוא צריך להופיע בשמונה עמודים —
   ושמונה עותקים של אותו markup הם שמונה מקומות להתפצל בהם.

   לאן הוא מוביל: אם הוגדר מספר וואטסאפ עסקי, אליו; אחרת לעמוד
   צור קשר, שבו יש טופס אמיתי שמגיע לתיבה. אין כאן mailto:
   כברירת מחדל — לחיצה שפותחת תוכנת דואר שאינה מוגדרת היא
   לחיצה שנגמרת בכלום.

   לא מופיע בעמוד צור קשר עצמו: כפתור שמוביל לעמוד שאתה כבר
   נמצא בו הוא רעש. */
(function contactButton() {
  var here = (location.pathname || '').replace(/\/+$/, '');
  if (/\/contact$/.test(here)) return;

  var model = root.ShiftModel;

  /* לאיזה עמוד "צור קשר" — לפי השפה שהעמוד נשלח בה, ולא לפי
     עומק הנתיב. הספירה לפי הנתיב טעתה בדיוק במקום אחד: בדף
     הבית בשפה זרה (/de/) היא ראתה מקטע אחד וחישבה '../contact/',
     כלומר שלחה מבקר מגרמניה לעמוד צור קשר בעברית.

     SHIFT_PAGE_LANG קיים רק באתר הבנוי. בפתיחה מקומית של קובץ
     מהדיסק אין שפה בכתובת, ושם הנתיב היחסי הוא הנכון. */
  var lang = root.SHIFT_PAGE_LANG;
  var href;
  if (lang) {
    href = (lang === 'he' ? '/' : '/' + lang + '/') + 'contact/';
  } else {
    href = 'contact/';
    if (/\/[a-z-]+$/.test(here)) href = '../contact/';
  }
  if (model && typeof model.quoteHref === 'function' && model.WHATSAPP_NUMBER) {
    href = model.quoteHref();
  }

  /* התווית. בדף המכירה מערכת התרגום נטענת ומחליפה שפה במקום,
     ולכן היא המקור. עמודי התוכן אינם טוענים מילונים בכלל — הם
     נשלחים מתורגמים — ולכן שם התווית נחרטת בזמן הבנייה. בלי
     זה הכפתור היה אומר "צור קשר" בעברית בעמוד גרמני. */
  function label() {
    if (root.I18n) {
      try { return root.I18n.t('landing.contact'); } catch (err) { /* ממשיכים */ }
    }
    return root.SHIFT_TALK_LABEL || 'צור קשר';
  }

  var link = document.createElement('a');
  link.className = 'lp-talk';
  link.href = href;
  link.setAttribute('aria-label', label());
  if (/^https?:/.test(href)) { link.target = '_blank'; link.rel = 'noopener'; }
  link.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M20.5 11.7a8 8 0 0 1-11.6 7.1L4 20l1.3-4.7a8 8 0 1 1 15.2-3.6z"' +
    ' fill="none" stroke="currentColor" stroke-width="1.8"' +
    ' stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '<span class="lp-talk-text"></span>';
  link.querySelector('.lp-talk-text').textContent = label();
  document.body.appendChild(link);

  if (root.I18n && root.I18n.onChange) {
    root.I18n.onChange(function () {
      link.setAttribute('aria-label', label());
      link.querySelector('.lp-talk-text').textContent = label();
    });
  }
})();
})(typeof window !== 'undefined' ? window : globalThis);
