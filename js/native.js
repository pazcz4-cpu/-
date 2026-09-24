/* הגשר אל המעטפת המקומית (Capacitor).

   כל מה שכאן אופציונלי. אותו קוד רץ בדפדפן, ושם כל פונקציה
   נופלת בשקט להתנהגות הרגילה — כי זו אותה אפליקציה בדיוק,
   ולא שני מוצרים. אפליקציה שמתנהגת אחרת בדפדפן היא אפליקציה
   שצריך לבדוק פעמיים.

   מה שהמעטפת מוסיפה, ומה שבלעדיו אפל דוחה אפליקציה שהיא
   "אתר ארוז מחדש" (כלל 4.2):
   - התראות דחיפה
   - פתיחה ביומטרית
   - ניווט מקומי בלשוניות תחתונות
   - מסך שמסביר כשאין רשת, במקום שגיאת דפדפן */
(function (root) {
  'use strict';

  var listeners = { online: [], push: [], resume: [] };

  function emit(name, payload) {
    (listeners[name] || []).forEach(function (fn) {
      try { fn(payload); } catch (err) { /* מאזין שנופל לא מפיל את השאר */ }
    });
  }

  function cap() { return root.Capacitor || null; }

  function plugin(name) {
    var c = cap();
    if (!c) return null;
    /* Capacitor 5 ומעלה חושף את התוספים גם ישירות וגם תחת Plugins */
    return (c.Plugins && c.Plugins[name]) || c[name] || null;
  }

  /* ===== זיהוי הסביבה ===== */

  /* ?shell=1 מכריח את המעטפת גם בדפדפן. זה מה שמאפשר לבדוק את
     הניווט המקומי בבדיקות דפדפן, בלי לבנות קובץ iOS בכל שינוי. */
  function forced() {
    try {
      return /(^|[?&])shell=1(&|$)/.test(root.location.search || '');
    } catch (err) { return false; }
  }

  function isNative() {
    var c = cap();
    return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
  }

  /* האם להציג ממשק מקומי. לא זהה ל-isNative: בבדיקות אין
     Capacitor ועדיין רוצים לראות את הלשוניות. */
  function shell() { return isNative() || forced(); }

  function platform() {
    var c = cap();
    if (c && typeof c.getPlatform === 'function') return c.getPlatform();
    return 'web';
  }

  /* ===== רשת ===== */

  function online() {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  function watchNetwork() {
    if (typeof root.addEventListener !== 'function') return;
    root.addEventListener('online', function () { emit('online', true); });
    root.addEventListener('offline', function () { emit('online', false); });
    var net = plugin('Network');
    if (net && net.addListener) {
      net.addListener('networkStatusChange', function (status) {
        emit('online', !!(status && status.connected));
      });
    }
  }

  /* ===== רטט ===== */

  /* משוב מגע קצר על פעולה שהצליחה. בדפדפן אין, וזה בסדר. */
  function haptic(kind) {
    var h = plugin('Haptics');
    if (!h) return;
    try {
      if (kind === 'heavy' && h.impact) h.impact({ style: 'HEAVY' });
      else if (h.impact) h.impact({ style: kind === 'light' ? 'LIGHT' : 'MEDIUM' });
    } catch (err) { /* רטט שנכשל אינו שגיאה */ }
  }

  /* ===== פתיחה ביומטרית ===== */

  /* Face ID נועל את האפליקציה עצמה, לא את החשבון. מי שמאבד
     את הטלפון לא מאבד גישה למערכת — הוא מתחבר ממכשיר אחר. */
  function biometricAvailable() {
    var bio = plugin('NativeBiometric') || plugin('BiometricAuth');
    if (!bio || !bio.isAvailable) return Promise.resolve(false);
    return bio.isAvailable()
      .then(function (res) { return !!(res && (res.isAvailable || res.has === true)); })
      .catch(function () { return false; });
  }

  function biometricUnlock(reason) {
    var bio = plugin('NativeBiometric') || plugin('BiometricAuth');
    if (!bio) return Promise.resolve(true);
    var verify = bio.verifyIdentity || bio.authenticate;
    if (!verify) return Promise.resolve(true);
    return verify.call(bio, {
      reason: reason || '', title: reason || '',
      subtitle: '', description: ''
    }).then(function () { return true; }).catch(function () { return false; });
  }

  /* ===== התראות דחיפה ===== */

  /* הרשמה מחזירה אסימון מכשיר. הוא נשמר בשרת מול המשתמש, וזה
     מה שמאפשר לשלוח "הסידור פורסם" למי שזה נוגע לו ולא לכולם. */
  function registerPush() {
    var push = plugin('PushNotifications');
    if (!push) return Promise.resolve(null);
    return push.requestPermissions().then(function (perm) {
      if (!perm || perm.receive !== 'granted') return null;
      return new Promise(function (resolve) {
        var done = false;
        push.addListener('registration', function (token) {
          if (done) return;
          done = true;
          resolve((token && token.value) || null);
        });
        push.addListener('registrationError', function () {
          if (done) return;
          done = true;
          resolve(null);
        });
        push.addListener('pushNotificationReceived', function (note) {
          emit('push', note);
        });
        push.addListener('pushNotificationActionPerformed', function (action) {
          emit('push', (action && action.notification) || null);
        });
        push.register();
        /* אסימון שלא הגיע תוך עשר שניות לא יגיע. לא תוקעים את
           המסך בגללו — ההתראות פשוט לא יעבדו עד הפעם הבאה. */
        root.setTimeout(function () {
          if (!done) { done = true; resolve(null); }
        }, 10000);
      });
    }).catch(function () { return null; });
  }

  /* ===== מצב האפליקציה ===== */

  function watchApp() {
    var app = plugin('App');
    if (!app || !app.addListener) return;
    app.addListener('appStateChange', function (state) {
      if (state && state.isActive) emit('resume', true);
    });
  }

  /* ===== סרגל המצב ומסך הפתיחה ===== */

  function dressChrome() {
    var bar = plugin('StatusBar');
    if (bar) {
      try {
        /* רקע כהה עם טקסט בהיר — אותו כחול של הכותרת, כדי
           שהמעבר בין סרגל המערכת לאפליקציה לא ייראה כמו תפר. */
        if (bar.setStyle) bar.setStyle({ style: 'DARK' });
        if (bar.setBackgroundColor) bar.setBackgroundColor({ color: '#1b3bd6' });
      } catch (err) { /* לא כל מכשיר תומך */ }
    }
    var splash = plugin('SplashScreen');
    if (splash && splash.hide) {
      /* מסתירים רק כשהמסך באמת מוכן, ולא בטיימר. מסך פתיחה
         שנעלם מוקדם מדי חושף מסך לבן. */
      try { splash.hide(); } catch (err) { /* לא קריטי */ }
    }
  }

  function on(name, fn) {
    if (!listeners[name] || typeof fn !== 'function') return function () {};
    listeners[name].push(fn);
    return function () {
      var at = listeners[name].indexOf(fn);
      if (at >= 0) listeners[name].splice(at, 1);
    };
  }

  var started = false;
  function start() {
    if (started) return;
    started = true;
    watchNetwork();
    watchApp();
    if (isNative()) dressChrome();
  }

  var API = {
    start: start,
    isNative: isNative,
    shell: shell,
    platform: platform,
    online: online,
    haptic: haptic,
    biometricAvailable: biometricAvailable,
    biometricUnlock: biometricUnlock,
    registerPush: registerPush,
    on: on
  };

  root.ShiftNative = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
