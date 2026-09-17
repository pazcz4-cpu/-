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
  var mobileDay = new Date().getDay();
  var VIEW_ONLY_KEY = 'maiphone-shifts-view-only';
  /* מצב צפייה הוא העדפה של המכשיר הזה בלבד – הוא לא נשמר בנתונים
     ולא עובר בייצוא, כדי שהעובד לא יירש אותו. */
  var viewOnly = (function () {
    try { return window.localStorage.getItem(VIEW_ONLY_KEY) === '1'; }
    catch (err) { return false; }
  })();
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

  /* שער יחיד לכל פעולה שמשנה נתונים */
  function blocked() {
    if (!viewOnly) return false;
    toast('מצב צפייה – העריכה חסומה. אפשר לכבות אותו בכפתור שבראש המסך.');
    return true;
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

    renderHolidays();

    var current = week();
    var field = $('#shabbat-end');
    field.value = current.shabbatEnd || '';
    var needsMotzash = state.branches.some(function (branch) {
      return branch.active && Store.slotConfig(branch, Data.MOTZASH.dayIdx, 'evening');
    });
    $('#shabbat-field').classList.toggle('hidden', !needsMotzash);
  }

  /* ========== תצוגת נייד: יום אחד בכל פעם ========== */
  function renderDayNav(container, selected) {
    var html = '';
    Data.DAYS.forEach(function (day) {
      var isHoliday = Store.isHoliday(week(), day.idx);
      var classes = 'day-tab' + (day.idx === selected ? ' active' : '') + (isHoliday ? ' holiday' : '');
      html += '<button class="' + classes + '" data-day="' + day.idx + '">' +
        '<span class="day-tab-name">' + day.short + '</span>' +
        '<span class="day-tab-date">' + Store.formatDate(Store.dateOfDay(weekKey, day.idx)) + '</span>' +
        '</button>';
    });
    $(container).innerHTML = html;
  }

  function mobileSelectHtml(dayIdx, branch, shiftId, slotIndex, value, isExtra) {
    var html = '<select class="emp-select' + (isExtra ? ' extra' : '') + '" data-slot="' + slotIndex + '">';
    html += '<option value="">' + (isExtra ? '+ הוסף עובד' : '— לא משובץ —') + '</option>';
    state.employees.forEach(function (emp) {
      html += '<option value="' + esc(emp.id) + '"' + (value === emp.id ? ' selected' : '') + '>' +
        esc(optionLabel(emp, dayIdx, branch.id, shiftId)) + '</option>';
    });
    if (value && !Store.byId(state.employees, value)) {
      html += '<option value="' + esc(value) + '" selected>' + esc(empNameOf(value)) + '</option>';
    }
    return html + '</select>';
  }

  function renderMobileSchedule(marks) {
    var current = week();
    var day = Data.DAYS[mobileDay];
    var html = '';

    if (Store.isHoliday(current, mobileDay)) {
      html = '<div class="m-card holiday"><div class="m-card-head">' + esc(day.name) + '</div>' +
        '<div class="m-holiday">' + esc(Store.holidayName(current, mobileDay)) +
        '<small>כל הסניפים סגורים – יום חופש לכל העובדים</small></div></div>';
      $('#schedule-mobile').innerHTML = html;
      return;
    }

    var activeBranches = state.branches.filter(function (branch) { return branch.active; });
    activeBranches.forEach(function (branch) {
      var shiftsHtml = '';
      Data.SHIFTS.forEach(function (shift) {
        var need = Store.slotNeed(branch, mobileDay, shift.id);
        var assigned = Store.getAssigned(current, mobileDay, branch.id, shift.id);
        if (!need && !assigned.length) return;

        var key = Store.slotKey(mobileDay, branch.id, shift.id);
        var flag = marks.cells[key];
        var hours = Store.hoursLabel(Store.slotHours(current, branch, mobileDay, shift.id));
        var rows = Math.max(need, assigned.length) + 1;

        shiftsHtml += '<div class="m-shift ' + shiftClass(shift.id) +
          (flag ? ' flag-' + flag : '') + '" data-day="' + mobileDay +
          '" data-branch="' + esc(branch.id) + '" data-shift="' + shift.id + '">';
        shiftsHtml += '<div class="m-shift-head"><b>' + shift.name + '</b>' +
          '<span>' + (hours ? esc(hours) : 'ללא שעות') +
          (need > 1 ? ' · ' + need + ' עובדים' : '') + '</span></div>';
        for (var i = 0; i < rows; i++) {
          shiftsHtml += mobileSelectHtml(mobileDay, branch, shift.id, i, assigned[i] || '', i >= need);
        }
        shiftsHtml += '</div>';
      });

      if (!shiftsHtml) {
        shiftsHtml = '<div class="m-closed">הסניף סגור ביום זה</div>';
      }
      html += '<div class="m-card"><div class="m-card-head">' + esc(branch.name) + '</div>' + shiftsHtml + '</div>';
    });

    if (!activeBranches.length) {
      html = '<div class="m-card"><div class="m-closed">לא הוגדרו סניפים פעילים.</div></div>';
    }
    $('#schedule-mobile').innerHTML = html;
  }

  function renderMobileConstraints() {
    var current = week();
    var day = Data.DAYS[mobileDay];

    if (Store.isHoliday(current, mobileDay)) {
      $('#constraints-mobile').innerHTML = '<div class="m-card holiday"><div class="m-holiday">' +
        esc(Store.holidayName(current, mobileDay)) + '<small>יום חג – אין צורך באילוצים</small></div></div>';
      return;
    }

    var dayShifts = Store.activeShiftsForDay(state, mobileDay, current);
    if (!dayShifts.length) {
      $('#constraints-mobile').innerHTML = '<div class="m-card"><div class="m-closed">' +
        'כל הסניפים סגורים ב' + day.name + '.</div></div>';
      return;
    }

    var html = '';
    state.employees.forEach(function (emp) {
      if (!emp.active) return;
      var constraint = Store.getConstraint(current, emp.id, mobileDay);
      html += '<div class="m-card m-constraint"><div class="m-card-head">' + esc(emp.name) + '</div>';
      html += '<div class="m-cstates">';
      dayShifts.forEach(function (shiftId) {
        var cls = 'free', title = 'זמין';
        if (constraint.off) { cls = 'off-day'; title = 'יום חופש'; }
        else if (constraint.blocked && constraint.blocked[shiftId]) { cls = 'block'; title = 'לא יכול/ה'; }
        else if (constraint.preferred && constraint.preferred[shiftId]) { cls = 'pref'; title = 'מעדיף/ה'; }
        html += '<button class="cstate ' + cls + '" title="' + title + '" data-emp="' + esc(emp.id) +
          '" data-day="' + mobileDay + '" data-shift="' + shiftId + '">' +
          Data.shiftById(shiftId).name + '</button>';
      });
      html += '<button class="cstate ' + (constraint.off ? 'off-day' : 'free') +
        '" data-emp="' + esc(emp.id) + '" data-day="' + mobileDay + '" data-off="1">' +
        (constraint.off ? '✓ חופש' : 'חופש') + '</button>';
      html += '</div></div>';
    });
    $('#constraints-mobile').innerHTML = html;
  }

  /* ========== ימי חג ========== */
  function renderHolidays() {
    var current = week();
    var html = '';
    Data.DAYS.forEach(function (day) {
      var on = Store.isHoliday(current, day.idx);
      html += '<button class="chip holiday-chip' + (on ? ' active' : '') + '" data-day="' + day.idx + '">' +
        day.name + (on ? ' · ' + esc(Store.holidayName(current, day.idx)) : '') + '</button>';
    });
    $('#holiday-days').innerHTML = html;
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
          if (Store.isHoliday(week(), day.idx) && !assigned.length) {
            if (shiftIndex === 0) {
              html += '<td class="closed holiday-cell" rowspan="' + Data.SHIFTS.length + '">' +
                esc(Store.holidayName(week(), day.idx)) + '<br><small>הסניפים סגורים</small></td>';
            }
            return;
          }
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
          if (Store.isHoliday(week(), day.idx)) {
            content = '<span class="empty-cell holiday-text">' + esc(Store.holidayName(week(), day.idx)) + '</span>';
          } else {
            content = constraint.off ? '<span class="empty-cell">חופש</span>' : '<span class="empty-cell">—</span>';
          }
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
  function isMobile() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 820px)').matches;
  }

  function plural(count, singular, pluralWord) {
    return count === 1 ? singular : count + ' ' + pluralWord;
  }

  function renderIssues(report) {
    var container = $('#issues');
    // בנייד ההתראות מקופלות כברירת מחדל, כדי שהסידור עצמו יהיה מיד על המסך
    var limit = isMobile() ? 0 : 6;
    var visible = showAllIssues ? report.issues : report.issues.slice(0, limit);
    var html = '<div class="issues-summary">';
    if (report.errors) html += '<span class="badge error">' + plural(report.errors, 'שגיאה אחת', 'שגיאות') + '</span>';
    if (report.warnings) html += '<span class="badge warning">' + plural(report.warnings, 'אזהרה אחת', 'אזהרות') + '</span>';
    if (report.infos) html += '<span class="badge info">' + plural(report.infos, 'הערה אחת', 'הערות') + '</span>';
    if (!report.issues.length) html += '<span class="badge ok">✔ הסידור תקין – אין כפל משמרות, חוסרים או הפרות אילוצים</span>';
    if (report.issues.length > limit) {
      html += '<button class="issues-toggle" id="toggle-issues">' +
        (showAllIssues ? 'הסתרת ההתראות' : 'הצג את ' + plural(report.issues.length, 'ההתראה', 'ההתראות')) +
        '</button>';
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

  function dayNames(dayIndexes) {
    return dayIndexes.map(function (idx) { return Data.DAYS[idx].name; }).join(', ');
  }

  function shiftsWord(count) {
    return count === 1 ? 'משמרת אחת' : count + ' משמרות';
  }

  function remainVerb(count) {
    return count === 1 ? 'נותרה' : 'נותרו';
  }

  /* ========== סיכום: מה נותר פנוי ========== */
  function renderAvailability() {
    var summary = Store.weekAvailability(state, week());
    var html = '<h3 class="summary-title">מה נותר פנוי השבוע</h3>';

    if (!summary.rows.length) {
      $('#availability').innerHTML = html + '<p class="summary-empty">לא הוגדרו עובדים פעילים.</p>';
      return;
    }

    if (summary.freeSlots === 0) {
      var reason = summary.totalSpare === 0
        ? 'כל העובדים הגיעו למכסת המשמרות השבועית שלהם.'
        : 'לעובדים שנותרה להם מכסה אין יום פנוי שבו הסניפים שלהם פתוחים.';
      html += '<p class="summary-line none">אין יתרת זמינות – ' + reason + '</p>';
    } else {
      html += '<p class="summary-line total">' + remainVerb(summary.freeSlots) + ' <b>' +
        shiftsWord(summary.freeSlots) + '</b> שאפשר עוד לשבץ, אצל ' +
        (summary.withSpare.length === 1 ? 'עובד/ת אחד/ת' : summary.withSpare.length + ' עובדים') + ':</p>';
    }

    html += '<ul class="summary-list">';
    summary.rows.forEach(function (row) {
      var cls = row.available > 0 ? 'has-spare' : (row.spare > 0 ? 'no-days' : 'full');
      var text = '<b>' + esc(row.name) + '</b> – ';
      if (row.available > 0) {
        text += remainVerb(row.spare) + ' ' + shiftsWord(row.spare) + ' במכסה · פנוי/ה ב' +
          dayNames(row.freeDays);
      } else if (row.spare > 0) {
        text += remainVerb(row.spare) + ' ' + shiftsWord(row.spare) + ' במכסה, אך אין יום פנוי השבוע';
      } else {
        text += 'מנוצל/ת במלואו/ה (' + row.assigned + ' מתוך ' + row.max + ')';
      }
      html += '<li class="' + cls + '">' + text + '</li>';
    });
    html += '</ul>';

    $('#availability').innerHTML = html;
  }

  function renderPersonalPicker() {
    var select = $('#personal-employee');
    var previous = select.value;
    var html = '<option value="">בחרו עובד…</option>';
    state.employees.forEach(function (emp) {
      if (!emp.active) return;
      var count = Store.employeeWeekCount(state, week(), emp.id);
      html += '<option value="' + esc(emp.id) + '">' + esc(emp.name) + ' (' + count + ')</option>';
    });
    select.innerHTML = html;
    if (previous && Store.byId(state.employees, previous)) select.value = previous;
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
        if (Store.isHoliday(week(), day.idx)) {
          html += '<td class="closed holiday-cell">' + esc(Store.holidayName(week(), day.idx)) + '</td>';
          return;
        }
        var dayShifts = Store.activeShiftsForDay(state, day.idx, week());
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
    $('#opt-one-day-off').checked = !!state.settings.oneDayOffPerWeek;
    $('#default-shabbat').value = state.settings.defaultShabbatEnd || '';
  }

  var LOCKED_SELECTORS = [
    'select.emp-select', '.cstate', '.pill', '.holiday-chip',
    '#generate', '#clear-week', '#keep-manual', '#shabbat-end',
    '#clear-constraints', '#copy-constraints',
    '#add-employee', '#add-branch',
    '#employees-list input', '#employees-list button',
    '#branches-list input', '#branches-list button', '#branches-list select',
    '#opt-one-per-day', '#opt-rest', '#opt-one-day-off', '#default-shabbat',
    '#reset-all'
  ];

  function applyViewOnly() {
    document.body.classList.toggle('view-only', viewOnly);
    $('#view-only-banner').classList.toggle('hidden', !viewOnly);

    var button = $('#view-only-toggle');
    button.textContent = viewOnly ? '🔓 יציאה ממצב צפייה' : '🔒 מצב צפייה';
    button.setAttribute('aria-pressed', viewOnly ? 'true' : 'false');

    LOCKED_SELECTORS.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (node) {
        node.disabled = viewOnly;
      });
    });
  }

  /* ========== רינדור כולל ========== */
  function render() {
    renderWeekHeader();
    lastReport = Validate.validate(state, week());
    var marks = issueMaps(lastReport);
    renderIssues(lastReport);
    renderDayNav('#day-nav', mobileDay);
    renderDayNav('#constraints-day-nav', mobileDay);
    renderMobileSchedule(marks);
    renderMobileConstraints();
    renderBranchView(marks);
    renderEmployeeView(marks);
    renderWorkload();
    renderAvailability();
    renderPersonalPicker();
    renderConstraints();
    renderEmployees();
    renderBranches();
    renderSettings();
    applyViewOnly();
  }

  /* ========== ייצוא ========== */
  function scheduleAsText() {
    var lines = ['סידור עבודה – שבוע ' + Store.formatDate(Store.dateOfDay(weekKey, 0)) +
      ' עד ' + Store.formatDate(Store.dateOfDay(weekKey, 6)), ''];
    Data.DAYS.forEach(function (day) {
      if (Store.isHoliday(week(), day.idx)) {
        lines.push('📅 יום ' + day.name + ' (' + Store.formatDate(Store.dateOfDay(weekKey, day.idx)) + ')');
        lines.push('   ' + Store.holidayName(week(), day.idx) + ' – כל הסניפים סגורים', '');
        return;
      }
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
    var summary = Store.weekAvailability(state, week());
    if (summary.freeSlots) {
      lines.push('— ' + remainVerb(summary.freeSlots) + ' ' + shiftsWord(summary.freeSlots) +
        ' שאפשר עוד לשבץ —');
    }
    return lines.join('\n');
  }

  /* שינוי שיבוץ – משותף לתצוגת המחשב ולתצוגת הנייד */
  function applyCellChange(cell, dayIdx, branchId, shiftId) {
    if (blocked()) { render(); return; }
    var values = Array.prototype.map.call(cell.querySelectorAll('.emp-select'), function (node) {
      return node.value;
    }).filter(function (value) { return value; });

    var seen = {}, unique = [];
    values.forEach(function (value) { if (!seen[value]) { seen[value] = true; unique.push(value); } });

    var current = week();
    Store.setAssigned(current, dayIdx, branchId, shiftId, unique);
    current.manual[Store.slotKey(dayIdx, branchId, shiftId)] = true;
    persist();
    render();
    if (unique.length !== values.length) { toast('אותו עובד לא יכול להופיע פעמיים באותה משמרת'); }
  }

  function copyText(text, message) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(message); },
        function () { window.prompt('העתיקו את הטקסט:', text); });
    } else {
      window.prompt('העתיקו את הטקסט:', text);
    }
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
          if (Store.isHoliday(current, day.idx) && !assigned.length) {
            cells.push({ v: Store.holidayName(current, day.idx) + '\nסגור', s: Xlsx.STYLE.CLOSED });
            return;
          }
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
          var empty = Store.isHoliday(current, day.idx)
            ? Store.holidayName(current, day.idx)
            : (constraint.off ? 'חופש' : '—');
          cells.push({ v: empty, s: Xlsx.STYLE.CLOSED });
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

  /* ===== ייצוא אישי: רק המשמרות של עובד אחד ===== */
  function personalRows(empId) {
    var current = week();
    var rows = [];
    Data.DAYS.forEach(function (day) {
      var slots = Store.employeeDayAssignments(state, current, empId, day.idx);
      var constraint = Store.getConstraint(current, empId, day.idx);
      var date = Store.formatDate(Store.dateOfDay(weekKey, day.idx));

      if (!slots.length) {
        var status = Store.isHoliday(current, day.idx)
          ? Store.holidayName(current, day.idx)
          : (constraint.off ? 'יום חופש' : 'לא משובץ');
        rows.push({ day: day.name, date: date, status: status, working: false });
        return;
      }
      slots.forEach(function (slot) {
        var shift = Data.shiftById(slot.shiftId);
        var branch = Store.byId(state.branches, slot.branchId) || {};
        rows.push({
          day: day.name, date: date, working: true,
          branch: branchNameOf(slot.branchId),
          shift: shift ? shift.name : slot.shiftId,
          hours: Store.hoursLabel(Store.slotHours(current, branch, day.idx, slot.shiftId))
        });
      });
    });
    return rows;
  }

  function personalSheet(emp, options) {
    var opts = options || {};
    var rows = [];
    var data = personalRows(emp.id);
    var total = data.filter(function (row) { return row.working; }).length;

    rows.push({ cells: [{ v: 'סידור אישי – ' + emp.name, s: Xlsx.STYLE.TITLE }], height: 22 });
    rows.push([{ v: weekTitle(), s: Xlsx.STYLE.SUBTITLE }]);
    rows.push([{ v: 'סה״כ ' + shiftsWord(total) + ' השבוע', s: Xlsx.STYLE.SUBTITLE }]);
    rows.push({
      cells: [{ v: 'יום', s: Xlsx.STYLE.HEADER }, { v: 'תאריך', s: Xlsx.STYLE.HEADER },
        { v: 'סניף', s: Xlsx.STYLE.HEADER }, { v: 'משמרת', s: Xlsx.STYLE.HEADER },
        { v: 'שעות', s: Xlsx.STYLE.HEADER }],
      height: 22
    });

    data.forEach(function (row) {
      if (!row.working) {
        rows.push([
          { v: row.day, s: Xlsx.STYLE.ROW_HEAD }, { v: row.date, s: Xlsx.STYLE.CLOSED },
          { v: row.status, s: Xlsx.STYLE.CLOSED }, { v: '', s: Xlsx.STYLE.CLOSED },
          { v: '', s: Xlsx.STYLE.CLOSED }
        ]);
        return;
      }
      rows.push([
        { v: row.day, s: Xlsx.STYLE.ROW_HEAD }, { v: row.date, s: Xlsx.STYLE.PLAIN },
        { v: row.branch, s: Xlsx.STYLE.PLAIN }, { v: row.shift, s: Xlsx.STYLE.PLAIN },
        { v: row.hours || '', s: Xlsx.STYLE.PLAIN }
      ]);
    });

    return {
      name: opts.name || 'סידור אישי',
      selected: opts.selected !== false,
      cols: [12, 10, 22, 12, 16],
      freeze: { row: 4, col: 0 },
      rows: rows
    };
  }

  /* העובדים שמקבלים לשונית אישית: פעילים, וגם מי שמשובץ השבוע */
  function employeesForSheets() {
    var current = week();
    return state.employees.filter(function (emp) {
      return emp.active || Store.employeeWeekCount(state, current, emp.id) > 0;
    });
  }

  function exportPersonalExcel(empId) {
    var emp = Store.byId(state.employees, empId);
    if (!emp) return;
    var bytes = Xlsx.build([personalSheet(emp)]);
    var blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    var safeName = emp.name.replace(/[\\\/:*?"<>|]/g, '').trim() || 'עובד';
    saveFile('סידור-' + safeName + '-' + weekKey + '.xlsx', blob,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  function personalText(empId) {
    var emp = Store.byId(state.employees, empId);
    if (!emp) return '';
    var data = personalRows(empId);
    var total = data.filter(function (row) { return row.working; }).length;
    var lines = ['שלום ' + emp.name + ', זה הסידור שלך:', weekTitle(), ''];
    data.forEach(function (row) {
      if (row.working) {
        lines.push('📅 ' + row.day + ' ' + row.date + ' – ' + row.branch + ' · ' + row.shift +
          (row.hours ? ' · ' + row.hours : ''));
      } else if (row.status !== 'לא משובץ') {
        lines.push('📅 ' + row.day + ' ' + row.date + ' – ' + row.status);
      }
    });
    lines.push('', 'סה״כ ' + shiftsWord(total) + ' השבוע.');
    return lines.join('\n');
  }

  function availabilitySheet() {
    var summary = Store.weekAvailability(state, week());
    var rows = [];

    rows.push({ cells: [{ v: 'מה נותר פנוי', s: Xlsx.STYLE.TITLE }], height: 22 });
    rows.push([{ v: weekTitle(), s: Xlsx.STYLE.SUBTITLE }]);
    rows.push([{
      v: summary.freeSlots
        ? remainVerb(summary.freeSlots) + ' ' + shiftsWord(summary.freeSlots) + ' שאפשר עוד לשבץ'
        : 'אין יתרת זמינות – אי אפשר לשבץ משמרות נוספות השבוע',
      s: Xlsx.STYLE.SUBTITLE
    }]);
    rows.push([{ v: 'עובד', s: Xlsx.STYLE.HEADER }, { v: 'משובץ', s: Xlsx.STYLE.HEADER },
      { v: 'מכסה', s: Xlsx.STYLE.HEADER }, { v: 'נותרו במכסה', s: Xlsx.STYLE.HEADER },
      { v: 'ניתן לשבץ', s: Xlsx.STYLE.HEADER }, { v: 'ימים פנויים', s: Xlsx.STYLE.HEADER }]);

    summary.rows.forEach(function (row) {
      rows.push([
        { v: row.name, s: Xlsx.STYLE.ROW_HEAD },
        { v: row.assigned, s: Xlsx.STYLE.TOTAL },
        { v: row.max, s: Xlsx.STYLE.TOTAL },
        { v: row.spare, s: Xlsx.STYLE.TOTAL },
        { v: row.available, s: Xlsx.STYLE.TOTAL },
        { v: row.freeDays.length ? dayNames(row.freeDays) : '—', s: Xlsx.STYLE.PLAIN }
      ]);
    });

    return { name: 'מה נותר פנוי', cols: [22, 10, 10, 14, 12, 40], freeze: { row: 4, col: 1 }, rows: rows };
  }

  function exportExcel() {
    var sheets = [branchSheet(), employeeSheet(), availabilitySheet(), issuesSheet()];
    // לשונית נפרדת לכל עובד, עם המשמרות שלו בלבד
    employeesForSheets().forEach(function (emp) {
      sheets.push(personalSheet(emp, { name: emp.name, selected: false }));
    });
    var bytes = Xlsx.build(sheets);
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
          if (Store.isHoliday(week(), day.idx) && !assigned.length) return;
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
      if (blocked()) return;
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
      if (blocked()) return;
      if (!confirm('לנקות את כל השיבוצים של השבוע הזה? האילוצים יישמרו.')) return;
      var current = week();
      current.assignments = {};
      current.manual = {};
      persist();
      render();
      toast('הסידור נוקה');
    });

    $('#copy-text').addEventListener('click', function () {
      copyText(scheduleAsText(), 'הסידור הועתק ללוח');
    });

    $('#view-only-toggle').addEventListener('click', function () {
      viewOnly = !viewOnly;
      try { window.localStorage.setItem(VIEW_ONLY_KEY, viewOnly ? '1' : '0'); } catch (err) { /* לא קריטי */ }
      render();
      toast(viewOnly
        ? 'מצב צפייה הופעל – העריכה חסומה'
        : 'מצב צפייה כובה – אפשר לערוך');
    });

    $('#tools-toggle').addEventListener('click', function () {
      var panel = $('#more-tools');
      var open = panel.classList.toggle('open');
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
      this.textContent = open ? '✕ סגירת הכלים' : '⋯ כלים נוספים';
    });

    function bindDayNav(selector) {
      $(selector).addEventListener('click', function (event) {
        var tab = event.target.closest('.day-tab');
        if (!tab) return;
        mobileDay = Number(tab.dataset.day);
        render();
      });
    }
    bindDayNav('#day-nav');
    bindDayNav('#constraints-day-nav');

    $('#schedule-mobile').addEventListener('change', function (event) {
      var select = event.target.closest('.emp-select');
      if (!select) return;
      var cell = select.closest('.m-shift');
      applyCellChange(cell, Number(cell.dataset.day), cell.dataset.branch, cell.dataset.shift);
    });

    $('#holiday-days').addEventListener('click', function (event) {
      var chip = event.target.closest('.holiday-chip');
      if (!chip) return;
      if (blocked()) return;
      var dayIdx = Number(chip.dataset.day);
      var current = week();

      if (Store.isHoliday(current, dayIdx)) {
        Store.setHoliday(current, dayIdx, null);
        persist();
        render();
        toast(Data.DAYS[dayIdx].name + ' חזר להיות יום עבודה');
        return;
      }

      var name = window.prompt('שם החג ביום ' + Data.DAYS[dayIdx].name +
        ' (הסניפים ייסגרו והיום ייחשב חופש לכל העובדים):', 'חג');
      if (name === null) return;

      var assignedCount = 0;
      state.employees.forEach(function (emp) {
        assignedCount += Store.employeeDayAssignments(state, current, emp.id, dayIdx).length;
      });
      if (assignedCount && !confirm('ביום הזה כבר משובצים ' + assignedCount +
        ' עובדים. לסמן כחג ולנקות את השיבוצים?')) return;

      if (assignedCount) {
        state.branches.forEach(function (branch) {
          Data.ALL_SHIFT_IDS.forEach(function (shiftId) {
            Store.setAssigned(current, dayIdx, branch.id, shiftId, []);
            delete current.manual[Store.slotKey(dayIdx, branch.id, shiftId)];
          });
        });
      }
      Store.setHoliday(current, dayIdx, name.trim());
      persist();
      render();
      toast('יום ' + Data.DAYS[dayIdx].name + ' סומן כחג – הסניפים סגורים');
    });

    $('#shabbat-end').addEventListener('change', function (event) {
      if (blocked()) { render(); return; }
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

    $('#personal-excel').addEventListener('click', function () {
      var empId = $('#personal-employee').value;
      if (!empId) { toast('בחרו עובד לייצוא אישי'); return; }
      exportPersonalExcel(empId);
    });

    $('#personal-text').addEventListener('click', function () {
      var empId = $('#personal-employee').value;
      if (!empId) { toast('בחרו עובד לייצוא אישי'); return; }
      copyText(personalText(empId), 'הסידור האישי הועתק ללוח');
    });
    $('#export-csv').addEventListener('click', exportCsv);
    $('#print').addEventListener('click', function () {
      if (!Platform.print()) { toast('ההדפסה חסומה כאן – השתמשו ב"העתק כטקסט" או בייצוא CSV'); }
    });

    $('#schedule-branch').addEventListener('change', function (event) {
      var select = event.target.closest('.emp-select');
      if (!select) return;
      var cell = select.closest('td');
      applyCellChange(cell, Number(cell.dataset.day), cell.dataset.branch, cell.dataset.shift);
    });
  }

  function bindConstraintsTab() {
    function onConstraintClick(event) {
      var button = event.target.closest('.cstate');
      if (!button) return;
      if (blocked()) return;
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
    }

    $('#constraints-grid').addEventListener('click', onConstraintClick);
    $('#constraints-mobile').addEventListener('click', onConstraintClick);

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
    $('#opt-one-day-off').addEventListener('change', function (event) {
      state.settings.oneDayOffPerWeek = event.target.checked;
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
          // ייבוא מביא שבועות שלמים – מעלים את כולם ולא רק את השבוע המוצג
          Platform.pushAllWeeks().then(function (saved) {
            toast(saved
              ? 'הנתונים יובאו והועלו לענן (' + saved + ' שבועות)'
              : 'הנתונים יובאו בהצלחה');
          });
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

  /* ========== צ'אט שאלות על הסידור ========== */
  var chatHistory = [];
  var chatBusy = false;

  /* תיאור טקסטואלי של כל מה שרלוונטי לשבוע המוצג */
  function chatContext() {
    var current = week();
    var parts = [weekTitle()];
    if (current.shabbatEnd) parts.push('צאת שבת: ' + current.shabbatEnd);

    var holidays = [];
    Data.DAYS.forEach(function (day) {
      if (Store.isHoliday(current, day.idx)) {
        holidays.push(day.name + ' (' + Store.holidayName(current, day.idx) + ')');
      }
    });
    parts.push(holidays.length ? 'ימי חג סגורים: ' + holidays.join(', ') : 'אין ימי חג השבוע.');

    parts.push('', 'כללי שיבוץ:');
    parts.push('- ' + (state.settings.onePerDay ? 'עובד משובץ למשמרת אחת ביום לכל היותר.' : 'עובד יכול לעשות כמה משמרות ביום.'));
    parts.push('- ' + (state.settings.restEveningMorning ? 'אין משמרת בוקר אחרי משמרת ערב של היום הקודם.' : 'אין מגבלת מנוחה בין ערב לבוקר.'));

    parts.push('', 'סניפים:');
    state.branches.forEach(function (branch) {
      if (!branch.active) return;
      var days = [];
      Data.DAYS.forEach(function (day) {
        var open = [];
        Data.ALL_SHIFT_IDS.forEach(function (shiftId) {
          var need = Store.slotNeed(branch, day.idx, shiftId);
          if (!need) return;
          var hours = Store.hoursLabel(Store.slotHours(current, branch, day.idx, shiftId));
          open.push(Data.shiftById(shiftId).name + ' ' + hours + ' (' + need + ' עובדים)');
        });
        if (open.length) days.push(day.name + ': ' + open.join(', '));
      });
      parts.push('- ' + branch.name + ' | ' + (days.join(' | ') || 'סגור כל השבוע'));
    });

    parts.push('', 'עובדים:');
    state.employees.forEach(function (emp) {
      if (!emp.active) return;
      var branches = emp.branches.length
        ? emp.branches.map(branchNameOf).join(', ')
        : 'כל הסניפים';
      var shifts = emp.shifts.map(function (id) { return Data.shiftById(id).name; }).join(', ');
      var daysOff = Store.requestedDaysOff(current, emp.id).map(function (d) { return Data.DAYS[d].name; });
      var blocked = [];
      Data.DAYS.forEach(function (day) {
        var constraint = Store.getConstraint(current, emp.id, day.idx);
        var names = Object.keys(constraint.blocked || {});
        if (names.length) {
          blocked.push(day.name + ': ' + names.map(function (id) { return Data.shiftById(id).name; }).join('/'));
        }
      });
      parts.push('- ' + emp.name + ' | סניפים: ' + branches + ' | משמרות: ' + shifts +
        ' | מקסימום ' + emp.maxShifts + ' בשבוע' +
        (daysOff.length ? ' | ביקש/ה חופש: ' + daysOff.join(', ') : '') +
        (blocked.length ? ' | חסם/ה: ' + blocked.join('; ') : '') +
        (emp.note ? ' | הערה: ' + emp.note : ''));
    });

    parts.push('', 'הסידור הנוכחי:', scheduleAsText());

    var summary = Store.weekAvailability(state, current);
    parts.push('', 'יתרת זמינות:');
    summary.rows.forEach(function (row) {
      parts.push('- ' + row.name + ': משובץ ' + row.assigned + ' מתוך מכסה ' + row.max +
        ', ימים פנויים: ' + (row.freeDays.length ? row.freeDays.map(function (d) { return Data.DAYS[d].name; }).join(', ') : 'אין'));
    });

    if (lastReport.issues.length) {
      parts.push('', 'התראות על הסידור:');
      lastReport.issues.forEach(function (item) { parts.push('- ' + item.text); });
    } else {
      parts.push('', 'אין התראות – הסידור תקין.');
    }

    return parts.join('\n');
  }

  function addChatMessage(role, text) {
    var node = document.createElement('div');
    node.className = 'chat-msg ' + role;
    node.textContent = text;
    $('#chat-messages').appendChild(node);
    node.scrollIntoView({ block: 'nearest' });
    return node;
  }

  function askChat(question) {
    if (chatBusy || !Platform.sample) return;
    chatBusy = true;
    $('#chat-send').disabled = true;

    addChatMessage('user', question);
    var answer = addChatMessage('bot pending', 'חושב…');

    var turns = chatHistory.slice(-6).map(function (turn) { return { role: turn.role, content: turn.content }; });
    turns.push({
      role: 'user',
      content: 'אתה עוזר למנהל/ת של רשת מייפון לנהל סידור משמרות. ענה בעברית, קצר ולעניין, ' +
        'והסתמך רק על הנתונים שלהלן. אם המידע חסר – אמור זאת במפורש במקום לנחש.\n\n' +
        '=== נתוני השבוע ===\n' + chatContext() + '\n=== סוף הנתונים ===\n\nשאלה: ' + question
    });

    Platform.sample(turns, {
      onText: function (event) {
        answer.className = 'chat-msg bot';
        answer.textContent = event.text;
      }
    }).then(function (result) {
      answer.className = 'chat-msg bot';
      answer.textContent = result.text || '(לא התקבלה תשובה)';
      chatHistory.push({ role: 'user', content: question });
      chatHistory.push({ role: 'assistant', content: result.text || '' });
    }).catch(function (err) {
      var code = err && err.code;
      answer.className = 'chat-msg error';
      if (code === 'not_granted') {
        answer.textContent = 'אין הרשאה לשאול שאלות בעמוד הזה.';
        $('#chat').classList.add('hidden');
      } else if (code === 'rate_limited') {
        answer.textContent = 'יותר מדי שאלות ברצף – נסו שוב בעוד רגע.';
      } else if (err && err.text) {
        answer.className = 'chat-msg bot';
        answer.textContent = err.text;
      } else {
        answer.textContent = 'לא הצלחתי לענות כרגע' + (err && err.message ? ': ' + err.message : '.');
      }
    }).then(function () {
      chatBusy = false;
      $('#chat-send').disabled = false;
    });
  }

  function bindChat() {
    $('#chat-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var input = $('#chat-input');
      var question = input.value.trim();
      if (!question) return;
      input.value = '';
      askChat(question);
    });
  }

  /* ========== סנכרון בין מכשירים ========== */
  var syncStatus = 'local';

  function timeLabel(date) {
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }

  function renderSyncState(status) {
    syncStatus = status || syncStatus;
    var node = $('#sync-state');
    if (!node) return;
    var labels = {
      live: 'מסונכרן בין המכשירים',
      local: 'נשמר במכשיר הזה בלבד',
      readonly: 'צפייה בלבד – אין הרשאת עריכה'
    };
    var text = labels[syncStatus] || labels.local;
    if (syncStatus === 'live' && Platform.lastSyncedAt) {
      text += ' · עודכן ' + timeLabel(Platform.lastSyncedAt);
    }
    node.textContent = text;
    node.className = 'sync-state ' + syncStatus;
    node.title = syncStatus === 'live'
      ? 'הנתונים נשמרים בענן ומתעדכנים בכל מחשב שפתוח בו אותו קישור'
      : 'הנתונים נשמרים רק בדפדפן של המחשב הזה';

    // עותק מקומי של הקובץ לעולם לא יסתנכרן – כדאי שזה יהיה ברור
    var notice = $('#local-notice');
    var isLocalFile = location.protocol === 'file:';
    notice.classList.toggle('hidden', !(isLocalFile && syncStatus !== 'live'));
  }

  function onSynced(date, fromRemote) {
    renderSyncState('live');
    if (fromRemote) { toast('התקבל עדכון ממחשב אחר (' + timeLabel(date) + ')'); }
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

  /* הופך את העמוד לאפליקציה שניתן להוסיף למסך הבית באייפון */
  function setupAppMeta() {
    function meta(name, content) {
      if (document.querySelector('meta[name="' + name + '"]')) return;
      var tag = document.createElement('meta');
      tag.name = name;
      tag.content = content;
      document.head.appendChild(tag);
    }
    meta('apple-mobile-web-app-capable', 'yes');
    meta('mobile-web-app-capable', 'yes');
    meta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    meta('apple-mobile-web-app-title', 'סידור משמרות');
    meta('format-detection', 'telephone=no');
    meta('theme-color', '#23499f');

    var viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      meta('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
    } else if (viewport.content.indexOf('viewport-fit') === -1) {
      viewport.content += ', viewport-fit=cover'; // נדרש לאזורים הבטוחים באייפון
    }

    // אייקון למסך הבית – מצויר בזמן אמת, כדי שלא יידרש קובץ חיצוני
    try {
      var size = 180;
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      var ctx = canvas.getContext('2d');
      var gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, '#23499f');
      gradient.addColorStop(1, '#2f5fe0');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 84px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('סד', size / 2, size / 2 - 14);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.font = '26px "Segoe UI", Arial, sans-serif';
      ctx.fillText('משמרות', size / 2, size / 2 + 48);
      var url = canvas.toDataURL('image/png');

      [['apple-touch-icon', url], ['icon', url]].forEach(function (pair) {
        var link = document.createElement('link');
        link.rel = pair[0];
        link.href = pair[1];
        document.head.appendChild(link);
      });

      var manifest = {
        name: 'סידור משמרות – מייפון',
        short_name: 'סידור משמרות',
        start_url: '.',
        display: 'standalone',
        background_color: '#f1f4fa',
        theme_color: '#23499f',
        dir: 'rtl',
        lang: 'he',
        icons: [{ src: url, sizes: '180x180', type: 'image/png' }]
      };
      var manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.href = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(manifest));
      document.head.appendChild(manifestLink);
    } catch (err) {
      /* ללא אייקון – האפליקציה עדיין עובדת */
    }
  }

  setupAppMeta();
  document.documentElement.setAttribute('dir', 'rtl');
  document.documentElement.setAttribute('lang', 'he');

  // מעבר בין תצוגת נייד למחשב (סיבוב המכשיר, שינוי גודל חלון)
  var wasMobile = isMobile();
  window.addEventListener('resize', function () {
    if (isMobile() !== wasMobile) { wasMobile = isMobile(); render(); }
  });

  bindTabs();
  bindScheduleTab();
  bindConstraintsTab();
  bindEmployeesTab();
  bindBranchesTab();
  bindSettingsTab();
  bindChat();
  render();

  Platform.init({
    getState: function () { return state; },
    weekKey: function () { return weekKey; },
    onConfig: applyRemoteConfig,
    onWeek: applyRemoteWeek,
    onSyncState: renderSyncState,
    onSampleReady: function () { $('#chat').classList.remove('hidden'); },
    onSynced: onSynced
  });
})();
