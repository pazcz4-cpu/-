/* בדיקות לקורא ה-xlsx.
   הבדיקה המרכזית היא הלוך ושוב: כותבים חוברת עם הכותב שלנו,
   קוראים אותה בחזרה, ומצפים לאותם תאים. בנוסף נבדק קובץ דחוס
   ב-deflate, כי זה מה שאקסל אמיתי שומר – והכותב שלנו לא.

   הרצה: node tests/xlsx-read-tests.js */
'use strict';

var zlib = require('zlib');
var Xlsx = require('../js/xlsx.js');
var Read = require('../js/xlsx-read.js');

var passed = 0, failed = 0;
function assert(condition, message) { if (!condition) throw new Error(message); }
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'ערכים שונים') + ': התקבל ' + JSON.stringify(actual) +
      ', ציפינו ל-' + JSON.stringify(expected));
  }
}

var queue = Promise.resolve();
function test(name, fn) {
  queue = queue.then(function () {
    return Promise.resolve().then(fn).then(function () {
      passed++; console.log('  ✓ ' + name);
    }, function (err) {
      failed++; console.log('  ✗ ' + name + '\n      ' + (err && err.message));
    });
  });
}

function bufferOf(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/* ===== בונה קובץ דחוס, כמו שאקסל שומר =====
   הכותב שלנו שומר ללא דחיסה, ולכן בלי זה מסלול ה-deflate
   לא היה נבדק כלל – והוא המסלול שיגיע מלקוחות אמיתיים. */
function deflateZip(files) {
  var parts = [], central = [], offset = 0;

  files.forEach(function (file) {
    var data = Buffer.from(file.data, 'utf8');
    var packed = zlib.deflateRawSync(data);
    var name = Buffer.from(file.name, 'utf8');
    var crc = require('zlib').crc32
      ? require('zlib').crc32(data)
      : crc32(data);

    var local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);            // deflate
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, packed);

    var dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc >>> 0, 16);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);

    offset += local.length + name.length + packed.length;
  });

  var centralBuffer = Buffer.concat(central);
  var end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([Buffer.concat(parts), centralBuffer, end]);
}

var crcTable = (function () {
  var table = new Int32Array(256);
  for (var i = 0; i < 256; i++) {
    var value = i;
    for (var bit = 0; bit < 8; bit++) {
      value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[i] = value;
  }
  return table;
})();
function crc32(bytes) {
  var crc = -1;
  for (var i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

console.log('\n== הלוך ושוב מול הכותב שלנו ==');

test('תאים חוזרים כפי שנכתבו', function () {
  var bytes = Xlsx.build([{
    name: 'עובדים',
    rows: [
      ['שם', 'סניפים', 'משמרות', 'מכסה שבועית'],
      ['דנה כהן', 'מרכז, צפון', 'בוקר', 5],
      ['אבי לוי', 'מרכז', '', 6]
    ]
  }]);
  return Read.readRows(bufferOf(bytes)).then(function (rows) {
    assertEqual(rows.length, 3, 'מספר השורות שונה');
    assertEqual(rows[0][0], 'שם', 'הכותרת הראשונה השתנתה');
    assertEqual(rows[1][1], 'מרכז, צפון', 'תא עם פסיק נשבר');
    assertEqual(rows[1][3], '5', 'מספר לא חזר');
  });
});

test('תא ריק באמצע שומר על מיקום הטורים', function () {
  /* אקסל אינו כותב תאים ריקים בכלל, ולכן בלי קריאה לפי אות
     הטור השדות היו מזדחלים שמאלה – והמייל היה נקרא כהערה. */
  var bytes = Xlsx.build([{
    name: 'עובדים',
    rows: [
      ['שם', 'סניפים', 'משמרות', 'מכסה', 'הערה', 'מייל'],
      ['דנה', '', '', '', '', 'dana@x.co.il']
    ]
  }]);
  return Read.readRows(bufferOf(bytes)).then(function (rows) {
    assertEqual(rows[1][0], 'דנה', 'השם זז');
    assertEqual(rows[1][5], 'dana@x.co.il', 'המייל זז ממקומו');
  });
});

test('תווים שדורשים בריחה חוזרים כמו שהם', function () {
  var bytes = Xlsx.build([{
    name: 'עובדים',
    rows: [['שם'], ['כהן & בניו <מרכז>'], ['או"ר "הגליל"']]
  }]);
  return Read.readRows(bufferOf(bytes)).then(function (rows) {
    assertEqual(rows[1][0], 'כהן & בניו <מרכז>', 'תווי XML נשברו');
    assertEqual(rows[2][0], 'או"ר "הגליל"', 'מירכאות נשברו');
  });
});

console.log('\n== קובץ דחוס, כמו שאקסל שומר ==');

test('deflate נפרס ונקרא', function () {
  var sheet = '<?xml version="1.0"?><worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
    '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>4</v></c></row>' +
    '</sheetData></worksheet>';
  var strings = '<?xml version="1.0"?><sst count="3" uniqueCount="3">' +
    '<si><t>שם</t></si><si><t>סניפים</t></si><si><t>דנה כהן</t></si></sst>';
  var workbook = '<?xml version="1.0"?><workbook><sheets>' +
    '<sheet name="עובדים" sheetId="1" r:id="rId1"/></sheets></workbook>';
  var rels = '<?xml version="1.0"?><Relationships>' +
    '<Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>';

  var zip = deflateZip([
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: rels },
    { name: 'xl/sharedStrings.xml', data: strings },
    { name: 'xl/worksheets/sheet1.xml', data: sheet }
  ]);

  return Read.readRows(bufferOf(new Uint8Array(zip))).then(function (rows) {
    assertEqual(rows[0][0], 'שם', 'מחרוזת משותפת לא נקראה');
    assertEqual(rows[0][1], 'סניפים', 'מחרוזת שנייה לא נקראה');
    assertEqual(rows[1][0], 'דנה כהן', 'שורת נתונים לא נקראה');
    assertEqual(rows[1][2], '4', 'תא מספרי בטור C לא נקרא');
    assertEqual(rows[1][1], '', 'טור B היה אמור להישאר ריק');
  });
});

test('הלשונית הראשונה נקבעת לפי החוברת, לא לפי שם הקובץ', function () {
  /* sheet1.xml אינו בהכרח הלשונית הראשונה. אם נלך לפי השם,
     נקרא את הלשונית הלא נכונה ונייבא את גיליון ההסבר. */
  var wanted = '<?xml version="1.0"?><worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="inlineStr"><is><t>נכון</t></is></c></row>' +
    '</sheetData></worksheet>';
  var other = '<?xml version="1.0"?><worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="inlineStr"><is><t>שגוי</t></is></c></row>' +
    '</sheetData></worksheet>';
  var workbook = '<?xml version="1.0"?><workbook><sheets>' +
    '<sheet name="עובדים" sheetId="2" r:id="rId2"/>' +
    '<sheet name="הסבר" sheetId="1" r:id="rId1"/></sheets></workbook>';
  var rels = '<?xml version="1.0"?><Relationships>' +
    '<Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="x" Target="worksheets/sheet2.xml"/></Relationships>';

  var zip = deflateZip([
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: rels },
    { name: 'xl/worksheets/sheet1.xml', data: other },
    { name: 'xl/worksheets/sheet2.xml', data: wanted }
  ]);

  return Read.readRows(bufferOf(new Uint8Array(zip))).then(function (rows) {
    assertEqual(rows[0][0], 'נכון', 'נקראה הלשונית הלא נכונה');
  });
});

console.log('\n== תרגום לטקסט למייבא ==');

test('שורות ריקות נופלות, והמפריד הוא Tab', function () {
  var text = Read.toText([['שם', 'סניפים'], ['', ''], ['דנה', 'מרכז']]);
  assertEqual(text, 'שם\tסניפים\nדנה\tמרכז', 'הטקסט שנבנה אינו כצפוי');
});

test('ירידת שורה בתוך תא אינה שוברת את הטבלה', function () {
  /* תא עם Alt+Enter הוא מקרה אמיתי בהערות */
  var text = Read.toText([['שם', 'הערה'], ['דנה', 'בוקר\nבלבד']]);
  assertEqual(text.split('\n').length, 2, 'תא רב-שורתי פיצל את הטבלה');
});

console.log('\n== קובץ פגום ==');

test('קובץ שאינו xlsx נדחה בהודעה ברורה', function () {
  var junk = new Uint8Array([1, 2, 3, 4, 5]);
  return Read.readRows(bufferOf(junk)).then(function () {
    throw new Error('קובץ פגום התקבל');
  }, function (err) {
    assertEqual(err.code, 'importData.xlsxBroken', 'קוד השגיאה שגוי');
  });
});

queue.then(function () {
  console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
  process.exit(failed ? 1 : 0);
});
