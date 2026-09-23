/* ניהול משתמשי החברה: הזמנת עובדים ומנהלים, קישור משתמש לכרטיס עובד,
   והשבתה. זמין למנהל ולבעלים בלבד. */
(function (root) {
  'use strict';

  function t(key, params) {
    if (!root.I18n) return key;
    try { return root.I18n.t(key, params); } catch (err) { return key; }
  }

  var Model = root.ShiftModel;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var ctx = null;

  /* מה המנהל רואה על כל מוזמן. עד עכשיו הוא ראה כפתור "שליחת
     קישור" ותו לא, ולכן לא היה לו שום דרך לדעת אם העובד עוד לא
     הספיק, אם הקישור פג, או שהוא כבר בפנים מזמן – והוא שלח שוב. */
  var CHIP = { joined: 'ok', pending: 'info', expired: 'warning', unknown: '' };

  function inviteLabel(user) {
    var state = Model.inviteState(user);
    if (state === Model.INVITE.UNKNOWN) return t('users.inviteNone');
    var date = Model.formatDate(state === Model.INVITE.JOINED ? user.joinedAt : user.invitedAt);
    if (state === Model.INVITE.JOINED) return t('users.inviteJoined', { date: date });
    if (state === Model.INVITE.EXPIRED) return t('users.inviteExpired', { date: date });
    return t('users.invitePending', { date: date });
  }

  function inviteCell(user) {
    var state = Model.inviteState(user);
    var html = '<div class="invite-cell">' +
      '<span class="invite-chip ' + CHIP[state] + '">' + esc(inviteLabel(user)) + '</span>' +
      '<span class="invite-actions">' +
      '<button class="btn ghost small" data-action="resend" data-user="' + esc(user.id) +
      '" data-email="' + esc(user.email) + '">' +
      esc(state === Model.INVITE.JOINED || state === Model.INVITE.UNKNOWN
        ? t('users.resendInvite') : t('users.resendAgain')) + '</button>';
    if (Model.canCancelInvite(user)) {
      html += '<button class="btn ghost small danger" data-action="cancel-invite" data-user="' +
        esc(user.id) + '" data-name="' + esc(user.name || user.email) + '">' +
        esc(t('users.cancelInvite')) + '</button>';
    }
    return html + '</span></div>';
  }


  function render() {
    var container = document.getElementById('users-list');
    if (!container || !ctx) return;
    ctx.backend.listUsers().then(function (users) {
      var employees = ctx.getEmployees() || [];
      var html = '<table><thead><tr>' +
        '<th class="row-head">' + t('users.nameColumn') + '</th>' +
        '<th>' + t('users.emailColumn') + '</th>' +
        '<th>' + t('users.role') + '</th>' +
        '<th>' + t('users.staffCard') + '</th>' +
        '<th>' + t('users.activeColumn') + '</th>' +
        '<th>' + t('users.inviteColumn') + '</th></tr></thead><tbody>';

      users.forEach(function (user) {
        var isOwner = user.role === 'owner';
        html += '<tr data-user="' + esc(user.id) + '">';
        html += '<td class="row-head">' + esc(user.name) + '</td>';
        html += '<td>' + esc(user.email) + '</td>';
        html += '<td>' + (isOwner
          ? esc(Model.ROLE_NAMES.owner)
          : '<select data-field="role" class="text-input">' +
              '<option value="manager"' + (user.role === 'manager' ? ' selected' : '') + '>' + esc(t('roles.manager')) + '</option>' +
              '<option value="employee"' + (user.role === 'employee' ? ' selected' : '') + '>' + esc(t('roles.employee')) + '</option>' +
            '</select>') + '</td>';
        html += '<td>' + (isOwner ? '—' :
          '<select data-field="employeeId" class="text-input"><option value="">' + t('users.none') + '</option>' +
          employees.map(function (emp) {
            return '<option value="' + esc(emp.id) + '"' +
              (user.employeeId === emp.id ? ' selected' : '') + '>' + esc(emp.name) + '</option>';
          }).join('') + '</select>') + '</td>';
        html += '<td>' + (isOwner
          ? (root.ShiftIcons ? root.ShiftIcons.svg('check') : '\u2714')
          :
          '<input type="checkbox" data-field="active"' + (user.active ? ' checked' : '') + '>') + '</td>';
        html += '<td>' + (isOwner ? '—' : inviteCell(user)) + '</td>';
        html += '</tr>';
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    });
  }

  function bind() {
    var list = document.getElementById('users-list');
    var form = document.getElementById('invite-form');
    var message = document.getElementById('users-message');

    function say(text, isError) {
      message.textContent = text || '';
      message.className = 'users-message' + (text ? '' : ' hidden') + (isError ? ' error' : '');
    }

    list.addEventListener('click', function (event) {
      var resend = event.target.closest('[data-action="resend"]');
      if (resend) return sendAgain(resend, say);
      var cancel = event.target.closest('[data-action="cancel-invite"]');
      if (cancel) return cancelInvite(cancel, say);
    });

    list.addEventListener('change', function (event) {
      var row = event.target.closest('tr[data-user]');
      if (!row) return;
      var field = event.target.dataset.field;
      var patch = {};
      if (field === 'active') patch.active = event.target.checked;
      else if (field === 'role') patch.role = event.target.value;
      else if (field === 'employeeId') patch.employeeId = event.target.value || null;
      else return;

      ctx.backend.updateUser(row.dataset.user, patch).then(function () {
        say(t('users.updated'));
        render();
      }, function (err) {
        say((err && err.message) || t('users.updateFailed'), true);
        render();
      });
    });

    /* בחירת עובד מהרשימה ממלאת את המייל שלו. השם כבר יושב על
       הכרטיס, ולכן אין סיבה להקליד אותו שוב. */
    form.addEventListener('change', function (event) {
      if (event.target === form.employeeId) {
        var employee = employeeById(form.employeeId.value);
        /* ממלאים, לא מוחקים. עובד שאין על הכרטיס שלו מייל אינו
           סיבה למחוק כתובת שהמנהל בדיוק הקליד. */
        if (employee && employee.email) form.email.value = employee.email;
      }
      updateSubmit();
    });
    form.addEventListener('input', function (event) {
      if (event.target === form.email) updateSubmit();
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      say('');
      var email = String(form.email.value || '').trim().toLowerCase();
      var chosen = form.employeeId.value;

      /* בלי עובד ובלי מייל – השליחה היא לכולם. זו הפעולה שמנהל
         עושה פעם אחת, ביום הראשון, לשלושים איש. */
      if (!email && !chosen) return sendToAll(say);
      if (!email) { say(t('users.accessNoEmail'), true); return; }

      var role = form.role.value;
      var link = resolveStaffCard(chosen, email, role);
      var employee = employeeById(link.employeeId);
      var name = (employee && employee.name) || nameFromEmail(email);

      var button = document.getElementById('invite-submit');
      if (button) button.disabled = true;
      ctx.backend.sendEmployeeAccess({
        name: name, email: email, role: role, employeeId: link.employeeId
      }).then(function (user) {
        if (button) button.disabled = false;
        form.reset();
        refreshEmployeeOptions();
        updateSubmit();
        var message = t('users.accessSent', { email: user.email || email });
        if (link.createdName) {
          message += ' ' + t('users.cardCreated', { name: link.createdName });
        } else if (link.matchedName) {
          message += ' ' + t('users.cardLinked', { name: link.matchedName });
        }
        say(message);
        render();
      }, function (err) {
        if (button) button.disabled = false;
        say((err && err.message) || t('users.accessFailed'), true);
      });
    });

    updateSubmit();
  }

  /* ===== שליחה לכולם =====
     אחד אחרי השני, ולא שלושים בקשות בבת אחת: ספק הדואר חוסם
     לפי קצב, וחצי מהעובדים שלא קיבלו מייל הם תקלה שאיש לא
     יראה עד שהם לא יגישו אילוצים. */
  var BULK_GAP = 350;

  function activeWithEmail() {
    return (ctx.getEmployees() || []).filter(function (emp) {
      return emp.active !== false && String(emp.email || '').trim();
    });
  }

  function sendToAll(say) {
    var targets = activeWithEmail();
    var missing = (ctx.getEmployees() || []).filter(function (emp) {
      return emp.active !== false && !String(emp.email || '').trim();
    }).length;

    if (!targets.length) {
      say(missing ? t('users.accessBulkNoEmail', { count: missing }) : t('users.accessNone'), true);
      return;
    }
    ask({
      title: t('users.sendAccessAll', { count: targets.length }),
      lines: [t('users.accessBulkConfirm', { count: targets.length })],
      confirmLabel: t('users.sendAccess'),
      cancelLabel: t('users.cancelNo')
    }).then(function (yes) { if (yes) runBulk(targets, missing, say); });
  }

  function runBulk(targets, missing, say) {
    var button = document.getElementById('invite-submit');
    if (button) button.disabled = true;

    var sent = 0;
    var failed = [];

    function step(index) {
      if (index >= targets.length) {
        if (button) button.disabled = false;
        var lines = [t('users.accessBulkDone', { sent: sent })];
        if (failed.length) lines.push(t('users.accessBulkFailed', { count: failed.length }));
        if (missing) lines.push(t('users.accessBulkNoEmail', { count: missing }));
        say(lines.join(' '), failed.length > 0);
        refreshEmployeeOptions();
        render();
        return;
      }
      var employee = targets[index];
      say(t('users.sending', { done: index + 1, total: targets.length }));
      ctx.backend.sendEmployeeAccess({
        name: employee.name,
        email: String(employee.email).trim().toLowerCase(),
        role: 'employee',
        employeeId: employee.id
      }).then(function () { sent++; }, function () { failed.push(employee.name); })
        .then(function () {
          if (index + 1 >= targets.length) return step(index + 1);
          root.setTimeout(function () { step(index + 1); }, BULK_GAP);
        });
    }

    step(0);
  }

  /* מה כתוב על הכפתור תלוי במה שמולא: עובד אחד, או כולם.
     כפתור שאומר "שליחה לכל 24 העובדים" אינו יכול להפתיע. */
  function updateSubmit() {
    var form = document.getElementById('invite-form');
    var button = document.getElementById('invite-submit');
    if (!form || !button || !ctx) return;
    var single = String(form.email.value || '').trim() || form.employeeId.value;
    if (single) {
      button.textContent = t('users.sendAccess');
      button.removeAttribute('data-i18n');
      return;
    }
    var count = activeWithEmail().length;
    button.textContent = t('users.sendAccessAll', { count: count });
    button.removeAttribute('data-i18n');
  }

  function employeeById(id) {
    if (!id) return null;
    return (ctx.getEmployees() || []).filter(function (emp) { return emp.id === id; })[0] || null;
  }

  /* שם זמני לכרטיס שנפתח ממייל בלבד. המנהל יתקן אותו בשנייה,
     וזה עדיף על כרטיס בלי שם בכלל. */
  function nameFromEmail(email) {
    return String(email || '').split('@')[0].replace(/[._-]+/g, ' ').trim() || email;
  }

  /* שליחה חוזרת. אותו קישור משרת גם הזמנה שפגה וגם עובד ששכח,
     ולכן אין כאן שתי פעולות – יש אחת, ושעון התוקף מתחיל מחדש. */
  function sendAgain(button, say) {
    say('');
    button.disabled = true;
    var email = button.dataset.email;
    var send = ctx.backend.resendInvite
      ? ctx.backend.resendInvite({ id: button.dataset.user, email: email })
      : ctx.backend.requestPasswordReset(email);
    send.then(function () {
      button.disabled = false;
      say(t('users.resendSent', { email: email }));
      render();
    }, function (err) {
      button.disabled = false;
      say((err && err.message) || t('users.resendFailed'), true);
    });
  }

  /* ביטול הזמנה מוחק משתמש, ולכן הוא עובר דרך שאלה. השאלה אומרת
     מה בדיוק קורה לקישור שכבר נשלח, כי זה מה שהמנהל רוצה לדעת. */
  function cancelInvite(button, say) {
    say('');
    var name = button.dataset.name;
    var userId = button.dataset.user;
    ask({
      title: t('users.cancelTitle'),
      lines: [t('users.cancelBody', { name: name })],
      tone: 'danger',
      confirmLabel: t('users.cancelYes'),
      cancelLabel: t('users.cancelNo')
    }).then(function (yes) {
      if (!yes) return;
      button.disabled = true;
      ctx.backend.cancelInvite(userId).then(function () {
        say(t('users.cancelled', { name: name }));
        render();
      }, function (err) {
        button.disabled = false;
        say((err && err.message) || t('users.cancelFailed'), true);
      });
    });
  }

  /* אם מסך האישור לא נטען משום מה, עדיף שאלה של הדפדפן מאשר
     מחיקה בלי לשאול. */
  function ask(options) {
    if (root.ShiftConfirmUI && root.ShiftConfirmUI.ask) return root.ShiftConfirmUI.ask(options);
    return Promise.resolve(root.confirm
      ? root.confirm(options.title + '\n\n' + options.lines.join('\n')) : false);
  }

  /* עובד שאין לו כרטיס אינו רואה משמרות ואינו יכול להגיש אילוצים,
     ולכן הזמנה בלי כרטיס היא הזמנה שלא עובדת. אם המנהל לא בחר
     כרטיס: מחפשים כרטיס באותו שם, ואם אין – פותחים אחד. */
  function resolveStaffCard(chosen, email, role) {
    if (chosen) return { employeeId: chosen };
    if (role !== 'employee' || !email) return { employeeId: null };

    /* התאמה לפי המייל שעל הכרטיס. השם יכול להיכתב בשתי צורות
       ("ד. כהן" ו-"דנה כהן"), המייל לא. */
    var employees = ctx.getEmployees() || [];
    var match = employees.filter(function (emp) {
      return String(emp.email || '').trim().toLowerCase() === email;
    })[0];
    if (match) return { employeeId: match.id, matchedName: match.name };

    if (!ctx.addEmployee) return { employeeId: null };
    /* המייל נשמר על הכרטיס שנפתח, אחרת השליחה הבאה הייתה פותחת
       לו כרטיס שני */
    var created = ctx.addEmployee(nameFromEmail(email), email);
    if (!created) return { employeeId: null };   // מגבלת התוכנית חסמה
    return { employeeId: created.id, createdName: created.name };
  }

  function refreshEmployeeOptions() {
    var select = document.querySelector('#invite-form select[name="employeeId"]');
    if (!select || !ctx) return;
    var employees = ctx.getEmployees() || [];
    var current = select.value;
    select.innerHTML = '<option value="">' + t('users.noLink') + '</option>' + employees.map(function (emp) {
      return '<option value="' + esc(emp.id) + '">' + esc(emp.name) +
        (emp.email ? ' – ' + esc(emp.email) : '') + '</option>';
    }).join('');
    if (current) select.value = current;
    updateSubmit();
  }

  function init(options) {
    ctx = options;
    var tab = document.querySelector('.tab[data-tab="users"]');
    if (tab) tab.classList.remove('hidden');
    bind();
    refreshEmployeeOptions();
    render();
    /* גם הכפתור מתורגם מחדש: הוא נכתב בקוד ולא דרך data-i18n,
       כי מה שכתוב עליו תלוי במה שמולא בטופס. */
    if (root.I18n) {
      root.I18n.onChange(function () { render(); updateSubmit(); });
    }

    document.getElementById('tabs').addEventListener('click', function (event) {
      var button = event.target.closest('.tab[data-tab="users"]');
      if (!button) return;
      refreshEmployeeOptions();
      render();
    });
  }

  root.ShiftUsersUI = { init: init, render: render };
})(typeof window !== 'undefined' ? window : globalThis);
