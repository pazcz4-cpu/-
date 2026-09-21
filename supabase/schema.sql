-- ============================================================
--  סידור משמרות – סכימת בסיס הנתונים ל-Supabase
--
--  להרצה פעם אחת: Supabase → SQL Editor → הדבקה → Run.
--  אפשר להריץ שוב; כל היצירות מוגנות ב-if not exists / or replace.
--
--  העיקרון: הבידוד בין חברות נאכף בבסיס הנתונים עצמו (RLS), ולא
--  בקוד שרץ בדפדפן. גם אם מישהו יקרא לשרת ישירות, הוא לא יוכל
--  לראות או לשנות נתונים של חברה אחרת.
-- ============================================================

-- ===== טבלאות =====

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

-- פרטי המנוי אצל ספק התשלומים. נכתבים אך ורק בידי השרת, בתגובה
-- ל-webhook מהספק – לעולם לא בידי הדפדפן.
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

-- ===== פונקציות עזר לזהות המשתמש =====
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

-- ===== הפעלת בידוד =====

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

-- ===== פתיחת חשבון לחברה =====
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

-- ===== אילוץ של עובד =====
-- עובד אינו רשאי לכתוב לשורת השבוע ישירות, ולכן העריכה עוברת כאן:
-- הפונקציה כותבת רק את המפתח שלו, ותמיד מסמנת את הבקשה כממתינה.
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

  insert into public.company_weeks (company_id, week_key, week)
  values (v_company, p_week_key,
          '{"constraints":{},"assignments":{},"manual":{},"holidays":{},"shabbatEnd":"","note":""}'::jsonb)
  on conflict (company_id, week_key) do nothing;

  select * into v_week from public.company_weeks
  where company_id = v_company and week_key = p_week_key for update;

  if v_week.published and v_role = 'employee' then
    raise exception 'week already published' using errcode = '55000';
  end if;

  v_key := v_employee || '|' || p_day_idx::text;

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

-- ===== הרשאות קריאה לפונקציות =====
grant execute on function public.create_company(text, text, int)                 to authenticated;
grant execute on function public.save_own_constraint(text, int, jsonb)           to authenticated;
grant execute on function public.save_own_note(text, int, text)                  to authenticated;
grant execute on function public.decide_constraint(text, text, int, text, text)  to authenticated;
grant execute on function public.current_company_id()                            to authenticated;
grant execute on function public.current_role_name()                             to authenticated;
grant execute on function public.current_employee_id()                           to authenticated;
grant execute on function public.is_manager()                                    to authenticated;

-- חברות: קריאה בלבד, ושינוי השם בלבד. פתיחת חברה נעשית דרך
-- create_company, ומחיקה אינה מתאפשרת מהדפדפן.
revoke all on public.companies from authenticated;
grant select on public.companies to authenticated;
grant update (name) on public.companies to authenticated;

-- משתמשים: קריאה ועדכון. יצירה נעשית בשרת (api/create-user.js),
-- כי היא דורשת מפתח ניהול.
revoke all on public.company_users from authenticated;
grant select on public.company_users to authenticated;
grant update (name, role, employee_id, active) on public.company_users to authenticated;

grant select, insert, update, delete on public.company_configs to authenticated;
grant select, insert, update, delete on public.company_weeks   to authenticated;

-- אף אחד מלבד השרת אינו רואה את יומן החיובים
revoke all on public.billing_events from authenticated, anon;

-- ===== עדכונים חיים (אופציונלי) =====
-- מפעיל שידור שינויים בזמן אמת. הבידוד נשמר: Supabase מכבד את
-- כללי ה-RLS גם בשידור.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.company_weeks;
    alter publication supabase_realtime add table public.company_configs;
  end if;
exception
  when duplicate_object then null;   -- כבר נוסף בהרצה קודמת
end;
$$;
