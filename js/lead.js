/* טופס ליד: "השאירו פרטים ונחזור אליכם".

   שונה מטופס צור קשר בכוונה: מי שמגיע מפרסומת עוד לא יודע מה לכתוב
   בהודעה, אבל יודע לענות על חמש שאלות. התשובות (כמה עובדים, כמה
   זמן בשבוע הולך על הסידור) הן מה שמאפשר לנו לפתוח את השיחה
   בהצעה ולא בשאלות.

   עותק אחד על העמוד, בשפה שהעמוד נשלח בה. הנוסחים כאן ולא
   במילוני התרגום, כמו ב-contact.js: עמודי התוכן אינם טוענים מילון.
   ההגנות האמיתיות בשרת (api/contact.js, kind: 'lead').

   מקור ההגעה (utm) נשלח רק אם המבקר אישר מדידה: ShiftTracking.utm()
   מחזיר ערך רק במקרה כזה. */
(function (root) {
  'use strict';

  var TEXT = {
    he: {
      business: 'שם העסק', name: 'שם מלא', phone: 'טלפון', email: 'אימייל',
      employees: 'כמה עובדים יש לכם?',
      hours: 'כמה זמן בשבוע לוקח לכם להכין משמרות היום?',
      hourOpts: { '': 'בחרו…', lt1: 'עד שעה', '1-3': '1–3 שעות', '3-6': '3–6 שעות', '6plus': 'מעל 6 שעות', unknown: 'לא יודע/ת' },
      consent: 'אני מאשר/ת שיחזרו אליי בטלפון, במייל או בוואטסאפ בנוגע לפנייה הזו.',
      note: 'לא נרשמים לרשימת תפוצה. הפרטים משמשים לחזרה אליכם בלבד.',
      send: 'בואו נדבר', sending: 'שולח…',
      ok: 'תודה! אדם יחזור אליך בשעות הפעילות ({from}–{to}, ראשון עד חמישי).',
      err: { business: 'איך קוראים לעסק?', name: 'צריך שם, כדי שנדע למי לפנות.', phone: 'המספר אינו נראה תקין.', email: 'הכתובת אינה נראית תקינה.', employees: 'כמה עובדים בערך? מספר בלבד.', consent: 'כדי שנוכל לחזור אליך צריך לסמן הסכמה.' },
      busy: 'נשלחו כבר כמה פניות מכאן. נסו שוב בעוד כמה דקות.',
      down: 'השליחה מהאתר אינה זמינה כרגע. כתבו לנו ל-support@setshifts.com.',
      failed: 'הפרטים לא נשלחו. בדקו את החיבור ונסו שוב.'
    },
    en: {
      business: 'Business name', name: 'Full name', phone: 'Phone', email: 'Email',
      employees: 'How many employees do you have?',
      hours: 'How long does it take you to prepare shifts each week today?',
      hourOpts: { '': 'Choose…', lt1: 'Up to an hour', '1-3': '1–3 hours', '3-6': '3–6 hours', '6plus': 'Over 6 hours', unknown: 'Not sure' },
      consent: 'I agree to be contacted by phone, email or WhatsApp about this enquiry.',
      note: 'No mailing list. Your details are used only to get back to you.',
      send: 'Let’s talk', sending: 'Sending…',
      ok: 'Thank you! A person will get back to you during support hours ({from}–{to}, Sunday to Thursday).',
      err: { business: 'What is the business called?', name: 'We need a name, so we know who to ask for.', phone: 'That number doesn’t look right.', email: 'That address doesn’t look right.', employees: 'Roughly how many employees? Numbers only.', consent: 'Please tick the box so we can get back to you.' },
      busy: 'Several enquiries were already sent from here. Try again in a few minutes.',
      down: 'Sending from the site is unavailable right now. Email us at support@setshifts.com.',
      failed: 'Your details were not sent. Check your connection and try again.'
    },
    ar: {
      business: 'اسم النشاط', name: 'الاسم الكامل', phone: 'الهاتف', email: 'البريد الإلكتروني',
      employees: 'كم عدد الموظفين لديكم؟',
      hours: 'كم من الوقت يستغرق إعداد المناوبات أسبوعيًا اليوم؟',
      hourOpts: { '': 'اختر…', lt1: 'حتى ساعة', '1-3': '1–3 ساعات', '3-6': '3–6 ساعات', '6plus': 'أكثر من 6 ساعات', unknown: 'لست متأكدًا' },
      consent: 'أوافق على أن يتواصلوا معي هاتفيًا أو بالبريد أو عبر واتساب بخصوص هذا الطلب.',
      note: 'لا قائمة بريدية. تُستخدم بياناتك للردّ عليك فقط.',
      send: 'لنتحدث', sending: 'جارٍ الإرسال…',
      ok: 'شكرًا! سيتواصل معك شخص خلال ساعات العمل ({from}–{to}، من الأحد إلى الخميس).',
      err: { business: 'ما اسم النشاط؟', name: 'نحتاج إلى اسم لنعرف بمن نتصل.', phone: 'الرقم لا يبدو صحيحًا.', email: 'العنوان لا يبدو صحيحًا.', employees: 'كم عدد الموظفين تقريبًا؟ أرقام فقط.', consent: 'يرجى تحديد المربع حتى نتمكن من الردّ عليك.' },
      busy: 'أُرسلت عدة طلبات من هنا بالفعل. حاول مرة أخرى بعد بضع دقائق.',
      down: 'الإرسال من الموقع غير متاح حاليًا. راسلنا على support@setshifts.com.',
      failed: 'لم تُرسل البيانات. تحقّق من الاتصال وحاول مرة أخرى.'
    },
    de: {
      business: 'Name des Betriebs', name: 'Vollständiger Name', phone: 'Telefon', email: 'E-Mail',
      employees: 'Wie viele Mitarbeitende haben Sie?',
      hours: 'Wie lange dauert die Schichtplanung bei Ihnen heute pro Woche?',
      hourOpts: { '': 'Bitte wählen…', lt1: 'Bis zu einer Stunde', '1-3': '1–3 Stunden', '3-6': '3–6 Stunden', '6plus': 'Über 6 Stunden', unknown: 'Weiß ich nicht' },
      consent: 'Ich bin einverstanden, dass man mich zu dieser Anfrage telefonisch, per E-Mail oder WhatsApp kontaktiert.',
      note: 'Kein Newsletter. Ihre Angaben dienen nur dazu, Ihnen zu antworten.',
      send: 'Sprechen wir', sending: 'Wird gesendet…',
      ok: 'Danke! Eine Person meldet sich in den Servicezeiten ({from}–{to}, Sonntag bis Donnerstag).',
      err: { business: 'Wie heißt der Betrieb?', name: 'Wir brauchen einen Namen, damit wir wissen, wen wir ansprechen.', phone: 'Diese Nummer sieht nicht richtig aus.', email: 'Diese Adresse sieht nicht richtig aus.', employees: 'Wie viele Mitarbeitende ungefähr? Nur eine Zahl.', consent: 'Bitte das Kästchen anhaken, damit wir antworten können.' },
      busy: 'Von hier wurden schon mehrere Anfragen gesendet. Versuchen Sie es in ein paar Minuten noch einmal.',
      down: 'Das Senden über die Website ist gerade nicht möglich. Schreiben Sie uns an support@setshifts.com.',
      failed: 'Ihre Angaben wurden nicht gesendet. Prüfen Sie die Verbindung und versuchen Sie es erneut.'
    },
    es: {
      business: 'Nombre del negocio', name: 'Nombre completo', phone: 'Teléfono', email: 'Correo electrónico',
      employees: '¿Cuántos empleados tienen?',
      hours: '¿Cuánto tiempo les lleva hoy preparar los turnos cada semana?',
      hourOpts: { '': 'Elige…', lt1: 'Hasta una hora', '1-3': '1–3 horas', '3-6': '3–6 horas', '6plus': 'Más de 6 horas', unknown: 'No lo sé' },
      consent: 'Acepto que me contacten por teléfono, correo o WhatsApp sobre esta consulta.',
      note: 'Sin lista de correo. Tus datos se usan solo para responderte.',
      send: 'Hablemos', sending: 'Enviando…',
      ok: '¡Gracias! Una persona te contactará en el horario de atención ({from}–{to}, de domingo a jueves).',
      err: { business: '¿Cómo se llama el negocio?', name: 'Necesitamos un nombre, para saber a quién llamar.', phone: 'Ese número no parece correcto.', email: 'Esa dirección no parece correcta.', employees: '¿Cuántos empleados, aproximadamente? Solo un número.', consent: 'Marca la casilla para que podamos responderte.' },
      busy: 'Ya se enviaron varias consultas desde aquí. Inténtalo de nuevo en unos minutos.',
      down: 'El envío desde el sitio no está disponible ahora. Escríbenos a support@setshifts.com.',
      failed: 'Los datos no se enviaron. Revisa la conexión e inténtalo de nuevo.'
    },
    fr: {
      business: 'Nom de l’entreprise', name: 'Nom complet', phone: 'Téléphone', email: 'E-mail',
      employees: 'Combien d’employés avez-vous ?',
      hours: 'Combien de temps vous faut-il aujourd’hui pour préparer les plannings chaque semaine ?',
      hourOpts: { '': 'Choisir…', lt1: 'Jusqu’à une heure', '1-3': '1 à 3 heures', '3-6': '3 à 6 heures', '6plus': 'Plus de 6 heures', unknown: 'Je ne sais pas' },
      consent: 'J’accepte d’être contacté(e) par téléphone, e-mail ou WhatsApp au sujet de cette demande.',
      note: 'Pas de liste de diffusion. Vos données servent uniquement à vous répondre.',
      send: 'Parlons-en', sending: 'Envoi…',
      ok: 'Merci ! Une personne vous répondra pendant les heures de service ({from}–{to}, du dimanche au jeudi).',
      err: { business: 'Comment s’appelle l’entreprise ?', name: 'Il nous faut un nom, pour savoir qui appeler.', phone: 'Ce numéro ne semble pas correct.', email: 'Cette adresse ne semble pas correcte.', employees: 'Combien d’employés environ ? Un nombre uniquement.', consent: 'Cochez la case pour que nous puissions vous répondre.' },
      busy: 'Plusieurs demandes ont déjà été envoyées d’ici. Réessayez dans quelques minutes.',
      down: 'L’envoi depuis le site est indisponible pour le moment. Écrivez-nous à support@setshifts.com.',
      failed: 'Vos informations n’ont pas été envoyées. Vérifiez la connexion et réessayez.'
    },
    pt: {
      business: 'Nome do negócio', name: 'Nome completo', phone: 'Telefone', email: 'E-mail',
      employees: 'Quantos funcionários vocês têm?',
      hours: 'Quanto tempo leva hoje para preparar os turnos por semana?',
      hourOpts: { '': 'Escolha…', lt1: 'Até uma hora', '1-3': '1–3 horas', '3-6': '3–6 horas', '6plus': 'Mais de 6 horas', unknown: 'Não sei' },
      consent: 'Concordo em ser contatado(a) por telefone, e-mail ou WhatsApp sobre este pedido.',
      note: 'Sem lista de e-mails. Seus dados são usados apenas para responder a você.',
      send: 'Vamos conversar', sending: 'Enviando…',
      ok: 'Obrigado! Uma pessoa entrará em contato no horário de atendimento ({from}–{to}, de domingo a quinta).',
      err: { business: 'Qual é o nome do negócio?', name: 'Precisamos de um nome, para saber com quem falar.', phone: 'Esse número não parece correto.', email: 'Esse endereço não parece correto.', employees: 'Quantos funcionários, aproximadamente? Apenas número.', consent: 'Marque a caixa para que possamos responder.' },
      busy: 'Vários pedidos já foram enviados daqui. Tente novamente em alguns minutos.',
      down: 'O envio pelo site está indisponível agora. Escreva para support@setshifts.com.',
      failed: 'Os dados não foram enviados. Verifique a conexão e tente novamente.'
    },
    ru: {
      business: 'Название бизнеса', name: 'Полное имя', phone: 'Телефон', email: 'Эл. почта',
      employees: 'Сколько у вас сотрудников?',
      hours: 'Сколько времени в неделю сейчас уходит на составление смен?',
      hourOpts: { '': 'Выберите…', lt1: 'До часа', '1-3': '1–3 часа', '3-6': '3–6 часов', '6plus': 'Более 6 часов', unknown: 'Не знаю' },
      consent: 'Я согласен(на), чтобы со мной связались по телефону, почте или WhatsApp по этому обращению.',
      note: 'Без рассылок. Данные используются только для ответа вам.',
      send: 'Давайте поговорим', sending: 'Отправка…',
      ok: 'Спасибо! Сотрудник свяжется с вами в рабочее время ({from}–{to}, с воскресенья по четверг).',
      err: { business: 'Как называется бизнес?', name: 'Нужно имя, чтобы мы знали, к кому обращаться.', phone: 'Номер выглядит неверно.', email: 'Адрес выглядит неверно.', employees: 'Примерно сколько сотрудников? Только число.', consent: 'Отметьте галочку, чтобы мы могли вам ответить.' },
      busy: 'Отсюда уже отправлено несколько обращений. Повторите через несколько минут.',
      down: 'Отправка с сайта сейчас недоступна. Напишите нам на support@setshifts.com.',
      failed: 'Данные не отправлены. Проверьте соединение и повторите.'
    }
  };

  function lang() {
    var l = (document.documentElement.getAttribute('lang') || '').split('-')[0];
    return TEXT[l] ? l : 'he';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function hoursLine(t) {
    var M = root.ShiftModel;
    var from = (M && M.SUPPORT_HOURS_FROM) || '09:00';
    var to = (M && M.SUPPORT_HOURS_TO) || '15:30';
    return t.ok.replace('{from}', from).replace('{to}', to);
  }

  function render(box) {
    var t = TEXT[lang()];
    var opts = Object.keys(t.hourOpts).map(function (k) {
      return '<option value="' + k + '">' + esc(t.hourOpts[k]) + '</option>';
    }).join('');
    function field(id, label, extra) {
      return '<label class="contact-field"><span>' + esc(label) + ' <b aria-hidden="true">*</b></span>' +
        '<input id="lead-' + id + '" name="' + id + '" ' + extra + ' required></label>';
    }
    box.innerHTML =
      '<form class="lead-form" novalidate>' +
        field('business', t.business, 'type="text" autocomplete="organization" maxlength="160"') +
        field('name', t.name, 'type="text" autocomplete="name" maxlength="120"') +
        field('phone', t.phone, 'type="tel" autocomplete="tel" maxlength="40" dir="ltr"') +
        field('email', t.email, 'type="email" autocomplete="email" maxlength="200" dir="ltr"') +
        field('employees', t.employees, 'type="number" inputmode="numeric" min="1" max="100000" dir="ltr"') +
        '<label class="contact-field"><span>' + esc(t.hours) + '</span>' +
          '<select id="lead-hours" name="hours">' + opts + '</select></label>' +
        '<div class="contact-trap" aria-hidden="true"><label>x <input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>' +
        '<label class="lead-consent"><input id="lead-consent" name="consent" type="checkbox"> <span>' + esc(t.consent) + '</span></label>' +
        '<button type="submit" class="lp-btn lp-btn-primary lp-btn-lg">' + esc(t.send) + '</button>' +
        '<p class="contact-note">' + esc(t.note) + '</p>' +
        '<p class="contact-status" role="status" aria-live="polite"></p>' +
      '</form>';
    bind(box.querySelector('form'), t);
  }

  function bind(form, t) {
    var openedAt = Date.now();
    var busy = false;
    var status = form.querySelector('.contact-status');
    function say(message, tone) {
      status.textContent = message || '';
      status.className = 'contact-status' + (tone ? ' is-' + tone : '');
    }
    function val(name) { return String(form.elements[name].value || '').trim(); }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (busy) return;
      var employees = Math.round(Number(val('employees')));
      var checks = [
        ['business', !!val('business')],
        ['name', !!val('name')],
        ['phone', val('phone').replace(/\D/g, '').length >= 7],
        ['email', /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(val('email'))],
        ['employees', isFinite(employees) && employees >= 1],
        ['consent', form.elements.consent.checked]
      ];
      for (var i = 0; i < checks.length; i++) {
        if (!checks[i][1]) { say(t.err[checks[i][0]], 'error'); form.elements[checks[i][0]].focus(); return; }
      }
      var button = form.querySelector('button[type="submit"]');
      var label = button.textContent;
      busy = true; button.disabled = true; button.textContent = t.sending; say('');

      var T = root.ShiftTracking;
      fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'lead', business: val('business'), name: val('name'), phone: val('phone'),
          email: val('email'), employees: employees, hours: val('hours') || 'unknown',
          consent: true, consentText: t.consent, lang: lang(),
          page: (root.location && root.location.pathname) || '',
          utm: (T && T.utm && T.utm()) || null,
          website: val('website'), openedAt: openedAt
        })
      }).then(function (response) {
        if (response.ok) {
          form.reset(); openedAt = Date.now();
          say(hoursLine(t), 'ok');
          if (T) T.track('lead');
          return;
        }
        if (response.status === 429) { say(t.busy, 'error'); return; }
        if (response.status === 503) { say(t.down, 'error'); return; }
        if (response.status === 400) {
          return response.json().then(function (b) { say(t.err[b && b.field] || t.failed, 'error'); },
            function () { say(t.failed, 'error'); });
        }
        say(t.failed, 'error');
      }, function () { say(t.failed, 'error'); }).then(function () {
        busy = false; button.disabled = false; button.textContent = label;
      });
    });
  }

  function start() {
    var boxes = document.querySelectorAll('[data-lead-form]');
    Array.prototype.forEach.call(boxes, render);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  root.ShiftLead = { TEXT: TEXT };
})(typeof window !== 'undefined' ? window : globalThis);
