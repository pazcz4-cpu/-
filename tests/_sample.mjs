/* עסק מאויש לבדיקות.

   אין במסך כפתור "טעינת נתוני דוגמה" – סביבת הדגמה בחשבון של
   לקוח היא נתונים שאפשר לפרסם בטעות. אבל מסלול דפדפן שבודק
   שיבוץ צריך עובדים וסניפים, ולהקליד שמונה עובדים בכל בדיקה זה
   קוד שנשבר ולא בודק כלום. לכן הטעינה נעשית כאן דרך ה-API.

   את מה שהלקוח רואה – חשבון שנפתח ריק – בודקים במפורש לפני
   הקריאה לזה, ולא בהיעדרה. */
export async function loadSample(page, options) {
  const keepDeadline = !!(options && options.keepDeadline);
  const added = await page.evaluate((keepDeadline) => {
    const app = window.ShiftApp;
    const state = app.getState();
    const result = window.ShiftStore.loadSampleData(state);
    if (!result.employees) return result;
    /* טעינה ישירה למצב, ולא בנייה מחדש דרך addEmployee/addBranch:
       אלה מגרילים מזהים חדשים לסניפים, והשיוך של העובדים לסניפים
       – שמגיע מהדוגמה עם המזהים המקוריים – היה מצביע לסניפים
       שאינם קיימים. התוצאה: עסק שנראה מלא ושאי אפשר לשבץ בו. */
    /* מועד סגירת ההגשות דלוק כברירת מחדל (רביעי 18:00), והבדיקות
       עובדות על השבוע הנוכחי – כלומר אחרי המועד. בדיקה שעוסקת בעצם
       המועד מדליקה אותו בעצמה. */
    if (!keepDeadline) {
      state.settings.constraintsDeadline = Object.assign({}, state.settings.constraintsDeadline, { enabled: false });
    }
    app.applyRemoteConfig({
      settings: state.settings, branches: state.branches, employees: state.employees
    });
    app.persistConfig();
    return result;
  }, keepDeadline);
  if (!added.employees) throw new Error('לא נטענו עובדים לבדיקה');
  await page.waitForTimeout(700);
  return added;
}
