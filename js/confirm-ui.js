/* חלון אישור לפעולות שאי אפשר לבטל בלחיצה אחת.

   window.confirm מציג שורה אחת ואינו יודע להראות מבנה. כשהשאלה
   היא "האם לפרסם סידור עם 17 חוסרים", המספרים הם העיקר – ולכן
   הם צריכים להיות על המסך, ולא בתוך משפט שקוראים באלכסון. */
(function (root) {
  'use strict';

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var host = null;
  var pending = null;
  var lastFocus = null;

  function finish(answer) {
    var resolve = pending;
    pending = null;
    if (host) {
      host.classList.add('hidden');
      host.innerHTML = '';
    }
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus(); } catch (err) { /* לא קריטי */ }
    }
    lastFocus = null;
    if (resolve) resolve(answer);
  }

  function ensureHost() {
    if (host) return host;
    host = document.createElement('div');
    host.id = 'confirm-overlay';
    host.className = 'why-overlay hidden';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    document.body.appendChild(host);

    host.addEventListener('click', function (event) {
      if (!pending) return;
      if (event.target.closest('[data-confirm-yes]')) { finish(true); return; }
      /* דרך שלישית, לשאלה שאין לה שתי תשובות. היא מוחזרת כמחרוזת
         ולא כ-true, כדי שקוראים ישנים שמצפים לכן/לא לא ישתנו. */
      if (event.target.closest('[data-confirm-alt]')) { finish('alt'); return; }
      /* לחיצה מחוץ לחלון היא ביטול, ולא אישור בטעות */
      if (event.target === host || event.target.closest('[data-confirm-no]')) { finish(false); }
    });
    document.addEventListener('keydown', function (event) {
      if (!pending) return;
      if (event.key === 'Escape') finish(false);
    });
    return host;
  }

  /* options: title, lines[], facts[{label,value,tone}], confirmLabel,
     cancelLabel, tone ('danger' מסמן פעולה שכדאי לעצור לפניה),
     altLabel + altTone (כפתור שלישי, מחזיר 'alt').

     התשובה היא true / false / 'alt'. שאלה עם שלוש תשובות אמיתיות
     עדיפה על שתי שאלות ברצף: ברצף, השנייה נלחצת בלי להיקרא. */
  function ask(options) {
    var opts = options || {};
    var node = ensureHost();
    if (pending) finish(false);
    lastFocus = document.activeElement;

    var html = '<div class="why-card confirm-card' +
      (opts.tone ? ' tone-' + esc(opts.tone) : '') + '">';
    html += '<h2 class="confirm-title">' + esc(opts.title || '') + '</h2>';

    if (opts.facts && opts.facts.length) {
      html += '<div class="confirm-facts">';
      opts.facts.forEach(function (fact) {
        html += '<div class="confirm-fact' + (fact.tone ? ' ' + esc(fact.tone) : '') + '">' +
          '<b>' + esc(fact.value) + '</b><span>' + esc(fact.label) + '</span></div>';
      });
      html += '</div>';
    }

    (opts.lines || []).forEach(function (line) {
      html += '<p class="confirm-line">' + esc(line) + '</p>';
    });

    html += '<div class="confirm-actions">' +
      '<button class="btn primary" data-confirm-yes>' +
        esc(opts.confirmLabel || t('common.yes')) + '</button>' +
      (opts.altLabel
        ? '<button class="btn ' + (opts.altTone === 'danger' ? 'danger' : 'ghost') +
          '" data-confirm-alt>' + esc(opts.altLabel) + '</button>'
        : '') +
      '<button class="btn ghost" data-confirm-no>' +
        esc(opts.cancelLabel || t('common.cancel')) + '</button>' +
      '</div></div>';

    node.innerHTML = html;
    node.classList.remove('hidden');
    var yes = node.querySelector('[data-confirm-yes]');
    if (yes) yes.focus();

    return new Promise(function (resolve) { pending = resolve; });
  }

  var API = { ask: ask };
  root.ShiftConfirmUI = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
