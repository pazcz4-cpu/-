/* בדיקות בידוד בין חברות והרשאות לפי תפקיד.
   אלה הבדיקות הקריטיות של המוצר: דליפה בין חברות היא כשל חמור.
   הרצה: node tests/tenancy-tests.js */
'use strict';

var I18n = require('../js/i18n/core.js');
I18n.use('he');

var Model = require('../js/backend/model.js');
var Mock = require('../js/backend/mock.js');

var passed = 0, failed = 0;

function test(name, fn) {
  try {
    var result = fn();
    if (result && typeof result.then === 'function') {
      throw new Error('בדיקה אסינכרונית – יש לעטוף ב-runAsync');
    }
    passed++; console.log('  ✓ ' + name);
  } catch (err) {
    failed++; console.log('  ✗ ' + name + '\n      ' + err.message);
  }
}

var queue = Promise.resolve();
function asyncTest(name, fn) {
  queue = queue.then(function () {
    return Promise.resolve().then(fn).then(function () {
      passed++; console.log('  ✓ ' + name);
    }, function (err) {
      failed++; console.log('  ✗ ' + name + '\n      ' + (err && err.message));
    });
  });
}

function assert(condition, message) { if (!condition) throw new Error(message || 'assertion failed'); }
function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error((message || 'ערכים שונים') + ': התקבל ' + actual + ', ציפינו ל-' + expected);
}
/* מוודא שהקריאה נכשלת עם קוד השגיאה הצפוי */
function assertRejects(promise, code, message) {
  return promise.then(function () {
    throw new Error((message || 'הפעולה הצליחה') + ' – ציפינו לדחייה עם ' + code);
  }, function (err) {
    if (err && err.code === code) return err;
    throw new Error((message || 'קוד שגיאה שונה') + ': התקבל ' + (err && err.code) + ', ציפינו ל-' + code);
  });
}

function freshBackend() { return new Mock.MockBackend(); }

console.log('\n== הרשאות לפי תפקיד ==');

test('עובד אינו רשאי לערוך את הסידור או את ההגדרות', function () {
  assertEqual(Model.can('employee', 'schedule.edit'), false, 'עריכת סידור');
  assertEqual(Model.can('employee', 'schedule.generate'), false, 'בניית סידור');
  assertEqual(Model.can('employee', 'config.edit'), false, 'עריכת הגדרות');
  assertEqual(Model.can('employee', 'users.manage'), false, 'ניהול משתמשים');
  assertEqual(Model.can('employee', 'constraints.editAny'), false, 'אילוצים של אחרים');
});

test('עובד רשאי לערוך את האילוצים של עצמו', function () {
  assertEqual(Model.can('employee', 'constraints.editOwn'), true, 'אילוצים אישיים');
});

test('מנהל רשאי לנהל משתמשים אך לא חיוב', function () {
  assertEqual(Model.can('manager', 'users.manage'), true, 'ניהול משתמשים');
  assertEqual(Model.can('manager', 'billing.manage'), false, 'חיוב שמור לבעלים');
  assertEqual(Model.can('owner', 'billing.manage'), true, 'הבעלים מנהל חיוב');
});

console.log('\n== בידוד בין חברות ==');

asyncTest('חברה אינה רואה את ההגדרות של חברה אחרת', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.saveConfig({ settings: { secret: 'נתוני חברה א' } }); })
    .then(function () { return backend.signOut(); })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'b@b.com', password: 'secret1', phone: '054-1234567'});
    })
    .then(function () { return backend.loadConfig(); })
    .then(function (config) {
      assertEqual(config, null, 'חברה ב קיבלה נתונים של חברה א');
    });
});

asyncTest('שבועות של חברה אחת אינם נגישים לחברה אחרת', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a2@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.saveWeek('2026-09-20', { assignments: { x: ['emp-1'] } }); })
    .then(function () { return backend.signOut(); })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'b2@b.com', password: 'secret1', phone: '054-1234567'});
    })
    .then(function () { return backend.loadWeek('2026-09-20'); })
    .then(function (week) { assertEqual(week, null, 'דלף שבוע בין חברות'); })
    .then(function () { return backend.listWeeks(); })
    .then(function (keys) { assertEqual(keys.length, 0, 'רשימת השבועות דלפה'); });
});

asyncTest('רשימת המשתמשים מוגבלת לחברה של המשתמש', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a3@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.createUser({ email: 'worker@a.com', password: 'secret1', role: 'employee' }); })
    .then(function () { return backend.signOut(); })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'b3@b.com', password: 'secret1', phone: '054-1234567'});
    })
    .then(function () { return backend.listUsers(); })
    .then(function (users) {
      assertEqual(users.length, 1, 'חברה ב רואה משתמשים של חברה א');
      assertEqual(users[0].email, 'b3@b.com', 'רק המשתמש של החברה עצמה');
    });
});

asyncTest('לא ניתן לערוך משתמש של חברה אחרת', function () {
  var backend = freshBackend();
  var foreignUserId;
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a4@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.createUser({ email: 'worker4@a.com', password: 'secret1', role: 'employee' }); })
    .then(function (user) { foreignUserId = user.id; return backend.signOut(); })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'b4@b.com', password: 'secret1', phone: '054-1234567'});
    })
    .then(function () {
      return assertRejects(backend.updateUser(foreignUserId, { active: false }), 'not_found',
        'חברה ב הצליחה לערוך משתמש של חברה א');
    });
});

asyncTest('עדכון חי אינו מגיע לחברה אחרת', function () {
  var backend = freshBackend();
  var otherCompanyEvents = 0;
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a5@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.signOut(); })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'b5@b.com', password: 'secret1', phone: '054-1234567'});
    })
    .then(function () {
      backend.subscribe(function () { otherCompanyEvents++; });
      return backend.signOut();
    })
    .then(function () { return backend.signIn({ email: 'a5@a.com', password: 'secret1' }); })
    .then(function () { return backend.saveConfig({ changed: true }); })
    .then(function () {
      assertEqual(otherCompanyEvents, 0, 'מאזין של חברה ב קיבל שינוי של חברה א');
    });
});

asyncTest('פרסום סידור בחברה אחת אינו נוגע בחברה אחרת', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a6@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.saveWeek('2026-09-20', { assignments: { x: ['emp-1'] } }); })
    .then(function () { return backend.publishWeek('2026-09-20', true); })
    .then(function (week) { assertEqual(week.published, true, 'הפרסום לא נשמר'); })
    .then(function () { return backend.signOut(); })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'b6@b.com', password: 'secret1', phone: '054-1234567'});
    })
    .then(function () {
      /* השבוע של חברה א אינו קיים אצל חברה ב, ולכן גם אינו מפורסם
         אצלה – והניסיון לפרסם אותו נדחה ולא יוצר שבוע חדש. */
      return assertRejects(backend.publishWeek('2026-09-20', true), 'not_found',
        'חברה ב פרסמה שבוע של חברה א');
    })
    .then(function () { return backend.loadWeek('2026-09-20'); })
    .then(function (week) { assertEqual(week, null, 'הפרסום חשף שבוע של חברה אחרת'); });
});

asyncTest('אימייל שקיים בחברה אחת אינו נגרר לחברה אחרת', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a7@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.createUser({ email: 'shared@x.com', role: 'employee' }); })
    .then(function () { return backend.signOut(); })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'b7@b.com', password: 'secret1', phone: '054-1234567'});
    })
    .then(function () {
      /* הזמנה לכתובת שכבר שייכת לחברה אחרת נדחית. אחרת אותו אדם
         היה מקבל שתי חברות, והמשתמש של חברה א היה נמשך לחברה ב. */
      return assertRejects(backend.createUser({ email: 'shared@x.com', role: 'employee' }),
        'email_taken', 'חברה ב הזמינה משתמש שקיים בחברה א');
    })
    .then(function () { return backend.listUsers(); })
    .then(function (users) {
      assertEqual(users.length, 1, 'רשימת המשתמשים של חברה ב השתנתה');
      assertEqual(users[0].email, 'b7@b.com', 'משתמש זר נכנס לרשימה');
    });
});

asyncTest('קישור לקביעת סיסמה מכניס לחברה שלו בלבד', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a8@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.saveConfig({ settings: { secret: 'נתוני חברה א' } }); })
    .then(function () { return backend.createUser({ email: 'worker8@a.com', role: 'employee' }); })
    .then(function () { return backend.signOut(); })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'b8@b.com', password: 'secret1', phone: '054-1234567'});
    })
    .then(function () { return backend.saveConfig({ settings: { secret: 'נתוני חברה ב' } }); })
    .then(function () { return backend.signOut(); })
    .then(function () {
      /* הקישור של עובד חברה א נפתח על אותו דפדפן שבו חברה ב עבדה */
      backend.followLink('worker8@a.com', 'invite');
      return backend.setPassword('chosen123');
    })
    .then(function (session) {
      assertEqual(session.company.name, 'חברה א', 'הקישור הכניס לחברה הלא נכונה');
      assertEqual(session.user.role, 'employee', 'המוזמן קיבל תפקיד אחר');
      return backend.loadConfig();
    })
    .then(function (config) {
      /* ההגדרות שעובד מקבל הן פרוסה: משמרות, סניפים והכרטיס
         שלו. הסימן נבדק בתוך settings, שהוא מה שעובד באמת רואה. */
      assertEqual(config.settings.secret, 'נתוני חברה א',
        'העובד קיבל את ההגדרות של החברה השנייה');
    });
});

asyncTest('בקשת איפוס אינה מגלה אם הכתובת קיימת', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a9@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.requestPasswordReset('a9@a.com'); })
    .then(function (known) {
      return backend.requestPasswordReset('nobody@nowhere.com').then(function (unknown) {
        assertEqual(known, unknown,
          'התשובה שונה לכתובת קיימת, וכך אפשר לגלות מי רשום למערכת');
      });
    });
});

asyncTest('קישור שלא נפתח אינו מקנה כלום', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a10@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.signOut(); })
    .then(function () {
      /* בקשה לאיפוס אינה מכניסה לשום מקום בפני עצמה */
      return backend.requestPasswordReset('a10@a.com');
    })
    .then(function () {
      assertEqual(backend.pendingAuthAction(), null, 'הבקשה עצמה פתחה מסך סיסמה');
      assertEqual(backend.session(), null, 'הבקשה עצמה הכניסה למערכת');
      return assertRejects(backend.setPassword('nothing123'), 'link_expired',
        'אפשר היה לקבוע סיסמה בלי לפתוח את הקישור');
    });
});

console.log('\n== אכיפת הרשאות בשרת ==');

asyncTest('עובד אינו יכול לשמור סידור', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner6@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ email: 'emp6@a.com', password: 'secret1', role: 'employee', employeeId: 'emp-1' });
    })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'emp6@a.com', password: 'secret1' }); })
    .then(function () {
      return assertRejects(backend.saveWeek('2026-09-20', {}), 'forbidden', 'עובד שמר סידור');
    })
    .then(function () {
      return assertRejects(backend.saveConfig({}), 'forbidden', 'עובד שמר הגדרות');
    })
    .then(function () {
      return assertRejects(backend.createUser({ email: 'x@a.com', password: 'secret1' }), 'forbidden',
        'עובד יצר משתמש');
    });
});

asyncTest('עובד שומר אילוץ של עצמו בלבד', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner7@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ email: 'emp7@a.com', password: 'secret1', role: 'employee', employeeId: 'emp-7' });
    })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'emp7@a.com', password: 'secret1' }); })
    .then(function () {
      return backend.saveOwnConstraint('2026-09-20', 3, { off: true, blocked: {}, preferred: {} });
    })
    .then(function (week) {
      var keys = Object.keys(week.constraints);
      assertEqual(keys.length, 1, 'נשמר אילוץ אחד');
      assertEqual(keys[0], 'emp-7|3', 'האילוץ נשמר תחת מזהה העובד המחובר, לא אחר');
    });
});

asyncTest('עובד ללא קישור לכרטיס עובד אינו יכול לשמור אילוץ', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner8@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ email: 'emp8@a.com', password: 'secret1', role: 'employee' });
    })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'emp8@a.com', password: 'secret1' }); })
    .then(function () {
      return assertRejects(backend.saveOwnConstraint('2026-09-20', 1, { off: true }), 'no_employee_link',
        'נשמר אילוץ בלי קישור לעובד');
    });
});

asyncTest('עובד אינו משנה אילוצים אחרי פרסום הסידור', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner9@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ email: 'emp9@a.com', password: 'secret1', role: 'employee', employeeId: 'emp-9' });
    })
    .then(function () { return backend.saveWeek('2026-09-20', { constraints: {}, assignments: {} }); })
    .then(function () { return backend.publishWeek('2026-09-20', true); })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'emp9@a.com', password: 'secret1' }); })
    .then(function () {
      return assertRejects(backend.saveOwnConstraint('2026-09-20', 2, { off: true }), 'week_published',
        'עובד שינה אילוץ בשבוע שפורסם');
    });
});

asyncTest('מנהל אינו יכול לשנות את המנוי', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner10@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ email: 'mgr10@a.com', password: 'secret1', role: 'manager' });
    })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'mgr10@a.com', password: 'secret1' }); })
    .then(function () {
      return assertRejects(backend.setSubscription({ plan: 'unlimited' }), 'forbidden', 'מנהל שינה מנוי');
    });
});

asyncTest('לא ניתן להעניק תפקיד בעלים דרך יצירת משתמש', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner11@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ email: 'sneaky@a.com', password: 'secret1', role: 'owner' });
    })
    .then(function (user) {
      assertEqual(user.role, 'employee', 'תפקיד owner הוענק דרך יצירת משתמש');
    });
});

console.log('\n== אישור אילוצים ==');

asyncTest('בקשת עובד נשמרת תמיד כממתינה לאישור', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'own20@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ email: 'emp20@a.com', password: 'secret1', role: 'employee', employeeId: 'emp-20' });
    })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'emp20@a.com', password: 'secret1' }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 3, { off: true, blocked: {}, preferred: {} }); })
    .then(function (week) {
      assertEqual(week.constraints['emp-20|3'].status, 'pending', 'הבקשה ממתינה');
      assert(week.constraints['emp-20|3'].requestedAt, 'נשמר מועד הבקשה');
    });
});

asyncTest('עובד אינו יכול לאשר את הבקשה של עצמו', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'own21@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ email: 'emp21@a.com', password: 'secret1', role: 'employee', employeeId: 'emp-21' });
    })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'emp21@a.com', password: 'secret1' }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 2, { off: true, blocked: {}, preferred: {} }); })
    .then(function () {
      return assertRejects(backend.decideConstraint('2026-09-20', 'emp-21', 2, 'approved'), 'forbidden',
        'עובד אישר את עצמו');
    });
});

asyncTest('עובד אינו יכול לשלוח בקשה בשם עובד אחר', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'own22@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ email: 'emp22@a.com', password: 'secret1', role: 'employee', employeeId: 'emp-22' });
    })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'emp22@a.com', password: 'secret1' }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 1, { off: true, blocked: {}, preferred: {} }); })
    .then(function (week) {
      var keys = Object.keys(week.constraints);
      assertEqual(keys.length, 1, 'נשמרה בקשה אחת');
      assertEqual(keys[0].split('|')[0], 'emp-22', 'תמיד על שם העובד המחובר');
    });
});

asyncTest('מנהל מאשר ודוחה בקשות', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'own23@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ email: 'emp23@a.com', password: 'secret1', role: 'employee', employeeId: 'emp-23' });
    })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'emp23@a.com', password: 'secret1' }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 4, { off: true, blocked: {}, preferred: {} }); })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'own23@a.com', password: 'secret1' }); })
    .then(function () { return backend.decideConstraint('2026-09-20', 'emp-23', 4, 'approved', 'מאושר'); })
    .then(function (week) {
      assertEqual(week.constraints['emp-23|4'].status, 'approved', 'אושר');
      assertEqual(week.constraints['emp-23|4'].managerNote, 'מאושר', 'נשמרה הערה');
      return backend.decideConstraint('2026-09-20', 'emp-23', 4, 'rejected', 'צריך אותך');
    })
    .then(function (week) {
      assertEqual(week.constraints['emp-23|4'].status, 'rejected', 'נדחה');
    });
});

asyncTest('החלטה לא חוקית ובקשה שאינה קיימת נדחות', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'own24@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.saveWeek('2026-09-20', { constraints: {}, assignments: {} }); })
    .then(function () {
      return assertRejects(backend.decideConstraint('2026-09-20', 'emp-x', 1, 'maybe'), 'invalid_input');
    })
    .then(function () {
      return assertRejects(backend.decideConstraint('2026-09-20', 'emp-x', 1, 'approved'), 'not_found');
    });
});

asyncTest('עריכה חוזרת של בקשה שאושרה מחזירה אותה לאישור', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'own25@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ email: 'emp25@a.com', password: 'secret1', role: 'employee', employeeId: 'emp-25' });
    })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'emp25@a.com', password: 'secret1' }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 5, { off: true, blocked: {}, preferred: {} }); })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'own25@a.com', password: 'secret1' }); })
    .then(function () { return backend.decideConstraint('2026-09-20', 'emp-25', 5, 'approved'); })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'emp25@a.com', password: 'secret1' }); })
    .then(function () {
      return backend.saveOwnConstraint('2026-09-20', 5, { off: false, blocked: { morning: true }, preferred: {} });
    })
    .then(function (week) {
      assertEqual(week.constraints['emp-25|5'].status, 'pending', 'חזרה להמתנה');
      assert(!week.constraints['emp-25|5'].decidedAt, 'ההחלטה הקודמת נמחקה');
    });
});

console.log('\n== התחברות ==');

asyncTest('סיסמה שגויה נדחית', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner12@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.signOut(); })
    .then(function () {
      return assertRejects(backend.signIn({ email: 'owner12@a.com', password: 'wrong' }), 'bad_credentials');
    });
});

asyncTest('אימייל כפול נדחה', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה א', email: 'dup@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.signOut(); })
    .then(function () {
      return assertRejects(
        backend.signUpCompany({ companyName: 'חברה ב', email: 'DUP@a.com', password: 'secret1', phone: '054-1234567'}),
        'email_taken', 'אימייל כפול (גם באותיות גדולות) התקבל');
    });
});

asyncTest('סיסמה קצרה נדחית', function () {
  var backend = freshBackend();
  return assertRejects(
    backend.signUpCompany({ companyName: 'חברה', email: 'short@a.com', password: '123', phone: '054-1234567'}),
    'weak_password');
});

asyncTest('משתמש שהושבת אינו יכול להתחבר', function () {
  var backend = freshBackend();
  var userId;
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner13@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.createUser({ email: 'emp13@a.com', password: 'secret1', role: 'employee' }); })
    .then(function (user) { userId = user.id; return backend.updateUser(userId, { active: false }); })
    .then(function () { return backend.signOut(); })
    .then(function () {
      return assertRejects(backend.signIn({ email: 'emp13@a.com', password: 'secret1' }), 'user_disabled');
    });
});

asyncTest('פעולה ללא התחברות נדחית', function () {
  var backend = freshBackend();
  return assertRejects(backend.saveConfig({}), 'not_signed_in');
});

console.log('\n== מנוי ==');

/* דף המכירה ומסך ההרשמה מבטיחים משהו על החיוב, והחשבון שנפתח
   צריך להתנהג בדיוק לפי ההבטחה. כאן נבדק שהמדיניות אחת. */
test('מדיניות הכרטיס נגזרת ממצב הסליקה, ואינה קבועה בקוד', function () {
  /* בלי סליקה אי אפשר לבקש כרטיס – אין לאן לשלוח אותו. עם
     סליקה זו המדיניות. אם שני אלה מתפצלים, הדף מבטיח דבר אחד
     והמערכת עושה אחר. */
  Model.setBillingLive(false);
  assertEqual(Model.trialRequiresCard(), false, 'בלי סליקה נדרש כרטיס בהרשמה');
  Model.setBillingLive(true);
  assertEqual(Model.trialRequiresCard(), true, 'עם סליקה לא נדרש כרטיס בהרשמה');
  Model.setBillingLive(false);
});

/* לכל הבטחה שנוגעת לכרטיס יש שני נוסחים, ושניהם חייבים להתקיים
   בכל שפה: נוסח בלי סליקה ונוסח עם. נוסח חסר פירושו שבמצב אחד
   הדף יציג מפתח תרגום במקום משפט. */
/* השורות שכן מזכירות כרטיס – התשובה בשאלות הנפוצות והמשפט
   במסך ההרשמה – חייבות שני נוסחים בכל שפה. השאר לא מזכירות
   אותו, ולכן אסור שיבטיחו לכאן או לכאן. */
test('שורת המחירים והשורה שמתחת לכפתור אינן מבטיחות דבר על כרטיס', function () {
  var fs = require('fs');
  var path = require('path');
  var dir = path.join(__dirname, '..', 'js', 'i18n');
  var CARD_WORDS = ['כרטיס אשראי', 'credit card', 'بطاقة', 'Kreditkarte',
    'tarjeta', 'carte', 'cartão', 'карт'];
  fs.readdirSync(dir).forEach(function (file) {
    if (!/\.js$/.test(file) || file === 'core.js' || file === 'dom.js') return;
    var text = fs.readFileSync(path.join(dir, file), 'utf8');
    ['pricingNote', 'heroNote'].forEach(function (key) {
      var value = (text.match(new RegExp(key + ": '((?:[^'\\\\]|\\\\.)*)'")) || [])[1] || '';
      assert(value, file + ' – חסר ' + key);
      CARD_WORDS.forEach(function (word) {
        assert(value.indexOf(word) === -1,
          file + ' – ' + key + ' מבטיח משהו על כרטיס: ' + word);
      });
    });
  });
});

test('לכל הבטחת כרטיס יש שני נוסחים, בשמונה השפות', function () {
  var fs = require('fs');
  var path = require('path');
  var dir = path.join(__dirname, '..', 'js', 'i18n');
  /* רק במקומות שבהם באמת אומרים משהו על הכרטיס. שורת המחירים
     והשורה שמתחת לכפתור אינן מזכירות אותו כלל – ומה שלא נאמר
     אינו יכול להיות שקר באף מצב. */
  var pairs = [['landing', 'faq6A'], ['auth', 'trialNote']];
  var langs = fs.readdirSync(dir).filter(function (file) {
    return /\.js$/.test(file) && file !== 'core.js' && file !== 'dom.js';
  });
  assert(langs.length === 8, 'מספר השפות השתנה: ' + langs.length);

  langs.forEach(function (file) {
    var text = fs.readFileSync(path.join(dir, file), 'utf8');
    pairs.forEach(function (pair) {
      var name = pair[1];
      assert(text.indexOf(name + ':') !== -1, file + ' – חסר ' + name);
      assert(text.indexOf(name + 'Card:') !== -1,
        file + ' – חסר הנוסח עם כרטיס: ' + name + 'Card');
    });
  });
});

test('פתיחת חשבון אינה יוצרת מנוי אצל הספק מעצמה', function () {
  var company = Model.newTrialCompany('חדשה', new Date('2026-09-01T08:00:00Z'));
  assertEqual(company.billingCustomerId, null, 'חשבון חדש נפתח עם אמצעי תשלום');
  assertEqual(company.billingSubscriptionId, null, 'חשבון חדש נפתח עם מנוי אצל הספק');

  /* וההודעה שהלקוח רואה תלויה במצב הסליקה, ולא בטקסט קבוע:
     · סליקה מחוברת → "הוסיפו אמצעי תשלום"
     · אין סליקה     → "המערכת בפיילוט, ניצור קשר לפני החיוב"
     שתיהן נכונות במצב שלהן, ושתיהן לא נכונות במצב השני. */
  var when = new Date('2026-09-02T08:00:00Z');

  Model.setBillingLive(true);
  var withBilling = Model.accessState(company, when);
  assertEqual(withBilling.reason, 'trial-no-card',
    'עם סליקה, החשבון החדש מדווח על מצב אחר: ' + withBilling.reason);
  assert(withBilling.allowed, 'חשבון חדש נחסם');

  Model.setBillingLive(false);
  var pilot = Model.accessState(company, when);
  assertEqual(pilot.reason, 'trial-pilot',
    'בלי סליקה, החשבון החדש מדווח על מצב אחר: ' + pilot.reason);
  assert(pilot.allowed, 'חשבון בפיילוט נחסם');
  assert(!/אמצעי תשלום/.test(pilot.text),
    'בפיילוט עדיין מבקשים אמצעי תשלום: ' + pilot.text);
});

/* ברירת המחדל היא "אין סליקה". דגל שמתחיל ב"אפשר לחייב" נותן,
   ברגע שמישהו שוכח לחבר אותו, בדיוק את התוצאה הגרועה. */
test('ברירת המחדל של הסליקה היא לא מחובר', function () {
  var fresh = require('child_process').execSync(
    'node -e "process.stdout.write(String(require(\'./js/backend/model.js\').isBillingLive()))"',
    { cwd: require('path').join(__dirname, '..') }).toString();
  assertEqual(fresh, 'false', 'המודל נטען עם סליקה מחוברת כברירת מחדל');
});

test('תקופת ניסיון מעניקה גישה ומסתיימת בזמן', function () {
  var company = Model.newTrialCompany('חברה', new Date('2026-09-01'));
  assertEqual(Model.accessState(company, new Date('2026-09-10')).allowed, true, 'בתוך הניסיון');
  assertEqual(Model.accessState(company, new Date('2026-09-20')).allowed, false, 'אחרי הניסיון');
  assertEqual(Model.accessState(company, new Date('2026-09-20')).reason, 'trial-ended', 'סיבת החסימה');
});

test('מנוי פעיל שפג חוסם גישה', function () {
  var company = { status: Model.SUBSCRIPTION.ACTIVE, validUntil: '2026-09-15T00:00:00.000Z', plan: 'pro' };
  assertEqual(Model.accessState(company, new Date('2026-09-10')).allowed, true, 'בתוקף');
  assertEqual(Model.accessState(company, new Date('2026-09-16')).allowed, false, 'פג');
});

test('תשלום שנכשל מאפשר ימי חסד ואז חוסם', function () {
  /* הבדיקה נגזרת מ-GRACE_DAYS ולא ממספר קבוע. קודם לכן היא
     בדקה חסימה אחרי חמישה ימים בזמן שהמספר הוא שבעה, ולכן
     קיבעה בדיוק את הפער בין המסך למנוע החיוב. */
  var due = new Date('2026-09-20T00:00:00.000Z');
  var company = { status: Model.SUBSCRIPTION.PAST_DUE,
    validUntil: due.toISOString(), plan: 'basic' };
  function at(days) {
    return Model.accessState(company, new Date(due.getTime() + days * 864e5));
  }

  var during = at(-2);
  assertEqual(during.allowed, true, 'לפני שהתוקף עבר');
  assert(during.text.indexOf('תיחסם') !== -1, 'מוצגת אזהרה');

  assertEqual(at(1).allowed, true, 'ננעל יום אחרי שהכרטיס נדחה');
  assertEqual(at(Model.GRACE_DAYS).allowed, true, 'ננעל ביום האחרון של החסד');
  assertEqual(at(Model.GRACE_DAYS + 1).allowed, false, 'לא ננעל אחרי ימי החסד');
});

test('מנוי מבוטל חוסם גישה', function () {
  var company = { status: Model.SUBSCRIPTION.CANCELED, validUntil: '2027-01-01T00:00:00.000Z' };
  assertEqual(Model.accessState(company, new Date('2026-09-18')).allowed, false, 'מבוטל');
});

console.log('\n== תוכניות ותמחור ==');

test('ארבע התוכניות במחירים ובטווחים שנקבעו', function () {
  assertEqual(Model.PLANS.starter.priceMonthly, 199, 'תוכנית קטן');
  assertEqual(Model.PLANS.starter.maxEmployees, 10, 'עד 10 עובדים');
  assertEqual(Model.PLANS.growth.priceMonthly, 399, 'תוכנית בינוני');
  assertEqual(Model.PLANS.growth.maxEmployees, 30, 'עד 30 עובדים');
  assertEqual(Model.PLANS.business.priceMonthly, 599, 'תוכנית גדול');
  assertEqual(Model.PLANS.business.maxEmployees, 99, 'עד 99 עובדים');
  assertEqual(Model.PLANS.enterprise.minEmployees, 100, 'רשתות – מ-100');
  assertEqual(Model.PLANS.enterprise.maxEmployees, 0, 'ללא תקרה');
});

/* לרשת אין מחיר מחירון, והמספר 0 אינו "חינם" אלא "עוד לא סוכם".
   מי שיטעה בזה יחייב רשת באפס או ייתן לה שימוש חופשי. */
test('תוכנית הרשתות היא הצעת מחיר ולא מחירון', function () {
  assert(Model.PLANS.enterprise.quote === true, 'התוכנית אינה מסומנת כהצעת מחיר');
  assert(!Model.PLANS.starter.quote, 'תוכנית רגילה סומנה בטעות');
  assertEqual(Model.PLANS.enterprise.priceMonthly, 0, 'אין מחיר מחירון');
  assertEqual(Model.awaitingQuote({ plan: 'enterprise' }), true, 'המחיר אמור להיחשב כלא נקבע');
  assertEqual(Model.effectivePrice({ plan: 'enterprise' }), 0, 'אין מה לגבות');
});

test('מחיר מוסכם גובר על המחירון', function () {
  assertEqual(Model.effectivePrice({ plan: 'enterprise', customPriceMonthly: 1450 }), 1450,
    'המחיר שסוכם לא נלקח');
  assertEqual(Model.awaitingQuote({ plan: 'enterprise', customPriceMonthly: 1450 }), false,
    'רשת עם מחיר עדיין נחשבת בלי מחיר');
  assertEqual(Model.effectivePrice({ plan: 'starter', customPriceMonthly: 150 }), 150,
    'מחיר מוסכם בתוכנית רגילה לא נלקח');
  assertEqual(Model.effectivePrice({ plan: 'starter' }), 199, 'בלי מחיר מוסכם – המחירון');
  /* אפס ושלילי אינם מחיר: הם "אין מחיר", ולכן חוזרים למחירון */
  assertEqual(Model.effectivePrice({ plan: 'starter', customPriceMonthly: 0 }), 199, 'אפס נחשב מחיר');
  assertEqual(Model.effectivePrice({ plan: 'starter', customPriceMonthly: -5 }), 199, 'שלילי נחשב מחיר');
});

/* התעריף לעובד: מספר שמוכפל, ולא מספר שנשמר.

   הסכנה כאן היא חיוב לפי מספר שנוחש. עסק שסגר 12 שקלים לעובד
   ואין לנו כרגע את מספר העובדים שלו אינו עסק שמשלם 12 שקלים,
   והחישוב חייב להודות שאינו יודע. */
test('תעריף לעובד מוכפל במספר העובדים', function () {
  var chain = { plan: 'enterprise', customPricePerEmployee: 12 };
  assertEqual(Model.effectivePrice(chain, 140), 1680, 'ההכפלה');
  assertEqual(Model.effectivePrice(chain, 0), 0, 'רשת בלי עובדים');
  /* בלי מספר עובדים אין מה לחשב, והתשובה היא "עוד לא ידוע" */
  assertEqual(Model.effectivePrice(chain), 0, 'הומצא מספר');
  assertEqual(Model.effectivePrice(chain, -3), 0, 'מספר שלילי הפך למחיר');
  assertEqual(Model.awaitingQuote(chain), false, 'תעריף הוא מחיר שנקבע');
});

test('תעריף לעובד גובר על סכום קבוע', function () {
  var both = { plan: 'enterprise', customPriceMonthly: 1450, customPricePerEmployee: 12 };
  assertEqual(Model.pricingOf(both).kind, Model.PRICING.PER_EMPLOYEE, 'הצורה שנבחרה');
  assertEqual(Model.effectivePrice(both, 10), 120, 'הסכום הקבוע גבר');
  assertEqual(Model.pricingOf({ plan: 'starter' }).kind, Model.PRICING.PLAN, 'מחירון');
  assertEqual(Model.pricingOf({ plan: 'starter', customPriceMonthly: 150 }).kind,
    Model.PRICING.FLAT, 'סכום קבוע');
  /* אפס ושלילי אינם תעריף */
  assertEqual(Model.pricingOf({ plan: 'starter', customPricePerEmployee: 0 }).kind,
    Model.PRICING.PLAN, 'אפס נחשב תעריף');
});

/* ===== השיא, וההתרוקנות שלפני החיוב =====

   תאריך החיוב מופיע ללקוח על מסך המנוי שלו, ולכן ספירה ברגע
   החיוב היא ספירה שאפשר לתזמן סביבה: מכבים תשעים מתוך מאה
   עובדים ליום אחד -- מתג, בלי לאבד נתון -- ומדליקים למחרת.
   לכן מחייבים לפי השיא בתקופה. */
test('מחייבים לפי השיא בתקופה, ולא לפי הספירה של הרגע', function () {
  var drained = {
    plan: 'enterprise', customPricePerEmployee: 12,
    employeePeak: 100, employeeCount: 10
  };
  assertEqual(Model.billableEmployees(drained, 10), 100, 'השיא לא ניצח');
  assertEqual(Model.effectivePrice(drained, 10), 1200, 'החיוב ירד עם הכיבוי');
});

test('מה שהמסך רואה כרגע נשקל גם הוא, כשהוא הגדול', function () {
  /* עסק שהרגע הוסיף עובדים אינו אמור לראות מחיר נמוך ממה
     שייגבה ממנו בפועל */
  var growing = { plan: 'enterprise', customPricePerEmployee: 12,
    employeePeak: 20, employeeCount: 20 };
  assertEqual(Model.billableEmployees(growing, 25), 25, 'התוספת לא נספרה');
});

/* ריק אינו אפס. Number(null) הוא 0, וזו בדיוק הטעות שהייתה
   מציגה ללקוח "0₪ לחודש" במקום את התעריף שסוכם איתו. */
test('עמודה ריקה נקראת כ"לא נמדד" ולא כאפס', function () {
  assertEqual(Model.billableEmployees({ employeePeak: null, employeeCount: null }), null,
    'ריק הפך לאפס');
  assertEqual(Model.billableEmployees({ employeePeak: '', employeeCount: undefined }), null,
    'מחרוזת ריקה הפכה לאפס');
  /* אפס מפורש הוא כן אפס: עסק שמחק את כולם */
  assertEqual(Model.billableEmployees({ employeePeak: 0, employeeCount: 0 }), 0,
    'אפס אמיתי נעלם');
});

/* "300₪" לבדו אינו מסביר למה בחודש הבא יופיע 312. המסך אומר
   את התעריף ואת התוצאה, ולא רק את התוצאה. */
test('המסך מציג תעריף וגם סכום', function () {
  var chain = { plan: 'enterprise', customPricePerEmployee: 12 };
  var label = Model.priceLabel(chain, 25);
  assert(label.indexOf('12') !== -1, 'התעריף לא מופיע: ' + label);
  assert(label.indexOf('300') !== -1, 'הסכום לא מופיע: ' + label);
  /* בלי מספר עובדים מוצג התעריף בלבד, ולא "0₪ לחודש" */
  var alone = Model.priceLabel(chain);
  assert(alone.indexOf('12') !== -1, 'התעריף נעלם: ' + alone);
  assert(alone.indexOf('0₪') === -1, 'הוצג אפס כמחיר: ' + alone);
});

/* ===== קופונים ===== */

test('קוד קופון מנורמל לפני כל השוואה', function () {
  assertEqual(Model.normalizeCouponCode(' extra-month '), 'EXTRAMONTH', 'רווחים ומקף');
  assertEqual(Model.normalizeCouponCode('Free NFC'), 'FREENFC', 'אותיות קטנות');
  assertEqual(Model.normalizeCouponCode(null), '', 'ריק');
  assertEqual(Model.normalizeCouponCode('א' + 'B2'), 'B2', 'תווים שאינם אנגלית או ספרה');
});

test('קופון תקף, ומה פוסל אותו', function () {
  var now = new Date('2026-09-26T10:00:00Z');
  var good = { code: 'EXTRAMONTH', kind: 'days', value: 30, active: true };
  assertEqual(Model.couponProblem(good, {}, now), null, 'קופון תקין נפסל');

  assertEqual(Model.couponProblem(null, {}, now), 'notFound', 'קופון שאינו קיים');
  assertEqual(Model.couponProblem({ code: 'X', kind: 'days', value: 30, active: false }, {}, now),
    'notFound', 'קופון מכובה');
  assertEqual(Model.couponProblem({ code: 'X', kind: 'bonus', value: 5 }, {}, now),
    'notFound', 'סוג שאינו מוכר');
  assertEqual(Model.couponProblem({ code: 'X', kind: 'percent', value: 120 }, {}, now),
    'notFound', 'הנחה מעל מאה אחוז');
  assertEqual(Model.couponProblem(
    { code: 'X', kind: 'days', value: 30, validUntil: '2026-09-01' }, {}, now),
    'expired', 'קופון שפג');
  assertEqual(Model.couponProblem(
    { code: 'X', kind: 'days', value: 30, maxUses: 5, uses: 5 }, {}, now),
    'exhausted', 'קופון שנוצל עד תום');
});

/* בלי הכלל הזה לקוח שקיבל שלוש הודעות שיווקיות מממש שלושה
   קופונים ומגיע לחיוב אפס */
test('קופון אחד ללקוח, לכל החיים', function () {
  var now = new Date('2026-09-26');
  var coupon = { code: 'FREENFC', kind: 'percent', value: 20 };
  assertEqual(Model.couponProblem(coupon, { couponCode: '' }, now), null, 'לקוח נקי נחסם');
  assertEqual(Model.couponProblem(coupon, { couponCode: 'EXTRAMONTH' }, now), 'already',
    'לקוח שכבר מימש קיבל עוד קופון');
});

test('קופון ימים מאריך מהתוקף הקיים ולא מהיום', function () {
  var now = new Date('2026-09-26T00:00:00Z');
  var coupon = { code: 'EXTRAMONTH', kind: 'days', value: 30 };

  /* נותרו עשרה ימי ניסיון: שלושים ועוד עשרה = ארבעים מהיום */
  var effect = Model.couponEffect(coupon, { validUntil: '2026-10-06T00:00:00Z' }, now);
  assertEqual(effect.validUntil.toISOString().slice(0, 10), '2026-11-05', 'הימים לא נוספו לתוקף');

  /* תוקף שכבר עבר אינו מקצר -- מונים מהיום */
  var past = Model.couponEffect(coupon, { validUntil: '2026-09-01T00:00:00Z' }, now);
  assertEqual(past.validUntil.toISOString().slice(0, 10), '2026-10-26', 'תוקף שעבר קיצר את ההטבה');

  assertEqual(Model.couponEffect(coupon, { couponCode: 'X' }, now), null,
    'קופון פסול החזיר השפעה');
});

test('הנחה חלה על החיוב הבא בלבד', function () {
  var withDiscount = { discountPercent: 20, discountChargesLeft: 1 };
  assertEqual(Model.discountedPrice(199, withDiscount), 159, 'ההנחה לא חושבה');
  assertEqual(Model.discountedPrice(199, { discountPercent: 20, discountChargesLeft: 0 }), 199,
    'הנחה שנוצלה עדיין הופחתה');
  assertEqual(Model.discountedPrice(199, null), 199, 'בלי חברה');
  assertEqual(Model.discountedPrice(199, { discountPercent: 0, discountChargesLeft: 1 }), 199,
    'אפס אחוז');
});

test('הנחה בשקלים יורדת מהמחיר, ולא מתחת לאפס', function () {
  assertEqual(Model.discountedPrice(199, { discountAmount: 50, discountChargesLeft: 1 }), 149,
    'ההנחה בשקלים לא הופחתה');
  /* הנחה גדולה מהמחיר היא חודש חינם, ולא חוב שלנו ללקוח */
  assertEqual(Model.discountedPrice(199, { discountAmount: 500, discountChargesLeft: 1 }), 0,
    'הנחה גדולה מהמחיר ירדה מתחת לאפס');
  assertEqual(Model.discountedPrice(199, { discountAmount: 50, discountChargesLeft: 0 }), 199,
    'הנחה שנוצלה עדיין הופחתה');
});

test('קופון בשקלים תקף, ומחזיר סכום', function () {
  var now = new Date('2026-09-26');
  var coupon = { code: 'FIFTY', kind: 'amount', value: 50 };
  assertEqual(Model.couponProblem(coupon, {}, now), null, 'קופון שקלים נפסל');
  var effect = Model.couponEffect(coupon, {}, now);
  assertEqual(effect.kind, 'amount', 'הסוג שהוחזר');
  assertEqual(effect.amount, 50, 'הסכום שהוחזר');
  /* לאחוז יש תקרה של 100; לשקלים אין, כי 500 ש"ח הנחה על מחיר
     של 199 הם פשוט חודש חינם */
  assertEqual(Model.couponProblem({ code: 'BIG', kind: 'amount', value: 5000 }, {}, now), null,
    'סכום גדול נפסל בטעות');
});

/* "חודש חינם" ו"אין מחיר" מגיעים שניהם לאפס, ומי שיבלבל ביניהם
   או יחייב רשת באפס או ייתן לה חודש חינם בלי שאיש החליט */
test('הנחה מלאה אינה "אין מחיר"', function () {
  var free = { discountPercent: 100, discountChargesLeft: 1 };
  assertEqual(Model.discountedPrice(199, free), 0, 'הנחה מלאה לא הגיעה לאפס');
  assertEqual(Model.isFullyDiscounted(199, free), true, 'חודש חינם לא זוהה');
  assertEqual(Model.isFullyDiscounted(0, free), false, 'מחיר שלא נקבע נחשב חודש חינם');
  assertEqual(Model.isFullyDiscounted(199, {}), false, 'בלי הנחה');
});

test('התוכנית המתאימה נבחרת לפי מספר העובדים', function () {
  assertEqual(Model.planForEmployees(1).id, 'starter', 'עובד אחד');
  assertEqual(Model.planForEmployees(10).id, 'starter', 'בדיוק 10');
  assertEqual(Model.planForEmployees(11).id, 'growth', '11 – מעבר לתוכנית הבאה');
  assertEqual(Model.planForEmployees(30).id, 'growth', 'בדיוק 30');
  assertEqual(Model.planForEmployees(31).id, 'business', '31 – התוכנית הגדולה');
  assertEqual(Model.planForEmployees(99).id, 'business', 'בדיוק 99');
  assertEqual(Model.planForEmployees(100).id, 'enterprise', '100 – כבר רשת');
  assertEqual(Model.planForEmployees(500).id, 'enterprise', 'הרבה עובדים');
});

test('מגבלת העובדים נאכפת ומוצעת התוכנית הנכונה', function () {
  var starter = { plan: 'starter' };
  assertEqual(Model.withinPlanLimits(starter, { employees: 10 }).ok, true, 'בדיוק במגבלה');
  var over = Model.withinPlanLimits(starter, { employees: 11 });
  assertEqual(over.ok, false, 'חריגה');
  assertEqual(over.suggested.id, 'growth', 'מוצעת התוכנית הבאה');
  assert(over.problems[0].indexOf('399') !== -1, 'ההודעה כוללת את המחיר');
});

test('התוכנית הגדולה נעצרת ב-99 ומפנה לרשתות', function () {
  assertEqual(Model.withinPlanLimits({ plan: 'business' }, { employees: 99 }).ok, true, 'בדיוק 99');
  var over = Model.withinPlanLimits({ plan: 'business' }, { employees: 100 });
  assertEqual(over.ok, false, '100 עובדים בתוכנית הגדולה');
  assertEqual(over.suggested.id, 'enterprise', 'לא הוצעה תוכנית הרשתות');
  assertEqual(over.quote, true, 'לא סומן שזו הצעת מחיר');
  /* ההודעה חייבת להפנות לשיחה ולא להציג מספר. "0₪" כאן הוא
     בדיוק המשפט שגורם ללקוח לחשוב שהוא מקבל את זה בחינם. */
  assert(over.problems[0].indexOf('0') === -1 || over.problems[0].indexOf('0₪') === -1,
    'ההודעה מציגה מחיר אפס');
  assert(over.problems[0].indexOf('100') !== -1, 'ההודעה אינה מזכירה את מספר העובדים');
});

test('תוכנית הרשתות עצמה אינה מוגבלת במספר עובדים', function () {
  assertEqual(Model.withinPlanLimits({ plan: 'enterprise' }, { employees: 999 }).ok, true, 'ללא תקרה');
  assertEqual(Model.employeesLeft({ plan: 'enterprise' }, 999), null, 'אין מכסה שנותרה');
});

test('אין הגבלת סניפים באף תוכנית', function () {
  Model.PLAN_ORDER.forEach(function (id) {
    assert(!('maxBranches' in Model.PLANS[id]), 'תוכנית ' + id + ' אינה מגבילה סניפים');
  });
  assertEqual(Model.withinPlanLimits({ plan: 'starter' }, { employees: 5, branches: 50 }).ok, true,
    'חמישים סניפים בתוכנית הקטנה');
});

test('כמה עובדים אפשר עוד להוסיף', function () {
  assertEqual(Model.employeesLeft({ plan: 'starter' }, 7), 3, 'נותרו שלושה');
  assertEqual(Model.employeesLeft({ plan: 'starter' }, 10), 0, 'המכסה מלאה');
  assertEqual(Model.employeesLeft({ plan: 'growth' }, 12), 18, 'בתוכנית בינוני');
});

test('חברה חדשה נפתחת בתוכנית הקטנה בתקופת ניסיון', function () {
  var company = Model.newTrialCompany('חברה', new Date('2026-09-01'));
  assertEqual(company.plan, 'starter', 'תוכנית ברירת מחדל');
  assertEqual(company.status, Model.SUBSCRIPTION.TRIAL, 'סטטוס ניסיון');
});

test('מנוי שפג ומנוי שבוטל מציגים הסבר נכון', function () {
  var expired = Model.accessState({ status: 'expired', validUntil: '2026-01-01T00:00:00.000Z' },
    new Date('2026-09-20'));
  assertEqual(expired.allowed, false, 'פג – חסום');
  assert(expired.text.indexOf('הנתונים שמורים') !== -1, 'מרגיע שהנתונים לא אבדו');

  var canceled = Model.accessState({ status: 'canceled' }, new Date('2026-09-20'));
  assertEqual(canceled.reason, 'canceled', 'מבוטל');
  assert(canceled.text.indexOf('לחדש') !== -1, 'מציע לחדש');
});

console.log('\n== תקרת בקשות: אכיפה בשרת ==');

/* התקרה נאכפת בשרת ולא רק במסך. עובד שיפתח את כלי הפיתוח יוכל
   אחרת לשלוח בקשה שלישית כשהמנהל התיר שתיים. */

function withLimit(backend, max, countPreferences) {
  return backend.saveConfig({
    settings: { constraintLimit: {
      enabled: true, max: max,
      countPreferences: countPreferences === undefined ? true : countPreferences
    } },
    branches: [], employees: []
  });
}

asyncTest('עובד אינו יכול לעבור את התקרה גם בפנייה ישירה לשרת', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'cap1@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return withLimit(backend, 2); })
    .then(function () {
      return backend.createUser({ email: 'w1@a.com', password: 'secret1',
        role: 'employee', employeeId: 'emp-c1' });
    })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'w1@a.com', password: 'secret1' }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 0, { off: true }); })
    .then(function () {
      return backend.saveOwnConstraint('2026-09-20', 1, { blocked: { morning: true } });
    })
    .then(function (week) {
      assertEqual(Object.keys(week.constraints).length, 2, 'שתי הבקשות הראשונות נשמרו');
      return assertRejects(backend.saveOwnConstraint('2026-09-20', 2, { off: true }),
        'constraint_limit', 'הבקשה השלישית נשמרה');
    });
});

asyncTest('כשהעדפות נספרות – גם הן נחסמות בתקרה מלאה', function () {
  /* זו ברירת המחדל: מנהל שהגביל ל-1 מצפה לראות שורה אחת */
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'cap2@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return withLimit(backend, 1); })
    .then(function () {
      return backend.createUser({ email: 'w2@a.com', password: 'secret1',
        role: 'employee', employeeId: 'emp-c2' });
    })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'w2@a.com', password: 'secret1' }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 0, { off: true }); })
    .then(function () {
      return assertRejects(
        backend.saveOwnConstraint('2026-09-20', 1, { preferred: { morning: true } }),
        'constraint_limit', 'העדפה עברה את התקרה');
    });
});

asyncTest('העדפה ומחיקה אינן נחסמות כשהעדפות אינן נספרות', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'cap2b@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return withLimit(backend, 1, false); })
    .then(function () {
      return backend.createUser({ email: 'w2b@a.com', password: 'secret1',
        role: 'employee', employeeId: 'emp-c2' });
    })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'w2b@a.com', password: 'secret1' }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 0, { off: true }); })
    .then(function () {
      /* העדפה אינה מגבילה זמינות, ולכן אינה נספרת */
      return backend.saveOwnConstraint('2026-09-20', 1, { preferred: { morning: true } });
    })
    .then(function (week) {
      assertEqual(Object.keys(week.constraints).length, 2, 'העדפה נחסמה');
      /* ומחיקה משחררת מקום */
      return backend.saveOwnConstraint('2026-09-20', 0, null);
    })
    .then(function () {
      return backend.saveOwnConstraint('2026-09-20', 3, { off: true });
    })
    .then(function (week) {
      assert(week.constraints['emp-c2|3'], 'אחרי מחיקה לא התפנה מקום');
    });
});

asyncTest('עריכה של בקשה קיימת אינה נספרת פעמיים', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'cap3@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return withLimit(backend, 1); })
    .then(function () {
      return backend.createUser({ email: 'w3@a.com', password: 'secret1',
        role: 'employee', employeeId: 'emp-c3' });
    })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'w3@a.com', password: 'secret1' }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 0, { off: true }); })
    .then(function () {
      /* אותו יום, בקשה אחרת – זה תיקון, לא בקשה נוספת */
      return backend.saveOwnConstraint('2026-09-20', 0, { blocked: { evening: true } });
    })
    .then(function (week) {
      assert(week.constraints['emp-c3|0'].blocked.evening, 'התיקון לא נשמר');
    });
});

asyncTest('מנהל אינו מוגבל בתקרה – הוא מתקן, לא מבקש', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'cap4@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return withLimit(backend, 1); })
    .then(function () {
      /* הבעלים מקושר לכרטיס עובד ושומר שלוש בקשות לעצמו */
      return backend.listUsers();
    })
    .then(function (users) {
      return backend.updateUser(users[0].id, { employeeId: 'emp-boss' });
    })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 0, { off: true }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 1, { off: true }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 2, { off: true }); })
    .then(function (week) {
      assertEqual(Object.keys(week.constraints).length, 3, 'המנהל נחסם');
    });
});

asyncTest('כשהתקרה כבויה אין שום הגבלה', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'cap5@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ email: 'w5@a.com', password: 'secret1',
        role: 'employee', employeeId: 'emp-c5' });
    })
    .then(function () { return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'w5@a.com', password: 'secret1' }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 0, { off: true }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 1, { off: true }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 2, { off: true }); })
    .then(function () { return backend.saveOwnConstraint('2026-09-20', 3, { off: true }); })
    .then(function (week) {
      assertEqual(Object.keys(week.constraints).length, 4, 'נחסם בלי שהוגדרה תקרה');
    });
});

console.log('\n== מצב ההזמנות ==');

test('ארבעת מצבי ההזמנה נגזרים משני תאריכים בלבד', function () {
  var now = new Date('2026-09-20T12:00:00.000Z');
  assertEqual(Model.inviteState({ joinedAt: '2026-09-01' }, now), 'joined', 'הצטרף');
  assertEqual(Model.inviteState({ invitedAt: '2026-09-20T06:00:00.000Z' }, now), 'pending', 'ממתין');
  assertEqual(Model.inviteState({ invitedAt: '2026-09-18T06:00:00.000Z' }, now), 'expired', 'פג');
  assertEqual(Model.inviteState({}, now), 'unknown', 'בלי תאריכים');
  /* מי שכבר נכנס אינו "פג" גם אם ההזמנה ישנה */
  assertEqual(Model.inviteState({ invitedAt: '2026-01-01', joinedAt: '2026-01-02' }, now),
    'joined', 'הצטרפות גוברת על תוקף');
});

test('רק הזמנה שלא נוצלה ניתנת לביטול', function () {
  var now = new Date('2026-09-20T12:00:00.000Z');
  assertEqual(Model.canCancelInvite({ role: 'employee', invitedAt: '2026-09-20T06:00:00.000Z' }, now),
    true, 'ממתין');
  assertEqual(Model.canCancelInvite({ role: 'employee', invitedAt: '2026-01-01' }, now),
    true, 'פג');
  assertEqual(Model.canCancelInvite({ role: 'employee', joinedAt: '2026-09-19' }, now),
    false, 'כבר הצטרף');
  assertEqual(Model.canCancelInvite({ role: 'owner', invitedAt: '2026-09-20T06:00:00.000Z' }, now),
    false, 'בעלים');
});

asyncTest('הזמנה מקבלת תאריך, והכניסה הראשונה מסמנת הצטרפות', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'inv1@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ name: 'דנה', email: 'dana1@a.com', role: 'employee' });
    })
    .then(function (user) {
      assert(user.invitedAt, 'נרשם תאריך הזמנה');
      assertEqual(user.joinedAt, null, 'עוד לא הצטרף');
      assertEqual(Model.inviteState(user), 'pending', 'ממתין');
      backend.followLink('dana1@a.com', 'invite');
      return backend.setPassword('secret2');
    })
    .then(function () { return backend.signOut(); })
    .then(function () {
      return backend.signIn({ email: 'inv1@a.com', password: 'secret1' });
    })
    .then(function () { return backend.listUsers(); })
    .then(function (users) {
      var dana = users.filter(function (u) { return u.email === 'dana1@a.com'; })[0];
      assert(dana.joinedAt, 'הכניסה הראשונה נרשמה');
      assertEqual(Model.inviteState(dana), 'joined', 'הצטרף');
    });
});

asyncTest('שליחה חוזרת מאפסת את שעון התוקף', function () {
  var backend = freshBackend();
  var clock = new Date('2026-09-01T08:00:00.000Z');
  backend.now = function () { return clock; };
  return backend.signUpCompany({ companyName: 'חברה', email: 'inv2@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ name: 'רון', email: 'ron2@a.com', role: 'employee' });
    })
    .then(function (user) {
      clock = new Date('2026-09-05T08:00:00.000Z');
      assertEqual(Model.inviteState(user, clock), 'expired', 'פג אחרי ארבעה ימים');
      return backend.resendInvite(user);
    })
    .then(function (user) {
      assertEqual(Model.inviteState(user, clock), 'pending', 'אחרי שליחה חוזרת – בתוקף שוב');
    });
});

asyncTest('ביטול הזמנה מוחק רק מוזמן שטרם נכנס', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'inv3@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ name: 'נועה', email: 'noa3@a.com', role: 'employee' });
    })
    .then(function (user) { return backend.cancelInvite(user.id); })
    .then(function () { return backend.listUsers(); })
    .then(function (users) {
      assertEqual(users.filter(function (u) { return u.email === 'noa3@a.com'; }).length, 0,
        'המוזמן נמחק');
      /* אותה כתובת פנויה שוב – אחרת ביטול לא היה שווה כלום */
      return backend.createUser({ name: 'נועה', email: 'noa3@a.com', role: 'employee' });
    })
    .then(function (again) {
      backend.followLink('noa3@a.com', 'invite');
      return backend.setPassword('secret2')
        .then(function () { return backend.signOut(); })
        .then(function () { return backend.signIn({ email: 'inv3@a.com', password: 'secret1' }); })
        .then(function () {
          return assertRejects(backend.cancelInvite(again.id), 'forbidden',
            'ביטול של מי שכבר נכנס');
        });
    });
});

asyncTest('אי אפשר לבטל הזמנה של חברה אחרת', function () {
  var backend = freshBackend();
  var target;
  return backend.signUpCompany({ companyName: 'חברה א', email: 'inv4a@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ name: 'מוזמן', email: 'target4@a.com', role: 'employee' });
    })
    .then(function (user) { target = user; return backend.signOut(); })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'inv4b@a.com', password: 'secret1', phone: '054-1234567'});
    })
    .then(function () {
      return assertRejects(backend.cancelInvite(target.id), 'not_found', 'חברה אחרת');
    });
});

asyncTest('עובד אינו יכול לבטל הזמנות', function () {
  var backend = freshBackend();
  var target;
  return backend.signUpCompany({ companyName: 'חברה', email: 'inv5@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.createUser({ name: 'מוזמן', email: 'target5@a.com', role: 'employee' });
    })
    .then(function (user) {
      target = user;
      return backend.createUser({ name: 'עובד', email: 'worker5@a.com', role: 'employee' });
    })
    .then(function () {
      backend.followLink('worker5@a.com', 'invite');
      return backend.setPassword('secret2');
    })
    .then(function () {
      return assertRejects(backend.cancelInvite(target.id), 'forbidden', 'עובד מבטל');
    });
});

console.log('\n== זהות: השם שלי מול שם העסק ==');

asyncTest('כל משתמש משנה את השם של עצמו', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'id1@a.com', password: 'secret1', name: 'שם ישן', phone: '054-1234567'})
    .then(function () { return backend.saveOwnName('שם חדש'); })
    .then(function (user) {
      assertEqual(user.name, 'שם חדש', 'השם לא השתנה');
      assertEqual(backend.session().user.name, 'שם חדש', 'ההתחברות לא התעדכנה');
      /* השם אינו נוגע בתפקיד, ולכן גם לא בהרשאות */
      assertEqual(backend.session().user.role, 'owner', 'התפקיד השתנה');
    });
});

asyncTest('שם ריק נדחה', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'id2@a.com', password: 'secret1', name: 'פז', phone: '054-1234567'})
    .then(function () { return assertRejects(backend.saveOwnName('   '), 'invalid', 'שם ריק'); })
    .then(function () { assertEqual(backend.session().user.name, 'פז', 'השם נמחק'); });
});

/* עובד לא יכול לשנות שם של מישהו אחר: אין ל-saveOwnName מזהה
   משתמש בכלל, והדרך היחידה לשנות אחרים – updateUser – חסומה לו. */
asyncTest('עובד משנה רק את שמו שלו', function () {
  var backend = freshBackend();
  var boss;
  return backend.signUpCompany({ companyName: 'חברה', email: 'id3@a.com', password: 'secret1', name: 'הבעלים', phone: '054-1234567'})
    .then(function () {
      boss = backend.session().user.id;
      return backend.createUser({ name: 'עובד', email: 'id3w@a.com', role: 'employee' });
    })
    .then(function () {
      backend.followLink('id3w@a.com', 'invite');
      return backend.setPassword('secret2');
    })
    .then(function () { return backend.saveOwnName('עובד מתוקן'); })
    .then(function () {
      assertEqual(backend.session().user.name, 'עובד מתוקן', 'השם של העובד לא השתנה');
      assertEqual(backend.db.users[boss].name, 'הבעלים', 'שם הבעלים השתנה');
      return assertRejects(backend.updateUser(boss, { name: 'נחטף' }), 'forbidden', 'עובד משנה אחרים');
    });
});

asyncTest('שם העסק – לבעלים בלבד', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'שם ברשם החברות', email: 'id4@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.renameCompany('השם המסחרי'); })
    .then(function () {
      assertEqual(backend.session().company.name, 'השם המסחרי', 'שם העסק לא השתנה');
      return backend.createUser({ name: 'מנהל', email: 'id4m@a.com', role: 'manager' });
    })
    .then(function () {
      backend.followLink('id4m@a.com', 'invite');
      return backend.setPassword('secret2');
    })
    .then(function () {
      /* מנהל מנהל משתמשים וסידורים – לא את זהות העסק */
      return assertRejects(backend.renameCompany('לא שלי'), 'forbidden', 'מנהל משנה שם עסק');
    })
    .then(function () {
      assertEqual(backend.session().company.name, 'השם המסחרי', 'השם הוחלף בכל זאת');
    });
});

asyncTest('מספר העוסק – לבעלים בלבד, ואינו נשמר כשהמנהל מנסה', function () {
  /* מספר העוסק הולך לחשבונית. מנהל משמרת אינו קובע על שם מי
     היא יוצאת, בדיוק כמו שאינו קובע את שם העסק. */
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'עסק', email: 'tax1@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () { return backend.saveCompanyDetails({ taxId: '51-234 5678' }); })
    .then(function () {
      assertEqual(backend.session().company.taxId, '51-2345678', 'מספר העוסק לא נשמר');
      return backend.createUser({ name: 'מנהל', email: 'tax1m@a.com', role: 'manager' });
    })
    .then(function () {
      backend.followLink('tax1m@a.com', 'invite');
      return backend.setPassword('secret2');
    })
    .then(function () {
      return assertRejects(backend.saveCompanyDetails({ taxId: '999999999' }),
        'forbidden', 'מנהל משנה מספר עוסק');
    })
    .then(function () {
      assertEqual(backend.session().company.taxId, '51-2345678', 'המספר הוחלף בכל זאת');
    });
});

asyncTest('שינוי שם אינו חוצה חברות', function () {
  var backend = freshBackend();
  var firstId;
  return backend.signUpCompany({ companyName: 'חברה א', email: 'id5a@a.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      firstId = backend.session().company.id;
      return backend.signOut();
    })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'id5b@a.com', password: 'secret1', phone: '054-1234567'});
    })
    .then(function () { return backend.renameCompany('ב החדשה'); })
    .then(function () {
      assertEqual(backend.db.companies[firstId].name, 'חברה א', 'שם החברה השנייה נדרס');
    });
});

console.log('\n== מה שעובד רואה ==');

/* מקימים עסק עם שני עובדים, שבוע משובץ, ובקשה עם סיבה אישית של
   כל אחד מהם – ואז נכנסים בתור אחד מהם ובודקים מה הגיע אליו.

   למה זה קריטי: המסך של העובד הראה תמיד רק את המשמרות שלו, אבל
   הנתונים שהגיעו לדפדפן היו השבוע המלא. מי שפותח כלי פיתוח היה
   רואה את הסידור של כולם ואת הסיבות שעמיתיו כתבו. */
function companyWithTwo(options) {
  var backend = freshBackend();
  var ids = {};
  var team = !!(options && options.team);
  return backend.signUpCompany({ companyName: 'עסק', email: 'boss@p.com', password: 'secret1', phone: '054-1234567'})
    .then(function () {
      return backend.saveConfig({
        settings: {
          shifts: [{ id: 'morning', name: 'בוקר' }],
          teamVisibility: { shifts: team }
        },
        branches: [{ id: 'br-1', name: 'מרכז' }],
        employees: [
          { id: 'emp-1', name: 'דנה', email: 'dana@p.com', phone: '050', note: 'הערה על דנה' },
          { id: 'emp-2', name: 'יוסי', email: 'yossi@p.com', phone: '051', note: 'הערה על יוסי' }
        ]
      });
    })
    .then(function () {
      return backend.saveWeek('2026-09-20', {
        assignments: { 'br-1|0|morning': ['emp-1', 'emp-2'], 'br-1|1|morning': ['emp-2'] },
        constraints: {
          'emp-1|3': { off: true, note: 'תור לרופא', status: 'pending' },
          'emp-2|4': { off: true, note: 'חתונה של אחותי', status: 'pending' }
        },
        manual: { 'br-1|0|morning': true },
        note: 'הערה של המנהל'
      });
    })
    .then(function () { return backend.publishWeek('2026-09-20', true); })
    .then(function () {
      return backend.createUser({ email: 'dana@p.com', password: 'secret1',
        role: 'employee', employeeId: 'emp-1' });
    })
    .then(function (user) { ids.dana = user.id; return backend.signOut(); })
    .then(function () { return backend.signIn({ email: 'dana@p.com', password: 'secret1' }); })
    .then(function () { return backend; });
}

asyncTest('עובד רואה את המשמרות שלו בלבד', function () {
  return companyWithTwo().then(function (backend) {
    return backend.loadWeek('2026-09-20').then(function (week) {
      var slots = Object.keys(week.assignments);
      assertEqual(slots.length, 1, 'מספר המשמרות שהגיעו');
      assertEqual(slots[0], 'br-1|0|morning', 'המשמרת שהגיעה');
      assertEqual(week.assignments[slots[0]].join(','), 'emp-1',
        'השיבוץ כולל עובדים נוספים');
      assertEqual(JSON.stringify(week).indexOf('emp-2'), -1,
        'המזהה של עובד אחר הגיע לדפדפן');
    });
  });
});

asyncTest('הסיבות של עמיתים אינן מגיעות לעובד', function () {
  return companyWithTwo().then(function (backend) {
    return backend.loadWeek('2026-09-20').then(function (week) {
      var keys = Object.keys(week.constraints);
      assertEqual(keys.length, 1, 'מספר הבקשות שהגיעו');
      assertEqual(keys[0], 'emp-1|3', 'הבקשה שהגיעה');
      assert(JSON.stringify(week).indexOf('חתונה של אחותי') === -1,
        'סיבה אישית של עמית הגיעה לדפדפן');
      assertEqual(week.constraints['emp-1|3'].note, 'תור לרופא',
        'הסיבה של העובד עצמו נעלמה');
    });
  });
});

asyncTest('הערת המנהל והשיבוץ הידני אינם של העובד', function () {
  return companyWithTwo().then(function (backend) {
    return backend.loadWeek('2026-09-20').then(function (week) {
      assertEqual(week.note, '', 'הערת המנהל הגיעה לעובד');
      assertEqual(Object.keys(week.manual).length, 0, 'סימוני השיבוץ הידני הגיעו');
    });
  });
});

asyncTest('סידור שטרם פורסם אינו מגיע לעובד, והבקשות שלו כן', function () {
  return companyWithTwo().then(function (backend) {
    return backend.signOut()
      .then(function () { return backend.signIn({ email: 'boss@p.com', password: 'secret1' }); })
      .then(function () { return backend.publishWeek('2026-09-20', false); })
      .then(function () { return backend.signOut(); })
      .then(function () { return backend.signIn({ email: 'dana@p.com', password: 'secret1' }); })
      .then(function () { return backend.loadWeek('2026-09-20'); })
      .then(function (week) {
        assertEqual(Object.keys(week.assignments).length, 0,
          'טיוטה שטרם פורסמה הגיעה לעובד');
        assertEqual(Object.keys(week.constraints).length, 1,
          'הבקשות של העובד עצמו נעלמו לפני הפרסום');
      });
  });
});

asyncTest('עובד מקבל את הכרטיס שלו בלבד, בלי המיילים של עמיתיו', function () {
  return companyWithTwo().then(function (backend) {
    return backend.loadConfig().then(function (config) {
      assertEqual(config.employees.length, 1, 'מספר הכרטיסים שהגיעו');
      assertEqual(config.employees[0].id, 'emp-1', 'הכרטיס שהגיע');
      assert(JSON.stringify(config).indexOf('yossi@p.com') === -1,
        'המייל של עמית הגיע לדפדפן');
      assertEqual(config.branches.length, 1, 'הסניפים נדרשים לעובד ונעלמו');
    });
  });
});

asyncTest('שמירת בקשה מחזירה לעובד את הפרוסה שלו בלבד', function () {
  return companyWithTwo().then(function (backend) {
    return backend.signOut()
      .then(function () { return backend.signIn({ email: 'boss@p.com', password: 'secret1' }); })
      .then(function () { return backend.publishWeek('2026-09-20', false); })
      .then(function () { return backend.signOut(); })
      .then(function () { return backend.signIn({ email: 'dana@p.com', password: 'secret1' }); })
      .then(function () {
        return backend.saveOwnConstraint('2026-09-20', 2, { off: true, note: 'משפחה' });
      })
      .then(function (week) {
        assert(JSON.stringify(week).indexOf('חתונה של אחותי') === -1,
          'התשובה על שמירת בקשה כללה סיבה של עמית');
        assertEqual(Object.keys(week.constraints).length, 2, 'הבקשות של העובד עצמו');
      });
  });
});

asyncTest('המנהל ממשיך לראות הכל', function () {
  return companyWithTwo().then(function (backend) {
    return backend.signOut()
      .then(function () { return backend.signIn({ email: 'boss@p.com', password: 'secret1' }); })
      .then(function () { return backend.loadWeek('2026-09-20'); })
      .then(function (week) {
        assertEqual(Object.keys(week.assignments).length, 2, 'המנהל איבד משמרות');
        assertEqual(Object.keys(week.constraints).length, 2, 'המנהל איבד בקשות');
        assertEqual(week.note, 'הערה של המנהל', 'הערת המנהל נמחקה');
      })
      .then(function () { return backend.loadConfig(); })
      .then(function (config) {
        assertEqual(config.employees.length, 2, 'המנהל איבד כרטיסי עובדים');
      });
  });
});

console.log('\n== כשהמנהל פותח את הסידור לכל הצוות ==');

/* ההגדרה הזו מרחיבה את מה שעובר לעובד, ולכן היא נבדקת בשרת ולא
   רק במסך: מסך שאינו מציג נתון שהגיע לדפדפן אינו הגנה. ומה
   שהיא מרחיבה הוא בדיוק דבר אחד – מי עובד מתי. */

asyncTest('השיבוצים של כל הצוות מגיעים לעובד', function () {
  return companyWithTwo({ team: true }).then(function (backend) {
    return backend.loadWeek('2026-09-20').then(function (week) {
      assertEqual(Object.keys(week.assignments).length, 2, 'מספר המשמרות שהגיעו');
      assertEqual((week.assignments['br-1|0|morning'] || []).join(','), 'emp-1,emp-2',
        'המשמרת המשותפת הגיעה חסרה');
      assertEqual((week.assignments['br-1|1|morning'] || []).join(','), 'emp-2',
        'משמרת שאין בה העובד עצמו לא הגיעה');
    });
  });
});

asyncTest('ועמיתיו מגיעים כשם ומזהה, ולא ככרטיס', function () {
  return companyWithTwo({ team: true }).then(function (backend) {
    return backend.loadConfig().then(function (config) {
      assertEqual(config.employees.length, 2, 'מספר הכרטיסים שהגיעו');
      var other = config.employees.filter(function (emp) { return emp.id === 'emp-2'; })[0];
      assert(other, 'העמית לא הגיע כלל');
      assertEqual(other.name, 'יוסי', 'השם של העמית לא הגיע');
      assertEqual(Object.keys(other).sort().join(','), 'active,id,name',
        'מהעמית עבר יותר מאשר מזהה, שם ופעילות');
      /* וזו הבדיקה שבאמת חשובה */
      assert(JSON.stringify(config).indexOf('yossi@p.com') === -1,
        'המייל של העמית הגיע לדפדפן');
      assert(JSON.stringify(config).indexOf('051') === -1,
        'הטלפון של העמית הגיע לדפדפן');
      assert(JSON.stringify(config).indexOf('הערה על יוסי') === -1,
        'ההערה שהמנהל כתב על העמית הגיעה לדפדפן');
      /* והכרטיס של העובד עצמו לא נפגע */
      var mine = config.employees.filter(function (emp) { return emp.id === 'emp-1'; })[0];
      assertEqual(mine.email, 'dana@p.com', 'העובד איבד את הכרטיס של עצמו');
    });
  });
});

asyncTest('וגם אז – הבקשות והסיבות של עמיתיו נשארות מחוץ לתמונה', function () {
  return companyWithTwo({ team: true }).then(function (backend) {
    return backend.loadWeek('2026-09-20').then(function (week) {
      assertEqual(Object.keys(week.constraints).length, 1, 'מספר הבקשות שהגיעו');
      assertEqual(Object.keys(week.constraints)[0], 'emp-1|3', 'הבקשה שהגיעה');
      assert(JSON.stringify(week).indexOf('חתונה של אחותי') === -1,
        'סיבה אישית של עמית הגיעה לדפדפן');
      assertEqual(week.note, '', 'הערת המנהל הגיעה לעובד');
      assertEqual(Object.keys(week.manual).length, 0, 'סימוני השיבוץ הידני הגיעו');
    });
  });
});

asyncTest('סידור שטרם פורסם נשאר סגור גם כשההגדרה דלוקה', function () {
  return companyWithTwo({ team: true }).then(function (backend) {
    return backend.signOut()
      .then(function () { return backend.signIn({ email: 'boss@p.com', password: 'secret1' }); })
      .then(function () { return backend.publishWeek('2026-09-20', false); })
      .then(function () { return backend.signOut(); })
      .then(function () { return backend.signIn({ email: 'dana@p.com', password: 'secret1' }); })
      .then(function () { return backend.loadWeek('2026-09-20'); })
      .then(function (week) {
        assertEqual(Object.keys(week.assignments).length, 0,
          'טיוטה שטרם פורסמה הגיעה לעובד');
      });
  });
});

queue.then(function () {
  console.log('\n' + (failed === 0 ? '✅ ' : '❌ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
  process.exit(failed === 0 ? 0 : 1);
});
