/* עסק מאויש לבדיקות.

   אין במסך כפתור "טעינת נתוני דוגמה" – סביבת הדגמה בחשבון של
   לקוח היא נתונים שאפשר לפרסם בטעות. אבל מסלול דפדפן שבודק
   שיבוץ צריך עובדים וסניפים, ולהקליד שמונה עובדים בכל בדיקה זה
   קוד שנשבר ולא בודק כלום. לכן הטעינה נעשית כאן דרך ה-API.

   את מה שהלקוח רואה – חשבון שנפתח ריק – בודקים במפורש לפני
   הקריאה לזה, ולא בהיעדרה. */
export async function loadSample(page) {
  const added = await page.evaluate(() => {
    const app = window.ShiftApp;
    const state = app.getState();
    const result = window.ShiftStore.loadSampleData(state);
    if (!result.employees) return result;
    /* addEmployee/addBranch שומרים לשרת; applyRemoteConfig רק
       מצייר. לכן הטעינה עוברת דרך הראשונים, וכך גם נבדק בדרך
       שהשמירה האמיתית עובדת. */
    const employees = state.employees.slice();
    const branches = state.branches.slice();
    state.employees = [];
    state.branches = [];
    branches.forEach(function (branch) {
      const created = app.addBranch(branch.name, true);
      created.schedule = branch.schedule;
      created.active = branch.active;
    });
    employees.forEach(function (emp) {
      const created = app.addEmployee(emp.name, true);
      created.branches = emp.branches;
      created.shifts = emp.shifts;
      created.maxShifts = emp.maxShifts;
      created.active = emp.active;
    });
    app.applyRemoteConfig({
      settings: state.settings, branches: state.branches, employees: state.employees
    });
    app.persistConfig();
    return result;
  });
  if (!added.employees) throw new Error('לא נטענו עובדים לבדיקה');
  await page.waitForTimeout(600);
  return added;
}
