/* הסמל של SetShifts במקום אחד.

   הסמל מצויר ב-SVG ולא מגיע מקובץ תמונה, כדי שהוא יהיה נכון גם
   בפתיחה מקומית וגם באתר, וכדי שהוא יישאר חד בכל גודל. הוא חוזר
   על עצמו בשלושה מסכים (המערכת, הכלי המקומי ומסך הכניסה), ולכן
   הוא יושב כאן – בקובץ אחד – ולא משולש ב-HTML. */
(function (root) {
  'use strict';

  /* מזהה הדרגתי לכל עותק: שני SVG עם אותו id של gradient על אותו
     עמוד הם מסמך לא תקין, והדפדפן מצייר אז את אחד מהם בלי צבע. */
  var seq = 0;

  var CELLS = [
    [11, 20, 5, '#f5a623'], [18, 20, 5, '#2ea662'],
    [25, 20, 5, '#d7dfef'], [32, 20, 5, '#f5a623'],
    [11, 26.5, 5, '#2ea662'], [18, 26.5, 5, '#d7dfef'],
    [25, 26.5, 5, '#4a8df0'], [32, 26.5, 5, '#2ea662'],
    [11, 33, 3.5, '#d7dfef'], [18, 33, 3.5, '#4a8df0'],
    [25, 33, 3.5, '#f5a623'], [32, 33, 3.5, '#d7dfef']
  ];

  function markSvg() {
    var id = 'ss-mark-' + (++seq);
    var cells = CELLS.map(function (cell) {
      return '<rect x="' + cell[0] + '" y="' + cell[1] + '" width="5.5" height="' +
        cell[2] + '" rx="1.4" fill="' + cell[3] + '"/>';
    }).join('');

    return '<svg class="logo" viewBox="0 0 48 48" role="img" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#23499f"/><stop offset="1" stop-color="#2f5fe0"/>' +
      '</linearGradient></defs>' +
      '<rect width="48" height="48" rx="11" fill="url(#' + id + ')"/>' +
      '<rect x="9" y="12" width="30" height="26" rx="3.5" fill="#ffffff" opacity=".96"/>' +
      '<rect x="9" y="12" width="30" height="5.5" rx="2.5" fill="#1b3678"/>' +
      cells + '</svg>';
  }

  /* ממלא כל מקום ב-HTML שסומן כמיועד לסמל */
  function render(scope) {
    var nodes = (scope || document).querySelectorAll('[data-brand-mark]');
    Array.prototype.forEach.call(nodes, function (node) {
      if (node.querySelector('svg')) return;   // כבר צויר
      node.innerHTML = markSvg();
    });
  }

  var API = { markSvg: markSvg, render: render };
  root.ShiftBrand = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
