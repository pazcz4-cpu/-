/* גרסאות קטנות של התמונה הראשית, לטלפון.

   למה: התמונה הראשית היא אלמנט ה-LCP של דף הבית — הדבר הגדול
   ביותר שנצבע במסך הראשון — ו-LCP הוא גורם דירוג ישיר בחיפוש
   מהטלפון. הקובץ המקורי הוא 1672 פיקסלים לרוחב, וטלפון שמציג
   אותו ברוחב 360 מוריד פי ארבעה יותר בייטים ממה שהוא יכול
   להראות. על רשת סלולרית זה שניות של מסך ריק, בדיוק בשנייה
   שבה מחליטים אם להישאר.

   למה לא WebP: אין בסביבה שום מקודד — לא cwebp, לא ffmpeg,
   לא ספריית תמונות — ומקודד WebP שנכתב מאפס אינו דבר שכדאי
   לתחזק בשביל תמונה אחת. הקטנת מידות היא ההחלטה שמביאה כאן
   את רוב הרווח, והיא בטוחה לחלוטין.

   הסינון: ממוצע של כל פיקסלי המקור שנופלים בתוך פיקסל היעד
   (box filter). לצמצום של פי שניים ויותר זה בדיוק מה שצריך,
   והוא אינו מייצר את ההילה שמייצר סינון חד יותר.

   הרצה: npm run hero:sizes
   הפלט: assets/landing/hero-schedule-<רוחב>.png */
'use strict';

const fs = require('fs');
const path = require('path');
const png = require('./optimize-png.js');

/* הרוחבים אינם שרירותיים. 1672 הוא הקובץ עצמו; 1100 מכסה
   טאבלט ומסך צר; 836 הוא בדיוק חצי מהמקור ומכסה טלפון בצפיפות
   כפולה; 560 הוא טלפון צר. הדפדפן בוחר לבד לפי srcset. */
const WIDTHS = [560, 836, 1100];

function scale(img, width) {
  const ratio = img.width / width;
  const height = Math.max(1, Math.round(img.height / ratio));
  const channels = img.channels;
  const out = Buffer.alloc(width * height * channels);

  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * img.height / height);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * img.height / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * img.width / width);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * img.width / width));
      const count = (y1 - y0) * (x1 - x0);
      for (let c = 0; c < channels; c++) {
        let sum = 0;
        for (let sy = y0; sy < y1; sy++) {
          const row = sy * img.width * channels;
          for (let sx = x0; sx < x1; sx++) sum += img.data[row + sx * channels + c];
        }
        out[(y * width + x) * channels + c] = Math.round(sum / count);
      }
    }
  }
  /* colorType נישא הלאה, ולא רק channels. בלעדיו הקידוד כתב
     כותרת של גווני אפור על נתוני RGB — קובץ שנפתח, נראה תקין
     בגודלו, ומציג זבל. */
  return {
    width: width, height: height, channels: channels,
    colorType: img.colorType, data: out
  };
}

function build(source) {
  const input = source || path.join(__dirname, '..', 'assets', 'landing', 'hero-schedule.png');
  const img = png.decode(fs.readFileSync(input));
  const dir = path.dirname(input);
  const base = path.basename(input, '.png');
  return WIDTHS
    .filter((width) => width < img.width)
    .map((width) => {
      const small = scale(img, width);
      const bytes = png.encode(small);
      /* אימות: מפענחים את מה שנכתב ומשווים לפיקסלים שחושבו.
         קובץ שנכתב עם כותרת שאינה תואמת לנתונים נראה תקין
         בגודלו ומציג זבל, וזה מתגלה רק בעין. */
      const check = png.decode(bytes);
      if (check.width !== small.width || check.height !== small.height ||
        check.channels !== small.channels || !check.data.equals(small.data)) {
        throw new Error('הפלט של ' + width + ' אינו תואם למה שחושב');
      }
      const file = path.join(dir, base + '-' + width + '.png');
      fs.writeFileSync(file, bytes);
      return { file: path.basename(file), width: small.width, height: small.height,
        bytes: bytes.length };
    });
}

module.exports = { build: build, scale: scale, WIDTHS: WIDTHS };

if (require.main === module) {
  const original = fs.statSync(path.join(__dirname, '..', 'assets', 'landing',
    'hero-schedule.png')).size;
  const kb = (n) => Math.round(n / 1024) + ' ק"ב';
  console.log('  מקור: 1672 פיקסלים, ' + kb(original));
  build().forEach((r) => {
    console.log('  ' + r.file + '  ' + r.width + '×' + r.height + '  ' + kb(r.bytes) +
      '  (' + Math.round((1 - r.bytes / original) * 100) + '% פחות)');
  });
}
