/* ניהול משתמשי החברה: הזמנת עובדים ומנהלים, קישור משתמש לכרטיס עובד,
   והשבתה. זמין למנהל ולבעלים בלבד. */
(function (root) {
  'use strict';

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
        '<th class="row-head">שם</th><th>אימייל</th><th>תפקיד</th>' +
        '<th>כרטיס עובד</th><th>פעיל</th></tr></thead><tbody>';

      users.forEach(function (user) {
        var isOwner = user.role === 'owner';
        html += '<tr data-user="' + esc(user.id) + '">';
        html += '<td class="row-head">' + esc(user.name) + '</td>';
        html += '<td>' + esc(user.email) + '</td>';
        html += '<td>' + (isOwner
          ? esc(Model.ROLE_NAMES.owner)
          : '<select data-field="role" class="text-input">' +
              '<option value="manager"' + (user.role === 'manager' ? ' selected' : '') + '>מנהל/ת</option>' +
              '<option value="employee"' + (user.role === 'employee' ? ' selected' : '') + '>עובד/ת</option>' +
            '</select>') + '</td>';
        html += '<td>' + (isOwner ? '—' :
          '<select data-field="employeeId" class="text-input"><option value="">ללא</option>' +
          employees.map(function (emp) {
            return '<option value="' + esc(emp.id) + '"' +
              (user.employeeId === emp.id ? ' selected' : '') + '>' + esc(emp.name) + '</option>';
          }).join('') + '</select>') + '</td>';
        html += '<td>' + (isOwner ? '✔' :
          '<input type="checkbox" data-field="active"' + (user.active ? ' checked' : '') + '>') + '</td>';
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
        say('העדכון נשמר');
        render();
      }, function (err) {
        say((err && err.message) || 'העדכון נכשל', true);
        render();
      });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      say('');
      ctx.backend.createUser({
        name: form.name.value,
        email: form.email.value,
        password: form.password.value,
        role: form.role.value,
        employeeId: form.employeeId.value || null
      }).then(function (user) {
        form.reset();
        say('נוצר משתמש עבור ' + user.email);
        render();
      }, function (err) {
        say((err && err.message) || 'יצירת המשתמש נכשלה', true);
      });
    });
  }

  function refreshEmployeeOptions() {
    var select = document.querySelector('#invite-form select[name="employeeId"]');
    if (!select || !ctx) return;
    var employees = ctx.getEmployees() || [];
    select.innerHTML = '<option value="">ללא קישור</option>' + employees.map(function (emp) {
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

    document.getElementById('tabs').addEventListener('click', function (event) {
      var button = event.target.closest('.tab[data-tab="users"]');
      if (!button) return;
      refreshEmployeeOptions();
      render();
    });
  }

  root.ShiftUsersUI = { init: init, render: render };
})(typeof window !== 'undefined' ? window : globalThis);
