-- בדיקת פרטיות: האם עובד יכול לראות רק את המשמרות של עצמו?
-- לקרוא את העמודה "תקין": צריך להיות ✅ בכל השורות.
select 'פונקציה week_for_me (מה שעובד מקבל)' as "בדיקה",
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'week_for_me')
            then '✅ קיימת' else '❌ חסרה – העובדים מקבלים את כל השבוע' end as "תקין"
union all
select 'פונקציה config_for_me (רשימת העובדים)',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'config_for_me')
            then '✅ קיימת' else '❌ חסרה – העובדים מקבלים את כל הכרטיסים' end
union all
select 'חסימת קריאה ישירה לשבועות',
       case when exists (select 1 from pg_policies
                          where schemaname = 'public' and tablename = 'company_weeks'
                            and policyname = 'company_weeks_select'
                            and qual like '%is_manager%')
            then '✅ מוגבל למנהל' else '❌ פתוח – עובד קורא את כל השבוע ישירות' end
union all
select 'חסימת קריאה ישירה להגדרות',
       case when exists (select 1 from pg_policies
                          where schemaname = 'public' and tablename = 'company_configs'
                            and policyname = 'company_configs_select'
                            and qual like '%is_manager%')
            then '✅ מוגבל למנהל' else '❌ פתוח – עובד קורא את כל ההגדרות' end
union all
select 'מיילים וטלפונים של עמיתים',
       case when exists (select 1 from pg_policies
                          where schemaname = 'public' and tablename = 'company_users'
                            and policyname = 'company_users_select'
                            and qual like '%auth.uid()%')
            then '✅ כל אחד רואה את שורתו' else '❌ פתוח – עובד רואה את כל המיילים' end;
