/* אשף הפתיחה: ארבעה שלבים בין ההרשמה לבין המסך המלא.

   חשבון חדש נפתח ריק – וזה נכון, כי שמונה "עובד/ת 1..8" בחשבון
   של לקוח הם מטלת מחיקה. אבל מסך ריק לגמרי הוא גם לא תשובה:
   הלקוח נוחת על טבלה בלי סניפים ובלי עובדים, ולא יודע מה הצעד
   הראשון. בין "מלא בזבל" ל"ריק וזרוק" יש אשף.

   ארבעה שלבים, בסדר שבו הדברים באמת תלויים זה בזה:
     1. פרטי העסק   – השם שהעובדים יראו ושיופיע במיילים אליהם
     2. סניפים      – אין לאן לשבץ בלי מקום
     3. משמרות      – אין מה לשבץ בלי שעות
     4. עובדים      – ייבוא מקובץ, או הזנה ידנית

   האשף אינו חוסם: אפשר לדלג עליו בכל שלב, והוא לא יחזור.
   לקוח שמעדיף לנבור במסכים בעצמו צריך שנזוז לו מהדרך. */
(function (root) {
  'use strict';

  var Model = root.ShiftModel;
  var Store = root.ShiftStore;

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function ico(name, extraClass) {
    return root.ShiftIcons ? root.ShiftIcons.svg(name, extraClass) : '';
  }

  /* הסגירה נשמרת על העסק ולא על המכשיר.

     הלקוח מאשר את המייל בטלפון ונכנס משם, ואת ההגדרה האמיתית
     הוא עושה במחשב. דגל שיושב בדפדפן אחד פירושו אשף שנעלם
     באמצע המעבר בין השניים -- ואז מי שבא להגדיר את העסק נוחת
     על טבלה ריקה בלי לדעת מאיפה מתחילים.

     המפתח הישן נשאר נקרא לצורך אחד: לקוח שכבר סגר את האשף
     במכשיר הזה לפני השינוי אינו אמור לפגוש אותו שוב. */
  var KEY = 'setshifts-onboarding';

  function dismissedOnThisDevice() {
    try { return !!root.localStorage.getItem(KEY); }
    catch (err) { return false; }
  }

  var STEPS = [
    { id: 'business', icon: 'store',  title: 'onboarding.step1Title' },
    { id: 'branches', icon: 'store',  title: 'onboarding.step2Title' },
    { id: 'shifts',   icon: 'clock',  title: 'onboarding.step3Title' },
    { id: 'staff',    icon: 'users',  title: 'onboarding.step4Title' }
  ];

  function Onboarding(options) {
    this.ctx = options;
    this.step = 0;
    this.busy = false;
    this.host = document.getElementById('onboarding');
  }

  /* מתי האשף רלוונטי: בעלים או מנהל, בחשבון שעוד אין בו כלום,
     ושלא סגר אותו קודם. עובד לעולם אינו רואה אותו – אין לו מה
     להגדיר. */
  Onboarding.prototype.needed = function () {
    if (!this.host) return false;
    if (!Model.can(this.ctx.session.user.role, 'config.edit')) return false;
    var state = this.ctx.getState();
    /* לחיצה מפורשת סוגרת אותו, ורק היא. */
    if (Store.onboardingDone(state)) return false;
    if (dismissedOnThisDevice()) return false;
    /* וגם עסק שכבר מוגדר במלואו אינו צריך אותו: יש לאן לשבץ
       ויש את מי. חסר אחד מהשניים -- ההגדרה לא הסתיימה, והאשף
       עדיין הדבר המועיל ביותר על המסך. */
    return !state.branches.length || !state.employees.length;
  };

  Onboarding.prototype.start = function () {
    if (!this.needed()) { this.close(); return false; }
    this.step = 0;
    this._bind();
    this.render();
    this.host.classList.remove('hidden');
    document.body.classList.add('onboarding-open');
    return true;
  };

  /* סגירה לביקור הזה בלבד. הקשה ליד הכרטיס בטלפון אינה החלטה,
     והיא בהחלט לא "אל תציג לי את זה יותר". */
  Onboarding.prototype.hide = function () {
    if (!this.host) return;
    this.host.classList.add('hidden');
    this.host.innerHTML = '';
    document.body.classList.remove('onboarding-open');
    if (this.ctx.onDone) this.ctx.onDone();
  };

  /* סגירה סופית: הלקוח סיים את האשף, או לחץ "אמשיך לבד".

     נשמר על העסק דרך ההגדרות, ולכן הוא לא יחזור גם ממכשיר אחר.
     כישלון שמירה אינו מצב שבור -- האשף ייסגר עכשיו ויחזור
     בפעם הבאה, וזה עדיף על "נעלם ואיש אינו יודע למה". */
  Onboarding.prototype.close = function (finished) {
    if (!this.host) return;
    var state = this.ctx.getState();
    if (Store.setOnboardingDone(state, true) && this.ctx.persistConfig) {
      try { this.ctx.persistConfig(); } catch (err) { /* יחזור בפעם הבאה */ }
    }
    this.hide();
  };

  /* ===== ציור ===== */

  Onboarding.prototype.render = function () {
    if (!this.host) return;
    var self = this;
    var step = STEPS[this.step];

    var html = '<div class="wiz-backdrop"></div><div class="wiz-card" role="dialog" ' +
      'aria-modal="true" aria-labelledby="wiz-title">';

    html += '<div class="wiz-head">' +
      '<span class="wiz-brand">' +
        (root.ShiftBrand ? root.ShiftBrand.lockupImg('SetShifts') : 'SetShifts') + '</span>' +
      '<button type="button" id="wiz-skip" class="btn ghost small">' +
        esc(t('onboarding.skip')) + '</button>' +
      '</div>';

    /* מד השלבים. מספר בלבד ("2 מתוך 4") אינו אומר מה נשאר; */
    html += '<ol class="wiz-steps">';
    STEPS.forEach(function (item, index) {
      var state = index < self.step ? ' done' : (index === self.step ? ' now' : '');
      html += '<li class="wiz-step' + state + '"' +
        (index === self.step ? ' aria-current="step"' : '') + '>' +
        '<span class="wiz-dot">' +
          (index < self.step ? ico('check') : String(index + 1)) + '</span>' +
        '<span class="wiz-step-name">' + esc(t(item.title)) + '</span>' +
        '</li>';
    });
    html += '</ol>';

    html += '<div class="wiz-body">';
    html += '<h2 id="wiz-title">' + ico(step.icon, 'ico-lg') + esc(t(step.title)) + '</h2>';
    html += '<p class="wiz-hint">' + esc(t('onboarding.' + step.id + 'Hint')) + '</p>';
    html += this['_' + step.id]();
    html += '<p id="wiz-error" class="wiz-error hidden"></p>';
    html += '</div>';

    html += '<div class="wiz-foot">' +
      (this.step > 0
        ? '<button type="button" id="wiz-back" class="btn ghost">' + esc(t('onboarding.back')) + '</button>'
        : '<span></span>') +
      '<button type="button" id="wiz-next" class="btn primary">' +
        esc(t(this.step === STEPS.length - 1 ? 'onboarding.finish' : 'onboarding.next')) +
        ico('chevron', 'ico-next') + '</button>' +
      '</div>';

    html += '</div>';
    this.host.innerHTML = html;

    var first = this.host.querySelector('input, select, button.btn.primary');
    if (first) first.focus();
  };

  /* --- שלב 1: פרטי העסק --- */
  Onboarding.prototype._business = function () {
    var name = this.ctx.session.company.name || '';
    return '<label class="wiz-field"><span>' + esc(t('onboarding.companyName')) + '</span>' +
      '<input type="text" id="wiz-company" class="text-input" maxlength="120" value="' +
        esc(name) + '"></label>' +
      '<label class="wiz-field"><span>' + esc(t('onboarding.myName')) + '</span>' +
      '<input type="text" id="wiz-me" class="text-input" maxlength="80" value="' +
        esc(this.ctx.session.user.name || '') + '"></label>';
  };

  /* --- שלב 2: סניפים --- */
  Onboarding.prototype._branches = function () {
    var state = this.ctx.getState();
    var names = state.branches.map(function (branch) { return branch.name; });
    while (names.length < 1) { names.push(''); }
    var html = '<div id="wiz-branches" class="wiz-list">';
    names.forEach(function (value, index) {
      html += branchRow(value, index);
    });
    html += '</div>';
    html += '<button type="button" id="wiz-add-branch" class="btn ghost small">' +
      ico('plus') + esc(t('onboarding.addBranch')) + '</button>';
    return html;
  };

  function branchRow(value, index) {
    return '<div class="wiz-row">' +
      '<input type="text" class="text-input wiz-branch" maxlength="60" value="' + esc(value) + '"' +
        ' aria-label="' + esc(t('onboarding.branchName') + ' ' + (index + 1)) + '"' +
        ' placeholder="' + esc(t('onboarding.branchPlaceholder')) + '">' +
      '<button type="button" class="btn icon ghost wiz-drop" aria-label="' +
        esc(t('onboarding.remove')) + '">' + ico('close') + '</button>' +
      '</div>';
  }

  /* --- שלב 3: משמרות ושעות --- */
  Onboarding.prototype._shifts = function () {
    var shifts = this.ctx.getState().settings.shifts || [];
    var html = '<div id="wiz-shifts" class="wiz-list">';
    shifts.forEach(function (shift, index) {
      html += '<div class="wiz-row wiz-shift" data-shift="' + esc(shift.id) + '">' +
        '<span class="wiz-swatch sh sh-' + (shift.color || 0) + '" aria-hidden="true"></span>' +
        '<input type="text" class="text-input wiz-shift-name" maxlength="40" value="' + esc(shift.name) + '"' +
          ' aria-label="' + esc(t('onboarding.shiftName') + ' ' + (index + 1)) + '">' +
        '<input type="text" class="time-input wiz-shift-from" maxlength="5" inputmode="numeric" value="' +
          esc(shift.from || '') + '" aria-label="' + esc(t('onboarding.shiftFrom')) + '">' +
        '<span class="wiz-dash">–</span>' +
        '<input type="text" class="time-input wiz-shift-to" maxlength="5" inputmode="numeric" value="' +
          esc(shift.to || '') + '" aria-label="' + esc(t('onboarding.shiftTo')) + '">' +
        '<button type="button" class="btn icon ghost wiz-drop" aria-label="' +
          esc(t('onboarding.remove')) + '">' + ico('close') + '</button>' +
        '</div>';
    });
    html += '</div>';
    html += '<p class="wiz-note">' + esc(t('onboarding.shiftsNote')) + '</p>';
    return html;
  };

  /* --- שלב 4: עובדים --- */
  Onboarding.prototype._staff = function () {
    var count = this.ctx.getState().employees.length;
    var html = '<div class="wiz-choice">';
    html += '<button type="button" id="wiz-import" class="wiz-option">' +
      ico('upload', 'ico-lg') +
      '<b>' + esc(t('onboarding.importTitle')) + '</b>' +
      '<span>' + esc(t('onboarding.importBody')) + '</span></button>';
    html += '<div class="wiz-option is-manual">' +
      ico('users', 'ico-lg') +
      '<b>' + esc(t('onboarding.manualTitle')) + '</b>' +
      '<span>' + esc(t('onboarding.manualBody')) + '</span>' +
      '<div class="wiz-row">' +
        '<input type="text" id="wiz-emp" class="text-input" maxlength="60" placeholder="' +
          esc(t('onboarding.employeePlaceholder')) + '">' +
        '<button type="button" id="wiz-add-emp" class="btn ghost small">' +
          ico('plus') + esc(t('onboarding.addEmployee')) + '</button>' +
      '</div>' +
      '<p class="wiz-count' + (count ? '' : ' empty') + '" id="wiz-count">' +
        esc(count
          ? t('onboarding.staffCount', { count: count })
          : t('onboarding.staffNone')) + '</p>' +
      '</div>';
    html += '</div>';
    return html;
  };

  /* ===== שמירה של כל שלב ===== */

  Onboarding.prototype._say = function (message) {
    var node = document.getElementById('wiz-error');
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('hidden', !message);
  };

  Onboarding.prototype._save = function () {
    var self = this;
    var step = STEPS[this.step].id;
    this._say('');

    if (step === 'business') {
      var company = String((document.getElementById('wiz-company') || {}).value || '').trim();
      var me = String((document.getElementById('wiz-me') || {}).value || '').trim();
      if (!company) { this._say(t('onboarding.needCompany')); return Promise.reject(); }
      var jobs = [];
      if (company !== this.ctx.session.company.name && this.ctx.renameCompany) {
        jobs.push(this.ctx.renameCompany(company));
      }
      if (me && me !== this.ctx.session.user.name && this.ctx.saveOwnName) {
        jobs.push(this.ctx.saveOwnName(me));
      }
      return Promise.all(jobs);
    }

    if (step === 'branches') {
      var names = [];
      document.querySelectorAll('.wiz-branch').forEach(function (input) {
        var value = String(input.value || '').trim();
        if (value) names.push(value);
      });
      if (!names.length) { this._say(t('onboarding.needBranch')); return Promise.reject(); }
      var state = this.ctx.getState();
      /* סניף שכבר נוצר בשלב הזה אינו נוצר שוב: הלקוח יכול לחזור
         אחורה, לתקן שם, ולהמשיך – בלי לקבל שני סניפים. */
      state.branches.length = 0;
      names.forEach(function (name) { self.ctx.addBranch(name, true); });
      return Promise.resolve(this.ctx.persistConfig());
    }

    if (step === 'shifts') {
      var shifts = [];
      var bad = false;
      document.querySelectorAll('.wiz-shift').forEach(function (row) {
        var name = String(row.querySelector('.wiz-shift-name').value || '').trim();
        if (!name) return;
        var from = String(row.querySelector('.wiz-shift-from').value || '').trim();
        var to = String(row.querySelector('.wiz-shift-to').value || '').trim();
        if (!/^\d{1,2}:\d{2}$/.test(from) || !/^\d{1,2}:\d{2}$/.test(to)) { bad = true; return; }
        shifts.push({ id: row.dataset.shift, name: name, from: from, to: to });
      });
      if (!shifts.length) { this._say(t('onboarding.needShift')); return Promise.reject(); }
      if (bad) { this._say(t('onboarding.badHours')); return Promise.reject(); }
      return Promise.resolve(this.ctx.saveShifts(shifts));
    }

    return Promise.resolve();
  };

  /* ===== אירועים ===== */

  Onboarding.prototype._bind = function () {
    var self = this;
    if (this.bound) return;
    this.bound = true;

    this.host.addEventListener('click', function (event) {
      /* הכפתור סוגר סופית; הקשה ליד הכרטיס סוגרת לביקור הזה
         בלבד. זה ההבדל בין "אני מסתדר לבד" לבין אצבע שהחליקה. */
      if (event.target.closest('#wiz-skip')) { self.close(false); return; }
      if (event.target.closest('.wiz-backdrop')) { self.hide(); return; }
      if (event.target.closest('#wiz-back')) {
        if (self.step > 0) { self.step--; self.render(); }
        return;
      }
      if (event.target.closest('#wiz-next')) {
        if (self.busy) return;
        self.busy = true;
        Promise.resolve(self._save()).then(function () {
          self.busy = false;
          if (self.step === STEPS.length - 1) { self.close(true); return; }
          self.step++;
          self.render();
        }, function (err) {
          self.busy = false;
          if (err && err.message) self._say(err.message);
        });
        return;
      }
      if (event.target.closest('#wiz-add-branch')) {
        var list = document.getElementById('wiz-branches');
        var count = list.querySelectorAll('.wiz-branch').length;
        list.insertAdjacentHTML('beforeend', branchRow('', count));
        var added = list.querySelectorAll('.wiz-branch');
        added[added.length - 1].focus();
        return;
      }
      var drop = event.target.closest('.wiz-drop');
      if (drop) {
        var row = drop.closest('.wiz-row');
        /* השורה האחרונה אינה נמחקת: מסך בלי שום שדה נראה שבור */
        if (row.parentNode.querySelectorAll('.wiz-row').length > 1) { row.remove(); }
        else { row.querySelector('input').value = ''; }
        return;
      }
      if (event.target.closest('#wiz-add-emp')) { self._addEmployee(); return; }
      if (event.target.closest('#wiz-import')) {
        /* הייבוא הוא המסך הקיים. האשף נסגר לפניו, כי שני חלונות
           זה על זה הם בדיוק המקום שבו לקוח מאבד את החוט. */
        self.close(true);
        if (root.ShiftImportUI) { root.ShiftImportUI.open(); }
      }
    });

    this.host.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { self.close(false); return; }
      if (event.key !== 'Enter') return;
      if (event.target.id === 'wiz-emp') { event.preventDefault(); self._addEmployee(); return; }
      if (event.target.tagName === 'INPUT') {
        event.preventDefault();
        var next = document.getElementById('wiz-next');
        if (next) next.click();
      }
    });
  };

  Onboarding.prototype._addEmployee = function () {
    var input = document.getElementById('wiz-emp');
    if (!input) return;
    var name = String(input.value || '').trim();
    if (!name) { input.focus(); return; }
    this.ctx.addEmployee(name, true);
    this.ctx.persistConfig();
    input.value = '';
    input.focus();
    var count = this.ctx.getState().employees.length;
    var label = document.getElementById('wiz-count');
    if (label) {
      label.textContent = t('onboarding.staffCount', { count: count });
      label.classList.remove('empty');
    }
  };

  var API = { Onboarding: Onboarding, STORAGE_KEY: KEY, STEPS: STEPS };
  root.ShiftOnboarding = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
