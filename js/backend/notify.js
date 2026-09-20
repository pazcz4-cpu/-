/* התראות למשתמש.
   כרגע ההתראות מקומיות: הן נוצרות בדפדפן כשמגיע עדכון והאפליקציה
   פתוחה או פועלת ברקע. התראה שמגיעה כשהאפליקציה סגורה לגמרי דורשת
   שרת דחיפה – הקוד כאן מוכן לכך דרך אותו Service Worker. */
(function (root) {
  'use strict';

  var KEY = 'shift-notify-enabled';

  var Notify = {
    registration: null,

    supported: function () {
      return typeof root.Notification !== 'undefined' &&
        'serviceWorker' in (root.navigator || {});
    },

    /* האם המשתמש ביקש התראות (בנוסף להרשאת הדפדפן) */
    enabled: function () {
      try { return root.localStorage.getItem(KEY) === '1'; } catch (err) { return false; }
    },

    setEnabled: function (value) {
      try { root.localStorage.setItem(KEY, value ? '1' : '0'); } catch (err) { /* לא קריטי */ }
    },

    permission: function () {
      return this.supported() ? root.Notification.permission : 'unsupported';
    },

    /* רישום ה-Service Worker. עובד רק מכתובת אינטרנט, לא מקובץ מקומי. */
    register: function (path) {
      var self = this;
      if (!('serviceWorker' in (root.navigator || {}))) return Promise.resolve(null);
      if (root.location.protocol !== 'https:' && root.location.hostname !== 'localhost') {
        return Promise.resolve(null);
      }
      return root.navigator.serviceWorker.register(path || 'sw.js').then(function (registration) {
        self.registration = registration;
        return registration;
      }, function () { return null; });
    },

    /* מבוקש רק מתוך פעולה יזומה של המשתמש */
    request: function () {
      var self = this;
      if (!this.supported()) return Promise.resolve('unsupported');
      return root.Notification.requestPermission().then(function (permission) {
        self.setEnabled(permission === 'granted');
        return permission;
      });
    },

    /* הצגת התראה. שקטה אם אין הרשאה או שהמשתמש כיבה. */
    show: function (options) {
      if (!this.supported() || !this.enabled()) return false;
      if (root.Notification.permission !== 'granted') return false;

      var payload = {
        type: 'notify',
        title: options.title || (root.I18n ? root.I18n.t('app.title') : 'Shift Scheduler'),
        body: options.body || '',
        tag: options.tag || 'shift',
        url: options.url || root.location.href
      };

      if (this.registration && this.registration.active) {
        this.registration.active.postMessage(payload);
        return true;
      }
      try {
        new root.Notification(payload.title, { body: payload.body, tag: payload.tag, dir: 'rtl', lang: 'he' });
        return true;
      } catch (err) {
        return false;
      }
    }
  };

  root.ShiftNotify = Notify;
  if (typeof module !== 'undefined' && module.exports) { module.exports = Notify; }
})(typeof window !== 'undefined' ? window : globalThis);
