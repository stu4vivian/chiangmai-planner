// fineflow.js — 細流智慧排程純邏輯。無 DOM、無網路、無儲存。
// 瀏覽器當全域 CNXFineFlow、Node 當模組。
(function (root) {
  'use strict';

  var MINUTE_MS = 60000;
  var ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function asInt(value, fallback, min) {
    var number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    number = Math.round(number);
    return number >= (min == null ? 0 : min) ? number : fallback;
  }

  function validIso(value) {
    return typeof value === 'string' && ISO_WITH_ZONE.test(value) && Number.isFinite(Date.parse(value));
  }

  function offsetSuffix(iso) {
    if (/Z$/.test(iso)) return 'Z';
    var match = iso.match(/([+-]\d{2}:\d{2})$/);
    return match ? match[1] : 'Z';
  }

  function offsetMinutes(iso) {
    var suffix = offsetSuffix(iso);
    if (suffix === 'Z') return 0;
    var sign = suffix.charAt(0) === '-' ? -1 : 1;
    return sign * (Number(suffix.slice(1, 3)) * 60 + Number(suffix.slice(4, 6)));
  }

  function pad(number) { return String(number).padStart(2, '0'); }

  function formatAtOffset(epochMs, referenceIso) {
    var suffix = offsetSuffix(referenceIso);
    var local = new Date(epochMs + offsetMinutes(referenceIso) * MINUTE_MS);
    return local.getUTCFullYear() + '-' + pad(local.getUTCMonth() + 1) + '-' + pad(local.getUTCDate()) +
      'T' + pad(local.getUTCHours()) + ':' + pad(local.getUTCMinutes()) + ':00' + suffix;
  }

  function shiftIso(iso, minutes) {
    if (!validIso(iso)) return null;
    return formatAtOffset(Date.parse(iso) + minutes * MINUTE_MS, iso);
  }

  function sameCalendarDate(a, b) {
    return typeof a === 'string' && typeof b === 'string' && a.slice(0, 10) === b.slice(0, 10);
  }

  function fineDayId(occurrence) {
    if (!occurrence || !occurrence.fine || !validIso(occurrence.fine.startAt)) return null;
    return occurrence.fine.startAt.slice(5, 7) + occurrence.fine.startAt.slice(8, 10);
  }

  function scheduleDayId(occurrence) {
    return fineDayId(occurrence) || (occurrence && typeof occurrence.day === 'string' ? occurrence.day : null);
  }

  function normalizeFineOccurrence(occurrence, trip) {
    var out = clone(occurrence || {});
    out.id = typeof out.id === 'string' ? out.id : '';
    out.placeId = typeof out.placeId === 'string' ? out.placeId : null;
    out.todos = Array.isArray(out.todos) ? out.todos : [];
    if (!out.fine || typeof out.fine !== 'object' || !validIso(out.fine.startAt) || !validIso(out.fine.endAt) || Date.parse(out.fine.endAt) <= Date.parse(out.fine.startAt)) {
      out.fine = null;
      return out;
    }

    var duration = Math.round((Date.parse(out.fine.endAt) - Date.parse(out.fine.startAt)) / MINUTE_MS);
    if (duration <= 0) {
      out.fine = null;
      return out;
    }
    var fine = clone(out.fine);
    fine.originalDurationMin = asInt(fine.originalDurationMin, duration, 1);
    fine.fixedMarker = !!fine.fixedMarker;
    fine.manualOrder = asInt(fine.manualOrder, 0, 0);
    out.fine = fine;
    out.startTime = fine.startAt.slice(11, 16);
    if (!out.scheduleKind) out.scheduleKind = out.placeId ? 'place' : 'custom';
    return out;
  }

  function occurrenceInterval(occurrence) {
    if (!occurrence || !occurrence.fine || !validIso(occurrence.fine.startAt) || !validIso(occurrence.fine.endAt)) return null;
    var startMs = Date.parse(occurrence.fine.startAt);
    var endMs = Date.parse(occurrence.fine.endAt);
    if (!(endMs > startMs)) return null;
    return {
      startAt: occurrence.fine.startAt,
      endAt: occurrence.fine.endAt,
      startMs: startMs,
      endMs: endMs,
      durationMin: Math.round((endMs - startMs) / MINUTE_MS),
      crossesDay: !sameCalendarDate(occurrence.fine.startAt, occurrence.fine.endAt)
    };
  }

  function sortFineOccurrences(occurrences) {
    return (occurrences || []).slice().sort(function (a, b) {
      var ai = occurrenceInterval(a);
      var bi = occurrenceInterval(b);
      if (ai && bi && ai.startMs !== bi.startMs) return ai.startMs - bi.startMs;
      if (ai && !bi) return -1;
      if (!ai && bi) return 1;
      var ao = a && a.fine ? asInt(a.fine.manualOrder, 0, 0) : 0;
      var bo = b && b.fine ? asInt(b.fine.manualOrder, 0, 0) : 0;
      if (ao !== bo) return ao - bo;
      return String(a && a.id || '').localeCompare(String(b && b.id || ''));
    });
  }

  function buildDaySchedule(version, day, trip) {
    var plan = version && Array.isArray(version.plan) ? version.plan : [];
    var all = plan
      .filter(function (item) { return item && scheduleDayId(item) === day; })
      .map(function (item) { return normalizeFineOccurrence(item, trip || {}); });
    var items = [];
    var unscheduled = [];
    all.forEach(function (item) { (occurrenceInterval(item) ? items : unscheduled).push(item); });
    items = sortFineOccurrences(items);
    unscheduled = sortFineOccurrences(unscheduled);
    return {
      day: day,
      timeZone: trip && trip.timeZone || 'Asia/Bangkok',
      items: items,
      unscheduled: unscheduled,
      all: items.concat(unscheduled)
    };
  }

  function stableObject(value) {
    if (Array.isArray(value)) return value.map(stableObject);
    if (!value || typeof value !== 'object') return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      if (typeof value[key] !== 'undefined') out[key] = stableObject(value[key]);
    });
    return out;
  }

  function baseFingerprint(input) {
    var items;
    if (Array.isArray(input)) items = input;
    else if (input && Array.isArray(input.all)) items = input.all;
    else if (input) items = (input.items || []).concat(input.unscheduled || []);
    else items = [];
    var canonical = items.slice().sort(function (a, b) { return String(a.id || '').localeCompare(String(b.id || '')); }).map(stableObject);
    var text = JSON.stringify(canonical);
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return 'ff-' + (hash >>> 0).toString(16).padStart(8, '0');
  }

  function asSchedule(value) {
    if (Array.isArray(value)) return { day: null, timeZone: null, items: sortFineOccurrences(value), unscheduled: [], all: sortFineOccurrences(value) };
    value = value || {};
    var items = sortFineOccurrences(value.items || []);
    var unscheduled = (value.unscheduled || []).slice();
    return {
      day: value.day || null,
      timeZone: value.timeZone || null,
      items: items,
      unscheduled: unscheduled,
      all: items.concat(unscheduled)
    };
  }

  // 固定＝「標記為固定行程」；航班／已預訂交通在資料遷移時就寫進 fine.fixedMarker，不再靠 scheduleKind 判斷。
  function isFixed(item) {
    return !!(item && item.fine && item.fine.fixedMarker);
  }

  function isAutoMovable(item) {
    return !!(item && item.fine) && !isFixed(item);
  }

  function continuousMovableBlock(schedule, startIndex, options) {
    options = options || {};
    var items = asSchedule(schedule).items;
    var maxGap = options.maxGapMin == null ? 60 : Math.max(0, Number(options.maxGapMin));
    var out = [];
    for (var i = Math.max(0, startIndex); i < items.length; i++) {
      var item = items[i];
      if ((!options.allowFixedStart || i !== startIndex) && !isAutoMovable(item)) break;
      if (i > startIndex) {
        var previous = occurrenceInterval(items[i - 1]);
        var current = occurrenceInterval(item);
        var gap = (current.startMs - previous.endMs) / MINUTE_MS;
        if (gap > maxGap) break;
      }
      out.push(item);
    }
    return out;
  }

  function findFixedAnchor(schedule, startIndex, direction) {
    var items = asSchedule(schedule).items;
    var step = direction === 'backward' || direction === -1 ? -1 : 1;
    for (var i = startIndex; i >= 0 && i < items.length; i += step) {
      if (isFixed(items[i])) return items[i];
    }
    return null;
  }


  function changeTimes(item, request) {
    var out = clone(item);
    var interval = occurrenceInterval(out);
    if (!interval) throw new Error('Occurrence has no valid fine interval: ' + out.id);
    var startAt = request.startAt || request.newStartAt || interval.startAt;
    var hasEnd = !!(request.endAt || request.newEndAt);
    var endAt = request.endAt || request.newEndAt || shiftIso(startAt, interval.durationMin);
    if (!validIso(startAt) || !validIso(endAt) || Date.parse(endAt) <= Date.parse(startAt)) throw new Error('Invalid fineflow datetime change');
    out.fine.startAt = startAt;
    out.fine.endAt = endAt;
    out.startTime = startAt.slice(11, 16);
    if (hasEnd && !out.fine.originalDurationMin) out.fine.originalDurationMin = interval.durationMin;
    if (Object.prototype.hasOwnProperty.call(request, 'fixedMarker')) out.fine.fixedMarker = !!request.fixedMarker;
    return out;
  }

  function shifted(item, minutes) {
    var out = clone(item);
    out.fine.startAt = shiftIso(out.fine.startAt, minutes);
    out.fine.endAt = shiftIso(out.fine.endAt, minutes);
    out.startTime = out.fine.startAt.slice(11, 16);
    return out;
  }

  function scheduleWithItems(base, items) {
    var sorted = sortFineOccurrences(items);
    return {
      day: base.day,
      timeZone: base.timeZone,
      items: sorted,
      unscheduled: clone(base.unscheduled || []),
      all: sorted.concat(clone(base.unscheduled || []))
    };
  }

  function makeMutations(beforeSchedule, afterSchedule, reasons, fallbackReason) {
    var beforeById = {};
    beforeSchedule.items.forEach(function (item) { beforeById[item.id] = item; });
    var mutations = [];
    afterSchedule.items.forEach(function (item) {
      var before = beforeById[item.id];
      if (before && JSON.stringify(before) !== JSON.stringify(item)) {
        mutations.push({ occurrenceId: item.id, before: clone(before), after: clone(item), reason: reasons[item.id] || fallbackReason });
      }
    });
    return mutations;
  }

  function summaryFor(transaction) {
    var moved = 0;
    var shortened = 0;
    transaction.mutations.forEach(function (mutation) {
      var before = occurrenceInterval(mutation.before);
      var after = occurrenceInterval(mutation.after);
      if (before && after && before.startMs !== after.startMs) moved++;
      if (before && after && after.durationMin < before.durationMin) shortened++;
    });
    var end = null;
    transaction.afterSchedule.items.forEach(function (item) {
      if (!end || Date.parse(item.fine.endAt) > Date.parse(end)) end = item.fine.endAt;
    });
    return { moved: moved, shortened: shortened, newDayEndAt: end };
  }

  function newTransaction(operation, base, after, request, reasons) {
    base = asSchedule(base);
    after = scheduleWithItems(base, after.items || after);
    var transaction = {
      id: request.transactionId || 'ff_' + operation + '_' + baseFingerprint(base),
      operation: operation,
      versionId: request.versionId || null,
      day: base.day,
      baseFingerprint: baseFingerprint(base),
      mutations: makeMutations(base, after, reasons || {}, operation),
      summary: null,
      beforeSchedule: clone(base),
      afterSchedule: clone(after),
      rules: clone(request.rules || {})
    };
    transaction.summary = summaryFor(transaction);
    return transaction;
  }

  function previewSingleChange(schedule, request) {
    request = request || {};
    var base = asSchedule(schedule);
    var reasons = {};
    var found = false;
    var items = base.items.map(function (item) {
      if (item.id !== request.occurrenceId) return clone(item);
      found = true;
      reasons[item.id] = 'single_change';
      return changeTimes(item, request);
    });
    if (!found) throw new Error('Unknown occurrence: ' + request.occurrenceId);
    return newTransaction('single', base, items, request, reasons);
  }

  function dayIdFromIso(iso) {
    return validIso(iso) ? iso.slice(5, 7) + iso.slice(8, 10) : null;
  }

  function crossDayMutations(beforeSchedules, afterSchedules, days, reasons) {
    var beforeById = {};
    var afterById = {};
    days.forEach(function (day) {
      beforeSchedules[day].items.forEach(function (item) { beforeById[item.id] = item; });
      afterSchedules[day].items.forEach(function (item) { afterById[item.id] = item; });
    });
    return Object.keys(afterById).sort().filter(function (id) {
      return beforeById[id] && JSON.stringify(beforeById[id]) !== JSON.stringify(afterById[id]);
    }).map(function (id) {
      return { occurrenceId: id, before: clone(beforeById[id]), after: clone(afterById[id]), reason: reasons[id] || 'cross_day_change' };
    });
  }

  function attachCrossDay(transaction) {
    transaction.summary = summaryFor(transaction);
    return transaction;
  }

  function previewCrossDayChange(version, request, trip) {
    request = request || {};
    trip = trip || {};
    if (!version || !Array.isArray(version.plan)) throw new Error('Version plan is required');
    var original = version.plan.find(function (item) { return item && item.id === request.occurrenceId; });
    if (!original || !occurrenceInterval(original)) throw new Error('Unknown timed occurrence: ' + request.occurrenceId);
    var sourceDay = request.sourceDay || scheduleDayId(original);
    var targetDay = request.targetDay || dayIdFromIso(request.startAt || request.newStartAt);
    if (!sourceDay || !targetDay) throw new Error('Cross-day change requires sourceDay and targetDay');
    if (sourceDay === targetDay) {
      return previewSingleChange(buildDaySchedule(version, sourceDay, trip), request);
    }
    if (scheduleDayId(original) !== sourceDay) throw new Error('Occurrence is not in the requested source day');
    var moved = changeTimes(original, request);
    if (dayIdFromIso(moved.fine.startAt) !== targetDay) throw new Error('Changed startAt is not in the requested target day');

    var days = [sourceDay, targetDay];
    var beforeSchedules = {};
    var afterSchedules = {};
    var baseFingerprints = {};
    days.forEach(function (day) {
      beforeSchedules[day] = asSchedule(buildDaySchedule(version, day, trip));
      baseFingerprints[day] = baseFingerprint(beforeSchedules[day]);
    });
    afterSchedules[sourceDay] = scheduleWithItems(beforeSchedules[sourceDay], beforeSchedules[sourceDay].items.filter(function (item) {
      return item.id !== original.id;
    }));
    afterSchedules[targetDay] = scheduleWithItems(beforeSchedules[targetDay], beforeSchedules[targetDay].items.concat([moved]));
    var reasons = {};
    reasons[original.id] = 'cross_day_change';
    if (request.strategy === 'ripple' || request.mode === 'ripple') {
      var movedIndex = afterSchedules[targetDay].items.findIndex(function (item) { return item.id === original.id; });
      var followingItem = afterSchedules[targetDay].items[movedIndex + 1];
      var movedInterval = occurrenceInterval(moved);
      var followingInterval = occurrenceInterval(followingItem);
      var overlapMinutes = followingInterval ? Math.max(0, Math.ceil((movedInterval.endMs - followingInterval.startMs) / MINUTE_MS)) : 0;
      if (overlapMinutes > 0) {
        var followingBlock = continuousMovableBlock(afterSchedules[targetDay], movedIndex + 1, {
          maxGapMin: request.rules && request.rules.maxContinuousGapMin
        });
        var followingIds = {};
        followingBlock.forEach(function (item) { followingIds[item.id] = true; });
        afterSchedules[targetDay] = scheduleWithItems(afterSchedules[targetDay], afterSchedules[targetDay].items.map(function (item) {
          if (!followingIds[item.id]) return item;
          reasons[item.id] = 'cross_day_ripple_following';
          return shifted(item, overlapMinutes);
        }));
      }
    }
    var mutations = crossDayMutations(beforeSchedules, afterSchedules, days, reasons);
    var transaction = {
      id: request.transactionId || 'ff_cross_day_' + baseFingerprints[sourceDay] + '_' + baseFingerprints[targetDay],
      operation: 'cross_day',
      occurrenceId: original.id,
      versionId: request.versionId || null,
      day: sourceDay,
      days: days,
      sourceDay: sourceDay,
      targetDay: targetDay,
      baseFingerprint: baseFingerprints[sourceDay],
      baseFingerprints: baseFingerprints,
      mutations: mutations,
      summary: null,
      beforeSchedule: clone(beforeSchedules[sourceDay]),
      afterSchedule: clone(afterSchedules[targetDay]),
      beforeSchedules: clone(beforeSchedules),
      afterSchedules: clone(afterSchedules),
      rules: clone(request.rules || {}),
      planOrderBefore: version.plan.map(function (item) { return item && item.id; })
    };
    return attachCrossDay(transaction);
  }

  function previewRippleChange(schedule, request) {
    request = request || {};
    var base = asSchedule(schedule);
    var index = base.items.findIndex(function (item) { return item.id === request.occurrenceId; });
    if (index < 0) throw new Error('Unknown occurrence: ' + request.occurrenceId);
    var selectedBefore = base.items[index];
    var selectedAfter = changeTimes(selectedBefore, request);
    var delta = Math.round((occurrenceInterval(selectedAfter).endMs - occurrenceInterval(selectedBefore).endMs) / MINUTE_MS);
    var movable = continuousMovableBlock(base, index + 1, { maxGapMin: request.rules && request.rules.maxContinuousGapMin });
    var movableIds = {};
    movable.forEach(function (item) { movableIds[item.id] = true; });
    var reasons = {};
    var items = base.items.map(function (item) {
      if (item.id === selectedBefore.id) {
        reasons[item.id] = 'ripple_origin';
        return selectedAfter;
      }
      if (delta && movableIds[item.id]) {
        reasons[item.id] = 'ripple_following';
        return shifted(item, delta);
      }
      return clone(item);
    });
    return newTransaction('ripple', base, items, request, reasons);
  }

  function previewSwap(schedule, request) {
    request = request || {};
    var base = asSchedule(schedule);
    var first = base.items.find(function (item) { return item.id === request.occurrenceId; });
    var second = base.items.find(function (item) { return item.id === request.targetOccurrenceId; });
    if (!first || !second || first.id === second.id) throw new Error('Swap requires two different stable occurrence IDs');
    var firstInterval = occurrenceInterval(first);
    var secondInterval = occurrenceInterval(second);
    var reasons = {};
    reasons[first.id] = 'swap';
    reasons[second.id] = 'swap';
    var items = base.items.map(function (item) {
      if (item.id === first.id) {
        var movedFirst = clone(item);
        movedFirst.fine.startAt = secondInterval.startAt;
        movedFirst.fine.endAt = shiftIso(secondInterval.startAt, firstInterval.durationMin);
        movedFirst.startTime = movedFirst.fine.startAt.slice(11, 16);
        return movedFirst;
      }
      if (item.id === second.id) {
        var movedSecond = clone(item);
        movedSecond.fine.startAt = firstInterval.startAt;
        movedSecond.fine.endAt = shiftIso(firstInterval.startAt, secondInterval.durationMin);
        movedSecond.startTime = movedSecond.fine.startAt.slice(11, 16);
        return movedSecond;
      }
      return clone(item);
    });
    return newTransaction('swap', base, items, request, reasons);
  }

  function reorderVersionDay(out, day) {
    var dayIndexes = [];
    var dayItems = [];
    out.plan.forEach(function (item, index) {
      if (scheduleDayId(item) === day) {
        dayIndexes.push(index);
        dayItems.push(item);
      }
    });
    var timed = sortFineOccurrences(dayItems.filter(function (item) { return occurrenceInterval(item); }));
    var untimed = dayItems.filter(function (item) { return !occurrenceInterval(item); });
    timed.concat(untimed).forEach(function (item, index) { out.plan[dayIndexes[index]] = item; });
  }

  function restorePlanOrder(plan, order) {
    if (!Array.isArray(order) || !order.length) return plan;
    var positions = {};
    order.forEach(function (id, index) { if (!Object.prototype.hasOwnProperty.call(positions, id)) positions[id] = index; });
    return plan.map(function (item, index) { return { item: item, index: index }; }).sort(function (a, b) {
      var ai = Object.prototype.hasOwnProperty.call(positions, a.item && a.item.id) ? positions[a.item.id] : order.length + a.index;
      var bi = Object.prototype.hasOwnProperty.call(positions, b.item && b.item.id) ? positions[b.item.id] : order.length + b.index;
      return ai - bi;
    }).map(function (entry) { return entry.item; });
  }

  function applyCrossDayTransaction(version, transaction) {
    if (transaction.versionId && version.id !== transaction.versionId) {
      var wrongVersion = new Error('Fineflow preview belongs to a different version');
      wrongVersion.code = 'FINEFLOW_STALE_BASE';
      throw wrongVersion;
    }
    transaction.days.forEach(function (day) {
      var before = transaction.beforeSchedules[day];
      var current = buildDaySchedule(version, day, { timeZone: before && before.timeZone || 'Asia/Bangkok' });
      if (baseFingerprint(current) !== transaction.baseFingerprints[day]) {
        var stale = new Error('Fineflow preview is stale on day ' + day + '; recalculate before applying');
        stale.code = 'FINEFLOW_STALE_BASE';
        stale.day = day;
        throw stale;
      }
    });
    var afterById = {};
    transaction.mutations.forEach(function (mutation) { afterById[mutation.occurrenceId] = clone(mutation.after); });
    var out = clone(version);
    out.plan = out.plan.map(function (item) { return afterById[item.id] || item; });
    transaction.days.forEach(function (day) { reorderVersionDay(out, day); });
    if (transaction.restorePlanOrder) out.plan = restorePlanOrder(out.plan, transaction.restorePlanOrder);
    return out;
  }

  function applyTransaction(version, transaction) {
    if (!version || !Array.isArray(version.plan)) throw new Error('Version plan is required');
    if (transaction && Array.isArray(transaction.days) && transaction.beforeSchedules && transaction.baseFingerprints) {
      return applyCrossDayTransaction(version, transaction);
    }
    if (transaction.versionId && version.id !== transaction.versionId) {
      var wrongVersion = new Error('Fineflow preview belongs to a different version');
      wrongVersion.code = 'FINEFLOW_STALE_BASE';
      throw wrongVersion;
    }
    var current = buildDaySchedule(version, transaction.day, { timeZone: transaction.beforeSchedule && transaction.beforeSchedule.timeZone || 'Asia/Bangkok' });
    if (baseFingerprint(current) !== transaction.baseFingerprint) {
      var stale = new Error('Fineflow preview is stale; recalculate before applying');
      stale.code = 'FINEFLOW_STALE_BASE';
      throw stale;
    }
    var afterById = {};
    transaction.mutations.forEach(function (mutation) { afterById[mutation.occurrenceId] = clone(mutation.after); });
    var out = clone(version);
    out.plan = out.plan.map(function (item) { return afterById[item.id] || item; });
    var dayIndexes = [];
    var dayItems = [];
    out.plan.forEach(function (item, index) {
      if (scheduleDayId(item) === transaction.day) {
        dayIndexes.push(index);
        dayItems.push(item);
      }
    });
    var timed = sortFineOccurrences(dayItems.filter(function (item) { return occurrenceInterval(item); }));
    var untimed = dayItems.filter(function (item) { return !occurrenceInterval(item); });
    timed.concat(untimed).forEach(function (item, index) { out.plan[dayIndexes[index]] = item; });
    return out;
  }

  function invertTransaction(transaction, appliedVersion) {
    if (transaction && Array.isArray(transaction.days) && transaction.beforeSchedules && transaction.afterSchedules) {
      var currentSchedules = {};
      var fingerprints = {};
      transaction.days.forEach(function (day) {
        var current = buildDaySchedule(appliedVersion, day, { timeZone: transaction.afterSchedules[day] && transaction.afterSchedules[day].timeZone || 'Asia/Bangkok' });
        currentSchedules[day] = current;
        fingerprints[day] = baseFingerprint(current);
      });
      var inverseMutations = transaction.mutations.map(function (mutation) {
        return { occurrenceId: mutation.occurrenceId, before: clone(mutation.after), after: clone(mutation.before), reason: 'undo_' + mutation.reason };
      });
      var inverse = {
        id: transaction.id + '_undo',
        operation: 'undo',
        occurrenceId: transaction.occurrenceId || transaction.mutations[0].occurrenceId,
        versionId: transaction.versionId,
        day: transaction.targetDay,
        days: clone(transaction.days),
        sourceDay: transaction.targetDay,
        targetDay: transaction.sourceDay,
        baseFingerprint: fingerprints[transaction.targetDay],
        baseFingerprints: fingerprints,
        mutations: inverseMutations,
        summary: null,
        beforeSchedule: clone(currentSchedules[transaction.targetDay]),
        afterSchedule: clone(transaction.beforeSchedules[transaction.sourceDay]),
        beforeSchedules: clone(currentSchedules),
        afterSchedules: clone(transaction.beforeSchedules),
        rules: clone(transaction.rules || {}),
        planOrderBefore: appliedVersion.plan.map(function (item) { return item && item.id; }),
        restorePlanOrder: clone(transaction.planOrderBefore || null)
      };
      return attachCrossDay(inverse);
    }
    var current = buildDaySchedule(appliedVersion, transaction.day, { timeZone: transaction.afterSchedule && transaction.afterSchedule.timeZone || 'Asia/Bangkok' });
    var inverse = {
      id: transaction.id + '_undo',
      operation: 'undo',
      versionId: transaction.versionId,
      day: transaction.day,
      baseFingerprint: baseFingerprint(current),
      mutations: transaction.mutations.map(function (mutation) {
        return { occurrenceId: mutation.occurrenceId, before: clone(mutation.after), after: clone(mutation.before), reason: 'undo_' + mutation.reason };
      }),
      summary: null,
      beforeSchedule: clone(current),
      afterSchedule: clone(transaction.beforeSchedule),
      rules: clone(transaction.rules || {})
    };
    inverse.summary = summaryFor(inverse);
    return inverse;
  }

  var api = {
    normalizeFineOccurrence: normalizeFineOccurrence,
    fineDayId: fineDayId,
    scheduleDayId: scheduleDayId,
    occurrenceInterval: occurrenceInterval,
    sortFineOccurrences: sortFineOccurrences,
    buildDaySchedule: buildDaySchedule,
    previewSingleChange: previewSingleChange,
    previewCrossDayChange: previewCrossDayChange,
    previewRippleChange: previewRippleChange,
    previewSwap: previewSwap,
    applyTransaction: applyTransaction,
    continuousMovableBlock: continuousMovableBlock,
    findFixedAnchor: findFixedAnchor,
    baseFingerprint: baseFingerprint,
    fingerprintSchedule: baseFingerprint,
    invertTransaction: invertTransaction
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CNXFineFlow = api;
})(typeof self !== 'undefined' ? self : this);
