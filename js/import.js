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
    roles: ['role', 'roles', 'position', 'positions', 'job', 'title',
      'תפקיד', 'תפקידים', 'עמדה', 'תפקוד'],
    maxShifts: ['max', 'maxshifts', 'quota', 'limit', 'מכסה', 'מקסימום', 'מכסה שבועית'],
    email: ['email', 'mail', 'e-mail', 'address', 'מייל', 'אימייל', 'דואר', 'דוא"ל', 'כתובת מייל'],
    phone: ['phone', 'mobile', 'cell', 'tel', 'telephone', 'phonenumber',
      'טלפון', 'נייד', 'פלאפון', 'סלולרי', 'מספר טלפון'],
    note: ['note', 'notes', 'comment', 'הערה', 'הערות'],
    active: ['active', 'status', 'פעיל', 'סטטוס']
  };

  function normalizeWord(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s_"']+/g, '');
  }

  /* הכותרות שאנחנו עצמנו כותבים בתבנית להורדה. הן חייבות להיות
     מזוהות בחזרה, אחרת התבנית שלנו לא נקראת אצלנו – ובשפה שאינה
     עברית או אנגלית זה בדיוק מה שהיה קורה, כי הרשימה הקבועה
     מכילה רק את שתיהן. */
  var FIELD_KEYS = {
    name: 'importData.colName',
    branches: 'importData.colBranches',
    shifts: 'importData.colShifts',
    roles: 'importData.colRoles',
    maxShifts: 'importData.colMax',
    email: 'importData.colEmail',
    phone: 'importData.colPhone',
    note: 'importData.colNote',
    active: 'importData.colActive'
  };

  function fieldOf(header) {
    var word = normalizeWord(header);
    if (!word) return null;
    var names = Object.keys(FIELD_WORDS);
    var i;
    for (i = 0; i < names.length; i++) {
      var words = FIELD_WORDS[names[i]].map(normalizeWord);
      if (words.indexOf(word) !== -1) return names[i];
    }
    /* ואז לפי השפה הפעילה. קובץ שנכתב בשפה אחת ונקרא בממשק בשפה
       אחרת ממשיך לעבוד דרך הרשימה הקבועה שלמעלה. */
    var keyed = Object.keys(FIELD_KEYS);
    for (i = 0; i < keyed.length; i++) {
      var label = t(FIELD_KEYS[keyed[i]]);
      if (label && label !== FIELD_KEYS[keyed[i]] && normalizeWord(label) === word) {
        return keyed[i];
      }
    }
    return null;
  }

  /* שמות הטורים כפי שהם נכתבים בתבנית, לפי הסדר בקובץ */
  var COLUMNS = ['name', 'branches', 'shifts', 'roles', 'maxShifts', 'email', 'phone',
    'note', 'active'];

  function columnLabels() {
    return COLUMNS.map(function (field) { return t(FIELD_KEYS[field]); });
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
  /* המייל בסוף בכוונה: מי שכבר הדביק בסדר הקודם ממשיך לעבוד.
     בקובץ עם שורת כותרות הסדר לא משנה ממילא. */
  /* הסדר בקובץ בלי שורת כותרות. התפקידים נוספו בסוף בכוונה:
     קובץ שנבנה לפני שהם היו קיימים ממשיך להיקרא נכון. */
  var POSITIONAL = ['name', 'branches', 'shifts', 'maxShifts', 'note', 'email', 'roles',
    'phone'];

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

  function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }

  /* מספר טלפון נשמר כפי שנכתב, בלי תווים שנכנסים מאקסל: גרש
     מוביל שמונע מהמספר להפוך למספר, ורווחים כפולים. אין כאן
     ניחוש של קידומת מדינה – המערכת עובדת בכמה מדינות, ומספר
     ש"תוקן" לפי ישראל הוא מספר שגוי בכל השאר. */
  function normalizePhone(value) {
    return String(value == null ? '' : value)
      .replace(/^['\u2019]+/, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  }

  /* לא ולידציה מלאה של RFC – היא דוחה כתובות אמיתיות. מספיק
     לתפוס את מה שקורה בפועל: שם בלי @, רווח באמצע, סיומת חסרה. */
  function looksLikeEmail(value) {
    return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(normalizeEmail(value));
  }

  /* ===== בניית התוכנית ===== */

  /* מחזיר תוכנית ייבוא: מה ייווצר, מה ידולג, מה שגוי, ואילו סניפים
     חדשים יידרשו. שום דבר כאן לא משנה את המצב. */
  /* options.knownEmails – כתובות שכבר יש להן חשבון בחברה. הן
     מגיעות מהשרת, כי כרטיס עובד ומשתמש הם שני דברים נפרדים, ומי
     שכבר הוזמן לא צריך כרטיס שני. */
  function planEmployees(state, text, options) {
    var opts = options || {};
    var rows = parseTable(text);
    /* warnings – מה שראוי לומר אבל אינו עוצר את הייבוא. עד
       עכשיו הייתה רק הבחנה בין "נכנס" ל"נפסל"; תפקיד שלא זוהה
       אינו אף אחד משניהם. */
    var plan = { create: [], skip: [], errors: [], warnings: [], newBranches: [], columns: null };
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
    /* כפילות לפי מייל ולא רק לפי שם: "דנה כהן" ו-"דנה כהן " הם
       אותה עובדת, אבל גם "ד. כהן" ו-"דנה כהן" – והמייל הוא מה
       שמבדיל ביניהם באמת. */
    var takenEmails = {};
    state.employees.forEach(function (emp) {
      var mail = normalizeEmail(emp.email);
      if (mail) takenEmails[mail] = 'exists';
    });
    (opts.knownEmails || []).forEach(function (mail) {
      var clean = normalizeEmail(mail);
      if (clean && !takenEmails[clean]) takenEmails[clean] = 'invited';
    });
    var plannedEmails = {};
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

      var email = normalizeEmail(cell(row, 'email'));
      if (email && !looksLikeEmail(email)) {
        plan.errors.push({ line: lineNumber, raw: name, code: 'badEmail', value: email });
        return;
      }
      if (email && takenEmails[email]) {
        plan.skip.push({ line: lineNumber, name: name,
          code: takenEmails[email] === 'invited' ? 'emailInvited' : 'emailExists',
          value: email });
        return;
      }
      if (email && plannedEmails[email]) {
        plan.skip.push({ line: lineNumber, name: name, code: 'duplicateEmailInFile',
          value: email });
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

      /* תפקידים. תפקיד שאינו קיים אינו שגיאה ואינו נוצר לבד:
         שגיאת כתיב בטור אחד הייתה מייצרת "קופאיי" כתפקיד אמיתי,
         ומשמרת שמחפשת "קופאי" לא הייתה מוצאת איש. הוא מדווח
         ככזה שלא זוהה, והעובד נכנס בלעדיו – כלומר מתאים להכל. */
      var roleIds = [];
      var unknownRoles = [];
      splitList(cell(row, 'roles')).forEach(function (label) {
        var found = Store.roles(state).filter(function (role) {
          return sameName(role.name, label);
        })[0];
        if (found) { if (roleIds.indexOf(found.id) === -1) roleIds.push(found.id); }
        else { unknownRoles.push(label); }
      });
      if (unknownRoles.length) {
        plan.warnings.push({ line: lineNumber, raw: name, code: 'unknownRole',
          value: unknownRoles.join(', ') });
      }

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
      if (email) plannedEmails[email] = true;
      plan.create.push({
        line: lineNumber,
        name: name,
        email: email,
        phone: normalizePhone(cell(row, 'phone')),
        branchNames: missing,
        branchIds: branchIds,
        roles: roleIds,
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
  /* hooks.skipLine(line) – שורה שהמנהל הוריד את הסימון ממנה בתצוגה
     המקדימה. היא נשארת בתוכנית כדי שהמספרים יישארו יציבים, ופשוט
     אינה נוצרת. */
  function applyPlan(state, plan, hooks) {
    var created = { employees: [], branches: [], blocked: 0 };
    var skipLine = hooks.skipLine || function () { return false; };
    var rows = plan.create.filter(function (row) { return !skipLine(row.line); });

    /* סניף נפתח רק אם נשארה שורה שצריכה אותו. אחרת ביטול הסימון
       על השורה האחרונה בסניף היה מייצר סניף ריק. */
    var wanted = {};
    rows.forEach(function (row) {
      row.branchNames.forEach(function (name) { wanted[normalizeWord(name)] = true; });
    });

    plan.newBranches.forEach(function (item) {
      if (!wanted[normalizeWord(item.name)]) return;
      var branch = hooks.createBranch(item.name);
      if (branch) created.branches.push(branch);
    });

    rows.forEach(function (row) {
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
      employee.roles = (row.roles || []).slice();
      employee.shifts = row.shifts.slice();
      employee.maxShifts = row.maxShifts;
      employee.note = row.note;
      employee.email = row.email || '';
      employee.phone = row.phone || '';
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
      [t('users.nameColumn'), t('schedule.branch'), t('schedule.shift'),
        t('importData.maxColumn'), t('users.emailColumn')].join('\t'),
      [t('importData.sampleName'), branch, first + ';' + second, '5',
        'dana@example.com'].join('\t')
    ].join('\n');
  }

  var API = {
    parseTable: parseTable,
    headerMap: headerMap,
    planEmployees: planEmployees,
    applyPlan: applyPlan,
    looksLikeEmail: looksLikeEmail,
    sampleText: sampleText,
    COLUMNS: COLUMNS,
    FIELD_KEYS: FIELD_KEYS,
    columnLabels: columnLabels,
    fieldOf: fieldOf,
    detectSeparator: detectSeparator
  };

  root.ShiftImport = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
