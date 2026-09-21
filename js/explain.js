/* "למה שובץ ככה" – הסבר לכל שיבוץ בסידור.

   שתי החלטות עיצוב שקובעות את הערך של הקובץ הזה:

   1. ההסבר נגזר מהסידור שבפועל, ולא נשמר בזמן ההרצה. לכן הוא נכון
      גם אחרי שהמנהל שינה משהו ביד – ושיבוץ ידני הוא בדיוק המקרה
      שבו שואלים "רגע, למה זה ככה?".

   2. ההסבר משתמש באותן פונקציות בדיוק שבהן המנוע משתמש כדי להחליט
      (Scheduler.canAssign ו-eligibleForSlot). הסבר שנכתב בנפרד
      מההחלטה הוא סיפור יפה שאפשר לסתור, וזה גרוע מאין הסבר. */
(function (root) {
  'use strict';

  var Store = root.ShiftStore || (typeof require === 'function' ? require('./store.js') : null);
  var Scheduler = root.ShiftScheduler ||
    (typeof require === 'function' ? require('./scheduler.js') : null);

  function parseSlotKey(key) {
    var parts = String(key).split('|');
    if (parts.length < 3) return null;
    return {
      dayIdx: Number(parts[0]),
      branchId: parts.slice(1, -1).join('|'),
      shiftId: parts[parts.length - 1]
    };
  }

  /* בונה הקשר שמשקף את הסידור כפי שהוא עכשיו על המסך */
  function contextOf(state, week) {
    var ctx = Scheduler.newContext(state, week);
    Object.keys(week.assignments || {}).forEach(function (key) {
      var slot = parseSlotKey(key);
      if (!slot) return;
      (week.assignments[key] || []).forEach(function (empId) {
        if (!ctx.counts.hasOwnProperty(empId)) return;   // עובד שנמחק מאז
        Scheduler.applyAssignment(ctx, empId, slot);
      });
    });
    return ctx;
  }

  function approvedConstraint(ctx, empId, dayIdx) {
    return ctx.constraints[empId + '|' + dayIdx] || null;
  }

  /* למה העובד הזה *יכול* לעבוד במשמרת הזו – רשימת עובדות בדוקות */
  function factsFor(state, week, ctx, emp, slot) {
    var facts = [];
    var constraint = approvedConstraint(ctx, emp.id, slot.dayIdx);

    if (constraint && constraint.preferred && constraint.preferred[slot.shiftId]) {
      /* העובדה החזקה ביותר: הוא ביקש בדיוק את המשמרת הזו */
      facts.push({ code: 'requested' });
    } else if (!constraint || (!constraint.off && !(constraint.blocked || {})[slot.shiftId])) {
      facts.push({ code: 'available' });
    }

    facts.push({ code: 'qualified' });

    if (emp.branches && emp.branches.length) {
      facts.push({ code: 'assignedBranch' });
    } else {
      facts.push({ code: 'anyBranch' });
    }

    var used = ctx.counts[emp.id] || 0;
    var target = Store.targetShifts(state, week, emp) || 0;
    facts.push({ code: 'quota', params: { used: used, target: target } });

    if (state.settings && state.settings.restEveningMorning) {
      facts.push({ code: 'rest' });
    }

    var branchHits = (ctx.branchHistory[emp.id] || {})[slot.branchId] || 0;
    if (branchHits > 1) {
      facts.push({ code: 'continuity', params: { count: branchHits } });
    }

    return facts;
  }

  /* למה עובד אחר *לא* יכול – אותם תנאים, בסדר שבו המנוע בודק */
  function blockedReason(state, week, ctx, emp, slot) {
    if (!emp.active) return { code: 'inactive' };
    if (emp.shifts.indexOf(slot.shiftId) === -1) return { code: 'notQualified' };
    if (!Scheduler.employeeAllowedInBranch(emp, slot.branchId)) return { code: 'otherBranch' };

    var constraint = approvedConstraint(ctx, emp.id, slot.dayIdx);
    if (constraint) {
      if (constraint.off) return { code: 'requestedOff' };
      if (constraint.blocked && constraint.blocked[slot.shiftId]) return { code: 'blockedShift' };
    }

    var used = ctx.counts[emp.id] || 0;
    var max = emp.maxShifts || 0;
    if (max && used >= max) return { code: 'atLimit', params: { max: max } };

    var dayList = (ctx.byDay[emp.id] || [])[slot.dayIdx] || [];
    if (dayList.length) {
      if (state.settings && state.settings.onePerDay) return { code: 'busySameDay' };
      for (var i = 0; i < dayList.length; i++) {
        if (dayList[i].shiftId === slot.shiftId) return { code: 'busySameShift' };
      }
    }

    if (state.settings && state.settings.restEveningMorning) {
      var neighbours = [];
      if (slot.shiftId === 'morning' && slot.dayIdx > 0) {
        neighbours = (ctx.byDay[emp.id] || [])[slot.dayIdx - 1] || [];
        for (var j = 0; j < neighbours.length; j++) {
          if (neighbours[j].shiftId === 'evening') return { code: 'restRule' };
        }
      }
      if (slot.shiftId === 'evening' && slot.dayIdx < 6) {
        neighbours = (ctx.byDay[emp.id] || [])[slot.dayIdx + 1] || [];
        for (var k = 0; k < neighbours.length; k++) {
          if (neighbours[k].shiftId === 'morning') return { code: 'restRule' };
        }
      }
    }

    return null;   // יכול היה – הוא חלופה אמיתית
  }

  /* ההסבר המלא לשיבוץ אחד.
     מחזיר null אם העובד אינו משובץ שם בפועל. */
  function forAssignment(state, week, slot, employeeId) {
    if (!Store || !Scheduler) return null;
    var emp = Store.byId(state.employees, employeeId);
    if (!emp) return null;

    var assigned = Store.getAssigned(week, slot.dayIdx, slot.branchId, slot.shiftId);
    if (assigned.indexOf(employeeId) === -1) return null;

    var ctx = contextOf(state, week);

    /* מוציאים את העובד מהמשמרת הזו, כדי שהשאלה "מי עוד היה יכול"
       תיענה על אותו מצב עולם שבו המנוע עמד. */
    Scheduler.removeAssignment(ctx, employeeId, slot.dayIdx, slot.branchId, slot.shiftId);

    var facts = factsFor(state, week, ctx, emp, slot);
    var free = [];
    var blocked = [];

    state.employees.forEach(function (other) {
      if (other.id === employeeId) return;
      if (assigned.indexOf(other.id) !== -1) return;   // כבר במשמרת הזו
      var reason = blockedReason(state, week, ctx, other, slot);
      if (reason) {
        blocked.push({ id: other.id, name: other.name, reason: reason });
      } else {
        var used = ctx.counts[other.id] || 0;
        free.push({ id: other.id, name: other.name, used: used,
          target: Store.targetShifts(state, week, other) || 0 });
      }
    });

    /* למה דווקא הוא ולא אחד מהפנויים: הוגנות ביחס למכסה האישית,
       וזה בדיוק מה שהניקוד במנוע מודד. */
    var used = ctx.counts[employeeId] || 0;
    var target = Store.targetShifts(state, week, emp) || 1;
    var mine = used / Math.max(1, target);
    var fairer = free.filter(function (other) {
      return (other.used / Math.max(1, other.target)) < mine;
    });

    return {
      employee: { id: emp.id, name: emp.name },
      facts: facts,
      alternatives: {
        free: free,
        blocked: blocked,
        /* חלופות שהיו "פנויות יותר" ממנו. אם הרשימה ריקה, הוא
           היה הבחירה ההוגנת ביותר. */
        fairer: fairer
      },
      onlyOption: free.length === 0
    };
  }

  var API = {
    forAssignment: forAssignment,
    parseSlotKey: parseSlotKey,
    contextOf: contextOf,
    blockedReason: blockedReason
  };

  root.ShiftExplain = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
