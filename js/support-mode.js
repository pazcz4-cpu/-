/* מצב תמיכה: בעל המוצר בתוך המערכת של לקוח.

   הכניסה מגיעה מהמשרד האחורי בכתובת /app/?support=<אסימון>. כאן
   נקבע שלוש דברים:

   1. האחסון. בדפדפן רגיל ההתחברות יושבת ב-localStorage, ואז כניסה
      ללקוח הייתה מנתקת אותך מהחשבון שלך ומשאירה אותו מחובר אחרי
      שסיימת. במצב תמיכה הכול יושב ב-sessionStorage של הלשונית:
      סוגרים אותה -- וההתחברות נעלמת.
   2. האסימון נלקח מהכתובת ונמחק ממנה מיד, כדי שלא יישאר בהיסטוריה.
   3. פס אדום קבוע בראש המסך. הפעולות בפנים מתבצעות כבעלים של
      הלקוח, והן נראות אצלו כשלו; מי שלא רואה שהוא בתוך חשבון של
      מישהו אחר עלול לעבוד בו כאילו הוא שלו. */
(function (root) {
  'use strict';

  var FLAG = 'shift-support-mode-v1';

  function param(name) {
    var search = (root.location && root.location.search) || '';
    var match = new RegExp('[?&]' + name + '=([^&]*)').exec(search);
    if (!match) return '';
    try { return decodeURIComponent(match[1].replace(/\+/g, ' ')); } catch (err) { return match[1]; }
  }

  function saved() {
    try {
      var raw = root.sessionStorage.getItem(FLAG);
      return raw ? JSON.parse(raw) : null;
    } catch (err) { return null; }
  }

  function active() { return !!param('support') || !!saved(); }

  /* האחסון שהאפליקציה תשתמש בו */
  function storage() {
    if (active()) {
      try { if (root.sessionStorage) return root.sessionStorage; } catch (err) { /* אחסון חסום */ }
    }
    return root.localStorage;
  }

  /* מסמן שהלשונית הזו במצב תמיכה. נקרא לפני שהאפליקציה נבנית, כדי
     שהאחסון והפס ידעו; האסימון עצמו נשאר בכתובת עד ש-take לוקח אותו. */
  function begin() {
    if (!param('support')) return;
    try {
      root.sessionStorage.setItem(FLAG, JSON.stringify({ company: param('co'), at: Date.now() }));
    } catch (err) { /* בלי אחסון אין מצב תמיכה יציב, והכניסה תיכשל */ }
  }

  /* האסימון מהכתובת, פעם אחת, ומחיקתו משם */
  function take() {
    var token = param('support');
    if (!token) return '';
    begin();
    try {
      if (root.history && root.history.replaceState) {
        var clean = root.location.search.replace(/([?&])(support|co)=[^&]*/g, '$1')
          .replace(/[?&]+$/, '').replace(/\?&/, '?');
        root.history.replaceState(null, '', root.location.pathname + clean + root.location.hash);
      }
    } catch (err) { /* לא קריטי */ }
    return token;
  }

  function esc(text) {
    return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function end() {
    try { root.sessionStorage.clear(); } catch (err) { /* לא קריטי */ }
    /* לשונית שנפתחה מהמשרד האחורי נסגרת; אחרת חוזרים אליו */
    root.close();
    root.setTimeout(function () { root.location.href = '/admin.html'; }, 250);
  }

  function banner() {
    var info = saved();
    if (!info || !root.document || root.document.getElementById('support-banner')) return;
    var bar = root.document.createElement('div');
    bar.id = 'support-banner';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#b42318;' +
      'color:#fff;padding:8px 14px;font:600 14px/1.4 system-ui,sans-serif;display:flex;gap:12px;' +
      'align-items:center;justify-content:space-between;direction:rtl';
    bar.innerHTML = '<span>מצב תמיכה · אתה בתוך החשבון של ' + esc(info.company || 'לקוח') +
      '. כל פעולה כאן נעשית בשם הלקוח.</span>' +
      '<button id="support-exit" type="button" style="background:#fff;color:#b42318;border:0;' +
      'border-radius:6px;padding:4px 12px;font:inherit;cursor:pointer">סיום ויציאה</button>';
    root.document.body.appendChild(bar);
    root.document.body.style.paddingTop = '44px';
    root.document.getElementById('support-exit').addEventListener('click', end);
  }

  var API = { active: active, storage: storage, begin: begin, take: take, banner: banner, end: end, FLAG: FLAG };
  root.ShiftSupportMode = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
