// fineflow-calendar.js — 細流多日行事曆的純 projection／版面邏輯。無 DOM、無儲存。
// 瀏覽器當全域 CNXFineFlowCalendar、Node 當模組。
(function (root) {
  'use strict';

  var DAY_MS = 86400000;
  var DEFAULT_COLOR = '#9b9b9b';
  var DEFAULT_OPTIONS = {
    dayStartMinute: 0,
    dayEndMinute: 1440,
    pixelsPerHour: 64,
    minimumCardHeight: 18,
    laneGapPercent: 1.5,
    titleOnlyMaxMinutes: 45,
    titleOnlyHeight: 40,
    mediumHeight: 48,
    largeHeight: 88
  };

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function finiteNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function mergeOptions(options) {
    var out = {};
    Object.keys(DEFAULT_OPTIONS).forEach(function (key) { out[key] = DEFAULT_OPTIONS[key]; });
    Object.keys(options || {}).forEach(function (key) { out[key] = options[key]; });
    out.dayStartMinute = finiteNumber(out.dayStartMinute, DEFAULT_OPTIONS.dayStartMinute);
    out.dayEndMinute = finiteNumber(out.dayEndMinute, DEFAULT_OPTIONS.dayEndMinute);
    if (out.dayEndMinute <= out.dayStartMinute) out.dayEndMinute = out.dayStartMinute + 1440;
    out.pixelsPerHour = Math.max(1, finiteNumber(out.pixelsPerHour, DEFAULT_OPTIONS.pixelsPerHour));
    out.minimumCardHeight = Math.max(1, finiteNumber(out.minimumCardHeight, DEFAULT_OPTIONS.minimumCardHeight));
    out.laneGapPercent = Math.max(0, finiteNumber(out.laneGapPercent, DEFAULT_OPTIONS.laneGapPercent));
    return out;
  }

  function parseDateKey(value) {
    var match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    var year = +match[1], month = +match[2], day = +match[3];
    var date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { year: year, month: month, day: day, epoch: date.getTime() };
  }

  function pad(value) { return String(value).padStart(2, '0'); }

  function addCalendarDays(dateKey, amount) {
    var parsed = parseDateKey(dateKey);
    if (!parsed) return null;
    var date = new Date(parsed.epoch + Math.round(finiteNumber(amount, 0)) * DAY_MS);
    return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
  }

  function buildThreeDayWindow(anchorDate) {
    return buildDateWindow(anchorDate, 3);
  }

  function buildDateWindow(anchorDate, dayCount) {
    var count = Math.floor(finiteNumber(dayCount, 0));
    if (!parseDateKey(anchorDate) || count < 1) return [];
    return Array.from({ length: count }, function (_, offset) { return addCalendarDays(anchorDate, offset); });
  }

  function parseIsoWallTime(value) {
    var match = typeof value === 'string' && value.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/
    );
    if (!match) return null;
    var dateKey = match[1] + '-' + match[2] + '-' + match[3];
    var date = parseDateKey(dateKey);
    var hour = +match[4], minute = +match[5], second = +(match[6] || 0);
    if (!date || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(Date.parse(value))) return null;
    return { date: dateKey, dateEpoch: date.epoch, hour: hour, minute: minute, second: second };
  }

  // 用 ISO 字串寫出的當地牆鐘時間定位，不受執行環境所在時區影響。
  function minutesFromDayStart(iso, dayDate) {
    var parsed = parseIsoWallTime(iso);
    var day = parseDateKey(dayDate);
    if (!parsed || !day) return null;
    return Math.round((parsed.dateEpoch - day.epoch) / DAY_MS) * 1440 + parsed.hour * 60 + parsed.minute + parsed.second / 60;
  }

  function timeToTop(minutes, options) {
    var config = mergeOptions(options);
    return (finiteNumber(minutes, config.dayStartMinute) - config.dayStartMinute) * config.pixelsPerHour / 60;
  }

  function intervalToGeometry(startAt, endAt, dayDate, options) {
    var config = mergeOptions(options);
    var startMinute = minutesFromDayStart(startAt, dayDate);
    var endMinute = minutesFromDayStart(endAt, dayDate);
    if (startMinute == null || endMinute == null || !(endMinute > startMinute)) return null;

    var visibleStart = Math.max(config.dayStartMinute, startMinute);
    var visibleEnd = Math.min(config.dayEndMinute, endMinute);
    if (!(visibleEnd > visibleStart)) return null;
    var rawHeight = (visibleEnd - visibleStart) * config.pixelsPerHour / 60;
    return {
      startMinute: startMinute,
      endMinute: endMinute,
      visibleStartMinute: visibleStart,
      visibleEndMinute: visibleEnd,
      top: timeToTop(visibleStart, config),
      height: Math.max(config.minimumCardHeight, rawHeight),
      rawHeight: rawHeight,
      durationMinutes: endMinute - startMinute,
      clippedStart: startMinute < config.dayStartMinute,
      clippedEnd: endMinute > config.dayEndMinute,
      crossesDay: parseIsoWallTime(startAt).date !== parseIsoWallTime(endAt).date
    };
  }

  function compareIntervals(a, b) {
    if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute;
    if (a.endMinute !== b.endMinute) return a.endMinute - b.endMinute;
    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  // 採最左可用 lane；同一連通重疊群組共用 laneCount，卡片不會完全蓋住彼此。
  function assignOverlapLanes(cards, options) {
    var config = mergeOptions(options);
    var sorted = (cards || []).map(function (card) { return clone(card); }).sort(compareIntervals);
    var groups = [];
    var group = [];
    var groupEnd = -Infinity;

    sorted.forEach(function (card) {
      if (group.length && card.startMinute >= groupEnd) {
        groups.push(group);
        group = [];
        groupEnd = -Infinity;
      }
      group.push(card);
      groupEnd = Math.max(groupEnd, card.endMinute);
    });
    if (group.length) groups.push(group);

    var laidOut = [];
    groups.forEach(function (items, groupIndex) {
      var laneEnds = [];
      items.forEach(function (card) {
        var lane = 0;
        while (lane < laneEnds.length && laneEnds[lane] > card.startMinute) lane += 1;
        if (lane === laneEnds.length) laneEnds.push(card.endMinute);
        else laneEnds[lane] = card.endMinute;
        card.lane = lane;
      });
      var laneCount = Math.max(1, laneEnds.length);
      var totalGap = config.laneGapPercent * (laneCount - 1);
      var width = Math.max(0, (100 - totalGap) / laneCount);
      items.forEach(function (card) {
        card.group = groupIndex;
        card.laneCount = laneCount;
        card.leftPercent = card.lane * (width + config.laneGapPercent);
        card.widthPercent = width;
        laidOut.push(card);
      });
    });
    return laidOut.sort(compareIntervals);
  }

  function cardDensity(height, options, durationMinutes) {
    var config = mergeOptions(options);
    var value = Math.max(0, finiteNumber(height, 0));
    var duration = finiteNumber(durationMinutes, null);
    if ((duration != null && duration <= config.titleOnlyMaxMinutes) || value < config.titleOnlyHeight) return 'small';
    if (value >= config.largeHeight) return 'large';
    if (value >= config.mediumHeight) return 'medium';
    return 'small';
  }

  function parseHexColor(value) {
    var text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    var match = text.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
    if (!match) return null;
    var hex = match[1];
    if (hex.length === 3 || hex.length === 4) hex = hex.slice(0, 3).split('').map(function (x) { return x + x; }).join('');
    else hex = hex.slice(0, 6);
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }

  function toHex(color) {
    return '#' + [color.r, color.g, color.b].map(function (channel) {
      return pad(Math.max(0, Math.min(255, Math.round(channel))).toString(16));
    }).join('');
  }

  function mix(first, second, weightOfSecond) {
    return {
      r: first.r * (1 - weightOfSecond) + second.r * weightOfSecond,
      g: first.g * (1 - weightOfSecond) + second.g * weightOfSecond,
      b: first.b * (1 - weightOfSecond) + second.b * weightOfSecond
    };
  }

  function relativeLuminance(color) {
    function linear(channel) {
      var value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
  }

  function contrastRatio(first, second) {
    var light = Math.max(relativeLuminance(first), relativeLuminance(second));
    var dark = Math.min(relativeLuminance(first), relativeLuminance(second));
    return (light + 0.05) / (dark + 0.05);
  }

  function deriveCategoryPalette(color) {
    var source = parseHexColor(color) || parseHexColor(DEFAULT_COLOR);
    var white = { r: 255, g: 255, b: 255 };
    var black = { r: 0, g: 0, b: 0 };
    var background = mix(source, white, 0.88);
    var border = mix(source, white, 0.58);
    var text = source;
    for (var step = 0; step <= 10 && contrastRatio(text, background) < 4.5; step++) {
      text = mix(source, black, (step + 1) / 10);
    }
    if (contrastRatio(text, background) < 4.5) text = { r: 32, g: 33, b: 36 };
    return {
      source: toHex(source),
      background: toHex(background),
      border: toHex(border),
      text: toHex(text),
      contrast: Math.round(contrastRatio(text, background) * 100) / 100,
      usedFallback: !parseHexColor(color)
    };
  }

  function asLookup(values) {
    if (!values) return {};
    if (!Array.isArray(values)) return values;
    var out = {};
    values.forEach(function (item) { if (item && item.id != null) out[item.id] = item; });
    return out;
  }

  function categoryColor(trip, key) {
    var categories = trip && Array.isArray(trip.categories) ? trip.categories : [];
    var found = categories.find(function (item) { return item && item.key === key; });
    return found && found.color || DEFAULT_COLOR;
  }

  function categoryIcon(trip, key) {
    var categories = trip && Array.isArray(trip.categories) ? trip.categories : [];
    var found = categories.find(function (item) { return item && item.key === key; });
    return found && typeof found.icon === 'string' && found.icon ? found.icon : '📍';
  }

  function todoSummary(todos) {
    var list = Array.isArray(todos) ? todos.map(function (todo) { return clone(todo); }) : [];
    var completed = list.filter(function (todo) { return todo && todo.done === true; }).length;
    var firstIncomplete = list.find(function (todo) { return todo && todo.done !== true; }) || null;
    return {
      items: list,
      total: list.length,
      completed: completed,
      remaining: list.length - completed,
      firstIncomplete: clone(firstIncomplete)
    };
  }

  function cardContent(occurrence, places, trip) {
    var place = occurrence && occurrence.placeId ? places[occurrence.placeId] || null : null;
    var isCustom = occurrence && occurrence.custom && occurrence.custom.title;
    var title = place && place.name || (isCustom ? occurrence.custom.title : '資料缺漏');
    var categoryKey = place && place.type || occurrence && occurrence.category || '其他';
    var color = categoryColor(trip, categoryKey);
    return {
      title: title,
      hasLongTitle: String(title).length > 20,
      place: clone(place),
      missingPlace: !!(occurrence && occurrence.placeId && !place),
      categoryKey: categoryKey,
      categoryIcon: categoryIcon(trip, categoryKey),
      categoryColor: color,
      palette: deriveCategoryPalette(color),
      mapsUrl: place && typeof place.mapsUrl === 'string' ? place.mapsUrl : '',
      note: occurrence && typeof occurrence.notes === 'string' && occurrence.notes ? occurrence.notes : place && typeof place.note === 'string' ? place.note : '',
      todos: todoSummary(occurrence && occurrence.todos)
    };
  }

  function formatTime(iso) {
    var parsed = parseIsoWallTime(iso);
    return parsed ? pad(parsed.hour) + ':' + pad(parsed.minute) : '';
  }

  function projectUnscheduled(occurrence, places, trip) {
    var copy = clone(occurrence || {});
    var content = cardContent(copy, places, trip);
    return Object.assign({
      id: copy.id || '',
      occurrence: copy,
      scheduled: false,
      density: 'small'
    }, content);
  }

  function projectDaySchedule(schedule, dayDate, options) {
    var config = mergeOptions(options);
    var source = schedule || {};
    var places = asLookup(options && options.places);
    var trip = options && options.trip || {};
    var timed = Array.isArray(source) ? source : source.items || source.precise || [];
    var unscheduled = Array.isArray(source) ? [] : source.unscheduled || source.unplanned || [];
    var cards = [];

    timed.forEach(function (raw) {
      var occurrence = clone(raw && raw.occurrence || raw);
      if (!occurrence || !occurrence.fine) return;
      var geometry = intervalToGeometry(occurrence.fine.startAt, occurrence.fine.endAt, dayDate, config);
      if (!geometry) return;
      var content = cardContent(occurrence, places, trip);
      cards.push(Object.assign({
        id: occurrence.id || '',
        occurrence: occurrence,
        scheduled: true,
        day: source.day || occurrence.day || null,
        dayDate: dayDate,
        startAt: occurrence.fine.startAt,
        endAt: occurrence.fine.endAt,
        startLabel: formatTime(occurrence.fine.startAt),
        endLabel: formatTime(occurrence.fine.endAt),
        density: cardDensity(geometry.rawHeight, config, geometry.durationMinutes)
      }, geometry, content));
    });

    cards = assignOverlapLanes(cards, config);
    return {
      day: source.day || null,
      date: dayDate,
      timeZone: source.timeZone || trip.timeZone || 'Asia/Bangkok',
      height: (config.dayEndMinute - config.dayStartMinute) * config.pixelsPerHour / 60,
      cards: cards,
      unscheduled: unscheduled.map(function (item) { return projectUnscheduled(item, places, trip); }),
      unscheduledCount: unscheduled.length
    };
  }

  function projectThreeDaySchedules(anchorDate, schedules, options) {
    return projectDateSchedules(anchorDate, schedules, 3, options);
  }

  function projectDateSchedules(anchorDate, schedules, dayCount, options) {
    var dates = buildDateWindow(anchorDate, dayCount);
    var source = schedules || [];
    var list = Array.isArray(source) ? source : [];
    return {
      anchorDate: anchorDate,
      dates: dates,
      days: dates.map(function (date, index) {
        var schedule = Array.isArray(source) ? list[index] : source[date];
        return projectDaySchedule(schedule || { day: date, items: [], unscheduled: [] }, date, options || {});
      }),
      unscheduledCount: dates.reduce(function (total, date, index) {
        var schedule = Array.isArray(source) ? list[index] : source[date];
        var untimed = schedule && (schedule.unscheduled || schedule.unplanned);
        return total + (Array.isArray(untimed) ? untimed.length : 0);
      }, 0)
    };
  }

  var api = {
    addCalendarDays: addCalendarDays,
    buildDateWindow: buildDateWindow,
    buildThreeDayWindow: buildThreeDayWindow,
    minutesFromDayStart: minutesFromDayStart,
    timeToTop: timeToTop,
    intervalToGeometry: intervalToGeometry,
    assignOverlapLanes: assignOverlapLanes,
    cardDensity: cardDensity,
    contrastRatio: contrastRatio,
    deriveCategoryPalette: deriveCategoryPalette,
    projectDaySchedule: projectDaySchedule,
    projectDateSchedules: projectDateSchedules,
    projectThreeDaySchedules: projectThreeDaySchedules
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CNXFineFlowCalendar = api;
})(typeof self !== 'undefined' ? self : this);
