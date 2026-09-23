/* המייל שהעובד מקבל: שם משתמש, סיסמה, ואיך שמים את המערכת על
   מסך הבית.

   שתי החלטות שכדאי להכיר:

   1. הנוסח יושב כאן, בשרת, ולא נשלח מהדפדפן. מנהל ששולח טקסט
      חופשי שייצא מהדומיין שלנו הוא ערוץ דיוג מוכן מראש.

   2. הוראות ההתקנה הן חצי מהמייל. עובד שפותח קישור פעם אחת
      בטלפון ולא מוצא אותו שוב בשבוע הבא – אבד לנו, ואיתו הסיבה
      שהמנהל קנה את המערכת. */
'use strict';

var crypto = require('crypto');

/* ===== הסיסמה =====
   בלי אותיות וספרות שמתבלבלות ביניהן: אפס מול O, אחת מול l.
   עובד שמקליד סיסמה מהמסך של הטלפון לא אמור לנחש. */
var ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';   // 31 תווים

function newPassword() {
  var out = [];
  /* דגימה עם דחייה. modulo פשוט על 256 היה מעדיף את תחילת
     הרשימה, וסיסמה מוטה היא סיסמה קצרה יותר ממה שנראה. */
  var limit = 256 - (256 % ALPHABET.length);
  while (out.length < 12) {
    var bytes = crypto.randomBytes(24);
    for (var i = 0; i < bytes.length && out.length < 12; i++) {
      if (bytes[i] >= limit) continue;
      out.push(ALPHABET[bytes[i] % ALPHABET.length]);
    }
  }
  /* שלוש קבוצות של ארבע: כך קוראים אותה בקול ומקלידים אותה
     בלי לאבוד את המקום. המקף הוא חלק מהסיסמה. */
  return out.slice(0, 4).join('') + '-' + out.slice(4, 8).join('') +
    '-' + out.slice(8, 12).join('');
}

/* ===== הנוסח =====
   שמונה שפות, אותם מפתחות בכולן. בדיקה נפרדת נכשלת אם אחת
   מהן מפגרת אחרי האחרות. */
var COPY = {
  he: {
    subject: '{company} – פרטי הכניסה שלך',
    greeting: 'שלום {name},',
    intro: '{company} פתחו לך גישה למערכת הסידור. שם רואים את המשמרות שלך ומגישים בקשות לשבוע הבא.',
    openApp: 'כניסה למערכת',
    credsTitle: 'פרטי הכניסה',
    userLabel: 'שם משתמש',
    passLabel: 'סיסמה',
    changeHint: 'אפשר להחליף סיסמה מתי שרוצים: במסך הכניסה יש קישור "שכחתי סיסמה".',
    keepSecret: 'הסיסמה אישית. אין להעביר אותה לאף אחד.',
    installTitle: 'כדאי להוסיף את המערכת למסך הבית',
    installWhy: 'אחרי זה היא נפתחת כמו אפליקציה, בלחיצה אחת, בלי לחפש את המייל הזה.',
    iphone: 'אייפון (Safari)',
    iphoneSteps: [
      'פותחים את הקישור בדפדפן Safari',
      'לוחצים על כפתור השיתוף – הריבוע עם החץ כלפי מעלה',
      'גוללים ובוחרים "הוספה למסך הבית"',
      'לוחצים "הוספה"'
    ],
    android: 'אנדרואיד (Chrome)',
    androidSteps: [
      'פותחים את הקישור בדפדפן Chrome',
      'לוחצים על שלוש הנקודות בפינה',
      'בוחרים "התקנת אפליקציה" או "הוספה למסך הבית"',
      'מאשרים'
    ],
    footer: 'המייל נשלח אליך על ידי {company} דרך SetShifts.'
  },
  en: {
    subject: '{company} – your sign-in details',
    greeting: 'Hi {name},',
    intro: '{company} opened an account for you on their shift scheduler. That is where you see your shifts and send requests for next week.',
    openApp: 'Open the scheduler',
    credsTitle: 'Your sign-in details',
    userLabel: 'Username',
    passLabel: 'Password',
    changeHint: 'You can change the password whenever you like: the sign-in screen has a "Forgot password" link.',
    keepSecret: 'This password is yours alone. Do not pass it on to anyone.',
    installTitle: 'Add it to your home screen',
    installWhy: 'It then opens like an app, in one tap, without hunting for this email.',
    iphone: 'iPhone (Safari)',
    iphoneSteps: [
      'Open the link in Safari',
      'Tap the Share button – the square with an arrow pointing up',
      'Scroll down and choose "Add to Home Screen"',
      'Tap "Add"'
    ],
    android: 'Android (Chrome)',
    androidSteps: [
      'Open the link in Chrome',
      'Tap the three dots in the corner',
      'Choose "Install app" or "Add to Home screen"',
      'Confirm'
    ],
    footer: 'Sent to you by {company} through SetShifts.'
  },
  ar: {
    subject: '{company} – تفاصيل الدخول الخاصة بك',
    greeting: 'مرحبًا {name}،',
    intro: 'فتحت {company} لك حسابًا في نظام جدولة الورديات. هناك ترى ورديّاتك وترسل طلباتك للأسبوع القادم.',
    openApp: 'الدخول إلى النظام',
    credsTitle: 'تفاصيل الدخول',
    userLabel: 'اسم المستخدم',
    passLabel: 'كلمة المرور',
    changeHint: 'يمكنك تغيير كلمة المرور متى شئت: في شاشة الدخول يوجد رابط "نسيت كلمة المرور".',
    keepSecret: 'كلمة المرور شخصية. لا تشاركها مع أحد.',
    installTitle: 'أضف النظام إلى الشاشة الرئيسية',
    installWhy: 'بعدها يُفتح مثل أي تطبيق، بضغطة واحدة، دون البحث عن هذه الرسالة.',
    iphone: 'آيفون (Safari)',
    iphoneSteps: [
      'افتح الرابط في متصفح Safari',
      'اضغط على زر المشاركة – المربع مع سهم إلى الأعلى',
      'مرّر للأسفل واختر "إضافة إلى الشاشة الرئيسية"',
      'اضغط "إضافة"'
    ],
    android: 'أندرويد (Chrome)',
    androidSteps: [
      'افتح الرابط في متصفح Chrome',
      'اضغط على النقاط الثلاث في الزاوية',
      'اختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية"',
      'أكّد'
    ],
    footer: 'أُرسلت إليك من {company} عبر SetShifts.'
  },
  de: {
    subject: '{company} – deine Zugangsdaten',
    greeting: 'Hallo {name},',
    intro: '{company} hat dir einen Zugang zur Schichtplanung eingerichtet. Dort siehst du deine Schichten und reichst Wünsche für die nächste Woche ein.',
    openApp: 'Zur Schichtplanung',
    credsTitle: 'Deine Zugangsdaten',
    userLabel: 'Benutzername',
    passLabel: 'Passwort',
    changeHint: 'Du kannst das Passwort jederzeit ändern: Auf der Anmeldeseite gibt es den Link "Passwort vergessen".',
    keepSecret: 'Das Passwort gehört dir allein. Gib es an niemanden weiter.',
    installTitle: 'Leg sie auf den Startbildschirm',
    installWhy: 'Danach öffnet sie sich wie eine App, mit einem Tippen, ohne diese E-Mail zu suchen.',
    iphone: 'iPhone (Safari)',
    iphoneSteps: [
      'Den Link in Safari öffnen',
      'Auf "Teilen" tippen – das Quadrat mit dem Pfeil nach oben',
      'Nach unten scrollen und "Zum Home-Bildschirm" wählen',
      'Auf "Hinzufügen" tippen'
    ],
    android: 'Android (Chrome)',
    androidSteps: [
      'Den Link in Chrome öffnen',
      'Auf die drei Punkte in der Ecke tippen',
      '"App installieren" oder "Zum Startbildschirm zufügen" wählen',
      'Bestätigen'
    ],
    footer: 'Gesendet von {company} über SetShifts.'
  },
  es: {
    subject: '{company} – tus datos de acceso',
    greeting: 'Hola {name}:',
    intro: '{company} te ha dado acceso a su sistema de turnos. Ahí ves tus turnos y envías tus peticiones para la semana siguiente.',
    openApp: 'Entrar al sistema',
    credsTitle: 'Tus datos de acceso',
    userLabel: 'Usuario',
    passLabel: 'Contraseña',
    changeHint: 'Puedes cambiar la contraseña cuando quieras: la pantalla de acceso tiene un enlace "He olvidado la contraseña".',
    keepSecret: 'La contraseña es personal. No se la pases a nadie.',
    installTitle: 'Añádelo a la pantalla de inicio',
    installWhy: 'Después se abre como una aplicación, de un toque, sin buscar este correo.',
    iphone: 'iPhone (Safari)',
    iphoneSteps: [
      'Abre el enlace en Safari',
      'Toca el botón Compartir: el cuadrado con una flecha hacia arriba',
      'Baja y elige "Añadir a pantalla de inicio"',
      'Toca "Añadir"'
    ],
    android: 'Android (Chrome)',
    androidSteps: [
      'Abre el enlace en Chrome',
      'Toca los tres puntos de la esquina',
      'Elige "Instalar aplicación" o "Añadir a pantalla de inicio"',
      'Confirma'
    ],
    footer: 'Enviado por {company} a través de SetShifts.'
  },
  fr: {
    subject: '{company} – vos identifiants',
    greeting: 'Bonjour {name},',
    intro: '{company} vous a ouvert un accès à son planning des équipes. Vous y voyez vos créneaux et envoyez vos demandes pour la semaine suivante.',
    openApp: 'Ouvrir le planning',
    credsTitle: 'Vos identifiants',
    userLabel: 'Identifiant',
    passLabel: 'Mot de passe',
    changeHint: 'Vous pouvez changer le mot de passe quand vous voulez : l\'écran de connexion propose "Mot de passe oublié".',
    keepSecret: 'Ce mot de passe est personnel. Ne le transmettez à personne.',
    installTitle: 'Ajoutez-le à l\'écran d\'accueil',
    installWhy: 'Il s\'ouvre ensuite comme une application, en un geste, sans chercher cet e-mail.',
    iphone: 'iPhone (Safari)',
    iphoneSteps: [
      'Ouvrez le lien dans Safari',
      'Touchez le bouton Partager : le carré avec une flèche vers le haut',
      'Faites défiler et choisissez "Sur l\'écran d\'accueil"',
      'Touchez "Ajouter"'
    ],
    android: 'Android (Chrome)',
    androidSteps: [
      'Ouvrez le lien dans Chrome',
      'Touchez les trois points dans le coin',
      'Choisissez "Installer l\'application" ou "Ajouter à l\'écran d\'accueil"',
      'Confirmez'
    ],
    footer: 'Envoyé par {company} via SetShifts.'
  },
  pt: {
    subject: '{company} – os seus dados de acesso',
    greeting: 'Olá {name},',
    intro: 'A {company} abriu-lhe acesso ao sistema de turnos. Aí vê os seus turnos e envia pedidos para a semana seguinte.',
    openApp: 'Entrar no sistema',
    credsTitle: 'Os seus dados de acesso',
    userLabel: 'Utilizador',
    passLabel: 'Palavra-passe',
    changeHint: 'Pode mudar a palavra-passe quando quiser: no ecrã de entrada há a ligação "Esqueci-me da palavra-passe".',
    keepSecret: 'A palavra-passe é pessoal. Não a passe a ninguém.',
    installTitle: 'Adicione ao ecrã principal',
    installWhy: 'Depois abre como uma aplicação, num toque, sem procurar este e-mail.',
    iphone: 'iPhone (Safari)',
    iphoneSteps: [
      'Abra a ligação no Safari',
      'Toque no botão Partilhar: o quadrado com uma seta para cima',
      'Desça e escolha "Adicionar ao ecrã principal"',
      'Toque em "Adicionar"'
    ],
    android: 'Android (Chrome)',
    androidSteps: [
      'Abra a ligação no Chrome',
      'Toque nos três pontos no canto',
      'Escolha "Instalar aplicação" ou "Adicionar ao ecrã principal"',
      'Confirme'
    ],
    footer: 'Enviado por {company} através do SetShifts.'
  },
  ru: {
    subject: '{company} – ваши данные для входа',
    greeting: 'Здравствуйте, {name}!',
    intro: '{company} открыла вам доступ к системе графиков смен. Там вы видите свои смены и отправляете пожелания на следующую неделю.',
    openApp: 'Войти в систему',
    credsTitle: 'Данные для входа',
    userLabel: 'Логин',
    passLabel: 'Пароль',
    changeHint: 'Пароль можно сменить в любой момент: на экране входа есть ссылка "Забыли пароль".',
    keepSecret: 'Пароль личный. Никому его не передавайте.',
    installTitle: 'Добавьте систему на главный экран',
    installWhy: 'После этого она открывается как приложение, одним касанием, без поиска этого письма.',
    iphone: 'iPhone (Safari)',
    iphoneSteps: [
      'Откройте ссылку в браузере Safari',
      'Нажмите кнопку «Поделиться» – квадрат со стрелкой вверх',
      'Прокрутите и выберите «На экран "Домой"»',
      'Нажмите «Добавить»'
    ],
    android: 'Android (Chrome)',
    androidSteps: [
      'Откройте ссылку в браузере Chrome',
      'Нажмите три точки в углу',
      'Выберите «Установить приложение» или «Добавить на главный экран»',
      'Подтвердите'
    ],
    footer: 'Отправлено компанией {company} через SetShifts.'
  }
};

var RTL = { he: true, ar: true };

function copyFor(lang) {
  var code = String(lang || '').trim().toLowerCase().slice(0, 2);
  return COPY[code] ? { code: code, words: COPY[code] } : { code: 'en', words: COPY.en };
}

function fill(text, params) {
  return String(text).replace(/\{(\w+)\}/g, function (match, key) {
    return params && params[key] !== undefined ? String(params[key]) : match;
  });
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ===== בניית המייל =====
   input: { lang, name, company, email, password, appUrl, logoUrl } */
function build(input) {
  var picked = copyFor(input.lang);
  var w = picked.words;
  var params = { company: input.company || 'SetShifts', name: input.name || '' };
  var rtl = !!RTL[picked.code];
  var dir = rtl ? 'rtl' : 'ltr';
  var side = rtl ? 'right' : 'left';

  function steps(list) {
    return '<ol style="margin:8px 0 0;padding-' + side + ':20px;color:#334155">' +
      list.map(function (step) {
        return '<li style="margin:4px 0">' + esc(step) + '</li>';
      }).join('') + '</ol>';
  }

  var html = '<!doctype html><html dir="' + dir + '" lang="' + picked.code + '"><head>' +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<title>' + esc(fill(w.subject, params)) + '</title></head>' +
    '<body style="margin:0;padding:24px 12px;background:#f1f5f9;' +
      'font-family:Arial,Helvetica,sans-serif;direction:' + dir + '">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;' +
      'padding:24px;text-align:' + side + '">';

  if (input.logoUrl) {
    html += '<img src="' + esc(input.logoUrl) + '" alt="SetShifts" width="150" ' +
      'style="display:block;height:auto;border:0;margin-bottom:16px">';
  }

  html += '<p style="margin:0 0 12px;font-size:17px;color:#0f172a">' +
      esc(fill(w.greeting, params)) + '</p>' +
    '<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155">' +
      esc(fill(w.intro, params)) + '</p>' +
    '<p style="margin:0 0 22px"><a href="' + esc(input.appUrl) + '" ' +
      'style="display:inline-block;background:#2f5fe0;color:#ffffff;text-decoration:none;' +
      'padding:12px 22px;border-radius:10px;font-size:16px;font-weight:bold">' +
      esc(w.openApp) + '</a></p>' +
    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;' +
      'margin:0 0 18px">' +
    '<p style="margin:0 0 10px;font-size:13px;color:#64748b;text-transform:uppercase;' +
      'letter-spacing:.04em">' + esc(w.credsTitle) + '</p>' +
    '<p style="margin:0 0 6px;font-size:15px;color:#0f172a">' + esc(w.userLabel) + ': ' +
      '<strong dir="ltr" style="unicode-bidi:embed">' + esc(input.email) + '</strong></p>' +
    '<p style="margin:0;font-size:15px;color:#0f172a">' + esc(w.passLabel) + ': ' +
      '<strong dir="ltr" style="unicode-bidi:embed;font-family:monospace;font-size:17px">' +
      esc(input.password) + '</strong></p>' +
    '</div>' +
    '<p style="margin:0 0 6px;font-size:14px;color:#334155">' + esc(w.changeHint) + '</p>' +
    '<p style="margin:0 0 24px;font-size:14px;color:#334155">' + esc(w.keepSecret) + '</p>' +
    '<h2 style="margin:0 0 6px;font-size:16px;color:#0f172a">' + esc(w.installTitle) + '</h2>' +
    '<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155">' +
      esc(w.installWhy) + '</p>' +
    '<p style="margin:0;font-size:14px;font-weight:bold;color:#0f172a">' + esc(w.iphone) + '</p>' +
    steps(w.iphoneSteps) +
    '<p style="margin:16px 0 0;font-size:14px;font-weight:bold;color:#0f172a">' +
      esc(w.android) + '</p>' +
    steps(w.androidSteps) +
    '<p style="margin:24px 0 0;font-size:12px;color:#94a3b8">' +
      esc(fill(w.footer, params)) + '</p>' +
    '</div></body></html>';

  var lines = [
    fill(w.greeting, params),
    '',
    fill(w.intro, params),
    '',
    w.openApp + ': ' + input.appUrl,
    '',
    w.credsTitle,
    w.userLabel + ': ' + input.email,
    w.passLabel + ': ' + input.password,
    '',
    w.changeHint,
    w.keepSecret,
    '',
    w.installTitle,
    w.installWhy,
    '',
    w.iphone
  ];
  w.iphoneSteps.forEach(function (step, index) { lines.push((index + 1) + '. ' + step); });
  lines.push('');
  lines.push(w.android);
  w.androidSteps.forEach(function (step, index) { lines.push((index + 1) + '. ' + step); });
  lines.push('');
  lines.push(fill(w.footer, params));

  return {
    lang: picked.code,
    subject: fill(w.subject, params),
    html: html,
    text: lines.join('\n')
  };
}

module.exports = { build: build, newPassword: newPassword, COPY: COPY, LANGS: Object.keys(COPY) };
