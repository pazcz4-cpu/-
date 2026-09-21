/* בונה תצוגה מקדימה של דף המכירה כקובץ אחד (dist/landing-preview.html),
   לפרסום כארטיפקט לפני שיש דומיין.

   ההבדל היחיד מדף המכירה האמיתי: אין כאן אפליקציה להתחבר אליה, ולכן
   כפתורי ההרשמה מובילים להודעה שמסבירה זאת במקום לדף שאינו קיים. */
'use strict';

const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const dataUri = (file) =>
  'data:image/png;base64,' + fs.readFileSync(path.join(root, file)).toString('base64');

const html = read('landing.html');

const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [, 'סידור משמרות'])[1].trim();

const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
if (!bodyMatch) throw new Error('לא נמצא גוף המסמך ב-landing.html');
let body = bodyMatch[1];

/* הסקריפטים מוטמעים בסוף, לפי סדר ההופעה בקובץ המקור */
const scripts = [...body.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
scripts.forEach((src) => { body = body.replace(`<script src="${src}"></script>`, ''); });

/* הסקריפט המוטבע של הדף – נשלף כדי שיורץ אחרי הספריות */
const inlineMatch = body.match(/<script>([\s\S]*?)<\/script>\s*$/);
const inline = inlineMatch ? inlineMatch[1] : '';
if (inlineMatch) body = body.replace(inlineMatch[0], '');

/* התמונה היחידה בדף הופכת למוטבעת – ארטיפקט אינו יכול למשוך קבצים */
body = body.replace(/src="icons\/icon-192\.png"/g, 'src="' + dataUri('site/icons/icon-192.png') + '"');

/* אין אפליקציה בתצוגה מקדימה: כל קישור אליה מצביע להסבר */
body = body.replace(/href="app\/[^"]*"/g, 'href="#preview-note"');

const banner = `
<div class="lp-preview" id="preview-note">
  <span dir="rtl"><strong>תצוגה מקדימה</strong> — זה דף המכירה האמיתי, בדיוק כפי שהוא ייראה באוויר.
  ההרשמה וההתחברות יעבדו ברגע שהדף יעלה לדומיין שלך.</span>
  <span class="lp-preview-en" dir="ltr">Preview — this is the real sales page. Sign-up starts working once it is live on your domain.</span>
</div>`;

const extraCss = `
/* ===== תוספות לתצוגה המקדימה בלבד ===== */
.lp-preview {
  background: var(--warn-bg, #fff4d6); color: var(--ink);
  border-bottom: 1px solid var(--line);
  padding: 10px 16px; font-size: 13.5px; line-height: 1.6; text-align: center;
}
.lp-preview-en { display: block; opacity: .7; font-size: 12.5px; }
.lp-nav { top: env(safe-area-inset-top, 0px); }
`;

const css = read('css/styles.css') + '\n' + read('css/landing.css') + extraCss;
const js = scripts.map((src) => `/* ===== ${src} ===== */\n${read(src)}`).join('\n\n');

const boot = `
/* בארטיפקט אין תגית body משלנו, ולכן המחלקה נקבעת כאן */
document.body.className = 'landing';
`;

/* רץ אחרי הסקריפט של הדף: מנטרל את הקישורים לאפליקציה גם בתוכניות,
   שנבנות מחדש בכל החלפת שפה, ופותח בעברית כשעוד לא נבחרה שפה. */
const after = `
(function () {
  'use strict';
  function fixLinks() {
    var links = document.querySelectorAll('a[href^="app/"]');
    for (var i = 0; i < links.length; i++) { links[i].setAttribute('href', '#preview-note'); }
  }
  window.I18n.onChange(fixLinks);   /* נרשם אחרי הציור, ולכן רץ אחריו */
  fixLinks();

  if (!window.I18nDom.stored()) {
    window.I18n.use('he');
    window.I18nDom.fillPicker(document.getElementById('landing-language'));
    fixLinks();
  }
})();
`;

const out = `<title>${title}</title>
<style>
${css}
</style>
${banner}
${body.trim()}

<script>
${js}
</script>
<script>
${boot}
${inline}
${after}
</script>
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const target = path.join(root, 'dist', 'landing-preview.html');
fs.writeFileSync(target, out, 'utf8');
console.log('נכתב: dist/landing-preview.html (' + Math.round(out.length / 1024) + 'KB)');
