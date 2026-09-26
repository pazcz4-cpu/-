/* קופונים: הנפקה, כיבוי, ומי מימש.

   למה זה כאן ולא ב-SQL: קופון נוצר בשביל קמפיין, וקמפיין נולד
   בשיחה ולא בעורך שאילתות. מי שצריך לפתוח psql כדי לתת הנחה
   פשוט לא ייתן אותה -- או יתן אותה בטלפון, בלי שאיש יידע כמה
   ניתנו ולמי.

   מה שאין כאן בכוונה: עריכה של קופון קיים ומחיקה.

   קופון שכבר נשלח בהודעה ללקוחות אינו טיוטה -- הוא הבטחה
   שיצאה החוצה, ושינוי שלה בדיעבד פירושו לקוח שיקליד את מה
   שהובטח לו ויקבל משהו אחר. מה שכן אפשר הוא לכבות אותו, וזה
   משאיר את ההיסטוריה שלמה: מי מימש, מתי, ומה קיבל.

   המחיקה חסומה גם מסיבה שנייה: יומן המימושים מצביע על הקוד,
   ומחיקה הייתה שוברת את הקישור או מוחקת איתו את הרשומות. */
'use strict';

const Model = require('../../js/backend/model.js');

const MAX_LIST = 200;

/* כמה מימושים לכל קופון, בשאילתה אחת ולא אחת לכל שורה */
async function redemptionCounts(db, codes) {
  const out = {};
  if (!codes.length) return out;
  const call = await db('/coupon_redemptions?select=code,company_id&code=in.(' +
    codes.map(encodeURIComponent).join(',') + ')&limit=5000');
  ((call.ok && call.body) || []).forEach(function (row) {
    out[row.code] = (out[row.code] || 0) + 1;
  });
  return out;
}

module.exports = async function ({ user, body, db }) {
  const action = String((body && body.action) || 'list');

  if (action === 'list') {
    const call = await db('/coupons?select=*&order=created_at.desc&limit=' + MAX_LIST);
    if (!call.ok) return { status: 500, body: { message: 'Could not read coupons' } };
    const coupons = call.body || [];

    const counts = await redemptionCounts(db, coupons.map(function (row) { return row.code; }));

    /* המימושים האחרונים, עם שם הלקוח. זה מה שעונה על "עבד?"
       בלי לפתוח עוד מסך. */
    const recent = await db('/coupon_redemptions?select=*&order=created_at.desc&limit=50');
    const rows = (recent.ok && recent.body) || [];
    const ids = Object.keys(rows.reduce(function (acc, row) {
      acc[row.company_id] = true; return acc;
    }, {}));
    const names = {};
    if (ids.length) {
      const companies = await db('/companies?select=id,name&id=in.(' +
        ids.map(encodeURIComponent).join(',') + ')');
      ((companies.ok && companies.body) || []).forEach(function (company) {
        names[company.id] = company.name;
      });
    }

    return {
      body: {
        ok: true,
        coupons: coupons.map(function (coupon) {
          return Object.assign({}, coupon, { redeemed: counts[coupon.code] || 0 });
        }),
        redemptions: rows.map(function (row) {
          return Object.assign({}, row, { companyName: names[row.company_id] || null });
        })
      }
    };
  }

  if (action === 'create') {
    const code = Model.normalizeCouponCode(body && body.code);
    const kind = String((body && body.kind) || '');
    const value = Math.round(Number((body && body.value) || 0));

    /* נבדק כאן וגם באילוצים של הטבלה. כאן -- כדי שמי שטעה יקבל
       משפט ולא שגיאת בסיס נתונים; שם -- כי הטבלה היא המקום
       היחיד שאי אפשר לעקוף. */
    if (code.length < 2) {
      return { status: 400, body: { message: 'קוד קצר מדי. שתי אותיות או ספרות לפחות.' } };
    }
    if (Model.COUPON_KINDS.indexOf(kind) === -1) {
      return { status: 400, body: { message: 'סוג קופון לא מוכר: ' + kind } };
    }
    if (!(value > 0)) {
      return { status: 400, body: { message: 'הערך חייב להיות גדול מאפס.' } };
    }
    if (kind === Model.COUPON.PERCENT && value > 100) {
      return { status: 400, body: { message: 'הנחה באחוזים אינה יכולה לעלות על 100.' } };
    }

    const maxUses = Math.round(Number((body && body.maxUses) || 0));
    const validUntil = String((body && body.validUntil) || '').trim();

    const row = {
      code: code,
      kind: kind,
      value: value,
      note: String((body && body.note) || '').slice(0, 300) || null,
      max_uses: maxUses > 0 ? maxUses : null,
      /* תאריך בלבד מגיע מהטופס. סוף היום ולא תחילתו: קופון
         שתקף "עד 31.12" אמור לעבוד גם ב-31.12 בערב. */
      valid_until: validUntil ? validUntil + 'T23:59:59Z' : null,
      active: true
    };

    const call = await db('/coupons', { method: 'POST', body: [row] });
    if (!call.ok) {
      const duplicate = call.status === 409 ||
        (call.body && String(call.body.code) === '23505');
      return {
        status: duplicate ? 409 : 500,
        body: { message: duplicate ? 'הקוד הזה כבר קיים.' : 'הקופון לא נוצר.' }
      };
    }
    return { body: { ok: true, coupon: (call.body || [])[0] || row } };
  }

  if (action === 'toggle') {
    const code = Model.normalizeCouponCode(body && body.code);
    if (!code) return { status: 400, body: { message: 'חסר קוד.' } };
    const active = !!(body && body.active);
    const call = await db('/coupons?code=eq.' + encodeURIComponent(code), {
      method: 'PATCH', body: { active: active }
    });
    if (!call.ok || !(call.body || []).length) {
      return { status: 404, body: { message: 'הקופון לא נמצא.' } };
    }
    return { body: { ok: true, code: code, active: active } };
  }

  return { status: 400, body: { message: 'Unknown action: ' + action } };
};
