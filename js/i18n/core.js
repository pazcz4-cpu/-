/* מנגנון ריבוי שפות.
   הוספת שפה חדשה = קובץ אחד שקורא ל-I18n.register עם מילון.
   מפתח שחסר בשפה מסוימת נופל לאנגלית, ואם גם שם אין – מוצג המפתח,
   כך שתרגום חלקי לעולם אינו שובר את המערכת. */
(function (root) {
  'use strict';

  var languages = {};   // code -> { code, name, dir, locale, weekStart, currency, dict }
  var current = null;
  var listeners = [];

  /* שני דברים שונים שקל לבלבל ביניהם:

     fallback   – לאן נופל *מפתח בודד* שחסר בתרגום. זה נשאר אנגלית,
                  כי אנגלית היא המילון המלא ביותר ותמיד מובנת יותר
                  מהצגת המפתח עצמו.

     defaultLang – באיזו שפה *נפתח האתר* למי שעוד לא בחר שפה.
                  עברית, כי השוק הראשון הוא ישראל, ודפדפן באנגלית
                  הוא דבר נפוץ מאוד אצל משתמשים ישראלים ואינו מעיד
                  על העדפה.

     autoDetect  – האם ללכת לפי הגדרות הדפדפן במקום ברירת המחדל.
                  כבוי כרגע. כשתהיה מכירה מחוץ לישראל מדליקים אותו
                  כאן, או קוראים ל-setDefault, ושום דבר אחר לא
                  משתנה. */
  var fallback = 'en';
  var defaultLang = 'he';
  var autoDetect = false;

  function register(definition) {
    var code = definition.code;
    languages[code] = {
      code: code,
      name: definition.name,                 // שם השפה בשפה עצמה
      dir: definition.dir || 'ltr',
      locale: definition.locale || code,     // לפורמט תאריכים
      weekStart: typeof definition.weekStart === 'number' ? definition.weekStart : 1,
      currency: definition.currency || { code: 'USD', symbol: '$', position: 'before' },
      dict: definition.dict || {}
    };
    return languages[code];
  }

  function list() {
    return Object.keys(languages).map(function (code) {
      return { code: code, name: languages[code].name, dir: languages[code].dir };
    });
  }

  function has(code) { return !!languages[code]; }

  function definition(code) {
    return languages[code] || languages[fallback] || languages[Object.keys(languages)[0]];
  }

  function use(code) {
    current = has(code) ? code : detect();
    listeners.forEach(function (fn) {
      try { fn(current); } catch (err) { /* מאזין תקול לא מפיל את השאר */ }
    });
    return current;
  }

  function onChange(fn) { listeners.push(fn); }

  function code() { return current || detect(); }

  function active() { return definition(code()); }

  /* השפה שהדפדפן מבקש, אם יש לנו אותה. null אם אין התאמה. */
  function browserLanguage() {
    var candidates = [];
    var nav = root.navigator;
    if (nav) {
      if (nav.languages) candidates = candidates.concat(nav.languages);
      if (nav.language) candidates.push(nav.language);
    }
    for (var i = 0; i < candidates.length; i++) {
      var tag = String(candidates[i] || '');
      if (has(tag)) return tag;
      var base = tag.split('-')[0];
      if (has(base)) return base;
    }
    return null;
  }

  /* ברירת המחדל עצמה, עם רשת ביטחון אם המילון שלה לא נטען */
  function fallbackLanguage() {
    if (has(defaultLang)) return defaultLang;
    if (has(fallback)) return fallback;
    return Object.keys(languages)[0];
  }

  /* השפה שבה נפתחים. זו הפונקציה שקוראים לה בעליית העמוד. */
  function initial() {
    if (autoDetect) {
      var found = browserLanguage();
      if (found) return found;
    }
    return fallbackLanguage();
  }

  /* נשמר בשם הישן כדי שקוד קיים ימשיך לעבוד */
  function detect() { return initial(); }

  /* שינוי ברירת המחדל. setDefault('en', { autoDetect: true }) מחזיר
     את ההתנהגות של זיהוי לפי הדפדפן, לקראת מכירה בחו"ל. */
  function setDefault(code, options) {
    if (code) defaultLang = code;
    if (options && typeof options.autoDetect === 'boolean') {
      autoDetect = options.autoDetect;
    }
    return { defaultLanguage: defaultLang, autoDetect: autoDetect };
  }

  function lookup(dict, key) {
    if (!dict) return undefined;
    if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
    // תמיכה במפתחות מקוננים: 'schedule.generate'
    var parts = key.split('.');
    var node = dict;
    for (var i = 0; i < parts.length; i++) {
      if (!node || typeof node !== 'object') return undefined;
      node = node[parts[i]];
    }
    return typeof node === 'string' ? node : undefined;
  }

  /* החלפת תבניות: "נותרו {count} ימים" */
  function interpolate(template, params) {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;
    });
  }

  function t(key, params) {
    var text = lookup(active().dict, key);
    if (text === undefined && languages[fallback]) {
      text = lookup(languages[fallback].dict, key);
    }
    if (text === undefined) return key;
    return interpolate(text, params);
  }

  /* בחירה בין צורת יחיד לרבים: t.plural('shifts', 3) */
  function plural(key, count, params) {
    var suffix = count === 1 ? '.one' : '.other';
    var merged = params || {};
    merged.count = count;
    var text = t(key + suffix, merged);
    return text === key + suffix ? t(key, merged) : text;
  }

  function dir() { return active().dir; }
  function isRtl() { return dir() === 'rtl'; }
  function weekStart() { return active().weekStart; }
  function currency() { return active().currency; }

  function formatMoney(amount) {
    var money = currency();
    var value = String(amount);
    return money.position === 'before' ? money.symbol + value : value + money.symbol;
  }

  var API = {
    register: register, list: list, has: has, use: use, code: code, active: active,
    detect: detect, initial: initial, setDefault: setDefault,
    browserLanguage: browserLanguage, onChange: onChange, t: t, plural: plural,
    dir: dir, isRtl: isRtl, weekStart: weekStart, currency: currency, formatMoney: formatMoney,
    interpolate: interpolate
  };

  root.I18n = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }

  /* בדפדפן השפות נטענות בתגי script. ב-Node אין תגים, ולכן נטען כאן
     את המילונים המצורפים כדי ש-t() יעבוד גם בבדיקות ובסקריפטים. */
  if (typeof require === 'function' && typeof module !== 'undefined' && module.exports) {
    ['en', 'he', 'es', 'fr', 'ar', 'ru', 'de', 'pt'].forEach(function (lang) {
      try { require('./' + lang + '.js'); } catch (err) { /* שפה שאינה מצורפת */ }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
