/* מסך ההתחברות וההרשמה, שורת המשתמש בראש המסך, ומסך חסימה כשהמנוי פג. */
(function (root) {
  'use strict';

  var Model = root.ShiftModel;

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
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
  }

  AuthUI.prototype.start = function () {
    var self = this;
    this._bind();
    this.watchLanguage();
    var session = this.backend.session();
    if (session) { return this._enter(session); }
    this.showGate();
    return Promise.resolve(null);
  };

  AuthUI.prototype._bind = function () {
    var self = this;

    this.gate.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-auth-mode]');
      if (tab) {
        self.mode = tab.dataset.authMode;
        self.showGate();
        return;
      }
      if (event.target.closest('#auth-signout-blocked')) { self.signOut(); }
    });

    /* החלפת שפה במסך הכניסה מציירת אותו מחדש בשפה החדשה */
    this.gate.addEventListener('change', function (event) {
      if (!event.target.closest('#auth-language') || !root.I18nDom) return;
      root.I18nDom.setLanguage(event.target.value);
      self.showGate();
    });

    this.gate.addEventListener('submit', function (event) {
      event.preventDefault();
      if (self.busy) return;
      var form = event.target;
      if (form.id === 'signin-form') { self._signIn(form); }
      else if (form.id === 'signup-form') { self._signUp(form); }
    });

    document.addEventListener('click', function (event) {
      if (event.target.closest('#user-signout')) {
        event.preventDefault();
        self.signOut();
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

  AuthUI.prototype._error = function (message) {
    var node = this.gate.querySelector('.auth-error');
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('hidden', !message);
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
      self._error((err && err.message) || t('auth.failedSignUp'));
    });
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
      notifyButton = '<button id="user-notify" class="btn ghost small">' + t('auth.enableNotifications') + '</button>';
    }

    var langSelect = '<select id="user-language" class="user-lang" aria-label="' +
      esc(t('app.language')) + '"></select>';

    bar.innerHTML =
      '<span class="user-company">' + esc(session.company.name) + '</span>' +
      '<span class="user-name">' + esc(session.user.name) +
      ' · ' + esc(Model.ROLE_NAMES[session.user.role] || session.user.role) + '</span>' +
      notice + langSelect + notifyButton +
      '<button id="user-signout" class="btn ghost small">' + t('auth.signOut') + '</button>';
    bar.classList.remove('hidden');
    if (root.I18nDom) { root.I18nDom.fillPicker(bar.querySelector('#user-language')); }
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
            ? '<p class="auth-hint">' + t('auth.blockedOwner') + '</p>'
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

    var signin = this.mode === 'signin';
    var html = '<div class="auth-card">';
    html += '<div class="auth-brand"><span class="logo">📱</span><div>' +
      '<h1 class="auth-title">' + t('app.title') + '</h1>' +
      '<p class="auth-sub">' + t('app.subtitle') + '</p></div></div>';

    /* בורר שפה כבר במסך הכניסה – לפני שיש חשבון או העדפה שמורה */
    html += '<div class="auth-lang"><label>' + t('app.language') +
      ' <select id="auth-language" class="text-input"></select></label></div>';

    html += '<div class="auth-tabs">' +
      '<button class="auth-tab' + (signin ? ' active' : '') + '" data-auth-mode="signin">' + t('auth.signIn') + '</button>' +
      '<button class="auth-tab' + (signin ? '' : ' active') + '" data-auth-mode="signup">' + t('auth.signUp') + '</button>' +
      '</div>';

    html += '<p class="auth-error hidden"></p>';

    if (signin) {
      html += '<form id="signin-form" class="auth-form">' +
        '<label>' + t('auth.email') + '<input type="email" name="email" class="text-input" autocomplete="username" required></label>' +
        '<label>' + t('auth.password') + '<input type="password" name="password" class="text-input" autocomplete="current-password" required></label>' +
        '<button type="submit" class="btn primary">' + t('auth.enter') + '</button>' +
        '</form>';
    } else {
      html += '<form id="signup-form" class="auth-form">' +
        '<label>' + t('auth.companyName') + '<input type="text" name="companyName" class="text-input" required></label>' +
        '<label>' + t('auth.name') + '<input type="text" name="name" class="text-input" autocomplete="name"></label>' +
        '<label>' + t('auth.email') + '<input type="email" name="email" class="text-input" autocomplete="username" required></label>' +
        '<label>' + t('auth.password') + '<input type="password" name="password" class="text-input" autocomplete="new-password" required>' +
        '<small>' + t('auth.passwordHint') + '</small></label>' +
        '<button type="submit" class="btn primary">' + t('auth.create') + '</button>' +
        '<p class="auth-hint">' + esc(t('auth.trialNote', {
          days: Model.TRIAL_DAYS,
          date: Model.formatDate(Model.addDays(new Date(), Model.TRIAL_DAYS))
        })) + '</p>' +
        '</form>';
    }

    html += '</div>';
    this.gate.innerHTML = html;
    if (root.I18nDom) { root.I18nDom.fillPicker(this.gate.querySelector('#auth-language')); }
  };

  var API = { AuthUI: AuthUI };
  root.ShiftAuthUI = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
