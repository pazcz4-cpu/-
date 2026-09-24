/* מריצים את schema.sql על Postgres אמיתי.

   schema-guard-tests קורא את הקובץ ודורש שההגנות יהיו כתובות בו.
   זה תופס הגנה שהוסרה, אבל לא תופס סוגריים חסרים, שם עמודה שגוי,
   או פונקציה שנוצרה בחתימה חדשה לצד הישנה. את אלה תופס רק מסד
   נתונים שמריץ את הקובץ — ועד היום איש לא הריץ אותו כאן, אלא רק
   הלקוח, בהדבקה ל-Supabase, בפעם הראשונה.

   מה נבדק:
     1. הקובץ עובר במלואו, ללא שגיאה.
     2. והוא עובר גם בהרצה שנייה — כי זה בדיוק מה שקורה בכל
        פריסה: מדביקים את אותו קובץ שוב על מסד קיים.
     3. הפרוסה של העובד, בשאילתה אמיתית ולא בקירוב: מה מגיע
        אליו כשהמנהל סגר, ומה כשפתח.

   אין Postgres מותקן? הבדיקה מדלגת ואינה נכשלת. בדיקה שמחייבת
   התקנה שאין לכולם היא בדיקה שמפסיקים להריץ.

   הרצה: node tests/schema-live-tests.js */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var SCHEMA = path.join(__dirname, '..', 'supabase', 'schema.sql');
var ROOT = process.getuid && process.getuid() === 0;
var PG_USER = 'postgres';

function findBin(name) {
  try {
    var direct = cp.execFileSync('which', [name], { encoding: 'utf8' }).trim();
    if (direct) return direct;
  } catch (err) { /* ממשיכים לחיפוש בנתיבי ההתקנה */ }
  var roots = ['/usr/lib/postgresql', '/usr/local/pgsql/bin', '/opt/homebrew/bin'];
  for (var i = 0; i < roots.length; i++) {
    var base = roots[i];
    if (!fs.existsSync(base)) continue;
    if (fs.existsSync(path.join(base, name))) return path.join(base, name);
    var versions = fs.readdirSync(base).sort().reverse();
    for (var v = 0; v < versions.length; v++) {
      var guess = path.join(base, versions[v], 'bin', name);
      if (fs.existsSync(guess)) return guess;
    }
  }
  return null;
}

function skip(reason) {
  console.log('\n⏭  בדיקת הסכימה החיה דילגה: ' + reason);
  console.log('   (התקנת postgresql מקומית מפעילה אותה)\n');
  process.exit(0);
}

var initdb = findBin('initdb');
var pgCtl = findBin('pg_ctl');
var psql = findBin('psql');
if (!initdb || !pgCtl || !psql) skip('לא נמצאו initdb/pg_ctl/psql');

/* ריצה כ-root: Postgres מסרב לעלות, ולכן עוברים למשתמש postgres.
   בכל שאר המקרים רצים כמי שאנחנו. */
function run(bin, args, options) {
  var opts = options || {};
  if (!ROOT) return cp.execFileSync(bin, args, { encoding: 'utf8', stdio: opts.stdio || 'pipe' });
  var quoted = [bin].concat(args).map(function (part) {
    return "'" + String(part).replace(/'/g, "'\\''") + "'";
  }).join(' ');
  return cp.execFileSync('su', [PG_USER, '-c', quoted], { encoding: 'utf8', stdio: opts.stdio || 'pipe' });
}

var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setshifts-schema-'));
var data = path.join(dir, 'data');
var stopped = false;

function stop() {
  if (stopped) return;
  stopped = true;
  try { run(pgCtl, ['-D', data, '-m', 'immediate', 'stop'], { stdio: 'ignore' }); } catch (err) { /* כבר מת */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (err) { /* לא נורא */ }
}
process.on('exit', stop);

try {
  fs.mkdirSync(data);
  if (ROOT) {
    /* המשתמש postgres חייב להגיע לתיקייה, ו-initdb דורש שתיקיית
       הנתונים תהיה שלו ומוגנת. */
    cp.execFileSync('chown', ['-R', PG_USER + ':' + PG_USER, dir]);
    cp.execFileSync('chmod', ['711', dir]);
    cp.execFileSync('chmod', ['700', data]);
  }
  run(initdb, ['-D', data, '-U', PG_USER, '-A', 'trust'], { stdio: 'ignore' });
  run(pgCtl, ['-D', data, '-l', path.join(dir, 'log'), '-o', '-k ' + dir + ' -h ""', '-w', 'start'],
    { stdio: 'ignore' });
} catch (err) {
  skip('שרת מקומי לא עלה (' + (err && err.message ? err.message.split('\n')[0] : 'לא ידוע') + ')');
}

var passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.log('  ✗ ' + name + '\n      ' + (err && err.message)); }
}
function assert(condition, message) { if (!condition) throw new Error(message || 'assertion failed'); }
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'ערכים שונים') + ': התקבל ' + actual + ', ציפינו ל-' + expected);
  }
}

function sqlFile(body, name) {
  var file = path.join(dir, name);
  fs.writeFileSync(file, body);
  if (ROOT) cp.execFileSync('chmod', ['644', file]);
  return file;
}

function psqlFile(file) {
  return run(psql, ['-h', dir, '-U', PG_USER, '-q', '-v', 'ON_ERROR_STOP=1', '-f', file]);
}

/* מה ש-Supabase נותן ואין כאן: התפקידים, סכימת auth ו-auth.uid.
   אנחנו לא מדמים את Supabase – אנחנו נותנים לקובץ את מה שהוא
   מניח שקיים, וכל השאר הוא הקובץ עצמו. */
var STUB = [
  'create extension if not exists pgcrypto;',
  'create role anon nologin;',
  'create role authenticated nologin;',
  'create role service_role nologin;',
  'create schema if not exists auth;',
  'create table if not exists auth.users (id uuid primary key, email text);',
  "create or replace function auth.uid() returns uuid language sql stable as $$",
  "  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;",
  'grant usage on schema public to anon, authenticated, service_role;'
].join('\n');

console.log('\n== schema.sql על Postgres אמיתי ==');

check('הסביבה שהקובץ מניח שקיימת מוכנה', function () {
  psqlFile(sqlFile(STUB, 'stub.sql'));
});

var schemaFile = path.join(dir, 'schema.sql');
fs.copyFileSync(SCHEMA, schemaFile);
if (ROOT) cp.execFileSync('chmod', ['644', schemaFile]);

check('הקובץ עובר במלואו', function () { psqlFile(schemaFile); });

/* פריסה היא הדבקה חוזרת של אותו קובץ על מסד קיים. אם ההרצה
   השנייה נופלת, הלקוח מגלה את זה בעדכון ולא בהתקנה. */
check('ועובר גם בהרצה שנייה על אותו מסד', function () { psqlFile(schemaFile); });

var BOSS = '11111111-1111-1111-1111-111111111111';
var DANA = '22222222-2222-2222-2222-222222222222';
var CO = '33333333-3333-3333-3333-333333333333';

function seed(teamShifts) {
  return [
    'begin;',
    "insert into auth.users (id, email) values ('" + BOSS + "','boss@p.com'),('" + DANA + "','dana@p.com');",
    "insert into public.companies (id, name) values ('" + CO + "','עסק');",
    'insert into public.company_users (id, company_id, email, name, role, employee_id) values',
    "  ('" + BOSS + "','" + CO + "','boss@p.com','בוס','owner',null),",
    "  ('" + DANA + "','" + CO + "','dana@p.com','דנה','employee','emp-1');",
    'insert into public.company_configs (company_id, config) values',
    "  ('" + CO + "', $j${",
    '    "settings": {"teamVisibility": {"shifts": ' + (teamShifts ? 'true' : 'false') + '}},',
    '    "branches": [{"id":"br-1","name":"מרכז"}],',
    '    "employees": [',
    '      {"id":"emp-1","name":"דנה","email":"dana@p.com","phone":"050","note":"הערה על דנה","active":true},',
    '      {"id":"emp-2","name":"יוסי","email":"yossi@p.com","phone":"051","note":"הערה על יוסי","active":true}',
    '    ]}$j$::jsonb);',
    'insert into public.company_weeks (company_id, week_key, week, published) values',
    "  ('" + CO + "','2026-09-20', $j${",
    '    "assignments": {"br-1|0|morning":["emp-1","emp-2"], "br-1|1|morning":["emp-2"]},',
    '    "constraints": {"emp-1|3":{"note":"תור לרופא"},"emp-2|4":{"note":"חתונה של אחותי"}},',
    '    "note":"הערה של המנהל","manual":{"br-1|0|morning":true}}$j$::jsonb, true);',
    'set local role authenticated;',
    "select set_config('request.jwt.claim.sub','" + DANA + "', true);"
  ].join('\n');
}

/* שואלים את המסד שאלה אחת ומקבלים שורה אחת, כדי שההשוואה כאן
   תהיה על ערך ולא על פלט מעוצב. */
function ask(teamShifts, expression, extraSql) {
  /* התשובה נעטפת בסימון, ולא נלקחת כ"השורה האחרונה שאינה ריקה":
     גם לפקודות הזריעה יש פלט, ותשובה שהיא מחרוזת ריקה – למשל
     הערת מנהל שנחתכה – הייתה גורמת לקרוא אחת מהן כתשובה. */
  var body = '\\pset tuples_only on\n\\pset format unaligned\n' + seed(teamShifts) +
    '\n' + (extraSql || '') +
    "\nselect '<<' || coalesce((" + expression + "), '') || '>>';\nrollback;\n";
  var out = psqlFile(sqlFile(body, 'ask.sql'));
  var match = /<<([\s\S]*)>>/.exec(out);
  if (!match) throw new Error('לא התקבלה תשובה מהמסד: ' + out);
  return match[1];
}

console.log('\n== הפרוסה של העובד, בשאילתה אמיתית ==');

check('ברירת המחדל: רק המשמרות שלו', function () {
  assertEqual(ask(false, "public.week_for_me('2026-09-20')->'week'->>'assignments'"),
    '{"br-1|0|morning": ["emp-1"]}', 'השיבוצים שהגיעו לעובד');
});

check('וכרטיס אחד בלבד', function () {
  assertEqual(ask(false, "jsonb_array_length(public.config_for_me()->'employees')::text"),
    '1', 'מספר הכרטיסים');
});

check('המנהל פתח: כל השיבוצים של היום מגיעים', function () {
  var value = ask(true, "public.week_for_me('2026-09-20')->'week'->>'assignments'");
  assert(value.indexOf('emp-2') !== -1, 'השיבוץ של העמית לא הגיע: ' + value);
  assert(value.indexOf('br-1|1|morning') !== -1, 'משמרת שאין בה העובד לא הגיעה: ' + value);
});

check('ועמיתיו מגיעים כמזהה, שם ופעילות בלבד', function () {
  var keys = ask(true, "(select string_agg(k, ',' order by k) from jsonb_object_keys(" +
    "(select item from jsonb_array_elements(public.config_for_me()->'employees') as item " +
    " where item->>'id' = 'emp-2')) as k)");
  assertEqual(keys, 'active,id,name', 'מה שעבר על העמית');
});

check('המייל, הטלפון וההערה של העמית אינם עוברים גם אז', function () {
  var all = ask(true, "public.config_for_me()::text");
  assert(all.indexOf('yossi@p.com') === -1, 'המייל של העמית עבר');
  assert(all.indexOf('051') === -1, 'הטלפון של העמית עבר');
  assert(all.indexOf('הערה על יוסי') === -1, 'ההערה על העמית עברה');
  assert(all.indexOf('dana@p.com') !== -1, 'העובד איבד את הכרטיס של עצמו');
});

check('והבקשות של עמיתיו נשארות מחוץ לתמונה', function () {
  var value = ask(true, "public.week_for_me('2026-09-20')->'week'->>'constraints'");
  assert(value.indexOf('חתונה של אחותי') === -1, 'סיבה של עמית עברה: ' + value);
  assert(value.indexOf('תור לרופא') !== -1, 'הסיבה של העובד עצמו נעלמה: ' + value);
});

check('והערת המנהל אינה עוברת', function () {
  assertEqual(ask(true, "coalesce(public.week_for_me('2026-09-20')->'week'->>'note', '')"),
    '', 'הערת המנהל');
});

console.log('\n== שעון הנוכחות, בשאילתה אמיתית ==');

/* הזריעה מגיעה עם שעון כבוי, ולכן כל בדיקה כאן מדליקה אותו
   במפורש — וזו גם הבדיקה הראשונה: כבוי פירושו מסורב. */
/* הזריעה עוברת לתפקיד authenticated, ומשם כתיבה ישירה לטבלאות
   חסומה — זו בדיוק ההגנה שנבדקת כאן. לכן כל הכנה שדורשת הרשאות
   נעשית בחזרה קצרה לתפקיד המקורי, וחוזרת מיד. */
function asAdmin(sql) {
  return 'reset role;\n' + sql + '\nset local role authenticated;';
}
function clockOn(mode) {
  return asAdmin("update public.company_configs set config = jsonb_set(config, " +
    "'{settings,timeclock}', '{\"enabled\": true, \"mode\": \"" + mode + "\"}'::jsonb, true) " +
    "where company_id = '" + CO + "';");
}
var CLOCK_ON = clockOn('phone');
var CLOCK_DEVICE = clockOn('device');

function punchCount(extra) {
  return ask(false,
    "jsonb_array_length(coalesce(public.week_for_me('2026-09-20')->'week'->'punches', '[]'::jsonb))::text",
    extra);
}

check('שעון כבוי – דיווח מסורב', function () {
  var out = ask(false, "'x'", "do $d$ begin\n" +
    "  begin perform public.save_own_punch('2026-09-20');\n" +
    "  exception when others then raise notice 'refused'; end;\nend $d$;");
  assertEqual(out, 'x', 'השאילתה נפלה במקום שהחריגה תיתפס');
  assertEqual(punchCount(''), '0', 'נשמר דיווח כששעון כבוי');
});

check('מצב "מכשיר בלבד" אינו מתיר דיווח מהטלפון', function () {
  assertEqual(punchCount(CLOCK_DEVICE + "\ndo $d$ begin\n" +
    "  begin perform public.save_own_punch('2026-09-20');\n" +
    "  exception when others then null; end;\nend $d$;"), '0', 'מספר הדיווחים');
});

check('דיווח ראשון הוא כניסה', function () {
  var kind = ask(false,
    "(public.week_for_me('2026-09-20')->'week'->'punches'->0->>'kind')",
    CLOCK_ON + "\nselect public.save_own_punch('2026-09-20');");
  assertEqual(kind, 'in', 'סוג הדיווח הראשון');
});

check('והזמן נקבע בשרת, לא בבקשה', function () {
  /* הפער בין החותמת ל-now() נמדד בשניות. דיווח שהגיע עם זמן
     משלו היה מייצר כאן פער של שעות. */
  var drift = ask(false,
    "trunc(abs(extract(epoch from (now() - " +
    "((public.week_for_me('2026-09-20')->'week'->'punches'->0->>'at')::timestamptz)))))::text",
    CLOCK_ON + "\nselect public.save_own_punch('2026-09-20');");
  assert(Number(drift) <= 5, 'החותמת רחוקה משעון השרת: ' + drift);
});

check('לחיצה כפולה אינה דיווח שני', function () {
  assertEqual(punchCount(CLOCK_ON +
    "\nselect public.save_own_punch('2026-09-20');" +
    "\nselect public.save_own_punch('2026-09-20');"), '1', 'מספר הדיווחים');
});

check('ואחרי שעבר חלון הכפילות – הדיווח הבא הוא יציאה', function () {
  /* החותמת נדחפת עשר דקות אחורה במקום להמתין: מה שנבדק הוא
     החלון, לא הסבלנות של מי שמריץ את הבדיקה. */
  var rewind = CLOCK_ON +
    "\nselect public.save_own_punch('2026-09-20');\n" +
    asAdmin("update public.company_weeks set week = jsonb_set(week, '{punches,0,at}', " +
      "to_jsonb(to_char((now() - interval '10 minutes') at time zone 'utc', " +
      "'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'))) where company_id = '" + CO + "' " +
      "and week_key = '2026-09-20';") +
    "\nselect public.save_own_punch('2026-09-20');";
  assertEqual(ask(false,
    "(public.week_for_me('2026-09-20')->'week'->'punches'->1->>'kind')", rewind),
    'out', 'סוג הדיווח השני');
});

check('ועובד רואה את הדיווחים שלו בלבד', function () {
  var mine = CLOCK_ON +
    "\nselect public.save_own_punch('2026-09-20');\n" +
    asAdmin("update public.company_weeks set week = jsonb_set(week, '{punches}', " +
      "week->'punches' || jsonb_build_array(jsonb_build_object('id','pch-x','empId','emp-2'," +
      "'kind','in','at','2026-09-20T05:00:00Z','src','device'))) " +
      "where company_id = '" + CO + "' and week_key = '2026-09-20';");
  assertEqual(ask(false,
    "jsonb_array_length(public.week_for_me('2026-09-20')->'week'->'punches')::text", mine),
    '1', 'מספר הדיווחים שהגיעו לעובד');
  assertEqual(ask(true,
    "jsonb_array_length(public.week_for_me('2026-09-20')->'week'->'punches')::text", mine),
    '1', 'גם כשהסידור פתוח לכל הצוות');
});

console.log('\n== בקשת חופשה, בשאילתה אמיתית ==');

/* התאריכים נגזרים מהיום ולא קבועים: בקשה חייבת להיות עתידית,
   ובדיקה עם תאריך קבוע הופכת ללא רלוונטית ביום שאחרי. */
/* הקריאה נעשית כעובד; הבדיקה עצמה קוראת מהטבלה, וזו קריאה
   שהכללים חוסמים בפני עובד — ולכן חוזרים לתפקיד המקורי לפני
   השאילתה. החסימה הזו היא בדיוק מה שנבדק במקום אחר. */
var LEAVE_CALL = "select public.request_leave((current_date + 10), (current_date + 12), 'חתונה');\nreset role;";

check('שלושה ימים נכתבים כשלוש רשומות', function () {
  var count = ask(false,
    "(select count(*)::text from public.company_weeks w, " +
    " jsonb_each(coalesce(w.week->'constraints', '{}'::jsonb)) as item " +
    " where w.company_id = '" + CO + "' and item.value->>'requestId' is not null)",
    LEAVE_CALL);
  assertEqual(count, '3', 'מספר הרשומות');
});

check('וכולן נושאות אותו מזהה בקשה', function () {
  var distinct = ask(false,
    "(select count(distinct item.value->>'requestId')::text from public.company_weeks w, " +
    " jsonb_each(coalesce(w.week->'constraints', '{}'::jsonb)) as item " +
    " where w.company_id = '" + CO + "' and item.value->>'requestId' is not null)",
    LEAVE_CALL);
  assertEqual(distinct, '1', 'מספר הבקשות');
});

check('הבקשה ממתינה לאישור, ומסומנת כבתשלום — תמיד', function () {
  var row = ask(false,
    "(select item.value->>'status' || '/' || coalesce(item.value->>'leave', '-') " +
    " from public.company_weeks w, jsonb_each(coalesce(w.week->'constraints', '{}'::jsonb)) as item " +
    " where w.company_id = '" + CO + "' and item.value->>'requestId' is not null limit 1)",
    LEAVE_CALL);
  assertEqual(row, 'pending/paid', 'מצב הרשומה');
});

check('והיא נרשמת על העובד המחובר, ולא על מי שביקשו', function () {
  var keys = ask(false,
    "(select string_agg(distinct split_part(item.key, '|', 1), ',') " +
    " from public.company_weeks w, jsonb_each(coalesce(w.week->'constraints', '{}'::jsonb)) as item " +
    " where w.company_id = '" + CO + "' and item.value->>'requestId' is not null)",
    LEAVE_CALL);
  assertEqual(keys, 'emp-1', 'מזהה העובד ברשומות');
});

check('טווח בעבר נדחה', function () {
  var count = ask(false,
    "(select count(*)::text from public.company_weeks w, " +
    " jsonb_each(coalesce(w.week->'constraints', '{}'::jsonb)) as item " +
    " where w.company_id = '" + CO + "' and item.value->>'requestId' is not null)",
    "do $d$ begin\n" +
    "  begin perform public.request_leave((current_date - 5), (current_date - 1), '');\n" +
    "  exception when others then null; end;\nend $d$;\nreset role;");
  assertEqual(count, '0', 'נכתבו רשומות לטווח שבעבר');
});

check('וטווח ארוך משישים יום נדחה', function () {
  var count = ask(false,
    "(select count(*)::text from public.company_weeks w, " +
    " jsonb_each(coalesce(w.week->'constraints', '{}'::jsonb)) as item " +
    " where w.company_id = '" + CO + "' and item.value->>'requestId' is not null)",
    "do $d$ begin\n" +
    "  begin perform public.request_leave((current_date + 1), (current_date + 90), '');\n" +
    "  exception when others then null; end;\nend $d$;\nreset role;");
  assertEqual(count, '0', 'נכתבו רשומות לטווח ארוך מדי');
});

check('אין חתימה שמאפשרת לבקש חופשה שאינה בתשלום', function () {
  /* החתימה הישנה קיבלה p_paid. אם היא נשארה לצד החדשה, נשארה
     איתה גם דרך לבקש חופשה ללא תשלום. */
  var count = ask(false,
    "(select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
    " where n.nspname = 'public' and p.proname = 'request_leave')",
    'reset role;');
  assertEqual(count, '1', 'מספר החתימות של request_leave');
});

check('בקשה שחוצה שבוע נכתבת לשתי שורות שבוע', function () {
  var weeks = ask(false,
    "(select count(distinct w.week_key)::text from public.company_weeks w, " +
    " jsonb_each(coalesce(w.week->'constraints', '{}'::jsonb)) as item " +
    " where w.company_id = '" + CO + "' and item.value->>'requestId' is not null)",
    "select public.request_leave((current_date + 7), (current_date + 16), '');\nreset role;");
  assert(Number(weeks) >= 2, 'הבקשה נכתבה לשבוע אחד בלבד: ' + weeks);
});

console.log('\n== אסימוני התראות דחיפה ==');

/* הטבלה סגורה בפני authenticated במכוון, ולכן הקריאה הסופית
   של כל בדיקה כאן חייבת reset role — בדיוק כמו שאר הבדיקות
   שקוראות טבלאות ישירות. */

check('אסימון נשמר ומשויך לעובד ולעסק שלו', function () {
  var row = ask(false,
    "(select user_id::text || '|' || company_id::text || '|' || platform " +
    " from public.push_tokens where token = 'tok-a')",
    "select public.save_push_token('tok-a', 'ios');\nreset role;");
  assertEqual(row, DANA + '|' + CO + '|ios', 'השורה שנכתבה');
});

check('רווחים נחתכים, כי אסימון עם רווח אינו נמצא בשליחה', function () {
  assertEqual(ask(false,
    "(select count(*)::text from public.push_tokens where token = 'tok-b')",
    "select public.save_push_token('  tok-b  ', 'android');\nreset role;"), '1');
});

check('פלטפורמה שאינה ios או android נדחית', function () {
  assertEqual(ask(false,
    "(select count(*)::text from public.push_tokens)",
    "do $$ begin\n" +
    "  begin perform public.save_push_token('tok-c', 'windows');\n" +
    "  exception when others then null; end;\nend $$;\nreset role;"), '0');
});

check('אסימון ריק נדחה', function () {
  assertEqual(ask(false,
    "(select count(*)::text from public.push_tokens)",
    "do $$ begin\n" +
    "  begin perform public.save_push_token('   ', 'ios');\n" +
    "  exception when others then null; end;\nend $$;\nreset role;"), '0');
});

check('מכשיר שעבר בין עובדים משנה בעלים ולא מייצר שורה שנייה', function () {
  /* אותו אסימון, פעמיים, כשבפעם השנייה קורא משתמש אחר. שתי
     שורות כאן פירושן הודעה שנשלחת לאדם הלא נכון. */
  var out = ask(false,
    "(select count(*)::text || '|' || max(user_id::text) " +
    " from public.push_tokens where token = 'tok-d')",
    "select public.save_push_token('tok-d', 'ios');\n" +
    "select set_config('request.jwt.claim.sub','" + BOSS + "', true);\n" +
    "select public.save_push_token('tok-d', 'android');\nreset role;");
  assertEqual(out, '1|' + BOSS, 'מספר השורות והבעלים');
});

check('יציאה מסירה את האסימון של המכשיר הזה בלבד', function () {
  assertEqual(ask(false,
    "(select string_agg(token, ',' order by token) from public.push_tokens)",
    "select public.save_push_token('tok-e', 'ios');\n" +
    "select public.save_push_token('tok-f', 'ios');\n" +
    "select public.forget_push_token('tok-e');\nreset role;"), 'tok-f');
});

check('עובד אינו יכול למחוק אסימון של אחר', function () {
  assertEqual(ask(false,
    "(select count(*)::text from public.push_tokens where token = 'tok-g')",
    "select public.save_push_token('tok-g', 'ios');\n" +
    "select set_config('request.jwt.claim.sub','" + BOSS + "', true);\n" +
    "select public.forget_push_token('tok-g');\nreset role;"), '1');
});

check('הטבלה סגורה בפני המשתמש המחובר', function () {
  /* אסימון שאפשר לקרוא הוא אסימון שאפשר לשלוח בשמו הודעה
     למכשיר של מישהו אחר. הפונקציות בלבד. */
  var can = ask(false,
    "(select has_table_privilege('authenticated','public.push_tokens','select')::text)",
    'reset role;');
  assertEqual(can, 'false', 'הרשאת קריאה ל-authenticated');
});

stop();
console.log('\n' + (failed === 0 ? '✅ ' : '❌ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
process.exit(failed === 0 ? 0 : 1);
