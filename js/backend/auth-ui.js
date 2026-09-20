/* מסך ההתחברות וההרשמה, שורת המשתמש בראש המסך, ומסך חסימה כשהמנוי פג. */
(function (root) {
  'use strict';

  var Model = root.ShiftModel;

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
            Notify.show({ title: 'ההתראות הופעלו', body: 'נודיע לך על עדכונים בסידור.', tag: 'welcome' });
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
    if (busy) { button.dataset.idle = button.textContent; button.textContent = label || 'רגע…'; }
    else if (button.dataset.idle) { button.textContent = button.dataset.idle; }
  };

  AuthUI.prototype._signIn = function (form) {
    var self = this;
    this._error('');
    this._setBusy(true, 'מתחבר…');
    this.backend.signIn({
      email: form.email.value, password: form.password.value
    }).then(function (session) {
      self._setBusy(false);
      self._enter(session);
    }, function (err) {
      self._setBusy(false);
      self._error((err && err.message) || 'ההתחברות נכשלה');
    });
  };

  AuthUI.prototype._signUp = function (form) {
    var self = this;
    this._error('');
    this._setBusy(true, 'פותח חשבון…');
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
      self._error((err && err.message) || 'ההרשמה נכשלה');
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
      notifyButton = '<button id="user-notify" class="btn ghost small">🔔 הפעלת התראות</button>';
    }

    bar.innerHTML =
      '<span class="user-company">' + esc(session.company.name) + '</span>' +
      '<span class="user-name">' + esc(session.user.name) +
      ' · ' + esc(Model.ROLE_NAMES[session.user.role] || session.user.role) + '</span>' +
      notice + notifyButton +
      '<button id="user-signout" class="btn ghost small">יציאה</button>';
    bar.classList.remove('hidden');
  };

  AuthUI.prototype.showBlocked = function (session) {
    this.appRoot.classList.add('hidden');
    this.gate.classList.remove('hidden');
    this.gate.innerHTML =
      '<div class="auth-card">' +
        '<h1 class="auth-title">' + esc(session.company.name) + '</h1>' +
        '<div class="auth-blocked">' +
          '<h2>הגישה חסומה</h2>' +
          '<p>' + esc(session.access.text) + '</p>' +
          (Model.can(session.user.role, 'billing.manage')
            ? '<p class="auth-hint">להפעלת המנוי יש לפנות לתמיכה.</p>'
            : '<p class="auth-hint">יש לפנות לבעל החשבון בחברה כדי לחדש את המנוי.</p>') +
        '</div>' +
        '<button id="auth-signout-blocked" class="btn ghost">יציאה</button>' +
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
      '<h1 class="auth-title">סידור משמרות</h1>' +
      '<p class="auth-sub">שיבוץ עובדים לסניפים, בלי כפל משמרות ובלי חוסרים</p></div></div>';

    html += '<div class="auth-tabs">' +
      '<button class="auth-tab' + (signin ? ' active' : '') + '" data-auth-mode="signin">התחברות</button>' +
      '<button class="auth-tab' + (signin ? '' : ' active') + '" data-auth-mode="signup">פתיחת חשבון לעסק</button>' +
      '</div>';

    html += '<p class="auth-error hidden"></p>';

    if (signin) {
      html += '<form id="signin-form" class="auth-form">' +
        '<label>אימייל<input type="email" name="email" class="text-input" autocomplete="username" required></label>' +
        '<label>סיסמה<input type="password" name="password" class="text-input" autocomplete="current-password" required></label>' +
        '<button type="submit" class="btn primary">כניסה</button>' +
        '</form>';
    } else {
      html += '<form id="signup-form" class="auth-form">' +
        '<label>שם העסק<input type="text" name="companyName" class="text-input" required></label>' +
        '<label>השם שלך<input type="text" name="name" class="text-input" autocomplete="name"></label>' +
        '<label>אימייל<input type="email" name="email" class="text-input" autocomplete="username" required></label>' +
        '<label>סיסמה<input type="password" name="password" class="text-input" autocomplete="new-password" required>' +
        '<small>לפחות 6 תווים</small></label>' +
        '<button type="submit" class="btn primary">פתיחת חשבון</button>' +
        '<p class="auth-hint">' + Model.TRIAL_DAYS + ' ימי ניסיון ללא תשלום. לא נדרש אמצעי תשלום.</p>' +
        '</form>';
    }

    html += '</div>';
    this.gate.innerHTML = html;
  };

  var API = { AuthUI: AuthUI };
  root.ShiftAuthUI = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
