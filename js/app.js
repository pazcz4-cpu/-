/* ממשק המשתמש: תצוגת הסידור, עריכה ידנית, אילוצים, עובדים, סניפים והגדרות */
(function () {
  'use strict';

  var Data = window.ShiftData;
  var Store = window.ShiftStore;
  var Scheduler = window.ShiftScheduler;
  var Validate = window.ShiftValidate;
  var Platform = window.ShiftPlatform;
  var Xlsx = window.ShiftXlsx;

  var state = Store.load();
  var weekKey = Store.currentWeekKey();
  var view = 'branch';
  var showAllIssues = false;
  var lastReport = { issues: [], errors: 0, warnings: 0, infos: 0 };

  function $(sel) { return document.querySelector(sel); }
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function week() {
    var current = Store.getWeek(state, weekKey);
    if (!current.shabbatEnd && state.settings.defaultShabbatEnd) {
      current.shabbatEnd = state.settings.defaultShabbatEnd;
    }
    return current;
  }

  function persist(scope) {
    Store.save(state);
    if (scope === 'config' || scope === 'all') Platform.pushConfig();
    if (scope !== 'config') Platform.pushWeek(weekKey);
  }

  var toastTimer = null;
  function toast(message) {
    var node = $('#toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('show'); }, 2600);
  }

  function shiftClass(shiftId) { return 'shift-' + shiftId; }
  function branchNameOf(id) {
    var branch = Store.byId(state.branches, id);
    return branch ? branch.name : 'סניף לא ידוע';
  }
  function empNameOf(id) {
    var emp = Store.byId(state.employees, id);
    return emp ? emp.name : 'עובד לא ידוע';
  }

  /* ========== כותרת השבוע ========== */
  function renderWeekHeader() {
    var start = Store.dateOfDay(weekKey, 0);
    var end = Store.dateOfDay(weekKey, 6);
    var label = 'שבוע ' + Store.formatDate(start) + ' – ' + Store.formatDate(end);
    $('#week-title').textContent = label;
    $('#week-range').textContent = weekKey === Store.currentWeekKey() ? 'השבוע הנוכחי' : '';
    $('#constraints-week').textContent = 'אילוצי ' + label;

    var current = week();
    var field = $('#shabbat-end');
    field.value = current.shabbatEnd || '';
    var needsMotzash = state.branches.some(function (branch) {
      return branch.active && Store.slotConfig(branch, Data.MOTZASH.dayIdx, 'evening');
    });
    $('#shabbat-field').classList.toggle('hidden', !needsMotzash);
  }

  /* ========== לוח הסידור לפי סניף ========== */
  function issueMaps(report) {
    var cells = {}, employeesDay = {};
    report.issues.forEach(function (item) {
      var ref = item.ref || {};
      if (ref.branchId && ref.shiftId && ref.dayIdx != null) {
        var key = Store.slotKey(ref.dayIdx, ref.branchId, ref.shiftId);
        if (cells[key] !== 'error') cells[key] = item.level === 'error' ? 'error' : (cells[key] || item.level);
      }
      if (ref.empId && ref.dayIdx != null && (item.type === 'double-booked' || item.type === 'constraint-off' || item.type === 'constraint-blocked')) {
        employeesDay[ref.empId + '|' + ref.dayIdx] = true;
      }
    });
    return { cells: cells, employeesDay: employeesDay };
  }

  function optionLabel(emp, dayIdx, branchId, shiftId) {
    var constraint = Store.getConstraint(week(), emp.id, dayIdx);
    var marks = [];
    if (constraint.off) marks.push('חופש');
    else if (constraint.blocked && constraint.blocked[shiftId]) marks.push('חסום');
    else if (constraint.preferred && constraint.preferred[shiftId]) marks.push('מעדיף');
    if (!Scheduler.employeeAllowedInBranch(emp, branchId)) marks.push('לא בסניף');
    if (emp.shifts.indexOf(shiftId) === -1) marks.push('לא במשמרת');
    var busy = Store.employeeDayAssignments(state, week(), emp.id, dayIdx)
      .filter(function (s) { return !(s.branchId === branchId && s.shiftId === shiftId); });
    if (busy.length) marks.push('כבר משובץ');
    if (!emp.active) marks.push('לא פעיל');
    return emp.name + (marks.length ? ' ⚠ (' + marks.join(', ') + ')' : '');
  }

  function cellHtml(dayIdx, branch, shiftId, need, marks) {
    var assigned = Store.getAssigned(week(), dayIdx, branch.id, shiftId);
    var rows = Math.max(need, assigned.length) + 1; // שורה נוספת לשיבוץ חריג (מזוהה ככפל)
    var key = Store.slotKey(dayIdx, branch.id, shiftId);
    var cls = 'cell ' + shiftClass(shiftId);
    if (marks.cells[key] === 'error') cls += ' has-error';
    else if (marks.cells[key]) cls += ' has-warning';

    var html = '<td class="' + cls + '" data-day="' + dayIdx + '" data-branch="' + esc(branch.id) + '" data-shift="' + shiftId + '">';
    var hours = Store.slotHours(week(), branch, dayIdx, shiftId);
    if (hours) {
      var label = Store.hoursLabel(hours);
      html += '<div class="cell-hours">' +
        (label ? esc(label) : '<span class="missing">חסרה שעת צאת שבת</span>') +
        (need > 1 ? ' · ' + need + ' עובדים' : '') + '</div>';
    }
    for (var i = 0; i < rows; i++) {
      var value = assigned[i] || '';
      var extra = i >= need ? ' extra' : '';
      html += '<select class="emp-select' + extra + '" data-slot="' + i + '">';
      html += '<option value="">' + (i >= need ? '+ הוסף' : '— ריק —') + '</option>';
      state.employees.forEach(function (emp) {
        var selected = value === emp.id ? ' selected' : '';
        html += '<option value="' + esc(emp.id) + '"' + selected + '>' + esc(optionLabel(emp, dayIdx, branch.id, shiftId)) + '</option>';
      });
      if (value && !Store.byId(state.employees, value)) {
        html += '<option value="' + esc(value) + '" selected>' + esc(empNameOf(value)) + '</option>';
      }
      html += '</select>';
    }
    return html + '</td>';
  }

  function renderBranchView(marks) {
    var html = '<table><thead><tr><th class="row-head">סניף</th><th class="row-head">משמרת</th>';
    Data.DAYS.forEach(function (day) {
      html += '<th class="day-head">' + day.name + '<small>' + Store.formatDate(Store.dateOfDay(weekKey, day.idx)) + '</small></th>';
    });
    html += '</tr></thead><tbody>';

    var activeBranches = state.branches.filter(function (b) { return b.active; });
    if (!activeBranches.length) {
      html += '<tr><td colspan="9">לא הוגדרו סניפים פעילים. עברו ללשונית "סניפים".</td></tr>';
    }

    activeBranches.forEach(function (branch) {
      Data.SHIFTS.forEach(function (shift, shiftIndex) {
        html += shiftIndex === 0 ? '<tr class="branch-start">' : '<tr>';
        if (shiftIndex === 0) {
          html += '<td class="row-head" rowspan="' + Data.SHIFTS.length + '">' + esc(branch.name) + '</td>';
        }
        html += '<td class="row-head ' + shiftClass(shift.id) + '">' + shift.name + '</td>';

        Data.DAYS.forEach(function (day) {
          var need = Store.slotNeed(branch, day.idx, shift.id);
          var assigned = Store.getAssigned(week(), day.idx, branch.id, shift.id);
          if (need > 0) {
            html += cellHtml(day.idx, branch, shift.id, need, marks);
          } else if (assigned.length) {
            html += cellHtml(day.idx, branch, shift.id, 0, marks); // שיבוץ חריג ביום סגור
          } else {
            html += '<td class="closed">—</td>';
          }
        });
        html += '</tr>';
      });
    });

    html += '</tbody></table>';
    $('#schedule-branch').innerHTML = html;
  }

  /* ========== תצוגה לפי עובד ========== */
  function renderEmployeeView(marks) {
    var html = '<table><thead><tr><th class="row-head">עובד</th>';
    Data.DAYS.forEach(function (day) {
      html += '<th class="day-head">' + day.name + '<small>' + Store.formatDate(Store.dateOfDay(weekKey, day.idx)) + '</small></th>';
    });
    html += '<th class="row-head">סה״כ משמרות</th></tr></thead><tbody>';

    state.employees.forEach(function (emp) {
      var total = 0;
      var row = '<tr><td class="row-head">' + esc(emp.name) + (emp.active ? '' : ' <small>(לא פעיל)</small>') + '</td>';
      Data.DAYS.forEach(function (day) {
        var slots = Store.employeeDayAssignments(state, week(), emp.id, day.idx);
        total += slots.length;
        var constraint = Store.getConstraint(week(), emp.id, day.idx);
        var flagged = marks.employeesDay[emp.id + '|' + day.idx];
        var cellClass = 'cell' + (flagged ? ' has-error' : '');
        var content = '';
        if (!slots.length) {
          content = constraint.off ? '<span class="empty-cell">חופש</span>' : '<span class="empty-cell">—</span>';
        } else {
          content = slots.map(function (slot) {
            var shift = Data.shiftById(slot.shiftId);
            return '<span class="emp-chip ' + shiftClass(slot.shiftId) + (slots.length > 1 ? ' dup' : '') + '">' +
              esc(branchNameOf(slot.branchId)) + ' · ' + (shift ? shift.name : slot.shiftId) + '</span>';
          }).join('');
        }
        row += '<td class="' + cellClass + '">' + content + '</td>';
      });
      row += '<td class="row-head">' + total + ' מתוך ' + (emp.maxShifts || '-') + '</td></tr>';
      html += row;
    });

    html += '</tbody></table>';
    $('#schedule-employee').innerHTML = html;
  }

  /* ========== פאנל הבדיקות ========== */
  function plural(count, singular, pluralWord) {
    return count === 1 ? singular : count + ' ' + pluralWord;
  }

  function renderIssues(report) {
    var container = $('#issues');
    var visible = showAllIssues ? report.issues : report.issues.slice(0, 6);
    var html = '<div class="issues-summary">';
    if (report.errors) html += '<span class="badge error">' + plural(report.errors, 'שגיאה אחת', 'שגיאות') + '</span>';
    if (report.warnings) html += '<span class="badge warning">' + plural(report.warnings, 'אזהרה אחת', 'אזהרות') + '</span>';
    if (report.infos) html += '<span class="badge info">' + plural(report.infos, 'הערה אחת', 'הערות') + '</span>';
    if (!report.issues.length) html += '<span class="badge ok">✔ הסידור תקין – אין כפל משמרות, חוסרים או הפרות אילוצים</span>';
    if (report.issues.length > 6) {
      html += '<button class="issues-toggle" id="toggle-issues">' +
        (showAllIssues ? 'הצג פחות' : 'הצג את כל ' + report.issues.length + ' ההתראות') + '</button>';
    }
    html += '</div>';
    visible.forEach(function (item) {
      html += '<div class="issue ' + item.level + '">' + esc(item.text) + '</div>';
    });
    container.innerHTML = html;
    var toggle = $('#toggle-issues');
    if (toggle) {
      toggle.addEventListener('click', function () { showAllIssues = !showAllIssues; renderIssues(report); });
    }
  }

  function renderWorkload() {
    var html = '';
    state.employees.forEach(function (emp) {
      if (!emp.active) return;
      var count = Store.employeeWeekCount(state, week(), emp.id);
      var cls = count > (emp.maxShifts || 99) ? ' over' : (count === 0 ? ' zero' : '');
      html += '<div class="load-pill' + cls + '">' + esc(emp.name) + ': <b>' + count + '</b> מתוך ' + (emp.maxShifts || '-') + '</div>';
    });
    $('#workload').innerHTML = html;
  }

  /* ========== לוח האילוצים ========== */
  function renderConstraints() {
    var html = '<table><thead><tr><th class="row-head">עובד</th>';
    Data.DAYS.forEach(function (day) {
      html += '<th class="day-head">' + day.name + '<small>' + Store.formatDate(Store.dateOfDay(weekKey, day.idx)) + '</small></th>';
    });
    html += '</tr></thead><tbody>';

    state.employees.forEach(function (emp) {
      html += '<tr><td class="row-head">' + esc(emp.name) + '</td>';
      Data.DAYS.forEach(function (day) {
        var constraint = Store.getConstraint(week(), emp.id, day.idx);
        var dayShifts = Store.activeShiftsForDay(state, day.idx);
        if (!dayShifts.length) { html += '<td class="closed">סגור</td>'; return; }
        html += '<td>';
        dayShifts.forEach(function (shiftId) {
          var shift = Data.shiftById(shiftId);
          var cls = 'free', title = 'זמין';
          if (constraint.off) { cls = 'off-day'; title = 'יום חופש'; }
          else if (constraint.blocked && constraint.blocked[shiftId]) { cls = 'block'; title = 'לא יכול/ה'; }
          else if (constraint.preferred && constraint.preferred[shiftId]) { cls = 'pref'; title = 'מעדיף/ה'; }
          html += '<button class="cstate ' + cls + '" title="' + title + '" data-emp="' + esc(emp.id) +
            '" data-day="' + day.idx + '" data-shift="' + shiftId + '">' + shift.name + '</button>';
        });
        html += '<button class="cstate day-off-btn ' + (constraint.off ? 'off-day' : 'free') +
          '" data-emp="' + esc(emp.id) + '" data-day="' + day.idx + '" data-off="1">' +
          (constraint.off ? '✓ חופש' : 'חופש') + '</button>';
        html += '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    $('#constraints-grid').innerHTML = html;
  }

  /* ========== עובדים ========== */
  function renderEmployees() {
    var html = '';
    state.employees.forEach(function (emp) {
      html += '<div class="card' + (emp.active ? '' : ' inactive') + '" data-emp="' + esc(emp.id) + '">';
      html += '<div class="card-head"><input class="name" data-field="name" value="' + esc(emp.name) + '">' +
        '<button class="btn icon danger" data-action="delete-emp" title="מחיקה">🗑</button></div>';
      html += '<div class="field"><label class="check"><input type="checkbox" data-field="active"' +
        (emp.active ? ' checked' : '') + '> עובד/ת פעיל/ה</label></div>';
      html += '<div class="field"><label class="title">סניפים (ללא בחירה = זמין בכל הסניפים)</label><div class="pills">';
      state.branches.forEach(function (branch) {
        var on = emp.branches.indexOf(branch.id) !== -1 ? ' on' : '';
        html += '<button class="pill' + on + '" data-action="toggle-branch" data-branch="' + esc(branch.id) + '">' + esc(branch.name) + '</button>';
      });
      html += '</div></div>';
      html += '<div class="field"><label class="title">סוגי משמרות אפשריים</label><div class="pills">';
      Data.SHIFTS.forEach(function (shift) {
        var on = emp.shifts.indexOf(shift.id) !== -1 ? ' on' : '';
        html += '<button class="pill' + on + '" data-action="toggle-shift" data-shift="' + shift.id + '">' + shift.name + '</button>';
      });
      html += '</div></div>';
      html += '<div class="field"><label class="title">מקסימום משמרות בשבוע</label>' +
        '<input class="num-input" type="number" min="0" max="14" data-field="maxShifts" value="' + esc(emp.maxShifts) + '"></div>';
      html += '<div class="field"><label class="title">הערה</label>' +
        '<input class="text-input" data-field="note" value="' + esc(emp.note || '') + '"></div>';
      html += '</div>';
    });
    $('#employees-list').innerHTML = html;
  }

  /* ========== סניפים: ימים, שעות וכמות עובדים ========== */
  function timeInputHtml(field, value) {
    return '<input class="time-input" type="text" inputmode="numeric" maxlength="5" placeholder="שש:דד"' +
      ' data-sched="' + field + '" value="' + esc(value || '') + '">';
  }

  function scheduleCellHtml(branch, dayIdx, shiftId) {
    var config = (branch.schedule[dayIdx] || {})[shiftId] || null;
    var need = config ? Number(config.need) || 0 : 0;
    var isMotzash = config && config.auto === 'motzash';
    var html = '<td class="sched-cell ' + (need ? shiftClass(shiftId) : 'closed') + '"' +
      ' data-day="' + dayIdx + '" data-shift="' + shiftId + '">';
    html += '<label class="sched-need"><span>עובדים</span>' +
      '<input class="num-input" type="number" min="0" max="9" data-sched="need" value="' + need + '"></label>';
    if (need > 0) {
      html += '<div class="sched-times">';
      if (isMotzash) {
        html += '<span class="auto-time" title="חצי שעה אחרי צאת השבת של אותו שבוע">מצאת שבת +30 דק׳</span>';
      } else {
        html += timeInputHtml('from', config.from);
      }
      html += '<span class="dash">–</span>';
      html += timeInputHtml('to', config.to);
      html += '</div>';
      if (dayIdx === Data.MOTZASH.dayIdx) {
        html += '<label class="check tiny"><input type="checkbox" data-sched="auto"' +
          (isMotzash ? ' checked' : '') + '> לפי צאת שבת</label>';
      }
    } else {
      html += '<div class="sched-closed">סגור</div>';
    }
    return html + '</td>';
  }

  function renderBranches() {
    var html = '';
    state.branches.forEach(function (branch) {
      html += '<div class="card wide' + (branch.active ? '' : ' inactive') + '" data-branch="' + esc(branch.id) + '">';
      html += '<div class="card-head"><input class="name" data-field="name" value="' + esc(branch.name) + '">' +
        '<label class="check"><input type="checkbox" data-field="active"' +
        (branch.active ? ' checked' : '') + '> פעיל</label>' +
        '<button class="btn icon danger" data-action="delete-branch" title="מחיקת הסניף">🗑</button></div>';

      html += '<div class="table-wrap sched-wrap"><table class="sched-table"><thead><tr><th class="row-head">יום</th>';
      Data.SHIFTS.forEach(function (shift) {
        html += '<th class="' + shiftClass(shift.id) + '">' + shift.name + '</th>';
      });
      html += '</tr></thead><tbody>';
      Data.DAYS.forEach(function (day) {
        html += '<tr><td class="row-head">' + day.name + '</td>';
        Data.SHIFTS.forEach(function (shift) {
          html += scheduleCellHtml(branch, day.idx, shift.id);
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';

      if (state.branches.length > 1) {
        html += '<div class="field copy-row"><label class="title">העתקת ימים ושעות מסניף אחר</label>' +
          '<select class="text-input" data-action="copy-schedule"><option value="">בחרו סניף…</option>';
        state.branches.forEach(function (other) {
          if (other.id === branch.id) return;
          html += '<option value="' + esc(other.id) + '">' + esc(other.name) + '</option>';
        });
        html += '</select></div>';
      }
      html += '</div>';
    });
    $('#branches-list').innerHTML = html;
  }

  /* ========== הגדרות ========== */
  function renderSettings() {
    $('#opt-one-per-day').checked = !!state.settings.onePerDay;
    $('#opt-rest').checked = !!state.settings.restEveningMorning;
    $('#default-shabbat').value = state.settings.defaultShabbatEnd || '';
  }

  /* ========== רינדור כולל ========== */
  function render() {
    renderWeekHeader();
    lastReport = Validate.validate(state, week());
    var marks = issueMaps(lastReport);
    renderIssues(lastReport);
    renderBranchView(marks);
    renderEmployeeView(marks);
    renderWorkload();
    renderConstraints();
    renderEmployees();
    renderBranches();
    renderSettings();
  }

  /* ========== ייצוא ========== */
  function scheduleAsText() {
    var lines = ['סידור עבודה – שבוע ' + Store.formatDate(Store.dateOfDay(weekKey, 0)) +
      ' עד ' + Store.formatDate(Store.dateOfDay(weekKey, 6)), ''];
    Data.DAYS.forEach(function (day) {
      var dayLines = [];
      state.branches.forEach(function (branch) {
        if (!branch.active) return;
        Data.ALL_SHIFT_IDS.forEach(function (shiftId) {
          var assigned = Store.getAssigned(week(), day.idx, branch.id, shiftId);
          var need = Store.slotNeed(branch, day.idx, shiftId);
          if (!assigned.length && !need) return;
          var names = assigned.map(empNameOf).join(', ') || '‼ חסר איוש';
          var hours = Store.hoursLabel(Store.slotHours(week(), branch, day.idx, shiftId));
          dayLines.push('   ' + branch.name + ' – ' + Data.shiftById(shiftId).name +
            (hours ? ' (' + hours + ')' : '') + ': ' + names);
        });
      });
      if (dayLines.length) {
        lines.push('📅 יום ' + day.name + ' (' + Store.formatDate(Store.dateOfDay(weekKey, day.idx)) + ')');
        lines = lines.concat(dayLines, '');
      }
    });
    return lines.join('\n');
  }

  function saveFile(filename, content, mime) {
    Platform.saveFile(filename, content, mime).then(function (message) {
      if (message) toast(message);
    });
  }

  /* ===== ייצוא לאקסל: גיליון לפי סניף וגיליון לפי עובד ===== */
  function shiftStyle(shiftId) {
    if (shiftId === 'morning') return Xlsx.STYLE.MORNING;
    if (shiftId === 'middle') return Xlsx.STYLE.MIDDLE;
    if (shiftId === 'evening') return Xlsx.STYLE.EVENING;
    return Xlsx.STYLE.PLAIN;
  }

  function weekTitle() {
    return 'סידור עבודה – שבוע ' + Store.formatDate(Store.dateOfDay(weekKey, 0)) +
      ' עד ' + Store.formatDate(Store.dateOfDay(weekKey, 6));
  }

  function dayHeaderCells() {
    return Data.DAYS.map(function (day) {
      return { v: day.name + '\n' + Store.formatDate(Store.dateOfDay(weekKey, day.idx)), s: Xlsx.STYLE.HEADER };
    });
  }

  function branchSheet() {
    var current = week();
    var rows = [];
    var merges = [];

    rows.push({ cells: [{ v: weekTitle(), s: Xlsx.STYLE.TITLE }], height: 22 });
    var subtitle = 'תצוגה לפי סניף';
    if (current.shabbatEnd) subtitle += ' · צאת שבת ' + current.shabbatEnd;
    rows.push([{ v: subtitle, s: Xlsx.STYLE.SUBTITLE }]);
    rows.push([]);

    var headerRow = [{ v: 'סניף', s: Xlsx.STYLE.HEADER }, { v: 'משמרת', s: Xlsx.STYLE.HEADER }]
      .concat(dayHeaderCells());
    rows.push({ cells: headerRow, height: 30 });

    var activeBranches = state.branches.filter(function (branch) { return branch.active; });
    activeBranches.forEach(function (branch) {
      var firstRow = rows.length;
      Data.SHIFTS.forEach(function (shift, shiftIndex) {
        var cells = [
          shiftIndex === 0 ? { v: branch.name, s: Xlsx.STYLE.ROW_HEAD } : { v: '', s: Xlsx.STYLE.ROW_HEAD },
          { v: shift.name, s: Xlsx.STYLE.ROW_HEAD }
        ];
        var maxLines = 1;
        Data.DAYS.forEach(function (day) {
          var need = Store.slotNeed(branch, day.idx, shift.id);
          var assigned = Store.getAssigned(current, day.idx, branch.id, shift.id);
          if (!need && !assigned.length) {
            cells.push({ v: '—', s: Xlsx.STYLE.CLOSED });
            return;
          }
          var lines = [];
          var hours = Store.hoursLabel(Store.slotHours(current, branch, day.idx, shift.id));
          if (hours) lines.push(hours);
          if (assigned.length) {
            assigned.forEach(function (id) { lines.push(empNameOf(id)); });
          }
          for (var i = assigned.length; i < need; i++) { lines.push('— חסר —'); }
          maxLines = Math.max(maxLines, lines.length);
          cells.push({ v: lines.join('\n'), s: shiftStyle(shift.id) });
        });
        rows.push({ cells: cells, height: Math.max(20, maxLines * 14 + 6) });
      });
      merges.push({ r1: firstRow, c1: 0, r2: firstRow + Data.SHIFTS.length - 1, c2: 0 });
    });

    if (!activeBranches.length) {
      rows.push([{ v: 'לא הוגדרו סניפים פעילים', s: Xlsx.STYLE.PLAIN }]);
    }

    return {
      name: 'לפי סניף',
      selected: true,
      cols: [18, 10, 20, 20, 20, 20, 20, 20, 20],
      freeze: { row: 4, col: 2 },
      merges: merges,
      rows: rows
    };
  }

  function employeeSheet() {
    var current = week();
    var rows = [];

    rows.push({ cells: [{ v: weekTitle(), s: Xlsx.STYLE.TITLE }], height: 22 });
    rows.push([{ v: 'תצוגה לפי עובד', s: Xlsx.STYLE.SUBTITLE }]);
    rows.push([]);

    var headerRow = [{ v: 'עובד', s: Xlsx.STYLE.HEADER }]
      .concat(dayHeaderCells())
      .concat([{ v: 'סה״כ משמרות', s: Xlsx.STYLE.HEADER }]);
    rows.push({ cells: headerRow, height: 30 });

    state.employees.forEach(function (emp) {
      var cells = [{ v: emp.name + (emp.active ? '' : ' (לא פעיל)'), s: Xlsx.STYLE.ROW_HEAD }];
      var total = 0;
      var maxLines = 1;

      Data.DAYS.forEach(function (day) {
        var slots = Store.employeeDayAssignments(state, current, emp.id, day.idx);
        total += slots.length;
        var constraint = Store.getConstraint(current, emp.id, day.idx);
        if (!slots.length) {
          cells.push({ v: constraint.off ? 'חופש' : '—', s: Xlsx.STYLE.CLOSED });
          return;
        }
        var lines = slots.map(function (slot) {
          var shift = Data.shiftById(slot.shiftId);
          var hours = Store.hoursLabel(Store.slotHours(current,
            Store.byId(state.branches, slot.branchId) || {}, day.idx, slot.shiftId));
          return branchNameOf(slot.branchId) + ' · ' + (shift ? shift.name : slot.shiftId) +
            (hours ? '\n' + hours : '');
        });
        maxLines = Math.max(maxLines, lines.join('\n').split('\n').length);
        cells.push({ v: lines.join('\n'), s: shiftStyle(slots[0].shiftId) });
      });

      cells.push({ v: total + ' מתוך ' + (emp.maxShifts || 0), s: Xlsx.STYLE.TOTAL });
      rows.push({ cells: cells, height: Math.max(20, maxLines * 14 + 6) });
    });

    return {
      name: 'לפי עובד',
      cols: [20, 22, 22, 22, 22, 22, 22, 22, 14],
      freeze: { row: 4, col: 1 },
      rows: rows
    };
  }

  function issuesSheet() {
    var rows = [];
    rows.push({ cells: [{ v: 'בדיקות הסידור', s: Xlsx.STYLE.TITLE }], height: 22 });
    rows.push([{ v: weekTitle(), s: Xlsx.STYLE.SUBTITLE }]);
    rows.push([]);
    rows.push([{ v: 'חומרה', s: Xlsx.STYLE.HEADER }, { v: 'סוג', s: Xlsx.STYLE.HEADER },
      { v: 'פירוט', s: Xlsx.STYLE.HEADER }]);

    var levels = { error: 'שגיאה', warning: 'אזהרה', info: 'הערה' };
    var types = {
      'duplicate-shift': 'כפל משמרת', 'duplicate-employee-slot': 'כפל משמרת',
      'double-booked': 'כפל משמרת לעובד', 'understaffed': 'חוסר באיוש',
      'constraint-off': 'הפרת אילוץ', 'constraint-blocked': 'הפרת אילוץ',
      'branch-mismatch': 'סניף לא מתאים', 'shift-mismatch': 'משמרת לא מתאימה',
      'over-max': 'חריגה ממכסה', 'rest': 'מנוחה קצרה', 'no-shifts': 'ללא משמרות',
      'missing-shabbat-end': 'חסרה שעת צאת שבת', 'inactive-slot': 'משמרת סגורה'
    };

    if (!lastReport.issues.length) {
      rows.push([{ v: '✔', s: Xlsx.STYLE.PLAIN }, { v: 'תקין', s: Xlsx.STYLE.PLAIN },
        { v: 'אין כפל משמרות, חוסרים או הפרות אילוצים', s: Xlsx.STYLE.PLAIN }]);
    }
    lastReport.issues.forEach(function (item) {
      rows.push([
        { v: levels[item.level] || item.level, s: Xlsx.STYLE.PLAIN },
        { v: types[item.type] || item.type, s: Xlsx.STYLE.PLAIN },
        { v: item.text, s: Xlsx.STYLE.PLAIN }
      ]);
    });

    return { name: 'בדיקות', cols: [12, 20, 90], freeze: { row: 4, col: 0 }, rows: rows };
  }

  function exportExcel() {
    var bytes = Xlsx.build([branchSheet(), employeeSheet(), issuesSheet()]);
    var blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    saveFile('sidur-' + weekKey + '.xlsx', blob,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  function exportCsv() {
    var rows = [['תאריך', 'יום', 'סניף', 'משמרת', 'שעות', 'עובדים', 'נדרשים', 'משובצים']];
    Data.DAYS.forEach(function (day) {
      state.branches.forEach(function (branch) {
        if (!branch.active) return;
        Data.SHIFTS.forEach(function (shift) {
          var assigned = Store.getAssigned(week(), day.idx, branch.id, shift.id);
          var need = Store.slotNeed(branch, day.idx, shift.id);
          if (!assigned.length && !need) return;
          rows.push([
            Store.formatDate(Store.dateOfDay(weekKey, day.idx)), day.name, branch.name, shift.name,
            Store.hoursLabel(Store.slotHours(week(), branch, day.idx, shift.id)),
            assigned.map(empNameOf).join(' | '), need, assigned.length
          ]);
        });
      });
    });
    var csv = '﻿' + rows.map(function (row) {
      return row.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    saveFile('sidur-' + weekKey + '.csv', csv, 'text/csv;charset=utf-8');
  }

  /* ========== אירועים ========== */
  function bindTabs() {
    $('#tabs').addEventListener('click', function (event) {
      var button = event.target.closest('.tab');
      if (!button) return;
      document.querySelectorAll('.tab').forEach(function (tab) { tab.classList.remove('active'); });
      document.querySelectorAll('.panel').forEach(function (panel) { panel.classList.remove('active'); });
      button.classList.add('active');
      $('#tab-' + button.dataset.tab).classList.add('active');
    });
  }

  function bindScheduleTab() {
    function goToWeek(nextKey) {
      weekKey = nextKey;
      Platform.watchWeek(weekKey);
      render();
    }
    $('#prev-week').addEventListener('click', function () { goToWeek(Store.shiftWeekKey(weekKey, -1)); });
    $('#next-week').addEventListener('click', function () { goToWeek(Store.shiftWeekKey(weekKey, 1)); });
    $('#this-week').addEventListener('click', function () { goToWeek(Store.currentWeekKey()); });

    document.querySelectorAll('.view-switch .chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        view = chip.dataset.view;
        document.querySelectorAll('.view-switch .chip').forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        $('#schedule-branch').classList.toggle('hidden', view !== 'branch');
        $('#schedule-employee').classList.toggle('hidden', view !== 'employee');
      });
    });

    $('#generate').addEventListener('click', function () {
      var current = week();
      var keepManual = $('#keep-manual').checked;
      var result = Scheduler.generate(state, current, { keepManual: keepManual, seed: Date.now() % 100000 });
      if (!keepManual) { current.manual = {}; }
      var kept = {};
      if (keepManual) {
        Object.keys(current.manual).forEach(function (key) { kept[key] = current.assignments[key]; });
      }
      current.assignments = result.assignments;
      Object.keys(kept).forEach(function (key) { if (kept[key]) current.assignments[key] = kept[key]; });
      current.generatedAt = new Date().toISOString();
      persist();
      render();
      toast(result.unfilled.length
        ? 'הסידור נבנה – ' + plural(result.unfilled.length, 'משמרת אחת נותרה', 'משמרות נותרו') + ' ללא איוש'
        : 'הסידור נבנה בהצלחה – כל המשמרות מאוישות');
    });

    $('#clear-week').addEventListener('click', function () {
      if (!confirm('לנקות את כל השיבוצים של השבוע הזה? האילוצים יישמרו.')) return;
      var current = week();
      current.assignments = {};
      current.manual = {};
      persist();
      render();
      toast('הסידור נוקה');
    });

    $('#copy-text').addEventListener('click', function () {
      var text = scheduleAsText();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast('הסידור הועתק ללוח'); },
          function () { window.prompt('העתיקו את הטקסט:', text); });
      } else {
        window.prompt('העתיקו את הטקסט:', text);
      }
    });

    $('#shabbat-end').addEventListener('change', function (event) {
      var normalized = Store.normalizeTimeInput(event.target.value);
      if (normalized === null) {
        toast('שעה לא תקינה – הזינו בפורמט 24 שעות, למשל 19:45');
        render();
        return;
      }
      week().shabbatEnd = normalized;
      persist();
      render();
    });

    $('#export-excel').addEventListener('click', exportExcel);
    $('#export-csv').addEventListener('click', exportCsv);
    $('#print').addEventListener('click', function () {
      if (!Platform.print()) { toast('ההדפסה חסומה כאן – השתמשו ב"העתק כטקסט" או בייצוא CSV'); }
    });

    $('#schedule-branch').addEventListener('change', function (event) {
      var select = event.target.closest('.emp-select');
      if (!select) return;
      var cell = select.closest('td');
      var dayIdx = Number(cell.dataset.day);
      var branchId = cell.dataset.branch;
      var shiftId = cell.dataset.shift;
      var values = Array.prototype.map.call(cell.querySelectorAll('.emp-select'), function (node) { return node.value; })
        .filter(function (value) { return value; });

      var seen = {}, unique = [];
      values.forEach(function (value) { if (!seen[value]) { seen[value] = true; unique.push(value); } });

      var current = week();
      Store.setAssigned(current, dayIdx, branchId, shiftId, unique);
      current.manual[Store.slotKey(dayIdx, branchId, shiftId)] = true;
      persist();
      render();
      if (unique.length !== values.length) { toast('אותו עובד לא יכול להופיע פעמיים באותה משמרת'); }
    });
  }

  function bindConstraintsTab() {
    $('#constraints-grid').addEventListener('click', function (event) {
      var button = event.target.closest('.cstate');
      if (!button) return;
      var empId = button.dataset.emp;
      var dayIdx = Number(button.dataset.day);
      var current = week();
      var constraint = Store.clone(Store.getConstraint(current, empId, dayIdx));
      constraint.blocked = constraint.blocked || {};
      constraint.preferred = constraint.preferred || {};

      if (button.dataset.off) {
        constraint.off = !constraint.off;
        if (constraint.off) { constraint.blocked = {}; constraint.preferred = {}; }
      } else {
        var shiftId = button.dataset.shift;
        constraint.off = false;
        if (constraint.preferred[shiftId]) {            // מעדיף → חסום
          delete constraint.preferred[shiftId];
          constraint.blocked[shiftId] = true;
        } else if (constraint.blocked[shiftId]) {       // חסום → זמין
          delete constraint.blocked[shiftId];
        } else {                                        // זמין → מעדיף
          constraint.preferred[shiftId] = true;
        }
      }
      Store.setConstraint(current, empId, dayIdx, constraint);
      persist();
      render();
    });

    $('#clear-constraints').addEventListener('click', function () {
      if (!confirm('לנקות את כל האילוצים של השבוע הזה?')) return;
      week().constraints = {};
      persist();
      render();
      toast('האילוצים נוקו');
    });

    $('#copy-constraints').addEventListener('click', function () {
      var previous = state.weeks[Store.shiftWeekKey(weekKey, -1)];
      if (!previous || !Object.keys(previous.constraints || {}).length) { toast('אין אילוצים בשבוע הקודם'); return; }
      week().constraints = Store.clone(previous.constraints);
      persist();
      render();
      toast('האילוצים הועתקו מהשבוע הקודם');
    });
  }

  function bindEmployeesTab() {
    $('#add-employee').addEventListener('click', function () {
      state.employees.push({
        id: Store.newId('emp'), name: 'עובד/ת חדש/ה', active: true,
        branches: [], shifts: Data.ALL_SHIFT_IDS.slice(), maxShifts: 6, note: ''
      });
      persist('config');
      render();
    });

    var list = $('#employees-list');
    list.addEventListener('click', function (event) {
      var card = event.target.closest('.card');
      if (!card) return;
      var emp = Store.byId(state.employees, card.dataset.emp);
      if (!emp) return;
      var action = event.target.dataset.action;

      if (action === 'delete-emp') {
        if (!confirm('למחוק את ' + emp.name + '? השיבוצים הקיימים של העובד/ת יוסרו מכל השבועות.')) return;
        state.employees = state.employees.filter(function (item) { return item.id !== emp.id; });
        Object.keys(state.weeks).forEach(function (key) {
          var weekData = state.weeks[key];
          Object.keys(weekData.assignments || {}).forEach(function (slot) {
            weekData.assignments[slot] = weekData.assignments[slot].filter(function (id) { return id !== emp.id; });
            if (!weekData.assignments[slot].length) delete weekData.assignments[slot];
          });
          Object.keys(weekData.constraints || {}).forEach(function (constraintKey) {
            if (constraintKey.indexOf(emp.id + '|') === 0) delete weekData.constraints[constraintKey];
          });
        });
        persist('all');
        render();
        return;
      }
      if (action === 'toggle-branch') {
        var branchId = event.target.dataset.branch;
        var index = emp.branches.indexOf(branchId);
        if (index === -1) emp.branches.push(branchId); else emp.branches.splice(index, 1);
        persist('config');
        render();
      }
      if (action === 'toggle-shift') {
        var shiftId = event.target.dataset.shift;
        var pos = emp.shifts.indexOf(shiftId);
        if (pos === -1) emp.shifts.push(shiftId); else emp.shifts.splice(pos, 1);
        persist('config');
        render();
      }
    });

    list.addEventListener('change', function (event) {
      var card = event.target.closest('.card');
      if (!card) return;
      var emp = Store.byId(state.employees, card.dataset.emp);
      var field = event.target.dataset.field;
      if (!emp || !field) return;
      if (field === 'active') emp.active = event.target.checked;
      else if (field === 'maxShifts') emp.maxShifts = Math.max(0, Number(event.target.value) || 0);
      else emp[field] = event.target.value;
      persist('config');
      if (field === 'active' || field === 'maxShifts') render();
    });
  }

  function bindBranchesTab() {
    $('#add-branch').addEventListener('click', function () {
      state.branches.push({
        id: Store.newId('br'), name: 'סניף חדש', active: true,
        need: { morning: 1, middle: 1, evening: 1 }
      });
      persist('config');
      render();
    });

    var list = $('#branches-list');
    list.addEventListener('click', function (event) {
      if (event.target.dataset.action !== 'delete-branch') return;
      var card = event.target.closest('.card');
      var branch = Store.byId(state.branches, card.dataset.branch);
      if (!branch) return;
      if (!confirm('למחוק את ' + branch.name + '? השיבוצים של הסניף יוסרו מכל השבועות.')) return;
      state.branches = state.branches.filter(function (item) { return item.id !== branch.id; });
      state.employees.forEach(function (emp) {
        emp.branches = emp.branches.filter(function (id) { return id !== branch.id; });
      });
      Object.keys(state.weeks).forEach(function (key) {
        var weekData = state.weeks[key];
        Object.keys(weekData.assignments || {}).forEach(function (slot) {
          if (slot.split('|')[1] === branch.id) delete weekData.assignments[slot];
        });
      });
      persist('all');
      render();
    });

    list.addEventListener('change', function (event) {
      var card = event.target.closest('.card');
      if (!card) return;
      var branch = Store.byId(state.branches, card.dataset.branch);
      if (!branch) return;
      var input = event.target;

      if (input.dataset.action === 'copy-schedule') {
        var source = Store.byId(state.branches, input.value);
        if (!source) return;
        if (!confirm('להעתיק את הימים והשעות מ' + source.name + ' אל ' + branch.name + '?')) {
          input.value = '';
          return;
        }
        branch.schedule = Store.clone(source.schedule);
        persist('config');
        render();
        toast('הימים והשעות הועתקו');
        return;
      }

      if (input.dataset.sched) {
        var cell = input.closest('.sched-cell');
        var dayIdx = cell.dataset.day;
        var shiftId = cell.dataset.shift;
        if (!branch.schedule[dayIdx]) branch.schedule[dayIdx] = {};
        var config = branch.schedule[dayIdx][shiftId];

        if (input.dataset.sched === 'need') {
          var need = Math.max(0, Number(input.value) || 0);
          if (need === 0) { delete branch.schedule[dayIdx][shiftId]; }
          else if (config) { config.need = need; }
          else {
            var template = Data.defaultSchedule();
            var fallback = (template[dayIdx] && template[dayIdx][shiftId]) ||
              (template[0] && template[0][shiftId]) || { from: '09:00', to: '17:00' };
            branch.schedule[dayIdx][shiftId] = Object.assign({}, fallback, { need: need });
          }
        } else if (config) {
          if (input.dataset.sched === 'auto') {
            if (input.checked) { config.auto = 'motzash'; delete config.from; }
            else { delete config.auto; config.from = config.from || '20:30'; }
          } else {
            var normalized = Store.normalizeTimeInput(input.value);
            if (normalized === null) {
              toast('שעה לא תקינה – הזינו בפורמט 24 שעות, למשל 14:30');
              render();
              return;
            }
            config[input.dataset.sched] = normalized;
          }
        }
        Store.normalizeSchedule(branch.schedule);
        persist('config');
        render();
        return;
      }

      var field = input.dataset.field;
      if (field === 'active') { branch.active = input.checked; persist('config'); render(); }
      else if (field) { branch[field] = input.value; persist('config'); render(); }
    });
  }

  function bindSettingsTab() {
    $('#opt-one-per-day').addEventListener('change', function (event) {
      state.settings.onePerDay = event.target.checked;
      persist('config');
      render();
    });
    $('#opt-rest').addEventListener('change', function (event) {
      state.settings.restEveningMorning = event.target.checked;
      persist('config');
      render();
    });
    $('#default-shabbat').addEventListener('change', function (event) {
      var normalized = Store.normalizeTimeInput(event.target.value);
      if (normalized === null) {
        toast('שעה לא תקינה – הזינו בפורמט 24 שעות, למשל 20:00');
        render();
        return;
      }
      state.settings.defaultShabbatEnd = normalized;
      persist('config');
      render();
    });

    $('#export-json').addEventListener('click', function () {
      saveFile('maiphone-shifts-backup.json', JSON.stringify(state, null, 2), 'application/json');
    });

    $('#import-json').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          state = Store.migrate(JSON.parse(reader.result));
          persist('all');
          render();
          toast('הנתונים יובאו בהצלחה');
        } catch (err) {
          alert('קובץ לא תקין: ' + err.message);
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    });

    $('#reset-all').addEventListener('click', function () {
      if (!confirm('לאפס את כל הנתונים (עובדים, סניפים, סידורים ואילוצים) לברירת המחדל?')) return;
      state = Store.emptyState();
      persist('all');
      render();
      toast('הנתונים אופסו');
    });
  }

  /* ========== סנכרון בין מכשירים ========== */
  function renderSyncState(status) {
    var node = $('#sync-state');
    if (!node) return;
    var labels = {
      live: 'מסונכרן בין המכשירים',
      local: 'נשמר במכשיר הזה',
      readonly: 'צפייה בלבד – אין הרשאת עריכה'
    };
    node.textContent = labels[status] || labels.local;
    node.className = 'sync-state ' + status;
  }

  function applyRemoteConfig(remote) {
    if (remote.settings) state.settings = remote.settings;
    if (Array.isArray(remote.branches)) state.branches = remote.branches;
    if (Array.isArray(remote.employees)) state.employees = remote.employees;
    state = Store.migrate(state);
    Store.save(state);
    render();
  }

  function applyRemoteWeek(key, remote) {
    var target = Store.getWeek(state, key);
    target.constraints = remote.constraints || {};
    target.assignments = remote.assignments || {};
    target.manual = remote.manual || {};
    target.note = remote.note || '';
    Store.save(state);
    if (key === weekKey) render();
  }

  document.documentElement.setAttribute('dir', 'rtl');
  document.documentElement.setAttribute('lang', 'he');

  bindTabs();
  bindScheduleTab();
  bindConstraintsTab();
  bindEmployeesTab();
  bindBranchesTab();
  bindSettingsTab();
  render();

  Platform.init({
    getState: function () { return state; },
    weekKey: function () { return weekKey; },
    onConfig: applyRemoteConfig,
    onWeek: applyRemoteWeek,
    onSyncState: renderSyncState
  });
})();
