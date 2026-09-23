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

  /* הקישור לפנייה יושב במודל, לצד שתי הכתובות שהוא בנוי מהן */
  function quoteHref() { return Model.quoteHref(); }

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
    /* ספק שאינו חי אינו יכול לקבל כרטיס. כל כפתור תשלום על המסך
       הזה יוביל לשום מקום, וכל משפט על "אמצעי תשלום" הוא הבטחה
       שאי אפשר לקיים. במצב הזה המסך מדווח מצב ואינו מבקש דבר.

       המצב נקרא מהמודל ולא מהספק ישירות, כדי ששורת המשתמש
       והמסך הזה לא יוכלו לומר שני דברים שונים. */
    var live = Model.isBillingLive();
    var company = state.company;
    var onTrial = company.status === Model.SUBSCRIPTION.TRIAL;
    var hasCard = Model.hasPaymentMethod(company);
    /* לא מחיר התוכנית אלא המחיר של החברה הזו: לרשת המחיר נסגר
       בפגישה ומוזן ידנית, ותוכנית הצעת־מחיר בלי מחיר אומרת זאת
       במילים. "0₪ לחודש" על מסך חיוב נקרא כמו חינם. */
    var price = Model.priceLabel(company);
    var html = '';

    /* בתקופת ניסיון הדבר החשוב ביותר על המסך הוא מתי יתבצע החיוב
       הראשון וכמה הוא. זה מופיע ראשון, לפני כל שאר הפרטים. */
    if (onTrial && !company.cancelAtPeriodEnd) {
      html += '<p class="billing-trial' + (hasCard || !live ? '' : ' warn') + '">' +
        esc(!live
          /* בלי {date}: התאריך כבר מופיע בשורת "החיוב הראשון"
             שמתחת, ופעמיים זה רעש. */
          ? t('billing.pilotNotice')
          : (hasCard
            ? t('billing.trialNotice', {
                days: Model.TRIAL_DAYS, date: formatDate(company.validUntil), price: price })
            : t('billing.noCardWarning', { date: formatDate(company.validUntil) }))) +
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

    if (live || hasCard) {
      html += '<div class="billing-row"><span>' + t('billing.paymentMethod') + '</span><b>' +
        (hasCard ? t('billing.cardOnFile') : t('billing.noCard')) + '</b></div>';
    }

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
    if (!hasCard && state.canManage && live) {
      html += '<div class="row"><button id="billing-add-card" class="btn primary">' +
        t('billing.addCard') + '</button></div>';
    }
    html += '</div>';

    if (!state.canManage) {
      container.innerHTML = html +
        '<p class="hint">' + t('billing.ownerOnly') + '</p>';
      return;
    }

    /* המחירון. ללא סליקה חיה הוא גם מחירון וגם דרך לעבור תוכנית:
       הבחירה משנה תקרה ומחיר, והכסף נגבה בחיוב הבא. */
    html += '<h2>' + t('billing.plans') + '</h2>';
    html += '<div class="plan-grid">';
    ctx.billing.plans().forEach(function (plan) {
      var current = plan.id === state.plan.id;
      var fits = !plan.maxEmployees || employees <= plan.maxEmployees;
      html += '<div class="plan-card' + (current ? ' current' : '') + (fits ? '' : ' too-small') +
        (plan.quote ? ' quote' : '') + '">';
      html += '<div class="plan-name">' + esc(plan.name) + '</div>';
      /* בתוכנית הצעת־מחיר אין מספר להציג. אם החברה כבר על
         התוכנית ויש לה מחיר שסוכם – מציגים אותו, כי זה מה
         שייגבה ממנה בפועל. */
      if (plan.quote && !(current && !Model.awaitingQuote(company))) {
        html += '<div class="plan-quote">' + esc(t('plans.quotePrice')) + '</div>';
      } else if (plan.quote) {
        html += '<div class="plan-price">' + Model.effectivePrice(company) +
          '<small>' + esc(t('billing.priceMonthly', { amount: '' }).trim()) + '</small></div>';
      } else {
        html += '<div class="plan-price">' + plan.priceMonthly +
          '<small>' + esc(t('billing.priceMonthly', { amount: '' }).trim()) + '</small></div>';
      }
      html += '<div class="plan-range">' + esc(plan.range) + '</div>';
      if (current) { html += '<div class="plan-tag">' + t('billing.currentPlan') + '</div>'; }
      else if (!fits) { html += '<div class="plan-tag warn">' + esc(t('billing.tooSmall', { count: employees })) + '</div>'; }
      /* הכפתור אינו מותנה בסליקה חיה. החלפת תוכנית היא שינוי
         תקרה ומחיר, והמחיר החדש נגבה בחיוב הבא – גם כשהסליקה
         עוד לא חוברה. מסך שמציג מחירון בלי דרך לעבור תוכנית
         משאיר את הלקוח תקוע בדיוק ברגע שבו הוא רוצה לשלם יותר. */
      /* תוכנית הצעת־מחיר אינה נבחרת בלחיצה: אין לה מחיר לגבות,
         והמעבר אליה הוא שיחה. כפתור "בחירה" כאן היה מעביר את
         הלקוח לתוכנית שעולה אפס. */
      else if (plan.quote) {
        html += '<a class="btn primary" href="' + esc(quoteHref()) + '">' +
          esc(t('plans.quoteCta')) + '</a>';
      }
      else { html += '<button class="btn primary" data-plan="' + esc(plan.id) + '">' + t('billing.choose') + '</button>'; }
      html += '</div>';
    });
    html += '</div>';

    /* שם הספק והערה שלו שייכים ללקוח רק כשהוא באמת עומד לשלם
       דרכו. "ספק מדומה (פיתוח)" על מסך של לקוח משלם הוא בדיוק
       סוג המשפט שגורם לו לסגור את הלשונית. */
    if (live) {
      html += '<p class="hint">' + esc(provider.name) +
        (provider.note ? ' — ' + esc(provider.note) : '') + '</p>';
    } else {
      html += '<p class="billing-note">' + esc(t('billing.pilotHint')) + '</p>';
    }

    if (state.company.status === Model.SUBSCRIPTION.ACTIVE) {
      html += '<div class="settings-block row"><button id="billing-cancel" class="btn danger">' +
        t('billing.cancel') + '</button></div>';
    }

    /* בתקופת ניסיון הביטול הוא "לפני שאחויב", לא "ויתור על מה ששילמתי" */
    if (onTrial && hasCard && !company.cancelAtPeriodEnd && live) {
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

  /* השאלה לפני החלפת תוכנית: כמה זה עולה, ומתי זה ייגבה.
     אותו נוסח בדיוק מופיע גם כשנתקלים בתקרה במסך העובדים, כדי
     שלקוח לא יראה שני הסברים שונים לאותה פעולה. */
  function askPlan(planId) {
    var plan = Model.PLANS[planId];
    if (!plan) return Promise.resolve(false);
    var backend = ctx.billing && ctx.billing.backend;
    var session = backend && backend.session ? backend.session() : null;
    var company = (session && session.company) || (ctx.session && ctx.session.company) || {};
    var onTrial = company.status === Model.SUBSCRIPTION.TRIAL;
    var price = t('billing.priceMonthly', { amount: plan.priceMonthly });
    var lines = [
      t('plans.upgradeTo', { suggested: plan.name, range: plan.range, price: price }),
      (!onTrial && company.validUntil)
        ? t('plans.upgradeWhen', { date: Model.formatDate(company.validUntil) })
        : t('plans.upgradeWhenTrial')
    ];
    var options = {
      title: t('billing.choose') + ' — ' + plan.name,
      lines: lines,
      confirmLabel: t('billing.choose'),
      cancelLabel: t('plans.upgradeNo')
    };
    if (root.ShiftConfirmUI && root.ShiftConfirmUI.ask) return root.ShiftConfirmUI.ask(options);
    return Promise.resolve(root.confirm
      ? root.confirm(options.title + '\n\n' + lines.join('\n')) : false);
  }

  function applyPlan(button) {
    button.disabled = true;
    say('');
    ctx.billing.choosePlan(button.dataset.plan).then(function (result) {
      if (result && result.redirectUrl) { root.location.href = result.redirectUrl; return; }
      render();
      say(t('billing.planUpdated'));
      if (ctx.onChange) ctx.onChange();
    }, function (err) {
      render();
      say((err && err.message) || t('billing.updateFailed'), true);
    });
  }

  function init(options) {
    ctx = options;
    var tab = document.querySelector('.tab[data-tab="billing"]');
    if (tab && Model.can(ctx.session.user.role, 'billing.manage')) { tab.classList.remove('hidden'); }

    var panel = document.getElementById('billing-panel');
    panel.addEventListener('click', function (event) {
      var choose = event.target.closest('[data-plan]');
      if (choose) {
        /* החלפת תוכנית היא התחייבות לכסף, ולכן היא עוברת דרך
           שאלה שאומרת כמה ומתי – ולא דרך כפתור בודד. */
        askPlan(choose.dataset.plan).then(function (yes) {
          if (!yes) return;
          applyPlan(choose);
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
