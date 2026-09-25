/* בדיקות תקינות לסידור: כפל משמרת, חוסרים, הפרות אילוצים ומכסות.
   כל הטקסטים מגיעים משכבת התרגום (I18n) כדי שההתראות יוצגו בשפת המשתמש. */
(function (root) {
  'use strict';

  var Data = root.ShiftData || (typeof require === 'function' ? require('./data.js') : null);
  var Store = root.ShiftStore || (typeof require === 'function' ? require('./store.js') : null);
  var Scheduler = root.ShiftScheduler || (typeof require === 'function' ? require('./scheduler.js') : null);
  var I18n = root.I18n || (typeof require === 'function' ? require('./i18n/core.js') : null);

  function t(key, params) {
    var i18n = I18n || root.I18n;
    if (!i18n) return key;
    try { return i18n.t(key, params); } catch (err) { return key; }
  }

  function empName(state, id) {
    var emp = Store.byId(state.employees, id);
    return emp ? emp.name : t('alerts.deletedEmployee', { id: id });
  }
  function branchName(state, id) {
    var branch = Store.byId(state.branches, id);
    return branch ? branch.name : t('alerts.deletedBranch');
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
    return names.slice(0, max).join(', ') + ' ' + t('common.more', { count: names.length - max });
  }

  function slotLabel(state, dayIdx, branchId, shiftId) {
    var label = t('alerts.slotLabel', {
      day: dayName(dayIdx),
      branch: branchName(state, branchId),
      shift: shiftName(shiftId)
    });
    return label;
  }

  /* "חסר אדם" ו"חסר מטבח" הן שתי בעיות שונות, ורק השנייה אומרת
     למנהל את מי להתקשר. missing הוא רשימת המקומות שנותרו, וכל
     מקום הוא תפקיד; מקום פתוח אינו מוסיף כלום לשם. */
  function missingRolesLabel(state, missing) {
    var names = [];
    (missing || []).forEach(function (roleId) {
      if (!roleId) return;
      var name = Store.roleName(state, roleId);
      if (name && names.indexOf(name) === -1) names.push(name);
    });
    return names.length ? ' · ' + names.join(', ') : '';
  }

  /* למה המשמרת הזו לא אוישה? מפרט את הסיבה לכל עובד רלוונטי. */
  function explainShortage(state, week, demand) {
    var eligible = [], busy = [], atMax = [], resting = [], free = [];

    /* כמה נפסלו על התפקיד בלבד. זו סיבה אחרת לגמרי מ"כולם
       עסוקים", והיא היחידה שהפתרון שלה הוא לסמן עוד עובד. */
    var wrongRole = 0;

    state.employees.forEach(function (emp) {
      if (!emp.active) return;
      if (emp.shifts.indexOf(demand.shiftId) === -1) return;
      if (!Scheduler.employeeAllowedInBranch(emp, demand.branchId)) return;
      if (!Store.employeeFitsRole(state, emp, demand.role)) { wrongRole++; return; }
      var constraint = Store.effectiveConstraint(state, week, emp.id, demand.dayIdx);
      if (constraint.off || (constraint.blocked && constraint.blocked[demand.shiftId])) return;
      eligible.push(emp);

      if (Store.employeeDayAssignments(state, week, emp.id, demand.dayIdx).length) { busy.push(emp.name); return; }
      if (Store.employeeWeekCount(state, week, emp.id) >= (emp.maxShifts || 99)) { atMax.push(emp.name); return; }
      /* מנוחה בין משמרות, לפי הפער בשעות ולשני הכיוונים */
      if (Store.restRule(state).enabled) {
        var tooClose = false;
        for (var near = demand.dayIdx - 1; near <= demand.dayIdx + 1; near++) {
          if (near < 0 || near > 6 || near === demand.dayIdx) continue;
          Store.employeeDayAssignments(state, week, emp.id, near).forEach(function (s) {
            if (Store.breaksRest(state, week,
              { dayIdx: near, branchId: s.branchId, shiftId: s.shiftId },
              { dayIdx: demand.dayIdx, branchId: demand.branchId, shiftId: demand.shiftId })) {
              tooClose = true;
            }
          });
        }
        if (tooClose) { resting.push(emp.name); return; }
      }
      free.push(emp.name);
    });

    if (!eligible.length) {
      /* ההבדל חשוב: "אין אף אחד פנוי" שולח את המנהל לחפש בעיה
         בזמינות, ואילו כאן הבעיה היא שאיש אינו מסומן בתפקיד. */
      if (demand.role && wrongRole) {
        return t('alerts.reasonNoRole', {
          role: Store.roleName(state, demand.role), count: wrongRole
        });
      }
      return t('alerts.reasonNone');
    }
    if (free.length) return t('alerts.reasonFree', { names: nameList(free) });

    var reasons = [];
    if (busy.length) reasons.push(t('alerts.reasonBusy', { names: nameList(busy) }));
    if (atMax.length) reasons.push(t('alerts.reasonMaxed', { names: nameList(atMax) }));
    if (resting.length) reasons.push(t('alerts.reasonResting', { names: nameList(resting) }));

    var text = t('alerts.reasonPrefix') + reasons.join('; ') + '.';
    if (busy.length && !atMax.length) {
      text += t('alerts.suggestTwoPerDay');
    } else if (atMax.length) {
      text += t('alerts.suggestRaiseMax');
    }
    return text;
  }

  /* ===== שלוש קבוצות, לפי מה שהמנהל צריך לעשות =====

     רשימה של עשרים התראות באותו משקל נקראת כרעש, וגם התראה חשובה
     נבלעת בה. החלוקה כאן היא לפי הפעולה הנדרשת ולא לפי חומרה:
     איוש – חסר או עודף אנשים במשמרת; הפרות – משהו בסידור נוגד
     כלל או בקשה שאושרה; המלצות – שווה להסתכל, אבל הסידור תקף. */
  var GROUPS = { STAFFING: 'staffing', VIOLATIONS: 'violations', ADVICE: 'advice' };

  var GROUP_OF = {
    understaffed: GROUPS.STAFFING,
    'duplicate-shift': GROUPS.STAFFING,
    'role-mismatch': GROUPS.STAFFING,
    'inactive-slot': GROUPS.STAFFING,

    'duplicate-employee-slot': GROUPS.VIOLATIONS,
    'double-booked': GROUPS.VIOLATIONS,
    'standing-conflict': GROUPS.VIOLATIONS,
    'constraint-off': GROUPS.VIOLATIONS,
    'constraint-blocked': GROUPS.VIOLATIONS,
    'branch-mismatch': GROUPS.VIOLATIONS,
    'shift-mismatch': GROUPS.VIOLATIONS,
    'over-max': GROUPS.VIOLATIONS,
    rest: GROUPS.VIOLATIONS,
    'holiday-assignment': GROUPS.VIOLATIONS,

    'pending-constraints': GROUPS.ADVICE,
    'extra-days-off': GROUPS.ADVICE,
    'below-target': GROUPS.ADVICE,
    'no-shifts': GROUPS.ADVICE,
    'missing-shabbat-end': GROUPS.ADVICE
  };

  function groupOf(type) { return GROUP_OF[type] || GROUPS.ADVICE; }

  function issue(level, type, text, ref) {
    return { level: level, type: type, group: groupOf(type), text: text, ref: ref || {} };
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
      var label = slotLabel(state, demand.dayIdx, demand.branchId, demand.shiftId);
      /* אילו מקומות במשמרת נשארו בלי אדם מתאים. משמרת יכולה
         להיות מלאה במספר אנשים ועדיין חסרה מטבח. */
      var missing = Store.openSeats(state, demand.roleNeeds, assigned);
      var seat = { dayIdx: demand.dayIdx, branchId: demand.branchId,
        shiftId: demand.shiftId, need: demand.need, role: missing[0] || '' };

      if (assigned.length < demand.need) {
        issues.push(issue('warning', 'understaffed',
          t('alerts.understaffed', {
            label: label + missingRolesLabel(state, missing),
            assigned: assigned.length, need: demand.need
          }) + ' ' + explainShortage(state, week, seat),
          { dayIdx: demand.dayIdx, branchId: demand.branchId, shiftId: demand.shiftId }));
      } else if (missing.length) {
        /* מספר האנשים נכון, אבל לא התפקידים: שני מלצרים במשמרת
           שביקשה מלצר ומטבח. בלי זה המנהל רואה משמרת "מלאה"
           ומגלה את זה רק כשאין מי שיפתח את המטבח. */
        issues.push(issue('warning', 'role-mismatch',
          t('alerts.roleMismatch', {
            label: label,
            roles: missing.map(function (id) { return Store.roleName(state, id); })
              .filter(Boolean).join(', ')
          }) + ' ' + explainShortage(state, week, seat),
          { dayIdx: demand.dayIdx, branchId: demand.branchId, shiftId: demand.shiftId }));
      }

      if (assigned.length > demand.need) {
        issues.push(issue('warning', 'duplicate-shift',
          t('alerts.duplicate', {
            label: label,
            count: assigned.length,
            names: assigned.map(function (id) { return empName(state, id); }).join(', '),
            need: demand.need
          }),
          { dayIdx: demand.dayIdx, branchId: demand.branchId, shiftId: demand.shiftId }));
      }

      var seen = {};
      assigned.forEach(function (id) {
        if (seen[id]) {
          issues.push(issue('error', 'duplicate-employee-slot',
            t('alerts.duplicateSelf', { name: empName(state, id), label: label }),
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
          ? t('alerts.pendingOne', { name: empName(state, pending[0].empId), day: dayName(pending[0].dayIdx) })
          : t('alerts.pendingOther', { count: pending.length, names: nameList(names, 4) }),
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
          t('alerts.holidayAssignment', {
            day: dayName(holidayDay),
            name: Store.holidayName(week, holidayDay),
            names: nameList(onHoliday, 5)
          }),
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
        t('alerts.missingSabbath'),
        { dayIdx: Data.MOTZASH.dayIdx }));
    }

    // 1ג. שיבוץ בסניף/משמרת שאינם פעילים באותו יום
    Object.keys(week.assignments).forEach(function (key) {
      if (demandMap[key]) return;
      var list = week.assignments[key] || [];
      if (!list.length) return;
      var parts = key.split('|');
      issues.push(issue('warning', 'inactive-slot',
        t('alerts.inactiveSlot', {
          day: dayName(Number(parts[0])),
          branch: branchName(state, parts[1]),
          shift: shiftName(parts[2]),
          names: list.map(function (id) { return empName(state, id); }).join(', ')
        }),
        { dayIdx: Number(parts[0]), branchId: parts[1], shiftId: parts[2] }));
    });

    // 2. בדיקות ברמת העובד
    state.employees.forEach(function (emp) {
      var total = 0;

      for (var day = 0; day < 7; day++) {
        var slots = Store.employeeDayAssignments(state, week, emp.id, day);
        total += slots.length;
        var constraint = Store.effectiveConstraint(state, week, emp.id, day);

        // כפל משמרת לעובד באותו יום
        if (slots.length > 1) {
          var desc = slots.map(function (s) {
            return branchName(state, s.branchId) + ' / ' + shiftName(s.shiftId);
          }).join(' + ');
          var sameBranch = slots.every(function (s) { return s.branchId === slots[0].branchId; });
          issues.push(issue(state.settings.onePerDay ? 'error' : 'info', 'double-booked',
            t('alerts.doubleBooked', {
              name: emp.name,
              count: slots.length,
              day: dayName(day),
              where: t(sameBranch ? 'alerts.sameBranch' : 'alerts.differentBranches'),
              detail: desc
            }),
            { dayIdx: day, empId: emp.id }));
        }

        slots.forEach(function (s) {
          /* הסדר קבוע שנשבר הוא לא "בקשה שלא כובדה": איש לא ביקש
             דבר השבוע, וזה בדיוק מה שהופך את זה לקל לפספוס. */
          if (Store.standingBlocks(emp, day, s.shiftId, Store.weekKeyOf(state, week))) {
            issues.push(issue('error', 'standing-conflict',
              t('alerts.standingConflict', {
                name: emp.name, day: dayName(day),
                shift: shiftName(s.shiftId), branch: branchName(state, s.branchId)
              }),
              { dayIdx: day, empId: emp.id, branchId: s.branchId, shiftId: s.shiftId }));
          } else if (constraint.off) {
            issues.push(issue('error', 'constraint-off',
              t('alerts.constraintOff', {
                name: emp.name, day: dayName(day),
                shift: shiftName(s.shiftId), branch: branchName(state, s.branchId)
              }),
              { dayIdx: day, empId: emp.id, branchId: s.branchId, shiftId: s.shiftId }));
          } else if (constraint.blocked && constraint.blocked[s.shiftId]) {
            issues.push(issue('error', 'constraint-blocked',
              t('alerts.constraintBlocked', {
                name: emp.name, shift: shiftName(s.shiftId),
                day: dayName(day), branch: branchName(state, s.branchId)
              }),
              { dayIdx: day, empId: emp.id, branchId: s.branchId, shiftId: s.shiftId }));
          }
          if (!Scheduler.employeeAllowedInBranch(emp, s.branchId)) {
            issues.push(issue('warning', 'branch-mismatch',
              t('alerts.branchMismatch', {
                name: emp.name, branch: branchName(state, s.branchId), day: dayName(day)
              }),
              { dayIdx: day, empId: emp.id, branchId: s.branchId, shiftId: s.shiftId }));
          }
          if (emp.shifts.indexOf(s.shiftId) === -1) {
            issues.push(issue('warning', 'shift-mismatch',
              t('alerts.shiftMismatch', {
                name: emp.name, shift: shiftName(s.shiftId), day: dayName(day)
              }),
              { dayIdx: day, empId: emp.id, branchId: s.branchId, shiftId: s.shiftId }));
          }
        });

        /* מנוחה בין משמרות. נבדק רק אחורה, ליום שלפני, כדי
           שאותה הפרה לא תדווח פעמיים – פעם מכל צד שלה. */
        if (Store.restRule(state).enabled && day > 0) {
          var previous = Store.employeeDayAssignments(state, week, emp.id, day - 1);
          var reported = false;
          previous.forEach(function (before) {
            slots.forEach(function (after) {
              if (reported) return;
              if (!Store.breaksRest(state, week,
                { dayIdx: day - 1, branchId: before.branchId, shiftId: before.shiftId },
                { dayIdx: day, branchId: after.branchId, shiftId: after.shiftId })) return;
              reported = true;
              var gap = Store.restGapMinutes(state, week,
                { dayIdx: day - 1, branchId: before.branchId, shiftId: before.shiftId },
                { dayIdx: day, branchId: after.branchId, shiftId: after.shiftId });
              issues.push(issue('warning', 'rest',
                t('alerts.rest', {
                  name: emp.name, previous: dayName(day - 1), day: dayName(day),
                  gap: Store.formatMinutes(Math.max(0, gap)),
                  need: Store.formatMinutes(Store.restRule(state).minutes)
                }),
                { dayIdx: day, empId: emp.id }));
            });
          });
        }
      }

      /* ===== מדיניות יום החופש השבועי =====

         "יום החופש שסומן באילוצים הוא יום החופש היחיד בשבוע"
         מדבר על יום המנוחה השבועי, ולא על חופשה.

         יום שסומן כ**חופשה בתשלום** הוא דבר אחר לגמרי: הוא
         יורד מהמכסה של העובד, המנהל אישר אותו, והוא אמור
         להופיע בסידור בדיוק ככה. ספירה שלו כ"יום חופש נוסף"
         מייצרת התראה על מצב תקין — וזה בדיוק סוג ההתראה
         שגורמת למנהל להפסיק לקרוא אותן.

         לכן נספרים כאן רק ימי המנוחה: מה שאינו מסומן בתשלום. */
      if (emp.active && state.settings.oneDayOffPerWeek) {
        var daysOff = Store.requestedDaysOff(week, emp.id).filter(function (day) {
          return Store.leaveOf(week, emp.id, day) !== Store.LEAVE.PAID;
        });
        if (daysOff.length > 1) {
          issues.push(issue('warning', 'extra-days-off',
            t('alerts.extraDaysOff', {
              name: emp.name, count: daysOff.length, days: daysOff.map(dayName).join(', ')
            }),
            { empId: emp.id }));
        }

        var workable = Store.workableDays(state, week, emp).length;
        var expected = Math.min(emp.maxShifts || 99, workable);
        if (daysOff.length === 1 && total < expected && total > 0) {
          issues.push(issue('info', 'below-target',
            t('alerts.belowTarget', {
              name: emp.name, day: dayName(daysOff[0]), total: total, expected: expected
            }),
            { empId: emp.id }));
        }
      }

      if (emp.active && total > (emp.maxShifts || 99)) {
        issues.push(issue('warning', 'over-max',
          t('alerts.overMax', { name: emp.name, total: total, max: emp.maxShifts }),
          { empId: emp.id }));
      }
      if (emp.active && total === 0 && Store.weekDemands(state, week).length) {
        issues.push(issue('info', 'no-shifts', t('alerts.noShifts', { name: emp.name }), { empId: emp.id }));
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

    function countGroup(name) {
      return issues.filter(function (item) { return item.group === name; }).length;
    }

    /* החומרה הגבוהה ביותר בקבוצה קובעת את הצבע שלה על המסך */
    function levelOfGroup(name) {
      var inGroup = issues.filter(function (item) { return item.group === name; });
      if (inGroup.some(function (item) { return item.level === 'error'; })) return 'error';
      if (inGroup.some(function (item) { return item.level === 'warning'; })) return 'warning';
      return inGroup.length ? 'info' : 'ok';
    }

    return {
      issues: issues,
      errors: issues.filter(function (i) { return i.level === 'error'; }).length,
      warnings: issues.filter(function (i) { return i.level === 'warning'; }).length,
      infos: issues.filter(function (i) { return i.level === 'info'; }).length,
      groups: [GROUPS.STAFFING, GROUPS.VIOLATIONS, GROUPS.ADVICE].map(function (name) {
        return { name: name, count: countGroup(name), level: levelOfGroup(name) };
      })
    };
  }

  var API = { validate: validate, GROUPS: GROUPS, groupOf: groupOf };
  root.ShiftValidate = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
