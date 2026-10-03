# טבלת משימות — מצב 03/10/2026

מקרא: ✅ בוצע · ⏳ ממתין למישהו אחר · ⬜ פתוח אצלך · 🔨 פתוח אצלי

## מה נבנה היום (בקוד, נדחף לענף)

| נושא | מה | מצב |
|---|---|---|
| הסכמת עובדים | תיבת חובה בכניסה ראשונה: עדכונים במייל/אפליקציה/וואטסאפ, לא שיווק. נוסח, גרסה ותאריך נשמרים | ✅ בקוד · ⬜ SQL (משימה 1) |
| לידים | טופס בדף הבית ובצור קשר (שם עסק, איש קשר, טלפון, מייל, עובדים, זמן בשבוע, הסכמה). לשונית "לידים" במשרד האחורי | ✅ בקוד · ⬜ SQL (משימה 1) |
| מדידת מקור | utm/fbclid על כל חברה בהרשמה, רק בהסכמה | ✅ בקוד · ⬜ SQL (משימה 1) |
| לשונית "שיווק" | משפך שבועי, עלות לקוח לפי ערוץ וקמפיין, ייצוא כל הנתונים ל-Excel | ✅ בקוד · ⬜ SQL (משימה 1) |
| סנכרון הוצאות פרסום | Meta אוטומטי כל בוקר, Google Ads דרך סקריפט, מצב סנכרון במסך | ✅ בקוד · ⬜ חיבור (משימות 9–10) |
| הטבת הקמה | "הקמה ואיפיון כלולים במחיר" בדף הבית, מחירים, שאלות נפוצות, צור קשר, 8 שפות | ✅ |
| ספריית מודעות | 7 זוויות, רימרקטינג, Reels, גוגל, לוח אורגני | ✅ |
| שעון נוכחות | מתג קיים הובהר; התראה לעובד שלא החתים, באפליקציה בלבד, בלי מייל; מוצג באתר ובחומרים כתוספת אופציונלית | ✅ |
| מדריכים | מדריך מנהל (PDF חדש עם עמוד שעון), מדריך עובד | ✅ |
| תזכורת שבועית | כל יום ראשון 08:52: ייצוא ושליחה לניתוח | ✅ מתוזמנת |
| תיקון | סריקת הרשמות שננטשו (וואטסאפ) לא רצה מה-cron | ✅ |
| SQL קודם | פונקציות מ-02/10 ו-"FREE PILOT, DEMO, SALES AGENTS" | ✅ הורץ |

---

## ⬜ פתוח אצלך

### 1. הרצת SQL: הסכמת עובדים ושיווק
- **סטטוס:** ⬜ פתוח אצלך
- **חוסם:** הסכמת עובדים, שמירת לידים בטבלה, לשונית "שיווק". משימות 9–10 תלויות בו. (הקטע האחרון, `punch_reminders`, ישמש את התראות הדחיפה בהמשך; אין נזק בהרצה עכשיו.)
- **קישור:** https://supabase.com/dashboard/project/_/sql/new (לבחור את הפרויקט)
- **מה לעשות:** להדביק את כל הבלוק, Run, ואחרי "Success" לפרוס.

```sql
-- EMPLOYEE UPDATES CONSENT: הסכמת עובד לקבלת עדכונים שוטפים
alter table public.company_users
  add column if not exists updates_consent_at      timestamptz,
  add column if not exists updates_consent_text    text,
  add column if not exists updates_consent_version text;

create or replace function public.save_updates_consent(p_text text, p_version text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if coalesce(btrim(p_text), '') = '' then
    raise exception 'consent text required' using errcode = '22023';
  end if;
  update public.company_users
     set updates_consent_at      = now(),
         updates_consent_text    = left(btrim(p_text), 2000),
         updates_consent_version = left(coalesce(btrim(p_version), ''), 40)
   where id = auth.uid()
  returning updates_consent_at into v_at;
  if v_at is null then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  return v_at;
end
$$;

grant execute on function public.save_updates_consent(text, text) to authenticated;

-- MARKETING: מקור הגעה, לידים והוצאות פרסום

alter table public.companies
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content  text,
  add column if not exists utm_term     text,
  add column if not exists click_id     text,
  add column if not exists utm_at       timestamptz;

create index if not exists companies_utm_idx
  on public.companies (utm_source, utm_campaign) where utm_source is not null;

create or replace function public.attach_attribution(p_utm jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_row     public.companies;
  v_src     text := left(btrim(coalesce(p_utm->>'utm_source', '')), 80);
  v_med     text := left(btrim(coalesce(p_utm->>'utm_medium', '')), 80);
  v_cam     text := left(btrim(coalesce(p_utm->>'utm_campaign', '')), 120);
  v_con     text := left(btrim(coalesce(p_utm->>'utm_content', '')), 120);
  v_ter     text := left(btrim(coalesce(p_utm->>'utm_term', '')), 120);
  v_clk     text := left(btrim(coalesce(p_utm->>'fbclid', p_utm->>'gclid', '')), 200);
begin
  if v_company is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not public.is_manager() then
    return 'forbidden';
  end if;
  if v_src = '' and v_med = '' and v_cam = '' and v_clk = '' then
    return 'empty';
  end if;

  select * into v_row from public.companies where id = v_company;
  if v_row.utm_at is not null then
    return 'already';
  end if;
  if v_row.created_at < now() - interval '2 days' then
    return 'late';
  end if;

  update public.companies
     set utm_source = nullif(v_src, ''), utm_medium = nullif(v_med, ''),
         utm_campaign = nullif(v_cam, ''), utm_content = nullif(v_con, ''),
         utm_term = nullif(v_ter, ''), click_id = nullif(v_clk, ''),
         utm_at = now()
   where id = v_company;
  return 'ok';
end;
$$;

grant execute on function public.attach_attribution(jsonb) to authenticated;

create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  business_name    text not null check (length(trim(business_name)) between 1 and 160),
  contact_name     text not null check (length(trim(contact_name)) between 1 and 120),
  phone            text not null check (length(phone) between 6 and 40),
  email            text not null check (length(email) between 5 and 200),
  employees        integer check (employees between 1 and 100000),
  hours_per_week   text check (hours_per_week in ('lt1', '1-3', '3-6', '6plus', 'unknown')),
  note             text,
  contact_consent  boolean not null default false,
  consent_text     text,
  lang             text,
  page             text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  utm_content      text,
  utm_term         text,
  click_id         text,
  status           text not null default 'new'
    check (status in ('new', 'contacted', 'demo', 'won', 'lost')),
  admin_note       text,
  converted_company_id uuid references public.companies(id) on delete set null
);

create index if not exists leads_created_idx on public.leads (created_at desc);
create index if not exists leads_status_idx  on public.leads (status);

alter table public.leads enable row level security;
revoke all on public.leads from authenticated, anon;

create table if not exists public.marketing_spend (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null,
  channel     text not null check (length(trim(channel)) between 1 and 40),
  amount      numeric(10, 2) not null check (amount >= 0),
  note        text,
  created_at  timestamptz not null default now(),
  unique (week_start, channel)
);

alter table public.marketing_spend enable row level security;
revoke all on public.marketing_spend from authenticated, anon;

-- MISSED CLOCK-IN REMINDERS: תזכורת לעובד שהמשמרת התחילה ולא נרשמה כניסה
create table if not exists public.punch_reminders (
  company_id   uuid not null references public.companies(id) on delete cascade,
  employee_id  text not null,
  shift_start  timestamptz not null,
  channel      text,
  sent_at      timestamptz not null default now(),
  primary key (company_id, employee_id, shift_start)
);

alter table public.punch_reminders enable row level security;
revoke all on public.punch_reminders from authenticated, anon;
```

- **איך יודעים:** "Success. No rows returned". אחרי הפריסה, ב-https://setshifts.com/admin/ הלשונית "שיווק" נטענת בלי שגיאה אדומה, ו"לידים" מציגה "אין לידים".
- **המלכודת:** כל עובד קיים יתבקש לסמן את תיבת ההסכמה בכניסה הבאה. להודיע למנהלים מראש.

### 2. `CRON_SECRET` ב-Vercel
- **סטטוס:** ⬜ פתוח אצלך (אם עוד לא הוגדר)
- **חוסם:** סנכרון Meta, סריקת הרשמות שננטשו, והחיוב החודשי של PayPlus.
- **קישור:** https://vercel.com/dashboard ← הפרויקט ← Settings ← Environment Variables
- **מה לעשות:** אם כבר קיים, לא לגעת. אחרת להוסיף משתנה בשם:
  ```
  CRON_SECRET
  ```
  ערך: מחרוזת אקראית ארוכה שאתה מייצר. Redeploy.
- **איך יודעים:** Settings ← Cron Jobs: ליד `/api/billing/cron` ההרצה האחרונה עם 200 ולא 401.
- **המלכודת:** לא מדביקים את הערך בצ'אט.

### 3. ספק סליקה (ישראכרט)
- **סטטוס:** ⬜ פתוח אצלך
- **חוסם:** PayPlus (משימה 13), ולכן את הלקוח הראשון שמשלם.
- **קישור:** אין טופס מקוון; פנייה לנציג ישראכרט שאתה בקשר איתו.
- **מה לעשות:** להכין אישור ניהול חשבון מהבנק, תעודת התאגדות, ת.ז. של החותם, ואתר פעיל. לבקש בכתב את רשימת המסמכים המדויקת. לשאול כבר בפנייה הראשונה:
  ```
  האם המסוף מאושר לחיוב חוזר (מנוי חודשי) בלי נוכחות הלקוח?
  ```
- **איך יודעים:** מספר מסוף ואישור בכתב לחיוב חוזר.
- **המלכודת:** שם החברה, ח.פ. וכתובת באתר חייבים להיות זהים למסמכים.

### 4. Pixel של Meta ו-GA4
- **סטטוס:** ⬜ פתוח אצלך
- **חוסם:** כל מדידה של פרסום, רימרקטינג, ומקור ההגעה בלשונית "שיווק".
- **קישור:** https://business.facebook.com/events_manager2 ו-https://analytics.google.com
- **מה לעשות:**
  1. Events Manager ← Connect data sources ← Web ← Meta Pixel ← שם `SetShifts` ← להעתיק את מזהה הפיקסל (ספרות).
  2. https://business.facebook.com/settings/owned-domains ← Add ← `setshifts.com` ← אימות.
  3. GA4: Admin ← Create property ← Web stream ← `https://setshifts.com` ← להעתיק Measurement ID (מתחיל ב-`G-`).
  4. ב-Vercel להוסיף את שני המשתנים ולעשות Redeploy:
  ```
  META_PIXEL_ID
  ```
  ```
  GA4_ID
  ```
- **איך יודעים:** בחלון גלישה בסתר ב-https://setshifts.com מופיע באנר הסכמה; אחרי "מאשר/ת", ב-Events Manager ← Test events מופיע `PageView`.
- **המלכודת:** בלי לחיצה על "מאשר/ת" לא נשלח כלום, וזה מכוון.

### 5. דף פייסבוק ואינסטגרם עסקי
- **סטטוס:** ⬜ פתוח אצלך
- **חוסם:** הפעלת מודעות (מודעה יוצאת בשם דף).
- **קישור:** https://www.facebook.com/pages/create
- **מה לעשות:** דף בשם `SetShifts`, קטגוריה "תוכנה", לוגו, קישור לאתר. לחבר חשבון אינסטגרם עסקי באותו Business Manager.
- **איך יודעים:** הדף מופיע ב-https://business.facebook.com/settings/pages.
- **המלכודת:** ליצור את הדף מתוך אותו Business Manager שבו נמצאים הפיקסל וחשבון המודעות, לא בחשבון אישי נפרד.

### 6. החלטות לפני שמפעילים מודעות
- **סטטוס:** ⬜ פתוח אצלך
- **חוסם:** הפעלת מודעות.
- **מה להחליט:**
  1. תקציב חודש ראשון (הצעה: 4,000 ₪).
  2. מי עונה ללידים, ראשון–חמישי 09:00–15:30.
  3. מי עושה את ההקמה והאיפיון ללקוח חדש (ההבטחה באתר ובמודעות), ותוך כמה ימים.
- **איך יודעים:** שלושה שמות/מספרים כתובים.
- **המלכודת:** הבטחת "הקמה כלולה" בלי מי שמבצע אותה היא הבטחה שהלקוח הראשון יגלה שלא קוימה.

### 7. אימות טלפונים ב-Google Play
- **סטטוס:** ⬜ פתוח אצלך
- **חוסם:** יצירת האפליקציה בחנות (משימה 16).
- **קישור:** https://play.google.com/console
- **מה לעשות:** לפתוח את המשימות בראש הקונסולה. הנייד: אימות ב-SMS. מספר המשרד (קווי): לבחור שיחה קולית, ולהיות ליד הטלפון.
- **איך יודעים:** אין יותר משימות פתוחות בראש הקונסולה, ו-"Create app" זמין.
- **המלכודת:** 25$ לא מוחזרים אם האימות נכשל. הפרטים חייבים להיות זהים למסמכים.

### 8. Meta: אימות מספר ההתראות ותבניות (אחרי שה-SIM מגיע)
- **סטטוס:** ⬜ פתוח אצלך, אחרי ה-SIM (מוזמן 04/10)
- **חוסם:** וואטסאפ לעובדים (#92) והודעת נטישת הרשמה.
- **קישור:** https://business.facebook.com/wa/manage/phone-numbers/
- **מה לעשות:**
  1. להוסיף את מספר ה-SIM בחשבון `2058733988083710` ולאמת ב-SMS.
  2. למחוק את הרשומה השגויה `+972 9-969-8560`.
  3. ליצור מחדש שלוש תבניות באותו חשבון, עם הנוסחים מה-runbook, כולל המשפט:
  ```
  מספר זה משמש להתראות ועדכונים אוטומטיים של המערכת ואינו זמין למענה קולי או להודעות.
  ```
     ובתבנית `signup_abandoned_he` להחליף את `[כתובת העסק]` בכתובת אמיתית.
  4. להקצות את החשבון למשתמש המערכת `SetShifts API` (Full control).
  5. לשלוח לי את מזהה המספר (Phone number ID). את ההגדרה ב-Vercel נעשה יחד.
- **איך יודעים:** המספר במצב Connected והתבניות במצב Active.
- **המלכודת:** תבנית שנוצרה בחשבון אחר מחזירה שגיאה `132001`. ובלי כתובת אמיתית התבנית נדחית.

### 9. סנכרון Meta אוטומטי
- **סטטוס:** ⬜ פתוח אצלך, אחרי שיש חשבון מודעות בשקלים
- **חוסם:** משיכה אוטומטית של הוצאות Meta. עד אז הזנה ידנית.
- **קישור:** https://business.facebook.com/settings/system-users
- **מה לעשות:** `SetShifts API` ← Assign assets ← Ad accounts ← הרשאת צפייה בביצועים. Generate new token ← `ads_read` ← ללא תפוגה. ב-Vercel, ואז Redeploy:
  ```
  META_ADS_TOKEN
  ```
  ```
  META_AD_ACCOUNT_ID
  ```
- **איך יודעים:** למחרת ב-07:17, בלשונית "שיווק": "Meta: סונכרן …".
- **המלכודת:** מטבע החשבון נקבע בפתיחה ואינו ניתן לשינוי; חייב להיות ILS. אם `ads_read` חסר, להוסיף את Marketing API לאפליקציה ב-https://developers.facebook.com/apps.

### 10. סנכרון Google Ads אוטומטי
- **סטטוס:** ⬜ פתוח אצלך, אחרי שיש חשבון Google Ads בשקלים
- **חוסם:** משיכה אוטומטית של הוצאות גוגל.
- **קישור:** https://ads.google.com ← Tools ← Bulk actions ← Scripts
- **מה לעשות:** ב-Vercel להוסיף מחרוזת אקראית בשם:
  ```
  GOOGLE_ADS_SYNC_SECRET
  ```
  ואז להדביק בסקריפט חדש את הקוד הבא, להחליף את `PASTE_GOOGLE_ADS_SYNC_SECRET_HERE` באותה מחרוזת, Authorize, Preview, Save, תזמון Daily.

```javascript
function main() {
  // SetShifts: שולח את הוצאת הפרסום היומית של 30 הימים האחרונים
  var URL = 'https://setshifts.com/api/marketing-sync?action=google';
  var SECRET = 'PASTE_GOOGLE_ADS_SYNC_SECRET_HERE';

  var tz = AdsApp.currentAccount().getTimeZone();
  var since = Utilities.formatDate(new Date(Date.now() - 30 * 864e5), tz, 'yyyy-MM-dd');
  var until = Utilities.formatDate(new Date(Date.now() - 864e5), tz, 'yyyy-MM-dd');

  var rows = [];
  var report = AdsApp.report(
    "SELECT segments.date, metrics.cost_micros FROM customer " +
    "WHERE segments.date BETWEEN '" + since + "' AND '" + until + "'");
  var it = report.rows();
  while (it.hasNext()) {
    var r = it.next();
    rows.push({ date: r['segments.date'], cost: Number(r['metrics.cost_micros']) / 1e6 });
  }

  var response = UrlFetchApp.fetch(URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + SECRET },
    payload: JSON.stringify({
      currency: AdsApp.currentAccount().getCurrencyCode(),
      since: since, rows: rows
    }),
    muteHttpExceptions: true
  });
  Logger.log(response.getResponseCode() + ' ' + response.getContentText());
}
```

- **איך יודעים:** ביומן של Preview שורה שמתחילה ב-`200 {"ok":true`.
- **המלכודת:** 401 = הסוד לא זהה או שלא נעשה Redeploy. מטבע חייב להיות ILS.

### 11. סקירת עו"ד
- **סטטוס:** ⬜ פתוח אצלך
- **חוסם:** לא חוסם עלייה, אבל חשיפה משפטית עד שנבדק.
- **מה להעביר לעו"ד:**
  1. פרטיות ואבטחה: סעיף "מדידה ופרסום" (נוסח 03/10).
  2. פרטיות ותנאים: להוסיף שצוות SetShifts רשאי להיכנס לחשבון לקוח לטיפול בפנייה ("כניסת תמיכה", נרשמת ביומן).
  3. הצהרת האחריות לשליחת וואטסאפ לעובדים.
  4. נוסח הסכמת העובד לעדכונים, ונוסח ההסכמה בטופס הליד.
  5. גילוי כרטיס האשראי בהרשמה ובמודעות ("החיוב הראשון בתום החודש, ביטול בכל רגע לפני כן").
- **איך יודעים:** הערות בכתב, ואני מעדכן את הנוסחים.
- **המלכודת:** ההערה "ממתין לבדיקת עו"ד" היא רק במסמכים הפנימיים, לא באתר. כך צריך להישאר.

### 12. החלטה: אכיפת תוקף מנוי גם בשרת
- **סטטוס:** ⬜ החלטה אצלך
- **חוסם:** כלום היום; רלוונטי לפני לקוחות משלמים.
- **מה זה:** היום חסימת חשבון שפג תוקפו נאכפת במסך. משתמש טכני יכול לעקוף את המסך ולקרוא נתונים ישירות. ההמלצה שלי: לבנות אכיפה גם בשרת (מסד הנתונים מסרב לחשבון חסום).
- **מה לעשות:** לכתוב לי "תבנה אכיפה בשרת" או "לא עכשיו".
- **איך יודעים:** תשובה.
- **המלכודת:** אין.

### 13. החשבונית של Google Workspace
- **סטטוס:** ⬜ פתוח אצלך, עד 30/10
- **קישור:** https://admin.google.com/ac/billing
- **מה לעשות:** לוודא שאמצעי התשלום תקין ושהחשבונית שולמה.
- **איך יודעים:** "No balance due".
- **המלכודת:** חשבון שלא שולם מושעה, ואיתו המייל של `support@`.

---

## ⏳ ממתין לגורם חיצוני

| משימה | ממתין ל | מה לעשות בינתיים | מה נפתח כשנסגר |
|---|---|---|---|
| 14. PayPlus | ישראכרט (משימה 3) | כלום. כשיש מסוף: מפתחות חדשים (הנוכחיים נחשפו), מכתב סגירה לתמיכה, ארבעה ערכים ישר ל-Vercel, בדיקת sandbox | הלקוח הראשון שמשלם |
| 15. Apple Developer | אפל צריכה לזהות את ה-D-U-N-S `626520454` | לבדוק כל יום ב-https://developer.apple.com/enroll/duns-lookup/ . אם עד 08/10 לא: https://developer.apple.com/contact/ ← Membership and Account, עם Inquiry 10965765 ו-Case 11024034 | אפליקציית iOS |
| 16. SIM להתראות | משלוח (מוזמן 04/10) | כלום | משימה 8 |
| 17. מספר וואטסאפ לתמיכה | נציג ומספר | כלום | כפתור וואטסאפ באתר ובאפליקציה (#16) |

---

## 🔨 פתוח אצלי

| משימה | מתי | חוסם את |
|---|---|---|
| 18. אפליקציה בחנויות: יצירה ב-Play, בניית `.aab`, assetlinks, חומרי הגשה | אחרי משימה 7 | האפליקציה בחנויות |
| 19. התראות דחיפה מהשרת, כולל "לא נרשמה כניסה" גם כשהאפליקציה סגורה (הלוגיקה בנויה, חסר רק ערוץ השליחה וה-cron) | אחרי מפתח APNs ו-Firebase | התראות בטלפון |
| 20. וואטסאפ לעובדים (#92) | אחרי משימה 8 | תוספת 9 ₪ לעובד |
| 21. מספר התמיכה בכל דרכי הקשר | כשתיתן מספר (משימה 17) | — |
| 22. דפי נחיתה לפי תחום, Conversions API, קריאייטיבים 9:16 ו-1:1 | אחרי משימות 4–5 | מודעות טובות יותר |
| 23. אכיפת תוקף מנוי בשרת | אם תאשר (משימה 12) | — |
| 24. ניתוח שבועי של ייצוא השיווק | כל יום ראשון, אחרי שתשלח קובץ | החלטות תקציב |

---

## יום העלייה (כשהסליקה חיה), לפי הסדר

1. הרשמה מלאה כלקוח חדש בחלון גלישה בסתר: חודש ניסיון, הוספת עובד, שליחת כניסה, העובד מאשר הסכמה ורואה את חלון בחירת השבוע.
2. לקוחות פיילוט קיימים: במשרד האחורי ← כרטיס לקוח ← "פיילוט ללא תשלום", **לפני** `PAYPLUS_READY=true`.
3. `PAYPLUS_READY=true`, ואז הרשמה מהאתר והרשמה דרך `?ref=` של סוכן: בשתיהן מסך "הוספת אמצעי תשלום" ואין כניסה בלי כרטיס (#112).
4. הרשמה עם כרטיס בדיקה, אישור שלא נגבה כסף.
5. מפתחות ייצור, מחיקת `PAYPLUS_SANDBOX`, Redeploy.
6. ניקוי נתוני בדיקה ב-SQL Editor:
   ```sql
   delete from public.companies;
   ```
   ואחר כך מחיקת משתמשי הבדיקה ב-Authentication ← Users.
   **המלכודת:** מוחק גם את חשבון הבדיקה שלך, אין דרך חזרה. לוודא שזה הפרויקט הנכון.
7. הרשמה אחת כלקוח אמיתי, ואז פתיחה ללקוחות.
