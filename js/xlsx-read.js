/* קריאת קובץ .xlsx בחזרה לטבלה, בלי ספריות חיצוניות.

   למה זה קיים: אנחנו נותנים ללקוח תבנית אקסל למילוי. אם אחרי
   שהוא ממלא אותה הוא צריך "שמירה בשם → CSV", איבדנו אותו שם.
   קובץ שירד מאיתנו צריך לחזור אלינו כמו שהוא.

   xlsx הוא ZIP של מסמכי XML. הכתיבה אצלנו היא ללא דחיסה, אבל
   אקסל אמיתי שומר ב-deflate, ולכן צריך לפרוס – וזה נעשה עם
   DecompressionStream של הדפדפן, בלי לממש inflate ביד.

   הקובץ הזה אינו נוגע ב-DOM: הוא מקבל בייטים ומחזיר שורות. */
(function (root) {
  'use strict';

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
  }

  function fail(key) {
    var error = new Error(t(key));
    error.code = key;
    return error;
  }

  /* ===== ZIP ===== */

  /* קוראים מהסוף: רשומת הסיום מצביעה על הספרייה המרכזית, והיא
     המקום היחיד שאפשר לסמוך עליו. סריקה מההתחלה לפי כותרות
     מקומיות נשברת על קבצים שנכתבו בזרימה. */
  function findEndRecord(view, length) {
    var max = Math.min(length, 66000);
    for (var i = length - 22; i >= length - max && i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
  }

  function readEntries(buffer) {
    var view = new DataView(buffer);
    var length = buffer.byteLength;
    var end = findEndRecord(view, length);
    if (end < 0) throw fail('importData.xlsxBroken');

    var count = view.getUint16(end + 10, true);
    var start = view.getUint32(end + 16, true);
    var entries = {};
    var at = start;
    var decoder = new TextDecoder('utf-8');

    for (var i = 0; i < count; i++) {
      if (at + 46 > length || view.getUint32(at, true) !== 0x02014b50) {
        throw fail('importData.xlsxBroken');
      }
      var method = view.getUint16(at + 10, true);
      var compressed = view.getUint32(at + 20, true);
      var nameLength = view.getUint16(at + 28, true);
      var extraLength = view.getUint16(at + 30, true);
      var commentLength = view.getUint16(at + 32, true);
      var localAt = view.getUint32(at + 42, true);
      var name = decoder.decode(new Uint8Array(buffer, at + 46, nameLength));

      entries[name] = { method: method, compressed: compressed, localAt: localAt };
      at += 46 + nameLength + extraLength + commentLength;
    }
    return { entries: entries, buffer: buffer, view: view };
  }

  /* הכותרת המקומית מכילה את אורכי השם וה-extra שלה, ורק אחריהם
     מתחילים הבייטים עצמם. האורכים שבספרייה המרכזית אינם זהים
     בהכרח לאלה שבכותרת המקומית. */
  function rawBytes(zip, entry) {
    var at = entry.localAt;
    if (zip.view.getUint32(at, true) !== 0x04034b50) throw fail('importData.xlsxBroken');
    var nameLength = zip.view.getUint16(at + 26, true);
    var extraLength = zip.view.getUint16(at + 28, true);
    var from = at + 30 + nameLength + extraLength;
    return new Uint8Array(zip.buffer, from, entry.compressed);
  }

  function inflate(bytes) {
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(fail('importData.xlsxNoUnzip'));
    }
    var stream = new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (out) {
      return new Uint8Array(out);
    });
  }

  function readFile(zip, name) {
    var entry = zip.entries[name];
    if (!entry) return Promise.resolve(null);
    var bytes = rawBytes(zip, entry);
    var out = entry.method === 0 ? Promise.resolve(bytes) : inflate(bytes);
    return out.then(function (data) { return new TextDecoder('utf-8').decode(data); });
  }

  /* ===== XML ===== */

  function unescapeXml(text) {
    return String(text)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (all, code) { return String.fromCharCode(Number(code)); })
      .replace(/&#x([0-9a-fA-F]+);/g, function (all, code) {
        return String.fromCharCode(parseInt(code, 16));
      })
      /* אחרון בכוונה, אחרת &amp;lt; היה הופך ל-< */
      .replace(/&amp;/g, '&');
  }

  function textOf(fragment) {
    var out = '';
    var match;
    var re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g;
    while ((match = re.exec(fragment))) { out += unescapeXml(match[1] || ''); }
    return out;
  }

  function sharedStrings(xml) {
    if (!xml) return [];
    var list = [];
    var re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g;
    var match;
    while ((match = re.exec(xml))) { list.push(textOf(match[1] || '')); }
    return list;
  }

  /* "BC12" → 54. אותה חשבון כמו colName בכתיבה, הפוך. */
  function colIndex(ref) {
    var letters = String(ref || '').replace(/[^A-Za-z]/g, '').toUpperCase();
    if (!letters) return -1;
    var index = 0;
    for (var i = 0; i < letters.length; i++) {
      index = index * 26 + (letters.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  function cellsOf(rowXml, strings) {
    var cells = [];
    var re = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    var match;
    while ((match = re.exec(rowXml))) {
      var attrs = match[1] || '';
      var body = match[2] || '';
      var refMatch = attrs.match(/r="([A-Z]+)\d+"/);
      var index = refMatch ? colIndex(refMatch[1]) : cells.length;
      var typeMatch = attrs.match(/t="([^"]+)"/);
      var type = typeMatch ? typeMatch[1] : 'n';
      var value = '';

      if (type === 's') {
        var idMatch = body.match(/<v>([\s\S]*?)<\/v>/);
        var id = idMatch ? Number(idMatch[1]) : -1;
        value = strings[id] === undefined ? '' : strings[id];
      } else if (type === 'inlineStr') {
        value = textOf(body);
      } else if (type === 'str') {
        var fMatch = body.match(/<v>([\s\S]*?)<\/v>/);
        value = fMatch ? unescapeXml(fMatch[1]) : '';
      } else {
        var nMatch = body.match(/<v>([\s\S]*?)<\/v>/);
        value = nMatch ? unescapeXml(nMatch[1]) : '';
      }

      if (index < 0) index = cells.length;
      while (cells.length < index) cells.push('');
      cells[index] = String(value).trim();
    }
    return cells;
  }

  function rowsOf(xml, strings) {
    var rows = [];
    var re = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>|<row\s[^>]*\/>/g;
    var match;
    while ((match = re.exec(xml))) { rows.push(cellsOf(match[1] || '', strings)); }
    return rows;
  }

  /* הגיליון הראשון לפי סדר החוברת, ולא לפי שם הקובץ: sheet1.xml
     אינו בהכרח הלשונית הראשונה. */
  function firstSheetPath(workbookXml, relsXml) {
    var fallback = 'xl/worksheets/sheet1.xml';
    if (!workbookXml) return fallback;
    var sheet = workbookXml.match(/<sheet\s[^>]*\/>/);
    if (!sheet) return fallback;
    var idMatch = sheet[0].match(/r:id="([^"]+)"/);
    if (!idMatch || !relsXml) return fallback;
    var relRe = new RegExp('<Relationship[^>]*Id="' + idMatch[1] + '"[^>]*>');
    var rel = relsXml.match(relRe);
    if (!rel) return fallback;
    var target = rel[0].match(/Target="([^"]+)"/);
    if (!target) return fallback;
    var path = target[1].replace(/^\/?xl\//, '').replace(/^\//, '');
    return 'xl/' + path;
  }

  /* ===== הממשק =====
     מקבל ArrayBuffer, מחזיר Promise עם מערך שורות של מחרוזות. */
  function readRows(buffer) {
    return Promise.resolve().then(function () {
      var zip = readEntries(buffer);
      return Promise.all([
        readFile(zip, 'xl/workbook.xml'),
        readFile(zip, 'xl/_rels/workbook.xml.rels'),
        readFile(zip, 'xl/sharedStrings.xml')
      ]).then(function (parts) {
        var path = firstSheetPath(parts[0], parts[1]);
        var strings = sharedStrings(parts[2]);
        return readFile(zip, path).then(function (sheetXml) {
          if (!sheetXml) throw fail('importData.xlsxNoSheet');
          return rowsOf(sheetXml, strings);
        });
      });
    });
  }

  /* המייבא הקיים קורא טקסט מופרד, ולכן מתרגמים לשם: כך קובץ
     אקסל וטקסט מודבק עוברים באותו מסלול בדיוק, ואין שני מקומות
     שבהם אפשר לשבור את הייבוא. Tab הוא המפריד כי הוא מה
     שהדבקה מאקסל נותנת ממילא. */
  function toText(rows) {
    return (rows || [])
      .map(function (row) {
        return row.map(function (cell) {
          return String(cell == null ? '' : cell).replace(/[\t\r\n]+/g, ' ');
        }).join('\t');
      })
      .filter(function (line) { return line.replace(/\t/g, '').trim() !== ''; })
      .join('\n');
  }

  function readText(buffer) {
    return readRows(buffer).then(toText);
  }

  var API = { readRows: readRows, readText: readText, toText: toText, colIndex: colIndex };
  root.ShiftXlsxRead = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
