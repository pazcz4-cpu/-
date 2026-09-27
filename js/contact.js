/* טופס "צור קשר".

   עותק אחד על העמוד, בשפה שהעמוד נשלח בה: לעמוד יש כתובת לכל
   שפה (/de/contact/), והטקסט שלו נכתב מראש. עד כאן היו שני
   טפסים באותו עמוד — עברית ואנגלית — עם מזהים שנבדלו בסיומת
   -en, וזה נעלם עם המבנה.

   הנוסחים כאן ולא במילוני התרגום, מסיבה של משקל: העמודים האלה
   אינם טוענים מילון כלל — הם נשלחים מתורגמים — ושמונה המילונים
   יחד הם שלושה רבעי מגה. עשר מחרוזות כאן זולות מזה בשלושה סדרי
   גודל.

   ההגנות האמיתיות יושבות בשרת (api/contact.js). מה שכאן נועד
   לאדם: לומר לו מה חסר לפני ששולחים, ולא להשאיר אותו מול כפתור
   שלא קרה בו כלום. */
(function (root) {
  'use strict';

  var Model = root.ShiftModel;

  /* נוסחי המסך, לפי שפת העמוד */
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
    },
    ar: {
      sending: 'جارٍ الإرسال…',
      send: 'إرسال',
      ok: 'تم إرسال الرسالة. سيردّ عليك شخص خلال 48 ساعة على العنوان الذي أدخلته.',
      name: 'نحتاج إلى اسم، لنعرف لمن نردّ.',
      email: 'هذا العنوان لا يبدو صحيحًا. بدونه لا يوجد مكان للردّ.',
      message: 'بضع كلمات عمّا تحتاجه — جملة واحدة على الأقل.',
      busy: 'أُرسلت عدة رسائل من هنا بالفعل. حاول مرة أخرى بعد بضع دقائق، أو اكتب لنا مباشرة إلى العنوان أعلاه.',
      down: 'الإرسال من الموقع غير متاح حاليًا. يمكنك الكتابة إلينا مباشرة إلى العنوان أعلاه — إنه نفس الصندوق.',
      failed: 'لم تُرسل الرسالة. تحقّق من الاتصال وحاول مرة أخرى، أو اكتب لنا مباشرة إلى العنوان أعلاه.',
      whatsapp: 'راسلنا على واتساب'
    },
    de: {
      sending: 'Wird gesendet…',
      send: 'Senden',
      ok: 'Nachricht gesendet. Eine Person antwortet innerhalb von 48 Stunden an die angegebene Adresse.',
      name: 'Wir brauchen einen Namen, damit wir wissen, wem wir antworten.',
      email: 'Diese Adresse sieht nicht richtig aus. Ohne sie können wir nicht antworten.',
      message: 'Ein paar Worte dazu, was Sie brauchen — mindestens ein Satz.',
      busy: 'Von hier wurden schon mehrere Nachrichten gesendet. Versuchen Sie es in ein paar Minuten noch einmal, oder schreiben Sie uns direkt an die Adresse oben.',
      down: 'Das Senden über die Website ist gerade nicht möglich. Sie können uns direkt an die Adresse oben schreiben — es ist dasselbe Postfach.',
      failed: 'Die Nachricht wurde nicht gesendet. Prüfen Sie die Verbindung und versuchen Sie es erneut, oder schreiben Sie uns direkt an die Adresse oben.',
      whatsapp: 'Schreiben Sie uns auf WhatsApp'
    },
    es: {
      sending: 'Enviando…',
      send: 'Enviar',
      ok: 'Mensaje enviado. Una persona te responderá en 48 horas, a la dirección que indicaste.',
      name: 'Necesitamos un nombre, para saber a quién respondemos.',
      email: 'Esa dirección no parece correcta. Sin ella no hay adónde responder.',
      message: 'Unas palabras sobre lo que necesitas — al menos una frase.',
      busy: 'Ya se han enviado varios mensajes desde aquí. Inténtalo de nuevo en unos minutos, o escríbenos directamente a la dirección de arriba.',
      down: 'El envío desde el sitio no está disponible ahora. Puedes escribirnos directamente a la dirección de arriba — es el mismo buzón.',
      failed: 'El mensaje no se envió. Revisa la conexión e inténtalo de nuevo, o escríbenos directamente a la dirección de arriba.',
      whatsapp: 'Escríbenos por WhatsApp'
    },
    fr: {
      sending: 'Envoi…',
      send: 'Envoyer',
      ok: 'Message envoyé. Une personne vous répondra sous 48 heures, à l’adresse indiquée.',
      name: 'Il nous faut un nom, pour savoir à qui nous répondons.',
      email: 'Cette adresse ne semble pas valide. Sans elle, nous ne pouvons pas répondre.',
      message: 'Quelques mots sur ce dont vous avez besoin — une phrase au minimum.',
      busy: 'Plusieurs messages ont déjà été envoyés d’ici. Réessayez dans quelques minutes, ou écrivez-nous directement à l’adresse ci-dessus.',
      down: 'L’envoi depuis le site est indisponible pour le moment. Vous pouvez nous écrire directement à l’adresse ci-dessus — c’est la même boîte.',
      failed: 'Le message n’a pas été envoyé. Vérifiez votre connexion et réessayez, ou écrivez-nous directement à l’adresse ci-dessus.',
      whatsapp: 'Écrivez-nous sur WhatsApp'
    },
    pt: {
      sending: 'A enviar…',
      send: 'Enviar',
      ok: 'Mensagem enviada. Uma pessoa responde dentro de 48 horas, para o endereço que indicou.',
      name: 'Precisamos de um nome, para sabermos a quem responder.',
      email: 'Esse endereço não parece correto. Sem ele não há para onde responder.',
      message: 'Algumas palavras sobre o que precisa — pelo menos uma frase.',
      busy: 'Já foram enviadas várias mensagens daqui. Tente novamente dentro de alguns minutos, ou escreva-nos diretamente para o endereço acima.',
      down: 'O envio pelo site não está disponível agora. Pode escrever-nos diretamente para o endereço acima — é a mesma caixa.',
      failed: 'A mensagem não foi enviada. Verifique a ligação e tente novamente, ou escreva-nos diretamente para o endereço acima.',
      whatsapp: 'Fale connosco no WhatsApp'
    },
    ru: {
      sending: 'Отправка…',
      send: 'Отправить',
      ok: 'Сообщение отправлено. Человек ответит в течение 48 часов на указанный адрес.',
      name: 'Нужно имя, чтобы мы знали, кому отвечаем.',
      email: 'Адрес выглядит неверным. Без него ответить некуда.',
      message: 'Несколько слов о том, что нужно — хотя бы одно предложение.',
      busy: 'Отсюда уже отправлено несколько сообщений. Попробуйте через несколько минут или напишите нам напрямую на адрес выше.',
      down: 'Отправка с сайта сейчас недоступна. Можно написать нам напрямую на адрес выше — это тот же ящик.',
      failed: 'Сообщение не отправлено. Проверьте соединение и попробуйте снова, или напишите нам напрямую на адрес выше.',
      whatsapp: 'Написать в WhatsApp'
    }
  };

  /* שפת העמוד נקבעת בזמן הבנייה ויושבת על <html lang>. אין כאן
     ניחוש לפי הדפדפן: העמוד כבר נשלח בשפה אחת, וטופס שמדבר שפה
     אחרת מהטקסט שמעליו נראה כמו תקלה. */
  function text() {
    var lang = (document.documentElement.getAttribute('lang') || '').split('-')[0];
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
    var box = document.getElementById('contact-whatsapp');
    var link = document.getElementById('contact-whatsapp-link');
    if (!box || !link) return;
    link.href = 'https://wa.me/' + number;
    link.textContent = text().whatsapp;
    box.hidden = false;
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
      var t = text();

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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
