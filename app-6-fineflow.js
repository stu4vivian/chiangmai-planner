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
    suppressCardClick: false
  };
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
    if (item.custom && item.custom.title) return item.custom.title;
    if (item.placeId && typeof getPlace === 'function') {
      var place = getPlace(item.placeId);
      if (place && place.name) return place.name;
    }
    if (item.transport && item.transport.routeLabel) return item.transport.routeLabel;
    return kindLabel(item.scheduleKind);
  }

  function kindLabel(kind) {
    return ({
      place: '地點', custom: '自訂', connector_travel: '接駁交通',
      booked_transport: '預約交通', flight: '航班／長途交通', sleep: '休息'
    })[kind] || '行程';
  }

  function kindIcon(kind) {
    return ({ place: '●', custom: '◆', connector_travel: '→', booked_transport: '◆', flight: '✈', sleep: '◐' })[kind] || '●';
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
    return (version.plan || []).filter(function (item) { return item.day === dayId; });
  }

  function scheduleParts(schedule, dayId, version) {
    var raw = Array.isArray(schedule) ? schedule :
      (schedule && (schedule.occurrences || schedule.items || schedule.schedule || schedule.all)) ||
      (version.plan || []).filter(function (item) { return item.day === dayId; });
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
    (version.plan || []).forEach(function (item) { if (item.day && known.indexOf(item.day) < 0) known.push(item.day); });
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

  function clampCalendarAnchor(dateText) {
    var start = typeof TRIP !== 'undefined' && TRIP && TRIP.startDate;
    var end = typeof TRIP !== 'undefined' && TRIP && TRIP.endDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) return dateText;
    var latest = addDays(end, -2);
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
    if (typeof api.projectThreeDaySchedules !== 'function') throw new Error('三日行事曆模組尚未載入');
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
    var dates = api.buildThreeDayWindow(calendarAnchor());
    var schedules = dates.map(function (date) {
      var dayId = dayIdForDate(date);
      var parts = scheduleParts(buildSchedule(version, dayId), dayId, version);
      return { day: dayId, date: date, items: parts.precise, unscheduled: parts.unplanned, issues: parts.issues };
    });
    var projection = api.projectThreeDaySchedules(calendarAnchor(), schedules, {
      places: typeof places !== 'undefined' ? places : [],
      trip: typeof TRIP !== 'undefined' ? TRIP : {},
      dayStartMinute: 0,
      dayEndMinute: 1440,
      pixelsPerHour: 64,
      minimumCardHeight: 20,
      mediumHeight: 48,
      largeHeight: 88
    });
    projection.days.forEach(function (day, index) {
      day.dayId = schedules[index].day;
      day.issues = schedules[index].issues;
      day.conflictIds = calendarIssueIds(schedules[index]);
    });
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
    for (var hour = 0; hour < 24; hour++) html += '<span class="ff-cal-time" style="--ff-hour:' + hour + '">' + String(hour).padStart(2, '0') + ':00</span>';
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
    var meta = '';
    if (card.density === 'large' && todos.firstIncomplete) {
      meta += '<button type="button" class="ff-cal-card-todo" data-action="ff-card-todo" data-eid="' + h(card.id) + '" data-todo="' + h(todos.firstIncomplete.id) + '" aria-label="完成待辦：' + h(todos.firstIncomplete.text) + '"><span class="ff-cal-check" aria-hidden="true"></span><span>' + h(todos.firstIncomplete.text) + '</span></button>';
    }
    if (card.density !== 'small' && todos.total) meta += '<span class="ff-cal-progress">' + todos.completed + '/' + todos.total + '</span>';
    if (card.density !== 'small' && map) meta += '<span class="ff-cal-meta-icon" title="有 Maps 連結" aria-label="有 Maps 連結">⌖</span>';
    if (card.density !== 'small' && card.note) meta += '<span class="ff-cal-meta-icon" title="有備註" aria-label="有備註">▤</span>';
    var classes = ['ff-cal-card', 'density-' + card.density];
    if (conflict) classes.push('is-conflict');
    if (card.fixed) classes.push('is-fixed');
    if (selected) classes.push('is-selected');
    return '<article class="' + classes.join(' ') + '" data-eid="' + h(card.id) + '" style="--ff-top:' + card.top + 'px;--ff-height:' + card.height + 'px;--ff-left:' + card.leftPercent + '%;--ff-width:' + card.widthPercent + '%;--ff-card-bg:' + h(card.palette.background) + ';--ff-card-border:' + h(card.palette.border) + ';--ff-card-text:' + h(card.palette.text) + ';top:' + card.top + 'px;height:' + card.height + 'px;left:' + card.leftPercent + '%;width:' + card.widthPercent + '%;background:' + h(card.palette.background) + ';border-color:' + h(card.palette.border) + ';color:' + h(card.palette.text) + '">' +
      '<div class="ff-cal-card-main" role="button" tabindex="0" data-action="ff-card-detail" data-eid="' + h(card.id) + '" data-ff-drag="card" aria-label="查看 ' + h(card.title) + '">' +
        '<span class="ff-cal-card-time">' + h(card.startLabel + '–' + card.endLabel) + '</span><strong class="ff-cal-card-title">' + h(card.title) + '</strong>' +
        '<span class="ff-cal-card-flags">' + (card.fixed ? '<span title="固定">鎖</span>' : '') + (conflict ? '<span class="ff-cal-conflict" title="有衝突">!</span>' : '') + meta + '</span>' +
      '</div>' +
      '<button type="button" class="ff-cal-resize ff-cal-resize-start" data-action="ff-resize-start" data-eid="' + h(card.id) + '" aria-label="調整開始時間"></button>' +
      '<button type="button" class="ff-cal-resize ff-cal-resize-end" data-action="ff-resize-end" data-eid="' + h(card.id) + '" aria-label="調整結束時間"></button>' +
      '<span hidden data-action="ff-edit" data-eid="' + h(card.id) + '"></span>' +
    '</article>';
  }

  function renderCreateDraft(day) {
    var draft = state.createDraft;
    if (!draft || !draft.start || draft.date !== day.date) return '';
    var start = +draft.start.slice(0, 2) * 60 + +draft.start.slice(3);
    var endText = draft.end || addMinutesToTime(draft.start, 60);
    var end = +endText.slice(0, 2) * 60 + +endText.slice(3);
    var top = start * 64 / 60;
    var height = Math.max(20, (end - start) * 64 / 60);
    return '<article class="ff-cal-card density-medium is-preview" data-draft="true" style="--ff-top:' + top + 'px;--ff-height:' + height + 'px;--ff-left:0%;--ff-width:100%;--ff-card-bg:#e8f0fe;--ff-card-border:#5b8def;--ff-card-text:#174ea6;top:' + top + 'px;height:' + height + 'px;left:0;width:100%;background:#e8f0fe;border-color:#5b8def;color:#174ea6"><div class="ff-cal-card-main" aria-hidden="true"><span class="ff-cal-card-time">' + h(draft.start + '–' + endText) + '</span><strong class="ff-cal-card-title">' + h(draft.title || '新增行程') + '</strong></div><span class="ff-cal-resize ff-cal-resize-start" aria-hidden="true"></span><span class="ff-cal-resize ff-cal-resize-end" aria-hidden="true"></span></article>';
  }

  function renderCalendarPage(model) {
    var dates = model.days.map(function (day) {
      var label = formatDateHeading(day.date);
      return '<div class="ff-cal-date" data-date="' + h(day.date) + '"><span>' + h(label.weekday) + '</span><b>' + h(label.date) + '</b></div>';
    }).join('');
    var days = model.days.map(function (day) {
      return '<section class="ff-cal-day" data-date="' + h(day.date) + '" data-day="' + h(day.dayId) + '" aria-label="' + h(day.date) + '">' +
        renderSlots(day) + renderCreateDraft(day) + day.cards.map(function (card) { return renderCalendarCard(card, day); }).join('') + '</section>';
    }).join('');
    var unscheduledItems = [];
    model.days.forEach(function (day) { (day.unscheduled || []).forEach(function (item) { unscheduledItems.push(item); }); });
    var hiddenUnscheduled = unscheduledItems.map(function (item) { return '<span hidden data-action="ff-edit" data-eid="' + h(item.id) + '"></span>'; }).join('');
    var unplanned = model.unscheduledCount ? '<button type="button" class="ff-cal-unscheduled" data-action="ff-unscheduled"><span>尚未排時間</span><b>□ ' + model.unscheduledCount + '</b></button>' + hiddenUnscheduled : '';
    var empty = model.days.every(function (day) { return !day.cards.length; }) ? '<p class="ff-cal-empty">點空白時段，或按右下角＋開始排細流</p>' : '';
    return '<div class="ff-calendar" data-version="' + h(model.versionId) + '">' +
      '<div class="ff-cal-toolbar"><button type="button" data-action="ff-prev-days" aria-label="往前一天">‹</button><div><span>三日行程</span><strong>' + h(model.days[0].date + ' ～ ' + model.days[2].date) + '</strong></div><button type="button" data-action="ff-next-days" aria-label="往後一天">›</button></div>' +
      unplanned + '<div class="ff-cal-date-row"><span class="ff-cal-date-spacer"></span>' + dates + '</div>' +
      '<div class="ff-cal-scroll">' + renderTimeGutter() + '<div class="ff-cal-days">' + days + '</div>' + empty + '</div>' +
      '<button type="button" class="ff-cal-fab" data-action="ff-add-source" aria-label="新增行程">＋</button>' +
    '</div>';
  }

  function renderFineFlow() {
    var root = document.getElementById(rootId);
    if (!root) return;
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
    var date = dayDate(item.day);
    var endDate = date;
    if (editor.end <= editor.start) endDate = addDays(date, 1);
    var startAt = zonedIso(date, editor.start);
    var endAt = zonedIso(endDate, editor.end);
    return {
      versionId: activeVersion() && activeVersion().id,
      occurrenceId: item.id, itemId: item.id, day: item.day,
      startAt: startAt, endAt: endAt, newStartAt: startAt, newEndAt: endAt,
      fixedMarker: !!editor.fixedMarker,
      compressibility: editor.compressibility,
      minDurationMin: Math.max(0, +editor.minDurationMin || 0),
      targetOccurrenceId: editor.targetId || null, swapWithOccurrenceId: editor.targetId || null,
      context: contextForDay(item.day),
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
    after.slot = slotFromTime(after.startTime);
    var base = schedule && !Array.isArray(schedule) ? copy(schedule) : { day: item.day, timeZone: typeof TRIP !== 'undefined' && TRIP.timeZone, items: [], unscheduled: [] };
    base.items = Array.isArray(base.items) ? base.items : [];
    base.unscheduled = Array.isArray(base.unscheduled) ? base.unscheduled : [];
    var afterItems = base.items.filter(function (entry) { return entry.id !== item.id; }).concat([after]);
    var afterSchedule = {
      day: item.day, timeZone: base.timeZone,
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
      versionId: activeVersion().id, day: item.day,
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
      var api = ffApi(), request = editorRequest(editor), schedule = scheduleFor(item.day), transaction;
      if (editor.firstSchedule) {
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
    var parts = scheduleParts(scheduleFor(item.day), item.day, activeVersion());
    return fineSort(parts.precise.concat(parts.unplanned)).filter(function (candidate) { return candidate.id !== item.id; });
  }

  function resolutionLabel(resolution, issue) {
    if (resolution.label) return resolution.label;
    if (resolution.message) return resolution.message;
    var action = resolution.action || resolution.type || resolution.id || '';
    var title = issue && issue.occurrenceIds && issue.occurrenceIds.length ? occurrenceTitle(findOccurrence(issue.occurrenceIds[0])) : '行程';
    return ({ connect: '接續後面行程', push: '後面順延', shorten: '縮短' + title, keep_gap: '保留這段空檔', accept_conflict: '保留衝突', override_anchor: '這次仍要移動固定行程', relink_transport: '依目前前後行程重新連結交通', cancel_swap: '取消交換' })[action] || action || '套用這個修復';
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

  function issueCard(issue, index) {
    var resolutions = Array.isArray(issue.resolutions) ? issue.resolutions : [];
    var status = issue.status || 'new';
    var statusText = issue.accepted ? '已接受，保留警示' : (({ preexisting: '原本已有', worsened: '本次惡化', resolved: '已處理', new: '本次新增' })[status] || '');
    return '<article class="ff-issue ' + h(issue.severity || 'warning') + (status === 'resolved' ? ' resolved' : '') + '">' +
      '<div class="ff-issue-no">' + (index + 1) + '</div><div class="ff-issue-body"><div class="ff-issue-head"><b>' + h(issueTitle(issue)) + '</b><span>' + h(statusText) + '</span></div>' +
      '<p>' + h(issue.message || (issue.minutes ? '相差 ' + issue.minutes + ' 分鐘' : '請選擇要如何處理')) + '</p>' +
      (resolutions.length ? '<div class="ff-resolutions">' + resolutions.map(function (resolution, rIndex) {
        var rid = resolution.id || resolution.resolutionId || resolution.action || resolution.type;
        return '<button type="button" data-action="ff-resolution" data-id="' + h(rid) + '"' + (rIndex === 0 ? ' class="recommended"' : '') + '>' + h(resolutionLabel(resolution, issue)) + '</button>';
      }).join('') + '</div>' : (status === 'resolved' ? '' : '<span class="ff-unresolved">尚未找到可自動處理的做法</span>')) + '</div></article>';
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

  function renderEditor() {
    var editor = state.editor, item = editor && findOccurrence(editor.id);
    if (!editor || !item || typeof sh === 'undefined') return;
    var duration = editor.durationMin;
    var transaction = editor.transaction;
    var issues = transactionIssues(transaction);
    var mutations = transaction && Array.isArray(transaction.mutations) ? transaction.mutations : [];
    var blocking = issues.some(function (issue) {
      if (issue.status === 'resolved' || issue.accepted) return false;
      if (issue.severity === 'blocking') return true;
      return (issue.status === 'new' || issue.status === 'worsened') &&
        (issue.type === 'conflict' || issue.type === 'travel_shortage' || issue.type === 'anchor_violation' || issue.type === 'day_overflow');
    });
    var candidates = scheduleCandidates(editor);
    var editorFields = editor.mode === 'swap' ?
      '<label class="ff-field"><span>交換對象</span><select data-ff-target aria-label="選擇交換行程"><option value="">請選一項</option>' + candidates.map(function (candidate) {
        var time = candidate.fine ? timeFromIso(candidate.fine.startAt) : '未排';
        return '<option value="' + h(candidate.id) + '"' + (candidate.id === editor.targetId ? ' selected' : '') + (!candidate.fine ? ' disabled' : '') + '>' + h(time + '｜' + kindLabel(candidate.scheduleKind) + '｜' + occurrenceTitle(candidate) + (candidate.fine && candidate.fine.fixedMarker ? '｜固定' : '')) + '</option>';
      }).join('') + '</select></label>' :
      '<div class="ff-time-fields"><label class="ff-field"><span>開始</span><input type="time" data-ff-start value="' + h(editor.start) + '"></label><span aria-hidden="true">→</span><label class="ff-field"><span>結束</span><input type="time" data-ff-end value="' + h(editor.end) + '"></label></div>';
    var rules = '<details class="ff-rules"' + (editor.rulesOpen ? ' open' : '') + '><summary>排程規則與待辦</summary><div class="ff-rules-body">' +
      '<label class="ff-fixed-check"><input type="checkbox" data-ff-fixed' + (editor.fixedMarker ? ' checked' : '') + '><span>標記為固定行程</span></label>' +
      '<div class="ff-rule-grid"><label class="ff-field"><span>可縮短性</span><select data-ff-compress><option value="none"' + (editor.compressibility === 'none' ? ' selected' : '') + '>不可縮短</option><option value="suggest"' + (editor.compressibility === 'suggest' ? ' selected' : '') + '>可建議縮短</option><option value="free"' + (editor.compressibility === 'free' ? ' selected' : '') + '>可自由縮短</option></select></label>' +
      '<label class="ff-field"><span>最低分鐘</span><input type="number" inputmode="numeric" min="1" max="1440" data-ff-min value="' + h(editor.minDurationMin) + '"' + (editor.compressibility === 'none' ? ' disabled' : '') + '></label></div>' +
      '<div class="ff-todo-add"><label class="ff-field"><span>新增到這項行程的待辦</span><input data-ff-todo-text maxlength="120" placeholder="例如：確認訂位"></label><button type="button" data-action="ff-todo-add">新增</button></div>' +
      (item.todos && item.todos.length ? '<div class="ff-rule-note">目前有 ' + item.todos.length + ' 件待辦，可到集中待辦勾選。</div>' : '') +
      '</div></details>';
    var notice = editor.notice ? '<div class="ff-preview-state notice" role="status">' + h(editor.notice) + '</div>' : '';
    var activeConflicts = issues.filter(function (issue) { return issue.type === 'conflict' && !issue.accepted && (issue.status === 'new' || issue.status === 'worsened'); });
    var conflictChoices = activeConflicts.length ? '<div class="ff-conflict-choice" role="group" aria-label="衝突處理"><p>這次調整造成新的時間衝突，要怎麼處理？</p><button type="button" data-action="ff-conflict-single">只改這項</button><button type="button" class="primary" data-action="ff-conflict-ripple">連動後面</button><button type="button" data-action="close">取消</button></div>' : '';
    var preview = editor.previewing ? '<div class="ff-preview-state" role="status">正在計算影響…</div>' :
      editor.error ? '<div class="ff-preview-state error" role="alert">' + h(editor.error) + '</div>' :
      transaction ? '<div class="ff-change-head"><div><span class="ff-kicker">套用摘要</span><b>' + h(summaryText(transaction)) + '</b></div><span>' + mutations.length + ' 項變更</span></div>' +
        (issues.length ? '<div class="ff-issues"><div class="ff-section-title">需要處理 ' + issues.filter(function (issue) { return issue.status !== 'resolved'; }).length + ' 件事</div>' + issues.map(issueCard).join('') + '</div>' : '<div class="ff-no-issue">✓ 沒有新增衝突，可以直接套用</div>') +
        (mutations.length ? '<details class="ff-mutations"><summary>查看全部 ' + mutations.length + ' 項變更</summary>' + mutations.map(function (mutation) {
          return '<div><b>' + h(occurrenceTitle(mutation.after || mutation.before || findOccurrence(mutation.occurrenceId))) + '</b><span>' + h(mutation.reason || '調整時間') + '</span></div>';
        }).join('') + '</details>' : '') : '<div class="ff-preview-state">完成上方設定後，這裡會先列出所有影響。</div>';
    var html = '<div class="ff-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-editor-title"><div class="ff-sheet-head"><span class="ff-kicker">調整時間</span><h3 id="ff-editor-title">' + h(occurrenceTitle(item)) + '</h3>' +
      '<p>' + h(timeFromIso(item.fine && item.fine.startAt) || '尚未排時間') + (item.fine ? '～' + h(timeFromIso(item.fine.endAt)) : '') + '・' + duration + ' 分鐘' + (editor.fixedMarker ? '・固定' : '') + '</p></div>' +
      conflictChoices + '<div class="ff-modes ff-legacy-modes" hidden role="tablist" aria-label="進階調整方式">' + [['single', '只改這項'], ['ripple', '連動後面'], ['swap', '交換行程']].map(function (mode) {
        var unavailable = editor.firstSchedule && mode[0] !== 'single';
        return '<button type="button" role="tab" aria-selected="' + (editor.mode === mode[0]) + '" class="' + (editor.mode === mode[0] ? 'active' : '') + '" data-action="ff-mode" data-mode="' + mode[0] + '"' + (unavailable ? ' disabled title="先設定這項的時間"' : '') + '>' + mode[1] + '</button>';
      }).join('') + '</div><div class="ff-sheet-scroll"><div class="ff-current"><span class="ff-kicker">正在調整</span><b>' + h(occurrenceTitle(item)) + '</b><small>' + h(kindLabel(item.scheduleKind)) + (item.transport && item.transport.routeLabel ? '・' + h(item.transport.routeLabel) : '') + '</small></div>' + editorFields + rules + notice + preview + '</div>' +
      '<div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-apply"' + (!transaction || !mutations.length || blocking ? ' disabled' : '') + '>套用 ' + mutations.length + ' 項變更</button></div></div>';
    openSheet(html, function () { renderEditor(); }, 'fineflow-editor');
    setTimeout(function () { var focus = sh.querySelector('[data-ff-start], [data-ff-target]'); if (focus) focus.focus(); }, 0);
  }

  function openEditor(id) {
    var item = findOccurrence(id);
    if (!item) return;
    var start = timeFromIso(item.fine && item.fine.startAt) || item.startTime || defaultTime(item.slot);
    var duration = minuteDuration(item) || 60;
    state.editor = {
      id: id, versionId: activeVersion() && activeVersion().id, mode: 'single',
      start: start, end: timeFromIso(item.fine && item.fine.endAt) || addMinutesToTime(start, duration),
      durationMin: duration, firstSchedule: !item.fine,
      fixedMarker: !!(item.fine && item.fine.fixedMarker),
      compressibility: item.fine && item.fine.compressibility || 'none',
      minDurationMin: item.fine && item.fine.minDurationMin || duration,
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

  function applyEditorTransaction() {
    var editor = state.editor, transaction = editor && editor.transaction, version = activeVersion();
    if (!transaction || !version) return;
    if (version.id !== editor.versionId || (transaction.versionId && transaction.versionId !== version.id)) {
      editor.transaction = null;
      editor.error = '目前版本已切換，這份預演不會套用。請在新版本重新開啟行程。';
      renderEditor();
      return;
    }
    var before = copy(version), api = ffApi();
    try {
      if (transaction.manualFirstSchedule && typeof api.baseFingerprint === 'function') {
        var manualItem = findOccurrence(editor.id);
        var currentDayFingerprint = manualItem && api.baseFingerprint(buildSchedule(version, manualItem.day));
        if (!manualItem || currentDayFingerprint !== transaction.baseFingerprint) {
          editor.notice = '行程剛被更新，以下已改用最新資料重新計算。';
          runPreview();
          return;
        }
      }
      if (editor.pointerMode && uiStore && typeof api.baseFingerprint === 'function') {
        var activeItem = findOccurrence(editor.id);
        var confirmation = uiStore.dispatch({ type: 'CONFIRM', activeVersionId: version.id, currentFingerprint: api.baseFingerprint(buildSchedule(version, activeItem.day)) });
        var applyCommand = confirmation.effects.some(function (effect) { return effect.command === 'apply-transaction'; });
        if (!applyCommand) {
          var failedEffect = confirmation.effects[0] || {};
          editor.error = failedEffect.message || '這份預演已過期，請重新計算';
          renderEditor();
          return;
        }
      }
      var result = !transaction.manualFirstSchedule && typeof api.applyTransaction === 'function' ? api.applyTransaction(version, transaction) : null;
      var next = result && result.version ? result.version : result;
      if (!next || !Array.isArray(next.plan)) {
        next = copy(version);
        (transaction.mutations || []).forEach(function (mutation) {
          var index = next.plan.findIndex(function (item) { return item.id === mutation.occurrenceId; });
          if (index >= 0 && mutation.after) next.plan[index] = copy(mutation.after);
        });
      }
      next.plan.forEach(function (item) {
        var preciseStart = timeFromIso(item && item.fine && item.fine.startAt);
        if (!preciseStart) return;
        item.startTime = preciseStart;
        item.slot = slotFromTime(preciseStart);
      });
      var inverse = typeof api.invertTransaction === 'function' && !transaction.manualFirstSchedule ? api.invertTransaction(transaction, next) : null;
      replaceVersionInPlace(version, next);
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
      if (dayId && item.day !== dayId) return;
      (item.todos || []).forEach(function (todo) { entries.push({ item: item, todo: todo }); });
    });
    var body = entries.length ? entries.map(function (entry) {
      var meta = dayMeta(entry.item.day);
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
      custom: { title: title, kind: 'life' }, day: dayId, slot: slotFromTime(start), startTime: start,
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
    var target = minute * 64 / 60 - 145;
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
    openSheet('<div class="ff-sheet ff-create-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-create-title"><div class="ff-sheet-head"><span class="ff-kicker">自訂行程</span><h3 id="ff-create-title">新增自訂行程</h3><p>卡片會使用所選類別的同色系淺色。</p></div><div class="ff-sheet-scroll"><label class="ff-field"><span>行程名稱</span><input data-ff-create-title maxlength="80" placeholder="例如：起床、整理行李"></label><label class="ff-field"><span>類別</span><select data-ff-create-category>' + options + '</select></label><label class="ff-field"><span>備註</span><textarea data-ff-create-notes maxlength="500" placeholder="選填"></textarea></label>' + creationTimingFields(draft) + '<label class="ff-fixed-check"><input type="checkbox" data-ff-create-fixed><span>標記為固定行程</span></label><div class="ff-create-error" role="alert"></div></div><div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-create-save" data-kind="custom">新增行程</button></div></div>', function () { openCustomCreate(); }, 'fineflow-create-custom');
  }

  function openPlaceCreate() {
    var rows = (typeof places !== 'undefined' ? places : []).map(function (place) {
      return '<button type="button" class="ff-source-place-row" data-action="ff-source-place-select" data-id="' + h(place.id) + '"><span>' + h(typeof placeEmoji === 'function' ? placeEmoji(place) : '📍') + '</span><b>' + h(place.name || '未命名卡片') + '</b><small>' + h(typeof tlabel === 'function' ? tlabel(place.type) : place.type || '') + '</small></button>';
    }).join('');
    openSheet('<div class="ff-sheet ff-create-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-place-title"><div class="ff-sheet-head"><span class="ff-kicker">行程卡片</span><h3 id="ff-place-title">選一張卡片</h3></div><div class="ff-sheet-scroll ff-source-place-list">' + (rows || '<div class="ff-sheet-empty">卡片庫目前是空的</div>') + '</div></div>', function () { openPlaceCreate(); }, 'fineflow-create-place');
  }

  function openPlaceTiming(placeId) {
    var place = typeof getPlace === 'function' ? getPlace(placeId) : null;
    if (!place) { if (typeof toast === 'function') toast('找不到這張行程卡片'); return; }
    ensureCreateTimingDraft(place.name);
    state.createDraft.placeId = place.id;
    openSheet('<div class="ff-sheet ff-create-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-place-time-title"><div class="ff-sheet-head"><span class="ff-kicker">行程卡片</span><h3 id="ff-place-time-title">' + h(place.name) + '</h3></div><div class="ff-sheet-scroll">' + creationTimingFields(state.createDraft) + '<label class="ff-fixed-check"><input type="checkbox" data-ff-create-fixed><span>標記為固定行程</span></label><div class="ff-create-error" role="alert"></div></div><div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-create-save" data-kind="place-card">新增行程</button></div></div>', function () { openPlaceTiming(placeId); }, 'fineflow-create-place-time');
  }

  function openMapsCreate() {
    var draft = ensureCreateTimingDraft('新增 Maps 行程');
    var categories = typeof categoriesList === 'function' ? categoriesList() : [];
    var options = categories.map(function (category) { return '<option value="' + h(category.key) + '">' + h((category.icon || '') + ' ' + category.label) + '</option>'; }).join('');
    openSheet('<div class="ff-sheet ff-create-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-maps-title"><div class="ff-sheet-head"><span class="ff-kicker">Google Maps</span><h3 id="ff-maps-title">貼 Maps 連結</h3><p>短連結也會保留；若連結沒有座標，交通資訊會標示待補。</p></div><div class="ff-sheet-scroll"><label class="ff-field"><span>Maps 連結</span><input type="url" data-ff-create-maps placeholder="https://maps.app.goo.gl/…"></label><label class="ff-field"><span>行程名稱</span><input data-ff-create-title maxlength="80" placeholder="店名或地點名稱"></label><label class="ff-field"><span>類別</span><select data-ff-create-category>' + options + '</select></label><label class="ff-field"><span>備註</span><textarea data-ff-create-notes maxlength="500" placeholder="選填"></textarea></label>' + creationTimingFields(draft) + '<div class="ff-create-error" role="alert"></div></div><div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-create-save" data-kind="maps">新增行程</button></div></div>', function () { openMapsCreate(); }, 'fineflow-create-maps');
  }

  function creationValues() {
    function value(selector) { var el = sh.querySelector(selector); return el ? String(el.value || '').trim() : ''; }
    return { title: value('[data-ff-create-title]'), date: value('[data-ff-create-date]'), start: value('[data-ff-create-start]'), end: value('[data-ff-create-end]'), mapsUrl: value('[data-ff-create-maps]'), category: value('[data-ff-create-category]'), notes: value('[data-ff-create-notes]'), fixed: !!(sh.querySelector('[data-ff-create-fixed]') || {}).checked };
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
      day: dayIdForDate(values.date), slot: slotFromTime(values.start), startTime: values.start,
      category: kind === 'custom' ? (values.category || '其他') : (place && place.type || values.category || '其他'),
      notes: values.notes || '',
      mapLinks: kind === 'maps' ? [{ label: values.title, url: maps }] : [],
      fine: { startAt: zonedIso(values.date, values.start), endAt: zonedIso(values.date, values.end), originalDurationMin: duration, minDurationMin: duration, compressibility: 'none', fixedMarker: values.fixed, intentionalGapBefore: false, acceptedConflictWith: [], timeCommitment: values.fixed ? 'external' : 'flexible', autoMovePolicy: values.fixed ? 'manual' : 'auto', manualOrder: activePlan().length },
      scheduleKind: kind === 'custom' ? 'custom' : 'place', transport: null, todos: [], seq: activePlan().length
    };
    var occurrence = typeof CNXCore !== 'undefined' && typeof CNXCore.normalizeOccurrence === 'function' ? CNXCore.normalizeOccurrence(raw) : raw;
    if (!occurrence || !occurrence.fine) { showCreationError('這筆行程的資料格式不正確'); return; }
    if (createdPlace) places.push(createdPlace);
    var saved = applyPlanChange('已新增「' + occurrenceTitle(occurrence) + '」', { versionId: draft.versionId, baseFingerprint: draft.baseFingerprint }, function (version) { version.plan.push(copy(occurrence)); }, createdPlace ? function (current) {
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
    (item && Array.isArray(item.mapLinks) ? item.mapLinks : []).forEach(function (entry) {
      var url = safeMapsUrl(typeof entry === 'string' ? entry : entry && entry.url);
      if (!url || links.some(function (link) { return link.url === url; })) return;
      links.push({ label: typeof entry === 'object' && entry.label || '在 Google Maps 開啟', url: url });
    });
    var place = item && item.placeId && typeof getPlace === 'function' ? getPlace(item.placeId) : null;
    var placeUrl = place ? safeMapsUrl(place.mapsUrl || (typeof gmaps === 'function' ? gmaps(place) : '')) : '';
    if (placeUrl && !links.some(function (link) { return link.url === placeUrl; })) links.push({ label: place.name || '在 Google Maps 開啟', url: placeUrl });
    return links;
  }

  function noteForOccurrence(item) {
    var place = item && item.placeId && typeof getPlace === 'function' ? getPlace(item.placeId) : null;
    return item && item.notes || place && place.note || '';
  }

  function openOccurrenceDetail(id) {
    var item = findOccurrence(id);
    if (!item) return;
    state.selectedId = id;
    renderFineFlow();
    var guard = currentGuard();
    if (uiStore) uiStore.dispatch({ type: 'OPEN_DETAIL', occurrenceId: id, versionId: guard.versionId, baseFingerprint: guard.baseFingerprint });
    var maps = mapsForOccurrence(item);
    var todos = (item.todos || []).map(function (todo) {
      return '<button type="button" class="ff-todo-row' + (todo.done ? ' done' : '') + '" data-action="ff-detail-todo" data-eid="' + h(item.id) + '" data-todo="' + h(todo.id) + '" aria-pressed="' + todo.done + '"><span class="ff-check">' + (todo.done ? '✓' : '') + '</span><span><b>' + h(todo.text) + '</b></span></button>';
    }).join('');
    var note = noteForOccurrence(item);
    openSheet('<div class="ff-sheet ff-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-detail-title"><div class="ff-sheet-head"><span class="ff-kicker">行程詳情</span><h3 id="ff-detail-title">' + h(occurrenceTitle(item)) + '</h3><p>' + h(item.fine ? timeFromIso(item.fine.startAt) + '～' + timeFromIso(item.fine.endAt) : '尚未排時間') + (item.fine && item.fine.fixedMarker ? '・固定' : '') + '</p></div><div class="ff-sheet-scroll">' +
      (maps.length ? maps.map(function (link) { return '<a class="ff-detail-maps" href="' + h(link.url) + '" target="_blank" rel="noopener noreferrer">' + h(link.label || '在 Google Maps 開啟') + '</a>'; }).join('') : '<p class="ff-detail-missing">沒有可用的 Maps 連結</p>') +
      (note ? '<section class="ff-detail-note"><h4>備註</h4><p>' + h(note) + '</p></section>' : '') +
      '<section class="ff-detail-todos"><h4>待辦事項</h4>' + (todos || '<p class="ff-detail-missing">目前沒有待辦</p>') + '<div class="ff-todo-add"><input data-ff-detail-todo-text maxlength="120" placeholder="新增待辦"><button type="button" data-action="ff-detail-todo-add" data-eid="' + h(item.id) + '">新增</button></div></section></div><div class="ff-sheet-actions"><button type="button" data-action="close">關閉</button><button type="button" class="primary" data-action="ff-detail-edit" data-eid="' + h(item.id) + '">編輯時間</button></div></div>', function () { openOccurrenceDetail(id); }, 'fineflow-detail');
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
    if (reopen) openOccurrenceDetail(itemId);
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
    openOccurrenceDetail(itemId);
  }

  function openUnscheduled() {
    var rows = activePlan().filter(function (item) { return !item.fine; }).map(function (item) {
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
    var summary = preview.transaction && preview.transaction.summary || { add: 0, skipped: preview.skipped.length, needsInput: preview.needsInput.length, errors: preview.errors.length, conflicts: preview.conflicts.length };
    var problems = preview.errors.concat(preview.needsInput).map(function (problem) { return '<li>' + h((problem.externalId ? problem.externalId + '：' : '') + problem.message) + '</li>'; }).join('');
    var partial = summary.errors || summary.needsInput || summary.skipped ? '<p class="ff-import-warning">這次只會匯入可安全轉換的 ' + summary.add + ' 筆；其餘 ' + (summary.errors + summary.needsInput + summary.skipped) + ' 筆會略過，不會寫入。</p>' : '';
    openSheet('<div class="ff-sheet ff-import-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-import-title"><div class="ff-sheet-head"><span class="ff-kicker">匯入預演</span><h3 id="ff-import-title">確認細流匯入</h3><p>新增 ' + summary.add + ' 筆・衝突 ' + summary.conflicts + ' 筆</p></div><div class="ff-sheet-scroll">' + partial + (problems ? '<ul class="ff-import-problems">' + problems + '</ul>' : '<div class="ff-no-issue">✓ 格式與對應資料可匯入</div>') + '</div><div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-import-apply"' + (!preview.canApply ? ' disabled' : '') + '>確認匯入 ' + summary.add + ' 筆</button></div></div>', function () { openImportPreview(payload); }, 'fineflow-import');
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
      if (typeof toast === 'function') toast('已匯入 ' + preview.transaction.summary.add + ' 筆細流', { undo: function () {
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
    if (action === 'ff-prev-days' || action === 'ff-next-days') {
      state.anchorDate = clampCalendarAnchor(addDays(calendarAnchor(), action === 'ff-next-days' ? 1 : -1));
      state.selectedId = null;
      renderFineFlow();
      return;
    }
    if (action === 'ff-create-at') {
      openSourceMenu({ day: target.dataset.day, date: target.dataset.date, start: target.dataset.time, end: addMinutesToTime(target.dataset.time, 60) });
      return;
    }
    if (action === 'ff-add-source') { openSourceMenu({}); return; }
    if (action === 'ff-source-custom') { openCustomCreate(); return; }
    if (action === 'ff-source-place') { openPlaceCreate(); return; }
    if (action === 'ff-source-place-select') { openPlaceTiming(target.dataset.id); return; }
    if (action === 'ff-source-maps') { openMapsCreate(); return; }
    if (action === 'ff-create-save') { saveCreatedOccurrence(target.dataset.kind); return; }
    if (action === 'ff-card-detail') {
      if (state.suppressCardClick) { state.suppressCardClick = false; return; }
      openOccurrenceDetail(target.dataset.eid);
      return;
    }
    if (action === 'ff-card-todo') { event.stopPropagation(); toggleOccurrenceTodo(target.dataset.eid, target.dataset.todo, false); return; }
    if (action === 'ff-detail-todo') { toggleOccurrenceTodo(target.dataset.eid, target.dataset.todo, true); return; }
    if (action === 'ff-detail-todo-add') { addOccurrenceTodo(target.dataset.eid); return; }
    if (action === 'ff-detail-edit') { openEditor(target.dataset.eid); return; }
    if (action === 'ff-unscheduled') { openUnscheduled(); return; }
    if (action === 'ff-unscheduled-edit') { openEditor(target.dataset.eid); return; }
    if (action === 'ff-import-apply') { applyImportPreview(); return; }
    if (action === 'ff-conflict-single') { acceptPreviewConflicts(); return; }
    if (action === 'ff-conflict-ripple' && state.editor) { if (uiStore) uiStore.dispatch({ type: 'CONFLICT_RIPPLE' }); state.editor.mode = 'ripple'; state.editor.transaction = null; runPreview(); return; }
    if (action === 'close' && sh && sh.querySelector('.ff-sheet')) {
      if (!sh.querySelector('.ff-detail-sheet')) state.selectedId = null;
      state.createDraft = null;
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
      openTodos(item.day && state.day === item.day ? item.day : null);
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

  function armPointerDraft(event, edge) {
    var target = event.target.closest('[data-eid]');
    var item = target && findOccurrence(target.dataset.eid);
    if (!item || !item.fine) return;
    pointerDraft = {
      pointerId: event.pointerId,
      itemId: item.id,
      edge: edge || 'move',
      startY: event.clientY,
      delta: 0,
      active: event.pointerType !== 'touch',
      card: target.closest('.ff-cal-card'),
      timer: null
    };
    if (event.pointerType === 'touch') pointerDraft.timer = setTimeout(function () {
      if (!pointerDraft || pointerDraft.pointerId !== event.pointerId) return;
      pointerDraft.active = true;
      if (pointerDraft.card) pointerDraft.card.classList.add('is-preview');
    }, 450);
    try { target.setPointerCapture(event.pointerId); } catch (_) {}
  }

  document.addEventListener('pointerdown', function (event) {
    var resize = event.target.closest('[data-action="ff-resize-start"], [data-action="ff-resize-end"]');
    if (resize) { event.preventDefault(); armPointerDraft(event, resize.dataset.action === 'ff-resize-start' ? 'start' : 'end'); return; }
    var card = event.target.closest('.ff-cal-card-main[data-ff-drag="card"]');
    if (card && !event.target.closest('button, a, input, select, textarea')) armPointerDraft(event, 'move');
  });

  document.addEventListener('pointermove', function (event) {
    if (!pointerDraft || pointerDraft.pointerId !== event.pointerId) return;
    var raw = event.clientY - pointerDraft.startY;
    if (!pointerDraft.active && event.pointerType === 'touch' && Math.abs(raw) > 8) {
      clearTimeout(pointerDraft.timer);
      pointerDraft = null;
      return;
    }
    if (!pointerDraft.active && event.pointerType !== 'touch' && Math.abs(raw) > 4) pointerDraft.active = true;
    if (!pointerDraft.active) return;
    event.preventDefault();
    pointerDraft.delta = Math.round(raw / 16) * 15;
    if (pointerDraft.card) {
      pointerDraft.card.classList.add('is-preview');
      pointerDraft.card.style.transform = 'translateY(' + (pointerDraft.delta * 64 / 60) + 'px)';
    }
  }, { passive: false });

  function finishPointerDraft(event, cancelled) {
    if (!pointerDraft || pointerDraft.pointerId !== event.pointerId) return;
    var draft = pointerDraft;
    pointerDraft = null;
    clearTimeout(draft.timer);
    if (draft.card) { draft.card.classList.remove('is-preview'); draft.card.style.transform = ''; }
    if (cancelled || !draft.active || !draft.delta) return;
    var item = findOccurrence(draft.itemId);
    if (!item || !item.fine) return;
    var startMinutes = +timeFromIso(item.fine.startAt).slice(0, 2) * 60 + +timeFromIso(item.fine.startAt).slice(3);
    var endMinutes = +timeFromIso(item.fine.endAt).slice(0, 2) * 60 + +timeFromIso(item.fine.endAt).slice(3);
    if (draft.edge === 'move' || draft.edge === 'start') startMinutes += draft.delta;
    if (draft.edge === 'move' || draft.edge === 'end') endMinutes += draft.delta;
    if (startMinutes < 0 || endMinutes > 1440 || endMinutes <= startMinutes) {
      if (typeof toast === 'function') toast('第一版不支援跨日拖移，請調整回同一天');
      return;
    }
    state.suppressCardClick = true;
    setTimeout(function () { state.suppressCardClick = false; }, 400);
    openEditor(item.id);
    state.editor.pointerMode = draft.edge === 'move' ? 'drag' : 'resize';
    state.editor.pointerEdge = draft.edge;
    state.editor.start = String(Math.floor(startMinutes / 60)).padStart(2, '0') + ':' + String(startMinutes % 60).padStart(2, '0');
    state.editor.end = String(Math.floor(endMinutes / 60)).padStart(2, '0') + ':' + String(endMinutes % 60).padStart(2, '0');
    state.editor.durationMin = endMinutes - startMinutes;
    runPreview();
  }

  document.addEventListener('pointerup', function (event) { finishPointerDraft(event, false); });
  document.addEventListener('pointercancel', function (event) { finishPointerDraft(event, true); });

  document.addEventListener('keydown', function (event) {
    var card = event.target.closest && event.target.closest('.ff-cal-card-main[role="button"]');
    if (card && event.target === card && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      openOccurrenceDetail(card.dataset.eid);
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
        if (event.target.value < calendarAnchor() || event.target.value > addDays(calendarAnchor(), 2)) state.anchorDate = clampCalendarAnchor(event.target.value);
      } else if (event.target.matches('[data-ff-create-start]')) state.createDraft.start = event.target.value;
      else if (event.target.matches('[data-ff-create-end]')) state.createDraft.end = event.target.value;
      else state.createDraft.title = event.target.value || '新增行程';
      renderFineFlow();
      keepCreateDraftVisible(state.createDraft);
      return;
    }
    if (!state.editor) return;
    if (event.target.matches('[data-ff-start]')) {
      state.editor.start = event.target.value;
      state.editor.end = addMinutesToTime(state.editor.start, state.editor.durationMin);
      var endInput = sh.querySelector('[data-ff-end]');
      if (endInput) endInput.value = state.editor.end;
    } else if (event.target.matches('[data-ff-end]')) {
      state.editor.end = event.target.value;
      var item = findOccurrence(state.editor.id), date = dayDate(item.day), endDate = state.editor.end <= state.editor.start ? addDays(date, 1) : date;
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
    if (!state.editor) return;
    if (event.target.matches('[data-ff-target]')) state.editor.targetId = event.target.value;
    else if (event.target.matches('[data-ff-fixed]')) { state.editor.fixedMarker = event.target.checked; state.editor.rulesOpen = true; }
    else if (event.target.matches('[data-ff-compress]')) { state.editor.compressibility = event.target.value; state.editor.rulesOpen = true; }
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
    resetTransient: function () {
      state.createDraft = null;
      state.selectedId = null;
      state.editor = null;
      state.importPreview = null;
      if (uiStore) uiStore.dispatch({ type: 'CANCEL' });
      renderFineFlow();
    }
  };

  setTimeout(renderFineFlow, 0);
})();
