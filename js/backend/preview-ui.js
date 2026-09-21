/* בחירת העובד לתצוגה מקדימה.
   מנהל שואל "מה דני יראה כשאשלח לו את הסידור?" – וזו התשובה,
   בלי להתנתק, בלי לפתוח משתמש לבדיקה, ובלי להתחזות לאף אחד. */
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
  var getEmployees = null;

  function close() {
    if (host) { host.classList.add('hidden'); host.innerHTML = ''; }
  }

  function open() {
    var employees = (getEmployees ? getEmployees() : []) || [];
    var active = employees.filter(function (emp) { return emp.active !== false; });

    if (!host) {
      host = document.createElement('div');
      host.className = 'why-overlay hidden';
      host.setAttribute('role', 'dialog');
      host.setAttribute('aria-modal', 'true');
      document.body.appendChild(host);
      host.addEventListener('click', function (event) {
        if (event.target === host || event.target.closest('[data-preview-close]')) {
          close();
          return;
        }
        var pick = event.target.closest('[data-preview-employee]');
        if (pick && root.ShiftPreview) {
          close();
          root.ShiftPreview.start(pick.getAttribute('data-preview-employee'));
        }
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && host && !host.classList.contains('hidden')) close();
      });
    }

    var html = '<div class="why-card">';
    html += '<button class="why-close" data-preview-close aria-label="' +
      esc(t('common.close')) + '">✕</button>';
    html += '<h2 class="why-title">' + esc(t('preview.title')) + '</h2>';
    html += '<p class="why-slot">' + esc(t('preview.hint')) + '</p>';

    if (!active.length) {
      html += '<p class="hint">' + esc(t('preview.noEmployees')) + '</p>';
    } else {
      html += '<div class="preview-list">';
      active.forEach(function (emp) {
        html += '<button type="button" class="preview-pick" data-preview-employee="' +
          esc(emp.id) + '">' + esc(emp.name) + '</button>';
      });
      html += '</div>';
    }
    html += '</div>';

    host.innerHTML = html;
    host.classList.remove('hidden');
    var first = host.querySelector('.why-close');
    if (first) first.focus();
  }

  function init(options) {
    getEmployees = options.getEmployees;
    var bar = document.getElementById('user-bar');
    if (!bar) return;
    bar.addEventListener('click', function (event) {
      if (event.target.closest('#user-preview')) open();
    });
  }

  var API = { init: init, open: open, close: close };
  root.ShiftPreviewUI = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
