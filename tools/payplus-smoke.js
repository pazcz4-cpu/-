#!/usr/bin/env node
/* בדיקת עשן מול סביבת הבדיקות של PayPlus.

   למה הכלי הזה קיים: מסמך האינטגרציה של PayPlus קובע את רוב
   הדברים, אבל לא את נתיב החיוב מטוקן שמור. הוא נכתב אצלנו לפי
   מבנה עסקת ה-J5 שבמסמך, ולפני שנוגעים בכסף אמיתי צריך לראות
   אותו עובד מול שרת אמיתי. הכלי מריץ את הזרימה האמיתית, מדפיס
   מה חזר, ואומר בסוף אם מותר להדליק PAYPLUS_READY.

   הרצה:
     PAYPLUS_SANDBOX=true \
     PAYPLUS_API_KEY=...  PAYPLUS_SECRET_KEY=... \
     PAYPLUS_PAYMENT_PAGE_UID=... PAYPLUS_TERMINAL_UID=... \
     PUBLIC_BASE_URL=https://setshifts.com \
     node tools/payplus-smoke.js

   אחרי שלב 1 הכלי עוצר ומבקש לפתוח את דף התשלום ולהזין כרטיס
   בדיקה. משם מעתיקים את הטוקן שחזר בהודעה החוזרת ומריצים שוב
   עם --token=... כדי לבדוק את החיוב.

   המפתחות נקראים ממשתני הסביבה ואינם מודפסים לעולם. */
'use strict';

const args = {};
process.argv.slice(2).forEach((arg) => {
  const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
  if (match) args[match[1]] = match[2] === undefined ? true : match[2];
});

/* הכלי בודק את הקוד האמיתי, לא העתק שלו */
process.env.PAYPLUS_READY = 'true';
const providers = require('../api/billing/_providers.js');
const payplus = providers.payplus;

const RED = '\u001b[31m', GREEN = '\u001b[32m', DIM = '\u001b[2m', OFF = '\u001b[0m';
function ok(text) { console.log(GREEN + '  ✓ ' + OFF + text); }
function bad(text) { console.log(RED + '  ✗ ' + OFF + text); }
function note(text) { console.log(DIM + '    ' + text + OFF); }

/* מדפיס תשובה בלי המפתחות ובלי מה שאסור לשמור */
const NEVER_PRINT = ['api-key', 'secret-key', 'api_key', 'secret_key',
  'card_number', 'cvv', 'token'];
function safe(value) {
  if (Array.isArray(value)) return value.map(safe);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  Object.keys(value).forEach((key) => {
    if (NEVER_PRINT.indexOf(key) !== -1) {
      out[key] = value[key] ? '‹' + String(value[key]).length + ' תווים›' : value[key];
      return;
    }
    out[key] = safe(value[key]);
  });
  return out;
}

const MISSING = ['PAYPLUS_API_KEY', 'PAYPLUS_SECRET_KEY', 'PAYPLUS_PAYMENT_PAGE_UID']
  .filter((name) => !process.env[name]);

async function main() {
  console.log('\nבדיקת עשן – PayPlus');
  console.log('סביבה: ' + (process.env.PAYPLUS_SANDBOX === 'true'
    ? 'בדיקות (restapidev)'
    : RED + 'ייצור (restapi) – כאן עובר כסף אמיתי' + OFF));

  if (MISSING.length) {
    bad('חסרים משתני סביבה: ' + MISSING.join(', '));
    note('הערכים נלקחים מלוח הבקרה של PayPlus ונכנסים למשתני הסביבה בלבד.');
    process.exitCode = 1;
    return;
  }

  let failures = 0;

  console.log('\n1 · פתיחת דף תשלום לשמירת כרטיס (J2, בלי חיוב)');
  let checkout = null;
  try {
    checkout = await payplus.createCheckout({
      companyId: args.company || 'smoke-' + Date.now(),
      companyName: 'SetShifts smoke test',
      email: args.email || '',
      plan: 'starter',
      amount: Number(args.amount || 199),
      currency: 'ILS',
      saveCardOnly: true,
      returnUrl: (process.env.PUBLIC_BASE_URL || 'https://example.com') + '/app/?billing=done',
      failureUrl: (process.env.PUBLIC_BASE_URL || 'https://example.com') + '/app/?billing=failed',
      cancelUrl: (process.env.PUBLIC_BASE_URL || 'https://example.com') + '/app/?billing=canceled'
    });
    ok('דף התשלום נפתח');
    note('כתובת: ' + checkout.url);
    if (checkout.requestId) note('page_request_uid: ' + checkout.requestId);
  } catch (err) {
    failures++;
    bad('פתיחת דף התשלום נכשלה: ' + err.message);
    note('זה השלב שבודק את ההזדהות, את מזהה דף התשלום ואת charge_method.');
  }

  if (!args.token) {
    console.log('\n2 · חיוב מטוקן שמור');
    note('מדלג: אין טוקן. פתחו את הדף שלמעלה, הזינו כרטיס בדיקה,');
    note('קחו את הטוקן מההודעה החוזרת, והריצו שוב עם --token=...');
    console.log('\n' + (failures ? RED + 'יש מה לתקן' : DIM + 'חצי הדרך') + OFF + '\n');
    process.exitCode = failures ? 1 : 0;
    return;
  }

  console.log('\n2 · חיוב מטוקן שמור');
  let charge = null;
  try {
    charge = await payplus.charge({
      subscriptionId: args.token,
      customerId: args.customer || null,
      amount: Number(args.amount || 1),
      currency: 'ILS',
      idempotencyKey: 'smoke:' + new Date().toISOString().slice(0, 19)
    });
    if (charge.ok) {
      ok('החיוב עבר');
      note('transaction_uid: ' + charge.transactionId);
    } else {
      failures++;
      bad('החיוב לא עבר: ' + charge.reason);
      note('אם הסיבה היא נתיב או שדה – זה בדיוק מה שהכלי נועד לגלות.');
      note('התאימו את payplus.charge ב-api/billing/_providers.js והריצו שוב.');
    }
  } catch (err) {
    failures++;
    bad('החיוב זרק: ' + err.message);
  }

  if (charge && charge.ok && charge.transactionId) {
    console.log('\n3 · אימות העסקה מול ipn-full');
    const verified = await payplus.verifyTransaction({ transactionId: charge.transactionId });
    if (verified.verified) {
      ok('העסקה נמצאה ואומתה');
      note(JSON.stringify(safe(verified)));
      if (verified.outcome !== 'approved') {
        failures++;
        bad('הסטטוס שחזר אינו מזוהה כאישור: ' + verified.rawStatus);
        note('הוסיפו אותו ל-PAYPLUS_APPROVED ב-_providers.js.');
      }
    } else {
      failures++;
      bad('העסקה לא אומתה: ' + verified.reason);
    }
  }

  console.log('');
  if (failures) {
    console.log(RED + 'נכשלו ' + failures + ' שלבים. PAYPLUS_READY נשאר כבוי.' + OFF + '\n');
    process.exitCode = 1;
    return;
  }
  console.log(GREEN + 'כל השלבים עברו.' + OFF);
  note('אפשר להדליק PAYPLUS_READY=true בסביבה שנבדקה.');
  note('ייצור נבדק בנפרד, עם המפתחות שלו – הם אינם אותם מפתחות.');
  console.log('');
}

main().catch((err) => {
  bad('הכלי נפל: ' + err.message);
  process.exitCode = 1;
});
