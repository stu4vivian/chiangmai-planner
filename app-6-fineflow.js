(function () {
  'use strict';

  var rootId = 'pg-fineflow';
  var previewTimer = null;
  var pointerDraft = null;
  var state = {
    loading: false,
    error: '',
    day: null,
    anchorDate: null,
    selectedId: null,
    createDraft: null,
    importPreview: null,
    editor: null,
    lastVersionId: null,
    mobileDayCount: 3,
    desktopDayCount: 7,
    calendarDesktop: null,
    calendarInitialScroll: false,
    suppressCardClick: false,
    suppressCalendarClick: false
  };
  var calendarScrollTimer = null;
  var uiStore = window.CNXFineFlowCalendarState && typeof window.CNXFineFlowCalendarState.createStore === 'function' ?
    window.CNXFineFlowCalendarState.createStore() : null;

  function copy(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function h(value) {
    var text = value == null ? '' : String(value);
    if (typeof esc === 'function') return esc(text);
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function ffApi() {
    return window.CNXFineFlow || {};
  }

  function activeVersion() {
    return typeof av === 'function' ? av() : null;
  }

  function activePlan() {
    var version = activeVersion();
    return version && Array.isArray(version.plan) ? version.plan : [];
  }

  function dayDate(dayId) {
    var days = typeof DAYS !== 'undefined' && Array.isArray(DAYS) ? DAYS : [];
    var index = days.findIndex(function (day) { return day.id === dayId; });
    var start = typeof TRIP !== 'undefined' && TRIP && TRIP.startDate ? TRIP.startDate : '';
    if (index >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
      var date = new Date(start + 'T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    }
    if (/^\d{4}$/.test(dayId || '') && /^\d{4}/.test(start)) {
      return start.slice(0, 4) + '-' + dayId.slice(0, 2) + '-' + dayId.slice(2);
    }
    return start || new Date().toISOString().slice(0, 10);
  }

  function addDays(dateText, amount) {
    var date = new Date(dateText + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  function zoneOffset(dateText, timeText) {
    var zone = typeof TRIP !== 'undefined' && TRIP && TRIP.timeZone ? TRIP.timeZone : 'Asia/Bangkok';
    var utc = Date.parse(dateText + 'T' + timeText + ':00Z');
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date(utc));
      var values = {};
      parts.forEach(function (part) { if (part.type !== 'literal') values[part.type] = part.value; });
      var localAsUtc = Date.UTC(+values.year, +values.month - 1, +values.day, +values.hour, +values.minute, +values.second);
      var minutes = Math.round((localAsUtc - utc) / 60000);
      var sign = minutes < 0 ? '-' : '+';
      minutes = Math.abs(minutes);
      return sign + String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
    } catch (_) {
      return '+07:00';
    }
  }

  function zonedIso(dateText, timeText) {
    return dateText + 'T' + timeText + ':00' + zoneOffset(dateText, timeText);
  }

  function defaultTime(slot) {
    return ({ breakfast: '08:00', am: '09:00', lunch: '12:00', afternoon: '14:00', snack: '16:00', evening: '17:00', dinner: '18:00', night: '20:00', stay: '22:00' })[slot] || '09:00';
  }

  function addMinutesToTime(time, minutes) {
    var parts = (time || '09:00').split(':');
    var total = (+parts[0] * 60 + +parts[1] + minutes) % 1440;
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  function timeFromIso(value) {
    var match = typeof value === 'string' && value.match(/T(\d{2}:\d{2})/);
    return match ? match[1] : '';
  }

  function dateFromIso(value) {
    var match = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})T/);
    return match ? match[1] : '';
  }

  function fineDate(item) {
    return dateFromIso(item && item.fine && item.fine.startAt) || dayDate(item && item.day);
  }

  function fineDayId(item) {
    return dayIdForDate(fineDate(item));
  }

  function coarseSlotLabel(slot) {
    if (typeof slotObj === 'function') {
      var meta = slotObj(slot);
      return [meta.ctx, meta.label].filter(Boolean).join(' ') || slot;
    }
    return slot || '';
  }

  function coarseDayOptions(selected) {
    return (typeof DAYS !== 'undefined' ? DAYS : []).map(function (day) {
      return '<option value="' + h(day.id) + '"' + (day.id === selected ? ' selected' : '') + '>' + h(day.label + '（' + day.wd + '）') + '</option>';
    }).join('');
  }

  function coarseSlotOptions(selected) {
    return (typeof SLOTS !== 'undefined' ? SLOTS : []).filter(function (slot) { return slot.kind !== 'stay'; }).map(function (slot) {
      return '<option value="' + h(slot.key) + '"' + (slot.key === selected ? ' selected' : '') + '>' + h(coarseSlotLabel(slot.key)) + '</option>';
    }).join('');
  }

  function suggestedCoarsePosition(date, time) {
    return { day: dayIdForDate(date), slot: slotFromTime(time) };
  }

  function minuteDuration(item) {
    if (!item || !item.fine) return null;
    var duration = Math.round((Date.parse(item.fine.endAt) - Date.parse(item.fine.startAt)) / 60000);
    return duration > 0 ? duration : null;
  }

  function occurrenceOf(value) {
    return value && (value.occurrence || value.item || value.source || value);
  }

  function occurrenceTitle(item) {
    item = occurrenceOf(item) || {};
    if (item.placeId && typeof getPlace === 'function') {
      var place = getPlace(item.placeId);
      if (place && place.name) return place.name;
    }
    if (item.custom && item.custom.title) return item.custom.title;
    if (item.transport && item.transport.routeLabel) return item.transport.routeLabel;
    return kindLabel(item.scheduleKind);
  }

  function kindLabel(kind) {
    return ({
      place: '地點', custom: '自訂', transport: '移動', connector_travel: '接駁交通',
      booked_transport: '預約交通', flight: '航班／長途交通', sleep: '休息'
    })[kind] || '行程';
  }

  function kindIcon(kind) {
    return ({ place: '●', custom: '◆', transport: '→', connector_travel: '→', booked_transport: '◆', flight: '✈', sleep: '◐' })[kind] || '●';
  }

  function fineSort(items) {
    var api = ffApi();
    if (typeof api.sortFineOccurrences === 'function') {
      try { return api.sortFineOccurrences(items.slice()); } catch (_) {}
    }
    return items.slice().sort(function (a, b) {
      var af = occurrenceOf(a).fine, bf = occurrenceOf(b).fine;
      var at = af ? Date.parse(af.startAt) : Infinity, bt = bf ? Date.parse(bf.startAt) : Infinity;
      if (at !== bt) return at - bt;
      var ao = af ? af.manualOrder || 0 : 0, bo = bf ? bf.manualOrder || 0 : 0;
      return ao - bo || String(occurrenceOf(a).id).localeCompare(String(occurrenceOf(b).id));
    });
  }

  function fallbackIssues(precise) {
    var issues = [];
    for (var i = 0; i < precise.length - 1; i++) {
      var current = occurrenceOf(precise[i]), next = occurrenceOf(precise[i + 1]);
      var delta = Math.round((Date.parse(next.fine.startAt) - Date.parse(current.fine.endAt)) / 60000);
      if (delta < 0) issues.push({ id: 'conflict_' + current.id + '_' + next.id, type: 'conflict', severity: 'warning', status: 'preexisting', minutes: -delta });
      else if (delta > 0) issues.push({ id: 'gap_' + current.id + '_' + next.id, type: 'gap', severity: 'info', status: 'preexisting', minutes: delta });
    }
    return issues;
  }

  function missingLocationIds(items) {
    return items.map(occurrenceOf).filter(function (item) {
      if (item.scheduleKind !== 'place') return false;
      if (!item.placeId || typeof getPlace !== 'function') return true;
      var place = getPlace(item.placeId);
      return !place || place.lat == null || place.lng == null;
    }).map(function (item) { return item.id; });
  }

  function issueContext(items, dayId) {
    return {
      trip: typeof TRIP !== 'undefined' ? TRIP : {},
      missingLocationOccurrenceIds: missingLocationIds(items),
      dayEndAt: dayId ? zonedIso(addDays(dayDate(dayId), 1), '00:00') : null
    };
  }

  function buildSchedule(version, dayId) {
    var api = ffApi();
    if (typeof api.buildDaySchedule === 'function') {
      try { return api.buildDaySchedule(version, dayId, typeof TRIP !== 'undefined' ? TRIP : {}); }
      catch (_) {}
    }
    return (version.plan || []).filter(function (item) { return fineDayId(item) === dayId; });
  }

  function scheduleParts(schedule, dayId, version) {
    var raw = Array.isArray(schedule) ? schedule :
      (schedule && (schedule.occurrences || schedule.items || schedule.schedule || schedule.all)) ||
      (version.plan || []).filter(function (item) { return fineDayId(item) === dayId; });
    var all = raw.map(occurrenceOf).filter(Boolean);
    var precise = fineSort(all.filter(function (item) { return item.fine && item.fine.startAt && item.fine.endAt; }));
    var unplanned = all.filter(function (item) { return !item.fine; });
    if (schedule && Array.isArray(schedule.precise)) precise = fineSort(schedule.precise.map(occurrenceOf));
    if (schedule && Array.isArray(schedule.unscheduled)) unplanned = schedule.unscheduled.map(occurrenceOf);
    if (schedule && Array.isArray(schedule.unplanned)) unplanned = schedule.unplanned.map(occurrenceOf);
    var issues = schedule && Array.isArray(schedule.issues) ? schedule.issues : null;
    var allItems = precise.concat(unplanned);
    if (!issues) {
      var api = ffApi();
      if (typeof api.detectScheduleIssues === 'function') {
        try { issues = api.detectScheduleIssues(schedule, schedule, issueContext(allItems, dayId)); }
        catch (_) { issues = null; }
      }
    }
    if (!Array.isArray(issues)) issues = fallbackIssues(precise);
    return { schedule: schedule, precise: precise, unplanned: unplanned, issues: issues, missingLocationIds: missingLocationIds(allItems) };
  }

  function dayMeta(dayId) {
    var days = typeof DAYS !== 'undefined' && Array.isArray(DAYS) ? DAYS : [];
    return days.find(function (day) { return day.id === dayId; }) || { id: dayId, label: dayId, wd: '' };
  }

  function buildViewModel() {
    var version = activeVersion();
    if (!version) throw new Error('找不到目前使用的行程版本');
    var known = typeof DAYS !== 'undefined' && Array.isArray(DAYS) ? DAYS.map(function (day) { return day.id; }) : [];
    (version.plan || []).forEach(function (item) { var id = fineDayId(item); if (id && known.indexOf(id) < 0) known.push(id); });
    var days = known.map(function (dayId) {
      var parts = scheduleParts(buildSchedule(version, dayId), dayId, version);
      var todos = parts.precise.concat(parts.unplanned).reduce(function (sum, item) { return sum + (Array.isArray(item.todos) ? item.todos.length : 0); }, 0);
      var conflicts = parts.issues.filter(function (issue) { return issue.type === 'conflict' || issue.type === 'travel_shortage' || issue.type === 'anchor_violation'; }).length;
      var gaps = parts.issues.filter(function (issue) { return issue.type === 'gap'; }).length;
      return Object.assign({ id: dayId, meta: dayMeta(dayId), todos: todos, conflicts: conflicts, gaps: gaps, missingLocations: parts.missingLocationIds.length }, parts);
    });
    return { version: version, days: days, preciseCount: days.reduce(function (sum, day) { return sum + day.precise.length; }, 0), unplannedCount: days.reduce(function (sum, day) { return sum + day.unplanned.length; }, 0) };
  }

  function issueBadge(day) {
    var bits = [];
    if (day.conflicts) bits.push('<span class="ff-badge warn">' + day.conflicts + ' 個問題</span>');
    if (day.gaps) bits.push('<span class="ff-badge">' + day.gaps + ' 段空檔</span>');
    if (day.missingLocations) bits.push('<span class="ff-badge travel">交通資訊待確認</span>');
    if (day.unplanned.length) bits.push('<span class="ff-badge quiet">' + day.unplanned.length + ' 項未排</span>');
    if (day.todos) bits.push('<button type="button" class="ff-todo-link" data-action="ff-todos" data-day="' + h(day.id) + '" aria-label="查看 ' + day.todos + ' 件待辦">□ ' + day.todos + '</button>');
    return bits.join('');
  }

  function itemRow(item, unplanned) {
    var start = item.fine ? timeFromIso(item.fine.startAt) : '未排';
    var end = item.fine ? timeFromIso(item.fine.endAt) : '';
    var duration = minuteDuration(item);
    var todoOpen = Array.isArray(item.todos) ? item.todos.filter(function (todo) { return !todo.done; }).length : 0;
    var flags = [];
    if (item.fine && item.fine.fixedMarker) flags.push('<span class="ff-tag fixed">固定</span>');
    if (item.scheduleKind && item.scheduleKind !== 'place') flags.push('<span class="ff-tag">' + h(kindLabel(item.scheduleKind)) + '</span>');
    if (todoOpen) flags.push('<span class="ff-todo-count" aria-label="' + todoOpen + ' 件未完成待辦">□' + todoOpen + '</span>');
    var transport = item.transport && item.transport.routeLabel ? '<span class="ff-route">' + h(item.transport.routeLabel) + '</span>' : '';
    return '<button type="button" class="ff-item' + (unplanned ? ' unplanned' : '') + '" data-action="ff-edit" data-eid="' + h(item.id) + '">' +
      '<span class="ff-time"><b>' + h(start) + '</b>' + (end ? '<small>' + h(end) + '</small>' : '<small>設定時間</small>') + '</span>' +
      '<span class="ff-mark ' + h(item.scheduleKind || 'place') + '" aria-hidden="true">' + h(kindIcon(item.scheduleKind)) + '</span>' +
      '<span class="ff-item-main"><span class="ff-item-title">' + h(occurrenceTitle(item)) + '</span>' +
        '<span class="ff-item-meta">' + (duration ? duration + ' 分鐘' : '尚未排時間') + transport + '</span></span>' +
      '<span class="ff-item-flags">' + flags.join('') + '<span class="ff-chevron" aria-hidden="true">›</span></span>' +
    '</button>';
  }

  function renderDay(day, single) {
    var begin = day.precise.length ? timeFromIso(day.precise[0].fine.startAt) : '未排';
    var finish = day.precise.length ? timeFromIso(day.precise[day.precise.length - 1].fine.endAt) : '未排';
    var rows = day.precise.map(function (item) { return itemRow(item, false); }).join('');
    var unplanned = day.unplanned.length ? '<div class="ff-subhead"><span>尚未排時間</span><b>' + day.unplanned.length + '</b></div>' +
      day.unplanned.map(function (item) { return itemRow(item, true); }).join('') : '';
    if (!rows && !unplanned) rows = '<div class="ff-day-empty">這天還沒有行程</div>';
    return '<section class="ff-day' + (single ? ' single' : '') + '" aria-labelledby="ff-day-' + h(day.id) + '">' +
      '<div class="ff-day-head"><div><span class="ff-kicker">' + h(day.meta.wd ? '星期' + day.meta.wd : '行程日') + '</span>' +
        '<h2 id="ff-day-' + h(day.id) + '">' + h(day.meta.label) + '</h2></div>' +
        '<div class="ff-day-range"><b>' + h(begin) + '～' + h(finish) + '</b><small>' + day.precise.length + ' 項精確行程</small></div>' +
        (!single ? '<button type="button" class="ff-day-open" data-action="ff-day" data-day="' + h(day.id) + '" aria-label="展開 ' + h(day.meta.label) + ' 單日細流">展開</button>' : '') +
      '</div><div class="ff-day-summary">' + issueBadge(day) + '</div><div class="ff-items">' + rows + unplanned + '</div></section>';
  }

  function renderPage(model) {
    if (!model.days.length) return '<div class="ff-state"><span>◷</span><h2>還沒有可排的日期</h2><p>先在設定裡填好旅程日期，再回來建立細流。</p></div>';
    var selected = state.day && model.days.find(function (day) { return day.id === state.day; });
    if (selected) {
      return '<div class="ff-page-head single"><button type="button" class="ff-back" data-action="ff-global" aria-label="返回全域細流">←</button>' +
        '<div><span class="ff-kicker">單日細流</span><h1>' + h(selected.meta.label) + '・星期' + h(selected.meta.wd) + '</h1></div>' +
        '<button type="button" class="ff-add" data-action="ff-add" data-day="' + h(selected.id) + '">＋ 自訂行程</button></div>' + renderDay(selected, true);
    }
    var usefulDays = model.days.filter(function (day) { return day.precise.length || day.unplanned.length; });
    return '<div class="ff-page-head"><div><span class="ff-kicker">智慧排程</span><h1>細流</h1><p>精確時間與影響預演都在這裡，不會未經確認移動後續行程。</p></div>' +
      '<button type="button" class="ff-add" data-action="ff-add">＋ 自訂行程</button></div>' +
      '<div class="ff-overview" aria-label="細流摘要"><div><b>' + model.preciseCount + '</b><span>已排時間</span></div><div><b>' + model.unplannedCount + '</b><span>尚未排</span></div><button type="button" data-action="ff-todos"><b>□</b><span>集中待辦</span></button></div>' +
      (usefulDays.length ? usefulDays.map(function (day) { return renderDay(day, false); }).join('') : '<div class="ff-state"><span>◷</span><h2>目前都還沒排精確時間</h2><p>點下方的未排項目設定開始與結束時間，或新增一筆自訂行程。</p></div>') +
      (model.unplannedCount && !usefulDays.length ? '' : '');
  }

  // ── 三日行事曆 DOM contract ──────────────────────────────────────
  // .ff-calendar > .ff-cal-toolbar + .ff-cal-date-row + .ff-cal-scroll + .ff-cal-fab
  // .ff-cal-scroll > .ff-cal-time-gutter + .ff-cal-days > .ff-cal-day
  // .ff-cal-day > .ff-cal-slot（空白命中層）+ .ff-cal-card（絕對定位）
  // 卡片狀態：.density-{small|medium|large}、.is-conflict、.is-fixed、.is-selected、.is-preview
  // Sheet：.ff-source-sheet、.ff-detail-sheet、.ff-create-sheet；CSS 只需鎖在 #pg-fineflow / .ff-sheet。
  function calendarApi() { return window.CNXFineFlowCalendar || {}; }

  function baseFingerprint() {
    var api = ffApi();
    try { return typeof api.baseFingerprint === 'function' ? api.baseFingerprint(activePlan()) : JSON.stringify(activePlan()); }
    catch (_) { return JSON.stringify(activePlan()); }
  }

  function dayIdForDate(dateText) {
    var start = typeof TRIP !== 'undefined' && TRIP && TRIP.startDate;
    var days = typeof DAYS !== 'undefined' && Array.isArray(DAYS) ? DAYS : [];
    if (/^\d{4}-\d{2}-\d{2}$/.test(start || '') && /^\d{4}-\d{2}-\d{2}$/.test(dateText || '')) {
      var offset = Math.round((Date.parse(dateText + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000);
      if (days[offset]) return days[offset].id;
    }
    var fallback = (dateText || '').slice(5).replace('-', '');
    return (days.find(function (day) { return day.id === fallback; }) || {}).id || fallback;
  }

  function dateForDayId(dayId) { return dayDate(dayId); }

  function calendarAnchor() {
    if (!state.anchorDate) state.anchorDate = (typeof TRIP !== 'undefined' && TRIP && TRIP.startDate) || new Date().toISOString().slice(0, 10);
    return state.anchorDate;
  }

  function calendarIsDesktop() {
    return !!(window.matchMedia && window.matchMedia('(min-width: 768px)').matches);
  }

  function calendarVisibleDays() {
    return calendarIsDesktop() ? state.desktopDayCount : state.mobileDayCount;
  }

  function calendarPixelsPerHour() {
    return calendarIsDesktop() ? 60 : 48;
  }

  function clampCalendarAnchor(dateText) {
    var start = typeof TRIP !== 'undefined' && TRIP && TRIP.startDate;
    var end = typeof TRIP !== 'undefined' && TRIP && TRIP.endDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) return dateText;
    var count = calendarVisibleDays();
    var latest;
    if (calendarIsDesktop()) {
      var span = Math.max(0, Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000));
      latest = addDays(start, Math.floor(span / count) * count);
    } else {
      latest = addDays(end, -(count - 1));
    }
    if (latest < start) latest = start;
    return dateText < start ? start : dateText > latest ? latest : dateText;
  }

  function safeHttpUrl(value) {
    try {
      var parsed = new URL(String(value || '').trim());
      return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
    } catch (_) { return ''; }
  }

  function safeMapsUrl(value) {
    var url = safeHttpUrl(value);
    if (!url) return '';
    try {
      var parsed = new URL(url);
      var host = parsed.hostname.toLowerCase();
      if (host === 'maps.app.goo.gl') return url;
      if (host === 'goo.gl') return parsed.pathname.indexOf('/maps') === 0 ? url : '';
      var googleHost = host === 'google.com' || /(^|\.)google\.[a-z.]+$/.test(host);
      return googleHost && (host.indexOf('maps.') === 0 || parsed.pathname.indexOf('/maps') === 0) ? url : '';
    } catch (_) { return ''; }
  }

  function calendarIssueIds(day) {
    var ids = {};
    (day && day.issues || []).forEach(function (issue) {
      if (issue.accepted || issue.status === 'resolved') return;
      if (issue.type !== 'conflict' && issue.type !== 'travel_shortage' && issue.type !== 'anchor_violation') return;
      (issue.occurrenceIds || []).forEach(function (id) { ids[id] = true; });
    });
    return ids;
  }

  function buildCalendarModel() {
    var api = calendarApi();
    if (typeof api.projectDateSchedules !== 'function') throw new Error('多日行事曆模組尚未載入');
    var version = activeVersion();
    if (!version) throw new Error('找不到目前使用的行程版本');
    if (state.lastVersionId && state.lastVersionId !== version.id) {
      state.createDraft = null;
      state.selectedId = null;
      state.editor = null;
      state.importPreview = null;
      clearTimeout(previewTimer);
      if (pointerDraft) clearTimeout(pointerDraft.timer);
      pointerDraft = null;
      if (uiStore) uiStore.dispatch({ type: 'VERSION_CHANGED' });
    }
    state.lastVersionId = version.id;
    var count = calendarVisibleDays();
    var mobile = !calendarIsDesktop();
    state.calendarDesktop = !mobile;
    var tripStart = typeof TRIP !== 'undefined' && TRIP && TRIP.startDate;
    var tripEnd = typeof TRIP !== 'undefined' && TRIP && TRIP.endDate;
    var mobileTrackCount = /^\d{4}-\d{2}-\d{2}$/.test(tripStart || '') && /^\d{4}-\d{2}-\d{2}$/.test(tripEnd || '') ?
      Math.max(count, Math.round((Date.parse(tripEnd + 'T00:00:00Z') - Date.parse(tripStart + 'T00:00:00Z')) / 86400000) + 1) : count;
    var trackAnchor = mobile ? (tripStart || calendarAnchor()) : calendarAnchor();
    var trackCount = mobile ? mobileTrackCount : count;
    var anchorIndex = mobile ? Math.max(0, Math.round((Date.parse(calendarAnchor() + 'T00:00:00Z') - Date.parse(trackAnchor + 'T00:00:00Z')) / 86400000)) : 0;
    var dates = api.buildDateWindow(trackAnchor, trackCount);
    var schedules = dates.map(function (date) {
      var dayId = dayIdForDate(date);
      var parts = scheduleParts(buildSchedule(version, dayId), dayId, version);
      return { day: dayId, date: date, items: parts.precise, unscheduled: parts.unplanned, issues: parts.issues };
    });
    var pixelsPerHour = calendarPixelsPerHour();
    var projection = api.projectDateSchedules(trackAnchor, schedules, trackCount, {
      places: typeof places !== 'undefined' ? places : [],
      trip: typeof TRIP !== 'undefined' ? TRIP : {},
      dayStartMinute: 0,
      dayEndMinute: 1440,
      pixelsPerHour: pixelsPerHour,
      minimumCardHeight: 20,
      mediumHeight: 28,
      largeHeight: 60
    });
    projection.days.forEach(function (day, index) {
      day.dayId = schedules[index].day;
      day.issues = schedules[index].issues;
      day.conflictIds = calendarIssueIds(schedules[index]);
    });
    projection.trackDays = projection.days;
    projection.days = mobile ? projection.trackDays.slice(anchorIndex, anchorIndex + count) : projection.trackDays.slice();
    projection.dates = projection.days.map(function (day) { return day.date; });
    projection.unscheduledCount = projection.days.reduce(function (total, day) { return total + (day.unscheduled || []).length; }, 0);
    projection.visibleDayCount = count;
    projection.trackDayCount = trackCount;
    projection.trackOffset = 0;
    projection.anchorIndex = anchorIndex;
    projection.mobile = mobile;
    projection.pixelsPerHour = pixelsPerHour;
    projection.versionId = version.id;
    projection.baseFingerprint = baseFingerprint();
    return projection;
  }

  function formatDateHeading(dateText) {
    var date = new Date(dateText + 'T00:00:00Z');
    var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return { weekday: '週' + weekdays[date.getUTCDay()], date: (date.getUTCMonth() + 1) + '/' + date.getUTCDate() };
  }

  function renderTimeGutter() {
    var html = '<div class="ff-cal-time-gutter" aria-hidden="true">';
    for (var hour = 0; hour < 24; hour++) {
      var period = hour < 12 ? '上午' : '下午';
      html += '<span class="ff-cal-time" style="--ff-hour:' + hour + '">' + period + ' ' + (hour % 12 || 12) + ':00</span>';
    }
    return html + '</div>';
  }

  function renderSlots(day) {
    var html = '';
    for (var minute = 0; minute < 1440; minute += 30) {
      var time = String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
      html += '<button type="button" class="ff-cal-slot" data-action="ff-create-at" data-day="' + h(day.dayId) + '" data-date="' + h(day.date) + '" data-time="' + time + '" style="--ff-minute:' + minute + '" aria-label="' + h(day.date + ' ' + time + ' 新增行程') + '"></button>';
    }
    return html;
  }

  function renderCalendarCard(card, day) {
    var todos = card.todos || { total: 0, completed: 0, firstIncomplete: null };
    var selected = state.selectedId === card.id;
    var conflict = !!(day.conflictIds && day.conflictIds[card.id]);
    var map = safeMapsUrl(card.mapsUrl);
    var note = card.rawHeight >= 60 && card.note ? '<span class="ff-cal-card-note">' + h(card.note) + '</span>' : '';
    var todo = card.density === 'large' && todos.firstIncomplete ? '<span class="ff-cal-card-todo-summary"><span class="ff-cal-check" aria-hidden="true"></span><span>' + h(todos.firstIncomplete.text) + '</span></span>' : '';
    var desktopControls = calendarIsDesktop() ?
      '<button type="button" class="ff-cal-drag-handle" data-action="ff-drag-card" data-eid="' + h(card.id) + '" aria-label="拖動調整時間"></button>' +
      '<button type="button" class="ff-cal-resize ff-cal-resize-start" data-action="ff-resize-start" data-eid="' + h(card.id) + '" aria-label="調整開始時間"></button>' +
      '<button type="button" class="ff-cal-resize ff-cal-resize-end" data-action="ff-resize-end" data-eid="' + h(card.id) + '" aria-label="調整結束時間"></button>' : '';
    var classes = ['ff-cal-card', 'density-' + card.density];
    if (conflict) classes.push('is-conflict');
    if (card.fixed) classes.push('is-fixed');
    if (selected) classes.push('is-selected');
    var left = 1.5 + card.leftPercent * 0.92;
    var width = card.widthPercent * 0.92;
    return '<article class="' + classes.join(' ') + '" data-eid="' + h(card.id) + '" style="--ff-top:' + card.top + 'px;--ff-height:' + card.height + 'px;--ff-left:' + left + '%;--ff-width:' + width + '%;--ff-card-bg:' + h(card.palette.background) + ';--ff-card-border:' + h(card.palette.border) + ';--ff-card-text:' + h(card.palette.text) + ';top:' + card.top + 'px;height:' + card.height + 'px;left:' + left + '%;width:' + width + '%;background:' + h(card.palette.background) + ';border-color:' + h(card.palette.border) + ';color:' + h(card.palette.text) + '">' +
      '<div class="ff-cal-card-main" role="button" tabindex="0" data-action="ff-card-detail" data-eid="' + h(card.id) + '" data-ff-drag="card" aria-label="查看 ' + h(card.title) + '">' +
        '<strong class="ff-cal-card-title"><span class="ff-cal-type-icon" aria-hidden="true">' + h(card.categoryIcon || '📍') + '</span>' + h(card.title) + '</strong>' +
        '<span class="ff-cal-card-time">' + h(card.startLabel + '–' + card.endLabel) + '</span>' + note + todo +
        '<span class="ff-cal-card-flags">' + (card.fixed ? '<span title="固定">鎖</span>' : '') + (conflict ? '<span class="ff-cal-conflict" title="有衝突">!</span>' : '') + (map ? '<span class="ff-cal-meta-icon" title="有 Maps 連結" aria-label="有 Maps 連結">⌖</span>' : '') + '</span>' +
      '</div>' +
      (map ? '<a class="ff-cal-card-map-link" href="' + h(map) + '" target="_blank" rel="noopener noreferrer" aria-label="在 Google Maps 開啟' + h(card.title) + '">Maps ↗</a>' : '') +
      desktopControls +
      '<span hidden data-action="ff-edit" data-eid="' + h(card.id) + '"></span>' +
    '</article>';
  }

  function renderCreateDraft(day) {
    var draft = state.createDraft;
    if (!draft || !draft.start || draft.date !== day.date) return '';
    var start = +draft.start.slice(0, 2) * 60 + +draft.start.slice(3);
    var endText = draft.end || addMinutesToTime(draft.start, 60);
    var end = +endText.slice(0, 2) * 60 + +endText.slice(3);
    var pixelsPerHour = calendarPixelsPerHour();
    var top = start * pixelsPerHour / 60;
    var height = Math.max(20, (end - start) * pixelsPerHour / 60);
    return '<article class="ff-cal-card density-medium is-preview" data-draft="true" style="--ff-top:' + top + 'px;--ff-height:' + height + 'px;--ff-left:1.5%;--ff-width:92%;--ff-card-bg:#e8f0fe;--ff-card-border:#5b8def;--ff-card-text:#174ea6;top:' + top + 'px;height:' + height + 'px;left:1.5%;width:92%;background:#e8f0fe;border-color:#5b8def;color:#174ea6"><div class="ff-cal-card-main" aria-hidden="true"><strong class="ff-cal-card-title"><span class="ff-cal-type-icon">📍</span>' + h(draft.title || '新增行程') + '</strong><span class="ff-cal-card-time">' + h(draft.start + '–' + endText) + '</span></div></article>';
  }

  function renderCalendarPage(model) {
    var visibleDates = {};
    model.days.forEach(function (day) { visibleDates[day.date] = true; });
    var dates = model.trackDays.map(function (day) {
      var label = formatDateHeading(day.date);
      var visible = !!visibleDates[day.date];
      return '<div class="ff-cal-date' + (visible ? '' : ' is-buffer') + '" data-date="' + h(day.date) + '" data-visible="' + visible + '"' + (visible ? '' : ' aria-hidden="true"') + '><span>' + h(label.weekday) + '</span><b>' + h(label.date) + '</b></div>';
    }).join('');
    var days = model.trackDays.map(function (day) {
      var visible = !!visibleDates[day.date];
      return '<section class="ff-cal-day' + (visible ? '' : ' is-buffer') + '" data-date="' + h(day.date) + '" data-day="' + h(day.dayId) + '" data-visible="' + visible + '" data-unscheduled-count="' + (day.unscheduled || []).length + '" data-card-count="' + day.cards.length + '" aria-label="' + h(day.date) + '"' + (visible ? '' : ' aria-hidden="true" inert') + '>' +
        renderSlots(day) + renderCreateDraft(day) + day.cards.map(function (card) { return renderCalendarCard(card, day); }).join('') + '</section>';
    }).join('');
    var unscheduledItems = [];
    model.trackDays.forEach(function (day) { (day.unscheduled || []).forEach(function (item) { unscheduledItems.push(item); }); });
    var hiddenUnscheduled = unscheduledItems.map(function (item) { return '<span hidden data-action="ff-edit" data-eid="' + h(item.id) + '"></span>'; }).join('');
    var unplanned = '<button type="button" class="ff-cal-unscheduled" data-action="ff-unscheduled"' + (model.unscheduledCount ? '' : ' hidden') + '><span>尚未排時間</span><b>□ ' + model.unscheduledCount + '</b></button>' + hiddenUnscheduled;
    var empty = '<p class="ff-cal-empty"' + (model.days.every(function (day) { return !day.cards.length; }) ? '' : ' hidden') + '>點空白時段，或按右下角＋開始排細流</p>';
    var choices = model.mobile ? [1, 2, 3] : [5, 7];
    var switcher = '<div class="ff-cal-view-switch" aria-label="顯示天數">' + choices.map(function (choice) { return '<button type="button" data-action="ff-calendar-count" data-count="' + choice + '" aria-pressed="' + (choice === model.visibleDayCount) + '">' + choice + (model.mobile && choice === 3 ? ' 日' : '') + '</button>'; }).join('') + '</div>';
    var stepLabel = model.mobile ? '一天' : model.visibleDayCount + '天';
    return '<div class="ff-calendar" data-version="' + h(model.versionId) + '" data-mobile="' + model.mobile + '" data-anchor-index="' + model.anchorIndex + '" style="--ff-cal-columns:' + model.visibleDayCount + ';--ff-cal-track-columns:' + model.trackDayCount + ';--ff-cal-hour:' + model.pixelsPerHour + 'px;--ff-cal-height:' + model.pixelsPerHour * 24 + 'px;--ff-track-offset:' + model.trackOffset + '%">' +
      '<div class="ff-cal-toolbar"><button type="button" class="ff-cal-nav" data-action="ff-prev-days" aria-label="往前' + stepLabel + '">‹</button><div class="ff-cal-range"><span>' + model.visibleDayCount + ' 日行程</span><strong>' + h(model.days[0].date + ' ～ ' + model.days[model.days.length - 1].date) + '</strong></div>' + switcher + '<button type="button" class="ff-cal-nav" data-action="ff-next-days" aria-label="往後' + stepLabel + '">›</button></div>' +
      unplanned + '<div class="ff-cal-date-row"><span class="ff-cal-date-spacer"></span><div class="ff-cal-date-viewport"><div class="ff-cal-date-track">' + dates + '</div></div></div>' +
      '<div class="ff-cal-scroll">' + renderTimeGutter() + '<div class="ff-cal-days-viewport"><div class="ff-cal-days">' + days + '</div></div>' + empty + '</div>' +
      '<button type="button" class="ff-cal-fab" data-action="ff-add-source" aria-label="新增行程">＋</button>' +
    '</div>';
  }

  function renderFineFlow() {
    var root = document.getElementById(rootId);
    if (!root) return;
    clearTimeout(calendarScrollTimer);
    var priorScroll = root.querySelector('.ff-cal-scroll');
    var priorScrollTop = priorScroll ? priorScroll.scrollTop : null;
    root.setAttribute('aria-busy', state.loading ? 'true' : 'false');
    if (state.loading) {
      root.innerHTML = '<div class="ff-state loading" role="status"><span class="ff-spinner"></span><h2>正在整理細流</h2><p>計算精確時間、空檔與交通關係…</p></div>';
      return;
    }
    if (state.error) {
      root.innerHTML = '<div class="ff-state error" role="alert"><span>!</span><h2>細流暫時無法顯示</h2><p>' + h(state.error) + '</p><button type="button" class="ff-retry" data-action="ff-retry">再試一次</button></div>';
      return;
    }
    try {
      root.innerHTML = renderCalendarPage(buildCalendarModel());
      var nextScroll = root.querySelector('.ff-cal-scroll');
      if (nextScroll && priorScrollTop != null) nextScroll.scrollTop = priorScrollTop;
      else if (nextScroll && !state.calendarInitialScroll) {
        state.calendarInitialScroll = true;
        var initialScrollTop = 8.5 * calendarPixelsPerHour();
        nextScroll.scrollTop = initialScrollTop;
        setTimeout(function () {
          var currentScroll = document.querySelector('#' + rootId + ' .ff-cal-scroll');
          if (currentScroll && currentScroll.scrollTop === 0) currentScroll.scrollTop = initialScrollTop;
        }, 80);
      }
      setupCalendarNativeScroll(root.querySelector('.ff-calendar'));
    } catch (err) {
      state.error = err && err.message ? err.message : '發生未預期的錯誤';
      renderFineFlow();
    }
  }

  function findOccurrence(id) {
    return activePlan().find(function (item) { return item.id === id; });
  }

  function scheduleFor(dayId) {
    var version = activeVersion();
    return buildSchedule(version, dayId);
  }

  function contextForDay(dayId) {
    var parts = scheduleParts(scheduleFor(dayId), dayId, activeVersion());
    return issueContext(parts.precise.concat(parts.unplanned), dayId);
  }

  function editorRequest(editor) {
    var item = findOccurrence(editor.id);
    var date = editor.date || fineDate(item);
    var endDate = date;
    if (editor.end <= editor.start) endDate = addDays(date, 1);
    var startAt = zonedIso(date, editor.start);
    var endAt = zonedIso(endDate, editor.end);
    return {
      versionId: activeVersion() && activeVersion().id,
      occurrenceId: item.id, itemId: item.id, day: dayIdForDate(date),
      sourceDay: fineDayId(item), targetDay: dayIdForDate(date),
      startAt: startAt, endAt: endAt, newStartAt: startAt, newEndAt: endAt,
      fixedMarker: !!editor.fixedMarker,
      compressibility: editor.compressibility,
      minDurationMin: Math.max(0, +editor.minDurationMin || 0),
      targetOccurrenceId: editor.targetId || null, swapWithOccurrenceId: editor.targetId || null,
      context: contextForDay(dayIdForDate(date)),
      sourceContext: contextForDay(fineDayId(item)),
      targetContext: contextForDay(dayIdForDate(date)),
      rules: { maxContinuousGapMin: 90 }
    };
  }

  function fallbackPreview(item, request, operation, schedule) {
    var after = copy(item);
    var duration = Math.round((Date.parse(request.endAt) - Date.parse(request.startAt)) / 60000);
    after.fine = Object.assign({
      originalDurationMin: duration, minDurationMin: Math.min(duration, 30),
      compressibility: 'none', fixedMarker: false, timeCommitment: 'flexible',
      autoMovePolicy: 'manual', manualOrder: 0
    }, after.fine || {}, {
      startAt: request.startAt, endAt: request.endAt,
      fixedMarker: request.fixedMarker,
      compressibility: request.compressibility,
      minDurationMin: Math.min(duration, request.minDurationMin)
    });
    after.startTime = timeFromIso(request.startAt);
    var base = schedule && !Array.isArray(schedule) ? copy(schedule) : { day: fineDayId(item), timeZone: typeof TRIP !== 'undefined' && TRIP.timeZone, items: [], unscheduled: [] };
    base.items = Array.isArray(base.items) ? base.items : [];
    base.unscheduled = Array.isArray(base.unscheduled) ? base.unscheduled : [];
    var afterItems = base.items.filter(function (entry) { return entry.id !== item.id; }).concat([after]);
    var afterSchedule = {
      day: fineDayId(item), timeZone: base.timeZone,
      items: fineSort(afterItems),
      unscheduled: base.unscheduled.filter(function (entry) { return entry.id !== item.id; })
    };
    afterSchedule.all = afterSchedule.items.concat(afterSchedule.unscheduled);
    var issues = [];
    var api = ffApi();
    if (typeof api.detectScheduleIssues === 'function') {
      try { issues = api.detectScheduleIssues(base, afterSchedule, request.context || {}); } catch (_) {}
    }
    issues = (issues || []).map(function (issue) {
      if (!Array.isArray(issue.resolutions) && typeof api.suggestResolutions === 'function') {
        try { issue.resolutions = api.suggestResolutions(issue, afterSchedule, request.rules || {}); } catch (_) {}
      }
      return issue;
    });
    return {
      id: 'ff_fallback_' + Date.now(), operation: operation,
      versionId: activeVersion().id, day: fineDayId(item),
      baseFingerprint: typeof api.baseFingerprint === 'function' ? api.baseFingerprint(base) : JSON.stringify(base),
      mutations: [{ occurrenceId: item.id, before: copy(item), after: after, reason: '調整時間' }],
      issues: issues, summary: { moved: 1, shortened: 0, unresolved: issues.filter(function (issue) { return issue.status !== 'resolved'; }).length },
      beforeSchedule: base, afterSchedule: afterSchedule, context: copy(request.context || {}), rules: copy(request.rules || {}),
      manualFirstSchedule: !item.fine
    };
  }

  function runPreview() {
    if (!state.editor) return;
    var editor = state.editor, item = findOccurrence(editor.id);
    if (!item) return;
    editor.previewing = true;
    editor.error = '';
    try {
      var api = ffApi(), request = editorRequest(editor), schedule = scheduleFor(fineDayId(item)), transaction;
      var targetDay = dayIdForDate(editor.date || fineDate(item));
      if (!editor.firstSchedule && targetDay !== fineDayId(item) && typeof api.previewCrossDayChange === 'function') {
        request.contextByDay = {};
        request.contextByDay[fineDayId(item)] = request.sourceContext;
        request.contextByDay[targetDay] = request.targetContext;
        request.mode = editor.mode;
        request.strategy = editor.mode;
        transaction = api.previewCrossDayChange(activeVersion(), request, typeof TRIP !== 'undefined' ? TRIP : {});
      } else if (editor.firstSchedule) {
        transaction = fallbackPreview(item, request, 'single', schedule);
      } else if (editor.mode === 'swap') {
        if (!editor.targetId) { editor.transaction = null; editor.previewing = false; renderEditor(); return; }
        if (typeof api.previewSwap === 'function') transaction = api.previewSwap(schedule, request);
      } else if (editor.mode === 'ripple' && typeof api.previewRippleChange === 'function') {
        transaction = api.previewRippleChange(schedule, request);
      } else if (typeof api.previewSingleChange === 'function') {
        transaction = api.previewSingleChange(schedule, request);
      }
      editor.transaction = transaction || fallbackPreview(item, request, editor.mode, schedule);
      if (editor.pointerMode && uiStore && editor.transaction) {
        var previewEvent = {
          occurrenceId: item.id,
          versionId: editor.versionId,
          baseFingerprint: editor.transaction.baseFingerprint,
          previewRequest: request,
          transaction: editor.transaction
        };
        uiStore.dispatch(Object.assign({ type: editor.pointerMode === 'resize' ? 'START_RESIZE_PREVIEW' : 'START_DRAG_PREVIEW', edge: editor.pointerEdge || 'end' }, previewEvent));
        uiStore.dispatch({ type: 'PREVIEW_READY', transaction: editor.transaction });
      }
    } catch (err) {
      editor.error = err && err.message ? err.message : '無法建立預演';
      editor.transaction = null;
    }
    editor.previewing = false;
    renderEditor();
  }

  function scheduleCandidates(editor) {
    var item = findOccurrence(editor.id);
    if (!item) return [];
    var itemDay = fineDayId(item);
    var parts = scheduleParts(scheduleFor(itemDay), itemDay, activeVersion());
    return fineSort(parts.precise.concat(parts.unplanned)).filter(function (candidate) { return candidate.id !== item.id; });
  }

  function transactionScheduleForIssue(transaction, issue) {
    if (!transaction) return null;
    if (issue && issue.day && transaction.afterSchedules && transaction.afterSchedules[issue.day]) return transaction.afterSchedules[issue.day];
    return transaction.afterSchedule || null;
  }

  function issueOccurrence(transaction, issue, id) {
    var schedule = transactionScheduleForIssue(transaction, issue);
    var scheduled = schedule && Array.isArray(schedule.items) && schedule.items.find(function (item) { return item.id === id; });
    if (scheduled) return scheduled;
    var mutation = transaction && Array.isArray(transaction.mutations) && transaction.mutations.find(function (entry) { return entry.occurrenceId === id; });
    return mutation && mutation.after || findOccurrence(id);
  }

  function occurrenceDateLabel(item) {
    var iso = item && item.fine && item.fine.startAt;
    if (!iso) return '';
    var parts = iso.slice(0, 10).split('-');
    return parts.length === 3 ? (+parts[1]) + '/' + (+parts[2]) : '';
  }

  function occurrenceTimeLabel(item, edge) {
    if (!item || !item.fine) return '時間未定';
    return timeFromIso(edge === 'end' ? item.fine.endAt : item.fine.startAt) || '時間未定';
  }

  function issueRouteLabel(transaction, issue, left, right) {
    if (!left || !right) return '';
    var date = occurrenceDateLabel(right) || occurrenceDateLabel(left);
    return (date ? date + ' ' : '') + occurrenceTitle(left) + ' ' + occurrenceTimeLabel(left, 'end') + ' 結束 → ' + occurrenceTitle(right) + ' ' + occurrenceTimeLabel(right, 'start') + ' 開始';
  }

  function issueDescription(issue, transaction) {
    var ids = issue.occurrenceIds || [];
    var left = issueOccurrence(transaction, issue, ids[0]);
    var right = issueOccurrence(transaction, issue, ids[1]);
    var minutes = Math.max(0, +issue.minutes || 0);
    if ((issue.type === 'gap' || issue.type === 'conflict') && left && right) {
      return issueRouteLabel(transaction, issue, left, right) + '：' + (issue.type === 'gap' ? '空檔 ' : '重疊 ') + minutes + ' 分鐘';
    }
    if (issue.type === 'travel_shortage' && left) {
      var from = left.transport && issueOccurrence(transaction, issue, left.transport.fromOccurrenceId);
      var to = left.transport && issueOccurrence(transaction, issue, left.transport.toOccurrenceId);
      var route = from && to ? occurrenceTitle(from) + ' → ' + occurrenceTitle(to) : occurrenceTitle(left);
      return (occurrenceDateLabel(left) ? occurrenceDateLabel(left) + ' ' : '') + route + '：交通時間還缺 ' + minutes + ' 分鐘';
    }
    if (issue.type === 'unknown_travel' && left) {
      var schedule = transactionScheduleForIssue(transaction, issue);
      var items = schedule && Array.isArray(schedule.items) ? schedule.items : [];
      var index = items.findIndex(function (item) { return item.id === left.id; });
      if (isTransportOccurrence(left)) {
        var actualFrom = index > 0 ? items[index - 1] : null;
        var actualTo = index >= 0 && index + 1 < items.length ? items[index + 1] : null;
        var missing = [];
        if (!left.transport || !left.transport.fromOccurrenceId) missing.push('起點');
        if (!left.transport || !left.transport.toOccurrenceId) missing.push('終點');
        if (!left.transport || !(+left.transport.minDurationMin > 0)) missing.push('交通時間');
        if (issue.actualOccurrenceIds && issue.expectedOccurrenceIds) missing.push('正確的前後銜接');
        var actualRoute = actualFrom || actualTo ? (actualFrom ? occurrenceTitle(actualFrom) : '起點未定') + ' → ' + (actualTo ? occurrenceTitle(actualTo) : '終點未定') : occurrenceTitle(left);
        return actualRoute + '：缺少' + (missing.length ? missing.join('、') : '可用的路線資料');
      }
      var previous = index > 0 ? items[index - 1] : null;
      var next = index >= 0 && index + 1 < items.length ? items[index + 1] : null;
      var routes = [];
      if (previous) routes.push(occurrenceTitle(previous) + ' → ' + occurrenceTitle(left));
      if (next) routes.push(occurrenceTitle(left) + ' → ' + occurrenceTitle(next));
      return (routes.length ? routes.join('、') + '：' : occurrenceTitle(left) + '：') + '「' + occurrenceTitle(left) + '」缺少地點資料，無法確認交通時間';
    }
    if (left) {
      return (occurrenceDateLabel(left) ? occurrenceDateLabel(left) + ' ' : '') + occurrenceTitle(left) + ' ' + occurrenceTimeLabel(left, 'start') + '：' + (issue.message || (minutes ? '相差 ' + minutes + ' 分鐘' : '需要確認'));
    }
    return issue.message || (minutes ? '相差 ' + minutes + ' 分鐘' : '請選擇要如何處理');
  }

  function resolutionImpact(resolution, transaction) {
    var api = ffApi();
    var rid = resolution && (resolution.id || resolution.resolutionId || resolution.action || resolution.type);
    if (!rid || typeof api.applyResolution !== 'function') return 0;
    try {
      var preview = api.applyResolution(transaction, rid);
      return preview && Array.isArray(preview.mutations) ? preview.mutations.filter(function (mutation) {
        if (!mutation.before || !mutation.after || !mutation.before.fine || !mutation.after.fine) return false;
        return mutation.before.fine.startAt !== mutation.after.fine.startAt || mutation.before.fine.endAt !== mutation.after.fine.endAt;
      }).length : 0;
    } catch (_) { return 0; }
  }

  function resolutionLabel(resolution, issue, transaction) {
    var action = resolution.action || resolution.type || resolution.id || '';
    var target = resolution.occurrenceId && issueOccurrence(transaction, issue, resolution.occurrenceId);
    var title = target ? occurrenceTitle(target) : (issue && issue.occurrenceIds && issue.occurrenceIds.length ? occurrenceTitle(issueOccurrence(transaction, issue, issue.occurrenceIds[0])) : '行程');
    var minutes = Math.max(0, +(resolution.minutes != null ? resolution.minutes : issue && issue.minutes) || 0);
    var affected = resolutionImpact(resolution, transaction);
    if (action === 'connect') return '將' + title + '提前 ' + minutes + ' 分鐘' + (affected > 1 ? '，共調整 ' + affected + ' 項' : '');
    if (action === 'push') return '將後面 ' + (affected || 1) + ' 項順延 ' + minutes + ' 分鐘';
    if (action === 'shorten') return '將' + title + '縮短 ' + minutes + ' 分鐘';
    if (action === 'keep_gap') return '保留這段 ' + minutes + ' 分鐘空檔';
    if (action === 'accept_conflict') return '保留 ' + minutes + ' 分鐘重疊（這次）';
    if (action === 'override_anchor') return '移動固定行程' + (affected ? '，共調整 ' + affected + ' 項' : '') + (minutes ? '、' + minutes + ' 分鐘' : '');
    if (action === 'relink_transport') return '改連為' + occurrenceTitle(issueOccurrence(transaction, issue, resolution.fromOccurrenceId)) + ' → ' + occurrenceTitle(issueOccurrence(transaction, issue, resolution.toOccurrenceId));
    return resolution.label || resolution.message || action || '套用這個修復';
  }

  function issueTitle(issue) {
    return ({ gap: '出現空檔', conflict: '時間重疊', travel_shortage: '交通時間不足', anchor_violation: '碰到固定行程', day_overflow: '行程跨到隔日', unknown_travel: '交通時間未知' })[issue.type] || '需要確認';
  }

  function transactionIssues(transaction) {
    if (!transaction) return [];
    if (Array.isArray(transaction.issues)) return transaction.issues;
    if (transaction.afterSchedule && Array.isArray(transaction.afterSchedule.issues)) return transaction.afterSchedule.issues;
    return [];
  }

  function issueCard(issue, index, transaction, options) {
    options = options || {};
    var resolutions = Array.isArray(issue.resolutions) ? issue.resolutions : [];
    var status = issue.status || 'new';
    var statusText = issue.accepted ? '已接受，保留警示' : (({ preexisting: '原本已有', worsened: '本次惡化', resolved: '已處理', new: '本次新增' })[status] || '');
    return '<article class="ff-issue ' + h(issue.severity || 'warning') + (status === 'resolved' ? ' resolved' : '') + '">' +
      '<div class="ff-issue-no">' + (index + 1) + '</div><div class="ff-issue-body"><div class="ff-issue-head"><b>' + h(issueTitle(issue)) + '</b><span>' + h(statusText) + '</span></div>' +
      '<p>' + h(issueDescription(issue, transaction)) + '</p>' +
      (options.showResolutions !== false && resolutions.length ? '<div class="ff-resolutions">' + resolutions.map(function (resolution, rIndex) {
        var rid = resolution.id || resolution.resolutionId || resolution.action || resolution.type;
        return '<button type="button" data-action="ff-resolution" data-id="' + h(rid) + '"' + (rIndex === 0 ? ' class="recommended"' : '') + '>' + h(resolutionLabel(resolution, issue, transaction)) + '</button>';
      }).join('') + '</div>' : (options.showResolutions === false || status === 'resolved' || issue.accepted ? '' : '<span class="ff-unresolved">目前沒有可自動套用的做法，仍可自行調整時間或資料</span>')) + '</div></article>';
  }

  function editorChangeSummary(editor, pendingCount) {
    var changes = [];
    if (editor.originalDate !== editor.date) changes.push('日期：' + editor.originalDate + ' → ' + editor.date);
    if (editor.originalStart !== editor.start || editor.originalEnd !== editor.end) changes.push('時間：' + editor.originalStart + '–' + editor.originalEnd + ' → ' + editor.start + '–' + editor.end);
    if (editor.coarseVisible && editor.originalCoarseSlot !== editor.coarseSlot) changes.push('粗流時段：' + coarseSlotLabel(editor.originalCoarseSlot) + ' → ' + coarseSlotLabel(editor.coarseSlot));
    return '<section class="ff-change-summary" aria-label="本次修改摘要"><div class="ff-change-head"><div><span>本次修改</span><b>' + h(changes.length ? changes.join('；') : '日期與時間沒有變更') + '</b></div><span>尚待決定 ' + pendingCount + ' 項</span></div></section>';
  }

  function summaryText(transaction) {
    var summary = transaction && transaction.summary || {};
    var bits = [];
    if (summary.swapped) bits.push('交換 ' + summary.swapped + ' 項');
    if (summary.moved) bits.push('移動 ' + summary.moved + ' 項');
    if (summary.shortened) bits.push('縮短 ' + summary.shortened + ' 項');
    if (!bits.length && transaction && transaction.mutations) bits.push('調整 ' + transaction.mutations.length + ' 項');
    return bits.join('、') || '尚無變更';
  }

  function acceptPreviewConflicts() {
    if (!state.editor || !state.editor.transaction) return;
    var api = ffApi();
    var transaction = state.editor.transaction;
    try {
      transactionIssues(transaction).filter(function (issue) {
        return issue.type === 'conflict' && !issue.accepted && (issue.status === 'new' || issue.status === 'worsened');
      }).forEach(function (issue) {
        var resolution = (issue.resolutions || []).find(function (entry) { return (entry.action || entry.type || entry.id) === 'accept_conflict'; });
        var resolutionId = resolution && (resolution.id || resolution.resolutionId || resolution.action || resolution.type);
        if (resolutionId && typeof api.applyResolution === 'function') transaction = api.applyResolution(transaction, resolutionId) || transaction;
      });
      state.editor.transaction = transaction;
      state.editor.mode = 'single';
      if (uiStore && state.editor.pointerMode) uiStore.dispatch({ type: 'PREVIEW_READY', transaction: transaction });
      renderEditor();
    } catch (error) {
      state.editor.error = error && error.message || '無法保留這次衝突';
      renderEditor();
    }
  }

  function isTransportOccurrence(item) {
    return !!item && (item.scheduleKind === 'transport' || item.scheduleKind === 'connector_travel' || item.scheduleKind === 'booked_transport' || item.scheduleKind === 'flight');
  }

  function transportEditorFields(item, editor) {
    if (!isTransportOccurrence(item)) return '';
    var options = activePlan().filter(function (entry) { return entry.id !== item.id; }).map(function (entry) {
      return '<option value="' + h(entry.id) + '">' + h(occurrenceTitle(entry)) + '</option>';
    }).join('');
    function endpointOptions(selected) {
      return '<option value="">未指定</option>' + options.replace('value="' + h(selected || '') + '"', 'value="' + h(selected || '') + '" selected');
    }
    var transport = editor.transport || {};
    return '<section class="ff-editor-section ff-transport-fields"><h4>交通銜接</h4><div class="ff-rule-grid"><label class="ff-field"><span>從哪項行程</span><select data-ff-transport-from>' + endpointOptions(transport.fromOccurrenceId) + '</select></label><label class="ff-field"><span>到哪項行程</span><select data-ff-transport-to>' + endpointOptions(transport.toOccurrenceId) + '</select></label></div><div class="ff-rule-grid"><label class="ff-field"><span>移動方式</span><select data-ff-transport-mode><option value="">未指定</option>' + ['walk', 'drive', 'transit', 'flight'].map(function (mode) {
      var label = ({ walk: '步行', drive: '開車／叫車', transit: '大眾運輸', flight: '飛行' })[mode];
      return '<option value="' + mode + '"' + (transport.mode === mode ? ' selected' : '') + '>' + label + '</option>';
    }).join('') + '</select></label><label class="ff-field"><span>路線名稱</span><input data-ff-transport-route maxlength="80" value="' + h(transport.routeLabel || '') + '" placeholder="例如：前往餐廳"></label></div></section>';
  }

  function placeEditorFields(item, editor) {
    var place = editor.placeCard;
    if (!item.placeId || !place) return '';
    var categories = typeof categoriesList === 'function' ? categoriesList() : [];
    var regions = typeof regionsList === 'function' ? regionsList() : [];
    var per = place.cost && place.cost.per === 'shared' ? 'shared' : 'person';
    var amount = place.cost && place.cost.amount != null ? place.cost.amount : '';
    return '<details class="ff-rules ff-place-card-fields"><summary>來源地點資料</summary><div class="ff-rules-body">' +
      '<p class="ff-link-note">這是這項行程引用的地點資料；在同一頁修改，不會再開另一套編輯器。若其他行程也引用這個地點，名稱與 Maps 會一起更新。</p>' +
      '<label class="ff-field"><span>Google Maps 連結</span><input type="url" inputmode="url" data-ff-place-maps value="' + h(place.mapsUrl || '') + '" placeholder="https://maps.google.com/…"></label>' +
      '<label class="ff-field"><span>地點備註</span><textarea data-ff-place-note maxlength="500" placeholder="例如營業提醒、訂位方式">' + h(place.note || '') + '</textarea></label>' +
      '<label class="ff-field"><span>營業時間</span><input data-ff-place-hours maxlength="120" value="' + h(place.hours || '') + '" placeholder="例如 11:00–21:00"></label>' +
      '<div class="ff-rule-grid"><label class="ff-field"><span>區域</span><select data-ff-place-area>' + regions.map(function (region) { return '<option value="' + h(region.key) + '"' + (region.key === place.area ? ' selected' : '') + '>' + h(region.label) + '</option>'; }).join('') + '</select></label>' +
      '<label class="ff-field"><span>類型</span><select data-ff-place-type>' + categories.map(function (category) { return '<option value="' + h(category.key) + '"' + (category.key === place.type ? ' selected' : '') + '>' + h(category.label) + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="ff-rule-grid"><label class="ff-field"><span>價格（NT$）</span><input type="number" inputmode="numeric" min="0" data-ff-place-amount value="' + h(amount) + '"></label>' +
      '<label class="ff-field"><span>計價方式</span><select data-ff-place-per><option value="person"' + (per === 'person' ? ' selected' : '') + '>每人</option><option value="shared"' + (per === 'shared' ? ' selected' : '') + '>共用</option></select></label></div>' +
      '<label class="ff-field"><span>優先程度</span><select data-ff-place-tier>' + [[0, '未分'], [1, 'T1 一定去'], [2, 'T2 滿想去'], [3, 'T3 順路'], [4, 'T4 可不去']].map(function (entry) { return '<option value="' + entry[0] + '"' + (+place.tier === entry[0] ? ' selected' : '') + '>' + entry[1] + '</option>'; }).join('') + '</select></label>' +
      '</div></details>';
  }

  function coarsePlanningFields(item, editor) {
    if (!editor.coarseVisible || !editor.coarseDay || !editor.coarseSlot || !item.placeId) return '';
    var slotItems = activePlan().filter(function (entry) { return entry.day === editor.coarseDay && entry.slot === editor.coarseSlot; });
    var currentIndex = Math.max(0, slotItems.findIndex(function (entry) { return entry.id === item.id; }));
    var placeOptions = (typeof places !== 'undefined' && Array.isArray(places) ? places : []).filter(function (place) {
      return place && place.id && (place.id === editor.placeId || !CNXCore.isScheduled(place.id, activePlan()));
    }).sort(function (left, right) { return String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hant'); });
    function options(selected, allowEmpty) {
      return (allowEmpty ? '<option value="">未指定</option>' : '') + placeOptions.map(function (place) {
        return '<option value="' + h(place.id) + '"' + (place.id === selected ? ' selected' : '') + '>' + h(place.name || place.id) + '</option>';
      }).join('');
    }
    return '<details class="ff-rules ff-coarse-planning"><summary>粗流安排工具</summary><div class="ff-rules-body">' +
      '<p class="ff-link-note">這些是同一筆行程在粗流裡的概略安排，儲存後細流仍保留同一個 ID。</p>' +
      '<label class="ff-field"><span>這次要去的地點</span><select data-ff-place-choice>' + options(editor.placeId, false) + '</select></label>' +
      (slotItems.length > 1 ? '<label class="ff-field"><span>同時段順序</span><select data-ff-coarse-order>' + slotItems.map(function (_entry, index) { return '<option value="' + index + '"' + (index === editor.coarseOrder || (editor.coarseOrder == null && index === currentIndex) ? ' selected' : '') + '>第 ' + (index + 1) + ' 個</option>'; }).join('') + '</select></label>' : '') +
      '<label class="ff-fixed-check"><input type="checkbox" data-ff-coarse-pk' + (editor.coarsePk ? ' checked' : '') + '><span><b>這格是二選一</b><small>保留多個候選，之後再決定要去哪一個。</small></span></label>' +
      '<div class="ff-rule-grid"><label class="ff-field"><span>備案 1</span><select data-ff-coarse-backup="0">' + options(editor.backupIds[0] || '', true) + '</select></label><label class="ff-field"><span>備案 2</span><select data-ff-coarse-backup="1">' + options(editor.backupIds[1] || '', true) + '</select></label></div>' +
      '</div></details>';
  }

  function renderEditor() {
    var editor = state.editor, item = editor && findOccurrence(editor.id);
    if (!editor || !item || typeof sh === 'undefined') return;
    if (editor.pointerCompact) { renderPointerDecision(); return; }
    var duration = editor.durationMin;
    var transaction = editor.transaction;
    var issues = transactionIssues(transaction);
    var pendingIssues = issues.filter(function (issue) { return !issue.accepted && (issue.status === 'new' || issue.status === 'worsened'); });
    var preexistingIssues = issues.filter(function (issue) { return issue.status === 'preexisting'; });
    var handledIssues = issues.filter(function (issue) { return issue.accepted || issue.status === 'resolved'; });
    var candidates = scheduleCandidates(editor);
    var blocking = pendingIssues.some(function (issue) {
      if (issue.severity === 'blocking') return true;
      return issue.type === 'conflict' || issue.type === 'travel_shortage' || issue.type === 'anchor_violation' || issue.type === 'day_overflow';
    });
    var linkedDay = dayIdForDate(editor.date);
    var coarseControls = '<section class="ff-coarse-control"><label class="ff-fixed-check"><input type="checkbox" data-ff-coarse' + (editor.coarseVisible ? ' checked' : '') + '><span><b>' + (editor.coarseVisible ? '粗流也顯示這項' : '只在細流') + '</b><small>' + (editor.coarseVisible ? '同一筆行程・' + h((dayMeta(linkedDay).label || linkedDay) + '・' + coarseSlotLabel(editor.coarseSlot)) : '適合交通、銜接與不需要出現在大方向的行程') + '</small></span></label>' +
      '<div class="ff-coarse-fields"' + (editor.coarseVisible ? '' : ' hidden') + '><label class="ff-field"><span>粗流時段</span><select data-ff-coarse-slot>' + coarseSlotOptions(editor.coarseSlot) + '</select></label><p class="ff-link-note">日期會跟著上方日期；粗流與細流共用名稱、備註與待辦。</p></div></section>';
    var titleField = '<label class="ff-field"><span>行程名稱</span><input data-ff-title maxlength="80" value="' + h(editor.title) + '"><small>' + (item.placeId ? '這個名稱來自同頁下方的來源地點資料。' : '粗流與細流共用這個名稱。') + '</small></label>';
    var minDate = typeof TRIP !== 'undefined' && TRIP && TRIP.startDate || '';
    var maxDate = typeof TRIP !== 'undefined' && TRIP && TRIP.endDate || '';
    var editorFields = '<label class="ff-field"><span>日期</span><input type="date" data-ff-date value="' + h(editor.date) + '" min="' + h(minDate) + '" max="' + h(maxDate) + '"></label>' +
      '<div class="ff-time-fields"><label class="ff-field"><span>開始</span><input type="time" data-ff-start value="' + h(editor.start) + '"></label><span aria-hidden="true">→</span><label class="ff-field"><span>結束</span><input type="time" data-ff-end value="' + h(editor.end) + '"></label></div>';
    var maps = mapsForOccurrence(item);
    var mapSection = '<section class="ff-editor-section"><h4>Maps</h4><div class="ff-detail-maps-list">' + (maps.length ? maps.map(function (link) {
      return '<a class="ff-detail-maps" href="' + h(link.url) + '" target="_blank" rel="noopener noreferrer"><span>' + h(link.label || '在 Google Maps 開啟') + '</span><span aria-hidden="true">↗</span></a>';
    }).join('') : '<p class="ff-detail-missing">這項行程沒有 Maps 連結</p>') + '</div></section>';
    var todos = (item.todos || []).map(function (todo) {
      return '<button type="button" class="ff-todo-row' + (todo.done ? ' done' : '') + '" data-action="ff-detail-todo" data-eid="' + h(item.id) + '" data-todo="' + h(todo.id) + '" aria-pressed="' + todo.done + '"><span class="ff-check" aria-hidden="true">' + (todo.done ? '✓' : '') + '</span><span class="ff-detail-todo-text">' + h(todo.text) + '</span></button>';
    }).join('');
    var noteSection = '<section class="ff-editor-section"><label class="ff-field"><span>本次行程備註</span><textarea data-ff-notes maxlength="500" placeholder="' + h(editor.placeNote ? '卡片備註：' + editor.placeNote : '選填') + '">' + h(editor.notes) + '</textarea></label></section>';
    var todoSection = '<section class="ff-editor-section"><h4>待辦事項</h4><div class="ff-detail-todo-list">' + (todos || '<p class="ff-detail-missing">目前沒有待辦</p>') + '</div><div class="ff-todo-add"><input data-ff-detail-todo-text maxlength="120" placeholder="新增待辦"><button type="button" data-action="ff-detail-todo-add" data-eid="' + h(item.id) + '">新增</button></div></section>';
    var transportSection = transportEditorFields(item, editor);
    var placeSection = placeEditorFields(item, editor);
    var coarsePlanning = coarsePlanningFields(item, editor);
    var rules = '<details class="ff-rules"' + (editor.rulesOpen ? ' open' : '') + '><summary>更多設定</summary><div class="ff-rules-body">' +
      '<div class="ff-modes" role="tablist" aria-label="調整方式">' + [['single', '只改這項'], ['ripple', '連動後面'], ['swap', '交換行程']].map(function (mode) {
        return '<button type="button" role="tab" aria-selected="' + (editor.mode === mode[0]) + '" class="' + (editor.mode === mode[0] ? 'active' : '') + '" data-action="ff-mode" data-mode="' + mode[0] + '"' + (editor.firstSchedule && mode[0] !== 'single' ? ' disabled' : '') + '>' + mode[1] + '</button>';
      }).join('') + '</div>' + (editor.mode === 'swap' ? '<label class="ff-field"><span>交換對象</span><select data-ff-target><option value="">請選一項</option>' + candidates.map(function (candidate) {
        var time = candidate.fine ? timeFromIso(candidate.fine.startAt) : '未排';
        return '<option value="' + h(candidate.id) + '"' + (candidate.id === editor.targetId ? ' selected' : '') + (!candidate.fine ? ' disabled' : '') + '>' + h(time + '｜' + kindLabel(candidate.scheduleKind) + '｜' + occurrenceTitle(candidate) + (candidate.fine && candidate.fine.fixedMarker ? '｜固定' : '')) + '</option>';
      }).join('') + '</select></label>' : '') +
      '<label class="ff-fixed-check"><input type="checkbox" data-ff-fixed' + (editor.fixedMarker ? ' checked' : '') + '><span>標記為固定行程</span></label>' +
      '<div class="ff-rule-grid"><label class="ff-field"><span>可縮短性</span><select data-ff-compress><option value="none"' + (editor.compressibility === 'none' ? ' selected' : '') + '>不可縮短</option><option value="suggest"' + (editor.compressibility === 'suggest' ? ' selected' : '') + '>可建議縮短</option><option value="free"' + (editor.compressibility === 'free' ? ' selected' : '') + '>可自由縮短</option></select></label>' +
      '<label class="ff-field"><span>最低分鐘</span><input type="number" inputmode="numeric" min="1" max="1440" data-ff-min value="' + h(editor.minDurationMin) + '"' + (editor.compressibility === 'none' ? ' disabled' : '') + '></label></div>' +
      '</div></details>';
    var notice = editor.notice ? '<div class="ff-preview-state notice" role="status">' + h(editor.notice) + '</div>' : '';
    var issueGroups = '';
    if (pendingIssues.length) {
      issueGroups += '<section class="ff-issues ff-current-issues"><div class="ff-section-title">這次修改需要處理（' + pendingIssues.length + '）</div>' + pendingIssues.map(function (issue, index) { return issueCard(issue, index, transaction); }).join('') + '</section>';
    } else if (transaction) {
      issueGroups += '<div class="ff-no-issue">✓ 這次修改沒有新增需要處理的問題</div>';
    }
    if (preexistingIssues.length) {
      issueGroups += '<details class="ff-rules ff-existing-issues"><summary>這天原本就有的提醒（' + preexistingIssues.length + '）</summary><div class="ff-rules-body">' + preexistingIssues.map(function (issue, index) { return issueCard(issue, index, transaction, { showResolutions: false }); }).join('') + '</div></details>';
    }
    if (handledIssues.length) {
      issueGroups += '<details class="ff-rules ff-handled-issues"><summary>這次已決定或已處理（' + handledIssues.length + '）</summary><div class="ff-rules-body">' + handledIssues.map(function (issue, index) { return issueCard(issue, index, transaction, { showResolutions: false }); }).join('') + '</div></details>';
    }
    var preview = editor.previewing ? '<div class="ff-preview-state" role="status">正在檢查時間…</div>' :
      editor.error ? '<div class="ff-preview-state error" role="alert">' + h(editor.error) + '</div>' :
      issueGroups;
    var html = '<div class="ff-sheet ff-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-editor-title"><div class="ff-sheet-head"><span class="ff-kicker">編輯' + h(kindLabel(item.scheduleKind)) + '</span><h3 id="ff-editor-title">' + h(editor.title || occurrenceTitle(item)) + '</h3><p>粗流與細流共用這一頁；儲存後兩邊會同步更新。</p></div>' +
      '<div class="ff-sheet-scroll">' + editorChangeSummary(editor, pendingIssues.length) + titleField + editorFields + coarseControls + transportSection + mapSection + noteSection + todoSection + placeSection + coarsePlanning + rules + notice + preview + '</div>' +
      '<div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-apply"' + (!transaction || blocking || !editor.title.trim() ? ' disabled' : '') + '>儲存</button></div></div>';
    openSheet(html, function () { renderEditor(); }, 'fineflow-editor');
  }

  function openEditor(id) {
    var item = findOccurrence(id);
    if (!item) return;
    state.selectedId = id;
    var start = timeFromIso(item.fine && item.fine.startAt) || item.startTime || defaultTime(item.slot);
    var duration = minuteDuration(item) || 60;
    var place = item.placeId && typeof getPlace === 'function' ? getPlace(item.placeId) : null;
    var slotMeta = item.day && item.slot && typeof CNXCore !== 'undefined' && typeof CNXCore.getSlotMeta === 'function' ? CNXCore.getSlotMeta(activeVersion(), item.day, item.slot) : null;
    var sameSlot = item.day && item.slot ? activePlan().filter(function (entry) { return entry.day === item.day && entry.slot === item.slot; }) : [];
    state.editor = {
      id: id, versionId: activeVersion() && activeVersion().id, mode: 'single',
      title: occurrenceTitle(item), notes: item.notes || '',
      placeNote: place ? place.note || '' : '', placeId: item.placeId || null, originalPlaceId: item.placeId || null, placeCard: place ? copy(place) : null,
      date: fineDate(item),
      start: start, end: timeFromIso(item.fine && item.fine.endAt) || addMinutesToTime(start, duration),
      originalDate: fineDate(item), originalStart: start, originalEnd: timeFromIso(item.fine && item.fine.endAt) || addMinutesToTime(start, duration),
      durationMin: duration, firstSchedule: !item.fine,
      fixedMarker: !!(item.fine && item.fine.fixedMarker),
      compressibility: item.fine && item.fine.compressibility || 'none',
      minDurationMin: item.fine && item.fine.minDurationMin || duration,
      coarseVisible: !!(item.day && item.slot), coarseDay: item.day || dayIdForDate(fineDate(item)),
      coarseSlot: item.slot || slotFromTime(start),
      originalCoarseSlot: item.slot || slotFromTime(start),
      coarseOrder: Math.max(0, sameSlot.findIndex(function (entry) { return entry.id === item.id; })),
      coarsePk: !!(slotMeta && slotMeta.pk), backupIds: slotMeta && Array.isArray(slotMeta.backups) ? slotMeta.backups.slice(0, 2) : [],
      transport: copy(item.transport || {}),
      targetId: '', transaction: null, error: '', notice: '', previewing: false, rulesOpen: false
    };
    if (uiStore) {
      var guard = currentGuard();
      uiStore.dispatch({ type: 'OPEN_EDIT', occurrenceId: id, versionId: guard.versionId, baseFingerprint: guard.baseFingerprint, draft: { start: start, end: state.editor.end } });
    }
    renderEditor();
    runPreview();
  }

  function replaceVersionInPlace(target, source) {
    Object.keys(target).forEach(function (key) { if (!Object.prototype.hasOwnProperty.call(source, key)) delete target[key]; });
    Object.keys(source).forEach(function (key) { target[key] = copy(source[key]); });
  }

  function applyCoarseEditorFields(version, editor, editedItem) {
    if (!version || !editedItem) return;
    var oldPlaceId = editedItem.placeId || null;
    if (editor.placeId && editor.placeId !== oldPlaceId) {
      if (editor.coarseVisible && typeof CNXCore !== 'undefined' && typeof CNXCore.swapOccurrence === 'function') {
        CNXCore.swapOccurrence(version, editedItem.id, editor.placeId, { demote: true });
        editedItem = version.plan.find(function (entry) { return entry.id === editor.id; }) || editedItem;
      } else editedItem.placeId = editor.placeId;
    }
    editedItem.day = editor.coarseVisible ? editor.coarseDay : null;
    editedItem.slot = editor.coarseVisible ? editor.coarseSlot : null;
    if (!editor.coarseVisible || typeof CNXCore === 'undefined') return;
    if (typeof CNXCore.ensureSlotMeta === 'function') {
      var meta = CNXCore.ensureSlotMeta(version, editedItem.day, editedItem.slot);
      var backups = (editor.backupIds || []).filter(Boolean).filter(function (id, index, list) { return id !== editedItem.placeId && list.indexOf(id) === index; });
      if (oldPlaceId && oldPlaceId !== editedItem.placeId && backups.indexOf(oldPlaceId) < 0) backups.unshift(oldPlaceId);
      meta.backups = backups.slice(0, 2);
      meta.pk = !!editor.coarsePk;
    }
    var sameSlot = version.plan.filter(function (entry) { return entry.day === editedItem.day && entry.slot === editedItem.slot; }).sort(function (left, right) {
      var leftSeq = left.seq == null ? Number.MAX_SAFE_INTEGER : +left.seq;
      var rightSeq = right.seq == null ? Number.MAX_SAFE_INTEGER : +right.seq;
      return leftSeq - rightSeq;
    });
    var currentIndex = sameSlot.findIndex(function (entry) { return entry.id === editedItem.id; });
    if (currentIndex >= 0 && sameSlot.length > 1) {
      var chosen = sameSlot.splice(currentIndex, 1)[0];
      sameSlot.splice(Math.max(0, Math.min(sameSlot.length, +editor.coarseOrder || 0)), 0, chosen);
      sameSlot.forEach(function (entry, index) { entry.seq = index; });
    }
    if (typeof CNXCore.pruneSlotMeta === 'function') CNXCore.pruneSlotMeta(version);
  }

  function applyEditorTransaction() {
    var editor = state.editor, transaction = editor && editor.transaction, version = activeVersion();
    if (!transaction || !version) return;
    if (!editor.title || !editor.title.trim()) {
      editor.error = '請填行程名稱';
      renderEditor();
      return;
    }
    if (version.id !== editor.versionId || (transaction.versionId && transaction.versionId !== version.id)) {
      editor.transaction = null;
      editor.error = '目前版本已切換，這份預演不會套用。請在新版本重新開啟行程。';
      renderEditor();
      return;
    }
    var before = copy(version), api = ffApi();
    var targetPlaceBefore = editor.placeId && typeof getPlace === 'function' ? getPlace(editor.placeId) : null;
    var beforePlace = targetPlaceBefore ? copy(targetPlaceBefore) : null;
    try {
      if (transaction.manualFirstSchedule && typeof api.baseFingerprint === 'function') {
        var manualItem = findOccurrence(editor.id);
        var currentDayFingerprint = manualItem && api.baseFingerprint(buildSchedule(version, fineDayId(manualItem)));
        if (!manualItem || currentDayFingerprint !== transaction.baseFingerprint) {
          editor.notice = '行程剛被更新，以下已改用最新資料重新計算。';
          runPreview();
          return;
        }
      }
      if (editor.pointerMode && uiStore && typeof api.baseFingerprint === 'function') {
        var activeItem = findOccurrence(editor.id);
        var confirmEvent = { type: 'CONFIRM', activeVersionId: version.id };
        if (Array.isArray(transaction.days) && transaction.baseFingerprints) {
          confirmEvent.currentFingerprints = {};
          transaction.days.forEach(function (day) {
            confirmEvent.currentFingerprints[day] = api.baseFingerprint(buildSchedule(version, day));
          });
        } else {
          confirmEvent.currentFingerprint = api.baseFingerprint(buildSchedule(version, fineDayId(activeItem)));
        }
        var confirmation = uiStore.dispatch(confirmEvent);
        var applyCommand = confirmation.effects.some(function (effect) { return effect.command === 'apply-transaction'; });
        if (!applyCommand) {
          var failedEffect = confirmation.effects[0] || {};
          editor.error = failedEffect.message || '這份預演已過期，請重新計算';
          renderEditor();
          return;
        }
      }
      var result = !transaction.manualFirstSchedule && transaction.crossDay && typeof api.applyCrossDayTransaction === 'function' ? api.applyCrossDayTransaction(version, transaction) :
        (!transaction.manualFirstSchedule && typeof api.applyTransaction === 'function' ? api.applyTransaction(version, transaction) : null);
      var next = result && result.version ? result.version : result;
      if (!next || !Array.isArray(next.plan)) {
        next = copy(version);
        (transaction.mutations || []).forEach(function (mutation) {
          var index = next.plan.findIndex(function (item) { return item.id === mutation.occurrenceId; });
          if (index >= 0 && mutation.after) next.plan[index] = copy(mutation.after);
        });
      }
      var editedItem = next.plan.find(function (item) { return item.id === editor.id; });
      if (editedItem) {
        if (editedItem.custom) editedItem.custom.title = editor.title.trim();
        editedItem.notes = editor.notes || '';
        if (isTransportOccurrence(editedItem)) editedItem.transport = copy(editor.transport || {});
        applyCoarseEditorFields(next, editor, editedItem);
      }
      var inverse = typeof api.invertTransaction === 'function' && !transaction.manualFirstSchedule ? api.invertTransaction(transaction, next) : null;
      replaceVersionInPlace(version, next);
      if (editor.placeCard && editor.placeId && typeof getPlace === 'function') {
        var targetPlace = getPlace(editor.placeId);
        if (targetPlace) {
          var normalizedPlace = copy(editor.placeCard);
          normalizedPlace.name = editor.title.trim();
          replaceVersionInPlace(targetPlace, normalizedPlace);
        }
      }
      if (typeof syncActive === 'function') syncActive();
      if (typeof afterChange === 'function') afterChange();
      if (typeof closeSheet === 'function') closeSheet();
      state.editor = null;
      if (uiStore && inverse) uiStore.dispatch({ type: 'APPLY_SUCCEEDED', inverseTransaction: inverse, appliedVersion: next });
      var message = '已' + summaryText(transaction);
      if (typeof toast === 'function') toast(message, { undo: function () {
        var current = activeVersion();
        if (!current || current.id !== before.id) { toast('請先切回原版本再復原'); return; }
        replaceVersionInPlace(current, before);
        if (beforePlace && typeof getPlace === 'function') {
          var currentPlace = getPlace(beforePlace.id);
          if (currentPlace) replaceVersionInPlace(currentPlace, beforePlace);
        }
        if (typeof syncActive === 'function') syncActive();
        if (typeof afterChange === 'function') afterChange();
      }});
    } catch (err) {
      if (err && err.code === 'FINEFLOW_STALE_BASE') {
        editor.notice = '行程剛被更新，以下已改用最新資料重新計算。';
        runPreview();
      } else {
        editor.error = err && err.message ? err.message : '套用失敗，正式行程沒有變更';
        renderEditor();
      }
    }
  }

  function openTodos(dayId) {
    var entries = [];
    activePlan().forEach(function (item) {
      if (dayId && fineDayId(item) !== dayId) return;
      (item.todos || []).forEach(function (todo) { entries.push({ item: item, todo: todo }); });
    });
    var body = entries.length ? entries.map(function (entry) {
      var meta = dayMeta(fineDayId(entry.item));
      return '<button type="button" class="ff-todo-row' + (entry.todo.done ? ' done' : '') + '" data-action="ff-todo-toggle" data-eid="' + h(entry.item.id) + '" data-todo="' + h(entry.todo.id) + '" aria-pressed="' + entry.todo.done + '">' +
        '<span class="ff-check">' + (entry.todo.done ? '✓' : '') + '</span><span><b>' + h(entry.todo.text) + '</b><small>' + h(meta.label + '・' + (timeFromIso(entry.item.fine && entry.item.fine.startAt) || '未排時間') + '・' + occurrenceTitle(entry.item)) + '</small></span></button>';
    }).join('') : '<div class="ff-sheet-empty">目前沒有待辦</div>';
    openSheet('<div class="ff-sheet ff-todo-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-todo-title"><div class="ff-sheet-head"><span class="ff-kicker">集中清單</span><h3 id="ff-todo-title">' + (dayId ? h(dayMeta(dayId).label + ' 待辦') : '全部待辦') + '</h3><p>待辦會跟著行程本體一起移動。</p></div><div class="ff-sheet-scroll">' + body + '</div></div>', function () { openTodos(dayId); }, 'fineflow-todos');
  }

  function openCustom(dayId) {
    var options = (typeof DAYS !== 'undefined' ? DAYS : []).map(function (day) { return '<option value="' + h(day.id) + '"' + (day.id === (dayId || state.day) ? ' selected' : '') + '>' + h(day.label + '（' + day.wd + '）') + '</option>'; }).join('');
    openSheet('<div class="ff-sheet ff-custom-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-add-title"><div class="ff-sheet-head"><span class="ff-kicker">新增</span><h3 id="ff-add-title">自訂行程</h3><p>適合起床、退房、排隊或沒有地點卡的活動。</p></div><div class="ff-sheet-scroll"><label class="ff-field"><span>行程名稱</span><input id="ff_custom_title" maxlength="80" placeholder="例如：起床、整理行李"></label><label class="ff-field"><span>日期</span><select id="ff_custom_day">' + options + '</select></label><div class="ff-time-fields"><label class="ff-field"><span>開始</span><input id="ff_custom_start" type="time" value="09:00"></label><span aria-hidden="true">→</span><label class="ff-field"><span>結束</span><input id="ff_custom_end" type="time" value="10:00"></label></div><label class="ff-fixed-check"><input id="ff_custom_fixed" type="checkbox"><span>標記為固定行程</span></label></div><div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-add-save">新增行程</button></div></div>', function () { openCustom(dayId); }, 'fineflow-custom');
    setTimeout(function () { var input = document.getElementById('ff_custom_title'); if (input) input.focus(); }, 0);
  }

  function slotFromTime(time) {
    if (typeof CNXCore !== 'undefined' && typeof CNXCore.slotFromTime === 'function') return CNXCore.slotFromTime(time);
    var hour = +(time || '09:00').slice(0, 2);
    if (hour < 9) return 'breakfast';
    if (hour < 12) return 'am';
    if (hour < 14) return 'lunch';
    if (hour < 16) return 'afternoon';
    if (hour < 18) return 'evening';
    if (hour < 20) return 'dinner';
    return 'night';
  }

  function saveCustom() {
    var titleEl = document.getElementById('ff_custom_title'), dayEl = document.getElementById('ff_custom_day');
    var startEl = document.getElementById('ff_custom_start'), endEl = document.getElementById('ff_custom_end');
    var title = titleEl && titleEl.value.trim(), dayId = dayEl && dayEl.value;
    var start = startEl && startEl.value, end = endEl && endEl.value;
    if (!title || !dayId || !start || !end) { if (typeof toast === 'function') toast('請填完名稱、日期與時間'); if (!title && titleEl) titleEl.focus(); return; }
    var date = dayDate(dayId), endDate = end <= start ? addDays(date, 1) : date;
    var startAt = zonedIso(date, start), endAt = zonedIso(endDate, end);
    var duration = Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60000);
    var version = activeVersion(), before = copy(version);
    var raw = {
      id: typeof uid === 'function' ? uid() : 'ff_' + Date.now(), placeId: null,
      custom: { title: title, kind: 'life' }, day: null, slot: null, startTime: start,
      fine: { startAt: startAt, endAt: endAt, originalDurationMin: duration, minDurationMin: duration,
        compressibility: 'none', fixedMarker: !!(document.getElementById('ff_custom_fixed') || {}).checked,
        timeCommitment: 'flexible', autoMovePolicy: 'manual', manualOrder: activePlan().length },
      scheduleKind: 'custom', transport: null, todos: [], seq: activePlan().length
    };
    var item = typeof CNXCore !== 'undefined' && typeof CNXCore.normalizeOccurrence === 'function' ? CNXCore.normalizeOccurrence(raw) : raw;
    if (!item) { toast('這筆行程的時間格式不正確'); return; }
    version.plan.push(item);
    if (typeof syncActive === 'function') syncActive();
    if (typeof afterChange === 'function') afterChange();
    closeSheet();
    if (typeof toast === 'function') toast('已新增「' + title + '」', { undo: function () {
      var current = activeVersion();
      if (!current || current.id !== before.id) { toast('請先切回原版本再復原'); return; }
      replaceVersionInPlace(current, before);
      if (typeof syncActive === 'function') syncActive();
      if (typeof afterChange === 'function') afterChange();
    }});
  }

  function currentGuard() {
    var version = activeVersion();
    return { versionId: version && version.id, baseFingerprint: baseFingerprint() };
  }

  function guardStillCurrent(guard) {
    var version = activeVersion();
    return !!version && !!guard && version.id === guard.versionId && baseFingerprint() === guard.baseFingerprint;
  }

  function applyPlanChange(label, guard, change, undoExtra) {
    var version = activeVersion();
    if (!guardStillCurrent(guard)) {
      state.createDraft = null;
      if (uiStore) uiStore.dispatch({ type: 'SYNC_RELOADED' });
      if (typeof toast === 'function') toast('行程剛被更新，請重新操作');
      return false;
    }
    var before = copy(version);
    var next = copy(version);
    change(next);
    replaceVersionInPlace(version, next);
    if (typeof syncActive === 'function') syncActive();
    if (typeof afterChange === 'function') afterChange();
    else renderFineFlow();
    if (typeof toast === 'function') toast(label, { undo: function () {
      var current = activeVersion();
      if (!current || current.id !== before.id) { toast('請先切回原版本再復原'); return; }
      replaceVersionInPlace(current, before);
      if (typeof undoExtra === 'function') undoExtra(current);
      if (typeof syncActive === 'function') syncActive();
      if (typeof afterChange === 'function') afterChange();
      else renderFineFlow();
    }});
    return true;
  }

  function closeFineflowSheets() {
    var limit = 0;
    while (typeof sheetOpen === 'function' && sheetOpen() && sh && sh.querySelector('.ff-sheet') && limit++ < 6) closeSheet();
  }

  function sourceDraft(seed) {
    var draft = Object.assign({}, seed || {});
    var guard = currentGuard();
    draft.versionId = guard.versionId;
    draft.baseFingerprint = guard.baseFingerprint;
    return draft;
  }

  function keepCreateDraftVisible(draft) {
    if (!draft || !draft.start) return;
    var scroll = document.querySelector('#' + rootId + ' .ff-cal-scroll');
    if (!scroll) return;
    var minute = +draft.start.slice(0, 2) * 60 + +draft.start.slice(3);
    var target = minute * calendarPixelsPerHour() / 60 - 145;
    var maximum = scroll.scrollHeight - scroll.clientHeight;
    scroll.scrollTop = Math.max(0, maximum > 0 ? Math.min(maximum, target) : target);
  }

  function openSourceMenu(seed) {
    var draft = sourceDraft(seed);
    state.createDraft = draft;
    if (uiStore) {
      if (draft.day && draft.start) uiStore.dispatch({ type: 'OPEN_CREATE_AT', day: draft.day, startAt: zonedIso(draft.date, draft.start), draft: draft, versionId: draft.versionId, baseFingerprint: draft.baseFingerprint });
      else uiStore.dispatch({ type: 'OPEN_ADD_SOURCE', draft: draft, versionId: draft.versionId, baseFingerprint: draft.baseFingerprint });
    }
    renderFineFlow();
    keepCreateDraftVisible(draft);
    var timing = draft.start ? '<p class="ff-source-time">' + h(draft.date + '・' + draft.start) + '</p>' : '<p>先選內容，下一步再填日期與時間。</p>';
    openSheet('<div class="ff-sheet ff-source-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-source-title"><div class="ff-sheet-head"><span class="ff-kicker">新增</span><h3 id="ff-source-title">選擇新增來源</h3>' + timing + '</div><div class="ff-source-options">' +
      '<button type="button" data-action="ff-source-place"><span>▣</span><b>行程卡片</b><small>從卡片庫選既有地點</small></button>' +
      '<button type="button" data-action="ff-source-maps"><span>⌖</span><b>Google Maps</b><small>貼連結後排進時間格</small></button>' +
      '<button type="button" data-action="ff-source-custom"><span>＋</span><b>自訂行程</b><small>起床、退房、整理行李等</small></button>' +
      '</div></div>', function () { openSourceMenu(draft); }, 'fineflow-source');
  }

  function creationTimingFields(draft) {
    var date = draft.date || calendarAnchor();
    var start = draft.start || '09:00';
    var end = draft.end || addMinutesToTime(start, 60);
    var minDate = typeof TRIP !== 'undefined' && TRIP && TRIP.startDate || '';
    var maxDate = typeof TRIP !== 'undefined' && TRIP && TRIP.endDate || '';
    return '<label class="ff-field"><span>日期</span><input type="date" data-ff-create-date value="' + h(date) + '" min="' + h(minDate) + '" max="' + h(maxDate) + '"></label><div class="ff-time-fields"><label class="ff-field"><span>開始</span><input type="time" data-ff-create-start value="' + h(start) + '"></label><span aria-hidden="true">→</span><label class="ff-field"><span>結束</span><input type="time" data-ff-create-end value="' + h(end) + '"></label></div>';
  }

  function creationCoarseFields(draft) {
    var suggested = suggestedCoarsePosition(draft.date || calendarAnchor(), draft.start || '09:00');
    if (typeof draft.coarseVisible !== 'boolean') draft.coarseVisible = false;
    draft.coarseDay = draft.coarseDay || suggested.day;
    draft.coarseSlot = draft.coarseSlot || suggested.slot;
    return '<section class="ff-coarse-control"><label class="ff-fixed-check"><input type="checkbox" data-ff-create-coarse' + (draft.coarseVisible ? ' checked' : '') + '><span><b>' + (draft.coarseVisible ? '粗流也顯示這項' : '只在細流') + '</b><small>' + (draft.coarseVisible ? '同一筆行程，日期跟著上方日期' : '交通與銜接行程通常不必放進粗流') + '</small></span></label><div class="ff-coarse-fields"' + (draft.coarseVisible ? '' : ' hidden') + '><label class="ff-field"><span>粗流時段</span><select data-ff-create-coarse-slot>' + coarseSlotOptions(draft.coarseSlot) + '</select></label></div></section>';
  }

  function ensureCreateTimingDraft(title) {
    var draft = state.createDraft || sourceDraft({});
    draft.date = draft.date || calendarAnchor();
    draft.day = dayIdForDate(draft.date);
    draft.start = draft.start || '09:00';
    draft.end = draft.end || addMinutesToTime(draft.start, 60);
    if (title) draft.title = title;
    state.createDraft = draft;
    renderFineFlow();
    keepCreateDraftVisible(draft);
    return draft;
  }

  function openCustomCreate() {
    var draft = ensureCreateTimingDraft('新增行程');
    var categories = typeof categoriesList === 'function' ? categoriesList() : [];
    var options = categories.map(function (category) { return '<option value="' + h(category.key) + '">' + h((category.icon || '') + ' ' + category.label) + '</option>'; }).join('');
    openSheet('<div class="ff-sheet ff-create-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-create-title"><div class="ff-sheet-head"><span class="ff-kicker">自訂行程</span><h3 id="ff-create-title">新增自訂行程</h3><p>卡片會使用所選類別的同色系淺色。</p></div><div class="ff-sheet-scroll"><label class="ff-field"><span>行程名稱</span><input data-ff-create-title maxlength="80" placeholder="例如：起床、整理行李"></label><label class="ff-field"><span>類別</span><select data-ff-create-category>' + options + '</select></label><label class="ff-field"><span>備註</span><textarea data-ff-create-notes maxlength="500" placeholder="選填"></textarea></label>' + creationTimingFields(draft) + creationCoarseFields(draft) + '<label class="ff-fixed-check"><input type="checkbox" data-ff-create-fixed><span>標記為固定行程</span></label><div class="ff-create-error" role="alert"></div></div><div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-create-save" data-kind="custom">新增行程</button></div></div>', function () { openCustomCreate(); }, 'fineflow-create-custom');
  }

  function openPlaceCreate() {
    var coarseRows = activePlan().filter(function (item) { return item.day && item.slot && !item.fine; }).map(function (item) {
      var place = item.placeId && typeof getPlace === 'function' ? getPlace(item.placeId) : null;
      return '<button type="button" class="ff-source-place-row is-coarse" data-action="ff-source-place-select" data-id="' + h(item.placeId || '') + '" data-occurrence-id="' + h(item.id) + '"><span>' + h(place && typeof placeEmoji === 'function' ? placeEmoji(place) : kindIcon(item.scheduleKind)) + '</span><b>' + h(occurrenceTitle(item)) + '</b><small>' + h((dayMeta(item.day).label || item.day) + '・' + coarseSlotLabel(item.slot)) + '</small></button>';
    }).join('');
    var rows = (typeof places !== 'undefined' ? places : []).map(function (place) {
      return '<button type="button" class="ff-source-place-row" data-action="ff-source-place-select" data-id="' + h(place.id) + '"><span>' + h(typeof placeEmoji === 'function' ? placeEmoji(place) : '📍') + '</span><b>' + h(place.name || '未命名卡片') + '</b><small>' + h(typeof tlabel === 'function' ? tlabel(place.type) : place.type || '') + '</small></button>';
    }).join('');
    openSheet('<div class="ff-sheet ff-create-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-place-title"><div class="ff-sheet-head"><span class="ff-kicker">行程卡片</span><h3 id="ff-place-title">先選粗流裡的行程</h3><p>選粗流行程會直接補上精確時間，不會再建立副本。</p></div><div class="ff-sheet-scroll ff-source-place-list">' + (coarseRows ? '<div class="ff-source-group"><b>尚未排進細流</b>' + coarseRows + '</div>' : '') + '<div class="ff-source-group"><b>其他卡片</b>' + (rows || '<div class="ff-sheet-empty">卡片庫目前是空的</div>') + '</div></div></div>', function () { openPlaceCreate(); }, 'fineflow-create-place');
  }

  function openPlaceTiming(placeId, occurrenceId) {
    var place = typeof getPlace === 'function' ? getPlace(placeId) : null;
    if (!place) { if (typeof toast === 'function') toast('找不到這張行程卡片'); return; }
    ensureCreateTimingDraft(place.name);
    state.createDraft.placeId = place.id;
    state.createDraft.occurrenceId = occurrenceId || null;
    if (occurrenceId) {
      var sourceOccurrence = findOccurrence(occurrenceId);
      if (sourceOccurrence) {
        state.createDraft.date = dayDate(sourceOccurrence.day);
        state.createDraft.day = sourceOccurrence.day;
        state.createDraft.coarseVisible = true;
        state.createDraft.coarseDay = sourceOccurrence.day;
        state.createDraft.coarseSlot = sourceOccurrence.slot;
      }
    }
    var cardMap = safeMapsUrl(place.mapsUrl || (typeof gmaps === 'function' ? gmaps(place) : ''));
    openSheet('<div class="ff-sheet ff-create-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-place-time-title"><div class="ff-sheet-head"><span class="ff-kicker">行程卡片</span><h3 id="ff-place-time-title">' + h(place.name) + '</h3><p>' + (occurrenceId ? '正在替粗流的同一筆行程補上精確時間。' : (cardMap ? 'Maps 連結會由這張行程卡片自動帶入，不必重貼。' : '這張行程卡片目前沒有 Maps 連結。')) + '</p></div><div class="ff-sheet-scroll">' + (cardMap ? '<a class="ff-card-map-preview" href="' + h(cardMap) + '" target="_blank" rel="noopener noreferrer">⌖ 查看卡片的 Maps 連結</a>' : '') + creationTimingFields(state.createDraft) + creationCoarseFields(state.createDraft) + '<label class="ff-fixed-check"><input type="checkbox" data-ff-create-fixed><span>標記為固定行程</span></label><div class="ff-create-error" role="alert"></div></div><div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-create-save" data-kind="place-card">' + (occurrenceId ? '排進細流' : '新增行程') + '</button></div></div>', function () { openPlaceTiming(placeId, occurrenceId); }, 'fineflow-create-place-time');
  }

  function openMapsCreate() {
    var draft = ensureCreateTimingDraft('新增 Maps 行程');
    var categories = typeof categoriesList === 'function' ? categoriesList() : [];
    var options = categories.map(function (category) { return '<option value="' + h(category.key) + '">' + h((category.icon || '') + ' ' + category.label) + '</option>'; }).join('');
    openSheet('<div class="ff-sheet ff-create-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-maps-title"><div class="ff-sheet-head"><span class="ff-kicker">Google Maps</span><h3 id="ff-maps-title">建立新的行程卡片</h3><p>這個入口會先建立卡片；之後排這張卡時，Maps 連結都會自動帶入。</p></div><div class="ff-sheet-scroll"><label class="ff-field"><span>Maps 連結</span><input type="url" data-ff-create-maps placeholder="https://maps.app.goo.gl/…"></label><label class="ff-field"><span>行程名稱</span><input data-ff-create-title maxlength="80" placeholder="店名或地點名稱"></label><label class="ff-field"><span>類別</span><select data-ff-create-category>' + options + '</select></label><label class="ff-field"><span>備註</span><textarea data-ff-create-notes maxlength="500" placeholder="選填"></textarea></label>' + creationTimingFields(draft) + creationCoarseFields(draft) + '<div class="ff-create-error" role="alert"></div></div><div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-create-save" data-kind="maps">新增行程</button></div></div>', function () { openMapsCreate(); }, 'fineflow-create-maps');
  }

  function creationValues() {
    function value(selector) { var el = sh.querySelector(selector); return el ? String(el.value || '').trim() : ''; }
    return { title: value('[data-ff-create-title]'), date: value('[data-ff-create-date]'), start: value('[data-ff-create-start]'), end: value('[data-ff-create-end]'), mapsUrl: value('[data-ff-create-maps]'), category: value('[data-ff-create-category]'), notes: value('[data-ff-create-notes]'), fixed: !!(sh.querySelector('[data-ff-create-fixed]') || {}).checked, coarseVisible: !!(sh.querySelector('[data-ff-create-coarse]') || {}).checked, coarseDay: dayIdForDate(value('[data-ff-create-date]')), coarseSlot: value('[data-ff-create-coarse-slot]') };
  }

  function showCreationError(message) {
    var box = sh.querySelector('.ff-create-error');
    if (box) box.textContent = message;
    else if (typeof toast === 'function') toast(message);
  }

  function saveCreatedOccurrence(kind) {
    var values = creationValues();
    var draft = state.createDraft || sourceDraft({});
    var place = null;
    var createdPlace = null;
    if (!values.date || !values.start || !values.end) { showCreationError('請填完日期、開始與結束時間'); return; }
    var tripStart = typeof TRIP !== 'undefined' && TRIP && TRIP.startDate || '';
    var tripEnd = typeof TRIP !== 'undefined' && TRIP && TRIP.endDate || '';
    if ((tripStart && values.date < tripStart) || (tripEnd && values.date > tripEnd)) { showCreationError('日期必須在這趟旅程期間內'); return; }
    if (values.end <= values.start) { showCreationError('結束時間必須晚於開始時間；第一版不支援跨日'); return; }
    if (kind === 'custom' && !values.title) { showCreationError('請填行程名稱'); return; }
    if (kind === 'place-card') {
      place = typeof getPlace === 'function' ? getPlace(draft.placeId) : null;
      if (!place) { showCreationError('找不到選取的行程卡片'); return; }
    }
    if (kind === 'maps') {
      var maps = safeMapsUrl(values.mapsUrl);
      if (!maps) { showCreationError('請貼合法的 Google Maps 連結'); return; }
      if (!values.title) { showCreationError('請補上行程名稱'); return; }
      var coordinate = typeof CNXCore !== 'undefined' && CNXCore.parseLatLngFromMapsUrl(maps);
      place = (typeof places !== 'undefined' ? places : []).find(function (entry) { return safeMapsUrl(entry.mapsUrl) === maps; }) || null;
      if (!place && coordinate && typeof CNXCore.findDuplicate === 'function') place = CNXCore.findDuplicate(places, { lat: coordinate.lat, lng: coordinate.lng, name: values.title });
      if (!place) createdPlace = typeof makePlace === 'function' ? makePlace({ name: values.title, mapsUrl: maps, lat: coordinate && coordinate.lat, lng: coordinate && coordinate.lng, type: values.category || '其他', note: values.notes }) : null;
      place = place || createdPlace;
      if (!place) { showCreationError('無法建立 Maps 行程卡片，請改用行程卡片來源'); return; }
    }
    var duration = Math.round((Date.parse(zonedIso(values.date, values.end)) - Date.parse(zonedIso(values.date, values.start))) / 60000);
    var raw = {
      id: typeof uid === 'function' ? uid() : 'ff_' + Date.now(),
      placeId: place ? place.id : null,
      custom: kind === 'custom' ? { title: values.title, kind: 'life' } : null,
      day: values.coarseVisible ? values.coarseDay : null, slot: values.coarseVisible ? values.coarseSlot : null, startTime: values.start,
      category: kind === 'custom' ? (values.category || '其他') : (place && place.type || values.category || '其他'),
      notes: values.notes || '',
      mapLinks: [],
      fine: { startAt: zonedIso(values.date, values.start), endAt: zonedIso(values.date, values.end), originalDurationMin: duration, minDurationMin: duration, compressibility: 'none', fixedMarker: values.fixed, intentionalGapBefore: false, acceptedConflictWith: [], timeCommitment: values.fixed ? 'external' : 'flexible', autoMovePolicy: values.fixed ? 'manual' : 'auto', manualOrder: activePlan().length },
      scheduleKind: kind === 'custom' ? 'custom' : 'place', transport: null, todos: [], seq: activePlan().length
    };
    var occurrence = typeof CNXCore !== 'undefined' && typeof CNXCore.normalizeOccurrence === 'function' ? CNXCore.normalizeOccurrence(raw) : raw;
    if (!occurrence || !occurrence.fine) { showCreationError('這筆行程的資料格式不正確'); return; }
    var reusableId = draft.occurrenceId || null;
    if (!reusableId && kind === 'place-card') {
      var matches = activePlan().filter(function (entry) {
        return entry.placeId === draft.placeId && entry.day === dayIdForDate(values.date) && entry.slot && !entry.fine;
      });
      if (matches.length === 1) reusableId = matches[0].id;
    }
    if (createdPlace) places.push(createdPlace);
    var saved = applyPlanChange((reusableId ? '已排進細流「' : '已新增「') + occurrenceTitle(occurrence) + '」', { versionId: draft.versionId, baseFingerprint: draft.baseFingerprint }, function (version) {
      var existing = reusableId && version.plan.find(function (entry) { return entry.id === reusableId; });
      if (existing) {
        existing.fine = copy(occurrence.fine);
        existing.startTime = occurrence.startTime;
        existing.day = values.coarseVisible ? dayIdForDate(values.date) : null;
        existing.slot = values.coarseVisible ? values.coarseSlot : null;
      } else version.plan.push(copy(occurrence));
    }, createdPlace ? function (current) {
      var stillUsed = typeof DB !== 'undefined' && Array.isArray(DB.versions) && DB.versions.some(function (version) {
        return (version.plan || []).some(function (entry) { return entry.placeId === createdPlace.id; });
      });
      if (!stillUsed) {
        var placeIndex = places.findIndex(function (entry) { return entry.id === createdPlace.id; });
        if (placeIndex >= 0) places.splice(placeIndex, 1);
      }
    } : null);
    if (!saved && createdPlace) {
      var index = places.indexOf(createdPlace);
      if (index >= 0) places.splice(index, 1);
    }
    if (saved) {
      state.createDraft = null;
      if (uiStore) uiStore.dispatch({ type: 'CANCEL' });
      closeFineflowSheets();
      state.createDraft = null;
      if (uiStore) uiStore.dispatch({ type: 'CANCEL' });
      renderFineFlow();
    }
  }

  function mapsForOccurrence(item) {
    var links = [];
    var place = item && item.placeId && typeof getPlace === 'function' ? getPlace(item.placeId) : null;
    var placeUrl = place ? safeMapsUrl(place.mapsUrl || (typeof gmaps === 'function' ? gmaps(place) : '')) : '';
    function placeIdFromUrl(url) {
      try {
        var parsed = new URL(url, window.location && window.location.href || undefined);
        var queryId = parsed.searchParams.get('query_place_id') || parsed.searchParams.get('place_id');
        if (queryId) return queryId.toLowerCase();
        var decoded = decodeURIComponent(parsed.pathname + parsed.search);
        var match = decoded.match(/(?:place_id:|!1s)(ChI[A-Za-z0-9_-]+)/i);
        return match ? match[1].toLowerCase() : '';
      } catch (_) { return ''; }
    }
    function identity(url, explicitPlaceId) {
      var pid = explicitPlaceId || placeIdFromUrl(url);
      return pid ? 'place:' + String(pid).toLowerCase() : 'url:' + url.replace(/[?#]$/, '');
    }
    var identities = {};
    if (placeUrl) {
      identities[identity(placeUrl, place && place.placeId)] = true;
      links.push({ label: place.name || '在 Google Maps 開啟', url: placeUrl, source: 'place' });
    }
    (item && Array.isArray(item.mapLinks) ? item.mapLinks : []).forEach(function (entry) {
      var url = safeMapsUrl(typeof entry === 'string' ? entry : entry && entry.url);
      var key = url && identity(url, typeof entry === 'object' && entry && entry.placeId);
      if (!url || identities[key]) return;
      identities[key] = true;
      links.push({ label: '本次行程：' + (typeof entry === 'object' && entry.label || '附加導航點'), url: url, source: 'occurrence' });
    });
    return links;
  }

  function noteForOccurrence(item) {
    var place = item && item.placeId && typeof getPlace === 'function' ? getPlace(item.placeId) : null;
    return item && item.notes || place && place.note || '';
  }

  function openOccurrenceDetail(id) {
    openEditor(id);
  }

  function toggleOccurrenceTodo(itemId, todoId, reopen) {
    var item = findOccurrence(itemId);
    var todo = item && (item.todos || []).find(function (entry) { return entry.id === todoId; });
    if (!todo) return;
    var guard = currentGuard();
    applyPlanChange(todo.done ? '待辦已改為未完成' : '待辦已完成', guard, function (version) {
      var target = version.plan.find(function (entry) { return entry.id === itemId; });
      var nextTodo = target && (target.todos || []).find(function (entry) { return entry.id === todoId; });
      if (nextTodo) nextTodo.done = !nextTodo.done;
    });
    if (reopen) openEditor(itemId);
  }

  function addOccurrenceTodo(itemId) {
    var input = sh.querySelector('[data-ff-detail-todo-text]');
    var text = input && input.value.trim();
    if (!text) { if (input) input.focus(); return; }
    var guard = currentGuard();
    applyPlanChange('已新增待辦', guard, function (version) {
      var target = version.plan.find(function (entry) { return entry.id === itemId; });
      if (!target) return;
      target.todos = Array.isArray(target.todos) ? target.todos : [];
      target.todos.push({ id: typeof uid === 'function' ? uid() : 'todo_' + Date.now(), text: text, done: false });
    });
    openEditor(itemId);
  }

  function openUnscheduled() {
    var version = activeVersion();
    var api = calendarApi();
    var dates = api.buildDateWindow ? api.buildDateWindow(calendarAnchor(), calendarVisibleDays()) : [calendarAnchor()];
    var items = [];
    dates.forEach(function (date) {
      var dayId = dayIdForDate(date);
      var parts = scheduleParts(buildSchedule(version, dayId), dayId, version);
      (parts.unplanned || []).forEach(function (item) { items.push(item); });
    });
    var rows = items.map(function (item) {
      return '<button type="button" class="ff-source-place-row" data-action="ff-unscheduled-edit" data-eid="' + h(item.id) + '"><b>' + h(occurrenceTitle(item)) + '</b><small>設定日期與時間</small></button>';
    }).join('');
    openSheet('<div class="ff-sheet ff-unscheduled-sheet" role="dialog" aria-modal="true"><div class="ff-sheet-head"><span class="ff-kicker">細流</span><h3>尚未排時間</h3></div><div class="ff-sheet-scroll">' + (rows || '<div class="ff-sheet-empty">目前沒有未排項目</div>') + '</div></div>', function () { openUnscheduled(); }, 'fineflow-unscheduled');
  }

  function openImportPreview(payload) {
    var api = window.CNXFineFlowImport;
    if (!api || typeof api.dryRunImport !== 'function') throw new Error('細流匯入模組尚未載入');
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); }
      catch (_) { payload = null; }
    }
    var preview = api.dryRunImport(payload, {
      version: activeVersion(), places: typeof places !== 'undefined' ? places : [],
      tripStartDate: typeof TRIP !== 'undefined' && TRIP.startDate,
      tripEndDate: typeof TRIP !== 'undefined' && TRIP.endDate
    });
    state.importPreview = preview;
    var summary = preview.transaction && preview.transaction.summary || { add: 0, update: 0, skipped: preview.skipped.length, needsInput: preview.needsInput.length, errors: preview.errors.length, conflicts: preview.conflicts.length };
    summary.update = summary.update || 0;
    var safeCount = summary.add + summary.update;
    var problems = preview.errors.concat(preview.needsInput).map(function (problem) { return '<li>' + h((problem.externalId ? problem.externalId + '：' : '') + problem.message) + '</li>'; }).join('');
    var partial = summary.errors || summary.needsInput ? '<p class="ff-import-warning">有 ' + (summary.errors + summary.needsInput) + ' 筆需要先修正；為避免粗流與細流斷開，本次不會寫入任何資料。</p>' : (summary.skipped ? '<p class="ff-import-warning">已略過 ' + summary.skipped + ' 筆先前匯入的資料。</p>' : '');
    openSheet('<div class="ff-sheet ff-import-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-import-title"><div class="ff-sheet-head"><span class="ff-kicker">匯入預演</span><h3 id="ff-import-title">確認細流匯入</h3><p>沿用粗流 ' + summary.update + ' 筆・新增 ' + summary.add + ' 筆・衝突 ' + summary.conflicts + ' 筆</p></div><div class="ff-sheet-scroll">' + partial + (problems ? '<ul class="ff-import-problems">' + problems + '</ul>' : '<div class="ff-no-issue">✓ 每筆行程都已安全對應</div>') + '</div><div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-import-apply"' + (!preview.canApply ? ' disabled' : '') + '>確認匯入 ' + safeCount + ' 筆</button></div></div>', function () { openImportPreview(payload); }, 'fineflow-import');
    return preview;
  }

  function applyImportPreview() {
    var preview = state.importPreview;
    var api = window.CNXFineFlowImport;
    var version = activeVersion();
    if (!preview || !preview.transaction || !version || !api) return;
    var before = copy(version);
    try {
      var result = api.applyImportTransaction(version, preview.transaction, { confirmed: true });
      replaceVersionInPlace(version, result.version);
      if (typeof syncActive === 'function') syncActive();
      if (typeof afterChange === 'function') afterChange();
      state.importPreview = null;
      closeFineflowSheets();
      if (typeof toast === 'function') toast('已匯入 ' + ((preview.transaction.summary.add || 0) + (preview.transaction.summary.update || 0)) + ' 筆細流', { undo: function () {
        var current = activeVersion();
        if (!current || current.id !== before.id) { toast('請先切回原版本再復原'); return; }
        replaceVersionInPlace(current, before);
        if (typeof syncActive === 'function') syncActive();
        if (typeof afterChange === 'function') afterChange();
      }});
    } catch (error) {
      state.importPreview = null;
      if (typeof toast === 'function') toast(error && error.code === 'FINEFLOW_STALE_BASE' ? '行程剛被更新，請重新匯入預演' : '匯入失敗，正式行程沒有變更');
    }
  }

  document.addEventListener('click', function (event) {
    var target = event.target.closest('[data-action]');
    if (!target) return;
    var action = target.dataset.action;
    if (action === 'ff-calendar-count') {
      var requested = +target.dataset.count;
      if (calendarIsDesktop() && (requested === 5 || requested === 7)) {
        state.desktopDayCount = requested;
        var tripStart = typeof TRIP !== 'undefined' && TRIP && TRIP.startDate;
        if (/^\d{4}-\d{2}-\d{2}$/.test(tripStart || '')) {
          var offset = Math.max(0, Math.floor((Date.parse(calendarAnchor() + 'T00:00:00Z') - Date.parse(tripStart + 'T00:00:00Z')) / 86400000));
          state.anchorDate = addDays(tripStart, Math.floor(offset / requested) * requested);
        }
      }
      if (!calendarIsDesktop() && (requested === 1 || requested === 2 || requested === 3)) state.mobileDayCount = requested;
      state.anchorDate = clampCalendarAnchor(calendarAnchor());
      state.selectedId = null;
      renderFineFlow();
      return;
    }
    if (action === 'ff-prev-days' || action === 'ff-next-days') {
      var step = calendarIsDesktop() ? calendarVisibleDays() : 1;
      state.anchorDate = clampCalendarAnchor(addDays(calendarAnchor(), action === 'ff-next-days' ? step : -step));
      state.selectedId = null;
      renderFineFlow();
      return;
    }
    if (action === 'ff-create-at') {
      if (state.suppressCalendarClick) { state.suppressCalendarClick = false; return; }
      openSourceMenu({ day: target.dataset.day, date: target.dataset.date, start: target.dataset.time, end: addMinutesToTime(target.dataset.time, 60) });
      return;
    }
    if (action === 'ff-add-source') { openSourceMenu({}); return; }
    if (action === 'ff-source-custom') { openCustomCreate(); return; }
    if (action === 'ff-source-place') { openPlaceCreate(); return; }
    if (action === 'ff-source-place-select') { openPlaceTiming(target.dataset.id, target.dataset.occurrenceId || null); return; }
    if (action === 'ff-source-maps') { openMapsCreate(); return; }
    if (action === 'ff-create-save') { saveCreatedOccurrence(target.dataset.kind); return; }
    if (action === 'ff-card-detail') {
      if (state.suppressCardClick === target.dataset.eid) { state.suppressCardClick = false; return; }
      openEditor(target.dataset.eid);
      return;
    }
    if (action === 'ff-card-todo') { event.stopPropagation(); toggleOccurrenceTodo(target.dataset.eid, target.dataset.todo, false); return; }
    if (action === 'ff-detail-todo') { toggleOccurrenceTodo(target.dataset.eid, target.dataset.todo, true); return; }
    if (action === 'ff-detail-todo-add') { addOccurrenceTodo(target.dataset.eid); return; }
    if (action === 'ff-detail-edit') { openEditor(target.dataset.eid); return; }
    if (action === 'ff-unscheduled') { openUnscheduled(); return; }
    if (action === 'ff-unscheduled-edit') { openEditor(target.dataset.eid); return; }
    if (action === 'ff-import-apply') { applyImportPreview(); return; }
    if (action === 'ff-create-coarse-suggest' && state.createDraft) {
      var createSuggestion = suggestedCoarsePosition(state.createDraft.date, state.createDraft.start);
      state.createDraft.coarseDay = createSuggestion.day;
      state.createDraft.coarseSlot = createSuggestion.slot;
      var createDay = sh.querySelector('[data-ff-create-coarse-day]');
      var createSlot = sh.querySelector('[data-ff-create-coarse-slot]');
      if (createDay) createDay.value = createSuggestion.day;
      if (createSlot) createSlot.value = createSuggestion.slot;
      return;
    }
    if (action === 'ff-coarse-suggest' && state.editor) {
      var edited = findOccurrence(state.editor.id);
      var editorSuggestion = suggestedCoarsePosition(fineDate(edited), state.editor.start);
      state.editor.coarseDay = editorSuggestion.day;
      state.editor.coarseSlot = editorSuggestion.slot;
      renderEditor();
      return;
    }
    if (action === 'ff-conflict-single') {
      if (state.editor && state.editor.pointerCompact) {
        var singleItem = findOccurrence(state.editor.id);
        var singleTransaction = acceptConflictTransaction(state.editor.transaction);
        state.editor = null;
        if (typeof closeSheet === 'function') closeSheet();
        applyPointerTransaction(singleItem, singleTransaction);
      } else acceptPreviewConflicts();
      return;
    }
    if (action === 'ff-conflict-ripple' && state.editor) {
      if (state.editor.pointerCompact) {
        var compactEditor = state.editor;
        var compactItem = findOccurrence(compactEditor.id);
        try {
          var rippleTransaction = previewPointerTransaction(compactEditor.pointerDraft, compactItem, 'ripple');
          if (pointerNeedsDecision(rippleTransaction)) {
            compactEditor.transaction = rippleTransaction;
            compactEditor.error = '連動後仍碰到固定行程或無法安全移動的項目。';
            renderPointerDecision();
          } else {
            state.editor = null;
            if (typeof closeSheet === 'function') closeSheet();
            applyPointerTransaction(compactItem, rippleTransaction);
          }
        } catch (compactError) {
          compactEditor.error = compactError && compactError.message || '無法連動後面的行程';
          renderPointerDecision();
        }
        return;
      }
      if (uiStore) uiStore.dispatch({ type: 'CONFLICT_RIPPLE' });
      state.editor.mode = 'ripple';
      if (state.editor.pointerDraft) {
        try {
          state.editor.transaction = previewPointerTransaction(state.editor.pointerDraft, findOccurrence(state.editor.id), 'ripple');
          if (uiStore && state.editor.pointerMode) uiStore.dispatch({ type: 'PREVIEW_READY', transaction: state.editor.transaction });
          renderEditor();
        } catch (pointerError) {
          state.editor.error = pointerError && pointerError.message || '無法計算連動後面行程';
          renderEditor();
        }
      } else {
        state.editor.transaction = null;
        runPreview();
      }
      return;
    }
    if (action === 'ff-pointer-edit' && state.editor && state.editor.pointerCompact) {
      var pointerEditor = state.editor;
      var pointerId = pointerEditor.id;
      var pointerPreview = copy(pointerEditor.pointerDraft.preview);
      if (typeof closeSheet === 'function') closeSheet();
      openEditor(pointerId);
      if (state.editor) {
        state.editor.date = pointerPreview.date;
        state.editor.start = labelForMinute(pointerPreview.start);
        state.editor.end = labelForMinute(pointerPreview.end);
        state.editor.durationMin = pointerPreview.end - pointerPreview.start;
        runPreview();
      }
      return;
    }
    if (action === 'close' && sh && sh.querySelector('.ff-sheet')) {
      state.selectedId = null;
      state.createDraft = null;
      state.editor = null;
      if (uiStore) uiStore.dispatch({ type: 'CANCEL' });
      renderFineFlow();
      return;
    }
    if (action === 'ff-day') { state.day = target.dataset.day; renderFineFlow(); document.getElementById(rootId).scrollTop = 0; return; }
    if (action === 'ff-global') { state.day = null; renderFineFlow(); return; }
    if (action === 'ff-edit') { openEditor(target.dataset.eid); return; }
    if (action === 'ff-add') { openCustom(target.dataset.day || null); return; }
    if (action === 'ff-add-save') { saveCustom(); return; }
    if (action === 'ff-todos') { openTodos(target.dataset.day || null); return; }
    if (action === 'ff-todo-add' && state.editor) {
      var todoInput = sh.querySelector('[data-ff-todo-text]');
      var todoText = todoInput && todoInput.value.trim(), todoItem = findOccurrence(state.editor.id);
      if (!todoText || !todoItem) { if (todoInput) todoInput.focus(); return; }
      var todoGuard = currentGuard();
      var todoId = typeof uid === 'function' ? uid() : 'todo_' + Date.now();
      if (!applyPlanChange('已新增待辦', todoGuard, function (version) {
        var targetItem = version.plan.find(function (entry) { return entry.id === state.editor.id; });
        if (!targetItem) return;
        targetItem.todos = Array.isArray(targetItem.todos) ? targetItem.todos : [];
        targetItem.todos.push({ id: todoId, text: todoText, done: false });
      })) return;
      state.editor.rulesOpen = true;
      state.editor.transaction = null;
      state.editor.notice = '已新增待辦；它會跟著這項行程一起移動，也可以從下方訊息復原。';
      runPreview();
      return;
    }
    if (action === 'ff-todo-toggle') {
      var item = findOccurrence(target.dataset.eid), todo = item && (item.todos || []).find(function (entry) { return entry.id === target.dataset.todo; });
      if (!todo) return;
      toggleOccurrenceTodo(item.id, todo.id, false);
      var todoDay = fineDayId(item);
      openTodos(todoDay && state.day === todoDay ? todoDay : null);
      return;
    }
    if (action === 'ff-mode' && state.editor) {
      if (state.editor.firstSchedule && target.dataset.mode !== 'single') return;
      state.editor.mode = target.dataset.mode;
      state.editor.transaction = null;
      renderEditor();
      runPreview();
      return;
    }
    if (action === 'ff-resolution' && state.editor && state.editor.transaction) {
      try {
        var api = ffApi();
        if (typeof api.applyResolution === 'function') {
          var prior = state.editor.transaction;
          var resolved = api.applyResolution(prior, target.dataset.id) || prior;
          if (prior.manualFirstSchedule && resolved.afterSchedule) {
            var scheduled = (resolved.afterSchedule.items || []).find(function (entry) { return entry.id === state.editor.id; });
            var originalMutation = (prior.mutations || []).find(function (mutation) { return mutation.occurrenceId === state.editor.id; });
            resolved.mutations = (resolved.mutations || []).filter(function (mutation) { return mutation.occurrenceId !== state.editor.id; });
            if (scheduled && originalMutation) resolved.mutations.push({ occurrenceId: state.editor.id, before: originalMutation.before, after: copy(scheduled), reason: originalMutation.reason });
            resolved.manualFirstSchedule = true;
          }
          state.editor.transaction = resolved;
          if (uiStore && state.editor.pointerMode) uiStore.dispatch({ type: 'PREVIEW_READY', transaction: resolved });
        }
        renderEditor();
      } catch (err) {
        state.editor.error = err && err.message ? err.message : '這個修復目前無法套用';
        renderEditor();
      }
      return;
    }
    if (action === 'ff-apply') { applyEditorTransaction(); return; }
    if (action === 'ff-retry') { state.error = ''; renderFineFlow(); }
  });

  // 手機日期切換交給瀏覽器原生水平捲動與 scroll snap。整段旅程只 render 一次，
  // scroll 過程不拆 DOM，使用者可在前一次慣性尚未完全停止時接著滑下一天。
  function calendarDayWidth(viewport) {
    if (!viewport) return 0;
    var width = viewport.clientWidth || (viewport.getBoundingClientRect && viewport.getBoundingClientRect().width) || 0;
    return width / calendarVisibleDays();
  }

  function updateCalendarScrollPosition(calendar, index) {
    if (!calendar || calendar.dataset.mobile !== 'true') return;
    var dates = Array.prototype.slice.call(calendar.querySelectorAll('.ff-cal-date'));
    var days = Array.prototype.slice.call(calendar.querySelectorAll('.ff-cal-day'));
    var visibleCount = calendarVisibleDays();
    var maximum = Math.max(0, days.length - visibleCount);
    index = clamp(Math.round(index || 0), 0, maximum);
    var anchor = days[index] && days[index].dataset.date;
    if (anchor && state.anchorDate !== anchor) {
      state.anchorDate = anchor;
      state.selectedId = null;
    }
    calendar.dataset.anchorIndex = String(index);
    dates.forEach(function (date, dateIndex) {
      var visible = dateIndex >= index && dateIndex < index + visibleCount;
      date.classList.toggle('is-buffer', !visible);
      date.dataset.visible = String(visible);
      if (visible) date.removeAttribute('aria-hidden');
      else date.setAttribute('aria-hidden', 'true');
    });
    days.forEach(function (day, dayIndex) {
      var visible = dayIndex >= index && dayIndex < index + visibleCount;
      day.classList.toggle('is-buffer', !visible);
      day.dataset.visible = String(visible);
      if (visible) { day.removeAttribute('aria-hidden'); day.removeAttribute('inert'); }
      else { day.setAttribute('aria-hidden', 'true'); day.setAttribute('inert', ''); }
    });
    var range = calendar.querySelector('.ff-cal-range strong');
    if (range && days[index]) range.textContent = days[index].dataset.date + ' ～ ' + days[Math.min(days.length - 1, index + visibleCount - 1)].dataset.date;
    var visibleDays = days.slice(index, index + visibleCount);
    var unscheduledCount = visibleDays.reduce(function (total, day) { return total + (+day.dataset.unscheduledCount || 0); }, 0);
    var unscheduled = calendar.querySelector('.ff-cal-unscheduled');
    if (unscheduled) {
      unscheduled.hidden = !unscheduledCount;
      var unscheduledBadge = unscheduled.querySelector('b');
      if (unscheduledBadge) unscheduledBadge.textContent = '□ ' + unscheduledCount;
    }
    var empty = calendar.querySelector('.ff-cal-empty');
    if (empty) empty.hidden = visibleDays.some(function (day) { return (+day.dataset.cardCount || 0) > 0; });
  }

  function settleCalendarNativeScroll(calendar, source) {
    if (!calendar || !source || calendar.dataset.mobile !== 'true') return;
    var width = calendarDayWidth(source);
    if (!(width > 0)) return;
    var index = clamp(Math.round(source.scrollLeft / width), 0, Math.max(0, calendar.querySelectorAll('.ff-cal-day').length - calendarVisibleDays()));
    updateCalendarScrollPosition(calendar, index);
  }

  function setupCalendarNativeScroll(calendar) {
    if (!calendar || calendar.dataset.mobile !== 'true') return;
    var dateViewport = calendar.querySelector('.ff-cal-date-viewport');
    var dayViewport = calendar.querySelector('.ff-cal-days-viewport');
    if (!dateViewport || !dayViewport) return;
    var syncing = false;
    function sync(source, target) {
      if (syncing) return;
      calendar.dataset.scrollStarted = 'true';
      syncing = true;
      target.scrollLeft = source.scrollLeft;
      settleCalendarNativeScroll(calendar, source);
      syncing = false;
      clearTimeout(calendarScrollTimer);
      calendarScrollTimer = setTimeout(function () { settleCalendarNativeScroll(calendar, source); }, 90);
    }
    dayViewport.addEventListener('scroll', function () { sync(dayViewport, dateViewport); }, { passive: true });
    dateViewport.addEventListener('scroll', function () { sync(dateViewport, dayViewport); }, { passive: true });
    if ('onscrollend' in window) {
      dayViewport.addEventListener('scrollend', function () { settleCalendarNativeScroll(calendar, dayViewport); });
      dateViewport.addEventListener('scrollend', function () { settleCalendarNativeScroll(calendar, dateViewport); });
    }
    var initialIndex = +calendar.dataset.anchorIndex || 0;
    var placeAtAnchor = function () {
      var width = calendarDayWidth(dayViewport);
      if (!(width > 0)) return false;
      dayViewport.scrollLeft = initialIndex * width;
      dateViewport.scrollLeft = dayViewport.scrollLeft;
      updateCalendarScrollPosition(calendar, initialIndex);
      return true;
    };
    if (!placeAtAnchor() && typeof requestAnimationFrame === 'function') requestAnimationFrame(function () {
      if (calendar.dataset.scrollStarted !== 'true') placeAtAnchor();
    });
  }

  // ── 多日曆直接操作：座標計算與交易引擎間只透過 adapter 交接。 ──
  var POINTER_SNAP = 15;

  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  function minuteValue(time) { return +(time || '00:00').slice(0, 2) * 60 + +(time || '00:00').slice(3, 5); }
  function snapPointerMinute(value) { return clamp(Math.round(value / POINTER_SNAP) * POINTER_SNAP, 0, 1440); }
  function labelForMinute(value) {
    value = clamp(Math.round(value), 0, 1440);
    if (value === 1440) return '24:00';
    return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
  }
  function zonedAtMinute(dateText, minute) {
    return minute >= 1440 ? zonedIso(addDays(dateText, 1), '00:00') : zonedIso(dateText, labelForMinute(minute));
  }
  function minuteAtPointer(clientY, scrollTop, scrollRectTop) {
    return snapPointerMinute((clientY - scrollRectTop + scrollTop) * 60 / calendarPixelsPerHour());
  }
  function calendarColumnAt(clientX, left, width, count) {
    count = count || 3;
    if (!(width > 0) || clientX < left || clientX >= left + width) return -1;
    return clamp(Math.floor((clientX - left) / (width / count)), 0, count - 1);
  }
  function pointerInterval(mode, anchorMinute, pointerMinute, originalStart, originalEnd, grabOffset, minimumDuration) {
    minimumDuration = Math.max(POINTER_SNAP, +minimumDuration || POINTER_SNAP);
    var start = originalStart, end = originalEnd;
    if (mode === 'create') {
      start = Math.min(anchorMinute, pointerMinute);
      end = Math.max(anchorMinute, pointerMinute);
      if (end === start) end = Math.min(1440, start + POINTER_SNAP);
      if (end === start) start = Math.max(0, end - POINTER_SNAP);
    } else if (mode === 'move') {
      var duration = originalEnd - originalStart;
      start = clamp(pointerMinute - grabOffset, 0, 1440 - duration);
      end = start + duration;
    } else if (mode === 'start') {
      start = clamp(pointerMinute, 0, originalEnd - minimumDuration);
    } else if (mode === 'end') {
      end = clamp(pointerMinute, originalStart + minimumDuration, 1440);
    }
    return { start: start, end: end };
  }

  function scrollAndDays() {
    var root = document.getElementById(rootId);
    return { scroll: root && root.querySelector('.ff-cal-scroll'), days: root ? Array.prototype.slice.call(root.querySelectorAll('.ff-cal-day[data-visible="true"]')) : [] };
  }

  function dayAtPointer(clientX, parts) {
    var days = parts.days;
    for (var i = 0; i < days.length; i++) {
      var rect = days[i].getBoundingClientRect();
      if (rect.width > 0 && clientX >= rect.left && clientX < rect.right) return days[i];
    }
    var holder = days[0] && days[0].parentElement;
    var holderRect = holder && holder.getBoundingClientRect();
    var index = holderRect ? calendarColumnAt(clientX, holderRect.left, holderRect.width, days.length) : -1;
    return index >= 0 ? days[index] : null;
  }

  function pointerPosition(clientX, clientY) {
    var parts = scrollAndDays();
    if (!parts.scroll || !parts.days.length) return { valid: false };
    var scrollRect = parts.scroll.getBoundingClientRect();
    var day = dayAtPointer(clientX, parts);
    var vertical = clientY >= scrollRect.top && clientY <= scrollRect.bottom;
    return {
      valid: !!day && vertical,
      day: day,
      date: day && day.dataset.date,
      dayId: day && day.dataset.day,
      minute: minuteAtPointer(clientY, parts.scroll.scrollTop, scrollRect.top),
      scroll: parts.scroll,
      scrollRect: scrollRect
    };
  }

  function removePointerVisuals(draft) {
    if (!draft) return;
    clearTimeout(draft.timer);
    if (draft.autoFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(draft.autoFrame);
    if (draft.ghost && draft.ghost.parentNode) draft.ghost.parentNode.removeChild(draft.ghost);
    if (draft.card) draft.card.classList.remove('is-pointer-origin');
    document.body.classList.remove('ff-pointer-active');
  }

  function ensurePointerGhost(draft, day) {
    if (!draft.ghost) {
      draft.ghost = document.createElement('article');
      draft.ghost.className = 'ff-cal-pointer-ghost';
      draft.ghost.setAttribute('aria-live', 'polite');
      draft.ghost.innerHTML = '<span class="ff-cal-pointer-time"></span><strong></strong>';
    }
    if (day && day.isConnected === false) {
      day = document.querySelector('#' + rootId + ' .ff-cal-day[data-date="' + (day.dataset && day.dataset.date || '') + '"]');
    }
    if (day && draft.ghost.parentNode !== day) day.appendChild(draft.ghost);
    if (!draft.ghost.isConnected) {
      var root = document.getElementById(rootId);
      if (root) root.appendChild(draft.ghost);
    }
    return draft.ghost;
  }

  function activatePointerDraft(draft) {
    if (!draft || draft.active) return;
    draft.active = true;
    document.body.classList.add('ff-pointer-active');
    if (draft.card) draft.card.classList.add('is-pointer-origin');
    try { draft.captureTarget.setPointerCapture(draft.pointerId); } catch (_) {}
    if (draft.pointerType === 'touch' && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(10); } catch (_) {}
    }
    updatePointerPreview(draft.lastX, draft.lastY);
  }

  function updatePointerPreview(clientX, clientY) {
    var draft = pointerDraft;
    if (!draft || !draft.active) return;
    draft.lastX = clientX;
    draft.lastY = clientY;
    var position = pointerPosition(clientX, clientY);
    var targetDay = position.day;
    var validDate = draft.mode === 'move' || !targetDay || targetDay.dataset.date === draft.sourceDate;
    var interval = pointerInterval(draft.mode, draft.anchorMinute, position.minute, draft.originalStart, draft.originalEnd, draft.grabOffset, draft.minimumDuration);
    draft.preview = {
      valid: position.valid && validDate,
      date: targetDay && targetDay.dataset.date,
      dayId: targetDay && targetDay.dataset.day,
      start: interval.start,
      end: interval.end
    };
    draft.didDrag = draft.didDrag || Math.abs(clientX - draft.startX) > 4 || Math.abs(clientY - draft.startY) > 4;
    var ghost = ensurePointerGhost(draft, targetDay || draft.sourceDay);
    ghost.classList.toggle('is-invalid', !draft.preview.valid);
    var pixelsPerHour = calendarPixelsPerHour();
    ghost.style.top = interval.start * pixelsPerHour / 60 + 'px';
    ghost.style.height = Math.max(16, (interval.end - interval.start) * pixelsPerHour / 60) + 'px';
    ghost.querySelector('.ff-cal-pointer-time').textContent = draft.preview.valid ? labelForMinute(interval.start) + '–' + labelForMinute(interval.end) : '不能放在這裡';
    ghost.querySelector('strong').textContent = (draft.preview.date || draft.sourceDate) + (draft.mode === 'create' ? '・新增行程' : '・' + occurrenceTitle(findOccurrence(draft.itemId)));
    if (position.scroll) {
      var edge = 52, speed = 0;
      if (clientY < position.scrollRect.top + edge) speed = -Math.ceil((position.scrollRect.top + edge - clientY) / 4);
      else if (clientY > position.scrollRect.bottom - edge) speed = Math.ceil((clientY - (position.scrollRect.bottom - edge)) / 4);
      draft.autoSpeed = clamp(speed, -20, 20);
      if (draft.autoSpeed && !draft.autoFrame && typeof requestAnimationFrame === 'function') {
        draft.autoFrame = requestAnimationFrame(function autoScroll() {
          if (!pointerDraft || pointerDraft !== draft || !draft.active || !draft.autoSpeed) { draft.autoFrame = null; return; }
          position.scroll.scrollTop += draft.autoSpeed;
          draft.autoFrame = requestAnimationFrame(autoScroll);
          updatePointerPreview(draft.lastX, draft.lastY);
        });
      }
    }
  }

  function armPointerDraft(event, mode, source) {
    var item = source.item || null;
    var position = pointerPosition(event.clientX, event.clientY);
    if (!position.day || !position.scroll) return;
    var start = item ? minuteValue(timeFromIso(item.fine.startAt)) : position.minute;
    var end = item ? minuteValue(timeFromIso(item.fine.endAt)) : Math.min(1440, start + POINTER_SNAP);
    pointerDraft = {
      pointerId: event.pointerId,
      pointerType: event.pointerType || 'mouse',
      itemId: item && item.id,
      mode: mode,
      sourceDate: source.date || position.date,
      sourceDayId: source.dayId || position.dayId,
      sourceDay: position.day,
      originalStart: start,
      originalEnd: end,
      anchorMinute: position.minute,
      grabOffset: mode === 'move' ? position.minute - start : 0,
      minimumDuration: item && item.fine ? Math.max(POINTER_SNAP, +item.fine.minDurationMin || POINTER_SNAP) : POINTER_SNAP,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      active: false,
      didDrag: false,
      card: source.card || null,
      captureTarget: source.captureTarget || event.target,
      timer: null,
      ghost: null,
      autoFrame: null,
      autoSpeed: 0
    };
    if (source.immediate && pointerDraft.pointerType === 'touch') {
      activatePointerDraft(pointerDraft);
    } else if (pointerDraft.pointerType === 'touch') {
      pointerDraft.timer = setTimeout(function () {
        if (pointerDraft && pointerDraft.pointerId === event.pointerId) activatePointerDraft(pointerDraft);
      }, 450);
    }
  }

  document.addEventListener('pointerdown', function (event) {
    if (event.button != null && event.button !== 0) return;
    var dragHandle = event.target.closest('[data-action="ff-drag-card"]');
    if (dragHandle) {
      var dragItem = findOccurrence(dragHandle.dataset.eid);
      if (dragItem && dragItem.fine) {
        if ((event.pointerType || 'mouse') === 'touch') event.preventDefault();
        armPointerDraft(event, 'move', { item: dragItem, card: dragHandle.closest('.ff-cal-card'), captureTarget: dragHandle, date: fineDate(dragItem), dayId: fineDayId(dragItem), immediate: true });
      }
      return;
    }
    var resize = event.target.closest('[data-action="ff-resize-start"], [data-action="ff-resize-end"]');
    if (resize) {
      var resizeItem = findOccurrence(resize.dataset.eid);
      if (resizeItem && resizeItem.fine) armPointerDraft(event, resize.dataset.action === 'ff-resize-start' ? 'start' : 'end', { item: resizeItem, card: resize.closest('.ff-cal-card'), captureTarget: resize, date: fineDate(resizeItem), dayId: fineDayId(resizeItem), immediate: true });
      return;
    }
    var cardMain = event.target.closest('.ff-cal-card-main[data-ff-drag="card"]');
    if (cardMain && !event.target.closest('button, a, input, select, textarea')) {
      var cardItem = findOccurrence(cardMain.dataset.eid);
      if (cardItem && cardItem.fine) armPointerDraft(event, 'move', { item: cardItem, card: cardMain.closest('.ff-cal-card'), captureTarget: cardMain, date: fineDate(cardItem), dayId: fineDayId(cardItem) });
      return;
    }
    var slot = event.target.closest('.ff-cal-slot[data-action="ff-create-at"]');
    if (slot) armPointerDraft(event, 'create', { captureTarget: slot, date: slot.dataset.date, dayId: slot.dataset.day });
  });

  document.addEventListener('pointermove', function (event) {
    var draft = pointerDraft;
    if (!draft || draft.pointerId !== event.pointerId) return;
    draft.lastX = event.clientX;
    draft.lastY = event.clientY;
    var distance = Math.max(Math.abs(event.clientX - draft.startX), Math.abs(event.clientY - draft.startY));
    if (!draft.active && draft.pointerType === 'touch' && distance > 10) {
      removePointerVisuals(draft);
      pointerDraft = null;
      return;
    }
    if (!draft.active && draft.pointerType !== 'touch' && distance > 4) activatePointerDraft(draft);
    if (!draft.active) return;
    event.preventDefault();
    updatePointerPreview(event.clientX, event.clientY);
  }, { passive: false });

  function pointerRequest(draft, item) {
    var preview = draft.preview;
    var sourceContext = contextForDay(draft.sourceDayId);
    var targetContext = contextForDay(preview.dayId);
    var contextByDay = {};
    contextByDay[draft.sourceDayId] = sourceContext;
    contextByDay[preview.dayId] = targetContext;
    return {
      versionId: activeVersion() && activeVersion().id,
      occurrenceId: item.id,
      itemId: item.id,
      sourceDay: draft.sourceDayId,
      sourceDayId: draft.sourceDayId,
      sourceDate: draft.sourceDate,
      targetDay: preview.dayId,
      targetDayId: preview.dayId,
      targetDate: preview.date,
      day: preview.dayId,
      startAt: zonedAtMinute(preview.date, preview.start),
      endAt: zonedAtMinute(preview.date, preview.end),
      newStartAt: zonedAtMinute(preview.date, preview.start),
      newEndAt: zonedAtMinute(preview.date, preview.end),
      fixedMarker: !!item.fine.fixedMarker,
      compressibility: item.fine.compressibility,
      minDurationMin: Math.min(preview.end - preview.start, Math.max(0, +item.fine.minDurationMin || 0)),
      context: targetContext,
      sourceContext: sourceContext,
      targetContext: targetContext,
      contextByDay: contextByDay,
      rules: { maxContinuousGapMin: 90 }
    };
  }

  function previewPointerTransaction(draft, item, strategy) {
    var api = ffApi();
    var request = pointerRequest(draft, item);
    request.mode = strategy || 'single';
    request.strategy = strategy || 'single';
    if (draft.sourceDate !== draft.preview.date) {
      var crossPreview = api.previewCrossDayChange || api.previewCrossDayMove || api.previewCalendarChange;
      if (typeof crossPreview !== 'function') {
        var missing = new Error('跨日排程模組尚未就緒，本次拖移沒有寫入');
        missing.code = 'FINEFLOW_CROSS_DAY_UNAVAILABLE';
        throw missing;
      }
      return crossPreview.call(api, activeVersion(), request, typeof TRIP !== 'undefined' ? TRIP : {});
    }
    var schedule = scheduleFor(draft.sourceDayId);
    if (strategy === 'ripple' && typeof api.previewRippleChange === 'function') return api.previewRippleChange(schedule, request);
    if (typeof api.previewSingleChange === 'function') return api.previewSingleChange(schedule, request);
    return fallbackPreview(item, request, strategy || 'single', schedule);
  }

  function pointerNeedsDecision(transaction) {
    return transactionIssues(transaction).some(function (issue) {
      if (issue.accepted || (issue.status !== 'new' && issue.status !== 'worsened')) return false;
      return issue.type === 'conflict' || issue.severity === 'blocking';
    });
  }

  function applyPointerTransaction(item, transaction) {
    var version = activeVersion();
    if (!version || !transaction) return;
    var before = copy(version), api = ffApi();
    try {
      var applyCross = api.applyCrossDayTransaction;
      var result = transaction.crossDay && typeof applyCross === 'function' ? applyCross(version, transaction) :
        (typeof api.applyTransaction === 'function' ? api.applyTransaction(version, transaction) : null);
      var next = result && result.version ? result.version : result;
      if (!next || !Array.isArray(next.plan)) {
        next = copy(version);
        (transaction.mutations || []).forEach(function (mutation) {
          var index = next.plan.findIndex(function (entry) { return entry.id === mutation.occurrenceId; });
          if (index >= 0 && mutation.after) next.plan[index] = copy(mutation.after);
        });
      }
      var movedItem = next.plan.find(function (entry) { return entry.id === item.id; });
      if (movedItem && item.day && item.slot && movedItem.fine) {
        movedItem.day = dayIdForDate(dateFromIso(movedItem.fine.startAt));
        movedItem.slot = slotFromTime(timeFromIso(movedItem.fine.startAt));
      }
      replaceVersionInPlace(version, next);
      if (typeof syncActive === 'function') syncActive();
      if (typeof afterChange === 'function') afterChange();
      var message = '已' + summaryText(transaction);
      if (typeof toast === 'function') toast(message, { undo: function () {
        var current = activeVersion();
        if (!current || current.id !== before.id) { toast('請先切回原版本再復原'); return; }
        replaceVersionInPlace(current, before);
        if (typeof syncActive === 'function') syncActive();
        if (typeof afterChange === 'function') afterChange();
      }});
    } catch (error) {
      if (typeof toast === 'function') toast(error && error.code === 'FINEFLOW_STALE_BASE' ? '行程剛被更新，請重新拖移' : '時間調整失敗，正式行程沒有變更');
    }
  }

  function acceptConflictTransaction(transaction) {
    var api = ffApi();
    var next = transaction;
    transactionIssues(next).filter(function (issue) {
      return issue.type === 'conflict' && !issue.accepted && (issue.status === 'new' || issue.status === 'worsened');
    }).forEach(function (issue) {
      var resolution = (issue.resolutions || []).find(function (entry) { return (entry.action || entry.type || entry.id) === 'accept_conflict'; });
      var resolutionId = resolution && (resolution.id || resolution.resolutionId || resolution.action || resolution.type);
      if (resolutionId && typeof api.applyResolution === 'function') next = api.applyResolution(next, resolutionId) || next;
    });
    return next;
  }

  function renderPointerDecision() {
    var editor = state.editor;
    var item = editor && findOccurrence(editor.id);
    if (!editor || !item) return;
    var issues = transactionIssues(editor.transaction).filter(function (issue) { return issue.status !== 'resolved' && !issue.accepted; });
    var description = issues.map(function (issue) { return issue.message || issueTitle(issue); }).join('；') || '這個時間會影響後面的行程。';
    var error = editor.error ? '<div class="ff-preview-state error" role="alert">' + h(editor.error) + '</div>' : '';
    openSheet('<div class="ff-sheet ff-pointer-decision" role="dialog" aria-modal="true" aria-labelledby="ff-pointer-title"><div class="ff-sheet-head"><span class="ff-kicker">時間衝突</span><h3 id="ff-pointer-title">要怎麼放這項行程？</h3><p>' + h(occurrenceTitle(item)) + '・' + h(labelForMinute(editor.pointerDraft.preview.start) + '–' + labelForMinute(editor.pointerDraft.preview.end)) + '</p></div><div class="ff-sheet-scroll"><p class="ff-pointer-explanation">' + h(description) + '</p>' + error + '<div class="ff-pointer-actions"><button type="button" data-action="ff-conflict-single"><b>只移這項</b><small>接受這次重疊並立即儲存</small></button><button type="button" class="primary" data-action="ff-conflict-ripple"><b>連動後面</b><small>把後面的可移動行程一起順延</small></button>' + (editor.error ? '<button type="button" data-action="ff-pointer-edit"><b>開啟完整編輯</b><small>查看日期、時間與進階設定</small></button>' : '') + '</div></div><div class="ff-sheet-actions one"><button type="button" data-action="close">取消移動</button></div></div>', function () { renderPointerDecision(); }, 'fineflow-pointer-decision');
  }

  function openPointerDecision(draft, item, transaction) {
    state.editor = {
      id: item.id,
      versionId: activeVersion() && activeVersion().id,
      pointerCompact: true,
      transaction: transaction,
      error: '',
      pointerRequest: pointerRequest(draft, item),
      pointerDraft: {
      sourceDate: draft.sourceDate,
      sourceDayId: draft.sourceDayId,
      preview: copy(draft.preview)
      },
      pointerMode: draft.mode === 'start' || draft.mode === 'end' ? 'resize' : 'drag',
      pointerEdge: draft.mode
    };
    if (uiStore) {
      var previewEvent = {
        occurrenceId: item.id,
        versionId: state.editor.versionId,
        baseFingerprint: transaction.baseFingerprint,
        baseFingerprints: transaction.baseFingerprints,
        previewRequest: state.editor.pointerRequest,
        transaction: transaction
      };
      uiStore.dispatch(Object.assign({
        type: state.editor.pointerMode === 'resize' ? 'START_RESIZE_PREVIEW' : 'START_DRAG_PREVIEW',
        edge: state.editor.pointerEdge
      }, previewEvent));
      uiStore.dispatch({ type: 'PREVIEW_READY', transaction: transaction });
    }
    renderPointerDecision();
  }

  function finishPointerDraft(event, cancelled) {
    if (!pointerDraft || pointerDraft.pointerId !== event.pointerId) return;
    var draft = pointerDraft;
    pointerDraft = null;
    var preview = draft.preview;
    removePointerVisuals(draft);
    if (draft.didDrag) {
      if (draft.mode === 'create') {
        state.suppressCalendarClick = true;
        setTimeout(function () { state.suppressCalendarClick = false; }, 0);
      } else {
        state.suppressCardClick = draft.itemId;
        setTimeout(function () { if (state.suppressCardClick === draft.itemId) state.suppressCardClick = false; }, 0);
      }
    }
    if (cancelled || !draft.active || !draft.didDrag || !preview || !preview.valid) return;
    if (draft.mode === 'create') {
      openSourceMenu({ day: preview.dayId, date: preview.date, start: labelForMinute(preview.start), end: labelForMinute(preview.end) });
      return;
    }
    var item = findOccurrence(draft.itemId);
    if (!item || !item.fine) return;
    if (draft.sourceDate === preview.date && draft.originalStart === preview.start && draft.originalEnd === preview.end) return;
    try {
      var transaction = previewPointerTransaction(draft, item, 'single');
      if (pointerNeedsDecision(transaction)) openPointerDecision(draft, item, transaction);
      else applyPointerTransaction(item, transaction);
    } catch (error) {
      if (typeof toast === 'function') toast(error && error.message || '無法建立這次時間調整');
    }
  }

  document.addEventListener('pointerup', function (event) { finishPointerDraft(event, false); });
  document.addEventListener('pointercancel', function (event) { finishPointerDraft(event, true); });
  document.addEventListener('lostpointercapture', function (event) { finishPointerDraft(event, true); });
  document.addEventListener('touchmove', function (event) {
    if (!pointerDraft || !pointerDraft.active) return;
    event.preventDefault();
    var touch = event.touches && event.touches[0];
    if (touch) updatePointerPreview(touch.clientX, touch.clientY);
  }, { passive: false });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && pointerDraft) {
      var activePointer = pointerDraft;
      pointerDraft = null;
      removePointerVisuals(activePointer);
      if (uiStore) uiStore.dispatch({ type: 'ESCAPE' });
      return;
    }
    var card = event.target.closest && event.target.closest('.ff-cal-card-main[role="button"]');
    if (card && event.target === card && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      openEditor(card.dataset.eid);
      return;
    }
    if (event.key === 'Escape' && (state.createDraft || state.editor || state.selectedId)) {
      state.createDraft = null;
      state.editor = null;
      state.selectedId = null;
      if (uiStore) uiStore.dispatch({ type: 'ESCAPE' });
      renderFineFlow();
    }
  });

  document.addEventListener('input', function (event) {
    if (state.createDraft && event.target.matches('[data-ff-create-date], [data-ff-create-start], [data-ff-create-end], [data-ff-create-title]')) {
      if (event.target.matches('[data-ff-create-date]')) {
        state.createDraft.date = event.target.value;
        state.createDraft.day = dayIdForDate(event.target.value);
        if (event.target.value < calendarAnchor() || event.target.value > addDays(calendarAnchor(), calendarVisibleDays() - 1)) state.anchorDate = clampCalendarAnchor(event.target.value);
      } else if (event.target.matches('[data-ff-create-start]')) state.createDraft.start = event.target.value;
      else if (event.target.matches('[data-ff-create-end]')) state.createDraft.end = event.target.value;
      else state.createDraft.title = event.target.value || '新增行程';
      renderFineFlow();
      keepCreateDraftVisible(state.createDraft);
      return;
    }
    if (!state.editor) return;
    if (event.target.matches('[data-ff-title]')) {
      state.editor.title = event.target.value;
      if (state.editor.placeCard) state.editor.placeCard.name = event.target.value;
      return;
    } else if (event.target.matches('[data-ff-notes]')) {
      state.editor.notes = event.target.value;
      return;
    } else if (event.target.matches('[data-ff-place-maps]')) {
      if (state.editor.placeCard) state.editor.placeCard.mapsUrl = event.target.value;
      return;
    } else if (event.target.matches('[data-ff-place-note]')) {
      if (state.editor.placeCard) state.editor.placeCard.note = event.target.value;
      return;
    } else if (event.target.matches('[data-ff-place-hours]')) {
      if (state.editor.placeCard) state.editor.placeCard.hours = event.target.value;
      return;
    } else if (event.target.matches('[data-ff-place-amount]')) {
      if (state.editor.placeCard) {
        state.editor.placeCard.cost = state.editor.placeCard.cost || { per: 'person' };
        state.editor.placeCard.cost.amount = event.target.value === '' ? null : Math.max(0, +event.target.value || 0);
      }
      return;
    } else if (event.target.matches('[data-ff-transport-route]')) {
      state.editor.transport.routeLabel = event.target.value;
      return;
    } else if (event.target.matches('[data-ff-date]')) {
      state.editor.date = event.target.value;
      if (state.editor.coarseVisible) {
        state.editor.coarseDay = dayIdForDate(state.editor.date);
        state.editor.coarseSlot = slotFromTime(state.editor.start);
      }
    } else if (event.target.matches('[data-ff-start]')) {
      state.editor.start = event.target.value;
      state.editor.end = addMinutesToTime(state.editor.start, state.editor.durationMin);
      if (state.editor.coarseVisible) state.editor.coarseSlot = slotFromTime(state.editor.start);
      var endInput = sh.querySelector('[data-ff-end]');
      if (endInput) endInput.value = state.editor.end;
    } else if (event.target.matches('[data-ff-end]')) {
      state.editor.end = event.target.value;
      var date = state.editor.date, endDate = state.editor.end <= state.editor.start ? addDays(date, 1) : date;
      state.editor.durationMin = Math.round((Date.parse(zonedIso(endDate, state.editor.end)) - Date.parse(zonedIso(date, state.editor.start))) / 60000);
      if (state.editor.minDurationMin > state.editor.durationMin) state.editor.minDurationMin = state.editor.durationMin;
    } else if (event.target.matches('[data-ff-min]')) {
      state.editor.minDurationMin = Math.max(1, Math.min(state.editor.durationMin, +event.target.value || 1));
      state.editor.rulesOpen = true;
    }
    else return;
    state.editor.notice = '';
    clearTimeout(previewTimer);
    previewTimer = setTimeout(runPreview, 100);
  });

  document.addEventListener('change', function (event) {
    if (state.createDraft && event.target.matches('[data-ff-create-coarse], [data-ff-create-coarse-day], [data-ff-create-coarse-slot]')) {
      if (event.target.matches('[data-ff-create-coarse]')) {
        state.createDraft.coarseVisible = event.target.checked;
        var createFields = sh.querySelector('.ff-coarse-fields');
        if (createFields) createFields.hidden = !event.target.checked;
      } else if (event.target.matches('[data-ff-create-coarse-day]')) state.createDraft.coarseDay = event.target.value;
      else state.createDraft.coarseSlot = event.target.value;
      return;
    }
    if (!state.editor) return;
    if (event.target.matches('[data-ff-target]')) state.editor.targetId = event.target.value;
    else if (event.target.matches('[data-ff-fixed]')) { state.editor.fixedMarker = event.target.checked; state.editor.rulesOpen = true; }
    else if (event.target.matches('[data-ff-compress]')) { state.editor.compressibility = event.target.value; state.editor.rulesOpen = true; }
    else if (event.target.matches('[data-ff-coarse]')) {
      state.editor.coarseVisible = event.target.checked;
      if (state.editor.coarseVisible) state.editor.coarseDay = dayIdForDate(state.editor.date);
      renderEditor();
      return;
    }
    else if (event.target.matches('[data-ff-coarse-day]')) { state.editor.coarseDay = event.target.value; renderEditor(); return; }
    else if (event.target.matches('[data-ff-coarse-slot]')) { state.editor.coarseSlot = event.target.value; renderEditor(); return; }
    else if (event.target.matches('[data-ff-transport-from]')) { state.editor.transport.fromOccurrenceId = event.target.value || null; return; }
    else if (event.target.matches('[data-ff-transport-to]')) { state.editor.transport.toOccurrenceId = event.target.value || null; return; }
    else if (event.target.matches('[data-ff-transport-mode]')) { state.editor.transport.mode = event.target.value || null; return; }
    else if (event.target.matches('[data-ff-place-choice]')) {
      var nextPlace = typeof getPlace === 'function' ? getPlace(event.target.value) : null;
      if (!nextPlace) return;
      state.editor.placeId = nextPlace.id;
      state.editor.placeCard = copy(nextPlace);
      state.editor.title = nextPlace.name || state.editor.title;
      renderEditor();
      return;
    }
    else if (event.target.matches('[data-ff-place-area]')) { if (state.editor.placeCard) state.editor.placeCard.area = event.target.value; return; }
    else if (event.target.matches('[data-ff-place-type]')) { if (state.editor.placeCard) state.editor.placeCard.type = event.target.value; return; }
    else if (event.target.matches('[data-ff-place-per]')) {
      if (state.editor.placeCard) {
        state.editor.placeCard.cost = state.editor.placeCard.cost || {};
        state.editor.placeCard.cost.per = event.target.value === 'shared' ? 'shared' : 'person';
      }
      return;
    }
    else if (event.target.matches('[data-ff-place-tier]')) { if (state.editor.placeCard) state.editor.placeCard.tier = +event.target.value || 0; return; }
    else if (event.target.matches('[data-ff-coarse-order]')) { state.editor.coarseOrder = +event.target.value || 0; return; }
    else if (event.target.matches('[data-ff-coarse-pk]')) { state.editor.coarsePk = event.target.checked; return; }
    else if (event.target.matches('[data-ff-coarse-backup]')) {
      state.editor.backupIds[+event.target.dataset.ffCoarseBackup || 0] = event.target.value || null;
      state.editor.backupIds = state.editor.backupIds.filter(Boolean).slice(0, 2);
      return;
    }
    else return;
    state.editor.notice = '';
    runPreview();
  });

  document.addEventListener('toggle', function (event) {
    if (state.editor && event.target.matches && event.target.matches('.ff-rules')) state.editor.rulesOpen = event.target.open;
  }, true);

  window.renderFineFlow = renderFineFlow;
  window.CNXFineFlowUI = {
    render: renderFineFlow,
    setLoading: function (loading) { state.loading = !!loading; renderFineFlow(); },
    setError: function (message) { state.error = message || ''; state.loading = false; renderFineFlow(); },
    openDay: function (dayId) { state.day = dayId || null; if (dayId) state.anchorDate = dateForDayId(dayId); renderFineFlow(); },
    openEditor: openEditor,
    openDetail: openOccurrenceDetail,
    openAddSource: function () { openSourceMenu({}); },
    openImport: openImportPreview,
    pointerMath: {
      snapMinute: snapPointerMinute,
      minuteAtPointer: minuteAtPointer,
      columnAt: calendarColumnAt,
      interval: pointerInterval,
      labelForMinute: labelForMinute
    },
    resetTransient: function () {
      state.createDraft = null;
      state.selectedId = null;
      state.editor = null;
      state.importPreview = null;
      if (uiStore) uiStore.dispatch({ type: 'CANCEL' });
      renderFineFlow();
    }
  };

  var calendarResizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(calendarResizeTimer);
    calendarResizeTimer = setTimeout(function () {
      var desktop = calendarIsDesktop();
      if (state.calendarDesktop == null || state.calendarDesktop === desktop) return;
      state.anchorDate = clampCalendarAnchor(calendarAnchor());
      renderFineFlow();
    }, 120);
  });

  setTimeout(renderFineFlow, 0);
})();
