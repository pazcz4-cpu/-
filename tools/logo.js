/* הלוגו של SetShifts: קריאת קובץ המקור וגזירת כל הגרסאות ממנו.

   קובץ אחד הוא המקור – brand/logo-source.png – וכל השאר נגזר
   ממנו בקוד. כך אי אפשר להגיע למצב שבו גרסה אחת של הלוגו עודכנה
   והשאר נשארו מאחור, וכך גם אין צורך בתוכנת גרפיקה כדי להחליף
   אותו: מחליפים את קובץ המקור ומריצים שוב.

   אין כאן ספריות חיצוניות. הפענוח והכתיבה של PNG נעשים כאן,
   באותה גישה שבה נכתב מחולל האייקונים.

   להרצה אחרי החלפת קובץ המקור:  node tools/logo.js
*/
'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var ROOT = path.join(__dirname, '..');
var SOURCE = path.join(ROOT, 'brand', 'logo-source.png');

/* ===== פענוח PNG =====
   מספיק למה שקובץ המקור הוא: 8 סיביות לערוץ, בלי שזירה. */
function decodePng(file) {
  var buffer = fs.readFileSync(file);
  var pos = 8;
  var header = null;
  var parts = [];
  while (pos < buffer.length) {
    var length = buffer.readUInt32BE(pos);
    var type = buffer.slice(pos + 4, pos + 8).toString();
    var body = buffer.slice(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0), height: body.readUInt32BE(4),
        depth: body[8], color: body[9], interlace: body[12]
      };
    } else if (type === 'IDAT') { parts.push(body); }
    pos += 12 + length;
  }
  if (!header || header.depth !== 8 || header.interlace !== 0) {
    throw new Error('logo-source.png חייב להיות PNG של 8 סיביות ללא שזירה');
  }
  var channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[header.color];
  if (!channels) throw new Error('סוג צבע לא נתמך ב-logo-source.png');

  var raw = zlib.inflateSync(Buffer.concat(parts));
  var stride = header.width * channels;
  var out = Buffer.alloc(header.width * header.height * 4);
  var previous = Buffer.alloc(stride);

  for (var y = 0; y < header.height; y++) {
    var filter = raw[y * (stride + 1)];
    var line = Buffer.from(raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (var i = 0; i < stride; i++) {
      var left = i >= channels ? line[i - channels] : 0;
      var up = previous[i];
      var upLeft = i >= channels ? previous[i - channels] : 0;
      var value = line[i];
      if (filter === 1) { value += left; }
      else if (filter === 2) { value += up; }
      else if (filter === 3) { value += (left + up) >> 1; }
      else if (filter === 4) {
        var guess = left + up - upLeft;
        var dl = Math.abs(guess - left), du = Math.abs(guess - up), dul = Math.abs(guess - upLeft);
        value += (dl <= du && dl <= dul) ? left : (du <= dul ? up : upLeft);
      }
      line[i] = value & 255;
    }
    for (var x = 0; x < header.width; x++) {
      var s = x * channels, d = (y * header.width + x) * 4;
      if (channels === 4) {
        out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = line[s + 3];
      } else if (channels === 3) {
        out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = 255;
      } else if (channels === 2) {
        out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = line[s + 1];
      } else {
        out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = 255;
      }
    }
    previous = line;
  }
  return { width: header.width, height: header.height, data: out };
}

/* ===== כתיבת PNG ===== */
var crcTable = (function () {
  var table = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < buffer.length; i++) { c = crcTable[(c ^ buffer[i]) & 0xFF] ^ (c >>> 8); }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, body) {
  var length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  var typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  var crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

/* מקבל בד ציור ריבועי (size) או תמונה מלבנית ({width, height}).
   הלוגו אינו ריבועי, ולכן הקידוד אינו יכול להניח ריבוע. */
function toPng(image) {
  var width = image.width || image.size;
  var height = image.height || image.size;
  var source = Buffer.isBuffer(image.data) ? image.data : Buffer.from(image.data);

  var header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;    // עומק סיביות
  header[9] = 6;    // RGBA
  header[10] = 0; header[11] = 0; header[12] = 0;

  /* כל שורה מקבלת בייט סוג-מסנן (0 = ללא) */
  var stride = width * 4;
  var raw = Buffer.alloc(height * (stride + 1));
  for (var y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    source.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ===== גבולות הדיו =====
   קובץ המקור מגיע עם שוליים שקופים רחבים. חיתוך לפי מה שמצויר
   בפועל נותן לוגו שאפשר למקם בלי לנחש כמה אוויר יש סביבו. */
function inkBounds(image, x0, x1, y0, y1) {
  var minX = x1, maxX = x0, minY = y1, maxY = y0, found = false;
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] < 24) continue;
      found = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!found) throw new Error('לא נמצא דיו בתחום המבוקש');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/* ===== הקטנה בממוצע שטח =====
   דגימה נקודתית הורסת קווים דקים כמו המחוגים של השעון. ממוצע על
   כל הפיקסלים שנכנסים לפיקסל היעד שומר עליהם. הממוצע נעשה על
   צבע מוכפל באלפא, אחרת פיקסל שקוף לבן מבהיר את השכנים שלו. */
function resample(image, box, width, height) {
  var out = Buffer.alloc(width * height * 4);
  for (var ty = 0; ty < height; ty++) {
    for (var tx = 0; tx < width; tx++) {
      var sx0 = box.x + (tx * box.width) / width;
      var sx1 = box.x + ((tx + 1) * box.width) / width;
      var sy0 = box.y + (ty * box.height) / height;
      var sy1 = box.y + ((ty + 1) * box.height) / height;
      var r = 0, g = 0, b = 0, a = 0, weight = 0;
      for (var sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        var wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0 || sy < 0 || sy >= image.height) continue;
        for (var sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          var wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0 || sx < 0 || sx >= image.width) continue;
          var w = wx * wy;
          var i = (sy * image.width + sx) * 4;
          var alpha = image.data[i + 3] / 255;
          r += image.data[i] * alpha * w;
          g += image.data[i + 1] * alpha * w;
          b += image.data[i + 2] * alpha * w;
          a += alpha * w;
          weight += w;
        }
      }
      var d = (ty * width + tx) * 4;
      if (a <= 0 || weight <= 0) { out[d] = out[d + 1] = out[d + 2] = out[d + 3] = 0; continue; }
      out[d] = Math.round(r / a);
      out[d + 1] = Math.round(g / a);
      out[d + 2] = Math.round(b / a);
      out[d + 3] = Math.round((a / weight) * 255);
    }
  }
  return { width: width, height: height, data: out };
}

/* ===== גרסה לרקע כהה =====
   הכיתוב ולובה התחתונה של הסמל הם כחול־לילה, והם נעלמים על רקע
   כהה. הופכים ללבן רק את מה שכהה מדי כדי להיקרא, ומשאירים את
   הכחול הבהיר – כך הלוגו נשאר מזוהה ולא הופך לצללית לבנה. */
var DARK_LUMA = 75;

function forDarkBackground(image) {
  var out = Buffer.from(image.data);
  for (var i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    var luma = 0.2126 * out[i] + 0.7152 * out[i + 1] + 0.0722 * out[i + 2];
    if (luma >= DARK_LUMA) continue;
    out[i] = out[i + 1] = out[i + 2] = 255;
  }
  return { width: image.width, height: image.height, data: out };
}

/* ===== גרסה בצבע אחד =====
   כותרת המערכת היא מלבן כחול. הלובה התחתונה של הסמל היא
   כחול־לילה, ועליה היא נראית כמו כתם. סמל לבן מלא הוא מה
   שנכון על רקע צבעוני, וזו גם הדרך המקובלת. */
function mono(image, color) {
  var out = Buffer.from(image.data);
  for (var i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    var luma = 0.2126 * out[i] + 0.7152 * out[i + 1] + 0.0722 * out[i + 2];
    /* מה שהיה לבן בסמל – לוחות השעון – נשאר חלון ולא נצבע:
       סמל לבן מלא הופך אותם לחלק מהגוש, והשעונים נעלמים ממנו. */
    if (luma > 200) { out[i + 3] = 0; continue; }
    out[i] = color[0]; out[i + 1] = color[1]; out[i + 2] = color[2];
  }
  return { width: image.width, height: image.height, data: out };
}

/* ===== ריבוע עם שוליים, לאייקונים ===== */
function square(image, size, inset) {
  var side = Math.max(image.width, image.height);
  var inner = Math.round(size * (1 - inset * 2));
  var scaled = resample(image, { x: 0, y: 0, width: image.width, height: image.height },
    Math.max(1, Math.round((image.width / side) * inner)),
    Math.max(1, Math.round((image.height / side) * inner)));

  var out = Buffer.alloc(size * size * 4);
  var offsetX = Math.round((size - scaled.width) / 2);
  var offsetY = Math.round((size - scaled.height) / 2);
  for (var y = 0; y < scaled.height; y++) {
    for (var x = 0; x < scaled.width; x++) {
      var s = (y * scaled.width + x) * 4;
      var d = ((y + offsetY) * size + (x + offsetX)) * 4;
      if (d < 0 || d + 3 >= out.length) continue;
      out[d] = scaled.data[s];
      out[d + 1] = scaled.data[s + 1];
      out[d + 2] = scaled.data[s + 2];
      out[d + 3] = scaled.data[s + 3];
    }
  }
  return { width: size, height: size, data: out };
}

/* ===== הרכבה על רקע אטום =====
   אייקון של אפליקציה אינו יכול להיות שקוף: מערכת ההפעלה מניחה
   אותו על טפט, ולוגו כחול על טפט כחול נעלם. */
function onBackground(image, color) {
  var out = Buffer.alloc(image.data.length);
  for (var i = 0; i < out.length; i += 4) {
    var alpha = image.data[i + 3] / 255;
    out[i] = Math.round(image.data[i] * alpha + color[0] * (1 - alpha));
    out[i + 1] = Math.round(image.data[i + 1] * alpha + color[1] * (1 - alpha));
    out[i + 2] = Math.round(image.data[i + 2] * alpha + color[2] * (1 - alpha));
    out[i + 3] = 255;
  }
  return { width: image.width, height: image.height, data: out };
}

/* פינות מעוגלות, לאייקון שמערכת ההפעלה אינה מעגלת בעצמה */
function roundCorners(image, radius) {
  var out = Buffer.from(image.data);
  var size = image.width;
  for (var y = 0; y < image.height; y++) {
    for (var x = 0; x < size; x++) {
      var dx = 0, dy = 0;
      if (x < radius) dx = radius - x - 0.5;
      else if (x > size - radius) dx = x + 0.5 - (size - radius);
      if (y < radius) dy = radius - y - 0.5;
      else if (y > image.height - radius) dy = y + 0.5 - (image.height - radius);
      if (dx <= 0 || dy <= 0) continue;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= radius) continue;
      var i = (y * size + x) * 4;
      /* ריכוך של פיקסל אחד על הקצה, אחרת הפינה נראית משוננת */
      var cover = Math.max(0, Math.min(1, radius + 1 - distance));
      out[i + 3] = Math.round(out[i + 3] * cover);
    }
  }
  return { width: image.width, height: image.height, data: out };
}


function load() { return decodePng(SOURCE); }

/* שלושת החלקים של הלוגו, לפי מה שמצויר בקובץ ולא לפי מספרים
   קבועים – כך החלפת המקור אינה דורשת מדידה מחדש ביד. */
function regions(image) {
  var all = inkBounds(image, 0, image.width - 1, 0, image.height - 1);

  /* עמודה ריקה רחבה מפרידה בין הסמל לכיתוב */
  var gapStart = -1, gapRun = 0;
  for (var x = all.x; x <= all.x + all.width - 1; x++) {
    var empty = true;
    for (var y = all.y; y <= all.y + all.height - 1 && empty; y++) {
      if (image.data[(y * image.width + x) * 4 + 3] >= 24) empty = false;
    }
    if (empty) {
      gapRun++;
      if (gapRun * 8 > all.width / 10 && gapStart === -1) { gapStart = x - gapRun + 1; }
    } else {
      if (gapStart !== -1) break;
      gapRun = 0;
    }
  }
  var markEnd = gapStart > all.x ? gapStart - 1 : all.x + Math.round(all.width * 0.27);
  var mark = inkBounds(image, all.x, markEnd, all.y, all.y + all.height - 1);

  /* שורה ריקה מפרידה בין השם לסיסמה שמתחתיו */
  var textStart = markEnd + 1;
  var rowInk = [];
  for (var ty = all.y; ty <= all.y + all.height - 1; ty++) {
    var on = false;
    for (var tx = textStart; tx <= all.x + all.width - 1 && !on; tx++) {
      if (image.data[(ty * image.width + tx) * 4 + 3] >= 24) on = true;
    }
    rowInk.push(on);
  }
  var wordEnd = all.y + rowInk.length - 1;
  var seenInk = false;
  for (var r = 0; r < rowInk.length; r++) {
    if (rowInk[r]) { seenInk = true; continue; }
    if (seenInk) { wordEnd = all.y + r - 1; break; }
  }

  return {
    all: all,
    mark: mark,
    /* הסיסמה יושבת מתחת לשם, אבל בתוך טווח הגובה של הסמל – ולכן
       אי אפשר להוריד אותה בחיתוך אופקי בלי לקצץ את הסמל. היא
       נמחקת, והחיתוך נשאר מלא. */
    tagline: {
      x: textStart,
      y: wordEnd + 1,
      width: all.x + all.width - textStart,
      height: all.y + all.height - wordEnd - 1
    }
  };
}

/* מחיקת אזור, לשם בניית גרסה בלי הסיסמה */
function erase(image, box) {
  var out = Buffer.from(image.data);
  for (var y = box.y; y < box.y + box.height; y++) {
    for (var x = box.x; x < box.x + box.width; x++) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      out[(y * image.width + x) * 4 + 3] = 0;
    }
  }
  return { width: image.width, height: image.height, data: out };
}

function build() {
  var image = load();
  var box = regions(image);
  var made = [];

  function emit(file, data) {
    var target = path.join(ROOT, 'brand', file);
    fs.writeFileSync(target, data);
    made.push(file + ' · ' + Math.round(data.length / 1024) + ' KB');
  }

  /* הנעילה המלאה, עם הסיסמה. לרוחב 1200 כדי שתישאר חדה גם במסך
     צפוף פי שניים. */
  var fullWidth = 1200;
  var full = resample(image, box.all, fullWidth,
    Math.round((box.all.height / box.all.width) * fullWidth));
  emit('logo.png', toPng(full));
  emit('logo-light.png', toPng(forDarkBackground(full)));

  /* בלי הסיסמה, לסרגלי ניווט ולכותרות: בגובה של סרגל ניווט
     הסיסמה אינה נקראת בכלל, והיא רק מקטינה את השם. */
  var lockWidth = 960;
  var withoutTagline = erase(image, box.tagline);
  var lockBox = inkBounds(withoutTagline, 0, image.width - 1, 0, image.height - 1);
  var lock = resample(withoutTagline, lockBox, lockWidth,
    Math.round((lockBox.height / lockBox.width) * lockWidth));
  emit('logo-lockup.png', toPng(lock));
  emit('logo-lockup-light.png', toPng(forDarkBackground(lock)));

  /* הסמל לבדו, ריבועי */
  var markSide = 512;
  var mark = resample(image, box.mark, markSide,
    Math.round((box.mark.height / box.mark.width) * markSide));
  var markSquare = square(mark, markSide, 0.02);
  emit('logo-mark.png', toPng(markSquare));
  /* לכותרת הכחולה של המערכת */
  emit('logo-mark-white.png', toPng(mono(markSquare, [255, 255, 255])));

  return { made: made, box: box, mark: mark };
}

module.exports = {
  load: load, regions: regions, decodePng: decodePng, resample: resample, erase: erase,
  square: square, onBackground: onBackground, roundCorners: roundCorners, mono: mono,
  forDarkBackground: forDarkBackground, toPng: toPng, build: build, SOURCE: SOURCE
};

if (require.main === module) {
  var result = build();
  console.log('הסמל:', JSON.stringify(result.box.mark));
  console.log('הסיסמה:', JSON.stringify(result.box.tagline));
  result.made.forEach(function (line) { console.log('  ' + line); });
}
