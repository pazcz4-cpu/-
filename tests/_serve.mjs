/* שרת סטטי לבדיקות הדפדפן.

   הבדיקות נפתחו פעם ישירות מ-file://, וזו הייתה טעות שקשה היה
   לראות: כרומיום מחזיק את ה-localStorage של file:// במחיצה
   ארעית, ואחת לכמה עשרות רענונים הוא מוחק אותה כולה. אז ההתחברות
   נעלמת באמצע בדיקה, המסך חוזר למסך הכניסה, והבדיקה נופלת על
   "אלמנט אינו גלוי" – כאילו יש באג במוצר, כשאין.

   מול מקור http אמיתי זה לא קורה, וזה גם מה שהלקוח מקבל בפועל:
   האתר רץ ב-https ולא מהדיסק. השרת עולה פעם אחת לכל תהליך בדיקה,
   על פורט פנוי, ו-unref כדי שלא יחזיק את התהליך פתוח בסיום. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.vtt': 'text/vtt; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel);
  /* לא יוצאים מתיקיית המאגר גם אם הבקשה מנסה */
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found: ' + rel); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
server.unref();

export const BASE = 'http://127.0.0.1:' + server.address().port;

/* url('app.html') או url('dist', 'sidur-mishmarot.html') */
export function url(...parts) {
  return BASE + '/' + parts.join('/');
}
