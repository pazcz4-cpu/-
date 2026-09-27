/* שני חלקים משותפים בשורת הניווט של האתר: הלשונית הנוכחית ובורר
   השפה. שניהם מופיעים בדף המכירה, בעמודי התוכן ובעמודים
   המשפטיים, וכל אחד מהם היה עותק נפרד באחד מהקבצים האלה — כלומר
   שלושה מקומות להתפצל בהם. */
(function (root) {
  'use strict';

  var doc = root.document;

  /* שורת הלשוניות נגללת לרוחב בטלפון, והלשונית של העמוד הנוכחי
     יכולה להתחיל מחוץ למסך — כך שהמבקר אינו רואה איפה הוא נמצא.
     inline בלבד: block היה מגלגל גם את העמוד עצמו כלפי מטה. */
  function showCurrentTab() {
    var current = doc && doc.querySelector('.lp-tabs a[aria-current="page"]');
    if (!current || !current.scrollIntoView) return;
    try { current.scrollIntoView({ inline: 'center', block: 'nearest' }); }
    catch (err) { /* דפדפן ישן – הלשונית פשוט נשארת במקומה */ }
  }

  /* בורר שפה שפעולתו היא מעבר — לעמוד אחר או להחלפת כל הטקסטים.

     החיבור אינו ל-change בלבד, וזו לא קפדנות: ב-select סגור,
     לחיצה על חץ מטה מחליפה את הבחירה ומפעילה change מיד. כלומר
     מי שגולש במקלדת היה מועבר לערבית ברגע שניסה לרדת ברשימה,
     לפני שהגיע לשפה שרצה.

     לכן מקלדת נספרת בנפרד: חצים מסמנים שהמשתמש עוד מדפדף,
     והמעבר קורה ב-Enter, ב-Tab או ביציאה מהשדה. עכבר ומגע לא
     נוגעים בחצים, ואצלם change הוא הבחירה עצמה. */
  function bindLanguagePicker(select, go) {
    if (!select || typeof go !== 'function') return;
    var browsing = false;

    function commit() {
      var option = select.options[select.selectedIndex];
      browsing = false;
      if (option) go(option);
    }

    select.addEventListener('keydown', function (event) {
      var key = event.key || '';
      if (/^(Arrow|Home|End|Page)/.test(key)) { browsing = true; return; }
      if (key === 'Enter' || key === 'Tab') commit();
    });
    select.addEventListener('change', function () { if (!browsing) commit(); });
    select.addEventListener('blur', function () { if (browsing) commit(); });
  }

  var API = { showCurrentTab: showCurrentTab, bindLanguagePicker: bindLanguagePicker };
  root.ShiftNav = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
