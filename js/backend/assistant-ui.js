/* העוזר: צ'אט קטן בתוך אפליקציית המנהל, שעונה על שאלות על המערכת.

   כפתור צף בפינה, ופאנל שנפתח ממנו. השאלות עוברות לשרת שלנו
   (api/assistant.js), ולא ל-Anthropic ישירות: המפתח אינו מגיע לדפדפן,
   והשרת בודק התחברות ומכסה.

   העוזר אינו מקבל נתונים של העסק. הוא יודע איך המערכת עובדת, ולא מה
   כתוב אצל הלקוח, ולכן ההודעה שמעל התיבה מבקשת לא להקליד סיסמאות
   ופרטים אישיים.

   השיחה נשמרת בזיכרון הדף בלבד. סגירה ופתיחה שומרות אותה; רענון
   מתחיל שיחה חדשה. */
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

  /* עיצוב מינימלי לתשובה: הטקסט מוברח קודם, ורק אחר כך **מודגש**
     ושורות חדשות מקבלים תגיות. כך תשובה שמכילה HTML לא מוזרקת. */
  function format(text) {
    return esc(text)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  var ctx = null;
  var messages = [];
  var busy = false;
  var open = false;

  var EXAMPLES = ['assistant.example1', 'assistant.example2', 'assistant.example3'];

  function panelHtml() {
    var html = '<div class="assistant-head">' +
      '<strong id="assistant-title">' + esc(t('assistant.title')) + '</strong>' +
      '<button type="button" class="btn ghost icon" id="assistant-close" aria-label="' +
        esc(t('assistant.close')) + '">×</button></div>';
    html += '<div class="assistant-log" id="assistant-log" role="log" aria-live="polite"></div>';
    html += '<p class="assistant-note">' + esc(t('assistant.note')) + '</p>';
    html += '<form class="assistant-form" id="assistant-form">' +
      '<textarea id="assistant-input" class="text-input" rows="2" maxlength="2000" ' +
        'placeholder="' + esc(t('assistant.placeholder')) + '" aria-label="' +
        esc(t('assistant.placeholder')) + '"></textarea>' +
      '<button type="submit" class="btn primary" id="assistant-send">' +
        esc(t('assistant.send')) + '</button></form>';
    return html;
  }

  function renderLog() {
    var log = document.getElementById('assistant-log');
    if (!log) return;
    var html = '';
    if (!messages.length) {
      html += '<p class="assistant-hello">' + esc(t('assistant.hello')) + '</p>';
      html += '<div class="assistant-examples">';
      EXAMPLES.forEach(function (key) {
        html += '<button type="button" class="chip" data-example="' + esc(key) + '">' +
          esc(t(key)) + '</button>';
      });
      html += '</div>';
    }
    messages.forEach(function (item) {
      html += '<div class="assistant-msg ' + (item.role === 'user' ? 'from-user' : 'from-bot') +
        (item.error ? ' is-error' : '') + '">' + format(item.content) + '</div>';
    });
    if (busy) html += '<div class="assistant-msg from-bot is-typing">' + esc(t('assistant.thinking')) + '</div>';
    log.innerHTML = html;
    log.scrollTop = log.scrollHeight;
  }

  function setOpen(next) {
    open = !!next;
    var panel = document.getElementById('assistant-panel');
    var fab = document.getElementById('assistant-fab');
    if (!panel || !fab) return;
    panel.classList.toggle('hidden', !open);
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      renderLog();
      var input = document.getElementById('assistant-input');
      if (input) input.focus();
    }
  }

  function errorText(err) {
    var code = err && err.code;
    if (code === 'assistant_limit') return t('assistant.limit');
    if (code === 'assistant_off') return t('assistant.off');
    if (code === 'not_signed_in') return t('assistant.signIn');
    return t('assistant.failed');
  }

  function ask(text) {
    var question = String(text || '').trim();
    if (!question || busy) return;
    messages.push({ role: 'user', content: question });
    busy = true;
    renderLog();
    var input = document.getElementById('assistant-input');
    if (input) input.value = '';

    /* לשרת נשלחות רק ההודעות הרגילות: הודעת שגיאה שהוצגה ללקוח אינה
       חלק מהשיחה שהעוזר צריך לקרוא */
    var thread = messages.filter(function (item) { return !item.error; })
      .map(function (item) { return { role: item.role, content: item.content }; });

    ctx.backend.askAssistant(thread).then(function (answer) {
      messages.push({ role: 'assistant', content: (answer && answer.reply) || t('assistant.failed') });
    }, function (err) {
      messages.push({ role: 'assistant', content: errorText(err), error: true });
    }).then(function () {
      busy = false;
      renderLog();
    });
  }

  function build() {
    if (document.getElementById('assistant-fab')) return;
    var fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'assistant-fab';
    fab.className = 'assistant-fab no-print';
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', 'assistant-panel');
    fab.innerHTML = '<span aria-hidden="true">?</span><span class="assistant-fab-label">' +
      esc(t('assistant.button')) + '</span>';
    var panel = document.createElement('section');
    panel.id = 'assistant-panel';
    panel.className = 'assistant-panel no-print hidden';
    panel.setAttribute('aria-labelledby', 'assistant-title');
    panel.innerHTML = panelHtml();
    document.body.appendChild(fab);
    document.body.appendChild(panel);

    fab.addEventListener('click', function () { setOpen(!open); });
    panel.addEventListener('click', function (event) {
      if (event.target.closest('#assistant-close')) { setOpen(false); return; }
      var example = event.target.closest('[data-example]');
      if (example) ask(t(example.dataset.example));
    });
    panel.addEventListener('submit', function (event) {
      event.preventDefault();
      var input = document.getElementById('assistant-input');
      ask(input ? input.value : '');
    });
    panel.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { setOpen(false); fab.focus(); return; }
      /* Enter שולח, Shift+Enter יורד שורה */
      if (event.key === 'Enter' && !event.shiftKey && event.target.id === 'assistant-input') {
        event.preventDefault();
        ask(event.target.value);
      }
    });
  }

  function rebuild() {
    var fab = document.getElementById('assistant-fab');
    var panel = document.getElementById('assistant-panel');
    if (fab) fab.remove();
    if (panel) panel.remove();
    build();
    setOpen(open);
  }

  /* מופיע רק למי שמנהל את המערכת. עובד רואה מסך אחר ואין לו צורך בו. */
  function init(options) {
    ctx = options;
    var role = ctx.session && ctx.session.user && ctx.session.user.role;
    if (!root.ShiftModel || !root.ShiftModel.can(role, 'schedule.edit')) return;
    build();
    if (root.I18n) root.I18n.onChange(rebuild);
  }

  root.ShiftAssistantUI = { init: init, ask: ask, open: function () { setOpen(true); } };
})(typeof window !== 'undefined' ? window : globalThis);
