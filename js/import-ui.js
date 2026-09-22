/* מסך הייבוא: הדבקה או קובץ, תצוגה מקדימה, ואישור.

   התצוגה המקדימה היא העיקר. ייבוא שמריץ שינויים בלי להראות מה
   עומד לקרות הוא ייבוא שלקוח לא ילחץ עליו פעמיים, ובצדק. */
(function (root) {
  'use strict';

  var Import = root.ShiftImport;
  var Store = root.ShiftStore;

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
  }

  /* "נפתחו 1 סניפים" הוא בדיוק סוג הפרט שנקרא כרשלנות */
  function tCount(key, count) {
    if (!root.I18n) return key;
    try { return root.I18n.plural(key, count); } catch (err) { return key; }
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var host = null;
  var ctx = null;
  var plan = null;
  var timer = null;
  /* שורות שהמנהל הוריד מהן את הסימון. לפי מספר שורה ולא לפי
     אינדקס, כדי שהסימון לא יזוז כשהטקסט משתנה מעליו. */
  var excluded = {};
  var knownEmails = [];

  function close() {
    if (!host) return;
    host.classList.add('hidden');
    host.innerHTML = '';
    plan = null;
    excluded = {};
  }

  function chosen() {
    return plan ? plan.create.filter(function (row) { return !excluded[row.line]; }) : [];
  }

  /* סניפים שייפתחו בפועל, אחרי שהורדנו שורות */
  function chosenBranches() {
    if (!plan) return [];
    var wanted = {};
    chosen().forEach(function (row) {
      row.branchNames.forEach(function (name) { wanted[name] = true; });
    });
    return plan.newBranches.filter(function (item) { return wanted[item.name]; });
  }

  function nameOfBranch(state, id) {
    var branch = Store.byId(state.branches, id);
    return branch ? branch.name : '';
  }

  function shiftLabels(state, ids) {
    var all = Store.shifts(state);
    if (ids.length === all.length) return t('importData.allShifts');
    return ids.map(function (id) { return Store.shiftName(state, id); }).join(', ');
  }

  function branchLabels(state, row) {
    var names = row.branchIds.map(function (id) { return nameOfBranch(state, id); })
      .concat(row.branchNames);
    if (!names.length) return t('importData.allBranches');
    return names.join(', ');
  }

  function previewHtml() {
    var state = ctx.getState();
    var html = '';

    if (!plan.create.length && !plan.skip.length && !plan.errors.length) {
      return '<p class="import-empty">' + esc(t('importData.nothing')) + '</p>';
    }

    var rows = chosen();
    var branches = chosenBranches();
    var dropped = plan.create.length - rows.length;

    /* הסיכום סופר את מה שייווצר באמת, אחרי הורדת שורות – כולל
       הסניפים. "ייווצרו 30 עובדים" בלי להזכיר שנפתחים גם 4
       סניפים חדשים הוא בדיוק מה שמפתיע אחרי הלחיצה. */
    html += '<p class="import-counts">' +
      '<b>' + esc(tCount('importData.countCreate', rows.length)) + '</b>';
    if (branches.length) {
      html += ' · <b>' + esc(tCount('importData.countBranches', branches.length)) + '</b>';
    }
    if (dropped) {
      html += ' · ' + esc(tCount('importData.countDropped', dropped));
    }
    if (plan.skip.length) {
      html += ' · ' + esc(tCount('importData.countSkip', plan.skip.length));
    }
    if (plan.errors.length) {
      html += ' · <span class="import-bad">' +
        esc(tCount('importData.countErrors', plan.errors.length)) + '</span>';
    }
    html += '</p>';

    if (branches.length) {
      html += '<p class="import-note">' + esc(t('importData.newBranches', {
        names: branches.map(function (item) { return item.name; }).join(', ')
      })) + '</p>';
    }

    if (plan.create.length) {
      var hasEmail = plan.create.some(function (row) { return !!row.email; });
      html += '<p class="import-pick-hint">' + esc(t('importData.uncheckHint')) + '</p>';
      html += '<div class="import-table"><table><thead><tr>' +
        '<th class="import-pick"><input type="checkbox" id="import-all"' +
          (rows.length === plan.create.length ? ' checked' : '') +
          ' aria-label="' + esc(t('importData.pickAll')) + '"></th>' +
        '<th>' + esc(t('users.nameColumn')) + '</th>' +
        (hasEmail ? '<th>' + esc(t('users.emailColumn')) + '</th>' : '') +
        '<th>' + esc(t('branches.title')) + '</th>' +
        '<th>' + esc(t('schedule.shift')) + '</th>' +
        '<th>' + esc(t('importData.maxColumn')) + '</th>' +
        '</tr></thead><tbody>';
      plan.create.forEach(function (row) {
        var off = excluded[row.line];
        html += '<tr class="' + (off ? 'import-off' : '') + '">' +
          '<td class="import-pick"><input type="checkbox" data-pick="' + esc(row.line) + '"' +
            (off ? '' : ' checked') + ' aria-label="' + esc(row.name) + '"></td>' +
          '<td>' + esc(row.name) + '</td>' +
          (hasEmail ? '<td dir="ltr">' + esc(row.email || '—') + '</td>' : '') +
          '<td>' + esc(branchLabels(state, row)) + '</td>' +
          '<td>' + esc(shiftLabels(state, row.shifts)) + '</td>' +
          '<td>' + esc(row.maxShifts) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    if (plan.skip.length) {
      html += '<ul class="import-list">';
      plan.skip.forEach(function (item) {
        html += '<li>' + esc(t('importData.line', { line: item.line })) + ' ' +
          esc(item.name) + ' — ' +
          esc(t('importData.skip.' + item.code, { value: item.value || '' })) + '</li>';
      });
      html += '</ul>';
    }

    if (plan.errors.length) {
      html += '<ul class="import-list import-bad">';
      plan.errors.forEach(function (item) {
        html += '<li>' + esc(t('importData.line', { line: item.line })) + ' ' +
          esc(t('importData.error.' + item.code, { value: item.value || '' })) +
          (item.raw ? ' — ' + esc(item.raw) : '') + '</li>';
      });
      html += '</ul>';
    }

    return html;
  }

  function refresh() {
    var text = host.querySelector('#import-text').value;
    plan = Import.planEmployees(ctx.getState(), text, { knownEmails: knownEmails });
    /* שורה שירדה מהתוכנית אינה יכולה להישאר מסומנת כמודרת */
    var live = {};
    plan.create.forEach(function (row) { live[row.line] = true; });
    Object.keys(excluded).forEach(function (line) { if (!live[line]) delete excluded[line]; });
    paint();
  }

  /* ציור בלבד, בלי לפרק מחדש את הטקסט: סימון תיבה אינו משנה את
     מה שהודבק, וניתוח חוזר היה מאפס את מיקום הגלילה בטבלה. */
  function paint() {
    var count = chosen().length;
    host.querySelector('#import-preview').innerHTML = previewHtml();
    var confirm = host.querySelector('#import-confirm');
    confirm.disabled = !count;
    confirm.textContent = count
      ? tCount('importData.confirm', count)
      : t('importData.confirmEmpty');
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 200);
  }

  function apply() {
    if (!plan || !chosen().length) return;
    var dropped = excluded;
    var result = Import.applyPlan(ctx.getState(), plan, {
      createEmployee: ctx.createEmployee,
      createBranch: ctx.createBranch,
      skipLine: function (line) { return !!dropped[line]; }
    });
    if (ctx.commit) ctx.commit();

    var message = tCount('importData.done', result.employees.length);
    if (result.branches.length) {
      message += ' ' + tCount('importData.branches', result.branches.length);
    }
    if (result.blocked) {
      message += ' ' + t('importData.blocked', { count: result.blocked });
    }
    close();
    if (!ctx.toast) return;
    /* ביטול מוצע מיד, כי זה הרגע היחיד שבו ברור מה בדיוק נוצר */
    ctx.toast(message, ctx.undo && result.employees.length ? {
      label: t('importData.undo'),
      onClick: function () { ctx.undo(result); }
    } : null);
  }

  function ensureHost() {
    if (host) return host;
    host = document.createElement('div');
    host.id = 'import-overlay';
    host.className = 'why-overlay hidden';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    document.body.appendChild(host);

    host.addEventListener('click', function (event) {
      if (event.target === host || event.target.closest('[data-import-close]')) {
        close();
        return;
      }
      if (event.target.closest('#import-sample')) {
        event.preventDefault();
        host.querySelector('#import-text').value = Import.sampleText(ctx.getState());
        refresh();
        return;
      }
      if (event.target.closest('#import-confirm')) { apply(); }
    });
    host.addEventListener('change', function (event) {
      var pick = event.target.dataset && event.target.dataset.pick;
      if (pick) {
        if (event.target.checked) { delete excluded[pick]; }
        else { excluded[pick] = true; }
        paint();
        return;
      }
      if (event.target.id === 'import-all') {
        excluded = {};
        if (!event.target.checked) {
          plan.create.forEach(function (row) { excluded[row.line] = true; });
        }
        paint();
      }
    });
    host.addEventListener('input', function (event) {
      if (event.target.id === 'import-text') schedule();
    });
    host.addEventListener('change', function (event) {
      if (event.target.id !== 'import-file') return;
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        /* BOM שאקסל מוסיף לקובצי CSV הופך את הכותרת הראשונה
           לשדה שלא מזוהה, ולכן הוא מוסר */
        host.querySelector('#import-text').value =
          String(reader.result || '').replace(/^﻿/, '');
        refresh();
      };
      reader.readAsText(file, 'utf-8');
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && host && !host.classList.contains('hidden')) close();
    });
    return host;
  }

  function open(options) {
    ctx = options;
    var node = ensureHost();
    node.innerHTML =
      '<div class="why-card import-card">' +
        '<button class="why-close" data-import-close aria-label="' +
          esc(t('common.close')) + '">✕</button>' +
        '<h2 class="why-title">' + esc(t('importData.title')) + '</h2>' +
        '<p class="import-hint">' + esc(t('importData.hint')) + '</p>' +
        '<textarea id="import-text" class="text-input import-text" rows="7" ' +
          'placeholder="' + esc(t('importData.placeholder')) + '"></textarea>' +
        '<div class="import-actions">' +
          '<label class="btn ghost file-btn">' + esc(t('importData.file')) +
            '<input type="file" id="import-file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden>' +
          '</label>' +
          '<button class="btn ghost small" id="import-sample">' +
            esc(t('importData.sample')) + '</button>' +
        '</div>' +
        '<div id="import-preview" class="import-preview"></div>' +
        '<div class="import-actions import-confirm-row">' +
          '<button class="btn primary" id="import-confirm" disabled>' +
            esc(t('importData.confirmEmpty')) + '</button>' +
          '<button class="btn ghost" data-import-close>' + esc(t('common.cancel')) + '</button>' +
        '</div>' +
      '</div>';
    node.classList.remove('hidden');
    excluded = {};
    knownEmails = [];
    refresh();
    if (ctx.loadEmails) {
      ctx.loadEmails().then(function (list) {
        knownEmails = list || [];
        /* המסך עדיין פתוח? רק אז שווה לצייר מחדש */
        if (host && !host.classList.contains('hidden') && host.querySelector('#import-text')) {
          refresh();
        }
      }, function () { /* בלי הרשימה, הבדיקה היחידה היא לפי השם */ });
    }
    var text = node.querySelector('#import-text');
    if (text) text.focus();
    return true;
  }

  var API = { open: open, close: close };
  root.ShiftImportUI = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
