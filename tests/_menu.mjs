/* פעולות שיושבות בתפריטי הסרגל ("ייצוא", "כלים נוספים") אינן
   גלויות עד שפותחים אותם. כאן פותחים את התפריט הנכון ולוחצים,
   בדיוק כמו משתמש. */
const IN_TOOLS = ['#view-only-toggle', '#clear-week', '#keep-manual', '#shabbat-end', '#holiday-days'];
const IN_EXPORT = ['#export-excel', '#export-csv', '#copy-text', '#print',
  '#personal-employee', '#personal-excel', '#personal-text'];

function menuFor(selector) {
  if (IN_TOOLS.some(id => selector.startsWith(id))) return '#tools-menu';
  if (IN_EXPORT.some(id => selector.startsWith(id))) return '#export-menu';
  return null;
}

/* פותח את התפריט שבו יושב הפריט, אם הוא עוד לא פתוח */
export async function openMenuFor(page, selector) {
  const button = menuFor(selector);
  if (!button) return;
  const expanded = await page.locator(button).getAttribute('aria-expanded');
  if (expanded === 'true') return;
  await page.click(button);
  await page.waitForTimeout(250);
}

export async function clickTool(page, selector) {
  await openMenuFor(page, selector);
  await page.click(selector);
  await page.waitForTimeout(250);
}
