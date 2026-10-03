/* טופס הליד בדף הבית: שואל חמש שאלות, לא שולח בלי הסכמה, ושולח
   את מקור ההגעה רק אם יש מדידה מאושרת. הרצה: node tests/lead-browser-test.mjs */
import { createRequire } from 'node:module';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const failures = [];
function check(name, condition, detail) {
  if (condition) { console.log('  ✓ ' + name); return; }
  failures.push(name + (detail ? ' — ' + detail : ''));
  console.log('  ✗ ' + name + (detail ? ' — ' + detail : ''));
}

/* כל השפות מגדירות את אותם מפתחות, אחרת שפה אחת תציג undefined */
const Lead = require('../js/lead.js');
const base = Object.keys(Lead.ShiftLead ? Lead.ShiftLead.TEXT.he : (globalThis.ShiftLead || {}).TEXT.he);
const TEXT = (globalThis.ShiftLead || Lead.ShiftLead).TEXT;
console.log('\n== שמונה שפות, אותם מפתחות ==');
Object.keys(TEXT).forEach((lang) => {
  const keys = Object.keys(TEXT[lang]);
  check(lang + ': כל המפתחות', base.every((k) => keys.indexOf(k) !== -1), base.filter((k) => keys.indexOf(k) === -1).join(','));
  check(lang + ': כל השגיאות', Object.keys(TEXT.he.err).every((k) => TEXT[lang].err[k]));
  check(lang + ': כל דליי הזמן', Object.keys(TEXT.he.hourOpts).every((k) => k in TEXT[lang].hourOpts));
});
check('שמונה שפות', Object.keys(TEXT).length === 8);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let sent = null;
let reply = { status: 200, body: '{"ok":true}' };
await page.route('**/api/contact', async (route) => {
  sent = JSON.parse(route.request().postData() || '{}');
  await route.fulfill({ status: reply.status, contentType: 'application/json', body: reply.body });
});

console.log('\n== טופס בדף הבית ==');
await page.goto(url('landing.html'));
await page.waitForTimeout(500);
check('הטופס מצויר בדף הבית', await page.locator('#lead .lead-form').count() === 1);
check('מוצגות תוויות לכל שדה', (await page.locator('#lead .contact-field > span').count()) >= 6);
check('ההטבה מוצגת לפני המחיר',
  await page.evaluate(() => {
    const a = document.getElementById('onboarding'), b = document.getElementById('pricing');
    return !!a && !!b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  }));
check('ההטבה מזכירה איפיון ושהוא כלול', /איפיון/.test(await page.locator('#onboarding').innerText()) && /כלול/.test(await page.locator('#onboarding').innerText()));
check('קישור מהכותרת הראשית לטופס', await page.locator('a[href="#lead"]').count() >= 1);

const fill = async () => {
  await page.fill('#lead-business', 'קפה הנחל');
  await page.fill('#lead-name', 'דנה כהן');
  await page.fill('#lead-phone', '054-1234567');
  await page.fill('#lead-email', 'dana@cafe.co.il');
  await page.fill('#lead-employees', '14');
  await page.selectOption('#lead-hours', '3-6');
};
const status = () => page.locator('#lead .contact-status').innerText();

await fill();
await page.click('#lead .lead-form button[type="submit"]');
await page.waitForTimeout(200);
check('בלי הסכמה לא נשלח דבר', sent === null);
check('נאמר שחסרה הסכמה', /הסכמה/.test(await status()), await status());

await page.check('#lead-consent');
await page.click('#lead .lead-form button[type="submit"]');
await page.waitForTimeout(500);
check('אחרי הסכמה נשלח', !!sent);
check('נשלח כליד עם כל התשובות', !!sent && sent.kind === 'lead' && sent.business === 'קפה הנחל' &&
  sent.employees === 14 && sent.hours === '3-6' && sent.consent === true, JSON.stringify(sent));
check('נשמר נוסח ההסכמה כפי שהוצג', !!sent && /שיחזרו אליי/.test(sent.consentText || ''));
check('בלי מדידה מאושרת אין מקור הגעה', !!sent && !sent.utm, JSON.stringify(sent && sent.utm));
check('מוצגת הודעת תודה עם שעות הפעילות', /09:00/.test(await status()) && /15:30/.test(await status()), await status());
check('הטופס התרוקן', (await page.inputValue('#lead-business')) === '');

console.log('\n== מקור הגעה רק עם הסכמה למדידה ==');
sent = null;
await page.evaluate(() => {
  localStorage.setItem('setshifts-utm', JSON.stringify({ utm_source: 'facebook', utm_campaign: 'owners-pain', at: Date.now() }));
});
await page.reload();
await page.waitForTimeout(500);
await fill(); await page.check('#lead-consent');
await page.click('#lead .lead-form button[type="submit"]');
await page.waitForTimeout(500);
check('עם utm שמור (שנשמר רק אחרי הסכמה) הוא נשלח',
  !!sent && !!sent.utm && sent.utm.utm_source === 'facebook', JSON.stringify(sent && sent.utm));

console.log('\n== כשלים ==');
reply = { status: 429, body: '{}' };
sent = null; await fill(); await page.check('#lead-consent');
await page.click('#lead .lead-form button[type="submit"]');
await page.waitForTimeout(400);
check('הגבלת קצב מוצגת בעברית', /כמה דקות/.test(await status()), await status());
check('הכפתור חזר להיות פעיל', await page.locator('#lead button[type="submit"]').isEnabled());

check('בלי שגיאות דפדפן', errors.length === 0, errors.join('; '));
await browser.close();
if (failures.length) { console.log('\n❌ נכשלו: ' + failures.length); process.exit(1); }
console.log('\n✅ הכל עבר');
