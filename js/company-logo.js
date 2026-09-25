/* הפיכת קובץ שהלקוח בחר ללוגו שאפשר לשמור.

   למה יש כאן קוד בכלל ולא פשוט קריאת הקובץ: לוגו שיוצא מתוכנת
   עיצוב הוא לא פעם 2000 פיקסלים ושלושה מגה, והוא מוצג בגובה
   של 28 פיקסלים בסרגל. שמירה של הקובץ כפי שהוא פירושה ששורת
   החברה — זו שנטענת בכל כניסה של כל עובד — גדלה פי מאה, ושכל
   מסך במערכת נטען לאט יותר בשביל תמונה שאיש לא רואה בגודלה.

   מה שנעשה כאן: הקובץ נטען, מוקטן לרוחב וגובה שמספיקים לכל
   מקום שבו הוא מוצג, ונכתב מחדש. השקיפות נשמרת — לוגו על רקע
   לבן קבוע נראה כמו מדבקה כשהמערכת במצב כהה.

   הגודל נבדק פעמיים: אחרי ההקטנה כאן, ושוב בשרת
   (Model.normalizeLogo). התקרה בשרת אינה כפילות — היא מה
   שמונע ממי שיפתח את כלי הפיתוח לשתול שורה של מגה. */
(function (root) {
  'use strict';

  /* נפתר בכל קריאה ולא פעם אחת בטעינה. הקובץ הזה נטען בעמוד
     לפני model.js, ותפיסה של ShiftModel ברגע הטעינה הייתה
     משאירה כאן null לתמיד — כלומר כל העלאת לוגו נכשלת
     בהודעה "לא הצלחנו לקרוא את הקובץ", שאינה קשורה לקובץ. */
  function model() {
    return root.ShiftModel ||
      (typeof require === 'function' ? require('./backend/model.js') : null);
  }

  /* 320x120 הוא הגודל שמכסה את כל המקומות שבהם הלוגו מוצג —
     סרגל המנהל, כותרת מסך העובד — גם במסך בצפיפות כפולה. */
  var MAX_WIDTH = 320;
  var MAX_HEIGHT = 120;

  /* המידות אחרי ההקטנה, בלי למתוח ובלי לחתוך */
  function fit(width, height, maxWidth, maxHeight) {
    var w = Number(width) || 1;
    var h = Number(height) || 1;
    var scale = Math.min((maxWidth || MAX_WIDTH) / w, (maxHeight || MAX_HEIGHT) / h, 1);
    return {
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale))
    };
  }

  function fail(code, message) {
    var err = new Error(message || code);
    err.code = code;
    return err;
  }

  /* ציור התמונה בגודל החדש והחזרת data URI.

     PNG ראשון, כי הוא שומר שקיפות. אם הוא יוצא גדול מהתקרה —
     מה שקורה כשהלקוח מעלה תצלום ולא לוגו — מנסים WebP, שיודע
     גם הוא שקיפות ומייצר קובץ קטן בהרבה. רק אם גם הוא גדול,
     אומרים ללקוח שהקובץ אינו מתאים, במקום לשמור משהו שישבור
     את הטעינה לכולם. */
  function encode(image) {
    var Model = model();
    var size = fit(image.naturalWidth || image.width, image.naturalHeight || image.height);
    var canvas = root.document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    var ctx = canvas.getContext('2d');
    if (!ctx) throw fail('canvas', 'canvas is not available');
    /* imageSmoothingQuality: בלעדיו הקטנה של פי חמישה יוצאת
       משוננת, ולוגו משונן נראה כמו קובץ פגום ולא כמו הקטנה. */
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.drawImage(image, 0, 0, size.width, size.height);

    var attempts = ['image/png', 'image/webp'];
    for (var i = 0; i < attempts.length; i++) {
      var data = canvas.toDataURL(attempts[i]);
      /* דפדפן שאינו תומך בפורמט מחזיר PNG בשקט, ולכן בודקים
         מה באמת יצא ולא מה ביקשנו */
      if (data.indexOf('data:' + attempts[i]) !== 0 && i > 0) continue;
      if (Model.logoBytes(data) <= Model.LOGO_MAX_BYTES) return data;
    }
    throw fail('too_big', 'logo is too large after resizing');
  }

  /* הכניסה היחידה: קובץ שהלקוח בחר ← data URI מוכן לשמירה. */
  function fromFile(file) {
    return new Promise(function (resolve, reject) {
      var Model = model();
      if (!file) { reject(fail('no_file', 'no file')); return; }
      if (!Model) { reject(fail('unreadable', 'model is not loaded')); return; }
      if (!Model.isLogoType(file.type)) { reject(fail('bad_type', 'unsupported type')); return; }
      /* תקרה גסה על הקובץ הנכנס, לפני שהוא נקרא כולו לזיכרון.
         עשרה מגה הם כבר לא לוגו, והם כן מספיקים כדי להקפיא
         טלפון ישן באמצע הקריאה. */
      if (file.size > 10 * 1024 * 1024) { reject(fail('too_big', 'file too large')); return; }

      var reader = new root.FileReader();
      reader.onerror = function () { reject(fail('unreadable', 'could not read file')); };
      reader.onload = function () {
        var image = new root.Image();
        image.onerror = function () { reject(fail('unreadable', 'not an image')); };
        image.onload = function () {
          try { resolve(encode(image)); }
          catch (err) { reject(err); }
        };
        image.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  var API = {
    fromFile: fromFile, fit: fit, encode: encode,
    MAX_WIDTH: MAX_WIDTH, MAX_HEIGHT: MAX_HEIGHT
  };
  root.ShiftCompanyLogo = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
