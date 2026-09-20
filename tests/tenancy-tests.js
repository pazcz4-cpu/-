/* בדיקות בידוד בין חברות והרשאות לפי תפקיד.
   אלה הבדיקות הקריטיות של המוצר: דליפה בין חברות היא כשל חמור.
   הרצה: node tests/tenancy-tests.js */
'use strict';

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
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a@a.com', password: 'secret1' })
    .then(function () { return backend.saveConfig({ secret: 'נתוני חברה א' }); })
    .then(function () { return backend.signOut(); })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'b@b.com', password: 'secret1' });
    })
    .then(function () { return backend.loadConfig(); })
    .then(function (config) {
      assertEqual(config, null, 'חברה ב קיבלה נתונים של חברה א');
    });
});

asyncTest('שבועות של חברה אחת אינם נגישים לחברה אחרת', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a2@a.com', password: 'secret1' })
    .then(function () { return backend.saveWeek('2026-09-20', { assignments: { x: ['emp-1'] } }); })
    .then(function () { return backend.signOut(); })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'b2@b.com', password: 'secret1' });
    })
    .then(function () { return backend.loadWeek('2026-09-20'); })
    .then(function (week) { assertEqual(week, null, 'דלף שבוע בין חברות'); })
    .then(function () { return backend.listWeeks(); })
    .then(function (keys) { assertEqual(keys.length, 0, 'רשימת השבועות דלפה'); });
});

asyncTest('רשימת המשתמשים מוגבלת לחברה של המשתמש', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a3@a.com', password: 'secret1' })
    .then(function () { return backend.createUser({ email: 'worker@a.com', password: 'secret1', role: 'employee' }); })
    .then(function () { return backend.signOut(); })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'b3@b.com', password: 'secret1' });
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
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a4@a.com', password: 'secret1' })
    .then(function () { return backend.createUser({ email: 'worker4@a.com', password: 'secret1', role: 'employee' }); })
    .then(function (user) { foreignUserId = user.id; return backend.signOut(); })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'b4@b.com', password: 'secret1' });
    })
    .then(function () {
      return assertRejects(backend.updateUser(foreignUserId, { active: false }), 'not_found',
        'חברה ב הצליחה לערוך משתמש של חברה א');
    });
});

asyncTest('עדכון חי אינו מגיע לחברה אחרת', function () {
  var backend = freshBackend();
  var otherCompanyEvents = 0;
  return backend.signUpCompany({ companyName: 'חברה א', email: 'a5@a.com', password: 'secret1' })
    .then(function () { return backend.signOut(); })
    .then(function () {
      return backend.signUpCompany({ companyName: 'חברה ב', email: 'b5@b.com', password: 'secret1' });
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

console.log('\n== אכיפת הרשאות בשרת ==');

asyncTest('עובד אינו יכול לשמור סידור', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner6@a.com', password: 'secret1' })
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
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner7@a.com', password: 'secret1' })
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
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner8@a.com', password: 'secret1' })
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
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner9@a.com', password: 'secret1' })
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
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner10@a.com', password: 'secret1' })
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
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner11@a.com', password: 'secret1' })
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
  return backend.signUpCompany({ companyName: 'חברה', email: 'own20@a.com', password: 'secret1' })
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
  return backend.signUpCompany({ companyName: 'חברה', email: 'own21@a.com', password: 'secret1' })
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
  return backend.signUpCompany({ companyName: 'חברה', email: 'own22@a.com', password: 'secret1' })
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
  return backend.signUpCompany({ companyName: 'חברה', email: 'own23@a.com', password: 'secret1' })
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
  return backend.signUpCompany({ companyName: 'חברה', email: 'own24@a.com', password: 'secret1' })
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
  return backend.signUpCompany({ companyName: 'חברה', email: 'own25@a.com', password: 'secret1' })
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
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner12@a.com', password: 'secret1' })
    .then(function () { return backend.signOut(); })
    .then(function () {
      return assertRejects(backend.signIn({ email: 'owner12@a.com', password: 'wrong' }), 'bad_credentials');
    });
});

asyncTest('אימייל כפול נדחה', function () {
  var backend = freshBackend();
  return backend.signUpCompany({ companyName: 'חברה א', email: 'dup@a.com', password: 'secret1' })
    .then(function () { return backend.signOut(); })
    .then(function () {
      return assertRejects(
        backend.signUpCompany({ companyName: 'חברה ב', email: 'DUP@a.com', password: 'secret1' }),
        'email_taken', 'אימייל כפול (גם באותיות גדולות) התקבל');
    });
});

asyncTest('סיסמה קצרה נדחית', function () {
  var backend = freshBackend();
  return assertRejects(
    backend.signUpCompany({ companyName: 'חברה', email: 'short@a.com', password: '123' }),
    'weak_password');
});

asyncTest('משתמש שהושבת אינו יכול להתחבר', function () {
  var backend = freshBackend();
  var userId;
  return backend.signUpCompany({ companyName: 'חברה', email: 'owner13@a.com', password: 'secret1' })
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
  var company = { status: Model.SUBSCRIPTION.PAST_DUE, validUntil: '2026-09-20T00:00:00.000Z', plan: 'basic' };
  var during = Model.accessState(company, new Date('2026-09-18'));
  assertEqual(during.allowed, true, 'בתוך ימי החסד');
  assert(during.text.indexOf('תיחסם') !== -1, 'מוצגת אזהרה');
  assertEqual(Model.accessState(company, new Date('2026-09-25')).allowed, false, 'אחרי ימי החסד');
});

test('מנוי מבוטל חוסם גישה', function () {
  var company = { status: Model.SUBSCRIPTION.CANCELED, validUntil: '2027-01-01T00:00:00.000Z' };
  assertEqual(Model.accessState(company, new Date('2026-09-18')).allowed, false, 'מבוטל');
});

console.log('\n== תוכניות ותמחור ==');

test('שלוש התוכניות במחירים ובטווחים שנקבעו', function () {
  assertEqual(Model.PLANS.starter.priceMonthly, 199, 'תוכנית קטן');
  assertEqual(Model.PLANS.starter.maxEmployees, 10, 'עד 10 עובדים');
  assertEqual(Model.PLANS.growth.priceMonthly, 399, 'תוכנית בינוני');
  assertEqual(Model.PLANS.growth.maxEmployees, 30, 'עד 30 עובדים');
  assertEqual(Model.PLANS.business.priceMonthly, 599, 'תוכנית גדול');
  assertEqual(Model.PLANS.business.maxEmployees, 0, '31 ומעלה – ללא תקרה');
});

test('התוכנית המתאימה נבחרת לפי מספר העובדים', function () {
  assertEqual(Model.planForEmployees(1).id, 'starter', 'עובד אחד');
  assertEqual(Model.planForEmployees(10).id, 'starter', 'בדיוק 10');
  assertEqual(Model.planForEmployees(11).id, 'growth', '11 – מעבר לתוכנית הבאה');
  assertEqual(Model.planForEmployees(30).id, 'growth', 'בדיוק 30');
  assertEqual(Model.planForEmployees(31).id, 'business', '31 – התוכנית הגדולה');
  assertEqual(Model.planForEmployees(500).id, 'business', 'הרבה עובדים');
});

test('מגבלת העובדים נאכפת ומוצעת התוכנית הנכונה', function () {
  var starter = { plan: 'starter' };
  assertEqual(Model.withinPlanLimits(starter, { employees: 10 }).ok, true, 'בדיוק במגבלה');
  var over = Model.withinPlanLimits(starter, { employees: 11 });
  assertEqual(over.ok, false, 'חריגה');
  assertEqual(over.suggested.id, 'growth', 'מוצעת התוכנית הבאה');
  assert(over.problems[0].indexOf('399') !== -1, 'ההודעה כוללת את המחיר');
});

test('התוכנית הגדולה אינה מוגבלת במספר עובדים', function () {
  assertEqual(Model.withinPlanLimits({ plan: 'business' }, { employees: 999 }).ok, true, 'ללא תקרה');
  assertEqual(Model.employeesLeft({ plan: 'business' }, 999), null, 'אין מכסה שנותרה');
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

queue.then(function () {
  console.log('\n' + (failed === 0 ? '✅ ' : '❌ ') + passed + ' בדיקות עברו, ' + failed + ' נכשלו\n');
  process.exit(failed === 0 ? 0 : 1);
});
