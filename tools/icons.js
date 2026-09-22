/* מחולל האייקונים של האפליקציה – ללא ספריות חיצוניות.
   מצייר על מפת פיקסלים בגודל כפול ומקטין בחזרה (supersampling),
   כדי שהפינות והעיגולים ייצאו חלקים, ואז כותב PNG בעצמו. */
'use strict';


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
/* קידוד ה-PNG וקריאת קובץ המקור יושבים ב-tools/logo.js, כדי
   ששני המחוללים לא יחזיקו שני עותקים של אותו קוד. */
var logo = require('./logo.js');
var toPng = logo.toPng;

/* ===== האייקון עצמו: הסמל של SetShifts =====
   האייקון נגזר מאותו קובץ מקור כמו הלוגו, ולא מצויר בנפרד. סמל
   שמצויר פעמיים מתחיל להיראות אחרת בכל מקום שבו הוא מופיע.

   הרקע לבן ואטום: אייקון של אפליקציה יושב על טפט, וסמל כחול על
   טפט כחול נעלם. השוליים רחבים יותר ב-maskable, כי מערכת ההפעלה
   חותכת ממנו צורה ומה שבקצה נעלם. */
var WHITE = [255, 255, 255];

var markCache = null;
function mark() {
  if (!markCache) {
    var source = logo.load();
    var box = logo.regions(source).mark;
    var side = 1024;
    markCache = logo.resample(source, box, side,
      Math.round((box.height / box.width) * side));
  }
  return markCache;
}

function drawIcon(size, options) {
  var opts = options || {};
  /* 0.16 משאיר לסמל אוויר כמו בלוגו עצמו; 0.26 הוא אזור הבטיחות
     של maskable, שבו רק המרכז מובטח להיראות. */
  var inset = opts.padding ? 0.26 : 0.16;
  var placed = logo.square(mark(), size, inset);
  return toPng(logo.onBackground(placed, WHITE));
}

/* תמונת השיתוף: מה שמופיע כשמדביקים קישור לאתר בוואטסאפ, בפייסבוק
   או בסלאק. ריבוע עם סמל בלבד נראה שם כמו אייקון אבוד, ולכן זו
   הנעילה המלאה על רקע לבן, ביחס שהרשתות מצפות לו. */
function drawSocial(width, height) {
  var source = logo.load();
  var box = logo.regions(source).all;
  var target = Math.round(width * 0.62);
  var scaled = logo.resample(source, box, target,
    Math.round((box.height / box.width) * target));

  var canvas = { width: width, height: height, data: Buffer.alloc(width * height * 4) };
  var offsetX = Math.round((width - scaled.width) / 2);
  var offsetY = Math.round((height - scaled.height) / 2);
  for (var y = 0; y < scaled.height; y++) {
    for (var x = 0; x < scaled.width; x++) {
      var s = (y * scaled.width + x) * 4;
      var d = ((y + offsetY) * width + (x + offsetX)) * 4;
      if (d < 0 || d + 3 >= canvas.data.length) continue;
      canvas.data[d] = scaled.data[s];
      canvas.data[d + 1] = scaled.data[s + 1];
      canvas.data[d + 2] = scaled.data[s + 2];
      canvas.data[d + 3] = scaled.data[s + 3];
    }
  }
  return toPng(logo.onBackground(canvas, WHITE));
}

/* תמונת הפתיחה של הסרטון.

   לא צילום מסך: הוא מתיישן בכל שינוי עיצוב, ומי שרואה אותו לפני
   שהוא לוחץ כבר ראה את מה שהסרטון בא להראות. במקום זה שטח
   ממותג נקי – רקע בגרדיאנט של המותג, הלוגו במרכז, ומעליו מעגל
   בהיר שעליו יושב משולש ה-Play שב-HTML.

   הקובץ נטען לפני הווידאו ובמקומו, ולכן הוא חייב להיות קטן. */
function drawPoster(width, height) {
  var source = logo.load();
  var box = logo.regions(source).all;
  var target = Math.round(width * 0.34);
  var scaled = logo.resample(source, box, target,
    Math.round((box.height / box.width) * target));

  var canvas = { width: width, height: height, data: Buffer.alloc(width * height * 4) };

  /* גרדיאנט אלכסוני בין שני גווני הכחול של הכותרת באפליקציה,
     כדי שמי שמגיע מדף המכירה למערכת יראה את אותו מותג. */
  var from = [0x18, 0x21, 0x3a];
  var to = [0x2f, 0x5f, 0xe0];
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var mix = (x / width + y / height) / 2;
      var d = (y * width + x) * 4;
      canvas.data[d] = Math.round(from[0] + (to[0] - from[0]) * mix);
      canvas.data[d + 1] = Math.round(from[1] + (to[1] - from[1]) * mix);
      canvas.data[d + 2] = Math.round(from[2] + (to[2] - from[2]) * mix);
      canvas.data[d + 3] = 255;
    }
  }

  /* הלוגו בגרסה הבהירה – הרקע כהה, והגרסה הכהה הייתה נבלעת בו */
  var light = logo.forDarkBackground(scaled);
  var offsetX = Math.round((width - light.width) / 2);
  var offsetY = Math.round(height * 0.30);
  for (var ly = 0; ly < light.height; ly++) {
    for (var lx = 0; lx < light.width; lx++) {
      var s = (ly * light.width + lx) * 4;
      var alpha = light.data[s + 3] / 255;
      if (!alpha) continue;
      var t = ((ly + offsetY) * width + (lx + offsetX)) * 4;
      if (t < 0 || t + 3 >= canvas.data.length) continue;
      for (var c = 0; c < 3; c++) {
        canvas.data[t + c] = Math.round(canvas.data[t + c] * (1 - alpha) + light.data[s + c] * alpha);
      }
    }
  }

  /* מעגל בהיר למטה-מרכז. משולש ה-Play עצמו נשאר ב-HTML, כדי
     שיקבל מצב hover ומצב פוקוס – שתמונה לא יכולה לתת. */
  var cx = width / 2;
  var cy = Math.round(height * 0.66);
  var radius = Math.round(height * 0.11);
  for (var py = 0; py < height; py++) {
    for (var px = 0; px < width; px++) {
      var dx = px - cx;
      var dy = py - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius + 1) continue;
      /* שוליים מרוככים, אחרת המעגל נראה משונן */
      var edge = Math.max(0, Math.min(1, radius - dist));
      var i = (py * width + px) * 4;
      for (var k = 0; k < 3; k++) {
        canvas.data[i + k] = Math.round(canvas.data[i + k] * (1 - edge * 0.92) + 255 * edge * 0.92);
      }
    }
  }

  return toPng(canvas);
}

module.exports = {
  drawIcon: drawIcon, drawSocial: drawSocial, drawPoster: drawPoster,
  Canvas: Canvas, toPng: toPng
};
