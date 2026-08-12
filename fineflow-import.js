// fineflow-import.js — cnx-fineflow-import v1 驗證、dry-run 與 schema v21 adapter。
// 無 DOM、無網路、無儲存；瀏覽器當全域 CNXFineFlowImport，Node 當模組。
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./core.js'), require('./fineflow.js'));
  } else {
    root.CNXFineFlowImport = factory(root.CNXCore, root.CNXFineFlow);
  }
})(typeof self !== 'undefined' ? self : this, function (defaultCore, defaultFineflow) {
  'use strict';

  var FORMAT = 'cnx-fineflow-import';
  var VERSION = 1;
  var FIXED_ZONE_OFFSETS = {
    'Asia/Bangkok': '+07:00',
    'UTC': 'Z',
    'Etc/UTC': 'Z'
  };
  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
  var OFFSET_RE = /^(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/;

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function hash(value) {
    var input = String(value == null ? '' : value);
    var number = 2166136261;
    for (var i = 0; i < input.length; i++) {
      number ^= input.charCodeAt(i);
      number = Math.imul(number, 16777619);
    }
    return (number >>> 0).toString(16).padStart(8, '0');
  }

  function occurrenceIdFor(externalId) {
    return 'ffi_' + hash(externalId);
  }

  function slotFromTime(time) {
    if (defaultCore && typeof defaultCore.slotFromTime === 'function') return defaultCore.slotFromTime(time);
    var hour = Number(text(time).slice(0, 2));
    if (hour < 9) return 'breakfast';
    if (hour < 12) return 'am';
    if (hour < 14) return 'lunch';
    if (hour < 16) return 'afternoon';
    if (hour < 18) return 'evening';
    if (hour < 20) return 'dinner';
    return 'night';
  }

  function normalizeMapLinks(item, source) {
    var links = Array.isArray(item.mapLinks) ? item.mapLinks.slice() : [];
    if (source.mapsUrl) links.unshift({ label: text(item.title), url: source.mapsUrl, placeId: source.place && source.place.id || null });
    var seen = {};
    return links.map(function (link) {
      if (typeof link === 'string') link = { url: link };
      var url = text(link && link.url);
      if (!url || !isMapsUrl(url) || seen[url]) return null;
      seen[url] = true;
      return { label: text(link.label), url: url, placeId: text(link.placeId) || null };
    }).filter(Boolean);
  }

  function todoIdFor(itemExternalId, todoExternalId) {
    return 'ffi_t_' + hash(itemExternalId + '/' + todoExternalId);
  }

  function problem(index, externalId, field, code, message, details) {
    var out = {
      index: typeof index === 'number' ? index : null,
      externalId: externalId || null,
      field: field || null,
      code: code,
      message: message
    };
    if (details) out.details = clone(details);
    return out;
  }

  function isCalendarDate(value) {
    var match = text(value).match(DATE_RE);
    if (!match) return false;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function mergeZoneOffsets(options) {
    var out = Object.assign({}, FIXED_ZONE_OFFSETS);
    var extra = options && options.timeZoneOffsets;
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(function (zone) {
        if (OFFSET_RE.test(extra[zone])) out[zone] = extra[zone];
      });
    }
    return out;
  }

  function resolveOffset(timeZone, options) {
    var zone = text(timeZone);
    if (OFFSET_RE.test(zone)) return zone;
    var offsets = mergeZoneOffsets(options);
    return offsets[zone] || null;
  }

  function normalizeDateTime(date, time, timeZone, options) {
    var normalizedDate = text(date);
    var normalizedTime = text(time);
    if (!isCalendarDate(normalizedDate)) return null;
    if (!TIME_RE.test(normalizedTime)) return null;
    var offset = resolveOffset(timeZone, options);
    if (!offset) return null;
    return normalizedDate + 'T' + normalizedTime + ':00' + offset;
  }

  function isMapsUrl(value) {
    var raw = text(value);
    if (!raw) return false;
    try {
      var parsed = new URL(raw);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
      var host = parsed.hostname.toLowerCase();
      if (host === 'maps.app.goo.gl') return true;
      if (host === 'goo.gl') return parsed.pathname.indexOf('/maps') === 0;
      var googleHost = host === 'google.com' || host.slice(-11) === '.google.com' || /^google\.[a-z.]+$/.test(host) || /\.google\.[a-z.]+$/.test(host);
      return googleHost && (host.indexOf('maps.') === 0 || parsed.pathname.indexOf('/maps') === 0);
    } catch (_error) {
      return false;
    }
  }

  function importedSet(value) {
    if (value instanceof Set) return new Set(Array.from(value).map(String));
    return new Set((Array.isArray(value) ? value : []).map(String));
  }

  function payloadErrors(payload, options) {
    var errors = [];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      errors.push(problem(null, null, null, 'INVALID_PAYLOAD', '匯入資料必須是 JSON 物件'));
      return errors;
    }
    if (payload.format !== FORMAT) errors.push(problem(null, null, 'format', 'UNSUPPORTED_FORMAT', 'format 必須是 ' + FORMAT));
    if (payload.version !== VERSION) errors.push(problem(null, null, 'version', 'UNSUPPORTED_VERSION', '目前只支援匯入格式 v' + VERSION));
    if (!resolveOffset(payload.tripTimeZone, options)) {
      errors.push(problem(null, null, 'tripTimeZone', 'UNSUPPORTED_TIME_ZONE', '時區必須是 Asia/Bangkok、UTC、fixed offset，或由呼叫端提供對應偏移'));
    }
    if (!Array.isArray(payload.items)) errors.push(problem(null, null, 'items', 'INVALID_ITEMS', 'items 必須是陣列'));
    return errors;
  }

  function validateTodos(value, itemExternalId, index, errors) {
    if (value == null) return [];
    if (!Array.isArray(value)) {
      errors.push(problem(index, itemExternalId, 'todos', 'INVALID_TODOS', 'todos 必須是陣列'));
      return [];
    }
    var seen = new Set();
    var out = [];
    value.forEach(function (todo, todoIndex) {
      var field = 'todos[' + todoIndex + ']';
      if (!todo || typeof todo !== 'object' || Array.isArray(todo)) {
        errors.push(problem(index, itemExternalId, field, 'INVALID_TODO', '待辦必須是物件'));
        return;
      }
      var externalId = text(todo.externalId);
      var todoText = text(todo.text);
      var valid = true;
      if (!externalId) {
        valid = false;
        errors.push(problem(index, itemExternalId, field + '.externalId', 'MISSING_TODO_EXTERNAL_ID', '待辦必須有 externalId'));
      } else if (seen.has(externalId)) {
        valid = false;
        errors.push(problem(index, itemExternalId, field + '.externalId', 'DUPLICATE_TODO_EXTERNAL_ID', '同一行程的待辦 externalId 不可重複'));
      }
      else seen.add(externalId);
      if (!todoText) {
        valid = false;
        errors.push(problem(index, itemExternalId, field + '.text', 'MISSING_TODO_TEXT', '待辦文字不可為空'));
      }
      if (own(todo, 'done') && typeof todo.done !== 'boolean') {
        valid = false;
        errors.push(problem(index, itemExternalId, field + '.done', 'INVALID_TODO_DONE', 'done 必須是 true 或 false'));
      }
      if (valid) {
        out.push({ id: todoIdFor(itemExternalId, externalId), text: todoText, done: todo.done === true });
      }
    });
    return out;
  }

  function normalizeConstraints(value, durationMin, index, externalId, errors) {
    if (value == null) value = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(problem(index, externalId, 'constraints', 'INVALID_CONSTRAINTS', 'constraints 必須是物件'));
      return null;
    }
    if (own(value, 'fixed') && typeof value.fixed !== 'boolean') errors.push(problem(index, externalId, 'constraints.fixed', 'INVALID_FIXED', 'fixed 必須是 true 或 false'));
    if (own(value, 'allowRipple') && typeof value.allowRipple !== 'boolean') errors.push(problem(index, externalId, 'constraints.allowRipple', 'INVALID_ALLOW_RIPPLE', 'allowRipple 必須是 true 或 false'));
    var minimum = own(value, 'minDurationMinutes') ? Number(value.minDurationMinutes) : durationMin;
    if (!Number.isInteger(minimum) || minimum <= 0 || minimum > durationMin) {
      errors.push(problem(index, externalId, 'constraints.minDurationMinutes', 'INVALID_MIN_DURATION', '最短時長必須是 1 到行程總分鐘之間的整數'));
      return null;
    }
    return {
      fixed: value.fixed === true,
      minDurationMinutes: minimum,
      allowRipple: value.allowRipple !== false
    };
  }

  function resolveSource(item, places, core, index, externalId, errors, needsInput) {
    var source = item.source;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      errors.push(problem(index, externalId, 'source', 'INVALID_SOURCE', 'source 必須是物件'));
      return null;
    }
    var kind = text(source.kind);
    if (kind !== 'place-card' && kind !== 'maps' && kind !== 'custom') {
      errors.push(problem(index, externalId, 'source.kind', 'INVALID_SOURCE_KIND', 'source.kind 只能是 place-card、maps 或 custom'));
      return null;
    }
    if (kind === 'custom') return { kind: kind, place: null, mapsUrl: '' };

    if (kind === 'place-card') {
      var cardId = text(source.placeId);
      if (!cardId) {
        errors.push(problem(index, externalId, 'source.placeId', 'MISSING_PLACE_ID', 'place-card 必須提供既有卡片 placeId'));
        return null;
      }
      var card = places.find(function (place) { return place && place.id === cardId; });
      if (!card) {
        needsInput.push(problem(index, externalId, 'source.placeId', 'PLACE_CARD_NOT_FOUND', '找不到指定的行程卡片', { placeId: cardId }));
        return null;
      }
      return { kind: kind, place: card, mapsUrl: text(card.mapsUrl) };
    }

    var mapsUrl = text(source.mapsUrl);
    if (!isMapsUrl(mapsUrl)) {
      errors.push(problem(index, externalId, 'source.mapsUrl', 'INVALID_MAPS_URL', 'maps 來源必須提供合法的 Google Maps URL'));
      return null;
    }
    var coordinates = core.parseLatLngFromMapsUrl(mapsUrl);
    var anchor = {
      placeId: text(source.placeId) || null,
      cid: text(source.cid) || null,
      lat: coordinates && coordinates.lat,
      lng: coordinates && coordinates.lng,
      name: text(item.title)
    };
    var duplicate = core.findDuplicate(places, anchor);
    if (!duplicate) {
      needsInput.push(problem(index, externalId, 'source', coordinates ? 'MAPS_PLACE_CARD_REQUIRED' : 'MAPS_DETAILS_REQUIRED', coordinates ? '無法對應既有卡片；請確認後建立卡片' : '連結本身無可解析座標；請補齊地點資料', {
        mapsUrl: mapsUrl,
        placeDraft: {
          name: text(item.title),
          placeId: anchor.placeId,
          cid: anchor.cid,
          lat: coordinates ? coordinates.lat : null,
          lng: coordinates ? coordinates.lng : null,
          mapsUrl: mapsUrl,
          type: text(item.category) || '其他',
          note: text(item.notes)
        }
      }));
      return null;
    }
    return { kind: kind, place: duplicate, mapsUrl: mapsUrl };
  }

  function itemResult(item, index, context) {
    var errors = [];
    var needsInput = [];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { errors: [problem(index, null, null, 'INVALID_ITEM', '每筆 item 必須是物件')], needsInput: needsInput, occurrence: null };
    }
    var externalId = text(item.externalId);
    if (!externalId) errors.push(problem(index, null, 'externalId', 'MISSING_EXTERNAL_ID', '每筆行程必須有 externalId'));
    if (externalId.length > 200) errors.push(problem(index, externalId, 'externalId', 'EXTERNAL_ID_TOO_LONG', 'externalId 不可超過 200 字元'));
    var title = text(item.title);
    if (!title) errors.push(problem(index, externalId, 'title', 'MISSING_TITLE', '行程標題不可為空'));

    var startAt = normalizeDateTime(item.date, item.startTime, context.timeZone, context.options);
    var endAt = normalizeDateTime(item.date, item.endTime, context.timeZone, context.options);
    if (!isCalendarDate(item.date)) errors.push(problem(index, externalId, 'date', 'INVALID_DATE', '日期必須是真實存在的 YYYY-MM-DD'));
    var tripStart = text(context.options.tripStartDate || (context.options.trip && context.options.trip.startDate));
    var tripEnd = text(context.options.tripEndDate || (context.options.trip && context.options.trip.endDate));
    if (isCalendarDate(item.date) && ((tripStart && item.date < tripStart) || (tripEnd && item.date > tripEnd))) {
      errors.push(problem(index, externalId, 'date', 'DATE_OUTSIDE_TRIP', '日期必須在這趟旅程期間內'));
    }
    if (!TIME_RE.test(text(item.startTime))) errors.push(problem(index, externalId, 'startTime', 'INVALID_START_TIME', '開始時間必須是 HH:mm'));
    if (!TIME_RE.test(text(item.endTime))) errors.push(problem(index, externalId, 'endTime', 'INVALID_END_TIME', '結束時間必須是 HH:mm'));
    var durationMin = startAt && endAt ? Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60000) : 0;
    if (startAt && endAt && durationMin <= 0) errors.push(problem(index, externalId, 'endTime', 'END_NOT_AFTER_START', '結束時間必須晚於開始時間，第一版不支援跨日匯入'));

    var constraints = durationMin > 0 ? normalizeConstraints(item.constraints, durationMin, index, externalId, errors) : null;
    var todos = validateTodos(item.todos, externalId, index, errors);
    var source = resolveSource(item, context.places, context.core, index, externalId, errors, needsInput);
    if (errors.length || needsInput.length || !externalId || !title || !startAt || !endAt || !constraints || !source) {
      return { errors: errors, needsInput: needsInput, occurrence: null };
    }

    var isCustom = source.kind === 'custom';
    var occurrence = {
      id: occurrenceIdFor(externalId),
      placeId: source.place ? source.place.id : null,
      custom: isCustom ? { title: title, kind: text(item.category) || 'life' } : null,
      day: text(item.date).slice(5, 7) + text(item.date).slice(8, 10),
      slot: slotFromTime(item.startTime),
      fine: {
        startAt: startAt,
        endAt: endAt,
        originalDurationMin: durationMin,
        minDurationMin: constraints.minDurationMinutes,
        compressibility: constraints.minDurationMinutes < durationMin ? 'suggest' : 'none',
        fixedMarker: constraints.fixed,
        intentionalGapBefore: false,
        acceptedConflictWith: [],
        timeCommitment: constraints.fixed ? 'external' : 'flexible',
        autoMovePolicy: constraints.fixed ? 'manual' : (constraints.allowRipple ? 'auto' : 'confirm'),
        manualOrder: index
      },
      scheduleKind: isCustom ? 'custom' : 'place',
      transport: null,
      todos: todos,
      category: text(item.category) || (source.place && text(source.place.type)) || '其他',
      notes: text(item.notes),
      mapLinks: normalizeMapLinks(item, source),
      seq: index,
      startTime: text(item.startTime)
    };
    occurrence = context.core.normalizeOccurrence(occurrence);
    if (!occurrence || !occurrence.fine) {
      errors.push(problem(index, externalId, null, 'NORMALIZATION_FAILED', '無法轉換為 schema v21 行程'));
      return { errors: errors, needsInput: needsInput, occurrence: null };
    }
    return {
      errors: errors,
      needsInput: needsInput,
      occurrence: occurrence,
      supplemental: {
        title: title,
        category: text(item.category) || null,
        notes: text(item.notes),
        mapsUrl: source.mapsUrl || '',
        sourceKind: source.kind
      }
    };
  }

  function issueSummary(version, occurrences, timeZone, fineflow) {
    if (!fineflow || typeof fineflow.buildDaySchedule !== 'function' || typeof fineflow.detectScheduleIssues !== 'function') return [];
    var byDay = {};
    occurrences.forEach(function (occurrence) {
      (byDay[occurrence.day] || (byDay[occurrence.day] = [])).push(occurrence);
    });
    var issues = [];
    Object.keys(byDay).sort().forEach(function (day) {
      var before = fineflow.buildDaySchedule(version, day, { timeZone: timeZone });
      var previewVersion = clone(version);
      previewVersion.plan = (previewVersion.plan || []).concat(clone(byDay[day]));
      var after = fineflow.buildDaySchedule(previewVersion, day, { timeZone: timeZone });
      fineflow.detectScheduleIssues(before, after, {}).forEach(function (issue) {
        issues.push(Object.assign({ day: day }, clone(issue)));
      });
    });
    return issues;
  }

  function dryRunImport(payload, options) {
    options = options || {};
    var core = options.core || defaultCore;
    var fineflow = options.fineflow || defaultFineflow;
    if (!core || typeof core.normalizeOccurrence !== 'function' || typeof core.parseLatLngFromMapsUrl !== 'function' || typeof core.findDuplicate !== 'function') {
      throw new Error('CNXCore import dependencies are required');
    }
    if (!fineflow || typeof fineflow.baseFingerprint !== 'function') throw new Error('CNXFineFlow import dependencies are required');

    var errors = payloadErrors(payload, options);
    var result = {
      format: FORMAT,
      version: VERSION,
      tripTimeZone: payload && text(payload.tripTimeZone) || null,
      offset: payload ? resolveOffset(payload.tripTimeZone, options) : null,
      errors: errors,
      needsInput: [],
      skipped: [],
      warnings: [],
      occurrences: [],
      conflicts: [],
      transaction: null,
      canApply: false
    };
    if (errors.length) return result;

    var version = options.version && Array.isArray(options.version.plan) ? options.version : { id: options.versionId || null, plan: [] };
    var places = Array.isArray(options.places) ? options.places : [];
    var alreadyImported = importedSet(options.importedExternalIds);
    var seen = new Set();
    var existingIds = new Set(version.plan.map(function (occurrence) { return occurrence && occurrence.id; }).filter(Boolean));
    var changes = [];
    payload.items.forEach(function (item, index) {
      var externalId = item && text(item.externalId);
      if (externalId && (seen.has(externalId) || alreadyImported.has(externalId) || existingIds.has(occurrenceIdFor(externalId)))) {
        result.skipped.push({ index: index, externalId: externalId, reason: seen.has(externalId) ? 'duplicate-in-payload' : 'already-imported' });
        seen.add(externalId);
        return;
      }
      if (externalId) seen.add(externalId);
      var converted = itemResult(item, index, {
        timeZone: payload.tripTimeZone,
        places: places,
        core: core,
        options: options
      });
      result.errors = result.errors.concat(converted.errors);
      result.needsInput = result.needsInput.concat(converted.needsInput);
      if (!converted.occurrence) return;
      result.occurrences.push(converted.occurrence);
      existingIds.add(converted.occurrence.id);
      changes.push({
        type: 'add-occurrence',
        externalId: externalId,
        occurrence: clone(converted.occurrence),
        supplemental: clone(converted.supplemental)
      });
    });

    result.conflicts = issueSummary(version, result.occurrences, payload.tripTimeZone, fineflow);
    if (changes.length) {
      result.transaction = {
        id: options.transactionId || 'ffi_import_' + hash(changes.map(function (change) { return change.externalId; }).join('|')),
        operation: 'import',
        format: FORMAT,
        importVersion: VERSION,
        versionId: version.id || options.versionId || null,
        baseFingerprint: fineflow.baseFingerprint(version.plan),
        tripTimeZone: payload.tripTimeZone,
        changes: changes,
        issues: clone(result.conflicts),
        summary: {
          add: changes.length,
          skipped: result.skipped.length,
          needsInput: result.needsInput.length,
          errors: result.errors.length,
          conflicts: result.conflicts.filter(function (issue) { return issue.type === 'conflict'; }).length
        }
      };
    }
    result.canApply = !!result.transaction;
    return result;
  }

  function applyImportTransaction(version, transaction, options) {
    options = options || {};
    var core = options.core || defaultCore;
    var fineflow = options.fineflow || defaultFineflow;
    if (options.confirmed !== true) {
      var confirmation = new Error('匯入 transaction 尚未確認');
      confirmation.code = 'FINEFLOW_IMPORT_CONFIRMATION_REQUIRED';
      throw confirmation;
    }
    if (!version || !Array.isArray(version.plan)) throw new Error('Version plan is required');
    if (!transaction || transaction.operation !== 'import' || !Array.isArray(transaction.changes)) throw new Error('Valid import transaction is required');
    if (transaction.versionId && version.id !== transaction.versionId) {
      var wrongVersion = new Error('Import preview belongs to a different version');
      wrongVersion.code = 'FINEFLOW_STALE_BASE';
      throw wrongVersion;
    }
    if (fineflow.baseFingerprint(version.plan) !== transaction.baseFingerprint) {
      var stale = new Error('Import preview is stale; recalculate before applying');
      stale.code = 'FINEFLOW_STALE_BASE';
      throw stale;
    }
    var out = clone(version);
    var ids = new Set(out.plan.map(function (occurrence) { return occurrence && occurrence.id; }).filter(Boolean));
    var importedExternalIds = importedSet(options.importedExternalIds);
    transaction.changes.forEach(function (change) {
      if (!change || change.type !== 'add-occurrence') throw new Error('Unsupported import change');
      var normalized = core.normalizeOccurrence(clone(change.occurrence));
      if (!normalized || !normalized.id || !normalized.fine) throw new Error('Import change contains an invalid occurrence');
      if (ids.has(normalized.id)) return;
      ids.add(normalized.id);
      out.plan.push(normalized);
      if (change.externalId) importedExternalIds.add(String(change.externalId));
    });
    return { version: out, importedExternalIds: Array.from(importedExternalIds).sort() };
  }

  return {
    FORMAT: FORMAT,
    VERSION: VERSION,
    FIXED_ZONE_OFFSETS: clone(FIXED_ZONE_OFFSETS),
    normalizeDateTime: normalizeDateTime,
    slotFromTime: slotFromTime,
    occurrenceIdFor: occurrenceIdFor,
    validateEnvelope: function (payload, options) { return payloadErrors(payload, options || {}); },
    validatePayload: function (payload, options) { return dryRunImport(payload, options || {}).errors; },
    dryRunImport: dryRunImport,
    createImportPreview: dryRunImport,
    applyImportTransaction: applyImportTransaction
  };
});
