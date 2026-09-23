/* בורר השפה בעמודים המשפטיים.

   העמודים האלה אינם עוברים דרך מערכת התרגום של המערכת: מסמך משפטי
   מתורגם בלי בדיקה הוא התחייבות שאיש לא קרא. לכן יש כאן שתי גרסאות
   כתובות במלואן – עברית ואנגלית – ובורר שמחליף ביניהן. */
(function (root) {
  'use strict';

  var KEY = 'setshifts-legal-lang';
  var DIR = { he: 'rtl', en: 'ltr' };

  function stored() {
    try { return root.localStorage.getItem(KEY); } catch (err) { return null; }
  }

  function preferred() {
    var saved = stored();
    if (saved && DIR[saved]) return saved;
    /* שפת המערכת, אם הלקוח כבר בחר אחת במוצר עצמו */
    try {
      var app = root.localStorage.getItem('shift-schedule-lang');
      if (app === 'he' || app === 'en') return app;
      if (app) return 'en';   // שפה אחרת: אנגלית קרובה יותר מעברית
    } catch (err) { /* אין אחסון – ממשיכים לדפדפן */ }

    var nav = (root.navigator && (root.navigator.language ||
      (root.navigator.languages || [])[0])) || '';
    return /^he|^iw/.test(nav) ? 'he' : 'en';
  }

  function show(lang) {
    var chosen = DIR[lang] ? lang : 'en';
    var articles = document.querySelectorAll('[data-legal]');
    Array.prototype.forEach.call(articles, function (node) {
      node.hidden = node.getAttribute('data-legal') !== chosen;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-legal-lang]'),
      function (button) {
        button.classList.toggle('is-active',
          button.getAttribute('data-legal-lang') === chosen);
      });
    /* המסמך עצמו מקבל את הכיוון והשפה, כדי שהפסקאות והפיסוק ייראו נכון */
    document.documentElement.setAttribute('lang', chosen);
    document.documentElement.setAttribute('dir', DIR[chosen]);
    try { root.localStorage.setItem(KEY, chosen); } catch (err) { /* לא קריטי */ }
  }

  /* הדפסה / שמירה כ-PDF. אין כאן ספריית PDF: הדפדפן יודע לשמור
     כ-PDF בעצמו, וזה גם מה שמאפשר לשלוח את הדף בוואטסאפ. */
  document.addEventListener('click', function (event) {
    var print = event.target.closest('[data-print]');
    if (!print) return;
    event.preventDefault();
    root.print();
  });

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-legal-lang]');
    if (!button) return;
    event.preventDefault();
    show(button.getAttribute('data-legal-lang'));
  });

  show(preferred());
})(typeof window !== 'undefined' ? window : globalThis);
