/* אזור הסרטון בדף הבית: טעינה עצלה, שני המצבים, ונגישות.
   הרצה: npm run test:video */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const SITE = path.join(ROOT, 'site');
const MP4 = path.join(ROOT, 'assets', 'video', 'setshifts-demo-he.mp4');
const VTT = path.join(ROOT, 'assets', 'video', 'setshifts-demo-he.vtt');

/* כתוביות טיוטה אינן נשלחות עם הסרטון: מי שקורא אותן מקבל תוכן
   שאינו מה שנאמר בו. הבדיקה הולכת אחרי הכוונה ולא אחרי המצב –
   ברגע שיוחלף התמלול, היא תדרוש שהכתוביות כן יופיעו. */
const captionsAreDraft = fs.existsSync(VTT) &&
  fs.readFileSync(VTT, 'utf8').indexOf('אחרי שמחליפים את setshifts-demo-he.mp4') !== -1;

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

function build() {
  execFileSync('node', [path.join(ROOT, 'build-site.js')], { cwd: ROOT, stdio: 'pipe' });
}

const browser = await chromium.launch();
const errors = [];
const madeVideo = !fs.existsSync(MP4);

async function open(port) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('http://127.0.0.1:' + port + '/');
  await page.waitForTimeout(600);
  return page;
}

/* שרת סטטי קטן, כדי שהנתיבים המוחלטים של האתר הבנוי יעבדו */
const http = await import('node:http');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.png': 'image/png', '.mp4': 'video/mp4', '.vtt': 'text/vtt', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.xml': 'application/xml',
  '.txt': 'text/plain', '.ico': 'image/x-icon' };
function serve(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let file = decodeURIComponent(req.url.split('?')[0]);
      if (file.endsWith('/')) file += 'index.html';
      const full = path.join(dir, file);
      if (!full.startsWith(dir) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        res.statusCode = 404; res.end('not found'); return;
      }
      res.setHeader('content-type', TYPES[path.extname(full)] || 'application/octet-stream');
      res.end(fs.readFileSync(full));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

try {
  console.log('\n== בלי קובץ סרטון: אומרים שהוא בדרך ==');
  if (!madeVideo) fs.renameSync(MP4, MP4 + '.bak');
  build();
  let host = await serve(SITE);
  let page = await open(host.port);
  check('האזור קיים', await page.locator('#lp-video').count(), 1);
  /* הכותרת מתארת את מה שהסרטון באמת מראה – סיור ביכולות, ולא
     הדגמה של בניית סידור בזמן נקוב. הבטחת זמן בכותרת שמעל סרטון
     ארוך יותר היא הסוג הקטן של אי-דיוק שעולה באמון. */
  check('הכותרת', await page.locator('#demo h2').innerText(), /יודעת לעשות/);
  check('והשורה מתחתיה', await page.locator('#demo .lp-section-sub').innerText(), /יכולות המערכת/);
  check('אין כפתור Play שמוביל לשום מקום',
    await page.locator('#lp-video-play').isVisible(), false);
  check('ובמקומו נאמר שהוא בדרך',
    await page.locator('#lp-video-soon').innerText(), /בדרך/);
  check('ואין 404 בקונסול', errors.filter(e => /404/.test(e)).length, 0);
  await host.server.close();

  console.log('\n== עם קובץ: כפתור, ושום בייט של וידאו עד שלוחצים ==');
  /* קובץ MP4 מינימלי. אין צורך שיתנגן – רק שיתקיים וייטען. */
  fs.writeFileSync(MP4, Buffer.from(
    '00000018667479706d703432000000006d70343269736f6d', 'hex'));
  build();
  host = await serve(SITE);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
  page = await ctx.newPage();
  const wire = [];
  page.on('request', (r) => wire.push(r.url()));
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  await page.goto('http://127.0.0.1:' + host.port + '/');
  await page.waitForTimeout(700);

  check('הכפתור מוצג', await page.locator('#lp-video-play').isVisible(), true);
  check('והודעת "בדרך" נעלמה', await page.locator('#lp-video-soon').isVisible(), false);
  check('תמונת פתיחה נפרדת',
    await page.locator('#lp-video-play img').getAttribute('src'), '/assets/video/poster.png');
  check('והיא נטענת עצלה',
    await page.locator('#lp-video-play img').getAttribute('loading'), 'lazy');
  check('לכפתור יש שם לקורא מסך',
    await page.locator('#lp-video-play').getAttribute('aria-label'), /ניגון/);
  check('אין עדיין רכיב וידאו בדף', await page.locator('video').count(), 0);
  /* העיקר: הקובץ לא ירד עם הדף */
  check('ושום בייט של הסרטון לא ירד',
    wire.filter(u => /setshifts-demo-he\.mp4/.test(u)).length, 0);

  console.log('\n== בלחיצה ==');
  await page.click('#lp-video-play');
  await page.waitForTimeout(700);
  check('נוצר נגן', await page.locator('video').count(), 1);
  check('עם בקרים מלאים', await page.locator('video').getAttribute('controls'), '');
  check('ולא מתנגן אוטומטית',
    await page.locator('video').getAttribute('autoplay'), null);
  if (captionsAreDraft) {
    check('כתוביות טיוטה אינן נשלחות כלל',
      await page.locator('video track').count(), 0);
  } else {
    check('כתוביות בעברית', await page.locator('video track').getAttribute('src'),
      '/assets/video/setshifts-demo-he.vtt');
    check('  מסוג captions', await page.locator('video track').getAttribute('kind'), 'captions');
    check('  ודלוקות כברירת מחדל',
      await page.locator('video track').getAttribute('default'), '');
  }
  check('עכשיו הקובץ כן נטען',
    wire.filter(u => /setshifts-demo-he\.mp4/.test(u)).length > 0, true);
  check('הכפתור פינה את מקומו', await page.locator('#lp-video-play').count(), 0);

  console.log('\n== ניווט מקלדת ==');
  await page.goto('http://127.0.0.1:' + host.port + '/');
  await page.waitForTimeout(600);
  check('הכפתור נגיש ל-Tab', await page.evaluate(() => {
    const el = document.getElementById('lp-video-play');
    el.focus();
    return document.activeElement === el;
  }), true);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  check('ו-Enter מפעיל', await page.locator('video').count(), 1);
  await host.server.close();

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  /* מחזירים את המאגר למצב שבו מצאנו אותו */
  if (madeVideo && fs.existsSync(MP4)) fs.unlinkSync(MP4);
  if (fs.existsSync(MP4 + '.bak')) fs.renameSync(MP4 + '.bak', MP4);
  try { build(); } catch (err) { /* הבנייה נבדקת ממילא ב-test:site */ }
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות אזור הסרטון עברו');
