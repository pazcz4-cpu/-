/* מעקב שיווקי: פיקסל של Meta ו-Google Analytics, רק בהסכמה.

   מצב ברירת המחדל הוא כבוי לגמרי. שום סקריפט של צד שלישי אינו נטען,
   ושום בקשה אינה יוצאת, עד ששלושה תנאים מתקיימים יחד:
     1. הוגדר מזהה ב-config.js (metaPixelId / ga4Id). ריק = כבוי.
     2. המבקר לחץ "מאשר/ת" בבאנר ההסכמה.
     3. (אצלנו, לא בקוד) מדיניות הפרטיות עודכנה. כרגע היא אומרת
        "אין פיקסלים ואין אנליטיקה", ולכן המזהים ב-config.js נשארים
        ריקים עד שהנוסח המשפטי מאושר. ראו docs/marketing-strategy.md.

   אירועים (שם פנימי -> Meta / GA4):
     page        PageView            page_view (אוטומטי)
     pricing     ViewContent         view_item
     lead        Lead                generate_lead     (שליחת טופס צור קשר)
     signup      CompleteRegistration sign_up          (הקמת חשבון)
     trial       StartTrial          begin_trial       (כרטיס נשמר)
   אף אחד מהם אינו נושא אימייל, שם או טלפון. מה שנשלח הוא שם האירוע,
   קמפיין (utm), ובחבילה שנבחרה -- ערך.

   מקור הגעה (utm_*, fbclid, gclid) נשמר רק אחרי הסכמה, 60 יום. */
(function (root) {
  'use strict';

  var CONSENT_KEY = 'setshifts-consent-v1';
  var UTM_KEY = 'setshifts-utm';
  var MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
  var UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];

  var META_EVENT = { page: 'PageView', pricing: 'ViewContent', lead: 'Lead',
    signup: 'CompleteRegistration', trial: 'StartTrial' };
  var GA_EVENT = { page: 'page_view', pricing: 'view_item', lead: 'generate_lead',
    signup: 'sign_up', trial: 'begin_trial' };

  var loaded = { meta: false, ga: false };
  var queue = [];

  function store() { try { return root.localStorage; } catch (err) { return null; } }

  function config() { return root.SHIFT_CONFIG || {}; }
  function ids() {
    var c = config();
    return { meta: String(c.metaPixelId || '').replace(/\D/g, ''), ga: String(c.ga4Id || '').trim() };
  }
  function enabled() { var i = ids(); return !!(i.meta || /^G-[A-Z0-9]+$/.test(i.ga)); }

  /* ===== הסכמה ===== */
  function consent() {
    var s = store();
    if (!s) return null;
    try {
      var raw = JSON.parse(s.getItem(CONSENT_KEY) || 'null');
      return raw && typeof raw.analytics === 'boolean' ? raw.analytics : null;
    } catch (err) { return null; }
  }

  function setConsent(value) {
    var s = store();
    try { if (s) s.setItem(CONSENT_KEY, JSON.stringify({ analytics: !!value, at: Date.now() })); } catch (err) { /* ללא אחסון: ההחלטה חלה על הטעינה הזו בלבד */ }
    if (value) { start(); } else { forget(); }
  }

  /* דחייה או ביטול: מוחקים גם את מקור ההגעה שנשמר */
  function forget() {
    var s = store();
    try { if (s) s.removeItem(UTM_KEY); } catch (err) { /* לא קריטי */ }
    queue = [];
  }

  /* ===== מקור הגעה ===== */
  function captureUtm(search, now) {
    var found = {};
    var any = false;
    String(search || '').replace(/^\?/, '').split('&').forEach(function (pair) {
      var eq = pair.indexOf('=');
      var key = eq === -1 ? pair : pair.slice(0, eq);
      if (UTM_PARAMS.indexOf(key) === -1) return;
      var value = eq === -1 ? '' : pair.slice(eq + 1);
      try { value = decodeURIComponent(value.replace(/\+/g, ' ')); } catch (err) { /* נשאר כמות שהוא */ }
      value = value.slice(0, 120);
      if (value) { found[key] = value; any = true; }
    });
    if (!any) return null;
    found.at = now || Date.now();
    var s = store();
    try { if (s) s.setItem(UTM_KEY, JSON.stringify(found)); } catch (err) { /* לא קריטי */ }
    return found;
  }

  function utm(now) {
    var s = store();
    if (!s) return null;
    try {
      var raw = JSON.parse(s.getItem(UTM_KEY) || 'null');
      if (!raw || !raw.at || (now || Date.now()) - raw.at > MAX_AGE_MS) return null;
      return raw;
    } catch (err) { return null; }
  }

  /* ===== טעינה ===== */
  function loadMeta(id) {
    if (loaded.meta || !id || !root.document) return;
    loaded.meta = true;
    /* הקטע הרשמי של Meta, בצורה קריאה */
    var n = root.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!root._fbq) root._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    var script = root.document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    root.document.head.appendChild(script);
    root.fbq('init', id);
    root.fbq('track', 'PageView');
  }

  function loadGa(id) {
    if (loaded.ga || !/^G-[A-Z0-9]+$/.test(id) || !root.document) return;
    loaded.ga = true;
    root.dataLayer = root.dataLayer || [];
    root.gtag = function () { root.dataLayer.push(arguments); };
    root.gtag('js', new Date());
    /* בלי כתובת ה-IP המלאה, ובלי איתות פרסונליזציה */
    root.gtag('config', id, { anonymize_ip: true, allow_ad_personalization_signals: false });
    var script = root.document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    root.document.head.appendChild(script);
  }

  function start() {
    if (!enabled() || consent() !== true) return;
    var i = ids();
    loadMeta(i.meta);
    loadGa(i.ga);
    captureUtm(root.location && root.location.search);
    var pending = queue; queue = [];
    pending.forEach(function (item) { send(item.name, item.params); });
  }

  /* ===== אירועים ===== */
  function eventId() {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function send(name, params) {
    var meta = META_EVENT[name];
    var ga = GA_EVENT[name];
    var data = params || {};
    var id = data.eventId || eventId();
    var clean = {};
    ['value', 'currency', 'content_name'].forEach(function (k) { if (data[k] !== undefined) clean[k] = data[k]; });
    if (loaded.meta && meta && root.fbq) {
      /* name==page כבר נשלח בטעינת הפיקסל בדף הראשון */
      root.fbq('track', meta, clean, { eventID: id });
    }
    if (loaded.ga && ga && root.gtag) root.gtag('event', ga, clean);
  }

  /* מתעד אירוע. בלי הסכמה או בלי מזהה -- לא קורה כלום, ושום דבר לא נשמר */
  function track(name, params) {
    if (!enabled() || consent() === false) return false;
    if (consent() === null) { queue.push({ name: name, params: params }); if (queue.length > 20) queue.shift(); return false; }
    start();
    send(name, params);
    return true;
  }

  /* ===== באנר הסכמה ===== */
  /* נוסח הבאנר יושב כאן ולא בקבצי התרגום: הוא חייב לעבוד גם בעמודים
     שאינם טוענים אותם (עמודי התוכן), ובשפה של העמוד. */
  var COPY = {
    he: { settings: 'הגדרות עוגיות', title: 'עוגיות ומעקב', text: 'אנחנו משתמשים בעוגיות ובכלי מדידה של צדדים שלישיים כדי להבין מאיפה מגיעים מבקרים ולשפר את הפרסום שלנו. בלי הסכמה לא נטען שום כלי כזה.', privacy: 'מדיניות הפרטיות', accept: 'מאשר/ת', decline: 'לא, תודה' },
    en: { settings: 'Cookie settings', title: 'Cookies and tracking', text: 'We use cookies and third-party measurement tools to understand where visitors come from and to improve our advertising. Without your consent none of these tools is loaded.', privacy: 'Privacy policy', accept: 'Accept', decline: 'No, thanks' },
    ar: { settings: 'إعدادات ملفات تعريف الارتباط', title: 'ملفات تعريف الارتباط والتتبع', text: 'نستخدم ملفات تعريف الارتباط وأدوات قياس من جهات خارجية لمعرفة مصدر الزوار وتحسين إعلاناتنا. بدون موافقتك لا يتم تحميل أي من هذه الأدوات.', privacy: 'سياسة الخصوصية', accept: 'أوافق', decline: 'لا، شكراً' },
    de: { settings: 'Cookie-Einstellungen', title: 'Cookies und Tracking', text: 'Wir verwenden Cookies und Messwerkzeuge von Drittanbietern, um zu verstehen, woher Besucher kommen, und um unsere Werbung zu verbessern. Ohne Ihre Zustimmung wird keines dieser Werkzeuge geladen.', privacy: 'Datenschutzerklärung', accept: 'Zustimmen', decline: 'Nein, danke' },
    es: { settings: 'Ajustes de cookies', title: 'Cookies y seguimiento', text: 'Usamos cookies y herramientas de medición de terceros para entender de dónde llegan los visitantes y mejorar nuestra publicidad. Sin tu consentimiento no se carga ninguna de ellas.', privacy: 'Política de privacidad', accept: 'Aceptar', decline: 'No, gracias' },
    fr: { settings: 'Paramètres des cookies', title: 'Cookies et suivi', text: 'Nous utilisons des cookies et des outils de mesure tiers pour comprendre d’où viennent les visiteurs et améliorer notre publicité. Sans votre accord, aucun de ces outils n’est chargé.', privacy: 'Politique de confidentialité', accept: 'Accepter', decline: 'Non, merci' },
    pt: { settings: 'Definições de cookies', title: 'Cookies e rastreamento', text: 'Usamos cookies e ferramentas de medição de terceiros para perceber de onde vêm os visitantes e melhorar a nossa publicidade. Sem o seu consentimento, nenhuma delas é carregada.', privacy: 'Política de privacidade', accept: 'Aceitar', decline: 'Não, obrigado' },
    ru: { settings: 'Настройки cookie', title: 'Файлы cookie и отслеживание', text: 'Мы используем cookie и сторонние средства измерения, чтобы понимать, откуда приходят посетители, и улучшать нашу рекламу. Без вашего согласия ни одно из этих средств не загружается.', privacy: 'Политика конфиденциальности', accept: 'Согласен', decline: 'Нет, спасибо' }
  };

  function language() {
    var lang = '';
    try { lang = String((root.document && root.document.documentElement.lang) || '').slice(0, 2).toLowerCase(); } catch (err) { /* ברירת מחדל */ }
    return COPY[lang] ? lang : 'he';
  }

  function text(key) { return COPY[language()][key]; }

  function banner() {
    if (!enabled() || consent() !== null || !root.document || root.document.getElementById('consent-banner')) return;
    var bar = root.document.createElement('div');
    bar.id = 'consent-banner';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', text('title'));
    bar.className = 'consent-banner';
    bar.dir = language() === 'he' || language() === 'ar' ? 'rtl' : 'ltr';
    var copy = root.document.createElement('p');
    copy.textContent = text('text');
    var link = root.document.createElement('a');
    link.href = '/privacy/';
    link.textContent = text('privacy');
    copy.appendChild(root.document.createTextNode(' '));
    copy.appendChild(link);
    var accept = root.document.createElement('button');
    accept.type = 'button'; accept.id = 'consent-accept';
    accept.className = 'consent-btn consent-accept';
    accept.textContent = text('accept');
    var decline = root.document.createElement('button');
    decline.type = 'button'; decline.id = 'consent-decline';
    decline.className = 'consent-btn';
    decline.textContent = text('decline');
    function done(value) {
      setConsent(value);
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    }
    accept.addEventListener('click', function () { done(true); });
    decline.addEventListener('click', function () { done(false); });
    bar.appendChild(copy); bar.appendChild(accept); bar.appendChild(decline);
    root.document.body.appendChild(bar);
  }

  /* קישור "הגדרות עוגיות" בכותרת התחתונה: מאפשר לשנות את ההחלטה.
     נחשף רק כשיש מעקב בכלל. */
  function settingsLink() {
    if (!root.document || !root.document.querySelectorAll) return;
    var nodes = root.document.querySelectorAll('[data-consent-settings]');
    Array.prototype.forEach.call(nodes, function (node) {
      node.hidden = false;
      node.textContent = text('settings');
      node.addEventListener('click', function (event) {
        if (event.preventDefault) event.preventDefault();
        var s = store();
        try { if (s) s.removeItem(CONSENT_KEY); } catch (err) { /* לא קריטי */ }
        forget();
        banner();
      });
    });
  }

  /* data-track="pricing|lead|..." על אלמנט: לחיצה מתעדת אירוע */
  function bindClicks() {
    if (!root.document) return;
    root.document.addEventListener('click', function (event) {
      var node = event.target && event.target.closest && event.target.closest('[data-track]');
      if (node) track(node.getAttribute('data-track'), { content_name: node.getAttribute('data-track-name') || undefined });
    });
  }

  function init() {
    if (!enabled()) return;
    /* באפליקציה (מצב conversion) עובדים ועובדות נכנסים עם נתוני משמרות.
       שם שום סקריפט צד שלישי לא נטען בכניסה, ואין באנר: רק הרשמה והתחלת
       ניסיון של בעל עסק מפעילים אותו, ורק אם ההסכמה ניתנה קודם בעמוד
       הציבורי. */
    var conversionOnly = root.SHIFT_TRACKING_MODE === 'conversion';
    if (!conversionOnly) {
      start();
      banner();
      bindClicks();
      settingsLink();
    }
    if (/\/pricing\/?$/.test((root.location && root.location.pathname) || '')) track('pricing');
    /* חזרה מעמוד התשלום עם כרטיס שמור */
    if (/[?&]billing=done/.test((root.location && root.location.search) || '')) track('trial');
  }

  var API = { init: init, track: track, consent: consent, setConsent: setConsent, enabled: enabled,
    captureUtm: captureUtm, utm: utm, banner: banner, META_EVENT: META_EVENT, GA_EVENT: GA_EVENT, COPY: COPY,
    _reset: function () { loaded.meta = false; loaded.ga = false; queue = []; } };
  root.ShiftTracking = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }

  if (root.document && root.document.readyState !== undefined) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
  }
})(typeof window !== 'undefined' ? window : globalThis);
