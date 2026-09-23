/* תבנית אקסל להקמת עובדים וסניפים.

   הרעיון: לקוח חדש לא אמור לנחש איזה טורים אנחנו רוצים. הוא
   מוריד קובץ שכבר בנוי נכון, ממלא, ומעלה בחזרה.

   שתי החלטות שכדאי להכיר:

   1. גיליון העובדים מכיל שורת כותרות ותו לא. שורת דוגמה בתוכו
      הייתה נכנסת כעובד אמיתי אצל כל מי ששכח למחוק אותה, והדוגמאות
      יושבות בלשונית ההסבר במקום.

   2. הכותרות והערכים החוקיים נלקחים מהעסק עצמו – שמות המשמרות,
      התפקידים והסניפים שלו – ולא מרשימה כללית. כך מה שהלקוח כותב
      מתאים למה שהמערכת מחפשת, במקום ש"בוקר" מול "morning" ייפול
      בייבוא. */
(function (root) {
  'use strict';

  var Xlsx = root.ShiftXlsx || (typeof require === 'function' ? require('./xlsx.js') : null);
  var Import = root.ShiftImport || (typeof require === 'function' ? require('./import.js') : null);
  var Store = root.ShiftStore || (typeof require === 'function' ? require('./store.js') : null);

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
  }

  var S = Xlsx.STYLE;

  function head(value) { return { v: value, s: S.HEADER }; }
  function label(value) { return { v: value, s: S.ROW_HEAD }; }
  function plain(value) { return { v: value, s: S.PLAIN }; }

  function names(list) {
    return (list || []).map(function (item) { return item.name; }).filter(Boolean);
  }

  /* ===== גיליון העובדים: כותרות בלבד ===== */
  function staffSheet() {
    return {
      name: t('importData.sheetStaff'),
      selected: true,
      freeze: { row: 1, col: 0 },
      cols: [22, 24, 22, 20, 14, 26, 18, 26, 10],
      rows: [
        { cells: Import.columnLabels().map(head), height: 24 }
      ]
    };
  }

  /* ===== גיליון ההסבר =====
     מה כל טור אומר, ואילו ערכים חוקיים אצל העסק הזה דווקא. */
  function helpSheet(state) {
    var shifts = names(Store.shifts(state));
    var roles = names(Store.roles(state));
    var branches = names(state.branches);

    var exampleBranch = branches[0] || t('branches.newName');
    var exampleShift = shifts.length
      ? shifts.slice(0, 2).join('; ')
      : '';
    var exampleRole = roles.length ? roles.slice(0, 2).join('; ') : '';

    var rows = [];
    rows.push({ cells: [{ v: t('importData.helpTitle'), s: S.TITLE }], height: 24 });
    rows.push([{ v: t('importData.helpIntro'), s: S.SUBTITLE }]);
    rows.push([]);

    rows.push({
      cells: [t('importData.helpColumn'), t('importData.helpNeeded'),
        t('importData.helpWhat'), t('importData.helpExample')].map(head),
      height: 22
    });

    var yes = t('importData.helpYes');
    var no = t('importData.helpNo');
    var spec = [
      ['colName', yes, 'helpName', t('importData.sampleName')],
      ['colBranches', no, 'helpBranches', exampleBranch],
      ['colShifts', no, 'helpShifts', exampleShift],
      ['colRoles', no, 'helpRoles', exampleRole],
      ['colMax', no, 'helpMax', '5'],
      ['colEmail', no, 'helpEmail', 'dana@example.com'],
      ['colPhone', no, 'helpPhone', '050-0000000'],
      ['colNote', no, 'helpNote', ''],
      ['colActive', no, 'helpActive', '']
    ];
    spec.forEach(function (item) {
      rows.push([
        label(t('importData.' + item[0])),
        plain(item[1]),
        plain(t('importData.' + item[2])),
        plain(item[3])
      ]);
    });

    rows.push([]);
    rows.push([{ v: t('importData.helpMulti'), s: S.SUBTITLE }]);
    rows.push([]);

    /* הערכים החוקיים אצל העסק הזה. בלי הרשימה הזו הלקוח מנחש
       איך קוראים למשמרת אצלו, והייבוא נופל על שגיאת כתיב. */
    function listBlock(titleKey, values, emptyKey) {
      /* רשימה ריקה בלי מילה אחת עליה נראית כמו תקלה. כותרת בלי
         פריטים ובלי הסבר – עוד יותר. */
      if (!values.length && !emptyKey) return;
      rows.push({ cells: [head(t(titleKey))], height: 22 });
      if (!values.length) {
        rows.push([plain(t(emptyKey))]);
        return;
      }
      values.forEach(function (value) { rows.push([plain(value)]); });
    }

    /* משמרות תמיד קיימות בעסק פעיל, ולכן אין להן נוסח "עוד אין" */
    listBlock('importData.helpShiftsHere', shifts, null);
    rows.push([]);
    listBlock('importData.helpRolesHere', roles, 'importData.helpNoRoles');
    rows.push([]);
    listBlock('importData.helpBranchesHere', branches, 'importData.helpNoBranches');

    return { name: t('importData.sheetHelp'), cols: [22, 14, 62, 26], rows: rows };
  }

  /* מחזיר Uint8Array של קובץ xlsx */
  function build(state) {
    return Xlsx.build([staffSheet(), helpSheet(state)]);
  }

  function fileName() {
    return t('importData.templateFile') + '.xlsx';
  }

  var API = { build: build, fileName: fileName, staffSheet: staffSheet, helpSheet: helpSheet };
  root.ShiftTemplate = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
