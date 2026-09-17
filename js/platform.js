/* שכבת התאמה לסביבת ההרצה: הורדת קבצים, הדפסה וסנכרון ענן (כשזמין).
   הכל אופציונלי – בפתיחה כקובץ מקומי הכל נופל חזרה להתנהגות הרגילה. */
(function (root) {
  'use strict';

  var Platform = {
    downloads: null,
    db: null,
    sample: null,
    onSampleReady: null,
    onSynced: null,
    lastSyncedAt: null,
    syncState: 'local',      // local | live | readonly
    onSyncState: null
  };

  function setSyncState(next) {
    Platform.syncState = next;
    if (Platform.onSyncState) Platform.onSyncState(next);
  }

  /* ===== הורדת קובץ ===== */
  function blobDownload(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  }

  /* מחזיר Promise עם הודעה למשתמש (או null כשאין מה להודיע) */
  Platform.saveFile = function (filename, content, mime) {
    if (Platform.downloads) {
      return Platform.downloads.save({ filename: filename, data: content })
        .then(function () { return 'הקובץ נשמר'; })
        .catch(function (err) {
          if (err && err.code === 'declined') return null;
          return 'שמירת הקובץ נכשלה: ' + ((err && err.message) || 'שגיאה לא ידועה');
        });
    }
    try {
      blobDownload(filename, content, mime);
      return Promise.resolve(null);
    } catch (err) {
      return Promise.resolve('לא ניתן להוריד קובץ בסביבה הזו');
    }
  };

  Platform.print = function () {
    try { root.print(); return true; } catch (err) { return false; }
  };

  /* ===== סנכרון ===== */
  var sync = {
    getState: null,
    onConfig: null,
    onWeek: null,
    weekKey: null,
    unsubConfig: null,
    unsubWeek: null,
    timers: {},
    chains: {}
  };

  function configSlice(state) {
    return {
      settings: state.settings,
      branches: state.branches,
      employees: state.employees
    };
  }

  function weekSlice(week) {
    return {
      constraints: week.constraints || {},
      assignments: week.assignments || {},
      manual: week.manual || {},
      note: week.note || ''
    };
  }

  function sameJson(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (err) { return false; }
  }

  /* כתיבה מושהית, כתיבה אחת בכל רגע נתון לכל מסמך */
  function queueWrite(path, buildBody) {
    if (!Platform.db || Platform.syncState === 'readonly') return;
    clearTimeout(sync.timers[path]);
    sync.timers[path] = setTimeout(function () {
      var previous = sync.chains[path] || Promise.resolve();
      sync.chains[path] = previous.then(function () {
        var body = buildBody();
        if (!body) return;
        return Platform.db.doc(path).set(body).then(function () {
          Platform.lastSyncedAt = new Date();
          if (Platform.onSynced) Platform.onSynced(Platform.lastSyncedAt);
        }, function (err) {
          if (err && err.code === 'invalid_argument') {
            setSyncState('readonly'); // צפייה בלבד – אין הרשאת כתיבה
          }
        });
      }).catch(function () {});
    }, 700);
  }

  Platform.pushConfig = function () {
    queueWrite('config/main', function () {
      var slice = configSlice(sync.getState());
      slice.updatedAt = Date.now();
      return slice;
    });
  };

  Platform.pushWeek = function (weekKey) {
    queueWrite('weeks/' + weekKey, function () {
      var state = sync.getState();
      var week = state.weeks[weekKey];
      if (!week) return null;
      var slice = weekSlice(week);
      slice.updatedAt = Date.now();
      return slice;
    });
  };

  /* העלאת כל השבועות לענן – נדרש אחרי ייבוא נתונים, שבו נוספים שבועות
     שלמים בבת אחת ולא רק השבוע המוצג. */
  Platform.pushAllWeeks = function () {
    if (!Platform.db || Platform.syncState === 'readonly') return Promise.resolve(0);
    var state = sync.getState();
    var keys = Object.keys(state.weeks || {});
    var saved = 0;

    return keys.reduce(function (chain, key) {
      return chain.then(function () {
        var week = state.weeks[key];
        if (!week) return;
        var slice = weekSlice(week);
        slice.updatedAt = Date.now();
        return Platform.db.doc('weeks/' + key).set(slice).then(function () {
          saved++;
          Platform.lastSyncedAt = new Date();
          if (Platform.onSynced) Platform.onSynced(Platform.lastSyncedAt);
        }, function () { /* שבוע בודד שנכשל אינו עוצר את השאר */ });
      });
    }, Promise.resolve()).then(function () { return saved; });
  };

  function subscribeConfig() {
    sync.unsubConfig = Platform.db.doc('config/main').onSnapshot(function (snap) {
      if (!snap.exists) { Platform.pushConfig(); return; } // זריעה ראשונה
      var remote = snap.data();
      var local = configSlice(sync.getState());
      if (sameJson({ s: remote.settings, b: remote.branches, e: remote.employees },
        { s: local.settings, b: local.branches, e: local.employees })) return;
      Platform.lastSyncedAt = new Date();
      if (Platform.onSynced) Platform.onSynced(Platform.lastSyncedAt, true);
      if (sync.onConfig) sync.onConfig(remote);
    }, function () { setSyncState('local'); });
  }

  function subscribeWeek(weekKey) {
    if (sync.unsubWeek) { sync.unsubWeek(); sync.unsubWeek = null; }
    sync.weekKey = weekKey;
    sync.unsubWeek = Platform.db.doc('weeks/' + weekKey).onSnapshot(function (snap) {
      if (!snap.exists) return;
      var remote = snap.data();
      var state = sync.getState();
      var local = weekSlice(state.weeks[weekKey] || { constraints: {}, assignments: {}, manual: {} });
      if (sameJson(weekSlice(remote), local)) return;
      Platform.lastSyncedAt = new Date();
      if (Platform.onSynced) Platform.onSynced(Platform.lastSyncedAt, true);
      if (sync.onWeek) sync.onWeek(weekKey, remote);
    }, function () { setSyncState('local'); });
  }

  Platform.watchWeek = function (weekKey) {
    if (!Platform.db || sync.weekKey === weekKey) return;
    subscribeWeek(weekKey);
  };

  /* מופעל פעם אחת בעליית האפליקציה */
  Platform.init = function (options) {
    sync.getState = options.getState;
    Platform.onSampleReady = options.onSampleReady;
    Platform.onSynced = options.onSynced;
    sync.onConfig = options.onConfig;
    sync.onWeek = options.onWeek;
    Platform.onSyncState = options.onSyncState;
    setSyncState('local');

    if (!root.claude || typeof root.claude.use !== 'function') return;

    root.claude.use('downloads').then(function (api) {
      Platform.downloads = api || null;
    }).catch(function () {});

    root.claude.use('sample').then(function (api) {
      Platform.sample = api || null;
      if (Platform.sample && Platform.onSampleReady) Platform.onSampleReady();
    }).catch(function () {});

    root.claude.use('db').then(function (api) {
      if (!api) return;
      Platform.db = api;
      setSyncState('live');
      subscribeConfig();
      subscribeWeek(options.weekKey());
    }).catch(function () {});
  };

  root.ShiftPlatform = Platform;
  if (typeof module !== 'undefined' && module.exports) { module.exports = Platform; }
})(typeof window !== 'undefined' ? window : globalThis);
