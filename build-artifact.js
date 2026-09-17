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
const js = scripts.map((src) => `/* ===== ${src} ===== */\n${read(src)}`).join('\n\n');

const out = `<title>${title}</title>
<style>
${css}
</style>

${body}

<script>
${js}
</script>
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/artifact.html'), out, 'utf8');

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
console.log(`נבנה dist/artifact.html (${kb} KB, ${scripts.length} קבצי JS מוטבעים)`);
