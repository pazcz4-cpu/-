/* חשבון חדש נפתח ריק, ונתוני הדוגמה נטענים בלחיצה מפורשת.
   בדיקות שצריכות עסק מאויש קוראות לזה מיד אחרי ההרשמה, בדיוק
   כמו לקוח שלוחץ "טעינת עסק לדוגמה" במסך העובדים הריק. */
export async function loadSample(page) {
  await page.click('.tab[data-tab="employees"]');
  await page.waitForTimeout(400);
  await page.click('#load-sample');
  await page.waitForTimeout(700);
  /* חוזרים ללשונית הפתיחה, כדי שהבדיקה תמשיך מאיפה שהייתה */
  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(400);
}
