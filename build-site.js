/* בונה את האתר לפריסה לתוך site/.
   המבנה שנוצר:
     /            דף המכירה
     /app/        המערכת עם ההתחברות (זה מה שמוסיפים למסך הבית)
     /tool/       הכלי המקומי לעסק אחד, בלי חשבונות
   הרצה: node build-site.js
   הפלט אינו נשמר בגיט – Vercel בונה אותו מחדש בכל פריסה. */
'use strict';

const fs = require('fs');
const path = require('path');
const icons = require('./tools/icons.js');
const seo = require('./tools/seo.js');

/* שכבת התרגום והמודל נטענים גם כאן, בצד השרת, כדי שהעמודים
   ייצאו מהבנייה כשהטקסטים כבר בתוכם. סורק אינו מריץ את מחליף
   השפות, וכל מה שמוחלף רק בדפדפן אינו קיים מבחינתו. */
const I18n = require('./js/i18n/core.js');
seo.LANGUAGES.forEach((lang) => require('./js/i18n/' + lang.code + '.js'));
const Model = require('./js/backend/model.js');

const root = __dirname;

/* התיקייה שמוגשת בפועל, ומולה תיקיית העבודה.

   הבנייה אינה כותבת ישירות ל-site/, והסיבה אינה אסתטית: הסקריפט
   הזה רץ בתוך `vercel build`, ובמקביל אליו רצים בוני הפונקציות
   של Vercel שסורקים את תיקיית הפרויקט. כשמחקנו את site/ בתחילת
   הבנייה, הם נשארו עם רשימת קבצים שכוללת קבצים שכבר אינם – והם
   קרסו על ENOENT באמצע קריאה. זה מירוץ, ולכן הוא נראה כמו תקלה
   מקרית: לפעמים הם הספיקו לקרוא לפני המחיקה ולפעמים לא.

   כאן site/ נשארת שלמה לאורך כל הבנייה, ומוחלפת בסוף בשתי
   פעולות rename – חלון של אלפיות שנייה במקום שתי שניות. */
const finalOut = path.join(root, 'site');
const out = path.join(root, '.site-build');

/* הכתובת הקבועה של האתר. משמשת לקישור הקנוני, לתצוגה המקדימה
   ברשתות ולמפת האתר. אפשר לדרוס דרך PUBLIC_BASE_URL – למשל
   בסביבת בדיקות – ואז כל הקישורים מצביעים לשם. */
const SITE_URL = (process.env.PUBLIC_BASE_URL || 'https://setshifts.com').replace(/\/+$/, '');

/* החיבור ל-Supabase של האתר החי.
   הערכים נכנסים רק לאתר הבנוי, ולא ל-config.js שבמאגר – כך פתיחה
   מקומית של app.html והבדיקות ממשיכות לרוץ במצב הדגמה, בלי לגעת
   בנתונים אמיתיים.

   אין כאן ברירת מחדל בכוונה. כתובת פרויקט קבועה בקוד שורדת את
   הפרויקט עצמו: ביום שמעבירים אזור או מכבים פרויקט ישן, בנייה
   בלי משתני סביבה הייתה מפנה לקוחות לבסיס נתונים מת בלי להגיד
   מילה. בלי הערכים האלה האתר נבנה במצב הדגמה מוצהר, עם באנר. */
/* המסך של Supabase מציג את הכתובת כ-API URL, עם /rest/v1/ בסוף.
   זו הכתובת שמועתקת בפועל, והיא שוברת כל בקשה בהודעה סתומה. */
const SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/(rest|auth|storage|realtime|functions)\/v\d+$/i, '')
  .replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

/* ===== הפרטים של העמודים המשפטיים =====

   בעמודים האלה יש עובדות שרק בעל העסק יודע: השם הרשום, הכתובת,
   האזור שבו הוקם פרויקט Supabase והדין החל. ניחוש שלנו שם היה
   הצהרה שגויה במסמך מחייב, ולכן הם נכנסים כמשתני סביבה – והבנייה
   צועקת כשהם חסרים במקום להשתיק את הבעיה. */
/* שם הסימון בעמוד ⇄ שם משתנה הסביבה. הם אינם תמיד זהים, ולכן
   הם יושבים כאן יחד: אזהרה שמדפיסה את שם הסימון שולחת את מי
   שקורא אותה להקליד ב-Vercel שם שהבנייה אינה מחפשת. */
const LEGAL_ENV = {
  LEGAL_ENTITY: 'LEGAL_ENTITY',
  /* מספר עוסק מורשה או ח.פ. חובה להציג אותו באתר מסחרי, ולכן
     הוא שדה נפרד ולא חלק מהשם – כדי שלא יישכח בתוכו. */
  LEGAL_ID: 'LEGAL_ID',
  LEGAL_ADDRESS: 'LEGAL_ADDRESS',
  DATA_REGION: 'DATA_REGION',
  PAYMENT_PROVIDER: 'PAYMENT_PROVIDER',
  JURISDICTION: 'LEGAL_JURISDICTION',
  JURISDICTION_COURT: 'LEGAL_COURT',
  /* רכז נגישות. התקנות דורשות שם וטלפון של אדם שאפשר להגיע
     אליו — לא כתובת כללית. שדות נפרדים כדי שלא ייבלעו זה בזה. */
  A11Y_CONTACT: 'A11Y_CONTACT_NAME',
  A11Y_PHONE: 'A11Y_CONTACT_PHONE'
};

const LEGAL = {
  EFFECTIVE_DATE: process.env.LEGAL_EFFECTIVE_DATE ||
    new Date().toISOString().slice(0, 10),
  SUPPORT_EMAIL: 'support@setshifts.com',
  /* שעות המענה האנושי של SetShifts בלבד. אינן קשורות לשעות ולהגדרות
     שבתוך המערכת של כל עסק (סניפים, משמרות, שעות פתיחה). */
  SUPPORT_FROM: Model.SUPPORT_HOURS_FROM,
  SUPPORT_TO: Model.SUPPORT_HOURS_TO,
  SUPPORT_HOURS_HE: 'ראשון עד חמישי, ' + Model.SUPPORT_HOURS_FROM + '–' + Model.SUPPORT_HOURS_TO,
  SUPPORT_HOURS_EN: 'Sunday to Thursday, ' + Model.SUPPORT_HOURS_FROM + '–' + Model.SUPPORT_HOURS_TO,
  TRIAL_DAYS: '30'
};
Object.keys(LEGAL_ENV).forEach((key) => {
  LEGAL[key] = (process.env[LEGAL_ENV[key]] || '').trim();
});

const legalMissing = [];

function fillLegal(html) {
  /* גם ספרות. שם סימון כמו A11Y_CONTACT עבר כאן בשקט בלי
     החלפה ובלי אזהרה, כי הביטוי קיבל אותיות וקו תחתון בלבד —
     וסימון שאינו מוחלף ואינו מתריע הוא בדיוק מה שמגיע לאוויר. */
  return html.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    if (!(key in LEGAL)) return match;
    if (!LEGAL[key]) {
      if (legalMissing.indexOf(key) === -1) legalMissing.push(key);
      /* סימון גלוי, כדי שאי אפשר יהיה לפרסם את העמוד בלי לראות
         שמשהו חסר בו */
      return '[' + key + ']';
    }
    return LEGAL[key];
  });
}

function rm(target) { fs.rmSync(target, { recursive: true, force: true }); }
function mkdir(target) { fs.mkdirSync(target, { recursive: true }); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(relative, content) {
  const target = path.join(out, relative);
  mkdir(path.dirname(target));
  fs.writeFileSync(target, content);
}

/* העתקת תיקייה שלמה, כולל תת-תיקיות */
function copyDir(from, to, filter) {
  fs.readdirSync(path.join(root, from), { withFileTypes: true }).forEach((entry) => {
    const rel = path.join(from, entry.name);
    if (entry.isDirectory()) {
      /* צילומי המסך של מדריך המנהל הם חומר מקור ל-PDF. האתר צריך
         את ה-PDF בלבד, ולא שני מגה של תמונות שאיש לא מבקש. */
      if (rel === path.join('assets', 'manager-guide')) return;
      copyDir(rel, path.join(to, entry.name), filter);
      return;
    }
    if (filter && !filter(entry.name)) return;
    const target = path.join(out, to, entry.name);
    mkdir(path.dirname(target));
    fs.copyFileSync(path.join(root, rel), target);
  });
}

/* רק תיקיית העבודה נמחקת. site/ נשארת על מקומה עד הסוף. */
rm(out);
mkdir(out);

/* ===== נכסים משותפים ===== */
copyDir('css', 'css');
copyDir('js', 'js', (name) => name.endsWith('.js'));
/* הלוגו. קובץ המקור אינו נדרש באתר החי – ממנו נגזרו כל השאר. */
copyDir('brand', 'brand', (name) => name.endsWith('.png') && name !== 'logo-source.png');

/* נכסי הסרטון. ה-mp4 עצמו אינו במאגר כל עוד הוא לא צולם; אם
   הוא קיים – הוא נוסע איתם. README אינו חלק מהאתר. */
copyDir('assets', 'assets', (name) => !name.endsWith('.md'));

/* מדריך המנהל להורדה, מתוך אפליקציית המנהל. הקובץ מופק ב-
   tools/manager-guide-pdf.mjs ונשמר במאגר, כך שהבנייה עצמה אינה
   צריכה דפדפן. */
mkdir(path.join(out, 'guide'));
fs.copyFileSync(path.join(root, 'docs', 'manager-guide', 'manager-guide.pdf'),
  path.join(out, 'guide', 'manager-guide-he.pdf'));

/* ===== אייקונים ===== */
const ICONS = [
  { file: 'icon-32.png', size: 32, square: true },
  { file: 'icon-192.png', size: 192, square: true },
  { file: 'icon-512.png', size: 512, square: true },
  /* apple-touch-icon לא יכול להיות שקוף, ואייפון מעגל אותו בעצמו */
  { file: 'apple-touch-icon.png', size: 180, square: true },
  /* maskable – מערכת ההפעלה חותכת ממנו צורה, ולכן שוליים רחבים */
  { file: 'icon-maskable-512.png', size: 512, square: true, padding: 0.12 }
];
ICONS.forEach((icon) => {
  write(path.join('icons', icon.file), icons.drawIcon(icon.size, icon));
});
/* תמונת השיתוף: מה שמופיע כשמדביקים קישור לאתר. ריבוע של אייקון
   נראה שם אבוד, ולכן זו הנעילה המלאה ביחס שהרשתות מצפות לו. */
write(path.join('icons', 'social.png'), icons.drawSocial(1200, 630));
/* תמונת הפתיחה של הסרטון, נגזרת מהלוגו בכל בנייה – כך היא לא
   מתיישנת אם הלוגו מתעדכן. */
/* אם בתיקיית המקור כבר יש תמונת פתיחה (למשל פריים מהסרטון עצמו),
   היא נשארת כמות שהיא: copyDir העתיק אותה. רק בלעדיה היא נגזרת
   מהלוגו, כדי שבנייה לא תמחק תמונה אמיתית. */
if (!fs.existsSync(path.join(root, 'assets', 'video', 'poster.png'))) {
  write(path.join('assets', 'video', 'poster.png'), icons.drawPoster(1280, 720));
}

/* ===== manifest לכל אפליקציה ===== */
function manifest(options) {
  return JSON.stringify({
    name: options.name,
    short_name: options.shortName,
    description: options.description,
    start_url: options.startUrl,
    scope: options.startUrl,
    id: options.startUrl,
    display: 'standalone',
    orientation: 'any',
    background_color: '#f1f4fa',
    theme_color: '#23499f',
    dir: 'auto',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }, null, 2);
}

write('app/manifest.webmanifest', manifest({
  name: 'SetShifts',
  shortName: 'SetShifts',
  description: 'Automatic shift scheduling for businesses with more than one location.',
  startUrl: '/app/'
}));

write('tool/manifest.webmanifest', manifest({
  name: 'SetShifts',
  shortName: 'SetShifts',
  description: 'Weekly shift scheduling, on this device.',
  startUrl: '/tool/'
}));

/* ===== קישור האפליקציה לאנדרואיד (Digital Asset Links) =====

   אפליקציית TWA היא ה-PWA עצמו, במסך מלא ובלי סרגל כתובת של
   כרום. מה שמוחק את סרגל הכתובת הוא הקובץ הזה: הוא מצהיר
   שהאפליקציה החתומה בטביעת האצבע הזו רשאית לייצג את הדומיין.
   בלעדיו האפליקציה נפתחת עם סרגל — כלומר נראית בדיוק כמו מה
   שהיא, אתר בתוך מסגרת.

   נכתב רק כששני המשתנים מוגדרים, מפני שטביעת האצבע נוצרת
   בעת יצירת מפתח החתימה — כלומר אחרי שנפתח חשבון המפתח.
   קובץ עם ערך מדומה גרוע מקובץ שאינו קיים: הוא נראה מוגדר. */
const androidPackage = String(process.env.ANDROID_PACKAGE || '').trim();
const androidFingerprint = String(process.env.ANDROID_FINGERPRINT || '').trim();
if (androidPackage && androidFingerprint) {
  write('.well-known/assetlinks.json', JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: androidPackage,
      /* אפשר יותר מטביעה אחת: מפתח ההעלאה ומפתח החתימה של
         Google Play אינם אותו מפתח, ושניהם צריכים להופיע. */
      sha256_cert_fingerprints: androidFingerprint.split(',')
        .map((value) => value.trim()).filter(Boolean)
    }
  }], null, 2));
}

/* ===== Service Worker ===== */
/* קובץ אחד בשורש, כדי שהיקף השליטה שלו יכסה גם /app וגם /tool */
fs.copyFileSync(path.join(root, 'sw.js'), path.join(out, 'sw.js'));

/* ===== העמודים ===== */
/* הקבצים במקור יושבים בשורש הפרויקט ומפנים ל-"css/..." ו-"js/...".
   כשהם עוברים לתת-תיקייה, הנתיבים היחסים נשברים – ולכן ממירים
   אותם לנתיבים מוחלטים. */
function toAbsolutePaths(html) {
  const asset = /^(css|js|icons|brand|assets)\//;
  return html
    .replace(/(src|href)="(?!https?:|\/|#|data:|mailto:)([^"]+)"/g, (match, attr, value) => {
      if (asset.test(value)) return attr + '="/' + value + '"';
      return match;
    })
    /* srcset הוא רשימה, ולכן הוא לא נתפס בכלל שלמעלה. התמונה
       הראשית מוגשת בארבעה רוחבים, ובלי השורה הזו כל הגרסאות
       הקטנות נשברו בדפי השפה — כלומר הטלפון היה מוריד דווקא
       את הקובץ הגדול, או לא מוריד כלום. */
    .replace(/srcset="([^"]+)"/g, (match, value) =>
      'srcset="' + value.split(',').map((entry) => {
        const trimmed = entry.trim().replace(/\s+/g, ' ');
        return asset.test(trimmed) ? '/' + trimmed : trimmed;
      }).join(', ') + '"');
}

/* האם יש סליקה מחוברת ומוכנה.

   דף המכירה סטטי ואינו יכול לשאול את השרת, ולכן המצב נחרט בו
   בזמן הבנייה. בלי זה ההבטחה על הכרטיס הייתה קבועה בקוד – נכונה
   היום, ושקר ביום שהסליקה נדלקת.

   ספק מדומה אינו סליקה, וספק אמיתי שאינו מוכן גם לא. */
function billingIsLive() {
  const provider = String(process.env.BILLING_PROVIDER || '').trim();
  if (!provider || provider === 'mock') return false;
  if (provider === 'payplus') return process.env.PAYPLUS_READY === 'true';
  return true;
}

function markBilling(html) {
  if (!billingIsLive()) return html;
  return html.replace('window.SHIFT_BILLING_LIVE = false;',
    'window.SHIFT_BILLING_LIVE = true;');
}

/* האם ערוץ הוואטסאפ לעובדים חי.

   שלושה תנאים, וכולם הכרחיים: טוקן, מספר מחובר, ושם תבנית
   מאושרת. חסר אחד מהם — ההודעות אינן יוצאות, ותוספת ההתראות
   אינה מוצעת למכירה בכלל. אחרת לקוח מחויב 9 ש"ח לעובד ומקבל
   כלום, והוא לא יגלה את זה: העובדים פשוט לא מקבלים הודעה, וזה
   נראה כמו שירות שלא עבד מלכתחילה. */
function waStaffIsLive() {
  return !!(String(process.env.WHATSAPP_TOKEN || '').trim() &&
    String(process.env.WHATSAPP_PHONE_ID || '').trim() &&
    String(process.env.WHATSAPP_STAFF_TEMPLATE || '').trim());
}

function markWaStaff(html) {
  if (!waStaffIsLive()) return html;
  return html.replace('window.SHIFT_WA_STAFF_LIVE = false;',
    'window.SHIFT_WA_STAFF_LIVE = true;');
}

/* האם הסרטון קיים. הדף נשלח כבר במצב הנכון, ולכן אין בדיקה
   מהדפדפן – ואין 404 בקונסול של כל מבקר. */
function markVideo(html) {
  const mp4 = path.join(root, 'assets', 'video', 'setshifts-demo-he.mp4');
  const ready = fs.existsSync(mp4);
  if (!ready) return html;

  /* כתוביות שאינן תואמות לסרטון גרועות מכתוביות שאינן קיימות:
     מי שקורא אותן מקבל תוכן שגוי ובטוח שהוא נכון. הקובץ נולד
     כטיוטה עם הערה בראשו, ולכן אפשר לזהות שהוא עדיין כזה. */
  const vtt = path.join(root, 'assets', 'video', 'setshifts-demo-he.vtt');
  let draftCaptions = false;
  if (fs.existsSync(vtt)) {
    const text = fs.readFileSync(vtt, 'utf8');
    draftCaptions = text.indexOf('אחרי שמחליפים את setshifts-demo-he.mp4') !== -1;
  }

  html = html.replace('data-video-ready="0"', 'data-video-ready="1"');

  if (draftCaptions) {
    /* כתוביות טיוטה אינן נשלחות כלל. הן אינן "טוב יותר מכלום":
       מי שקורא אותן מקבל תוכן שאינו מה שנאמר בסרטון, ובטוח
       שהוא נכון. הנגן מסיר את הכתוביות אם אין data-captions. */
    html = html.replace(/\s*data-captions="[^"]*"/, '');
    /* markVideo רץ לכל עמוד שפה; האזהרה נאמרת פעם אחת */
    if (!markVideo.warned) {
      markVideo.warned = true;
      console.log('\n  ⚠ הכתוביות עדיין טיוטה, ולכן אינן נשלחות עם הסרטון.');
      console.log('    להחליף את assets/video/setshifts-demo-he.vtt בתמלול אמיתי.\n');
    }
  }

  return html;
}

/* כותרת ותיאור דף המכירה, לשימוש חוזר בתגיות השיתוף.
   נשלפים מהקובץ עצמו כדי שלא יהיו שני מקומות לעדכן. */
function metaOf(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [, ''])[1].trim();
  const description = (html.match(/<meta name="description"[^>]*content="([^"]*)"/) || [, ''])[1];
  return { title: title, description: description };
}

/* אותן שתי הגנות שב-tools/seo.js. עותק כאן היה עוד מקום
   שמתיישן בשקט ביום שמוסיפים לו תו. */
const escapeAttr = seo.escapeAttr;
const escapeText = seo.escapeText;

/* תגיות שכל עמוד צריך: אייקון, manifest ומצב אפליקציה באייפון */
function headExtras(options) {
  /* רק לעמודים שיש להם manifest. עמודי התוכן לא קיבלו אחד,
     ולכן נשלח להם href="undefined" — כלומר כל ביקור ב"שאלות
     נפוצות" ביקש מהשרת /faq/undefined וקיבל 404. בדפדפן זו
     שורה אדומה בקונסול; אצל סורק זו כתובת שבורה שנמצאה
     בעמוד, וסורק סופר כאלה. */
  return (options.manifest
    ? ['<link rel="manifest" href="' + options.manifest + '">'] : []).concat([
    '<link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32.png">',
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
    '<meta name="theme-color" content="#23499f">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    '<meta name="apple-mobile-web-app-title" content="SetShifts">',
    '<meta name="format-detection" content="telephone=no">'
  ]).concat(options.canonical ? ['<link rel="canonical" href="' + SITE_URL + options.canonical + '">'] : [])
    /* המערכת והכלי אינם עמודי תוכן, ואין סיבה שיופיעו בחיפוש.
       לעמוד שכן נסרק נאמר במפורש שמותר להציג ממנו קטע מלא
       ותמונה גדולה — בלי זה התוצאה מקבלת חיתוך שמרני, ותוצאה
       עם תמונה נלחצת יותר מתוצאה בלי. */
    .concat([options.noindex
      ? '<meta name="robots" content="noindex, follow">'
      : '<meta name="robots" content="index, follow, max-snippet:-1, ' +
        'max-image-preview:large, max-video-preview:-1">'])
    /* alternates: true לדף הבית, או שם תת-הנתיב לעמוד תוכן —
       כדי ש-/de/faq/ יצהיר על /faq/ ולא על /. הצהרה שמפנה לדף
       הבית במקום לעמוד המקביל מוציאה את העמוד מהקבוצה. */
    .concat(options.alternates
      ? seo.alternateTags(SITE_URL,
        options.alternates === true ? null : options.alternates) : [])
    .concat(options.social ? seo.socialTags(options.social) : [])
    .concat((options.structured || []).map(seo.jsonLd))
    /* השפה שהעמוד כבר נשלח בה, לפני שקוד כלשהו רץ. בלי זה
       js/i18n/dom.js היה בוחר שפה לפי הדפדפן ומצייר מחדש את
       העמוד — כלומר הכתובת אומרת /en/ והמבקר רואה עברית. */
    /* ותווית כפתור "דברו איתנו", שנבנה ב-js/talk.js. עמוד תוכן
       אינו טוען מילוני תרגום — הוא נשלח מתורגם — ולכן התווית
       שלו נחרטת כאן. */
    .concat(options.pageLang ? ['<script>window.SHIFT_PAGE_LANG=' +
      JSON.stringify(options.pageLang.code) + ';window.SHIFT_PAGE_LANG_FIXED=' +
      (options.pageLang.code !== seo.DEFAULT_LANG) + ';window.SHIFT_TALK_LABEL=' +
      JSON.stringify(I18n.t('landing.contact')) + ';</script>'] : [])
    .join('\n');
}

/* רישום ה-Service Worker. נעשה כאן ולא בקוד האפליקציה, כי רק
   בגרסה המתארחת יש לו משמעות – בקובץ מקומי הוא לא נתמך. */
const SW_REGISTER = `
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () { /* לא קריטי */ });
    });
  }
</script>`;

function page(source, target, options) {
  const opts = options || {};
  let html = markWaStaff(markBilling(markVideo(fillLegal(toAbsolutePaths(read(source))))));
  /* מה שקורה לעמוד לפני שהוא נשלח: תרגום בזמן הבנייה, והפיכת
     הקישורים היחסיים למוחלטים כשהוא יורד לתת-תיקייה. */
  if (opts.transform) html = opts.transform(html);
  html = html.replace('</head>', headExtras(opts) + '\n</head>');
  /* המשרד האחורי אינו עובד במצב לא מקוון ואינו אמור להישמר
     במטמון של המכשיר. מסך שרואה את כל הלקוחות לא צריך להשאיר
     עותק על דיסק. */
  if (!opts.noServiceWorker) {
    html = html.replace('</body>', SW_REGISTER + '\n</body>');
  }
  write(target, html);
}

/* ===== דף המכירה, פעם אחת לכל שפה =====

   עד כאן שמונה השפות היו קיימות רק בדפדפן: אותו קובץ נשלח לכל
   מי שביקש, והטקסטים הוחלפו אחרי הטעינה. מבחינת מנוע חיפוש זה
   אתר בעברית בלבד — שבע שפות שאיש לא יכול למצוא.

   עכשיו לכל שפה יש כתובת משלה, הטקסטים כבר בתוך הקובץ, וכל
   עמוד מצהיר על כל האחרים ב-hreflang. העברית נשארת בשורש: זו
   הכתובת שכבר קיימת, ולהעביר אותה ל-/he/ היה מוחק את מה שנצבר
   בה. */

/* המחירון לנתונים המובנים. נקרא מ-model.js ולא נכתב כאן שוב:
   מחיר שמופיע בגוגל ואינו המחיר באתר הוא בדיוק מה שגורם לגוגל
   להוריד את התוצאה המורחבת, ובינתיים מביא לקוחות שמגלים מחיר
   אחר ממה שהובטח. */
function plansForSchema() {
  return Model.PLAN_ORDER.map((id) => {
    const plan = Model.PLANS[id];
    return {
      id: plan.id, name: plan.name, range: plan.range,
      priceMonthly: plan.priceMonthly, quote: plan.quote
    };
  });
}

/* מה המוצר יודע לעשות, בלשון של מי שמחפש. נגזר מהמפתחות של
   מקטע היכולות בדף עצמו, כדי שרשימה שתשתנה בעמוד תשתנה גם כאן. */
const FEATURE_KEYS = [
  'landing.feature1Title', 'landing.feature2Title', 'landing.feature3Title',
  'landing.feature4Title', 'landing.feature5Title', 'landing.feature6Title'
];

function landingStructured(lang) {
  const description = I18n.t('landing.metaDescription');
  const features = FEATURE_KEYS
    .map((key) => I18n.t(key))
    .filter((text, index) => text && text !== FEATURE_KEYS[index]);
  return [
    seo.organization(SITE_URL, {
      legalName: LEGAL.LEGAL_ENTITY || null,
      supportEmail: Model.SUPPORT_EMAIL
    }),
    seo.softwareApplication(SITE_URL, {
      description: description,
      features: features,
      plans: plansForSchema(),
      currency: 'ILS',
      pricingPath: '/pricing/'
    }),
    /* לשונית שפה אינה עמוד נפרד, ולכן אין כאן פירורי לחם —
       דף הבית הוא השורש עצמו. */
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': SITE_URL + seo.pathOf(lang.code) + '#webpage',
      url: SITE_URL + seo.pathOf(lang.code),
      name: I18n.t('landing.pageTitle'),
      description: description,
      inLanguage: lang.code,
      isPartOf: { '@id': SITE_URL + '/#organization' }
    }
  ];
}

seo.LANGUAGES.forEach((lang) => {
  I18n.use(lang.code);
  const here = seo.pathOf(lang.code);
  page('landing.html',
    lang.code === seo.DEFAULT_LANG ? 'index.html' : lang.code + '/index.html', {
      manifest: '/app/manifest.webmanifest',
      canonical: here,
      alternates: true,
      pageLang: lang,
      social: {
        siteUrl: SITE_URL,
        url: SITE_URL + here,
        ogLocale: lang.ogLocale,
        title: I18n.t('landing.pageTitle'),
        description: I18n.t('landing.metaDescription')
      },
      structured: landingStructured(lang),
      transform: (html) =>
        seo.absoluteLinks(seo.translate(html, (key) => I18n.t(key), lang), lang.code)
    });
});
I18n.use(seo.DEFAULT_LANG);
page('app.html', 'app/index.html', { manifest: '/app/manifest.webmanifest', noindex: true });
page('index.html', 'tool/index.html', { manifest: '/tool/manifest.webmanifest', noindex: true });

/* המשרד האחורי. אינו מופיע ב-robots ואינו מקושר משום מקום:
   מי שאינו יודע את הכתובת לא יגיע אליה במקרה. זו אינה ההגנה –
   ההגנה היא PLATFORM_OWNER_EMAILS בשרת – אבל אין סיבה לפרסם. */
page('admin.html', 'admin/index.html', { noindex: true, noServiceWorker: true });

/* ===== העמודים המשפטיים =====

   מדיניות פרטיות, תנאי שימוש, אבטחה והצהרת נגישות. אלה נשארים
   עברית ואנגלית באותה כתובת, עם בורר בתוך העמוד (js/legal.js),
   ובכוונה: מסמך משפטי מתורגם בלי שעורך דין קרא אותו הוא
   התחייבות שאיש לא בדק, והצהרת נגישות היא הצהרה על תקנות
   ישראליות שאינה חלה על מבקר מגרמניה. */
const LEGAL_PAGES = [
  { file: 'privacy.html', dir: 'privacy', label: 'עמוד משפטי' },
  { file: 'terms.html', dir: 'terms', label: 'עמוד משפטי' },
  { file: 'security.html', dir: 'security', label: 'עמוד משפטי' },
  { file: 'accessibility.html', dir: 'accessibility', label: 'עמוד משפטי' }
];

/* מה שכל עמוד דו-לשוני מקבל: תצוגה מקדימה משלו, שביל שמוביל
   אליו, וזהות המוצר.

   עד כאן אף עמוד כזה לא נשא תגיות שיתוף, ולכן קישור אליו
   שנשלח בוואטסאפ הופיע בלי כותרת ובלי תיאור — כלומר נראה כמו
   קישור מפוקפק. */
function proseHead(item) {
  const meta = metaOf(read(item.file));
  const here = '/' + item.dir + '/';
  const structured = [
    seo.organization(SITE_URL, { supportEmail: Model.SUPPORT_EMAIL }),
    seo.breadcrumbs(SITE_URL, [
      { name: 'SetShifts', path: '/' },
      { name: item.label, path: here }
    ])
  ];
  /* השאלות נקראות מהעמוד עצמו. שאלה שתשתנה בעמוד ולא כאן
     הייתה נשלחת לגוגל כתשובה שאינה מופיעה בו — וזו בדיוק ההפרה
     שבגללה מוסרת התוצאה המורחבת. */
  if (item.faq) {
    /* fillLegal קודם: העמוד הגולמי מכיל סימונים כמו
       {{SUPPORT_EMAIL}}, ותשובה שנשלחת לגוגל עם סימון בתוכה
       אינה התשובה שמופיעה בעמוד. */
    const items = seo.faqFromHtml(fillLegal(read(item.file)), 'he');
    if (items.length) structured.push(seo.faqPage(items));
  }
  return {
    canonical: here,
    social: {
      siteUrl: SITE_URL, url: SITE_URL + here, ogLocale: 'he_IL',
      title: meta.title, description: meta.description
    },
    structured: structured
  };
}

LEGAL_PAGES.forEach((item) => {
  page(item.file, item.dir + '/index.html', proseHead(item));
});

/* מדריך לעובד. עמוד ציבורי בכוונה: מנהל שולח את הקישור לקבוצת
   העובדים, ומי שפותח אותו עוד לא התחבר לשום דבר. */
page('guide.html', 'guide/index.html',
  proseHead({ file: 'guide.html', dir: 'guide', label: 'מדריך לעובד/ת' }));

/* ===== עמודי התוכן, פעם אחת לכל שפה =====

   מי אנחנו, איפה זה עוזר, מחירים, שאלות נפוצות וצור קשר. כולם
   נכנסים למנועי החיפוש בכוונה: עסק שמחפש "האם אפשר לסמוך
   עליהם" או "כמה זה עולה" מגיע בדיוק לשם.

   עד כאן כל אחד מהם היה קובץ שהכיל שתי גרסאות של הטקסט —
   עברית ואנגלית — ובורר שהחליף ביניהן. כלומר כתובת אחת לשתי
   שפות, ושש שפות שלא היו קיימות. עכשיו המסגרת יושבת ב-page.html
   פעם אחת, הטקסט ב-content/<עמוד>/<שפה>.html, וכל צירוף מקבל
   כתובת משלו.

   ל"שאלות נפוצות" ול"מחירים" עדיפות גבוהה יותר במפת האתר ולא
   במקרה: מי שמחפש "תוכנה לסידור עבודה כמה עולה" מגיע בדיוק
   לשם, וזו שאילתה של כוונת קנייה ולא של סקרנות. */
const CONTENT_PAGES = [
  { dir: 'about', key: 'landing.about', priority: '0.6' },
  { dir: 'stories', key: 'landing.stories', priority: '0.6' },
  { dir: 'pricing', key: 'landing.pricing',
    priority: '0.8', changefreq: 'monthly', faq: true },
  { dir: 'faq', key: 'landing.faq',
    priority: '0.7', changefreq: 'monthly', faq: true },
  /* הטופס בעמוד צור קשר. model.js קודם: contact.js קורא ממנו
     את מספר הוואטסאפ, ובלעדיו הבלוק פשוט אינו מוצג. */
  { dir: 'contact', key: 'landing.contact', priority: '0.6',
    scripts: ['/js/backend/model.js', '/js/contact.js', '/js/lead.js'] }
];

function contentFile(dir, code) {
  return path.join('content', dir, code + '.html');
}

/* כותרת ותיאור יושבים בראש קטע התוכן עצמו, ולא בטבלה כאן: מי
   שכותב את הטקסט בשפה כלשהי כותב גם את מה שיופיע עליו בתוצאות
   החיפוש, באותו קובץ, ולא נזכר בזה במקום אחר. */
function contentMeta(text, where) {
  const header = text.match(/^\s*<!--([\s\S]*?)-->/);
  if (!header) throw new Error(where + ': אין כותרת (title/description) בראש הקובץ');
  const meta = {};
  header[1].split('\n').forEach((line) => {
    const pair = line.match(/^\s*([a-z]+)\s*:\s*(.+?)\s*$/);
    if (pair) meta[pair[1]] = pair[2];
  });
  ['title', 'description'].forEach((field) => {
    if (!meta[field]) throw new Error(where + ': חסר ' + field);
  });
  return meta;
}

function contentBody(text) {
  return text.replace(/^\s*<!--[\s\S]*?-->\s*/, '');
}

/* בורר השפה. כל אפשרות היא הכתובת של אותו עמוד בשפה אחרת, כדי
   שהחלפת שפה תהיה מעבר לעמוד ולא החלפת טקסטים במקום — אחרת
   הכתובת שבסרגל אומרת דבר אחד והעמוד מראה אחר. */
function languageOptions(dir, current) {
  const names = {};
  I18n.list().forEach((lang) => { names[lang.code] = lang.name; });
  return seo.LANGUAGES.map((lang) =>
    '<option value="' + seo.pathOf(lang.code, dir) + '"' +
    ' data-lang="' + lang.code + '" lang="' + lang.code + '"' +
    (lang.code === current ? ' selected' : '') + '>' +
    escapeAttr(names[lang.code] || lang.code) + '</option>').join('');
}

/* סימון שלא הוחלף אינו "חסר משהו" אלא עמוד שבור: המסגרת נשלחת
   בלי כותרת, בלי תוכן או עם הערה במקום סקריפט, ואיש לא רואה
   את זה עד שמישהו פותח את העמוד באוויר. */
function fillMarker(html, marker, value, where) {
  if (html.indexOf(marker) === -1) {
    throw new Error(where + ': הסימון ' + marker + ' אינו קיים ב-page.html');
  }
  /* פונקציה ולא מחרוזת. ב-String.replace, ‎$‎ במחרוזת ההחלפה הוא
     תו מיוחד: ‎$&‎ מכניס את מה שנמצא, ו-‎$'‎ את כל שאר המסמך. כאן
     מוכנס לתוך העמוד טקסט שנכתב ביד — כותרת, תיאור, ומאמר שלם —
     וסימן דולר אחד בו היה מעתיק חלקים מהעמוד לתוך עצמו בשקט. */
  return html.replace(marker, function () { return value; });
}


CONTENT_PAGES.forEach((item) => {
  seo.LANGUAGES.forEach((lang) => {
    I18n.use(lang.code);
    const where = contentFile(item.dir, lang.code);
    const source = read(where);
    const meta = contentMeta(source, where);
    const title = meta.title + ' · SetShifts';
    /* קישורים בתוך הטקסט נכתבים פעם אחת כ-/contact/, ועוברים
       כאן לשפה של העמוד. בלי זה כל קישור בתוך פסקה גרמנית מחזיר
       את הקורא לעברית. */
    const body = seo.localizeLinks(fillLegal(contentBody(source)), lang.code);
    const article = '<article lang="' + lang.code + '" dir="' + lang.dir + '">\n' +
      body.replace(/\s+$/, '') + '\n</article>';
    const here = seo.pathOf(lang.code, item.dir);
    const label = I18n.t(item.key);

    const structured = [
      seo.organization(SITE_URL, { supportEmail: Model.SUPPORT_EMAIL }),
      seo.breadcrumbs(SITE_URL, [
        { name: 'SetShifts', path: seo.pathOf(lang.code) },
        { name: label, path: here }
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': SITE_URL + here + '#webpage',
        url: SITE_URL + here,
        name: title,
        description: meta.description,
        inLanguage: lang.code,
        isPartOf: { '@id': SITE_URL + '/#organization' }
      }
    ];
    /* השאלות נקראות מהקטע בשפה הזו, ולא מהעברית: תשובה שנשלחת
       לגוגל בשפה שאינה שפת העמוד אינה מופיעה בו. */
    if (item.faq) {
      const items = seo.faqFromHtml(body, lang.code);
      if (items.length) structured.push(seo.faqPage(items));
    }

    page('page.html', (lang.code === seo.DEFAULT_LANG ? '' : lang.code + '/') +
      item.dir + '/index.html', {
      canonical: here,
      alternates: item.dir,
      pageLang: lang,
      social: {
        siteUrl: SITE_URL, url: SITE_URL + here, ogLocale: lang.ogLocale,
        title: title, description: meta.description
      },
      structured: structured,
      transform: (html) => {
        let out = seo.absoluteLinks(
          seo.translate(html, (key) => I18n.t(key), lang), lang.code);
        out = fillMarker(out, '<title></title>',
          '<title>' + escapeText(seo.plainText(title)) + '</title>', where);
        out = fillMarker(out, '<meta name="description" content="">',
          '<meta name="description" content="' + escapeAttr(meta.description) + '">',
          where);
        out = fillMarker(out, '<!--LANGUAGE_OPTIONS-->',
          languageOptions(item.dir, lang.code), where);
        /* הלשונית של העמוד הנוכחי. data-tab ולא ההפניה עצמה:
           אותה הפניה מופיעה גם בכותרת התחתונה, ושם aria-current
           היה אומר לקורא מסך שיש שני עמודים נוכחיים. */
        out = fillMarker(out, 'data-tab="' + item.dir + '"',
          'data-tab="' + item.dir + '" aria-current="page"', where);
        out = fillMarker(out, '<!--PAGE_SCRIPTS-->',
          (item.scripts || []).map((src) =>
            '<script src="' + src + '"></script>').join('\n'), where);
        /* התוכן נכנס אחרון, אחרי שכל מה שעובד על המסגרת כבר רץ:
           הוא כבר בשפה הנכונה, וכל מעבר נוסף עליו הוא רק הזדמנות
           לשנות אותו בטעות. */
        return fillMarker(out, '<!--ARTICLE-->', article, where);
      }
    });
  });
});
I18n.use(seo.DEFAULT_LANG);

/* הגדרות החיבור לשרת, נכתבות מחדש לכל פריסה.
   המפתח הזה מיועד לדפדפן ואינו סודי – הוא מגיע ממילא לכל מי
   שפותח את האתר. הבידוד בין חברות נאכף ב-supabase/schema.sql,
   ולא כאן. */
/* המשרד האחורי מתחבר לאותו Supabase, ולכן הוא צריך את אותן
   הגדרות – בעותק משלו, כי הוא יושב בתיקייה אחרת. */
write('admin/config.js',
  '/* נוצר אוטומטית על ידי build-site.js – אין לערוך ידנית. */\n' +
  'window.SHIFT_CONFIG = ' + JSON.stringify({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY
  }, null, 2) + ';\n');

/* מזהי מעקב שיווקי. ריק = כבוי. הפעלה דורשת עדכון מדיניות הפרטיות
   (docs/marketing-strategy.md), ולכן אין ברירת מחדל. */
const META_PIXEL_ID = String(process.env.META_PIXEL_ID || '').replace(/\D/g, '');
const GA4_ID = /^G-[A-Z0-9]+$/.test(String(process.env.GA4_ID || '').trim())
  ? String(process.env.GA4_ID).trim() : '';
/* הגנה: אסור להפעיל מעקב כשהמדיניות שלנו עדיין אומרת שאין מעקב.
   הצהרה כוזבת בפרטיות גרועה יותר מכל פיקסל. */
if (META_PIXEL_ID || GA4_ID) {
  const claims = [
    ['privacy.html', /אין כלי אנליטיקה ואין פיקסלים|No analytics and no pixels/],
    ['security.html', /אף קובץ Cookie|No cookies/i]
  ].filter(([file, pattern]) => pattern.test(read(file))).map(([file]) => file);
  if (claims.length) {
    console.error('\n✖ הוגדר מזהה מעקב (META_PIXEL_ID / GA4_ID), אבל ' + claims.join(', ') +
      ' עדיין מצהירים שאין עוגיות, אנליטיקה או פיקסלים.\n' +
      '  מעדכנים את הנוסח (אחרי סקירה משפטית) ואז מפעילים. ראו docs/marketing-strategy.md.');
    process.exit(1);
  }
}
write('js/tracking-config.js',
  '/* נוצר אוטומטית על ידי build-site.js – אין לערוך ידנית. */\n' +
  'window.SHIFT_CONFIG = Object.assign(window.SHIFT_CONFIG || {}, ' +
  JSON.stringify({ metaPixelId: META_PIXEL_ID, ga4Id: GA4_ID }) + ');\n');

write('app/config.js',
  '/* נוצר אוטומטית על ידי build-site.js – אין לערוך ידנית. */\n' +
  'window.SHIFT_CONFIG = ' + JSON.stringify({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    adminEndpoint: '/api/create-user',
    cancelEndpoint: '/api/cancel-invite'
  }, null, 2) + ';\n');

/* ===== חותמת גרסה =====
   בלי זה אי אפשר לדעת מה באוויר. "הדף לא מתעדכן" יכול להיות
   מטמון, פריסה שלא רצה, או פריסה מענף אחר – ושלושתם נראים אותו
   דבר מהדפדפן. הקובץ הזה עונה על זה בשנייה:

     https://setshifts.com/version.txt

   Vercel מספק את מזהה הקומיט במשתנה סביבה, ולכן אין כאן קריאה
   ל-git – שממילא לא הייתה עובדת בסביבת הבנייה שלהם. */
function buildStamp() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA || '';
  const branch = process.env.VERCEL_GIT_COMMIT_REF ||
    process.env.GITHUB_REF_NAME || '';
  const env = process.env.VERCEL_ENV || '';
  return [
    'built:    ' + new Date().toISOString(),
    'commit:   ' + (sha ? sha.slice(0, 12) : 'לא ידוע (בנייה מקומית)'),
    'branch:   ' + (branch || 'לא ידוע'),
    'env:      ' + (env || 'local'),
    'video:    ' + (fs.existsSync(path.join(root, 'assets', 'video',
      'setshifts-demo-he.mp4')) ? 'כן' : 'לא'),
    'billing:  ' + (billingIsLive() ? 'מחובר' : 'לא מחובר'),
    'wa staff: ' + (waStaffIsLive() ? 'חי' : 'כבוי'),
    'admin:    כן',
    ''
  ].join('\n');
}

write('version.txt', buildStamp());

/* ===== קבצים לשורש ===== */
write('robots.txt', [
  'User-agent: *',
  'Allow: /',
  'Disallow: /tool/',
  'Disallow: /admin/',
  'Disallow: /version.txt',
  /* סורקי בינה מלאכותית שמצטטים מקורות. חסימה שלהם אינה
     מגינה על דבר — התוכן כאן ציבורי ממילא — והיא כן מוציאה
     את המוצר מהתשובות שאנשים מקבלים היום במקום לחפש. */
  '',
  'User-agent: GPTBot',
  'Allow: /',
  '',
  'User-agent: PerplexityBot',
  'Allow: /',
  '',
  'User-agent: ClaudeBot',
  'Allow: /',
  '',
  'Sitemap: ' + SITE_URL + '/sitemap.xml',
  ''
].join('\n'));

/* אימות הבעלות על האתר מול Bing.

   קובץ ולא תג meta: התג היה יושב בכל עמוד באתר לנצח בשביל
   אימות חד-פעמי, והקובץ יושב בשורש ואינו נוגע בשום דף.

   הייבוא מ-Search Console לא מצא את האתר, משום שהנכס שם הוא
   נכס דומיין — ואת אלה הייבוא של Bing אינו רואה. */
write('BingSiteAuth.xml', [
  '<?xml version="1.0"?>',
  '<users>',
  '\t<user>F5B804C6A96B281ACFD0D21CB8E62A2D</user>',
  '</users>',
  ''
].join('\n'));

/* ===== מפת האתר =====

   lastmod אינו קישוט: הוא מה שמסמן לסורק שכדאי לחזור. בלעדיו
   כל עמוד נראה זהה לגרסה שכבר נסרקה, ואתר חדש ממתין שבועות
   לסריקה חוזרת. התאריך נלקח מזמן השינוי האמיתי של קובץ המקור,
   ולא מזמן הבנייה — אחרת כל פריסה הייתה מצהירה ששמונה עשר
   עמודים השתנו, וההצהרה הזו מפסיקה להיות אמינה.

   לדף המכירה יש שמונה כתובות, אחת לכל שפה, וכל אחת מצהירה על
   כל האחרות. זו אותה הצהרה שב-hreflang שבעמוד עצמו, וגוגל
   מבקש את שתיהן. */
function lastModified(file) {
  try {
    return fs.statSync(path.join(root, file)).mtime.toISOString().slice(0, 10);
  } catch (err) {
    return new Date().toISOString().slice(0, 10);
  }
}

function sitemapEntry(loc, options) {
  const opts = options || {};
  return '  <url>\n' +
    '    <loc>' + loc + '</loc>\n' +
    '    <lastmod>' + opts.lastmod + '</lastmod>\n' +
    '    <changefreq>' + (opts.changefreq || 'yearly') + '</changefreq>\n' +
    '    <priority>' + (opts.priority || '0.3') + '</priority>\n' +
    (opts.alternates || []).map((alt) =>
      '    <xhtml:link rel="alternate" hreflang="' + alt.code +
      '" href="' + alt.href + '"/>\n').join('') +
    '  </url>\n';
}

const landingModified = lastModified('landing.html');
const landingAlternates = seo.LANGUAGES
  .map((lang) => ({ code: lang.code, href: SITE_URL + seo.pathOf(lang.code) }))
  .concat([{ code: 'x-default', href: SITE_URL + seo.pathOf(seo.DEFAULT_LANG) }]);

write('sitemap.xml',
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
  '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
  seo.LANGUAGES.map((lang) =>
    sitemapEntry(SITE_URL + seo.pathOf(lang.code), {
      lastmod: landingModified,
      changefreq: 'weekly',
      priority: lang.code === seo.DEFAULT_LANG ? '1.0' : '0.9',
      alternates: landingAlternates
    })).join('') +
  LEGAL_PAGES.map((item) =>
    sitemapEntry(SITE_URL + '/' + item.dir + '/', {
      lastmod: lastModified(item.file),
      changefreq: item.changefreq || 'yearly',
      priority: item.priority || '0.3'
    })).join('') +
  sitemapEntry(SITE_URL + '/guide/', {
    lastmod: lastModified('guide.html'),
    changefreq: 'monthly', priority: '0.4'
  }) +
  /* עמודי התוכן: כתובת לכל שפה, וכל אחת מצהירה על כל האחרות.
     זו אותה הצהרה שב-hreflang שבעמוד עצמו, וגוגל מבקש את
     שתיהן. lastmod נלקח מהקובץ של אותה שפה: כשתרגום אחד
     מתעדכן, רק הכתובת שלו מוצהרת כמשתנה. */
  CONTENT_PAGES.map((item) => {
    const alternates = seo.LANGUAGES
      .map((lang) => ({
        code: lang.code, href: SITE_URL + seo.pathOf(lang.code, item.dir)
      }))
      .concat([{
        code: 'x-default',
        href: SITE_URL + seo.pathOf(seo.DEFAULT_LANG, item.dir)
      }]);
    return seo.LANGUAGES.map((lang) =>
      sitemapEntry(SITE_URL + seo.pathOf(lang.code, item.dir), {
        lastmod: lastModified(contentFile(item.dir, lang.code)),
        changefreq: item.changefreq || 'yearly',
        alternates: alternates,
        priority: lang.code === seo.DEFAULT_LANG
          ? (item.priority || '0.3')
          /* גרסת שפה אינה חשובה פחות מהעברית, אבל העברית היא
             הכתובת שכבר נצברה בה היסטוריה. הפרש קטן, ולא סדר
             גודל. */
          : String(Math.max(0.1, Number(item.priority || '0.3') - 0.1).toFixed(1))
      })).join('');
  }).join('') +
  '</urlset>\n');

/* ===== עמוד 404 =====

   קישור שבור קורה: כתובת ישנה ששותפה, שגיאת הקלדה, עמוד
   שנמחק. בלי הקובץ הזה המבקר מקבל את מסך ברירת המחדל של
   Vercel — לבן, באנגלית, בלי דרך חזרה — ובורח. כאן הוא מקבל
   את האתר עצמו, עם הדרך הביתה.

   noindex: עמוד שגיאה שנסרק הוא עמוד שמופיע בתוצאות. */
/* Vercel מגיש את 404.html בשורש לכל כתובת שלא נמצאה. */
page('404.html', '404.html', { noindex: true });

write('.nojekyll', '');

/* ההחלפה. הישנה מוסטת הצידה, החדשה נכנסת במקומה, והישנה נמחקת –
   כך אין רגע שבו site/ קיימת אבל חסרים בה קבצים. */
(function publish() {
  const previous = finalOut + '.old';
  rm(previous);
  if (fs.existsSync(finalOut)) fs.renameSync(finalOut, previous);
  fs.renameSync(out, finalOut);
  rm(previous);
})();

const total = (function size(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
    const full = path.join(dir, entry.name);
    return sum + (entry.isDirectory() ? size(full) : fs.statSync(full).size);
  }, 0);
})(finalOut);

console.log('נבנה site/ (' + (total / 1024).toFixed(0) + ' KB)');
console.log('  /       דף המכירה');
console.log('  /app/   המערכת עם ההתחברות');
console.log('  /tool/  הכלי המקומי לעסק אחד');
LEGAL_PAGES.forEach((item) => {
  console.log(('  /' + item.dir + '/').padEnd(18, ' ') + ' ' + (item.label || ''));
});
console.log('  /guide/            מדריך לעובד/ת');
CONTENT_PAGES.forEach((item) => {
  console.log(('  /[שפה]/' + item.dir + '/').padEnd(18, ' ') +
    ' ' + seo.LANGUAGES.length + ' שפות');
});

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.log('\n⚠ האתר נבנה במצב הדגמה: אין SUPABASE_URL או SUPABASE_ANON_KEY.');
  console.log('  נתוני לקוחות לא יישמרו בענן, והאפליקציה תציג באנר הדגמה.');
  console.log('  להפעלה אמיתית: הגדרת שני המשתנים ב-Vercel ואז Redeploy.');
}

if (legalMissing.length) {
  /* מודפסים שמות משתני הסביבה, ולא שמות הסימונים: זה מה שצריך
     להקליד ב-Vercel, וזה מה שהקורא של השורה הזו הולך לעשות. */
  console.log('\n⚠ העמודים המשפטיים חסרים פרטים. הם פורסמו עם סימון גלוי.');
  console.log('  יש להגדיר ב-Vercel את משתני הסביבה האלה:');
  legalMissing.forEach((key) => {
    console.log('    ' + (LEGAL_ENV[key] || key));
  });
  console.log('  לפני שמפנים לקוח לעמודים.');
}
