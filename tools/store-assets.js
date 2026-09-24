/* נכסי החנויות: אייקון ותמונת נושא.

   למה כלי ולא ייצוא ידני מתוכנת גרפיקה: המותג משתנה, ואייקון
   שיוצא פעם אחת מתיישן בשקט. כאן הוא נגזר מאותו לוגו שממנו
   נגזרים כל שאר האייקונים באתר, ואפשר לייצר מחדש בפקודה אחת.

   הרצה: npm run store:assets
   הפלט: assets/store/

   ההבדל היחיד מאייקוני האתר הוא הפורמט: כאן נכתב PNG ללא ערוץ
   אלפא כלל. אפל דוחה אייקון עם ערוץ שקיפות גם כשהוא אטום
   לחלוטין, וזו אחת הדחיות הנפוצות בסבב הראשון. */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const icons = require('./icons.js');

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/* פענוח ה-PNG שמחולל האייקונים מחזיר (RGBA, ללא interlace). */
function decode(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[png[25]];
  if (!channels) throw new Error('סוג צבע לא נתמך: ' + png[25]);
  let idat = [];
  let i = 8;
  while (i < png.length) {
    const len = png.readUInt32BE(i);
    const type = png.toString('ascii', i + 4, i + 8);
    if (type === 'IDAT') idat.push(png.slice(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = Buffer.from(raw.slice(p, p + stride));
    p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 255;
      else if (filter === 2) line[x] = (line[x] + b) & 255;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { width, height, channels, data: out };
}

/* כתיבה כ-RGB אטום. פיקסל שקוף למחצה מורכב על לבן, כדי שלא
   ייצא כהה כשהשקיפות נזרקת. */
function toRgbPng(img) {
  const { width, height, channels, data } = img;
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; /* filter: none */
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * channels;
      const d = y * (stride + 1) + 1 + x * 3;
      const alpha = channels === 4 ? data[s + 3] / 255 : 1;
      for (let c = 0; c < 3; c++) {
        const value = channels >= 3 ? data[s + c] : data[s];
        raw[d + c] = Math.round(value * alpha + 255 * (1 - alpha));
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   /* bit depth */
  ihdr[9] = 2;   /* color type 2 = truecolor, ללא אלפא */
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const OUT = path.join(__dirname, '..', 'assets', 'store');

const ASSETS = [
  /* אפל וגוגל שתיהן מבקשות 1024 מרובע. בלי שקיפות, ובלי פינות
     מעוגלות — החנות מעגלת בעצמה, ומי שמעגל מראש מקבל מסגרת
     כפולה. */
  { file: 'icon-1024.png', make: () => icons.drawIcon(1024) },
  /* Feature graphic — חובה בגוגל פליי, ומוצגת בראש עמוד
     האפליקציה. גוגל אינה מקבלת שקיפות. */
  { file: 'feature-1024x500.png', make: () => icons.drawSocial(1024, 500) }
];

function build() {
  fs.mkdirSync(OUT, { recursive: true });
  return ASSETS.map((asset) => {
    const png = toRgbPng(decode(asset.make()));
    fs.writeFileSync(path.join(OUT, asset.file), png);
    const img = decode(png);
    return { file: asset.file, width: img.width, height: img.height,
      alpha: img.channels === 4, bytes: png.length };
  });
}

module.exports = { build: build, decode: decode, toRgbPng: toRgbPng };

if (require.main === module) {
  build().forEach((r) => {
    console.log('  ' + r.file + '  ' + r.width + 'x' + r.height +
      '  ' + (r.alpha ? 'יש ערוץ אלפא' : 'ללא ערוץ אלפא') +
      '  ' + Math.round(r.bytes / 1024) + ' ק"ב');
  });
  console.log('\nנכתב אל assets/store/');
}
