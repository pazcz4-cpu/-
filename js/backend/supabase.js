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
    /* Supabase אומר "has already been registered" – עם מילה
       באמצע. חיפוש של "already registered" מפספס אותה בדיוק,
       והלקוח מקבל את הנוסח האנגלי הגולמי במקום הודעה בעברית. */
    if (/already\s+(been\s+)?registered/.test(lower) || lower.indexOf('already exists') !== -1 ||
        lower.indexOf('email_exists') !== -1 || (body && body.code === '23505')) {
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
    if (lower.indexOf('deadline has passed') !== -1) {
      return fail('deadline_passed', t('server.deadlinePassed'));
    }
    /* המספר מגיע בהודעה מהפונקציה, ולכן המסך אומר "עד 2 בקשות"
       ולא "הגעת לתקרה" – ההבדל הוא בין הודעה שמסבירה מה לעשות
       לבין הודעה שרק מודיעה על כישלון. */
    if (lower.indexOf('constraint limit reached') !== -1) {
      var max = (String(text).match(/(\d+)\s*$/) || [])[1];
      return fail('constraint_limit', t('server.constraintLimit', { max: max || '' }));
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
    /* חסימת קצב של שליחת מיילים. זו התשובה היחידה שבה כדאי לומר
       ללקוח "נסו בעוד רגע" במקום להציג כשל כללי. */
    if (status === 429 || lower.indexOf('rate limit') !== -1 ||
        lower.indexOf('too many requests') !== -1) {
      return fail('rate_limited', t('server.rateLimited'));
    }
    if (lower.indexOf('expired') !== -1 || lower.indexOf('invalid token') !== -1 ||
        lower.indexOf('already been used') !== -1) {
      return fail('link_expired', t('server.linkExpired'));
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

  /* משאיר רק את מקור הפרויקט: בלי לוכסן בסוף, ובלי הסיומות
     שהמסך של Supabase מציג (/rest/v1, /auth/v1, /storage/v1). */
  function normalizeUrl(value) {
    return String(value || '')
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/(rest|auth|storage|realtime|functions)\/v\d+$/i, '')
      .replace(/\/+$/, '');
  }

  function SupabaseBackend(options) {
    var opts = options || {};
    if (!opts.url || !opts.anonKey) {
      throw new Error('SupabaseBackend: נדרשים url ו-anonKey');
    }
    /* המסך של Supabase מציג את הכתובת כ-API URL, כלומר עם
       /rest/v1/ בסוף, וזו הכתובת שמועתקת בפועל. הקוד מוסיף את
       /rest/v1 ואת /auth/v1 בעצמו, ולכן הדבקה כזו מייצרת
       "Invalid path specified in request URL" בכל בקשה – שגיאה
       שאומרת כלום למי שרק הגדיר משתנה סביבה. מנקים אותה כאן. */
    this.url = normalizeUrl(opts.url);
    this.anonKey = opts.anonKey;
    /* נקודת הקצה שיוצרת משתמשים. רצה בשרת, כי יצירת משתמש דורשת
       מפתח שאסור שיגיע לדפדפן. */
    this.adminEndpoint = opts.adminEndpoint || '/api/create-user';
    this.cancelEndpoint = opts.cancelEndpoint || '/api/cancel-invite';
    /* שינוי מנוי עובר דרך השרת ומשם לספק התשלומים. הדפדפן אינו
       רשאי לכתוב את מצב המנוי – ראו supabase/schema.sql. */
    this.billingEndpoint = opts.billingEndpoint || '/api/billing';
    this.storage = createStorage(opts.storage);
    this.fetchImpl = opts.fetch || (typeof fetch === 'function' ? fetch.bind(root) : null);
    this.pollMs = opts.pollMs || 10000;
    this.now = opts.now || function () { return new Date(); };

    this.tokens = this.storage.get(TOKEN_KEY);
    this._session = null;
    /* למה אין התחברות: no-profile | inactive | no-company | null */
    this._sessionMiss = null;
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
      '&select=id,email,name,role,employee_id,active,company_id,joined_at')
      .then(function (rows) {
        var profile = rows && rows[0];
        /* שתי סיבות שונות לחלוטין לכך שאין התחברות, ואסור לבלבל
           ביניהן: משתמש שטרם שויך לחברה צריך שניצור לו אותה,
           ואילו עובד שהושבת צריך להישאר בחוץ. */
        if (!profile) { self._session = null; self._sessionMiss = 'no-profile'; return null; }
        if (!profile.active) { self._session = null; self._sessionMiss = 'inactive'; return null; }
        self._sessionMiss = null;
        /* "הצטרף" הוא מה שהמנהל רואה במסך ההזמנות, ולכן הוא נרשם
           כאן – בכניסה הראשונה בפועל – ולא כשההזמנה נשלחה. נכשל?
           זו שורה במסך ניהול, לא תנאי להתחברות. */
        if (!profile.joined_at) {
          self._rpc('mark_self_joined', {}).then(null, function () {});
        }
        return self._rest('/companies?id=eq.' + encodeURIComponent(profile.company_id) +
          '&select=id,name,plan,status,valid_until,created_at')
          .then(function (companies) {
            var row = companies && companies[0];
            if (!row) { self._session = null; self._sessionMiss = 'no-company'; return null; }
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

  /* משלים הרשמה שנקטעה באמצע בגלל אישור המייל.
     נקרא רק כשאין פרופיל כלל – לא על עובד שהושבת – ורק אם שם
     החברה נשמר על משתמש האימות בזמן ההרשמה. מחזיר התחברות אם
     הושלמה, ו-null אם אין מה להשלים. */
  SupabaseBackend.prototype._completeSignUp = function () {
    var self = this;
    if (this._sessionMiss !== 'no-profile') return Promise.resolve(null);

    return this._request('/auth/v1/user', { method: 'GET' }).then(function (user) {
      var meta = (user && user.user_metadata) || {};
      var companyName = String(meta.company_name || '').trim();
      if (!companyName) return null;
      return self._rpc('create_company', {
        p_name: companyName,
        p_user_name: String(meta.name || '').trim(),
        p_trial_days: Model.TRIAL_DAYS
      }).then(function () { return self._loadSession(); });
    }, function () {
      /* אם לא הצלחנו לקרוא את המשתמש, נופלים חזרה להתנהגות הרגילה */
      return null;
    });
  };

  /* נקרא פעם אחת בעליית העמוד, לפני שמסך ההתחברות מצויר */
  /* ===== קישורים שמגיעים מהמייל =====

     אישור כתובת, איפוס סיסמה והזמנה מגיעים כקישור שמחזיר את הלקוח
     לאפליקציה עם האסימונים ב-fragment של הכתובת (#access_token=...).
     בלי לקרוא אותם כאן, לקוח שלחץ על קישור בדואר מגיע למסך התחברות
     ריק – ומבחינתו הקישור לא עבד. */
  function parseFragment(hash) {
    var out = {};
    String(hash || '').replace(/^#/, '').split('&').forEach(function (pair) {
      if (!pair) return;
      var eq = pair.indexOf('=');
      var key = eq === -1 ? pair : pair.slice(0, eq);
      var value = eq === -1 ? '' : pair.slice(eq + 1);
      try { out[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' ')); }
      catch (err) { out[key] = value; }
    });
    return out;
  }

  /* recovery והזמנה דורשות מסך "בחרו סיסמה" לפני הכניסה עצמה */
  var PASSWORD_TYPES = { recovery: true, invite: true };

  SupabaseBackend.prototype.adoptUrlTokens = function () {
    if (!root.location) return null;
    var params = parseFragment(root.location.hash);
    var hadSomething = !!(params.access_token || params.error_description || params.error);

    if (params.access_token) {
      this._storeTokens({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
        expires_in: Number(params.expires_in) || 3600
      });
      this._pendingAuth = PASSWORD_TYPES[params.type] ? params.type : null;
    } else if (params.error_description || params.error) {
      /* קישור שפג או שנלחץ פעמיים. ההודעה של השרת מדויקת יותר
         מכל ניחוש שלנו, ולכן היא זו שתוצג. */
      this._linkError = params.error_description || params.error;
    }

    /* הכתובת מנוקה כדי שרענון לא ינסה להשתמש באסימון שכבר נצרך,
       וכדי שהאסימון לא יישאר בהיסטוריה של הדפדפן. */
    if (hadSomething && root.history && root.history.replaceState) {
      try {
        root.history.replaceState(null, '',
          root.location.pathname + root.location.search);
      } catch (err) { /* דפדפן שאינו מרשה – לא קריטי */ }
    }
    return this._pendingAuth || null;
  };

  /* 'recovery' | 'invite' | null – מה המסך צריך לבקש לפני הכניסה */
  SupabaseBackend.prototype.pendingAuthAction = function () {
    return this._pendingAuth || null;
  };

  SupabaseBackend.prototype.clearPendingAuthAction = function () {
    this._pendingAuth = null;
  };

  /* שגיאה שהגיעה מקישור בדואר (פג תוקף, נלחץ פעמיים), אם הייתה */
  SupabaseBackend.prototype.takeLinkError = function () {
    var message = this._linkError || '';
    this._linkError = null;
    return message;
  };

  SupabaseBackend.prototype._redirectTo = function () {
    if (!root.location) return null;
    return root.location.origin + root.location.pathname;
  };

  /* הבקשה אינה מגלה אם הכתובת קיימת: תשובה שונה לכתובת שקיימת
     הופכת את המסך הזה לכלי לגילוי מי רשום למערכת. */
  SupabaseBackend.prototype.requestPasswordReset = function (email) {
    var address = String(email || '').trim().toLowerCase();
    if (!address) {
      return Promise.reject(fail('invalid_input', t('server.emailRequired')));
    }
    var redirect = this._redirectTo();
    return this._raw('/auth/v1/recover' +
      (redirect ? '?redirect_to=' + encodeURIComponent(redirect) : ''), {
      method: 'POST', token: null, body: { email: address }
    }).then(function () { return true; }, function (err) {
      /* חסימת קצב היא התשובה היחידה שכדאי להציג – היא אומרת
         ללקוח "נסה בעוד דקה" ולא "הכתובת לא קיימת". */
      if (err && (err.code === 'rate_limited' || err.status === 429)) throw err;
      return true;
    });
  };

  SupabaseBackend.prototype.setPassword = function (password) {
    var self = this;
    var next = String(password || '');
    if (next.length < 6) {
      return Promise.reject(fail('weak_password', t('server.passwordTooShort')));
    }
    if (!this.tokens) {
      return Promise.reject(fail('link_expired', t('server.linkExpired')));
    }
    return this._request('/auth/v1/user', {
      method: 'PUT', body: { password: next }
    }).then(function () {
      self.clearPendingAuthAction();
      return self._loadSession();
    }).then(function (session) {
      return session || self._completeSignUp();
    });
  };

  SupabaseBackend.prototype.restore = function () {
    var self = this;
    this.adoptUrlTokens();
    if (!this.tokens) return Promise.resolve(null);
    var run = this._expired() ? this._refresh() : Promise.resolve();
    return run.then(function () { return self._loadSession(); })
      .then(function (session) { return session || self._completeSignUp(); })
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

    /* שם החברה נשמר על משתמש האימות ולא רק כאן, כי כשאימות מייל
       דלוק ההרשמה אינה מסתיימת עכשיו: הלקוח יוצא לתיבת המייל,
       לוחץ על הקישור, ועשוי לחזור ממכשיר אחר לגמרי. מה שנשמר
       בדפדפן הזה לא יהיה שם. מהמטא-דאטה נקים את החברה בכניסה
       הראשונה שתצליח. */
    return this._raw('/auth/v1/signup', {
      method: 'POST', token: null,
      body: {
        email: email, password: password,
        data: { name: input.name || '', company_name: companyName }
      }
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
      if (session) return session;
      return self._completeSignUp();
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
  /* הנתונים יושבים בשרת אמיתי ומסתנכרנים בין מכשירים. המסך מסתמך
     על הסימון הזה כדי להבטיח ענן רק כשזה נכון. */
  SupabaseBackend.prototype.isCloud = true;

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

  function mapUser(row) {
    return {
      id: row.id, email: row.email, name: row.name,
      role: row.role, employeeId: row.employee_id, active: row.active,
      invitedAt: row.invited_at || null, joinedAt: row.joined_at || null
    };
  }

  SupabaseBackend.prototype.listUsers = function () {
    var companyId;
    try { companyId = this._companyId(); } catch (err) { return Promise.reject(err); }
    return this._rest('/company_users?company_id=eq.' + companyId +
      '&select=id,email,name,role,employee_id,active,invited_at,joined_at&order=created_at.asc')
      .then(function (rows) {
        return (rows || []).map(mapUser);
      });
  };

  /* ===== קריאות שירות ===== */

  function mapTicket(row) {
    return {
      id: row.id, kind: row.kind, subject: row.subject, body: row.body,
      status: row.status, reply: row.reply || null, createdAt: row.created_at
    };
  }

  function normalizeTicket(input) { return Model.normalizeTicket(input); }


  SupabaseBackend.prototype.listTickets = function () {
    var companyId;
    try { companyId = this._companyId(); } catch (err) { return Promise.reject(err); }
    return this._rest('/support_tickets?company_id=eq.' + companyId +
      '&select=id,kind,subject,body,status,reply,created_at&order=created_at.desc')
      .then(function (rows) { return (rows || []).map(mapTicket); });
  };

  SupabaseBackend.prototype.createTicket = function (input) {
    var session = this.session();
    if (!session) return Promise.reject(fail('not_signed_in', t('server.signInRequired')));
    var ticket = normalizeTicket(input);
    if (ticket.error) return Promise.reject(ticket.error);
    /* status ו-reply אינם נשלחים בכוונה: הם שלנו, והשרת חוסם
       אותם גם בהרשאת עמודה. */
    return this._rest('/support_tickets', {
      method: 'POST',
      body: [{
        company_id: session.company.id,
        created_by: session.user.id,
        kind: ticket.kind,
        subject: ticket.subject,
        body: ticket.body
      }]
    }).then(function (rows) { return mapTicket((rows || [])[0] || {}); });
  };

  /* קריאה לשרת שלנו (ולא ל-Supabase), עם האסימון של המשתמש.
     משמש לפעולות שדורשות הרשאה שאסור שתגיע לדפדפן. */
  SupabaseBackend.prototype._server = function (endpoint, payload) {
    var self = this;
    if (!this.tokens) {
      return Promise.reject(fail('not_signed_in', t('server.signInRequired')));
    }
    var run = this._expired() ? this._refresh() : Promise.resolve();
    return run.then(function () {
      return self.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + self.tokens.access_token
        },
        body: JSON.stringify(payload || {})
      });
    }).then(function (response) {
      return response.text().then(function (text) {
        var body = null;
        if (text) { try { body = JSON.parse(text); } catch (err) { body = { message: text }; } }
        if (response.status === 404 || response.status === 501) {
          /* נקודת הקצה לא נפרסה – עדיף להגיד את זה במפורש */
          throw fail('not_configured', t('payments.notConnected'));
        }
        if (!response.ok) throw describe(response.status, body);
        return body;
      });
    }, function (err) {
      if (err && err.code) throw err;
      throw fail('network', (err && err.message) || 'network error');
    });
  };

  /* יצירת משתמש דורשת מפתח ניהול, ולכן עוברת דרך השרת */
  /* המשתמש מקבל קישור בדואר וקובע סיסמה בעצמו. מנהל שקובע סיסמה
     ראשונית חייב להעביר אותה בערוץ כלשהו – ובפועל זה וואטסאפ – והיא
     נשארת שם לנצח. */
  SupabaseBackend.prototype.createUser = function (input) {
    return this._server(this.adminEndpoint, {
      email: String(input.email || '').trim().toLowerCase(),
      name: String(input.name || '').trim(),
      role: input.role === 'manager' ? 'manager' : 'employee',
      employeeId: input.employeeId || null,
      redirectTo: this._redirectTo()
    });
  };

  /* ===== זהות: השם שלי, ושם העסק ===== */

  /* company_users_update דורש is_manager(), ולכן עובד לא יכול היה
     לתקן שגיאת כתיב בשם של עצמו. הפונקציה בשרת היא security
     definer ומוגבלת ל-auth.uid(): אין בה מזהה משתמש, ולכן אי
     אפשר לכוון אותה למישהו אחר. */
  SupabaseBackend.prototype.saveOwnName = function (name) {
    var self = this;
    var clean = String(name || '').trim();
    if (!clean) return Promise.reject(fail('invalid', t('server.nameRequired')));
    return this._rpc('save_own_name', { p_name: clean }).then(function (row) {
      var user = mapUser(row);
      if (self._session) self._session.user.name = user.name;
      return user;
    });
  };

  /* שם העסק הוא השם המסחרי: מה שהעובדים רואים ומה שמופיע במיילים
     אליהם. בהרשמה נשמר לא פעם שם רשם החברות. RLS פותח את העמודה
     הזו – ורק אותה – לבעלים בלבד. */
  SupabaseBackend.prototype.renameCompany = function (name) {
    var self = this;
    var companyId;
    try { companyId = this._companyId(); } catch (err) { return Promise.reject(err); }
    var clean = String(name || '').trim();
    if (!clean) return Promise.reject(fail('invalid', t('server.companyNameRequired')));
    return this._rest('/companies?id=eq.' + companyId, {
      method: 'PATCH', body: { name: clean.slice(0, 120) }
    }).then(function (rows) {
      /* שורה ריקה כאן פירושה שכללי ההרשאה דחו את הכתיבה */
      if (!rows || !rows.length) throw fail('forbidden', t('server.noPermission'));
      if (self._session) self._session.company.name = rows[0].name;
      return self._session ? self._session.company : { name: rows[0].name };
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
      return mapUser(rows[0]);
    });
  };

  /* שליחה חוזרת של הקישור. הקישור שנשלח הוא קישור לקביעת סיסמה,
     והוא עובד גם למי שטרם קבע אחת – ולכן אותה פעולה משרתת גם
     הזמנה שפגה וגם עובד ששכח. אחרי השליחה מתאפס שעון התוקף,
     אחרת המסך היה ממשיך להציג "פג" על קישור חדש לגמרי. */
  SupabaseBackend.prototype.resendInvite = function (user) {
    var self = this;
    var companyId;
    try { companyId = this._companyId(); } catch (err) { return Promise.reject(err); }
    var email = String((user && user.email) || '').trim().toLowerCase();
    var userId = user && user.id;
    return this.requestPasswordReset(email).then(function () {
      if (!userId) return null;
      return self._rest('/company_users?id=eq.' + encodeURIComponent(userId) +
        '&company_id=eq.' + companyId, {
        method: 'PATCH', body: { invited_at: new Date().toISOString() }
      }).then(function (rows) {
        return rows && rows.length ? mapUser(rows[0]) : null;
      }, function () { return null; });   // הקישור נשלח; התאריך משני
    });
  };

  /* ביטול הזמנה = מחיקת המשתמש. דורש מפתח ניהול, ולכן עובר בשרת. */
  SupabaseBackend.prototype.cancelInvite = function (userId) {
    return this._server(this.cancelEndpoint, { userId: userId });
  };

  /* ===== מנוי ===== */

  /* שינוי מנוי אינו כתיבה לבסיס הנתונים אלא בקשה לשרת, שפונה
     משם לספק התשלומים. מצב המנוי חוזר רק אחרי שהספק אישר – כך
     שלקוח אינו יכול להעניק לעצמו מנוי. */
  SupabaseBackend.prototype.setSubscription = function (patch) {
    var self = this;
    try { this._companyId(); } catch (err) { return Promise.reject(err); }

    /* הפעולה נקבעת בשכבת החיוב, ולא מנוחשת מתוך הנתונים */
    var action = (patch && patch.action) || 'checkout';
    return this._server(this.billingEndpoint + '/' + action, { plan: patch && patch.plan })
      .then(function (result) {
        /* הספק עשוי להחזיר כתובת תשלום. אם כן – שולחים לשם. */
        if (result && result.checkoutUrl) {
          root.location.href = result.checkoutUrl;
          return self._session ? self._session.company : null;
        }
        return self._loadSession().then(function (session) {
          return session ? session.company : null;
        });
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
