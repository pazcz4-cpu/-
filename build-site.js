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

const root = __dirname;
const out = path.join(root, 'site');

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
    if (entry.isDirectory()) { copyDir(rel, path.join(to, entry.name), filter); return; }
    if (filter && !filter(entry.name)) return;
    const target = path.join(out, to, entry.name);
    mkdir(path.dirname(target));
    fs.copyFileSync(path.join(root, rel), target);
  });
}

rm(out);
mkdir(out);

/* ===== נכסים משותפים ===== */
copyDir('css', 'css');
copyDir('js', 'js', (name) => name.endsWith('.js'));

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
  name: 'Shift Scheduler',
  shortName: 'Shifts',
  description: 'Weekly shift scheduling for chains with more than one branch.',
  startUrl: '/app/'
}));

write('tool/manifest.webmanifest', manifest({
  name: 'Shift Scheduler',
  shortName: 'Shifts',
  description: 'Weekly shift scheduling.',
  startUrl: '/tool/'
}));

/* ===== Service Worker ===== */
/* קובץ אחד בשורש, כדי שהיקף השליטה שלו יכסה גם /app וגם /tool */
fs.copyFileSync(path.join(root, 'sw.js'), path.join(out, 'sw.js'));

/* ===== העמודים ===== */
/* הקבצים במקור יושבים בשורש הפרויקט ומפנים ל-"css/..." ו-"js/...".
   כשהם עוברים לתת-תיקייה, הנתיבים היחסים נשברים – ולכן ממירים
   אותם לנתיבים מוחלטים. */
function toAbsolutePaths(html) {
  return html
    .replace(/(src|href)="(?!https?:|\/|#|data:|mailto:)([^"]+)"/g, (match, attr, value) => {
      if (/^(css|js|icons)\//.test(value)) return attr + '="/' + value + '"';
      return match;
    });
}

/* תגיות שכל עמוד צריך: אייקון, manifest ומצב אפליקציה באייפון */
function headExtras(options) {
  return [
    '<link rel="manifest" href="' + options.manifest + '">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32.png">',
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
    '<meta name="theme-color" content="#23499f">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    '<meta name="apple-mobile-web-app-title" content="Shifts">',
    '<meta name="format-detection" content="telephone=no">'
  ].join('\n');
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
  let html = toAbsolutePaths(read(source));
  html = html.replace('</head>', headExtras(options) + '\n</head>');
  html = html.replace('</body>', SW_REGISTER + '\n</body>');
  write(target, html);
}

/* דף המכירה: מפנה ל-icons/ יחסית, וזה תקין כי הוא יושב בשורש */
page('landing.html', 'index.html', { manifest: '/app/manifest.webmanifest' });
page('app.html', 'app/index.html', { manifest: '/app/manifest.webmanifest' });
page('index.html', 'tool/index.html', { manifest: '/tool/manifest.webmanifest' });

/* הגדרות החיבור לשרת. נטען יחסית לעמוד, כדי שגם פתיחה מקומית
   של app.html תמצא אותו. */
fs.copyFileSync(path.join(root, 'config.js'), path.join(out, 'app', 'config.js'));

/* ===== קבצים לשורש ===== */
write('robots.txt', 'User-agent: *\nAllow: /\nDisallow: /tool/\n');
write('.nojekyll', '');

const total = (function size(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
    const full = path.join(dir, entry.name);
    return sum + (entry.isDirectory() ? size(full) : fs.statSync(full).size);
  }, 0);
})(out);

console.log('נבנה site/ (' + (total / 1024).toFixed(0) + ' KB)');
console.log('  /       דף המכירה');
console.log('  /app/   המערכת עם ההתחברות');
console.log('  /tool/  הכלי המקומי לעסק אחד');
