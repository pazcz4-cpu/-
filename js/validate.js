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
  function shiftName(id) {
    var shift = Data.shiftById(id);
    return shift ? shift.name : id;
  }
  function dayName(dayIdx) { return Data.DAYS[dayIdx].name; }

  function issue(level, type, text, ref) {
    return { level: level, type: type, text: text, ref: ref || {} };
  }

  function validate(state, week) {
    var issues = [];
    var demands = Store.weekDemands(state);
    var demandMap = {};
    demands.forEach(function (d) { demandMap[Store.slotKey(d.dayIdx, d.branchId, d.shiftId)] = d; });

    // 1. בדיקות ברמת הסלוט: חוסר, עודף (כפל משמרת בסניף) ועובד כפול באותו סלוט
    Object.keys(demandMap).forEach(function (key) {
      var demand = demandMap[key];
      var assigned = Store.getAssigned(week, demand.dayIdx, demand.branchId, demand.shiftId);
      var label = dayName(demand.dayIdx) + ' · ' + branchName(state, demand.branchId) + ' · משמרת ' + shiftName(demand.shiftId);

      if (assigned.length < demand.need) {
        issues.push(issue('warning', 'understaffed',
          'חוסר באיוש: ' + label + ' – משובצים ' + assigned.length + ' מתוך ' + demand.need + '.',
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

    // 1ב. שיבוץ בסניף/משמרת שאינם פעילים באותו יום
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

      if (emp.active && total > (emp.maxShifts || 99)) {
        issues.push(issue('warning', 'over-max',
          'חריגה ממכסה: ' + emp.name + ' משובץ/ת ל-' + total + ' משמרות (מקסימום ' + emp.maxShifts + ').',
          { empId: emp.id }));
      }
      if (emp.active && total === 0) {
        issues.push(issue('info', 'no-shifts', emp.name + ' לא משובץ/ת השבוע כלל.', { empId: emp.id }));
      }
    });

    var order = { error: 0, warning: 1, info: 2 };
    issues.sort(function (a, b) { return order[a.level] - order[b.level]; });

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
