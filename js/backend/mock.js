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
  /* כללי האילוצים יושבים ב-Store, כדי שהשרת המדומה והמסך יסכימו
     על אותה ספירה בדיוק. */
  var Store = root.ShiftStore || (typeof require === 'function' ? require('../store.js') : null);

  var STORE_KEY = 'maiphone-mock-server-v1';
  var SESSION_KEY = 'maiphone-mock-session-v1';
  /* קישור מהדואר שממתין לטיפול. בשרת האמיתי הוא יושב ב-URL ולכן
     שורד את הניווט; כאן הוא נשמר כדי שיישרוד רענון באותו אופן. */
  var PENDING_KEY = 'maiphone-mock-pending-v1';

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
    /* משתמש שהוזמן וטרם קבע סיסמה: אין לו סיסמה שאפשר לנחש,
       וההודעה מפנה אותו לקישור במקום להאשים אותו בטעות. */
    if (user && !user.password) {
      return Promise.reject(this._fail('invite_pending', t('server.invitePending')));
    }
    if (!user || user.password !== String(input.password)) {
      return Promise.reject(this._fail('bad_credentials', t('server.badCredentials')));
    }
    if (!user.active) {
      return Promise.reject(this._fail('user_disabled', t('server.userInactive')));
    }
    return this._startSession(user.id);
  };

  /* ===== איפוס סיסמה והזמנות =====

     בשרת האמיתי הקישור מגיע בדואר ומחזיר את הלקוח לאפליקציה עם
     אסימון. כאן אין דואר, ולכן הבקשה נרשמת, ו-followLink מדמה את
     הלחיצה על הקישור – כך שאפשר לבדוק את המסכים מקצה לקצה. */
  MockBackend.prototype.requestPasswordReset = function (email) {
    var address = normalizeEmail(email);
    if (!address) {
      return Promise.reject(this._fail('invalid_input', t('server.emailRequired')));
    }
    var user = this._findUserByEmail(address);
    /* התשובה זהה גם כשהכתובת אינה קיימת: אחרת המסך הזה מגלה
       למי שמנסה מי רשום למערכת. */
    if (user) {
      this.db.resets = this.db.resets || {};
      this.db.resets[address] = { at: this.now().toISOString(), userId: user.id };
      this._save();
    }
    return Promise.resolve(true);
  };

  /* מדמה לחיצה על הקישור שנשלח בדואר */
  MockBackend.prototype.followLink = function (email, type) {
    var user = this._findUserByEmail(normalizeEmail(email));
    if (!user) return false;
    this.storage.set(PENDING_KEY, { type: type || 'recovery', userId: user.id });
    return true;
  };

  MockBackend.prototype._pending = function () {
    return this.storage.get(PENDING_KEY) || null;
  };

  MockBackend.prototype.adoptUrlTokens = function () {
    var pending = this._pending();
    return pending ? pending.type : null;
  };

  MockBackend.prototype.pendingAuthAction = function () {
    var pending = this._pending();
    return pending ? pending.type : null;
  };

  MockBackend.prototype.clearPendingAuthAction = function () {
    this.storage.remove(PENDING_KEY);
  };

  MockBackend.prototype.restore = function () {
    return Promise.resolve(this.session());
  };

  MockBackend.prototype.takeLinkError = function () { return ''; };

  MockBackend.prototype.setPassword = function (password) {
    var next = String(password || '');
    if (next.length < 6) {
      return Promise.reject(this._fail('weak_password', t('server.passwordTooShort')));
    }
    var pending = this._pending();
    var session = this.session();
    var userId = (pending && pending.userId) || (session && session.user.id);
    var user = userId && this.db.users[userId];
    if (!user) {
      return Promise.reject(this._fail('link_expired', t('server.linkExpired')));
    }
    user.password = next;
    this._save();
    this.clearPendingAuthAction();
    return this._startSession(user.id);
  };

  MockBackend.prototype._startSession = function (userId) {
    /* "הצטרף" נרשם בכניסה הראשונה בפועל, כמו בשרת האמיתי */
    var user = this.db.users[userId];
    if (user && !user.joinedAt) { user.joinedAt = this.now().toISOString(); this._save(); }
    this.storage.set(SESSION_KEY, { userId: userId, at: this.now().toISOString() });
    return Promise.resolve(this.session());
  };

  MockBackend.prototype.signOut = function () {
    this.storage.remove(SESSION_KEY);
    this.listeners = [];
    return Promise.resolve(null);
  };

  /* מצב ההתחברות הנוכחי, או null */
  /* שרת מדומה שיושב בדפדפן: יש כאן תפקידים והרשאות, אבל אין ענן.
     המסך חייב להמשיך לומר "נשמר במכשיר הזה". */
  MockBackend.prototype.isCloud = false;

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

    /* תקרת הבקשות נאכפת כאן ולא רק במסך: מי שיפתח את כלי הפיתוח
       יוכל אחרת לשלוח בקשה שלישית כשהמנהל התיר שתיים. מנהל אינו
       מוגבל – הוא מתקן, לא מבקש. */
    if (constraint !== null && session.user.role === 'employee') {
      var settings = (data.config && data.config.settings) || {};
      var over = Store.overConstraintLimit({ settings: settings }, week,
        session.user.employeeId, dayIdx, constraint);
      if (over) {
        var cap = Store.constraintLimitSettings({ settings: settings }).max;
        return Promise.reject(this._fail('constraint_limit',
          t('server.constraintLimit', { max: cap })));
      }
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
  function publicUser(user) {
    return { id: user.id, email: user.email, name: user.name,
      role: user.role, employeeId: user.employeeId, active: user.active,
      invitedAt: user.invitedAt || null, joinedAt: user.joinedAt || null };
  }

  MockBackend.prototype.listUsers = function () {
    var session = this._require();
    var companyId = session.company.id;
    var users = this.db.users;
    var out = [];
    Object.keys(users).forEach(function (id) {
      var user = users[id];
      if (user.companyId !== companyId) return;   // בידוד
      out.push(publicUser(user));
    });
    return Promise.resolve(out);
  };

  MockBackend.prototype.createUser = function (input) {
    var session;
    try { session = this._require('users.manage'); } catch (err) { return Promise.reject(err); }
    var email = normalizeEmail(input.email);
    if (!email) {
      return Promise.reject(this._fail('invalid_input', t('server.emailRequired')));
    }
    /* ברירת המחדל היא הזמנה: המשתמש נוצר בלי סיסמה ומקבל קישור.
       סיסמה מפורשת נתמכת כמסלול חילופי. */
    var password = input.password ? String(input.password) : '';
    if (password && password.length < 6) {
      return Promise.reject(this._fail('weak_password', t('server.passwordTooShort')));
    }
    if (this._findUserByEmail(email)) {
      return Promise.reject(this._fail('email_taken', t('server.emailTaken')));
    }
    var role = input.role === 'manager' ? 'manager' : 'employee';  // owner אינו ניתן להענקה
    var userId = newId('user');
    this.db.users[userId] = {
      id: userId, email: email, password: password,
      name: String(input.name || '').trim() || email,
      companyId: session.company.id, role: role,
      employeeId: input.employeeId || null, active: true,
      createdAt: this.now().toISOString(),
      /* הזמנה שנשלחה מקבלת תאריך. משתמש שנוצר עם סיסמה לא הוזמן
         כלל – ולכן אין לו סטטוס הזמנה, ולא ממציאים לו אחד. */
      invitedAt: password ? null : this.now().toISOString(),
      joinedAt: null
    };
    this._save();
    var created = this.db.users[userId];
    var out = publicUser(created);
    out.invited = !password;
    return Promise.resolve(out);
  };

  /* שליחת פרטי כניסה. אין כאן שרת דואר – הסיסמה נקבעת והשליחה
     נרשמת, כדי שהמסך והבדיקות יעברו את אותו מסלול כמו באמת. */
  MockBackend.prototype.sendEmployeeAccess = function (input) {
    var session;
    try { session = this._require('users.manage'); } catch (err) { return Promise.reject(err); }
    var data = input || {};
    var email = normalizeEmail(data.email);
    if (!email) {
      return Promise.reject(this._fail('invalid_input', t('server.emailRequired')));
    }
    var existing = this._findUserByEmail(email);
    if (existing && existing.companyId !== session.company.id) {
      return Promise.reject(this._fail('email_taken', t('server.emailTaken')));   // בידוד
    }
    if (existing && existing.role === 'owner') {
      return Promise.reject(this._fail('forbidden', t('server.cannotChangeOwner')));
    }
    var now = this.now().toISOString();
    var password = 'pw-' + Math.random().toString(36).slice(2, 10);
    var created = false;
    var user = existing;
    if (!user) {
      var userId = newId('user');
      user = this.db.users[userId] = {
        id: userId, email: email, password: password,
        name: String(data.name || '').trim() || email,
        companyId: session.company.id,
        role: data.role === 'manager' ? 'manager' : 'employee',
        employeeId: data.employeeId || null, active: true,
        createdAt: now, invitedAt: now, joinedAt: null
      };
      created = true;
    } else {
      user.password = password;
      if (data.employeeId && !user.employeeId) user.employeeId = data.employeeId;
      user.invitedAt = now;
    }
    this._save();
    var out = publicUser(user);
    out.created = created;
    out.sent = true;
    return Promise.resolve(out);
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
    return Promise.resolve(publicUser(user));
  };

  /* שליחה חוזרת: אותו קישור לקביעת סיסמה, ושעון התוקף מתאפס. */
  MockBackend.prototype.resendInvite = function (user) {
    var self = this;
    var session;
    try { session = this._require('users.manage'); } catch (err) { return Promise.reject(err); }
    var row = user && this.db.users[user.id];
    if (row && row.companyId !== session.company.id) row = null;   // בידוד
    return this.requestPasswordReset((user && user.email) || (row && row.email))
      .then(function () {
        if (!row) return null;
        row.invitedAt = self.now().toISOString();
        self._save();
        return publicUser(row);
      });
  };

  /* ביטול הזמנה: מוחק משתמש שעוד לא נכנס. מי שכבר נכנס אינו
     הזמנה תלויה – אותו מנטרלים דרך התיבה "פעיל". */
  MockBackend.prototype.cancelInvite = function (userId) {
    var session;
    try { session = this._require('users.manage'); } catch (err) { return Promise.reject(err); }
    var user = this.db.users[userId];
    if (!user || user.companyId !== session.company.id) {
      return Promise.reject(this._fail('not_found', t('server.userNotFound')));   // בידוד
    }
    if (!Model.canCancelInvite(user, this.now())) {
      return Promise.reject(this._fail('forbidden', t('server.inviteNotPending')));
    }
    delete this.db.users[userId];
    this._save();
    return Promise.resolve({ id: userId, cancelled: true });
  };

  /* ===== זהות: השם שלי, ושם העסק ===== */

  /* כל משתמש רשאי לשנות את השם שלו – ורק אותו. אין כאן userId,
     ולכן אי אפשר לכוון את הפעולה לשורה של מישהו אחר. התפקיד
     והשיוך לכרטיס העובד אינם נוגעים בה. */
  MockBackend.prototype.saveOwnName = function (name) {
    var session;
    try { session = this._require(); } catch (err) { return Promise.reject(err); }
    var clean = String(name || '').trim();
    if (!clean) return Promise.reject(this._fail('invalid', t('server.nameRequired')));
    var user = this.db.users[session.user.id];
    if (!user) return Promise.reject(this._fail('not_found', t('server.userNotFound')));
    user.name = clean.slice(0, 80);
    this._save();
    return Promise.resolve(publicUser(user));
  };

  /* שם העסק הוא השם המסחרי: מה שהעובדים רואים ומה שמופיע
     במיילים אליהם. בהרשמה נשמר לא פעם שם רשם החברות, ובלי
     האפשרות הזו הוא היה נשאר על המסך לתמיד. הבעלים בלבד. */
  MockBackend.prototype.renameCompany = function (name) {
    var session;
    try { session = this._require('company.rename'); } catch (err) { return Promise.reject(err); }
    var clean = String(name || '').trim();
    if (!clean) return Promise.reject(this._fail('invalid', t('server.companyNameRequired')));
    var company = this.db.companies[session.company.id];
    if (!company) return Promise.reject(this._fail('not_found', t('server.userNotFound')));
    company.name = clean.slice(0, 120);
    this._save();
    return Promise.resolve(clone(company));
  };

  /* ===== מנוי ===== */
  MockBackend.prototype.setSubscription = function (patch) {
    var session;
    try { session = this._require('billing.manage'); } catch (err) { return Promise.reject(err); }
    var company = this.db.companies[session.company.id];
    if (patch.plan && Model.PLANS[patch.plan]) company.plan = patch.plan;
    if (patch.status) company.status = patch.status;
    if (patch.validUntil) company.validUntil = patch.validUntil;
    /* פרטי הכרטיס אצל הספק. בשרת אמיתי אלה נכתבים רק בתגובה
       ל-webhook; כאן זה מדומה, לצורך הדגמה ובדיקות. */
    if ('billingProvider' in patch) company.billingProvider = patch.billingProvider;
    if ('billingCustomerId' in patch) company.billingCustomerId = patch.billingCustomerId;
    if ('billingSubscriptionId' in patch) company.billingSubscriptionId = patch.billingSubscriptionId;
    if ('cancelAtPeriodEnd' in patch) company.cancelAtPeriodEnd = !!patch.cancelAtPeriodEnd;
    this._save();
    return Promise.resolve(clone(company));
  };

  /* ===== עדכונים חיים ===== */
  /* ===== קריאות שירות ===== */

  MockBackend.prototype.listTickets = function () {
    var session;
    try { session = this._require(); } catch (err) { return Promise.reject(err); }
    var companyId = session.company.id;
    var all = this.db.tickets || {};
    var out = Object.keys(all).map(function (id) { return all[id]; })
      .filter(function (ticket) { return ticket.companyId === companyId; })
      .sort(function (a, b) { return b.createdAt < a.createdAt ? -1 : 1; })
      .map(function (ticket) {
        return {
          id: ticket.id, kind: ticket.kind, subject: ticket.subject,
          body: ticket.body, status: ticket.status, reply: ticket.reply || null,
          createdAt: ticket.createdAt
        };
      });
    return Promise.resolve(out);
  };

  MockBackend.prototype.createTicket = function (input) {
    var session;
    try { session = this._require(); } catch (err) { return Promise.reject(err); }
    var ticket = Model.normalizeTicket(input);
    if (ticket.error) return Promise.reject(ticket.error);

    if (!this.db.tickets) this.db.tickets = {};
    var id = 'ticket-' + (Object.keys(this.db.tickets).length + 1) + '-' + Date.now();
    var row = {
      id: id, companyId: session.company.id, createdBy: session.user.id,
      kind: ticket.kind, subject: ticket.subject, body: ticket.body,
      status: 'open', reply: null, createdAt: new Date().toISOString()
    };
    this.db.tickets[id] = row;
    this._save();
    return Promise.resolve({
      id: row.id, kind: row.kind, subject: row.subject, body: row.body,
      status: row.status, reply: null, createdAt: row.createdAt
    });
  };

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
