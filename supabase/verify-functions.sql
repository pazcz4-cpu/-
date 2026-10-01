-- בדיקת פונקציות: השאילתה מחזירה שורות רק אם יש בעיה.
-- "Success. No rows returned" = הכול תקין.
with expected(name) as (
  values ('week_with_constraints'), ('week_for_me'), ('week_for_employee'),
         ('week_as_seen'), ('track_employee_count'), ('team_shifts_on'),
         ('set_wa_employee_addon'), ('save_push_token'), ('save_own_punch'),
         ('save_own_note'), ('save_own_name'), ('save_own_constraint'),
         ('request_leave'), ('redeem_coupon'), ('punch_window_open'),
         ('mark_self_joined'), ('is_manager'), ('guard_user_role'),
         ('forget_push_token'), ('decide_constraint'), ('current_role_name'),
         ('current_employee_id'), ('current_company_id'), ('create_company'),
         ('constraints_deadline'), ('config_for_me')
), found as (
  select p.proname as name, count(*) as copies
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
  group by p.proname
)
select e.name as "פונקציה",
       case when f.name is null then '❌ חסרה'
            else '❌ ' || f.copies || ' גרסאות (צריכה להיות אחת)' end as "בעיה"
from expected e left join found f on f.name = e.name
where f.name is null or f.copies > 1
union all
select 'push_tokens', '❌ הטבלה חסרה'
where to_regclass('public.push_tokens') is null;
