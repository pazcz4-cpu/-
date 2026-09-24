/* המעטפת המקומית: פס מצב הרשת, ולשוניות תחתונות לפי תפקיד.

   מופיעה רק כשהאפליקציה רצה בתוך Capacitor — או כש-?shell=1
   בכתובת, וזה מה שמאפשר לבדוק אותה בדפדפן בלי לבנות קובץ iOS
   בכל שינוי. באתר עצמו שום דבר כאן לא מופיע, ולכן הממשק שנבדק
   כבר אינו זז.

   למה בכלל: אפל דוחה אפליקציה שהיא "אתר ארוז מחדש" (כלל 4.2).
   ניווט מקומי קבוע בתחתית המסך — ולא תפריט של אתר — הוא אחד
   הדברים שהבודק מחפש בפועל. */
(function (root) {
  'use strict';

  var doc = root.document;
  var Native = root.ShiftNative;

  function t(key) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key); } catch (err) { return key; }
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  /* אותם אייקונים של המערכת, דרך אותה ספריית sprite. */
  function ico(name) {
    return '<svg class="shell-tab-ico" aria-hidden="true" focusable="false">' +
      '<use href="#i-' + name + '"></use></svg>';
  }

  /* ===== הלשוניות, לפי תפקיד =====

     העובד והמנהל רואים שתי סדרות שונות, והבחירה אינה שלהם —
     היא נגזרת מהחשבון. מסך שמציע "כניסה כמנהל" הוא הזמנה
     לנסות, וגם שאלה מיותרת לבודק של אפל. */

  var EMPLOYEE_TABS = [
    { id: 'shifts', label: 'shell.tabShifts', icon: 'calendar' },
    { id: 'constraints', label: 'shell.tabConstraints', icon: 'edit' },
    { id: 'clock', label: 'shell.tabClock', icon: 'clock' },
    { id: 'leave', label: 'shell.tabLeave', icon: 'sun' }
  ];

  /* למנהל בטלפון מובילים הדברים שבאמת עושים מהטלפון: לראות
     את הסידור, לאשר בקשות, לבדוק שעות. עריכה בגרירה קורית מול
     מחשב, והיא נשארת זמינה תחת "עוד". */
  var MANAGER_TABS = [
    { id: 'schedule', label: 'shell.tabSchedule', icon: 'calendar', tab: 'schedule' },
    { id: 'requests', label: 'shell.tabRequests', icon: 'inbox', tab: 'constraints' },
    { id: 'hours', label: 'shell.tabHours', icon: 'clock', tab: 'hours' },
    { id: 'team', label: 'shell.tabTeam', icon: 'users', tab: 'employees' },
    { id: 'more', label: 'shell.tabMore', icon: 'dots', sheet: true }
  ];

  var state = { role: null, active: null, mounted: false, locked: false };

  /* ===== נעילה ביומטרית =====

     נועלת את האפליקציה, לא את החשבון. מי שמאבד את הטלפון לא
     מאבד גישה למערכת — הוא נכנס ממכשיר אחר. מה שזה כן מונע
     הוא שמי שמרים את הטלפון מהדלפק רואה את הסידור, את השכר
     ואת פרטי העובדים.

     ההעדפה היא של המכשיר ולא של החשבון, ולכן היא נשמרת מקומית:
     אותו עובד בטלפון פרטי ובטאבלט משותף ירצה שתי תשובות שונות.
     אם האחסון חסום — ברירת המחדל היא לא לנעול, כי אפליקציה
     שננעלת ולא יודעת להיפתח גרועה מאפליקציה שאינה ננעלת. */

  var LOCK_KEY = 'setshifts-biolock';

  function lockWanted() {
    try { return root.localStorage.getItem(LOCK_KEY) === '1'; }
    catch (err) { return false; }
  }

  function setLockWanted(on) {
    try { root.localStorage.setItem(LOCK_KEY, on ? '1' : '0'); }
    catch (err) { /* חלון פרטי, אחסון חסום — לא נורא */ }
  }

  function lockOverlay() {
    if (doc.getElementById('shell-lock')) return;
    var node = doc.createElement('div');
    node.id = 'shell-lock';
    node.className = 'shell-lock';
    var mark = root.ShiftBrand && root.ShiftBrand.markImg
      ? root.ShiftBrand.markImg('SetShifts') : '';
    node.innerHTML =
      '<div class="shell-lock-card">' +
      '<span class="shell-lock-mark">' + mark + '</span>' +
      '<p class="shell-lock-title">' + esc(t('shell.lockTitle')) + '</p>' +
      '<button type="button" class="btn primary" id="shell-unlock">' +
      esc(t('shell.lockAction')) + '</button>' +
      '</div>';
    doc.body.appendChild(node);
    node.addEventListener('click', function (event) {
      if (event.target.closest('#shell-unlock')) tryUnlock();
    });
  }

  function tryUnlock() {
    if (!Native) return;
    Native.biometricUnlock(t('shell.lockReason')).then(function (ok) {
      if (!ok) return;
      state.locked = false;
      var node = doc.getElementById('shell-lock');
      if (node) node.parentNode.removeChild(node);
      if (Native.haptic) Native.haptic('light');
    });
  }

  function lock() {
    if (state.locked || !state.role) return;
    if (!Native || !Native.isNative() || !lockWanted()) return;
    state.locked = true;
    lockOverlay();
    tryUnlock();
  }

  function host() { return doc && doc.getElementById('app-shell'); }

  function tabsFor(role) {
    return role === 'employee' ? EMPLOYEE_TABS : MANAGER_TABS;
  }

  function render() {
    var node = host();
    if (!node) return;
    if (!state.role) { node.innerHTML = ''; node.classList.add('hidden'); return; }

    var list = tabsFor(state.role);
    if (!state.active) state.active = list[0].id;

    var html = '<nav class="shell-tabs" role="tablist">';
    list.forEach(function (item) {
      var on = item.id === state.active;
      html += '<button type="button" class="shell-tab' + (on ? ' is-on' : '') + '"' +
        ' role="tab" aria-selected="' + (on ? 'true' : 'false') + '"' +
        ' data-shell-tab="' + esc(item.id) + '">' +
        ico(item.icon) +
        '<span class="shell-tab-label">' + esc(t(item.label)) + '</span>' +
        '</button>';
    });
    html += '</nav>';
    node.innerHTML = html;
    node.classList.remove('hidden');
    doc.body.classList.add('has-shell-tabs');
  }

  /* ===== פס מצב הרשת =====

     לא חלון חוסם. יש נתונים שמורים והאפליקציה עובדת איתם; מה
     שצריך להיאמר הוא שמה שמוצג אינו בהכרח העדכני, וזה נאמר
     בשורה אחת שנעלמת כשהחיבור חוזר. */
  function netBar(up) {
    var bar = doc.getElementById('shell-net');
    if (!bar) return;
    if (up) {
      bar.classList.add('hidden');
      bar.textContent = '';
    } else {
      bar.textContent = t('shell.offline');
      bar.classList.remove('hidden');
    }
    doc.body.classList.toggle('is-offline', !up);
  }

  /* ===== מעבר בין לשוניות ===== */

  /* ===== גיליון "עוד" =====

     בתחתית יש מקום לחמש לשוניות, ולמנהל יש תשעה מסכים. מה
     שלא נכנס יושב כאן — ולא נעלם. הסתרת מסך היא באג, לא
     עיצוב. */

  var EXTRA = ['branches', 'users', 'billing', 'support', 'settings'];

  function closeSheet() {
    var old = doc.getElementById('shell-sheet');
    if (old) old.parentNode.removeChild(old);
  }

  function openSheet() {
    closeSheet();
    var wrap = doc.createElement('div');
    wrap.id = 'shell-sheet';
    wrap.className = 'shell-sheet';
    var html = '<div class="shell-sheet-back" data-sheet-close></div>' +
      '<div class="shell-sheet-card" role="dialog" aria-modal="true">' +
      '<div class="shell-sheet-grip"></div><ul class="shell-sheet-list">';
    EXTRA.forEach(function (tab) {
      /* רק מסך שקיים באמת. לשונית דוח השעות, למשל, מוסתרת
         בעסק שלא הדליק שעון — ואין טעם להציע אותה. */
      var node = doc.querySelector('.tab[data-tab="' + tab + '"]');
      if (!node || node.classList.contains('hidden')) return;
      html += '<li><button type="button" class="shell-sheet-item" data-sheet-tab="' +
        esc(tab) + '">' + esc(t('tabs.' + tab)) + '</button></li>';
    });
    html += '</ul></div>';
    wrap.innerHTML = html;
    doc.body.appendChild(wrap);
    wrap.addEventListener('click', function (event) {
      if (event.target.closest('[data-sheet-close]')) { closeSheet(); return; }
      var pick = event.target.closest('[data-sheet-tab]');
      if (!pick) return;
      var node = doc.querySelector('.tab[data-tab="' + pick.dataset.sheetTab + '"]');
      closeSheet();
      if (node) node.click();
      if (root.scrollTo) root.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function go(id) {
    var list = tabsFor(state.role);
    var item = null;
    list.forEach(function (one) { if (one.id === id) item = one; });
    if (!item) return;
    if (Native && Native.haptic) Native.haptic('light');
    /* "עוד" אינו יעד — הוא תפריט. הלשונית הפעילה לא זזה. */
    if (item.sheet) { openSheet(); return; }
    closeSheet();
    state.active = id;
    render();

    if (state.role === 'employee') {
      doc.body.setAttribute('data-emp-view', id);
      if (root.scrollTo) root.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    /* מנהל: הלשונית התחתונה מפעילה את לשונית המסך הקיימת, ולכן
       אין כאן ניווט שני שצריך להישאר מסונכרן עם הראשון. */
    var target = doc.querySelector('.tab[data-tab="' + item.tab + '"]');
    if (target) target.click();
    if (root.scrollTo) root.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bind() {
    var node = host();
    if (!node || node.dataset.bound) return;
    node.dataset.bound = '1';
    node.addEventListener('click', function (event) {
      var button = event.target.closest('[data-shell-tab]');
      if (!button) return;
      go(button.dataset.shellTab);
    });
  }

  /* ===== הפעלה ===== */

  function mount(role) {
    if (!Native || !Native.shell()) return false;
    state.role = role || null;
    state.active = null;
    if (state.role === 'employee') doc.body.setAttribute('data-emp-view', 'shifts');
    else doc.body.removeAttribute('data-emp-view');
    render();
    bind();
    if (!state.mounted) {
      state.mounted = true;
      netBar(Native.online());
      Native.on('online', netBar);
      /* חזרה מהרקע היא הרגע שבו הטלפון עבר יד. נעילה בהפעלה
         בלבד מגינה רק על הפעם הראשונה. */
      Native.on('resume', lock);
      lock();
      if (root.I18n && root.I18n.onChange) root.I18n.onChange(render);
    }
    return true;
  }

  function unmount() {
    state.role = null;
    state.active = null;
    var node = host();
    if (node) { node.innerHTML = ''; node.classList.add('hidden'); }
    doc.body.classList.remove('has-shell-tabs');
    doc.body.removeAttribute('data-emp-view');
    closeSheet();
  }

  /* המתג עצמו מוצג רק באפליקציה שבה יש חיישן. באתר אין מה
     להציע — וגם אין מה לנעול, כי דפדפן אינו מחזיק את המסך. */
  function lockSupported() {
    if (!Native || !Native.isNative()) return Promise.resolve(false);
    return Native.biometricAvailable();
  }

  var API = {
    mount: mount, unmount: unmount, go: go,
    active: function () { return state.active; },
    lockSupported: lockSupported,
    lockEnabled: lockWanted,
    setLockEnabled: setLockWanted,
    locked: function () { return state.locked; }
  };
  root.ShiftShell = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
