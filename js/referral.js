/* מאיפה הלקוח הגיע: קישור הפניה של סוכן.

   סוכן מקבל קישור כמו setshifts.com/?ref=dana. מי שנכנס דרכו ונרשם
   – אפילו אחרי שבוע, אחרי שסגר את הדפדפן וחזר – משויך לסוכן. הקוד
   נשמר בדפדפן ונקרא בהרשמה (supabase.js), ושם נשלח לשרת
   (attach_referral). מי שנרשם בלי קישור הוא "האתר".

   מה שנשמר הוא הקוד בלבד, בלי שום פרט על המבקר, ורק עד 60 יום.
   הקוד אינו סוד: הוא נמצא בקישור. השרת הוא שמחליט אם הוא קיים
   ופעיל, ואם הלקוח עדיין חדש מספיק כדי לשייך. */
(function (root) {
  'use strict';

  var KEY = 'setshifts-ref';
  var MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
  var CODE = /^[a-z0-9][a-z0-9_-]{1,38}$/;

  function defaultStorage() {
    try { return root.localStorage; } catch (err) { return null; }
  }

  /* הקוד מתוך מחרוזת כתובת (?ref=...), באותיות קטנות, או null */
  function fromSearch(search) {
    var match = /[?&]ref=([^&#]*)/.exec(String(search || ''));
    if (!match) return null;
    var code;
    try { code = decodeURIComponent(match[1]).trim().toLowerCase(); } catch (err) { return null; }
    return CODE.test(code) ? code : null;
  }

  /* שומר את הקוד אם יש בכתובת. קוד חדש מחליף ישן: הקישור
     האחרון שנלחץ הוא זה שהביא את הלקוח. */
  function capture(search, storage, now) {
    var code = fromSearch(search === undefined ? (root.location && root.location.search) : search);
    if (!code) return null;
    var store = storage === undefined ? defaultStorage() : storage;
    try {
      if (store) store.setItem(KEY, JSON.stringify({ code: code, at: now || Date.now() }));
    } catch (err) { /* מצב פרטי: ההרשמה ממשיכה בלי שיוך */ }
    return code;
  }

  /* הקוד השמור, אם עדיין בתוקף */
  function get(storage, now) {
    var store = storage === undefined ? defaultStorage() : storage;
    if (!store) return null;
    try {
      var saved = JSON.parse(store.getItem(KEY) || 'null');
      if (!saved || !CODE.test(String(saved.code || ''))) return null;
      if ((now || Date.now()) - Number(saved.at) > MAX_AGE_MS) return null;
      return saved.code;
    } catch (err) { return null; }
  }

  function clear(storage) {
    var store = storage === undefined ? defaultStorage() : storage;
    try { if (store) store.removeItem(KEY); } catch (err) { /* לא קריטי */ }
  }

  var API = { fromSearch: fromSearch, capture: capture, get: get, clear: clear, KEY: KEY, MAX_AGE_MS: MAX_AGE_MS };
  root.ShiftReferral = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }

  /* בדפדפן: לוכדים מיד בטעינה */
  if (root.document) { capture(); }
})(typeof window !== 'undefined' ? window : globalThis);
