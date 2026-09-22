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
        '<th>' + t('users.accessColumn') + '</th></tr></thead><tbody>';

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
        html += '<td>' + (isOwner ? '✔' :
          '<input type="checkbox" data-field="active"' + (user.active ? ' checked' : '') + '>') + '</td>';
        /* קישור לקביעת סיסמה, לכל מי שלא קיבל או שאיבד אותו. המנהל
           אינו צריך לדעת סיסמאות של אף אחד כדי לעזור. */
        html += '<td>' + (isOwner ? '—' :
          '<button class="btn ghost small" data-action="resend" data-email="' +
          esc(user.email) + '">' + esc(t('users.resendInvite')) + '</button>') + '</td>';
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
      var button = event.target.closest('[data-action="resend"]');
      if (!button) return;
      say('');
      button.disabled = true;
      ctx.backend.requestPasswordReset(button.dataset.email).then(function () {
        button.disabled = false;
        say(t('users.resendSent', { email: button.dataset.email }));
      }, function (err) {
        button.disabled = false;
        say((err && err.message) || t('users.resendFailed'), true);
      });
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

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      say('');
      var name = String(form.name.value || '').trim();
      var role = form.role.value;
      var link = resolveStaffCard(form.employeeId.value, name, role);

      ctx.backend.createUser({
        name: name,
        email: form.email.value,
        role: role,
        employeeId: link.employeeId
      }).then(function (user) {
        form.reset();
        refreshEmployeeOptions();
        var message = user.invited === false
          ? t('users.created', { email: user.email })
          : t('users.invited', { email: user.email });
        if (link.createdName) {
          message += ' ' + t('users.cardCreated', { name: link.createdName });
        } else if (link.matchedName) {
          message += ' ' + t('users.cardLinked', { name: link.matchedName });
        }
        say(message);
        render();
      }, function (err) {
        say((err && err.message) || t('users.createFailed'), true);
      });
    });
  }

  function sameName(a, b) {
    return String(a || '').trim().toLowerCase().replace(/\s+/g, ' ') ===
      String(b || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /* עובד שאין לו כרטיס אינו רואה משמרות ואינו יכול להגיש אילוצים,
     ולכן הזמנה בלי כרטיס היא הזמנה שלא עובדת. אם המנהל לא בחר
     כרטיס: מחפשים כרטיס באותו שם, ואם אין – פותחים אחד. */
  function resolveStaffCard(chosen, name, role) {
    if (chosen) return { employeeId: chosen };
    if (role !== 'employee' || !name) return { employeeId: null };

    var employees = ctx.getEmployees() || [];
    var match = employees.filter(function (emp) { return sameName(emp.name, name); })[0];
    if (match) return { employeeId: match.id, matchedName: match.name };

    if (!ctx.addEmployee) return { employeeId: null };
    var created = ctx.addEmployee(name);
    if (!created) return { employeeId: null };   // מגבלת התוכנית חסמה
    return { employeeId: created.id, createdName: created.name };
  }

  function refreshEmployeeOptions() {
    var select = document.querySelector('#invite-form select[name="employeeId"]');
    if (!select || !ctx) return;
    var employees = ctx.getEmployees() || [];
    select.innerHTML = '<option value="">' + t('users.noLink') + '</option>' + employees.map(function (emp) {
      return '<option value="' + esc(emp.id) + '">' + esc(emp.name) + '</option>';
    }).join('');
  }

  function init(options) {
    ctx = options;
    var tab = document.querySelector('.tab[data-tab="users"]');
    if (tab) tab.classList.remove('hidden');
    bind();
    refreshEmployeeOptions();
    render();
    if (root.I18n) { root.I18n.onChange(render); }

    document.getElementById('tabs').addEventListener('click', function (event) {
      var button = event.target.closest('.tab[data-tab="users"]');
      if (!button) return;
      refreshEmployeeOptions();
      render();
    });
  }

  root.ShiftUsersUI = { init: init, render: render };
})(typeof window !== 'undefined' ? window : globalThis);
