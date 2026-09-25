/* לוח השנה: חגים ומועדים, מחושבים ולא מוקלדים.

   למה בקוד ולא מ-API: סידור משמרות נבנה גם בלי רשת, גם לשנה
   הבאה, וגם בעוד שלוש שנים. מקור חיצוני הופך את כל אלה לתלויים
   בשירות שמישהו אחר מתחזק — ובשנה שבה הוא ייפול, העסק יגלה את
   זה ביום שבו הוא משבץ אנשים לחג.

   שלושה לוחות:

     · עברי — חישוב מלא, כולל שנים מעוברות ודחיות ראש השנה.
     · מוסלמי — הלוח הטבלאי. לוח ההיג'רה האמיתי נקבע בראיית
       ירח, ולכן תאריך שמחושב יכול לסטות ביום מהתאריך שנקבע
       בפועל. זה מסומן במפורש על כל מועד כזה, והעסק יכול להזיז.
     · נוצרי — חג המולד, ופסחא לפי חישוב Computus בשתי הגרסאות:
       הגרגוריאנית והיוליאנית, כי רוב הנוצרים בישראל אורתודוקסים
       והם הולכים אחרי היוליאנית.

   מה שהמודול הזה **אינו** עושה: הוא אינו מחליט מה סגור. איזה
   חג משבית את העסק, איזה עובד בשעות מצומצמות ובאיזה לא משנה
   כלום — זו החלטה של העסק, והיא נשמרת בהגדרות שלו. */
(function (root) {
  'use strict';

  /* ===== ימים מוחלטים =====

     כל החישובים עוברים דרך "מספר יום" רציף (Rata Die): היום
     ה-1 הוא 1 בינואר שנת 1 בלוח הגרגוריאני הפרולפטי. כך
     המרה בין שני לוחות היא חיסור, ולא טבלה. */

  function floorDiv(a, b) { return Math.floor(a / b); }
  function mod(a, b) { return a - b * Math.floor(a / b); }

  function isGregorianLeap(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  /* מספר היום המוחלט של תאריך גרגוריאני */
  function fixedFromGregorian(year, month, day) {
    var prior = year - 1;
    var days = 365 * prior + floorDiv(prior, 4) - floorDiv(prior, 100) +
      floorDiv(prior, 400) + floorDiv(367 * month - 362, 12) + day;
    if (month > 2) days += isGregorianLeap(year) ? -1 : -2;
    return days;
  }

  function gregorianFromFixed(fixed) {
    /* הערכה ואז תיקון: זול יותר מחיפוש בינארי, ומדויק */
    var approx = floorDiv(400 * (fixed - 1) + 400, 146097);
    var year = fixed >= fixedFromGregorian(approx + 1, 1, 1) ? approx + 1 : approx;
    var prior = fixed - fixedFromGregorian(year, 1, 1);
    var correction = fixed < fixedFromGregorian(year, 3, 1) ? 0
      : (isGregorianLeap(year) ? 1 : 2);
    var month = floorDiv(12 * (prior + correction) + 373, 367);
    var day = fixed - fixedFromGregorian(year, month, 1) + 1;
    return { year: year, month: month, day: day };
  }

  function dateFromFixed(fixed) {
    var g = gregorianFromFixed(fixed);
    return new Date(g.year, g.month - 1, g.day);
  }

  function fixedFromDate(date) {
    return fixedFromGregorian(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  /* ===== הלוח העברי =====

     השנה העברית בנויה ממחזור של 19 שנים שבו שבע מעוברות, ומכאן
     מספר החודשים שחלפו. משם מחשבים את המולד, ועליו חלות ארבע
     דחיות שמזיזות את ראש השנה ביום או יומיים. הדחיות הן מה
     שגורם לשנה העברית להיות באורך 353 עד 385 יום, והן גם מה
     שמבטיח "לא אד״ו ראש" – ראש השנה לעולם אינו ראשון, רביעי
     או שישי. */

  var HEBREW_EPOCH = -1373427;   // 1 בתשרי שנת 1 לבריאה

  function isHebrewLeapYear(year) {
    return mod(7 * year + 1, 19) < 7;
  }

  function hebrewMonthsInYear(year) {
    return isHebrewLeapYear(year) ? 13 : 12;
  }

  /* כמה ימים חלפו מהבריאה ועד המולד של תשרי בשנה הזו, אחרי
     הדחייה הראשונה (מולד זקן ולא אד״ו ראש). */
  function hebrewElapsedDays(year) {
    var monthsElapsed = floorDiv(235 * year - 234, 19);
    var partsElapsed = 12084 + 13753 * monthsElapsed;
    var day = 29 * monthsElapsed + floorDiv(partsElapsed, 25920);
    return mod(3 * (day + 1), 7) < 3 ? day + 1 : day;
  }

  /* הדחייה השנייה, שנגזרת מאורך השנה שלפני ושל זו שאחרי:
     שנה אינה יכולה להיות באורך 356 או 382 יום. */
  function hebrewNewYearDelay(year) {
    var last = hebrewElapsedDays(year - 1);
    var present = hebrewElapsedDays(year);
    var next = hebrewElapsedDays(year + 1);
    if (next - present === 356) return 2;
    if (present - last === 382) return 1;
    return 0;
  }

  /* היום המוחלט של א׳ בתשרי */
  function hebrewNewYear(year) {
    return HEBREW_EPOCH + hebrewElapsedDays(year) + hebrewNewYearDelay(year);
  }

  function hebrewYearLength(year) {
    return hebrewNewYear(year + 1) - hebrewNewYear(year);
  }

  /* מספרי החודשים כאן הם לפי הסדר מתשרי: 1=תשרי ... 12/13=אלול.
     זו אינה הספירה המקראית (שמתחילה בניסן), אבל היא זו שמתאימה
     לשנה שמתחילה בראש השנה, וזה מה שהמשתמש רואה. */
  var TISHREI = 1, CHESHVAN = 2, KISLEV = 3, TEVET = 4, SHVAT = 5;
  var ADAR_A = 6, ADAR_B = 7, NISAN = 8, IYAR = 9, SIVAN = 10;
  var TAMUZ = 11, AV = 12, ELUL = 13;

  /* בשנה פשוטה אין אדר א׳, והחודשים שאחריו נדחסים באחד */
  function normalizeMonth(year, month) {
    if (isHebrewLeapYear(year)) return month;
    return month > ADAR_A ? month - 1 : month;
  }

  function hebrewMonthLength(year, month) {
    var leap = isHebrewLeapYear(year);
    var length = hebrewYearLength(year);
    switch (month) {
      case TISHREI: return 30;
      case CHESHVAN: return length === 355 || length === 385 ? 30 : 29;  // חשוון המלא
      case KISLEV: return length === 353 || length === 383 ? 29 : 30;    // כסלו החסר
      case TEVET: return 29;
      case SHVAT: return 30;
      case ADAR_A: return leap ? 30 : 29;
      case ADAR_B: return 29;
      case NISAN: return 30;
      case IYAR: return 29;
      case SIVAN: return 30;
      case TAMUZ: return 29;
      case AV: return 30;
      default: return 29;   // אלול
    }
  }

  /* היום המוחלט של תאריך עברי. month הוא לפי הקבועים למעלה,
     ובשנה פשוטה אדר הוא ADAR_A. */
  function fixedFromHebrew(year, month, day) {
    var target = normalizeMonth(year, month);
    var fixed = hebrewNewYear(year);
    var count = isHebrewLeapYear(year) ? 13 : 12;
    for (var m = 1; m < target && m <= count; m++) {
      fixed += hebrewMonthLength(year, isHebrewLeapYear(year) ? m : (m >= ADAR_A ? m + 1 : m));
    }
    return fixed + day - 1;
  }

  /* ===== הלוח המוסלמי (טבלאי) =====

     הלוח האמיתי נקבע בראיית ירח ומשתנה בין מדינות. הטבלאי הוא
     קירוב מקובל, והוא יכול לסטות יום מהתאריך שנקבע בפועל. לכן
     כל מועד מוסלמי חוזר מכאן עם approximate: true. */

  var ISLAMIC_EPOCH = 227015;   // 1 במוחרם שנת 1 להיג'רה

  function fixedFromIslamic(year, month, day) {
    return ISLAMIC_EPOCH - 1 + (year - 1) * 354 + floorDiv(3 + 11 * year, 30) +
      29 * (month - 1) + floorDiv(month, 2) + day;
  }

  function islamicYearsTouching(gregorianYear) {
    /* שנה מוסלמית קצרה מהגרגוריאנית, ולכן שנה אחת אזרחית
       נוגעת בשתיים ולפעמים בשלוש. */
    var start = Math.floor((gregorianYear - 622) * 1.0307) - 1;
    var out = [];
    for (var y = start; y <= start + 3; y++) if (y > 0) out.push(y);
    return out;
  }

  /* ===== פסחא =====

     Computus. הגרסה הגרגוריאנית משרתת את הקתולים והפרוטסטנטים,
     והיוליאנית את האורתודוקסים – שהם רוב הנוצרים בישראל. */

  /* יום ראשון הבא אחרי יום מוחלט נתון (0 = ראשון ב-RD) */
  function sundayAfter(fixed) {
    return fixed + 7 - mod(fixed + 7 - 0, 7);
  }

  function easterGregorian(year) {
    var century = floorDiv(year, 100) + 1;
    var shiftedEpact = mod(14 + 11 * mod(year, 19) - floorDiv(3 * century, 4) +
      floorDiv(5 + 8 * century, 25), 30);
    if (shiftedEpact === 0 || (shiftedEpact === 1 && mod(year, 19) > 10)) shiftedEpact += 1;
    var paschalMoon = fixedFromGregorian(year, 4, 19) - shiftedEpact;
    return sundayAfter(paschalMoon);
  }

  function easterJulian(year) {
    var shiftedEpact = mod(14 + 11 * mod(year, 19), 30);
    /* הירח הפסחאלי בלוח היוליאני, מומר ליום מוחלט */
    var paschalMoon = fixedFromJulian(year, 4, 19) - shiftedEpact;
    return sundayAfter(paschalMoon);
  }

  function fixedFromJulian(year, month, day) {
    var y = year < 0 ? year + 1 : year;
    var days = -1 + 365 * (y - 1) + floorDiv(y - 1, 4) +
      floorDiv(367 * month - 362, 12) + day;
    if (month > 2) days += isJulianLeap(year) ? -1 : -2;
    return days - 2;   // היסט בין הלוח היוליאני לגרגוריאני הפרולפטי
  }

  function isJulianLeap(year) {
    return mod(year, 4) === (year > 0 ? 0 : 3);
  }


  /* ===== המועדים עצמם =====

     כל מועד חוזר עם kind, ולא עם "סגור/פתוח": מה שחג עושה לעסק
     תלוי בעסק. חנוכה הוא יום עבודה רגיל למשרד ושיא עונה לקמעונאי,
     ויום הזיכרון הוא יום עבודה שבו רוב העסקים סוגרים מוקדם. לכן
     המודול אומר *מה* היום, וההגדרות אומרות מה עושים איתו.

       yomtov   – חג שאסור בעבודה (ראש השנה, כיפור, סוכות, פסח, שבועות)
       erev     – ערב חג, יום מקוצר בחוק
       cholhamoed – חול המועד
       memorial – יום הזיכרון ויום השואה
       fast     – צום
       festive  – פורים, חנוכה, ל״ג בעומר, ט״ו בשבט, יום ירושלים
       muslim   – מועד מוסלמי (מקורב, ראו למטה)
       christian – מועד נוצרי */

  function entry(fixed, id, kind, extra) {
    var out = { fixed: fixed, id: id, kind: kind };
    if (extra) { for (var key in extra) if (extra.hasOwnProperty(key)) out[key] = extra[key]; }
    return out;
  }

  /* ===== דחיות יום הזיכרון, יום העצמאות ויום השואה =====

     אלה אינן שוליות: הן מזיזות יום עבודה שלם, והן משתנות משנה
     לשנה. עסק שמסתמך על "ה׳ באייר" בלי הדחייה משבץ אנשים ביום
     הלא נכון. */
  function dayOfWeek(fixed) { return mod(fixed, 7); }   // 0 = ראשון

  function independenceDays(hebrewYear) {
    var iyar5 = fixedFromHebrew(hebrewYear, IYAR, 5);
    var dow = dayOfWeek(iyar5);
    var independence = iyar5;
    /* חל בשישי או בשבת – מקדימים לחמישי.
       חל בראשון – דוחים לשני, כדי שיום הזיכרון לא ייפול במוצאי שבת. */
    if (dow === 5) independence = iyar5 - 1;        // שישי → חמישי
    else if (dow === 6) independence = iyar5 - 2;   // שבת  → חמישי
    else if (dow === 0) independence = iyar5 + 1;   // ראשון → שני
    return { memorial: independence - 1, independence: independence };
  }

  function holocaustDay(hebrewYear) {
    var nisan27 = fixedFromHebrew(hebrewYear, NISAN, 27);
    var dow = dayOfWeek(nisan27);
    if (dow === 5) return nisan27 - 1;   // שישי → חמישי
    if (dow === 0) return nisan27 + 1;   // ראשון → שני
    return nisan27;
  }

  /* צום שחל בשבת נדחה ליום ראשון (למעט יום כיפור) */
  function postponedFast(fixed) {
    return dayOfWeek(fixed) === 6 ? fixed + 1 : fixed;
  }

  /* כל המועדים של שנה עברית אחת */
  function hebrewYearHolidays(year) {
    var out = [];
    function add(month, day, id, kind, extra) {
      out.push(entry(fixedFromHebrew(year, month, day), id, kind, extra));
    }

    add(ELUL, hebrewMonthLength(year, ELUL), 'erevRoshHashana', 'erev');
    add(TISHREI, 1, 'roshHashana1', 'yomtov');
    add(TISHREI, 2, 'roshHashana2', 'yomtov');
    out.push(entry(postponedFast(fixedFromHebrew(year, TISHREI, 3)), 'tzomGedalia', 'fast'));
    add(TISHREI, 9, 'erevYomKippur', 'erev');
    add(TISHREI, 10, 'yomKippur', 'yomtov');
    add(TISHREI, 14, 'erevSukkot', 'erev');
    add(TISHREI, 15, 'sukkot', 'yomtov');
    for (var d = 16; d <= 20; d++) add(TISHREI, d, 'cholHamoedSukkot', 'cholhamoed');
    add(TISHREI, 21, 'hoshanaRaba', 'erev');
    add(TISHREI, 22, 'simchatTora', 'yomtov');

    /* חנוכה: שמונה ימים מכ״ה בכסלו. אורך כסלו משתנה, ולכן
       הימים האחרונים נספרים מהיום המוחלט ולא מהתאריך העברי. */
    var hanukka = fixedFromHebrew(year, KISLEV, 25);
    for (var h = 0; h < 8; h++) out.push(entry(hanukka + h, 'hanukka', 'festive', { nth: h + 1 }));

    add(SHVAT, 15, 'tuBishvat', 'festive');

    /* בשנה מעוברת פורים נחגג באדר ב׳ */
    var adar = isHebrewLeapYear(year) ? ADAR_B : ADAR_A;
    out.push(entry(postponedFast(fixedFromHebrew(year, adar, 13)), 'taanitEsther', 'fast'));
    add(adar, 14, 'purim', 'festive');
    add(adar, 15, 'shushanPurim', 'festive');

    add(NISAN, 14, 'erevPesach', 'erev');
    add(NISAN, 15, 'pesach', 'yomtov');
    for (var p = 16; p <= 20; p++) add(NISAN, p, 'cholHamoedPesach', 'cholhamoed');
    add(NISAN, 21, 'shviiPesach', 'yomtov');

    out.push(entry(holocaustDay(year), 'yomHashoa', 'memorial'));
    var independence = independenceDays(year);
    out.push(entry(independence.memorial, 'yomHazikaron', 'memorial'));
    out.push(entry(independence.independence, 'yomHaatzmaut', 'yomtov'));

    add(IYAR, 18, 'lagBaomer', 'festive');
    add(IYAR, 28, 'yomYerushalayim', 'festive');
    add(SIVAN, 5, 'erevShavuot', 'erev');
    add(SIVAN, 6, 'shavuot', 'yomtov');
    out.push(entry(postponedFast(fixedFromHebrew(year, TAMUZ, 17)), 'tzomTamuz', 'fast'));
    out.push(entry(postponedFast(fixedFromHebrew(year, AV, 9)), 'tishaBeav', 'fast'));

    return out;
  }

  /* ===== מועדים מוסלמיים =====

     הלוח הטבלאי. התאריך בפועל נקבע בראיית ירח ויכול לנוע ביום
     לכאן או לכאן, ולכן כל מועד מסומן approximate — והמסך אומר
     את זה למנהל במקום להציג ודאות שאינה קיימת. */
  function islamicYearHolidays(year) {
    return [
      entry(fixedFromIslamic(year, 1, 1), 'hijriNewYear', 'muslim', { approximate: true }),
      entry(fixedFromIslamic(year, 9, 1), 'ramadanStart', 'muslim', { approximate: true }),
      entry(fixedFromIslamic(year, 10, 1), 'eidAlFitr', 'muslim', { approximate: true }),
      entry(fixedFromIslamic(year, 10, 2), 'eidAlFitr', 'muslim', { approximate: true, nth: 2 }),
      entry(fixedFromIslamic(year, 10, 3), 'eidAlFitr', 'muslim', { approximate: true, nth: 3 }),
      entry(fixedFromIslamic(year, 12, 10), 'eidAlAdha', 'muslim', { approximate: true }),
      entry(fixedFromIslamic(year, 12, 11), 'eidAlAdha', 'muslim', { approximate: true, nth: 2 }),
      entry(fixedFromIslamic(year, 12, 12), 'eidAlAdha', 'muslim', { approximate: true, nth: 3 })
    ];
  }

  /* ===== מועדים נוצריים =====

     שתי גרסאות לכל מועד שתלוי בפסחא, וגם לחג המולד: רוב הנוצרים
     בישראל אורתודוקסים והולכים אחרי הלוח היוליאני, אבל לא כולם. */
  function christianYearHolidays(gregorianYear) {
    var west = easterGregorian(gregorianYear);
    var east = easterJulian(gregorianYear);
    var out = [
      entry(fixedFromGregorian(gregorianYear, 12, 25), 'christmas', 'christian'),
      /* חג המולד האורתודוקסי – 25 בדצמבר היוליאני, שהוא 7 בינואר */
      entry(fixedFromGregorian(gregorianYear, 1, 7), 'christmasOrthodox', 'christian'),
      entry(west - 2, 'goodFriday', 'christian'),
      entry(west, 'easter', 'christian')
    ];
    if (east !== west) {
      out.push(entry(east - 2, 'goodFridayOrthodox', 'christian'));
      out.push(entry(east, 'easterOrthodox', 'christian'));
    }
    return out;
  }

  /* ===== מה יש בטווח תאריכים =====

     זו הפונקציה שהמוצר קורא לה. מקבלת שני תאריכים ומחזירה את
     כל המועדים שביניהם, ממוינים, כשכל אחד נושא את היום המוחלט
     שלו ואת התאריך האזרחי.

     sets – אילו לוחות לכלול. ברירת המחדל היא העברי בלבד, כי זה
     מה שרוב העסקים בישראל צריכים; עסק עם צוות מעורב מדליק את
     השאר בהגדרות. */
  function between(fromDate, toDate, sets) {
    var want = sets || { hebrew: true };
    var from = fixedFromDate(fromDate);
    var to = fixedFromDate(toDate);
    if (to < from) { var swap = from; from = to; to = swap; }

    var found = [];
    var fromYear = gregorianFromFixed(from).year;
    var toYear = gregorianFromFixed(to).year;

    if (want.hebrew !== false) {
      /* השנה העברית אינה מתיישרת עם האזרחית, ולכן נסרקות שלוש */
      var startHebrew = hebrewYearOf(from) - 1;
      var endHebrew = hebrewYearOf(to) + 1;
      for (var hy = startHebrew; hy <= endHebrew; hy++) {
        found = found.concat(hebrewYearHolidays(hy));
      }
    }
    if (want.muslim) {
      var islamicYears = {};
      for (var gy = fromYear - 1; gy <= toYear + 1; gy++) {
        islamicYearsTouching(gy).forEach(function (iy) { islamicYears[iy] = true; });
      }
      Object.keys(islamicYears).forEach(function (iy) {
        found = found.concat(islamicYearHolidays(Number(iy)));
      });
    }
    if (want.christian) {
      for (var cy = fromYear - 1; cy <= toYear + 1; cy++) {
        found = found.concat(christianYearHolidays(cy));
      }
    }

    return found
      .filter(function (item) { return item.fixed >= from && item.fixed <= to; })
      .map(function (item) {
        var g = gregorianFromFixed(item.fixed);
        item.date = g.year + '-' + pad2(g.month) + '-' + pad2(g.day);
        item.dayOfWeek = dayOfWeek(item.fixed);
        return item;
      })
      .sort(function (a, b) {
        if (a.fixed !== b.fixed) return a.fixed - b.fixed;
        return a.id < b.id ? -1 : 1;
      });
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* איזו שנה עברית מכילה את היום המוחלט הזה */
  function hebrewYearOf(fixed) {
    var guess = Math.floor((fixed - HEBREW_EPOCH) / 365.2468) + 1;
    while (hebrewNewYear(guess) > fixed) guess--;
    while (hebrewNewYear(guess + 1) <= fixed) guess++;
    return guess;
  }

  var API = {
    fixedFromGregorian: fixedFromGregorian,
    gregorianFromFixed: gregorianFromFixed,
    dateFromFixed: dateFromFixed,
    fixedFromDate: fixedFromDate,
    isHebrewLeapYear: isHebrewLeapYear,
    hebrewNewYear: hebrewNewYear,
    hebrewYearLength: hebrewYearLength,
    hebrewMonthLength: hebrewMonthLength,
    fixedFromHebrew: fixedFromHebrew,
    hebrewMonthsInYear: hebrewMonthsInYear,
    fixedFromIslamic: fixedFromIslamic,
    islamicYearsTouching: islamicYearsTouching,
    easterGregorian: easterGregorian,
    easterJulian: easterJulian,
    between: between,
    hebrewYearOf: hebrewYearOf,
    hebrewYearHolidays: hebrewYearHolidays,
    islamicYearHolidays: islamicYearHolidays,
    christianYearHolidays: christianYearHolidays,
    MONTH: {
      TISHREI: TISHREI, CHESHVAN: CHESHVAN, KISLEV: KISLEV, TEVET: TEVET,
      SHVAT: SHVAT, ADAR_A: ADAR_A, ADAR_B: ADAR_B, NISAN: NISAN, IYAR: IYAR,
      SIVAN: SIVAN, TAMUZ: TAMUZ, AV: AV, ELUL: ELUL
    }
  };

  root.ShiftCalendar = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
