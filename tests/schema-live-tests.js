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
function ask(teamShifts, expression) {
  /* התשובה נעטפת בסימון, ולא נלקחת כ"השורה האחרונה שאינה ריקה":
     גם לפקודות הזריעה יש פלט, ותשובה שהיא מחרוזת ריקה – למשל
     הערת מנהל שנחתכה – הייתה גורמת לקרוא אחת מהן כתשובה. */
  var body = '\\pset tuples_only on\n\\pset format unaligned\n' + seed(teamShifts) +
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

stop();
console.log('\n' + (failed === 0 ? '✅ ' : '❌ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
process.exit(failed === 0 ? 0 : 1);
