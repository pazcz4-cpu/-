/* המסך של העובד: האילוצים שלו והמשמרות שלו בלבד.
   העובד אינו רואה את הסידור המלא ואינו יכול לערוך דבר מלבד האילוצים שלו. */
(function (root) {
  'use strict';

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
  }

  var Data = root.ShiftData;
  var Store = root.ShiftStore;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function EmployeeUI(options) {
    this.backend = options.backend;
    this.session = options.session;
    this.root = document.getElementById('employee-root');
    this.weekKey = Store.currentWeekKey();
    this.state = null;
    this.week = null;
    this.busy = false;
  }

  EmployeeUI.prototype.start = function () {
    var self = this;
    this._bind();
    /* החלפת שפה מציירת מחדש גם את מסך העובד */
    if (root.I18n) { root.I18n.onChange(function () { if (self.state) self.render(); }); }
    return this.load();
  };

  EmployeeUI.prototype.load = function () {
    var self = this;
    return this.backend.loadConfig().then(function (config) {
      self.state = Store.migrate({
        settings: (config && config.settings) || null,
        branches: (config && config.branches) || null,
        employees: (config && config.employees) || null,
        weeks: {}
      });
      return self.backend.loadWeek(self.weekKey);
    }).then(function (week) {
      self.week = week || Store.emptyWeek();
      self.state.weeks[self.weekKey] = self.week;
      self.render();
    }, function (err) {
      self.root.innerHTML = '<p class="auth-error">' +
        esc(t('employee.loadFailed', { message: (err && err.message) || '' })) + '</p>';
    });
  };

  EmployeeUI.prototype._bind = function () {
    var self = this;
    this.root.addEventListener('change', function (event) {
      var input = event.target.closest('[data-note-day]');
      if (!input) return;
      self._saveNote(Number(input.dataset.noteDay), input.value.trim());
    });

    this.root.addEventListener('click', function (event) {
      var nav = event.target.closest('[data-week-step]');
      if (nav) {
        self.weekKey = Store.shiftWeekKey(self.weekKey, Number(nav.dataset.weekStep));
        self.load();
        return;
      }
      var button = event.target.closest('.cstate');
      if (button) { self._toggle(button); }
    });
  };

  EmployeeUI.prototype._employeeId = function () { return this.session.user.employeeId; };

  /* הרשומה כפי שנשמרה – העובד רואה גם בקשה שממתינה או שנדחתה */
  EmployeeUI.prototype._record = function (dayIdx) {
    return Store.getConstraintRecord(this.week, this._employeeId(), dayIdx);
  };

  EmployeeUI.prototype._constraint = function (dayIdx) {
    return this._record(dayIdx) || Store.emptyConstraint();
  };

  EmployeeUI.prototype._toggle = function (button) {
    var self = this;
    if (this.busy) return;
    if (this.week.published) { this._flash(t('employee.publishedLocked')); return; }

    var dayIdx = Number(button.dataset.day);
    var constraint = JSON.parse(JSON.stringify(this._constraint(dayIdx)));
    constraint.blocked = constraint.blocked || {};
    constraint.preferred = constraint.preferred || {};

    if (button.dataset.off) {
      constraint.off = !constraint.off;
      if (constraint.off) { constraint.blocked = {}; constraint.preferred = {}; }
    } else {
      var shiftId = button.dataset.shift;
      constraint.off = false;
      if (constraint.preferred[shiftId]) { delete constraint.preferred[shiftId]; constraint.blocked[shiftId] = true; }
      else if (constraint.blocked[shiftId]) { delete constraint.blocked[shiftId]; }
      else { constraint.preferred[shiftId] = true; }
    }

    var isEmpty = !constraint.off &&
      Object.keys(constraint.blocked).length === 0 &&
      Object.keys(constraint.preferred).length === 0;

    this.busy = true;
    this.backend.saveOwnConstraint(this.weekKey, dayIdx, isEmpty ? null : constraint)
      .then(function (week) {
        self.busy = false;
        self.week = week;
        self.state.weeks[self.weekKey] = week;
        self.render();
      }, function (err) {
        self.busy = false;
        self._flash((err && err.message) || t('employee.saveFailed'));
      });
  };

  EmployeeUI.prototype._saveNote = function (dayIdx, note) {
    var self = this;
    var record = this._record(dayIdx);
    if (!record) return;                       // אין בקשה – אין מה לצרף אליה
    if (String(record.note || '') === String(note || '')) return;

    this.backend.saveOwnNote(this.weekKey, dayIdx, note).then(function (week) {
      self.week = week;
      self.state.weeks[self.weekKey] = week;
      self._flash(t('constraints.reasonSaved'));
    }, function (err) {
      self._flash((err && err.message) || t('employee.reasonSaveFailed'));
      self.render();
    });
  };

  /* ההודעה נשמרת עד לציור הבא, כדי שרענון שמגיע מיד אחרי שמירה
     לא ימחק אותה לפני שהמשתמש הספיק לראות. */
  EmployeeUI.prototype._flash = function (message) {
    this._pendingFlash = message;
    this._showFlash();
  };

  EmployeeUI.prototype._showFlash = function () {
    var self = this;
    var node = this.root.querySelector('.employee-flash');
    if (!node || !this._pendingFlash) return;
    node.textContent = this._pendingFlash;
    node.classList.remove('hidden');
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(function () {
      self._pendingFlash = null;
      if (node.parentNode) node.classList.add('hidden');
    }, 3500);
  };

  /* המשמרות שהעובד שובץ אליהן השבוע */
  EmployeeUI.prototype._myShifts = function () {
    var self = this;
    var out = [];
    Data.DAYS.forEach(function (day) {
      var slots = Store.employeeDayAssignments(self.state, self.week, self._employeeId(), day.idx);
      slots.forEach(function (slot) {
        var branch = Store.byId(self.state.branches, slot.branchId) || {};
        var shift = Store.shiftById(self.state, slot.shiftId);
        out.push({
          day: day.name,
          date: Store.formatDate(Store.dateOfDay(self.weekKey, day.idx)),
          branch: branch.name || t('schedule.branch'),
          shift: shift ? shift.name : slot.shiftId,
          shiftId: slot.shiftId,
          hours: Store.hoursLabel(Store.slotHours(self.week, branch, day.idx, slot.shiftId))
        });
      });
    });
    return out;
  };

  EmployeeUI.prototype.render = function () {
    var self = this;
    var employee = Store.byId(this.state.employees, this._employeeId());
    var start = Store.dateOfDay(this.weekKey, 0);
    var end = Store.dateOfDay(this.weekKey, 6);

    var html = '<div class="employee-screen">';
    html += '<div class="employee-weeknav">' +
      '<button class="btn ghost" data-week-step="-1">' + t('employee.prevWeek') + '</button>' +
      '<strong>' + Store.formatDate(start) + ' – ' + Store.formatDate(end) + '</strong>' +
      '<button class="btn ghost" data-week-step="1">' + t('employee.nextWeek') + '</button>' +
      '</div>';

    html += '<p class="employee-flash hidden"></p>';

    if (!this._employeeId()) {
      html += '<div class="m-card"><div class="m-closed">' +
        t('employee.notLinked') +
        '</div></div></div>';
      this.root.innerHTML = html;
      return;
    }

    /* המשמרות שלי */
    var shifts = this._myShifts();
    html += '<h2 class="employee-title">' + t('employee.myShifts') + '</h2>';
    if (!this.week.published) {
      html += '<p class="employee-note">' + t('employee.notPublished') + '</p>';
    } else if (!shifts.length) {
      html += '<p class="employee-note">' + t('employee.noShifts') + '</p>';
    } else {
      html += '<div class="employee-shifts">';
      shifts.forEach(function (item) {
        html += '<div class="employee-shift ' + 'shift-' + item.shiftId + '">' +
          '<b>' + esc(item.day) + '</b><span>' + esc(item.date) + '</span>' +
          '<div>' + esc(item.branch) + ' · ' + esc(item.shift) + '</div>' +
          (item.hours ? '<small>' + esc(item.hours) + '</small>' : '') +
          '</div>';
      });
      html += '</div>';
      html += '<p class="employee-note">' + esc(t('employee.totalWeek', { count: shifts.length })) + '</p>';
    }

    /* האילוצים שלי */
    html += '<h2 class="employee-title">' + t('employee.myRequests') + '</h2>';
    if (this.week.published) {
      html += '<p class="employee-note">' + t('employee.publishedLocked') + '</p>';
    } else {
      html += '<p class="employee-note">' + esc(t('constraints.legend', {
        free: t('constraints.free'),
        preferred: t('constraints.preferred'),
        blocked: t('constraints.blocked')
      })) + '<br><b>' + esc(t('constraints.needsApproval')) + '</b></p>';
    }

    html += '<div class="employee-days">';
    Data.DAYS.forEach(function (day) {
      var constraint = self._constraint(day.idx);
      var shiftIds = Store.activeShiftsForDay(self.state, day.idx, self.week);
      var holiday = Store.isHoliday(self.week, day.idx);

      var status = Store.constraintStatus(self._record(day.idx));
      var badge = '';
      if (status === Store.CONSTRAINT_STATUS.PENDING) {
        badge = '<span class="req-badge pending">' + t('constraints.pending') + '</span>';
      } else if (status === Store.CONSTRAINT_STATUS.APPROVED) {
        badge = '<span class="req-badge approved">' + t('constraints.approved') + '</span>';
      } else if (status === Store.CONSTRAINT_STATUS.REJECTED) {
        badge = '<span class="req-badge rejected">' + t('constraints.rejected') + '</span>';
      }

      html += '<div class="m-card"><div class="m-card-head">' + esc(day.name) +
        ' <small>' + Store.formatDate(Store.dateOfDay(self.weekKey, day.idx)) + '</small>' +
        badge + '</div>';

      if (holiday) {
        html += '<div class="m-holiday">' + esc(Store.holidayName(self.week, day.idx)) +
          '<small>' + t('employee.holidayNoWork') + '</small></div>';
      } else if (!shiftIds.length) {
        html += '<div class="m-closed">' + t('employee.noShiftsToday') + '</div>';
      } else {
        var locked = self.week.published ? ' disabled' : '';
        html += '<div class="m-cstates">';
        shiftIds.forEach(function (shiftId) {
          var cls = 'free';
          if (constraint.off) cls = 'off-day';
          else if (constraint.blocked && constraint.blocked[shiftId]) cls = 'block';
          else if (constraint.preferred && constraint.preferred[shiftId]) cls = 'pref';
          html += '<button class="cstate ' + cls + '" data-day="' + day.idx +
            '" data-shift="' + shiftId + '"' + locked + '>' + esc(Store.shiftName(self.state, shiftId)) + '</button>';
        });
        html += '<button class="cstate ' + (constraint.off ? 'off-day' : 'free') +
          '" data-day="' + day.idx + '" data-off="1"' + locked + '>' +
          (constraint.off ? '✓ ' : '') + esc(t('constraints.dayOff')) + '</button>';
        html += '</div>';
        var record = self._record(day.idx);
        if (record && !self.week.published) {
          html += '<div class="req-reason">' +
            '<label>' + esc(t('constraints.reason')) +
            '<input type="text" class="text-input" maxlength="300" data-note-day="' + day.idx + '"' +
            ' placeholder="' + esc(t('constraints.reasonPlaceholder')) + '" value="' + esc(record.note || '') + '">' +
            '</label></div>';
        } else if (record && record.note) {
          html += '<p class="req-note">' + esc(t('constraints.reasonGiven', { text: record.note })) + '</p>';
        }
        if (record && record.managerNote) {
          html += '<p class="req-note">' + esc(t('constraints.managerNote', { text: record.managerNote })) + '</p>';
        }
      }
      html += '</div>';
    });
    html += '</div></div>';

    this.root.innerHTML = html;
    this._showFlash();
  };

  var API = { EmployeeUI: EmployeeUI };
  root.ShiftEmployeeUI = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
