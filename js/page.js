/* עמודי התוכן: מי אנחנו, איפה זה עוזר, מחירים, שאלות נפוצות
   וצור קשר.

   בעמודים האלה אין החלפת שפה במקום. לכל שפה יש כתובת משלה
   (/de/faq/), והטקסט כבר בתוך הקובץ שנשלח — אחרת סורק שמגיע
   לשם רואה עברית, כלומר שבע השפות אינן קיימות מבחינתו. לכן כל
   מה שכאן הוא ניווט, ולא תרגום.

   שלושה דברים בלבד:
   1. בורר השפה עובר לעמוד המקביל בשפה שנבחרה.
   2. קישור ישן עם עוגן שפה (/faq/#en) מגיע לכתובת הנכונה.
   3. הלשונית של העמוד הנוכחי נראית גם בטלפון. */
(function (root) {
  'use strict';

  var doc = root.document;
  var Nav = root.ShiftNav;
  /* אותו מפתח שהמערכת עצמה משתמשת בו, כדי שמי שבחר שפה כאן
     ייכנס אליה גם באפליקציה */
  var STORAGE_KEY = 'shift-schedule-lang';
  var picker = doc.getElementById('page-language');

  function remember(code) {
    try { if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, code); }
    catch (err) { /* דפדפן בלי אחסון – הבחירה פשוט לא נזכרת */ }
  }

  function optionFor(code) {
    if (!picker) return null;
    return Array.prototype.slice.call(picker.options).filter(function (option) {
      return option.getAttribute('data-lang') === code;
    })[0] || null;
  }

  function goTo(option) {
    /* העמוד שאנחנו כבר בו: אין מה לטעון מחדש */
    if (option.value === root.location.pathname) return;
    remember(option.getAttribute('data-lang'));
    root.location.href = option.value;
  }

  /* ===== 1. בורר השפה ===== */

  if (Nav) { Nav.bindLanguagePicker(picker, goTo); }

  /* ===== 2. עוגן שפה מקישור ישן =====

     עד שלעמודי התוכן הייתה כתובת אחת לשתי שפות, דפי השפה קישרו
     אליהם כ-/faq/#en. הקישורים האלה שותפו ונשמרו, ומי שלוחץ
     עליהם היום היה מקבל את העברית בלי הסבר. העמודים המשפטיים
     ממשיכים לעבוד כך — שם העוגן עדיין מחליף שפה בתוך העמוד —
     ולכן ההפניה כאן חלה רק על עמודי התוכן. */
  (function fromHash() {
    var hash = String(root.location && root.location.hash || '').replace('#', '');
    if (!hash) return;
    var option = optionFor(hash);
    /* העוגן מצביע על השפה שהעמוד כבר בה: אין לאן להפנות, ואין
       טעם להשאיר עוגן שיחזור בכל טעינה. */
    if (!option || option.selected) return;
    remember(hash);
    root.location.replace(option.value);
  })();

  /* ===== 3. הלשונית הנוכחית ===== */

  if (Nav) { Nav.showCurrentTab(); }
})(typeof window !== 'undefined' ? window : globalThis);
