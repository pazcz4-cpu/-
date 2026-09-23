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

  /* המפתחות החדשים בנויים כ-{ one, other } תחת שם אחד, וזה מה
     ש-I18n.plural יודע לקרוא */
  function tPlural(key, count) {
    return I18n ? I18n.plural(key, count) : key;
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
  var VIEW_KEY = 'maiphone-shifts-view';
  /* ברירת המחדל היא "לפי עובד": השאלה שמנהל שואל את עצמו ראשונה
     היא מי עובד מתי וכמה משמרות יצאו לכל אחד, ולא מה קורה בסניף
     מסוים. העריכה נעשית בתצוגה לפי סניף, ולכן הבחירה נזכרת
     במכשיר – מי שעובד רוב הזמן בעריכה קובע אותה פעם אחת. */
  var view = (function () {
    try {
      var saved = window.localStorage.getItem(VIEW_KEY);
      return saved === 'branch' || saved === 'employee' ? saved : 'employee';
    } catch (err) { return 'employee'; }
  })();
  var mobileDay = new Date().getDay();
  var VIEW_ONLY_KEY = 'maiphone-shifts-view-only';
  /* מצב צפייה הוא העדפה של המכשיר הזה בלבד – הוא לא נשמר בנתונים
     ולא עובר בייצוא, כדי שהעובד לא יירש אותו. */
  var viewOnly = (function () {
    try { return window.localStorage.getItem(VIEW_ONLY_KEY) === '1'; }
    catch (err) { return false; }
  })();
  /* איזו קבוצת התראות פתוחה כרגע. סגור כברירת מחדל, כדי שהסידור
     עצמו יהיה על המסך מיד. */
  var openGroup = null;
  var lastReport = { issues: [], errors: 0, warnings: 0, infos: 0 };

  function $(sel) { return document.querySelector(sel); }

  /* אייקון מספריית ה-SVG. נופל לריק אם הספרייה לא נטענה: קישוט
     חסר עדיף על מסך שבור. */
  function ico(name, extraClass) {
    return window.ShiftIcons ? window.ShiftIcons.svg(name, extraClass) : '';
  }
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

  /* מצב השמירה האמיתי, ולא הבטחה שנכתבה פעם אחת בקוד. מסך ההגדרות
     מבטיח ענן, ולכן מסך הסידור חייב לדווח על אותה מציאות בדיוק –
     ושתי הודעות סותרות על אותו מסך מורידות אמון מיד. */
  var save = { status: 'idle', at: null, pending: 0, failed: false };

  function trackSave(promise) {
    if (save.pending === 0) save.failed = false;
    save.pending++;
    save.status = 'saving';
    renderSaveState();

    function done(failed) {
      save.pending--;
      if (failed) save.failed = true;
      if (save.pending > 0) return;
      if (save.failed) {
        save.status = 'error';
      } else {
        save.status = 'saved';
        save.at = new Date();
      }
      renderSaveState();
    }

    return Promise.resolve(promise).then(function (value) {
      done(false);
      return value;
    }, function (err) {
      done(true);
      throw err;
    });
  }

  function persist(scope) {
    var failed = function (err) {
      toast(t('errors.notSaved') + (err && err.message ? ': ' + err.message : ''));
    };
    if (scope === 'config' || scope === 'all') {
      trackSave(source.saveConfig(state, scope)).catch(failed);
      Platform.pushConfig();
    }
    if (scope !== 'config') {
      trackSave(source.saveWeek(state, weekKey)).catch(failed);
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
  /* action = { label, onClick } – פעולה שאפשר לבצע מתוך ההודעה,
     כמו ביטול. הודעה עם פעולה נשארת זמן כפול: מי שצריך לבטל צריך
     קודם להבין מה קרה, ושתי שניות אינן מספיקות לזה. */
  function toast(message, action) {
    var node = $('#toast');
    node.textContent = '';
    node.appendChild(document.createTextNode(message));
    if (action && action.label && action.onClick) {
      var button = document.createElement('button');
      button.className = 'toast-action';
      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', function () {
        clearTimeout(toastTimer);
        node.classList.remove('show');
        action.onClick();
      });
      node.appendChild(button);
    }
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('show'); },
      action ? 12000 : 2600);
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

  /* תצוגה לפי עובד בטלפון: כרטיס לכל עובד עם כל השבוע, בדיוק
     כמו הטבלה במחשב. לוח ימים אין כאן – השאלה בתצוגה הזו היא
     "מה יש לו השבוע", ולא "מה קורה היום". */
  function renderMobileEmployees(marks) {
    var current = week();
    var shown = state.employees.filter(function (emp) { return emp.active; });
    var html = '';

    if (!shown.length) {
      $('#schedule-mobile').innerHTML =
        '<div class="m-card"><div class="m-closed">' + t('ui.noActiveEmployees') + '</div></div>';
      return;
    }

    shown.forEach(function (emp) {
      var total = 0;
      var days = '';
      Data.DAYS.forEach(function (day) {
        var slots = Store.employeeDayAssignments(state, current, emp.id, day.idx);
        total += slots.length;
        var constraint = Store.getConstraint(current, emp.id, day.idx);
        var flagged = marks.employeesDay[emp.id + '|' + day.idx];
        var body;
        if (slots.length) {
          body = slots.map(function (slot) {
            var shift = Store.shiftById(state, slot.shiftId);
            return '<span class="emp-chip ' + shiftClass(slot.shiftId) +
              (slots.length > 1 ? ' dup' : '') + '">' +
              esc(branchNameOf(slot.branchId)) + ' · ' + esc(shift ? shift.name : slot.shiftId) +
              '</span>';
          }).join('');
        } else if (Store.isHoliday(current, day.idx)) {
          body = '<span class="empty-cell holiday-text">' +
            esc(Store.holidayName(current, day.idx)) + '</span>';
        } else {
          body = '<span class="empty-cell">' +
            (constraint.off ? t('schedule.dayOff') : '—') + '</span>';
        }
        days += '<div class="m-emp-day' + (flagged ? ' has-error' : '') + '">' +
          '<span class="m-emp-daylabel">' + esc(day.name) +
            '<small>' + esc(Store.formatDate(Store.dateOfDay(weekKey, day.idx))) + '</small></span>' +
          '<span class="m-emp-slots">' + body + '</span></div>';
      });

      html += '<div class="m-card"><div class="m-card-head">' + esc(emp.name) +
        '<span class="m-emp-total">' +
          esc(t('ui.outOf', { done: total, total: emp.maxShifts || '-' })) +
        '</span></div>' + days + '</div>';
    });

    /* בתצוגה הזו אי אפשר לשבץ, ולכן נאמר איפה כן */
    html += '<p class="hint view-edit-hint">' + esc(t('toolbar.editInBranchView')) + '</p>';
    $('#schedule-mobile').innerHTML = html;
  }

  /* מי מוצג ומי מוסתר בכל אחת משתי התצוגות. מקום אחד, כי אחרת
     הציור הראשון והלחיצה על הצ'יפ יכולים לומר שני דברים שונים. */
  function applyView() {
    var byBranch = view === 'branch';
    document.querySelectorAll('.view-switch .chip').forEach(function (chip) {
      var on = chip.dataset.view === view;
      chip.classList.toggle('active', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('#schedule-branch').classList.toggle('hidden', !byBranch);
    $('#schedule-employee').classList.toggle('hidden', byBranch);
    /* לוח הימים שייך לתצוגה לפי סניף: בתצוגה לפי עובד מוצג
       כל השבוע, ויום נבחר שם אינו אומר כלום. */
    var nav = $('#day-nav');
    if (nav) nav.classList.toggle('hidden', !byBranch);
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
      html += '</div>';
      html += leaveChips(emp.id, mobileDay);
      html += '</div>';
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
    /* התפקידים שהמשמרת מחפשת. בלעדיהם המנהל רואה משבצת ריקה ולא
       יודע שהיא מחכה דווקא למטבח. תפקיד שכבר יש לו אדם מתאים
       נשאר שקט; מה שחסר הוא מה שמסומן. */
    var roleLines = Store.slotRoleNeeds(state, branch, dayIdx, shiftId);
    if (roleLines.some(function (line) { return line.role; })) {
      var stillOpen = {};
      Store.openSeats(state, roleLines, assigned).forEach(function (roleId) {
        if (roleId) stillOpen[roleId] = (stillOpen[roleId] || 0) + 1;
      });
      html += '<div class="cell-roles">';
      roleLines.forEach(function (line) {
        if (!line.role) return;
        var short = stillOpen[line.role] || 0;
        html += '<span class="cell-role sh sh-' + Store.roleColor(state, line.role) +
          (short ? ' short' : '') + '">' +
          esc(Store.roleName(state, line.role)) +
          (line.count > 1 ? ' ×' + line.count : '') + '</span>';
      });
      html += '</div>';
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

  /* ===== הזזת משמרות: גרירה, ולחיצה למי שלא גורר ===== */

  /* הקובייה שהורמה בלחיצה, או null. זהו המצב היחיד שנשמר בצד,
     והוא מזהה ולא אובייקט – כך ציור מחדש אינו משאיר בידנו
     הפניה לאלמנט שכבר אינו במסך. */
  var pickedTile = null;

  function tileSpec(node) {
    if (!node) return null;
    return {
      dayIdx: Number(node.dataset.day),
      branchId: node.dataset.branch,
      shiftId: node.dataset.shift,
      empId: node.dataset.emp || null,
      id: node.dataset.tile
    };
  }

  function findTile(id) {
    if (!id) return null;
    return tileSpec(document.querySelector('.shift-tile[data-tile="' + cssEscape(id) + '"]'));
  }

  /* המזהה מורכב משמות שהמשתמש קבע, ולכן הוא עלול להכיל גרש */
  function cssEscape(value) {
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function clearPick() {
    if (!pickedTile) return;
    pickedTile = null;
    document.querySelectorAll('.shift-tile.picked').forEach(function (node) {
      node.classList.remove('picked');
      node.setAttribute('aria-pressed', 'false');
    });
    document.body.classList.remove('moving-shift');
  }

  function pickTile(node) {
    var spec = tileSpec(node);
    if (!spec) return;
    if (pickedTile === spec.id) { clearPick(); return; }
    clearPick();
    pickedTile = spec.id;
    node.classList.add('picked');
    node.setAttribute('aria-pressed', 'true');
    document.body.classList.add('moving-shift');
    toast(t('move.picked'));
  }

  /* ביצוע המהלך. כל המסלולים – גרירה, לחיצה, מקלדת – נכנסים לכאן,
     ולכן החוקים נאכפים פעם אחת ובאותו אופן. */
  function applyMove(spec, targetEmpId) {
    if (blocked()) { render(); return; }
    if (!spec) return;
    var current = week();
    var nameOf = function (id) {
      var emp = id ? Store.byId(state.employees, id) : null;
      return emp ? emp.name : t('move.tray');
    };
    var fromName = nameOf(spec.empId);
    var toName = nameOf(targetEmpId);

    var out = Store.moveShift(state, current, {
      dayIdx: spec.dayIdx, branchId: spec.branchId, shiftId: spec.shiftId,
      from: spec.empId, to: targetEmpId || null
    });

    if (!out.ok) {
      clearPick();
      render();
      toast(t('move.refuse.' + out.reason, { name: toName }));
      return;
    }
    clearPick();
    if (out.kind === 'none') { render(); return; }
    persist();
    render();
    if (out.kind === 'swap') { toast(t('move.swapped', { a: fromName, b: toName })); }
    else if (out.kind === 'release') { toast(t('move.released')); }
    else { toast(t('move.moved', { name: toName })); }
  }

  /* היעד שמתחת לנקודה: תא של עובד, או שטח ההמתנה.

     גרירה חוקית היא באותו יום בלבד. משמרת שייכת ליום שלה – "לגרור
     אותה ליום אחר" אינו אותו דבר, זו משמרת אחרת שצריך לפתוח
     בסניף. שטח ההמתנה חוצה ימים, כי הוא רק מקום החזקה. */
  function dropTargetFor(node, spec) {
    var tray = node.closest('#shift-tray');
    if (tray) return { empId: null, ok: true };
    var cell = node.closest('.drop-cell');
    if (!cell) return null;
    if (Number(cell.dataset.dropDay) !== spec.dayIdx) return { empId: null, ok: false };
    return { empId: cell.dataset.dropEmp || null, ok: true };
  }

  function bindShiftMoves() {
    var board = $('#schedule-employee');
    var tray = $('#shift-tray');
    if (!board) return;

    /* ===== גרירה עם העכבר =====
       ה-API הטבעי של הדפדפן, ולא מימוש עצמאי: הוא מביא איתו את
       סמן הגרירה, את תמונת הקובייה ואת ההתנהגות שמשתמשים מכירים
       מכל תוכנה אחרת. במגע הוא אינו קיים, ולכן קיימת גם הלחיצה. */
    function onDragStart(event) {
      var tile = event.target.closest('.shift-tile');
      if (!tile || viewOnly) return;
      var spec = tileSpec(tile);
      draggingSpec = spec;
      document.body.classList.add('moving-shift');
      tile.classList.add('dragging');
      try {
        event.dataTransfer.effectAllowed = 'move';
        /* טקסט ולא JSON: יעד חיצוני שיקבל את הגרירה בטעות יקבל
           שם קריא, ולא מבנה פנימי שלנו. */
        event.dataTransfer.setData('text/plain', tile.textContent);
      } catch (err) { /* דפדפנים ישנים */ }
    }

    function onDragEnd() {
      draggingSpec = null;
      document.body.classList.remove('moving-shift');
      document.querySelectorAll('.dragging').forEach(function (n) { n.classList.remove('dragging'); });
      document.querySelectorAll('.drop-hot').forEach(function (n) { n.classList.remove('drop-hot'); });
    }

    function onDragOver(event) {
      if (!draggingSpec) return;
      var target = dropTargetFor(event.target, draggingSpec);
      if (!target || !target.ok) return;
      event.preventDefault();
      try { event.dataTransfer.dropEffect = 'move'; } catch (err) { /* אין צורך */ }
      var zone = event.target.closest('.drop-cell, #shift-tray');
      document.querySelectorAll('.drop-hot').forEach(function (n) {
        if (n !== zone) n.classList.remove('drop-hot');
      });
      if (zone) zone.classList.add('drop-hot');
    }

    function onDrop(event) {
      if (!draggingSpec) return;
      var target = dropTargetFor(event.target, draggingSpec);
      if (!target || !target.ok) return;
      event.preventDefault();
      var spec = draggingSpec;
      onDragEnd();
      applyMove(spec, target.empId);
    }

    [board, tray].forEach(function (zone) {
      if (!zone) return;
      zone.addEventListener('dragstart', onDragStart);
      zone.addEventListener('dragend', onDragEnd);
      zone.addEventListener('dragover', onDragOver);
      zone.addEventListener('drop', onDrop);
      /* dragleave על המסמך כולו, אחרת ההדגשה נתקעת */
      zone.addEventListener('dragleave', function (event) {
        var zoneNode = event.target.closest && event.target.closest('.drop-cell, #shift-tray');
        if (zoneNode && !zoneNode.contains(event.relatedTarget)) {
          zoneNode.classList.remove('drop-hot');
        }
      });
    });

    /* ===== לחיצה: להרים, ואז להניח =====
       זה מה שעובד במגע, במקלדת, ולמי שפשוט לא אוהב לגרור. */
    function onClick(event) {
      if (viewOnly) return;
      var tile = event.target.closest('.shift-tile');
      if (tile && !pickedTile) { pickTile(tile); return; }
      if (!pickedTile) return;

      var spec = findTile(pickedTile);
      if (!spec) { clearPick(); return; }

      /* לחיצה על הקובייה שהורמה מבטלת */
      if (tile && tile.dataset.tile === pickedTile) { clearPick(); return; }

      var target = dropTargetFor(event.target, spec);
      if (!target) { return; }
      if (!target.ok) { toast(t('move.refuse.other-day')); return; }
      applyMove(spec, target.empId);
    }

    [board, tray].forEach(function (zone) {
      if (zone) zone.addEventListener('click', onClick);
    });

    /* מקלדת: רווח או Enter מרימים ומניחים, Escape מבטל */
    [board, tray].forEach(function (zone) {
      if (!zone) return;
      zone.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') { clearPick(); return; }
        if (event.key !== 'Enter' && event.key !== ' ') return;
        var tile = event.target.closest('.shift-tile');
        var cell = event.target.closest('.drop-cell, #shift-tray');
        if (!tile && !cell) return;
        event.preventDefault();
        onClick({ target: event.target, closest: null });
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') clearPick();
    });
  }

  var draggingSpec = null;

  /* ===== משמרת כקובייה =====

     במסך "תצוגה לפי עובד" כל משמרת היא קובייה שאפשר להזיז: לגרור
     עם העכבר, או ללחוץ פעם אחת כדי להרים ופעם שנייה כדי להניח.
     שני המסלולים נפגשים באותה פעולה, כי מסלול אחד בלבד היה משאיר
     בחוץ את מי שעובד במגע או במקלדת.

     ה-id של הקובייה נושא את כל מה שצריך כדי לבצע את המהלך: יום,
     סניף, משמרת ומי יושב שם עכשיו. כך הגרירה אינה תלויה במצב
     שמור בצד – מצב כזה נשאר ישן בדיוק כשמציירים מחדש. */
  function tileId(dayIdx, branchId, shiftId, empId) {
    return dayIdx + '|' + branchId + '|' + shiftId + '|' + (empId || '');
  }

  function shiftTile(branchId, shiftId, dayIdx, empId, extraClass) {
    var shift = Store.shiftById(state, shiftId);
    var name = branchNameOf(branchId) + ' · ' + (shift ? shift.name : shiftId);
    var id = tileId(dayIdx, branchId, shiftId, empId);
    var picked = pickedTile === id ? ' picked' : '';
    return '<span class="emp-chip shift-tile ' + shiftClass(shiftId) + (extraClass || '') + picked +
      '" draggable="true" tabindex="0" role="button"' +
      ' data-tile="' + esc(id) + '"' +
      ' data-day="' + dayIdx + '" data-branch="' + esc(branchId) + '"' +
      ' data-shift="' + esc(shiftId) + '" data-emp="' + esc(empId || '') + '"' +
      ' aria-pressed="' + (picked ? 'true' : 'false') + '"' +
      ' title="' + esc(t('move.tileHint')) + '">' + esc(name) + '</span>';
  }

  /* שטח ההמתנה: משמרות שאין בהן עובד.

     הוא אינו רק תחנת ביניים לגרירה – הוא גם התשובה לשאלה "מה
     עוד חסר לי השבוע", ולכן הוא מציג את כל המקומות הפתוחים
     ומקבץ אותם לפי יום. משמרת שנשארת כאן היא משמרת שלא תאויש,
     וזה נאמר במפורש ולא נרמז. */
  function renderTray() {
    var tray = $('#shift-tray');
    if (!tray) return;
    if (view !== 'employee' || viewOnly) { tray.classList.add('hidden'); return; }
    tray.classList.remove('hidden');

    var open = Store.openSlots(state, week());
    var html = '<div class="tray-head">' +
      '<b>' + esc(t('move.trayTitle')) + '</b>' +
      '<span class="hint">' + esc(open.length ? t('move.trayHint') : t('move.trayEmpty')) + '</span>' +
      '</div>';

    if (open.length) {
      html += '<div class="tray-days">';
      Data.DAYS.forEach(function (day) {
        var forDay = open.filter(function (slot) { return slot.dayIdx === day.idx; });
        if (!forDay.length) return;
        html += '<div class="tray-day"><span class="tray-day-name">' + esc(day.name) + '</span>';
        forDay.forEach(function (slot) {
          /* משמרת שחסרים בה שניים מופיעה פעמיים: כל קובייה היא
             מקום אחד, ואחרת אי אפשר לגרור רק אחד מהם. */
          for (var i = 0; i < slot.missing; i++) {
            html += shiftTile(slot.branchId, slot.shiftId, slot.dayIdx, '', ' open-slot');
          }
        });
        html += '</div>';
      });
      html += '</div>';
    }
    tray.innerHTML = html;
  }

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
            return shiftTile(slot.branchId, slot.shiftId, day.idx, emp.id,
              slots.length > 1 ? ' dup' : '');
          }).join('');
        }
        /* כל תא הוא יעד גרירה, גם ריק. תא ריק הוא בדיוק המקום
           שאליו רוצים להזיז משמרת. */
        row += '<td class="' + cellClass + ' drop-cell" data-drop-emp="' + esc(emp.id) +
          '" data-drop-day="' + day.idx + '">' + content + '</td>';
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


  /* שלושה מספרים במקום רשימה ארוכה.

     רשימה של חמישים התראות באותו משקל היא רעש: הסידור עצמו נדחק
     מהמסך, וגם ההתראה החשובה נבלעת. שלוש הקבוצות הן לפי הפעולה
     הנדרשת – איוש, הפרות, המלצות – והפירוט נפתח רק כשלוחצים. */
  function renderIssues(report) {
    var container = $('#issues');
    var html = '<div class="issues-summary">';

    if (!report.issues.length) {
      html += '<span class="badge ok">' + ico('check') + t('alerts.allGood') + '</span>';
    }

    report.groups.forEach(function (group) {
      var label = group.count
        ? tPlural('alerts.group.' + group.name, group.count)
        : t('alerts.group.' + group.name + 'None');
      var open = openGroup === group.name && group.count;
      html += '<button class="issue-chip ' + esc(group.level) + (open ? ' open' : '') +
        '" data-group="' + esc(group.name) + '"' +
        (group.count ? '' : ' disabled') +
        ' aria-expanded="' + (open ? 'true' : 'false') + '">' +
        esc(label) + '</button>';
    });
    html += '</div>';

    var shown = report.issues.filter(function (item) { return item.group === openGroup; });
    if (shown.length) {
      html += '<div class="issues-drawer">';
      shown.forEach(function (item) {
        html += '<div class="issue ' + item.level + '">' + esc(item.text) + '</div>';
      });
      html += '</div>';
    }

    container.innerHTML = html;
    container.querySelectorAll('.issue-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var name = chip.dataset.group;
        openGroup = openGroup === name ? null : name;
        renderIssues(report);
      });
    });
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
  /* ===== סוג היום החופשי =====

     יום שהעובד לא עובד בו נראה אותו דבר בסידור בין אם לקח חופש
     ובין אם זה יום שסוכם איתו – ובשכר אלה שני דברים שונים.
     לכן על כל יום שמסומן כחופשי יושבות שתי אפשרויות: בתשלום,
     שיורד מהמכסה שלו, או ללא חיוב.

     שום דבר אינו ברירת מחדל: יום בלי סימון אינו נספר בשום צד,
     כי ניחוש כאן הוא טעות בתלוש. */
  function leaveChips(empId, dayIdx) {
    var record = Store.getConstraintRecord(week(), empId, dayIdx);
    if (!record || !record.off) return '';
    if (Store.constraintStatus(record) === Store.CONSTRAINT_STATUS.REJECTED) return '';
    var current = Store.leaveOf(week(), empId, dayIdx);
    function chip(kind, key) {
      return '<button class="leave-chip ' + kind + (current === kind ? ' on' : '') +
        '" data-emp="' + esc(empId) + '" data-day="' + dayIdx +
        '" data-leave="' + kind + '" title="' + esc(t('leave.' + key + 'Title')) + '">' +
        esc(t('leave.' + key)) + '</button>';
    }
    return '<div class="leave-chips">' + chip(Store.LEAVE.PAID, 'paid') +
      chip(Store.LEAVE.UNPAID, 'unpaid') + '</div>';
  }

  /* ===== סיכום ימי החופש בחודש =====

     מה שמנהל עושה בסוף החודש הוא לשלוח לחשבונאות מספר אחד לכל
     עובד. עד עכשיו הוא היה סופר אותו ביד מתוך ארבעה מסכי שבוע,
     וזה בדיוק המקום שבו נופלים ימים. */
  function leaveMonth() {
    var input = $('#leave-month');
    if (input && input.value) return input.value;
    return Store.monthKeyOf(Store.dateOfDay(weekKey, 0));
  }

  function leaveRows(monthKey) {
    var summary = Store.leaveSummary(state, monthKey);
    return state.employees.filter(function (emp) {
      return summary[emp.id] && (summary[emp.id].paid || summary[emp.id].unpaid);
    }).map(function (emp) {
      return { name: emp.name, paid: summary[emp.id].paid, unpaid: summary[emp.id].unpaid };
    });
  }

  function renderLeaveSummary() {
    var container = $('#leave-summary');
    if (!container) return;
    var monthKey = leaveMonth();
    var input = $('#leave-month');
    if (input && !input.value) input.value = monthKey;

    var rows = leaveRows(monthKey);
    if (!rows.length) {
      container.innerHTML = '<p class="list-empty">' + esc(t('leave.none')) + '</p>';
      return;
    }
    var totalPaid = 0, totalUnpaid = 0;
    var html = '<table><thead><tr>' +
      '<th class="row-head">' + esc(t('leave.columnName')) + '</th>' +
      '<th>' + esc(t('leave.columnPaid')) + '</th>' +
      '<th>' + esc(t('leave.columnUnpaid')) + '</th>' +
      '<th>' + esc(t('leave.columnTotal')) + '</th></tr></thead><tbody>';
    rows.forEach(function (row) {
      totalPaid += row.paid;
      totalUnpaid += row.unpaid;
      html += '<tr><td class="row-head">' + esc(row.name) + '</td>' +
        '<td>' + row.paid + '</td><td>' + row.unpaid + '</td>' +
        '<td><b>' + (row.paid + row.unpaid) + '</b></td></tr>';
    });
    html += '</tbody><tfoot><tr><td class="row-head">' + esc(t('leave.totalRow')) + '</td>' +
      '<td><b>' + totalPaid + '</b></td><td><b>' + totalUnpaid + '</b></td>' +
      '<td><b>' + (totalPaid + totalUnpaid) + '</b></td></tr></tfoot></table>';
    container.innerHTML = html;
  }

  /* השבועות של החודש נטענים לפי דרישה: המסך מחזיק רק את השבוע
     שרואים, וסיכום חודשי צריך את כולם. */
  function loadLeaveMonth() {
    var keys = Store.weekKeysForMonth(leaveMonth());
    var chain = Promise.resolve();
    keys.forEach(function (key) {
      chain = chain.then(function () {
        return Promise.resolve(source.ensureWeek(state, key));
      });
    });
    return chain.then(renderLeaveSummary, renderLeaveSummary);
  }

  function exportLeave() {
    var monthKey = leaveMonth();
    var rows = leaveRows(monthKey);
    if (!rows.length) { toast(t('leave.none')); return; }
    var S = Xlsx.STYLE;
    var sheet = {
      name: t('leave.sheetName'),
      cols: [26, 14, 14, 12],
      rows: [
        { cells: [{ v: t('leave.summaryTitle') + ' · ' + monthKey, s: S.TITLE }], height: 24 },
        [],
        {
          cells: [t('leave.columnName'), t('leave.columnPaid'),
            t('leave.columnUnpaid'), t('leave.columnTotal')].map(function (value) {
            return { v: value, s: S.HEADER };
          }),
          height: 22
        }
      ]
    };
    var totalPaid = 0, totalUnpaid = 0;
    rows.forEach(function (row) {
      totalPaid += row.paid;
      totalUnpaid += row.unpaid;
      sheet.rows.push([
        { v: row.name, s: S.ROW_HEAD },
        { v: row.paid, s: S.PLAIN },
        { v: row.unpaid, s: S.PLAIN },
        { v: row.paid + row.unpaid, s: S.PLAIN }
      ]);
    });
    sheet.rows.push([
      { v: t('leave.totalRow'), s: S.ROW_HEAD },
      { v: totalPaid, s: S.TOTAL },
      { v: totalUnpaid, s: S.TOTAL },
      { v: totalPaid + totalUnpaid, s: S.TOTAL }
    ]);
    var blob = new Blob([Xlsx.build([sheet])], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    saveFile(t('leave.fileName') + '-' + monthKey + '.xlsx', blob,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

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
        var constraint = Store.effectiveConstraint(state, week(), emp.id, day.idx, weekKey);
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
          /* הסדר קבוע אינו בקשה של השבוע הזה, ולכן אי אפשר להסיר
             אותו מכאן – הוא נערך על כרטיס העובד. */
          var fixed = Store.standingBlocks(emp, day.idx, shiftId, weekKey);
          if (fixed) { cls = 'block standing'; title = t('standing.cellTitle'); }
          else if (constraint.off) { cls = 'off-day'; title = t('constraints.dayOff'); }
          else if (constraint.blocked && constraint.blocked[shiftId]) { cls = 'block'; title = t('constraints.blocked'); }
          else if (constraint.preferred && constraint.preferred[shiftId]) { cls = 'pref'; title = t('constraints.preferred'); }
          html += '<button class="cstate ' + cls + '" title="' + esc(title) + '"' +
            (fixed ? ' disabled data-locked-always="1"' : '') + ' data-emp="' + esc(emp.id) +
            '" data-day="' + day.idx + '" data-shift="' + esc(shiftId) + '">' +
            esc(shiftLabel(shiftId)) + '</button>';
        });
        var standingDay = Store.standingFor(emp, day.idx, weekKey);
        html += '<button class="cstate day-off-btn ' + (standingDay.off ? 'off-day standing' : (constraint.off ? 'off-day' : 'free')) +
          '"' + (standingDay.off ? ' disabled data-locked-always="1" title="' + esc(t('standing.cellTitle')) + '"' : '') +
          ' data-emp="' + esc(emp.id) + '" data-day="' + day.idx + '" data-off="1">' +
          (constraint.off ? '✓ ' : '') + t('constraints.dayOff') + '</button>';
        html += leaveChips(emp.id, day.idx);
        html += cellTag + '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    $('#constraints-grid').innerHTML = html;
  }

  /* ========== עובדים ========== */
  /* ========== לשונית העובדים ==========

     עם שלושים עובדים, רשימה של כרטיסים פתוחים היא גלילה אין-סופית:
     כדי לשנות מכסה לעובד אחד צריך לעבור על כולם. לכן הכרטיסים
     מקופלים, עם שורת סיכום שמראה את מה שמחפשים בדרך כלל, ומעליהם
     חיפוש וסינון. */
  var empFilter = { text: '', branch: '', activeOnly: false };
  var expandedEmp = {};
  var branchOptionsKey = '';

  function normalizeSearch(value) {
    return String(value || '').trim().toLowerCase();
  }

  /* ===== תקרת התוכנית =====

     מנהל שנתקל בתקרה באמצע הקמת צוות אינו רוצה ללמוד על תוכניות
     – הוא רוצה להוסיף את העובד. השאלה אומרת בדיוק מה זה עולה
     ומתי זה ייגבה, ואישור עושה את שני הדברים: משדרג, ומוסיף את
     העובד שבגללו הכל התחיל.

     מה שאישור כאן אינו עושה: חיוב עכשיו. התוכנית משתנה, והמחיר
     החדש נכנס לתוקף בחיוב הבא. */
  function offerUpgrade(check, position, name, email) {
    var suggested = check.suggested;
    if (!suggested || !source.upgradePlan) {
      toast(check.problems.join(' '));
      if (source.onPlanBlocked) source.onPlanBlocked(check);
      return;
    }

    var charge = source.chargeInfo ? source.chargeInfo() : null;
    var lines = [
      t('plans.upgradeWhy', {
        plan: check.plan ? check.plan.name : '',
        max: check.plan ? check.plan.maxEmployees : ''
      }),
      t('plans.upgradeTo', {
        suggested: suggested.name, range: suggested.range, price: check.price
      }),
      (charge && charge.date && !charge.onTrial)
        ? t('plans.upgradeWhen', { date: charge.date })
        : t('plans.upgradeWhenTrial')
    ];

    askUpgrade({
      title: t('plans.upgradeTitle', { count: position }),
      lines: lines,
      confirmLabel: t('plans.upgradeYes'),
      cancelLabel: t('plans.upgradeNo')
    }).then(function (yes) {
      if (!yes) return;
      source.upgradePlan(suggested.id).then(function () {
        /* התוכנית כבר התחלפה, ולכן ההוספה השנייה עוברת את אותה
           בדיקה שחסמה רגע קודם */
        var created = addEmployee(name, false, email);
        if (!created) return;
        render();
        toast(t('plans.upgraded', { plan: suggested.name, price: check.price }));
      }, function (err) {
        toast((err && err.message) || t('plans.upgradeFailed'));
      });
    });
  }

  /* מסך האישור המלא כשהוא קיים, ושאלה של הדפדפן כשאינו – עדיף
     שאלה פשוטה על שדרוג שקורה בלי לשאול. */
  function askUpgrade(options) {
    if (window.ShiftConfirmUI && window.ShiftConfirmUI.ask) {
      return window.ShiftConfirmUI.ask(options);
    }
    return Promise.resolve(window.confirm
      ? window.confirm(options.title + '\n\n' + options.lines.join('\n')) : false);
  }

  /* מספר טלפון נשמר כפי שנכתב. אין כאן ניחוש של קידומת מדינה:
     המערכת עובדת בכמה מדינות, ומספר ש"תוקן" לפי אחת מהן הוא
     מספר שגוי בכל השאר. */
  function normalizePhone(value) {
    return String(value == null ? '' : value)
      .replace(/^['\u2019]+/, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  }

  /* שליחת פרטי כניסה לעובד. הסיסמה נולדת בשרת והולכת לדואר של
     העובד – היא אינה חוזרת למסך הזה. סיסמה שעוברת דרך המנהל
     נשארת אצלו: בצילום מסך, בוואטסאפ, לנצח. */
  function sendAccessTo(emp, button) {
    if (!source.sendAccess || blocked()) return;
    if (!emp.email) { toast(t('employees.accessNoEmail')); return; }
    if (!confirm(t('employees.sendAccessConfirm', { name: emp.name, email: emp.email }))) return;
    if (button) button.disabled = true;
    source.sendAccess(emp).then(function () {
      if (button) button.disabled = false;
      toast(t('employees.accessSent', { email: emp.email }));
    }, function (err) {
      if (button) button.disabled = false;
      toast((err && err.message) || t('employees.accessFailed'));
    });
  }

  function visibleEmployees() {
    var text = normalizeSearch(empFilter.text);
    return state.employees.filter(function (emp) {
      if (empFilter.activeOnly && !emp.active) return false;
      if (empFilter.branch) {
        /* "מחליף כללי" (בלי סניפים) שייך לכל סניף, ולכן הוא נשאר
           ברשימה גם כשמסננים לפי סניף אחד. */
        var anyBranch = !emp.branches || !emp.branches.length;
        if (!anyBranch && emp.branches.indexOf(empFilter.branch) === -1) return false;
      }
      if (text) {
        var haystack = normalizeSearch(emp.name) + ' ' + normalizeSearch(emp.note);
        if (haystack.indexOf(text) === -1) return false;
      }
      return true;
    });
  }

  function filterActive() {
    return !!(empFilter.text || empFilter.branch || empFilter.activeOnly);
  }

  /* שורת הסיכום על כרטיס מקופל: סניפים, משמרות ומכסה */
  function employeeSummary(emp) {
    var parts = [];
    if (emp.branches && emp.branches.length) {
      parts.push(emp.branches.map(branchNameOf).join(', '));
    } else {
      parts.push(t('employees.anyBranch'));
    }
    var all = shiftList();
    parts.push(emp.shifts.length === all.length
      ? t('employees.allShifts')
      : emp.shifts.map(shiftLabel).join(', '));
    /* התפקידים בשורת הסיכום המקופלת: מנהל שסורק שלושים כרטיסים
       מחפש בדיוק את זה, ולא רוצה לפתוח כל אחד. */
    var mine = Store.employeeRoles(emp);
    if (mine.length) {
      parts.push(mine.map(function (id) { return Store.roleName(state, id); })
        .filter(Boolean).join(', '));
    }
    parts.push(t('employees.quotaShort', { count: emp.maxShifts }));
    if (!emp.active) parts.push(t('employees.inactiveTag'));
    return parts.join(' · ');
  }

  function renderBranchFilter() {
    var select = $('#emp-branch-filter');
    if (!select) return;
    var key = state.branches.map(function (branch) {
      return branch.id + ':' + branch.name;
    }).join('|') + '|' + (I18n ? I18n.code() : '');
    /* הבורר נבנה מחדש רק כשרשימת הסניפים או השפה השתנו, ולא בכל
       הקשה בתיבת החיפוש */
    if (key === branchOptionsKey) { select.value = empFilter.branch; return; }
    branchOptionsKey = key;
    select.innerHTML = '<option value="">' + esc(t('employees.allBranchesFilter')) + '</option>' +
      state.branches.map(function (branch) {
        return '<option value="' + esc(branch.id) + '">' + esc(branch.name) + '</option>';
      }).join('');
    select.value = empFilter.branch;
  }

  function renderEmployees() {
    var shown = visibleEmployees();
    var html = '';

    shown.forEach(function (emp) {
      var open = !!expandedEmp[emp.id];
      html += '<div class="card' + (emp.active ? '' : ' inactive') +
        (open ? '' : ' collapsed') + '" data-emp="' + esc(emp.id) + '">';
      html += '<div class="card-head">' +
        '<button class="card-toggle" data-action="toggle-card" aria-expanded="' +
          (open ? 'true' : 'false') + '" data-i18n-title="employees.toggleCard" title="' +
          esc(t('employees.toggleCard')) + '">' + (open ? '▾' : '▸') + '</button>' +
        '<input class="name" data-field="name" value="' + esc(emp.name) + '">' +
        '<button class="btn icon danger" data-action="delete-emp" title="' +
          esc(t('common.delete')) + '">🗑</button></div>';
      html += '<button class="card-summary" data-action="toggle-card">' +
        esc(employeeSummary(emp)) + '</button>';

      html += '<div class="card-body">';
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
        html += '<button class="pill' + on + '" data-action="toggle-shift" data-shift="' + shift.id + '">' + esc(shift.name) + '</button>';
      });
      html += '</div></div>';
      /* אילוץ קבוע: מה שנכון לעובד הזה בכל שבוע.

         עובד שלומד כל שני בערב לא צריך להגיש בקשה כל שבוע ולבזבז
         עליה מהמכסה – זה לא משהו שמבקשים, זה משהו שסוכם. לכן זה
         יושב כאן, על הכרטיס, ולא על שבוע מסוים.

         לחיצה על שם המשמרת חוסמת אותה באותו יום; "כל היום" חוסם
         את היום כולו. יום נקי אינו מוצג כלל, כדי שהכרטיס של רוב
         העובדים יישאר קצר. */
      html += '<div class="field standing-field"><label class="title">' +
        t('standing.title') + '</label>';
      html += '<p class="hint">' + esc(t('standing.hint')) + '</p>';
      /* תדירות ההסדר. יש הסדרים שאינם שבועיים – "פעם בשבועיים
         הוא עובד חמישה ימים בלי שישי ומוצ"ש" – ואילוץ כזה נכון
         בשבוע אחד ושגוי בשני. */
      var cycle = Store.standingCycle(emp);
      html += '<div class="pills standing-cycle">' +
        '<button class="pill tiny' + (cycle ? '' : ' on') +
          '" data-action="standing-every" data-every="1">' +
          esc(t('standing.everyWeek')) + '</button>' +
        '<button class="pill tiny' + (cycle ? ' on' : '') +
          '" data-action="standing-every" data-every="2">' +
          esc(t('standing.everyTwo')) + '</button></div>';
      if (cycle) {
        html += '<p class="hint">' +
          esc(t('standing.cycleOn', {
            date: Store.formatDate(Store.dateOfDay(cycle.anchor, 0))
          })) +
          ' <button class="pill tiny" data-action="standing-anchor">' +
          esc(t('standing.cycleShift')) + '</button></p>';
      }
      html += '<div class="standing-grid">';
      Data.DAYS.forEach(function (dayInfo, dayIdx) {
        var day = Store.standingFor(emp, dayIdx);
        var any = day.off || Object.keys(day.blocked).length > 0;
        html += '<div class="standing-row' + (any ? ' on' : '') + '">' +
          '<span class="standing-day">' + esc(dayInfo.name) + '</span>' +
          '<div class="pills">';
        html += '<button class="pill tiny' + (day.off ? ' on' : '') +
          '" data-action="standing-off" data-day="' + dayIdx + '">' +
          esc(t('standing.allDay')) + '</button>';
        shiftList().forEach(function (shift) {
          var on = !day.off && day.blocked[shift.id] ? ' on' : '';
          html += '<button class="pill tiny' + on + (day.off ? ' muted' : '') +
            '" data-action="standing-shift" data-day="' + dayIdx +
            '" data-shift="' + esc(shift.id) + '">' + esc(shift.name) + '</button>';
        });
        html += '</div></div>';
      });
      html += '</div>';
      html += '<p class="hint quiet">' + esc(t('standing.noQuota')) + '</p></div>';

      /* התפקידים. מוצגים רק לעסק שהגדיר אותם – מי שלא צריך
         תפקידים לא צריך לדעת שהם קיימים. */
      var roleList = Store.roles(state);
      if (roleList.length) {
        var mine = Store.employeeRoles(emp);
        html += '<div class="field"><label class="title">' + t('positions.employeeLabel') + '</label><div class="pills">';
        roleList.forEach(function (role) {
          var on = mine.indexOf(role.id) !== -1 ? ' on' : '';
          html += '<button class="pill role-pill sh sh-' + Store.roleColor(state, role.id) + on +
            '" data-action="toggle-role" data-role="' + esc(role.id) + '">' + esc(role.name) + '</button>';
        });
        html += '</div>' +
          '<p class="hint role-hint' + (mine.length ? ' hidden' : '') + '">' +
            esc(t('positions.employeeHint')) + '</p></div>';
      }
      html += '<div class="field"><label class="title">' + t('employees.maxShifts') + '</label>' +
        '<input class="num-input" type="number" min="0" max="14" data-field="maxShifts" value="' + esc(emp.maxShifts) + '"></div>';
      /* המייל אינו נדרש לשיבוץ. הוא יושב כאן כי הוא מגיע בייבוא,
         והוא מה שמונע כרטיס כפול לאותו עובד בייבוא הבא. */
      html += '<div class="field"><label class="title">' + t('employees.email') + '</label>' +
        '<input class="text-input" type="email" dir="ltr" data-field="email" ' +
        'value="' + esc(emp.email || '') + '"></div>';
      /* הטלפון אינו משמש את השיבוץ. הוא כאן כי כשמשמרת נופלת
         בשבע בבוקר, מחפשים מספר – ולא במחברת. */
      html += '<div class="field"><label class="title">' + t('employees.phone') + '</label>' +
        '<input class="text-input" type="tel" dir="ltr" data-field="phone" ' +
        'value="' + esc(emp.phone || '') + '"></div>';
      /* שליחת פרטי כניסה. קיימת רק כשיש שרת שיודע לשלוח דואר –
         בכלי המקומי אין למי לשלוח ואין ממה. */
      if (source.sendAccess) {
        html += '<div class="field access-field">' +
          '<button class="btn ghost small" data-action="send-access">' +
          esc(t('employees.sendAccess')) + '</button>' +
          '<p class="hint">' + esc(t('employees.sendAccessHint')) + '</p></div>';
      }
      html += '<div class="field"><label class="title">' + t('employees.note') + '</label>' +
        '<input class="text-input" data-field="note" value="' + esc(emp.note || '') + '"></div>';
      html += '</div></div>';
    });

    if (!shown.length) {
      html = '<p class="list-empty">' + esc(t(state.employees.length
        ? 'employees.noMatch' : 'employees.none')) + '</p>';
    }
    $('#employees-list').innerHTML = html;

    renderBranchFilter();
    var count = $('#emp-count');
    if (count) {
      count.textContent = shown.length === state.employees.length
        ? tPlural('employees.total', state.employees.length)
        : t('employees.showing', { shown: shown.length, total: state.employees.length });
    }

    var anyClosed = shown.some(function (emp) { return !expandedEmp[emp.id]; });
    var expand = $('#emp-expand-all');
    if (expand) {
      expand.textContent = t(anyClosed ? 'employees.expandAll' : 'employees.collapseAll');
      expand.dataset.mode = anyClosed ? 'expand' : 'collapse';
      expand.classList.toggle('hidden', !shown.length);
    }

    /* פעולות על כל המוצגים נחשפות רק כשיש סינון. בלי סינון "המוצגים"
       הם כל העובדים, וכפתור שמשבית את כולם בלחיצה אחת הוא מלכודת. */
    [['#emp-bulk-active', true], ['#emp-bulk-inactive', false]].forEach(function (pair) {
      var button = $(pair[0]);
      if (!button) return;
      var relevant = shown.some(function (emp) { return emp.active !== pair[1]; });
      button.classList.toggle('hidden', !(filterActive() && relevant));
    });
  }

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
      /* תמהיל התפקידים של המשמרת: כמה אנשים בכל תפקיד.

         משמרת בוקר בבית קפה אינה "שלושה אנשים" אלא מטבח אחד,
         מלצר אחד וברמן אחד – משמרת אחת עם שלושה אנשים בשלושה
         תפקידים. מה שנשאר מעבר לסכום הוא "כל אחד", וזו בדיוק
         ההתנהגות שהייתה לפני שהתפקידים קיימים.

         מוצג רק לעסק שהגדיר תפקידים. מי שלא הגדיר לא יודע
         שהם קיימים, והתא שלו נשאר קצר כמו קודם. */
      var roleList = Store.roles(state);
      if (roleList.length) {
        var lines = Store.roleNeedsOf(state, config, need);
        var open = 0;
        html += '<div class="sched-roles">';
        lines.forEach(function (line) {
          if (!line.role) { open = line.count; return; }
          html += '<div class="sched-role-row">' +
            '<span class="role-swatch sh sh-' + Store.roleColor(state, line.role) + '"></span>' +
            '<span class="sched-role-name">' + esc(Store.roleName(state, line.role)) + '</span>' +
            '<input class="num-input" type="number" min="1" max="9" ' +
              'data-role-need="' + esc(line.role) + '" value="' + line.count + '" ' +
              'aria-label="' + esc(Store.roleName(state, line.role)) + '">' +
            '<button type="button" class="link-btn tiny" data-role-remove="' + esc(line.role) + '" ' +
              'title="' + esc(t('positions.slotRemove')) + '" ' +
              'aria-label="' + esc(t('positions.slotRemove')) + '">×</button>' +
            '</div>';
        });
        if (open) {
          html += '<div class="sched-role-open">' +
            esc(t('positions.slotOpen', { count: open })) + '</div>';
        }

        /* רק תפקידים שעוד לא בתמהיל. אחרת הרשימה מציעה להוסיף
           פעם שנייה את מה שכבר שם. */
        var free = roleList.filter(function (role) {
          return !Store.slotRoleCount(state, config, role.id);
        });
        if (free.length) {
          html += '<select class="text-input tiny" data-role-add>' +
            '<option value="">' + esc(t('positions.slotAdd')) + '</option>';
          free.forEach(function (role) {
            html += '<option value="' + esc(role.id) + '">' + esc(role.name) + '</option>';
          });
          html += '</select>';
        }
        html += '</div>';
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
        '<button class="btn ghost small" data-action="reset-branch" title="' +
          esc(t('branches.resetTitle')) + '">' + esc(t('branches.resetWeek')) + '</button>' +
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

  /* תקרת הבקשות. מוצגת גם כשהיא כבויה, כדי שמנהל שמחפש אותה
     ימצא אותה במקום לנחש שהיא לא קיימת. */
  function renderLimit() {
    var toggle = $('#opt-limit');
    if (!toggle) return;
    var config = Store.constraintLimitSettings(state);
    var max = $('#limit-max');

    toggle.checked = config.enabled;
    max.value = config.max;

    toggle.disabled = viewOnly;
    max.disabled = viewOnly || !config.enabled;

    var unit = $('#limit-unit');
    if (unit) { unit.textContent = tPlural('settings.limitUnit', config.max); }
  }

  /* ========== הגדרות ========== */
  /* ===================== תפקידים =====================

     "שלושה אנשים במשמרת" אינו מה שעסק באמת צריך. בית קפה צריך
     מטבח ומלצר, וסופר צריך קופאי וסדרן. כאן מגדירים אותם;
     בכרטיס העובד מסמנים מי מחזיק מה; ובלוח הסניף בוחרים איזה
     תפקיד כל משמרת מחפשת.

     שני הכללים פתוחים לרווחה: משמרת בלי תפקיד מקבלת כל אחד,
     ועובד בלי תפקיד מתאים לכל משמרת. עסק שלא צריך את זה לא
     יודע שזה קיים. */
  function renderRoles() {
    var host = $('#roles-list');
    if (!host) return;
    var list = Store.roles(state);

    if (!list.length) {
      host.innerHTML = '<p class="list-empty">' + esc(t('positions.none')) + '</p>';
      return;
    }

    var html = '';
    list.forEach(function (role) {
      /* כמה עובדים מסומנים בתפקיד. מספר אפס כאן פירושו שמשמרת
         שתדרוש אותו לא תאויש לעולם, ועדיף לדעת את זה עכשיו. */
      var marked = state.employees.filter(function (emp) {
        return emp.active && Store.employeeRoles(emp).indexOf(role.id) !== -1;
      }).length;

      html += '<div class="role-row" data-role="' + esc(role.id) + '">';
      html += '<span class="role-swatch sh sh-' + Store.roleColor(state, role.id) + '"></span>';
      html += '<input class="text-input role-name" data-field="name" maxlength="30" value="' +
        esc(role.name) + '" aria-label="' + esc(t('positions.name')) + '">';
      html += '<div class="shift-colors">';
      Data.SHIFT_COLORS.forEach(function (color) {
        html += '<button type="button" class="color-dot sh sh-' + color.id +
          (Store.roleColor(state, role.id) === color.id ? ' active' : '') +
          '" data-color="' + color.id + '" title="' + esc(color.name) + '"></button>';
      });
      html += '</div>';
      html += '<span class="role-count' + (marked ? '' : ' empty') + '">' +
        esc(t('positions.fits', { count: marked })) + '</span>';
      html += '<button type="button" class="btn icon danger" data-remove="1" aria-label="' +
        esc(t('positions.remove')) + '" title="' + esc(t('positions.remove')) + '">' +
        ico('trash') + '</button>';
      html += '</div>';
    });
    host.innerHTML = html;
  }

  /* ===== פרטי העסק =====
     השם המסחרי ומספר העוסק / ח.פ. הבלוק קיים רק בגרסה המסחרית
     ורק לבעל החשבון: בכלי המקומי אין עסק רשום ואין חשבונית, ולמנהל
     אין הרשאה לשנות – ולכן הוא לא רואה טופס שייכשל. */
  function renderCompanyDetails() {
    var block = $('#company-details');
    if (!block) return;
    var details = source.companyDetails;
    block.classList.toggle('hidden', !details);
    if (!details) return;
    var current = details.read();
    var nameField = $('#company-name');
    var taxField = $('#company-tax-id');
    /* הקלדה באמצע אינה נדרסת: המסך מצויר מחדש גם בעקבות שינוי
       שהגיע מחבר צוות אחר. */
    if (nameField && document.activeElement !== nameField) nameField.value = current.name;
    if (taxField && document.activeElement !== taxField) taxField.value = current.taxId;
  }

  function sayCompany(text, isError) {
    var node = $('#company-message');
    if (!node) return;
    node.textContent = text || '';
    node.className = 'users-message' + (text ? '' : ' hidden') + (isError ? ' error' : '');
  }

  function renderSettings() {
    renderCompanyDetails();
    $('#opt-one-per-day').checked = !!state.settings.onePerDay;
    $('#opt-rest').checked = !!state.settings.restEveningMorning;
    $('#opt-one-day-off').checked = !!state.settings.oneDayOffPerWeek;
    $('#default-shabbat').value = state.settings.defaultShabbatEnd || '';
    renderDeadline();
    renderLimit();
    renderRoles();

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
    '#add-employee', '#add-branch', '#import-employees',
    '#employees-list input', '#employees-list button:not(.card-toggle):not(.card-summary)',
    '#emp-bulk-active', '#emp-bulk-inactive',
    '#branches-list input', '#branches-list button', '#branches-list select',
    '#opt-one-per-day', '#opt-rest', '#opt-one-day-off', '#default-shabbat',
    '#opt-deadline', '#deadline-day', '#deadline-time', '#deadline-remind',
    '#reset-all'
  ];

  function applyViewOnly() {
    document.body.classList.toggle('view-only', viewOnly);
    $('#view-only-banner').classList.toggle('hidden', !viewOnly);

    var button = $('#view-only-toggle');
    /* innerHTML ולא textContent: הכפתור נושא אייקון SVG, וכתיבת
       טקסט הייתה מוחקת אותו ומשאירה מילה בלי סימן. */
    button.innerHTML = ico(viewOnly ? 'unlock' : 'lock') + '<span>' +
      esc(t(viewOnly ? 'toolbar.exitViewOnly' : 'toolbar.viewOnly')) + '</span>';
    button.setAttribute('aria-pressed', viewOnly ? 'true' : 'false');

    LOCKED_SELECTORS.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (node) {
        /* פקד שנעול מסיבה משלו נשאר נעול. מצב צפייה מוסיף נעילה,
           הוא לא מסיר אותה – אחרת יציאה ממצב צפייה הייתה פותחת
           לעריכה דברים שאסור לערוך כאן בכלל, כמו אילוץ קבוע. */
        if (node.dataset.lockedAlways === '1') { node.disabled = true; return; }
        node.disabled = viewOnly;
      });
    });

    /* אחרונים, כדי שהנעילה לפי המצב עצמו לא תידרס */
    renderDeadline();
    renderPublish();
  }

  /* הוספת כרטיס עובד. מחזיר את הכרטיס, או null אם מגבלת התוכנית
     חוסמת – ואז ההודעה ללקוח כבר הוצגה.

     קיים גם כפונקציה בשם, ולא רק בתוך המאזין של הכפתור, כי הזמנת
     עובד למערכת צריכה ליצור לו כרטיס באותה הדרך בדיוק. */
  function addEmployee(name, defer, email) {
    if (source.planLimit) {
      var active = state.employees.filter(function (emp) { return emp.active; }).length;
      var check = source.planLimit(active + 1);
      if (!check.ok) {
        /* תקרה שנתקלים בה באמצע עבודה צריכה להציע מוצא, ולא רק
           להודיע. ההצעה מופיעה בהוספה ידנית בלבד: בייבוא של
           שלושים שורות היא הייתה קופצת שלושים פעם. */
        if (!defer && source.upgradePlan) {
          offerUpgrade(check, active + 1, name, email);
          return null;
        }
        toast(source.canUpgrade === false
          ? t('plans.upgradeOwnerOnly') : check.problems.join(' '));
        if (source.onPlanBlocked) source.onPlanBlocked(check);
        return null;
      }
    }
    var employee = {
      id: Store.newId('emp'), name: String(name || '').trim() || t('employees.newName'),
      active: true, branches: [], shifts: Store.shiftIds(state).slice(),
      maxShifts: 6, note: '', phone: '',
      /* כרטיס שנפתח מתוך שליחת פרטי כניסה נולד עם המייל שלו,
         בכתיבה אחת. כתיבה שנייה מיד אחרי הראשונה נדרסת על ידי
         התשובה של הראשונה. */
      email: String(email || '').trim().toLowerCase()
    };
    state.employees.push(employee);
    /* כרטיס שנוסף ביד נפתח מיד – בשביל זה לחצו על הכפתור. בייבוא
       של עשרות כרטיסים הם נשארים מקופלים. */
    if (!defer) expandedEmp[employee.id] = true;
    /* בייבוא נוספים עשרות כרטיסים בבת אחת, ושמירה לכל אחד מהם היא
       עשרות פניות לשרת. שם השמירה נעשית פעם אחת בסוף. */
    if (!defer) persist('config');
    return employee;
  }

  function addBranch(name, defer) {
    var branch = {
      id: Store.newId('br'), name: String(name || '').trim() || t('branches.newName'),
      active: true, schedule: Data.defaultSchedule(null, state.settings.shifts)
    };
    state.branches.push(branch);
    if (!defer) persist('config');
    return branch;
  }

  /* ========== רינדור כולל ========== */
  function render() {
    renderWeekHeader();
    lastReport = Validate.validate(state, week());
    var marks = issueMaps(lastReport);
    renderIssues(lastReport);
    renderDayNav('#day-nav', mobileDay);
    renderDayNav('#constraints-day-nav', mobileDay);
    if (view === 'branch') { renderMobileSchedule(marks); }
    else { renderMobileEmployees(marks); }
    renderMobileConstraints();
    renderBranchView(marks);
    renderEmployeeView(marks);
    renderTray();
    renderWorkload();
    renderAvailability();
    renderPersonalPicker();
    renderConstraints();
    renderLeaveSummary();
    renderPending();
    renderEmployees();
    renderBranches();
    renderSettings();
    renderSaveState();
    applyView();
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
    var emp = Store.byId(state.employees, empId) || {};
    var rows = [];
    Data.DAYS.forEach(function (day) {
      var slots = Store.employeeDayAssignments(state, current, empId, day.idx);
      var constraint = Store.getConstraint(current, empId, day.idx);
      var date = Store.formatDate(Store.dateOfDay(weekKey, day.idx));

      if (!slots.length) {
        /* מה שכתוב בהעתקה שנשלחת לעובד הוא מה שהוא יראה מול
           התלוש, ולכן הוא חייב להיות מדויק: יום חופש בתשלום,
           יום חופש ללא תשלום, או המנוחה השבועית שסוכמה מראש –
           ושלושתם נראים אותו דבר בסידור. */
        var holiday = Store.isHoliday(current, day.idx);
        var standingOff = Store.standingFor(emp, day.idx, weekKey).off;
        var leave = Store.leaveOf(current, empId, day.idx);
        var status;
        if (holiday) { status = Store.holidayName(current, day.idx); }
        else if (standingOff) { status = t('leave.dayWeekly'); }
        else if (leave) {
          status = t(leave === Store.LEAVE.PAID ? 'leave.dayPaid' : 'leave.dayUnpaid');
        } else if (constraint.off) { status = t('leave.dayUnpaid'); }
        else { status = t('excel.notAssigned'); }
        var idle = !holiday && !standingOff && !leave && !constraint.off;
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
      /* הסיכום החודשי צריך את כל שבועות החודש, ולכן הם נטענים
         כשנכנסים ללשונית ולא בכל ציור. */
      if (button.dataset.tab === 'constraints') { loadLeaveMonth(); }
    });
  }

  /* ===== תפריטי הסרגל =====

     "ייצוא" ו"כלים נוספים". עד עכשיו כל הכלים היו פרושים מעל
     הסידור: שתי שורות כפתורים, שורת ייצוא אישי ושורת ימי חג –
     והטבלה התחילה באמצע המסך. עכשיו הם יושבים בשני תפריטים,
     והשורה העליונה נושאת רק את השבוע, מצב השמירה ומצב הפרסום.

     תפריט אחד פתוח בכל רגע; לחיצה בחוץ או Escape סוגרים, והפוקוס
     חוזר לכפתור שפתח – אחרת מי שמנווט במקלדת נזרק לראש הדף. */
  function openMenu(menu) {
    closeMenus(menu);
    if (!menu) return;
    menu.classList.add('open');
    var button = menu.querySelector('.menu-btn');
    var pop = menu.querySelector('.menu-pop');
    if (button) button.setAttribute('aria-expanded', 'true');
    if (pop) pop.classList.remove('hidden');
  }

  function closeMenus(except, focusButton) {
    document.querySelectorAll('.menu.open').forEach(function (menu) {
      if (menu === except) return;
      menu.classList.remove('open');
      var button = menu.querySelector('.menu-btn');
      var pop = menu.querySelector('.menu-pop');
      if (button) {
        button.setAttribute('aria-expanded', 'false');
        if (focusButton) button.focus();
      }
      if (pop) pop.classList.add('hidden');
    });
  }

  function bindMenus() {
    document.addEventListener('click', function (event) {
      var button = event.target.closest('.menu-btn');
      if (button) {
        event.preventDefault();
        var menu = button.closest('.menu');
        if (menu.classList.contains('open')) { closeMenus(); } else { openMenu(menu); }
        return;
      }
      /* פעולה בתוך התפריט סוגרת אותו; שדה או תיבת סימון אינם
         פעולה אלא הגדרה, ולכן משאירים את התפריט פתוח. */
      var item = event.target.closest('.menu-pop .menu-item, .menu-pop .btn');
      if (item) { window.setTimeout(closeMenus, 0); return; }
      if (event.target.closest('.menu-pop')) return;
      closeMenus();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (!document.querySelector('.menu.open')) return;
      closeMenus(null, true);
    });
  }

  function bindScheduleTab() {
    function goToWeek(nextKey) { openWeek(nextKey); }
    $('#prev-week').addEventListener('click', function () { goToWeek(Store.shiftWeekKey(weekKey, -1)); });
    $('#next-week').addEventListener('click', function () { goToWeek(Store.shiftWeekKey(weekKey, 1)); });
    $('#this-week').addEventListener('click', function () { goToWeek(Store.currentWeekKey()); });

    document.querySelectorAll('.view-switch .chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        if (view === chip.dataset.view) return;
        view = chip.dataset.view;
        try { window.localStorage.setItem(VIEW_KEY, view); } catch (err) { /* מצב פרטי */ }
        /* בטלפון שתי התצוגות הן אותו אזור, ולכן צריך לצייר מחדש
           ולא רק להחליף מה מוסתר. */
        render();
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

    /* הכלי המקומי אינו כולל את כפתורי הפרסום – אין לו עובדים
       שמתחברים, ולכן אין למי לפרסם. */
    if ($('#publish-week')) {
      $('#publish-week').addEventListener('click', function () {
        if (blocked()) return;
        askBeforePublish().then(function (go) {
          if (!go) return;
          Store.markPublished(week());
          persist('week');
          render();
          toast(t('publish.publishedNow'));
        });
      });

      $('#unpublish-week').addEventListener('click', function () {
        if (blocked()) return;
        if (!window.confirm(t('publish.confirmRevert'))) return;
        Store.markDraft(week());
        persist('week');
        render();
        toast(t('publish.revertedNow'));
      });
    }

    $('#view-only-toggle').addEventListener('click', function () {
      viewOnly = !viewOnly;
      try { window.localStorage.setItem(VIEW_ONLY_KEY, viewOnly ? '1' : '0'); } catch (err) { /* לא קריטי */ }
      render();
      toast(t(viewOnly ? 'toast.viewOnlyOn' : 'toast.viewOnlyOff'));
    });

    bindMenus();

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

    function onLeaveClick(event) {
      var chip = event.target.closest('[data-leave]');
      if (!chip) return;
      if (blocked()) return;
      var empId = chip.dataset.emp;
      var dayIdx = Number(chip.dataset.day);
      var kind = chip.dataset.leave;
      /* אחת משתי האפשרויות תמיד נכונה, ולכן לחיצה קובעת ואינה
         מבטלת: "ללא תשלום" היא ברירת המחדל, והיא נשמרת כהיעדר
         סימון. */
      if (Store.leaveOf(week(), empId, dayIdx) === kind) return;
      if (!Store.setLeave(week(), empId, dayIdx, kind)) return;
      persist();
      render();
    }

    var leaveInput = $('#leave-month');
    if (leaveInput) {
      leaveInput.addEventListener('change', function () { loadLeaveMonth(); });
    }
    var leaveExport = $('#leave-export');
    if (leaveExport) { leaveExport.addEventListener('click', exportLeave); }

    $('#constraints-grid').addEventListener('click', onConstraintClick);
    $('#constraints-mobile').addEventListener('click', onConstraintClick);
    $('#constraints-grid').addEventListener('click', onLeaveClick);
    $('#constraints-mobile').addEventListener('click', onLeaveClick);

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
      if (!addEmployee(t('employees.newName'))) return;
      render();
    });

    var list = $('#employees-list');
    list.addEventListener('click', function (event) {
      var card = event.target.closest('.card');
      if (!card) return;
      var emp = Store.byId(state.employees, card.dataset.emp);
      if (!emp) return;
      var action = (event.target.closest('[data-action]') || {}).dataset;
      action = action ? action.action : null;

      /* פתיחה וסגירה אינן שינוי נתונים, ולכן אינן נחסמות במצב צפייה
         ואינן נשמרות – זו העדפה של הרגע הזה בלבד. */
      if (action === 'toggle-card') {
        if (expandedEmp[emp.id]) delete expandedEmp[emp.id];
        else expandedEmp[emp.id] = true;
        renderEmployees();
        applyViewOnly();
        return;
      }

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
      if (action === 'send-access') {
        sendAccessTo(emp, event.target.closest('button'));
        return;
      }
      if (action === 'toggle-branch') {
        var branchId = event.target.dataset.branch;
        var index = emp.branches.indexOf(branchId);
        if (index === -1) emp.branches.push(branchId); else emp.branches.splice(index, 1);
        persist('config');
        render();
      }
      if (action === 'toggle-role') {
        var roleId = event.target.dataset.role;
        var roles = Store.employeeRoles(emp).slice();
        var at = roles.indexOf(roleId);
        if (at === -1) roles.push(roleId); else roles.splice(at, 1);
        emp.roles = roles;
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
      /* תדירות ההסדר הקבוע: כל שבוע, או כל שבועיים מהשבוע
         שמוצג עכשיו. */
      if (action === 'standing-every') {
        var every = Number(event.target.dataset.every) || 1;
        Store.setStandingCycle(emp, every, weekKey);
        persist('config');
        render();
        return;
      }
      /* הזזת המחזור בשבוע, למי שבחר את השבוע ההפוך */
      if (action === 'standing-anchor') {
        var moved = Store.standingCycle(emp);
        if (moved) {
          Store.setStandingCycle(emp, moved.every, Store.shiftWeekKey(moved.anchor, 1));
          persist('config');
          render();
        }
        return;
      }

      /* אילוץ קבוע. "כל היום" ומשמרת בודדת אינם מצטברים: מי
         שחסם את כל היום כבר חסם את כל המשמרות שבו. */
      if (action === 'standing-off') {
        var offDay = Number(event.target.dataset.day);
        var current = Store.standingFor(emp, offDay);
        Store.setStanding(emp, offDay, current.off ? null : { off: true });
        persist('config');
        render();
      }
      if (action === 'standing-shift') {
        var sDay = Number(event.target.dataset.day);
        var sShift = event.target.dataset.shift;
        var day = Store.standingFor(emp, sDay);
        if (day.off) return;   // היום כולו חסום; אין מה לסמן בתוכו
        var blocked = Object.assign({}, day.blocked);
        if (blocked[sShift]) delete blocked[sShift]; else blocked[sShift] = true;
        Store.setStanding(emp, sDay, { blocked: blocked });
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
      else if (field === 'email') emp.email = String(event.target.value || '').trim().toLowerCase();
      else if (field === 'phone') emp.phone = normalizePhone(event.target.value);
      else emp[field] = event.target.value;
      persist('config');
      if (field === 'active' || field === 'maxShifts') render();
    });

    var tools = $('#employees-tools');
    if (tools) {
      /* החיפוש מצייר רק את הרשימה, ולא את סרגל הכלים עצמו, אחרת
         הסמן היה נופל מתיבת החיפוש בכל הקשה. */
      tools.addEventListener('input', function (event) {
        if (event.target.id !== 'emp-search') return;
        empFilter.text = event.target.value;
        renderEmployees();
        applyViewOnly();
      });
      tools.addEventListener('change', function (event) {
        if (event.target.id === 'emp-branch-filter') empFilter.branch = event.target.value;
        else if (event.target.id === 'emp-active-only') empFilter.activeOnly = event.target.checked;
        else return;
        renderEmployees();
        applyViewOnly();
      });
      tools.addEventListener('click', function (event) {
        var button = event.target.closest('button');
        if (!button) return;

        if (button.id === 'emp-expand-all') {
          var opening = button.dataset.mode === 'expand';
          visibleEmployees().forEach(function (emp) {
            if (opening) expandedEmp[emp.id] = true;
            else delete expandedEmp[emp.id];
          });
          renderEmployees();
          applyViewOnly();
          return;
        }

        if (button.id !== 'emp-bulk-active' && button.id !== 'emp-bulk-inactive') return;
        if (blocked()) return;
        var active = button.id === 'emp-bulk-active';
        var targets = visibleEmployees().filter(function (emp) { return emp.active !== active; });
        if (!targets.length) return;
        /* פעולה על כמה עובדים בבת אחת מקבלת אישור עם המספר, כי
           ביטול שלה הוא עבודה ידנית */
        if (!confirm(t(active ? 'employees.bulkActivateConfirm' : 'employees.bulkDeactivateConfirm',
          { count: targets.length }))) return;
        targets.forEach(function (emp) { emp.active = active; });
        persist('config');
        render();
        toast(t('employees.bulkDone', { count: targets.length }));
      });
    }

    /* ייבוא רשימה קיימת. הכפתור קיים רק כשהמסך נטען עם המודול,
       כדי שהכלי המקומי לא ייפול על כפתור שאין לו מסך. */
    var importButton = $('#import-employees');
    if (importButton && window.ShiftImportUI) {
      importButton.addEventListener('click', function () {
        if (blocked()) return;
        window.ShiftImportUI.open({
          getState: function () { return state; },
          /* התבנית להורדה, וההודעות – דרך אותם עוזרים שכל שאר
             המסך משתמש בהם */
          saveFile: saveFile,
          toast: toast,
          createEmployee: function (name) { return addEmployee(name, true); },
          createBranch: function (name) { return addBranch(name, true); },
          /* כתיבה אחת בסוף, אחרי כל הכרטיסים */
          commit: function () { persist('config'); render(); },
          /* כתובות שכבר יש להן חשבון בחברה. הן יושבות בשרת ולא
             במצב, ולכן נטענות כשהמסך נפתח. */
          loadEmails: source.listUserEmails || null,
          /* ייבוא שגוי הוא שלושים כרטיסים למחיקה ביד. ביטול מסיר
             בדיוק את מה שנוצר, כולל סניפים ושיבוצים שנגררו. */
          undo: function (created) {
            var removed = Store.removeImported(state, created);
            persist('config');
            render();
            toast(t('importData.undone', { count: removed.employees }));
          },
          toast: toast
        });
      });
    } else if (importButton) {
      importButton.classList.add('hidden');
    }
  }

  function bindBranchesTab() {
    $('#add-branch').addEventListener('click', function () {
      if (blocked()) return;
      addBranch(t('branches.newName'));
      render();
    });

    var list = $('#branches-list');
    list.addEventListener('click', function (event) {
      /* הסרת תפקיד מהתמהיל של משמרת אחת. סך האנשים במשמרת יורד
         יחד איתו, כי המקום הזה נפתח בשביל התפקיד הזה. */
      var drop = event.target.closest('[data-role-remove]');
      if (drop) {
        if (blocked()) return;
        var dropCell = drop.closest('.sched-cell');
        var dropCard = drop.closest('.card');
        var dropBranch = Store.byId(state.branches, dropCard.dataset.branch);
        if (!dropBranch) return;
        Store.setSlotRoleCount(state, dropBranch, dropCell.dataset.day,
          dropCell.dataset.shift, drop.dataset.roleRemove, 0);
        Store.normalizeSchedule(dropBranch.schedule);
        persist('config');
        render();
        return;
      }
      /* איפוס סניף לשבוע הזה: כל השיבוצים של הסניף בשבוע שמוצג
         יורדים בלחיצה אחת. שאר הסניפים ושאר השבועות אינם נוגעים.

         זה לא מוחק את ההגדרה של הסניף – הימים, השעות וכמות
         האנשים נשארים. רק מי שובץ. */
      var reset = event.target.closest('[data-action="reset-branch"]');
      if (reset) {
        if (blocked()) return;
        var resetCard = reset.closest('.card');
        var resetBranch = Store.byId(state.branches, resetCard.dataset.branch);
        if (!resetBranch) return;
        var current = week();
        var slots = Object.keys(current.assignments || {}).filter(function (slot) {
          return slot.split('|')[1] === resetBranch.id;
        });
        var count = slots.reduce(function (sum, slot) {
          return sum + (current.assignments[slot] || []).length;
        }, 0);
        if (!count) { toast(t('branches.resetEmpty', { name: resetBranch.name })); return; }
        if (!confirm(t('branches.resetConfirm', {
          name: resetBranch.name, count: count,
          week: Store.formatDate(Store.dateOfDay(weekKey, 0)) + ' – ' +
            Store.formatDate(Store.dateOfDay(weekKey, 6))
        }))) return;
        slots.forEach(function (slot) {
          delete current.assignments[slot];
          if (current.manual) delete current.manual[slot];
        });
        persist();
        render();
        toast(t('branches.resetDone', { count: count, name: resetBranch.name }));
        return;
      }

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

      /* תמהיל התפקידים במשמרת. שינוי כמות בתפקיד מזיז גם את סך
         האנשים במשמרת: מי שביקש עוד מלצר ביקש עוד אדם, ולא
         לקחת אותו ממקום אחר. */
      if (input.dataset.roleNeed || input.hasAttribute('data-role-add')) {
        var roleCell = input.closest('.sched-cell');
        var roleDay = roleCell.dataset.day;
        var roleShift = roleCell.dataset.shift;
        if (input.dataset.roleNeed) {
          Store.setSlotRoleCount(state, branch, roleDay, roleShift,
            input.dataset.roleNeed, Math.max(1, Number(input.value) || 1));
        } else if (input.value) {
          Store.setSlotRoleCount(state, branch, roleDay, roleShift, input.value, 1);
        }
        Store.normalizeSchedule(branch.schedule);
        persist('config');
        render();
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
          /* אי אפשר לבקש שלושה אנשים ולסמן ארבעה תפקידים. מי
             שרוצה פחות אנשים מוריד קודם תפקיד. */
          var mixTotal = Store.slotRoleTotal(state, config);
          if (need > 0 && need < mixTotal) {
            toast(t('positions.slotBelowMix', { count: mixTotal }));
            render();
            return;
          }
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

    /* ===== תפקידים ===== */
    $('#add-role').addEventListener('click', function () {
      if (blocked()) return;
      var list = Store.roles(state);
      state.settings.roles = list.concat([{
        id: Store.newId('role'),
        name: t('positions.newName'),
        color: list.length % Data.SHIFT_COLORS.length
      }]);
      persist('config');
      render();
      var added = $('#roles-list .role-row:last-child .role-name');
      if (added) { added.focus(); added.select(); }
    });

    $('#roles-list').addEventListener('change', function (event) {
      var row = event.target.closest('.role-row');
      if (!row || event.target.dataset.field !== 'name') return;
      if (blocked()) { render(); return; }
      var role = Store.roleById(state, row.dataset.role);
      if (!role) return;
      var name = event.target.value.trim();
      if (!name) { toast(t('positions.emptyName')); render(); return; }
      /* שני תפקידים באותו שם הם בדיוק המקום שבו המנהל מסמן את
         העובד הלא נכון, ואז לא מבין למה המשמרת לא אוישה. */
      var taken = Store.roles(state).some(function (other) {
        return other.id !== role.id && other.name.trim() === name;
      });
      if (taken) { toast(t('positions.duplicate')); render(); return; }
      role.name = name;
      persist('config');
      render();
    });

    $('#roles-list').addEventListener('click', function (event) {
      var row = event.target.closest('.role-row');
      if (!row) return;
      if (blocked()) return;
      var role = Store.roleById(state, row.dataset.role);
      if (!role) return;

      var colorButton = event.target.closest('[data-color]');
      if (colorButton) {
        role.color = Number(colorButton.dataset.color);
        persist('config');
        render();
        return;
      }

      if (!event.target.closest('[data-remove]')) return;
      /* המחיקה נוגעת גם בכרטיסי העובדים וגם בלוחות הסניפים,
         ולכן האישור אומר בכמה. */
      var marked = state.employees.filter(function (emp) {
        return Store.employeeRoles(emp).indexOf(role.id) !== -1;
      }).length;
      var slots = 0;
      state.branches.forEach(function (branch) {
        Object.keys(branch.schedule || {}).forEach(function (day) {
          Object.keys(branch.schedule[day] || {}).forEach(function (shiftId) {
            if (Store.slotRoleCount(state, branch.schedule[day][shiftId], role.id)) slots++;
          });
        });
      });
      if (!confirm(t('positions.removeConfirm', {
        name: role.name, employees: marked, slots: slots
      }))) return;
      Store.removeRole(state, role.id);
      persist('config');
      render();
      toast(t('positions.removed'));
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

    function saveLimit(patch) {
      var current = Store.constraintLimitSettings(state);
      state.settings.constraintLimit = Object.assign({}, current, patch);
      persist('config');
      render();
    }
    $('#opt-limit').addEventListener('change', function (event) {
      saveLimit({ enabled: event.target.checked });
    });
    $('#limit-max').addEventListener('change', function (event) {
      var value = Math.round(Number(event.target.value));
      /* אפס או מספר שלילי אינם "בלי הגבלה" אלא "אסור להגיש כלום",
         וזו הגדרה שאיש לא התכוון אליה. כיבוי נעשה בתיבת הסימון. */
      if (!(value >= 1)) { toast(t('settings.limitMin')); render(); return; }
      saveLimit({ max: Math.min(7, value) });
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

    var saveCompany = $('#save-company-details');
    if (saveCompany) {
      saveCompany.addEventListener('click', function () {
        var details = source.companyDetails;
        if (!details) return;
        var name = String($('#company-name').value || '').trim();
        if (!name) { sayCompany(t('company.nameRequired'), true); return; }
        saveCompany.disabled = true;
        sayCompany('');
        Promise.resolve(details.save({ name: name, taxId: $('#company-tax-id').value }))
          .then(function () {
            saveCompany.disabled = false;
            /* מה שנשמר בשרת הוא מה שחוזר למסך: מספר עוסק שהוקלד עם
               רווחים נראה כאן אחרי הניקוי, ולא כפי שהוקלד. */
            renderCompanyDetails();
            sayCompany(t('company.saved'));
          }, function (err) {
            saveCompany.disabled = false;
            sayCompany((err && err.message) || t('company.saveFailed'), true);
          });
      });
    }

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

  /* short – שעה ודקה בלבד, לטקסט שנקרא כמשפט ולא כחותמת */
  function timeLabel(date, short) {
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    var text = pad(date.getHours()) + ':' + pad(date.getMinutes());
    return short ? text : text + ':' + pad(date.getSeconds());
  }

  /* לאן הנתונים באמת הולכים. מצב ההדגמה משתמש בשרת מדומה שיושב
     בדפדפן, ולכן "יש שרת" אינו אותו דבר כמו "יש ענן". */
  function storageIsCloud() {
    if (source.storage) return source.storage === 'cloud';
    return Platform.syncState === 'live';
  }

  function renderSaveState() {
    var node = $('#sync-state');
    if (!node) return;
    var cloud = storageIsCloud();
    var text, cls, hint;

    if (syncStatus === 'readonly') {
      text = t('status.readOnly');
      cls = 'readonly';
      hint = t('status.readOnly');
    } else if (save.status === 'saving') {
      text = t('status.saving');
      cls = 'saving';
      hint = t(cloud ? 'ui.cloudSaved' : 'ui.deviceSaved');
    } else if (save.status === 'error') {
      text = t('status.saveFailed');
      cls = 'error';
      hint = t('status.saveFailedHint');
    } else if (save.status === 'saved' && save.at) {
      text = t(cloud ? 'status.savedCloudAt' : 'status.savedDeviceAt',
        { time: timeLabel(save.at) });
      cls = cloud ? 'live' : 'local';
      hint = t(cloud ? 'ui.cloudSaved' : 'ui.deviceSaved');
    } else {
      text = t(cloud ? 'status.savedCloud' : 'status.localOnly');
      cls = cloud ? 'live' : 'local';
      hint = t(cloud ? 'ui.cloudSaved' : 'ui.deviceSaved');
    }

    node.textContent = text;
    node.className = 'sync-state ' + cls;
    node.title = hint;
    /* הטקסט נבנה כאן ולא מתרגום סטטי, אחרת החלפת שפה תחזיר אותו לברירת המחדל */
    node.removeAttribute('data-i18n');

    // עותק מקומי של הקובץ לעולם לא יסתנכרן – כדאי שזה יהיה ברור
    var notice = $('#local-notice');
    var isLocalFile = location.protocol === 'file:';
    if (notice) notice.classList.toggle('hidden', !(isLocalFile && !cloud));
  }

  function renderSyncState(status) {
    syncStatus = status || syncStatus;
    renderSaveState();
  }

  /* פרסום הוא הרגע שבו הסידור הופך למה שהעובדים רואים, והוא אינו
     נסוג בלחיצה אחת: מי שכבר ראה אותו וסידר את השבוע לפיו לא
     "מבטל" את זה. לכן לפניו מוצג מה בדיוק עומד להתפרסם – ובראש
     ובראשונה כמה בעיות נשארו פתוחות בו. */
  function askBeforePublish() {
    if (!window.ShiftConfirmUI) return Promise.resolve(true);

    var groups = {};
    (lastReport.groups || []).forEach(function (group) { groups[group.name] = group.count; });
    var staffing = groups.staffing || 0;
    var violations = groups.violations || 0;

    /* המספר מוצג בגדול, ולכן התווית היא שם הקבוצה בלבד ולא משפט
       שחוזר על המספר */
    var facts = [
      { label: t('alerts.group.staffingName'), value: staffing,
        tone: staffing ? 'warn' : 'ok' },
      { label: t('alerts.group.violationsName'), value: violations,
        tone: violations ? 'bad' : 'ok' }
    ];

    var lines = [t('publish.confirmVisible')];
    if (!staffing && !violations) {
      lines.unshift(t('publish.confirmClean'));
    } else {
      lines.unshift(t('publish.confirmIssues'));
    }

    return window.ShiftConfirmUI.ask({
      title: t('publish.confirmTitle'),
      facts: facts,
      lines: lines,
      tone: violations ? 'danger' : '',
      confirmLabel: t('publish.confirmYes'),
      cancelLabel: t('publish.confirmNo')
    });
  }

  /* ========== טיוטה ופרסום ==========
     בלי פרסום מפורש הסידור נשאר טיוטה, והעובדים אינם רואים אותו.
     לכן הסטטוס נמצא ליד הכפתור ולא במסך אחר: השאלה "העובדים כבר
     רואים את זה?" נשאלת בדיוק כאן. */
  function renderPublish() {
    var button = $('#publish-week');
    var revert = $('#unpublish-week');
    var label = $('#publish-state');
    if (!button || !label) return;

    if (!source.canPublish) {
      [button, revert, label].forEach(function (node) {
        if (node) node.classList.add('hidden');
      });
      return;
    }

    var current = week();
    var mode = Store.publishState(current);
    var at = current.publishedAt ? new Date(current.publishedAt) : null;
    var when = at ? { date: Store.formatDate(at), time: timeLabel(at, true) } : {};

    label.classList.remove('hidden');
    label.className = 'publish-state ' + mode;
    label.textContent = t('publish.' + mode, when);

    button.classList.remove('hidden');
    /* "בדיקה ופרסום" ולא "פרסום": הלחיצה פותחת את מה שעומד
       להתפרסם, ואינה מפרסמת בעצמה. */
    button.textContent = t(mode === Store.PUBLISH_STATE.CHANGED ? 'publish.update' : 'publish.action');
    /* מפתח התרגום נקבע לפי המצב, ולכן החלפת שפה מצוירת מכאן */
    button.removeAttribute('data-i18n');
    button.disabled = viewOnly || mode === Store.PUBLISH_STATE.PUBLISHED;

    revert.classList.toggle('hidden', mode === Store.PUBLISH_STATE.DRAFT);
    revert.disabled = viewOnly;
  }

  function onSynced(date, fromRemote) {
    syncStatus = 'live';
    save.status = 'saved';
    save.at = date || new Date();
    renderSaveState();
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
  if (window.ShiftBrand) { window.ShiftBrand.render(); }
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
    bindShiftMoves();
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
    addEmployee: addEmployee,
    addBranch: addBranch,
    getState: function () { return state; },
    setState: function (next) { state = Store.migrate(next); render(); },
    applyRemoteConfig: applyRemoteConfig,
    /* שמירת ההגדרות לשרת. חשוף לשימוש חיצוני כי מסלולי הדפדפן
       בונים עסק מאויש ואז מרעננים; בלי שמירה הוא היה נעלם. */
    persistConfig: function () { return persist('config'); },
    /* ההעתקה שנשלחת לעובד. חשופה כדי שאפשר יהיה לבדוק את
       הנוסח שלה – זה הטקסט שהעובד מעמיד מול התלוש. */
    personalText: personalText,
    /* עדכון רשימת המשמרות בבת אחת. האשף עורך את כולן במסך אחד,
       ושמירה לכל שדה בנפרד הייתה מייצרת מצב ביניים שבו משמרת
       קיימת בלי שעות. שומר על הצבע והמזהה הקיימים, כי הם מה
       שקושר את המשמרת לשיבוצים שכבר נעשו. */
    saveShifts: function (list) {
      var byId = {};
      (state.settings.shifts || []).forEach(function (shift) { byId[shift.id] = shift; });
      state.settings.shifts = list.map(function (item, index) {
        var known = byId[item.id] || {};
        return {
          id: item.id || Store.newId('shift'),
          name: item.name,
          from: item.from,
          to: item.to,
          color: typeof known.color === 'number' ? known.color : index
        };
      });
      state = Store.migrate(state);
      render();
      return persist('config');
    },
    applyRemoteWeek: applyRemoteWeek,
    openWeek: openWeek,
    currentRole: currentRole,
    weekKey: function () { return weekKey; }
  };

  /* בגרסה המקומית האפליקציה עולה מיד. הגרסה המסחרית קוראת ל-start בעצמה. */
  if (!window.ShiftDeferStart) { start(); }
})();
