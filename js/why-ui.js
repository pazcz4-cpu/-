/* "למה שובץ ככה" – החלון שמציג את ההסבר.

   ההסבר נבנה ב-explain.js מתוך הסידור עצמו. כאן רק מתרגמים אותו
   לשפה שמנהל קורא, בסדר שהוא היה שואל בו: קודם למה הוא, אחר כך
   מי עוד היה אפשרי, ורק בסוף מי נפסל ולמה. */
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
  var lastFocus = null;

  function ensureHost() {
    if (host) return host;
    host = document.createElement('div');
    host.id = 'why-overlay';
    host.className = 'why-overlay hidden';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    document.body.appendChild(host);

    host.addEventListener('click', function (event) {
      if (event.target === host || event.target.closest('[data-why-close]')) close();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && host && !host.classList.contains('hidden')) close();
    });
    return host;
  }

  function close() {
    if (!host) return;
    host.classList.add('hidden');
    host.innerHTML = '';
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (err) { /* לא קריטי */ } }
    lastFocus = null;
  }

  function factText(fact) {
    return t('why.fact.' + fact.code, fact.params || {});
  }

  function reasonText(reason) {
    return t('why.blocked.' + reason.code, reason.params || {});
  }

  /* כותרת המשמרת: "יום שלישי · סניף מרכז · ערב" */
  function slotTitle(context, slot) {
    var parts = [];
    if (context.dayName) parts.push(context.dayName(slot.dayIdx));
    if (context.branchName) parts.push(context.branchName(slot.branchId));
    if (context.shiftName) parts.push(context.shiftName(slot.shiftId));
    return parts.filter(Boolean).join(' · ');
  }

  function render(why, slot, context) {
    var node = ensureHost();
    var html = '<div class="why-card">';
    html += '<button class="why-close" data-why-close aria-label="' +
      esc(t('common.close')) + '">✕</button>';

    html += '<p class="why-slot">' + esc(slotTitle(context, slot)) + '</p>';
    html += '<h2 class="why-title">' +
      esc(t('why.title', { name: why.employee.name })) + '</h2>';

    html += '<ul class="why-facts">';
    why.facts.forEach(function (fact) {
      html += '<li>' + esc(factText(fact)) + '</li>';
    });
    html += '</ul>';

    /* השורה שהופכת את זה מרשימת תנאים לתשובה */
    if (why.onlyOption) {
      html += '<p class="why-verdict why-only">' + esc(t('why.onlyOption')) + '</p>';
    } else if (!why.alternatives.fairer.length) {
      html += '<p class="why-verdict">' +
        esc(t('why.fairest', { count: why.alternatives.free.length })) + '</p>';
    } else {
      html += '<p class="why-verdict">' + esc(t('why.alsoPossible', {
        names: why.alternatives.fairer.map(function (item) { return item.name; }).join(', ')
      })) + '</p>';
    }

    if (why.alternatives.blocked.length) {
      html += '<details class="why-blocked"><summary>' +
        esc(t('why.whoCould', { count: why.alternatives.blocked.length })) + '</summary><ul>';
      why.alternatives.blocked.forEach(function (item) {
        html += '<li><strong>' + esc(item.name) + '</strong> — ' +
          esc(reasonText(item.reason)) + '</li>';
      });
      html += '</ul></details>';
    }

    html += '</div>';
    node.innerHTML = html;
    node.classList.remove('hidden');
    var closeButton = node.querySelector('.why-close');
    if (closeButton) closeButton.focus();
  }

  /* נקרא מהאפליקציה. context מספק את שמות היום/הסניף/המשמרת,
     כי הם שייכים לשכבת התצוגה ולא למנוע. */
  function show(options) {
    var why = root.ShiftExplain.forAssignment(
      options.state, options.week, options.slot, options.employeeId);
    if (!why) return false;
    lastFocus = options.trigger || null;
    render(why, options.slot, options.context || {});
    return true;
  }

  var API = { show: show, close: close };
  root.ShiftWhyUI = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
