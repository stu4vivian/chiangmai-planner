// fineflow.js — 細流智慧排程純邏輯。無 DOM、無網路、無儲存。
// 瀏覽器當全域 CNXFineFlow、Node 當模組。
(function (root) {
  'use strict';

  var MINUTE_MS = 60000;
  var ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  var COMPRESSIBILITY = { none: 1, suggest: 1, free: 1 };
  var COMMITMENT = { flexible: 1, preferred: 1, external: 1 };
  var MOVE_POLICY = { auto: 1, confirm: 1, manual: 1 };

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

  function normalizeFineOccurrence(occurrence, trip) {
    var out = clone(occurrence || {});
    out.id = typeof out.id === 'string' ? out.id : '';
    out.placeId = typeof out.placeId === 'string' ? out.placeId : null;
    out.todos = Array.isArray(out.todos) ? out.todos : [];
    if (Object.prototype.hasOwnProperty.call(out, 'transport') && (!out.transport || typeof out.transport !== 'object')) out.transport = null;
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
    fine.minDurationMin = Math.min(duration, asInt(fine.minDurationMin, duration, 1));
    fine.compressibility = COMPRESSIBILITY[fine.compressibility] ? fine.compressibility : 'none';
    fine.fixedMarker = !!fine.fixedMarker;
    fine.timeCommitment = COMMITMENT[fine.timeCommitment] ? fine.timeCommitment : 'flexible';
    fine.autoMovePolicy = MOVE_POLICY[fine.autoMovePolicy] ? fine.autoMovePolicy : 'auto';
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
    var all = (version && Array.isArray(version.plan) ? version.plan : [])
      .filter(function (item) { return item && item.day === day; })
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
      dayEndAt: value.dayEndAt || null,
      items: items,
      unscheduled: unscheduled,
      all: items.concat(unscheduled)
    };
  }

  function classifyTransportOccurrence(occurrence) {
    var kind = occurrence && occurrence.scheduleKind;
    if (kind === 'connector_travel') return { key: 'connector', fixed: false, shortenable: false, requiresConfirmation: false };
    if (kind === 'booked_transport') return { key: 'booked', fixed: true, shortenable: false, requiresConfirmation: true };
    if (kind === 'flight') return { key: 'long_haul', fixed: true, shortenable: false, requiresConfirmation: true };
    return null;
  }

  function isFixed(item) {
    var transportClass = classifyTransportOccurrence(item);
    return !!(item && item.fine && (item.fine.fixedMarker || item.fine.timeCommitment === 'external' || item.fine.autoMovePolicy === 'manual')) || !!(transportClass && transportClass.fixed);
  }

  function isAutoMovable(item) {
    return !!(item && item.fine && !isFixed(item) && item.fine.autoMovePolicy === 'auto');
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

  function issueId(type, occurrenceIds) {
    return type + ':' + occurrenceIds.join('>');
  }

  function makeIssue(type, ids, minutes, message, severity, extra) {
    return Object.assign({
      id: issueId(type, ids),
      type: type,
      status: 'new',
      severity: severity || 'warning',
      occurrenceIds: ids,
      minutes: Math.max(0, Math.round(minutes || 0)),
      message: message,
      resolutions: []
    }, extra || {});
  }

  function derivedDayEnd(schedule, context) {
    if (context && validIso(context.dayEndAt)) return context.dayEndAt;
    if (validIso(schedule.dayEndAt)) return schedule.dayEndAt;
    var first = schedule.items[0];
    if (!first || !first.fine || !validIso(first.fine.startAt)) return null;
    var start = first.fine.startAt;
    var midnight = start.slice(0, 10) + 'T00:00:00' + offsetSuffix(start);
    return shiftIso(midnight, 24 * 60);
  }

  function rawIssues(schedule, context) {
    schedule = asSchedule(schedule);
    context = context || {};
    var items = schedule.items;
    var issues = [];
    for (var i = 1; i < items.length; i++) {
      var previous = occurrenceInterval(items[i - 1]);
      var current = occurrenceInterval(items[i]);
      var delta = Math.round((current.startMs - previous.endMs) / MINUTE_MS);
      var intentionalGapId = issueId('gap', [items[i - 1].id, items[i].id]);
      var intentionalGaps = context.intentionalGapIds || [];
      var intentional = !!(items[i].fine && items[i].fine.intentionalGapBefore) || intentionalGaps.indexOf(intentionalGapId) >= 0;
      if (delta > 0 && !intentional) {
        issues.push(makeIssue('gap', [items[i - 1].id, items[i].id], delta, '兩項行程之間有 ' + delta + ' 分鐘空檔', 'info'));
      } else if (delta < 0) {
        var acceptedWith = items[i].fine && Array.isArray(items[i].fine.acceptedConflictWith) ? items[i].fine.acceptedConflictWith : [];
        issues.push(makeIssue('conflict', [items[i - 1].id, items[i].id], -delta, '兩項行程重疊 ' + (-delta) + ' 分鐘', 'warning', {
          accepted: acceptedWith.indexOf(items[i - 1].id) >= 0
        }));
      }
    }

    items.forEach(function (item, index) {
      var transportClass = classifyTransportOccurrence(item);
      if (!transportClass) {
        var missingLocations = context.missingLocationOccurrenceIds || [];
        if (item.scheduleKind === 'place' && (!item.placeId || missingLocations.indexOf(item.id) >= 0)) {
          issues.push(makeIssue('unknown_travel', [item.id], 0, '地點資料不足，無法確認前後交通', 'warning'));
        }
        return;
      }
      var interval = occurrenceInterval(item);
      var transport = item.transport;
      if (!transport || !asInt(transport.minDurationMin, 0, 1) || !transport.fromOccurrenceId || !transport.toOccurrenceId) {
        issues.push(makeIssue('unknown_travel', [item.id], 0, '交通時間或起訖資料不足，無法確認路線', 'warning'));
        return;
      }
      var shortage = transport.minDurationMin - interval.durationMin;
      if (shortage > 0) issues.push(makeIssue('travel_shortage', [item.id], shortage, '交通至少還缺 ' + shortage + ' 分鐘', 'blocking'));
      var previousId = index > 0 ? items[index - 1].id : null;
      var nextId = index + 1 < items.length ? items[index + 1].id : null;
      if (previousId !== transport.fromOccurrenceId || nextId !== transport.toOccurrenceId) {
        issues.push(makeIssue('unknown_travel', [item.id], 0, '交通目前沒有連接原本的起點與終點，需重新確認路線', 'blocking', {
          expectedOccurrenceIds: [transport.fromOccurrenceId, transport.toOccurrenceId],
          actualOccurrenceIds: [previousId, nextId]
        }));
      }
    });

    var dayEndAt = derivedDayEnd(schedule, context);
    if (dayEndAt) {
      var dayEndMs = Date.parse(dayEndAt);
      items.forEach(function (item) {
        var interval = occurrenceInterval(item);
        if (interval.endMs > dayEndMs) {
          var minutes = Math.ceil((interval.endMs - dayEndMs) / MINUTE_MS);
          issues.push(makeIssue('day_overflow', [item.id], minutes, '行程超出當日 ' + minutes + ' 分鐘', 'blocking', { dayEndAt: dayEndAt }));
        }
      });
    }
    return issues;
  }

  function detectScheduleIssues(beforeSchedule, afterSchedule, context) {
    var before = asSchedule(beforeSchedule);
    var after = asSchedule(afterSchedule);
    var effectiveContext = clone(context || {});
    if (!effectiveContext.dayEndAt) effectiveContext.dayEndAt = derivedDayEnd(before, effectiveContext);
    var beforeIssues = rawIssues(before, effectiveContext);
    var afterIssues = rawIssues(after, effectiveContext);
    var beforeMap = {};
    var afterMap = {};
    beforeIssues.forEach(function (issue) { beforeMap[issue.id] = issue; });
    afterIssues.forEach(function (issue) { afterMap[issue.id] = issue; });

    var beforeItems = {};
    before.items.forEach(function (item) { beforeItems[item.id] = item; });
    after.items.forEach(function (item) {
      var old = beforeItems[item.id];
      if (!old || !isFixed(old) || !isFixed(item)) return;
      var oldInterval = occurrenceInterval(old);
      var newInterval = occurrenceInterval(item);
      if (oldInterval && newInterval && (oldInterval.startMs !== newInterval.startMs || oldInterval.endMs !== newInterval.endMs)) {
        var minutes = Math.max(Math.abs(newInterval.startMs - oldInterval.startMs), Math.abs(newInterval.endMs - oldInterval.endMs)) / MINUTE_MS;
        var issue = makeIssue('anchor_violation', [item.id], minutes, '固定標註行程被移動 ' + minutes + ' 分鐘', 'blocking');
        afterIssues.push(issue);
        afterMap[issue.id] = issue;
      }
    });

    var result = [];
    afterIssues.forEach(function (issue) {
      var old = beforeMap[issue.id];
      issue.status = !old ? 'new' : issue.minutes > old.minutes ? 'worsened' : 'preexisting';
      result.push(issue);
    });
    beforeIssues.forEach(function (issue) {
      if (!afterMap[issue.id]) {
        var resolved = clone(issue);
        resolved.status = 'resolved';
        resolved.severity = 'info';
        result.push(resolved);
      }
    });
    var priority = { worsened: 0, new: 1, preexisting: 2, resolved: 3 };
    return result.sort(function (a, b) {
      return priority[a.status] - priority[b.status] || a.id.localeCompare(b.id);
    });
  }

  function canShorten(item, minutes) {
    var transportClass = classifyTransportOccurrence(item);
    if (!item || !item.fine || transportClass || item.scheduleKind === 'sleep' || item.fine.compressibility === 'none') return false;
    var interval = occurrenceInterval(item);
    return !!interval && interval.durationMin - minutes >= item.fine.minDurationMin;
  }

  function suggestResolutions(issue, schedule, rules) {
    rules = rules || {};
    schedule = asSchedule(schedule);
    var byId = {};
    schedule.items.forEach(function (item) { byId[item.id] = item; });
    var out = [];
    function add(type, occurrenceId, label, extra) {
      out.push(Object.assign({
        id: issue.id + ':' + type + (occurrenceId ? ':' + occurrenceId : ''),
        type: type,
        issueId: issue.id,
        occurrenceId: occurrenceId || null,
        minutes: issue.minutes,
        label: label
      }, extra || {}));
    }
    if (!issue || issue.status === 'resolved') return out;
    if (issue.type === 'gap') {
      var gapTarget = byId[issue.occurrenceIds[1]];
      if (gapTarget && isAutoMovable(gapTarget)) add('connect', gapTarget.id, '接續後面行程 ' + issue.minutes + ' 分鐘');
      add('keep_gap', null, '保留 ' + issue.minutes + ' 分鐘空檔');
    } else if (issue.type === 'conflict') {
      var right = byId[issue.occurrenceIds[1]];
      if (right && isAutoMovable(right)) add('push', right.id, '後面順延 ' + issue.minutes + ' 分鐘');
      else if (right) add('override_anchor', right.id, '這次一起移動固定行程 ' + issue.minutes + ' 分鐘', { highRisk: true });
      issue.occurrenceIds.forEach(function (id) {
        if (canShorten(byId[id], issue.minutes)) add('shorten', id, '縮短 ' + id + ' ' + issue.minutes + ' 分鐘');
      });
      add('accept_conflict', null, '保留 ' + issue.minutes + ' 分鐘重疊');
    } else if (issue.type === 'travel_shortage') {
      var connector = byId[issue.occurrenceIds[0]];
      if (connector) add('push', connector.id, '補足交通時間並順延後面 ' + issue.minutes + ' 分鐘', { extendTravel: true });
    } else if (issue.type === 'unknown_travel') {
      var travel = byId[issue.occurrenceIds[0]];
      if (travel && classifyTransportOccurrence(travel) && issue.actualOccurrenceIds && issue.actualOccurrenceIds[0] && issue.actualOccurrenceIds[1]) {
        add('relink_transport', travel.id, '依目前前後行程重新連結交通', {
          fromOccurrenceId: issue.actualOccurrenceIds[0],
          toOccurrenceId: issue.actualOccurrenceIds[1]
        });
      }
    } else if (issue.type === 'anchor_violation') {
      add('override_anchor', issue.occurrenceIds[0], '仍要移動固定行程', { highRisk: true });
    }
    return out;
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
    if (Object.prototype.hasOwnProperty.call(request, 'compressibility') && COMPRESSIBILITY[request.compressibility]) out.fine.compressibility = request.compressibility;
    if (Object.prototype.hasOwnProperty.call(request, 'timeCommitment') && COMMITMENT[request.timeCommitment]) out.fine.timeCommitment = request.timeCommitment;
    if (Object.prototype.hasOwnProperty.call(request, 'autoMovePolicy') && MOVE_POLICY[request.autoMovePolicy]) out.fine.autoMovePolicy = request.autoMovePolicy;
    if (Object.prototype.hasOwnProperty.call(request, 'minDurationMin')) {
      var changedDuration = Math.round((Date.parse(endAt) - Date.parse(startAt)) / MINUTE_MS);
      out.fine.minDurationMin = Math.min(changedDuration, asInt(request.minDurationMin, out.fine.minDurationMin, 1));
    }
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
      dayEndAt: base.dayEndAt || null,
      items: sorted,
      unscheduled: clone(base.unscheduled || []),
      all: sorted.concat(clone(base.unscheduled || []))
    };
  }

  function mutationReasonMap(mutations) {
    var map = {};
    (mutations || []).forEach(function (mutation) { map[mutation.occurrenceId] = mutation.reason; });
    return map;
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
    var unresolved = transaction.issues.filter(function (issue) {
      return (issue.status === 'new' || issue.status === 'worsened') && !issue.accepted;
    }).length;
    var end = null;
    transaction.afterSchedule.items.forEach(function (item) {
      if (!end || Date.parse(item.fine.endAt) > Date.parse(end)) end = item.fine.endAt;
    });
    return { moved: moved, shortened: shortened, unresolved: unresolved, newDayEndAt: end };
  }

  function attachResolutions(transaction) {
    transaction.issues.forEach(function (issue) {
      issue.resolutions = suggestResolutions(issue, transaction.afterSchedule, transaction.rules || {});
      var selected = transaction.selectedResolutions && transaction.selectedResolutions[issue.id];
      if (selected && (selected.type === 'keep_gap' || selected.type === 'accept_conflict')) issue.accepted = true;
      if (selected && selected.type === 'override_anchor' && issue.type === 'anchor_violation') issue.accepted = true;
    });
    transaction.summary = summaryFor(transaction);
    return transaction;
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
      issues: detectScheduleIssues(base, after, request.context || {}),
      selectedResolutions: {},
      summary: null,
      beforeSchedule: clone(base),
      afterSchedule: clone(after),
      context: clone(request.context || {}),
      rules: clone(request.rules || {})
    };
    return attachResolutions(transaction);
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

  function resolutionById(transaction, resolutionId) {
    for (var i = 0; i < transaction.issues.length; i++) {
      var resolutions = transaction.issues[i].resolutions || [];
      for (var j = 0; j < resolutions.length; j++) if (resolutions[j].id === resolutionId) return resolutions[j];
    }
    return null;
  }

  function rebuildAfterResolution(transaction, items, reasons, selected) {
    var out = clone(transaction);
    out.afterSchedule = scheduleWithItems(out.beforeSchedule, items);
    out.mutations = makeMutations(out.beforeSchedule, out.afterSchedule, reasons, 'resolution');
    out.issues = detectScheduleIssues(out.beforeSchedule, out.afterSchedule, out.context || {});
    out.selectedResolutions = clone(transaction.selectedResolutions || {});
    out.selectedResolutions[selected.issueId] = clone(selected);
    return attachResolutions(out);
  }

  function applyResolution(transaction, resolutionId) {
    var resolution = typeof resolutionId === 'object' ? resolutionId : resolutionById(transaction, resolutionId);
    if (!resolution) throw new Error('Unknown resolution: ' + resolutionId);
    var out = clone(transaction);
    out.selectedResolutions = out.selectedResolutions || {};
    var items = clone(transaction.afterSchedule.items);
    var sourceIssue = transaction.issues.find(function (candidate) { return candidate.id === resolution.issueId; });
    if (resolution.type === 'override_anchor' && sourceIssue && sourceIssue.type === 'anchor_violation') {
      out.selectedResolutions[resolution.issueId] = clone(resolution);
      return attachResolutions(out);
    }
    if (resolution.type === 'keep_gap' || resolution.type === 'accept_conflict') {
      var acceptedIssue = sourceIssue;
      var targetId = acceptedIssue && acceptedIssue.occurrenceIds[1];
      var targetIndex = items.findIndex(function (item) { return item.id === targetId; });
      if (targetIndex < 0) throw new Error('Accepted issue target is missing');
      if (resolution.type === 'keep_gap') {
        items[targetIndex].fine.intentionalGapBefore = true;
      } else {
        var previousId = acceptedIssue.occurrenceIds[0];
        var acceptedWith = Array.isArray(items[targetIndex].fine.acceptedConflictWith) ? items[targetIndex].fine.acceptedConflictWith.slice() : [];
        if (acceptedWith.indexOf(previousId) < 0) acceptedWith.push(previousId);
        items[targetIndex].fine.acceptedConflictWith = acceptedWith;
      }
      var acceptanceReasons = mutationReasonMap(transaction.mutations);
      acceptanceReasons[targetId] = resolution.type;
      return rebuildAfterResolution(transaction, items, acceptanceReasons, resolution);
    }

    var index = items.findIndex(function (item) { return item.id === resolution.occurrenceId; });
    if (index < 0) throw new Error('Resolution occurrence is missing: ' + resolution.occurrenceId);
    var reasons = mutationReasonMap(transaction.mutations);
    if (resolution.type === 'shorten') {
      if (!canShorten(items[index], resolution.minutes)) throw new Error('Occurrence cannot be shortened safely');
      items[index].fine.endAt = shiftIso(items[index].fine.endAt, -resolution.minutes);
      reasons[items[index].id] = 'shorten';
    } else if (resolution.type === 'relink_transport') {
      var itemById = {};
      items.forEach(function (item) { itemById[item.id] = item; });
      function itemLabel(id) {
        var item = itemById[id] || {};
        return item.custom && item.custom.title || item.title || item.placeName || item.placeId || item.id || id;
      }
      items[index].transport = clone(items[index].transport || {});
      items[index].transport.fromOccurrenceId = resolution.fromOccurrenceId;
      items[index].transport.toOccurrenceId = resolution.toOccurrenceId;
      items[index].transport.routeLabel = itemLabel(resolution.fromOccurrenceId) + ' → ' + itemLabel(resolution.toOccurrenceId);
      reasons[items[index].id] = 'relink_transport';
    } else if (resolution.type === 'push' && resolution.extendTravel) {
      items[index].fine.endAt = shiftIso(items[index].fine.endAt, resolution.minutes);
      reasons[items[index].id] = 'extend_travel';
      var following = continuousMovableBlock({ items: items }, index + 1, { maxGapMin: transaction.rules && transaction.rules.maxContinuousGapMin });
      var followingIds = {};
      following.forEach(function (item) { followingIds[item.id] = true; });
      items = items.map(function (item) {
        if (!followingIds[item.id]) return item;
        reasons[item.id] = 'push_after_travel';
        return shifted(item, resolution.minutes);
      });
    } else {
      var direction = resolution.type === 'connect' ? -1 : 1;
      var block;
      if (resolution.type === 'override_anchor') {
        block = continuousMovableBlock({ items: items }, index, { maxGapMin: transaction.rules && transaction.rules.maxContinuousGapMin, allowFixedStart: true });
      } else {
        block = continuousMovableBlock({ items: items }, index, { maxGapMin: transaction.rules && transaction.rules.maxContinuousGapMin });
      }
      var ids = {};
      block.forEach(function (item) { ids[item.id] = true; });
      items = items.map(function (item) {
        if (!ids[item.id]) return item;
        reasons[item.id] = resolution.type;
        return shifted(item, direction * resolution.minutes);
      });
    }
    return rebuildAfterResolution(transaction, items, reasons, resolution);
  }

  function applyTransaction(version, transaction) {
    if (!version || !Array.isArray(version.plan)) throw new Error('Version plan is required');
    if (transaction.versionId && version.id !== transaction.versionId) {
      var wrongVersion = new Error('Fineflow preview belongs to a different version');
      wrongVersion.code = 'FINEFLOW_STALE_BASE';
      throw wrongVersion;
    }
    var blocking = (transaction.issues || []).filter(function (issue) {
      var requiresChoice = issue.severity === 'blocking' || issue.type === 'conflict';
      return requiresChoice && (issue.status === 'new' || issue.status === 'worsened') && !issue.accepted;
    });
    if (blocking.length && transaction.operation !== 'undo' && !(transaction.context && transaction.context.allowBlockingIssues)) {
      var unresolved = new Error('Fineflow transaction still has unresolved blocking issues');
      unresolved.code = 'FINEFLOW_UNRESOLVED_BLOCKING';
      unresolved.issues = clone(blocking);
      throw unresolved;
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
      if (item.day === transaction.day) {
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
      issues: detectScheduleIssues(current, transaction.beforeSchedule, transaction.context || {}),
      selectedResolutions: {},
      beforeSchedule: clone(current),
      afterSchedule: clone(transaction.beforeSchedule),
      context: clone(transaction.context || {}),
      rules: clone(transaction.rules || {})
    };
    return attachResolutions(inverse);
  }

  var api = {
    normalizeFineOccurrence: normalizeFineOccurrence,
    occurrenceInterval: occurrenceInterval,
    sortFineOccurrences: sortFineOccurrences,
    buildDaySchedule: buildDaySchedule,
    previewSingleChange: previewSingleChange,
    previewRippleChange: previewRippleChange,
    previewSwap: previewSwap,
    detectScheduleIssues: detectScheduleIssues,
    suggestResolutions: suggestResolutions,
    applyResolution: applyResolution,
    applyTransaction: applyTransaction,
    continuousMovableBlock: continuousMovableBlock,
    findFixedAnchor: findFixedAnchor,
    classifyTransportOccurrence: classifyTransportOccurrence,
    baseFingerprint: baseFingerprint,
    fingerprintSchedule: baseFingerprint,
    invertTransaction: invertTransaction
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CNXFineFlow = api;
})(typeof self !== 'undefined' ? self : this);
