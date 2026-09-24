/* טופס "צור קשר".

   שני עותקים על העמוד – עברית ואנגלית – כמו בשאר עמודי הפרוזה,
   ולכן כל מה שכאן עובד על שניהם ולא על מזהה יחיד.

   ההגנות האמיתיות יושבות בשרת (api/contact.js). מה שכאן נועד
   לאדם: לומר לו מה חסר לפני ששולחים, ולא להשאיר אותו מול כפתור
   שלא קרה בו כלום. */
(function (root) {
  'use strict';

  var Model = root.ShiftModel;

  /* נוסחי המסך, לפי שפת הטופס. לא עוברים דרך מערכת התרגום:
     העמודים האלה כתובים במלואם בשתי שפות, וזו אותה גישה. */
  var TEXT = {
    he: {
      sending: 'שולח…',
      send: 'שליחה',
      ok: 'ההודעה נשלחה. אדם יחזור אליך תוך 48 שעות, לכתובת שהזנת.',
      name: 'צריך שם, כדי שנדע למי אנחנו עונים.',
      email: 'הכתובת אינה נראית תקינה. בלעדיה אין לאן להשיב.',
      message: 'כמה מילים על מה שצריך — לפחות משפט.',
      busy: 'נשלחו כבר כמה הודעות מכאן. נסו שוב בעוד כמה דקות, או כתבו לנו ישירות למייל שלמעלה.',
      down: 'השליחה מהאתר אינה זמינה כרגע. אפשר לכתוב לנו ישירות למייל שלמעלה — זו אותה תיבה.',
      failed: 'ההודעה לא נשלחה. בדקו את החיבור ונסו שוב, או כתבו לנו ישירות למייל שלמעלה.',
      whatsapp: 'לשיחה בוואטסאפ'
    },
    en: {
      sending: 'Sending…',
      send: 'Send',
      ok: 'Message sent. A person will reply within 48 hours, to the address you gave.',
      name: 'We need a name, so we know who we are replying to.',
      email: 'That address doesn’t look right. Without it there is nowhere to reply.',
      message: 'A few words about what you need — a sentence at least.',
      busy: 'Several messages have already been sent from here. Try again in a few minutes, or email us directly at the address above.',
      down: 'Sending from the site is unavailable right now. You can email us directly at the address above — it is the same inbox.',
      failed: 'The message was not sent. Check your connection and try again, or email us directly at the address above.',
      whatsapp: 'Message us on WhatsApp'
    }
  };

  function textFor(form) {
    var article = form.closest ? form.closest('[data-legal]') : null;
    var lang = article && article.getAttribute('data-legal');
    return TEXT[lang] || TEXT.he;
  }

  /* כפתורי העתקה של כתובת המייל. הכתובת מוצגת ממילא כטקסט, ולכן
     כישלון של הלוח אינו מצב שבור: הוא פשוט לא מעתיק. */
  function bindCopy() {
    var buttons = document.querySelectorAll('[data-copy]');
    Array.prototype.forEach.call(buttons, function (button) {
      var original = button.textContent;
      button.addEventListener('click', function () {
        var value = button.getAttribute('data-copy');
        var done = function () {
          button.textContent = button.getAttribute('data-done') || original;
          setTimeout(function () { button.textContent = original; }, 2500);
        };
        if (root.navigator && root.navigator.clipboard &&
            root.navigator.clipboard.writeText) {
          root.navigator.clipboard.writeText(value).then(done, function () {});
        }
      });
    });
  }

  /* וואטסאפ מוצג רק כשהוגדר מספר. עד אז אין כאן שום בלוק ריק. */
  function bindWhatsapp() {
    var number = Model && Model.WHATSAPP_NUMBER;
    if (!number) return;
    [['contact-whatsapp', 'contact-whatsapp-link', 'he'],
     ['contact-whatsapp-en', 'contact-whatsapp-link-en', 'en']
    ].forEach(function (item) {
      var box = document.getElementById(item[0]);
      var link = document.getElementById(item[1]);
      if (!box || !link) return;
      link.href = 'https://wa.me/' + number;
      link.textContent = TEXT[item[2]].whatsapp;
      box.hidden = false;
    });
  }

  function value(form, name) {
    var field = form.elements[name];
    return field ? String(field.value || '').trim() : '';
  }

  function say(form, message, tone) {
    var node = form.querySelector('.contact-status');
    if (!node) return;
    node.textContent = message || '';
    node.className = 'contact-status' + (tone ? ' is-' + tone : '');
  }

  function looksLikeEmail(text) {
    return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(text);
  }

  function bindForm(form) {
    if (!form) return;
    /* מתי נפתח הטופס. השרת דוחה מילוי מהיר מכדי להיות אנושי. */
    var openedAt = Date.now();
    var busy = false;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (busy) return;
      var t = textFor(form);

      var name = value(form, 'name');
      var email = value(form, 'email');
      var message = value(form, 'message');

      /* בדיקה לפני שליחה, ומיקוד בשדה שחסר: טופס שאומר "שגיאה"
         בלי לומר איפה הוא טופס שנוטשים. */
      if (!name) { say(form, t.name, 'error'); form.elements.name.focus(); return; }
      if (!looksLikeEmail(email)) {
        say(form, t.email, 'error'); form.elements.email.focus(); return;
      }
      if (message.length < 10) {
        say(form, t.message, 'error'); form.elements.message.focus(); return;
      }

      var button = form.querySelector('button[type="submit"]');
      var label = button ? button.textContent : '';
      busy = true;
      if (button) { button.disabled = true; button.textContent = t.sending; }
      say(form, '');

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name, email: email, message: message,
          company: value(form, 'company'),
          phone: value(form, 'phone'),
          website: value(form, 'website'),
          openedAt: openedAt
        })
      }).then(function (response) {
        if (response.ok) {
          form.reset();
          openedAt = Date.now();
          say(form, t.ok, 'ok');
          return;
        }
        if (response.status === 429) { say(form, t.busy, 'error'); return; }
        if (response.status === 503) { say(form, t.down, 'error'); return; }
        say(form, t.failed, 'error');
      }, function () {
        say(form, t.failed, 'error');
      }).then(function () {
        busy = false;
        if (button) { button.disabled = false; button.textContent = label || t.send; }
      });
    });
  }

  function start() {
    bindCopy();
    bindWhatsapp();
    bindForm(document.getElementById('contact-form'));
    bindForm(document.getElementById('contact-form-en'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
