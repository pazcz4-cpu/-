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
  var data = { overview: null, companies: null, tickets: null, agents: null, demo: null,
              report: null, reportMonth: '', agentCustomers: null, leads: null, leadStatus: '',
              marketing: null, marketingWeeks: 12 };
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
  var SOURCE_LABEL = {
    '': 'כל המקורות', direct: 'האתר', agent: 'סוכנים',
    free: 'פיילוט ללא תשלום', demo: 'הדגמה'
  };
  var PLAN_LABEL = { starter: 'קטן', growth: 'בינוני', business: 'גדול', enterprise: 'רשתות' };

  function statusPill(status) {
    return '<span class="adm-pill is-' + esc(status) + '">' +
      esc(STATUS_LABEL[status] || status) + '</span>';
  }

  /* ===== שרת ===== */

  /* נקודת קצה אחת לכל הפעולות; op קובע איזו. ראו api/admin/index.js. */
  function api(op, payload) {
    return fetch('/api/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (session && session.access_token)
      },
      body: JSON.stringify(Object.assign({ op: op }, payload || {}))
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

  /* יציאה. האסימון מבוטל אצל Supabase כדי שהעתק שנשמר בטעות
     במקום אחר יפסיק לעבוד, וגם אם הביטול נכשל – הדף נטען מחדש
     בלי אסימון, ולכן המסך הזה ריק. */
  function signOut() {
    var token = session && session.access_token;
    var done = function () {
      session = null;
      try { sessionStorage.removeItem(TOKEN_KEY); } catch (err) { /* ננוקה בטעינה */ }
      /* טעינה מחדש ולא הסתרה: כאן יושבים נתונים של כל הלקוחות,
         ואסור שיישארו ב-DOM או בזיכרון אחרי שיצאו. */
      window.location.reload();
    };
    if (!token || !config.supabaseUrl || !config.supabaseAnonKey) { done(); return; }
    fetch(config.supabaseUrl.replace(/\/+$/, '') + '/auth/v1/logout', {
      method: 'POST',
      headers: { apikey: config.supabaseAnonKey, Authorization: 'Bearer ' + token }
    }).then(done, done);
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
    /* מאיפה הלקוחות הגיעו, ומי מהם לא משלם. חשבון הדגמה אינו נספר. */
    html += tile('מקור הלקוחות',
      (counts.bySource ? counts.bySource.direct : 0) + ' אתר · ' +
      (counts.bySource ? counts.bySource.agent : 0) + ' סוכנים',
      counts.free ? counts.free + ' בפיילוט ללא תשלום' : 'אין פיילוטים ללא תשלום');
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
      /* חבילה שאין לה מחירון: "₪0" בעמודה הזו נקרא כמו חבילה
         חינמית, וגם נטו ומע"מ שלה הם אפס חסר משמעות. */
      var cells = plan.quote
        ? '<td class="num" colspan="3">לפי הצעת מחיר</td>'
        : '<td class="num">' + esc(moneyExact(plan.priceMonthly)) + '</td>' +
          '<td class="num">' + esc(moneyExact(plan.net)) + '</td>' +
          '<td class="num">' + esc(moneyExact(plan.vat)) + '</td>';
      html += '<tr><td>' + esc(PLAN_LABEL[plan.id] || plan.id) + '</td>' + cells +
        '<td class="num">' + (view.counts.byPlan[plan.id] || 0) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';

    node.innerHTML = html;
  }

  /* ===== לקוחות ===== */

  /* מקור הלקוח במילה אחת: האתר, שם הסוכן, או סימון מיוחד */
  function sourceCell(row) {
    var html = row.isDemo ? '<span class="adm-flag">הדגמה</span>'
      : row.source === 'agent'
        ? 'סוכן' + (row.agentName ? ': ' + esc(row.agentName) : '')
        : 'האתר';
    if (row.freeAccess) html += ' <span class="adm-flag">ללא תשלום</span>';
    return html;
  }

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
        '<select class="adm-select" id="adm-filter-source">' +
          Object.keys(SOURCE_LABEL).map(function (key) {
            return '<option value="' + key + '"' +
              ((data.source || '') === key ? ' selected' : '') + '>' +
              esc(SOURCE_LABEL[key]) + '</option>';
          }).join('') +
        '</select>' +
        '<button class="adm-btn" id="adm-refresh">רענון</button>' +
        '<button class="adm-btn" id="adm-export-companies">ייצוא ל-Excel</button>' +
        '<button class="adm-btn is-primary" data-act="create-customer" data-id="new">הקמת לקוח ללא כרטיס</button>' +
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
      '<th>עסק</th><th>בעלים</th><th>מקור</th><th>חבילה</th><th>מצב</th>' +
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
        '<td>' + sourceCell(row) + '</td>' +
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

  /* מאיפה בא המחיר החודשי שמוצג מעליו.

     בתעריף לעובד המספר הגדול משתנה מחודש לחודש, ובלי השורה
     הזו אי אפשר לדעת למה: 480₪ הוא 12₪ כפול ארבעים, ומי
     שרואה רק את 480 חושב שמישהו הזין אותו. */
  function priceNote(c) {
    if (c.customPricePerEmployee) {
      var rate = money(c.customPricePerEmployee) + ' לעובד';
      if (c.pricedEmployees == null) {
        return 'מחיר מוסכם · ' + rate + ' · מספר העובדים לא נמדד';
      }
      var note = 'מחיר מוסכם · ' + rate + ' × ' + c.pricedEmployees + ' (שיא התקופה)';
      /* הפער בין השיא לנוכחי הוא כל הסיפור של מי שכיבה עובדים
         לפני החיוב. הוא כבר לא עולה לנו כסף -- גובים לפי השיא
         -- אבל כדאי לדעת מי ניסה. */
      if (c.currentEmployees != null && c.currentEmployees !== c.pricedEmployees) {
        note += ' · כעת ' + c.currentEmployees;
      }
      return note;
    }
    if (c.customPrice) {
      return 'מחיר מוסכם' + (c.listPrice ? ' · מחירון ' + money(c.listPrice) : '');
    }
    return c.byQuote ? 'חבילת רשתות — לפי הצעת מחיר' : 'לפי המחירון';
  }

  /* כמה חיובים הלקוח כבר שילם, ומתי הסוכן מגיע לעמלה עליו */
  function agentNote(c) {
    if (c.source !== 'agent' || !c.agent) return 'נרשם בעצמו דרך האתר';
    var a = c.agent;
    if (c.freeAccess) return 'פיילוט ללא תשלום — אין עמלה';
    var note = a.paidCharges + ' מתוך ' + a.qualifyCharges + ' חיובים · עמלה ' + money(a.commissionAmount);
    if (a.commission) {
      note += a.commission.status === 'paid' ? ' · שולמה' : ' · ממתינה לתשלום';
    } else if (a.qualifiedAt) {
      note += ' · הגיע ליעד';
    }
    return note;
  }

  /* תוספת התראות הוואטסאפ. שורה נפרדת ולא חלק מהמחיר, כי
     בחשבונית היא סעיף נפרד — וכשלקוח שואל למה החשבון גדל,
     התשובה צריכה להיות על המסך ולא בחישוב בראש. */
  function addonNote(c) {
    var signed = c.waDeclaration
      ? ' · הצהרה: ' + c.waDeclaration.name + ', ' + date(c.waDeclaration.at)
      : ' · ללא הצהרה חתומה';
    if (!c.waEmployeeAddon) return 'תוספת וואטסאפ לעובדים — כבויה' + signed;
    return 'תוספת וואטסאפ לעובדים · ' + money(c.waAddonPrice) + ' × ' +
      (c.pricedEmployees == null ? '?' : c.pricedEmployees) +
      ' = ' + money(c.waAddonMonthly) + ' לחודש' + signed;
  }

  function renderCompanyDetail(view) {
    var node = document.getElementById('adm-company-detail');
    if (!node) return;
    var c = view.company;
    var left = daysLeft(c.validUntil);

    var html = '<div class="adm-card"><h2>' + esc(c.name) + '</h2>' +
      '<p class="adm-card-sub">' + statusPill(c.status) + ' · ' +
      esc(PLAN_LABEL[c.plan] || c.plan) + ' · נפתח ' + esc(date(c.createdAt)) + '</p>';

    /* דרך ליצור קשר. השורה הזו היא כל הסיבה שהטלפון נדרש
       בהרשמה: כשחיוב נכשל או כשלקוח פיילוט נתקע, זה המקום שבו
       מחפשים איך להגיע אליו — ולא בין המיילים. */
    html += '<p class="adm-card-sub">' +
      (c.phone
        ? 'טלפון: <a href="tel:' + esc(c.phone) + '" dir="ltr">' + esc(c.phone) + '</a>'
        : 'טלפון: לא הוזן') +
      (c.taxId ? ' · ח.פ. ' + esc(c.taxId) : '') +
      '</p>';

    html += '<div class="adm-tiles">' +
      tile('בתוקף עד', esc(date(c.validUntil)),
        left === null ? '' : (left >= 0 ? left + ' ימים נותרו' : Math.abs(left) + ' ימים עברו')) +
      tile('שילם עד היום', money(view.payments.gross),
        view.payments.count + ' חיובים · נטו ' + money(view.payments.net)) +
      tile('מחיר חודשי',
        c.planPrice ? money(c.planPrice) : 'טרם נקבע',
        priceNote(c)) +
      tile('תוספת וואטסאפ', c.waEmployeeAddon ? money(c.waAddonMonthly) : 'כבויה',
        addonNote(c)) +
      tile('אמצעי תשלום', c.hasCard ? 'יש' : 'אין',
        c.billingProvider || 'לא חובר') +
      tile('תשלום', c.isDemo ? 'חשבון הדגמה'
        : c.freeAccess ? 'ללא תשלום' : 'רגיל',
        c.freeAccess
          ? (c.freeUntil ? 'פיילוט עד ' + date(c.freeUntil) : 'פיילוט ללא הגבלת זמן')
          : (c.isDemo ? 'לא נספר בלוח ובעמלות' : 'לפי המחיר החודשי')) +
      tile('מקור הגעה', c.source === 'agent'
        ? (c.agent ? esc(c.agent.name) : 'סוכן') : 'האתר',
        agentNote(c), c.source === 'agent') +
      tile('שימוש', String(view.usage.weeks) + ' שבועות',
        view.usage.published + ' פורסמו · אחרון ' + date(view.usage.lastWeekAt)) +
    '</div>';

    html += '<div class="adm-controls">' +
      '<button class="adm-btn is-primary" data-act="support-access" data-id="' + esc(c.id) +
        '">כניסה למערכת הלקוח</button>' +
      '<button class="adm-btn" data-act="extend-trial" data-id="' + esc(c.id) +
        '">מתן תקופה ללא תשלום</button>' +
      '<button class="adm-btn" data-act="set-plan" data-id="' + esc(c.id) +
        '">שינוי חבילה</button>' +
      '<button class="adm-btn" data-act="set-price" data-id="' + esc(c.id) +
        '">מחיר מוסכם</button>' +
      '<button class="adm-btn" data-act="set-free" data-id="' + esc(c.id) + '">' +
        (c.freeAccess ? 'סיום פיילוט ללא תשלום' : 'פיילוט ללא תשלום') + '</button>' +
      '<button class="adm-btn" data-act="set-agent" data-id="' + esc(c.id) +
        '">שיוך לסוכן</button>' +
      '<button class="adm-btn" data-act="card-link" data-id="' + esc(c.id) +
        '">החלפת כרטיס אשראי</button>' +
      '<button class="adm-btn" data-act="set-wa-addon" data-id="' + esc(c.id) + '">' +
        (c.waEmployeeAddon ? 'כיבוי תוספת וואטסאפ' : 'הפעלת תוספת וואטסאפ') + '</button>' +
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
          '">מענה</button> <button class="adm-btn is-small" data-act="support-access" data-id="' +
          esc(ticket.company_id) + '" data-reason="' + esc('טיפול בקריאה: ' + (ticket.subject || '')) +
          '">כניסה למערכת הלקוח</button></td>' +
        '</tr>' +
        '<tr><td colspan="6" class="wide" style="color:var(--muted)">' +
          esc(ticket.body) +
          (ticket.reply ? '<br><strong>המענה שלנו:</strong> ' + esc(ticket.reply) : '') +
        '</td></tr>';
    });
    node.innerHTML = html + '</tbody></table></div></div>';
  }

  /* ===== קופונים =====

     שלושה סוגים, ואותו טופס לשלושתם: מה שמשתנה ביניהם הוא
     השדה האחד -- ימים, אחוזים או שקלים -- ואת השם שלו קובע
     הסוג שנבחר. טופס נפרד לכל סוג היה אותו טופס שלוש פעמים,
     ושלוש הזדמנויות שהם יתפצלו. */
  var COUPON_KIND = {
    days:    { label: 'הארכת תקופה', unit: 'ימים',   suffix: ' ימים' },
    percent: { label: 'הנחה באחוזים', unit: 'אחוזים', suffix: '%' },
    amount:  { label: 'הנחה בשקלים', unit: 'שקלים',  suffix: ' ₪' }
  };

  function couponValue(coupon) {
    var kind = COUPON_KIND[coupon.kind];
    return coupon.value + (kind ? kind.suffix : '');
  }

  /* מה מונע מהקופון לעבוד עכשיו. ריק = הוא פעיל. */
  function couponBlocked(coupon) {
    if (!coupon.active) return 'כבוי';
    if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) return 'פג';
    if (coupon.max_uses && coupon.uses >= coupon.max_uses) return 'נוצל';
    return '';
  }

  function renderCoupons() {
    var node = document.getElementById('panel-coupons');
    var list = data.coupons;
    if (!list) { node.innerHTML = '<p class="adm-empty">טוען…</p>'; return; }

    var html = '<div class="adm-card"><h2>קופון חדש</h2>' +
      '<p class="adm-card-sub">הקוד הוא מה שהלקוח מקליד. אותיות וספרות בלבד — ' +
      'רווחים ומקפים יורדים אוטומטית.</p>' +
      '<form id="adm-coupon-form" class="adm-coupon-form">' +
      '<label class="adm-field"><span>קוד</span>' +
      '<input class="adm-input" id="cp-code" maxlength="24" required ' +
      'placeholder="EXTRAMONTH" autocomplete="off" spellcheck="false"></label>' +
      '<label class="adm-field"><span>סוג</span>' +
      '<select class="adm-select" id="cp-kind">' +
      Object.keys(COUPON_KIND).map(function (kind) {
        return '<option value="' + kind + '">' + esc(COUPON_KIND[kind].label) + '</option>';
      }).join('') +
      '</select></label>' +
      '<label class="adm-field"><span id="cp-value-label">ימים</span>' +
      '<input class="adm-input" id="cp-value" type="number" min="1" value="30" required></label>' +
      '<label class="adm-field"><span>תוקף עד (לא חובה)</span>' +
      '<input class="adm-input" id="cp-until" type="date"></label>' +
      '<label class="adm-field"><span>מכסת מימושים (לא חובה)</span>' +
      '<input class="adm-input" id="cp-max" type="number" min="1" ' +
      'placeholder="ללא הגבלה"></label>' +
      '<label class="adm-field adm-coupon-note"><span>למה זה (לעצמך)</span>' +
      '<input class="adm-input" id="cp-note" maxlength="300" ' +
      'placeholder="קמפיין נטישת הרשמה, ספטמבר"></label>' +
      '<button class="adm-btn is-primary" type="submit">יצירה</button>' +
      '</form>' +
      '<p id="adm-coupon-msg" class="adm-error" hidden></p></div>';

    html += '<div class="adm-card"><h2>הקופונים</h2>';
    if (!list.coupons.length) {
      html += '<p class="adm-empty">עוד לא נוצר קופון.</p>';
    } else {
      html += '<div class="adm-scroll"><table class="adm-table"><thead><tr>' +
        '<th>קוד</th><th>מה הוא נותן</th><th>מומש</th><th>תוקף</th>' +
        '<th>מצב</th><th>למה</th><th></th></tr></thead><tbody>';
      list.coupons.forEach(function (coupon) {
        var blocked = couponBlocked(coupon);
        html += '<tr>' +
          '<td><strong>' + esc(coupon.code) + '</strong></td>' +
          '<td>' + esc(couponValue(coupon)) + '</td>' +
          '<td>' + coupon.uses + (coupon.max_uses ? ' / ' + coupon.max_uses : '') + '</td>' +
          '<td>' + (coupon.valid_until ? esc(date(coupon.valid_until)) : '—') + '</td>' +
          '<td>' + (blocked
            ? '<span class="adm-pill">' + esc(blocked) + '</span>'
            : '<span class="adm-pill is-active">פעיל</span>') + '</td>' +
          '<td class="wide" style="color:var(--muted)">' + esc(coupon.note || '') + '</td>' +
          '<td><button class="adm-btn is-small" data-coupon-toggle="' + esc(coupon.code) +
            '" data-active="' + (coupon.active ? '1' : '0') + '">' +
            (coupon.active ? 'כיבוי' : 'הדלקה') + '</button></td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    /* מי מימש. זו התשובה ל"הקמפיין עבד?" בלי לפתוח עוד מסך. */
    html += '<div class="adm-card"><h2>מימושים אחרונים</h2>';
    if (!list.redemptions.length) {
      html += '<p class="adm-empty">עוד לא מומש קופון.</p>';
    } else {
      html += '<div class="adm-scroll"><table class="adm-table"><thead><tr>' +
        '<th>תאריך</th><th>לקוח</th><th>קוד</th><th>מה קיבל</th>' +
        '</tr></thead><tbody>';
      list.redemptions.forEach(function (row) {
        html += '<tr>' +
          '<td>' + esc(date(row.created_at)) + '</td>' +
          '<td class="wide"><a href="#" data-company="' + esc(row.company_id) + '">' +
            esc(row.companyName || row.company_id) + '</a></td>' +
          '<td>' + esc(row.code) + '</td>' +
          '<td>' + esc(couponValue(row)) + '</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
    }
    node.innerHTML = html + '</div>';
  }

  function loadCoupons() {
    return api('coupons', { action: 'list' }).then(function (body) {
      data.coupons = body;
      if (current === 'coupons') renderCoupons();
    });
  }

  /* ===== חלון פעולה ===== */

  var pending = null;

  /* רשימת החבילות, נגזרת מ-model.js ולא כתובה כאן שוב.

     עד כאן היא הייתה כתובה פעמיים, וזה בדיוק נשבר: גבול החבילה
     הגדולה עבר מ-99 ל-70, והמשרד האחורי המשיך להציע "31–99" —
     כלומר מי שמשנה חבילה ללקוח קרא מספר שאינו נכון יותר. */
  function planOptions() {
    var Model = window.ShiftModel;
    if (!Model) return '<option value="starter">קטן</option>';
    return Model.PLAN_ORDER.map(function (id) {
      var plan = Model.PLANS[id];
      var range = !plan.maxEmployees
        ? plan.minEmployees + '+'
        : (plan.minEmployees <= 1
          ? 'עד ' + plan.maxEmployees
          : plan.minEmployees + '–' + plan.maxEmployees);
      var price = plan.quote ? 'לפי הצעת מחיר' : plan.priceMonthly + ' ₪';
      return '<option value="' + id + '">' + plan.name + ' — ' +
        range + ' עובדים — ' + price + '</option>';
    }).join('');
  }

  var ACTION_FORMS = {
    'extend-trial': {
      title: 'מתן תקופה ללא תשלום',
      fields: '<label class="adm-field"><span>כמה ימים</span>' +
        '<input class="adm-input" id="adm-f-days" type="number" min="1" max="365" value="14">' +
        '</label>'
    },
    'set-wa-addon': {
      title: 'תוספת התראות וואטסאפ לעובדים',
      fields: '<label class="adm-field"><span>מצב</span>' +
        '<select class="adm-select" id="adm-f-on">' +
        '<option value="1">מופעלת</option>' +
        '<option value="0">כבויה</option>' +
        '</select></label>' +
        '<p class="adm-hint">התוספת מחויבת לפי אותו מספר עובדים כמו המנוי — ' +
        'השיא בתקופה — ומופיעה בחשבונית כסעיף נפרד. הלקוח יכול להדליק ולכבות ' +
        'אותה גם בעצמו במסך המנוי.</p>'
    },
    'set-plan': {
      title: 'שינוי חבילה',
      fields: '<label class="adm-field"><span>חבילה</span>' +
        '<select class="adm-select" id="adm-f-plan">' + planOptions() +
        '</select></label>' +
        '<p class="adm-hint">לחבילת הרשתות אין מחיר מחירון. אחרי המעבר ' +
        'צריך להזין את המחיר שסוכם ב"מחיר מוסכם", אחרת החיוב החודשי ידלג עליה.</p>'
    },
    /* המחיר שסוכם בפגישה. בלעדיו אי אפשר לחייב רשת בכלל, ולכן
       השדה נשאר גם לחבילות רגילות: לפעמים סוגרים מחיר אחר. */
    /* שתי צורות של מחיר מוסכם, ושתיהן זמינות בכל חבילה: לפעמים
       סוגרים תעריף לעובד גם עם עסק קטן, ורשת לא תמיד רוצה
       שהמחיר שלה יזוז כשנכנס עובד. */
    'set-price': {
      title: 'מחיר חודשי מוסכם',
      fields: '<label class="adm-field"><span>צורת התמחור</span>' +
        '<select class="adm-select" id="adm-f-mode">' +
        '<option value="flat">סכום קבוע לכל העסק</option>' +
        '<option value="per_employee">תעריף לעובד פעיל</option>' +
        '</select></label>' +
        '<label class="adm-field"><span id="adm-f-price-label">מחיר לחודש, כולל מע״מ</span>' +
        '<input class="adm-input" id="adm-f-price" type="number" min="1" step="1" ' +
        'placeholder="ריק = לפי המחירון"></label>' +
        '<p class="adm-hint" id="adm-f-price-hint">המחיר הזה גובר על מחיר החבילה ' +
        'וייגבה בחיוב הבא. השאירו ריק כדי לחזור למחירון. לשימוש ללא תשלום השתמשו ' +
        'ב"מתן תקופה ללא תשלום" ולא במחיר אפס.</p>'
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
    /* פיילוט: לקוח שמקבל את המערכת בלי תשלום. הוא נספר כלקוח, לא
       נכנס להכנסה החוזרת, ולא מזכה סוכן בעמלה. */
    'set-free': {
      title: 'פיילוט ללא תשלום',
      fields: '<label class="adm-field"><span>מצב</span>' +
        '<select class="adm-select" id="adm-f-on">' +
        '<option value="1">פיילוט ללא תשלום</option>' +
        '<option value="0">סיום הפיילוט</option>' +
        '</select></label>' +
        '<label class="adm-field"><span>עד תאריך (ריק = ללא הגבלה)</span>' +
        '<input class="adm-input" id="adm-f-until" type="date"></label>' +
        '<label class="adm-field"><span>בסיום: כמה ימים להמשיך בלי חיוב</span>' +
        '<input class="adm-input" id="adm-f-days" type="number" min="0" max="90" value="14"></label>' +
        '<p class="adm-hint">בפיילוט המנוי פעיל ואינו מחויב. אחרי הסיום הלקוח חוזר ' +
        'להיות לקוח רגיל עם מספר הימים שנקבע, ואז הוא נדרש לחבר כרטיס. ' +
        'מחיר שונה מהמחירון (לא חינם) קובעים ב"מחיר מוסכם".</p>'
    },
    /* הכרטיס אינו מוזן במשרד האחורי: נפתח עמוד תשלום מאובטח של
       הספק, והקישור נמסר ללקוח (במייל מכאן, או ידנית). */
    'card-link': {
      title: 'החלפת כרטיס אשראי ללקוח',
      fields: '<p class="adm-hint">נוצר קישור לעמוד תשלום מאובטח של חברת הסליקה, תקף יומיים. ' +
        'הלקוח מזין שם כרטיס חדש, והוא מחליף את הישן. לקוח חסום בגלל כרטיס שנדחה או פג ' +
        'חוזר לפעולה כשהכרטיס נשמר, והחיוב נגבה בריצת החיוב הבאה.</p>' +
        '<label class="adm-check"><input type="checkbox" id="adm-f-send" checked> ' +
        'שליחת הקישור במייל לבעלים של החשבון</label>' +
        '<div id="adm-card-result"></div>'
    },
    /* כניסת תמיכה: נפתחת לשונית חדשה במערכת של הלקוח, כבעלים שלו */
    'support-access': {
      title: 'כניסה למערכת הלקוח',
      fields: '<p class="adm-hint">תיפתח לשונית חדשה במערכת של הלקוח, כבעלים שלו ועם כל הנתונים. ' +
        'הלקוח לא מתנתק ולא מקבל הודעה. בראש המסך יופיע פס אדום, וסגירת הלשונית מסיימת את הכניסה. ' +
        'פעולות שתבצע שם נראות אצלו כשלו, והכניסה נרשמת ביומן.</p>' +
        '<div id="adm-support-result"></div>'
    },
    /* הקמת לקוח בפיילוט ללא תשלום, בלי כרטיס. רק מכאן: הרשמה מהאתר
       או מקישור של סוכן תמיד דורשת כרטיס כשהסליקה חיה. */
    'create-customer': {
      title: 'הקמת לקוח בפיילוט ללא תשלום',
      fields: '<p class="adm-hint">הלקוח נוצר פעיל וללא תשלום, ונכנס בלי להזין כרטיס. ' +
        'את הסיסמה תראה כאן אחרי היצירה (ואפשר לשלוח אותה במייל).</p>' +
        '<label class="adm-field"><span>שם העסק</span><input class="adm-input" id="adm-f-company" maxlength="120"></label>' +
        '<label class="adm-field"><span>שם הבעלים</span><input class="adm-input" id="adm-f-owner"></label>' +
        '<label class="adm-field"><span>מייל הבעלים (שם המשתמש)</span><input class="adm-input" id="adm-f-email" type="email" dir="ltr"></label>' +
        '<label class="adm-field"><span>טלפון</span><input class="adm-input" id="adm-f-phone" type="tel" dir="ltr"></label>' +
        '<label class="adm-field"><span>חבילה</span><select class="adm-select" id="adm-f-plan">' + '__PLANS__' + '</select></label>' +
        '<label class="adm-field"><span>הפיילוט עד תאריך (ריק = ללא הגבלה)</span><input class="adm-input" id="adm-f-until" type="date"></label>' +
        '<label class="adm-field"><span>הגיע מ</span><select class="adm-select" id="adm-f-agent"></select></label>' +
        '<label class="adm-check"><input type="checkbox" id="adm-f-send" checked> שליחת פרטי הכניסה במייל לבעלים</label>' +
        '<div id="adm-create-result"></div>'
    },
    'set-agent': {
      title: 'שיוך לסוכן מכירות',
      fields: '<label class="adm-field"><span>הלקוח הגיע מ</span>' +
        '<select class="adm-select" id="adm-f-agent"></select></label>' +
        '<p class="adm-hint">ההגעה דרך קישור של סוכן נרשמת לבד בהרשמה. כאן מתקנים ' +
        'או משייכים ידנית. עמלה שכבר שולמה אינה משתנה.</p>'
    },
    'set-cancel': { title: 'סימון סיום בתום התקופה', fields: '' }
  };

  function fillAgentChoice(id) {
    var select = document.getElementById('adm-f-agent');
    if (!select) return;
    var c = (data.detail && data.detail.company) || null;
    var current = c && c.id === id && c.agent ? c.agent.id : '';
    function paint(agents) {
      select.innerHTML = '<option value="">האתר (ללא סוכן)</option>' +
        agents.map(function (agent) {
          return '<option value="' + esc(agent.id) + '"' + (agent.id === current ? ' selected' : '') +
            '>' + esc(agent.name) + (agent.active ? '' : ' (לא פעיל)') + '</option>';
        }).join('');
    }
    if (data.agents) { paint(data.agents.agents); return; }
    paint([]);
    api('agents', { do: 'list' }).then(function (body) {
      data.agents = body;
      paint(body.agents);
    }).catch(function () { /* יישאר "האתר" */ });
  }

  /* המחיר הנוכחי של הלקוח שפתוח על המסך, בתוך טופס המחיר */
  function fillPrice(id) {
    var c = (data.detail && data.detail.company) || null;
    if (!c || c.id !== id) return;
    var mode = document.getElementById('adm-f-mode');
    var price = document.getElementById('adm-f-price');
    if (!mode || !price) return;
    if (c.customPricePerEmployee) {
      mode.value = 'per_employee';
      price.value = String(c.customPricePerEmployee);
    } else if (c.customPrice) {
      mode.value = 'flat';
      price.value = String(c.customPrice);
    }
    /* הכיתובים נגזרים מהבחירה, וקביעה בקוד אינה מפעילה change */
    mode.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function openAction(action, id, extra) {
    var form = ACTION_FORMS[action];
    if (!form) return;
    pending = { action: action, id: id, extra: extra || {} };
    document.getElementById('adm-modal-title').textContent = form.title;
    document.getElementById('adm-modal-fields').innerHTML = form.fields.replace('__PLANS__', planOptions());
    /* הטופס נפתח על מה שקיים היום. מי שבא לשנות תעריף לעובד
       ומוצא טופס ריק במצב "סכום קבוע" עלול לשמור סכום קבוע
       בלי לשים לב שהחליף צורת תמחור. */
    if (action === 'set-price') fillPrice(id);
    if (action === 'set-agent' || action === 'create-customer') fillAgentChoice(id);
    document.getElementById('adm-modal-reason').value = (extra && extra.reason) || '';
    document.getElementById('adm-modal-ok').hidden = false;
    document.getElementById('adm-modal-cancel').textContent = 'ביטול';
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
    var price = document.getElementById('adm-f-price');
    if (days) payload.days = Number(days.value);
    if (plan) payload.plan = plan.value;
    if (status) payload.status = status.value;
    /* ריק נשלח כריק ולא כאפס: אפס הוא מחיר, ריק הוא "בטל את
       המחיר המוסכם וחזור למחירון". */
    if (price) payload.price = price.value.trim() === '' ? null : Number(price.value);
    var mode = document.getElementById('adm-f-mode');
    if (mode) payload.mode = mode.value;
    /* בוליאני ולא מחרוזת: השרת בודק === true, ו-"0" הוא אמת. */
    var on = document.getElementById('adm-f-on');
    if (on) payload.on = on.value === '1';
    var until = document.getElementById('adm-f-until');
    if (until && until.value) payload.until = until.value;
    var agentChoice = document.getElementById('adm-f-agent');
    if (agentChoice) payload.agentId = agentChoice.value;
    if (pending.action === 'set-cancel') payload.cancel = !pending.extra.cancelNow;

    var button = document.getElementById('adm-modal-ok');
    button.disabled = true;

    if (pending.action === 'support-access') {
      /* החלון נפתח כאן, בתוך הלחיצה: דפדפן חוסם חלון שנפתח אחרי
         בקשת רשת. הכתובת נקבעת לו כשהשרת עונה. */
      var tab = window.open('about:blank', '_blank');
      api('support', { id: pending.id, reason: payload.reason }).then(function (result) {
        if (tab && !tab.closed) {
          tab.location.href = result.url;
          closeAction();
        } else {
          document.getElementById('adm-support-result').innerHTML =
            '<p class="adm-hint">הדפדפן חסם את פתיחת הלשונית. הקישור (תקף לשימוש אחד):</p>' +
            '<a class="adm-btn is-primary" id="adm-support-link" target="_blank" rel="noopener" href="' +
            esc(result.url) + '">פתיחת המערכת של ' + esc(result.company) + '</a>';
          button.hidden = true;
        }
      }).catch(function (error) {
        if (tab) tab.close();
        var box = document.getElementById('adm-modal-error');
        box.textContent = error.message;
        box.hidden = false;
      }).then(function () { button.disabled = false; });
      return;
    }

    if (pending.action === 'create-customer') {
      var sendMail = document.getElementById('adm-f-send');
      api('customer', {
        reason: payload.reason,
        companyName: document.getElementById('adm-f-company').value,
        ownerName: document.getElementById('adm-f-owner').value,
        email: document.getElementById('adm-f-email').value,
        phone: document.getElementById('adm-f-phone').value,
        plan: document.getElementById('adm-f-plan').value,
        until: document.getElementById('adm-f-until').value,
        agentId: document.getElementById('adm-f-agent').value,
        send: !!(sendMail && sendMail.checked)
      }).then(function (result) {
        document.getElementById('adm-create-result').innerHTML =
          '<p class="adm-hint">הלקוח נוצר. ' + (result.emailed ? 'פרטי הכניסה נשלחו במייל. '
            : result.emailError ? 'המייל לא נשלח (' + (result.emailError === 'not_configured'
              ? 'שליחת מייל לא מוגדרת' : 'השליחה נכשלה') + '). ' : '') +
          'שמור את הסיסמה עכשיו, היא לא תוצג שוב:</p>' +
          '<input class="adm-input" id="adm-card-url" readonly dir="ltr" value="' +
          esc(result.email + '  /  ' + result.password) + '">' +
          '<div class="adm-modal-actions"><button class="adm-btn" id="adm-card-copy" type="button">העתקה</button></div>';
        button.hidden = true;
        document.getElementById('adm-modal-cancel').textContent = 'סגירה';
        data.companies = null;
        data.agents = null;
        var leadId = pending && pending.extra && pending.extra.leadId;
        var linked = leadId
          ? api('leads', { action: 'update', id: leadId, companyId: result.companyId }).then(loadLeads, function () {})
          : Promise.resolve();
        return linked.then(function () {
          return Promise.all([loadOverview(), loadCompanies(), openCompany(result.companyId)]);
        });
      }).catch(function (error) {
        var box = document.getElementById('adm-modal-error');
        box.textContent = error.message;
        box.hidden = false;
      }).then(function () { button.disabled = false; });
      return;
    }

    if (pending.action === 'card-link') {
      var sendBox = document.getElementById('adm-f-send');
      api('card', { id: pending.id, reason: payload.reason, send: !!(sendBox && sendBox.checked) })
        .then(function (result) {
          var out = document.getElementById('adm-card-result');
          out.innerHTML = '<p class="adm-hint">' +
            (result.emailed ? 'נשלח במייל אל ' + esc(result.to) + '. '
              : result.emailError ? 'המייל לא נשלח (' + (result.emailError === 'not_configured'
                ? 'שליחת מייל לא מוגדרת' : 'השליחה נכשלה') + '). '
                : 'המייל לא נשלח. ') +
            'אפשר להעביר את הקישור ללקוח בעצמך:</p>' +
            '<input class="adm-input" id="adm-card-url" readonly dir="ltr" value="' + esc(result.url) + '">' +
            '<div class="adm-modal-actions"><button class="adm-btn" id="adm-card-copy" type="button">העתקת הקישור</button></div>';
          button.hidden = true;
          document.getElementById('adm-modal-cancel').textContent = 'סגירה';
        })
        .catch(function (error) {
          var box = document.getElementById('adm-modal-error');
          box.textContent = error.message;
          box.hidden = false;
        }).then(function () { button.disabled = false; });
      return;
    }

    api('action', payload).then(function () {
      closeAction();
      data.agents = null; data.report = null;
      return Promise.all([loadOverview(), loadCompanies(), openCompany(payload.id)]);
    }).catch(function (error) {
      var box = document.getElementById('adm-modal-error');
      box.textContent = error.message;
      box.hidden = false;
    }).then(function () { button.disabled = false; });
  }

  /* ===== ייצוא ל-Excel =====
     נבנה בדפדפן מהנתונים שכבר נטענו, עם אותו כותב xlsx שבו
     המערכת מייצאת דוחות ללקוחות. סכומים נשמרים כמספרים ולא כטקסט,
     כדי שאפשר יהיה לסכם אותם. */

  function sheetOf(name, widths, head, rows) {
    var S = window.ShiftXlsx.STYLE;
    return {
      name: name, cols: widths, freeze: { row: 1, col: 0 },
      rows: [{ cells: head.map(function (label) { return { v: label, s: S.HEADER }; }), height: 22 }]
        .concat(rows.map(function (row) {
          return row.map(function (value) { return { v: value == null ? '' : value, s: S.PLAIN }; });
        }))
    };
  }

  function downloadWorkbook(fileName, sheets) {
    if (!window.ShiftXlsx) { window.alert('רכיב הייצוא לא נטען. רענן את הדף.'); return; }
    var blob = new Blob([window.ShiftXlsx.build(sheets)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function exportCompanies() {
    var list = data.companies;
    if (!list || !list.companies.length) { window.alert('אין נתונים לייצוא.'); return; }
    downloadWorkbook('setshifts-customers-' + today() + '.xlsx', [sheetOf('לקוחות',
      [26, 28, 16, 16, 14, 16, 10, 14, 14, 14, 14, 16],
      ['עסק', 'בעלים', 'מקור', 'סוכן', 'חבילה', 'מצב', 'ללא תשלום', 'משתמשים',
        'בתוקף עד', 'שילם עד היום (ברוטו)', 'שילם עד היום (נטו)', 'נפתח'],
      list.companies.map(function (row) {
        return [row.name, row.ownerEmail || '',
          row.isDemo ? 'הדגמה' : (row.source === 'agent' ? 'סוכן' : 'האתר'),
          row.agentName || '', PLAN_LABEL[row.plan] || row.plan,
          STATUS_LABEL[row.status] || row.status, row.freeAccess ? 'כן' : '',
          row.users, date(row.validUntil), row.paidGross, row.paidNet, date(row.createdAt)];
      }))]);
  }

  function exportAgents() {
    var list = data.agents;
    var report = data.report;
    if (!list) { window.alert('הנתונים עוד נטענים.'); return; }
    var month = data.reportMonth || monthNow();
    var sheets = [sheetOf('סוכנים', [22, 18, 12, 12, 12, 10, 10, 12, 12, 14, 14, 26],
      ['סוכן', 'קוד', 'עמלה (₪)', 'חיובים עד זכאות', 'לקוחות', 'בפיילוט', 'משלמים',
        'הגיעו ליעד', 'עמלות שלא שולמו (₪)', 'שולם עד היום (₪)', 'פעיל', 'קישור'],
      list.agents.map(function (agent) {
        return [agent.name, agent.code, agent.commission, agent.qualifyCharges, agent.customers,
          agent.free, agent.paying, agent.qualified, agent.owed, agent.paidOut,
          agent.active ? 'כן' : 'לא', referralLink(agent.code)];
      }))];
    function lines(rows) {
      return rows.map(function (row) {
        return [row.company, row.agent, date(row.qualifiedAt), row.amount,
          row.status === 'paid' ? 'שולם' : 'ממתין', row.paidAt ? date(row.paidAt) : ''];
      });
    }
    var lineHead = ['לקוח', 'סוכן', 'הגיע ליעד', 'עמלה (₪)', 'מצב', 'שולם בתאריך'];
    if (report) {
      sheets.push(sheetOf('בונוסים ' + month, [26, 20, 14, 12, 10, 14], lineHead, lines(report.lines)));
      sheets.push(sheetOf('לא שולם מקודם', [26, 20, 14, 12, 10, 14], lineHead, lines(report.older)));
      sheets.push(sheetOf('יגיעו ליעד', [26, 20, 16, 14, 14],
        ['לקוח', 'סוכן', 'החיוב הבא', 'חיובים עד היום', 'עמלה צפויה (₪)'],
        report.upcoming.map(function (item) {
          return [item.company, item.agent, date(item.nextChargeAt), item.paidCharges, item.amount];
        })));
    }
    /* כל הלקוחות של כל הסוכנים בגיליון אחד: זה מה שמשווים מול
       מה שהסוכן טוען שהביא */
    Promise.all(list.agents.map(function (agent) {
      return api('agents', { do: 'customers', agentId: agent.id }).then(function (view) {
        return view.customers.map(function (c) {
          return [agent.name, c.name, STATUS_LABEL[c.status] || c.status, c.freeAccess ? 'כן' : '',
            date(c.createdAt), c.paidCharges, c.qualifiedAt ? date(c.qualifiedAt) : '',
            c.commission ? c.commission.amount : '',
            c.commission ? (c.commission.status === 'paid' ? 'שולם' : 'ממתין') : ''];
        });
      });
    })).then(function (groups) {
      var rows = [].concat.apply([], groups);
      sheets.push(sheetOf('לקוחות לפי סוכן', [20, 26, 14, 10, 14, 10, 14, 12, 10],
        ['סוכן', 'לקוח', 'מצב', 'פיילוט', 'נרשם', 'חיובים', 'הגיע ליעד', 'עמלה (₪)', 'מצב עמלה'], rows));
      downloadWorkbook('setshifts-agents-' + month + '.xlsx', sheets);
    }).catch(function (error) { window.alert(error.message); });
  }

  /* ===== סוכני מכירות ===== */

  function referralLink(code) {
    return window.location.origin + '/?ref=' + encodeURIComponent(code);
  }

  function monthNow() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  /* שדה עם שם גלוי. placeholder נעלם ברגע שמקלידים, ושדה ריק
     בלי שם הוא בדיוק מה שמבלבל: "3" ו-"0" אינם אומרים אם זו
     עמלה או מספר חיובים. */
  function field(id, label, input, hint) {
    return '<label class="adm-field" for="' + id + '"><span>' + esc(label) + '</span>' + input +
      (hint ? '<small class="adm-field-hint">' + esc(hint) + '</small>' : '') + '</label>';
  }

  function agentForm(agent) {
    var a = agent || {};
    return '<form id="adm-agent-form" class="adm-grid-form" data-id="' + esc(a.id || '') + '">' +
      field('ag-name', 'שם הסוכן',
        '<input class="adm-input" id="ag-name" maxlength="120" required value="' + esc(a.name || '') + '">') +
      field('ag-code', 'קוד בקישור',
        '<input class="adm-input" id="ag-code" maxlength="39" dir="ltr" ' + (a.id ? 'disabled ' : '') +
          'value="' + esc(a.code || '') + '">',
        a.id ? 'הקוד אינו משתנה אחרי שנוצר' : 'אנגלית קטנה וספרות. ריק = ייווצר אוטומטית') +
      field('ag-commission', 'עמלה ללקוח (₪)',
        '<input class="adm-input" id="ag-commission" type="number" min="0" step="1" required value="' +
          esc(a.commission == null ? '' : a.commission) + '">',
        'הסכום שהסוכן מקבל על כל לקוח שהגיע ליעד') +
      field('ag-qualify', 'חיובים עד זכאות',
        '<input class="adm-input" id="ag-qualify" type="number" min="1" max="24" step="1" value="' +
          esc(a.qualifyCharges || 3) + '">',
        'כמה חיובים מוצלחים הלקוח משלם עד שהעמלה מגיעה') +
      field('ag-email', 'מייל הסוכן',
        '<input class="adm-input" id="ag-email" type="email" dir="ltr" value="' + esc(a.email || '') + '">') +
      field('ag-phone', 'טלפון הסוכן',
        '<input class="adm-input" id="ag-phone" type="tel" dir="ltr" value="' + esc(a.phone || '') + '">') +
      field('ag-note', 'הערה (פנימית)',
        '<input class="adm-input" id="ag-note" maxlength="500" value="' + esc(a.note || '') + '">') +
      (a.id ? '<label class="adm-check"><input type="checkbox" id="ag-active"' + (a.active ? ' checked' : '') + '> סוכן פעיל</label>' : '') +
      '<div class="adm-form-actions"><button class="adm-btn is-primary" type="submit">' +
        (a.id ? 'שמירת סוכן' : 'הוספת סוכן') + '</button>' +
      (a.id ? '<button class="adm-btn" type="button" id="ag-cancel">ביטול</button>' : '') +
      '</div></form><p id="adm-agent-msg" class="adm-error" hidden></p>';
  }

  function renderAgents() {
    var node = document.getElementById('panel-agents');
    var list = data.agents;
    var html = '<div class="adm-card"><h2>סוכני מכירות</h2>' +
      '<p class="adm-card-sub">לכל סוכן קישור אישי. לקוח שנרשם דרך הקישור נרשם כמגיע ממנו. ' +
      'עמלה מגיעה על לקוח שמשלם — כמה חיובים מוצלחים שנקבעו לסוכן — ולא על פיילוט ללא תשלום.</p>' +
      agentForm(data.editAgent) + '</div>';

    if (!list) {
      node.innerHTML = html + '<p class="adm-empty">טוען…</p>';
      return;
    }
    html += '<div class="adm-card"><h2>הסוכנים</h2>';
    if (!list.agents.length) {
      html += '<p class="adm-empty">עוד אין סוכנים.</p></div>';
    } else {
      html += '<div class="adm-scroll"><table class="adm-table"><thead><tr>' +
        '<th>סוכן</th><th class="num">עמלה</th><th class="num">יעד</th><th class="num">לקוחות</th>' +
        '<th class="num">הגיעו ליעד</th><th class="num">לתשלום</th><th class="num">שולם</th><th>קישור</th><th></th>' +
        '</tr></thead><tbody>';
      list.agents.forEach(function (agent) {
        html += '<tr><td>' + esc(agent.name) +
          (agent.active ? '' : ' <span class="adm-flag">לא פעיל</span>') + '</td>' +
          '<td class="num">' + esc(money(agent.commission)) + '</td>' +
          '<td class="num">' + agent.qualifyCharges + ' חיובים</td>' +
          '<td class="num">' + agent.customers + (agent.free ? ' (' + agent.free + ' פיילוט)' : '') + '</td>' +
          '<td class="num">' + agent.qualified + '</td>' +
          '<td class="num">' + esc(money(agent.owed)) + (agent.owedCount ? ' (' + agent.owedCount + ')' : '') + '</td>' +
          '<td class="num">' + esc(money(agent.paidOut)) + '</td>' +
          '<td><button class="adm-btn is-small" data-copy-link="' + esc(referralLink(agent.code)) + '">העתקת קישור</button></td>' +
          '<td><button class="adm-btn is-small" data-agent-edit="' + esc(agent.id) + '">עריכה</button> ' +
          '<button class="adm-btn is-small" data-agent-customers="' + esc(agent.id) + '">לקוחות</button></td></tr>';
      });
      html += '</tbody></table></div></div>';
    }
    html += '<div id="adm-agent-customers"></div>';

    /* דוח בונוסים חודשי */
    var month = data.reportMonth || monthNow();
    html += '<div class="adm-card"><h2>בונוסים לפי חודש</h2>' +
      '<p class="adm-card-sub">מי הגיע ליעד באותו חודש, כמה מגיע לכל סוכן, ומה נשאר לא משולם מחודשים קודמים.</p>' +
      '<div class="adm-controls"><label class="adm-field" for="adm-report-month"><span>חודש</span>' +
      '<input class="adm-input" id="adm-report-month" type="month" value="' + esc(month) + '"></label>' +
      '<button class="adm-btn" id="adm-report-load">הצגה</button>' +
      '<button class="adm-btn" id="adm-export-agents">ייצוא ל-Excel</button></div>';
    html += renderReport(data.report) + '</div>';
    node.innerHTML = html;
  }

  function reportRows(rows, withPay) {
    return '<div class="adm-scroll"><table class="adm-table"><thead><tr>' +
      '<th>לקוח</th><th>סוכן</th><th>הגיע ליעד</th><th class="num">עמלה</th><th>מצב</th>' +
      (withPay ? '<th></th>' : '') + '</tr></thead><tbody>' +
      rows.map(function (row) {
        return '<tr><td class="wide">' + esc(row.company) + '</td><td>' + esc(row.agent) + '</td>' +
          '<td>' + esc(date(row.qualifiedAt)) + '</td>' +
          '<td class="num">' + esc(money(row.amount)) + '</td>' +
          '<td>' + (row.status === 'paid'
            ? '<span class="adm-pill is-active">שולם</span>'
            : '<span class="adm-pill is-past_due">ממתין</span>') + '</td>' +
          (withPay ? '<td><button class="adm-btn is-small" data-pay="' + esc(row.companyId) + '" data-paid="' +
            (row.status === 'paid' ? '0' : '1') + '">' +
            (row.status === 'paid' ? 'ביטול סימון' : 'סימון כשולם') + '</button></td>' : '') +
          '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderReport(report) {
    if (!report) return '<p class="adm-empty">טוען…</p>';
    var html = '<div class="adm-tiles">' +
      tile('הגיעו ליעד החודש', String(report.totals.count), 'לקוחות') +
      tile('עמלות החודש', money(report.totals.amount), 'לתשלום ' + money(report.totals.pending), true) +
      tile('חוב מחודשים קודמים', money(report.totals.olderPending), report.older.length + ' עמלות') +
      '</div>';
    if (report.byAgent.length) {
      html += '<h3>לפי סוכן</h3><div class="adm-scroll"><table class="adm-table"><thead><tr>' +
        '<th>סוכן</th><th class="num">לקוחות</th><th class="num">סכום</th><th class="num">לתשלום</th></tr></thead><tbody>' +
        report.byAgent.map(function (item) {
          return '<tr><td>' + esc(item.agent) + '</td><td class="num">' + item.count + '</td>' +
            '<td class="num">' + esc(money(item.amount)) + '</td><td class="num">' + esc(money(item.pending)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    html += '<h3>מי הגיע ליעד החודש</h3>' +
      (report.lines.length ? reportRows(report.lines, true) : '<p class="adm-empty">אף לקוח לא הגיע ליעד בחודש הזה.</p>');
    if (report.older.length) {
      html += '<h3>עמלות שלא שולמו מחודשים קודמים</h3>' + reportRows(report.older, true);
    }
    if (report.upcoming.length) {
      html += '<h3>יגיעו ליעד בחיוב הבא</h3><div class="adm-scroll"><table class="adm-table"><thead><tr>' +
        '<th>לקוח</th><th>סוכן</th><th>חיוב הבא</th><th class="num">עמלה צפויה</th></tr></thead><tbody>' +
        report.upcoming.map(function (item) {
          return '<tr><td class="wide">' + esc(item.company) + '</td><td>' + esc(item.agent) + '</td>' +
            '<td>' + esc(date(item.nextChargeAt)) + '</td><td class="num">' + esc(money(item.amount)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    return html;
  }

  function renderAgentCustomers(view) {
    var node = document.getElementById('adm-agent-customers');
    if (!node) return;
    var html = '<div class="adm-card"><h2>הלקוחות של ' + esc(view.agent.name) + '</h2>';
    if (!view.customers.length) {
      node.innerHTML = html + '<p class="adm-empty">עוד אין לקוחות.</p></div>';
      return;
    }
    html += '<div class="adm-scroll"><table class="adm-table"><thead><tr>' +
      '<th>לקוח</th><th>מצב</th><th class="num">חיובים</th><th>עמלה</th></tr></thead><tbody>' +
      view.customers.map(function (c) {
        var commission = c.freeAccess ? 'פיילוט — אין עמלה'
          : c.commission ? money(c.commission.amount) + (c.commission.status === 'paid' ? ' · שולם' : ' · ממתין')
            : c.paidCharges + ' מתוך ' + view.agent.qualifyCharges;
        return '<tr class="adm-row-link" data-company="' + esc(c.id) + '"><td class="wide">' + esc(c.name) + '</td>' +
          '<td>' + statusPill(c.status) + '</td><td class="num">' + c.paidCharges + '</td>' +
          '<td>' + esc(commission) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    node.innerHTML = html;
  }

  /* ===== מערכת הדגמה ===== */

  function renderDemo() {
    var node = document.getElementById('panel-demo');
    var view = data.demo;
    var html = '<div class="adm-card"><h2>מערכת הדגמה</h2>' +
      '<p class="adm-card-sub">עסק לדוגמה עם 8 עובדים, 2 סניפים ו-4 משמרות ביום: סידור שפורסם, דוח שעות ' +
      'ובקשות אילוץ שממתינות לאישור — ושבוע הבא ריק, כדי לבנות בו סידור מול הלקוח ולהתאים אותו לעסק שלו.</p>' +
      '<div class="adm-form-actions">' +
      '<button class="adm-btn is-primary" id="adm-demo-enter" type="button">כניסה למערכת ההדגמה</button></div>' +
      '<p class="adm-hint">נפתח בלשונית חדשה, בלי מייל ובלי סיסמה. השינויים לא נשמרים: בכל כניסה מכאן ' +
      'הכול חוזר להתחלה. אינו נספר בלוח, בהכנסה או בעמלות, ופרסום סידור בהדגמה אינו שולח הודעות.</p>' +
      '<p id="adm-demo-msg" class="adm-error" hidden></p>';
    if (view && view.exists && view.resetAt) {
      html += '<p class="adm-note">כניסה אחרונה: ' + esc(date(view.resetAt)) + '</p>';
    }
    node.innerHTML = html + '</div>';
  }

  /* החלון נפתח בתוך הלחיצה: דפדפן חוסם חלון שנפתח אחרי בקשת רשת */
  function enterDemo(button) {
    var box = document.getElementById('adm-demo-msg');
    box.hidden = true;
    button.disabled = true;
    var tab = window.open('about:blank', '_blank');
    api('demo', { do: 'enter' }).then(function (result) {
      if (tab && !tab.closed) {
        tab.location.href = result.url;
      } else {
        box.innerHTML = 'הדפדפן חסם את פתיחת הלשונית. <a id="adm-demo-link" target="_blank" rel="noopener" href="' +
          esc(result.url) + '">פתיחת ההדגמה</a> (קישור לשימוש אחד)';
        box.hidden = false;
      }
      return loadDemo();
    }).catch(function (error) {
      if (tab) tab.close();
      box.textContent = error.message;
      box.hidden = false;
    }).then(function () { button.disabled = false; });
  }

  /* ===== טעינה ===== */


  /* ===== לידים ===== */

  var LEAD_STATUS = { new: 'חדש', contacted: 'נוצר קשר', demo: 'הדגמה', won: 'נסגר', lost: 'לא רלוונטי' };
  var HOURS_LABEL = { lt1: 'עד שעה', '1-3': '1–3 שעות', '3-6': '3–6 שעות', '6plus': 'מעל 6 שעות', unknown: 'לא יודע' };
  var CHANNEL_LABEL = { meta: 'Meta (פייסבוק/אינסטגרם)', google: 'גוגל', tiktok: 'טיקטוק',
    linkedin: 'לינקדאין', agents: 'סוכנים', direct: 'ישיר / לא ידוע' };

  /* מספר ישראלי לקישור וואטסאפ: ספרות בלבד, 0 בתחילה הופך ל-972 */
  function waNumber(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    if (digits.indexOf('00') === 0) digits = digits.slice(2);
    if (digits.charAt(0) === '0') digits = '972' + digits.slice(1);
    return digits;
  }

  function renderLeads() {
    var node = document.getElementById('panel-leads');
    var view = data.leads;
    var html = '<div class="adm-card"><h2>לידים מהאתר</h2>' +
      '<p class="adm-card-sub">מי השאיר פרטים בטופס באתר. הסטטוס הוא סדר העבודה שלך: חדש, נוצר קשר, הדגמה, נסגר. ' +
      'הם מופיעים גם במייל התמיכה ברגע שהגיעו.</p>';
    if (!view) { node.innerHTML = html + '<p class="adm-empty">טוען…</p></div>'; return; }
    html += '<div class="adm-controls">' + ['', 'new', 'contacted', 'demo', 'won', 'lost'].map(function (key) {
      var label = key ? LEAD_STATUS[key] : 'הכל';
      var count = key ? view.counts[key] : view.counts.all;
      return '<button class="adm-btn' + ((data.leadStatus || '') === key ? ' is-primary' : '') +
        '" data-lead-filter="' + key + '">' + esc(label) + ' (' + (count || 0) + ')</button>';
    }).join('') + '<button class="adm-btn" id="adm-export-leads">ייצוא ל-Excel</button></div>';
    if (!view.leads.length) { node.innerHTML = html + '<p class="adm-empty">אין לידים במצב הזה.</p></div>'; return; }
    html += '<div class="adm-scroll"><table class="adm-table"><thead><tr>' +
      '<th>נכנס</th><th>עסק</th><th>איש קשר</th><th class="num">עובדים</th><th>זמן בשבוע</th>' +
      '<th>מקור</th><th>סטטוס</th><th>הערה</th><th></th></tr></thead><tbody>';
    view.leads.forEach(function (lead) {
      html += '<tr data-lead-row="' + esc(lead.id) + '"><td>' + esc(date(lead.createdAt)) + '</td>' +
        '<td class="wide"><b>' + esc(lead.business) + '</b></td>' +
        '<td>' + esc(lead.name) + '<br><a href="tel:' + esc(lead.phone) + '" dir="ltr">' + esc(lead.phone) + '</a>' +
        ' · <a href="https://wa.me/' + esc(waNumber(lead.phone)) + '" target="_blank" rel="noopener">וואטסאפ</a><br>' +
        '<a href="mailto:' + esc(lead.email) + '" dir="ltr">' + esc(lead.email) + '</a></td>' +
        '<td class="num">' + esc(lead.employees == null ? '—' : lead.employees) + '</td>' +
        '<td>' + esc(HOURS_LABEL[lead.hours] || '—') + '</td>' +
        '<td>' + esc(lead.source ? lead.source + (lead.campaign ? ' / ' + lead.campaign : '') : 'ישיר') + '</td>' +
        '<td><select class="adm-select" data-lead-status="' + esc(lead.id) + '">' +
        Object.keys(LEAD_STATUS).map(function (k) {
          return '<option value="' + k + '"' + (lead.status === k ? ' selected' : '') + '>' + esc(LEAD_STATUS[k]) + '</option>';
        }).join('') + '</select>' +
        (lead.companyId ? ' <button class="adm-btn is-small" data-company="' + esc(lead.companyId) + '">הלקוח</button>' : '') + '</td>' +
        '<td><input class="adm-input" data-lead-note="' + esc(lead.id) + '" maxlength="500" value="' + esc(lead.adminNote) + '"></td>' +
        '<td><button class="adm-btn is-small" data-lead-customer="' + esc(lead.id) + '">הקמת פיילוט</button> ' +
        '<button class="adm-btn is-small" data-lead-delete="' + esc(lead.id) + '">מחיקה</button></td></tr>';
    });
    node.innerHTML = html + '</tbody></table></div></div>';
  }

  function loadLeads() {
    return api('leads', { action: 'list', status: data.leadStatus || '' }).then(function (body) {
      data.leads = body;
      if (current === 'leads') renderLeads();
    }).catch(function (error) {
      var node = document.getElementById('panel-leads');
      if (node) node.innerHTML = '<p class="adm-error">' + esc(error.message) + '</p>';
    });
  }

  function exportLeads() {
    var view = data.leads;
    if (!view || !view.leads.length) { window.alert('אין נתונים לייצוא.'); return; }
    downloadWorkbook('setshifts-leads-' + today() + '.xlsx', [sheetOf('לידים',
      [12, 26, 20, 16, 28, 10, 14, 18, 18, 12, 30],
      ['נכנס', 'עסק', 'איש קשר', 'טלפון', 'מייל', 'עובדים', 'זמן בשבוע', 'מקור', 'קמפיין', 'סטטוס', 'הערה'],
      view.leads.map(function (l) {
        return [date(l.createdAt), l.business, l.name, l.phone, l.email, l.employees,
          HOURS_LABEL[l.hours] || '', l.source || 'ישיר', l.campaign || '', LEAD_STATUS[l.status], l.adminNote];
      }))]);
  }

  /* ===== שיווק ===== */

  function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) + '%' : '—'; }
  function weekSunday(offset) {
    var d = new Date();
    d.setDate(d.getDate() - d.getDay() - (offset || 0) * 7);
    return d.toISOString().slice(0, 10);
  }

  function renderMarketing() {
    var node = document.getElementById('panel-marketing');
    var r = data.marketing;
    var html = '<div class="adm-card"><h2>שיווק</h2>' +
      '<p class="adm-card-sub">הנתונים נמשכים מהמערכת עצמה: הרשמות, כרטיסים, חיובים ולידים. ההוצאה על פרסום נמשכת כל יום מ-Meta ומ-Google Ads כשהם מחוברים (מצב החיבור בתחתית), ומוזנת ידנית לערוץ שאינו מחובר. ' +
      'משלם = לקוח שיש לו חיוב מוצלח אחד לפחות; פיילוט ללא תשלום והדגמה לא נספרים כמשלמים.</p>' +
      '<div class="adm-controls"><label class="adm-field" for="mk-weeks"><span>חלון</span>' +
      '<select class="adm-select" id="mk-weeks">' + [4, 8, 12, 26, 52].map(function (n) {
        return '<option value="' + n + '"' + (n === data.marketingWeeks ? ' selected' : '') + '>' + n + ' שבועות</option>';
      }).join('') + '</select></label>' +
      '<button class="adm-btn" id="mk-refresh">רענון</button>' +
      '<button class="adm-btn is-primary" id="mk-export">ייצוא כל הנתונים ל-Excel</button></div></div>';
    if (!r) { node.innerHTML = html + '<p class="adm-empty">טוען…</p>'; return; }
    var t = r.totals;
    html += '<div class="adm-tiles">' +
      tile('לידים', t.leads, 'עלות ללייד: ' + (t.costPerLead == null ? '—' : money(t.costPerLead))) +
      tile('הרשמות', t.signups, 'עלות להרשמה: ' + (t.costPerSignup == null ? '—' : money(t.costPerSignup))) +
      tile('עם כרטיס', t.withCard, pct(t.withCard, t.signups) + ' מההרשמות') +
      tile('הוסיפו צוות', t.teamAdded, pct(t.teamAdded, t.signups) + ' מההרשמות') +
      tile('משלמים חדשים', t.paying, pct(t.paying, t.signups) + ' מההרשמות', true) +
      tile('הוצאה', money(t.spend), 'בחלון הנבחר') +
      tile('עלות רכישת לקוח', t.cac == null ? '—' : money(t.cac), 'יעד: עד 1,400 ₪', true) +
      tile('משלמים בסך הכל', r.payingTotal, 'מאז ומעולם') + '</div>';
    if (r.untrackedShare != null && r.untrackedShare >= 50) {
      html += '<p class="adm-error">' + r.untrackedShare + '% מההרשמות הגיעו בלי מקור שמיש. ' +
        'בדוק שהפיקסל והאישור למדידה פעילים ושהקישורים במודעות כוללים utm_source ו-utm_campaign. ' +
        'עד אז ההשוואה בין ערוצים אינה אמינה.</p>';
    }

    html += '<div class="adm-card"><h2>לפי שבוע</h2><div class="adm-scroll"><table class="adm-table"><thead><tr>' +
      '<th>שבוע שמתחיל</th><th class="num">לידים</th><th class="num">הרשמות</th><th class="num">עם כרטיס</th>' +
      '<th class="num">הוסיפו צוות</th><th class="num">משלמים חדשים</th><th class="num">הוצאה</th><th class="num">עלות ללקוח</th>' +
      '</tr></thead><tbody>' + r.weekList.map(function (w) {
        return '<tr><td>' + esc(date(w.week)) + '</td><td class="num">' + w.leads + '</td><td class="num">' + w.signups +
          '</td><td class="num">' + w.withCard + '</td><td class="num">' + w.teamAdded + '</td><td class="num">' + w.paying +
          '</td><td class="num">' + (w.spend ? esc(money(w.spend)) : '—') + '</td><td class="num">' +
          (w.cac == null ? '—' : esc(money(w.cac))) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';

    html += '<div class="adm-card"><h2>לפי ערוץ</h2><div class="adm-scroll"><table class="adm-table"><thead><tr>' +
      '<th>ערוץ</th><th class="num">לידים</th><th class="num">הרשמות</th><th class="num">עם כרטיס</th><th class="num">משלמים</th>' +
      '<th class="num">הכנסה</th><th class="num">הוצאה</th><th class="num">עלות ללקוח</th><th class="num">הכנסה/הוצאה</th>' +
      '</tr></thead><tbody>' + r.channels.map(function (c) {
        return '<tr><td>' + esc(CHANNEL_LABEL[c.key] || c.key) + '</td><td class="num">' + c.leads + '</td><td class="num">' + c.signups +
          '</td><td class="num">' + c.withCard + '</td><td class="num">' + c.paying + '</td><td class="num">' + esc(money(c.revenue)) +
          '</td><td class="num">' + (c.spend ? esc(money(c.spend)) : '—') + '</td><td class="num">' + (c.cac == null ? '—' : esc(money(c.cac))) +
          '</td><td class="num">' + (c.roas == null ? '—' : c.roas) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';

    if (r.campaigns.length) {
      html += '<div class="adm-card"><h2>לפי קמפיין</h2><div class="adm-scroll"><table class="adm-table"><thead><tr>' +
        '<th>ערוץ / קמפיין</th><th class="num">הרשמות</th><th class="num">משלמים</th></tr></thead><tbody>' +
        r.campaigns.map(function (c) {
          return '<tr><td>' + esc(c.key) + '</td><td class="num">' + c.signups + '</td><td class="num">' + c.paying + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }

    var sync = r.sync || {};
    function syncLine(key, label) {
      var s = sync[key] || {};
      if (!s.configured && !(s.last)) return '<li><b>' + esc(label) + ':</b> לא מחובר. ההוצאה מוזנת ידנית.</li>';
      if (!s.last) return '<li><b>' + esc(label) + ':</b> מחובר, עוד לא רץ.</li>';
      return '<li><b>' + esc(label) + ':</b> ' + (s.last.ok
        ? 'סונכרן ' + esc(date(s.last.at)) + ' ' + esc(new Date(s.last.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })) +
          ' (' + s.last.weeks + ' שבועות)'
        : '<span class="adm-error-inline">נכשל ' + esc(date(s.last.at)) + ': ' + esc(s.last.error || '') + '</span>') + '</li>';
    }
    html += '<div class="adm-card"><h2>הוצאות פרסום</h2>' +
      '<ul class="adm-sync">' + syncLine('meta', 'Meta') + syncLine('google', 'Google Ads') + '</ul>' +
      '<p class="adm-card-sub">ערוץ מחובר מתעדכן לבד כל יום ומחליף הזנה ידנית של אותו שבוע. ערוץ שאינו מחובר (או ערוץ אחר) מזינים כאן פעם בשבוע.</p>' +
      '<form id="mk-spend-form" class="adm-grid-form">' +
      '<label class="adm-field" for="mk-week"><span>שבוע (כל יום בו)</span><input class="adm-input" id="mk-week" type="date" value="' + esc(weekSunday(1)) + '" required></label>' +
      '<label class="adm-field" for="mk-channel"><span>ערוץ</span><input class="adm-input" id="mk-channel" list="mk-channels" value="meta" maxlength="40" required>' +
      '<datalist id="mk-channels"><option value="meta"><option value="google"><option value="tiktok"><option value="linkedin"><option value="other"></datalist></label>' +
      '<label class="adm-field" for="mk-amount"><span>סכום (₪)</span><input class="adm-input" id="mk-amount" type="number" min="0" step="0.01" required></label>' +
      '<label class="adm-field" for="mk-note"><span>הערה</span><input class="adm-input" id="mk-note" maxlength="200"></label>' +
      '<div class="adm-field"><span>&nbsp;</span><button class="adm-btn is-primary" type="submit">שמירה</button></div></form>' +
      '<p id="mk-msg" class="adm-error" hidden></p>';
    if (r.spend.length) {
      html += '<div class="adm-scroll"><table class="adm-table"><thead><tr><th>שבוע שמתחיל</th><th>ערוץ</th><th class="num">סכום</th><th>הערה</th><th></th></tr></thead><tbody>' +
        r.spend.slice(0, 40).map(function (s) {
          return '<tr><td>' + esc(date(s.weekStart)) + '</td><td>' + esc(s.channel) + (s.auto ? ' <span class="adm-flag">אוטומטי</span>' : '') + '</td><td class="num">' + esc(moneyExact(s.amount)) +
            '</td><td>' + esc(s.note) + '</td><td><button class="adm-btn is-small" data-spend-delete="' + esc(s.id) + '">מחיקה</button></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    node.innerHTML = html + '</div>';
  }

  function loadMarketing() {
    return api('marketing', { action: 'report', weeks: data.marketingWeeks }).then(function (body) {
      data.marketing = body;
      if (current === 'marketing') renderMarketing();
    }).catch(function (error) {
      var node = document.getElementById('panel-marketing');
      if (node) node.innerHTML = '<p class="adm-error">' + esc(error.message) + '</p>';
    });
  }

  /* קובץ אחד עם הכול, בנוי להעלאה לניתוח: סיכום שבועי, ערוצים,
     קמפיינים, ושורה לכל הרשמה ולכל ליד. מספרים נשמרים כמספרים. */
  function exportMarketing() {
    var r = data.marketing;
    if (!r) { window.alert('הנתונים עוד נטענים.'); return; }
    downloadWorkbook('setshifts-marketing-' + today() + '.xlsx', [
      sheetOf('סיכום שבועי', [14, 10, 10, 10, 12, 14, 12, 14],
        ['שבוע שמתחיל', 'לידים', 'הרשמות', 'עם כרטיס', 'הוסיפו צוות', 'משלמים חדשים', 'הוצאה (₪)', 'עלות ללקוח (₪)'],
        r.weekList.map(function (w) { return [w.week, w.leads, w.signups, w.withCard, w.teamAdded, w.paying, w.spend, w.cac == null ? '' : w.cac]; })),
      sheetOf('לפי ערוץ', [20, 10, 10, 10, 10, 14, 12, 14, 12],
        ['ערוץ', 'לידים', 'הרשמות', 'עם כרטיס', 'משלמים', 'הכנסה ברוטו (₪)', 'הוצאה (₪)', 'עלות ללקוח (₪)', 'הכנסה/הוצאה'],
        r.channels.map(function (c) { return [c.key, c.leads, c.signups, c.withCard, c.paying, c.revenue, c.spend, c.cac == null ? '' : c.cac, c.roas == null ? '' : c.roas]; })),
      sheetOf('לפי קמפיין', [34, 10, 10], ['ערוץ / קמפיין', 'הרשמות', 'משלמים'],
        r.campaigns.map(function (c) { return [c.key, c.signups, c.paying]; })),
      sheetOf('הרשמות', [26, 12, 10, 12, 18, 18, 18, 14, 10, 10, 8, 14, 12],
        ['עסק', 'נפתח', 'מצב', 'חבילה', 'ערוץ', 'קמפיין', 'מדיום', 'תוכן', 'פיילוט', 'כרטיס', 'משתמשים', 'חיוב ראשון', 'הכנסה ברוטו (₪)'],
        r.raw.companies.map(function (c) {
          return [c.name, date(c.createdAt), STATUS_LABEL[c.status] || c.status, PLAN_LABEL[c.plan] || c.plan, c.source,
            c.campaign, c.medium, c.content, c.free ? 'כן' : '', c.hasCard ? 'כן' : '', c.users,
            c.firstCharge ? date(c.firstCharge) : '', c.revenueGross];
        })),
      sheetOf('לידים', [12, 26, 20, 16, 28, 10, 14, 14, 18, 12, 8],
        ['נכנס', 'עסק', 'איש קשר', 'טלפון', 'מייל', 'עובדים', 'זמן בשבוע', 'ערוץ', 'קמפיין', 'סטטוס', 'הפך ללקוח'],
        r.raw.leads.map(function (l) {
          return [date(l.createdAt), l.business, l.name, l.phone, l.email, l.employees, HOURS_LABEL[l.hours] || '',
            l.source, l.campaign, LEAD_STATUS[l.status] || l.status, l.converted ? 'כן' : ''];
        })),
      sheetOf('הוצאות', [14, 16, 12, 30], ['שבוע שמתחיל', 'ערוץ', 'סכום (₪)', 'הערה'],
        r.spend.map(function (s) { return [s.weekStart, s.channel, s.amount, s.note]; }))
    ]);
  }

  function loadOverview() {
    return api('overview').then(function (body) {
      data.overview = body;
      if (current === 'overview') renderOverview();
      if (current === 'money') renderMoney();
    });
  }

  function loadCompanies() {
    return api('companies', { q: data.query || '', status: data.status || '', source: data.source || '' })
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

  function loadAgents() {
    return api('agents', { do: 'list' }).then(function (body) {
      data.agents = body;
      return api('agents', { do: 'report', month: data.reportMonth || monthNow() });
    }).then(function (report) {
      data.report = report;
      if (current === 'agents') renderAgents();
    }).catch(function (error) {
      var node = document.getElementById('panel-agents');
      if (node) node.innerHTML = '<p class="adm-error">' + esc(error.message) + '</p>';
    });
  }

  function loadDemo() {
    return api('demo', { do: 'status' }).then(function (body) {
      data.demo = body;
      if (current === 'demo') renderDemo();
    }).catch(function (error) {
      var node = document.getElementById('panel-demo');
      if (node) node.innerHTML = '<p class="adm-error">' + esc(error.message) + '</p>';
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
    if (panel === 'coupons') { renderCoupons(); if (!data.coupons) loadCoupons(); }
    if (panel === 'agents') { renderAgents(); loadAgents(); }
    if (panel === 'leads') { renderLeads(); loadLeads(); }
    if (panel === 'marketing') { renderMarketing(); loadMarketing(); }
    if (panel === 'demo') { renderDemo(); loadDemo(); }
  }

  function start() {
    document.getElementById('adm-signin').hidden = true;
    document.getElementById('adm-app').hidden = false;
    document.getElementById('adm-who').textContent =
      (session.user && session.user.email) || '';
    document.getElementById('adm-signout').hidden = false;
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
    if (event.target.closest('#adm-signout')) { signOut(); return; }

    var tab = event.target.closest('.adm-tab');
    if (tab) { show(tab.dataset.panel); return; }

    var act = event.target.closest('[data-act]');
    if (act) {
      var isCancel = act.dataset.act === 'set-cancel';
      openAction(act.dataset.act, act.dataset.id,
        { cancelNow: isCancel && /ביטול/.test(act.textContent), reason: act.dataset.reason || '' });
      return;
    }

    if (event.target.id === 'adm-modal-ok') { submitAction(); return; }
    if (event.target.id === 'adm-modal-cancel') { closeAction(); return; }
    if (event.target.id === 'adm-refresh') { loadCompanies(); return; }
    if (event.target.id === 'adm-demo-enter') { enterDemo(event.target); return; }

    var open = event.target.closest('[data-open]');
    if (open) { openCompany(open.dataset.open); return; }

    var row = event.target.closest('[data-company]');
    if (row) {
      if (current !== 'companies') { show('companies'); }
      openCompany(row.dataset.company);
      return;
    }

    var copy = event.target.closest('[data-copy-link]');
    if (copy) {
      var link = copy.dataset.copyLink;
      var done = function () { copy.textContent = 'הועתק'; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done, function () { window.prompt('הקישור:', link); });
      } else { window.prompt('הקישור:', link); }
      return;
    }

    var editAgent = event.target.closest('[data-agent-edit]');
    if (editAgent) {
      data.editAgent = (data.agents && data.agents.agents || []).filter(function (agent) {
        return agent.id === editAgent.dataset.agentEdit;
      })[0] || null;
      renderAgents();
      window.scrollTo(0, 0);
      return;
    }
    if (event.target.id === 'ag-cancel') { data.editAgent = null; renderAgents(); return; }

    var seeCustomers = event.target.closest('[data-agent-customers]');
    if (seeCustomers) {
      api('agents', { do: 'customers', agentId: seeCustomers.dataset.agentCustomers })
        .then(renderAgentCustomers)
        .catch(function (error) { window.alert(error.message); });
      return;
    }

    if (event.target.id === 'adm-card-copy') {
      var cardUrl = document.getElementById('adm-card-url');
      cardUrl.select();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cardUrl.value);
      else document.execCommand('copy');
      event.target.textContent = 'הועתק';
      return;
    }
    if (event.target.id === 'adm-export-leads') { exportLeads(); return; }
    if (event.target.id === 'mk-export') { exportMarketing(); return; }
    if (event.target.id === 'mk-refresh') { data.marketing = null; renderMarketing(); loadMarketing(); return; }

    var leadFilter = event.target.closest('[data-lead-filter]');
    if (leadFilter) { data.leadStatus = leadFilter.dataset.leadFilter; loadLeads(); return; }

    var leadDelete = event.target.closest('[data-lead-delete]');
    if (leadDelete) {
      if (!window.confirm('למחוק את הליד לצמיתות? הפרטים שלו יימחקו.')) return;
      api('leads', { action: 'delete', id: leadDelete.dataset.leadDelete })
        .then(loadLeads).catch(function (error) { window.alert(error.message); });
      return;
    }

    var leadCustomer = event.target.closest('[data-lead-customer]');
    if (leadCustomer) {
      var chosen = ((data.leads && data.leads.leads) || []).filter(function (l) { return l.id === leadCustomer.dataset.leadCustomer; })[0];
      if (!chosen) return;
      openAction('create-customer', 'new', { leadId: chosen.id });
      document.getElementById('adm-f-company').value = chosen.business || '';
      document.getElementById('adm-f-owner').value = chosen.name || '';
      document.getElementById('adm-f-email').value = chosen.email || '';
      document.getElementById('adm-f-phone').value = chosen.phone || '';
      return;
    }

    var spendDelete = event.target.closest('[data-spend-delete]');
    if (spendDelete) {
      api('marketing', { action: 'spend-delete', id: spendDelete.dataset.spendDelete })
        .then(loadMarketing).catch(function (error) { window.alert(error.message); });
      return;
    }

    if (event.target.id === 'adm-export-companies') { exportCompanies(); return; }
    if (event.target.id === 'adm-export-agents') { exportAgents(); return; }

    if (event.target.id === 'adm-report-load') {
      data.reportMonth = document.getElementById('adm-report-month').value || monthNow();
      data.report = null;
      renderAgents();
      loadAgents();
      return;
    }

    var payButton = event.target.closest('[data-pay]');
    if (payButton) {
      api('agents', { do: 'pay', companyIds: [payButton.dataset.pay], paid: payButton.dataset.paid === '1' })
        .then(function () { data.report = null; renderAgents(); return loadAgents(); })
        .catch(function (error) { window.alert(error.message); });
      return;
    }

    var toggle = event.target.closest('[data-coupon-toggle]');
    if (toggle) {
      api('coupons', {
        action: 'toggle', code: toggle.dataset.couponToggle,
        active: toggle.dataset.active !== '1'
      }).then(loadCoupons).catch(function (error) { window.alert(error.message); });
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

  /* שם השדה משתנה עם הסוג: "ימים" הוא לא "שקלים", ושדה שכתוב
     עליו הדבר הלא נכון הוא הדרך הבטוחה לתת 30 ש"ח במקום 30 יום. */
  document.addEventListener('change', function (event) {
    if (event.target.id !== 'cp-kind') return;
    var kind = COUPON_KIND[event.target.value];
    var label = document.getElementById('cp-value-label');
    if (label && kind) label.textContent = kind.unit;
  });

  /* ואותו דבר במחיר המוסכם: "1450 לחודש" ו-"12 לעובד" הם אותו
     שדה, והמרחק ביניהם הוא פי מאה. */
  document.addEventListener('change', function (event) {
    if (event.target.id !== 'adm-f-mode') return;
    var perEmployee = event.target.value === 'per_employee';
    var label = document.getElementById('adm-f-price-label');
    var hint = document.getElementById('adm-f-price-hint');
    if (label) {
      label.textContent = perEmployee
        ? 'תעריף לעובד פעיל לחודש, כולל מע״מ'
        : 'מחיר לחודש, כולל מע״מ';
    }
    if (hint && perEmployee) {
      hint.textContent = 'החיוב החודשי יהיה התעריף כפול מספר העובדים הפעילים ' +
        'באותו רגע. עסק שגדל משלם יותר בחודש הבא, בלי שיחה.';
    } else if (hint) {
      hint.textContent = 'המחיר הזה גובר על מחיר החבילה וייגבה בחיוב הבא. ' +
        'השאירו ריק כדי לחזור למחירון. לשימוש ללא תשלום השתמשו ' +
        'ב"מתן תקופה ללא תשלום" ולא במחיר אפס.';
    }
  });

  document.addEventListener('submit', function (event) {
    if (event.target.id === 'adm-agent-form') {
      event.preventDefault();
      var agentBox = document.getElementById('adm-agent-msg');
      agentBox.hidden = true;
      var active = document.getElementById('ag-active');
      var payload = {
        do: 'save', id: event.target.dataset.id || '',
        name: document.getElementById('ag-name').value,
        code: document.getElementById('ag-code').value,
        commission: document.getElementById('ag-commission').value,
        qualifyCharges: document.getElementById('ag-qualify').value,
        email: document.getElementById('ag-email').value,
        phone: document.getElementById('ag-phone').value,
        note: document.getElementById('ag-note').value
      };
      if (active) payload.active = active.checked;
      api('agents', payload).then(function () {
        data.editAgent = null; data.report = null;
        renderAgents();
        return loadAgents();
      }).catch(function (error) { agentBox.textContent = error.message; agentBox.hidden = false; });
      return;
    }
    if (event.target.id === 'mk-spend-form') {
      event.preventDefault();
      var spendBox = document.getElementById('mk-msg');
      spendBox.hidden = true;
      api('marketing', {
        action: 'spend-save',
        weekStart: document.getElementById('mk-week').value,
        channel: document.getElementById('mk-channel').value,
        amount: document.getElementById('mk-amount').value,
        note: document.getElementById('mk-note').value
      }).then(loadMarketing)
        .catch(function (error) { spendBox.textContent = error.message; spendBox.hidden = false; });
      return;
    }
    if (event.target.id !== 'adm-coupon-form') return;
    event.preventDefault();
    var box = document.getElementById('adm-coupon-msg');
    box.hidden = true;
    api('coupons', {
      action: 'create',
      code: document.getElementById('cp-code').value,
      kind: document.getElementById('cp-kind').value,
      value: document.getElementById('cp-value').value,
      validUntil: document.getElementById('cp-until').value,
      maxUses: document.getElementById('cp-max').value,
      note: document.getElementById('cp-note').value
    }).then(function () {
      data.coupons = null;
      return loadCoupons();
    }).catch(function (error) {
      box.textContent = error.message;
      box.hidden = false;
    });
  });

  var searchTimer = null;
  document.addEventListener('input', function (event) {
    if (event.target.id !== 'adm-search') return;
    data.query = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadCompanies, 300);
  });

  document.addEventListener('change', function (event) {
    if (event.target.id !== 'adm-filter-status' && event.target.id !== 'adm-filter-source') return;
    if (event.target.id === 'adm-filter-source') data.source = event.target.value;
    else data.status = event.target.value;
    loadCompanies();
  });

  document.addEventListener('change', function (event) {
    var status = event.target.closest && event.target.closest('[data-lead-status]');
    if (status) {
      api('leads', { action: 'update', id: status.dataset.leadStatus, status: status.value })
        .then(loadLeads).catch(function (error) { window.alert(error.message); });
      return;
    }
    var note = event.target.closest && event.target.closest('[data-lead-note]');
    if (note) {
      api('leads', { action: 'update', id: note.dataset.leadNote, adminNote: note.value })
        .catch(function (error) { window.alert(error.message); });
      return;
    }
    if (event.target.id === 'mk-weeks') {
      data.marketingWeeks = Number(event.target.value) || 12;
      data.marketing = null; renderMarketing(); loadMarketing();
    }
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

  window.__admin = { api: api, show: show, data: data, signOut: signOut };
})();
