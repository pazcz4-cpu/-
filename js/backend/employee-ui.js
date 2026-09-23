/* המסך של העובד: האילוצים שלו והמשמרות שלו בלבד.
   העובד אינו רואה את הסידור המלא ואינו יכול לערוך דבר מלבד האילוצים שלו. */
(function (root) {
  'use strict';

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
  }

  /* הלוגו מגיע מ-ShiftBrand כדי שהנתיב ייפתר נכון גם באתר החי
     (המערכת מוגשת מ-/app/) וגם בפתיחה מקומית. */
  function ico(name, extraClass) {
    return root.ShiftIcons ? root.ShiftIcons.svg(name, extraClass) : '';
  }

  function brandLockup() {
    return root.ShiftBrand ? root.ShiftBrand.lockupImg('SetShifts') : '';
  }

  /* "נותרו לך 1 בקשות" הוא בדיוק סוג הפרט שנקרא כרשלנות */
  function tPlural(key, count, params) {
    if (!root.I18n) return key;
    try { return root.I18n.plural(key, count, params); } catch (err) { return key; }
  }

  var Data = root.ShiftData;
  var Store = root.ShiftStore;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad2(date) {
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return two(date.getHours()) + ':' + two(date.getMinutes());
  }

  function EmployeeUI(options) {
    this.backend = options.backend;
    this.session = options.session;
    /* תצוגה מקדימה: מנהל רואה את המסך של עובד מסוים, בלי להתחזות
       לו. הכתיבה חסומה כאן ולא רק בשרת – בקשת חופש שהמנהל "הגיש"
       בטעות בשם העובד היא בדיוק סוג התקלה שהורסת אמון. */
    this.preview = !!options.preview;
    this.previewEmployeeId = options.employeeId || null;
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

    /* בתצוגה מקדימה מחוברת רק הניווט בין שבועות. כל השאר נצפה. */
    if (this.preview) {
      this.root.addEventListener('click', function (event) {
        var nav = event.target.closest('[data-week-step]');
        if (!nav) return;
        self.weekKey = Store.shiftWeekKey(self.weekKey, Number(nav.dataset.weekStep));
        self.load();
      });
      return;
    }

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

  EmployeeUI.prototype._employeeId = function () {
    return this.previewEmployeeId || this.session.user.employeeId;
  };

  /* הרשומה כפי שנשמרה – העובד רואה גם בקשה שממתינה או שנדחתה */
  EmployeeUI.prototype._record = function (dayIdx) {
    return Store.getConstraintRecord(this.week, this._employeeId(), dayIdx);
  };

  EmployeeUI.prototype._constraint = function (dayIdx) {
    return this._record(dayIdx) || Store.emptyConstraint();
  };

  /* חסום להגשה: אחרי מועד הסגירה, אם המנהל הגדיר אחד */
  EmployeeUI.prototype._locked = function () {
    return Store.deadlinePassed(this.state, this.weekKey);
  };

  /* כמה בקשות נותרו לעובד השבוע. null כשאין תקרה. */
  EmployeeUI.prototype._left = function () {
    return Store.constraintsLeft(this.state, this.week, this._employeeId());
  };

  EmployeeUI.prototype._toggle = function (button) {
    var self = this;
    if (this.busy) return;
    if (this.week.published) { this._flash(t('employee.publishedLocked')); return; }
    if (this._locked()) { this._flash(t('employee.deadlineLocked')); return; }

    var dayIdx = Number(button.dataset.day);

    /* הסדר קבוע אינו בקשה, ולכן הוא לא נערך מכאן ולא נספר במכסה.
       בלי החסימה הזו העובד היה מבזבז בקשה על משהו שכבר סגור. */
    var me = Store.byId(this.state.employees || [], this._employeeId());
    if (me) {
      var shiftForCheck = button.dataset.off ? null : button.dataset.shift;
      var standingDay = Store.standingFor(me, dayIdx, this.weekKey);
      if (shiftForCheck === null ? standingDay.off
          : Store.standingBlocks(me, dayIdx, shiftForCheck, this.weekKey)) {
        this._flash(t('standing.locked'));
        return;
      }
    }

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

    /* נעצר כאן ולא אחרי פנייה לשרת, כדי שהלחיצה לא תראה כאילו
       עבדה ואז תתהפך. השרת חוסם את זה שוב ממילא. */
    var cap = Store.constraintLimitSettings(this.state);
    if (cap.enabled && Store.overConstraintLimit(this.state, this.week,
        this._employeeId(), dayIdx, isEmpty ? null : constraint)) {
      this._flash(t('employee.limitReached', { max: cap.max }));
      return;
    }

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
  /* ארבעת מצבי האילוץ, כל אחד עם האייקון והמילה שלו. הצבע הוא
     הסימן השלישי ולא היחיד: מי שאינו מבחין בין ירוק לאדום צריך
     לדעת מה הוא סימן, וגם מי שמסתכל בשמש על טלפון. */
  var STATES = {
    free:  { icon: 'circleEmpty', label: 'constraints.free' },
    pref:  { icon: 'star',        label: 'constraints.preferred' },
    block: { icon: 'ban',         label: 'constraints.blocked' },
    'off-day': { icon: 'home',    label: 'constraints.dayOff' },
    /* הסדר קבוע. מצב נפרד ולא "חסום", כי העובד לא ביקש אותו
       השבוע ואי אפשר להסיר אותו מכאן – וגם כדי שיראה שהוא אינו
       עולה לו מהמכסה. */
    standing: { icon: 'lock',     label: 'standing.state' }
  };

  function stateButton(cls, shiftLabel, attrs, locked) {
    var state = STATES[cls] || STATES.free;
    var word = t(state.label);
    return '<button class="cstate ' + cls + '" ' + attrs +
      ' aria-pressed="' + (cls === 'free' ? 'false' : 'true') + '"' +
      ' aria-label="' + esc(shiftLabel + ' – ' + word) + '"' + (locked || '') + '>' +
      ico(state.icon) +
      '<span class="cstate-name">' + esc(shiftLabel) + '</span>' +
      /* המילה מוצגת רק כשנבחר משהו. "זמין" על כל כפתור שלא נגעו
         בו הוא רעש, וההיעדר שלה הוא בעצמו הסימן. */
      (cls === 'free' ? '' : '<span class="cstate-state">' + esc(word) + '</span>') +
      '</button>';
  }

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

    var html = '<div class="employee-screen' + (this.preview ? ' is-preview' : '') + '">';

    /* כותרת ממותגת. מסך העובד נפתח מקישור במייל, לרוב בטלפון,
       ולעיתים חודשים אחרי ההזמנה – ובלי לוגו הוא נראה כמו טופס
       אקראי ולא כמו המערכת של מקום העבודה. */
    html += '<header class="employee-head">' +
      '<span class="employee-logo">' + brandLockup() + '</span>' +
      '<span class="employee-company">' + esc(this.session.company.name) + '</span>' +
      /* מדריך בדף אחד. עובד שנתקע בשמונה בערב לא ישלח הודעה
         למנהל – הוא פשוט לא יגיש. */
      '<a class="employee-guide" href="/guide/" target="_blank" rel="noopener">' +
      esc(t('employee.guideLink')) + '</a>' +
      '</header>';

    if (this.preview) {
      /* הכרזה שאי אפשר לפספס: זה מסך של מישהו אחר */
      html += '<div class="preview-bar">' +
        '<span>' + esc(t('preview.banner', { name: (employee && employee.name) || '' })) + '</span>' +
        '<button type="button" id="preview-exit" class="btn ghost small">' +
        esc(t('preview.exit')) + '</button></div>';
    }
    /* מתי נסגרות ההגשות – ההודעה החשובה ביותר במסך הזה, ולכן
       למעלה ולא בתחתית. */
    var deadlineAt = Store.deadlineFor(this.state, this.weekKey);
    if (deadlineAt) {
      var hoursLeft = Store.hoursToDeadline(this.state, this.weekKey);
      var closed = hoursLeft <= 0;
      var soon = !closed && hoursLeft <= Store.deadlineSettings(this.state).remindHours;
      var text;
      if (closed) {
        text = t('employee.deadlineClosed');
      } else if (hoursLeft < 24) {
        text = t('employee.deadlineHours', { hours: Math.max(1, Math.round(hoursLeft)) });
      } else {
        text = t('employee.deadlineOpen', {
          day: (Data.DAYS[deadlineAt.getDay()] || {}).name || '',
          date: Store.formatDate(deadlineAt),
          time: pad2(deadlineAt)
        });
      }
      html += '<div class="deadline-strip' + (closed ? ' is-closed' : (soon ? ' is-soon' : '')) +
        '">' + esc(text) + '</div>';
    }

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

    /* ===== שלושת המספרים =====
       מה שעובד פותח את המסך בשבילו: כמה משמרות יש לי, כמה
       בקשות עוד ממתינות, וכמה בקשות נשארו לי. עד עכשיו הם היו
       פזורים בשלושה מקומות שונים במסך, אחד מהם בתחתיתו. */
    var shifts = this._myShifts();
    var pending = 0;
    var decided = 0;
    Data.DAYS.forEach(function (day) {
      var status = Store.constraintStatus(self._record(day.idx));
      if (status === Store.CONSTRAINT_STATUS.PENDING) pending++;
      else if (status) decided++;
    });
    var cap = Store.constraintLimitSettings(this.state);
    var left = cap.enabled ? this._left() : null;

    html += '<div class="employee-summary">';
    html += '<div class="sum-tile' + (this.week.published && shifts.length ? ' strong' : '') + '">' +
      ico('clock', 'ico-lg') +
      '<b>' + (this.week.published ? shifts.length : '—') + '</b>' +
      '<span>' + esc(t('employee.myShifts')) + '</span></div>';
    html += '<div class="sum-tile' + (pending ? ' warn' : '') + '">' +
      ico(pending ? 'clock' : 'checkCircle', 'ico-lg') +
      '<b>' + pending + '</b>' +
      '<span>' + esc(t('constraints.pending')) + '</span></div>';
    if (left !== null) {
      html += '<div class="sum-tile' + (left === 0 ? ' spent' : '') + '">' +
        ico('star', 'ico-lg') +
        '<b>' + left + '</b>' +
        '<span>' + esc(t('employee.requestsLeftShort')) + '</span></div>';
    }
    html += '</div>';

    html += '<h2 class="employee-title">' + t('employee.myShifts') + '</h2>';
    if (!this.week.published) {
      html += '<p class="employee-note">' + t('employee.notPublished') + '</p>';
    } else if (!shifts.length) {
      html += '<p class="employee-note">' + t('employee.noShifts') + '</p>';
    } else {
      html += '<div class="employee-shifts">';
      shifts.forEach(function (item) {
        /* צבע לפי סוג המשמרת של העסק, ולא לפי שלושת השמות
           הישנים – עסק שהגדיר "לילה" קיבל קודם כרטיס בלי צבע. */
        html += '<div class="employee-shift sh sh-' +
            Store.shiftColor(self.state, item.shiftId) + '">' +
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

      /* המכסה נאמרת מראש. עובד שמגלה אותה רק כשהוא נחסם חושב
         שהמערכת תקולה, ולא שיש כלל. המספר כבר באריח שלמעלה;
         כאן הניסוח המלא, שאומר גם מה קורה כשהיא נגמרת. */
      if (cap.enabled) {
        html += '<p class="employee-note limit-note' + (left === 0 ? ' spent' : '') + '">' +
          esc(left === 0
            ? t('employee.limitSpent', { max: cap.max })
            : tPlural('employee.limitLeft', left, { max: cap.max })) + '</p>';
      }
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
        var me = Store.byId(self.state.employees || [], self._employeeId());
        shiftIds.forEach(function (shiftId) {
          var cls = 'free';
          var fixed = me && Store.standingBlocks(me, day.idx, shiftId, self.weekKey);
          if (fixed) cls = 'standing';
          else if (constraint.off) cls = 'off-day';
          else if (constraint.blocked && constraint.blocked[shiftId]) cls = 'block';
          else if (constraint.preferred && constraint.preferred[shiftId]) cls = 'pref';
          html += stateButton(cls, Store.shiftName(self.state, shiftId),
            'data-day="' + day.idx + '" data-shift="' + shiftId + '"',
            fixed ? ' disabled' : locked);
        });
        var standingDay = me
          ? Store.standingFor(me, day.idx, self.weekKey) : { off: false, blocked: {} };
        html += stateButton(standingDay.off ? 'standing' : (constraint.off ? 'off-day' : 'free'),
          t('constraints.dayOff'),
          'data-day="' + day.idx + '" data-off="1"',
          standingDay.off ? ' disabled' : locked);
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
