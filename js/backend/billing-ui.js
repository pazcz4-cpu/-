/* לשונית המנוי: מצב נוכחי, מגבלת עובדים, בחירת תוכנית וביטול. */
(function (root) {
  'use strict';

  var Model = root.ShiftModel;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var date = new Date(iso);
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear();
  }

  var ctx = null;

  var STATUS_TEXT = {
    trial: 'תקופת ניסיון',
    active: 'מנוי פעיל',
    past_due: 'תשלום לא התקבל',
    canceled: 'המנוי בוטל',
    expired: 'המנוי פג'
  };

  function render() {
    var container = document.getElementById('billing-panel');
    if (!container || !ctx) return;

    var employees = (ctx.getEmployees() || []).filter(function (emp) { return emp.active; }).length;
    var state = ctx.billing.state(employees);
    if (!state) { container.innerHTML = ''; return; }

    var provider = ctx.billing.describe();
    var html = '';

    /* מצב נוכחי */
    html += '<div class="settings-block billing-current">';
    html += '<div class="billing-row"><span>סטטוס</span><b class="status-' + esc(state.company.status) + '">' +
      esc(STATUS_TEXT[state.company.status] || state.company.status) + '</b></div>';
    html += '<div class="billing-row"><span>תוכנית</span><b>' + esc(state.plan.name) +
      ' · ' + esc(state.plan.range) + ' · ' + state.plan.priceMonthly + '₪ לחודש</b></div>';
    html += '<div class="billing-row"><span>בתוקף עד</span><b>' + formatDate(state.company.validUntil) + '</b></div>';
    html += '<div class="billing-row"><span>עובדים פעילים</span><b>' + employees +
      (state.plan.maxEmployees ? ' מתוך ' + state.plan.maxEmployees : ' (ללא הגבלה)') + '</b></div>';
    if (state.access.text) {
      html += '<p class="billing-note ' + (state.access.allowed ? '' : 'error') + '">' +
        esc(state.access.text) + '</p>';
    }
    if (state.overLimit) {
      html += '<p class="billing-note error">' + esc(state.problems.join(' ')) + '</p>';
    }
    html += '</div>';

    if (!state.canManage) {
      container.innerHTML = html +
        '<p class="hint">רק בעל החשבון יכול לשנות את המנוי.</p>';
      return;
    }

    /* בחירת תוכנית */
    html += '<h2>תוכניות</h2>';
    html += '<div class="plan-grid">';
    ctx.billing.plans().forEach(function (plan) {
      var current = plan.id === state.plan.id;
      var fits = !plan.maxEmployees || employees <= plan.maxEmployees;
      html += '<div class="plan-card' + (current ? ' current' : '') + (fits ? '' : ' too-small') + '">';
      html += '<div class="plan-name">' + esc(plan.name) + '</div>';
      html += '<div class="plan-price">' + plan.priceMonthly + '<small>₪ לחודש</small></div>';
      html += '<div class="plan-range">' + esc(plan.range) + '</div>';
      if (current) { html += '<div class="plan-tag">התוכנית הנוכחית</div>'; }
      else if (!fits) { html += '<div class="plan-tag warn">קטנה מדי עבור ' + employees + ' עובדים</div>'; }
      else { html += '<button class="btn primary" data-plan="' + esc(plan.id) + '">בחירה</button>'; }
      html += '</div>';
    });
    html += '</div>';

    html += '<p class="hint">' + esc(provider.name) +
      (provider.note ? ' — ' + esc(provider.note) : '') + '</p>';

    if (state.company.status === Model.SUBSCRIPTION.ACTIVE) {
      html += '<div class="settings-block row"><button id="billing-cancel" class="btn danger">ביטול המנוי</button></div>';
    }

    html += '<p id="billing-message" class="users-message hidden"></p>';
    container.innerHTML = html;
  }

  function say(text, isError) {
    var node = document.getElementById('billing-message');
    if (!node) return;
    node.textContent = text || '';
    node.className = 'users-message' + (text ? '' : ' hidden') + (isError ? ' error' : '');
  }

  function init(options) {
    ctx = options;
    var tab = document.querySelector('.tab[data-tab="billing"]');
    if (tab && Model.can(ctx.session.user.role, 'billing.manage')) { tab.classList.remove('hidden'); }

    var panel = document.getElementById('billing-panel');
    panel.addEventListener('click', function (event) {
      var choose = event.target.closest('[data-plan]');
      if (choose) {
        choose.disabled = true;
        say('');
        ctx.billing.choosePlan(choose.dataset.plan).then(function (result) {
          if (result.redirectUrl) { root.location.href = result.redirectUrl; return; }
          render();
          say('התוכנית עודכנה');
          if (ctx.onChange) ctx.onChange();
        }, function (err) {
          render();
          say((err && err.message) || 'העדכון נכשל', true);
        });
        return;
      }
      if (event.target.closest('#billing-cancel')) {
        if (!root.confirm('לבטל את המנוי? הגישה תיחסם בתום התקופה ששולמה.')) return;
        ctx.billing.cancel().then(function () {
          render();
          say('המנוי בוטל');
          if (ctx.onChange) ctx.onChange();
        }, function (err) { say((err && err.message) || 'הביטול נכשל', true); });
      }
    });

    document.getElementById('tabs').addEventListener('click', function (event) {
      if (event.target.closest('.tab[data-tab="billing"]')) { render(); }
    });

    render();
  }

  root.ShiftBillingUI = { init: init, render: render };
})(typeof window !== 'undefined' ? window : globalThis);
