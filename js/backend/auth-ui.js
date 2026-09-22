/* מסך ההתחברות וההרשמה, שורת המשתמש בראש המסך, ומסך חסימה כשהמנוי פג. */
(function (root) {
  'use strict';

  var Model = root.ShiftModel;

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
  }

  /* מסך הכניסה הוא המסך הראשון שלקוח חדש רואה, ולכן הוא נושא את
     הלוגו המלא ולא את הסמל לבד עם השם ככותרת טקסט. */
  function brandLockup() {
    return root.ShiftBrand
      ? '<span class="auth-logo">' + root.ShiftBrand.lockupImg('SetShifts') + '</span>'
      : '<h1 class="auth-title">' + t('app.title') + '</h1>';
  }

  /* ===== עין להצגת הסיסמה =====
     סיסמה מוקלדת בעיוורון היא הסיבה הנפוצה ביותר ל"סיסמה שגויה"
     שאינה שגויה – במיוחד בטלפון, ובמיוחד בסיסמה שהמשתמש בדיוק
     המציא ועוד לא זוכר. העין פותרת את זה בלי להחליש שום דבר:
     היא מחליפה את type בלבד, והערך עצמו לא נוגע בשום מקום.

     שתי דרכים מתחלפות ב-CSS ולא ב-JavaScript, כדי שקורא מסך
     יקבל מצב אחד ברור דרך aria-pressed. */
  var EYE_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round" d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/>' +
    '<circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  var EYE_SHUT = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round" d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/>' +
    '<circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M4 20 20 4"/></svg>';

  function addPasswordToggles(scope) {
    if (!scope) return;
    var fields = scope.querySelectorAll('input[type="password"]');
    Array.prototype.forEach.call(fields, function (input) {
      if (input.parentNode && input.parentNode.classList.contains('pw-field')) return;
      var wrap = document.createElement('span');
      wrap.className = 'pw-field';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);

      var button = document.createElement('button');
      button.type = 'button';           // אחרת הוא שולח את הטופס
      button.className = 'pw-toggle';
      button.setAttribute('data-pw-toggle', '');
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', t('auth.showPassword'));
      button.setAttribute('title', t('auth.showPassword'));
      /* tabindex=-1: מי שמנווט במקלדת רוצה להגיע מהסיסמה לכפתור
         השליחה, ולא לעצור בדרך על כפתור תצוגה. */
      button.tabIndex = -1;
      button.innerHTML = EYE_OPEN;
      wrap.appendChild(button);
    });
  }

  function togglePassword(button) {
    var input = button.parentNode.querySelector('input');
    if (!input) return;
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.setAttribute('aria-pressed', show ? 'true' : 'false');
    var label = t(show ? 'auth.hidePassword' : 'auth.showPassword');
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.innerHTML = show ? EYE_SHUT : EYE_OPEN;
    /* הסמן חוזר לסוף הטקסט: החלפת type מאבדת את מיקומו בחלק
       מהדפדפנים, והמשתמש מגלה שהוא ממשיך להקליד באמצע. */
    try {
      var end = input.value.length;
      input.focus();
      input.setSelectionRange(end, end);
    } catch (err) { /* type=text אינו תומך בזה בכל דפדפן */ }
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function AuthUI(options) {
    this.backend = options.backend;
    this.onSignedIn = options.onSignedIn;
    this.onSignedOut = options.onSignedOut;
    this.gate = document.getElementById('auth-gate');
    this.appRoot = document.getElementById('app-root');
    this.mode = 'signin';
    this.busy = false;
    this.accountOpen = false;
  }

  AuthUI.prototype.start = function () {
    this._bind();
    this.watchLanguage();

    /* לקוח שהגיע מקישור בדואר (איפוס סיסמה או הזמנה) צריך לקבוע
       סיסמה לפני הכל. מסך התחברות רגיל כאן הוא קישור שבור מבחינתו. */
    var pending = this.backend.pendingAuthAction && this.backend.pendingAuthAction();
    if (pending) { this.showPasswordSetup(pending); return Promise.resolve(null); }

    /* קישור שפג או שנלחץ פעמיים – מוצג במסך ההתחברות, כדי שהלקוח
       יבין שצריך לבקש קישור חדש ולא שהמערכת שכחה אותו. */
    var linkError = this.backend.takeLinkError && this.backend.takeLinkError();

    var session = this.backend.session();
    if (session && !linkError) { return this._enter(session); }
    this.showGate();
    if (linkError) { this._error(linkError); }
    return Promise.resolve(null);
  };

  AuthUI.prototype._bind = function () {
    var self = this;

    this.gate.addEventListener('click', function (event) {
      var eye = event.target.closest('[data-pw-toggle]');
      if (eye) { event.preventDefault(); togglePassword(eye); return; }

      var tab = event.target.closest('[data-auth-mode]');
      if (tab) {
        event.preventDefault();
        self.mode = tab.dataset.authMode;
        self.showGate();
        return;
      }
      if (event.target.closest('#auth-signout-blocked')) { self.signOut(); }
      if (event.target.closest('#auth-forgot')) {
        event.preventDefault();
        self.mode = 'reset';
        self.notice = '';
        self.showGate();
      }
      if (event.target.closest('#auth-cancel-setup')) {
        event.preventDefault();
        if (self.backend.clearPendingAuthAction) self.backend.clearPendingAuthAction();
        self.signOut();
      }
    });

    /* החלפת שפה במסך הכניסה מציירת אותו מחדש בשפה החדשה */
    this.gate.addEventListener('change', function (event) {
      if (!event.target.closest('#auth-language') || !root.I18nDom) return;
      root.I18nDom.setLanguage(event.target.value);
      self.showGate();
    });

    /* סיסמה שנחשפה חוזרת להסתרה בשליחה. אחרת היא נשארת על המסך
       גם אחרי שהמשתמש סיים, ועל טלפון זה המסך שמישהו מציץ בו. */
    this.gate.addEventListener('submit', function () {
      Array.prototype.forEach.call(
        self.gate.querySelectorAll('[data-pw-toggle][aria-pressed="true"]'),
        function (button) { togglePassword(button); });
    }, true);

    this.gate.addEventListener('submit', function (event) {
      event.preventDefault();
      if (self.busy) return;
      var form = event.target;
      if (form.id === 'signin-form') { self._signIn(form); }
      else if (form.id === 'signup-form') { self._signUp(form); }
      else if (form.id === 'reset-form') { self._requestReset(form); }
      else if (form.id === 'password-form') { self._setPassword(form); }
    });

    document.addEventListener('click', function (event) {
      if (event.target.closest('#user-signout')) {
        event.preventDefault();
        self.signOut();
        return;
      }
      if (event.target.closest('#user-account')) {
        event.preventDefault();
        self._toggleAccount();
        return;
      }
      if (event.target.closest('#account-close')) {
        event.preventDefault();
        self._toggleAccount(false);
        return;
      }
      if (event.target.closest('#account-save-name')) {
        event.preventDefault();
        self._saveIdentity('user');
        return;
      }
      if (event.target.closest('#account-save-company')) {
        event.preventDefault();
        self._saveIdentity('company');
        return;
      }
      if (event.target.closest('#user-notify')) {
        event.preventDefault();
        var Notify = root.ShiftNotify;
        if (!Notify) return;
        Notify.request().then(function (permission) {
          var session = self.backend.session();
          if (session) self.renderUserBar(session);
          if (permission === 'granted') {
            Notify.show({ title: t('auth.notifyEnabled'), body: t('auth.notifyBody'), tag: 'welcome' });
          }
        });
      }
    });
  };

  function legalLink(href, label) {
    return '<a href="' + href + '" target="_blank" rel="noopener">' + esc(label) + '</a>';
  }

  function supportLink() {
    var address = Model.SUPPORT_EMAIL;
    return '<a href="mailto:' + esc(address) + '">' + esc(address) + '</a>';
  }

  AuthUI.prototype._error = function (message) {
    var node = this.gate.querySelector('.auth-error');
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('hidden', !message);
  };

  /* הודעה חיובית, להבדיל משגיאה. נשמרת על האובייקט כדי שתשרוד
     ציור מחדש של המסך – למשל מעבר מלשונית ההרשמה לזו של הכניסה. */
  AuthUI.prototype._notice = function (message) {
    this.notice = message || '';
    var node = this.gate.querySelector('.auth-notice');
    if (!node) return;
    node.textContent = this.notice;
    node.classList.toggle('hidden', !this.notice);
  };

  AuthUI.prototype._setBusy = function (busy, label) {
    this.busy = busy;
    var button = this.gate.querySelector('button[type="submit"]');
    if (!button) return;
    button.disabled = busy;
    if (busy) { button.dataset.idle = button.textContent; button.textContent = label || t('auth.wait'); }
    else if (button.dataset.idle) { button.textContent = button.dataset.idle; }
  };

  AuthUI.prototype._signIn = function (form) {
    var self = this;
    this._error('');
    this._notice('');
    this._setBusy(true, t('auth.signingIn'));
    this.backend.signIn({
      email: form.email.value, password: form.password.value
    }).then(function (session) {
      self._setBusy(false);
      self._enter(session);
    }, function (err) {
      self._setBusy(false);
      self._error((err && err.message) || t('auth.failedSignIn'));
    });
  };

  AuthUI.prototype._signUp = function (form) {
    var self = this;
    this._error('');
    this._notice('');
    this._setBusy(true, t('auth.creating'));
    this.backend.signUpCompany({
      companyName: form.companyName.value,
      name: form.name.value,
      email: form.email.value,
      password: form.password.value
    }).then(function (session) {
      self._setBusy(false);
      self._enter(session);
    }, function (err) {
      self._setBusy(false);
      /* ההרשמה הצליחה – היא פשוט לא נגמרת כאן. אסור להציג את זה
         כשגיאה אדומה: לקוח שיחשוב שנכשל ינסה להירשם שוב, ואז
         יקבל "המשתמש כבר קיים" ויתייאש. */
      if (err && err.code === 'confirm_email') {
        self.mode = 'signin';
        self.notice = err.message || t('server.confirmEmail');
        self.showGate();
        return;
      }
      self._error((err && err.message) || t('auth.failedSignUp'));
    });
  };

  /* הבקשה לאיפוס אינה מגלה אם הכתובת קיימת, ולכן ההודעה זהה בכל
     מקרה. זה מסך פתוח לכל האינטרנט. */
  AuthUI.prototype._requestReset = function (form) {
    var self = this;
    this._error('');
    this._notice('');
    this._setBusy(true, t('auth.sending'));
    this.backend.requestPasswordReset(form.email.value).then(function () {
      self._setBusy(false);
      self.mode = 'signin';
      self.notice = t('auth.resetSent');
      self.showGate();
    }, function (err) {
      self._setBusy(false);
      self._error((err && err.message) || t('auth.resetFailed'));
    });
  };

  AuthUI.prototype._setPassword = function (form) {
    var self = this;
    this._error('');
    if (form.password.value !== form.confirm.value) {
      this._error(t('auth.passwordsDiffer'));
      return;
    }
    this._setBusy(true, t('auth.wait'));
    this.backend.setPassword(form.password.value).then(function (session) {
      self._setBusy(false);
      if (!session) {
        /* הסיסמה נשמרה, אבל אין פרופיל להיכנס אליו. עדיף להחזיר
           למסך התחברות מאשר להשאיר מסך לבן. */
        self.mode = 'signin';
        self.notice = t('auth.passwordSaved');
        self.showGate();
        return;
      }
      self._enter(session);
    }, function (err) {
      self._setBusy(false);
      self._error((err && err.message) || t('auth.passwordFailed'));
    });
  };

  /* מסך "בחרו סיסמה" – גם לאיפוס וגם להזמנה. שניהם מגיעים מקישור
     בדואר, וההבדל היחיד הוא מה שכתוב למעלה. */
  AuthUI.prototype.showPasswordSetup = function (kind) {
    this.appRoot.classList.add('hidden');
    this.gate.classList.remove('hidden');
    var userBar = document.getElementById('user-bar');
    if (userBar) userBar.classList.add('hidden');

    var html = '<div class="auth-card">';
    html += '<div class="auth-brand">' + brandLockup() +
      '<p class="auth-sub">' + t('app.subtitle') + '</p></div>';
    html += '<h2 class="auth-section">' + t('auth.newPasswordTitle') + '</h2>';
    html += '<p class="auth-hint">' +
      t(kind === 'invite' ? 'auth.invitePasswordHint' : 'auth.resetPasswordHint') + '</p>';
    html += '<p class="auth-error hidden"></p>';
    html += '<p class="auth-notice hidden"></p>';
    html += '<form id="password-form" class="auth-form">' +
      '<label>' + t('auth.newPassword') +
      '<input type="password" name="password" class="text-input" autocomplete="new-password" required minlength="6">' +
      '<small>' + t('auth.passwordHint') + '</small></label>' +
      '<label>' + t('auth.newPasswordConfirm') +
      '<input type="password" name="confirm" class="text-input" autocomplete="new-password" required minlength="6"></label>' +
      '<button type="submit" class="btn primary">' + t('auth.savePassword') + '</button>' +
      '<p class="auth-hint"><a href="#" id="auth-cancel-setup">' + t('auth.backToSignIn') + '</a></p>' +
      '</form>';
    html += '</div>';
    this.gate.innerHTML = html;
    addPasswordToggles(this.gate);
    return Promise.resolve(null);
  };

  AuthUI.prototype.signOut = function () {
    var self = this;
    return this.backend.signOut().then(function () {
      self.mode = 'signin';
      self.showGate();
      if (self.onSignedOut) self.onSignedOut();
    });
  };

  AuthUI.prototype._enter = function (session) {
    var self = this;
    if (!session.access.allowed) { return this.showBlocked(session); }
    this.gate.classList.add('hidden');
    this.appRoot.classList.remove('hidden');
    this.renderUserBar(session);
    return Promise.resolve(this.onSignedIn ? this.onSignedIn(session) : null);
  };

  AuthUI.prototype.renderUserBar = function (session) {
    var bar = document.getElementById('user-bar');
    if (!bar) return;
    var notice = '';
    if (session.access.text) {
      notice = '<span class="user-notice ' + (session.access.reason === 'past-due' ? 'warn' : '') + '">' +
        esc(session.access.text) + '</span>';
    }
    var Notify = root.ShiftNotify;
    var notifyButton = '';
    if (Notify && Notify.supported() && !(Notify.enabled() && Notify.permission() === 'granted')) {
      /* האייקון שייך לכפתור ולא לתרגום, אחרת הוא מופיע פעמיים
         בשפה אחת וחסר באחרות. */
      notifyButton = '<button id="user-notify" class="btn ghost small">🔔 ' +
        t('auth.enableNotifications') + '</button>';
    }

    var langSelect = '<select id="user-language" class="user-lang" aria-label="' +
      esc(t('app.language')) + '"></select>';

    /* "מה העובד יראה" – שאלה שמנהל שואל לפני כל פרסום סידור */
    var previewButton = '';
    if (Model.can(session.user.role, 'schedule.edit')) {
      previewButton = '<button id="user-preview" class="btn ghost small">' +
        esc(t('preview.open')) + '</button>';
    }

    /* שני שמות זה ליד זה בלי תווית הם חידה: מי מהם העסק ומי
       המשתמש. התוויות פותרות את זה, והלחיצה פותחת את המקום שבו
       אפשר לתקן כל אחד מהם בנפרד. */
    var identity =
      '<button type="button" id="user-account" class="user-id" ' +
        'aria-expanded="' + (this.accountOpen ? 'true' : 'false') + '" ' +
        'aria-controls="account-panel" title="' + esc(t('account.open')) + '">' +
        '<span class="user-company"><span class="user-tag">' + esc(t('account.barCompany')) +
          '</span> ' + esc(session.company.name) + '</span>' +
        '<span class="user-name"><span class="user-tag">' + esc(t('account.barUser')) +
          '</span> ' + esc(session.user.name) +
          ' · ' + esc(Model.ROLE_NAMES[session.user.role] || session.user.role) + '</span>' +
      '</button>';

    bar.innerHTML = identity +
      notice + langSelect + previewButton + notifyButton +
      '<button id="user-signout" class="btn ghost small">' + t('auth.signOut') + '</button>' +
      '<div id="account-panel" class="account-panel' + (this.accountOpen ? '' : ' hidden') + '"></div>';
    bar.classList.remove('hidden');
    if (this.accountOpen) { this.renderAccount(session); }
    if (root.I18nDom) { root.I18nDom.fillPicker(bar.querySelector('#user-language')); }
  };

  /* ===== החשבון שלי =====
     שם המשתמש ושם העסק נקלטו יחד במסך הרשמה אחד, ומאז לא הייתה
     דרך לשנות אף אחד מהם. כאן הם שני שדות נפרדים: השם שלי – לכל
     משתמש על עצמו; שם העסק – לבעלים בלבד, כי זה השם המסחרי
     שהעובדים רואים ושמופיע במיילים אליהם. */
  AuthUI.prototype.renderAccount = function (session) {
    var panel = document.getElementById('account-panel');
    if (!panel) return;
    var canRename = Model.can(session.user.role, 'company.rename');

    var html = '<h3 class="account-title">' + esc(t('account.title')) + '</h3>';

    html += '<div class="account-field">' +
      '<label for="account-name">' + esc(t('account.myName')) + '</label>' +
      '<div class="account-row">' +
        '<input type="text" id="account-name" class="text-input" maxlength="80" value="' +
          esc(session.user.name) + '">' +
        '<button type="button" id="account-save-name" class="btn primary small">' +
          esc(t('account.save')) + '</button>' +
      '</div>' +
      '<p class="hint">' + esc(t('account.myNameHint')) + '</p>' +
      '</div>';

    html += '<div class="account-field">' +
      '<label' + (canRename ? ' for="account-company"' : '') + '>' +
        esc(t('account.companyName')) + '</label>';
    if (canRename) {
      html += '<div class="account-row">' +
        '<input type="text" id="account-company" class="text-input" maxlength="120" value="' +
          esc(session.company.name) + '">' +
        '<button type="button" id="account-save-company" class="btn primary small">' +
          esc(t('account.save')) + '</button>' +
        '</div>' +
        '<p class="hint">' + esc(t('account.companyNameHint')) + '</p>';
    } else {
      html += '<p class="account-static">' + esc(session.company.name) + '</p>' +
        '<p class="hint">' + esc(t('account.companyOwnerOnly')) + '</p>';
    }
    html += '</div>';

    /* המייל והתפקיד אינם ניתנים לשינוי מכאן, אבל הם מה שמזהה את
       החשבון – ובלעדיהם המסך הזה לא עונה על "באיזה חשבון אני". */
    html += '<dl class="account-facts">' +
      '<dt>' + esc(t('account.email')) + '</dt><dd dir="ltr">' + esc(session.user.email) + '</dd>' +
      '<dt>' + esc(t('account.role')) + '</dt><dd>' +
        esc(Model.ROLE_NAMES[session.user.role] || session.user.role) + '</dd>' +
      '</dl>';

    html += '<p id="account-message" class="users-message hidden"></p>' +
      '<div class="row"><button type="button" id="account-close" class="btn ghost small">' +
        esc(t('account.close')) + '</button></div>';

    panel.innerHTML = html;
  };

  AuthUI.prototype._accountSay = function (text, isError) {
    var node = document.getElementById('account-message');
    if (!node) return;
    node.textContent = text || '';
    node.className = 'users-message' + (text ? '' : ' hidden') + (isError ? ' error' : '');
  };

  AuthUI.prototype._toggleAccount = function (open) {
    var session = this.backend.session();
    if (!session) return;
    this.accountOpen = open === undefined ? !this.accountOpen : !!open;
    this.renderUserBar(session);
    if (this.accountOpen) {
      var field = document.getElementById('account-name');
      if (field) field.focus();
    }
  };

  /* שמירת שם – של המשתמש או של העסק. שניהם מסתיימים באותו אופן:
     ציור מחדש של השורה, כדי שמה שעל המסך יהיה מה שבשרת. */
  AuthUI.prototype._saveIdentity = function (kind) {
    var self = this;
    var input = document.getElementById(kind === 'company' ? 'account-company' : 'account-name');
    if (!input) return;
    var value = String(input.value || '').trim();
    if (!value) { this._accountSay(t('account.nameRequired'), true); return; }

    var button = document.getElementById(kind === 'company' ? 'account-save-company' : 'account-save-name');
    if (button) button.disabled = true;
    this._accountSay('');

    var call = kind === 'company'
      ? this.backend.renameCompany(value)
      : this.backend.saveOwnName(value);

    Promise.resolve(call).then(function () {
      var session = self.backend.session();
      if (session) self.renderUserBar(session);
      self._accountSay(t('account.saved'));
      if (self.onIdentityChange) self.onIdentityChange(session);
    }, function (err) {
      if (button) button.disabled = false;
      self._accountSay((err && err.message) || t('account.nameRequired'), true);
    });
  };

  /* שורת המשתמש נכתבת מחדש כשהשפה מתחלפת */
  AuthUI.prototype.watchLanguage = function () {
    var self = this;
    if (!root.I18n) return;
    root.I18n.onChange(function () {
      var session = self.backend.session();
      if (session) self.renderUserBar(session);
    });
  };

  AuthUI.prototype.showBlocked = function (session) {
    this.appRoot.classList.add('hidden');
    this.gate.classList.remove('hidden');
    this.gate.innerHTML =
      '<div class="auth-card">' +
        '<h1 class="auth-title">' + esc(session.company.name) + '</h1>' +
        '<div class="auth-blocked">' +
          '<h2>' + t('auth.blocked') + '</h2>' +
          '<p>' + esc(session.access.text) + '</p>' +
          (Model.can(session.user.role, 'billing.manage')
            ? '<p class="auth-hint">' + t('auth.blockedOwner') + '</p>' +
              /* ההודעה מבקשת לפנות לתמיכה, ולכן חייבת גם לומר לאן.
                 זה המסך שבו לקוח חסום מחליט אם להילחם או לוותר. */
              '<p class="auth-hint">' + t('common.emailUs') + ' ' + supportLink() + '</p>'
            : '<p class="auth-hint">' + t('auth.blockedMember') + '</p>') +
        '</div>' +
        '<button id="auth-signout-blocked" class="btn ghost">' + t('auth.signOut') + '</button>' +
      '</div>';
    return Promise.resolve(null);
  };

  AuthUI.prototype.showGate = function () {
    this.appRoot.classList.add('hidden');
    this.gate.classList.remove('hidden');
    var userBar = document.getElementById('user-bar');
    if (userBar) userBar.classList.add('hidden');

    var reset = this.mode === 'reset';
    var signin = this.mode === 'signin' || reset;
    var html = '<div class="auth-card">';
    html += '<div class="auth-brand">' + brandLockup() +
      '<p class="auth-sub">' + t('app.subtitle') + '</p></div>';

    /* בורר שפה כבר במסך הכניסה – לפני שיש חשבון או העדפה שמורה */
    html += '<div class="auth-lang"><label>' + t('app.language') +
      ' <select id="auth-language" class="text-input"></select></label></div>';

    html += '<div class="auth-tabs">' +
      '<button class="auth-tab' + (signin ? ' active' : '') + '" data-auth-mode="signin">' + t('auth.signIn') + '</button>' +
      '<button class="auth-tab' + (signin ? '' : ' active') + '" data-auth-mode="signup">' + t('auth.signUp') + '</button>' +
      '</div>';

    html += '<p class="auth-error hidden"></p>';
    html += '<p class="auth-notice hidden"></p>';

    if (reset) {
      /* מסך נפרד ולא רק שדה נוסף: מי שאיבד סיסמה לא צריך לראות
         שדה סיסמה שהוא לא יכול למלא. */
      html += '<form id="reset-form" class="auth-form">' +
        '<p class="auth-hint">' + t('auth.resetHint') + '</p>' +
        '<label>' + t('auth.email') + '<input type="email" name="email" class="text-input" autocomplete="username" required></label>' +
        '<button type="submit" class="btn primary">' + t('auth.resetSend') + '</button>' +
        '<p class="auth-hint"><a href="#" data-auth-mode="signin">' + t('auth.backToSignIn') + '</a></p>' +
        '</form>';
    } else if (signin) {
      html += '<form id="signin-form" class="auth-form">' +
        '<label>' + t('auth.email') + '<input type="email" name="email" class="text-input" autocomplete="username" required></label>' +
        '<label>' + t('auth.password') + '<input type="password" name="password" class="text-input" autocomplete="current-password" required></label>' +
        '<button type="submit" class="btn primary">' + t('auth.enter') + '</button>' +
        '<p class="auth-hint"><a href="#" id="auth-forgot">' + t('auth.forgot') + '</a></p>' +
        '</form>';
    } else {
      html += '<form id="signup-form" class="auth-form">' +
        '<label>' + t('auth.companyName') + '<input type="text" name="companyName" class="text-input" required></label>' +
        '<label>' + t('auth.name') + '<input type="text" name="name" class="text-input" autocomplete="name"></label>' +
        '<label>' + t('auth.email') + '<input type="email" name="email" class="text-input" autocomplete="username" required></label>' +
        '<label>' + t('auth.password') + '<input type="password" name="password" class="text-input" autocomplete="new-password" required>' +
        '<small>' + t('auth.passwordHint') + '</small></label>' +
        '<button type="submit" class="btn primary">' + t('auth.create') + '</button>' +
        /* הסכמה לתנאים במסך שבו היא נדרשת, עם קישורים שנפתחים
           בלשונית אחרת כדי לא לאבד את הטופס שמולא */
        '<p class="auth-hint">' + t('auth.consent', {
          terms: legalLink('/terms/', t('landing.terms')),
          privacy: legalLink('/privacy/', t('landing.privacy'))
        }) + '</p>' +
        '<p class="auth-hint auth-trial-note">' + esc(t('auth.trialNote', {
          days: Model.TRIAL_DAYS,
          date: Model.formatDate(Model.addDays(new Date(), Model.TRIAL_DAYS))
        })) + '</p>' +
        '</form>';
    }

    html += '</div>';
    this.gate.innerHTML = html;
    addPasswordToggles(this.gate);
    if (this.notice) { this._notice(this.notice); }
    if (root.I18nDom) { root.I18nDom.fillPicker(this.gate.querySelector('#auth-language')); }
  };

  var API = { AuthUI: AuthUI };
  root.ShiftAuthUI = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
