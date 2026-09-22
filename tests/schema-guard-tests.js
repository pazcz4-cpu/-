/* שומרים על הסכימה עצמה.

   הבדיקות כאן אינן מריצות Postgres – הן קוראות את schema.sql
   ודורשות שההגנות יהיו כתובות בו. זה נשמע עקיף, והוא לא: החור
   שנמצא לפני העלייה לאוויר היה בדיוק כזה – הספק המדומה חסם
   הסלמת הרשאות, המסך חסם, השרת חסם, ולכן כל הבדיקות עברו –
   והסכימה האמיתית, המקום היחיד שאי אפשר לעקוף, לא חסמה.

   מי שיסיר את ההגנה מ-schema.sql ייתקל כאן, ולא אצל לקוח.

   הרצה: node tests/schema-guard-tests.js */
'use strict';

var fs = require('fs');
var path = require('path');

var sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.log('  ✗ ' + name + '\n      ' + (err && err.message)); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function has(needle, message) { assert(sql.indexOf(needle) !== -1, message); }

console.log('\n== בידוד בין חברות ==');

var TABLES = ['companies', 'company_users', 'company_configs',
  'company_weeks', 'billing_events', 'support_tickets'];

test('לכל טבלה יש RLS', function () {
  TABLES.forEach(function (table) {
    has('alter table public.' + table + ' ', table + ' – אין הפעלת RLS');
    assert(new RegExp('alter table public\\.' + table +
      '\\s+enable row level security').test(sql), table + ' – RLS אינו מופעל');
  });
});

test('יומן החיוב סגור לחלוטין בפני הדפדפן', function () {
  /* בטבלה הזו יושבים מזהי עסקאות וסכומים של כל הלקוחות */
  has('revoke all on public.billing_events from authenticated, anon;',
    'billing_events אינה סגורה בפני authenticated ו-anon');
});

console.log('\n== מה לקוח אינו יכול לשנות ==');

test('מצב המנוי והתוקף אינם ניתנים לכתיבה מהדפדפן', function () {
  /* בלי זה כל לקוח מעניק לעצמו מנוי חינם בפקודה אחת */
  has('revoke all on public.companies from authenticated;',
    'companies פתוחה לכתיבה');
  has('grant update (name) on public.companies to authenticated;',
    'הרשאת הכתיבה על companies אינה מוגבלת לשם בלבד');
  assert(!/grant update \([^)]*\b(status|plan|valid_until|billing_)/.test(sql),
    'עמודה של מנוי או חיוב ניתנת לכתיבה מהדפדפן');
});

test('בעלות אינה ניתנת להענקה בעדכון', function () {
  /* מנהל הוא אחראי משמרת. RLS נותן לו לעדכן שורות בחברה שלו,
     ו-GRANT כולל את עמודת role – ולכן בלי שומר הוא יכול לשלוח
     PATCH ולהפוך לבעלים, ומשם לבטל את המנוי או להחליף כרטיס. */
  has('create trigger company_users_role_guard', 'אין שומר על עמודת התפקיד');
  has("new.role = 'owner'", 'השומר אינו חוסם הענקת בעלות');
  has('ownership cannot be granted by update',
    'אין סירוב מפורש להענקת בעלות');
});

test('שורת הבעלים מוגנת גם מהשבתה', function () {
  /* אחרת מנהל פשוט מכבה את הבעלים במקום לקדם את עצמו */
  has("old.role = 'owner'", 'השומר אינו מגן על שורת הבעלים');
  has('new.active is distinct from old.active',
    'השבתת הבעלים אינה חסומה');
});

test('השומר אינו חוסם את השרת', function () {
  /* service_role אינו נושא auth.uid(). אם ייחסם, ביטול הזמנה
     ויצירת משתמש יישברו – ואת זה מגלים רק בייצור. */
  has('if auth.uid() is null then', 'השומר חוסם גם את השרת');
});

console.log('\n== מה עובד אינו יכול לעקוף ==');

test('אילוצים נכתבים רק דרך פונקציה בשרת', function () {
  /* הפונקציה היא security definer ומוגבלת למי שקרא לה, ולכן
     עובד אינו יכול לכתוב אילוץ בשם עובד אחר */
  has('public.save_own_constraint', 'אין פונקציה לשמירת אילוץ');
  has('security definer', 'הפונקציות אינן security definer');
});

test('מספר היום נבדק בכל פונקציה שמקבלת יום', function () {
  /* שבוע הוא שבעה ימים. בלי בדיקה, עובד שפותח את כלי הפיתוח
     שולח יום 999, מייצר מפתח שאיש אינו קורא, ושורף בו בקשה
     מהמכסה – זבל שקט שמתגלה רק כשהמכסה אוזלת בלי סיבה. */
  ['save_own_constraint', 'save_own_note', 'decide_constraint'].forEach(function (fn) {
    var at = sql.indexOf('create or replace function public.' + fn);
    assert(at !== -1, 'לא נמצאה הפונקציה ' + fn);
    var block = sql.slice(at, sql.indexOf('$$;', at));
    assert(block.indexOf('p_day_idx > 6') !== -1,
      fn + ' – מספר היום אינו נבדק');
  });
});

test('כתיבה ישירה לשבועות מוגבלת למנהל', function () {
  assert(/create policy company_weeks_write[\s\S]{0,200}is_manager\(\)/.test(sql),
    'עובד יכול לכתוב ישירות לשבוע');
});

console.log('\n' + (failed ? '❌ ' : '✅ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
process.exit(failed ? 1 : 0);
