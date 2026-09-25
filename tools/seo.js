/* מה שמנוע חיפוש רואה כשהוא מגיע לאתר.

   למה מודול ולא כמה שורות בתוך build-site.js: כל דבר כאן הוא
   הצהרה על המוצר שנשלחת לגוגל ואי אפשר לתקן אותה בשקט אחרי
   שנסרקה. כותרת שגויה, מחיר שאינו נכון בנתונים המובנים או
   hreflang שמצביע לכתובת שאינה קיימת — כולם נראים תקינים בדפדפן
   ומתגלים רק שבועות אחר כך, בדוח של Search Console. כאן הם
   יושבים במקום אחד שאפשר לבדוק אותו בלי לבנות אתר.

   שלושה דברים נעשים כאן:

   1. תרגום העמוד בזמן הבנייה. דף המכירה נכתב עם data-i18n
      ומתורגם בדפדפן, ולכן סורק שמגיע לכתובת אחת רואה עברית
      בלבד — שבע שפות פשוט אינן קיימות מבחינתו. הפונקציות כאן
      מחליפות את הטקסטים לפני השליחה, וכל שפה מקבלת כתובת משלה.

   2. hreflang. שמונה עמודים שאומרים אותו דבר בשפות שונות הם
      תוכן כפול, אלא אם כל אחד מהם מצהיר על כל האחרים. ההצהרה
      חייבת להיות הדדית — עמוד שמוזכר ואינו מחזיר את ההפניה
      נזרק מהקבוצה כולה.

   3. נתונים מובנים. מה שהופך תוצאה רגילה לתוצאה עם מחיר,
      דירוג או רשימת שאלות. הם נגזרים כאן מהמקור האמיתי —
      המחירים מ-model.js והשאלות מהעמוד עצמו — כדי שלא יהיה
      מצב שבו המחיר בגוגל אינו המחיר באתר. */
'use strict';

/* השפות והכתובות שלהן. העברית יושבת בשורש ולא תחת /he/: זו
   הכתובת שכבר קיימת, שאליה מצביעים קישורים חיצוניים, ושינוי
   שלה היה מוחק את מה שנצבר. */
const LANGUAGES = [
  { code: 'he', dir: 'rtl', ogLocale: 'he_IL' },
  { code: 'en', dir: 'ltr', ogLocale: 'en_US' },
  { code: 'ar', dir: 'rtl', ogLocale: 'ar_001' },
  { code: 'de', dir: 'ltr', ogLocale: 'de_DE' },
  { code: 'es', dir: 'ltr', ogLocale: 'es_ES' },
  { code: 'fr', dir: 'ltr', ogLocale: 'fr_FR' },
  { code: 'pt', dir: 'ltr', ogLocale: 'pt_PT' },
  { code: 'ru', dir: 'ltr', ogLocale: 'ru_RU' }
];

const DEFAULT_LANG = 'he';

/* x-default הוא מה שמוצג למי שאף שפה שלו אינה ברשימה. העברית
   היא השוק הראשון, והיא גם הכתובת בשורש. */
function pathOf(code) {
  return code === DEFAULT_LANG ? '/' : '/' + code + '/';
}

function langOf(code) {
  return LANGUAGES.filter((lang) => lang.code === code)[0] || null;
}

function escapeAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeText(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* הכול חוץ ממה שבתוך <script> ו-<style>.

   בלי ההפרדה הזו כל כלל כאן פוגע גם בקוד. בדף המכירה יש שורה
   שבונה קישור: href="' + esc(quoteHref()) + '" — והכלל שהופך
   קישורים יחסיים למוחלטים הפך אותה ל-href="/' + ..., כלומר
   שבר את כתובת הפנייה לרשתות בלי להשאיר שום סימן. מחרוזת
   בתוך קוד נראית בדיוק כמו קישור, והדרך היחידה להבדיל היא
   לא להיכנס לשם בכלל. */
function outsideCode(html, fn) {
  return String(html)
    .split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/i)
    .map((part, index) => (index % 2 ? part : fn(part)))
    .join('');
}

/* ===== תרגום בזמן הבנייה ===== */

/* אותן תכונות ש-js/i18n/dom.js מחליף בדפדפן. אם תיווסף שם
   תכונה חדשה והיא לא תיווסף כאן, העמודים המתורגמים יישלחו עם
   הערך העברי — ולכן יש בדיקה שמשווה בין שתי הרשימות. */
const ATTRIBUTES = {
  'content': 'content',
  'aria-label': 'aria-label',
  'placeholder': 'placeholder',
  'title': 'title',
  'value': 'value'
};

/* הטקסט שבתוך אלמנט מסומן. כל האלמנטים בדף המכירה שמסומנים
   ב-data-i18n מכילים טקסט בלבד ולא תגיות נוספות (יש בדיקה
   שמוודאת זאת), ולכן החלפה עד סגירת התגית הקרובה היא נכונה. */
function translateText(html, t) {
  return outsideCode(html, (part) => part.replace(
    /<([a-z0-9]+)((?:[^>]*?)\sdata-i18n="([^"]+)"(?:[^>]*?))>[\s\S]*?<\/\1>/gi,
    (match, tag, attrs, key) =>
      '<' + tag + attrs + '>' + escapeText(t(key)) + '</' + tag + '>'));
}

/* תכונות: data-i18n-content="landing.metaDescription" אומר
   שהערך של content צריך להיות התרגום של אותו מפתח. */
function translateAttributes(html, t) {
  return outsideCode(html, (part) => part.replace(/<[a-z0-9]+\b[^>]*>/gi, (tag) => {
    if (tag.indexOf('data-i18n-') === -1) return tag;
    Object.keys(ATTRIBUTES).forEach((name) => {
      const source = tag.match(new RegExp('\\sdata-i18n-' + name + '="([^"]+)"'));
      if (!source) return;
      const value = escapeAttr(t(source[1]));
      const target = new RegExp('(\\s' + ATTRIBUTES[name] + '=")[^"]*(")');
      tag = target.test(tag)
        ? tag.replace(target, (m, before, after) => before + value + after)
        : tag.replace(/\s*\/?>$/, (close) =>
          ' ' + ATTRIBUTES[name] + '="' + value + '"' + close);
    });
    return tag;
  }));
}

/* שפת המסמך וכיוון הכתיבה. סורק קורא אותם, וקורא מסך קורא
   אותם גם הוא — עמוד ערבי שמוצהר כעברי נקרא בקול הלא נכון. */
function setDocumentLanguage(html, lang) {
  return html.replace(/<html[^>]*>/i,
    '<html lang="' + lang.code + '" dir="' + lang.dir + '">');
}

function translate(html, t, lang) {
  return setDocumentLanguage(translateAttributes(translateText(html, t), t), lang);
}

/* ===== קישורים יחסיים בעמוד שירד לתת-תיקייה ===== */

/* דף המכירה יושב בשורש ומקשר ל-"faq/" ול-"app/?signup=1".
   כשאותו דף נשלח גם כ-/en/, כל קישור כזה מצביע פתאום
   ל-/en/faq/ — כתובת שאינה קיימת. סורק שמוצא שרשרת 404
   מפסיק לסרוק, ולכן זה לא רק מטריד אלא עוצר אינדוקס.

   עמודי התוכן כתובים בעברית ובאנגלית בלבד, ולכן מי שמגיע
   משפה אחרת מקבל אותם באנגלית — סימון עוגן שאינו נשלח לשרת
   ואינו יוצר כתובת שנייה לאותו תוכן. */
/* עוגן רק לעמודי הפרוזה. לא למערכת, ולא לקבצים. */
const PROSE = /^\/(about|stories|faq|contact|guide|pricing|privacy|terms|security|accessibility)\/$/;

function absoluteLinks(html, code) {
  const anchor = code === DEFAULT_LANG ? '' : '#en';
  return outsideCode(html, (part) => part.replace(
    /href="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)([^"]*)"/g,
    (match, value) => {
      /* "./" הוא קישור לשורש, ו-"/./" הוא כתובת שנייה לאותו
         עמוד מבחינת סורק. */
      const cleaned = String(value).replace(/^\.\//, '');
      const absolute = '/' + cleaned;
      return 'href="' + absolute + (PROSE.test(absolute) ? anchor : '') + '"';
    }));
}

/* ===== hreflang ===== */

/* ההצהרה חייבת להיות הדדית ומלאה: כל עמוד מצהיר על כל השפות,
   כולל על עצמו. עמוד שחסר ברשימה של אחר נזרק מהקבוצה, וגוגל
   חוזר להתייחס לשניהם כתוכן כפול. */
function alternateTags(siteUrl) {
  return LANGUAGES.map((lang) =>
    '<link rel="alternate" hreflang="' + lang.code +
    '" href="' + siteUrl + pathOf(lang.code) + '">')
    .concat('<link rel="alternate" hreflang="x-default" href="' +
      siteUrl + pathOf(DEFAULT_LANG) + '">');
}

/* ===== תגיות שיתוף ===== */

/* תצוגה מקדימה בוואטסאפ, בפייסבוק ובלינקדאין. אלה אינן משפיעות
   על הדירוג, אבל כן על כמה אנשים לוחצים על קישור ששותף — וזה
   כן משפיע.

   og:url חייב להיות הכתובת של העמוד הזה ולא של דף הבית. כשכל
   העמודים הצהירו על אותה כתובת, כל שיתוף של "שאלות נפוצות"
   הציג את דף הבית. */
function socialTags(meta) {
  const image = meta.image || (meta.siteUrl + '/icons/social.png');
  return [
    '<meta property="og:type" content="' + (meta.type || 'website') + '">',
    '<meta property="og:site_name" content="SetShifts">',
    '<meta property="og:url" content="' + escapeAttr(meta.url) + '">',
    '<meta property="og:locale" content="' + (meta.ogLocale || 'he_IL') + '">'
  ].concat(LANGUAGES
    .filter((lang) => lang.ogLocale !== (meta.ogLocale || 'he_IL'))
    .map((lang) => '<meta property="og:locale:alternate" content="' + lang.ogLocale + '">'))
    .concat([
      '<meta property="og:title" content="' + escapeAttr(meta.title) + '">',
      '<meta property="og:description" content="' + escapeAttr(meta.description) + '">',
      '<meta property="og:image" content="' + escapeAttr(image) + '">',
      /* המידות נשלחות פעם אחת ובגודל האמיתי של הקובץ. כששלחנו
         שתי מערכות מידות, רשתות בחרו את האחרונה — 512x512 —
         וחתכו לפיה תמונה שרוחבה 1200. */
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      '<meta property="og:image:alt" content="' + escapeAttr(meta.title) + '">',
      '<meta name="twitter:card" content="summary_large_image">',
      '<meta name="twitter:title" content="' + escapeAttr(meta.title) + '">',
      '<meta name="twitter:description" content="' + escapeAttr(meta.description) + '">',
      '<meta name="twitter:image" content="' + escapeAttr(image) + '">'
    ]);
}

/* ===== נתונים מובנים ===== */

function jsonLd(data) {
  /* </script> בתוך מחרוזת היה סוגר את הבלוק באמצע וגורר את שאר
     העמוד לתוך הסקריפט. אין כאן קלט משתמש, אבל טקסט שיווקי
     משתנה ותקלה כזו נראית כמו עמוד שבור ולא כמו באג. */
  const text = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
  return '<script type="application/ld+json">\n' + text + '\n</script>';
}

/* מי אנחנו. חוזר על עצמו בכל עמוד בכוונה: גוגל בונה את זהות
   האתר מהחזרה, לא מהופעה בודדת. */
function organization(siteUrl, options) {
  const opts = options || {};
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': siteUrl + '/#organization',
    name: 'SetShifts',
    url: siteUrl + '/',
    logo: siteUrl + '/icons/icon-512.png'
  };
  if (opts.legalName) data.legalName = opts.legalName;
  if (opts.supportEmail) {
    data.contactPoint = [{
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: opts.supportEmail,
      availableLanguage: LANGUAGES.map((lang) => lang.code)
    }];
  }
  return data;
}

/* המוצר עצמו, עם המחירון. המחירים נקראים מ-model.js ולא
   נכתבים כאן: מחיר שמופיע בגוגל ואינו המחיר באתר הוא בדיוק
   הסוג של אי-התאמה שגוגל מסיר בגללה את התוצאה המורחבת.

   אין כאן aggregateRating. דירוג הוא הצהרה על ביקורות שקיימות,
   ואין כאלה עדיין — סימון דירוג מומצא הוא עילה להסרה ידנית של
   האתר מהתוצאות, לא רק של התוצאה המורחבת. */
function softwareApplication(siteUrl, options) {
  const opts = options || {};
  const priced = (opts.plans || []).filter((plan) => !plan.quote);
  const prices = priced.map((plan) => plan.priceMonthly);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': siteUrl + '/#software',
    name: 'SetShifts',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: opts.subCategory || 'Employee scheduling',
    operatingSystem: 'Web, iOS, Android',
    url: siteUrl + '/',
    description: opts.description || '',
    inLanguage: LANGUAGES.map((lang) => lang.code),
    publisher: { '@id': siteUrl + '/#organization' }
  };
  if (opts.features && opts.features.length) data.featureList = opts.features;
  if (priced.length) {
    data.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: opts.currency || 'ILS',
      lowPrice: String(Math.min.apply(null, prices)),
      highPrice: String(Math.max.apply(null, prices)),
      offerCount: String(priced.length),
      url: siteUrl + (opts.pricingPath || '/pricing/'),
      offers: priced.map((plan) => ({
        '@type': 'Offer',
        name: plan.name,
        price: String(plan.priceMonthly),
        priceCurrency: opts.currency || 'ILS',
        url: siteUrl + (opts.pricingPath || '/pricing/'),
        category: plan.range,
        availability: 'https://schema.org/InStock'
      }))
    };
  }
  return data;
}

/* פירורי לחם. מה שהופך את השורה מתחת לכותרת בתוצאה מכתובת
   ארוכה לשביל קריא. */
function breadcrumbs(siteUrl, trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: siteUrl + step.path
    }))
  };
}

/* שאלות ותשובות. נקראות מהעמוד עצמו ולא נכתבות כאן פעם שנייה:
   שאלה שתשתנה בעמוד ולא כאן תישלח לגוגל כתשובה שאינה קיימת,
   וזו הפרה של הכלל שהתוכן המסומן חייב להיות גלוי בעמוד. */
function faqFromHtml(html, lang) {
  const article = articleOf(html, lang || 'he');
  if (!article) return [];
  const items = [];
  /* התשובה נגמרת בכותרת הבאה — או בשורת הסיום של העמוד, שהיא
     קריאה לפעולה ולא חלק מהתשובה. בלי התנאי הזה התשובה האחרונה
     בכל עמוד נשלחה לגוגל עם "התחילו 14 ימי ניסיון" בתוכה. */
  const pattern =
    /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h[23][^>]*>|<p class="legal-foot"|$)/gi;
  let match;
  while ((match = pattern.exec(article))) {
    const question = plainText(match[1]);
    const answer = plainText(match[2]);
    if (question && answer) items.push({ question: question, answer: answer });
  }
  return items;
}

function faqPage(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer }
    }))
  };
}

/* הגרסה בשפה אחת מתוך עמוד שכתוב בשתיים */
function articleOf(html, lang) {
  const pattern = new RegExp(
    '<article[^>]*data-legal="' + lang + '"[^>]*>([\\s\\S]*?)</article>', 'i');
  const found = html.match(pattern);
  return found ? found[1] : null;
}

function plainText(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  LANGUAGES: LANGUAGES,
  DEFAULT_LANG: DEFAULT_LANG,
  ATTRIBUTES: ATTRIBUTES,
  pathOf: pathOf,
  langOf: langOf,
  translate: translate,
  translateText: translateText,
  translateAttributes: translateAttributes,
  absoluteLinks: absoluteLinks,
  alternateTags: alternateTags,
  socialTags: socialTags,
  jsonLd: jsonLd,
  organization: organization,
  softwareApplication: softwareApplication,
  breadcrumbs: breadcrumbs,
  faqFromHtml: faqFromHtml,
  faqPage: faqPage,
  articleOf: articleOf,
  plainText: plainText,
  escapeAttr: escapeAttr
};
