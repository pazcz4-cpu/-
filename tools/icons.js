/* מחולל האייקונים של האפליקציה – ללא ספריות חיצוניות.
   מצייר על מפת פיקסלים בגודל כפול ומקטין בחזרה (supersampling),
   כדי שהפינות והעיגולים ייצאו חלקים, ואז כותב PNG בעצמו. */
'use strict';

var zlib = require('zlib');

/* ===== בד ציור פשוט ב-RGBA ===== */
function Canvas(size) {
  this.size = size;
  this.data = new Uint8Array(size * size * 4);
}

Canvas.prototype.blend = function (x, y, color, alpha) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= this.size || y >= this.size) return;
  var i = (y * this.size + x) * 4;
  var d = this.data;
  var srcA = alpha * (color[3] === undefined ? 1 : color[3]);
  var dstA = d[i + 3] / 255;
  var outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; return; }
  for (var c = 0; c < 3; c++) {
    d[i + c] = Math.round((color[c] * srcA + d[i + c] * dstA * (1 - srcA)) / outA);
  }
  d[i + 3] = Math.round(outA * 255);
};

/* מלבן עם פינות מעוגלות. radius=0 נותן מלבן רגיל. */
Canvas.prototype.roundRect = function (x, y, w, h, radius, color) {
  var r = Math.min(radius, w / 2, h / 2);
  for (var py = Math.floor(y); py < Math.ceil(y + h); py++) {
    for (var px = Math.floor(x); px < Math.ceil(x + w); px++) {
      if (px < x || py < y || px >= x + w || py >= y + h) continue;
      /* מרחק מהפינה הקרובה, כדי לחתוך את העיגול */
      var dx = 0, dy = 0;
      if (px < x + r) dx = x + r - px - 0.5;
      else if (px > x + w - r) dx = px + 0.5 - (x + w - r);
      if (py < y + r) dy = y + r - py - 0.5;
      else if (py > y + h - r) dy = py + 0.5 - (y + h - r);
      if (dx > 0 && dy > 0 && Math.sqrt(dx * dx + dy * dy) > r) continue;
      this.blend(px, py, color, 1);
    }
  }
};

/* מדרג אלכסוני בין שני צבעים */
Canvas.prototype.gradientRect = function (x, y, w, h, radius, from, to) {
  var self = this;
  var r = Math.min(radius, w / 2, h / 2);
  for (var py = Math.floor(y); py < y + h; py++) {
    for (var px = Math.floor(x); px < x + w; px++) {
      var dx = 0, dy = 0;
      if (px < x + r) dx = x + r - px - 0.5;
      else if (px > x + w - r) dx = px + 0.5 - (x + w - r);
      if (py < y + r) dy = y + r - py - 0.5;
      else if (py > y + h - r) dy = py + 0.5 - (y + h - r);
      if (dx > 0 && dy > 0 && Math.sqrt(dx * dx + dy * dy) > r) continue;
      var t = ((px - x) / w + (py - y) / h) / 2;
      self.blend(px, py, [
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t)
      ], 1);
    }
  }
};

/* הקטנה פי 2 – כאן נוצר הריכוך של הקצוות */
Canvas.prototype.downsample = function () {
  var half = this.size / 2;
  var out = new Canvas(half);
  for (var y = 0; y < half; y++) {
    for (var x = 0; x < half; x++) {
      var r = 0, g = 0, b = 0, a = 0;
      for (var oy = 0; oy < 2; oy++) {
        for (var ox = 0; ox < 2; ox++) {
          var i = ((y * 2 + oy) * this.size + (x * 2 + ox)) * 4;
          var pa = this.data[i + 3] / 255;
          r += this.data[i] * pa; g += this.data[i + 1] * pa; b += this.data[i + 2] * pa; a += pa;
        }
      }
      var j = (y * half + x) * 4;
      out.data[j] = a ? Math.round(r / a) : 0;
      out.data[j + 1] = a ? Math.round(g / a) : 0;
      out.data[j + 2] = a ? Math.round(b / a) : 0;
      out.data[j + 3] = Math.round((a / 4) * 255);
    }
  }
  return out;
};

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

function toPng(canvas) {
  var size = canvas.size;
  var header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;    // עומק סיביות
  header[9] = 6;    // RGBA
  header[10] = 0; header[11] = 0; header[12] = 0;

  /* כל שורה מקבלת בייט סוג-מסנן (0 = ללא) */
  var raw = Buffer.alloc(size * (size * 4 + 1));
  for (var y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(canvas.data.buffer, y * size * 4, size * 4)
      .copy(raw, y * (size * 4 + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ===== האייקון עצמו: לוח משמרות מוקטן ===== */
var BRAND_FROM = [0x23, 0x49, 0x9f];
var BRAND_TO = [0x2f, 0x5f, 0xe0];
var SHIFT_COLORS = [[0xf5, 0xa6, 0x23], [0x2e, 0xa6, 0x62], [0x4a, 0x8d, 0xf0]];

/* padding – שיעור השוליים. אייקון maskable צריך שוליים גדולים יותר,
   כי מערכות ההפעלה חותכות ממנו עיגול. */
function drawIcon(size, options) {
  var opts = options || {};
  var scale = 2;
  var canvas = new Canvas(size * scale);
  var s = size * scale;

  var pad = (opts.padding || 0) * s;
  var box = s - pad * 2;
  var radius = opts.square ? box * 0.22 : box * 0.5;

  if (opts.transparent) {
    canvas.gradientRect(pad, pad, box, box, radius, BRAND_FROM, BRAND_TO);
  } else {
    canvas.roundRect(0, 0, s, s, opts.square ? s * 0.22 : 0, BRAND_FROM);
    canvas.gradientRect(pad, pad, box, box, radius, BRAND_FROM, BRAND_TO);
  }

  /* גוף הלוח – מלבן לבן עם פס כותרת */
  var gridW = box * 0.62, gridH = box * 0.56;
  var gridX = pad + (box - gridW) / 2, gridY = pad + (box - gridH) / 2 + box * 0.02;
  var cell = gridW / 4;
  var gap = cell * 0.16;

  canvas.roundRect(gridX - gap, gridY - cell * 0.85, gridW + gap * 2, gridH + cell * 0.85 + gap,
    cell * 0.28, [255, 255, 255, 0.96]);

  /* פס הכותרת של הלוח */
  canvas.roundRect(gridX - gap, gridY - cell * 0.85, gridW + gap * 2, cell * 0.55,
    cell * 0.2, [0x1b, 0x36, 0x78]);

  /* תאי המשמרות: שלוש שורות, שלושה צבעים */
  for (var row = 0; row < 3; row++) {
    for (var col = 0; col < 4; col++) {
      var x = gridX + col * cell + gap / 2;
      var y = gridY + row * (gridH / 3) + gap / 2;
      var w = cell - gap, h = gridH / 3 - gap;
      var filled = (row + col) % 3 !== 2;   // דפוס שמזכיר שיבוץ חלקי
      canvas.roundRect(x, y, w, h, w * 0.26,
        filled ? SHIFT_COLORS[row] : [0xd7, 0xdf, 0xef]);
    }
  }

  return toPng(canvas.downsample());
}

module.exports = { drawIcon: drawIcon, Canvas: Canvas, toPng: toPng };
