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

  /* עוגן בכתובת: /faq/#en. דפי השפה באתר מקשרים לעמודי התוכן
     כך, כי אלה כתובים בעברית ובאנגלית בלבד ומי שהגיע מ-/de/
     צריך את האנגלית. עוגן ולא פרמטר שאילתה, כדי שלא ייווצר
     לאותו תוכן זוג כתובות שמנוע חיפוש יראה ככפילות. */
  function fromHash() {
    var hash = String(root.location && root.location.hash || '').replace('#', '');
    return DIR[hash] ? hash : null;
  }

  function preferred() {
    var asked = fromHash();
    if (asked) return asked;
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

  /* עמודי התוכן — מי אנחנו, איפה זה עוזר, מחירים, שאלות נפוצות
     וצור קשר — יש להם כתובת לכל שפה. בעמוד משפטי אין: הוא עברית
     ואנגלית באותה כתובת. לכן כשהמבקר עובר כאן לאנגלית, הקישורים
     צריכים להוביל אל /en/faq/ ולא אל /faq/ — אחרת לחיצה על
     קישור מתוך המסמך באנגלית מחזירה אותו לעברית.

     כל הקישורים במסמך ולא רק הלשוניות: בעמוד 404 הדרך חזרה
     יושבת בתוך הטקסט עצמו, ובגרסה האנגלית שלו היא הובילה
     לעברית — כלומר מי שהגיע לכתובת שבורה באנגלית קיבל דרך חזרה
     לשפה שהוא לא קורא.

     שתי הרשימות האלה חוזרות גם ב-tools/seo.js וגם ב-build-site.js,
     ויש בדיקה שמשווה בין שלושתן: עמוד תוכן שיתווסף שם ולא כאן
     היה שובר בשקט את ההפניה. */
  var CONTENT = ['about', 'stories', 'pricing', 'faq', 'contact'];
  var BILINGUAL = ['privacy', 'terms', 'security', 'accessibility', 'guide'];

  function retarget(lang) {
    var prefix = lang === 'he' ? '/' : '/' + lang + '/';
    var anchor = lang === 'he' ? '' : '#en';
    var links = document.querySelectorAll('a[href^="/"]');
    Array.prototype.forEach.call(links, function (link) {
      /* העוגן מוסר קודם, אחרת קישור שכבר עודכן פעם אחת
         (/privacy/#en) אינו נתפס שוב במעבר חזרה לעברית. */
      var href = String(link.getAttribute('href') || '').replace(/#.*$/, '');
      if (href === '/') { link.setAttribute('href', prefix); return; }
      var found = href.match(/^\/(?:[a-z]{2}\/)?([a-z]+)\/$/);
      if (!found) return;
      if (CONTENT.indexOf(found[1]) !== -1) {
        link.setAttribute('href', prefix + found[1] + '/');
      } else if (BILINGUAL.indexOf(found[1]) !== -1) {
        link.setAttribute('href', '/' + found[1] + '/' + anchor);
      }
    });
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
    retarget(chosen);
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

  if (root.ShiftNav) { root.ShiftNav.showCurrentTab(); }
})(typeof window !== 'undefined' ? window : globalThis);
