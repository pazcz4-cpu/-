/* מעקב שיווקי בדפדפן: כבוי כברירת מחדל, ובאנר הסכמה כשיש מזהה.
   הרצה: node tests/tracking-browser-test.mjs */
import { createRequire } from 'node:module';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual));
}

const browser = await chromium.launch();

async function open(withIds) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  const external = [];
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (/facebook\.net|googletagmanager\.com|google-analytics\.com|facebook\.com/.test(u)) {
      external.push(u);
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    }
    return route.continue();
  });
  if (withIds) {
    await page.route('**/js/tracking-config.js', (route) => route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: "window.SHIFT_CONFIG = Object.assign(window.SHIFT_CONFIG || {}, { metaPixelId: '1234567890', ga4Id: 'G-TEST123' });"
    }));
  }
  return { ctx, page, external };
}

console.log('\n== ברירת מחדל: כבוי ==');
{
  const { ctx, page, external } = await open(false);
  await page.goto(url('landing.html'));
  await page.waitForTimeout(600);
  check('אין באנר', await page.locator('#consent-banner').count(), 0);
  check('אין בקשות לצד שלישי', external.length, 0);
  await ctx.close();
}

console.log('\n== יש מזהה, אין הסכמה ==');
{
  const { ctx, page, external } = await open(true);
  await page.goto(url('landing.html'));
  await page.waitForTimeout(600);
  check('מוצג באנר', await page.locator('#consent-banner').isVisible(), true);
  check('הבאנר מציג קישור למדיניות', await page.locator('#consent-banner a').getAttribute('href'), '/privacy/');
  check('לפני בחירה אין בקשות לצד שלישי', external.length, 0);

  await page.click('#consent-decline');
  await page.waitForTimeout(300);
  check('הבאנר נעלם', await page.locator('#consent-banner').count(), 0);
  check('אחרי דחייה אין בקשות', external.length, 0);
  await page.reload();
  await page.waitForTimeout(500);
  check('ההחלטה נשמרת: לא שואלים שוב', await page.locator('#consent-banner').count(), 0);
  check('וגם אחרי רענון אין בקשות', external.length, 0);
  check('קישור הגדרות עוגיות מוצג', await page.locator('[data-consent-settings]').first().isVisible(), true);
  await page.locator('[data-consent-settings]').first().click();
  await page.waitForTimeout(300);
  check('לחיצה עליו מציגה שוב את הבאנר', await page.locator('#consent-banner').count(), 1);
  await ctx.close();
}

console.log('\n== הסכמה ==');
{
  const { ctx, page, external } = await open(true);
  await page.goto(url('landing.html'));
  await page.waitForTimeout(500);
  await page.click('#consent-accept');
  await page.waitForTimeout(800);
  check('נטען Meta', external.some((u) => /connect\.facebook\.net/.test(u)), true);
  check('נטען GA4', external.some((u) => /googletagmanager\.com\/gtag\/js\?id=G-TEST123/.test(u)), true);
  check('הבאנר נעלם', await page.locator('#consent-banner').count(), 0);
  await ctx.close();
}

await browser.close();
if (failures.length) { console.log('\n❌ נכשלו ' + failures.length + ':\n  ' + failures.join('\n  ')); process.exit(1); }
console.log('\n✅ כל בדיקות המעקב בדפדפן עברו');
