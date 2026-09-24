/* נגישות: בדיקה אוטומטית על כל עמוד באתר.

   הרצה: npm run test:a11y

   למה אוטומטית: נגישות אינה משימה שמסמנים בה וי פעם אחת. כל
   מקטע חדש, כל צבע חדש וכל כפתור חדש יכולים לשבור אותה בשקט —
   ומי שמגלה זאת הוא המשתמש שאינו מצליח להשתמש במוצר.

   מה נבדק כאן: ניגודיות צבעים, מבנה כותרות, אזורי דף, שמות
   נגישים לקישורים ולכפתורים, תוויות לשדות טופס, טקסט חלופי
   לתמונות, וקישור הדילוג לתוכן.

   ומה לא: קורא מסך אמיתי, הגיון של סדר קריאה, ואיכות הניסוח של
   טקסט חלופי. בדיקה אוטומטית תופסת כשלים מכניים בלבד, והיא
   אינה תחליף לסקר נגישות מקצועי. זה כתוב גם בהצהרה עצמה. */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', 'site');

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.log('\n⚠ אין תיקיית site. להריץ קודם: node build-site.js\n');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
  '.mp4': 'video/mp4', '.vtt': 'text/vtt'
};
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const PAGES = ['', 'about', 'stories', 'faq', 'contact',
  'privacy', 'terms', 'security', 'accessibility'];

const failures = [];

const AUDIT = () => {
  const out = { issues: [] };
  const add = (k,d) => out.issues.push(k+': '+d);

  // שפה וכיוון
  const html = document.documentElement;
  if (!html.lang) add('lang','אין lang על <html>');
  if (!html.dir) add('dir','אין dir על <html>');

  // כותרת ו-h1
  if (!document.title || document.title.length < 5) add('title','כותרת חסרה או קצרה');
  const h1 = [].filter.call(document.querySelectorAll('h1'),
    (n) => n.getClientRects().length > 0);
  if (h1.length === 0) add('h1','אין h1');
  if (h1.length > 1) add('h1','יותר מ-h1 אחד ('+h1.length+')');

  // דילוג לתוכן
  const skip = document.querySelector('a[href^="#"][class*="skip"], .skip-link, #skip');
  if (!skip) add('skip','אין קישור "דילוג לתוכן"');

  // landmarks
  if (!document.querySelector('main')) add('main','אין <main>');
  if (!document.querySelector('footer')) add('footer','אין <footer>');

  // תמונות בלי alt
  document.querySelectorAll('img').forEach(img => {
    if (!img.hasAttribute('alt')) add('img','תמונה בלי alt: '+(img.getAttribute('src')||'').slice(-40));
  });

  // כפתורים וקישורים בלי שם נגיש
  document.querySelectorAll('a, button, [role="button"]').forEach(el => {
    if (!el.getClientRects().length) return;
    /* alt של תמונה בתוך הקישור הוא שם נגיש לכל דבר — לוגו
       שהוא תמונה עם alt אינו קישור אנונימי. */
    const alt = [].map.call(el.querySelectorAll('img[alt]'), (i) => i.alt).join(' ').trim();
    const txt = (el.innerText||'').trim() || el.getAttribute('aria-label') ||
      el.getAttribute('title') || alt;
    if (!txt) add('name','אלמנט בלי שם נגיש: <'+el.tagName.toLowerCase()+' class="'+(el.className||'').toString().slice(0,30)+'">');
  });

  // שדות טופס בלי תווית
  document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(el => {
    const id = el.id;
    const lbl = id && document.querySelector('label[for="'+CSS.escape(id)+'"]');
    const wrapped = el.closest('label');
    if (!lbl && !wrapped && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
      add('label','שדה בלי תווית: #'+(id||'(ללא id)')+' ['+el.tagName.toLowerCase()+']');
    }
  });

  // ניגודיות טקסט מול רקע
  /* הדפדפן מחזיר צבעים בשני פורמטים: rgb(0-255) ו-color(srgb 0-1).
     קריאה של השני כאילו הוא הראשון נותנת יחסים מופרכים — וזה
     בדיוק מה שהפך כאן צבעים תקינים ל"כשלים". */
  function rgba(c){
    if(!c) return null;
    const srgb=/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?/.exec(c);
    if(srgb) return [ +srgb[1]*255, +srgb[2]*255, +srgb[3]*255, srgb[4]===undefined?1:+srgb[4] ];
    const m=c.match(/[\d.]+/g); if(!m) return null;
    return [ +m[0], +m[1], +m[2], m[3]===undefined?1:+m[3] ];
  }
  function lum(c){const v=rgba(c); if(!v) return null;
    const f=x=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);};
    return 0.2126*f(v[0])+0.7152*f(v[1])+0.0722*f(v[2]);}
  /* רקע שקוף-למחצה מורכב על מה שמתחתיו, ולא נקרא כאילו הוא אטום. */
  function bgOf(el){
    let n=el, out=[255,255,255];
    const stack=[];
    while(n&&n!==document.documentElement){
      const v=rgba(getComputedStyle(n).backgroundColor);
      if(v&&v[3]>0) stack.push(v);
      if(v&&v[3]>=1) break;
      n=n.parentElement;
    }
    for(let i=stack.length-1;i>=0;i--){
      const [r,g,b,a]=stack[i];
      out=[r*a+out[0]*(1-a), g*a+out[1]*(1-a), b*a+out[2]*(1-a)];
    }
    return 'rgb('+out.map(Math.round).join(', ')+')';
  }
  const seen=new Set();
  document.querySelectorAll('p,span,a,button,h1,h2,h3,h4,li,td,th,label,small').forEach(el=>{
    const t=(el.innerText||'').trim(); if(!t||t.length<2) return;
    if(!el.getClientRects().length) return;
    /* טקסט לקוראי מסך בלבד (1px + clip-path) אינו מוצג על המסך,
       ולכן ניגודיות אינה חלה עליו. */
    const r0=el.getBoundingClientRect();
    if(r0.width<=2 || r0.height<=2) return;
    if(getComputedStyle(el).clipPath!=='none') return;
    /* רקע שהוא תמונה או גרדיאנט אינו נמדד כאן — backgroundColor
       שלו שקוף, וקריאה שלו כרקע ההורה היא שקר. */
    let img=el, painted=false;
    while(img&&img!==document.documentElement){
      if(getComputedStyle(img).backgroundImage!=='none'){painted=true;break;}
      const v=getComputedStyle(img).backgroundColor;
      if(v&&!/rgba\(0, 0, 0, 0\)|transparent/.test(v))break;
      img=img.parentElement;
    }
    if(painted) return;
    if(el.querySelector('p,span,a,button,h1,h2,h3,h4,li')) return;
    const cs=getComputedStyle(el);
    if(cs.visibility==='hidden'||cs.display==='none'||Number(cs.opacity)<0.1) return;
    const l1=lum(cs.color), l2=lum(bgOf(el)); if(l1===null||l2===null) return;
    const ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    const size=parseFloat(cs.fontSize), bold=Number(cs.fontWeight)>=700;
    const large = size>=24 || (size>=18.66 && bold);
    const need = large?3:4.5;
    if(ratio < need){
      const key=cs.color+'|'+bgOf(el)+'|'+Math.round(size);
      if(seen.has(key))return; seen.add(key);
      add('contrast', ratio.toFixed(2)+':1 (צריך '+need+') — "'+t.slice(0,28)+'" '+cs.color+' על '+bgOf(el));
    }
  });
  return out;
};


const browser = await chromium.launch();
try {
  for (const slug of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
    const page = await ctx.newPage();
    await page.goto(base + '/' + (slug ? slug + '/' : ''), { waitUntil: 'networkidle' });
    await page.waitForTimeout(350);
    const result = await page.evaluate(AUDIT);
    const name = slug || 'שורש';
    if (result.issues.length) {
      console.log('  ✗ ' + name);
      result.issues.forEach((i) => console.log('      ' + i));
      result.issues.forEach((i) => failures.push(name + ' — ' + i));
    } else {
      console.log('  ✓ ' + name);
    }
    await ctx.close();
  }

  console.log('\n== דילוג לתוכן עובד במקלדת ==');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
    const page = await ctx.newPage();
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement.className);
    const shown = await page.evaluate(() =>
      Math.round(document.activeElement.getBoundingClientRect().top));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const landed = await page.evaluate(() =>
      document.activeElement.tagName + '#' + document.activeElement.id);
    /* הטאב הבא חייב להיות בתוך התוכן. אם הוא חוזר לניווט, הדילוג
       גלל בלבד ולא העביר מיקוד — וזו תקלה שנראית כמו הצלחה. */
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!document.activeElement.closest('main'));

    const checks = [
      ['הקישור ראשון בסדר המיקוד', first.indexOf('skip-link') !== -1, true],
      ['והוא נראה כשהוא ממוקד', shown >= 0 && shown < 60, true],
      ['לחיצה מעבירה מיקוד ל-main', landed, 'MAIN#main'],
      ['והטאב הבא כבר בתוך התוכן', inside, true]
    ];
    checks.forEach(([label, actual, expected]) => {
      const ok = actual === expected;
      console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
      if (!ok) failures.push(label + ': ' + JSON.stringify(actual));
    });
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.log('\n❌ ' + failures.length + ' ממצאי נגישות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות הנגישות עברו');
