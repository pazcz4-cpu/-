/* מתאם לשרת אמיתי (Supabase). מממש בדיוק את אותו ממשק כמו
   MockBackend, כך שהאפליקציה אינה יודעת מול מי היא עובדת.

   אין כאן ספריות חיצוניות – Supabase הוא HTTP רגיל:
     התחברות  → /auth/v1/...
     נתונים    → /rest/v1/<טבלה>
     פונקציות  → /rest/v1/rpc/<שם>

   הבידוד בין חברות אינו נאכף כאן אלא בבסיס הנתונים (ראו
   supabase/schema.sql). הקוד הזה רץ בדפדפן ואי אפשר לסמוך עליו. */
(function (root) {
  'use strict';

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
  }

  var Model = root.ShiftModel;
  var TOKEN_KEY = 'shift-supabase-session-v1';

  function fail(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  /* תרגום שגיאות השרת להודעות שהמשתמש מבין */
  function describe(status, body) {
    var text = (body && (body.message || body.error_description || body.error || body.msg)) || '';
    var lower = String(text).toLowerCase();

    if (lower.indexOf('invalid login') !== -1 || lower.indexOf('invalid credentials') !== -1) {
      return fail('bad_credentials', t('server.badCredentials'));
    }
    if (lower.indexOf('already registered') !== -1 || lower.indexOf('already exists') !== -1 ||
        (body && body.code === '23505')) {
      return fail('email_taken', t('server.emailTaken'));
    }
    if (lower.indexOf('password') !== -1 && lower.indexOf('6') !== -1) {
      return fail('weak_password', t('server.passwordTooShort'));
    }
    if (lower.indexOf('not linked') !== -1 || lower.indexOf('staff card') !== -1) {
      return fail('no_employee_link', t('server.notLinked'));
    }
    if (lower.indexOf('already published') !== -1) {
      return fail('week_published', t('server.weekPublished'));
    }
    if (lower.indexOf('request not found') !== -1 || lower.indexOf('no request') !== -1) {
      return fail('not_found', t('server.requestNotFound'));
    }
    if (lower.indexOf('invalid decision') !== -1) {
      return fail('invalid_input', t('server.badDecision'));
    }
    if (lower.indexOf('company name') !== -1) {
      return fail('invalid_input', t('server.companyRequired'));
    }
    if (status === 401 || lower.indexOf('not signed in') !== -1) {
      return fail('not_signed_in', t('server.signInRequired'));
    }
    if (status === 403 || lower.indexOf('not allowed') !== -1 ||
        lower.indexOf('row-level security') !== -1) {
      return fail('forbidden', t('server.noPermission'));
    }
    return fail('server_error', text || ('HTTP ' + status));
  }

  /* ===== אחסון האסימונים ===== */
  function createStorage(storage) {
    var memory = {};
    return {
      get: function (key) {
        if (storage) {
          try { var raw = storage.getItem(key); return raw ? JSON.parse(raw) : null; }
          catch (err) { return null; }
        }
        return memory[key] || null;
      },
      set: function (key, value) {
        if (storage) { try { storage.setItem(key, JSON.stringify(value)); return; } catch (err) { /* נופל לזיכרון */ } }
        memory[key] = value;
      },
      remove: function (key) {
        if (storage) { try { storage.removeItem(key); return; } catch (err) { /* נופל לזיכרון */ } }
        delete memory[key];
      }
    };
  }

  function SupabaseBackend(options) {
    var opts = options || {};
    if (!opts.url || !opts.anonKey) {
      throw new Error('SupabaseBackend: נדרשים url ו-anonKey');
    }
    this.url = String(opts.url).replace(/\/+$/, '');
    this.anonKey = opts.anonKey;
    /* נקודת הקצה שיוצרת משתמשים. רצה בשרת, כי יצירת משתמש דורשת
       מפתח שאסור שיגיע לדפדפן. */
    this.adminEndpoint = opts.adminEndpoint || '/api/create-user';
    this.storage = createStorage(opts.storage);
    this.fetchImpl = opts.fetch || (typeof fetch === 'function' ? fetch.bind(root) : null);
    this.pollMs = opts.pollMs || 10000;
    this.now = opts.now || function () { return new Date(); };

    this.tokens = this.storage.get(TOKEN_KEY);
    this._session = null;
    this.listeners = [];
    this.pollTimer = null;
    this._seen = {};
    /* הסבב הראשון רק רושם את המצב הקיים. אחריו כל שינוי – כולל
       שבוע חדש שנוצר במכשיר אחר – נחשב עדכון ומוכרז למאזינים. */
    this._primed = false;
  }

  /* ===== שכבת HTTP ===== */

  SupabaseBackend.prototype._expired = function () {
    if (!this.tokens || !this.tokens.expires_at) return false;
    /* חידוש חצי דקה לפני הזמן, כדי לא להיתפס באמצע בקשה */
    return this.tokens.expires_at * 1000 - 30000 < Date.now();
  };

  SupabaseBackend.prototype._storeTokens = function (data) {
    if (!data || !data.access_token) return null;
    this.tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at ||
        Math.floor(Date.now() / 1000) + (data.expires_in || 3600)
    };
    this.storage.set(TOKEN_KEY, this.tokens);
    return this.tokens;
  };

  SupabaseBackend.prototype._clearTokens = function () {
    this.tokens = null;
    this._session = null;
    this.storage.remove(TOKEN_KEY);
  };

  SupabaseBackend.prototype._raw = function (path, options) {
    var self = this;
    var opts = options || {};
    var headers = { apikey: this.anonKey };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.token !== null) {
      var token = (this.tokens && this.tokens.access_token) || this.anonKey;
      headers.Authorization = 'Bearer ' + token;
    }
    Object.keys(opts.headers || {}).forEach(function (key) { headers[key] = opts.headers[key]; });

    return this.fetchImpl(this.url + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then(function (response) {
      return response.text().then(function (text) {
        var body = null;
        if (text) { try { body = JSON.parse(text); } catch (err) { body = { message: text }; } }
        if (!response.ok) { throw describe(response.status, body); }
        return body;
      });
    }, function (err) {
      /* כשל רשת אמיתי – לא שגיאת שרת */
      throw fail('network', (err && err.message) || 'network error');
    });
  };

  /* חידוש אסימון פג לפני כל בקשה מוגנת */
  SupabaseBackend.prototype._refresh = function () {
    var self = this;
    if (!this.tokens || !this.tokens.refresh_token) {
      return Promise.reject(fail('not_signed_in', t('server.signInRequired')));
    }
    return this._raw('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', token: null, body: { refresh_token: this.tokens.refresh_token }
    }).then(function (data) {
      self._storeTokens(data);
      return data;
    }, function (err) {
      self._clearTokens();
      throw err;
    });
  };

  SupabaseBackend.prototype._request = function (path, options) {
    var self = this;
    if (!this.tokens) {
      return Promise.reject(fail('not_signed_in', t('server.signInRequired')));
    }
    var run = this._expired() ? this._refresh() : Promise.resolve();
    return run.then(function () { return self._raw(path, options); });
  };

  /* PostgREST: Prefer=return=representation מחזיר את השורה שנכתבה */
  SupabaseBackend.prototype._rest = function (path, options) {
    var opts = options || {};
    return this._request('/rest/v1' + path, {
      method: opts.method,
      body: opts.body,
      headers: Object.assign(
        { Prefer: opts.prefer || 'return=representation' }, opts.headers || {})
    });
  };

  SupabaseBackend.prototype._rpc = function (name, args) {
    return this._request('/rest/v1/rpc/' + name, { method: 'POST', body: args || {} });
  };

  /* ===== זהות המשתמש ===== */

  SupabaseBackend.prototype._userId = function () {
    if (!this.tokens || !this.tokens.access_token) return null;
    try {
      var payload = this.tokens.access_token.split('.')[1];
      var json = root.atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decodeURIComponent(escape(json))).sub || null;
    } catch (err) { return null; }
  };

  /* טוען את פרופיל המשתמש ואת החברה, ובונה את אובייקט ההתחברות
     שהאפליקציה מצפה לו. */
  SupabaseBackend.prototype._loadSession = function () {
    var self = this;
    var userId = this._userId();
    if (!userId) { this._clearTokens(); return Promise.resolve(null); }

    return this._rest('/company_users?id=eq.' + encodeURIComponent(userId) +
      '&select=id,email,name,role,employee_id,active,company_id')
      .then(function (rows) {
        var profile = rows && rows[0];
        if (!profile || !profile.active) { self._session = null; return null; }
        return self._rest('/companies?id=eq.' + encodeURIComponent(profile.company_id) +
          '&select=id,name,plan,status,valid_until,created_at')
          .then(function (companies) {
            var row = companies && companies[0];
            if (!row) { self._session = null; return null; }
            var company = {
              id: row.id, name: row.name, plan: row.plan, status: row.status,
              validUntil: row.valid_until, createdAt: row.created_at
            };
            self._session = {
              user: {
                id: profile.id, email: profile.email, name: profile.name,
                role: profile.role, employeeId: profile.employee_id
              },
              company: company,
              access: Model.accessState(company, self.now())
            };
            return self._session;
          });
      });
  };

  /* נקרא פעם אחת בעליית העמוד, לפני שמסך ההתחברות מצויר */
  SupabaseBackend.prototype.restore = function () {
    var self = this;
    if (!this.tokens) return Promise.resolve(null);
    var run = this._expired() ? this._refresh() : Promise.resolve();
    return run.then(function () { return self._loadSession(); })
      .catch(function () { self._clearTokens(); return null; });
  };

  /* ===== הרשמה והתחברות ===== */

  SupabaseBackend.prototype.signUpCompany = function (input) {
    var self = this;
    var email = String(input.email || '').trim().toLowerCase();
    var password = String(input.password || '');
    var companyName = String(input.companyName || '').trim();

    if (!email || !password) {
      return Promise.reject(fail('invalid_input', t('server.credentialsRequired')));
    }
    if (password.length < 6) {
      return Promise.reject(fail('weak_password', t('server.passwordTooShort')));
    }
    if (!companyName) {
      return Promise.reject(fail('invalid_input', t('server.companyRequired')));
    }

    return this._raw('/auth/v1/signup', {
      method: 'POST', token: null,
      body: { email: email, password: password, data: { name: input.name || '' } }
    }).then(function (data) {
      if (!data || !data.access_token) {
        /* הפרויקט מוגדר לאמת אימייל לפני כניסה – אין עדיין אסימון */
        throw fail('confirm_email', t('server.confirmEmail'));
      }
      self._storeTokens(data);
      return self._rpc('create_company', {
        p_name: companyName,
        p_user_name: String(input.name || '').trim(),
        p_trial_days: Model.TRIAL_DAYS
      });
    }).then(function () {
      return self._loadSession();
    });
  };

  SupabaseBackend.prototype.signIn = function (input) {
    var self = this;
    var email = String(input.email || '').trim().toLowerCase();
    if (!email || !input.password) {
      return Promise.reject(fail('invalid_input', t('server.credentialsRequired')));
    }
    return this._raw('/auth/v1/token?grant_type=password', {
      method: 'POST', token: null,
      body: { email: email, password: String(input.password) }
    }).then(function (data) {
      self._storeTokens(data);
      return self._loadSession();
    }).then(function (session) {
      if (!session) {
        self._clearTokens();
        throw fail('user_disabled', t('server.userInactive'));
      }
      return session;
    });
  };

  SupabaseBackend.prototype.signOut = function () {
    var self = this;
    this._stopPolling();
    this.listeners = [];
    this._seen = {};
    this._primed = false;
    var tokens = this.tokens;
    this._clearTokens();
    if (!tokens) return Promise.resolve(null);
    /* יציאה מקומית מספיקה גם אם השרת לא נענה */
    return this._raw('/auth/v1/logout', {
      method: 'POST', headers: { Authorization: 'Bearer ' + tokens.access_token }
    }).then(function () { return null; }, function () { return null; });
  };

  /* סינכרוני בכוונה – האפליקציה קוראת לזה בתוך הרינדור */
  SupabaseBackend.prototype.session = function () {
    if (!this._session) return null;
    /* מצב המנוי נגזר מהתאריך, ולכן מחושב מחדש בכל קריאה */
    this._session.access = Model.accessState(this._session.company, this.now());
    return this._session;
  };

  SupabaseBackend.prototype._companyId = function () {
    var session = this.session();
    if (!session) throw fail('not_signed_in', t('server.signInRequired'));
    return session.company.id;
  };

  /* ===== הגדרות החברה ===== */

  SupabaseBackend.prototype.loadConfig = function () {
    var companyId;
    try { companyId = this._companyId(); } catch (err) { return Promise.reject(err); }
    return this._rest('/company_configs?company_id=eq.' + companyId + '&select=config')
      .then(function (rows) {
        var config = rows && rows[0] && rows[0].config;
        /* שורה ריקה נחשבת "אין הגדרות", כדי שהאפליקציה תיצור ברירות מחדל */
        return config && Object.keys(config).length ? config : null;
      });
  };

  SupabaseBackend.prototype.saveConfig = function (config) {
    var companyId;
    try { companyId = this._companyId(); } catch (err) { return Promise.reject(err); }
    return this._rest('/company_configs', {
      method: 'POST',
      prefer: 'return=representation,resolution=merge-duplicates',
      body: [{ company_id: companyId, config: config, updated_at: new Date().toISOString() }]
    }).then(function (rows) { return (rows && rows[0] && rows[0].config) || config; });
  };

  /* ===== שבועות ===== */

  function weekOf(row) {
    if (!row) return null;
    var week = row.week || {};
    week.published = !!row.published;
    week.updatedAt = row.updated_at;
    return week;
  }

  SupabaseBackend.prototype.listWeeks = function () {
    var companyId;
    try { companyId = this._companyId(); } catch (err) { return Promise.reject(err); }
    return this._rest('/company_weeks?company_id=eq.' + companyId +
      '&select=week_key&order=week_key.asc')
      .then(function (rows) { return (rows || []).map(function (r) { return r.week_key; }); });
  };

  SupabaseBackend.prototype.loadWeek = function (weekKey) {
    var companyId;
    try { companyId = this._companyId(); } catch (err) { return Promise.reject(err); }
    return this._rest('/company_weeks?company_id=eq.' + companyId +
      '&week_key=eq.' + encodeURIComponent(weekKey) + '&select=week,published,updated_at')
      .then(function (rows) { return weekOf(rows && rows[0]); });
  };

  SupabaseBackend.prototype.saveWeek = function (weekKey, week) {
    var companyId;
    try { companyId = this._companyId(); } catch (err) { return Promise.reject(err); }
    var payload = JSON.parse(JSON.stringify(week || {}));
    var published = !!payload.published;
    delete payload.published;
    delete payload.updatedAt;

    return this._rest('/company_weeks', {
      method: 'POST',
      prefer: 'return=representation,resolution=merge-duplicates',
      body: [{
        company_id: companyId, week_key: weekKey, week: payload,
        published: published, updated_at: new Date().toISOString()
      }]
    }).then(function (rows) { return weekOf(rows && rows[0]); });
  };

  SupabaseBackend.prototype.saveOwnConstraint = function (weekKey, dayIdx, constraint) {
    return this._rpc('save_own_constraint', {
      p_week_key: weekKey, p_day_idx: Number(dayIdx), p_constraint: constraint
    }).then(weekOf);
  };

  SupabaseBackend.prototype.saveOwnNote = function (weekKey, dayIdx, note) {
    return this._rpc('save_own_note', {
      p_week_key: weekKey, p_day_idx: Number(dayIdx), p_note: String(note || '')
    }).then(weekOf);
  };

  SupabaseBackend.prototype.decideConstraint = function (weekKey, employeeId, dayIdx, decision, note) {
    return this._rpc('decide_constraint', {
      p_week_key: weekKey, p_employee_id: employeeId, p_day_idx: Number(dayIdx),
      p_decision: decision, p_note: String(note || '')
    }).then(weekOf);
  };

  SupabaseBackend.prototype.publishWeek = function (weekKey, published) {
    var companyId;
    try { companyId = this._companyId(); } catch (err) { return Promise.reject(err); }
    return this._rest('/company_weeks?company_id=eq.' + companyId +
      '&week_key=eq.' + encodeURIComponent(weekKey), {
      method: 'PATCH',
      body: { published: published !== false, updated_at: new Date().toISOString() }
    }).then(function (rows) {
      if (!rows || !rows.length) throw fail('not_found', t('server.weekMissing'));
      return weekOf(rows[0]);
    });
  };

  /* ===== משתמשים ===== */

  SupabaseBackend.prototype.listUsers = function () {
    var companyId;
    try { companyId = this._companyId(); } catch (err) { return Promise.reject(err); }
    return this._rest('/company_users?company_id=eq.' + companyId +
      '&select=id,email,name,role,employee_id,active&order=created_at.asc')
      .then(function (rows) {
        return (rows || []).map(function (row) {
          return {
            id: row.id, email: row.email, name: row.name,
            role: row.role, employeeId: row.employee_id, active: row.active
          };
        });
      });
  };

  /* יצירת משתמש דורשת מפתח ניהול, ולכן עוברת דרך השרת */
  SupabaseBackend.prototype.createUser = function (input) {
    var self = this;
    if (!this.tokens) {
      return Promise.reject(fail('not_signed_in', t('server.signInRequired')));
    }
    var run = this._expired() ? this._refresh() : Promise.resolve();
    return run.then(function () {
      return self.fetchImpl(self.adminEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + self.tokens.access_token
        },
        body: JSON.stringify({
          email: String(input.email || '').trim().toLowerCase(),
          password: String(input.password || ''),
          name: String(input.name || '').trim(),
          role: input.role === 'manager' ? 'manager' : 'employee',
          employeeId: input.employeeId || null
        })
      });
    }).then(function (response) {
      return response.text().then(function (text) {
        var body = null;
        if (text) { try { body = JSON.parse(text); } catch (err) { body = { message: text }; } }
        if (!response.ok) throw describe(response.status, body);
        return body;
      });
    }, function (err) {
      if (err && err.code) throw err;
      throw fail('network', (err && err.message) || 'network error');
    });
  };

  SupabaseBackend.prototype.updateUser = function (userId, patch) {
    var companyId;
    try { companyId = this._companyId(); } catch (err) { return Promise.reject(err); }
    var body = {};
    if (patch.role === 'manager' || patch.role === 'employee') body.role = patch.role;
    if (typeof patch.active === 'boolean') body.active = patch.active;
    if ('employeeId' in patch) body.employee_id = patch.employeeId || null;
    if (patch.name) body.name = String(patch.name).trim();
    if (!Object.keys(body).length) return Promise.resolve(null);

    /* בעלים אינו ניתן לשינוי – נאכף גם כאן וגם בכללי ההרשאה */
    return this._rest('/company_users?id=eq.' + encodeURIComponent(userId) +
      '&company_id=eq.' + companyId + '&role=neq.owner', {
      method: 'PATCH', body: body
    }).then(function (rows) {
      if (!rows || !rows.length) throw fail('not_found', t('server.userNotFound'));
      var row = rows[0];
      return {
        id: row.id, email: row.email, name: row.name,
        role: row.role, employeeId: row.employee_id, active: row.active
      };
    });
  };

  /* ===== מנוי ===== */

  SupabaseBackend.prototype.setSubscription = function (patch) {
    var self = this;
    var companyId;
    try { companyId = this._companyId(); } catch (err) { return Promise.reject(err); }
    var body = {};
    if (patch.plan && Model.PLANS[patch.plan]) body.plan = patch.plan;
    if (patch.status) body.status = patch.status;
    if (patch.validUntil) body.valid_until = patch.validUntil;

    return this._rest('/companies?id=eq.' + companyId, { method: 'PATCH', body: body })
      .then(function (rows) {
        var row = rows && rows[0];
        if (!row) throw fail('forbidden', t('server.noPermission'));
        var company = {
          id: row.id, name: row.name, plan: row.plan, status: row.status,
          validUntil: row.valid_until, createdAt: row.created_at
        };
        if (self._session) self._session.company = company;
        return company;
      });
  };

  /* ===== עדכונים חיים =====
     נעשה בתשאול תקופתי ולא ב-WebSocket: פשוט, עמיד לניתוקים, ודי
     מהיר לצוות של עשרות אנשים. עולות רק שורות ששונו. */

  SupabaseBackend.prototype._stopPolling = function () {
    if (this.pollTimer) { root.clearInterval(this.pollTimer); this.pollTimer = null; }
  };

  SupabaseBackend.prototype._emit = function (change) {
    this.listeners.forEach(function (handler) {
      try { handler(change); } catch (err) { /* מאזין תקול לא מפיל את השאר */ }
    });
  };

  SupabaseBackend.prototype._poll = function () {
    var self = this;
    var session = this.session();
    if (!session) return Promise.resolve();
    var companyId = session.company.id;
    var priming = !this._primed;

    var weeks = this._rest('/company_weeks?company_id=eq.' + companyId +
      '&select=week_key,updated_at').then(function (rows) {
      var changed = (rows || []).filter(function (row) {
        return self._seen['week:' + row.week_key] !== row.updated_at;
      });
      return changed.reduce(function (chain, row) {
        return chain.then(function () {
          self._seen['week:' + row.week_key] = row.updated_at;
          if (priming) return null;
          return self.loadWeek(row.week_key).then(function (week) {
            if (week) self._emit({ type: 'week', weekKey: row.week_key, week: week });
          });
        });
      }, Promise.resolve());
    });

    var config = this._rest('/company_configs?company_id=eq.' + companyId +
      '&select=updated_at').then(function (rows) {
      var stamp = rows && rows[0] && rows[0].updated_at;
      if (!stamp || self._seen.config === stamp) return null;
      self._seen.config = stamp;
      if (priming) return null;
      return self.loadConfig().then(function (loaded) {
        if (loaded) self._emit({ type: 'config', config: loaded });
      });
    });

    return Promise.all([weeks, config]).then(function () {
      self._primed = true;
    }, function () { /* ניתוק זמני – ננסה שוב בסבב הבא, ובלי לסמן שהתחלנו */ });
  };

  SupabaseBackend.prototype.subscribe = function (handler) {
    var self = this;
    if (!this.session()) return function () {};
    this.listeners.push(handler);

    if (!this.pollTimer) {
      this._poll();   // סבב ראשון רושם את המצב הקיים
      this.pollTimer = root.setInterval(function () { self._poll(); }, this.pollMs);
    }

    return function () {
      self.listeners = self.listeners.filter(function (item) { return item !== handler; });
      if (!self.listeners.length) self._stopPolling();
    };
  };

  var API = { SupabaseBackend: SupabaseBackend, TOKEN_KEY: TOKEN_KEY };
  root.ShiftSupabase = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
