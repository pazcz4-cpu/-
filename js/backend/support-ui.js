/* קריאות שירות. הלקוח מדווח על תקלה או מבקש פיתוח, ורואה את
   הקריאות שפתח ואת הסטטוס שלהן.

   הכלל שמנחה את המסך הזה: לקוח שדיווח על תקלה ולא רואה מה קרה
   לדיווח שלו מניח שהוא נזרק לפח, ובפעם הבאה לא ידווח – ואנחנו
   נאבד את התקלה ואת הלקוח. לכן הרשימה, הסטטוס והתשובה גלויים. */
(function (root) {
  'use strict';

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
  }

  var Model = root.ShiftModel;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) return '';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return Model.formatDate(date);
  }

  var ctx = null;

  function message(text, isError) {
    var node = document.getElementById('support-message');
    if (!node) return;
    node.textContent = text || '';
    node.classList.toggle('hidden', !text);
    node.classList.toggle('auth-error', !!isError);
    node.classList.toggle('auth-notice', !isError && !!text);
  }

  function renderList(tickets) {
    var container = document.getElementById('support-list');
    if (!container) return;

    if (!tickets.length) {
      container.innerHTML = '<p class="hint">' + esc(t('support.empty')) + '</p>';
      return;
    }

    container.innerHTML = tickets.map(function (ticket) {
      return '<article class="ticket">' +
        '<div class="ticket-head">' +
          '<span class="ticket-kind">' + esc(t('support.kind.' + ticket.kind)) + '</span>' +
          '<span class="ticket-subject">' + esc(ticket.subject) + '</span>' +
          '<span class="ticket-spacer"></span>' +
          '<span class="ticket-status ticket-' + esc(ticket.status) + '">' +
            esc(t('support.status.' + ticket.status)) + '</span>' +
          '<span class="ticket-date">' + esc(formatDate(ticket.createdAt)) + '</span>' +
        '</div>' +
        '<p class="ticket-body">' + esc(ticket.body) + '</p>' +
        (ticket.reply
          ? '<p class="ticket-reply"><strong>' + esc(t('support.replyLabel')) + '</strong> ' +
            esc(ticket.reply) + '</p>'
          : '') +
        '</article>';
    }).join('');
  }

  function render() {
    if (!ctx) return Promise.resolve();
    return ctx.backend.listTickets().then(renderList, function (err) {
      message((err && err.message) || t('support.loadFailed'), true);
    });
  }

  function submit(form) {
    var button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    message('');

    var kind = form.kind.value;
    return ctx.backend.createTicket({
      kind: kind,
      subject: form.subject.value,
      body: form.body.value
    }).then(function () {
      form.reset();
      /* הזמן שנאמר כאן הוא הזמן שמתאים לסוג שנשלח, ולא מספר
         אחד לכולם: אישור שמבטיח 48 שעות על תקלה חוסמת הוא
         בדיוק הרגע שבו הלקוח מחליט להתקשר במקום לחכות. */
      var replyIn = Model.supportReplyHours(kind);
      message(t(kind === 'bug' ? 'support.sentUrgent' : 'support.sent',
        { hours: replyIn, from: Model.SUPPORT_HOURS_FROM, to: Model.SUPPORT_HOURS_TO }), false);
      return render();
    }, function (err) {
      message((err && err.message) || t('support.sendFailed'), true);
    }).then(function () {
      if (button) button.disabled = false;
    });
  }

  function fillKinds() {
    var select = document.getElementById('support-kind');
    if (!select) return;
    var current = select.value;
    select.innerHTML = Model.TICKET_KINDS.map(function (kind) {
      return '<option value="' + esc(kind) + '">' + esc(t('support.kind.' + kind)) + '</option>';
    }).join('');
    if (current) select.value = current;
  }

  function translateStatic() {
    fillKinds();
    var promise = document.getElementById('support-promise');
    if (promise) {
      promise.textContent = t('support.promise', {
        hours: Model.SUPPORT_REPLY_HOURS,
        urgent: Model.SUPPORT_URGENT_HOURS,
        from: Model.SUPPORT_HOURS_FROM,
        to: Model.SUPPORT_HOURS_TO
      });
    }
    var whatsapp = document.getElementById('support-whatsapp');
    if (whatsapp) {
      var number = Model.WHATSAPP_NUMBER;
      if (number) {
        whatsapp.href = 'https://wa.me/' + number;
        whatsapp.textContent = t('support.whatsapp');
        whatsapp.classList.remove('hidden');
      } else {
        /* בלי מספר אין כפתור. קישור וואטסאפ שבור גרוע מאין קישור. */
        whatsapp.classList.add('hidden');
      }
    }
    var mail = document.getElementById('support-mail');
    if (mail) {
      mail.href = 'mailto:' + Model.SUPPORT_EMAIL;
      mail.textContent = Model.SUPPORT_EMAIL;
    }
  }

  function init(options) {
    ctx = options;
    var tab = document.querySelector('.tab[data-tab="support"]');
    if (tab) tab.classList.remove('hidden');

    var form = document.getElementById('support-form');
    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        submit(form);
      });
    }

    translateStatic();
    render();

    if (root.I18n) {
      root.I18n.onChange(function () { translateStatic(); render(); });
    }

    var tabs = document.getElementById('tabs');
    if (tabs) {
      tabs.addEventListener('click', function (event) {
        if (event.target.closest('.tab[data-tab="support"]')) render();
      });
    }
  }

  var API = { init: init, render: render };
  root.ShiftSupportUI = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
