/* שרת מדומה לפיתוח: מחקה את ההתנהגות שתהיה ב-Supabase – חשבונות,
   חברות, תפקידים ובידוד מלא בין חברות – בלי להזדקק לחשבון או לרשת.

   אזהרה: זה כלי פיתוח בלבד. הסיסמאות אינן מוצפנות והבידוד נאכף בקוד
   שרץ בדפדפן. בייצור הכל עובר לשרת אמיתי עם כללי הרשאה במסד הנתונים. */
(function (root) {
  'use strict';

  /* הודעות השגיאה מהשרת המדומה מגיעות משכבת התרגום, כדי שהן יוצגו
     בשפת המשתמש בדיוק כמו שאר הממשק. */
  function t(key, params) {
    var i18n = root.I18n || (typeof require === 'function' ? require('../i18n/core.js') : null);
    if (!i18n) return key;
    try { return i18n.t(key, params); } catch (err) { return key; }
  }

  var Model = root.ShiftModel || (typeof require === 'function' ? require('./model.js') : null);

  var STORE_KEY = 'maiphone-mock-server-v1';
  var SESSION_KEY = 'maiphone-mock-session-v1';

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function newId(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }
  function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }

  /* ===== אחסון ===== */
  function createStorage(storage) {
    var memory = {};
    var api = {
      get: function (key) {
        if (storage) {
          try { var raw = storage.getItem(key); return raw ? JSON.parse(raw) : null; }
          catch (err) { return null; }
        }
        return memory[key] ? clone(memory[key]) : null;
      },
      set: function (key, value) {
        if (storage) {
          try { storage.setItem(key, JSON.stringify(value)); return; } catch (err) { /* נופל לזיכרון */ }
        }
        memory[key] = clone(value);
      },
      remove: function (key) {
        if (storage) { try { storage.removeItem(key); return; } catch (err) { /* נופל לזיכרון */ } }
        delete memory[key];
      }
    };
    return api;
  }

  function emptyDatabase() {
    return { companies: {}, users: {}, data: {}, listeners: 0 };
  }

  function MockBackend(options) {
    var opts = options || {};
    this.storage = createStorage(opts.storage);
    this.now = opts.now || function () { return new Date(); };
    this.listeners = [];
    var existing = this.storage.get(STORE_KEY);
    this.db = existing || emptyDatabase();
  }

  MockBackend.prototype._save = function () {
    this.storage.set(STORE_KEY, this.db);
  };

  MockBackend.prototype._fail = function (code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  };

  /* ===== נתוני חברה ===== */
  MockBackend.prototype._companyData = function (companyId) {
    if (!this.db.data[companyId]) {
      this.db.data[companyId] = { config: null, weeks: {} };
    }
    return this.db.data[companyId];
  };

  MockBackend.prototype._notify = function (companyId, change) {
    var self = this;
    this.listeners.forEach(function (entry) {
      if (entry.companyId !== companyId) return;   // בידוד: אין הדלפה בין חברות
      try { entry.handler(change); } catch (err) { /* מאזין תקול לא מפיל את השאר */ }
    });
  };

  /* ===== הרשמה והתחברות ===== */
  MockBackend.prototype.signUpCompany = function (input) {
    var email = normalizeEmail(input.email);
    if (!email || !input.password) {
      return Promise.reject(this._fail('invalid_input', t('server.credentialsRequired')));
    }
    if (String(input.password).length < 6) {
      return Promise.reject(this._fail('weak_password', t('server.passwordTooShort')));
    }
    if (this._findUserByEmail(email)) {
      return Promise.reject(this._fail('email_taken', t('server.emailTaken')));
    }
    if (!input.companyName || !String(input.companyName).trim()) {
      return Promise.reject(this._fail('invalid_input', t('server.companyRequired')));
    }

    var companyId = newId('co');
    var company = Model.newTrialCompany(String(input.companyName).trim(), this.now());
    company.id = companyId;
    this.db.companies[companyId] = company;

    var userId = newId('user');
    this.db.users[userId] = {
      id: userId, email: email, password: String(input.password),
      name: String(input.name || '').trim() || email,
      companyId: companyId, role: 'owner', employeeId: null, active: true,
      createdAt: this.now().toISOString()
    };

    this._companyData(companyId);
    this._save();
    return this._startSession(userId);
  };

  MockBackend.prototype._findUserByEmail = function (email) {
    var users = this.db.users;
    var keys = Object.keys(users);
    for (var i = 0; i < keys.length; i++) {
      if (users[keys[i]].email === email) return users[keys[i]];
    }
    return null;
  };

  MockBackend.prototype.signIn = function (input) {
    var user = this._findUserByEmail(normalizeEmail(input.email));
    if (!user || user.password !== String(input.password)) {
      return Promise.reject(this._fail('bad_credentials', t('server.badCredentials')));
    }
    if (!user.active) {
      return Promise.reject(this._fail('user_disabled', t('server.userInactive')));
    }
    return this._startSession(user.id);
  };

  MockBackend.prototype._startSession = function (userId) {
    this.storage.set(SESSION_KEY, { userId: userId, at: this.now().toISOString() });
    return Promise.resolve(this.session());
  };

  MockBackend.prototype.signOut = function () {
    this.storage.remove(SESSION_KEY);
    this.listeners = [];
    return Promise.resolve(null);
  };

  /* מצב ההתחברות הנוכחי, או null */
  MockBackend.prototype.session = function () {
    var stored = this.storage.get(SESSION_KEY);
    if (!stored) return null;
    var user = this.db.users[stored.userId];
    if (!user || !user.active) return null;
    var company = this.db.companies[user.companyId];
    if (!company) return null;
    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role, employeeId: user.employeeId },
      company: clone(company),
      access: Model.accessState(company, this.now())
    };
  };

  MockBackend.prototype._require = function (capability) {
    var session = this.session();
    if (!session) throw this._fail('not_signed_in', t('server.signInRequired'));
    if (capability && !Model.can(session.user.role, capability)) {
      throw this._fail('forbidden', t('server.noPermission'));
    }
    return session;
  };

  /* ===== נתונים – תמיד מוגבלים לחברה של המשתמש המחובר ===== */

  /* ההגדרות המשותפות: עובדים, סניפים וכללי שיבוץ */
  MockBackend.prototype.loadConfig = function () {
    var session = this._require();
    var data = this._companyData(session.company.id);
    return Promise.resolve(data.config ? clone(data.config) : null);
  };

  MockBackend.prototype.saveConfig = function (config) {
    var session;
    try { session = this._require('config.edit'); } catch (err) { return Promise.reject(err); }
    var data = this._companyData(session.company.id);
    data.config = clone(config);
    data.config.updatedAt = this.now().toISOString();
    this._save();
    this._notify(session.company.id, { type: 'config', config: clone(data.config) });
    return Promise.resolve(clone(data.config));
  };

  MockBackend.prototype.listWeeks = function () {
    var session = this._require();
    var weeks = this._companyData(session.company.id).weeks;
    return Promise.resolve(Object.keys(weeks).sort());
  };

  MockBackend.prototype.loadWeek = function (weekKey) {
    var session = this._require();
    var weeks = this._companyData(session.company.id).weeks;
    return Promise.resolve(weeks[weekKey] ? clone(weeks[weekKey]) : null);
  };

  MockBackend.prototype.saveWeek = function (weekKey, week) {
    var session;
    try { session = this._require('schedule.edit'); } catch (err) { return Promise.reject(err); }
    var data = this._companyData(session.company.id);
    data.weeks[weekKey] = clone(week);
    data.weeks[weekKey].updatedAt = this.now().toISOString();
    this._save();
    this._notify(session.company.id, { type: 'week', weekKey: weekKey, week: clone(data.weeks[weekKey]) });
    return Promise.resolve(clone(data.weeks[weekKey]));
  };

  /* עובד רשאי לעדכן רק את האילוצים של עצמו, ורק בשבוע שטרם פורסם */
  MockBackend.prototype.saveOwnConstraint = function (weekKey, dayIdx, constraint) {
    var session;
    try { session = this._require('constraints.editOwn'); } catch (err) { return Promise.reject(err); }
    if (!session.user.employeeId) {
      return Promise.reject(this._fail('no_employee_link', t('server.notLinked')));
    }

    var data = this._companyData(session.company.id);
    if (!data.weeks[weekKey]) {
      data.weeks[weekKey] = { constraints: {}, assignments: {}, manual: {}, holidays: {}, shabbatEnd: '', note: '' };
    }
    var week = data.weeks[weekKey];
    if (week.published && session.user.role === 'employee') {
      return Promise.reject(this._fail('week_published', t('server.weekPublished')));
    }

    var key = session.user.employeeId + '|' + dayIdx;
    if (constraint === null) {
      delete week.constraints[key];
    } else {
      var record = clone(constraint);
      record.note = String(record.note || '').slice(0, 300);
      // בקשה של עובד תמיד ממתינה לאישור מנהל, גם אם אושרה בעבר ושונתה
      record.status = 'pending';
      record.requestedAt = this.now().toISOString();
      record.managerNote = '';
      delete record.decidedAt;
      week.constraints[key] = record;
    }
    week.updatedAt = this.now().toISOString();

    this._save();
    this._notify(session.company.id, { type: 'week', weekKey: weekKey, week: clone(week) });
    return Promise.resolve(clone(week));
  };

  /* עדכון הסיבה שהעובד צירף לבקשה. אינו משנה את מה שהתבקש, ולכן
     אינו מחזיר בקשה שאושרה למצב המתנה. */
  MockBackend.prototype.saveOwnNote = function (weekKey, dayIdx, note) {
    var session;
    try { session = this._require('constraints.editOwn'); } catch (err) { return Promise.reject(err); }
    if (!session.user.employeeId) {
      return Promise.reject(this._fail('no_employee_link', t('server.notLinked')));
    }

    var data = this._companyData(session.company.id);
    var week = data.weeks[weekKey];
    var key = session.user.employeeId + '|' + dayIdx;
    if (!week || !week.constraints || !week.constraints[key]) {
      return Promise.reject(this._fail('not_found', t('server.noRequest')));
    }
    if (week.published && session.user.role === 'employee') {
      return Promise.reject(this._fail('week_published', t('server.weekPublishedShort')));
    }

    week.constraints[key].note = String(note || '').slice(0, 300);
    week.updatedAt = this.now().toISOString();
    this._save();
    this._notify(session.company.id, { type: 'week', weekKey: weekKey, week: clone(week) });
    return Promise.resolve(clone(week));
  };

  /* אישור או דחייה של בקשת אילוץ. שמור למנהל ולבעלים. */
  MockBackend.prototype.decideConstraint = function (weekKey, employeeId, dayIdx, decision, note) {
    var session;
    try { session = this._require('constraints.editAny'); } catch (err) { return Promise.reject(err); }
    if (decision !== 'approved' && decision !== 'rejected') {
      return Promise.reject(this._fail('invalid_input', t('server.badDecision')));
    }

    var data = this._companyData(session.company.id);
    var week = data.weeks[weekKey];
    var key = employeeId + '|' + dayIdx;
    if (!week || !week.constraints || !week.constraints[key]) {
      return Promise.reject(this._fail('not_found', t('server.requestNotFound')));
    }

    week.constraints[key].status = decision;
    week.constraints[key].managerNote = note || '';
    week.constraints[key].decidedAt = this.now().toISOString();
    week.constraints[key].decidedBy = session.user.id;
    week.updatedAt = this.now().toISOString();

    this._save();
    this._notify(session.company.id, { type: 'week', weekKey: weekKey, week: clone(week) });
    return Promise.resolve(clone(week));
  };

  MockBackend.prototype.publishWeek = function (weekKey, published) {
    var session;
    try { session = this._require('schedule.publish'); } catch (err) { return Promise.reject(err); }
    var data = this._companyData(session.company.id);
    if (!data.weeks[weekKey]) return Promise.reject(this._fail('not_found', t('server.weekMissing')));
    data.weeks[weekKey].published = published !== false;
    data.weeks[weekKey].updatedAt = this.now().toISOString();
    this._save();
    this._notify(session.company.id, { type: 'week', weekKey: weekKey, week: clone(data.weeks[weekKey]) });
    return Promise.resolve(clone(data.weeks[weekKey]));
  };

  /* ===== משתמשים בחברה ===== */
  MockBackend.prototype.listUsers = function () {
    var session = this._require();
    var companyId = session.company.id;
    var users = this.db.users;
    var out = [];
    Object.keys(users).forEach(function (id) {
      var user = users[id];
      if (user.companyId !== companyId) return;   // בידוד
      out.push({ id: user.id, email: user.email, name: user.name,
        role: user.role, employeeId: user.employeeId, active: user.active });
    });
    return Promise.resolve(out);
  };

  MockBackend.prototype.createUser = function (input) {
    var session;
    try { session = this._require('users.manage'); } catch (err) { return Promise.reject(err); }
    var email = normalizeEmail(input.email);
    if (!email || !input.password) {
      return Promise.reject(this._fail('invalid_input', t('server.credentialsRequired')));
    }
    if (String(input.password).length < 6) {
      return Promise.reject(this._fail('weak_password', t('server.passwordTooShort')));
    }
    if (this._findUserByEmail(email)) {
      return Promise.reject(this._fail('email_taken', t('server.emailTaken')));
    }
    var role = input.role === 'manager' ? 'manager' : 'employee';  // owner אינו ניתן להענקה
    var userId = newId('user');
    this.db.users[userId] = {
      id: userId, email: email, password: String(input.password),
      name: String(input.name || '').trim() || email,
      companyId: session.company.id, role: role,
      employeeId: input.employeeId || null, active: true,
      createdAt: this.now().toISOString()
    };
    this._save();
    var created = this.db.users[userId];
    return Promise.resolve({ id: created.id, email: created.email, name: created.name,
      role: created.role, employeeId: created.employeeId, active: created.active });
  };

  MockBackend.prototype.updateUser = function (userId, patch) {
    var session;
    try { session = this._require('users.manage'); } catch (err) { return Promise.reject(err); }
    var user = this.db.users[userId];
    if (!user || user.companyId !== session.company.id) {
      return Promise.reject(this._fail('not_found', t('server.userNotFound')));   // בידוד
    }
    if (user.role === 'owner' && (patch.role || patch.active === false)) {
      return Promise.reject(this._fail('forbidden', t('server.cannotChangeOwner')));
    }
    if (patch.role === 'manager' || patch.role === 'employee') user.role = patch.role;
    if (typeof patch.active === 'boolean') user.active = patch.active;
    if ('employeeId' in patch) user.employeeId = patch.employeeId || null;
    if (patch.name) user.name = String(patch.name).trim();
    this._save();
    return Promise.resolve({ id: user.id, email: user.email, name: user.name,
      role: user.role, employeeId: user.employeeId, active: user.active });
  };

  /* ===== מנוי ===== */
  MockBackend.prototype.setSubscription = function (patch) {
    var session;
    try { session = this._require('billing.manage'); } catch (err) { return Promise.reject(err); }
    var company = this.db.companies[session.company.id];
    if (patch.plan && Model.PLANS[patch.plan]) company.plan = patch.plan;
    if (patch.status) company.status = patch.status;
    if (patch.validUntil) company.validUntil = patch.validUntil;
    this._save();
    return Promise.resolve(clone(company));
  };

  /* ===== עדכונים חיים ===== */
  MockBackend.prototype.subscribe = function (handler) {
    var session = this.session();
    if (!session) return function () {};
    var entry = { companyId: session.company.id, handler: handler };
    this.listeners.push(entry);
    var self = this;
    return function () {
      self.listeners = self.listeners.filter(function (item) { return item !== entry; });
    };
  };

  var API = { MockBackend: MockBackend, STORE_KEY: STORE_KEY, SESSION_KEY: SESSION_KEY, newId: newId };
  root.ShiftMockBackend = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
