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
create or replace function public.create_company(p_name text, p_user_name text, p_trial_days int default 14)
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

  insert into public.companies (name, plan, status, valid_until)
  values (trim(p_name), 'starter', 'trial', now() + make_interval(days => p_trial_days))
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
      coalesce(v_week.week, '{}'::jsonb), array['constraints', v_key], v_record, true);
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
grant execute on function public.create_company(text, text, int)                 to authenticated;
grant execute on function public.save_own_constraint(text, int, jsonb)           to authenticated;
grant execute on function public.save_own_note(text, int, text)                  to authenticated;
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
grant update (name, tax_id) on public.companies to authenticated;

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
create or replace function public.week_for_employee(p_week jsonb, p_employee text, p_published boolean)
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
    'assignments', case when coalesce(p_published, false) then coalesce((
        select jsonb_object_agg(item.key, jsonb_build_array(p_employee))
          from jsonb_each(coalesce(p_week->'assignments', '{}'::jsonb)) as item(key, value)
         where p_employee is not null
           and item.value @> jsonb_build_array(p_employee)
      ), '{}'::jsonb) else '{}'::jsonb end,
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
                     public.current_employee_id(), p_row.published) end
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
  return jsonb_build_object(
    'settings', coalesce(v_config->'settings', '{}'::jsonb),
    'branches', coalesce(v_config->'branches', '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(item)
        from jsonb_array_elements(coalesce(v_config->'employees', '[]'::jsonb)) as item
       where v_emp is not null and item->>'id' = v_emp
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

grant execute on function public.week_for_employee(jsonb, text, boolean) to authenticated;
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
