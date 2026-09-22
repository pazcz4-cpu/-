/* המשרד האחורי – הצד של הדפדפן.

   הוא אינו חלק מאפליקציית הלקוח ואינו מכיר אותה: דף נפרד, קובץ
   נפרד, וכל הנתונים מגיעים מנקודות קצה ב-/api/admin. הדפדפן
   כאן אינו קורא את בסיס הנתונים ישירות אפילו פעם אחת, כי משרד
   אחורי שקורא ישירות היה צריך מפתח שרואה הכל – ומפתח כזה אינו
   יכול לשבת בדפדפן.

   מה שכן עובר בדפדפן: אסימון ההתחברות הרגיל. השרת הוא שמחליט
   אם הכתובת שמאחוריו נמצאת ברשימת בעלי המוצר. */
(function () {
  'use strict';

  var config = window.SHIFT_CONFIG || {};
  var session = null;
  var data = { overview: null, companies: null, tickets: null };
  var current = 'overview';
  var TOKEN_KEY = 'setshifts-admin-session-v1';

  /* ===== עזרים ===== */

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var shekel = new Intl.NumberFormat('he-IL', {
    style: 'currency', currency: 'ILS', maximumFractionDigits: 0
  });
  var shekelExact = new Intl.NumberFormat('he-IL', {
    style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2
  });

  function money(value) { return shekel.format(Number(value) || 0); }
  function moneyExact(value) { return shekelExact.format(Number(value) || 0); }

  function date(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('he-IL',
      { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function daysLeft(iso) {
    if (!iso) return null;
    return Math.round((new Date(iso).getTime() - Date.now()) / 864e5);
  }

  var STATUS_LABEL = {
    trial: 'ניסיון', active: 'פעיל', past_due: 'תשלום נכשל',
    canceled: 'בוטל', expired: 'פג'
  };
  var TICKET_STATUS = {
    open: 'פתוחה', in_progress: 'בטיפול', answered: 'נענתה', closed: 'נסגרה'
  };
  var PLAN_LABEL = { starter: 'קטן', growth: 'בינוני', business: 'גדול' };

  function statusPill(status) {
    return '<span class="adm-pill is-' + esc(status) + '">' +
      esc(STATUS_LABEL[status] || status) + '</span>';
  }

  /* ===== שרת ===== */

  function api(name, payload) {
    return fetch('/api/admin/' + name, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (session && session.access_token)
      },
      body: JSON.stringify(payload || {})
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) {
          var error = new Error(body.message || ('שגיאה ' + response.status));
          error.status = response.status;
          throw error;
        }
        return body;
      });
    });
  }

  function signIn(email, password) {
    return fetch(config.supabaseUrl.replace(/\/+$/, '') + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: config.supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok) throw new Error(body.error_description || body.msg || 'ההתחברות נכשלה');
        return body;
      });
    });
  }

  /* ===== לוח מחוונים ===== */

  function tile(label, value, note, key) {
    return '<div class="adm-tile' + (key ? ' is-key' : '') + '">' +
      '<p class="adm-tile-label">' + esc(label) + '</p>' +
      '<p class="adm-tile-value">' + value + '</p>' +
      (note ? '<p class="adm-tile-note">' + esc(note) + '</p>' : '') +
      '</div>';
  }

  function attentionTable(title, subtitle, rows, columns) {
    var html = '<div class="adm-card"><h2>' + esc(title) + '</h2>';
    if (subtitle) html += '<p class="adm-card-sub">' + esc(subtitle) + '</p>';
    if (!rows.length) {
      html += '<p class="adm-empty">אין. זה מצב טוב.</p></div>';
      return html;
    }
    html += '<div class="adm-scroll"><table class="adm-table"><thead><tr>' +
      columns.map(function (col) {
        return '<th' + (col.num ? ' class="num"' : '') + '>' + esc(col.label) + '</th>';
      }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (row) {
      html += '<tr class="adm-row-link" data-company="' + esc(row.id) + '">' +
        columns.map(function (col) {
          return '<td' + (col.num ? ' class="num"' : '') + '>' + col.value(row) + '</td>';
        }).join('') + '</tr>';
    });
    return html + '</tbody></table></div></div>';
  }

  function renderOverview() {
    var node = document.getElementById('panel-overview');
    var view = data.overview;
    if (!view) { node.innerHTML = '<p class="adm-empty">טוען…</p>'; return; }

    var counts = view.counts;
    var mrr = view.money.recurring;
    var vatNote = view.vat.pricesInclude
      ? 'המחירים כוללים מע"מ ' + view.vat.rate + '%'
      : 'המחירים אינם כוללים מע"מ ' + view.vat.rate + '%';

    var html = '<div class="adm-tiles">';
    html += tile('הכנסה חודשית חוזרת', money(mrr.gross),
      mrr.companies + ' מנויים משלמים · נטו ' + money(mrr.net), true);
    html += tile('נכנס החודש', money(view.money.thisMonth.gross),
      view.money.thisMonth.charges + ' חיובים · נטו ' + money(view.money.thisMonth.net));
    html += tile('לקוחות', String(counts.companies),
      (counts.byStatus.active || 0) + ' משלמים · ' + (counts.byStatus.trial || 0) + ' בניסיון');
    html += tile('משתמשים פעילים', String(counts.users), 'בכל החברות יחד');
    html += tile('הכנסות מאז ומעולם', money(view.money.allTime.gross),
      'נטו ' + money(view.money.allTime.net) + ' · מע"מ ' + money(view.money.allTime.vat));
    html += tile('קריאות פתוחות', String((counts.tickets.open || 0) +
      (counts.tickets.in_progress || 0)), 'ממתינות למענה');
    html += '</div>';

    html += '<p class="adm-note" style="margin:calc(var(--s3) * -1) 0 var(--s5)">' +
      esc(vatNote) + ' · עודכן ' + esc(new Date(view.generatedAt)
        .toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })) + '</p>';

    /* שלוש רשימות שאפשר להתקשר לפיהן */
    html += attentionTable('ניסיונות שנגמרים השבוע',
      'מי שאין לו כרטיס יפוג בלי חיוב. זו שיחת הטלפון הכי משתלמת ביומן.',
      view.attention.trialsEnding, [
        { label: 'לקוח', value: function (r) { return esc(r.name); } },
        { label: 'חבילה', value: function (r) { return esc(PLAN_LABEL[r.plan] || r.plan); } },
        { label: 'נותרו', num: true, value: function (r) {
          return r.days <= 0 ? 'נגמר' : r.days + ' ימים'; } },
        { label: 'כרטיס', value: function (r) {
          return r.hasCard ? '<span class="adm-pill is-active">יש</span>'
            : '<span class="adm-flag">אין כרטיס</span>'; } }
      ]);

    html += attentionTable('תשלומים שנכשלו',
      'ממשיכים לנסות שבעה ימים, ואז המנוי פג.',
      view.attention.failing, [
        { label: 'לקוח', value: function (r) { return esc(r.name); } },
        { label: 'חבילה', value: function (r) { return esc(PLAN_LABEL[r.plan] || r.plan); } },
        { label: 'ימים בפיגור', num: true, value: function (r) { return String(r.days); } }
      ]);

    html += attentionTable('ביטלו, ועדיין בתוקף',
      'הם ממשיכים עד סוף התקופה ששולמה. עד אז אפשר לשוחח.',
      view.attention.canceling, [
        { label: 'לקוח', value: function (r) { return esc(r.name); } },
        { label: 'עד', value: function (r) { return esc(date(r.until)); } }
      ]);

    node.innerHTML = html;
  }

  /* ===== כסף ===== */

  function renderMoney() {
    var node = document.getElementById('panel-money');
    var view = data.overview;
    if (!view) { node.innerHTML = '<p class="adm-empty">טוען…</p>'; return; }

    var months = view.money.months.slice(-12);
    var peak = months.reduce(function (max, row) { return Math.max(max, row.gross); }, 0) || 1;

    var html = '<div class="adm-card"><h2>מחזור לפי חודש</h2>' +
      '<p class="adm-card-sub">שנים עשר החודשים האחרונים. הסכומים לפי מה שנגבה בפועל, ' +
      'לא לפי המחירון.</p><div class="adm-bars">';
    months.forEach(function (row) {
      var height = Math.round((row.gross / peak) * 100);
      html += '<div class="adm-bar" title="' + esc(row.month + ' · ' + moneyExact(row.gross)) + '">' +
        '<span class="adm-bar-top">' + (row.gross ? money(row.gross) : '—') + '</span>' +
        '<span class="adm-bar-fill' + (row.gross ? '' : ' is-empty') +
          '" style="height:' + Math.max(height, 2) + '%"></span>' +
        '<span class="adm-bar-label">' + esc(row.month.slice(5) + '/' + row.month.slice(2, 4)) +
        '</span></div>';
    });
    html += '</div></div>';

    html += '<div class="adm-card"><h2>פירוט חודשי</h2>' +
      '<p class="adm-card-sub">' +
      (view.vat.pricesInclude
        ? 'המחירים כוללים מע"מ, ולכן הנטו הוא מה שנשאר אחרי הפרשה.'
        : 'המחירים אינם כוללים מע"מ, ולכן הברוטו גבוה מהמחירון.') +
      '</p><div class="adm-scroll"><table class="adm-table"><thead><tr>' +
      '<th>חודש</th><th class="num">חיובים</th><th class="num">ברוטו</th>' +
      '<th class="num">מע"מ</th><th class="num">נטו</th></tr></thead><tbody>';
    view.money.months.slice().reverse().forEach(function (row) {
      html += '<tr><td>' + esc(row.month) + '</td>' +
        '<td class="num">' + row.charges + '</td>' +
        '<td class="num">' + esc(moneyExact(row.gross)) + '</td>' +
        '<td class="num">' + esc(moneyExact(row.vat)) + '</td>' +
        '<td class="num">' + esc(moneyExact(row.net)) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';

    html += '<div class="adm-card"><h2>החבילות</h2>' +
      '<div class="adm-scroll"><table class="adm-table"><thead><tr>' +
      '<th>חבילה</th><th class="num">מחיר</th><th class="num">נטו</th>' +
      '<th class="num">מע"מ</th><th class="num">מנויים</th></tr></thead><tbody>';
    view.plans.forEach(function (plan) {
      html += '<tr><td>' + esc(PLAN_LABEL[plan.id] || plan.id) + '</td>' +
        '<td class="num">' + esc(moneyExact(plan.priceMonthly)) + '</td>' +
        '<td class="num">' + esc(moneyExact(plan.net)) + '</td>' +
        '<td class="num">' + esc(moneyExact(plan.vat)) + '</td>' +
        '<td class="num">' + (view.counts.byPlan[plan.id] || 0) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';

    node.innerHTML = html;
  }

  /* ===== לקוחות ===== */

  function renderCompanies() {
    var node = document.getElementById('panel-companies');
    var list = data.companies;

    var html = '<div class="adm-card">' +
      '<div class="adm-controls">' +
        '<input class="adm-input" id="adm-search" type="search" ' +
          'placeholder="חיפוש לפי שם עסק או מייל של הבעלים" value="' +
          esc(data.query || '') + '">' +
        '<select class="adm-select" id="adm-filter-status">' +
          '<option value="">כל המצבים</option>' +
          Object.keys(STATUS_LABEL).map(function (key) {
            return '<option value="' + key + '"' +
              (data.status === key ? ' selected' : '') + '>' +
              esc(STATUS_LABEL[key]) + '</option>';
          }).join('') +
        '</select>' +
        '<button class="adm-btn" id="adm-refresh">רענון</button>' +
      '</div>';

    if (!list) {
      html += '<p class="adm-empty">טוען…</p></div>';
      node.innerHTML = html;
      return;
    }
    if (!list.companies.length) {
      html += '<p class="adm-empty">אין לקוחות שמתאימים לחיפוש.</p></div>';
      node.innerHTML = html;
      return;
    }

    html += '<p class="adm-card-sub">' + list.shown + ' מתוך ' + list.total + '</p>' +
      '<div class="adm-scroll"><table class="adm-table"><thead><tr>' +
      '<th>עסק</th><th>בעלים</th><th>חבילה</th><th>מצב</th>' +
      '<th class="num">משתמשים</th><th>בתוקף עד</th>' +
      '<th class="num">שילם עד היום</th><th>נפתח</th><th></th>' +
      '</tr></thead><tbody>';

    list.companies.forEach(function (row) {
      var left = daysLeft(row.validUntil);
      html += '<tr class="adm-row-link" data-company="' + esc(row.id) + '">' +
        '<td class="wide">' + esc(row.name) +
          (row.openTickets ? ' <span class="adm-flag">' + row.openTickets +
            ' קריאות</span>' : '') + '</td>' +
        '<td class="wide">' + esc(row.ownerEmail || '—') + '</td>' +
        '<td>' + esc(PLAN_LABEL[row.plan] || row.plan) + '</td>' +
        '<td>' + statusPill(row.status) +
          (row.cancelAtPeriodEnd ? ' <span class="adm-flag">מבטל</span>' : '') +
          (!row.hasCard && row.status === 'trial'
            ? ' <span class="adm-flag">אין כרטיס</span>' : '') + '</td>' +
        '<td class="num">' + row.users + '</td>' +
        '<td>' + esc(date(row.validUntil)) +
          (left !== null && left >= 0 && left <= 7
            ? ' <span class="adm-flag">' + left + ' ימים</span>' : '') + '</td>' +
        '<td class="num">' + esc(money(row.paidGross)) + '</td>' +
        '<td>' + esc(date(row.createdAt)) + '</td>' +
        '<td><button class="adm-btn is-small" data-open="' + esc(row.id) + '">פתיחה</button></td>' +
        '</tr>';
    });

    node.innerHTML = html + '</tbody></table></div></div>' +
      '<div id="adm-company-detail"></div>';
  }

  function renderCompanyDetail(view) {
    var node = document.getElementById('adm-company-detail');
    if (!node) return;
    var c = view.company;
    var left = daysLeft(c.validUntil);

    var html = '<div class="adm-card"><h2>' + esc(c.name) + '</h2>' +
      '<p class="adm-card-sub">' + statusPill(c.status) + ' · ' +
      esc(PLAN_LABEL[c.plan] || c.plan) + ' · נפתח ' + esc(date(c.createdAt)) + '</p>';

    html += '<div class="adm-tiles">' +
      tile('בתוקף עד', esc(date(c.validUntil)),
        left === null ? '' : (left >= 0 ? left + ' ימים נותרו' : Math.abs(left) + ' ימים עברו')) +
      tile('שילם עד היום', money(view.payments.gross),
        view.payments.count + ' חיובים · נטו ' + money(view.payments.net)) +
      tile('אמצעי תשלום', c.hasCard ? 'יש' : 'אין',
        c.billingProvider || 'לא חובר') +
      tile('שימוש', String(view.usage.weeks) + ' שבועות',
        view.usage.published + ' פורסמו · אחרון ' + date(view.usage.lastWeekAt)) +
    '</div>';

    html += '<div class="adm-controls">' +
      '<button class="adm-btn is-primary" data-act="extend-trial" data-id="' + esc(c.id) +
        '">מתן תקופה ללא תשלום</button>' +
      '<button class="adm-btn" data-act="set-plan" data-id="' + esc(c.id) +
        '">שינוי חבילה</button>' +
      '<button class="adm-btn" data-act="set-status" data-id="' + esc(c.id) +
        '">שינוי מצב מנוי</button>' +
      '<button class="adm-btn" data-act="set-cancel" data-id="' + esc(c.id) + '">' +
        (c.cancelAtPeriodEnd ? 'ביטול הסימון "יסתיים"' : 'סימון "יסתיים בסוף התקופה"') +
      '</button>' +
    '</div>';

    html += '<h2 style="margin-top:var(--s5)">משתמשים</h2>' +
      '<div class="adm-scroll"><table class="adm-table"><thead><tr>' +
      '<th>שם</th><th>מייל</th><th>תפקיד</th><th>מצב</th><th>הצטרף</th>' +
      '</tr></thead><tbody>';
    view.users.forEach(function (user) {
      html += '<tr><td>' + esc(user.name || '—') + '</td>' +
        '<td class="wide">' + esc(user.email) + '</td>' +
        '<td>' + esc({ owner: 'בעלים', manager: 'מנהל', employee: 'עובד' }[user.role] ||
          user.role) + '</td>' +
        '<td>' + (user.active ? 'פעיל' : '<span class="adm-flag">מושבת</span>') + '</td>' +
        '<td>' + esc(user.joined_at ? date(user.joined_at) : 'טרם') + '</td></tr>';
    });
    html += '</tbody></table></div>';

    html += '<h2 style="margin-top:var(--s5)">היסטוריית חיוב</h2>';
    if (!view.events.length) {
      html += '<p class="adm-empty">עוד לא היה חיוב.</p>';
    } else {
      html += '<div class="adm-scroll"><table class="adm-table"><thead><tr>' +
        '<th>תאריך</th><th>סוג</th><th>תוצאה</th><th class="num">סכום</th><th>הערה</th>' +
        '</tr></thead><tbody>';
      view.events.forEach(function (event) {
        var outcome = event.outcome === 'charged' ? 'עבר'
          : event.outcome === 'declined' ? 'נדחה'
            : event.outcome === 'uncertain' ? 'לא ידוע' : (event.outcome || '—');
        html += '<tr><td>' + esc(date(event.at)) + '</td>' +
          '<td>' + esc(event.type) + '</td>' +
          '<td>' + (event.outcome === 'charged'
            ? '<span class="adm-pill is-active">עבר</span>'
            : event.outcome === 'declined'
              ? '<span class="adm-pill is-past_due">נדחה</span>'
              : esc(outcome)) + '</td>' +
          '<td class="num">' + (event.amount ? esc(moneyExact(event.amount)) : '—') + '</td>' +
          '<td class="wide">' + esc(event.reason || '') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    if (view.tickets.length) {
      html += '<h2 style="margin-top:var(--s5)">קריאות שירות</h2>' +
        '<div class="adm-scroll"><table class="adm-table"><thead><tr>' +
        '<th>תאריך</th><th>נושא</th><th>מצב</th></tr></thead><tbody>';
      view.tickets.forEach(function (ticket) {
        html += '<tr><td>' + esc(date(ticket.created_at)) + '</td>' +
          '<td class="wide">' + esc(ticket.subject) + '</td>' +
          '<td>' + esc(TICKET_STATUS[ticket.status] || ticket.status) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    node.innerHTML = html + '</div>';
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ===== קריאות שירות ===== */

  function renderTickets() {
    var node = document.getElementById('panel-tickets');
    var list = data.tickets;
    if (!list) { node.innerHTML = '<p class="adm-empty">טוען…</p>'; return; }

    var html = '<div class="adm-card"><h2>תור הקריאות</h2>';
    if (!list.tickets.length) {
      node.innerHTML = html + '<p class="adm-empty">אין קריאות פתוחות.</p></div>';
      return;
    }
    html += '<div class="adm-scroll"><table class="adm-table"><thead><tr>' +
      '<th>תאריך</th><th>לקוח</th><th>סוג</th><th>נושא</th><th>מצב</th><th></th>' +
      '</tr></thead><tbody>';
    list.tickets.forEach(function (ticket) {
      html += '<tr>' +
        '<td>' + esc(date(ticket.created_at)) + '</td>' +
        '<td class="wide">' + esc(ticket.companyName || ticket.company_id) + '</td>' +
        '<td>' + esc({ bug: 'תקלה', feature: 'בקשה', question: 'שאלה' }[ticket.kind] ||
          ticket.kind) + '</td>' +
        '<td class="wide">' + esc(ticket.subject) + '</td>' +
        '<td>' + esc(TICKET_STATUS[ticket.status] || ticket.status) + '</td>' +
        '<td><button class="adm-btn is-small" data-ticket="' + esc(ticket.id) +
          '">מענה</button></td>' +
        '</tr>' +
        '<tr><td colspan="6" class="wide" style="color:var(--muted)">' +
          esc(ticket.body) +
          (ticket.reply ? '<br><strong>המענה שלנו:</strong> ' + esc(ticket.reply) : '') +
        '</td></tr>';
    });
    node.innerHTML = html + '</tbody></table></div></div>';
  }

  /* ===== חלון פעולה ===== */

  var pending = null;

  var ACTION_FORMS = {
    'extend-trial': {
      title: 'מתן תקופה ללא תשלום',
      fields: '<label class="adm-field"><span>כמה ימים</span>' +
        '<input class="adm-input" id="adm-f-days" type="number" min="1" max="365" value="14">' +
        '</label>'
    },
    'set-plan': {
      title: 'שינוי חבילה',
      fields: '<label class="adm-field"><span>חבילה</span>' +
        '<select class="adm-select" id="adm-f-plan">' +
        '<option value="starter">קטן — 199 ₪</option>' +
        '<option value="growth">בינוני — 399 ₪</option>' +
        '<option value="business">גדול — 599 ₪</option>' +
        '</select></label>'
    },
    'set-status': {
      title: 'שינוי מצב מנוי',
      fields: '<label class="adm-field"><span>מצב</span>' +
        '<select class="adm-select" id="adm-f-status">' +
        Object.keys(STATUS_LABEL).map(function (key) {
          return '<option value="' + key + '">' + STATUS_LABEL[key] + '</option>';
        }).join('') +
        '</select></label>'
    },
    'set-cancel': { title: 'סימון סיום בתום התקופה', fields: '' }
  };

  function openAction(action, id, extra) {
    var form = ACTION_FORMS[action];
    if (!form) return;
    pending = { action: action, id: id, extra: extra || {} };
    document.getElementById('adm-modal-title').textContent = form.title;
    document.getElementById('adm-modal-fields').innerHTML = form.fields;
    document.getElementById('adm-modal-reason').value = '';
    document.getElementById('adm-modal-error').hidden = true;
    document.getElementById('adm-modal').hidden = false;
    var first = document.querySelector('#adm-modal-fields input, #adm-modal-fields select');
    (first || document.getElementById('adm-modal-reason')).focus();
  }

  function closeAction() {
    document.getElementById('adm-modal').hidden = true;
    pending = null;
  }

  function submitAction() {
    if (!pending) return;
    var payload = {
      action: pending.action, id: pending.id,
      reason: document.getElementById('adm-modal-reason').value
    };
    var days = document.getElementById('adm-f-days');
    var plan = document.getElementById('adm-f-plan');
    var status = document.getElementById('adm-f-status');
    if (days) payload.days = Number(days.value);
    if (plan) payload.plan = plan.value;
    if (status) payload.status = status.value;
    if (pending.action === 'set-cancel') payload.cancel = !pending.extra.cancelNow;

    var button = document.getElementById('adm-modal-ok');
    button.disabled = true;
    api('action', payload).then(function () {
      closeAction();
      return Promise.all([loadOverview(), loadCompanies(), openCompany(payload.id)]);
    }).catch(function (error) {
      var box = document.getElementById('adm-modal-error');
      box.textContent = error.message;
      box.hidden = false;
    }).then(function () { button.disabled = false; });
  }

  /* ===== טעינה ===== */

  function loadOverview() {
    return api('overview').then(function (body) {
      data.overview = body;
      if (current === 'overview') renderOverview();
      if (current === 'money') renderMoney();
    });
  }

  function loadCompanies() {
    return api('companies', { q: data.query || '', status: data.status || '' })
      .then(function (body) {
        data.companies = body;
        if (current === 'companies') renderCompanies();
      });
  }

  function loadTickets() {
    return api('tickets', { action: 'list' }).then(function (body) {
      data.tickets = body;
      if (current === 'tickets') renderTickets();
    });
  }

  function openCompany(id) {
    return api('company', { id: id }).then(function (body) {
      data.detail = body;
      if (current === 'companies') renderCompanyDetail(body);
    });
  }

  function show(panel) {
    current = panel;
    Array.prototype.forEach.call(document.querySelectorAll('.adm-tab'), function (tab) {
      var on = tab.dataset.panel === panel;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      document.getElementById('panel-' + tab.dataset.panel).hidden = !on;
    });
    if (panel === 'overview') renderOverview();
    if (panel === 'money') renderMoney();
    if (panel === 'companies') { renderCompanies(); if (!data.companies) loadCompanies(); }
    if (panel === 'tickets') { renderTickets(); if (!data.tickets) loadTickets(); }
  }

  function start() {
    document.getElementById('adm-signin').hidden = true;
    document.getElementById('adm-app').hidden = false;
    document.getElementById('adm-who').textContent =
      (session.user && session.user.email) || '';
    show('overview');
    loadOverview().catch(function (error) {
      document.getElementById('panel-overview').innerHTML =
        '<p class="adm-error">' + esc(error.message) + '</p>';
    });
  }

  /* ===== אירועים ===== */

  document.getElementById('adm-signin-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var box = document.getElementById('adm-signin-error');
    box.hidden = true;
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      box.textContent = 'החיבור לשרת אינו מוגדר (config.js).';
      box.hidden = false;
      return;
    }
    var form = event.target;
    signIn(form.email.value, form.password.value).then(function (body) {
      session = body;
      try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(body)); } catch (err) { /* לא קריטי */ }
      start();
    }).catch(function (error) {
      box.textContent = error.message;
      box.hidden = false;
    });
  });

  document.addEventListener('click', function (event) {
    var tab = event.target.closest('.adm-tab');
    if (tab) { show(tab.dataset.panel); return; }

    var act = event.target.closest('[data-act]');
    if (act) {
      var isCancel = act.dataset.act === 'set-cancel';
      openAction(act.dataset.act, act.dataset.id,
        { cancelNow: isCancel && /ביטול/.test(act.textContent) });
      return;
    }

    if (event.target.id === 'adm-modal-ok') { submitAction(); return; }
    if (event.target.id === 'adm-modal-cancel') { closeAction(); return; }
    if (event.target.id === 'adm-refresh') { loadCompanies(); return; }

    var open = event.target.closest('[data-open]');
    if (open) { openCompany(open.dataset.open); return; }

    var row = event.target.closest('[data-company]');
    if (row) {
      if (current !== 'companies') { show('companies'); }
      openCompany(row.dataset.company);
      return;
    }

    var ticket = event.target.closest('[data-ticket]');
    if (ticket) {
      var reply = window.prompt('המענה ללקוח:');
      if (reply === null) return;
      api('tickets', { action: 'reply', id: ticket.dataset.ticket, reply: reply })
        .then(loadTickets)
        .catch(function (error) { window.alert(error.message); });
    }
  });

  var searchTimer = null;
  document.addEventListener('input', function (event) {
    if (event.target.id !== 'adm-search') return;
    data.query = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadCompanies, 300);
  });

  document.addEventListener('change', function (event) {
    if (event.target.id !== 'adm-filter-status') return;
    data.status = event.target.value;
    loadCompanies();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !document.getElementById('adm-modal').hidden) closeAction();
  });

  /* חיבור קיים מרענון הדף. sessionStorage ולא localStorage:
     סגירת הלשונית מנתקת, וזה נכון למסך שרואה הכל. */
  try {
    var saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) { session = JSON.parse(saved); start(); }
  } catch (err) { /* נכנסים רגיל */ }

  window.__admin = { api: api, show: show, data: data };
})();
