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

  /* תנאי יסוד שאינם ניתנים לפתרון על ידי החלפת שיבוצים */
  function eligibleForSlot(ctx, emp, demand) {
    if (!emp.active) return false;
    if (Store.isHoliday(ctx.week, demand.dayIdx)) return false; // יום חג – אין עבודה
    if (emp.shifts.indexOf(demand.shiftId) === -1) return false;
    if (!employeeAllowedInBranch(emp, demand.branchId)) return false;
    /* התפקיד שהמשמרת מחפשת. תנאי יסוד ולא ניקוד: קופאי אינו
       "פחות מתאים" לעמדת מטבח – הוא פשוט לא שם. */
    if (!Store.employeeFitsRole(ctx.state, emp, demand.role)) return false;
    var constraint = ctx.constraints[emp.id + '|' + demand.dayIdx];
    if (constraint) {
      if (constraint.off) return false;
      if (constraint.blocked && constraint.blocked[demand.shiftId]) return false;
    }
    return true;
  }

  /* האם ניתן לשבץ את העובד לדרישה מסוימת, בהתחשב במצב השיבוץ הנוכחי */
  function canAssign(ctx, emp, demand) {
    var state = ctx.state;
    var day = demand.dayIdx;

    if (!eligibleForSlot(ctx, emp, demand)) return false;

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
    // הוגנות ביחס ליעד האישי: המכסה השבועית מוגבלת במספר הימים שבהם
    // העובד פנוי, כך שמי שביקש יום חופש אחד אמור לעבוד בשאר הימים.
    var target = ctx.targets[emp.id] || 1;
    score += (ctx.counts[emp.id] / target) * 100;

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
    /* רק בקשות שאושרו משפיעות על השיבוץ. בקשה שממתינה לאישור או
       שנדחתה אינה נלקחת בחשבון. */
    var effective = {};
    Object.keys(week.constraints || {}).forEach(function (key) {
      var record = week.constraints[key];
      if (Store.constraintStatus(record) === Store.CONSTRAINT_STATUS.APPROVED) {
        effective[key] = record;
      }
    });

    var ctx = {
      state: state,
      week: week,
      constraints: effective,
      counts: {},
      targets: {},
      byDay: {},
      branchHistory: {},
      shiftHistory: {},
      assignments: {}
    };
    state.employees.forEach(function (emp) {
      ctx.targets[emp.id] = Math.max(1, Store.targetShifts(state, week, emp));
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

  /* השיבוצים שחוסמים את העובד מלקחת את המשמרת הזו */
  function blockingAssignments(ctx, emp, demand) {
    var blockers = [];
    var seen = {};
    function push(dayIdx, slot) {
      var key = dayIdx + '|' + slot.branchId + '|' + slot.shiftId;
      if (seen[key]) return;
      seen[key] = true;
      blockers.push({ dayIdx: dayIdx, branchId: slot.branchId, shiftId: slot.shiftId });
    }
    [demand.dayIdx - 1, demand.dayIdx, demand.dayIdx + 1].forEach(function (day) {
      if (day < 0 || day > 6) return;
      ctx.byDay[emp.id][day].forEach(function (slot) { push(day, slot); });
    });
    if (ctx.counts[emp.id] >= (emp.maxShifts || 99)) {
      for (var day = 0; day < 7; day++) {
        ctx.byDay[emp.id][day].forEach(function (slot) { push(day, slot); });
      }
    }
    return blockers;
  }

  /* מנסה לאייש משמרת ריקה: קודם שיבוץ ישיר, ואם אין – מסלול הרחבה.
     עובד מפנה משמרת אחרת, ואת המשמרת שהתפנתה מנסים לאייש רקורסיבית.
     כל עובד נבדק פעם אחת לכל חיפוש (כמו באלגוריתם התאמה דו-צדדית),
     ולכן החיפוש שלם ומסתיים בזמן סביר. */
  function fillSlot(ctx, demand, visited, locked) {
    var key = Store.slotKey(demand.dayIdx, demand.branchId, demand.shiftId);
    var taken = ctx.assignments[key] || [];
    var employees = ctx.state.employees;
    var i;

    for (i = 0; i < employees.length; i++) {
      if (taken.indexOf(employees[i].id) !== -1) continue;
      if (canAssign(ctx, employees[i], demand)) {
        applyAssignment(ctx, employees[i].id, demand);
        return true;
      }
    }

    for (i = 0; i < employees.length; i++) {
      var emp = employees[i];
      if (visited[emp.id]) continue;
      if (taken.indexOf(emp.id) !== -1) continue;
      if (!eligibleForSlot(ctx, emp, demand)) continue;
      visited[emp.id] = true;

      var blockers = blockingAssignments(ctx, emp, demand);
      for (var b = 0; b < blockers.length; b++) {
        var blocker = blockers[b];
        if (locked[Store.slotKey(blocker.dayIdx, blocker.branchId, blocker.shiftId)]) continue;

        removeAssignment(ctx, emp.id, blocker.dayIdx, blocker.branchId, blocker.shiftId);
        if (canAssign(ctx, emp, demand)) {
          applyAssignment(ctx, emp.id, demand);
          if (fillSlot(ctx, blocker, visited, locked)) return true;
          removeAssignment(ctx, emp.id, demand.dayIdx, demand.branchId, demand.shiftId);
        }
        applyAssignment(ctx, emp.id, blocker); // שחזור המצב הקודם
      }
    }
    return false;
  }

  /* מעבר אחרון על כל המשמרות שנותרו ריקות */
  function deepFill(ctx, unfilled, keepManual, week) {
    var locked = {};
    if (keepManual && week) {
      Object.keys(week.manual || {}).forEach(function (key) { locked[key] = true; });
    }
    var remaining = [];
    unfilled.forEach(function (demand) {
      if (!fillSlot(ctx, demand, {}, locked)) remaining.push(demand);
    });
    return remaining;
  }

  /* כמה עובדים יכולים לכסות דרישה. limit מאפשר עצירה מוקדמת:
     כדי לאתר את המשמרת הנדירה ביותר אין צורך לספור מעבר למינימום הנוכחי. */
  function candidateCount(ctx, demand, limit) {
    var cap = limit == null ? Infinity : limit;
    var employees = ctx.state.employees;
    var n = 0;
    for (var i = 0; i < employees.length; i++) {
      if (canAssign(ctx, employees[i], demand)) {
        n++;
        if (n > cap) return n;
      }
    }
    return n;
  }

  function runOnce(state, week, keepManual, seed) {
    var rand = makeRandom(seed);
    var ctx = newContext(state, week);
    var demands = Store.weekDemands(state, week);
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

    /* בכל צעד נבחרת המשמרת עם הכי מעט מועמדים אפשריים כרגע.
       החישוב מחדש אחרי כל שיבוץ מונע מצב שבו שיבוץ מוקדם חוסם משמרת נדירה. */
    var remaining = slots.slice();
    while (remaining.length) {
      var pickIndex = 0, fewest = Infinity;
      for (var i = 0; i < remaining.length; i++) {
        var count = candidateCount(ctx, remaining[i], fewest);
        if (count < fewest) { fewest = count; pickIndex = i; }
        if (fewest === 0) break;
      }
      var demand = remaining.splice(pickIndex, 1)[0];
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
    }

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
      if (!emp.active) return;
      counts.push(result.counts[emp.id] / Math.max(1, Store.targetShifts(state, week, emp) || 1));
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
  /* תקציב עבודה קבוע: בעיות גדולות מקבלות פחות ניסיונות, כדי שזמן
     התגובה יישאר סביר גם עם הרבה סניפים ועובדים. */
  function attemptBudget(state, week) {
    var slots = Store.weekDemands(state, week).reduce(function (sum, d) { return sum + d.need; }, 0);
    var employees = state.employees.filter(function (emp) { return emp.active; }).length;
    var work = Math.max(1, slots * Math.max(1, employees));
    return Math.max(12, Math.min(120, Math.round(120000 / work)));
  }

  function generate(state, week, options) {
    var opts = options || {};
    var attempts = opts.attempts || attemptBudget(state, week);
    var keepManual = opts.keepManual !== false;
    var best = null, bestQ = null;
    for (var i = 0; i < attempts; i++) {
      var result = runOnce(state, week, keepManual, (opts.seed || 20260101) + i * 7919);
      var q = qualityOf(state, week, result);
      if (!best || betterThan(q, bestQ)) { best = result; bestQ = q; }
      if (bestQ.unfilled === 0 && bestQ.misses === 0 && bestQ.variance < 0.01) break;
    }

    // מעבר אחרון ויסודי על התוצאה הטובה ביותר, עם שרשראות החלפה עמוקות
    if (best.unfilled.length) {
      best.unfilled = deepFill(best.ctx, best.unfilled, keepManual, week);
      best.assignments = best.ctx.assignments;
      best.counts = best.ctx.counts;
      bestQ = qualityOf(state, week, best);
    }

    return { assignments: best.assignments, counts: best.counts, unfilled: best.unfilled, quality: bestQ };
  }

  var API = {
    generate: generate,
    attemptBudget: attemptBudget,
    fillSlot: fillSlot,
    deepFill: deepFill,
    eligibleForSlot: eligibleForSlot,
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
