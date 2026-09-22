/* Service Worker: עבודה גם ללא קליטה, והצגת התראות.
   אסטרטגיה: קודם רשת כדי שעדכונים יגיעו מיד, ובנפילה – מהמטמון. */
/* מספר הגרסה נועד להישרף: העלאתו מוחקת את המטמון הישן אצל כל
   מי שכבר פתח את האפליקציה. מעלים אותו בכל פעם שקובץ שנשמר
   במטמון משנה משמעות – למשל כשמחליפים פרויקט Supabase. */
var CACHE = 'shift-scheduler-v2';

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(['./']).catch(function () { /* לא קריטי */ });
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE ? null : caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  /* קובץ ההגדרות אומר לאיזה שרת לפנות. עותק ישן שלו מפנה את
     הלקוח לפרויקט שכבר הוחלף, והוא אינו עוזר גם ללא קליטה – אין
     לאן לפנות ממילא. לכן הוא לעולם אינו נשמר. */
  if (/\/config\.js$/.test(url.pathname)) return;

  event.respondWith(
    fetch(request).then(function (response) {
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
      }
      return response;
    }).catch(function () {
      return caches.match(request).then(function (cached) {
        return cached || caches.match('./');
      });
    })
  );
});

/* התראה שנשלחה מהדף */
self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type !== 'notify') return;
  self.registration.showNotification(data.title || 'סידור משמרות', {
    body: data.body || '',
    tag: data.tag || 'shift',
    dir: 'rtl',
    lang: 'he',
    badge: data.icon,
    icon: data.icon,
    data: { url: data.url || './' }
  });
});

/* התראת דחיפה מהשרת (יופעל כשיהיה שרת דחיפה) */
self.addEventListener('push', function (event) {
  var payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (err) { payload = {}; }
  event.waitUntil(self.registration.showNotification(payload.title || 'סידור משמרות', {
    body: payload.body || '',
    tag: payload.tag || 'shift',
    dir: 'rtl',
    lang: 'he',
    data: { url: payload.url || './' }
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if ('focus' in clients[i]) return clients[i].focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : null;
    })
  );
});
