/* נגן הסרטון בדף הבית.

   הקובץ עצמו אינו נטען עם הדף. סרטון של עשרים מגה שמתחיל לרדת
   ברגע שהדף נפתח מאט את דף המכירה בדיוק בשנייה שבה מחליטים אם
   להישאר בו – ורוב המבקרים לעולם לא ילחצו עליו.

   בטעינה נטענת רק תמונת הפתיחה – אפס בייטים של וידאו. הנגן
   עצמו נבנה בלחיצה, ואיתו הקובץ והכתוביות.

   האם יש בכלל מה לנגן נקבע בבנייה ולא כאן: בדיקה מהדפדפן הייתה
   מייצרת 404 בקונסול בכל טעינת דף, וגם מראה לרגע כפתור Play
   שמוביל לשום מקום. כל עוד הסרטון לא צולם, האזור אומר "בדרך".

   הניגון אינו אוטומטי לעולם. אתר שמתחיל להשמיע קול מעצמו הוא
   אתר שסוגרים. */
(function (root) {
  'use strict';

  function t(key, fallback) {
    if (!root.I18n) return fallback;
    try { return root.I18n.t(key); } catch (err) { return fallback; }
  }

  function init() {
    var host = document.getElementById('lp-video');
    if (!host) return;
    var button = document.getElementById('lp-video-play');
    var soon = document.getElementById('lp-video-soon');
    if (!button) return;

    var src = host.dataset.src;
    var opened = false;

    /* האם יש בכלל מה לנגן נקבע בבנייה, לא כאן: בדיקה מהדפדפן
       הייתה מייצרת 404 בקונסול בכל טעינת דף, וגם מציגה לרגע
       כפתור Play שמוביל לשום מקום. */
    if (host.dataset.videoReady !== '1') {
      button.classList.add('hidden');
      if (soon) soon.classList.remove('hidden');
      return;
    }
    button.classList.remove('hidden');
    if (soon) soon.classList.add('hidden');

    button.addEventListener('click', function () {
      if (opened) return;
      opened = true;

      var video = document.createElement('video');
      video.className = 'lp-video-el';
      video.src = src;
      video.poster = host.dataset.poster || '';
      video.controls = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('controlslist', 'nodownload');

      if (host.dataset.captions) {
        var track = document.createElement('track');
        track.kind = 'captions';
        track.src = host.dataset.captions;
        track.srclang = (root.I18n && root.I18n.current && root.I18n.current()) || 'he';
        track.label = t('landing.videoCaptions', 'כתוביות');
        track.default = true;
        video.appendChild(track);
      }

      /* נפילה לאחור בתוך הנגן עצמו: דפדפן שאינו יודע לנגן את
         הקובץ מציג קישור במקום ריבוע שחור. */
      var fallback = document.createElement('a');
      fallback.href = src;
      fallback.textContent = t('landing.videoDownload', 'פתיחת הסרטון');
      video.appendChild(fallback);

      button.replaceWith(video);
      /* הלחיצה היא אישור המשתמש, ולכן הניגון כאן מותר */
      var started = video.play();
      if (started && started.catch) { started.catch(function () { /* המשתמש ינגן בעצמו */ }); }
      video.focus();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  root.ShiftVideo = { init: init };
  if (typeof module !== 'undefined' && module.exports) { module.exports = { init: init }; }
})(typeof window !== 'undefined' ? window : globalThis);
