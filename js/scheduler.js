/* מנוע שיבוץ אוטומטי: מציב עובד לכל יום/סניף/משמרת לפי אילוצים והוגנות */
(function (root) {
  'use strict';

  var Data = root.ShiftData || (typeof require === 'function' ? require('./data.js') : null);
  var Store = root.ShiftStore || (typeof require === 'function' ? require('./store.js') : null);

  function makeRandom(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function employeeAllowedInBranch(emp, branchId) {
    return !emp.branches || emp.branches.length === 0 || emp.branches.indexOf(branchId) !== -1;
  }

  /* האם ניתן לשבץ את העובד לדרישה מסוימת, בהתחשב במצב השיבוץ הנוכחי */
  function canAssign(ctx, emp, demand) {
    var state = ctx.state;
    var day = demand.dayIdx;

    if (!emp.active) return false;
    if (emp.shifts.indexOf(demand.shiftId) === -1) return false;
    if (!employeeAllowedInBranch(emp, demand.branchId)) return false;

    var constraint = ctx.constraints[emp.id + '|' + day];
    if (constraint) {
      if (constraint.off) return false;
      if (constraint.blocked && constraint.blocked[demand.shiftId]) return false;
    }

    var dayList = ctx.byDay[emp.id][day];
    if (state.settings.onePerDay && dayList.length > 0) return false;
    for (var i = 0; i < dayList.length; i++) {
      if (dayList[i].shiftId === demand.shiftId) return false; // אותה משמרת פעמיים באותו יום
    }

    if (ctx.counts[emp.id] >= (emp.maxShifts || 99)) return false;

    // מנוחה בין ערב לבוקר – נבדק לשני הכיוונים, כי סדר השיבוץ אינו כרונולוגי
    if (state.settings.restEveningMorning) {
      if (demand.shiftId === 'morning' && day > 0) {
        var prev = ctx.byDay[emp.id][day - 1];
        for (var j = 0; j < prev.length; j++) {
          if (prev[j].shiftId === 'evening') return false;
        }
      }
      if (demand.shiftId === 'evening' && day < 6) {
        var next = ctx.byDay[emp.id][day + 1];
        for (var k = 0; k < next.length; k++) {
          if (next[k].shiftId === 'morning') return false;
        }
      }
    }
    return true;
  }

  function scoreCandidate(ctx, emp, demand, rand) {
    var score = 0;
    var max = emp.maxShifts || 6;
    score += (ctx.counts[emp.id] / Math.max(1, max)) * 100; // הוגנות: מי שעבד פחות – קודם

    var constraint = ctx.constraints[emp.id + '|' + demand.dayIdx];
    if (constraint && constraint.preferred && Object.keys(constraint.preferred).length) {
      // העדפה למשמרת מסוימת באותו יום – בונוס למשמרת המועדפת, קנס לשאר
      score += constraint.preferred[demand.shiftId] ? -45 : 30;
    }

    // רציפות סניף: עדיף שעובד יישאר באותו סניף לאורך השבוע
    var branchHits = ctx.branchHistory[emp.id][demand.branchId] || 0;
    score -= Math.min(branchHits, 3) * 8;

    // רציפות סוג משמרת
    var shiftHits = ctx.shiftHistory[emp.id][demand.shiftId] || 0;
    score -= Math.min(shiftHits, 3) * 4;

    // עובד המשויך במפורש לסניף עדיף על מחליף כללי
    if (emp.branches && emp.branches.length > 0) score -= 6;

    score += rand() * 12; // רעש קטן ליצירת גיוון בין הרצות
    return score;
  }

  function newContext(state, week) {
    var ctx = {
      state: state,
      constraints: week.constraints || {},
      counts: {},
      byDay: {},
      branchHistory: {},
      shiftHistory: {},
      assignments: {}
    };
    state.employees.forEach(function (emp) {
      ctx.counts[emp.id] = 0;
      ctx.byDay[emp.id] = [[], [], [], [], [], [], []];
      ctx.branchHistory[emp.id] = {};
      ctx.shiftHistory[emp.id] = {};
    });
    return ctx;
  }

  function applyAssignment(ctx, empId, demand) {
    ctx.counts[empId] += 1;
    ctx.byDay[empId][demand.dayIdx].push({ branchId: demand.branchId, shiftId: demand.shiftId });
    ctx.branchHistory[empId][demand.branchId] = (ctx.branchHistory[empId][demand.branchId] || 0) + 1;
    ctx.shiftHistory[empId][demand.shiftId] = (ctx.shiftHistory[empId][demand.shiftId] || 0) + 1;
    var key = Store.slotKey(demand.dayIdx, demand.branchId, demand.shiftId);
    if (!ctx.assignments[key]) ctx.assignments[key] = [];
    ctx.assignments[key].push(empId);
  }

  function removeAssignment(ctx, empId, dayIdx, branchId, shiftId) {
    var list = ctx.byDay[empId][dayIdx];
    for (var i = 0; i < list.length; i++) {
      if (list[i].branchId === branchId && list[i].shiftId === shiftId) { list.splice(i, 1); break; }
    }
    ctx.counts[empId] -= 1;
    ctx.branchHistory[empId][branchId] = Math.max(0, (ctx.branchHistory[empId][branchId] || 1) - 1);
    ctx.shiftHistory[empId][shiftId] = Math.max(0, (ctx.shiftHistory[empId][shiftId] || 1) - 1);
    var key = Store.slotKey(dayIdx, branchId, shiftId);
    var slot = ctx.assignments[key] || [];
    var pos = slot.indexOf(empId);
    if (pos !== -1) slot.splice(pos, 1);
    if (slot.length === 0) delete ctx.assignments[key];
  }

  /* פאזת תיקון: מנסה לפנות עובד ממשמרת אחרת כדי לכסות משמרת שנשארה ריקה */
  function repair(ctx, unfilled, keepManual, week) {
    var remaining = [];
    unfilled.forEach(function (demand) {
      var key = Store.slotKey(demand.dayIdx, demand.branchId, demand.shiftId);
      var taken = ctx.assignments[key] || [];
      var fixed = false;

      for (var e = 0; e < ctx.state.employees.length && !fixed; e++) {
        var emp = ctx.state.employees[e];
        if (taken.indexOf(emp.id) !== -1) continue;
        if (canAssign(ctx, emp, demand)) { applyAssignment(ctx, emp.id, demand); fixed = true; break; }

        // אילו שיבוצים קיימים חוסמים את העובד? (אותו יום, או כלל המנוחה, או המכסה)
        var blockers = [];
        [demand.dayIdx - 1, demand.dayIdx, demand.dayIdx + 1].forEach(function (day) {
          if (day < 0 || day > 6) return;
          ctx.byDay[emp.id][day].forEach(function (slot) {
            blockers.push({ dayIdx: day, branchId: slot.branchId, shiftId: slot.shiftId });
          });
        });
        if (ctx.counts[emp.id] >= (emp.maxShifts || 99)) {
          for (var d = 0; d < 7; d++) {
            ctx.byDay[emp.id][d].forEach(function (slot) {
              blockers.push({ dayIdx: d, branchId: slot.branchId, shiftId: slot.shiftId });
            });
          }
        }

        for (var b = 0; b < blockers.length && !fixed; b++) {
          var blocker = blockers[b];
          var blockerKey = Store.slotKey(blocker.dayIdx, blocker.branchId, blocker.shiftId);
          if (keepManual && week && week.manual[blockerKey]) continue; // לא נוגעים בשיבוץ ידני

          removeAssignment(ctx, emp.id, blocker.dayIdx, blocker.branchId, blocker.shiftId);
          if (canAssign(ctx, emp, demand)) {
            // מחפשים מחליף למשמרת שהתפנתה
            var replacement = null;
            var blockerTaken = ctx.assignments[blockerKey] || [];
            for (var r = 0; r < ctx.state.employees.length; r++) {
              var other = ctx.state.employees[r];
              if (other.id === emp.id || blockerTaken.indexOf(other.id) !== -1) continue;
              if (canAssign(ctx, other, blocker)) { replacement = other; break; }
            }
            if (replacement) {
              applyAssignment(ctx, emp.id, demand);
              applyAssignment(ctx, replacement.id, blocker);
              fixed = true;
              break;
            }
          }
          applyAssignment(ctx, emp.id, blocker); // שחזור המצב הקודם
        }
      }

      if (!fixed) remaining.push(demand);
    });
    return remaining;
  }

  /* כמה עובדים יכולים בכלל לכסות דרישה – משמש למיון לפי נדירות */
  function candidateCount(ctx, demand) {
    var n = 0;
    ctx.state.employees.forEach(function (emp) {
      if (canAssign(ctx, emp, demand)) n++;
    });
    return n;
  }

  function runOnce(state, week, keepManual, seed) {
    var rand = makeRandom(seed);
    var ctx = newContext(state, week);
    var demands = Store.weekDemands(state);
    var unfilled = [];

    // שמירת שיבוצים ידניים קיימים
    if (keepManual) {
      demands.forEach(function (demand) {
        var key = Store.slotKey(demand.dayIdx, demand.branchId, demand.shiftId);
        if (!week.manual[key]) return;
        var existing = week.assignments[key] || [];
        existing.slice(0, demand.need).forEach(function (empId) {
          var emp = Store.byId(state.employees, empId);
          if (!emp) return;
          if (ctx.assignments[key] && ctx.assignments[key].indexOf(empId) !== -1) return;
          applyAssignment(ctx, empId, demand);
        });
      });
    }

    // פירוק לדרישות בודדות (סלוט אחד = עובד אחד)
    var slots = [];
    demands.forEach(function (demand) {
      var key = Store.slotKey(demand.dayIdx, demand.branchId, demand.shiftId);
      var already = (ctx.assignments[key] || []).length;
      for (var i = already; i < demand.need; i++) { slots.push(demand); }
    });

    // מיון לפי נדירות: קודם דרישות עם מעט מועמדים
    slots.sort(function (a, b) {
      var diff = candidateCount(ctx, a) - candidateCount(ctx, b);
      if (diff !== 0) return diff;
      return (a.dayIdx - b.dayIdx) || a.branchId.localeCompare(b.branchId);
    });

    slots.forEach(function (demand) {
      var key = Store.slotKey(demand.dayIdx, demand.branchId, demand.shiftId);
      var taken = ctx.assignments[key] || [];
      var best = null, bestScore = Infinity;
      state.employees.forEach(function (emp) {
        if (taken.indexOf(emp.id) !== -1) return;
        if (!canAssign(ctx, emp, demand)) return;
        var score = scoreCandidate(ctx, emp, demand, rand);
        if (score < bestScore) { bestScore = score; best = emp; }
      });
      if (best) { applyAssignment(ctx, best.id, demand); }
      else { unfilled.push(demand); }
    });

    if (unfilled.length) { unfilled = repair(ctx, unfilled, keepManual, week); }

    return { assignments: ctx.assignments, counts: ctx.counts, unfilled: unfilled, ctx: ctx };
  }

  /* כמה העדפות משמרת לא כובדו: העובד עבד באותו יום, אך לא במשמרת שביקש */
  function preferenceMisses(state, week, ctx) {
    var misses = 0;
    state.employees.forEach(function (emp) {
      for (var day = 0; day < 7; day++) {
        var constraint = (week.constraints || {})[emp.id + '|' + day];
        if (!constraint || !constraint.preferred) continue;
        var wanted = Object.keys(constraint.preferred);
        if (!wanted.length) continue;
        var slots = ctx.byDay[emp.id][day];
        if (!slots.length) continue;
        var honored = slots.some(function (slot) { return wanted.indexOf(slot.shiftId) !== -1; });
        if (!honored) misses++;
      }
    });
    return misses;
  }

  function qualityOf(state, week, result) {
    var counts = [];
    state.employees.forEach(function (emp) {
      if (emp.active) counts.push(result.counts[emp.id] / Math.max(1, emp.maxShifts || 6));
    });
    var avg = counts.reduce(function (a, b) { return a + b; }, 0) / (counts.length || 1);
    var variance = counts.reduce(function (a, b) { return a + Math.pow(b - avg, 2); }, 0) / (counts.length || 1);
    return {
      unfilled: result.unfilled.length,
      misses: preferenceMisses(state, week, result.ctx),
      variance: variance
    };
  }

  /* השוואת איכות: קודם כיסוי, אחר כך כיבוד העדפות, ולבסוף הוגנות בחלוקה */
  function betterThan(candidate, best) {
    if (candidate.unfilled !== best.unfilled) return candidate.unfilled < best.unfilled;
    if (candidate.misses !== best.misses) return candidate.misses < best.misses;
    return candidate.variance < best.variance;
  }

  /* הרצה מרובה עם זריעה אקראית ובחירת התוצאה הטובה ביותר */
  function generate(state, week, options) {
    var opts = options || {};
    var attempts = opts.attempts || 120;
    var keepManual = opts.keepManual !== false;
    var best = null, bestQ = null;
    for (var i = 0; i < attempts; i++) {
      var result = runOnce(state, week, keepManual, (opts.seed || 20260101) + i * 7919);
      var q = qualityOf(state, week, result);
      if (!best || betterThan(q, bestQ)) { best = result; bestQ = q; }
      if (bestQ.unfilled === 0 && bestQ.misses === 0 && bestQ.variance < 0.01) break;
    }
    return { assignments: best.assignments, counts: best.counts, unfilled: best.unfilled, quality: bestQ };
  }

  var API = {
    generate: generate,
    repair: repair,
    removeAssignment: removeAssignment,
    runOnce: runOnce,
    canAssign: canAssign,
    employeeAllowedInBranch: employeeAllowedInBranch,
    newContext: newContext,
    applyAssignment: applyAssignment
  };

  root.ShiftScheduler = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
