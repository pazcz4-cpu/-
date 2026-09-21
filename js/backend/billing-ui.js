/* לשונית המנוי: מצב נוכחי, מגבלת עובדים, בחירת תוכנית וביטול. */
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

  function formatDate(iso) {
    if (!iso) return '—';
    var date = new Date(iso);
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear();
  }

  var ctx = null;

  /* נקרא בכל ציור, כדי שהחלפת שפה תשתקף מיד */
  function statusText(status) {
    var keys = {
      trial: 'billing.statusTrial', active: 'billing.statusActive',
      past_due: 'billing.statusPastDue', canceled: 'billing.statusCanceled',
      expired: 'billing.statusExpired'
    };
    return keys[status] ? t(keys[status]) : status;
  }

  function render() {
    var container = document.getElementById('billing-panel');
    if (!container || !ctx) return;

    var employees = (ctx.getEmployees() || []).filter(function (emp) { return emp.active; }).length;
    var state = ctx.billing.state(employees);
    if (!state) { container.innerHTML = ''; return; }

    var provider = ctx.billing.describe();
    var company = state.company;
    var onTrial = company.status === Model.SUBSCRIPTION.TRIAL;
    var hasCard = Model.hasPaymentMethod(company);
    var price = t('billing.priceMonthly', { amount: state.plan.priceMonthly });
    var html = '';

    /* בתקופת ניסיון הדבר החשוב ביותר על המסך הוא מתי יתבצע החיוב
       הראשון וכמה הוא. זה מופיע ראשון, לפני כל שאר הפרטים. */
    if (onTrial && !company.cancelAtPeriodEnd) {
      html += '<p class="billing-trial' + (hasCard ? '' : ' warn') + '">' +
        esc(hasCard
          ? t('billing.trialNotice', {
              days: Model.TRIAL_DAYS, date: formatDate(company.validUntil), price: price })
          : t('billing.noCardWarning', { date: formatDate(company.validUntil) })) +
        '</p>';
    }

    /* מצב נוכחי */
    html += '<div class="settings-block billing-current">';
    html += '<div class="billing-row"><span>' + t('billing.status') + '</span><b class="status-' +
      esc(company.status) + '">' + esc(statusText(company.status)) + '</b></div>';
    html += '<div class="billing-row"><span>' + t('billing.plan') + '</span><b>' + esc(state.plan.name) +
      ' · ' + esc(state.plan.range) + ' · ' + esc(price) + '</b></div>';

    /* בניסיון זה "החיוב הראשון"; אחר כך "החיוב הבא". מנוי שבוטל
       לא יחויב שוב, ולכן מוצג התוקף בלבד. */
    var chargeLabel = company.cancelAtPeriodEnd
      ? t('billing.validUntil')
      : (onTrial ? t('billing.firstCharge') : t('billing.nextCharge'));
    html += '<div class="billing-row"><span>' + chargeLabel + '</span><b>' +
      formatDate(company.validUntil) +
      (company.cancelAtPeriodEnd ? '' : ' · ' + esc(price)) + '</b></div>';

    html += '<div class="billing-row"><span>' + t('billing.paymentMethod') + '</span><b>' +
      (hasCard ? t('billing.cardOnFile') : t('billing.noCard')) + '</b></div>';

    html += '<div class="billing-row"><span>' + t('billing.activeStaff') + '</span><b>' +
      esc(state.plan.maxEmployees
        ? t('billing.of', { count: employees, max: state.plan.maxEmployees })
        : t('billing.unlimited', { count: employees })) + '</b></div>';
    /* כשהודעת הניסיון כבר מוצגת למעלה, אותו מידע פעמיים רק מסיח */
    var noticeShown = onTrial && !company.cancelAtPeriodEnd;
    if (state.access.text && !noticeShown) {
      html += '<p class="billing-note ' + (state.access.allowed ? '' : 'error') + '">' +
        esc(state.access.text) + '</p>';
    }
    if (state.overLimit) {
      html += '<p class="billing-note error">' + esc(state.problems.join(' ')) + '</p>';
    }
    if (!hasCard && state.canManage) {
      html += '<div class="row"><button id="billing-add-card" class="btn primary">' +
        t('billing.addCard') + '</button></div>';
    }
    html += '</div>';

    if (!state.canManage) {
      container.innerHTML = html +
        '<p class="hint">' + t('billing.ownerOnly') + '</p>';
      return;
    }

    /* בחירת תוכנית */
    html += '<h2>' + t('billing.plans') + '</h2>';
    html += '<div class="plan-grid">';
    ctx.billing.plans().forEach(function (plan) {
      var current = plan.id === state.plan.id;
      var fits = !plan.maxEmployees || employees <= plan.maxEmployees;
      html += '<div class="plan-card' + (current ? ' current' : '') + (fits ? '' : ' too-small') + '">';
      html += '<div class="plan-name">' + esc(plan.name) + '</div>';
      html += '<div class="plan-price">' + plan.priceMonthly +
        '<small>' + esc(t('billing.priceMonthly', { amount: '' }).trim()) + '</small></div>';
      html += '<div class="plan-range">' + esc(plan.range) + '</div>';
      if (current) { html += '<div class="plan-tag">' + t('billing.currentPlan') + '</div>'; }
      else if (!fits) { html += '<div class="plan-tag warn">' + esc(t('billing.tooSmall', { count: employees })) + '</div>'; }
      else { html += '<button class="btn primary" data-plan="' + esc(plan.id) + '">' + t('billing.choose') + '</button>'; }
      html += '</div>';
    });
    html += '</div>';

    html += '<p class="hint">' + esc(provider.name) +
      (provider.note ? ' — ' + esc(provider.note) : '') + '</p>';

    if (state.company.status === Model.SUBSCRIPTION.ACTIVE) {
      html += '<div class="settings-block row"><button id="billing-cancel" class="btn danger">' +
        t('billing.cancel') + '</button></div>';
    }

    /* בתקופת ניסיון הביטול הוא "לפני שאחויב", לא "ויתור על מה ששילמתי" */
    if (onTrial && hasCard && !company.cancelAtPeriodEnd) {
      html += '<div class="settings-block row"><button id="billing-cancel-trial" class="btn ghost">' +
        t('billing.cancelBeforeCharge') + '</button></div>';
    }

    /* חזרה מביטול, כל עוד התקופה לא הסתיימה */
    if (company.cancelAtPeriodEnd) {
      html += '<div class="settings-block row"><button id="billing-resume" class="btn primary">' +
        t('billing.resume') + '</button></div>';
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
          say(t('billing.planUpdated'));
          if (ctx.onChange) ctx.onChange();
        }, function (err) {
          render();
          say((err && err.message) || t('billing.updateFailed'), true);
        });
        return;
      }
      /* הוספת אמצעי תשלום – פותח את עמוד התשלום של הספק */
      if (event.target.closest('#billing-add-card')) {
        say('');
        ctx.billing.addPaymentMethod().then(function (result) {
          if (result && result.redirectUrl) { root.location.href = result.redirectUrl; return; }
          render();
        }, function (err) { say((err && err.message) || t('billing.updateFailed'), true); });
        return;
      }

      var cancelTrial = event.target.closest('#billing-cancel-trial');
      if (event.target.closest('#billing-cancel') || cancelTrial) {
        /* הניסוח שונה: בניסיון מדגישים שלא יהיה חיוב בכלל */
        if (!root.confirm(t(cancelTrial ? 'billing.cancelTrialConfirm' : 'billing.cancelConfirm'))) return;
        ctx.billing.cancel().then(function () {
          render();
          say(t('billing.canceled'));
          if (ctx.onChange) ctx.onChange();
        }, function (err) { say((err && err.message) || t('billing.cancelFailed'), true); });
        return;
      }

      if (event.target.closest('#billing-resume')) {
        say('');
        ctx.billing.resume().then(function () {
          render();
          say(t('billing.resumed'));
          if (ctx.onChange) ctx.onChange();
        }, function (err) { say((err && err.message) || t('billing.updateFailed'), true); });
      }
    });

    document.getElementById('tabs').addEventListener('click', function (event) {
      if (event.target.closest('.tab[data-tab="billing"]')) { render(); }
    });

    if (root.I18n) { root.I18n.onChange(render); }

    render();
  }

  root.ShiftBillingUI = { init: init, render: render };
})(typeof window !== 'undefined' ? window : globalThis);
