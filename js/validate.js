/* בדיקות תקינות לסידור: כפל משמרת, חוסרים, הפרות אילוצים ומכסות */
(function (root) {
  'use strict';

  var Data = root.ShiftData || (typeof require === 'function' ? require('./data.js') : null);
  var Store = root.ShiftStore || (typeof require === 'function' ? require('./store.js') : null);
  var Scheduler = root.ShiftScheduler || (typeof require === 'function' ? require('./scheduler.js') : null);

  function empName(state, id) {
    var emp = Store.byId(state.employees, id);
    return emp ? emp.name : '(עובד שנמחק: ' + id + ')';
  }
  function branchName(state, id) {
    var branch = Store.byId(state.branches, id);
    return branch ? branch.name : '(סניף שנמחק)';
  }
  /* שם המשמרת נקרא מהגדרות העסק, ולא מרשימה קבועה */
  var activeState = null;
  function shiftName(id) {
    return activeState ? Store.shiftName(activeState, id) : id;
  }
  function dayName(dayIdx) { return Data.DAYS[dayIdx].name; }

  function nameList(names, limit) {
    var max = limit || 3;
    if (names.length <= max) return names.join(', ');
    return names.slice(0, max).join(', ') + ' ועוד ' + (names.length - max);
  }

  /* למה המשמרת הזו לא אוישה? מפרט את הסיבה לכל עובד רלוונטי. */
  function explainShortage(state, week, demand) {
    var eligible = [], busy = [], atMax = [], resting = [], free = [];

    state.employees.forEach(function (emp) {
      if (!emp.active) return;
      if (emp.shifts.indexOf(demand.shiftId) === -1) return;
      if (!Scheduler.employeeAllowedInBranch(emp, demand.branchId)) return;
      var constraint = Store.getConstraint(week, emp.id, demand.dayIdx);
      if (constraint.off || (constraint.blocked && constraint.blocked[demand.shiftId])) return;
      eligible.push(emp);

      if (Store.employeeDayAssignments(state, week, emp.id, demand.dayIdx).length) { busy.push(emp.name); return; }
      if (Store.employeeWeekCount(state, week, emp.id) >= (emp.maxShifts || 99)) { atMax.push(emp.name); return; }
      if (state.settings.restEveningMorning) {
        var before = demand.dayIdx > 0 && demand.shiftId === 'morning' &&
          Store.employeeDayAssignments(state, week, emp.id, demand.dayIdx - 1)
            .some(function (s) { return s.shiftId === 'evening'; });
        var after = demand.dayIdx < 6 && demand.shiftId === 'evening' &&
          Store.employeeDayAssignments(state, week, emp.id, demand.dayIdx + 1)
            .some(function (s) { return s.shiftId === 'morning'; });
        if (before || after) { resting.push(emp.name); return; }
      }
      free.push(emp.name);
    });

    if (!eligible.length) {
      return 'אין עובד שמוגדר גם לסניף הזה וגם למשמרת הזו, או שכולם חסמו את המשמרת.';
    }
    if (free.length) {
      return 'יש עובדים פנויים (' + nameList(free) + ') – נסו לבנות את הסידור מחדש.';
    }

    var reasons = [];
    if (busy.length) reasons.push(nameList(busy) + ' כבר משובצים במשמרת אחרת באותו יום');
    if (atMax.length) reasons.push(nameList(atMax) + ' הגיעו למכסת המשמרות השבועית');
    if (resting.length) reasons.push(nameList(resting) + ' חייבים מנוחה בין ערב לבוקר');

    var text = 'הסיבה: ' + reasons.join('; ') + '.';
    if (busy.length && !atMax.length) {
      text += ' אפשר לאפשר שתי משמרות ביום באותו עובד בלשונית ההגדרות.';
    } else if (atMax.length) {
      text += ' אפשר להעלות את מכסת המשמרות בכרטיס העובד.';
    }
    return text;
  }

  function issue(level, type, text, ref) {
    return { level: level, type: type, text: text, ref: ref || {} };
  }

  function validate(state, week) {
    activeState = state;
    var issues = [];
    var demands = Store.weekDemands(state, week);
    var demandMap = {};
    demands.forEach(function (d) { demandMap[Store.slotKey(d.dayIdx, d.branchId, d.shiftId)] = d; });

    // 1. בדיקות ברמת הסלוט: חוסר, עודף (כפל משמרת בסניף) ועובד כפול באותו סלוט
    Object.keys(demandMap).forEach(function (key) {
      var demand = demandMap[key];
      var assigned = Store.getAssigned(week, demand.dayIdx, demand.branchId, demand.shiftId);
      var label = dayName(demand.dayIdx) + ' · ' + branchName(state, demand.branchId) + ' · משמרת ' + shiftName(demand.shiftId);

      if (assigned.length < demand.need) {
        issues.push(issue('warning', 'understaffed',
          'חוסר באיוש: ' + label + ' – משובצים ' + assigned.length + ' מתוך ' + demand.need + '. ' +
          explainShortage(state, week, demand),
          { dayIdx: demand.dayIdx, branchId: demand.branchId, shiftId: demand.shiftId }));
      }

      if (assigned.length > demand.need) {
        issues.push(issue('warning', 'duplicate-shift',
          'כפל משמרת: ' + label + ' – משובצים ' + assigned.length + ' עובדים (' +
          assigned.map(function (id) { return empName(state, id); }).join(', ') +
          ') במקום ' + demand.need + '.',
          { dayIdx: demand.dayIdx, branchId: demand.branchId, shiftId: demand.shiftId }));
      }

      var seen = {};
      assigned.forEach(function (id) {
        if (seen[id]) {
          issues.push(issue('error', 'duplicate-employee-slot',
            'כפל משמרת: ' + empName(state, id) + ' משובץ/ת פעמיים באותה משמרת – ' + label + '.',
            { dayIdx: demand.dayIdx, branchId: demand.branchId, shiftId: demand.shiftId, empId: id }));
        }
        seen[id] = true;
      });
    });

    // 1א1. בקשות אילוץ שממתינות להחלטת מנהל
    var pending = Store.pendingConstraints(week);
    if (pending.length) {
      var names = pending.map(function (item) {
        return empName(state, item.empId) + ' (' + dayName(item.dayIdx) + ')';
      });
      issues.push(issue('warning', 'pending-constraints',
        pending.length === 1
          ? 'בקשת אילוץ ממתינה לאישור: ' + names[0] + '. עד לאישור היא אינה משפיעה על השיבוץ.'
          : pending.length + ' בקשות אילוץ ממתינות לאישור: ' + nameList(names, 4) +
            '. עד לאישור הן אינן משפיעות על השיבוץ.',
        {}));
    }

    // 1א2. שיבוץ ביום חג
    for (var holidayDay = 0; holidayDay < 7; holidayDay++) {
      if (!Store.isHoliday(week, holidayDay)) continue;
      var onHoliday = [];
      state.employees.forEach(function (emp) {
        if (Store.employeeDayAssignments(state, week, emp.id, holidayDay).length) onHoliday.push(emp.name);
      });
      if (onHoliday.length) {
        issues.push(issue('warning', 'holiday-assignment',
          'שיבוץ ביום חג: ' + dayName(holidayDay) + ' (' + Store.holidayName(week, holidayDay) +
          ') מוגדר כיום סגור, אך משובצים בו ' + nameList(onHoliday, 5) + '.',
          { dayIdx: holidayDay }));
      }
    }

    // 1ב. מוצ״ש ללא שעת צאת שבת – לא ניתן לחשב מתי המשמרת מתחילה
    var missingShabbat = state.branches.filter(function (branch) {
      return branch.active && Store.slotConfig(branch, Data.MOTZASH.dayIdx, 'evening') &&
        Store.slotConfig(branch, Data.MOTZASH.dayIdx, 'evening').auto === 'motzash';
    });
    if (missingShabbat.length && !week.shabbatEnd) {
      issues.push(issue('warning', 'missing-shabbat-end',
        'לא הוזנה שעת צאת שבת לשבוע זה – שעת ההתחלה של משמרות מוצ״ש אינה מחושבת.',
        { dayIdx: Data.MOTZASH.dayIdx }));
    }

    // 1ג. שיבוץ בסניף/משמרת שאינם פעילים באותו יום
    Object.keys(week.assignments).forEach(function (key) {
      if (demandMap[key]) return;
      var list = week.assignments[key] || [];
      if (!list.length) return;
      var parts = key.split('|');
      issues.push(issue('warning', 'inactive-slot',
        'שיבוץ במשמרת שאינה פעילה: ' + dayName(Number(parts[0])) + ' · ' + branchName(state, parts[1]) +
        ' · ' + shiftName(parts[2]) + ' (' + list.map(function (id) { return empName(state, id); }).join(', ') + ').',
        { dayIdx: Number(parts[0]), branchId: parts[1], shiftId: parts[2] }));
    });

    // 2. בדיקות ברמת העובד
    state.employees.forEach(function (emp) {
      var total = 0;
      var eveningDays = {};

      for (var day = 0; day < 7; day++) {
        var slots = Store.employeeDayAssignments(state, week, emp.id, day);
        total += slots.length;
        var constraint = Store.getConstraint(week, emp.id, day);

        // כפל משמרת לעובד באותו יום
        if (slots.length > 1) {
          var desc = slots.map(function (s) {
            return branchName(state, s.branchId) + ' / ' + shiftName(s.shiftId);
          }).join(' + ');
          var sameBranch = slots.every(function (s) { return s.branchId === slots[0].branchId; });
          issues.push(issue(state.settings.onePerDay ? 'error' : 'info', 'double-booked',
            'כפל משמרת לעובד: ' + emp.name + ' משובץ/ת ל-' + slots.length + ' משמרות ביום ' + dayName(day) +
            (sameBranch ? ' באותו סניף' : ' בסניפים שונים') + ' (' + desc + ').',
            { dayIdx: day, empId: emp.id }));
        }

        slots.forEach(function (s) {
          if (constraint.off) {
            issues.push(issue('error', 'constraint-off',
              'הפרת אילוץ: ' + emp.name + ' ביקש/ה יום חופש ב' + dayName(day) +
              ' אך משובץ/ת ל' + shiftName(s.shiftId) + ' ב' + branchName(state, s.branchId) + '.',
              { dayIdx: day, empId: emp.id, branchId: s.branchId, shiftId: s.shiftId }));
          } else if (constraint.blocked && constraint.blocked[s.shiftId]) {
            issues.push(issue('error', 'constraint-blocked',
              'הפרת אילוץ: ' + emp.name + ' חסם/ה משמרת ' + shiftName(s.shiftId) + ' ב' + dayName(day) +
              ' אך משובץ/ת אליה ב' + branchName(state, s.branchId) + '.',
              { dayIdx: day, empId: emp.id, branchId: s.branchId, shiftId: s.shiftId }));
          }
          if (!Scheduler.employeeAllowedInBranch(emp, s.branchId)) {
            issues.push(issue('warning', 'branch-mismatch',
              emp.name + ' משובץ/ת ב' + branchName(state, s.branchId) + ' (' + dayName(day) +
              ') למרות שהסניף אינו מוגדר בכרטיס העובד.',
              { dayIdx: day, empId: emp.id, branchId: s.branchId, shiftId: s.shiftId }));
          }
          if (emp.shifts.indexOf(s.shiftId) === -1) {
            issues.push(issue('warning', 'shift-mismatch',
              emp.name + ' משובץ/ת למשמרת ' + shiftName(s.shiftId) + ' ב' + dayName(day) +
              ' למרות שסוג משמרת זה אינו מוגדר בכרטיס העובד.',
              { dayIdx: day, empId: emp.id, branchId: s.branchId, shiftId: s.shiftId }));
          }
          if (s.shiftId === 'evening') eveningDays[day] = true;
        });

        // מנוחה בין ערב לבוקר
        if (state.settings.restEveningMorning && day > 0 && eveningDays[day - 1]) {
          var morning = slots.some(function (s) { return s.shiftId === 'morning'; });
          if (morning) {
            issues.push(issue('warning', 'rest',
              'מנוחה קצרה: ' + emp.name + ' סיים/ה ערב ב' + dayName(day - 1) +
              ' ומשובץ/ת לבוקר ב' + dayName(day) + '.',
              { dayIdx: day, empId: emp.id }));
          }
        }
      }

      // מדיניות: יום החופש שסומן באילוצים הוא יום החופש היחיד בשבוע
      if (emp.active && state.settings.oneDayOffPerWeek) {
        var daysOff = Store.requestedDaysOff(week, emp.id);
        if (daysOff.length > 1) {
          issues.push(issue('warning', 'extra-days-off',
            emp.name + ' סימן/ה ' + daysOff.length + ' ימי חופש (' +
            daysOff.map(dayName).join(', ') + ') – לפי ההגדרות מגיע יום חופש אחד בשבוע.',
            { empId: emp.id }));
        }

        var workable = Store.workableDays(state, week, emp).length;
        var expected = Math.min(emp.maxShifts || 99, workable);
        if (daysOff.length === 1 && total < expected && total > 0) {
          issues.push(issue('info', 'below-target',
            emp.name + ' ביקש/ה יום חופש ב' + dayName(daysOff[0]) + ' ומשובץ/ת ' + total +
            ' משמרות מתוך ' + expected + ' אפשריות – יש לו/ה עוד ימים פנויים.',
            { empId: emp.id }));
        }
      }

      if (emp.active && total > (emp.maxShifts || 99)) {
        issues.push(issue('warning', 'over-max',
          'חריגה ממכסה: ' + emp.name + ' משובץ/ת ל-' + total + ' משמרות (מקסימום ' + emp.maxShifts + ').',
          { empId: emp.id }));
      }
      if (emp.active && total === 0 && Store.weekDemands(state, week).length) {
        issues.push(issue('info', 'no-shifts', emp.name + ' לא משובץ/ת השבוע כלל.', { empId: emp.id }));
      }
    });

    /* סדר התצוגה: קודם חומרה, ובתוך אותה חומרה – קודם מה שדורש פעולה
       מיידית מהמנהל, ורק אחר כך דיווחי מצב כמו חוסר באיוש. */
    var order = { error: 0, warning: 1, info: 2 };
    var typePriority = {
      'pending-constraints': 0,
      'holiday-assignment': 1,
      'missing-shabbat-end': 1,
      'duplicate-shift': 2,
      'over-max': 3
    };
    function priorityOf(item) {
      return typePriority[item.type] === undefined ? 5 : typePriority[item.type];
    }
    issues.sort(function (a, b) {
      return (order[a.level] - order[b.level]) || (priorityOf(a) - priorityOf(b));
    });

    return {
      issues: issues,
      errors: issues.filter(function (i) { return i.level === 'error'; }).length,
      warnings: issues.filter(function (i) { return i.level === 'warning'; }).length,
      infos: issues.filter(function (i) { return i.level === 'info'; }).length
    };
  }

  var API = { validate: validate };
  root.ShiftValidate = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
