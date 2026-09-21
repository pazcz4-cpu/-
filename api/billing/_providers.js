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
   מה שידוע ומאומת:
     · כתובות: restapi.payplus.co.il (ייצור),
               restapidev.payplus.co.il (בדיקות)
     · אימות מול ה-API: api_key + secret_key
     · חתימת ההודעה החוזרת מגיעה בכותרת hash

   מה שעדיין צריך לאמת מול התיעוד של PayPlus לפני הפעלה בייצור –
   שלושת הדברים שמסומנים למטה ב-TODO. לא ניחשתי אותם: שם שדה שגוי
   בקוד תשלומים נכשל דווקא ברגע שעובר כסף, וקוד שנראה תקין ונכשל
   שם גרוע מקוד שאומר במפורש שהוא לא מוכן.

   כל עוד PAYPLUS_READY אינו true, verify מחזיר false ו-charge
   זורק – כלומר שום דבר לא מתקבל ושום כרטיס לא מחויב.
   ============================================================ */

const PAYPLUS_READY = process.env.PAYPLUS_READY === 'true';

function payplusBase() {
  return process.env.PAYPLUS_SANDBOX === 'true'
    ? 'https://restapidev.payplus.co.il/api/v1.0'
    : 'https://restapi.payplus.co.il/api/v1.0';
}

/* PayPlus מצפה לפרטי ההזדהות בכותרת Authorization כמסמך JSON.
   TODO 1 – לאמת את המבנה המדויק מול התיעוד. */
function payplusAuthHeader() {
  return JSON.stringify({
    api_key: process.env.PAYPLUS_API_KEY,
    secret_key: process.env.PAYPLUS_SECRET_KEY
  });
}

async function payplusCall(path, body) {
  const response = await fetch(payplusBase() + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: payplusAuthHeader()
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = null;
  if (text) { try { parsed = JSON.parse(text); } catch (err) { parsed = { message: text }; } }
  return { ok: response.ok, status: response.status, body: parsed };
}

const payplus = {
  /* TODO 2 – אלגוריתם החתימה.
     החתימה מגיעה בכותרת hash. צריך לאמת מול התיעוד: איזה אלגוריתם
     (ככל הנראה HMAC-SHA256), באיזה קידוד (hex או base64), ועל מה
     בדיוק חותמים – גוף הבקשה הגולמי או צירוף של שדות נבחרים. */
  verify: function (raw, headers, secret) {
    if (!PAYPLUS_READY) return false;
    if (!secret) return false;
    const sent = headers.hash || headers['x-payplus-signature'] || '';
    if (!sent) return false;
    const expected = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('base64');
    return safeEqual(sent, expected);
  },

  /* TODO 3 – שמות השדות בהודעה החוזרת, ומיפוי הסטטוסים.
     הסטטוסים שצריך למפות אליהם:
       תקופת ניסיון פעילה → 'trial'
       חיוב עבר           → 'active'
       חיוב נכשל          → 'past_due'
       בוטל               → 'canceled' (או cancelAtPeriodEnd)
       פג ולא חודש        → 'expired' */
  parse: function () {
    throw new Error(
      'PayPlus parse is not configured yet – see TODO 3 in api/billing/_providers.js');
  },

  /* פתיחת דף תשלום לשמירת כרטיס.
     TODO 1 (המשך) – הנתיב ושמות השדות של יצירת דף תשלום, והדרך
     לבקש שמירת טוקן בלי חיוב (ב-PayPlus זו בדרך כלל עסקת אימות
     או בקשת טוקן ייעודית). */
  createCheckout: async function (input) {
    if (!PAYPLUS_READY) {
      throw new Error(
        'PayPlus is not configured yet – set PAYPLUS_READY=true after filling the TODOs');
    }
    const result = await payplusCall('/PaymentPages/generateLink', {
      payment_page_uid: process.env.PAYPLUS_PAYMENT_PAGE_UID,
      charge_method: input.saveCardOnly ? 4 : 1,   // TODO: לאמת את הקוד לשמירת טוקן
      amount: input.amount,
      currency_code: input.currency || 'ILS',
      sendEmailApproval: false,
      refURL_success: input.returnUrl,
      refURL_cancel: input.cancelUrl,
      refURL_callback: (process.env.PUBLIC_BASE_URL || '') + '/api/billing/webhook',
      more_info: input.companyId,
      customer: { customer_name: input.companyName }
    });
    if (!result.ok || !result.body) {
      throw new Error('PayPlus checkout failed: HTTP ' + result.status);
    }
    return { url: result.body.data && result.body.data.payment_page_link };
  },

  /* חיוב לפי טוקן שמור. נקרא מה-cron היומי בתום תקופת הניסיון
     ובכל חידוש חודשי. */
  charge: async function (input) {
    if (!PAYPLUS_READY) {
      throw new Error(
        'PayPlus is not configured yet – set PAYPLUS_READY=true after filling the TODOs');
    }
    if (!process.env.PAYPLUS_API_KEY || !process.env.PAYPLUS_SECRET_KEY) {
      throw new Error('PAYPLUS_API_KEY / PAYPLUS_SECRET_KEY are missing');
    }

    /* TODO 1 (המשך) – הנתיב ושמות השדות של חיוב לפי טוקן.
       more_info משמש כמזהה חופשי שחוזר בהודעה, ולכן הוא המקום
       הטבעי למפתח מניעת הכפילות שלנו. */
    const result = await payplusCall('/Transactions/Charge', {
      terminal_uid: process.env.PAYPLUS_TERMINAL_UID,
      amount: input.amount,
      currency_code: input.currency || 'ILS',
      token: input.subscriptionId,
      customer_uid: input.customerId,
      more_info: input.idempotencyKey
    });

    if (!result.ok || !result.body) {
      return { ok: false, reason: 'http-' + result.status, retryable: true };
    }
    const status = result.body.results && result.body.results.status;
    if (status !== 'success') {
      return {
        ok: false,
        reason: (result.body.results && result.body.results.description) || 'declined',
        retryable: true
      };
    }
    return {
      ok: true,
      transactionId: result.body.data && result.body.data.transaction_uid
    };
  }
};

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
