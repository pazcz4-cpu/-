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
    /* האם מגירת הבקשות פתוחה. רלוונטי רק אחרי שהסידור פורסם:
       עד אז הבקשות הן המשימה של העובד והן פתוחות תמיד. */
    this.requestsOpen = false;
    /* null = טרם נבחר, ואז נבחר ברירת מחדל חכמה בכל ציור */
    this.teamDay = null;
    this.teamOpen = false;
    /* null = כל הסניפים. נשמר בין החלפות יום, כי עובד שסינן
       לסניף שלו רוצה להישאר בו גם כשהוא מדלג בין ימים. */
    this.teamBranch = null;
    /* מגירת החופשה: מצבה, מה הוקלד בה, והאם השבועות שהיא
       מציגה כבר נטענו. */
    this.leaveOpen = false;
    this.leaveLoaded = false;
    this.leaveFrom = '';
    this.leaveTo = '';
    this.leaveNote = '';
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
      return self._loadPrevWeek();
    }).then(function () {
      self.render();
    }, function (err) {
      self.root.innerHTML = '<p class="auth-error">' +
        esc(t('employee.loadFailed', { message: (err && err.message) || '' })) + '</p>';
    });
  };

  /* ===== השבוע שלפני, בשביל השעון =====

     משמרת לילה שנפתחה במוצאי שבת יוצאת בראשון בבוקר, כלומר
     בשבוע אחר. בלי השבוע הקודם העובד שפותח את האפליקציה אחרי
     חצות רואה כפתור "כניסה" בזמן שהוא כבר בתוך משמרת.

     נטען רק כשצריך: שעון דלוק, ואין עדיין אף דיווח שלו בשבוע
     הנוכחי. ברגע שהוא מדווח בשבוע הזה – השאלה נסגרת, ואין
     קריאה נוספת. */
  EmployeeUI.prototype._loadPrevWeek = function () {
    var self = this;
    if (!Store.allowsPhonePunch(this.state)) return Promise.resolve();
    if (this.weekKey !== Store.currentWeekKey()) return Promise.resolve();
    if (Store.punchesOf(this.week, this._employeeId()).length) return Promise.resolve();
    var prevKey = Store.shiftWeekKey(this.weekKey, -1);
    if (this.state.weeks[prevKey]) return Promise.resolve();
    if (!this.backend || typeof this.backend.loadWeek !== 'function') return Promise.resolve();
    return Promise.resolve(this.backend.loadWeek(prevKey)).then(function (week) {
      if (week) self.state.weeks[prevKey] = week;
    }, function () { /* אין שבוע קודם, או שהטעינה נכשלה – השעון עובד בלעדיו */ });
  };

  EmployeeUI.prototype._bind = function () {
    var self = this;

    /* מגירת הבקשות נזכרת בין ציורים. בלי זה כל שמירה או עדכון
       חי היו סוגרים אותה בדיוק בזמן שהעובד קורא בתוכה.
       toggle אינו עולה בבועות, ולכן מאזינים בשלב הלכידה. */
    this.root.addEventListener('toggle', function (event) {
      var leaveFold = event.target.closest('.leave-fold');
      if (leaveFold) {
        self.leaveOpen = leaveFold.open;
        /* השבועות נטענים בפתיחה ולא בכל ציור: חופשה נמצאת
           קדימה, והמסך מחזיק שבוע אחד. */
        if (leaveFold.open) { self._loadLeaveWeeks(); }
        return;
      }
      var fold = event.target.closest('.employee-fold');
      if (fold) { self.requestsOpen = fold.open; }
    }, true);

    /* לשוניות הצוות ומצב המגירה. רשומים לפני היציאה המוקדמת של
       מצב התצוגה המקדימה: הם החלפת תצוגה ולא עריכה, והמנהל
       שבודק מה העובד רואה צריך להיות מסוגל להחליף יום. */
    this.root.addEventListener('toggle', function (event) {
      var fold = event.target.closest('.team-fold');
      if (fold) { self.teamOpen = fold.open; }
    }, true);

    this.root.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-team-day]');
      if (tab) {
        self.teamDay = Number(tab.dataset.teamDay);
        self.render();
        return;
      }
      var branchTab = event.target.closest('[data-team-branch]');
      if (branchTab) {
        /* מחרוזת ריקה = כל הסניפים */
        var value = branchTab.dataset.teamBranch;
        self.teamBranch = value === '' ? null : value;
        self.render();
      }
    });

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
      var punch = event.target.closest('[data-punch]');
      if (punch) { self._punch(); return; }
      var leave = event.target.closest('[data-leave-send]');
      if (leave) { self._sendLeave(); return; }
      var button = event.target.closest('.cstate');
      if (button) { self._toggle(button); }
    });
  };

  /* דיווח שעון. הכפתור אינו יודע אם זו כניסה או יציאה – השרת
     קובע, מהמצב שנרשם אצלו. כך לחיצה כפולה ברשת איטית לא
     תייצר יציאה לפני כניסה, ושעון טלפון שהוזז לא ישנה דבר. */
  EmployeeUI.prototype._punch = function () {
    var self = this;
    if (this.busy) return;
    if (!this.backend || typeof this.backend.savePunch !== 'function') return;
    this.busy = true;
    this.backend.savePunch(this.weekKey).then(function (result) {
      self.busy = false;
      /* השרת מחזיר גם לאיזה שבוע הדיווח נכנס. יציאה ממשמרת
         שנפתחה במוצאי שבת נרשמת בשבוע הקודם, ואז השבוע המוצג
         אינו זה שהשתנה – ותיוק שלו תחת המפתח הנוכחי היה מחליף
         את השבוע של העובד בשבוע שעבר. */
      var key = (result && result.weekKey) || self.weekKey;
      var week = (result && result.week) || result;
      self.state.weeks[key] = week;
      if (key === self.weekKey) self.week = week;
      self._flash(t('employee.clockSaved'));
      self.render();
    }, function (err) {
      self.busy = false;
      self._flash((err && err.message) || t('employee.clockFailed'));
      self.render();
    });
  };

  /* כמה דקות נצברו היום, מזוגות שנסגרו. משמרת שעדיין פתוחה
     אינה נספרת כאן אלא מוצגת כ"בפנים מאז": מונה שרץ הוא מספר
     שמשתנה בזמן שקוראים אותו, וקשה להשוות אותו לתלוש. */
  EmployeeUI.prototype._todayMinutes = function (sessions) {
    var today = new Date();
    var total = 0;
    sessions.forEach(function (session) {
      if (session.open || session.orphan || !session.inAt) return;
      var start = new Date(Date.parse(session.inAt));
      if (start.getFullYear() !== today.getFullYear() ||
          start.getMonth() !== today.getMonth() ||
          start.getDate() !== today.getDate()) return;
      total += session.minutes;
    });
    return total;
  };

  /* איזה יום מוצג בלשוניות הצוות.

     ברירת המחדל אינה "ראשון" אלא מה שהעובד כנראה מחפש: היום,
     אם השבוע המוצג הוא השבוע הנוכחי; אחרת היום הראשון שבו הוא
     עצמו עובד; ורק אם אין כזה — תחילת השבוע. */
  EmployeeUI.prototype._teamDay = function (myDays) {
    if (this.teamDay !== null && this.teamDay >= 0 && this.teamDay <= 6) {
      return this.teamDay;
    }
    /* השבוע מתחיל ביום ראשון, ולכן getDay() הוא גם מדד היום
       בתוך השבוע. currentWeekKey מחזיר את מפתח השבוע של היום. */
    if (this.weekKey === Store.currentWeekKey()) {
      return new Date().getDay();
    }
    for (var i = 0; i <= 6; i++) { if (myDays && myDays[i]) return i; }
    return 0;
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

    /* ===== שעון הנוכחות =====

       ראשון במסך, לפני שלושת המספרים: בשמונה בבוקר העובד פותח
       את האפליקציה כדי ללחוץ על הכפתור הזה, ולא כדי לקרוא כמה
       בקשות נשארו לו.

       מוצג רק בשבוע הנוכחי. דיווח כניסה על השבוע הבא אינו דבר
       שקיים, וכפתור שמופיע שם הוא הזמנה לטעות. */
    if (Store.allowsPhonePunch(this.state) && this.weekKey === Store.currentWeekKey()) {
      /* השבוע שלפני. משמרת לילה של מוצאי שבת נכנסת ביום האחרון
         של השבוע ויוצאת בראשון בבוקר, ובלי השבוע הקודם העובד
         שפותח את האפליקציה ב-02:00 רואה "כניסה" בזמן שהוא בתוך
         משמרת – ולוחץ, ואז הלילה שלו מתפצל לשניים. */
      var prevWeek = this.state.weeks[Store.shiftWeekKey(this.weekKey, -1)] || null;
      var sessions = Store.punchSessions(this.week, this._employeeId(), { prev: prevWeek });
      var inside = Store.punchState(this.week, this._employeeId(), prevWeek) === Store.PUNCH.IN;
      var openSession = null;
      sessions.forEach(function (session) { if (session.open) openSession = session; });
      /* המשמרת הפתוחה עשויה לשבת בשבוע הקודם, וזו בדיוק משמרת
         הלילה שרצה עכשיו. */
      if (!openSession && inside && prevWeek) {
        Store.punchSessions(prevWeek, this._employeeId(), { next: this.week })
          .forEach(function (session) { if (session.open) openSession = session; });
      }
      var todayMinutes = this._todayMinutes(sessions);

      html += '<div class="m-card punch-card' + (inside ? ' is-in' : '') + '" data-emp-part="clock">';
      html += '<div class="punch-state">';
      html += '<b>' + esc(inside && openSession
        ? t('employee.clockInside', { time: pad2(new Date(Date.parse(openSession.inAt))) })
        : t('employee.clockOutside')) + '</b>';
      if (todayMinutes) {
        html += '<span>' + esc(t('employee.clockToday',
          { hours: Store.formatMinutes(todayMinutes) })) + '</span>';
      }
      html += '</div>';

      /* ===== כניסה רק כשיש משמרת =====

         עובד שמחתים שלוש שעות מוקדם, או ביום שאינו עובד בו,
         מייצר שעות שלא סוכמו — והמנהל מגלה את זה בתלוש.

         היציאה לעולם אינה נחסמת: מי שכבר בפנים חייב לצאת,
         אחרת המשמרת נשארת פתוחה ולא נספרת בכלל. */
      var window_ = inside
        ? { allowed: true }
        : Store.canPunchIn(this.state, this.week, this.weekKey, this._employeeId());

      if (!window_.allowed) {
        html += '<p class="punch-blocked">' + esc(t('employee.clockNoShift', {
          hours: Math.round(window_.leadMinutes / 60)
        })) + '</p>';
      } else {
        html += '<button type="button" class="btn punch-btn ' +
          (inside ? 'ghost' : 'primary') + '" data-punch="1"' +
          (this.preview ? ' disabled' : '') + '>' +
          ico(inside ? 'checkCircle' : 'clock') +
          '<span>' + esc(t(inside ? 'employee.clockOut' : 'employee.clockIn')) + '</span>' +
          '</button>';
      }
      html += '</div>';
    }

    html += '<div class="employee-summary" data-emp-part="shifts">';
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

    html += '<h2 class="employee-title" data-emp-part="shifts">' + t('employee.myShifts') + '</h2>';
    if (!this.week.published) {
      html += '<p class="employee-note" data-emp-part="shifts">' + t('employee.notPublished') + '</p>';
    } else if (!shifts.length) {
      html += '<p class="employee-note" data-emp-part="shifts">' + t('employee.noShifts') + '</p>';
    } else {
      html += '<div class="employee-shifts" data-emp-part="shifts">';
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
      html += '<p class="employee-note" data-emp-part="shifts">' + esc(t('employee.totalWeek', { count: shifts.length })) + '</p>';
    }

    /* הסידור של כל הצוות, כשהמנהל אפשר אותו.

       מתחת למשמרות שלי ולא מעליהן: מה שהעובד בא לראות הוא מתי
       הוא עובד. וקיים רק אחרי פרסום — סידור בטיוטה משתנה, ועובד
       שראה בו את עצמו ביום שלישי לא אמור לגלות שזה היה זמני.

       יום אחד בכל פעם, ולא כל השבוע ברצף. שבוע שלם של כל הסניפים
       וכל המשמרות הוא חמישים שורות: בטלפון זה קיר שאי אפשר לסרוק,
       ובדיוק בו קבור מה שהעובד בא לחפש — מי איתו במשמרת, ומי עובד
       מחר. לשוניות הימים הופכות את זה לשאלה אחת עם תשובה אחת.

       מה שנחשף כאן הוא שמות ומשמרות בלבד. האילוצים, ההערות,
       המיילים והמכסות של שאר העובדים אינם עוברים לכאן בכלל —
       לא כי המסך מסתיר אותם, אלא כי Store.dayRoster אינו
       מחזיר אותם. */
    if (Store.teamVisibility(this.state).shifts && this.week.published) {
      var myId = this._employeeId();

      /* באילו ימים אני עובד. משמש גם לנקודה על הלשונית וגם
         לבחירת היום שנפתח כברירת מחדל. */
      var myDays = {};
      Data.DAYS.forEach(function (day) {
        if (Store.employeeDayAssignments(self.state, self.week, myId, day.idx).length) {
          myDays[day.idx] = true;
        }
      });

      var dayIdx = this._teamDay(myDays);
      var roster = Store.dayRoster(this.state, this.week, dayIdx);
      var headcount = 0;
      roster.forEach(function (slot) { headcount += slot.people.length; });

      html += '<details class="employee-fold team-fold" data-emp-part="shifts"' +
        (this.teamOpen ? ' open' : '') + '>';
      html += '<summary class="employee-fold-head">' +
        '<span class="employee-title">' + esc(t('employee.teamTitle')) + '</span>' +
        '<span class="employee-fold-hint">' + esc(t('employee.teamHint')) + '</span>' +
        '</summary>';

      /* לשוניות הימים. כפתורים ולא קישורים — הם מחליפים תצוגה
         ואינם מנווטים לשום מקום. */
      html += '<div class="team-tabs" role="tablist">';
      Data.DAYS.forEach(function (day) {
        var on = day.idx === dayIdx;
        html += '<button type="button" class="team-tab' + (on ? ' is-on' : '') +
            (myDays[day.idx] ? ' has-mine' : '') + '"' +
          ' role="tab" aria-selected="' + (on ? 'true' : 'false') + '"' +
          ' data-team-day="' + day.idx + '">' +
          '<b>' + esc(day.short || day.name) + '</b>' +
          '<span>' + esc(Store.formatDate(Store.dateOfDay(self.weekKey, day.idx))) + '</span>' +
          '</button>';
      });
      html += '</div>';

      /* לשוניות סניפים, רק כשיש יותר מאחד. בעסק עם סניף אחד הן
         שורה שכל הכפתורים בה אומרים את אותו דבר.

         משניות לימים ולא באותה שורה: קודם "מתי", אחר כך "איפה".
         השאלה הראשונה היא תמיד היום, וסניף הוא צמצום שלה. */
      var branchesToday = [];
      var seenBranch = {};
      roster.forEach(function (slot) {
        if (seenBranch[slot.branchId]) return;
        seenBranch[slot.branchId] = true;
        branchesToday.push(slot.branchId);
      });

      /* סניף שנבחר ואין בו איש ביום הזה — הסינון נשאר, והמסך
         אומר זאת. איפוס שקט לכל הסניפים היה נראה כמו תקלה.

         והלשונית שלו נשארת ברשימה גם ביום שבו הוא ריק: בלעדיה
         היה נעלם גם הסימון שמראה איזה סינון פעיל וגם הדרך
         לצאת ממנו, והעובד היה נתקע במסך ריק בלי להבין למה. */
      var picked = this.teamBranch;
      if (picked !== null && !seenBranch[picked]) { branchesToday.push(picked); }
      if (branchesToday.length > 1) {
        html += '<div class="team-branches" role="tablist">';
        html += '<button type="button" class="team-branch-tab' +
          (picked === null ? ' is-on' : '') + '"' +
          ' role="tab" aria-selected="' + (picked === null ? 'true' : 'false') + '"' +
          ' data-team-branch="">' + esc(t('employee.teamAllBranches')) + '</button>';
        branchesToday.forEach(function (branchId) {
          var branch = Store.byId(self.state.branches, branchId) || {};
          var on = picked === branchId;
          html += '<button type="button" class="team-branch-tab' + (on ? ' is-on' : '') + '"' +
            ' role="tab" aria-selected="' + (on ? 'true' : 'false') + '"' +
            ' data-team-branch="' + esc(branchId) + '">' +
            esc(branch.name || '') + '</button>';
        });
        html += '</div>';
      }

      if (picked !== null) {
        roster = roster.filter(function (slot) { return slot.branchId === picked; });
        headcount = 0;
        roster.forEach(function (slot) { headcount += slot.people.length; });
      }

      html += '<div class="team-panel">';
      if (!roster.length) {
        html += '<p class="employee-note">' + esc(t(picked !== null
          ? 'employee.teamNobodyBranch' : 'employee.teamNobody')) + '</p>';
      } else {
        html += '<p class="team-count">' +
          esc(tPlural('employee.teamCount', headcount)) + '</p>';
        /* מקובץ לפי סניף: עובד חושב "מי איתי בסניף", ולא
           "מי עובד בוקר בכל הרשת". */
        var byBranch = {};
        var order = [];
        roster.forEach(function (slot) {
          if (!byBranch[slot.branchId]) { byBranch[slot.branchId] = []; order.push(slot.branchId); }
          byBranch[slot.branchId].push(slot);
        });
        order.forEach(function (branchId) {
          var branch = Store.byId(self.state.branches, branchId) || {};
          html += '<div class="team-branch">';
          html += '<h4>' + esc(branch.name || '') + '</h4>';
          byBranch[branchId].forEach(function (slot) {
            var shift = Store.shiftById(self.state, slot.shiftId);
            var mine = slot.people.some(function (p) { return p.id === myId; });
            html += '<div class="team-slot sh sh-' +
                Store.shiftColor(self.state, slot.shiftId) +
                (mine ? ' is-mine' : '') + '">';
            html += '<div class="team-slot-head"><b>' +
              esc(shift ? shift.name : slot.shiftId) + '</b>' +
              (mine ? '<span class="team-badge">' +
                esc(t('employee.teamMine')) + '</span>' : '') +
              '</div>';
            html += '<div class="team-people">' + slot.people.map(function (person) {
              /* "זה אני" מסומן, ולא מושמט: רשימה שבה כולם חוץ
                 ממך היא רשימה שקשה להבין בה מה מקומך. */
              return '<span class="team-person' +
                (person.id === myId ? ' team-me' : '') + '">' +
                esc(person.name) + '</span>';
            }).join('') + '</div>';
            html += '</div>';
          });
          html += '</div>';
        });
      }
      html += '</div></details>';
    }

    /* האילוצים שלי.

       אחרי שהסידור פורסם, מה שהעובד בא לראות הוא המשמרות שלו.
       הבקשות כבר נעולות – הן היסטוריה, לא משימה – ושבעה ימים של
       כפתורים מתים מתחת לסידור דוחפים אותו למטה ומטשטשים את מה
       שכן חשוב. לכן הן מתקפלות, ונפתחות בלחיצה למי שרוצה לראות
       מה ביקש ומה אושר.

       לפני הפרסום זה הפוך בדיוק: זו כל המשימה של העובד, והמגירה
       פתוחה. details/summary ולא כפתור עם JS – הוא נגיש מהמקלדת,
       עובד גם אם סקריפט נכשל, ונקרא נכון בקורא מסך. */
    var canFold = !!this.week.published;
    var pendingCount = 0;
    Data.DAYS.forEach(function (day) {
      if (self._record(day.idx)) pendingCount++;
    });
    if (canFold) {
      html += '<details class="employee-fold requests-fold" data-emp-part="constraints"' +
        (this.requestsOpen ? ' open' : '') + '>';
      html += '<summary class="employee-fold-head">' +
        '<span class="employee-title">' + t('employee.myRequests') + '</span>' +
        '<span class="employee-fold-hint">' +
          esc(pendingCount
            ? tPlural('employee.foldCount', pendingCount)
            : t('employee.foldEmpty')) + '</span>' +
        ico('chevron', 'employee-fold-mark') +
        '</summary>';
    } else {
      html += '<h2 class="employee-title" data-emp-part="constraints">' + t('employee.myRequests') + '</h2>';
    }
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
        html += '<p class="employee-note limit-note' + (left === 0 ? ' spent' : '') + '" data-emp-part="constraints">' +
          esc(left === 0
            ? t('employee.limitSpent', { max: cap.max })
            : tPlural('employee.limitLeft', left, { max: cap.max })) + '</p>';
      }
    }

    html += '<div class="employee-days" data-emp-part="constraints">';
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
    html += '</div>';
    if (canFold) { html += '</details>'; }

    html += this._leaveSection();
    html += '</div>';

    this.root.innerHTML = html;
    this._showFlash();
  };

  /* ===== חופשה =====

     יום חופש בודד לשבוע הקרוב הוא בקשת אילוץ, והוא כבר למעלה.
     כאן מבקשים חופשה: כמה ימים, חודשיים מראש, ועם השאלה שחשובה
     לעובד יותר מהכול — אם היא בתשלום.

     מגירה ולא מסך: רוב הפעמים שעובד פותח את האפליקציה הוא לא
     מבקש חופשה, ושני שדות תאריך פתוחים תמיד הם רעש. */
  EmployeeUI.prototype._leaveSection = function () {
    if (this.preview) return '';
    if (!this.backend || typeof this.backend.requestLeave !== 'function') return '';
    var self = this;
    var html = '<details class="employee-fold leave-fold" data-emp-part="leave"' +
      (this.leaveOpen ? ' open' : '') + '>';
    html += '<summary class="employee-fold-head">' +
      '<span class="employee-title">' + esc(t('leaveRequest.title')) + '</span>' +
      '<span class="employee-fold-hint">' + esc(t('leaveRequest.hint')) + '</span>' +
      '</summary>';

    html += '<div class="leave-form">';
    html += '<label class="leave-field"><span>' + esc(t('leaveRequest.from')) + '</span>' +
      '<input type="date" class="text-input" id="leave-from" value="' +
      esc(this.leaveFrom || '') + '"></label>';
    html += '<label class="leave-field"><span>' + esc(t('leaveRequest.to')) + '</span>' +
      '<input type="date" class="text-input" id="leave-to" value="' +
      esc(this.leaveTo || '') + '"></label>';
    html += '<label class="leave-field leave-note"><span>' + esc(t('leaveRequest.note')) + '</span>' +
      '<input type="text" class="text-input" id="leave-note" maxlength="300" value="' +
      esc(this.leaveNote || '') + '"></label>';
    html += '<button type="button" class="btn primary" data-leave-send="1">' +
      esc(t('leaveRequest.send')) + '</button>';
    html += '</div>';

    /* הבקשות שכבר הוגשו. נטענות מהשבועות שהמסך מחזיק, ולכן
       המגירה טוענת אותם בפתיחתה — בלי זה בקשה לעוד חודשיים
       הייתה נעלמת מהרשימה ברענון. */
    var requests = Store.leaveRequests(this.state, this._employeeId());
    if (requests.length) {
      html += '<ul class="leave-list">';
      requests.forEach(function (request) {
        var label = request.from && request.to
          ? Store.formatDate(new Date(request.from.replace(/-/g, '/'))) + ' – ' +
            Store.formatDate(new Date(request.to.replace(/-/g, '/')))
          : '';
        html += '<li class="leave-item is-' + esc(request.status) + '">' +
          '<b>' + esc(label) + '</b>' +
          '<span>' + esc(tPlural('leaveRequest.days', request.days.length)) + ' · ' +
          esc(t(request.paid ? 'leaveRequest.isPaid' : 'leaveRequest.isUnpaid')) + '</span>' +
          '<span class="leave-status">' +
          esc(t('leaveRequest.status_' + request.status)) + '</span>' +
          (request.managerNote
            ? '<span class="leave-note-text">' + esc(request.managerNote) + '</span>' : '') +
          '</li>';
      });
      html += '</ul>';
    } else {
      html += '<p class="employee-note">' + esc(t('leaveRequest.none')) + '</p>';
    }
    html += '</details>';
    return html;
  };

  /* השבועות שהבקשות יושבות בהם. המסך מחזיק שבוע אחד, וחופשה
     נמצאת קדימה — ולכן היא נטענת בפתיחת המגירה בלבד, ופעם אחת. */
  EmployeeUI.prototype._loadLeaveWeeks = function (force) {
    var self = this;
    if (this.leaveLoaded && !force) return Promise.resolve();
    this.leaveLoaded = true;
    var keys = [];
    var key = Store.currentWeekKey();
    for (var i = 0; i < 10; i++) { keys.push(key); key = Store.shiftWeekKey(key, 1); }
    var chain = Promise.resolve();
    keys.forEach(function (weekKey) {
      chain = chain.then(function () {
        /* אחרי שליחה טוענים מחדש גם שבוע שכבר נטען: הבקשה
           החדשה נמצאת בדיוק בו, ודילוג עליו היה מציג רשימה
           בלי מה שזה עתה נשלח. */
        if (!force && self.state.weeks[weekKey] && self.state.weeks[weekKey]._loaded) return null;
        return self.backend.loadWeek(weekKey).then(function (week) {
          var loaded = week || Store.emptyWeek();
          loaded._loaded = true;
          self.state.weeks[weekKey] = loaded;
        }, function () { /* שבוע שלא נטען אינו מפיל את המגירה */ });
      });
    });
    return chain.then(function () { self.render(); });
  };

  EmployeeUI.prototype._sendLeave = function () {
    var self = this;
    if (this.busy) return;
    var from = (this.root.querySelector('#leave-from') || {}).value || '';
    var to = (this.root.querySelector('#leave-to') || {}).value || '';
    var note = (this.root.querySelector('#leave-note') || {}).value || '';
    if (!from || !to) { this._flash(t('leaveRequest.needDates')); return; }
    /* נבדק כאן ולא רק בשרת, כדי שהלחיצה לא תראה כאילו עבדה
       ואז תתהפך. השרת חוסם את זה שוב ממילא. */
    var days = Store.leaveDays(from, to);
    if (!days) { this._flash(t('leaveRequest.badRange')); return; }

    this.busy = true;
    this.leaveNote = note;
    /* אין כאן שאלה אם החופשה בתשלום: בקשת חופשה מראש היא בקשה
       לחופשה בתשלום, וזהו. תיבת סימון שאפשר להוריד הייתה אומרת
       לעובד שיש לו מה להפסיד בלחיצה עליה. מה שהמנהל מחליט על
       יום מסוים נשאר אצלו, בלוח האילוצים. */
    this.backend.requestLeave({ from: from, to: to, note: note })
      .then(function () {
        self.busy = false;
        self.leaveFrom = '';
        self.leaveTo = '';
        self.leaveNote = '';
        self._flash(t('leaveRequest.sent'));
        return self._loadLeaveWeeks(true);
      }, function (err) {
        self.busy = false;
        self._flash((err && err.message) || t('leaveRequest.failed'));
        self.render();
      });
  };

  var API = { EmployeeUI: EmployeeUI };
  root.ShiftEmployeeUI = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
