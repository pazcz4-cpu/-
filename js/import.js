/* ייבוא עובדים מרשימה קיימת.

   למה זה לא "עוד פיצ'ר": לקוח חדש מגיע עם 30 עובדים באקסל או
   בפתק, והקמה ידנית של 30 כרטיסים היא הרגע שבו הוא סוגר את
   הלשונית. שתי הדרכים שעובדות בפועל הן הדבקה מאקסל (שנותנת
   טורים מופרדים ב-Tab) וקובץ CSV, ולכן שתיהן נתמכות – ואין כאן
   קורא xlsx, שהוא הרבה עבודה עבור אותה תוצאה.

   הקובץ הזה אינו נוגע ב-DOM ואינו משנה את המצב: הוא קורא טקסט
   ומחזיר תוכנית. מי שמאשר אותה הוא המסך. */
(function (root) {
  'use strict';

  var Store = root.ShiftStore || (typeof require === 'function' ? require('./store.js') : null);

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
  }

  /* ===== קריאת הטבלה ===== */

  /* המפריד נקבע לפי מה שיש בשורות עצמן, ולא לפי מה שהלקוח הבטיח:
     הדבקה מאקסל מגיעה עם Tab, קובץ שנשמר כ-CSV עם פסיק, ולפעמים
     יש רק שמות בשורות. נקודה-פסיק נפוצה באקסל בעברית. */
  function detectSeparator(lines) {
    var counts = { '\t': 0, ';': 0, ',': 0 };
    lines.forEach(function (line) {
      Object.keys(counts).forEach(function (sep) {
        counts[sep] += line.split(sep).length - 1;
      });
    });
    if (counts['\t']) return '\t';
    if (counts[';'] > counts[',']) return ';';
    if (counts[',']) return ',';
    return null;   // טור אחד: שם בכל שורה
  }

  /* פיצול שורת CSV שמכבד מירכאות, כי שם עם פסיק בתוכו הוא מקרה
     אמיתי ולא קצה */
  function splitLine(line, separator) {
    if (!separator) return [line];
    var cells = [];
    var current = '';
    var quoted = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { current += '"'; i++; }
        else { quoted = !quoted; }
        continue;
      }
      if (ch === separator && !quoted) { cells.push(current); current = ''; continue; }
      current += ch;
    }
    cells.push(current);
    return cells;
  }

  function parseTable(text) {
    var lines = String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter(function (line) { return line.trim() !== ''; });
    if (!lines.length) return [];
    var separator = detectSeparator(lines);
    return lines.map(function (line) {
      return splitLine(line, separator).map(function (cell) { return cell.trim(); });
    });
  }

  /* ===== זיהוי הכותרות ===== */

  /* הלקוח לא יודע איזה סדר טורים אנחנו רוצים, ולכן אם יש שורת
     כותרות – הולכים לפיה. המילים נלקחות מהתרגום הפעיל ומרשימת
     מילים נפוצות, כדי שקובץ באנגלית יעבוד גם בממשק בעברית. */
  var FIELD_WORDS = {
    name: ['name', 'employee', 'staff', 'שם', 'עובד', 'עובדת', 'שם העובד'],
    branches: ['branch', 'branches', 'location', 'locations', 'site', 'סניף', 'סניפים', 'מקום'],
    shifts: ['shift', 'shifts', 'משמרת', 'משמרות'],
    maxShifts: ['max', 'maxshifts', 'quota', 'limit', 'מכסה', 'מקסימום', 'מכסה שבועית'],
    note: ['note', 'notes', 'comment', 'הערה', 'הערות'],
    active: ['active', 'status', 'פעיל', 'סטטוס']
  };

  function normalizeWord(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s_"']+/g, '');
  }

  function fieldOf(header) {
    var word = normalizeWord(header);
    if (!word) return null;
    var names = Object.keys(FIELD_WORDS);
    for (var i = 0; i < names.length; i++) {
      var words = FIELD_WORDS[names[i]].map(normalizeWord);
      if (words.indexOf(word) !== -1) return names[i];
    }
    return null;
  }

  /* מחזיר מיפוי טור→שדה אם השורה הראשונה היא כותרות, אחרת null */
  function headerMap(row) {
    var map = {};
    var matched = 0;
    row.forEach(function (cell, index) {
      var field = fieldOf(cell);
      if (field && !(field in map)) { map[field] = index; matched++; }
    });
    /* כותרת אמיתית מזוהה בזכות השם. טור בודד עם המילה "שם" הוא
       כותרת; שורה של נתונים כמעט לעולם אינה מכילה אותה. */
    if (!('name' in map) || matched < 1) return null;
    return map;
  }

  /* סדר ברירת המחדל, כשאין שורת כותרות */
  var POSITIONAL = ['name', 'branches', 'shifts', 'maxShifts', 'note'];

  /* ===== פענוח תא ===== */

  function splitList(value) {
    return String(value || '').split(/[;,|\/]/)
      .map(function (part) { return part.trim(); })
      .filter(Boolean);
  }

  var NO_WORDS = ['0', 'no', 'false', 'inactive', 'לא', 'מושבת', 'לא פעיל'];

  function parseActive(value) {
    if (value === undefined || value === '') return true;
    return NO_WORDS.indexOf(normalizeWord(value)) === -1;
  }

  function sameName(a, b) {
    return String(a || '').trim().toLowerCase().replace(/\s+/g, ' ') ===
      String(b || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /* ===== בניית התוכנית ===== */

  /* מחזיר תוכנית ייבוא: מה ייווצר, מה ידולג, מה שגוי, ואילו סניפים
     חדשים יידרשו. שום דבר כאן לא משנה את המצב. */
  function planEmployees(state, text) {
    var rows = parseTable(text);
    var plan = { create: [], skip: [], errors: [], newBranches: [], columns: null };
    if (!rows.length) return plan;

    var map = headerMap(rows[0]);
    var body = rows;
    if (map) { body = rows.slice(1); }
    plan.columns = map || null;

    function cell(row, field) {
      var index = map ? map[field] : POSITIONAL.indexOf(field);
      if (index === undefined || index === null || index < 0) return '';
      return row[index] === undefined ? '' : row[index];
    }

    var shifts = Store.shifts(state);
    var allShiftIds = shifts.map(function (shift) { return shift.id; });
    /* שמות המשמרות של העסק הזה, ולא מזהים פנימיים: הלקוח כותב
       "בוקר", לא "morning". */
    function shiftIdOf(label) {
      var word = normalizeWord(label);
      if (!word) return null;
      for (var i = 0; i < shifts.length; i++) {
        if (normalizeWord(shifts[i].name) === word ||
            normalizeWord(shifts[i].id) === word) return shifts[i].id;
      }
      return null;
    }

    var existingNames = state.employees.map(function (emp) { return emp.name; });
    var plannedNames = [];
    var branchNames = state.branches.map(function (branch) { return branch.name; });
    var plannedBranches = [];

    body.forEach(function (row, index) {
      var lineNumber = index + 1 + (map ? 1 : 0);
      var name = cell(row, 'name');
      if (!name) {
        plan.errors.push({ line: lineNumber, raw: row.join(' '), code: 'noName' });
        return;
      }

      var duplicate = existingNames.some(function (existing) { return sameName(existing, name); });
      if (duplicate) {
        plan.skip.push({ line: lineNumber, name: name, code: 'exists' });
        return;
      }
      if (plannedNames.some(function (planned) { return sameName(planned, name); })) {
        plan.skip.push({ line: lineNumber, name: name, code: 'duplicateInFile' });
        return;
      }

      var maxRaw = cell(row, 'maxShifts');
      var max = maxRaw === '' ? 6 : Number(String(maxRaw).replace(/[^\d.]/g, ''));
      if (!(max > 0)) {
        if (maxRaw !== '') {
          plan.errors.push({ line: lineNumber, raw: name, code: 'badMax', value: maxRaw });
          return;
        }
        max = 6;
      }

      /* סניף שאינו קיים אינו שגיאה: לקוח חדש מייבא רשימה שכוללת
         את הסניפים שלו, ואנחנו פותחים אותם בדרך. */
      var branchIds = [];
      var missing = [];
      splitList(cell(row, 'branches')).forEach(function (label) {
        var found = state.branches.filter(function (branch) {
          return sameName(branch.name, label);
        })[0];
        if (found) { branchIds.push(found.id); return; }
        var already = plannedBranches.filter(function (item) {
          return sameName(item.name, label);
        })[0];
        if (already) { missing.push(already.name); return; }
        plannedBranches.push({ name: label });
        branchNames.push(label);
        missing.push(label);
      });

      var shiftIds = [];
      var unknownShifts = [];
      splitList(cell(row, 'shifts')).forEach(function (label) {
        var id = shiftIdOf(label);
        if (id) { if (shiftIds.indexOf(id) === -1) shiftIds.push(id); }
        else { unknownShifts.push(label); }
      });
      if (unknownShifts.length) {
        plan.errors.push({ line: lineNumber, raw: name, code: 'badShift',
          value: unknownShifts.join(', ') });
        return;
      }

      plannedNames.push(name);
      plan.create.push({
        line: lineNumber,
        name: name,
        branchNames: missing,
        branchIds: branchIds,
        shifts: shiftIds.length ? shiftIds : allShiftIds.slice(),
        maxShifts: max,
        note: cell(row, 'note'),
        active: parseActive(cell(row, 'active'))
      });
    });

    plan.newBranches = plannedBranches;
    return plan;
  }

  /* מחיל תוכנית שאושרה. מחזיר את מה שנוצר בפועל.
     createBranch/createEmployee מגיעים מהאפליקציה, כדי שמגבלת
     התוכנית והשמירה יעברו באותו מסלול כמו הוספה ידנית. */
  function applyPlan(state, plan, hooks) {
    var created = { employees: [], branches: [], blocked: 0 };

    plan.newBranches.forEach(function (item) {
      var branch = hooks.createBranch(item.name);
      if (branch) created.branches.push(branch);
    });

    plan.create.forEach(function (row) {
      var employee = hooks.createEmployee(row.name);
      if (!employee) { created.blocked++; return; }

      /* הסניפים שנוצרו זה עתה מזוהים לפי שם, כי המזהה נקבע בהוספה */
      var ids = row.branchIds.slice();
      row.branchNames.forEach(function (name) {
        var branch = state.branches.filter(function (item) {
          return sameName(item.name, name);
        })[0];
        if (branch && ids.indexOf(branch.id) === -1) ids.push(branch.id);
      });

      employee.branches = ids;
      employee.shifts = row.shifts.slice();
      employee.maxShifts = row.maxShifts;
      employee.note = row.note;
      employee.active = row.active;
      created.employees.push(employee);
    });

    return created;
  }

  /* דוגמה להדבקה, בשפה ובשמות של העסק הזה */
  function sampleText(state) {
    var branch = (state.branches[0] || {}).name || t('branches.newName');
    var shifts = Store.shifts(state);
    var first = (shifts[0] || {}).name || '';
    var second = (shifts[1] || {}).name || first;
    return [
      [t('users.nameColumn'), t('schedule.branch'), t('schedule.shift'), t('importData.maxColumn')].join('\t'),
      ['דנה כהן', branch, first + ';' + second, '5'].join('\t')
    ].join('\n');
  }

  var API = {
    parseTable: parseTable,
    headerMap: headerMap,
    planEmployees: planEmployees,
    applyPlan: applyPlan,
    sampleText: sampleText,
    detectSeparator: detectSeparator
  };

  root.ShiftImport = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
