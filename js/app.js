/* ממשק המשתמש: תצוגת הסידור, עריכה ידנית, אילוצים, עובדים, סניפים והגדרות */
(function () {
  'use strict';

  var Data = window.ShiftData;
  var Store = window.ShiftStore;
  var Scheduler = window.ShiftScheduler;
  var Validate = window.ShiftValidate;
  var Platform = window.ShiftPlatform;
  var Xlsx = window.ShiftXlsx;
  var I18n = window.I18n;

  /* קיצור לשכבת התרגום. אם היא לא נטענה – מוצג המפתח, והמערכת ממשיכה לעבוד. */
  function t(key, params) { return I18n ? I18n.t(key, params) : key; }
  /* יחיד/רבים: כל שפה מנסחת אחרת, ולכן הבחירה נעשית במילון ולא בקוד */
  function tCount(base, count, params) {
    var merged = params || {};
    merged.count = count;
    return t(base + (count === 1 ? 'One' : 'Other'), merged);
  }

  /* מקור הנתונים נקבע באתחול. ברירת המחדל היא שמירה מקומית, והגרסה
     המסחרית מזריקה מקור שמדבר עם השרת. */
  var source = {
    mode: 'local',
    loadState: function () { return Promise.resolve(Store.load()); },
    saveConfig: function (nextState) { Store.save(nextState); return Promise.resolve(); },
    saveWeek: function (nextState) { Store.save(nextState); return Promise.resolve(); },
    ensureWeek: function () { return Promise.resolve(); },
    role: 'owner'
  };

  var state = Store.emptyState();
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
    var failed = function (err) {
      toast(t('errors.notSaved') + (err && err.message ? ': ' + err.message : ''));
    };
    if (scope === 'config' || scope === 'all') {
      source.saveConfig(state, scope).catch(failed);
      Platform.pushConfig();
    }
    if (scope !== 'config') {
      source.saveWeek(state, weekKey).catch(failed);
      Platform.pushWeek(weekKey);
    }
  }

  function currentRole() { return source.role || 'owner'; }

  /* שער יחיד לכל פעולה שמשנה נתונים */
  function blocked() {
    if (!viewOnly) return false;
    toast(t('errors.viewOnlyBlocked'));
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

  /* מחלקת הצבע נגזרת מהגדרת המשמרת בעסק, ולא ממזהה קבוע */
  function shiftClass(shiftId) { return 'sh sh-' + Store.shiftColor(state, shiftId); }
  function shiftList() { return Store.shifts(state); }
  function shiftLabel(shiftId) { return Store.shiftName(state, shiftId); }
  function branchNameOf(id) {
    var branch = Store.byId(state.branches, id);
    return branch ? branch.name : t('ui.unknownBranch');
  }
  function empNameOf(id) {
    var emp = Store.byId(state.employees, id);
    return emp ? emp.name : t('ui.unknownEmployee');
  }

  /* ========== כותרת השבוע ========== */
  function renderWeekHeader() {
    var start = Store.dateOfDay(weekKey, 0);
    var end = Store.dateOfDay(weekKey, 6);
    var label = t('ui.weekLabel', { from: Store.formatDate(start), to: Store.formatDate(end) });
    $('#week-title').textContent = label;
    $('#week-range').textContent = weekKey === Store.currentWeekKey() ? t('toolbar.currentWeek') : '';
    $('#constraints-week').textContent = t('ui.constraintsWeek', { label: label });

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
    html += '<option value="">' + (isExtra ? t('schedule.addPerson') : t('schedule.notAssigned')) + '</option>';
    state.employees.forEach(function (emp) {
      html += '<option value="' + esc(emp.id) + '"' + (value === emp.id ? ' selected' : '') + '>' +
        esc(optionLabel(emp, dayIdx, branch.id, shiftId)) + '</option>';
    });
    if (value && !Store.byId(state.employees, value)) {
      html += '<option value="' + esc(value) + '" selected>' + esc(empNameOf(value)) + '</option>';
    }
    html += '</select>';
    if (value) {
      html += '<button type="button" class="why-btn" data-why="' + esc(value) +
        '" title="' + esc(t('why.button')) + '" aria-label="' + esc(t('why.button')) + '">?</button>';
    }
    return html;
  }

  function renderMobileSchedule(marks) {
    var current = week();
    var day = Data.DAYS[mobileDay];
    var html = '';

    if (Store.isHoliday(current, mobileDay)) {
      html = '<div class="m-card holiday"><div class="m-card-head">' + esc(day.name) + '</div>' +
        '<div class="m-holiday">' + esc(Store.holidayName(current, mobileDay)) +
        '<small>' + t('ui.holidayAllClosed') + '</small></div></div>';
      $('#schedule-mobile').innerHTML = html;
      return;
    }

    var activeBranches = state.branches.filter(function (branch) { return branch.active; });
    activeBranches.forEach(function (branch) {
      var shiftsHtml = '';
      shiftList().forEach(function (shift) {
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
          '<span>' + (hours ? esc(hours) : t('ui.noHours')) +
          (need > 1 ? ' · ' + t('schedule.people', { count: need }) : '') + '</span></div>';
        for (var i = 0; i < rows; i++) {
          shiftsHtml += mobileSelectHtml(mobileDay, branch, shift.id, i, assigned[i] || '', i >= need);
        }
        shiftsHtml += '</div>';
      });

      if (!shiftsHtml) {
        shiftsHtml = '<div class="m-closed">' + t('ui.branchClosedToday') + '</div>';
      }
      html += '<div class="m-card"><div class="m-card-head">' + esc(branch.name) + '</div>' + shiftsHtml + '</div>';
    });

    if (!activeBranches.length) {
      html = '<div class="m-card"><div class="m-closed">' + t('ui.noActiveBranches') + '</div></div>';
    }
    $('#schedule-mobile').innerHTML = html;
  }

  function renderMobileConstraints() {
    var current = week();
    var day = Data.DAYS[mobileDay];

    if (Store.isHoliday(current, mobileDay)) {
      $('#constraints-mobile').innerHTML = '<div class="m-card holiday"><div class="m-holiday">' +
        esc(Store.holidayName(current, mobileDay)) + '<small>' + t('ui.holidayNoRequests') + '</small></div></div>';
      return;
    }

    var dayShifts = Store.activeShiftsForDay(state, mobileDay, current);
    if (!dayShifts.length) {
      $('#constraints-mobile').innerHTML = '<div class="m-card"><div class="m-closed">' +
        t('ui.allClosedOn', { day: day.name }) + '</div></div>';
      return;
    }

    var html = '';
    state.employees.forEach(function (emp) {
      if (!emp.active) return;
      var constraint = Store.getConstraint(current, emp.id, mobileDay);
      html += '<div class="m-card m-constraint"><div class="m-card-head">' + esc(emp.name) + '</div>';
      html += '<div class="m-cstates">';
      dayShifts.forEach(function (shiftId) {
        var cls = 'free', title = t('constraints.free');
        if (constraint.off) { cls = 'off-day'; title = t('constraints.dayOff'); }
        else if (constraint.blocked && constraint.blocked[shiftId]) { cls = 'block'; title = t('constraints.blocked'); }
        else if (constraint.preferred && constraint.preferred[shiftId]) { cls = 'pref'; title = t('constraints.preferred'); }
        html += '<button class="cstate ' + cls + '" title="' + title + '" data-emp="' + esc(emp.id) +
          '" data-day="' + mobileDay + '" data-shift="' + shiftId + '">' +
          shiftLabel(shiftId) + '</button>';
      });
      html += '<button class="cstate ' + (constraint.off ? 'off-day' : 'free') +
        '" data-emp="' + esc(emp.id) + '" data-day="' + mobileDay + '" data-off="1">' +
        (constraint.off ? '✓ ' : '') + t('constraints.dayOff') + '</button>';
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
    if (constraint.off) marks.push(t('marks.dayOff'));
    else if (constraint.blocked && constraint.blocked[shiftId]) marks.push(t('marks.blocked'));
    else if (constraint.preferred && constraint.preferred[shiftId]) marks.push(t('marks.prefers'));
    if (!Scheduler.employeeAllowedInBranch(emp, branchId)) marks.push(t('marks.notInBranch'));
    if (emp.shifts.indexOf(shiftId) === -1) marks.push(t('marks.notInShift'));
    var busy = Store.employeeDayAssignments(state, week(), emp.id, dayIdx)
      .filter(function (s) { return !(s.branchId === branchId && s.shiftId === shiftId); });
    if (busy.length) marks.push(t('marks.alreadyAssigned'));
    if (!emp.active) marks.push(t('marks.inactive'));
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
        (label ? esc(label) : '<span class="missing">' + t('schedule.missingSabbath') + '</span>') +
        (need > 1 ? ' · ' + t('schedule.people', { count: need }) : '') + '</div>';
    }
    for (var i = 0; i < rows; i++) {
      var value = assigned[i] || '';
      var extra = i >= need ? ' extra' : '';
      html += '<select class="emp-select' + extra + '" data-slot="' + i + '">';
      html += '<option value="">' + (i >= need ? t('schedule.add') : t('schedule.empty')) + '</option>';
      state.employees.forEach(function (emp) {
        var selected = value === emp.id ? ' selected' : '';
        html += '<option value="' + esc(emp.id) + '"' + selected + '>' + esc(optionLabel(emp, dayIdx, branch.id, shiftId)) + '</option>';
      });
      if (value && !Store.byId(state.employees, value)) {
        html += '<option value="' + esc(value) + '" selected>' + esc(empNameOf(value)) + '</option>';
      }
      html += '</select>';
      /* הכפתור מופיע רק על משבצת מאוישת – על ריקה אין מה להסביר */
      if (value) {
        html += '<button type="button" class="why-btn" data-why="' + esc(value) +
          '" title="' + esc(t('why.button')) + '" aria-label="' + esc(t('why.button')) + '">?</button>';
      }
    }
    return html + '</td>';
  }

  function renderBranchView(marks) {
    var html = '<table><thead><tr><th class="row-head">' + t('schedule.branch') + '</th>' +
      '<th class="row-head">' + t('schedule.shift') + '</th>';
    Data.DAYS.forEach(function (day) {
      html += '<th class="day-head">' + day.name + '<small>' + Store.formatDate(Store.dateOfDay(weekKey, day.idx)) + '</small></th>';
    });
    html += '</tr></thead><tbody>';

    var activeBranches = state.branches.filter(function (b) { return b.active; });
    if (!activeBranches.length) {
      html += '<tr><td colspan="9">' + t('ui.noActiveBranchesTab') + '</td></tr>';
    }

    activeBranches.forEach(function (branch) {
      shiftList().forEach(function (shift, shiftIndex) {
        html += shiftIndex === 0 ? '<tr class="branch-start">' : '<tr>';
        if (shiftIndex === 0) {
          html += '<td class="row-head" rowspan="' + shiftList().length + '">' + esc(branch.name) + '</td>';
        }
        html += '<td class="row-head ' + shiftClass(shift.id) + '">' + esc(shift.name) + '</td>';

        Data.DAYS.forEach(function (day) {
          var need = Store.slotNeed(branch, day.idx, shift.id);
          var assigned = Store.getAssigned(week(), day.idx, branch.id, shift.id);
          if (Store.isHoliday(week(), day.idx) && !assigned.length) {
            if (shiftIndex === 0) {
              html += '<td class="closed holiday-cell" rowspan="' + shiftList().length + '">' +
                esc(Store.holidayName(week(), day.idx)) + '<br><small>' + t('ui.branchesClosed') + '</small></td>';
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
    var html = '<table><thead><tr><th class="row-head">' + t('schedule.employee') + '</th>';
    Data.DAYS.forEach(function (day) {
      html += '<th class="day-head">' + day.name + '<small>' + Store.formatDate(Store.dateOfDay(weekKey, day.idx)) + '</small></th>';
    });
    html += '<th class="row-head">' + t('schedule.totalShifts') + '</th></tr></thead><tbody>';

    state.employees.forEach(function (emp) {
      var total = 0;
      var row = '<tr><td class="row-head">' + esc(emp.name) + (emp.active ? '' : ' <small>' + t('employees.inactive') + '</small>') + '</td>';
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
            content = constraint.off ? '<span class="empty-cell">' + t('schedule.dayOff') + '</span>' : '<span class="empty-cell">—</span>';
          }
        } else {
          content = slots.map(function (slot) {
            var shift = Store.shiftById(state, slot.shiftId);
            return '<span class="emp-chip ' + shiftClass(slot.shiftId) + (slots.length > 1 ? ' dup' : '') + '">' +
              esc(branchNameOf(slot.branchId)) + ' · ' + (shift ? shift.name : slot.shiftId) + '</span>';
          }).join('');
        }
        row += '<td class="' + cellClass + '">' + content + '</td>';
      });
      row += '<td class="row-head">' + t('ui.outOf', { done: total, total: emp.maxShifts || '-' }) + '</td></tr>';
      html += row;
    });

    html += '</tbody></table>';
    $('#schedule-employee').innerHTML = html;
  }

  /* ========== פאנל הבדיקות ========== */
  function isMobile() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 820px)').matches;
  }


  function renderIssues(report) {
    var container = $('#issues');
    // בנייד ההתראות מקופלות כברירת מחדל, כדי שהסידור עצמו יהיה מיד על המסך
    var limit = isMobile() ? 0 : 6;
    var visible = showAllIssues ? report.issues : report.issues.slice(0, limit);
    var html = '<div class="issues-summary">';
    if (report.errors) html += '<span class="badge error">' + tCount('alerts.errors', report.errors) + '</span>';
    if (report.warnings) html += '<span class="badge warning">' + tCount('alerts.warnings', report.warnings) + '</span>';
    if (report.infos) html += '<span class="badge info">' + tCount('alerts.infos', report.infos) + '</span>';
    if (!report.issues.length) html += '<span class="badge ok">' + t('alerts.allGood') + '</span>';
    if (report.issues.length > limit) {
      html += '<button class="issues-toggle" id="toggle-issues">' +
        (showAllIssues ? t('alerts.showLess') : t('alerts.showAll', { count: report.issues.length })) +
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

  function shiftsWord(count) { return tCount('availability.shifts', count); }

  /* בעברית הפועל משתנה עם המספר; במילון כל שפה בוחרת את הניסוח שלה */
  function remainVerb(count) {
    return count === 1 ? t('availability.remains') : t('availability.remainPlural');
  }

  /* ========== סיכום: מה נותר פנוי ========== */
  function renderAvailability() {
    var summary = Store.weekAvailability(state, week());
    var html = '<h3 class="summary-title">' + t('availability.title') + '</h3>';

    if (!summary.rows.length) {
      $('#availability').innerHTML = html + '<p class="summary-empty">' + t('availability.noEmployees') + '</p>';
      return;
    }

    if (summary.freeSlots === 0) {
      var reason = summary.totalSpare === 0
        ? t('availability.reasonMaxed')
        : t('availability.reasonNoDays');
      html += '<p class="summary-line none">' + t('availability.none', { reason: reason }) + '</p>';
    } else {
      html += '<p class="summary-line total">' + tCount('availability.total', summary.freeSlots, {
        verb: remainVerb(summary.freeSlots),
        people: tCount('availability.people', summary.withSpare.length)
      }) + '</p>';
    }

    html += '<ul class="summary-list">';
    summary.rows.forEach(function (row) {
      var cls = row.available > 0 ? 'has-spare' : (row.spare > 0 ? 'no-days' : 'full');
      var text = '<b>' + esc(row.name) + '</b> – ';
      if (row.available > 0) {
        text += t('availability.left', {
          verb: remainVerb(row.spare), shifts: shiftsWord(row.spare), days: dayNames(row.freeDays)
        });
      } else if (row.spare > 0) {
        text += t('availability.leftNoDays', { verb: remainVerb(row.spare), shifts: shiftsWord(row.spare) });
      } else {
        text += t('availability.full', { assigned: row.assigned, max: row.max });
      }
      html += '<li class="' + cls + '">' + text + '</li>';
    });
    html += '</ul>';

    $('#availability').innerHTML = html;
  }

  function renderPersonalPicker() {
    var select = $('#personal-employee');
    var previous = select.value;
    var html = '<option value="">' + t('toolbar.choosePerson') + '</option>';
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
      html += '<div class="load-pill' + cls + '">' + esc(emp.name) + ': ' +
        t('ui.outOf', { done: '<b>' + count + '</b>', total: emp.maxShifts || '-' }) + '</div>';
    });
    $('#workload').innerHTML = html;
  }

  /* ========== בקשות אילוץ הממתינות לאישור ========== */
  function describeConstraint(record) {
    if (!record) return '';
    if (record.off) return t('constraints.dayOff');
    var parts = [];
    Object.keys(record.preferred || {}).forEach(function (id) {
      parts.push(t('constraints.preferred') + ' ' + shiftLabel(id));
    });
    Object.keys(record.blocked || {}).forEach(function (id) {
      parts.push(t('constraints.blocked') + ' ' + shiftLabel(id));
    });
    return parts.join(', ') || t('constraints.noChange');
  }

  function renderPending() {
    var container = $('#pending-constraints');
    if (!container) return;
    var pending = Store.pendingConstraints(week());

    if (!pending.length) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');

    var html = '<h3 class="pending-title">' + t('constraints.pendingTitle', { count: pending.length }) + '</h3>';
    html += '<p class="hint">' + t('constraints.pendingHint') + '</p>';
    html += '<div class="pending-list">';
    pending.forEach(function (item) {
      html += '<div class="pending-item" data-emp="' + esc(item.empId) + '" data-day="' + item.dayIdx + '">';
      html += '<div class="pending-info"><b>' + esc(empNameOf(item.empId)) + '</b>' +
        '<span>' + esc(Data.DAYS[item.dayIdx].name) + ' ' +
        Store.formatDate(Store.dateOfDay(weekKey, item.dayIdx)) + '</span>' +
        '<em>' + esc(describeConstraint(item.record)) + '</em>' +
        (item.record.note ? '<small>' + esc(item.record.note) + '</small>' : '') +
        '</div>';
      html += '<div class="pending-actions">' +
        '<button class="btn small approve" data-decision="approved">' + t('constraints.approve') + '</button>' +
        '<button class="btn small ghost reject" data-decision="rejected">' + t('constraints.reject') + '</button>' +
        '</div></div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  /* ========== לוח האילוצים ========== */
  function renderConstraints() {
    var html = '<table><thead><tr><th class="row-head">' + t('schedule.employee') + '</th>';
    Data.DAYS.forEach(function (day) {
      html += '<th class="day-head">' + day.name + '<small>' + Store.formatDate(Store.dateOfDay(weekKey, day.idx)) + '</small></th>';
    });
    html += '</tr></thead><tbody>';

    state.employees.forEach(function (emp) {
      html += '<tr><td class="row-head">' + esc(emp.name) + '</td>';
      Data.DAYS.forEach(function (day) {
        var record = Store.getConstraintRecord(week(), emp.id, day.idx);
        var status = Store.constraintStatus(record);
        var constraint = Store.getConstraint(week(), emp.id, day.idx);
        if (Store.isHoliday(week(), day.idx)) {
          html += '<td class="closed holiday-cell">' + esc(Store.holidayName(week(), day.idx)) + '</td>';
          return;
        }
        var dayShifts = Store.activeShiftsForDay(state, day.idx, week());
        if (!dayShifts.length) { html += '<td class="closed">' + t('branches.closed') + '</td>'; return; }
        var cellTag = '';
        var reason = record && record.note ? ' · ' + record.note : '';
        if (status === Store.CONSTRAINT_STATUS.PENDING) {
          cellTag = '<div class="c-status pending" title="' + esc(record.note || '') + '">' +
            esc(t('constraints.requestLabel', { detail: describeConstraint(record) })) + esc(reason) + '</div>';
        } else if (status === Store.CONSTRAINT_STATUS.REJECTED) {
          cellTag = '<div class="c-status rejected">' + t('constraints.requestRejected') + '</div>';
        } else if (record && record.note) {
          cellTag = '<div class="c-status approved">' + esc(record.note) + '</div>';
        }
        html += '<td>';
        dayShifts.forEach(function (shiftId) {
          var cls = 'free', title = t('constraints.free');
          if (constraint.off) { cls = 'off-day'; title = t('constraints.dayOff'); }
          else if (constraint.blocked && constraint.blocked[shiftId]) { cls = 'block'; title = t('constraints.blocked'); }
          else if (constraint.preferred && constraint.preferred[shiftId]) { cls = 'pref'; title = t('constraints.preferred'); }
          html += '<button class="cstate ' + cls + '" title="' + title + '" data-emp="' + esc(emp.id) +
            '" data-day="' + day.idx + '" data-shift="' + esc(shiftId) + '">' +
            esc(shiftLabel(shiftId)) + '</button>';
        });
        html += '<button class="cstate day-off-btn ' + (constraint.off ? 'off-day' : 'free') +
          '" data-emp="' + esc(emp.id) + '" data-day="' + day.idx + '" data-off="1">' +
          (constraint.off ? '✓ ' : '') + t('constraints.dayOff') + '</button>';
        html += cellTag + '</td>';
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
        '<button class="btn icon danger" data-action="delete-emp" title="' + t('common.delete') + '">🗑</button></div>';
      html += '<div class="field"><label class="check"><input type="checkbox" data-field="active"' +
        (emp.active ? ' checked' : '') + '> ' + t('employees.active') + '</label></div>';
      html += '<div class="field"><label class="title">' + t('employees.branchesLabel') + '</label><div class="pills">';
      state.branches.forEach(function (branch) {
        var on = emp.branches.indexOf(branch.id) !== -1 ? ' on' : '';
        html += '<button class="pill' + on + '" data-action="toggle-branch" data-branch="' + esc(branch.id) + '">' + esc(branch.name) + '</button>';
      });
      html += '</div></div>';
      html += '<div class="field"><label class="title">' + t('employees.shiftTypes') + '</label><div class="pills">';
      shiftList().forEach(function (shift) {
        var on = emp.shifts.indexOf(shift.id) !== -1 ? ' on' : '';
        html += '<button class="pill' + on + '" data-action="toggle-shift" data-shift="' + shift.id + '">' + shift.name + '</button>';
      });
      html += '</div></div>';
      html += '<div class="field"><label class="title">' + t('employees.maxShifts') + '</label>' +
        '<input class="num-input" type="number" min="0" max="14" data-field="maxShifts" value="' + esc(emp.maxShifts) + '"></div>';
      html += '<div class="field"><label class="title">' + t('employees.note') + '</label>' +
        '<input class="text-input" data-field="note" value="' + esc(emp.note || '') + '"></div>';
      html += '</div>';
    });
    $('#employees-list').innerHTML = html;
  }

  /* ========== סניפים: ימים, שעות וכמות עובדים ========== */
  function timeInputHtml(field, value) {
    return '<input class="time-input" type="text" inputmode="numeric" maxlength="5"' +
      ' placeholder="' + esc(t('common.timePlaceholder')) + '"' +
      ' data-sched="' + field + '" value="' + esc(value || '') + '">';
  }

  function scheduleCellHtml(branch, dayIdx, shiftId) {
    var config = (branch.schedule[dayIdx] || {})[shiftId] || null;
    var need = config ? Number(config.need) || 0 : 0;
    var isMotzash = config && config.auto === 'motzash';
    var html = '<td class="sched-cell ' + (need ? shiftClass(shiftId) : 'closed') + '"' +
      ' data-day="' + dayIdx + '" data-shift="' + shiftId + '">';
    html += '<label class="sched-need"><span>' + t('branches.peopleLabel') + '</span>' +
      '<input class="num-input" type="number" min="0" max="9" data-sched="need" value="' + need + '"></label>';
    if (need > 0) {
      html += '<div class="sched-times">';
      if (isMotzash) {
        html += '<span class="auto-time" title="' + esc(t('settings.sabbathHint')) + '">' +
          t('branches.autoSabbathLabel') + '</span>';
      } else {
        html += timeInputHtml('from', config.from);
      }
      html += '<span class="dash">–</span>';
      html += timeInputHtml('to', config.to);
      html += '</div>';
      if (dayIdx === Data.MOTZASH.dayIdx) {
        html += '<label class="check tiny"><input type="checkbox" data-sched="auto"' +
          (isMotzash ? ' checked' : '') + '> ' + t('branches.autoSabbath') + '</label>';
      }
    } else {
      html += '<div class="sched-closed">' + t('branches.closed') + '</div>';
    }
    return html + '</td>';
  }

  function renderBranches() {
    var html = '';
    state.branches.forEach(function (branch) {
      html += '<div class="card wide' + (branch.active ? '' : ' inactive') + '" data-branch="' + esc(branch.id) + '">';
      html += '<div class="card-head"><input class="name" data-field="name" value="' + esc(branch.name) + '">' +
        '<label class="check"><input type="checkbox" data-field="active"' +
        (branch.active ? ' checked' : '') + '> ' + t('branches.active') + '</label>' +
        '<button class="btn icon danger" data-action="delete-branch" title="' + t('common.delete') + '">🗑</button></div>';

      html += '<div class="table-wrap sched-wrap"><table class="sched-table"><thead><tr><th class="row-head">' +
        t('branches.day') + '</th>';
      shiftList().forEach(function (shift) {
        html += '<th class="' + shiftClass(shift.id) + '">' + shift.name + '</th>';
      });
      html += '</tr></thead><tbody>';
      Data.DAYS.forEach(function (day) {
        html += '<tr><td class="row-head">' + day.name + '</td>';
        shiftList().forEach(function (shift) {
          html += scheduleCellHtml(branch, day.idx, shift.id);
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';

      if (state.branches.length > 1) {
        html += '<div class="field copy-row"><label class="title">' + t('branches.copyFrom') + '</label>' +
          '<select class="text-input" data-action="copy-schedule"><option value="">' +
          t('branches.chooseBranch') + '</option>';
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

  /* ===== מועד סגירת ההגשות =====
     מוצג כתאריך מלא ולא רק כיום בשבוע, כי "חמישי בשעה 20:00"
     אינו אומר למנהל לאיזה חמישי הכוונה. */
  function renderDeadline() {
    var config = Store.deadlineSettings(state);
    var toggle = $('#opt-deadline');
    if (!toggle) return;
    toggle.checked = config.enabled;

    var daySelect = $('#deadline-day');
    daySelect.innerHTML = Data.DAYS.map(function (day) {
      return '<option value="' + day.idx + '"' +
        (day.idx === config.dayIdx ? ' selected' : '') + '>' + esc(day.name) + '</option>';
    }).join('');

    $('#deadline-time').value = config.time;

    var remind = $('#deadline-remind');
    remind.innerHTML = [2, 6, 12, 24, 48, 72].map(function (hours) {
      return '<option value="' + hours + '"' +
        (hours === config.remindHours ? ' selected' : '') + '>' +
        esc(t('settings.deadlineHours', { hours: hours })) + '</option>';
    }).join('');

    /* שני מצבים נפרדים ננעלים על אותם שדות: ההגדרה כבויה, או
       שהמסך כולו במצב צפייה. applyViewOnly רץ על אותם אלמנטים,
       ולכן הכלל המשולב חייב להיקבע במקום אחד. */
    toggle.disabled = viewOnly;
    [daySelect, $('#deadline-time'), remind].forEach(function (node) {
      node.disabled = viewOnly || !config.enabled;
    });

    var preview = $('#deadline-preview');
    var at = Store.deadlineFor(state, weekKey);
    preview.textContent = at
      ? t('settings.deadlinePreview', {
          date: Store.formatDate(at),
          day: (Data.DAYS[at.getDay()] || {}).name || '',
          time: config.time,
          week: Store.formatDate(Store.dateOfDay(weekKey, 0))
        })
      : '';
  }

  /* ========== הגדרות ========== */
  function renderSettings() {
    $('#opt-one-per-day').checked = !!state.settings.onePerDay;
    $('#opt-rest').checked = !!state.settings.restEveningMorning;
    $('#opt-one-day-off').checked = !!state.settings.oneDayOffPerWeek;
    $('#default-shabbat').value = state.settings.defaultShabbatEnd || '';
    renderDeadline();

    var list = shiftList();
    var html = '';
    list.forEach(function (shift, index) {
      html += '<div class="shift-row ' + shiftClass(shift.id) + '" data-shift="' + esc(shift.id) + '">';
      html += '<input class="text-input shift-name" data-field="name" value="' + esc(shift.name) +
        '" maxlength="24" placeholder="' + esc(t('settings.shiftNamePlaceholder')) + '">';
      html += '<div class="shift-times">' +
        '<input class="time-input" type="text" inputmode="numeric" maxlength="5"' +
        ' placeholder="' + esc(t('common.timePlaceholder')) + '"' +
        ' data-field="from" value="' + esc(shift.from || '') + '">' +
        '<span class="dash">–</span>' +
        '<input class="time-input" type="text" inputmode="numeric" maxlength="5"' +
        ' placeholder="' + esc(t('common.timePlaceholder')) + '"' +
        ' data-field="to" value="' + esc(shift.to || '') + '">' +
        '</div>';
      html += '<div class="shift-colors">';
      Data.SHIFT_COLORS.forEach(function (color) {
        html += '<button class="color-dot sh sh-' + color.id +
          (Store.shiftColor(state, shift.id) === color.id ? ' active' : '') +
          '" data-color="' + color.id + '" title="' + esc(color.name) + '"></button>';
      });
      html += '</div>';
      html += '<div class="shift-actions">' +
        '<button class="btn icon" data-move="-1" title="' + t('common.moveUp') + '"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="btn icon" data-move="1" title="' + t('common.moveDown') + '"' +
        (index === list.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="btn icon danger" data-remove="1" title="' + t('common.delete') + '"' +
        (list.length === 1 ? ' disabled' : '') + '>🗑</button>' +
        '</div>';
      html += '</div>';
    });
    $('#default-hours').innerHTML = html;

    var legend = $('#constraints-legend');
    if (legend) {
      legend.textContent = t('constraints.legend', {
        free: t('constraints.free'),
        preferred: t('constraints.preferred'),
        blocked: t('constraints.blocked')
      });
    }
    if (window.I18nDom) { window.I18nDom.fillPicker($('#language-select')); }
  }

  var LOCKED_SELECTORS = [
    'select.emp-select', '.cstate', '.pill', '.holiday-chip',
    '#generate', '#clear-week', '#keep-manual', '#shabbat-end',
    '#clear-constraints', '#copy-constraints',
    '#add-employee', '#add-branch',
    '#employees-list input', '#employees-list button',
    '#branches-list input', '#branches-list button', '#branches-list select',
    '#opt-one-per-day', '#opt-rest', '#opt-one-day-off', '#default-shabbat',
    '#opt-deadline', '#deadline-day', '#deadline-time', '#deadline-remind',
    '#reset-all'
  ];

  function applyViewOnly() {
    document.body.classList.toggle('view-only', viewOnly);
    $('#view-only-banner').classList.toggle('hidden', !viewOnly);

    var button = $('#view-only-toggle');
    button.textContent = (viewOnly ? '🔓 ' : '🔒 ') + t(viewOnly ? 'toolbar.exitViewOnly' : 'toolbar.viewOnly');
    button.setAttribute('aria-pressed', viewOnly ? 'true' : 'false');

    LOCKED_SELECTORS.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (node) {
        node.disabled = viewOnly;
      });
    });

    /* אחרון, כדי שהנעילה לפי ההגדרה עצמה לא תידרס */
    renderDeadline();
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
    renderPending();
    renderEmployees();
    renderBranches();
    renderSettings();
    applyViewOnly();
  }

  /* ========== ייצוא ========== */
  function scheduleAsText() {
    var lines = [t('excel.title', {
      from: Store.formatDate(Store.dateOfDay(weekKey, 0)),
      to: Store.formatDate(Store.dateOfDay(weekKey, 6))
    }), ''];
    Data.DAYS.forEach(function (day) {
      if (Store.isHoliday(week(), day.idx)) {
        lines.push('📅 ' + t('ui.dayHeading', { day: day.name, date: Store.formatDate(Store.dateOfDay(weekKey, day.idx)) }));
        lines.push('   ' + t('ui.holidayClosedLine', { name: Store.holidayName(week(), day.idx) }), '');
        return;
      }
      var dayLines = [];
      state.branches.forEach(function (branch) {
        if (!branch.active) return;
        Store.shiftIds(state).forEach(function (shiftId) {
          var assigned = Store.getAssigned(week(), day.idx, branch.id, shiftId);
          var need = Store.slotNeed(branch, day.idx, shiftId);
          if (!assigned.length && !need) return;
          var names = assigned.map(empNameOf).join(', ') || ('‼ ' + t('ui.missingStaff'));
          var hours = Store.hoursLabel(Store.slotHours(week(), branch, day.idx, shiftId));
          dayLines.push('   ' + branch.name + ' – ' + shiftLabel(shiftId) +
            (hours ? ' (' + hours + ')' : '') + ': ' + names);
        });
      });
      if (dayLines.length) {
        lines.push('📅 ' + t('ui.dayHeading', { day: day.name, date: Store.formatDate(Store.dateOfDay(weekKey, day.idx)) }));
        lines = lines.concat(dayLines, '');
      }
    });
    var summary = Store.weekAvailability(state, week());
    if (summary.freeSlots) {
      lines.push(t('ui.spareLine', {
        verb: remainVerb(summary.freeSlots), shifts: shiftsWord(summary.freeSlots)
      }));
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
    if (unique.length !== values.length) { toast(t('errors.duplicatePerson')); }
  }

  function copyText(text, message) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(message); },
        function () { window.prompt(t('toast.copyPrompt'), text); });
    } else {
      window.prompt(t('toast.copyPrompt'), text);
    }
  }

  function saveFile(filename, content, mime) {
    Platform.saveFile(filename, content, mime).then(function (message) {
      if (message) toast(message);
    });
  }

  /* ===== ייצוא לאקסל: גיליון לפי סניף וגיליון לפי עובד ===== */
  function shiftStyle(shiftId) {
    return Xlsx.shiftStyle(Store.shiftColor(state, shiftId));
  }

  function weekTitle() {
    return t('excel.title', {
      from: Store.formatDate(Store.dateOfDay(weekKey, 0)),
      to: Store.formatDate(Store.dateOfDay(weekKey, 6))
    });
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
    var subtitle = t('excel.viewBranch');
    if (current.shabbatEnd) subtitle += ' · ' + t('excel.sabbathEnds', { time: current.shabbatEnd });
    rows.push([{ v: subtitle, s: Xlsx.STYLE.SUBTITLE }]);
    rows.push([]);

    var headerRow = [{ v: t('excel.branch'), s: Xlsx.STYLE.HEADER }, { v: t('excel.shift'), s: Xlsx.STYLE.HEADER }]
      .concat(dayHeaderCells());
    rows.push({ cells: headerRow, height: 30 });

    var activeBranches = state.branches.filter(function (branch) { return branch.active; });
    activeBranches.forEach(function (branch) {
      var firstRow = rows.length;
      shiftList().forEach(function (shift, shiftIndex) {
        var cells = [
          shiftIndex === 0 ? { v: branch.name, s: Xlsx.STYLE.ROW_HEAD } : { v: '', s: Xlsx.STYLE.ROW_HEAD },
          { v: shift.name, s: Xlsx.STYLE.ROW_HEAD }
        ];
        var maxLines = 1;
        Data.DAYS.forEach(function (day) {
          var need = Store.slotNeed(branch, day.idx, shift.id);
          var assigned = Store.getAssigned(current, day.idx, branch.id, shift.id);
          if (Store.isHoliday(current, day.idx) && !assigned.length) {
            cells.push({ v: Store.holidayName(current, day.idx) + '\n' + t('excel.closed'), s: Xlsx.STYLE.CLOSED });
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
          for (var i = assigned.length; i < need; i++) { lines.push(t('excel.missing')); }
          maxLines = Math.max(maxLines, lines.length);
          cells.push({ v: lines.join('\n'), s: shiftStyle(shift.id) });
        });
        rows.push({ cells: cells, height: Math.max(20, maxLines * 14 + 6) });
      });
      merges.push({ r1: firstRow, c1: 0, r2: firstRow + shiftList().length - 1, c2: 0 });
    });

    if (!activeBranches.length) {
      rows.push([{ v: t('schedule.noBranches'), s: Xlsx.STYLE.PLAIN }]);
    }

    return {
      name: t('excel.byBranch'),
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
    rows.push([{ v: t('excel.viewEmployee'), s: Xlsx.STYLE.SUBTITLE }]);
    rows.push([]);

    var headerRow = [{ v: t('excel.staff'), s: Xlsx.STYLE.HEADER }]
      .concat(dayHeaderCells())
      .concat([{ v: t('excel.totalShifts'), s: Xlsx.STYLE.HEADER }]);
    rows.push({ cells: headerRow, height: 30 });

    state.employees.forEach(function (emp) {
      var cells = [{ v: emp.name + (emp.active ? '' : ' ' + t('employees.inactive')), s: Xlsx.STYLE.ROW_HEAD }];
      var total = 0;
      var maxLines = 1;

      Data.DAYS.forEach(function (day) {
        var slots = Store.employeeDayAssignments(state, current, emp.id, day.idx);
        total += slots.length;
        var constraint = Store.getConstraint(current, emp.id, day.idx);
        if (!slots.length) {
          var empty = Store.isHoliday(current, day.idx)
            ? Store.holidayName(current, day.idx)
            : (constraint.off ? t('schedule.dayOff') : '—');
          cells.push({ v: empty, s: Xlsx.STYLE.CLOSED });
          return;
        }
        var lines = slots.map(function (slot) {
          var shift = Store.shiftById(state, slot.shiftId);
          var hours = Store.hoursLabel(Store.slotHours(current,
            Store.byId(state.branches, slot.branchId) || {}, day.idx, slot.shiftId));
          return branchNameOf(slot.branchId) + ' · ' + (shift ? shift.name : slot.shiftId) +
            (hours ? '\n' + hours : '');
        });
        maxLines = Math.max(maxLines, lines.join('\n').split('\n').length);
        cells.push({ v: lines.join('\n'), s: shiftStyle(slots[0].shiftId) });
      });

      cells.push({ v: t('ui.outOf', { done: total, total: emp.maxShifts || 0 }), s: Xlsx.STYLE.TOTAL });
      rows.push({ cells: cells, height: Math.max(20, maxLines * 14 + 6) });
    });

    return {
      name: t('excel.byEmployee'),
      cols: [20, 22, 22, 22, 22, 22, 22, 22, 14],
      freeze: { row: 4, col: 1 },
      rows: rows
    };
  }

  function issuesSheet() {
    var rows = [];
    rows.push({ cells: [{ v: t('excel.checksTitle'), s: Xlsx.STYLE.TITLE }], height: 22 });
    rows.push([{ v: weekTitle(), s: Xlsx.STYLE.SUBTITLE }]);
    rows.push([]);
    rows.push([{ v: t('excel.severity'), s: Xlsx.STYLE.HEADER }, { v: t('excel.type'), s: Xlsx.STYLE.HEADER },
      { v: t('excel.detail'), s: Xlsx.STYLE.HEADER }]);

    if (!lastReport.issues.length) {
      rows.push([{ v: '✔', s: Xlsx.STYLE.PLAIN }, { v: t('excel.valid'), s: Xlsx.STYLE.PLAIN },
        { v: t('excel.noIssues'), s: Xlsx.STYLE.PLAIN }]);
    }
    lastReport.issues.forEach(function (item) {
      var level = t('levels.' + item.level);
      var type = t('issueTypes.' + item.type);
      rows.push([
        { v: level === 'levels.' + item.level ? item.level : level, s: Xlsx.STYLE.PLAIN },
        { v: type === 'issueTypes.' + item.type ? item.type : type, s: Xlsx.STYLE.PLAIN },
        { v: item.text, s: Xlsx.STYLE.PLAIN }
      ]);
    });

    return { name: t('excel.checks'), cols: [12, 20, 90], freeze: { row: 4, col: 0 }, rows: rows };
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
        var idle = !Store.isHoliday(current, day.idx) && !constraint.off;
        var status = Store.isHoliday(current, day.idx)
          ? Store.holidayName(current, day.idx)
          : (constraint.off ? t('constraints.dayOff') : t('excel.notAssigned'));
        rows.push({ day: day.name, date: date, status: status, working: false, idle: idle });
        return;
      }
      slots.forEach(function (slot) {
        var shift = Store.shiftById(state, slot.shiftId);
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

    rows.push({ cells: [{ v: t('excel.personalTitle', { name: emp.name }), s: Xlsx.STYLE.TITLE }], height: 22 });
    rows.push([{ v: weekTitle(), s: Xlsx.STYLE.SUBTITLE }]);
    rows.push([{ v: t('excel.totalWeek', { count: shiftsWord(total) }), s: Xlsx.STYLE.SUBTITLE }]);
    rows.push({
      cells: [{ v: t('excel.day'), s: Xlsx.STYLE.HEADER }, { v: t('excel.date'), s: Xlsx.STYLE.HEADER },
        { v: t('excel.branch'), s: Xlsx.STYLE.HEADER }, { v: t('excel.shift'), s: Xlsx.STYLE.HEADER },
        { v: t('excel.hours'), s: Xlsx.STYLE.HEADER }],
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
      name: opts.name || t('excel.personal'),
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
    var safeName = emp.name.replace(/[\\\/:*?"<>|]/g, '').trim() || t('schedule.employee');
    saveFile(t('ui.personalFileName', { name: safeName }) + '-' + weekKey + '.xlsx', blob,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  function personalText(empId) {
    var emp = Store.byId(state.employees, empId);
    if (!emp) return '';
    var data = personalRows(empId);
    var total = data.filter(function (row) { return row.working; }).length;
    var lines = [t('ui.greeting', { name: emp.name }), weekTitle(), ''];
    data.forEach(function (row) {
      if (row.working) {
        lines.push('📅 ' + row.day + ' ' + row.date + ' – ' + row.branch + ' · ' + row.shift +
          (row.hours ? ' · ' + row.hours : ''));
      } else if (!row.idle) {
        lines.push('📅 ' + row.day + ' ' + row.date + ' – ' + row.status);
      }
    });
    lines.push('', t('excel.totalWeek', { count: shiftsWord(total) }));
    return lines.join('\n');
  }

  function availabilitySheet() {
    var summary = Store.weekAvailability(state, week());
    var rows = [];

    rows.push({ cells: [{ v: t('availability.title'), s: Xlsx.STYLE.TITLE }], height: 22 });
    rows.push([{ v: weekTitle(), s: Xlsx.STYLE.SUBTITLE }]);
    rows.push([{
      v: summary.freeSlots
        ? t('excel.availabilityLeft', { verb: remainVerb(summary.freeSlots), shifts: shiftsWord(summary.freeSlots) })
        : t('excel.availabilityNone'),
      s: Xlsx.STYLE.SUBTITLE
    }]);
    rows.push([{ v: t('excel.staff'), s: Xlsx.STYLE.HEADER }, { v: t('excel.assigned'), s: Xlsx.STYLE.HEADER },
      { v: t('excel.quota'), s: Xlsx.STYLE.HEADER }, { v: t('excel.spare'), s: Xlsx.STYLE.HEADER },
      { v: t('excel.canAssign'), s: Xlsx.STYLE.HEADER }, { v: t('excel.freeDays'), s: Xlsx.STYLE.HEADER }]);

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

    return { name: t('excel.availability'), cols: [22, 10, 10, 14, 12, 40], freeze: { row: 4, col: 1 }, rows: rows };
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
    var rows = [[t('excel.date'), t('excel.day'), t('excel.branch'), t('excel.shift'),
      t('excel.hours'), t('excel.staff'), t('excel.required'), t('excel.assigned')]];
    Data.DAYS.forEach(function (day) {
      state.branches.forEach(function (branch) {
        if (!branch.active) return;
        shiftList().forEach(function (shift) {
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
    function goToWeek(nextKey) { openWeek(nextKey); }
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
        ? t('toast.generated', { shifts: shiftsWord(result.unfilled.length) })
        : t('toast.generatedFull'));
    });

    $('#clear-week').addEventListener('click', function () {
      if (blocked()) return;
      if (!confirm(t('toast.clearWeekConfirm'))) return;
      var current = week();
      current.assignments = {};
      current.manual = {};
      persist();
      render();
      toast(t('toast.cleared'));
    });

    $('#copy-text').addEventListener('click', function () {
      copyText(scheduleAsText(), t('toast.copied'));
    });

    $('#view-only-toggle').addEventListener('click', function () {
      viewOnly = !viewOnly;
      try { window.localStorage.setItem(VIEW_ONLY_KEY, viewOnly ? '1' : '0'); } catch (err) { /* לא קריטי */ }
      render();
      toast(t(viewOnly ? 'toast.viewOnlyOn' : 'toast.viewOnlyOff'));
    });

    $('#tools-toggle').addEventListener('click', function () {
      var panel = $('#more-tools');
      var open = panel.classList.toggle('open');
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
      this.textContent = (open ? '✕ ' : '⋯ ') + t(open ? 'toolbar.closeTools' : 'toolbar.moreTools');
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
        toast(t('toast.holidayCleared', { day: Data.DAYS[dayIdx].name }));
        return;
      }

      var name = window.prompt(t('toast.holidayPrompt', { day: Data.DAYS[dayIdx].name }),
        t('toast.holidayDefault'));
      if (name === null) return;

      var assignedCount = 0;
      state.employees.forEach(function (emp) {
        assignedCount += Store.employeeDayAssignments(state, current, emp.id, dayIdx).length;
      });
      if (assignedCount && !confirm(t('toast.holidayHasAssignments', { count: assignedCount }))) return;

      if (assignedCount) {
        state.branches.forEach(function (branch) {
          Store.shiftIds(state).forEach(function (shiftId) {
            Store.setAssigned(current, dayIdx, branch.id, shiftId, []);
            delete current.manual[Store.slotKey(dayIdx, branch.id, shiftId)];
          });
        });
      }
      Store.setHoliday(current, dayIdx, name.trim());
      persist();
      render();
      toast(t('toast.holidayMarked', { day: Data.DAYS[dayIdx].name }));
    });

    $('#shabbat-end').addEventListener('change', function (event) {
      if (blocked()) { render(); return; }
      var normalized = Store.normalizeTimeInput(event.target.value);
      if (normalized === null) {
        toast(t('errors.invalidTime'));
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
      if (!empId) { toast(t('errors.chooseEmployee')); return; }
      exportPersonalExcel(empId);
    });

    $('#personal-text').addEventListener('click', function () {
      var empId = $('#personal-employee').value;
      if (!empId) { toast(t('errors.chooseEmployee')); return; }
      copyText(personalText(empId), t('toast.personalCopied'));
    });
    $('#export-csv').addEventListener('click', exportCsv);
    $('#print').addEventListener('click', function () {
      if (!Platform.print()) { toast(t('errors.printBlocked')); }
    });

    /* "למה שובץ ככה" – השאלה הראשונה שמנהל שואל על סידור אוטומטי,
       וזו שקובעת אם הוא יסמוך עליו או יבנה הכול מחדש ביד. */
    function bindWhy(selector, cellSelector) {
      var container = document.querySelector(selector);
      if (!container) return;
      container.addEventListener('click', function (event) {
        var button = event.target.closest('.why-btn');
        if (!button || !window.ShiftWhyUI) return;
        var cell = button.closest(cellSelector);
        if (!cell) return;
        window.ShiftWhyUI.show({
          state: state,
          week: week(),
          slot: {
            dayIdx: Number(cell.dataset.day),
            branchId: cell.dataset.branch,
            shiftId: cell.dataset.shift
          },
          employeeId: button.dataset.why,
          trigger: button,
          context: {
            dayName: function (idx) { return (Data.DAYS[idx] || {}).name || ''; },
            branchName: branchNameOf,
            shiftName: shiftLabel
          }
        });
      });
    }
    bindWhy('#schedule-branch', 'td');
    bindWhy('#schedule-mobile', '.m-shift');

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

    $('#pending-constraints').addEventListener('click', function (event) {
      var button = event.target.closest('[data-decision]');
      if (!button) return;
      if (blocked()) return;
      var item = button.closest('.pending-item');
      var empId = item.dataset.emp;
      var dayIdx = Number(item.dataset.day);
      var decision = button.dataset.decision;
      var done = function () {
        toast(t(decision === 'approved' ? 'toast.requestApproved' : 'toast.requestRejected'));
      };

      if (source.decideConstraint) {
        button.disabled = true;
        source.decideConstraint(weekKey, empId, dayIdx, decision).then(function (updated) {
          if (updated) { applyRemoteWeek(weekKey, updated); } else { render(); }
          done();
        }, function (err) {
          toast((err && err.message) || t('toast.updateFailed'));
          render();
        });
        return;
      }

      Store.setConstraintStatus(week(), empId, dayIdx, decision, '');
      persist();
      render();
      done();
    });

    $('#clear-constraints').addEventListener('click', function () {
      if (!confirm(t('toast.clearConstraintsConfirm'))) return;
      week().constraints = {};
      persist();
      render();
      toast(t('toast.constraintsCleared'));
    });

    $('#copy-constraints').addEventListener('click', function () {
      var previous = state.weeks[Store.shiftWeekKey(weekKey, -1)];
      if (!previous || !Object.keys(previous.constraints || {}).length) { toast(t('toast.noPreviousConstraints')); return; }
      week().constraints = Store.clone(previous.constraints);
      persist();
      render();
      toast(t('toast.constraintsCopied'));
    });
  }

  function bindEmployeesTab() {
    $('#add-employee').addEventListener('click', function () {
      if (blocked()) return;
      // מגבלת התוכנית נבדקת לפני ההוספה, אם הוגדרה
      if (source.planLimit) {
        var active = state.employees.filter(function (emp) { return emp.active; }).length;
        var check = source.planLimit(active + 1);
        if (!check.ok) {
          toast(check.problems.join(' '));
          if (source.onPlanBlocked) source.onPlanBlocked(check);
          return;
        }
      }
      state.employees.push({
        id: Store.newId('emp'), name: t('employees.newName'), active: true,
        branches: [], shifts: Store.shiftIds(state).slice(), maxShifts: 6, note: ''
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
        if (!confirm(t('employees.deleteConfirm', { name: emp.name }))) return;
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
        id: Store.newId('br'), name: t('branches.newName'), active: true,
        schedule: Data.defaultSchedule(null, state.settings.shifts)
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
      if (!confirm(t('branches.deleteConfirm', { name: branch.name }))) return;
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
        if (!confirm(t('branches.copyConfirm', { from: source.name, to: branch.name }))) {
          input.value = '';
          return;
        }
        branch.schedule = Store.clone(source.schedule);
        persist('config');
        render();
        toast(t('branches.copied'));
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
            var template = Data.defaultSchedule(null, state.settings.shifts);
            var defined = Store.shiftById(state, shiftId) || {};
            var fallback = (template[dayIdx] && template[dayIdx][shiftId]) ||
              (template[0] && template[0][shiftId]) ||
              { from: defined.from || '09:00', to: defined.to || '17:00' };
            branch.schedule[dayIdx][shiftId] = Object.assign({}, fallback, { need: need });
          }
        } else if (config) {
          if (input.dataset.sched === 'auto') {
            if (input.checked) { config.auto = 'motzash'; delete config.from; }
            else { delete config.auto; config.from = config.from || '20:30'; }
          } else {
            var normalized = Store.normalizeTimeInput(input.value);
            if (normalized === null) {
              toast(t('errors.invalidTime'));
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
    function shiftAt(shiftId) {
      var list = state.settings.shifts;
      for (var i = 0; i < list.length; i++) { if (list[i].id === shiftId) return { shift: list[i], index: i }; }
      return null;
    }

    $('#default-hours').addEventListener('change', function (event) {
      var row = event.target.closest('.shift-row');
      if (!row) return;
      if (blocked()) { render(); return; }
      var found = shiftAt(row.dataset.shift);
      if (!found) return;
      var field = event.target.dataset.field;

      if (field === 'name') {
        var name = event.target.value.trim();
        if (!name) { toast(t('errors.emptyShiftName')); render(); return; }
        found.shift.name = name;
      } else if (field === 'from' || field === 'to') {
        var normalized = Store.normalizeTimeInput(event.target.value);
        if (normalized === null || !normalized) {
          toast(t('errors.invalidTime'));
          render();
          return;
        }
        found.shift[field] = normalized;
      } else { return; }

      persist('config');
      render();
    });

    $('#default-hours').addEventListener('click', function (event) {
      var row = event.target.closest('.shift-row');
      if (!row) return;
      if (blocked()) return;
      var found = shiftAt(row.dataset.shift);
      if (!found) return;
      var list = state.settings.shifts;

      var colorButton = event.target.closest('[data-color]');
      if (colorButton) {
        found.shift.color = Number(colorButton.dataset.color);
        persist('config');
        render();
        return;
      }

      var moveButton = event.target.closest('[data-move]');
      if (moveButton) {
        var target = found.index + Number(moveButton.dataset.move);
        if (target < 0 || target >= list.length) return;
        var moved = list.splice(found.index, 1)[0];
        list.splice(target, 0, moved);
        persist('config');
        render();
        return;
      }

      if (event.target.closest('[data-remove]')) {
        if (list.length === 1) { toast(t('errors.lastShift')); return; }
        var used = 0;
        state.branches.forEach(function (branch) {
          Object.keys(branch.schedule || {}).forEach(function (day) {
            if (branch.schedule[day][found.shift.id]) used++;
          });
        });
        if (!confirm(t('toast.deleteShiftConfirm', {
          name: found.shift.name,
          usage: used ? t('toast.deleteShiftUsed', { count: used }) : t('toast.deleteShiftUnused')
        }))) return;

        var removed = Store.removeShift(state, found.shift.id);
        persist('all');
        render();
        toast(t('toast.shiftDeleted', {
          removed: removed.assignments ? t('toast.shiftRemovedCount', { count: removed.assignments }) : ''
        }));
      }
    });

    $('#add-shift').addEventListener('click', function () {
      if (blocked()) return;
      var list = state.settings.shifts;
      var last = list[list.length - 1] || { to: '22:00', color: 0 };
      list.push({
        id: Store.newId('sh'),
        name: t('toast.newShift', { n: list.length + 1 }),
        from: last.to || '22:00',
        to: '23:00',
        color: list.length % Data.SHIFT_COLORS.length
      });
      persist('config');
      render();
      toast(t('toast.shiftAdded'));
    });

    $('#apply-default-hours').addEventListener('click', function () {
      if (blocked()) return;
      var branches = state.branches.length;
      if (!confirm(t('toast.applyHoursConfirm', { count: branches }))) return;
      var changed = Store.applyDefaultHours(state);
      persist('config');
      render();
      toast(changed ? t('toast.hoursUpdated', { count: changed }) : t('toast.hoursAlready'));
    });

    $('#opt-one-day-off').addEventListener('change', function (event) {
      state.settings.oneDayOffPerWeek = event.target.checked;
      persist('config');
      render();
    });

    function saveDeadline(patch) {
      var current = Store.deadlineSettings(state);
      state.settings.constraintsDeadline = Object.assign({}, current, patch);
      persist('config');
      render();
    }
    $('#opt-deadline').addEventListener('change', function (event) {
      saveDeadline({ enabled: event.target.checked });
    });
    $('#deadline-day').addEventListener('change', function (event) {
      saveDeadline({ dayIdx: Number(event.target.value) });
    });
    $('#deadline-remind').addEventListener('change', function (event) {
      saveDeadline({ remindHours: Number(event.target.value) });
    });
    $('#deadline-time').addEventListener('change', function (event) {
      var normalized = Store.normalizeTimeInput(event.target.value);
      if (normalized === null) { toast(t('errors.invalidTime')); render(); return; }
      saveDeadline({ time: normalized });
    });

    $('#default-shabbat').addEventListener('change', function (event) {
      var normalized = Store.normalizeTimeInput(event.target.value);
      if (normalized === null) {
        toast(t('errors.invalidTime'));
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
            toast(saved ? t('toast.importedCloud', { count: saved }) : t('toast.imported'));
          });
        } catch (err) {
          alert(t('toast.importFailed', { message: err.message }));
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    });

    $('#reset-all').addEventListener('click', function () {
      if (!confirm(t('toast.resetConfirm'))) return;
      state = Store.emptyState();
      persist('all');
      render();
      toast(t('toast.reset'));
    });
  }

  /* ========== צ'אט שאלות על הסידור ========== */
  var chatHistory = [];
  var chatBusy = false;

  /* תיאור טקסטואלי של כל מה שרלוונטי לשבוע המוצג */
  function chatContext() {
    var current = week();
    var parts = [weekTitle()];
    if (current.shabbatEnd) parts.push(t('ui.summaryShabbat', { time: current.shabbatEnd }));

    var holidays = [];
    Data.DAYS.forEach(function (day) {
      if (Store.isHoliday(current, day.idx)) {
        holidays.push(day.name + ' (' + Store.holidayName(current, day.idx) + ')');
      }
    });
    parts.push(holidays.length
      ? t('ui.summaryHolidays', { days: holidays.join(', ') })
      : t('ui.summaryNoHolidays'));

    parts.push('', t('ui.summaryRules'));
    parts.push('- ' + t(state.settings.onePerDay ? 'ui.ruleOnePerDayOn' : 'ui.ruleOnePerDayOff'));
    parts.push('- ' + t(state.settings.restEveningMorning ? 'ui.ruleRestOn' : 'ui.ruleRestOff'));

    parts.push('', t('ui.summaryBranches'));
    state.branches.forEach(function (branch) {
      if (!branch.active) return;
      var days = [];
      Data.DAYS.forEach(function (day) {
        var open = [];
        Store.shiftIds(state).forEach(function (shiftId) {
          var need = Store.slotNeed(branch, day.idx, shiftId);
          if (!need) return;
          var hours = Store.hoursLabel(Store.slotHours(current, branch, day.idx, shiftId));
          open.push(shiftLabel(shiftId) + ' ' + hours + ' (' + t('ui.peopleCount', { count: need }) + ')');
        });
        if (open.length) days.push(day.name + ': ' + open.join(', '));
      });
      parts.push('- ' + branch.name + ' | ' + (days.join(' | ') || t('ui.closedAllWeek')));
    });

    parts.push('', t('ui.summaryEmployees'));
    state.employees.forEach(function (emp) {
      if (!emp.active) return;
      var branches = emp.branches.length
        ? emp.branches.map(branchNameOf).join(', ')
        : t('ui.allBranches');
      var shifts = emp.shifts.map(function (id) { return shiftLabel(id); }).join(', ');
      var daysOff = Store.requestedDaysOff(current, emp.id).map(function (d) { return Data.DAYS[d].name; });
      var blocked = [];
      Data.DAYS.forEach(function (day) {
        var constraint = Store.getConstraint(current, emp.id, day.idx);
        var names = Object.keys(constraint.blocked || {});
        if (names.length) {
          blocked.push(day.name + ': ' + names.map(function (id) { return shiftLabel(id); }).join('/'));
        }
      });
      parts.push('- ' + emp.name +
        ' | ' + t('ui.empBranches') + ': ' + branches +
        ' | ' + t('ui.empShifts') + ': ' + shifts +
        ' | ' + t('ui.empMax', { count: emp.maxShifts }) +
        (daysOff.length ? ' | ' + t('ui.empAskedOff') + ': ' + daysOff.join(', ') : '') +
        (blocked.length ? ' | ' + t('ui.empBlocked') + ': ' + blocked.join('; ') : '') +
        (emp.note ? ' | ' + t('ui.empNote') + ': ' + emp.note : ''));
    });

    parts.push('', t('ui.summaryCurrent'), scheduleAsText());

    var summary = Store.weekAvailability(state, current);
    parts.push('', t('ui.summaryAvailability'));
    summary.rows.forEach(function (row) {
      parts.push('- ' + t('ui.empAssignedOf', { name: row.name, total: row.assigned, max: row.max }) +
        ', ' + t('ui.empFreeDays', {
          days: row.freeDays.length
            ? row.freeDays.map(function (d) { return Data.DAYS[d].name; }).join(', ')
            : t('ui.none')
        }));
    });

    if (lastReport.issues.length) {
      parts.push('', t('ui.summaryIssues'));
      lastReport.issues.forEach(function (item) { parts.push('- ' + item.text); });
    } else {
      parts.push('', t('ui.summaryNoIssues'));
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
    var answer = addChatMessage('bot pending', t('ui.thinking'));

    var turns = chatHistory.slice(-6).map(function (turn) { return { role: turn.role, content: turn.content }; });
    turns.push({
      role: 'user',
      /* התשובה חייבת לחזור בשפת הממשק, ולכן שם השפה נשלח למודל */
      content: t('ui.chatSystem', { language: I18n ? I18n.active().name : 'English' }) + '\n\n' +
        t('ui.chatDataStart') + '\n' + chatContext() + '\n' + t('ui.chatDataEnd') + '\n\n' +
        t('ui.chatQuestion') + question
    });

    Platform.sample(turns, {
      onText: function (event) {
        answer.className = 'chat-msg bot';
        answer.textContent = event.text;
      }
    }).then(function (result) {
      answer.className = 'chat-msg bot';
      answer.textContent = result.text || t('ui.noAnswer');
      chatHistory.push({ role: 'user', content: question });
      chatHistory.push({ role: 'assistant', content: result.text || '' });
    }).catch(function (err) {
      var code = err && err.code;
      answer.className = 'chat-msg error';
      if (code === 'not_granted') {
        answer.textContent = t('ui.chatBlocked');
        $('#chat').classList.add('hidden');
      } else if (code === 'rate_limited') {
        answer.textContent = t('ui.chatRateLimited');
      } else if (err && err.text) {
        answer.className = 'chat-msg bot';
        answer.textContent = err.text;
      } else {
        answer.textContent = t('ui.chatFailed') + (err && err.message ? ': ' + err.message : '.');
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
      live: t('status.synced'),
      local: t('status.localOnly'),
      readonly: t('status.readOnly')
    };
    var text = labels[syncStatus] || labels.local;
    if (syncStatus === 'live' && Platform.lastSyncedAt) {
      text = t('status.syncedAt', { time: timeLabel(Platform.lastSyncedAt) });
    }
    node.textContent = text;
    node.className = 'sync-state ' + syncStatus;
    node.title = t(syncStatus === 'live' ? 'ui.cloudSaved' : 'ui.deviceSaved');

    // עותק מקומי של הקובץ לעולם לא יסתנכרן – כדאי שזה יהיה ברור
    var notice = $('#local-notice');
    var isLocalFile = location.protocol === 'file:';
    notice.classList.toggle('hidden', !(isLocalFile && syncStatus !== 'live'));
  }

  function onSynced(date, fromRemote) {
    renderSyncState('live');
    if (fromRemote) { toast(t('status.remoteUpdate', { time: timeLabel(date) })); }
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
    meta('apple-mobile-web-app-title', t('app.title'));
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
      ctx.fillText(t('ui.iconLetters'), size / 2, size / 2 - 14);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.font = '26px "Segoe UI", Arial, sans-serif';
      ctx.fillText(t('ui.shortTitle'), size / 2, size / 2 + 48);
      var url = canvas.toDataURL('image/png');

      [['apple-touch-icon', url], ['icon', url]].forEach(function (pair) {
        var link = document.createElement('link');
        link.rel = pair[0];
        link.href = pair[1];
        document.head.appendChild(link);
      });

      var manifest = {
        name: t('app.title'),
        short_name: t('ui.shortTitle'),
        start_url: '.',
        display: 'standalone',
        background_color: '#f1f4fa',
        theme_color: '#23499f',
        dir: I18n ? I18n.dir() : 'ltr',
        lang: I18n ? I18n.code() : 'en',
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

  /* שפת הממשק נקבעת לפני כל ציור, כדי שהמסך הראשון כבר יהיה בשפה הנכונה */
  if (window.I18nDom) { window.I18nDom.init(); }
  setupAppMeta();

  // מעבר בין תצוגת נייד למחשב (סיבוב המכשיר, שינוי גודל חלון)
  var wasMobile = isMobile();
  window.addEventListener('resize', function () {
    if (isMobile() !== wasMobile) { wasMobile = isMobile(); render(); }
  });

  var bound = false;
  function bindAll() {
    if (bound) return;
    bound = true;
    bindTabs();
    bindScheduleTab();
    bindConstraintsTab();
    bindEmployeesTab();
    bindBranchesTab();
    bindSettingsTab();
    bindLanguage();
    bindChat();
  }

  /* ========== בחירת שפה ========== */
  function bindLanguage() {
    /* השפה משנה גם טקסטים שנבנים ב-JS, ולכן מציירים הכול מחדש */
    if (I18n) { I18n.onChange(function () { render(); }); }
    if (!window.I18nDom) return;
    /* הבורר מוחלף בכל ציור, ולכן מאזינים ברמת המסמך */
    document.addEventListener('change', function (event) {
      var select = event.target.closest('#language-select, #user-language');
      if (!select) return;
      window.I18nDom.setLanguage(select.value);
    });
  }

  /* מעבר לשבוע אחר – דואג שהנתונים שלו נטענו מהמקור */
  function openWeek(nextKey) {
    weekKey = nextKey;
    Platform.watchWeek(weekKey);
    return Promise.resolve(source.ensureWeek(state, weekKey)).then(render, render);
  }

  /* הפעלת האפליקציה עם מקור נתונים. נקראת פעם אחת. */
  function start(options) {
    var opts = options || {};
    if (opts.source) source = opts.source;

    return Promise.resolve(source.loadState()).then(function (loaded) {
      state = Store.migrate(loaded || Store.emptyState());
      bindAll();
      return Promise.resolve(source.ensureWeek(state, weekKey));
    }).then(function () {
      render();
      if (source.mode === 'local') {
        Platform.init({
          getState: function () { return state; },
          weekKey: function () { return weekKey; },
          onConfig: applyRemoteConfig,
          onWeek: applyRemoteWeek,
          onSyncState: renderSyncState,
          onSampleReady: function () { $('#chat').classList.remove('hidden'); },
          onSynced: onSynced
        });
      }
      return state;
    });
  }

  window.ShiftApp = {
    start: start,
    render: render,
    getState: function () { return state; },
    setState: function (next) { state = Store.migrate(next); render(); },
    applyRemoteConfig: applyRemoteConfig,
    applyRemoteWeek: applyRemoteWeek,
    openWeek: openWeek,
    currentRole: currentRole,
    weekKey: function () { return weekKey; }
  };

  /* בגרסה המקומית האפליקציה עולה מיד. הגרסה המסחרית קוראת ל-start בעצמה. */
  if (!window.ShiftDeferStart) { start(); }
})();
