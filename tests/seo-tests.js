/* בדיקות למה שמנוע חיפוש רואה.

   הן רצות על site/ — התיקייה הבנויה — ולא על קבצי המקור, כי
   זה ההבדל כולו: כל מה שנוסף בבנייה (כותרות, hreflang, נתונים
   מובנים, מפת אתר) אינו קיים במקור, וכל מה שהמקור מבטיח יכול
   להישבר בדרך החוצה בלי שאיש יראה.

   הרצה: npm run test:seo  (בונה ואז בודק)
   או:   node build-site.js && node tests/seo-tests.js */
'use strict';

var fs = require('fs');
var path = require('path');
var seo = require('../tools/seo.js');

var SITE = path.join(__dirname, '..', 'site');
var DOMAIN = 'https://setshifts.com';

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.log('  ✗ ' + name + '\n      ' + err.message); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

if (!fs.existsSync(path.join(SITE, 'index.html'))) {
  console.error('site/ אינה קיימת. יש להריץ קודם: node build-site.js');
  process.exit(1);
}

function read(relative) {
  return fs.readFileSync(path.join(SITE, relative), 'utf8');
}
function exists(relative) {
  return fs.existsSync(path.join(SITE, relative));
}
function pageOf(code) {
  return read(code === seo.DEFAULT_LANG ? 'index.html' : code + '/index.html');
}
function titleOf(html) {
  var found = html.match(/<title[^>]*>([\s\S]*?)<\/title>/);
  return found ? found[1].trim() : '';
}
function metaOf(html, name) {
  var found = html.match(new RegExp('<meta name="' + name + '"[^>]*content="([^"]*)"'));
  return found ? found[1] : null;
}
function propertyOf(html, property) {
  var found = html.match(new RegExp('<meta property="' + property + '"[^>]*content="([^"]*)"'));
  return found ? found[1] : null;
}
function structured(html) {
  var blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  return blocks.map(function (block) {
    var body = block.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    return JSON.parse(body.replace(/\\u003c/g, '<'));
  });
}
function typed(html, type) {
  return structured(html).filter(function (item) { return item['@type'] === type; })[0];
}

/* ===== הכותרת ===== */

console.log('\n== כותרת ותיאור ==');

/* הכותרת היא השורה היחידה שאדם קורא בתוצאות לפני שהוא מחליט
   אם ללחוץ, והיא הייתה "SetShifts" — שם שאיש אינו מחפש. */
test('לדף הבית יש כותרת שמתארת את המוצר ולא רק את שמו', function () {
  var title = titleOf(pageOf('he'));
  assert(title.length > 20, 'הכותרת קצרה מדי: "' + title + '"');
  assert(title.indexOf('סידור') !== -1,
    'הכותרת אינה מזכירה את מה שמחפשים: "' + title + '"');
  assert(title !== 'SetShifts', 'הכותרת היא שם המוצר בלבד');
});

test('לכל שפה כותרת ותיאור משלה', function () {
  var seen = {};
  seo.LANGUAGES.forEach(function (lang) {
    var html = pageOf(lang.code);
    var title = titleOf(html);
    var description = metaOf(html, 'description');
    assert(title, lang.code + ': אין כותרת');
    assert(description, lang.code + ': אין תיאור');
    assert(!seen[title], lang.code + ': אותה כותרת כמו ' + seen[title]);
    seen[title] = lang.code;
    /* גוגל חותך כותרת ארוכה באמצע מילה. 65 תווים הוא הגבול
       המעשי, ו-170 לתיאור. */
    assert(title.length <= 70, lang.code + ': כותרת ארוכה מדי (' + title.length + ')');
    assert(description.length <= 190,
      lang.code + ': תיאור ארוך מדי (' + description.length + ')');
  });
});

/* ===== שפות ===== */

console.log('\n== שמונה שפות, שמונה כתובות ==');

test('לכל שפה נבנה עמוד', function () {
  seo.LANGUAGES.forEach(function (lang) {
    var file = lang.code === seo.DEFAULT_LANG ? 'index.html' : lang.code + '/index.html';
    assert(exists(file), lang.code + ': ' + file + ' לא נבנה');
  });
});

/* הטקסט חייב להיות בקובץ עצמו. כשהתרגום קרה רק בדפדפן, סורק
   שהגיע ל-/de/ קיבל עברית — כלומר שבע השפות לא היו קיימות. */
test('הטקסט כבר בתוך הקובץ ולא מוחלף רק בדפדפן', function () {
  var hebrew = /[֐-׿]/;
  seo.LANGUAGES.forEach(function (lang) {
    if (lang.code === 'he') return;
    var html = pageOf(lang.code);
    var h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [, ''])[1];
    assert(h1.trim(), lang.code + ': אין h1');
    assert(!hebrew.test(h1), lang.code + ': ה-h1 עדיין בעברית — "' + h1.trim() + '"');
  });
});

test('כל עמוד מצהיר על שפתו וכיוון הכתיבה', function () {
  seo.LANGUAGES.forEach(function (lang) {
    var tag = pageOf(lang.code).match(/<html[^>]*>/)[0];
    assert(tag.indexOf('lang="' + lang.code + '"') !== -1,
      lang.code + ': ' + tag);
    assert(tag.indexOf('dir="' + lang.dir + '"') !== -1,
      lang.code + ': כיוון כתיבה שגוי — ' + tag);
  });
});

/* hreflang חייב להיות הדדי ומלא. עמוד שמוזכר ואינו מחזיר את
   ההפניה נזרק מהקבוצה, וגוגל חוזר לראות את כולם כתוכן כפול. */
test('ההצהרה ההדדית של hreflang שלמה בכל עמוד', function () {
  seo.LANGUAGES.forEach(function (lang) {
    var html = pageOf(lang.code);
    seo.LANGUAGES.forEach(function (other) {
      var expected = '<link rel="alternate" hreflang="' + other.code +
        '" href="' + DOMAIN + seo.pathOf(other.code) + '">';
      assert(html.indexOf(expected) !== -1,
        lang.code + ' אינו מצהיר על ' + other.code);
    });
    assert(html.indexOf('hreflang="x-default"') !== -1,
      lang.code + ': חסר x-default');
  });
});

test('לכל עמוד שפה קישור קנוני לעצמו', function () {
  seo.LANGUAGES.forEach(function (lang) {
    var expected = '<link rel="canonical" href="' + DOMAIN + seo.pathOf(lang.code) + '">';
    assert(pageOf(lang.code).indexOf(expected) !== -1,
      lang.code + ': הקישור הקנוני אינו מצביע על עצמו');
  });
});

/* עמוד שיורד לתת-תיקייה ומשאיר קישור יחסי מצביע פתאום
   ל-/de/faq/ — כתובת שאינה קיימת. שרשרת 404 עוצרת סריקה. */
test('אין קישור יחסי שבור בעמודי השפה', function () {
  seo.LANGUAGES.forEach(function (lang) {
    if (lang.code === seo.DEFAULT_LANG) return;
    var body = pageOf(lang.code).replace(/<script[\s\S]*?<\/script>/gi, '');
    var relative = (body.match(/href="(?!https?:|\/\/|\/|#|mailto:|tel:|data:)[^"]*"/g) || []);
    assert(relative.length === 0,
      lang.code + ': ' + relative.slice(0, 3).join(' '));
  });
});

/* ===== נתונים מובנים ===== */

console.log('\n== נתונים מובנים ==');

test('כל בלוק JSON-LD הוא JSON תקין', function () {
  ['index.html', 'en/index.html', 'faq/index.html', 'pricing/index.html',
    'about/index.html'].forEach(function (file) {
    var blocks = structured(read(file));
    assert(blocks.length > 0, file + ': אין נתונים מובנים');
    blocks.forEach(function (block) {
      assert(block['@context'] === 'https://schema.org',
        file + ': חסר @context בבלוק ' + block['@type']);
      assert(block['@type'], file + ': בלוק בלי @type');
    });
  });
});

/* המחיר שנשלח לגוגל חייב להיות המחיר באתר. אי-התאמה מורידה
   את התוצאה המורחבת, ובינתיים מביאה אנשים שמגלים מחיר אחר. */
test('המחירים בנתונים המובנים הם המחירים שבמודל', function () {
  var Model = require('../js/backend/model.js');
  var app = typed(read('index.html'), 'SoftwareApplication');
  assert(app, 'אין SoftwareApplication בדף הבית');
  assert(app.offers, 'אין מחירון בנתונים המובנים');
  var priced = Model.PLAN_ORDER
    .map(function (id) { return Model.PLANS[id]; })
    .filter(function (plan) { return !plan.quote; });
  assert(app.offers.offers.length === priced.length,
    'מספר התוכניות אינו תואם: ' + app.offers.offers.length + ' מול ' + priced.length);
  priced.forEach(function (plan, index) {
    assert(app.offers.offers[index].price === String(plan.priceMonthly),
      plan.id + ': ' + app.offers.offers[index].price + ' במקום ' + plan.priceMonthly);
  });
  assert(app.offers.lowPrice === String(priced[0].priceMonthly), 'מחיר הפתיחה שגוי');
});

/* דירוג מומצא אינו "שיפור SEO" אלא עילה להסרה ידנית של האתר
   מהתוצאות. אין ביקורות, ולכן אסור שתהיה תגית דירוג. */
test('אין דירוג מומצא בנתונים המובנים', function () {
  ['index.html', 'en/index.html', 'pricing/index.html'].forEach(function (file) {
    structured(read(file)).forEach(function (block) {
      assert(!block.aggregateRating, file + ': יש aggregateRating בלי ביקורות אמיתיות');
      assert(!block.review, file + ': יש review בלי ביקורות אמיתיות');
    });
  });
});

/* התוכן המסומן חייב להופיע בעמוד. שאלה שנשלחת לגוגל ואינה
   נמצאת בדף היא בדיוק ההפרה שבגללה מוסרת התוצאה המורחבת. */
test('כל שאלה בנתונים המובנים מופיעה בעמוד עצמו', function () {
  [['faq/index.html', 20], ['pricing/index.html', 3]].forEach(function (entry) {
    var html = read(entry[0]);
    var faq = typed(html, 'FAQPage');
    assert(faq, entry[0] + ': אין FAQPage');
    assert(faq.mainEntity.length >= entry[1],
      entry[0] + ': רק ' + faq.mainEntity.length + ' שאלות');
    var text = seo.plainText(html);
    faq.mainEntity.forEach(function (item) {
      assert(text.indexOf(item.name) !== -1,
        entry[0] + ': השאלה אינה בעמוד — "' + item.name + '"');
      assert(item.acceptedAnswer.text.length > 10,
        entry[0] + ': תשובה ריקה ל-"' + item.name + '"');
      /* סימון שלא הוחלף בבנייה */
      assert(item.acceptedAnswer.text.indexOf('{{') === -1,
        entry[0] + ': סימון שלא הוחלף בתשובה ל-"' + item.name + '"');
    });
  });
});

test('לעמודי התוכן יש שביל פירורי לחם', function () {
  ['faq', 'pricing', 'about', 'stories', 'contact'].forEach(function (dir) {
    var crumbs = typed(read(dir + '/index.html'), 'BreadcrumbList');
    assert(crumbs, dir + ': אין BreadcrumbList');
    assert(crumbs.itemListElement.length === 2, dir + ': שביל באורך לא צפוי');
    assert(crumbs.itemListElement[1].item === DOMAIN + '/' + dir + '/',
      dir + ': השביל אינו מוביל לעמוד עצמו');
  });
});

/* ===== תגיות שיתוף ===== */

console.log('\n== תצוגה מקדימה בשיתוף ==');

/* כל העמודים הצהירו על אותה כתובת, ולכן כל שיתוף של "שאלות
   נפוצות" הציג את דף הבית. */
test('לכל עמוד og:url משלו', function () {
  var pages = [['index.html', '/'], ['en/index.html', '/en/'],
    ['faq/index.html', '/faq/'], ['pricing/index.html', '/pricing/'],
    ['about/index.html', '/about/']];
  pages.forEach(function (entry) {
    var url = propertyOf(read(entry[0]), 'og:url');
    assert(url === DOMAIN + entry[1],
      entry[0] + ': og:url הוא ' + url + ' במקום ' + DOMAIN + entry[1]);
  });
});

/* שתי מערכות מידות גרמו לרשתות לחתוך תמונה של 1200 לפי 512 */
test('מידות התמונה נשלחות פעם אחת', function () {
  ['index.html', 'faq/index.html'].forEach(function (file) {
    var widths = read(file).match(/og:image:width/g) || [];
    assert(widths.length === 1, file + ': ' + widths.length + ' מידות רוחב');
  });
});

test('לעמודי התוכן יש כותרת ותיאור בשיתוף', function () {
  ['faq', 'pricing', 'about', 'stories', 'contact', 'guide'].forEach(function (dir) {
    var html = read(dir + '/index.html');
    assert(propertyOf(html, 'og:title'), dir + ': אין og:title');
    assert(propertyOf(html, 'og:description'), dir + ': אין og:description');
  });
});

/* ===== סריקה ===== */

console.log('\n== מה שהסורק מוצא ==');

test('כל עמוד שנבנה נמצא במפת האתר', function () {
  var sitemap = read('sitemap.xml');
  var expected = seo.LANGUAGES.map(function (lang) {
    return DOMAIN + seo.pathOf(lang.code);
  }).concat(['about', 'stories', 'pricing', 'faq', 'contact', 'guide',
    'privacy', 'terms', 'security', 'accessibility'].map(function (dir) {
    return DOMAIN + '/' + dir + '/';
  }));
  expected.forEach(function (loc) {
    assert(sitemap.indexOf('<loc>' + loc + '</loc>') !== -1, 'חסר במפת האתר: ' + loc);
  });
});

test('לכל כתובת במפת האתר יש תאריך עדכון', function () {
  var sitemap = read('sitemap.xml');
  var urls = sitemap.match(/<url>[\s\S]*?<\/url>/g) || [];
  assert(urls.length >= 18, 'רק ' + urls.length + ' כתובות במפת האתר');
  urls.forEach(function (entry) {
    var stamp = entry.match(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/);
    assert(stamp, 'כתובת בלי lastmod: ' + entry.slice(0, 80));
  });
});

test('מפת האתר מצהירה על שפות חלופיות לדף הבית', function () {
  var sitemap = read('sitemap.xml');
  seo.LANGUAGES.forEach(function (lang) {
    assert(sitemap.indexOf('hreflang="' + lang.code + '" href="' +
      DOMAIN + seo.pathOf(lang.code) + '"') !== -1,
      'חסרה הצהרה על ' + lang.code + ' במפת האתר');
  });
});

test('robots מפנה למפת האתר ואינו חוסם את מה שצריך להיסרק', function () {
  var robots = read('robots.txt');
  assert(robots.indexOf('Sitemap: ' + DOMAIN + '/sitemap.xml') !== -1,
    'robots אינו מפנה למפת האתר');
  ['/pricing/', '/faq/', '/en/'].forEach(function (route) {
    assert(robots.indexOf('Disallow: ' + route) === -1, route + ' חסום לסריקה');
  });
  assert(robots.indexOf('Disallow: /admin/') !== -1, 'המשרד האחורי אינו חסום');
});

/* אימות הבעלות מול Bing נשען על קובץ אחד בשורש. מחיקה שלו
   בטעות אינה שוברת דבר באתר, והיא כן מנתקת את האתר מהאינדוקס
   של Bing -- בשקט, עד שמישהו יבדוק. */
test('קובץ האימות של Bing יושב בשורש', function () {
  assert(exists('BingSiteAuth.xml'), 'אין קובץ אימות ל-Bing');
  var xml = read('BingSiteAuth.xml');
  assert(/<user>[A-F0-9]{32}<\/user>/.test(xml), 'קוד האימות אינו בתבנית הצפויה');
});

test('עמוד שגיאה קיים ואינו נכנס לתוצאות', function () {
  assert(exists('404.html'), 'אין עמוד 404');
  var html = read('404.html');
  assert(metaOf(html, 'robots') === 'noindex, follow', 'עמוד 404 אינו מסומן noindex');
  assert(html.indexOf('href="/"') !== -1, 'אין מ-404 דרך חזרה לאתר');
});

/* עמוד תוכן שנסרק צריך לומר במפורש שמותר להציג ממנו קטע מלא
   ותמונה גדולה; המערכת עצמה אינה עמוד תוכן. */
test('עמודי התוכן פתוחים לסריקה והמערכת אינה', function () {
  ['index.html', 'en/index.html', 'faq/index.html', 'pricing/index.html']
    .forEach(function (file) {
      assert(/^index, follow/.test(metaOf(read(file), 'robots') || ''),
        file + ': ' + metaOf(read(file), 'robots'));
    });
  ['app/index.html', 'admin/index.html', 'tool/index.html'].forEach(function (file) {
    assert(/noindex/.test(metaOf(read(file), 'robots') || ''),
      file + ' נסרק ואינו אמור');
  });
});

/* ===== מהירות ===== */

console.log('\n== מה שנטען לפני הציור הראשון ==');

/* התמונה הראשית היא אלמנט ה-LCP, ו-LCP הוא גורם דירוג ישיר
   בחיפוש מהטלפון. בלי srcset הטלפון מוריד קובץ של 1.3 מגה
   כדי להציג אותו ברוחב 360. */
test('התמונה הראשית מוגשת בכמה רוחבים', function () {
  var html = read('index.html');
  var srcset = (html.match(/srcset="([^"]+)"/) || [, ''])[1];
  assert(srcset, 'אין srcset לתמונה הראשית');
  var widths = srcset.split(',').map(function (entry) {
    return Number((entry.trim().split(/\s+/)[1] || '').replace('w', ''));
  });
  assert(widths.length >= 3, 'רק ' + widths.length + ' רוחבים');
  assert(Math.min.apply(null, widths) <= 600, 'אין גרסה לטלפון צר');
  assert(html.indexOf('sizes="') !== -1, 'אין sizes, ולכן הדפדפן מניח 100vw');
  srcset.split(',').forEach(function (entry) {
    var file = entry.trim().split(/\s+/)[0].replace(/^\//, '');
    assert(exists(file), 'הקובץ אינו קיים: ' + file);
  });
});

test('הגרסה לטלפון קטנה משמעותית מהמקור', function () {
  var big = fs.statSync(path.join(SITE, 'assets/landing/hero-schedule.png')).size;
  var small = fs.statSync(path.join(SITE, 'assets/landing/hero-schedule-836.png')).size;
  assert(small < big * 0.5,
    'הגרסה לטלפון היא ' + Math.round(small / big * 100) + '% מהמקור');
});

/* href="undefined" נשלח בכל עמוד תוכן, ולכן כל ביקור ביקש
   מהשרת קובץ שאינו קיים וקיבל 404. */
test('אין נתיב "undefined" בשום עמוד שנבנה', function () {
  ['index.html', 'en/index.html', 'faq/index.html', 'pricing/index.html',
    'about/index.html', 'guide/index.html', '404.html'].forEach(function (file) {
    assert(read(file).indexOf('="undefined"') === -1, file + ': יש בו href="undefined"');
  });
});

console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
process.exit(failed ? 1 : 0);
