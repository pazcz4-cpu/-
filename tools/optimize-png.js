/* הקטנת PNG בלי לאבד פיקסל אחד.

   למה זה קיים: אין בסביבה pngquant או optipng, והתמונות
   שמגיעות מכלי עיצוב נשמרות כמעט תמיד בלי סינון שורות — מה
   שמכפיל את הקובץ פי כמה. תמונת הפתיחה של דף המכירה היא
   תמונת ה-LCP במובייל, ושלושה מגה שם הם שניות של מסך ריק על
   רשת סלולרית.

   מה שנעשה כאן הוא הדבר היחיד שבטוח לחלוטין: אותם פיקסלים
   בדיוק, מקודדים נכון. לכל שורה נבחר הסינון שמייצר את
   השאריות הקטנות ביותר (היוריסטיקת סכום הערכים המוחלטים,
   זו שממליצים עליה במפרט PNG), ואז דחיסה ברמה הגבוהה ביותר.
   אין כאן איבוד איכות ואין קוונטיזציה.

   הרצה: node tools/optimize-png.js <קלט> [פלט] */
'use strict';

const fs = require('fs');
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.slice(4, 8 + data.length)), 8 + data.length);
  return out;
}

function decode(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const depth = png[24];
  const colorType = png[25];
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('סוג צבע לא נתמך: ' + colorType);
  if (depth !== 8) throw new Error('נתמך רק עומק 8 סיביות, התקבל ' + depth);
  if (png[28] !== 0) throw new Error('תמונה מרוכבת (interlaced) אינה נתמכת');

  const idat = [];
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
  return { width, height, channels, colorType, data: out };
}

/* השאריות של שורה אחת לפי סינון מסוים */
function applyFilter(type, line, prev, channels, target) {
  const stride = line.length;
  for (let x = 0; x < stride; x++) {
    const a = x >= channels ? line[x - channels] : 0;
    const b = prev[x];
    const c = x >= channels ? prev[x - channels] : 0;
    let value;
    if (type === 0) value = line[x];
    else if (type === 1) value = line[x] - a;
    else if (type === 2) value = line[x] - b;
    else if (type === 3) value = line[x] - ((a + b) >> 1);
    else {
      const pp = a + b - c;
      const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
      value = line[x] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
    }
    target[x] = value & 255;
  }
}

/* סכום הערכים המוחלטים, כשכל בית נקרא כמספר מסומן. זו
   ההיוריסטיקה שמפרט PNG ממליץ עליה לבחירת סינון. */
function cost(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] < 128 ? buf[i] : 256 - buf[i];
  return sum;
}

function encode(img) {
  const { width, height, channels, colorType, data } = img;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  const candidate = Buffer.alloc(stride);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const line = data.slice(y * stride, (y + 1) * stride);
    let bestType = 0, bestCost = Infinity;
    const best = Buffer.alloc(stride);
    for (let type = 0; type <= 4; type++) {
      applyFilter(type, line, prev, channels, candidate);
      const value = cost(candidate);
      if (value < bestCost) { bestCost = value; bestType = type; candidate.copy(best); }
    }
    raw[y * (stride + 1)] = bestType;
    best.copy(raw, y * (stride + 1) + 1);
    prev = line;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9, memLevel: 9, windowBits: 15 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function optimize(inputPath, outputPath) {
  const before = fs.readFileSync(inputPath);
  const img = decode(before);
  const after = encode(img);
  /* אימות: מפענחים שוב ומשווים פיקסל מול פיקסל. קובץ קטן
     יותר שאינו זהה אינו אופטימיזציה אלא באג. */
  const check = decode(after);
  if (!check.data.equals(img.data)) throw new Error('הפלט אינו זהה למקור');
  const target = outputPath || inputPath;
  /* אם הקידוד מחדש לא הועיל, משאירים את המקור */
  fs.writeFileSync(target, after.length < before.length ? after : before);
  return {
    width: img.width, height: img.height,
    before: before.length, after: Math.min(after.length, before.length)
  };
}

module.exports = { optimize, decode, encode };

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input) { console.error('שימוש: node tools/optimize-png.js <קלט> [פלט]'); process.exit(1); }
  const r = optimize(input, output);
  const kb = (n) => Math.round(n / 1024) + 'KB';
  console.log(r.width + '×' + r.height + ': ' + kb(r.before) + ' → ' + kb(r.after) +
    ' (' + Math.round((1 - r.after / r.before) * 100) + '% פחות)');
}
