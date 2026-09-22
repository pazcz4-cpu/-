/* אשף הפתיחה נפתח על כל חשבון חדש ומכסה את המסך, כמו שהוא אמור.
   בדיקה שנוגעת במסכים עצמם מדלגת עליו מראש – בדיוק כמו לקוח
   שלחץ "דילוג" – כדי שהיא תבדוק את מה שהיא באה לבדוק.

   האשף עצמו נבדק ב-onboarding-browser-test.mjs, שאינו קורא לזה. */
export async function skipWizard(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('setshifts-onboarding', 'skipped'); }
    catch (err) { /* מצב פרטי */ }
  });
}
