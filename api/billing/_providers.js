/* מתאמי ספקי תשלום.
   כל ספק מתרגם את האירוע שלו למבנה אחיד אחד, וכל שאר הקוד אינו
   יודע באיזה ספק מדובר:

     {
       id:                 מזהה האירוע אצל הספק (למניעת כפילות)
       type:               שם האירוע, לתיעוד בלבד
       subscriptionId:     מזהה המנוי או הטוקן אצל הספק
       customerId:         מזהה הלקוח אצל הספק
       companyId:          מזהה החברה אצלנו – רק באירוע הראשון,
                           כשהמנוי עדיין לא מקושר
       status:             trial | active | past_due | canceled | expired
       currentPeriodEnd:   ISO. עד מתי שולם, ומתי החיוב הבא
       cancelAtPeriodEnd:  בוטל אך פעיל עד סוף התקופה
       plan:               starter | growth | business
       payload:            האירוע המקורי, לתיעוד
     }

   לכל ספק שלוש פונקציות:
     verify(raw, headers, secret)  אימות חתימה על ההודעה הנכנסת
     parse(body)                   תרגום למבנה שלמעלה
     charge(input)                 חיוב לפי טוקן שמור, ל-cron היומי

   להוספת ספק: מוסיפים כאן ערך אחד. שום קובץ אחר אינו משתנה. */
'use strict';

const crypto = require('crypto');

/* השוואה בזמן קבוע – השוואת מחרוזות רגילה מדליפה מידע על החתימה */
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/* ===== ספק מדומה – לבדיקות ולסביבת פיתוח =====
   חותם ב-HMAC-SHA256 על גוף הבקשה, בדיוק כמו ספקים אמיתיים,
   כדי שנתיב האימות ייבדק באמת ולא יעקוף. */
const mock = {
  verify: function (raw, headers, secret) {
    if (!secret) return false;
    const sent = headers['x-mock-signature'] || '';
    const expected = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
    return safeEqual(sent, expected);
  },

  parse: function (body) {
    return {
      id: body.id,
      type: body.type,
      subscriptionId: body.subscription_id,
      customerId: body.customer_id,
      companyId: body.company_id,
      status: body.status,
      currentPeriodEnd: body.current_period_end,
      cancelAtPeriodEnd: body.cancel_at_period_end,
      plan: body.plan,
      payload: body
    };
  },

  /* מדמה פתיחת דף תשלום: אין דף, והכרטיס "נשמר" מיד */
  createCheckout: function (input) {
    return Promise.resolve({ url: null, subscriptionId: 'mock-tok-' + input.companyId });
  },

  /* מדמה חיוב. מזהה טוקן שמתחיל ב-"fail-" נכשל, כדי שאפשר יהיה
     לבדוק גם את המסלול הלא-מוצלח. */
  charge: function (input) {
    if (String(input.subscriptionId || '').indexOf('fail-') === 0) {
      return Promise.resolve({ ok: false, reason: 'card-declined', retryable: true });
    }
    return Promise.resolve({
      ok: true,
      transactionId: 'mock-txn-' + input.idempotencyKey
    });
  }
};

/* ============================================================
   PayPlus
   ------------------------------------------------------------
   כל מה שכאן נשען על מסמך האינטגרציה שהתקבל מ-PayPlus
   (`docs/payplus-integration.md`), ומה שאינו כתוב שם מסומן
   במפורש. הכלל בקובץ הזה לא השתנה: קוד תשלומים לא מנחש.

   מה המסמך קובע:
     · כתובות: restapi.payplus.co.il (ייצור),
               restapidev.payplus.co.il (בדיקות), מפתחות נפרדים
     · הזדהות: שתי כותרות, api-key ו-secret-key
     · דף תשלום: POST /PaymentPages/generateLink
     · charge_method: 0=J2 בדיקת כרטיס, 1=J4 חיוב, 2=J5 אישור,
       3=הוראת קבע, 4=זיכוי, 5=טוקן
     · חתימת ההודעה החוזרת: HMAC-SHA256 בבסיס 64 בכותרת hash,
       ו-user-agent בשם PayPlus
     · ההודעה החוזרת אינה מקור האמת: מאמתים מול ipn-full לפי
       transaction_uid, ומשווים סכום ומטבע לפני שמסמנים ששולם
     · more_info חוזר אלינו כפי ששלחנו, ולכן הוא נושא את מזהה
       החברה בשמירת כרטיס ואת מפתח מניעת הכפילות בחיוב

   מה שהמסמך אינו קובע, ולכן מסומן כאן:
     · שמות השדות המדויקים בגוף ההודעה החוזרת. לכן אנחנו קוראים
       ממנה רק זהות (מזהה עסקה, טוקן, more_info) ולא סומכים על
       הסטטוס שבה – את הסטטוס לוקחים מ-ipn-full.
     · נתיב החיוב מטוקן. המסמך נותן את /Transactions/Approval
       (J5) עם use_token ו-credit_card, ולכן החיוב נכתב באותו
       מבנה מול /Transactions/Charge. `tools/payplus-smoke.js`
       מאמת את זה מול סביבת הבדיקות לפני שנוגעים בייצור.

   כל עוד PAYPLUS_READY אינו true, verify מחזיר false ו-charge
   זורק – כלומר שום הודעה אינה מתקבלת ושום כרטיס אינו מחויב.
   ============================================================ */

function payplusReady() { return process.env.PAYPLUS_READY === 'true'; }

function payplusBase() {
  return process.env.PAYPLUS_SANDBOX === 'true'
    ? 'https://restapidev.payplus.co.il/api/v1.0'
    : 'https://restapi.payplus.co.il/api/v1.0';
}

/* ההזדהות היא שתי כותרות נפרדות, לא מסמך JSON בכותרת אחת.
   הן לעולם אינן נכתבות ליומן – ראו payplusCall. */
function payplusHeaders() {
  return {
    'Content-Type': 'application/json',
    'api-key': process.env.PAYPLUS_API_KEY || '',
    'secret-key': process.env.PAYPLUS_SECRET_KEY || ''
  };
}

/* הנפקת מסמכים דרך PayPlus. כבוי עד שמאשרים שהמודול פעיל
   בחשבון – ראו נושא 6 ב-docs/payplus-open-questions.md. */
function payplusInvoices() { return process.env.PAYPLUS_INVOICES === 'true'; }

function payplusKeysMissing() {
  return !process.env.PAYPLUS_API_KEY || !process.env.PAYPLUS_SECRET_KEY;
}

async function payplusCall(path, body) {
  const response = await fetch(payplusBase() + path, {
    method: 'POST',
    headers: payplusHeaders(),
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = null;
  if (text) { try { parsed = JSON.parse(text); } catch (err) { parsed = { message: text }; } }
  return { ok: response.ok, status: response.status, body: parsed };
}

function hmacBase64(secret, text) {
  return crypto.createHmac('sha256', secret).update(text, 'utf8').digest('base64');
}

/* קריאת שדה מכמה מקומות אפשריים. המסמך אינו קובע אם השדות יושבים
   בשורש ההודעה, תחת data או תחת transaction, ולכן מחפשים בשלושתם
   במקום לבחור אחד ולקוות. */
function payplusPick(body, names) {
  const scopes = [body, body && body.data, body && body.transaction,
    body && body.data && body.data.transaction];
  for (const scope of scopes) {
    if (!scope || typeof scope !== 'object') continue;
    for (const name of names) {
      const value = scope[name];
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }
  return null;
}

/* מה נחשב הצלחה אצל PayPlus. "000" הוא קוד ההצלחה המקובל אצלם,
   ו-success הוא מה שמסמך האינטגרציה מראה בתשובת generateLink. */
const PAYPLUS_APPROVED = ['success', 'approved', 'succeeded', '000', 'ok'];
const PAYPLUS_DECLINED = ['failed', 'failure', 'declined', 'error', 'rejected'];
const PAYPLUS_VOIDED = ['canceled', 'cancelled', 'void', 'refund', 'refunded'];

function payplusOutcome(value) {
  const text = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  if (!text) return 'unknown';
  if (PAYPLUS_APPROVED.indexOf(text) !== -1) return 'approved';
  if (PAYPLUS_DECLINED.indexOf(text) !== -1) return 'declined';
  if (PAYPLUS_VOIDED.indexOf(text) !== -1) return 'voided';
  return 'unknown';
}

const payplus = {
  /* אימות ההודעה החוזרת.
     שני מחסומים: user-agent בשם PayPlus, ואז HMAC-SHA256 בבסיס 64
     על הגוף. הראשון זול ורק מסנן רעש; השני הוא ההגנה האמיתית.

     חותמים על הבייטים שהתקבלו. אם משהו בדרך פירק וסידר מחדש את
     ה-JSON, הבייטים כבר אינם מה ש-PayPlus חתם עליו, ולכן מנסים גם
     את הצורה המסודרת מחדש. זה אינו מחליש דבר: בלי הסוד אי אפשר
     לייצר אף אחת משתי החתימות. */
  verify: function (raw, headers, secret) {
    if (!payplusReady()) return false;
    /* PayPlus חותם על ההודעה החוזרת באותו secret-key שבו מזדהים
       מול ה-API, ולכן אין סוד שלישי לנהל. BILLING_WEBHOOK_SECRET
       נשאר כאפשרות, למקרה שיונפק סוד נפרד. */
    const key = secret || process.env.PAYPLUS_SECRET_KEY;
    if (!key) return false;
    const head = headers || {};
    const agent = String(head['user-agent'] || head['User-Agent'] || '');
    if (agent.toLowerCase().indexOf('payplus') === -1) return false;
    const sent = head.hash || head['x-payplus-signature'] || '';
    if (!sent) return false;
    if (safeEqual(sent, hmacBase64(key, raw))) return true;
    let canonical = null;
    try { canonical = JSON.stringify(JSON.parse(raw)); } catch (err) { return false; }
    if (canonical === raw) return false;
    return safeEqual(sent, hmacBase64(key, canonical));
  },

  /* תרגום ההודעה החוזרת למבנה האחיד.
     קוראים מכאן רק זהות – מזהה עסקה, טוקן, ו-more_info ששלחנו –
     ולא סטטוס. הסטטוס נקבע ב-verifyTransaction, מול ipn-full,
     כי המסמך אומר במפורש שאין להסתמך על ההודעה כמקור אמת.

     שני סוגי הודעות מעניינים אותנו:
       שמירת כרטיס (J2): more_info נושא את מזהה החברה, ומגיע טוקן.
                         הסטטוס אינו משתנה – הלקוח עדיין בניסיון.
       חיוב:             more_info נושא את מפתח התקופה שלנו. */
  parse: function (body) {
    const transactionId = payplusPick(body, ['transaction_uid', 'uid']);
    const requestId = payplusPick(body, ['page_request_uid', 'payment_request_uid']);
    const token = payplusPick(body, ['token', 'card_token', 'token_uid', 'recurring_uid']);
    const moreInfo = payplusPick(body, ['more_info', 'more_info_1']);
    const customerId = payplusPick(body, ['customer_uid', 'customer_id']);

    /* מזהה האירוע למניעת עיבוד כפול. המסמך מצביע על transaction_uid
       כמזהה היציב; אם אין עסקה (שמירת כרטיס בלבד) נופלים למזהה
       בקשת התשלום, ואם גם הוא חסר – על טביעת אצבע של ההודעה.
       הודעה זהה תיתן אותו מזהה, וזה כל מה שצריך כאן. אחרת היינו
       דוחים את ההודעה, והם היו שולחים אותה שוב ושוב. */
    const id = transactionId || requestId ||
      crypto.createHash('sha256').update(JSON.stringify(body || {}), 'utf8')
        .digest('hex').slice(0, 32);

    /* שמירת כרטיס: more_info הוא מזהה החברה שלנו. חיוב: more_info
       הוא מפתח תקופה שלנו, בצורת charge:<חברה>:<תאריך>, ואז החברה
       כבר מקושרת ואין צורך לקשר שוב. */
    const linksCompany = moreInfo && String(moreInfo).indexOf('charge:') !== 0;

    return {
      id: id ? 'payplus:' + id : null,
      type: payplusPick(body, ['transaction_type', 'type']) || 'payplus.callback',
      subscriptionId: token || null,
      customerId: customerId || null,
      companyId: linksCompany ? String(moreInfo) : null,
      /* בכוונה ריק: הסטטוס מגיע מ-verifyTransaction בלבד */
      status: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: undefined,
      plan: null,
      transactionId: transactionId || null,
      moreInfo: moreInfo === null ? null : String(moreInfo),
      payload: body
    };
  },

  /* אימות העסקה מול PayPlus עצמו.
     זה הצעד ש-§15 במסמך שלהם קורא לו "אל תתייחס להפניה או להודעה
     כאל הוכחת תשלום". מחזיר:
       { verified: true, outcome, amount, currency }  אם נמצאה עסקה
       { verified: false, reason }                     אם לא

     בשמירת כרטיס בלי חיוב אין עסקה לאמת, ולכן מחזירים
     outcome: 'none' והמנוי אינו משנה סטטוס. */
  verifyTransaction: async function (event) {
    if (!payplusReady()) return { verified: false, reason: 'not-ready' };
    if (!event || !event.transactionId) return { verified: false, reason: 'no-transaction' };
    const result = await payplusCall('/PaymentPages/ipn-full', {
      transaction_uid: event.transactionId,
      related_transaction: true
    });
    if (!result.ok || !result.body) {
      return { verified: false, reason: 'http-' + result.status };
    }
    const status = (result.body.results && result.body.results.status) || null;
    if (payplusOutcome(status) === 'declined' && !result.body.data) {
      return { verified: false, reason: 'not-found' };
    }
    const data = result.body.data || {};
    const raw = payplusPick(data, ['status_code', 'status', 'transaction_status']);
    const amount = Number(payplusPick(data, ['amount', 'total_amount', 'original_amount']));
    return {
      verified: true,
      outcome: payplusOutcome(raw),
      rawStatus: raw === null ? null : String(raw),
      amount: isFinite(amount) ? amount : null,
      currency: payplusPick(data, ['currency_code', 'currency']),
      approvalNumber: payplusPick(data, ['approval_num', 'approval_number']),
      voucherNumber: payplusPick(data, ['voucher_num', 'voucher_number'])
    };
  },

  /* פתיחת דף תשלום.
     saveCardOnly פותח עסקת J2 – בדיקת כרטיס בלבד, בלי חיוב –
     ומבקש טוקן לשימוש עתידי. זה מה שמאפשר "14 יום בלי חיוב"
     להיות הבטחה ולא הימור: הכרטיס נשמר עכשיו, הכסף עובר רק
     כשמנוע החיוב היומי מחליט שהגיע הזמן.

     charge_method 4 הוא זיכוי, לא שמירת כרטיס. */
  createCheckout: async function (input) {
    if (!payplusReady()) {
      throw new Error(
        'PayPlus is not configured yet – set PAYPLUS_READY=true once the staging smoke test passes');
    }
    if (payplusKeysMissing()) {
      throw new Error('PAYPLUS_API_KEY / PAYPLUS_SECRET_KEY are missing');
    }
    if (!process.env.PAYPLUS_PAYMENT_PAGE_UID) {
      throw new Error('PAYPLUS_PAYMENT_PAGE_UID is missing');
    }

    const saveOnly = !!input.saveCardOnly;
    const request = {
      payment_page_uid: process.env.PAYPLUS_PAYMENT_PAGE_UID,
      /* 0 = J2 בדיקת כרטיס, 1 = J4 חיוב */
      charge_method: saveOnly ? 0 : 1,
      create_token: true,
      amount: input.amount,
      currency_code: input.currency || 'ILS',
      language_code: input.language || 'he',
      sendEmailApproval: !saveOnly,
      sendEmailFailure: false,
      /* דקות. דף שנשאר פתוח שעה אינו משרת איש. */
      expiry_datetime: '30',
      refURL_success: input.returnUrl,
      refURL_failure: input.failureUrl || input.cancelUrl,
      refURL_cancel: input.cancelUrl,
      refURL_callback: (process.env.PUBLIC_BASE_URL || '') + '/api/billing/webhook',
      send_failure_callback: true,
      /* חוזר אלינו כפי ששלחנו, ולכן נושא את מזהה החברה */
      more_info: input.companyId,
      more_info_2: input.plan || '',
      customer: {
        customer_name: input.companyName || '',
        email: input.email || ''
      }
    };

    /* חשבונית מופקת רק כשעבר כסף, ורק אם מודול המסמכים מופעל
       בחשבון. שדה של מודול שאינו פעיל עלול להפיל את הבקשה כולה,
       ולכן זה לא דולק לבד. */
    if (!saveOnly && payplusInvoices()) request.initial_invoice = true;

    const result = await payplusCall('/PaymentPages/generateLink', request);
    if (!result.ok || !result.body) {
      throw new Error('PayPlus checkout failed: HTTP ' + result.status);
    }
    const status = result.body.results && result.body.results.status;
    if (payplusOutcome(status) !== 'approved') {
      const why = (result.body.results && result.body.results.description) || 'unknown';
      throw new Error('PayPlus refused to open a payment page: ' + why);
    }
    const data = result.body.data || {};
    const url = data.payment_page_link || null;
    if (!url) throw new Error('PayPlus returned no payment page link');
    return { url: url, requestId: data.page_request_uid || null };
  },

  /* חיוב לפי טוקן שמור. נקרא רק ממנוע החיוב היומי.

     המבנה לקוח מדוגמת ה-J5 שבמסמך – אותו מסוף, אותם תנאי אשראי,
     ו-use_token שמחליף את פרטי הכרטיס בטוקן. המסמך אינו מציג את
     נתיב החיוב עצמו, ולכן הוא מוגדר כאן ומאומת מול סביבת הבדיקות
     ב-tools/payplus-smoke.js לפני הפעלה בייצור. */
  charge: async function (input) {
    if (!payplusReady()) {
      throw new Error(
        'PayPlus is not configured yet – set PAYPLUS_READY=true once the staging smoke test passes');
    }
    if (payplusKeysMissing()) {
      throw new Error('PAYPLUS_API_KEY / PAYPLUS_SECRET_KEY are missing');
    }
    if (!process.env.PAYPLUS_TERMINAL_UID) {
      throw new Error('PAYPLUS_TERMINAL_UID is missing');
    }
    if (!input || !input.subscriptionId) {
      return { ok: false, reason: 'no-token', retryable: false };
    }

    const request = {
      terminal_uid: process.env.PAYPLUS_TERMINAL_UID,
      amount: input.amount,
      currency_code: input.currency || 'ILS',
      credit_terms: 1,
      use_token: true,
      credit_card: { token: input.subscriptionId },
      /* חוזר אלינו בהודעה, ולכן הוא מפתח מניעת הכפילות שלנו */
      more_info: input.idempotencyKey
    };
    if (payplusInvoices()) request.initial_invoice = true;
    if (process.env.PAYPLUS_CASHIER_UID) {
      request.cashier_uid = process.env.PAYPLUS_CASHIER_UID;
    }
    if (input.customerId) request.customer_uid = input.customerId;

    let result;
    try {
      result = await payplusCall('/Transactions/Charge', request);
    } catch (err) {
      /* הרשת נפלה. איננו יודעים אם הכרטיס חויב, ולכן זה אינו
         כישלון שמותר לנסות שוב בעיוורון. */
      return { ok: false, reason: 'network: ' + (err && err.message), retryable: false,
        uncertain: true };
    }

    if (!result.body) {
      return { ok: false, reason: 'http-' + result.status, retryable: false, uncertain: true };
    }
    if (!result.ok) {
      /* 4xx הוא בקשה פסולה – ניסיון חוזר זהה ייכשל באותו אופן.
         5xx הוא צד שלהם, ואיננו יודעים מה קרה לכרטיס. */
      const clientError = result.status >= 400 && result.status < 500;
      return {
        ok: false,
        reason: payplusReason(result.body) || ('http-' + result.status),
        retryable: false,
        uncertain: !clientError
      };
    }

    const status = result.body.results && result.body.results.status;
    if (payplusOutcome(status) !== 'approved') {
      return {
        ok: false,
        reason: payplusReason(result.body) || 'declined',
        /* סירוב של חברת האשראי – מחר אולי תהיה מסגרת */
        retryable: true
      };
    }
    const data = result.body.data || {};
    return {
      ok: true,
      transactionId: data.transaction_uid || null,
      approvalNumber: data.approval_num || null
    };
  }
};

function payplusReason(body) {
  const results = body && body.results;
  if (!results) return null;
  const parts = [results.code, results.description].filter(function (part) {
    return part !== undefined && part !== null && part !== '';
  });
  return parts.length ? parts.join(' ') : null;
}

/* ספקים גלובליים – יחוברו אם וכאשר תהיה מכירה מחוץ לישראל */
function notImplemented(name) {
  return {
    verify: function () { return false; },
    parse: function () {
      throw new Error('Billing provider "' + name + '" is not implemented yet');
    },
    charge: function () {
      throw new Error('Billing provider "' + name + '" is not implemented yet');
    },
    createCheckout: function () {
      throw new Error('Billing provider "' + name + '" is not implemented yet');
    }
  };
}

module.exports = {
  mock: mock,
  payplus: payplus,
  paddle: notImplemented('paddle'),
  stripe: notImplemented('stripe')
};
