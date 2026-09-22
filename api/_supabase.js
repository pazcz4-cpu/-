/* כתובת פרויקט Supabase, מנוקה.

   המסך של Supabase מציג את הכתובת כ-API URL, כלומר
   https://xxxx.supabase.co/rest/v1/ – וזו הכתובת שמועתקת בפועל
   למשתנה הסביבה. הקוד מוסיף את /rest/v1 ואת /auth/v1 בעצמו,
   ולכן הדבקה כזו מייצרת "Invalid path specified in request URL"
   בכל בקשה. השגיאה הזו אינה אומרת דבר למי שרק הגדיר משתנה
   סביבה, ולכן מנקים את הכתובת במקום אחד, לכל נקודות הקצה.

   קובץ שמתחיל בקו תחתון אינו נקודת קצה ב-Vercel. */
'use strict';

function projectUrl(value) {
  return String(value === undefined ? process.env.SUPABASE_URL : (value || ''))
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(rest|auth|storage|realtime|functions)\/v\d+$/i, '')
    .replace(/\/+$/, '');
}

module.exports = { projectUrl: projectUrl };
