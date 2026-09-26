-- SetShifts: database schema for Supabase
--
--  הערה על צורת הקובץ: כל שורת הערה מתחילה ב-"--" ומיד אחריו
--  תווית באנגלית. שורת הערה שכולה סימנים (למשל שורת מסגרת של
--  "=") מתהפכת בעורכים שמציגים מימין לשמאל, ואז שני המקפים
--  שהופכים אותה להערה הולכים לאיבוד וההרצה נכשלת בשורה הראשונה.
--
--  להרצה פעם אחת: Supabase → SQL Editor → הדבקה → Run.
--  אפשר להריץ שוב; כל היצירות מוגנות ב-if not exists / or replace.
--
--  העיקרון: הבידוד בין חברות נאכף בבסיס הנתונים עצמו (RLS), ולא
--  בקוד שרץ בדפדפן. גם אם מישהו יקרא לשרת ישירות, הוא לא יוכל
--  לראות או לשנות נתונים של חברה אחרת.

-- TABLES: טבלאות

create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        text not null default 'starter',
  status      text not null default 'trial',        -- trial | active | past_due | canceled | expired
  valid_until timestamptz,
  created_at  timestamptz not null default now()
);

-- משתמש של חברה. המזהה הוא בדיוק המזהה מ-auth.users, כדי שהקישור
-- יהיה חד-חד-ערכי ושמחיקת משתמש תנקה גם כאן.
create table if not exists public.company_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  email       text not null,
  name        text not null default '',
  role        text not null default 'employee',     -- owner | manager | employee
  employee_id text,                                 -- קישור לכרטיס העובד שבהגדרות
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists company_users_company_idx on public.company_users (company_id);

-- מצב ההזמנה. מנהל שמזמין עובד צריך לדעת אם ההזמנה הגיעה ליעדה:
-- מתי נשלחה, ואם המוזמן כבר נכנס בפעם הראשונה. בלי זה אי אפשר
-- להבדיל בין "עוד לא הספיק" לבין "הקישור אבד" – והמנהל שולח שוב
-- ושוב לעובד שכבר בפנים.
--   invited_at  מתי נשלחה ההזמנה האחרונה (נקבע בשרת, ומתעדכן
--               בשליחה חוזרת כדי שספירת התוקף תתחיל מחדש)
--   joined_at   מתי המוזמן נכנס בפעם הראשונה. את זה כותב רק הוא
--               על עצמו, דרך mark_self_joined.
alter table public.company_users
  add column if not exists invited_at timestamptz,
  add column if not exists joined_at  timestamptz;

-- פרטי המנוי אצל ספק התשלומים. נכתבים אך ורק בידי השרת, בתגובה
-- ל-webhook מהספק – לעולם לא בידי הדפדפן.
-- מספר העוסק / ח.פ. של הלקוח. נדרש על החשבונית שתצא לו, ולכן
-- הוא נתון של הלקוח ולא שלנו: הוא מזין אותו בהגדרות, ואנחנו
-- מעבירים אותו לספק הסליקה כשהוא מנפיק מסמך.
alter table public.companies
  add column if not exists tax_id text;

-- טלפון ליצירת קשר עם הלקוח. נדרש בהרשמה ולא אופציונלי: כשמנוי
-- נכשל, כשלקוח פיילוט נתקע, או כשצריך להודיע על משהו דחוף --
-- מייל שאינו נקרא אינו דרך ליצירת קשר, ואז אין שום דרך.
--
-- אין כאן בדיקת תבנית: מספר תקין בגרמניה אינו נראה כמו מספר
-- תקין בישראל, ובדיקה לפי תבנית אחת פירושה לקוח מחו"ל שאינו
-- יכול להירשם. מה שכן נבדק הוא שיש מספיק ספרות כדי שזה יהיה
-- מספר ולא הקלדה מקרית -- שבע, המספר המקומי הקצר ביותר בעולם.
alter table public.companies
  add column if not exists phone text;

alter table public.companies
  drop constraint if exists companies_phone_check;
alter table public.companies
  add constraint companies_phone_check
  check (phone is null or length(regexp_replace(phone, '\D', '', 'g')) >= 7);

-- לוגו העסק, כ-data URI. מוצג למנהלים ולעובדים.
--
-- בשורה ולא באחסון קבצים: דלי דורש מדיניות גישה משלו וכתובת
-- ציבורית לכל לוגו -- כלומר עוד מקום שבו בידוד בין חברות יכול
-- להישבר, בשביל תמונה של כמה עשרות קילובייט שנוסעת ממילא עם
-- שורת החברה.
--
-- התקרה נאכפת כאן ולא רק בדפדפן: שורה של מגה מאטה כל טעינה של
-- כל עובד בחברה, ומי שפותח את כלי הפיתוח יכול לשלוח כל דבר.
-- 64 קילובייט לאחר קידוד base64 הם כ-88 אלף תווים.
--
-- SVG אינו ברשימת הפורמטים בכוונה: הוא מסמך שיכול להכיל
-- סקריפט, והלוגו הזה מוצג אצל כל העובדים של אותה חברה.
alter table public.companies
  add column if not exists logo text;

alter table public.companies
  drop constraint if exists companies_logo_check;
alter table public.companies
  add constraint companies_logo_check
  check (
    logo is null or (
      length(logo) <= 90000
      and logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'
    )
  );

-- מחיר חודשי שסוכם עם הלקוח הזה, וגובר על מחיר התוכנית.
--
-- קיים בשביל רשתות: מ-100 עובדים ומעלה אין מחירון, המחיר נסגר
-- בפגישה, ובלי מקום להחזיק אותו אי אפשר לחייב אותן בכלל.
--
-- null = אין מחיר מוסכם, כלומר לך לפי המחירון. בתוכנית שאין בה
-- מחירון null פירושו "עוד לא סוכם", והחיוב היומי מדלג במקום
-- לגבות אפס.
--
-- נכתב רק מהמשרד האחורי (service_role): grant update למשתמש
-- מוגבל ל-(name, tax_id) בלבד, ולכן לקוח אינו יכול לקבוע לעצמו
-- את המחיר.
alter table public.companies
  add column if not exists custom_price_monthly integer
    check (custom_price_monthly is null or custom_price_monthly >= 0);

-- תעריף לעובד פעיל, בשקלים לחודש. הצורה השנייה של מחיר מוסכם:
-- רשת שגדלה משלמת יותר ורשת שהתכווצה משלמת פחות, בלי שיחה.
--
-- שתי הצורות לעולם אינן מלאות יחד -- המשרד האחורי מאפס את
-- השנייה בכל שינוי -- כי שורה עם שתיהן היא שורה שאיש לא יידע
-- לקרוא, ובינתיים מישהו יחויב לפי הלא נכונה.
alter table public.companies
  add column if not exists custom_price_per_employee integer
    check (custom_price_per_employee is null or custom_price_per_employee >= 0);

-- BILLING: כמה עובדים, וכמה היו לכל היותר
--
-- שתי העמודות האלה הן מה שתמחור לפי עובד נשען עליו, והן קיימות
-- כי ספירה ברגע אחד היא ספירה שאפשר לתזמן סביבה.
--
-- תאריך החיוב מופיע ללקוח על מסך המנוי. רשת עם מאה עובדים
-- שמכבה תשעים מהם יום לפני -- מתג, לא מחיקה, ואף נתון אינו
-- אובד -- הייתה משלמת עשירית, והחיוב שמצליח דוחף את התקופה
-- חודש קדימה כך שאין ריצה שתתקן. למחרת מדליקים הכל בחזרה.
--
-- לכן לא גובים לפי הרגע אלא לפי השיא בתקופה: המספר הגבוה
-- ביותר שהיה מאז החיוב הקודם. כדי לשלם פחות צריך באמת לא
-- להחזיק את העובדים במערכת לאורך כל החודש -- כלומר לא
-- להשתמש במוצר. זה התמריץ הנכון.
--
-- employee_count  כמה פעילים כרגע
-- employee_peak   כמה היו לכל היותר מאז החיוב האחרון
alter table public.companies
  add column if not exists employee_count integer,
  add column if not exists employee_peak  integer;

alter table public.companies
  add column if not exists billing_provider        text,
  add column if not exists billing_customer_id     text,
  add column if not exists billing_subscription_id text,
  add column if not exists cancel_at_period_end    boolean not null default false,
  add column if not exists current_period_end      timestamptz;

create index if not exists companies_subscription_idx
  on public.companies (billing_subscription_id);

-- יומן אירועי החיוב. ספקי תשלומים שולחים את אותו אירוע יותר מפעם
-- אחת, ולכן כל אירוע נרשם לפי המזהה שלו ומעובד פעם אחת בלבד.
create table if not exists public.billing_events (
  id          text primary key,      -- מזהה האירוע אצל הספק
  provider    text not null,
  company_id  uuid references public.companies(id) on delete set null,
  type        text not null,
  payload     jsonb,
  received_at timestamptz not null default now()
);

-- בלי מדיניות כלל: רק service_role, שעוקף RLS, נוגע בטבלה הזו.
alter table public.billing_events enable row level security;

-- ההגדרות המשותפות של החברה: עובדים, סניפים, סוגי משמרות וכללי שיבוץ
create table if not exists public.company_configs (
  company_id uuid primary key references public.companies(id) on delete cascade,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- שבוע אחד של סידור. published נשמר גם כעמודה, כדי שאפשר יהיה
-- לסנן עליו בכללי ההרשאה בלי לפתוח את ה-JSON.
create table if not exists public.company_weeks (
  company_id uuid not null references public.companies(id) on delete cascade,
  week_key   text not null,
  week       jsonb not null default '{}'::jsonb,
  published  boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (company_id, week_key)
);

create index if not exists company_weeks_updated_idx on public.company_weeks (company_id, updated_at desc);

-- IDENTITY: פונקציות עזר לזהות המשתמש
-- security definer כדי שהן יוכלו לקרוא את company_users בלי להיתקע
-- בכללי ההרשאה של הטבלה עצמה (אחרת נוצרת לולאה).

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.company_users
  where id = auth.uid() and active
  limit 1
$$;

create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.company_users
  where id = auth.uid() and active
  limit 1
$$;

create or replace function public.current_employee_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select employee_id from public.company_users
  where id = auth.uid() and active
  limit 1
$$;

-- מנהל או בעלים
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_name() in ('owner', 'manager'), false)
$$;

-- מסמן שהמשתמש הנוכחי נכנס. security definer כדי שיוכל לכתוב
-- עמודה שאינה פתוחה לכתיבה מהדפדפן, ומוגבל לשורה של הקורא בלבד.
-- נכתב פעם אחת: כניסה שנייה אינה משנה את התאריך הראשון.
create or replace function public.mark_self_joined()
returns void
language sql
security definer
set search_path = public
as $$
  update public.company_users
     set joined_at = now()
   where id = auth.uid() and joined_at is null
$$;

-- שם התצוגה של המשתמש עצמו. עד עכשיו רק מנהל יכול היה לשנות שם,
-- כי company_users_update דורש is_manager() – כלומר עובד שנרשם
-- עם שגיאת כתיב בשם שלו היה תקוע איתה. security definer, ומוגבל
-- לשורה של הקורא בלבד: אין כאן p_user_id, ואי אפשר לכוון אותה
-- למישהו אחר. התפקיד והשיוך לכרטיס העובד אינם נוגעים בה.
create or replace function public.save_own_name(p_name text)
returns public.company_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_row  public.company_users;
begin
  if v_name = '' then
    raise exception 'name required' using errcode = '22023';
  end if;
  update public.company_users
     set name = left(v_name, 80)
   where id = auth.uid()
  returning * into v_row;
  if v_row.id is null then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  return v_row;
end
$$;

-- RLS: הפעלת בידוד

alter table public.companies       enable row level security;
alter table public.company_users   enable row level security;
alter table public.company_configs enable row level security;
alter table public.company_weeks   enable row level security;

-- חברות: רואים רק את החברה שלך.
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select using (id = public.current_company_id());

-- הבעלים רשאי לשנות את שם החברה, וזה הכל. מצב המנוי, התוכנית
-- ותאריך התוקף אינם ניתנים לשינוי מהדפדפן – אחרת כל לקוח היה יכול
-- להעניק לעצמו מנוי חינם בפקודה אחת. את העמודות האלה כותב רק
-- השרת, בתגובה לאישור מספק התשלומים.
-- RLS מגביל שורות; הגבלת עמודות נעשית ב-GRANT, ולכן שניהם יחד.
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies
  for update using (id = public.current_company_id() and public.current_role_name() = 'owner')
  with check (id = public.current_company_id());

-- משתמשים: כל אחד רואה את חברי החברה שלו; רק מנהל מעדכן.
drop policy if exists company_users_select on public.company_users;
create policy company_users_select on public.company_users
  for select using (company_id = public.current_company_id());

drop policy if exists company_users_update on public.company_users;
create policy company_users_update on public.company_users
  for update using (company_id = public.current_company_id() and public.is_manager())
  with check (company_id = public.current_company_id());

-- הגדרות: כולם קוראים, רק מנהל כותב.
drop policy if exists company_configs_select on public.company_configs;
create policy company_configs_select on public.company_configs
  for select using (company_id = public.current_company_id());

drop policy if exists company_configs_write on public.company_configs;
create policy company_configs_write on public.company_configs
  for all using (company_id = public.current_company_id() and public.is_manager())
  with check (company_id = public.current_company_id() and public.is_manager());

-- שבועות: כולם קוראים, רק מנהל כותב ישירות.
-- עובד משנה את האילוצים שלו דרך הפונקציות שבהמשך בלבד.
drop policy if exists company_weeks_select on public.company_weeks;
create policy company_weeks_select on public.company_weeks
  for select using (company_id = public.current_company_id());

drop policy if exists company_weeks_write on public.company_weeks;
create policy company_weeks_write on public.company_weeks
  for all using (company_id = public.current_company_id() and public.is_manager())
  with check (company_id = public.current_company_id() and public.is_manager());

-- SIGNUP: פתיחת חשבון לחברה
-- נקרא מיד אחרי ההרשמה. יוצר את החברה ומגדיר את מי שנרשם כבעלים.
-- הגרסה הקודמת קיבלה שלושה ארגומנטים. הוספת ארגומנט עם ברירת
-- מחדל אינה מחליפה אותה אלא יוצרת עומס נוסף, ואז קריאה בשלושה
-- שמות הופכת לדו-משמעית ונכשלת. לכן מוחקים במפורש.
drop function if exists public.create_company(text, text, int);
-- החתימה גדלה בשני שדות: ההסכמה לדיוור והנוסח שהוצג. הגרסה
-- הקודמת נמחקת במפורש, אחרת שתיהן קיימות ו-PostgREST בוחר לפי
-- מה שנשלח -- ואז הסכמה שנשלחה נופלת בשקט על הגרסה הישנה.
drop function if exists public.create_company(text, text, int, text);

create or replace function public.create_company(
  p_name text, p_user_name text, p_trial_days int default 14, p_phone text default '',
  p_wa_opt_in boolean default false, p_wa_opt_in_text text default '')
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies;
  v_email   text;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'company name is required' using errcode = '22023';
  end if;
  -- משתמש שכבר שייך לחברה לא יכול לפתוח עוד אחת
  if exists (select 1 from public.company_users where id = auth.uid()) then
    raise exception 'user already belongs to a company' using errcode = '23505';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  -- הטלפון נבדק כאן ולא רק בדפדפן: מי שיעקוף את הטופס יוצר
  -- לקוח שאין לנו דרך להגיע אליו.
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 7 then
    raise exception 'a contact phone number is required' using errcode = '22023';
  end if;

  -- ההסכמה נשמרת עם התאריך ועם הנוסח שהוצג, ולא כדגל לבדו:
  -- השאלה שנשאלת בדיעבד אינה "האם הוא הסכים" אלא "מתי, ומה
  -- עמד מול העיניים שלו".
  insert into public.companies (name, phone, plan, status, valid_until,
                                wa_opt_in, wa_opt_in_at, wa_opt_in_text)
  values (trim(p_name), trim(p_phone), 'starter', 'trial',
          now() + make_interval(days => p_trial_days),
          coalesce(p_wa_opt_in, false),
          case when p_wa_opt_in then now() else null end,
          case when p_wa_opt_in then nullif(trim(p_wa_opt_in_text), '') else null end)
  returning * into v_company;

  insert into public.company_users (id, company_id, email, name, role, active)
  values (auth.uid(), v_company.id, v_email,
          coalesce(nullif(trim(p_user_name), ''), v_email), 'owner', true);

  insert into public.company_configs (company_id, config) values (v_company.id, '{}'::jsonb);

  return v_company;
end;
$$;

-- CONSTRAINTS: אילוץ של עובד
-- עובד אינו רשאי לכתוב לשורת השבוע ישירות, ולכן העריכה עוברת כאן:
-- הפונקציה כותבת רק את המפתח שלו, ותמיד מסמנת את הבקשה כממתינה.
-- DEADLINE: מועד סגירת ההגשות
-- המנהל קובע יום ושעה בהגדרות החברה. המועד חל על היום הזה לפני
-- תחילת השבוע שאליו מגישים. הבדיקה חוזרת כאן ולא רק בדפדפן, כי
-- עובד שיפתח את כלי הפיתוח יוכל אחרת להגיש אחרי הסגירה.
create or replace function public.constraints_deadline(p_company uuid, p_week_key text)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config   jsonb;
  v_deadline jsonb;
  v_day      int;
  v_time     time;
  v_tz       text;
  v_date     date;
begin
  select config->'settings'->'constraintsDeadline' into v_deadline
    from public.company_configs where company_id = p_company;

  if v_deadline is null or coalesce((v_deadline->>'enabled')::boolean, false) = false then
    return null;
  end if;

  v_day  := coalesce((v_deadline->>'dayIdx')::int, 0);
  v_time := coalesce(nullif(v_deadline->>'time', ''), '20:00')::time;
  v_tz   := coalesce(nullif(v_deadline->>'timezone', ''), 'Asia/Jerusalem');

  -- אחורה מתחילת השבוע עד היום שנבחר, תמיד לפניו
  v_date := (p_week_key::date) - 1;
  while extract(dow from v_date)::int <> v_day loop
    v_date := v_date - 1;
  end loop;

  return (v_date + v_time) at time zone v_tz;
exception
  when others then
    -- הגדרה פגומה לא תחסום עובד מלהגיש
    return null;
end;
$$;

create or replace function public.save_own_constraint(
  p_week_key text, p_day_idx int, p_constraint jsonb)
returns public.company_weeks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company  uuid := public.current_company_id();
  v_employee text := public.current_employee_id();
  v_role     text := public.current_role_name();
  v_key      text;
  v_week     public.company_weeks;
  v_record   jsonb;
begin
  if v_company is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if coalesce(v_employee, '') = '' then
    raise exception 'user is not linked to a staff card' using errcode = '22023';
  end if;

  -- שבוע הוא שבעה ימים. בלי הבדיקה הזו עובד שפותח את כלי
  -- הפיתוח יכול לשלוח יום 999, לייצר מפתח שאיש אינו קורא,
  -- ולשרוף בו בקשה מהמכסה שלו – זבל שקט שמתגלה רק כשהמכסה
  -- אוזלת בלי סיבה נראית לעין.
  if p_day_idx is null or p_day_idx < 0 or p_day_idx > 6 then
    raise exception 'day index must be between 0 and 6' using errcode = '22023';
  end if;

  insert into public.company_weeks (company_id, week_key, week)
  values (v_company, p_week_key,
          '{"constraints":{},"assignments":{},"manual":{},"holidays":{},"shabbatEnd":"","note":""}'::jsonb)
  on conflict (company_id, week_key) do nothing;

  select * into v_week from public.company_weeks
  where company_id = v_company and week_key = p_week_key for update;

  if v_week.published and v_role = 'employee' then
    raise exception 'week already published' using errcode = '55000';
  end if;

  -- מועד הסגירה חל על עובדים בלבד. מנהל רשאי לתקן גם אחריו.
  if v_role = 'employee' then
    declare v_deadline timestamptz := public.constraints_deadline(v_company, p_week_key);
    begin
      if v_deadline is not null and now() > v_deadline then
        raise exception 'constraint deadline has passed' using errcode = '55001';
      end if;
    end;
  end if;

  v_key := v_employee || '|' || p_day_idx::text;

  -- תקרת הבקשות. נאכפת כאן ולא רק במסך, מאותה סיבה כמו מועד
  -- הסגירה: עובד שיפתח את כלי הפיתוח יוכל אחרת לשלוח בקשה
  -- שלישית כשהמנהל התיר שתיים. חלה על עובדים בלבד.
  --
  -- מה נספר: יום שבו העובד הגביל זמינות – ביקש חופש או חסם
  -- משמרת – ובנוסף, לפי הגדרת העסק, גם יום שבו הביע העדפה.
  -- countPreferences דלוק כברירת מחדל, כולל אצל עסק שנפתח לפני
  -- שההגדרה נולדה: מנהל שהגביל ל-3 מצפה לראות 3 שורות. בקשה
  -- שנדחתה אינה נספרת בשום מצב, והיום הנוכחי מוחרג כדי שעריכה
  -- של בקשה קיימת לא תיספר פעמיים.
  if v_role = 'employee'
     and p_constraint is not null and p_constraint <> 'null'::jsonb then
    declare
      v_limit jsonb;
      v_max   int;
      v_used  int;
      v_prefs boolean;
      v_counts boolean;
    begin
      select config->'settings'->'constraintLimit' into v_limit
        from public.company_configs where company_id = v_company;

      if v_limit is not null and coalesce((v_limit->>'enabled')::boolean, false) then
        v_max := greatest(1, coalesce((v_limit->>'max')::int, 2));
        v_prefs := coalesce((v_limit->>'countPreferences')::boolean, true);

        -- האם הבקשה שעומדת להישמר נספרת בכלל
        v_counts := coalesce((p_constraint->>'off')::boolean, false)
          or (coalesce(jsonb_typeof(p_constraint->'blocked'), 'null') = 'object'
              and p_constraint->'blocked' <> '{}'::jsonb)
          or (v_prefs
              and coalesce(jsonb_typeof(p_constraint->'preferred'), 'null') = 'object'
              and p_constraint->'preferred' <> '{}'::jsonb);

        select count(*) into v_used
          from jsonb_each(coalesce(v_week.week->'constraints', '{}'::jsonb)) as item(key, value)
         where item.key like v_employee || '|%'
           and item.key <> v_key
           and coalesce(item.value->>'status', 'approved') <> 'rejected'
           and (coalesce((item.value->>'off')::boolean, false)
                or (coalesce(jsonb_typeof(item.value->'blocked'), 'null') = 'object'
                    and item.value->'blocked' <> '{}'::jsonb)
                or (v_prefs
                    and coalesce(jsonb_typeof(item.value->'preferred'), 'null') = 'object'
                    and item.value->'preferred' <> '{}'::jsonb));

        if v_counts and v_used >= v_max then
          -- המספר נכנס להודעה כדי שהמסך יוכל לומר "עד N בקשות"
          -- בלי לנחש ובלי לקרוא את ההגדרות בעצמו.
          raise exception 'constraint limit reached: %', v_max using errcode = '55002';
        end if;
      end if;
    exception
      -- הגדרה פגומה לא תחסום עובד מלהגיש; חריגה אמיתית כן.
      when sqlstate '55002' then raise;
      when others then null;
    end;
  end if;

  if p_constraint is null or p_constraint = 'null'::jsonb then
    v_week.week := jsonb_set(
      coalesce(v_week.week, '{}'::jsonb), '{constraints}',
      coalesce(v_week.week->'constraints', '{}'::jsonb) - v_key, true);
  else
    -- כל הגשה חוזרת למצב "ממתין", גם אם הבקשה הקודמת כבר אושרה
    v_record := p_constraint
      || jsonb_build_object(
           'status', 'pending',
           'requestedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'managerNote', '',
           'note', left(coalesce(p_constraint->>'note', ''), 300))
      - 'decidedAt' - 'decidedBy';
    v_week.week := jsonb_set(
      public.week_with_constraints(v_week.week), array['constraints', v_key], v_record, true);
  end if;

  update public.company_weeks
     set week = v_week.week, updated_at = now()
   where company_id = v_company and week_key = p_week_key
  returning * into v_week;

  -- מה שחוזר לעובד הוא הפרוסה שלו, ולא השבוע כולו. בלי זה כל
  -- שמירת בקשה הייתה מחזירה לו את הסידור של כולם ואת הסיבות
  -- שעמיתיו כתבו.
  v_week.week := public.week_as_seen(v_week);
  return v_week;
end;
$$;

-- עדכון הסיבה בלבד. אינו מחזיר בקשה מאושרת למצב המתנה.
create or replace function public.save_own_note(p_week_key text, p_day_idx int, p_note text)
returns public.company_weeks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company  uuid := public.current_company_id();
  v_employee text := public.current_employee_id();
  v_role     text := public.current_role_name();
  v_key      text;
  v_week     public.company_weeks;
begin

  if p_day_idx is null or p_day_idx < 0 or p_day_idx > 6 then
    raise exception 'day index must be between 0 and 6' using errcode = '22023';
  end if;
  if v_company is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if coalesce(v_employee, '') = '' then
    raise exception 'user is not linked to a staff card' using errcode = '22023';
  end if;

  select * into v_week from public.company_weeks
  where company_id = v_company and week_key = p_week_key for update;

  if v_week is null then
    raise exception 'no request for that day' using errcode = 'P0002';
  end if;
  if v_week.published and v_role = 'employee' then
    raise exception 'week already published' using errcode = '55000';
  end if;

  v_key := v_employee || '|' || p_day_idx::text;
  if v_week.week->'constraints'->v_key is null then
    raise exception 'no request for that day' using errcode = 'P0002';
  end if;

  update public.company_weeks
     set week = jsonb_set(week, array['constraints', v_key, 'note'],
                          to_jsonb(left(coalesce(p_note, ''), 300)), true),
         updated_at = now()
   where company_id = v_company and week_key = p_week_key
  returning * into v_week;

  -- מה שחוזר לעובד הוא הפרוסה שלו, ולא השבוע כולו. בלי זה כל
  -- שמירת בקשה הייתה מחזירה לו את הסידור של כולם ואת הסיבות
  -- שעמיתיו כתבו.
  v_week.week := public.week_as_seen(v_week);
  return v_week;
end;
$$;

-- TIMECLOCK: דיווח שעון של העובד על עצמו
--
-- שלושה דברים נקבעים כאן ולא בדפדפן, וכל אחד מהם הוא הסיבה
-- שהפונקציה קיימת בכלל:
--   · מי    – מהסשן, לא מהבקשה. אחרת אפשר לדווח בשם אחר.
--   · מתי   – משעון השרת, לא משעון הטלפון. שעון טלפון ניתן
--             לשינוי בהגדרות, וזה הדבר הראשון שמישהו ינסה.
--   · האם   – רק כשהמנהל הדליק את השעון והתיר דיווח מהטלפון.
--
-- גם כיוון הדיווח נגזר בשרת ולא מתקבל מהבקשה: כפתור שנלחץ
-- פעמיים ברשת איטית לא ייצור יציאה לפני כניסה.
-- ===== חלון ההחתמה =====
--
-- שעון נוכחות שכל אחד יכול להחתים בו בכל שעה מייצר שעות שלא
-- סוכמו: עובד שמגיע שלוש שעות מוקדם, עובד שמחתים ביום שאינו
-- עובד בו, ומי שמחתים ושוכח לצאת. המנהל מגלה את זה בתלוש.
--
-- הכלל: כניסה מותרת רק כשיש לעובד משמרת שעומדת להתחיל
-- (בברירת מחדל שעתיים מראש) או משמרת שכבר רצה — כי עובד
-- שמאחר עדיין צריך להחתים.
--
-- שלוש הגנות על הכלל עצמו, כדי שלא ייצור תקלה גרועה מזו
-- שהוא פותר:
--
--   · יציאה לעולם אינה נבדקת כאן. הבדיקה נקראת רק על כניסה.
--   · כל שגיאה בדרך מחזירה true. הגדרה פגומה או שעה לא
--     תקינה לא ימנעו מעובד להחתים כניסה למשמרת אמיתית.
--
-- מה שפותח את החלון הוא משמרת בסידור שפורסם. סידור בטיוטה
-- אינו מגיע למכשיר של העובד בכלל, ולכן כלל שמסתמך עליו היה
-- נאכף כאן ולא במסך — והעובד היה רואה הודעה שסותרת את מה
-- שהשרת מרשה.
--
-- זהו התאום של Store.canPunchIn בצד הלקוח. שם זה מה שמצויר
-- על המסך, וכאן זה מה שנאכף.
create or replace function public.punch_window_open(
  p_company uuid, p_week_key text, p_employee text, p_at timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config    jsonb;
  v_clock     jsonb;
  v_week      jsonb;
  v_published boolean;
  v_lead      int;
  v_tz        text;
  v_key       text;
  v_ids       jsonb;
  v_day       int;
  v_branch    text;
  v_shift     text;
  v_slot      jsonb;
  v_from      text;
  v_to        text;
  v_start     timestamptz;
  v_finish    timestamptz;
  v_date      date;
begin
  select config into v_config from public.company_configs where company_id = p_company;
  v_clock := coalesce(v_config->'settings'->'timeclock', '{}'::jsonb);

  -- הכלל כבוי בהגדרות
  if coalesce(v_clock->>'requireShift', 'true') <> 'true' then
    return true;
  end if;

  select week, published into v_week, v_published
    from public.company_weeks
   where company_id = p_company and week_key = p_week_key;

  -- אין שבוע, או שהוא עוד לא פורסם: אין משמרת שהעובד יודע עליה
  if v_week is null or coalesce(v_published, false) = false then
    return false;
  end if;

  v_lead := coalesce(nullif(v_clock->>'leadMinutes', '')::int, 120);
  if v_lead <= 0 then v_lead := 120; end if;
  v_tz := coalesce(nullif(v_clock->>'timeZone', ''), 'Asia/Jerusalem');

  for v_key, v_ids in
    select key, value from jsonb_each(coalesce(v_week->'assignments', '{}'::jsonb))
  loop
    -- רק המשמרות של העובד הזה
    if not (v_ids @> to_jsonb(p_employee)) then
      continue;
    end if;

    v_day    := split_part(v_key, '|', 1)::int;
    v_branch := split_part(v_key, '|', 2);
    v_shift  := split_part(v_key, '|', 3);

    -- יום חג: אין עבודה, ולכן גם אין חלון
    if (v_week->'holidays') ? v_day::text then
      continue;
    end if;

    -- שעות המשמרת בסניף קודמות להגדרת המשמרת הכללית
    select branch->'schedule'->v_day::text->v_shift into v_slot
      from jsonb_array_elements(coalesce(v_config->'branches', '[]'::jsonb)) as branch
     where branch->>'id' = v_branch
     limit 1;

    v_from := v_slot->>'from';
    v_to   := v_slot->>'to';

    -- מוצ״ש: שעת ההתחלה נגזרת משעת צאת השבת של אותו שבוע
    if coalesce(v_slot->>'auto', '') = 'motzash'
       and coalesce(v_week->>'shabbatEnd', '') <> '' then
      v_from := to_char((v_week->>'shabbatEnd')::time + interval '30 minutes', 'HH24:MI');
    end if;

    if coalesce(v_from, '') = '' or coalesce(v_to, '') = '' then
      select s->>'from', s->>'to' into v_from, v_to
        from jsonb_array_elements(coalesce(v_config->'settings'->'shifts', '[]'::jsonb)) as s
       where s->>'id' = v_shift
       limit 1;
    end if;

    if coalesce(v_from, '') = '' or coalesce(v_to, '') = '' then
      continue;
    end if;

    v_date   := (p_week_key::date) + v_day;
    v_start  := (v_date + v_from::time) at time zone v_tz;
    v_finish := (v_date + v_to::time) at time zone v_tz;
    -- משמרת שחוצה חצות נגמרת למחרת
    if v_finish <= v_start then
      v_finish := v_finish + interval '1 day';
    end if;

    if p_at >= v_start - make_interval(mins => v_lead) and p_at <= v_finish then
      return true;
    end if;
  end loop;

  return false;
exception
  when others then
    -- הגדרה פגומה לא תחסום עובד מלהחתים על משמרת אמיתית
    return true;
end;
$$;

revoke all on function public.punch_window_open(uuid, text, text, timestamptz) from public;
grant execute on function public.punch_window_open(uuid, text, text, timestamptz) to authenticated;

create or replace function public.save_own_punch(p_week_key text)
returns public.company_weeks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company  uuid := public.current_company_id();
  v_employee text := public.current_employee_id();
  v_config   jsonb;
  v_mode     text;
  v_week     public.company_weeks;
  v_punches  jsonb;
  v_last     jsonb;
  v_kind     text;
  v_now      timestamptz := now();
  v_target   text := p_week_key;
  v_prev_key text;
  v_prev     jsonb;
begin
  if v_company is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if coalesce(v_employee, '') = '' then
    raise exception 'user is not linked to a staff card' using errcode = '22023';
  end if;

  select config into v_config from public.company_configs where company_id = v_company;
  v_mode := coalesce(v_config->'settings'->'timeclock'->>'mode', 'phone');
  if coalesce(v_config->'settings'->'timeclock'->>'enabled', 'false') <> 'true'
     or v_mode not in ('phone', 'both') then
    raise exception 'time clock is off' using errcode = '55000';
  end if;

  -- ===== משמרת לילה שחוצה את סוף השבוע =====
  --
  -- העובד נכנס במוצאי שבת ב-22:00 ויוצא בראשון ב-02:00. שני
  -- הדיווחים הם משמרת אחת, אבל היציאה נופלת ביום הראשון של
  -- השבוע הבא. אם היא נכתבת לשם, שני השבועות משקרים: באחד
  -- משמרת פתוחה, בשני יציאה יתומה, ובתלוש אפס שעות על לילה
  -- שלם של עבודה.
  --
  -- לכן כשאין לעובד עוד אף דיווח בשבוע החדש, ובשבוע שלפניו
  -- הדיווח האחרון שלו הוא כניסה – הוא עדיין בתוך המשמרת,
  -- והיציאה נרשמת שם. התנאי "אין דיווח בשבוע החדש" הוא מה
  -- שמגביל את זה לרגע הזה בלבד.
  if p_week_key ~ '^\d{4}-\d{2}-\d{2}$' then
    if not exists (
      select 1 from public.company_weeks w,
        jsonb_array_elements(coalesce(w.week->'punches', '[]'::jsonb)) as item
       where w.company_id = v_company and w.week_key = p_week_key
         and item->>'empId' = v_employee
    ) then
      v_prev_key := to_char((p_week_key::date - 7), 'YYYY-MM-DD');
      select item into v_prev
        from public.company_weeks w,
          jsonb_array_elements(coalesce(w.week->'punches', '[]'::jsonb)) as item
       where w.company_id = v_company and w.week_key = v_prev_key
         and item->>'empId' = v_employee
       order by item->>'at' desc
       limit 1;
      if coalesce(v_prev->>'kind', '') = 'in' then
        v_target := v_prev_key;
      end if;
    end if;
  end if;

  -- שורת שבוע נוצרת אם אין: עובד שדיווח בשבוע שהמנהל טרם נגע
  -- בו אינו אמור לקבל שגיאה.
  insert into public.company_weeks (company_id, week_key, week, published)
  values (v_company, v_target, '{}'::jsonb, false)
  on conflict (company_id, week_key) do nothing;

  select * into v_week from public.company_weeks
   where company_id = v_company and week_key = v_target for update;

  v_punches := coalesce(v_week.week->'punches', '[]'::jsonb);

  -- הדיווח האחרון של העובד הזה. החותמות נשמרות כ-ISO ב-UTC,
  -- ולכן מיון טקסטואלי הוא גם מיון כרונולוגי.
  select item into v_last
    from jsonb_array_elements(v_punches) as item
   where item->>'empId' = v_employee
   order by item->>'at' desc
   limit 1;

  v_kind := case when coalesce(v_last->>'kind', 'out') = 'in' then 'out' else 'in' end;

  -- חלון כפילות: לחיצה כפולה או שליחה חוזרת אינן דיווח שני,
  -- ולכן הוא חוסם כל דיווח נוסף של אותו עובד ולא רק באותו
  -- כיוון — אחרת הלחיצה השנייה הייתה נרשמת כיציאה מיידית,
  -- והעובד היה מגלה בסוף החודש שעבד דקה. נבלע בשקט, והמסך
  -- מראה את המצב הנכון.
  if v_last is not null
     and abs(extract(epoch from (v_now - (v_last->>'at')::timestamptz))) <= 90 then
    v_week.week := public.week_as_seen(v_week);
    return v_week;
  end if;

  -- כניסה רק כשיש משמרת קרובה. יציאה לעולם אינה נבדקת: מי
  -- שבפנים חייב לצאת, אחרת המשמרת נשארת פתוחה ולא נספרת.
  --
  -- מספר הדקות נכלל בהודעה, כדי שהמסך יגיד "בשעתיים הקרובות"
  -- לפי מה שהעסק הגדיר ולא לפי מספר שקבוע בקוד הלקוח.
  if v_kind = 'in'
     and not public.punch_window_open(v_company, v_target, v_employee, v_now) then
    raise exception 'no shift within the punch window %',
      coalesce(nullif(v_config->'settings'->'timeclock'->>'leadMinutes', '')::int, 120)
      using errcode = '55001';
  end if;

  v_punches := v_punches || jsonb_build_array(jsonb_build_object(
    'id',    'pch-' || gen_random_uuid()::text,
    'empId', v_employee,
    'kind',  v_kind,
    'at',    to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'src',   'phone'));

  update public.company_weeks
     set week = jsonb_set(coalesce(week, '{}'::jsonb), array['punches'], v_punches, true),
         updated_at = now()
   where company_id = v_company and week_key = v_target
  returning * into v_week;

  -- מה שחוזר לעובד הוא הפרוסה שלו, ולא השבוע כולו. השורה
  -- נושאת את week_key שלה, ולכן הלקוח יודע לאיזה שבוע הדיווח
  -- נכנס גם כשזה אינו השבוע ששלח.
  v_week.week := public.week_as_seen(v_week);
  return v_week;
end;
$$;

-- LEAVE: בקשת חופשה עתידית
--
-- נכתבת כרשומה יומית על כל יום בטווח, עם requestId משותף. כך
-- היא יורשת את כל מה שכבר קיים ליום בודד — סטטוס, אישור, הערת
-- מנהל, התראה לעובד, וספירה בדוח החודשי — ואין מבנה שני שצריך
-- להישאר מסונכרן איתו.
--
-- שלושה דברים נאכפים כאן ולא במסך: מי (מהסשן), מתי (טווח בעבר
-- אינו בקשה אלא תיקון, וזה של המנהל), וכמה (תקרה על האורך, כדי
-- שבקשה אחת לא תכתוב מאות רשומות).
--
-- שבוע שכבר פורסם אינו חוסם כאן, בשונה מבקשת אילוץ רגילה:
-- אילוץ משנה זמינות לסידור שטרם נבנה, ובקשת חופשה היא בקשה
-- לאדם. המנהל יראה אותה ויחליט אם לשנות את הסידור.
-- החתימה הקודמת קיבלה p_paid. היא נמחקת ולא נשארת לצדה, כי
-- create or replace עם פרמטרים אחרים יוצר עומס ולא מחליף —
-- ואז הייתה נשארת דרך לבקש חופשה שאינה בתשלום.
drop function if exists public.request_leave(date, date, boolean, text);

create or replace function public.request_leave(
  p_from date, p_to date, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company   uuid := public.current_company_id();
  v_employee  text := public.current_employee_id();
  v_request   text;
  v_record    jsonb;
  v_day       date;
  v_week_key  text;
  v_day_idx   int;
  v_days      int := 0;
  v_weeks     text[] := '{}';
begin
  if v_company is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if coalesce(v_employee, '') = '' then
    raise exception 'user is not linked to a staff card' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'invalid leave range' using errcode = '22023';
  end if;
  if p_to - p_from > 59 then
    raise exception 'leave range too long' using errcode = '22023';
  end if;
  if p_from < current_date then
    raise exception 'leave must start today or later' using errcode = '22023';
  end if;

  v_request := 'lv-' || gen_random_uuid()::text;
  v_record := jsonb_build_object(
    'off', true,
    'blocked', '{}'::jsonb,
    'preferred', '{}'::jsonb,
    'note', left(coalesce(p_note, ''), 300),
    'status', 'pending',
    'requestedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'managerNote', '',
    'requestId', v_request,
    'leaveFrom', to_char(p_from, 'YYYY-MM-DD'),
    'leaveTo', to_char(p_to, 'YYYY-MM-DD'),
    -- בקשה מראש היא תמיד בקשה לחופשה בתשלום. אין פרמטר שאפשר
    -- לשלוח אחרת, ולכן אין גם מה לעקוף.
    'leave', 'paid');

  v_day := p_from;
  while v_day <= p_to loop
    -- השבוע מתחיל ביום ראשון, ולכן extract(dow) הוא גם מדד היום
    v_day_idx := extract(dow from v_day)::int;
    v_week_key := to_char(v_day - v_day_idx, 'YYYY-MM-DD');

    insert into public.company_weeks (company_id, week_key, week, published)
    values (v_company, v_week_key, '{}'::jsonb, false)
    on conflict (company_id, week_key) do nothing;

    update public.company_weeks
       set week = jsonb_set(public.week_with_constraints(week),
             array['constraints', v_employee || '|' || v_day_idx::text], v_record, true),
           updated_at = now()
     where company_id = v_company and week_key = v_week_key;

    if not (v_week_key = any(v_weeks)) then v_weeks := v_weeks || v_week_key; end if;
    v_days := v_days + 1;
    v_day := v_day + 1;
  end loop;

  return jsonb_build_object('requestId', v_request, 'days', v_days,
    'weeks', to_jsonb(v_weeks));
end;
$$;

-- אישור או דחייה של בקשה. שמור למנהל ולבעלים.
create or replace function public.decide_constraint(
  p_week_key text, p_employee_id text, p_day_idx int, p_decision text, p_note text default '')
returns public.company_weeks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_key     text := p_employee_id || '|' || p_day_idx::text;
  v_week    public.company_weeks;
begin

  if p_day_idx is null or p_day_idx < 0 or p_day_idx > 6 then
    raise exception 'day index must be between 0 and 6' using errcode = '22023';
  end if;
  if v_company is null or not public.is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;

  select * into v_week from public.company_weeks
  where company_id = v_company and week_key = p_week_key for update;

  if v_week is null or v_week.week->'constraints'->v_key is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  update public.company_weeks
     set week = jsonb_set(week, array['constraints', v_key],
           (week->'constraints'->v_key) || jsonb_build_object(
             'status', p_decision,
             'managerNote', coalesce(p_note, ''),
             'decidedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'decidedBy', auth.uid()::text), true),
         updated_at = now()
   where company_id = v_company and week_key = p_week_key
  returning * into v_week;

  return v_week;
end;
$$;

-- GRANTS: הרשאות קריאה לפונקציות
grant execute on function public.create_company(text, text, int, text, boolean, text) to authenticated;
grant execute on function public.save_own_constraint(text, int, jsonb)           to authenticated;
grant execute on function public.save_own_note(text, int, text)                  to authenticated;
grant execute on function public.save_own_punch(text)                            to authenticated;
grant execute on function public.request_leave(date, date, text)                 to authenticated;
grant execute on function public.decide_constraint(text, text, int, text, text)  to authenticated;
grant execute on function public.current_company_id()                            to authenticated;
grant execute on function public.current_role_name()                             to authenticated;
grant execute on function public.current_employee_id()                           to authenticated;
grant execute on function public.is_manager()                                    to authenticated;
grant execute on function public.mark_self_joined()                               to authenticated;
grant execute on function public.save_own_name(text)                              to authenticated;
grant execute on function public.constraints_deadline(uuid, text)                to authenticated;

-- חברות: קריאה בלבד, ושינוי השם בלבד. פתיחת חברה נעשית דרך
-- create_company, ומחיקה אינה מתאפשרת מהדפדפן.
revoke all on public.companies from authenticated;
grant select on public.companies to authenticated;
-- שם העסק ומספר העוסק הם של הלקוח, ולכן הוא עורך אותם. מצב
-- המנוי, התוכנית והתוקף אינם ברשימה הזו בכוונה.
grant update (name, tax_id, phone, logo) on public.companies to authenticated;

-- משתמשים: קריאה ועדכון. יצירה נעשית בשרת (api/create-user.js),
-- כי היא דורשת מפתח ניהול.
revoke all on public.company_users from authenticated;
grant select on public.company_users to authenticated;
-- invited_at פתוח למנהל כדי ששליחה חוזרת תאפס את שעון התוקף.
-- joined_at אינו פתוח לאיש: אותו כותב רק המוזמן על עצמו,
-- דרך mark_self_joined, כדי ש"הצטרף" יהיה עובדה ולא הצהרה.
grant update (name, role, employee_id, active, invited_at) on public.company_users to authenticated;

grant select, insert, update, delete on public.company_configs to authenticated;
grant select, insert, update, delete on public.company_weeks   to authenticated;

-- אף אחד מלבד השרת אינו רואה את יומן החיובים
revoke all on public.billing_events from authenticated, anon;

-- SUPPORT: קריאות שירות
--  לקוח מדווח על תקלה או מבקש פיתוח. הטבלה נועדה שגם הלקוח יראה
--  את מה שפתח ואת הסטטוס שלו, ולא רק אנחנו.
--
--  שתי הפרדות חשובות:
--   · הלקוח כותב subject/body/kind בלבד. status ו-reply שייכים
--     לנו, ונאכפים בהרשאת עמודה – RLS אינו יודע להגביל עמודות.
--   · קריאה של חברה אחת אינה נראית לחברה אחרת, כמו כל השאר.
create table if not exists public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  created_by   uuid not null references auth.users(id) on delete cascade,
  kind         text not null default 'bug'
                 check (kind in ('bug', 'feature', 'question')),
  subject      text not null check (length(trim(subject)) between 1 and 200),
  body         text not null check (length(trim(body)) between 1 and 5000),
  status       text not null default 'open'
                 check (status in ('open', 'in_progress', 'answered', 'closed')),
  reply        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists support_tickets_company_idx
  on public.support_tickets (company_id, created_at desc);

alter table public.support_tickets enable row level security;

drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets
  for select using (company_id = public.current_company_id());

-- כל מי ששייך לחברה רשאי לפתוח קריאה. גם עובד נתקל בתקלות,
-- ולשלוח אותו דרך המנהל פירושו שלא נשמע עליהן.
drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets
  for insert with check (
    company_id = public.current_company_id() and created_by = auth.uid());

-- אין עדכון ואין מחיקה מהדפדפן: קריאה שנפתחה נשארת ברשומה.

revoke all on public.support_tickets from authenticated, anon;
grant select on public.support_tickets to authenticated;
grant insert (company_id, created_by, kind, subject, body) on public.support_tickets to authenticated;

-- REALTIME: עדכונים חיים (אופציונלי)
-- מפעיל שידור שינויים בזמן אמת. הבידוד נשמר: Supabase מכבד את
-- כללי ה-RLS גם בשידור.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.company_weeks;
    alter publication supabase_realtime add table public.company_configs;
    alter publication supabase_realtime add table public.support_tickets;
  end if;
exception
  when duplicate_object then null;   -- כבר נוסף בהרצה קודמת
end;
$$;

-- ROLE GUARD: הגנה על עמודת התפקיד
-- company_users_update דורש is_manager(), ו-GRANT מתיר לעדכן את
-- העמודה role. שני אלה יחד פירושם שמנהל יכול לשלוח ל-PostgREST
--     PATCH /company_users?id=eq.<עצמו>   {"role":"owner"}
-- ולהעניק לעצמו בעלות – ומשם גישה למסך החיוב: ביטול המנוי,
-- החלפת התוכנית, והחלפת אמצעי התשלום.
--
-- זו אינה תקלה תיאורטית: "מנהל" הוא בדיוק אחראי משמרת, כלומר
-- עובד שהבעלים נתן לו גישה לסידור ובמכוון לא לכסף.
--
-- המסך והשרת כבר מגבילים את זה, והספק המדומה גם – ולכן שום
-- בדיקה לא תפסה את זה. מי שפותח את כלי הפיתוח אינו עובר דרך
-- אף אחד מהם, והכלל צריך לשבת במקום היחיד שאי אפשר לעקוף.
--
-- הכללים זהים לאלה של הספק המדומה, כדי שסביבת הפיתוח והייצור
-- יתנהגו אותו דבר:
--   · בעלות אינה ניתנת להענקה בעדכון. היא נקבעת פעם אחת,
--     ב-create_company, ותו לא.
--   · שורת הבעלים אינה ניתנת לשינוי תפקיד או השבתה בכלל –
--     גם לא בידי הבעלים עצמו, אחרת אפשר להישאר בלי בעלים.
create or replace function public.guard_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- השרת (service_role) אינו נושא זהות משתמש ואינו משנה תפקידים
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role and new.role = 'owner' then
    raise exception 'ownership cannot be granted by update' using errcode = '42501';
  end if;

  if old.role = 'owner'
     and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'the owner account cannot be changed this way' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists company_users_role_guard on public.company_users;
create trigger company_users_role_guard
  before update on public.company_users
  for each row execute function public.guard_user_role();

-- BILLING: מי סופר את העובדים
--
-- לא הדפדפן. הלקוח כותב את ההגדרות שלו, ולכן כל מספר שהוא
-- שולח הוא מספר שאפשר לשלוח אחר במקומו. הספירה נעשית כאן,
-- על השורה שנכתבה, ובלי לשאול אף אחד.
--
-- זה גם המסלול היחיד שאי אפשר לעקוף: כדי להשתמש במוצר חייבים
-- לשמור הגדרות, וכל שמירה עוברת כאן.
--
-- השיא עולה ואינו יורד. הוא מתאפס רק במנוע החיוב, ורק אחרי
-- חיוב שהצליח -- אחרת חיוב שנכשל היה מוחק את מה שהוא בדיוק
-- לא הצליח לגבות.
create or replace function public.track_employee_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list jsonb;
  v_count integer;
begin
  v_list := new.config -> 'employees';

  -- הגדרות שאין בהן רשימה אינן "אפס עובדים" אלא "לא נספר",
  -- ולכן לא נוגעים במה שנמדד. אין כאן coalesce לרשימה ריקה
  -- בכוונה: הוא היה הופך שמירה חלקית אחת -- הגדרות שנכתבו
  -- בלי המפתח -- לאפס עובדים, ומדלג על לקוח אמיתי בחיוב.
  --
  -- רשימה ריקה מפורשת היא כן אפס: זה עסק שמחק את כולם, וזה
  -- מצב אמיתי שצריך להירשם.
  if v_list is null or jsonb_typeof(v_list) <> 'array' then
    return new;
  end if;

  -- עובד בלי active נחשב פעיל, בדיוק כמו במסכים. ההשוואה היא
  -- על הטקסט ולא על המרה לבוליאני, כדי שערך מפתיע בהגדרות
  -- לא יפיל שמירה של לקוח.
  select count(*) into v_count
    from jsonb_array_elements(v_list) as e
   where coalesce(e ->> 'active', 'true') <> 'false';

  update public.companies
     set employee_count = v_count,
         employee_peak  = greatest(coalesce(employee_peak, 0), v_count)
   where id = new.company_id;

  return new;
end;
$$;

drop trigger if exists company_configs_employee_count on public.company_configs;
create trigger company_configs_employee_count
  after insert or update on public.company_configs
  for each row execute function public.track_employee_count();

-- מילוי לאחור: מה שכבר שמור היום. בלי זה לקוח שלא ייגע
-- בהגדרות עד החיוב הבא היה מגיע אליו בלי מספר בכלל.
update public.companies c
   set employee_count = sub.cnt,
       employee_peak  = greatest(coalesce(c.employee_peak, 0), sub.cnt)
  from (
    select cfg.company_id,
           (select count(*)
              from jsonb_array_elements(cfg.config -> 'employees') as e
             where coalesce(e ->> 'active', 'true') <> 'false') as cnt
      from public.company_configs cfg
     where jsonb_typeof(cfg.config -> 'employees') = 'array'
  ) as sub
 where c.id = sub.company_id
   and c.employee_count is distinct from sub.cnt;

-- PRIVACY: מה שעובד רואה בפועל
--
-- עובד רואה במסך רק את המשמרות שלו ואת הבקשות שלו. עד כאן זה
-- היה נכון במסך בלבד: כלל ההרשאה על company_weeks פתח את כל
-- השורה לכל מי שבחברה, ולכן השבוע המלא – כולל השיבוצים של
-- כולם והסיבות האישיות שעמיתים כתבו לבקשות שלהם ("חתונה של
-- אחותי") – הגיע לדפדפן שלו. מי שפותח כלי פיתוח רואה הכל.
--
-- הפתרון: העובד אינו קורא את הטבלאות ישירות. הוא קורא דרך שתי
-- פונקציות שמחזירות את הפרוסה שלו בלבד, והכללים נסגרים בפניו.

-- השבוע כפי שעובד אחד רואה אותו: המשמרות שלו, הבקשות שלו,
-- והחגים והשעות שממילא משותפים. הערת המנהל על השבוע והשיבוץ
-- הידני של אחרים אינם שלו.
-- שבוע שנוצר ריק אינו מכיל עדיין את המפתח constraints, ו-jsonb_set
-- עם נתיב בן שני חלקים אינו יוצר את ההורה החסר — הוא פשוט מחזיר
-- את המקור בלי שינוי. עד שהשעון ובקשות החופשה התחילו ליצור שורות
-- שבוע בעצמן זה לא קרה בפועל, כי השורה תמיד נוצרה מהדפדפן עם
-- constraints ריק. מכאן ואילך מוודאים את ההורה לפני כל כתיבה.
create or replace function public.week_with_constraints(p_week jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select case when coalesce(p_week, '{}'::jsonb) ? 'constraints'
              then coalesce(p_week, '{}'::jsonb)
              else coalesce(p_week, '{}'::jsonb) || jsonb_build_object('constraints', '{}'::jsonb)
         end
$$;

-- האם המנהל פתח את הסידור לכל הצוות. היעדר ההגדרה נקרא כסגור:
-- עסק שנפתח לפני שההגדרה קיימת אינו אמור להיפתח בשקט בעדכון.
create or replace function public.team_shifts_on()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select config->'settings'->'teamVisibility'->>'shifts' = 'true'
      from public.company_configs
     where company_id = public.current_company_id()), false)
$$;

-- החתימה הישנה (שלושה פרמטרים) נמחקת ולא נשארת לצדה: create or
-- replace עם פרמטר נוסף יוצר עומס ולא מחליף, ואז week_as_seen
-- הייתה יכולה להמשיך לקרוא לגרסה שאינה יודעת על תצוגת הצוות.
drop function if exists public.week_for_employee(jsonb, text, boolean);

create or replace function public.week_for_employee(
  p_week jsonb, p_employee text, p_published boolean, p_team_shifts boolean default false)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'published',   to_jsonb(coalesce(p_published, false)),
    'publishedAt', coalesce(p_week->'publishedAt', 'null'::jsonb),
    'publishedSignature', coalesce(p_week->'publishedSignature', '""'::jsonb),
    'holidays',    coalesce(p_week->'holidays', '{}'::jsonb),
    'shabbatEnd',  coalesce(p_week->'shabbatEnd', '""'::jsonb),
    'generatedAt', coalesce(p_week->'generatedAt', 'null'::jsonb),
    'note',        '""'::jsonb,
    'manual',      '{}'::jsonb,
    -- סידור שטרם פורסם אינו קיים בשביל העובד, גם לא החלק שלו:
    -- טיוטה שמישהו רואה היא טיוטה שמתווכחים עליה.
    -- וכשהמנהל פתח את הסידור לכל הצוות, עוברים השיבוצים המלאים.
    -- רק הם: הבקשות, הסיבות וההערות נחתכות כרגיל גם אז.
    'assignments', case
      when not coalesce(p_published, false) then '{}'::jsonb
      when coalesce(p_team_shifts, false) then coalesce(p_week->'assignments', '{}'::jsonb)
      else coalesce((
        select jsonb_object_agg(item.key, jsonb_build_array(p_employee))
          from jsonb_each(coalesce(p_week->'assignments', '{}'::jsonb)) as item(key, value)
         where p_employee is not null
           and item.value @> jsonb_build_array(p_employee)
      ), '{}'::jsonb) end,
    -- דיווחי השעון שלו בלבד. מתי עמית נכנס ומתי יצא אינו חלק
    -- מ"מי עובד איתי" גם כשהמנהל פתח את הסידור: שעת הגעה היא
    -- נתון שנכנס לתלוש, ולא לוח המשמרות.
    'punches', coalesce((
      select jsonb_agg(item order by item->>'at')
        from jsonb_array_elements(coalesce(p_week->'punches', '[]'::jsonb)) as item
       where p_employee is not null and item->>'empId' = p_employee
    ), '[]'::jsonb),
    -- הבקשות שלו מוצגות לו תמיד, גם לפני פרסום – הוא זה שהגיש
    -- אותן, והוא צריך לראות מה מצבן.
    'constraints', coalesce((
      select jsonb_object_agg(item.key, item.value)
        from jsonb_each(coalesce(p_week->'constraints', '{}'::jsonb)) as item(key, value)
       where p_employee is not null and item.key like p_employee || '|%'
    ), '{}'::jsonb)
  );
$$;

-- שורת שבוע כפי שמי שקורא אותה רשאי לראות. מנהל מקבל הכל.
create or replace function public.week_as_seen(p_row public.company_weeks)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_manager() then coalesce(p_row.week, '{}'::jsonb)
              else public.week_for_employee(coalesce(p_row.week, '{}'::jsonb),
                     public.current_employee_id(), p_row.published,
                     public.team_shifts_on()) end
$$;

-- מה שהעובד מבקש מהשרת במקום select על הטבלה
create or replace function public.week_for_me(p_week_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_company uuid;
  v_row     public.company_weeks;
begin
  v_company := public.current_company_id();
  if v_company is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select * into v_row from public.company_weeks
   where company_id = v_company and week_key = p_week_key;
  if not found then return null; end if;
  return jsonb_build_object(
    'week', public.week_as_seen(v_row),
    'published', v_row.published,
    'updated_at', v_row.updated_at);
end;
$$;

-- ההגדרות כפי שעובד רואה אותן: המשמרות, הסניפים והכללים של
-- העסק – והכרטיס שלו בלבד. הכרטיסים של עמיתיו נושאים מייל,
-- טלפון והערות, וכל אלה אינם שלו.
create or replace function public.config_for_me()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_company uuid;
  v_config  jsonb;
  v_emp     text;
begin
  v_company := public.current_company_id();
  if v_company is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select config into v_config from public.company_configs where company_id = v_company;
  if v_config is null then return null; end if;
  if public.is_manager() then return v_config; end if;

  v_emp := public.current_employee_id();
  -- כשהמנהל פתח את הסידור לכל הצוות, מה שנדרש כדי להציג "מי
  -- איתי במשמרת" הוא מזהה ושם. לכן עמיתיו עוברים מצומצמים
  -- לשלושה שדות, והכרטיס – מייל, טלפון, הערות ומכסות – לא.
  return jsonb_build_object(
    'settings', coalesce(v_config->'settings', '{}'::jsonb),
    'branches', coalesce(v_config->'branches', '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(case when item->>'id' = v_emp then item
                            else jsonb_build_object(
                              'id', item->'id',
                              'name', coalesce(item->'name', '""'::jsonb),
                              'active', coalesce(item->'active', 'true'::jsonb)) end)
        from jsonb_array_elements(coalesce(v_config->'employees', '[]'::jsonb)) as item
       where v_emp is not null
         and (item->>'id' = v_emp or public.team_shifts_on())
    ), '[]'::jsonb));
end;
$$;

-- הכללים נסגרים: קריאה ישירה של הסידור וההגדרות היא של מנהלים.
-- עובד מגיע לשתי הפונקציות שלמעלה, ולשום דבר אחר.
drop policy if exists company_weeks_select on public.company_weeks;
create policy company_weeks_select on public.company_weeks
  for select using (company_id = public.current_company_id() and public.is_manager());

drop policy if exists company_configs_select on public.company_configs;
create policy company_configs_select on public.company_configs
  for select using (company_id = public.current_company_id() and public.is_manager());

-- ורשימת המשתמשים: עובד רואה את השורה שלו. המיילים של עמיתיו
-- אינם שלו, וגם לא מי הוזמן ומי טרם נכנס.
drop policy if exists company_users_select on public.company_users;
create policy company_users_select on public.company_users
  for select using (
    company_id = public.current_company_id()
    and (public.is_manager() or id = auth.uid()));

grant execute on function public.team_shifts_on()                 to authenticated;
grant execute on function public.week_with_constraints(jsonb)     to authenticated;
grant execute on function public.week_for_employee(jsonb, text, boolean, boolean) to authenticated;
grant execute on function public.week_as_seen(public.company_weeks)      to authenticated;
grant execute on function public.week_for_me(text)               to authenticated;
grant execute on function public.config_for_me()                 to authenticated;

-- ACCESS LINKS: קישור אישי קבוע לעובד
--
-- למה זה קיים: יש עובדים שהדפדפן שלהם חוסם אחסון לגמרי (גלישה
-- פרטית, "חסימת כל העוגיות" בספארי). אצלם אסימון ההתחברות אינו
-- שורד סגירת לשונית, ולכן כל פתיחה דורשת הקלדת סיסמה מחדש. עובד
-- שמגיש אילוץ פעם בשבוע לא יעשה את זה, והוא פשוט לא יגיש.
--
-- הקישור הוא ההזדהות: המנהל מייצר אותו פעם אחת, העובד שומר אותו
-- במסך הבית, וכל פתיחה מנפיקה לו התחברות טרייה בשרת. אין סיסמה
-- לזכור ואין תלות באחסון הדפדפן.
--
-- מה שומר על זה:
--  · הטבלה סגורה לחלוטין בפני הדפדפן. רק השרת, עם מפתח הניהול,
--    כותב וקורא ממנה – ולכן גם מנהל אינו יכול לשלוף קישור של
--    עובד דרך ה-API.
--  · נשמר גיבוב (sha256) ולא האסימון עצמו. דליפה של הטבלה אינה
--    דליפה של קישורים.
--  · קישור לעובד בלבד. השרת מסרב להנפיק אחד לבעלים או למנהל,
--    כי שם המחיר של קישור שדלף גבוה בהרבה.
--  · שורה אחת לעובד: הנפקה מחדש דורסת את הקודמת, ולכן "ייצור
--    קישור חדש" הוא גם ביטול הישן.
create table if not exists public.access_links (
  user_id      uuid primary key references public.company_users(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists access_links_company_idx
  on public.access_links (company_id);

alter table public.access_links enable row level security;

-- אין כאן policy בכוונה: RLS בלי policy חוסם הכל. השרת עובד עם
-- service_role, שעוקף RLS, ולכן הוא היחיד שמגיע לטבלה.
revoke all on public.access_links from authenticated, anon;

-- ===== אסימוני התראות דחיפה =====
--
-- מה נשמר כאן: אסימון המכשיר שאפל או גוגל נתנו לאפליקציה.
-- הוא מזהה התקנה, לא אדם — אותו עובד בשני טלפונים הוא שתי
-- שורות, וזה נכון: הודעה צריכה להגיע לשניהם.
--
-- ולמה השורה נמחקת ולא מסומנת: אסימון שפג הוא אסימון שנשלחות
-- אליו הודעות שאיש לא מקבל, והוא גם מה שגורם לספק לסמן את
-- השולח. אסימון מת אינו היסטוריה — הוא זבל.

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);

create index if not exists push_tokens_user on public.push_tokens (user_id);
create index if not exists push_tokens_company on public.push_tokens (company_id);

alter table public.push_tokens enable row level security;

-- אין policy במכוון. אסימון של עובד אחד אינו עניינו של אחר,
-- וגם לא של המנהל: מי שקורא אסימון יכול לשלוח בשמנו הודעה
-- למכשיר. השרת בלבד, עם service_role.
revoke all on public.push_tokens from authenticated, anon;

-- הדרך היחידה של האפליקציה לכתוב אסימון. security definer, כי
-- הטבלה סגורה — והפונקציה כותבת רק את מי שקרא לה.
create or replace function public.save_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'token is required';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'platform must be ios or android';
  end if;

  /* דרך אותו עוזר שכל שאר הקובץ משתמש בו, ולא בשאילתה משלי:
     הוא כבר יודע שהמזהה הוא id ולא user_id, ושמשתמש מושבת
     אינו שייך לעסק. */
  v_company := public.current_company_id();

  if v_company is null then
    raise exception 'no company for this user';
  end if;

  -- אותו אסימון יכול לעבור בין משתמשים: מכשיר שהוחלף בין
  -- עובדים. הבעלות עוברת, ולא נוצרת שורה שנייה שתשלח לאדם
  -- הלא נכון.
  insert into public.push_tokens (token, user_id, company_id, platform)
  values (trim(p_token), auth.uid(), v_company, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        company_id = excluded.company_id,
        platform = excluded.platform,
        seen_at = now();
end;
$$;

revoke all on function public.save_push_token(text, text) from public;
grant execute on function public.save_push_token(text, text) to authenticated;

-- יציאה מהחשבון מסירה את האסימון של המכשיר הזה, ולא את כולם.
create or replace function public.forget_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_tokens
  where token = trim(p_token) and user_id = auth.uid();
end;
$$;

revoke all on function public.forget_push_token(text) from public;
grant execute on function public.forget_push_token(text) to authenticated;


-- ===== קופונים =====
--
-- שלושה סוגים: days מאריך את התקופה, percent מוזיל את החיוב הבא
-- באחוזים, ו-amount מוזיל אותו בשקלים. "חודש נוסף ללא עלות" הוא
-- days=30, "חודש ראשון חינם" הוא percent=100, ו"50 ש"ח הנחה" הוא
-- amount=50.
--
-- הקוד הוא המפתח הראשי ולא מזהה נפרד: הוא מה שהלקוח מקליד, הוא
-- מה שמופיע בהודעה שנשלחה אליו, והוא חייב להיות ייחודי ממילא.
-- הנורמליזציה (אותיות גדולות, בלי מקפים) נעשית בשני הצדדים --
-- בדפדפן לפני השליחה, וכאן לפני ההשוואה.
create table if not exists public.coupons (
  code        text primary key,
  kind        text not null check (kind in ('days', 'percent', 'amount')),
  value       integer not null check (value > 0),
  note        text,
  valid_until timestamptz,
  max_uses    integer check (max_uses is null or max_uses > 0),
  uses        integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint coupons_percent_range
    check (kind <> 'percent' or value <= 100),
  constraint coupons_code_shape
    check (code = upper(code) and code ~ '^[A-Z0-9]{2,24}$')
);

-- מי מימש מה. שורה אחת לכל חברה, לכל החיים: בלי המגבלה הזו
-- לקוח שקיבל שלוש הודעות שיווקיות מממש שלושה קופונים ומגיע
-- לחיוב אפס.
create table if not exists public.coupon_redemptions (
  company_id uuid primary key references public.companies(id) on delete cascade,
  code       text not null references public.coupons(code),
  kind       text not null,
  value      integer not null,
  created_at timestamptz not null default now()
);

create index if not exists coupon_redemptions_code_idx
  on public.coupon_redemptions (code);

alter table public.coupons             enable row level security;
alter table public.coupon_redemptions  enable row level security;

-- אין מדיניות קריאה בכוונה: לקוח שיכול לקרוא את הטבלה יכול
-- לשלוף את כל הקודים הפעילים ולבחור את הגדול ביותר. המימוש
-- עובר דרך הפונקציה שלמטה, שמקבלת קוד ומחזירה תשובה -- ולא
-- מאפשרת לעבור על הרשימה.

-- הרחבות על שורת החברה: איזה קופון מומש, ומה ההנחה שנותרה.
--
-- discount_charges_left הוא מונה ולא תאריך: "החיוב הבא" הוא
-- מה שהובטח ללקוח, וחיוב אחד הוא חיוב אחד גם אם הוא נדחה
-- בשבועיים בגלל כרטיס שפג.
alter table public.companies
  add column if not exists coupon_code           text,
  add column if not exists discount_percent      integer
    check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100)),
  -- הנחה בשקלים. גדולה מהמחיר פירושה חיוב שלא נגבה, וזה תקין.
  add column if not exists discount_amount       integer
    check (discount_amount is null or discount_amount >= 0),
  add column if not exists discount_charges_left integer not null default 0
    check (discount_charges_left >= 0);

-- מימוש קופון.
--
-- security definer: הלקוח אינו רשאי לכתוב על שורת החברה שלו את
-- המחיר, את התוקף או את ההנחה -- אחרת כל אחד היה מאריך לעצמו
-- את הניסיון מקונסולת הדפדפן. הפונקציה היא השער היחיד.
--
-- מחזירה טקסט קצר ולא הודעה: 'ok' או סיבת הדחייה. המשפט נבחר
-- במסך, בשפה של הלקוח.
create or replace function public.redeem_coupon(p_code text)
returns table (result text, kind text, value integer, valid_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies;
  v_role    text;
  v_code    text;
  v_coupon  public.coupons;
  v_base    timestamptz;
  v_until   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- שתי שאילתות ולא אחת: אי אפשר לשלוף into לרשומה ולמשתנה
  -- סקלרי באותה פקודה, ו-Postgres דוחה את זה בזמן היצירה.
  select cu.role into v_role
  from public.company_users cu
  where cu.id = auth.uid() and cu.active;

  if v_role is null then
    raise exception 'no company' using errcode = '42501';
  end if;

  select c.* into v_company
  from public.companies c
  join public.company_users cu on cu.company_id = c.id
  where cu.id = auth.uid();

  if v_company.id is null then
    raise exception 'no company' using errcode = '42501';
  end if;

  -- רק הבעלים. קופון משנה כסף, ומנהל אינו נוגע בכסף.
  if v_role <> 'owner' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_code := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  if length(v_code) < 2 then
    return query select 'notFound'::text, null::text, null::integer, null::timestamptz;
    return;
  end if;

  -- קופון אחד ללקוח
  if exists (select 1 from public.coupon_redemptions where company_id = v_company.id) then
    return query select 'already'::text, null::text, null::integer, null::timestamptz;
    return;
  end if;

  -- for update: שני לקוחות שמממשים קופון עם מכסה אחרונה באותה
  -- שנייה. בלי הנעילה שניהם קוראים uses=4, שניהם כותבים 5,
  -- ושניהם מקבלים את ההטבה.
  select * into v_coupon from public.coupons
  where code = v_code and active for update;

  if v_coupon.code is null then
    return query select 'notFound'::text, null::text, null::integer, null::timestamptz;
    return;
  end if;
  if v_coupon.valid_until is not null and v_coupon.valid_until < now() then
    return query select 'expired'::text, null::text, null::integer, null::timestamptz;
    return;
  end if;
  if v_coupon.max_uses is not null and v_coupon.uses >= v_coupon.max_uses then
    return query select 'exhausted'::text, null::text, null::integer, null::timestamptz;
    return;
  end if;

  if v_coupon.kind = 'days' then
    -- מהתוקף הקיים ולא מהיום: מי שנותרו לו עשרה ימים ומימש
    -- "חודש נוסף" אמור לקבל ארבעים. תוקף שכבר עבר אינו מקצר.
    v_base := greatest(coalesce(v_company.valid_until, now()), now());
    v_until := v_base + make_interval(days => v_coupon.value);
    update public.companies
      set valid_until = v_until, coupon_code = v_coupon.code
      where id = v_company.id;
  elsif v_coupon.kind = 'amount' then
    v_until := v_company.valid_until;
    -- שני שדות ההנחה נכתבים יחד, ואחד מהם מתאפס: קופון אחד
    -- ללקוח, ושתי הנחות על אותה שורה הן שורה שאיש לא יידע
    -- לקרוא בעוד חצי שנה.
    update public.companies
      set discount_amount = v_coupon.value,
          discount_percent = null,
          discount_charges_left = 1,
          coupon_code = v_coupon.code
      where id = v_company.id;
  else
    v_until := v_company.valid_until;
    update public.companies
      set discount_percent = v_coupon.value,
          discount_amount = null,
          discount_charges_left = 1,
          coupon_code = v_coupon.code
      where id = v_company.id;
  end if;

  insert into public.coupon_redemptions (company_id, code, kind, value)
  values (v_company.id, v_coupon.code, v_coupon.kind, v_coupon.value);

  update public.coupons set uses = uses + 1 where code = v_coupon.code;

  return query select 'ok'::text, v_coupon.kind, v_coupon.value, v_until;
end;
$$;

revoke all on function public.redeem_coupon(text) from public;
grant execute on function public.redeem_coupon(text) to authenticated;


-- ===== וואטסאפ: הסכמה, הסרה ויומן שליחה =====
--
-- הודעה פרסומית לטלפון היא "דבר פרסומת" לפי סעיף 30א לחוק
-- התקשורת, והפיצוי הוא עד 1,000 ש"ח להודעה בלי הוכחת נזק.
-- השאלה בבית משפט אינה "האם הוא הסכים" אלא "תראה לי מתי, ואיזה
-- נוסח עמד מול העיניים שלו" -- ולכן נשמר גם התאריך וגם הנוסח
-- עצמו, ולא רק דגל.
--
-- wa_opt_out_at גובר על הכול. הסרה היא בקשה שמכבדים מיד, וגם
-- אם ההסכמה עדיין רשומה.
alter table public.companies
  add column if not exists wa_opt_in      boolean not null default false,
  add column if not exists wa_opt_in_at   timestamptz,
  add column if not exists wa_opt_in_text text,
  add column if not exists wa_opt_out_at  timestamptz;

-- יומן השליחה. שתי מטרות, ושתיהן הכרחיות:
--
-- 1. הוכחה מה נשלח, למי ומתי.
-- 2. מניעת שליחה כפולה. נטישה אחת מקבלת תזכורת אחת, ולא אחת
--    בכל ריצה של הקרון -- האילוץ הייחודי למטה הוא מה שאוכף
--    את זה, ולא בדיקה בקוד שיכולה לרוץ פעמיים במקביל.
create table if not exists public.wa_messages (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  template   text not null,
  to_phone   text not null,
  status     text not null default 'sent',
  wa_id      text,
  error      text,
  created_at timestamptz not null default now()
);

-- תבנית אחת לחברה, פעם אחת. חברה שנטשה, קיבלה תזכורת, וחזרה
-- לנטוש שוב אינה מקבלת אותה הודעה שוב.
create unique index if not exists wa_messages_once_idx
  on public.wa_messages (company_id, template);

create index if not exists wa_messages_created_idx
  on public.wa_messages (created_at desc);

alter table public.wa_messages enable row level security;

-- אין מדיניות: היומן נקרא ונכתב מהשרת בלבד, עם מפתח השירות.
-- בשורות האלה יושבים מספרי טלפון של לקוחות.
revoke all on public.wa_messages from authenticated, anon;

-- ההסכמה נרשמת בהרשמה, והיא אינה ניתנת לעריכה מהדפדפן: הרשימה
-- הסגורה של grant update על companies היא מה שמונע מלקוח לכתוב
-- לעצמו "הסכמתי" או למחוק "ביקשתי להסיר".
