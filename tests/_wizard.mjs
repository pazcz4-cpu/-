/* אשף הפתיחה נפתח על כל חשבון חדש ומכסה את המסך, כמו שהוא אמור.
   בדיקה שנוגעת במסכים עצמם מדלגת עליו מראש – בדיוק כמו לקוח
   שלחץ "דילוג" – כדי שהיא תבדוק את מה שהיא באה לבדוק.

   האשף עצמו נבדק ב-onboarding-browser-test.mjs, שאינו קורא לזה. */
export async function skipWizard(page, options) {
  const realDefaultWeek = !!(options && options.defaultWeek);
  await page.addInitScript((keepDefault) => {
    try { localStorage.setItem('setshifts-onboarding', 'skipped'); }
    catch (err) { /* מצב פרטי */ }
    /* המנהל נפתח על השבוע הבא. רוב הבדיקות מזינות נתונים לשבוע של
       היום, ולכן הן נפתחות על השבוע הנוכחי; מי שבודק את ברירת
       המחדל עצמה מבקש אותה כאן. */
    if (!keepDefault) window.SHIFT_START_WEEK = 'current';
  }, realDefaultWeek);
}
