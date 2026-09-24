/* מה עובד רואה מלבד עצמו.

   ההגדרה נראית קטנה, והיא הגדרת פרטיות: היא קובעת אם עובד רואה
   את שמות חבריו לצוות. לכן נבדקים כאן שלושה דברים ולא אחד:

     1. ברירת המחדל סגורה, וגם אצל עסק שנפתח לפני שההגדרה קיימת.
        שינוי גרסה שפותח בשקט את הסידור של כולם לכולם הוא בדיוק
        סוג התקלה שלקוח מגלה מעובד כועס ולא מאיתנו.
     2. כשהמנהל מדליק — נחשפים שמות ומשמרות. זה מה שביקשו.
     3. וגם אז, ורק זה: אילוצים, הערות, מיילים, טלפונים ומכסות
        של עובדים אחרים אינם מגיעים למסך בשום מצב.

   הרצה: npm run test:team */
import { createRequire } from 'node:module';
import { loadSample } from './_sample.mjs';
import { skipWizard } from './_wizard.mjs';
import { url } from './_serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const APP = url('app.html');
const failures = [];
function check(label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + ' → ' + JSON.stringify(actual));
  if (!ok) failures.push(label + ': ' + JSON.stringify(actual) + ' ≠ ' + expected);
}

const browser = await chromium.launch();
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('dialog', async (d) => { await d.accept(); });

  await skipWizard(page);
  await page.goto(APP);
  await page.waitForTimeout(500);
  await page.click('[data-auth-mode="signup"]');
  await page.waitForTimeout(200);
  await page.fill('input[name="companyName"]', 'קפה מרכז');
  await page.fill('input[name="name"]', 'פז');
  await page.fill('input[name="email"]', 'boss@team.test');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#signup-form button[type="submit"]');
  await page.waitForTimeout(1500);
  await loadSample(page);

  /* עסק הדוגמה מגיע בלי מיילים וטלפונים, ולכן בדיקת דליפה עליו
     הייתה עוברת מפני שאין מה לדלוף. כאן נשתלים ערכים ייחודיים
     שקל לזהות, וזה מה שהופך את הבדיקה לבדיקה. */
  await page.evaluate(() => {
    const app = window.ShiftApp;
    const state = app.getState();
    state.employees.forEach((emp, i) => {
      emp.email = 'zzmail' + i + '@private.test';
      emp.phone = '050-99900' + i;
      emp.note = 'zznote-secret-' + i;
    });
    app.applyRemoteConfig({
      settings: state.settings, branches: state.branches, employees: state.employees
    });
    app.persistConfig();
  });
  await page.waitForTimeout(700);

  await page.click('.tab[data-tab="schedule"]');
  await page.waitForTimeout(500);
  await page.click('#generate');
  await page.waitForTimeout(2000);
  await page.click('#publish-week');
  await page.waitForTimeout(400);
  await page.click('[data-confirm-yes]');
  await page.waitForTimeout(1200);

  /* יום אחד שבו סניף אחד סגור. בעסק הדוגמה כל הסניפים מאוישים
     כל יום, ולכן המצב הזה – שבו הסינון של העובד מוביל למסך ריק –
     לא היה נבדק אף פעם. כאן הוא נבנה במפורש, ישירות במאגר של
     שרת הבדיקות ולא דרך המצב שבזיכרון: העותק שמסך העובד קורא
     ממנו הוא זה, והוא נטען פעם אחת בעליית הדף. */
  const CLOSED_BRANCH = 'br-center';
  const closedDay = (new Date().getDay() + 3) % 7;
  const cleared = await page.evaluate(({ branchId, dayIdx }) => {
    const key = window.ShiftMockBackend.STORE_KEY;
    const db = JSON.parse(window.localStorage.getItem(key));
    let removed = 0;
    Object.keys(db.data).forEach((companyId) => {
      const weeks = db.data[companyId].weeks || {};
      Object.keys(weeks).forEach((weekKey) => {
        const assignments = weeks[weekKey].assignments || {};
        Object.keys(assignments).forEach((slot) => {
          const parts = slot.split('|');
          if (Number(parts[0]) === dayIdx && parts[1] === branchId) {
            removed += assignments[slot].length;
            delete assignments[slot];
          }
        });
      });
    });
    window.localStorage.setItem(key, JSON.stringify(db));
    return removed;
  }, { branchId: CLOSED_BRANCH, dayIdx: closedDay });
  check('רוקנו סניף אחד ליום אחד', cleared > 0, true);
  await page.reload();
  await page.waitForTimeout(1500);

  const openEmployee = async () => {
    await page.click('#user-preview');
    await page.waitForTimeout(400);
    await page.locator('.preview-pick').first().click();
    await page.waitForTimeout(800);
  };
  const backToManager = async () => {
    await page.click('#preview-exit');
    await page.waitForTimeout(800);
  };

  console.log('\n== ברירת המחדל: כל אחד רואה רק את עצמו ==');
  check('ההגדרה סגורה במודל',
    await page.evaluate(() => window.ShiftStore.teamVisibility(
      window.ShiftApp.getState()).shifts), false);
  await openEmployee();
  check('אין מגירת צוות במסך העובד',
    await page.locator('.team-fold').count(), 0);
  await backToManager();

  console.log('\n== עסק ישן, בלי ההגדרה כלל ==');
  /* לקוח שנפתח לפני שההגדרה קיימת: settings בלי teamVisibility.
     הוא חייב לקבל סגור, ולא "לא הוגדר ולכן פתוח". */
  await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    delete state.settings.teamVisibility;
  });
  check('היעדר הגדרה נקרא כסגור',
    await page.evaluate(() => window.ShiftStore.teamVisibility(
      window.ShiftApp.getState()).shifts), false);

  console.log('\n== המנהל מדליק ==');
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(500);
  check('התיבה קיימת במסך ההגדרות',
    await page.locator('#opt-team-shifts').isVisible(), true);
  check('והיא כבויה', await page.isChecked('#opt-team-shifts'), false);
  await page.check('#opt-team-shifts');
  await page.waitForTimeout(800);
  check('ההגדרה נשמרה',
    await page.evaluate(() => window.ShiftStore.teamVisibility(
      window.ShiftApp.getState()).shifts), true);

  console.log('\n== ועכשיו העובד רואה את הצוות ==');
  await openEmployee();
  check('המגירה קיימת', await page.locator('.team-fold').count(), 1);
  check('והיא סגורה כברירת מחדל',
    await page.evaluate(() => document.querySelector('.team-fold').open), false);
  await page.locator('.team-fold summary').click();
  await page.waitForTimeout(400);
  const slots = await page.locator('.team-slot').count();
  check('יש בה משמרות של הצוות', slots > 0, true);
  check('ושמות של יותר מאדם אחד',
    await page.evaluate(() => {
      const names = new Set();
      document.querySelectorAll('.team-slot span').forEach((n) => {
        n.textContent.split(',').forEach((v) => { if (v.trim()) names.add(v.trim()); });
      });
      return names.size;
    }) > 1, true);
  check('והעובד עצמו מסומן ברשימה',
    await page.locator('.team-me').count() > 0, true);

  console.log('\n== לשוניות הימים ==');
  check('שבע לשוניות', await page.locator('.team-tab').count(), 7);
  check('אחת ויחידה נבחרת', await page.locator('.team-tab.is-on').count(), 1);
  /* ברירת המחדל אינה "ראשון" אלא היום — זה מה שהעובד מחפש */
  const todayIdx = await page.evaluate(() => new Date().getDay());
  check('והיא של היום', await page.evaluate(() =>
    Number(document.querySelector('.team-tab.is-on').dataset.teamDay)), todayIdx);
  /* נקודה על יום שבו אני עובד, כך שהשבוע שלי נקרא מהלשוניות */
  check('ימים שאני עובד בהם מסומנים',
    await page.locator('.team-tab.has-mine').count() > 0, true);

  /* מוצג יום אחד, ולא כל השבוע: זו כל הנקודה של הלשוניות */
  const shownDays = await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    const week = state.weeks[window.ShiftApp.weekKey()];
    const idx = Number(document.querySelector('.team-tab.is-on').dataset.teamDay);
    return {
      onScreen: document.querySelectorAll('.team-slot').length,
      thatDay: window.ShiftStore.dayRoster(state, week, idx).length
    };
  });
  check('מספר המשמרות על המסך הוא של יום אחד',
    shownDays.onScreen, shownDays.thatDay);

  console.log('\n== החלפת יום ==');
  const otherIdx = (todayIdx + 2) % 7;
  const before = await page.locator('.team-panel').innerText();
  await page.click('.team-tab[data-team-day="' + otherIdx + '"]');
  await page.waitForTimeout(500);
  check('הלשונית החדשה נבחרה', await page.evaluate(() =>
    Number(document.querySelector('.team-tab.is-on').dataset.teamDay)), otherIdx);
  check('והתוכן התחלף', (await page.locator('.team-panel').innerText()) !== before, true);
  /* המגירה נשארת פתוחה אחרי ציור מחדש — אחרת כל לחיצה על יום
     סוגרת בדיוק את מה שהעובד פתח כדי לקרוא. */
  check('והמגירה נשארה פתוחה',
    await page.evaluate(() => document.querySelector('.team-fold').open), true);

  console.log('\n== לשוניות הסניפים ==');
  /* עסק הדוגמה הוא שלושה סניפים, ולכן יש מה לסנן. בעסק עם סניף
     אחד השורה הזו לא אמורה להופיע כלל, וזה נבדק בהמשך.

     השיבוץ מוגרל, ויש ימים שבהם במקרה עובד רק סניף אחד. לכן
     היום נבחר לפי הנתונים ולא לפי מספר קבוע: בדיקה שנופלת פעם
     בכמה הרצות היא בדיקה שמפסיקים להאמין לה. */
  const multiDay = await page.evaluate((closed) => {
    const state = window.ShiftApp.getState();
    const week = state.weeks[window.ShiftApp.weekKey()];
    for (let i = 0; i <= 6; i++) {
      if (i === closed) continue;
      const branches = new Set(window.ShiftStore.dayRoster(state, week, i)
        .map((slot) => slot.branchId));
      if (branches.size > 1 && branches.has('br-center')) return i;
    }
    return -1;
  }, closedDay);
  check('יש יום שעובדים בו כמה סניפים', multiDay >= 0, true);
  await page.click('.team-tab[data-team-day="' + multiDay + '"]');
  await page.waitForTimeout(500);

  const branchIds = await page.evaluate(() =>
    [...document.querySelectorAll('.team-branch-tab')].map((b) => b.dataset.teamBranch));
  check('יש שורת סניפים', branchIds.length > 1, true);
  check('הראשונה היא "כל הסניפים"', branchIds[0], '');
  check('והיא הנבחרת כברירת מחדל', await page.evaluate(() =>
    document.querySelector('.team-branch-tab').classList.contains('is-on')), true);
  /* הלשוניות הן הסניפים שעובדים ביום הזה, לא כל סניפי העסק:
     לשונית שמובילה למסך ריק היא לשונית שלא הייתה צריכה להיות. */
  check('הלשוניות הן בדיוק הסניפים שעובדים היום', await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    const week = state.weeks[window.ShiftApp.weekKey()];
    const idx = Number(document.querySelector('.team-tab.is-on').dataset.teamDay);
    const real = new Set(window.ShiftStore.dayRoster(state, week, idx)
      .map((slot) => slot.branchId));
    const tabs = [...document.querySelectorAll('.team-branch-tab')]
      .map((b) => b.dataset.teamBranch).filter((v) => v !== '');
    return tabs.length === real.size && tabs.every((id) => real.has(id));
  }), true);

  const pickedBranch = CLOSED_BRANCH;
  check('הסניף שנבדק נמצא בשורה', branchIds.indexOf(pickedBranch) > 0, true);
  const allSlots = await page.locator('.team-slot').count();
  await page.click('.team-branch-tab[data-team-branch="' + pickedBranch + '"]');
  await page.waitForTimeout(500);
  check('הסניף שנבחר מסומן', await page.evaluate(() =>
    document.querySelector('.team-branch-tab.is-on').dataset.teamBranch), pickedBranch);
  check('"כל הסניפים" כבר לא מסומן', await page.evaluate(() =>
    document.querySelector('.team-branch-tab').classList.contains('is-on')), false);
  check('נשארה קבוצת סניף אחת', await page.locator('.team-branch').count(), 1);
  const narrowed = await page.locator('.team-slot').count();
  check('והרשימה הצטמצמה', narrowed > 0 && narrowed < allSlots, true);
  /* לא רק שפחות מוצג — מה שמוצג הוא של הסניף הנכון, וגם המניין
     שמעליו הוא של הסניף ולא של כל היום. */
  const inBranch = await page.evaluate((id) => {
    const state = window.ShiftApp.getState();
    const week = state.weeks[window.ShiftApp.weekKey()];
    const idx = Number(document.querySelector('.team-tab.is-on').dataset.teamDay);
    const mine = window.ShiftStore.dayRoster(state, week, idx)
      .filter((slot) => slot.branchId === id);
    return {
      slots: mine.length,
      people: mine.reduce((sum, slot) => sum + slot.people.length, 0),
      onScreenSlots: document.querySelectorAll('.team-slot').length,
      onScreenPeople: document.querySelectorAll('.team-person').length
    };
  }, pickedBranch);
  check('כל המשמרות שעל המסך הן של הסניף שנבחר',
    inBranch.onScreenSlots, inBranch.slots);
  check('וגם האנשים', inBranch.onScreenPeople, inBranch.people);

  /* עובד שסינן לסניף שלו ומדלג בין ימים רוצה להישאר בו */
  const thirdIdx = (todayIdx + 4) % 7;
  await page.click('.team-tab[data-team-day="' + thirdIdx + '"]');
  await page.waitForTimeout(500);
  check('הסינון שורד החלפת יום', await page.evaluate(() => {
    const on = document.querySelector('.team-branch-tab.is-on');
    return on ? on.dataset.teamBranch : null;
  }), pickedBranch);

  /* יום שבו הסניף שנבחר ריק: הסינון נשאר, המסך אומר זאת,
     והלשונית נשארת כדי שיהיה מאיפה לצאת. */
  await page.click('.team-tab[data-team-day="' + closedDay + '"]');
  await page.waitForTimeout(500);
  check('ביום שבו הסניף סגור אין משמרות על המסך',
    await page.locator('.team-slot').count(), 0);
  check('והמסך אומר שאין אף אחד בסניף הזה', await page.evaluate(() => {
    const note = document.querySelector('.team-panel .employee-note');
    return note ? note.textContent : '';
  }), /סניף/);
  /* בלי הלשונית הזו העובד נשאר עם מסך ריק ובלי דרך לצאת ממנו */
  check('ולשונית הסניף עדיין שם כדי לצאת ממנה', await page.evaluate((id) =>
    !!document.querySelector('.team-branch-tab[data-team-branch="' + id + '"]'),
    pickedBranch), true);
  check('ויש מה ללחוץ כדי לראות את שאר הסניפים',
    await page.locator('.team-branch-tab[data-team-branch=""]').count(), 1);

  /* חזרה ל"כל הסניפים" מחזירה את התצוגה המלאה של אותו יום */
  await page.click('.team-tab[data-team-day="' + multiDay + '"]');
  await page.waitForTimeout(400);
  await page.click('.team-branch-tab[data-team-branch=""]');
  await page.waitForTimeout(500);
  check('ביטול הסינון מחזיר את כל הסניפים',
    await page.locator('.team-slot').count(), allSlots);

  console.log('\n== ומה שעדיין לא נחשף ==');
  /* זו הבדיקה שבאמת חשובה. גם כשההגדרה דלוקה, מה שעובר למסך
     הוא שמות ומשמרות — ולא כרטיס העובד. */
  const leak = await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    const text = document.body.innerText;
    const seeded = state.employees.filter((e) => /^zzmail/.test(e.email || ''));
    return {
      seeded: seeded.length,
      emails: seeded.filter((e) => text.indexOf(e.email) !== -1).length,
      phones: seeded.filter((e) => text.indexOf(e.phone) !== -1).length,
      notes: seeded.filter((e) => text.indexOf(e.note) !== -1).length
    };
  });
  /* בלי השורה הזו כל השאר יכול לעבור מפני שאין נתונים בכלל */
  check('יש בכלל נתונים רגישים לבדוק עליהם', leak.seeded > 1, true);
  check('אף מייל אינו מגיע למסך העובד', leak.emails, 0);
  check('אף טלפון אינו מגיע', leak.phones, 0);
  check('ואף הערה שהמנהל כתב אינה מגיעה', leak.notes, 0);

  /* dayRoster הוא המקור שממנו המסך בונה — ולכן הוא שנבדק, ולא
     רק מה שבמקרה מוצג. שדה שיתווסף לו יגיע למסך בלי ששמנו לב. */
  const fields = await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    const week = state.weeks[window.ShiftApp.weekKey()];
    const roster = window.ShiftStore.dayRoster(state, week, 0);
    const keys = new Set();
    roster.forEach((slot) => (slot.people || []).forEach((p) =>
      Object.keys(p).forEach((k) => keys.add(k))));
    return [...keys].sort();
  });
  check('כל מה שעובר על עובד הוא מזהה ושם',
    JSON.stringify(fields), '["id","name"]');

  console.log('\n== ועכשיו עובד אמיתי, ולא תצוגה מקדימה ==');
  /* כל מה שנבדק עד כאן נבדק דרך "תצוגה מקדימה", כלומר בסשן של
     המנהל. זה מה שהחמיץ את התקלה: השרת חותך לעובד את השיבוצים
     של עמיתיו, ולכן המגירה הייתה מלאה אצל המנהל וריקה אצל מי
     שהיא נבנתה בשבילו. מכאן ואילך נכנסים באמת. */
  await backToManager();
  await page.click('.tab[data-tab="users"]');
  await page.waitForTimeout(700);
  const cards = await page.locator('#invite-form select[name="employeeId"] option')
    .evaluateAll((list) => list.map((o) => o.value).filter(Boolean));
  /* בחירת העובד קודמת למילוי הכתובת, ולא להפך: הטופס ממלא את
     הכתובת מכרטיס העובד ברגע שבוחרים אותו, ודורס מה שהוקלד. */
  await page.selectOption('#invite-form select[name="employeeId"]', cards[0]);
  await page.waitForTimeout(200);
  await page.fill('#invite-form input[name="email"]', 'ronit@team.test');
  await page.click('#invite-form button[type="submit"]');
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    window.__backend.followLink('ronit@team.test', 'invite');
    await window.__backend.setPassword('secret123');
  });
  await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await page.reload();
  await page.waitForTimeout(900);
  await page.fill('#signin-form input[name="email"]', 'ronit@team.test');
  await page.fill('#signin-form input[name="password"]', 'secret123');
  await page.click('#signin-form button[type="submit"]');
  await page.waitForTimeout(1800);

  check('המגירה קיימת גם בכניסה אמיתית', await page.locator('.team-fold').count(), 1);
  await page.locator('.team-fold summary').click();
  await page.waitForTimeout(500);
  check('ויש בה משמרות', await page.locator('.team-slot').count() > 0, true);
  check('ושמות של יותר מאדם אחד', await page.evaluate(() => {
    const names = new Set();
    document.querySelectorAll('.team-person').forEach((n) => names.add(n.textContent.trim()));
    return names.size;
  }) > 1, true);
  check('והעובד עצמו מסומן', await page.locator('.team-me').count() > 0, true);

  /* מה שהגיע לדפדפן שלו, ולא רק מה שהמסך הציג: עמית מגיע כשם
     ומזהה, והכרטיס שלו – מייל, טלפון והערה – אינו מגיע כלל. */
  /* לא מה שהמסך הציג אלא מה שהשרת שלח: הפרוסה של העובד עצמו,
     כפי שהדפדפן שלו קיבל אותה. שם נמצאת התקלה אם היא חוזרת. */
  const fromServer = await page.evaluate(async () => {
    const config = await window.__backend.loadConfig();
    const mine = window.__backend.session().user.employeeId;
    const others = (config.employees || []).filter((emp) => emp.id !== mine);
    return {
      cards: (config.employees || []).length,
      others: others.length,
      fields: others.length ? Object.keys(others[0]).sort().join(',') : '',
      /* על הכרטיס של העובד עצמו הערכים האלה אמורים להגיע —
         הם שלו. מה שנבדק כאן הוא מה שהגיע על עמיתיו. */
      leakedMail: JSON.stringify(others).indexOf('zzmail') !== -1,
      leakedNote: JSON.stringify(others).indexOf('zznote-secret') !== -1,
      ownCardIntact: (config.employees || []).some(
        (emp) => emp.id === mine && /^zzmail/.test(emp.email || ''))
    };
  });
  check('הגיעו כרטיסים של הצוות ולא רק שלו', fromServer.others > 0, true);
  check('ומהעמיתים עברו מזהה, שם ופעילות בלבד', fromServer.fields, 'active,id,name');
  check('אף מייל של עמית לא הגיע לדפדפן', fromServer.leakedMail, false);
  check('ואף הערה שהמנהל כתב', fromServer.leakedNote, false);
  check('והכרטיס של העובד עצמו הגיע שלם', fromServer.ownCardIntact, true);

  await page.evaluate(() => localStorage.removeItem('maiphone-mock-session-v1'));
  await page.reload();
  await page.waitForTimeout(900);
  await page.fill('#signin-form input[name="email"]', 'boss@team.test');
  await page.fill('#signin-form input[name="password"]', 'secret123');
  await page.click('#signin-form button[type="submit"]');
  await page.waitForTimeout(1600);

  console.log('\n== עסק עם סניף אחד ==');
  /* שורת סניפים שכל הכפתורים בה אומרים את אותו דבר היא רעש.
     כאן מושארים בעסק סניף אחד, והשורה צריכה להיעלם לגמרי.
     (חזרנו לסשן של המנהל בהתחברות ולא מתצוגה מקדימה, ולכן אין
     כאן יציאה ממנה.) */
  await page.evaluate(() => {
    const state = window.ShiftApp.getState();
    state.branches = state.branches.slice(0, 1);
    window.ShiftApp.applyRemoteConfig({
      settings: state.settings, branches: state.branches, employees: state.employees
    });
    window.ShiftApp.persistConfig();
  });
  await page.waitForTimeout(700);
  await openEmployee();
  await page.locator('.team-fold summary').click();
  await page.waitForTimeout(400);
  check('לשוניות הימים נשארו', await page.locator('.team-tab').count(), 7);
  check('ושורת הסניפים אינה מוצגת', await page.locator('.team-branch-tab').count(), 0);

  console.log('\n== כיבוי מחזיר את המסך לסגור ==');
  await backToManager();
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(500);
  await page.uncheck('#opt-team-shifts');
  await page.waitForTimeout(800);
  await openEmployee();
  check('המגירה נעלמה', await page.locator('.team-fold').count(), 0);

  console.log('\n  שגיאות בדף:', errors.length ? errors.join(' | ') : 'אין');
  if (errors.length) failures.push('שגיאות: ' + errors.join(' | '));
} finally {
  await browser.close();
}

if (failures.length) {
  console.log('\n❌ נכשלו ' + failures.length + ' בדיקות:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\n✅ כל בדיקות תצוגת הצוות עברו');
