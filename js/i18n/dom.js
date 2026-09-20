/* חיבור שכבת התרגום ל-DOM.
   כל אלמנט סטטי מסומן ב-data-i18n="מפתח", וכאן מחליפים את הטקסט בפועל.
   כך אפשר להחליף שפה בלי לרענן את העמוד. */
(function (root) {
  'use strict';

  var I18n = root.I18n || (typeof require === 'function' ? require('./core.js') : null);
  var STORAGE_KEY = 'shift-schedule-lang';

  function stored() {
    try { return root.localStorage ? root.localStorage.getItem(STORAGE_KEY) : null; }
    catch (err) { return null; }
  }
  function remember(code) {
    try { if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, code); }
    catch (err) { /* דפדפן בלי אחסון – השפה תיבחר מחדש בכל טעינה */ }
  }

  /* טקסט + תכונות: data-i18n, data-i18n-html, data-i18n-placeholder,
     data-i18n-title, data-i18n-aria-label, data-i18n-value */
  var ATTRIBUTES = [
    { source: 'data-i18n-placeholder', target: 'placeholder' },
    { source: 'data-i18n-title', target: 'title' },
    { source: 'data-i18n-aria-label', target: 'aria-label' },
    { source: 'data-i18n-value', target: 'value' }
  ];

  function apply(scope) {
    var node = scope || root.document;
    if (!node || !node.querySelectorAll) return;

    var texts = node.querySelectorAll('[data-i18n]');
    for (var i = 0; i < texts.length; i++) {
      texts[i].textContent = I18n.t(texts[i].getAttribute('data-i18n'));
    }

    /* רק מחרוזות מהמילונים שלנו מגיעות לכאן, ולכן innerHTML בטוח
       ומאפשר הדגשות בתוך משפט */
    var html = node.querySelectorAll('[data-i18n-html]');
    for (var h = 0; h < html.length; h++) {
      html[h].innerHTML = I18n.t(html[h].getAttribute('data-i18n-html'));
    }

    ATTRIBUTES.forEach(function (entry) {
      var list = node.querySelectorAll('[' + entry.source + ']');
      for (var j = 0; j < list.length; j++) {
        list[j].setAttribute(entry.target, I18n.t(list[j].getAttribute(entry.source)));
      }
    });
  }

  /* כיוון הכתיבה, שפת המסמך וכותרת הלשונית משתנים יחד עם השפה */
  function applyDocument() {
    var doc = root.document;
    if (!doc) return;
    if (doc.documentElement) {
      doc.documentElement.setAttribute('lang', I18n.code());
      doc.documentElement.setAttribute('dir', I18n.dir());
    }
    var titled = doc.querySelector('title[data-i18n]');
    if (titled) { doc.title = I18n.t(titled.getAttribute('data-i18n')); }
    apply(doc);
  }

  function setLanguage(code) {
    remember(code);
    I18n.use(code);          // המאזינים (כולל applyDocument) מופעלים מכאן
    return I18n.code();
  }

  /* מילוי רשימת בחירה בשפות הזמינות */
  function fillPicker(select) {
    if (!select) return;
    var current = I18n.code();
    select.innerHTML = '';
    I18n.list().forEach(function (lang) {
      var option = root.document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.name;
      if (lang.code === current) option.selected = true;
      select.appendChild(option);
    });
  }

  /* נקרא פעם אחת בעליית העמוד, לפני שהאפליקציה מציירת משהו */
  function init() {
    I18n.use(stored() || I18n.detect());
    I18n.onChange(applyDocument);
    applyDocument();
    return I18n.code();
  }

  var API = {
    STORAGE_KEY: STORAGE_KEY,
    stored: stored, remember: remember,
    apply: apply, applyDocument: applyDocument,
    setLanguage: setLanguage, fillPicker: fillPicker, init: init
  };

  root.I18nDom = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
