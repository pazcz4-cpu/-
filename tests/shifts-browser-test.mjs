/* סוגי משמרות מותאמים: הוספה, שינוי שם ושעות, צבע, סדר, מחיקה ושימוש בסידור.
   הרצה: npm run test:shifts */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = url('dist', 'sidur-mishmarot.html');
const OUT = path.join(here, '..', 'dist');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 }, locale: 'he-IL' });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('dialog', async d => { await d.accept(); });

await skipWizard(page);

await page.goto(APP);
await page.waitForTimeout(500);
await page.click('.tab[data-tab="settings"]');
await page.waitForTimeout(400);

const rows = await page.locator('.shift-row').count();
console.log('1. משמרות קיימות:', rows,
  '|', (await page.locator('.shift-row .shift-name').evaluateAll(els => els.map(e => e.value))).join(', '));
console.log('   צבעים לבחירה בכל משמרת:', await page.locator('.shift-row').first().locator('.color-dot').count());

// הוספת משמרת לילה
await page.click('#add-shift');
await page.waitForTimeout(600);
console.log('2. אחרי הוספה:', await page.locator('.shift-row').count(), 'משמרות');

const last = page.locator('.shift-row').last();
await last.locator('.shift-name').fill('לילה');
await last.locator('.shift-name').dispatchEvent('change');
await page.waitForTimeout(500);
const lastRow = page.locator('.shift-row').last();
await lastRow.locator('[data-field="from"]').fill('2200');
await lastRow.locator('[data-field="from"]').dispatchEvent('change');
await page.waitForTimeout(500);
const lastRow2 = page.locator('.shift-row').last();
await lastRow2.locator('[data-field="to"]').fill('0600');
await lastRow2.locator('[data-field="to"]').dispatchEvent('change');
await page.waitForTimeout(500);

const shifts = await page.evaluate(() => window.ShiftApp.getState().settings.shifts
  .map(s => `${s.name} ${s.from}-${s.to} צבע${s.color}`));
console.log('3. אחרי עריכה:', shifts.join(' | '));

// בחירת צבע אחר
await page.locator('.shift-row').last().locator('.color-dot').nth(4).click();
await page.waitForTimeout(500);
console.log('4. צבע חדש:', (await page.evaluate(() => window.ShiftApp.getState().settings.shifts.slice(-1)[0].color)));

// פתיחת המשמרת בסניף והופעתה בסידור
await page.click('.tab[data-tab="branches"]');
await page.waitForTimeout(500);
const headers = await page.locator('#branches-list .sched-table thead th').allInnerTexts();
console.log('5. עמודות בעורך הסניף:', headers.join(' | '));

const nightCell = page.locator('#branches-list .card').first()
  .locator('.sched-cell[data-day="1"]').last();
await nightCell.locator('[data-sched="need"]').fill('1');
await nightCell.locator('[data-sched="need"]').dispatchEvent('change');
await page.waitForTimeout(700);

await page.click('.tab[data-tab="schedule"]');
await page.waitForTimeout(500);
const rowHeads = await page.locator('#schedule-branch td.row-head').allInnerTexts();
console.log('6. שורות בלוח הסידור:', [...new Set(rowHeads.filter(t => !t.includes('סניף')))].join(' | '));

await page.click('#generate');
await page.waitForTimeout(1800);
const cells = await page.locator('#schedule-branch .cell-hours').allInnerTexts();
console.log('7. שעות לילה מופיעות בלוח:', cells.some(c => c.includes('22:00-06:00')));
await page.screenshot({ path: OUT + '/shifts.png', fullPage: false });

// מחיקת משמרת
await page.click('.tab[data-tab="settings"]');
await page.waitForTimeout(400);
await page.locator('.shift-row').last().locator('[data-remove]').click();
await page.waitForTimeout(800);
console.log('8. אחרי מחיקה:', await page.locator('.shift-row').count(), 'משמרות |',
  (await page.evaluate(() => window.ShiftApp.getState().settings.shifts.map(s => s.name))).join(', '));
console.log('   הודעה:', (await page.locator('#toast').innerText()).trim());

console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
if (errors.length) process.exit(1);
