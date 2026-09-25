/* בונה קובץ אחד לפרסום (dist/artifact.html) מתוך index.html וקבצי ה-CSS/JS.
   הפלט הוא תוכן עמוד בלבד – ללא תגיות html/head/body – כנדרש לפרסום כארטיפקט. */
'use strict';

const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');

const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
if (!bodyMatch) { throw new Error('לא נמצא גוף המסמך ב-index.html'); }
let body = bodyMatch[1];

const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);
const title = titleMatch ? titleMatch[1].trim() : 'סידור משמרות';

// החלפת תגיות הסקריפט בקוד מוטבע, לפי סדר ההופעה בקובץ המקור
const scripts = [...body.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
scripts.forEach((src) => {
  body = body.replace(`<script src="${src}"></script>`, '');
});
body = body.replace(/\n{3,}/g, '\n\n').trim();

const css = read('css/styles.css');

/* הלוגו, מוטבע.

   הקובץ הזה נפתח כקובץ אחד, גם בלי אינטרנט, ולכן אין לו תיקיית
   brand/ לצידו. js/brand.js גוזר את הנתיב מ-script[src] שלו —
   וכאן הסקריפטים מוטבעים, ולכן לא היה מה לגזור: הדפדפן ביקש
   "brand/logo-mark-white.png" יחסית לתיקייה שבה יושב הקובץ,
   וקיבל 404. כלומר לוגו שבור בכל פתיחה של הכלי המקומי.

   מוטבעים רק הקבצים שהעמוד הזה באמת מבקש, ולא כל התיקייה:
   כל קובץ מוסיף שליש לגודלו בקידוד base64. */
function brandFiles(markup) {
  const wanted = {};
  const marks = markup.match(/data-brand-mark="([^"]*)"/g) || [];
  marks.forEach((tag) => {
    wanted[/="white"/.test(tag) ? 'logo-mark-white.png' : 'logo-mark.png'] = true;
  });
  if (/data-brand-lockup/.test(markup)) {
    wanted['logo-lockup.png'] = true;
    wanted['logo-lockup-light.png'] = true;
  }
  const out = {};
  Object.keys(wanted).forEach((file) => {
    const full = path.join(root, 'brand', file);
    if (!fs.existsSync(full)) throw new Error('חסר קובץ לוגו: brand/' + file);
    out[file] = 'data:image/png;base64,' + fs.readFileSync(full).toString('base64');
  });
  return out;
}

const brand = '/* ===== brand/ (מוטבע) ===== */\n' +
  'window.SHIFT_BRAND_FILES = ' + JSON.stringify(brandFiles(body)) + ';';
const js = [brand].concat(
  scripts.map((src) => `/* ===== ${src} ===== */\n${read(src)}`)).join('\n\n');

const out = `<title>${title}</title>
<style>
${css}
</style>

${body}

<script>
${js}
</script>
`;

// גרסה עצמאית: מסמך HTML שלם שנפתח בכל דפדפן, גם בלי אינטרנט
const standalone = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${out.replace(/<style>[\s\S]*?<\/style>/, (m) => m).split('\n').slice(0, 0).join('')}<title>${title}</title>
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${js}
<\/script>
</body>
</html>
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/artifact.html'), out, 'utf8');
fs.writeFileSync(path.join(root, 'dist/sidur-mishmarot.html'), standalone, 'utf8');

// docs/ מיועד ל-GitHub Pages: כתובת אמיתית שאפשר להוסיף למסך הבית באייפון
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/index.html'), standalone, 'utf8');
fs.writeFileSync(path.join(root, 'docs/.nojekyll'), '', 'utf8');

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
console.log(`נבנה dist/artifact.html (${kb} KB, ${scripts.length} קבצי JS מוטבעים)`);
console.log('נבנה dist/sidur-mishmarot.html (מסמך עצמאי לפתיחה בכל דפדפן)');
console.log('נבנה docs/index.html (לפרסום ב-GitHub Pages)');
