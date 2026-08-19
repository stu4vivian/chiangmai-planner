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
    armedId: null,          // 手機「長按解鎖」的那一張卡：只有它會長出上下把手（selectedId＝選取，語意不同）
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

  // ── 橫向滑動時間選擇器 ─────────────────────────────────────────────────
  // 為什麼不是 <input type="time">：手機上要點到分鐘、一分一分轉，且會叫出系統滾輪。
  // 這裡改成「時／分兩條橫軌 + 中央窗口 + 原生 scroll-snap」，分鐘以 TIME_STEP 為單位。
  //
  // 兩條鐵則（別破壞）：
  //  1. 元件不持有自身狀態。畫面 100% 由 state.editor / state.createDraft 推導——openSheet 每次都
  //     整段 innerHTML 重建，元件自己記的東西都會被清掉。所有暫存旗標一律寫在 dataset 上。
  //  2. 滑動途中絕不寫資料。改時間會排 runPreview（100ms）→ renderEditor → openSheet 全量重建；
  //     若在手指還沒離開時提交，DOM 會被抽換 → 手勢中斷、位置亂跳。只有落定（scrollend／120ms）才提交。
  //
  // 相容層：每個選擇器內留一個 <input type="hidden" data-ff-…>，沿用原本的屬性名。
  // 既有的 document 委派（改開始→平移結束→重算 coarseSlot→排 preview）與建立流程讀值全部不用改。
  // type="hidden" 不可聚焦 → iOS 不會放大、也不會叫出系統滾輪。
  // 注意：hidden input 改 .value 不會自動觸發 input，必須先寫 value 再手動 dispatch。
  var TIME_STEP = 5;
  var TIME_MINUTE_COUNT = 60 / TIME_STEP;
  var timePickFocusMemo = null;   // 鍵盤操作後浮層會重建、焦點會掉；記住最後一次按鍵的軌道，重建後補回

  function padTwo(value) { return String(value).padStart(2, '0'); }

  function timePickIndexes(value) {
    var text = /^\d{1,2}:\d{2}$/.test(value || '') ? value : '09:00';
    return {
      hour: clamp(+text.slice(0, 2) || 0, 0, 23),
      // 非 TIME_STEP 倍數的舊資料（例如 09:07）只決定「軌道停在哪一格」，不會回寫 data-value
      minute: clamp(Math.round(+text.slice(3, 5) / TIME_STEP), 0, TIME_MINUTE_COUNT - 1)
    };
  }

  function timePickRail(el, unit) { return el.querySelector('.ff-timepick-rail[data-unit="' + unit + '"]'); }
  function timePickItems(rail) { return (rail && rail.firstElementChild && rail.firstElementChild.children) || []; }

  // 直式滾輪（iOS 行事曆模式）：量的是每一格的「高度」，捲的是 scrollTop。
  function timePickItemWidth(rail) {
    var first = timePickItems(rail)[0];
    if (!first) return 0;
    return first.offsetHeight || (first.getBoundingClientRect && first.getBoundingClientRect().height) || 0;
  }

  // aria-selected 是這個元件唯一的「目前選到哪格」真相：捲動時由 scrollTop 換算後寫進去，提交時再讀回來。
  function timePickSelected(rail) {
    var items = timePickItems(rail);
    for (var i = 0; i < items.length; i++) if (items[i].getAttribute('aria-selected') === 'true') return i;
    return 0;
  }

  function timePickMark(rail, index) {
    var items = timePickItems(rail);
    for (var i = 0; i < items.length; i++) items[i].setAttribute('aria-selected', i === index ? 'true' : 'false');
  }

  function timePickCurrent(el) {
    var hourRail = timePickRail(el, 'hour'), minuteRail = timePickRail(el, 'minute');
    if (!hourRail || !minuteRail) return '';
    return padTwo(timePickSelected(hourRail)) + ':' + padTwo(timePickSelected(minuteRail) * TIME_STEP);
  }

  function timePickReadout(el, text) {
    var readout = el.querySelector('[data-tp-readout]');
    if (readout) readout.textContent = text;
  }

  // 純視覺定位：把兩條軌推到 value 對應的格子。不寫 state、不發事件。
  // 回傳 false ＝此刻量不到格寬（浮層還沒 layout），呼叫端用 rAF 再試一次。
  function timePickPlace(el, value) {
    var indexes = timePickIndexes(value), placed = true;
    [['hour', indexes.hour], ['minute', indexes.minute]].forEach(function (pair) {
      var rail = timePickRail(el, pair[0]);
      if (!rail) { placed = false; return; }
      timePickMark(rail, pair[1]);
      var width = timePickItemWidth(rail);
      if (width > 0) rail.scrollTop = pair[1] * width; else placed = false;
    });
    el.dataset.tpQuiet = String(Date.now() + 200);   // 程式化捲動會回彈出額外 scroll 事件，靜音一小段避免自我提交迴圈
    timePickReadout(el, value);
    return placed;
  }

  function renderTimePicker(attr, value, label) {
    var indexes = timePickIndexes(value), hours = '', minutes = '', i;
    for (i = 0; i < 24; i++) hours += '<button type="button" role="option" tabindex="-1" data-index="' + i + '" aria-selected="' + (i === indexes.hour) + '">' + padTwo(i) + '</button>';
    for (i = 0; i < TIME_MINUTE_COUNT; i++) minutes += '<button type="button" role="option" tabindex="-1" data-index="' + i + '" aria-selected="' + (i === indexes.minute) + '">' + padTwo(i * TIME_STEP) + '</button>';
    // hidden input 不再住在元件裡：時間格收合時滾輪不 render，但 hidden input 要一直在（相容層＋測試）。
    return '<div class="ff-timepick" data-ff-timepick="' + h(attr) + '" data-value="' + h(value) + '">' +
      '<div class="ff-timepick-rails">' +
        '<div class="ff-timepick-window" aria-hidden="true"></div>' +
        '<div class="ff-timepick-rail" data-unit="hour" tabindex="0" role="listbox" aria-label="' + h(label) + '小時"><div class="ff-timepick-track">' + hours + '</div></div>' +
        '<div class="ff-timepick-rail" data-unit="minute" tabindex="0" role="listbox" aria-label="' + h(label) + '分鐘"><div class="ff-timepick-track">' + minutes + '</div></div>' +
      '</div></div>';
  }

  // 外部（例如「改開始時間→結束等量平移」）要更新畫面時走這裡：只改視覺與 hidden input，不再 dispatch。
  function timePickInput(el) {
    var attr = el && el.dataset && el.dataset.ffTimepick;
    if (!attr) return null;
    var root = (typeof sh !== 'undefined' && sh) || (typeof document !== 'undefined' ? document : null);
    return root && root.querySelector ? root.querySelector('[' + attr + ']') : null;
  }

  function syncTimePicker(el, value) {
    if (!el || el.dataset.tpTouch === 'true') return;   // 使用者手指還在上面就別動它
    el.dataset.value = value;
    var input = timePickInput(el);
    if (input) input.value = value;
    timePickPlace(el, value);
  }

  function bindTimePicker(el) {
    var settleTimer = null;

    function commit() {
      var value = timePickCurrent(el);
      if (!value || value === el.dataset.value) return;   // 防迴圈護欄：值沒變就不發事件（iOS snap 回彈會多打 scroll）
      el.dataset.value = value;
      var input = timePickInput(el);
      if (!input) return;
      input.value = value;                                              // 順序不可反：先寫 value
      input.dispatchEvent(new Event('input', { bubbles: true }));       // 再 dispatch（hidden input 不會自己發）
    }

    function repaint() {
      ['hour', 'minute'].forEach(function (unit) {
        var rail = timePickRail(el, unit);
        var width = rail && timePickItemWidth(rail);
        if (!(width > 0)) return;
        timePickMark(rail, clamp(Math.round(rail.scrollTop / width), 0, timePickItems(rail).length - 1));
      });
      timePickReadout(el, timePickCurrent(el) || el.dataset.value);
    }

    function onScroll() {
      if (el.dataset.tpTouch !== 'true' && +el.dataset.tpQuiet > Date.now()) return;
      repaint();                                        // 滑動中只更新視覺
      clearTimeout(settleTimer);
      settleTimer = setTimeout(commit, 120);            // 落定才提交（scrollend 沒有時的保險）
    }

    function moveTo(rail, index, smooth) {
      timePickMark(rail, index);
      var width = timePickItemWidth(rail);
      el.dataset.tpQuiet = String(Date.now() + (smooth ? 400 : 200));
      if (width > 0) {
        if (smooth) rail.style.scrollBehavior = 'smooth';
        rail.scrollTop = index * width;
        if (smooth) setTimeout(function () { rail.style.scrollBehavior = 'auto'; }, 280);
      }
      timePickReadout(el, timePickCurrent(el));
      clearTimeout(settleTimer);
      commit();
    }

    ['hour', 'minute'].forEach(function (unit) {
      var rail = timePickRail(el, unit);
      if (!rail) return;
      rail.addEventListener('scroll', onScroll, { passive: true });
      if (typeof window !== 'undefined' && 'onscrollend' in window) rail.addEventListener('scrollend', function () { clearTimeout(settleTimer); repaint(); commit(); });
      rail.addEventListener('keydown', function (event) {
        var max = timePickItems(rail).length - 1, index = timePickSelected(rail), next;
        if (event.key === 'ArrowUp') next = index - 1;
        else if (event.key === 'ArrowDown') next = index + 1;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = max;
        else return;
        event.preventDefault();
        timePickFocusMemo = { attr: el.dataset.ffTimepick, unit: unit, at: Date.now() };
        moveTo(rail, clamp(next, 0, max), false);
      });
    });

    el.addEventListener('click', function (event) {
      var button = event.target && event.target.closest && event.target.closest('.ff-timepick-track > button');
      if (!button) return;
      var rail = button.parentElement.parentElement;
      moveTo(rail, +button.dataset.index || 0, true);
    });
    ['pointerdown', 'touchstart'].forEach(function (type) {
      el.addEventListener(type, function () { el.dataset.tpTouch = 'true'; el.dataset.tpQuiet = '0'; }, { passive: true });
    });
    ['pointerup', 'pointercancel', 'touchend', 'touchcancel'].forEach(function (type) {
      el.addEventListener(type, function () { el.dataset.tpTouch = 'false'; }, { passive: true });
    });
  }

  // 每次 sheet 重建後都要跑（innerHTML 會把 listener 全清掉）；由 openSheet 統一 hook，不必在各呼叫點補。
  function initTimePickers(root) {
    if (!root || !root.querySelectorAll) return;
    // 焦點記憶不「用完就丟」：一次操作可能連續重繪兩次（renderEditor + runPreview 結尾又一次），
    // 只消耗一次的話第二次重繪照樣把焦點弄丟 → 連按兩下方向鍵的第二下會落空。改成靠 900ms 到期。
    var memo = timePickFocusMemo && Date.now() - timePickFocusMemo.at < 900 ? timePickFocusMemo : null;
    if (!memo) timePickFocusMemo = null;
    Array.prototype.forEach.call(root.querySelectorAll('.ff-timepick'), function (el) {
      if (el.dataset.tpReady === 'true') return;
      el.dataset.tpReady = 'true';
      bindTimePicker(el);
      if (!timePickPlace(el, el.dataset.value) && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () { if (el.dataset.tpTouch !== 'true') timePickPlace(el, el.dataset.value); });
      }
      // 只在焦點確實被重建弄丟時才補回，避免搶走使用者已經移到別處的焦點。
      var focusLost = !document.activeElement || document.activeElement === document.body;
      if (memo && focusLost && memo.attr === el.dataset.ffTimepick) {
        var rail = timePickRail(el, memo.unit);
        if (rail && rail.focus) rail.focus();
      }
    });
  }

  function timeSpanNote(minutes) {
    var total = Math.round(+minutes || 0);
    if (total <= 0) return '時長 —';
    if (total < 60) return '時長 ' + total + ' 分';
    var hours = Math.floor(total / 60), rest = total % 60;
    return '時長 ' + hours + ' 小時' + (rest ? ' ' + rest + ' 分' : '');
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
    return kindLabel(item.scheduleKind);
  }

  function kindLabel(kind) {
    return ({ place: '地點', custom: '自訂', sleep: '休息' })[kind] || '行程';
  }

  function kindIcon(kind) {
    return ({ place: '●', custom: '◆', sleep: '◐' })[kind] || '●';
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

  // 營業時間提醒：只有引用地點卡、且卡上真的有營業時間資料時才講；自訂行程與交通不講。
  function hoursWarningsFor(item, place) {
    var occurrence = occurrenceOf(item) || {};
    if (!occurrence.placeId || !occurrence.fine) return [];
    var card = place || (typeof getPlace === 'function' ? getPlace(occurrence.placeId) : null);
    if (!card || typeof CNXCore === 'undefined' || typeof CNXCore.hoursWarnings !== 'function') return [];
    return CNXCore.hoursWarnings(card, occurrence.fine.startAt, occurrence.fine.endAt);
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
    return { schedule: schedule, precise: precise, unplanned: unplanned };
  }

  function dayMeta(dayId) {
    var days = typeof DAYS !== 'undefined' && Array.isArray(DAYS) ? DAYS : [];
    return days.find(function (day) { return day.id === dayId; }) || { id: dayId, label: dayId, wd: '' };
  }

  // ── 三日行事曆 DOM contract ──────────────────────────────────────
  // .ff-calendar > .ff-cal-toolbar + .ff-cal-date-row + .ff-cal-scroll + .ff-cal-fab
  // .ff-cal-scroll > .ff-cal-time-gutter + .ff-cal-days > .ff-cal-day
  // .ff-cal-day > .ff-cal-slot（空白命中層）+ .ff-cal-card（絕對定位）
  // 卡片狀態：.density-{small|medium|large}、.is-hours-warning、.is-selected、.is-preview
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

  // ── 凌晨收合（Vivian 2026-08-20：「凌晨兩點到早上七點根本不會用到」）──
  // 02:00–07:00 這 5 小時（手機 240px、桌機 300px）壓成一條 22px 的細帶，點一下展開。
  // 做法是「畫面 px ↔ 真實 px」的單調可逆轉換：所有 top/height 都經過 calPx()，
  // 指標換算（拖曳／新增）走 calPxInverse()，這樣拖拉行為完全不用改。
  var DAWN_FROM = 120, DAWN_TO = 420, DAWN_STRIP = 22;
  function dawnCollapsed() { return !state.dawnOpen && !state.dawnHasCards; }
  function dawnBandStart() { return DAWN_FROM * calendarPixelsPerHour() / 60; }
  function dawnBandEnd() { return DAWN_TO * calendarPixelsPerHour() / 60; }
  function calPx(px) {
    if (!dawnCollapsed()) return px;
    var a = dawnBandStart(), b = dawnBandEnd();
    if (px <= a) return px;
    if (px >= b) return px - (b - a) + DAWN_STRIP;
    return a + DAWN_STRIP * (px - a) / (b - a);
  }
  function calPxInverse(px) {
    if (!dawnCollapsed()) return px;
    var a = dawnBandStart(), b = dawnBandEnd();
    if (px <= a) return px;
    if (px >= a + DAWN_STRIP) return px + (b - a) - DAWN_STRIP;
    return a + (px - a) * (b - a) / DAWN_STRIP;
  }
  function calendarHeightPx() { return calPx(calendarPixelsPerHour() * 24); }

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

  function buildCalendarModel() {
    var api = calendarApi();
    if (typeof api.projectDateSchedules !== 'function') throw new Error('多日行事曆模組尚未載入');
    var version = activeVersion();
    if (!version) throw new Error('找不到目前使用的行程版本');
    if (state.lastVersionId && state.lastVersionId !== version.id) {
      state.createDraft = null;
      state.selectedId = null;
      state.armedId = null;
      state.editor = null;
      state.importPreview = null;
      clearTimeout(previewTimer);
      if (pointerDraft) removePointerVisuals(pointerDraft);
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
      return { day: dayId, date: date, items: parts.precise, unscheduled: parts.unplanned };
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
      if (dawnCollapsed() && hour * 60 >= DAWN_FROM && hour * 60 < DAWN_TO) {
        if (hour * 60 === DAWN_FROM) html += '<span class="ff-cal-dawn-gap" style="height:' + DAWN_STRIP + 'px"></span>';
        continue;
      }
      var period = hour < 12 ? '上午' : '下午';
      html += '<span class="ff-cal-time" style="--ff-hour:' + hour + '">' + period + ' ' + (hour % 12 || 12) + ':00</span>';
    }
    return html + '</div>';
  }

  function renderSlots(day) {
    var html = '';
    for (var minute = 0; minute < 1440; minute += 30) {
      if (dawnCollapsed() && minute >= DAWN_FROM && minute < DAWN_TO) {
        if (minute === DAWN_FROM) html += '<span class="ff-cal-dawn-gap" style="height:' + DAWN_STRIP + 'px"></span>';
        continue;
      }
      var time = String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
      html += '<button type="button" class="ff-cal-slot" data-action="ff-create-at" data-day="' + h(day.dayId) + '" data-date="' + h(day.date) + '" data-time="' + time + '" style="--ff-minute:' + minute + '" aria-label="' + h(day.date + ' ' + time + ' 新增行程') + '"></button>';
    }
    return html;
  }

  function renderCalendarCard(card, day) {
    var todos = card.todos || { total: 0, completed: 0, firstIncomplete: null };
    var selected = state.selectedId === card.id;
    var warnings = hoursWarningsFor(card.occurrence, card.place);
    var warningText = warnings.join('・');
    var map = safeMapsUrl(card.mapsUrl);
    var note = card.rawHeight >= 60 && card.note ? '<span class="ff-cal-card-note">' + h(card.note) + '</span>' : '';
    var todo = card.density === 'large' && todos.firstIncomplete ? '<span class="ff-cal-card-todo-summary"><span class="ff-cal-check" aria-hidden="true"></span><span>' + h(todos.firstIncomplete.text) + '</span></span>' : '';
    // 把手輸出規則（Vivian：「不畫那些輔助標誌但可以使用」）：
    // 桌機照舊全出（靠 hover 顯示）；手機平常一個都不畫，只有長按解鎖的那張卡（is-armed）長出上下兩個把手。
    var armed = state.armedId === card.id;
    var resizeHandles =
      '<button type="button" class="ff-cal-resize ff-cal-resize-start" data-action="ff-resize-start" data-eid="' + h(card.id) + '" aria-label="調整開始時間"></button>' +
      '<button type="button" class="ff-cal-resize ff-cal-resize-end" data-action="ff-resize-end" data-eid="' + h(card.id) + '" aria-label="調整結束時間"></button>';
    var cardControls = calendarIsDesktop() ?
      '<button type="button" class="ff-cal-drag-handle" data-action="ff-drag-card" data-eid="' + h(card.id) + '" aria-label="拖動調整時間"></button>' + resizeHandles :
      (armed ? resizeHandles : '');
    var classes = ['ff-cal-card', 'density-' + card.density];
    if (card.laneCount > 1) classes.push('is-crowded');   // 並排＝寬度砍半，CSS 只留店名（時間靠時間軸位置讀）
    if (warningText) classes.push('is-hours-warning');
    if (selected) classes.push('is-selected');
    if (armed) classes.push('is-armed');
    var left = 1.5 + card.leftPercent * 0.92;
    var width = card.widthPercent * 0.92;
    // 卡片上下各縮 1px：時段前後緊接的行程原本高度剛好頂滿，貼在一起很醜，留一條細縫分開（Vivian 2026-08-19）。
    var visualTop = calPx(card.top) + 1, visualHeight = Math.max(calPx(card.top + card.height) - calPx(card.top) - 2, 10);
    return '<article class="' + classes.join(' ') + '" data-eid="' + h(card.id) + '" style="--ff-top:' + visualTop + 'px;--ff-height:' + visualHeight + 'px;--ff-left:' + left + '%;--ff-width:' + width + '%;--ff-card-bg:' + h(card.palette.background) + ';--ff-card-border:' + h(card.palette.border) + ';--ff-card-text:' + h(card.palette.text) + ';top:' + visualTop + 'px;height:' + visualHeight + 'px;left:' + left + '%;width:' + width + '%;background:' + h(card.palette.background) + ';border-color:' + h(card.palette.border) + ';color:' + h(card.palette.text) + '">' +
      '<div class="ff-cal-card-main" role="button" tabindex="0" data-action="ff-card-detail" data-eid="' + h(card.id) + '" data-ff-drag="card" aria-label="查看 ' + h(card.title) + '">' +
        '<strong class="ff-cal-card-title"><span class="ff-cal-type-icon" aria-hidden="true">' + h(card.categoryIcon || '📍') + '</span>' + h(card.title) + '</strong>' +
        '<span class="ff-cal-card-time">' + h(card.startLabel + '–' + card.endLabel) + '</span>' +
        (warningText ? '<span class="ff-cal-card-hours">' + h(warningText) + '</span>' : '') + note + todo +
      '</div>' +
      // 放卡片右上角、main 外面（不吃 main 的點擊委派，點了才不會同時打開編輯浮層）：
      // 上面通常只有標題，比下面永遠有備註/待辦的空間寬鬆，不用另外留白也不會疊字（Vivian 2026-08-19）。
      (map ? '<a class="ff-cal-card-map-link" href="' + h(map) + '" target="_blank" rel="noopener noreferrer" aria-label="在 Google Maps 開啟' + h(card.title) + '">📍</a>' : '') +
      cardControls +
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
    var top = calPx(start * pixelsPerHour / 60);
    var height = Math.max(20, calPx(end * pixelsPerHour / 60) - top);
    return '<article class="ff-cal-card density-medium is-preview" data-draft="true" style="--ff-top:' + top + 'px;--ff-height:' + height + 'px;--ff-left:1.5%;--ff-width:92%;--ff-card-bg:#e8f0fe;--ff-card-border:#5b8def;--ff-card-text:#174ea6;top:' + top + 'px;height:' + height + 'px;left:1.5%;width:92%;background:#e8f0fe;border-color:#5b8def;color:#174ea6"><div class="ff-cal-card-main" aria-hidden="true"><strong class="ff-cal-card-title"><span class="ff-cal-type-icon">📍</span>' + h(draft.title || '新增行程') + '</strong><span class="ff-cal-card-time">' + h(draft.start + '–' + endText) + '</span></div></article>';
  }

  // 凌晨那段真的有卡就不收（不然卡片會被壓進 22px 裡看不到）。
  function calendarDawnHasCards(model) {
    var pixelsPerHour = model.pixelsPerHour || calendarPixelsPerHour();
    return model.days.some(function (day) {
      return (day.cards || []).some(function (card) {
        var startMinute = card.top * 60 / pixelsPerHour;
        var endMinute = (card.top + card.height) * 60 / pixelsPerHour;
        return endMinute > DAWN_FROM && startMinute < DAWN_TO;
      });
    });
  }

  function renderCalendarPage(model) {
    state.dawnHasCards = calendarDawnHasCards(model);
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
    // 「尚未排時間」整條 bar 退役（Vivian 2026-08-20：手機版位很小）——未排項目改併進待辦清單那個浮層。
    var unplanned = hiddenUnscheduled;
    var openTodoCount = activePlan().reduce(function (total, item) {
      return total + (item.todos || []).filter(function (todo) { return todo && todo.done !== true; }).length;
    }, 0);
    var todoButton = '<button type="button" class="ff-cal-todo-btn" data-action="ff-todos" aria-label="待辦與尚未排時間">☑<b>' + (openTodoCount + model.unscheduledCount) + '</b></button>';
    var empty = '<p class="ff-cal-empty"' + (model.days.every(function (day) { return !day.cards.length; }) ? '' : ' hidden') + '>點空白時段，或按右下角＋開始排細流</p>';
    var choices = model.mobile ? [1, 2, 3] : [5, 7];
    var dawnStrip = '<button type="button" class="ff-cal-dawn-strip' + (dawnCollapsed() ? '' : ' is-open') + '" data-action="ff-dawn-toggle" style="top:' + dawnBandStart() + 'px;height:' + DAWN_STRIP + 'px"><span>凌晨 02:00–07:00</span><b>' + (dawnCollapsed() ? '展開' : '收起') + '</b></button>';
    var switcher = '<div class="ff-cal-view-switch" aria-label="顯示天數">' + choices.map(function (choice) { return '<button type="button" data-action="ff-calendar-count" data-count="' + choice + '" aria-pressed="' + (choice === model.visibleDayCount) + '">' + choice + (model.mobile && choice === 3 ? ' 日' : '') + '</button>'; }).join('') + '</div>';
    var stepLabel = model.mobile ? '一天' : model.visibleDayCount + '天';
    return '<div class="ff-calendar" data-version="' + h(model.versionId) + '" data-mobile="' + model.mobile + '" data-anchor-index="' + model.anchorIndex + '" style="--ff-cal-columns:' + model.visibleDayCount + ';--ff-cal-track-columns:' + model.trackDayCount + ';--ff-cal-hour:' + model.pixelsPerHour + 'px;--ff-cal-height:' + calendarHeightPx() + 'px;--ff-track-offset:' + model.trackOffset + '%">' +
      '<div class="ff-cal-toolbar"><button type="button" class="ff-cal-nav" data-action="ff-prev-days" aria-label="往前' + stepLabel + '">‹</button>' + switcher + todoButton + '<button type="button" class="ff-cal-nav" data-action="ff-next-days" aria-label="往後' + stepLabel + '">›</button></div>' +
      unplanned + '<div class="ff-cal-date-row"><span class="ff-cal-date-spacer"></span><div class="ff-cal-date-viewport"><div class="ff-cal-date-track">' + dates + '</div></div></div>' +
      '<div class="ff-cal-scroll">' + renderTimeGutter() + '<div class="ff-cal-days-viewport"><div class="ff-cal-days">' + days + '</div></div>' + dawnStrip + empty + '</div>' +
      '<button type="button" class="ff-cal-fab" data-action="ff-add-source" aria-label="新增行程">＋</button>' +
    '</div>';
  }

  // 進頁捲到「畫面上第一張卡的前 30 分」。原本寫死 8.5 小時＝08:30，比 07:30 出門的日子還晚，第一筆看不到。
  function calendarFirstCardScrollTop(scroll) {
    var pixelsPerHour = calendarPixelsPerHour();
    // 讀 inline 的 top（render 時就寫死了），不用 offsetTop——這支常在版面還沒排出來時跑，offsetTop 會全是 0。
    var tops = [].map.call(scroll.querySelectorAll('.ff-cal-card'), function (card) { return parseFloat(card.style.top) || 0; })
      .filter(function (top) { return top > 0; });
    if (!tops.length) return calPx(8.5 * pixelsPerHour);
    return Math.max(0, Math.min.apply(null, tops) - pixelsPerHour / 2);
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
      // 順序不能反過來：細流常在分頁還藏著的時候先 render 一次，那次寫 scrollTop 不會生效（元素沒排版）。
      // 舊碼在那一次就把 calendarInitialScroll 記成 done，等她真的切過來時只還原到 0＝永遠從半夜開始。
      if (nextScroll && !state.calendarInitialScroll) {
        var initialScrollTop = calendarFirstCardScrollTop(nextScroll);
        nextScroll.scrollTop = initialScrollTop;
        state.calendarInitialScroll = nextScroll.scrollTop > 0;   // 真的捲到了才算數，否則下次 render 再試
        setTimeout(function () {
          var currentScroll = document.querySelector('#' + rootId + ' .ff-cal-scroll');
          if (currentScroll && currentScroll.scrollTop === 0) {
            currentScroll.scrollTop = initialScrollTop;
            state.calendarInitialScroll = currentScroll.scrollTop > 0;
          }
        }, 80);
      } else if (nextScroll && priorScrollTop != null) nextScroll.scrollTop = priorScrollTop;
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
      targetOccurrenceId: editor.targetId || null, swapWithOccurrenceId: editor.targetId || null,
      rules: { maxContinuousGapMin: 90 }
    };
  }

  function fallbackPreview(item, request, operation, schedule) {
    var after = copy(item);
    var duration = Math.round((Date.parse(request.endAt) - Date.parse(request.startAt)) / 60000);
    after.fine = Object.assign({
      originalDurationMin: duration, manualOrder: 0
    }, after.fine || {}, {
      startAt: request.startAt, endAt: request.endAt,
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
    var api = ffApi();
    return {
      id: 'ff_fallback_' + Date.now(), operation: operation,
      versionId: activeVersion().id, day: fineDayId(item),
      baseFingerprint: typeof api.baseFingerprint === 'function' ? api.baseFingerprint(base) : JSON.stringify(base),
      mutations: [{ occurrenceId: item.id, before: copy(item), after: after, reason: '調整時間' }],
      summary: { moved: 1, shortened: 0 },
      beforeSchedule: base, afterSchedule: afterSchedule, rules: copy(request.rules || {}),
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

  // 「還沒儲存」攔截用：只列使用者看得懂的差異，沒有差異就不攔。
  function editorPendingChanges(editor) {
    var changes = [];
    if (!editor) return changes;
    if (editor.title !== editor.originalTitle) changes.push('名稱');
    if (editor.originalDate !== editor.date || editor.originalEndDate !== editor.endDate) changes.push('日期');
    if (editor.originalStart !== editor.start || editor.originalEnd !== editor.end) changes.push('時間');
    if (editor.note !== editor.originalNote) changes.push('備註');
    if (JSON.stringify(editor.todos || []) !== editor.originalTodos) changes.push('待辦');
    if (editor.coarseVisible !== editor.originalCoarseVisible || editor.coarseSlot !== editor.originalCoarseSlot) changes.push('粗流顯示');
    if (editor.placeCard && editor.originalMapsUrl != null && (editor.placeCard.mapsUrl || '') !== editor.originalMapsUrl) changes.push('Maps');
    return changes;
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

  // 地點資料在這張卡是唯讀的：要改去地點卡改（Vivian 2026-08-16 定案）。這裡只顯示價格一行。
  function placePriceRow(editor) {
    var place = editor.placeCard;
    var amount = place && place.cost && place.cost.amount != null ? +place.cost.amount : null;
    if (!(amount > 0)) return '';
    var per = place.cost && place.cost.per === 'shared' ? '共用' : '每人';
    return '<div class="ff-fact-row"><span>價格</span><b>NT$' + h(String(amount)) + '／' + per + '</b></div>';
  }

  // 編輯中就用「正在填的日期時間」判斷，讓提醒跟著輸入即時更新。
  function editorHoursWarnings(editor, item) {
    if (!editor || !item || !editor.placeId) return [];
    var card = editor.placeCard || (typeof getPlace === 'function' ? getPlace(editor.placeId) : null);
    if (!card || typeof CNXCore === 'undefined' || typeof CNXCore.hoursWarnings !== 'function') return [];
    var date = editor.date || fineDate(item);
    var endDate = editor.end <= editor.start ? addDays(date, 1) : date;
    return CNXCore.hoursWarnings(card, zonedIso(date, editor.start), zonedIso(endDate, editor.end));
  }

  // 行程日期一定落在 TRIP 區間內（清邁這趟 8 天），所以日期選擇用一排日子的 chip，
  // 不做月曆——月曆在 390px 上要吃掉半個 sheet，而她永遠只會在這幾天之間跳。
  function tripDateList() {
    var start = typeof TRIP !== 'undefined' && TRIP && TRIP.startDate || '';
    var end = typeof TRIP !== 'undefined' && TRIP && TRIP.endDate || '';
    if (!start || !end) return [];
    var list = [], cursor = start, guard = 0;
    while (cursor <= end && guard++ < 60) { list.push(cursor); cursor = addDays(cursor, 1); }
    return list;
  }

  function dateChipLabel(dateText) {
    var meta = dayMeta(dayIdForDate(dateText));
    return (meta.label || dateText) + (meta.wd ? ' ' + meta.wd : '');
  }

  // 一列＝「開始／結束　日期格　時間格」。點格子才在同一列下方展開選擇器（iOS 行事曆模式）。
  function editorTimeRow(editor, which) {
    var isStart = which === 'start';
    var dateValue = isStart ? editor.date : editor.endDate;
    var timeValue = isStart ? editor.start : editor.end;
    var dateKey = which + '-date', timeKey = which + '-time';
    var row = '<div class="ff-time-row" data-ff-time-row="' + which + '">' +
      '<span class="ff-time-key">' + (isStart ? '開始' : '結束') + '</span>' +
      '<button type="button" class="ff-time-pill' + (editor.openPicker === dateKey ? ' open' : '') + '" data-action="ff-pick" data-pick="' + dateKey + '" aria-expanded="' + (editor.openPicker === dateKey) + '">' + h(dateValue ? dateChipLabel(dateValue) : '選日期') + '</button>' +
      '<button type="button" class="ff-time-pill' + (editor.openPicker === timeKey ? ' open' : '') + '" data-action="ff-pick" data-pick="' + timeKey + '" aria-expanded="' + (editor.openPicker === timeKey) + '">' + h(timeValue || '選時間') + '</button>' +
      '</div>';
    if (editor.openPicker === dateKey) {
      row += '<div class="ff-pick-open">' + tripDateList().map(function (date) {
        return '<button type="button" class="ff-date-chip' + (date === dateValue ? ' on' : '') + '" data-action="ff-set-date" data-which="' + which + '" data-date="' + h(date) + '">' + h(dateChipLabel(date)) + '</button>';
      }).join('') + '</div>';
    } else if (editor.openPicker === timeKey) {
      row += '<div class="ff-pick-open">' + renderTimePicker(isStart ? 'data-ff-start' : 'data-ff-end', timeValue || '09:00', isStart ? '開始' : '結束') + '</div>';
    }
    return row;
  }

  // 滾輪開著的時候不整段重畫：openSheet 會抽換 DOM，手指還在滑就會卡住、位置跳掉。
  // 這裡只把「會變的那幾個字」就地改掉（兩顆時間格、時長、營業提醒、儲存鈕的可按狀態）。
  function patchEditorLive() {
    var editor = state.editor, item = findOccurrence(editor.id);
    if (!item) return;
    var startPill = sh.querySelector('[data-pick="start-time"]');
    var endPill = sh.querySelector('[data-pick="end-time"]');
    var endDatePill = sh.querySelector('[data-pick="end-date"]');
    if (startPill) startPill.textContent = editor.start || '選時間';
    if (endPill) endPill.textContent = editor.end || '選時間';
    if (endDatePill) endDatePill.textContent = editor.endDate ? dateChipLabel(editor.endDate) : '選日期';
    var span = sh.querySelector('.ff-time-span');
    if (span) span.textContent = timeSpanNote(editor.durationMin);
    var warn = sh.querySelector('.ff-hours-warning');
    var notes = editorHoursWarnings(editor, item);
    if (warn) {
      warn.innerHTML = notes.map(function (text) { return '<span>' + h(text) + '</span>'; }).join('');
      warn.hidden = !notes.length;
    }
    var apply = sh.querySelector('[data-action="ff-apply"]');
    if (apply) apply.disabled = !editor.transaction || !editor.title.trim();
  }

  // 待辦列＝左滑刪除（沿用 app-4-edit.js 的 initSwipeDelete；紅塊墊在底下，列本身平移）。
  function todoRowHtml(itemId, todo) {
    // 整列原本是一顆 button＝文字不能編（Vivian 2026-08-20）。拆成「勾選鈕＋輸入框」，
    // 勾選仍走 ff-detail-todo（既有測試與草稿邏輯不變），文字改成 input、跟備註一樣按儲存才寫入。
    return '<div class="ff-todo-swipe">' +
      '<button type="button" class="ff-todo-del" data-action="ff-todo-del" data-todo="' + h(todo.id) + '">刪除</button>' +
      '<div class="ff-todo-row' + (todo.done ? ' done' : '') + '">' +
      '<button type="button" class="ff-todo-check" data-action="ff-detail-todo" data-eid="' + h(itemId) + '" data-todo="' + h(todo.id) + '" aria-pressed="' + !!todo.done + '" aria-label="切換完成">' +
      '<span class="ff-check" aria-hidden="true">' + (todo.done ? '✓' : '') + '</span></button>' +
      '<input class="ff-detail-todo-text" data-ff-todo-edit data-todo="' + h(todo.id) + '" maxlength="120" value="' + h(todo.text) + '"></div></div>';
  }

  function renderEditor() {
    var editor = state.editor, item = editor && findOccurrence(editor.id);
    if (!editor || !item || typeof sh === 'undefined') return;
    if (editor.pointerCompact) { renderPointerDecision(); return; }
    if (!editor.confirmDelete && !editor.confirmDiscard && !editor.confirmRipple && !editor.error && !editor.notice &&
        /-time$/.test(editor.openPicker || '') && sh.querySelector('.ff-timepick')) { patchEditorLive(); return; }
    if (editor.confirmDelete) { renderDeleteConfirm(); return; }
    if (editor.confirmDiscard) { renderDiscardConfirm(); return; }
    if (editor.confirmRipple) { renderRippleConfirm(); return; }
    var transaction = editor.transaction;
    var linkedDay = dayIdForDate(editor.date);
    var coarseControls = '<section class="ff-coarse-control"><label class="ff-fixed-check"><input type="checkbox" data-ff-coarse' + (editor.coarseVisible ? ' checked' : '') + '><span><b>粗流也顯示這項</b><small>' + (editor.coarseVisible ? '同一筆行程・' + h((dayMeta(linkedDay).label || linkedDay) + '・' + coarseSlotLabel(editor.coarseSlot)) : '沒勾＝只在細流，適合交通、銜接與不需要出現在大方向的行程') + '</small></span></label>' +
      '<div class="ff-coarse-fields"' + (editor.coarseVisible ? '' : ' hidden') + '><label class="ff-field"><span>粗流時段</span><select data-ff-coarse-slot>' + coarseSlotOptions(editor.coarseSlot) + '</select></label><p class="ff-link-note">日期會跟著上方日期；粗流與細流共用名稱、備註與待辦。</p></div></section>';
    // 名稱：有地點卡的行程改了會連地點卡一起改（她定的），所以不再標「來自別處」的說明字。
    var titleField = '<input class="ff-title-input" data-ff-title maxlength="80" placeholder="行程名稱" value="' + h(editor.title) + '">';
    // 相容層：日期／時間永遠留一個 hidden input，既有委派與測試照舊讀寫，選擇器收合時也在。
    var hidden = '<input type="hidden" data-ff-date value="' + h(editor.date) + '">' +
      '<input type="hidden" data-ff-end-date value="' + h(editor.endDate) + '">' +
      '<input type="hidden" data-ff-start value="' + h(editor.start) + '">' +
      '<input type="hidden" data-ff-end value="' + h(editor.end) + '">';
    var timeBlock = '<section class="ff-time-block">' + editorTimeRow(editor, 'start') + editorTimeRow(editor, 'end') +
      '<p class="ff-time-span">' + h(timeSpanNote(editor.durationMin)) + '</p></section>';
    // Maps 放第一屏（她 2026-08-16 回饋）：一顆直接開、一顆複製網址（貼給旅伴或丟進捷徑）。
    var maps = mapsForOccurrence(item);
    var primaryMap = maps[0];
    var mapRow = '<div class="ff-map-row">' + (primaryMap ?
      '<a class="ff-map-btn" href="' + h(primaryMap.url) + '" target="_blank" rel="noopener noreferrer">開啟 Maps</a>' +
      '<button type="button" class="ff-map-btn" data-action="ff-copy-map" data-url="' + h(primaryMap.url) + '">複製連結</button>' :
      '<span class="ff-detail-missing">這項行程沒有 Maps 連結</span>') +
      (item.placeId ? '<button type="button" class="ff-map-btn" data-action="ff-open-place" data-pid="' + h(item.placeId) + '">編輯地點卡</button>' : '') +
      '</div>' + (maps.length > 1 ? '<div class="ff-detail-maps-list">' + maps.map(function (link) {
        return '<a class="ff-detail-maps" href="' + h(link.url) + '" target="_blank" rel="noopener noreferrer"><span>' + h(link.label || '在 Google Maps 開啟') + '</span><span aria-hidden="true">↗</span></a>';
      }).join('') + '</div>' : '');   // 只有一個點時，上面那顆「開啟 Maps」就夠了，不再多列一行
    var mapSection = '<section class="ff-editor-section"><h4>Maps 連結</h4>' +
      '<label class="ff-field"><span>Google Maps 連結</span><input type="url" inputmode="url" data-ff-place-maps value="' + h(editor.placeCard ? editor.placeCard.mapsUrl || '' : editor.customMapsUrl) + '" placeholder="https://maps.google.com/…"></label>' +
      '</section>';
    // 類別只有自訂行程能改：掛地點卡的類別跟著卡片庫走，改地點卡才對（避免兩處各存一份互相打架）。
    var categorySection = editor.placeId ? '' : '<section class="ff-editor-section"><label class="ff-field"><span>類別</span><select data-ff-category>' +
      categoriesList().map(function (c) { return '<option value="' + h(c.key) + '"' + (c.key === editor.category ? ' selected' : '') + '>' + h(c.icon) + ' ' + h(c.label) + '</option>'; }).join('') +
      '</select></label></section>';
    // 待辦是草稿：勾選與新增都只改 state，按儲存才寫進資料（她 2026-08-16 定案）。
    var todos = (editor.todos || []).map(function (todo) { return todoRowHtml(item.id, todo); }).join('');
    var noteSection = '<section class="ff-editor-section"><label class="ff-field"><span>備註</span><textarea data-ff-notes maxlength="500" placeholder="選填">' + h(editor.note) + '</textarea></label></section>';
    var todoSection = '<section class="ff-editor-section"><h4>待辦事項</h4><div class="ff-detail-todo-list">' + (todos || '<p class="ff-detail-missing">目前沒有待辦</p>') + '</div><div class="ff-todo-add"><input data-ff-detail-todo-text maxlength="120" placeholder="新增待辦"><button type="button" data-action="ff-detail-todo-add" data-eid="' + h(item.id) + '">新增</button></div></section>';
    // 進階＝一年碰不到幾次的東西：Maps 連結、粗流顯示開關與粗流時段。
    var advanced = '<details class="ff-rules ff-advanced"' + (editor.advancedOpen ? ' open' : '') + '><summary>Maps 連結・粗流顯示</summary><div class="ff-rules-body">' +
      mapSection + coarseControls + '</div></details>';
    var deleteRow = '<button type="button" class="ff-delete-row" data-action="ff-delete">刪除這筆行程</button>';
    var notice = editor.notice ? '<div class="ff-preview-state notice" role="status">' + h(editor.notice) + '</div>' : '';
    var hoursNotes = editorHoursWarnings(editor, item);
    // 永遠 render（沒事就 hidden），滾輪滑動時才能就地改內容而不用整段重畫。
    var hoursBlock = '<section class="ff-hours-warning" role="alert"' + (hoursNotes.length ? '' : ' hidden') + '>' +
      hoursNotes.map(function (text) { return '<span>' + h(text) + '</span>'; }).join('') + '</section>';
    var preview = editor.previewing ? '<div class="ff-preview-state" role="status">正在檢查時間…</div>' :
      editor.error ? '<div class="ff-preview-state error" role="alert">' + h(editor.error) + '</div>' : '';
    var html = '<div class="ff-sheet ff-editor-sheet" role="dialog" aria-modal="true" aria-label="編輯行程">' +
      '<button type="button" class="ff-grab" data-action="ff-grab" aria-label="拉高或收起這張卡"></button>' +
      '<div class="ff-sheet-scroll">' + hidden + titleField + timeBlock + hoursBlock + mapRow + placePriceRow(editor) + categorySection + noteSection + todoSection + advanced + deleteRow + notice + preview + '</div>' +
      '<div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-apply"' + (!transaction || !editor.title.trim() ? ' disabled' : '') + '>儲存</button></div></div>';
    openSheet(html, function () {
      // 從這張卡跳去編輯地點卡再回來時，草稿裡的名稱／備註還是舊的，
      // 使用者在這裡再按一次儲存就會把剛剛改的蓋回去（Vivian 2026-08-20：「編了完全不會存」的真正原因）。
      // 只重讀「地點卡那幾欄」，時間、待辦等還沒存的草稿照舊留著。
      if (state.editorReloadOnReturn) {
        state.editorReloadOnReturn = false;
        var freshPlace = state.editor && state.editor.placeId && typeof getPlace === 'function' ? getPlace(state.editor.placeId) : null;
        if (freshPlace) {
          state.editor.placeCard = copy(freshPlace);
          state.editor.title = freshPlace.name;
          state.editor.originalTitle = freshPlace.name;
          state.editor.note = freshPlace.note || '';
          state.editor.originalNote = freshPlace.note || '';
          state.editor.placeNote = freshPlace.note || '';
          state.editor.originalMapsUrl = freshPlace.mapsUrl || '';
        }
      }
      renderEditor();
    }, 'fineflow-editor');
    applyEditorSheetHeight();
  }

  // ── 三個確認層：刪除／未存離開／連動後面 ─────────────────────────────
  function confirmSheet(kicker, title, body, options) {
    openSheet('<div class="ff-sheet ff-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-confirm-title">' +
      '<div class="ff-sheet-head"><span class="ff-kicker">' + h(kicker) + '</span><h3 id="ff-confirm-title">' + h(title) + '</h3><p>' + h(body) + '</p></div>' +
      '<div class="ff-sheet-scroll"><div class="ff-confirm-actions">' + options.map(function (option) {
        return '<button type="button" class="' + (option.danger ? 'danger' : (option.primary ? 'primary' : '')) + '" data-action="' + option.action + '">' + h(option.label) + '</button>';
      }).join('') + '</div></div></div>', null, 'fineflow-confirm');
  }

  // 結束可以落在隔天（跨午夜），所以時長一律用「開始日期時間 → 結束日期時間」實算。
  function recomputeEditorDuration() {
    var editor = state.editor;
    if (!editor) return;
    if (editor.endDate < editor.date) editor.endDate = editor.date;
    if (editor.endDate === editor.date && editor.end <= editor.start) editor.endDate = addDays(editor.date, 1);
    editor.durationMin = Math.round((Date.parse(zonedIso(editor.endDate, editor.end)) - Date.parse(zonedIso(editor.date, editor.start))) / 60000);
  }

  // 一點就複製，不要再問一步。區網 http 是 insecure context＝沒有 navigator.clipboard，
  // 所以留 execCommand('copy') 這條老路（正式站是 https，走上面那條）。
  function copyText(text) {
    var ok = function () { if (typeof toast === 'function') toast('已複製 Maps 連結'); };
    var fallback = function () {
      try {
        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(area);
        area.select();
        area.setSelectionRange(0, text.length);
        var copied = document.execCommand && document.execCommand('copy');
        document.body.removeChild(area);
        if (copied) ok();
        else if (typeof toast === 'function') toast('這個瀏覽器不讓自動複製，長按連結複製');
      } catch (err) { if (typeof toast === 'function') toast('複製失敗'); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
  }

  function deleteOccurrence(id) {
    var item = findOccurrence(id);
    if (!item) return;
    var label = occurrenceTitle(item);
    var guard = currentGuard();
    state.editor = null;
    state.selectedId = null;
    if (uiStore) uiStore.dispatch({ type: 'CANCEL' });
    // 卡片已經不在了，返回堆疊裡的上一層（那張已刪的卡片詳情）也失效了，整個清空直接跳回日曆，不要只退一層。
    if (typeof navStack !== 'undefined' && navStack.length) navStack.length = 0;
    if (typeof closeSheet === 'function') closeSheet();
    applyPlanChange('已刪除「' + label + '」', guard, function (version) {
      var index = version.plan.findIndex(function (entry) { return entry.id === id; });
      if (index >= 0) version.plan.splice(index, 1);
    });
  }

  // 只看「被改的那一筆」的新區間是否嚴格壓到後面的行程（貼齊不算）；沒壓到就不問。
  function rippleImpact(editor) {
    var item = findOccurrence(editor.id);
    if (!item) return null;
    if (editor.originalStart === editor.start && editor.originalEnd === editor.end && editor.originalDate === editor.date) return null;
    var startAt = Date.parse(zonedIso(editor.date, editor.start));
    var endAt = Date.parse(zonedIso(editor.endDate, editor.end));
    var hit = scheduleCandidates(editor).filter(function (candidate) {
      if (!candidate.fine || !candidate.fine.startAt) return false;
      var otherStart = Date.parse(candidate.fine.startAt);
      var otherEnd = Date.parse(candidate.fine.endAt || candidate.fine.startAt);
      return otherStart < endAt && otherEnd > startAt && otherStart >= startAt;
    });
    if (!hit.length) return null;
    var first = hit[0];
    return { count: hit.length, detail: occurrenceTitle(first) + ' ' + timeFromIso(first.fine.startAt) + ' 開始，跟這筆重疊。' };
  }

  function renderDeleteConfirm() {
    var item = findOccurrence(state.editor.id);
    confirmSheet('刪除', '刪除這筆行程', (item && item.placeId ? occurrenceTitle(item) + ' 這張地點卡會留在庫裡，只有這一次被刪掉。' : '這筆行程會被移除。'), [
      { label: '刪除', action: 'ff-delete-yes', danger: true },
      { label: '取消', action: 'ff-delete-no' }
    ]);
  }

  // 待辦的刪除確認是「疊在原畫面中間的小視窗」，不走 openSheet——用 sheet 會把整張編輯卡換掉，
  // 關掉後捲動位置也回到最上面（她 2026-08-16 回饋）。這個小視窗自己掛在 body，原畫面完全不動。
  function openMiniConfirm(title, body, confirmLabel) {
    closeMiniConfirm();
    var host = document.createElement('div');
    host.className = 'ff-mini-back';
    host.setAttribute('data-ff-mini', '');
    host.innerHTML = '<div class="ff-mini" role="dialog" aria-modal="true" aria-labelledby="ff-mini-title">' +
      '<h3 id="ff-mini-title">' + h(title) + '</h3><p></p>' +
      '<div class="ff-mini-actions"><button type="button" data-action="ff-todo-del-no">取消</button>' +
      '<button type="button" class="danger" data-action="ff-todo-del-yes">' + h(confirmLabel) + '</button></div></div>';
    host.querySelector('p').textContent = body;   // 使用者輸入的字走 textContent，不進 innerHTML
    document.body.appendChild(host);
  }

  function closeMiniConfirm() {
    var existing = document.querySelector('[data-ff-mini]');
    if (existing) existing.remove();
  }

  // 取消或刪完都要把那一列滑回原位（initSwipeDelete 觸發後不會自己彈回）。
  function resetSwipedTodoRow() {
    Array.prototype.forEach.call(sh.querySelectorAll('.ff-todo-swipe'), function (row) {
      row.classList.remove('del-armed', 'swiping');
      var body = row.querySelector('.ff-todo-row');
      if (body) body.style.transform = '';
    });
  }

  function renderDiscardConfirm() {
    confirmSheet('還沒儲存', '還沒儲存', '改過：' + state.editor.confirmDiscard.join('、'), [
      { label: '回去繼續改', action: 'ff-discard-no', primary: true },
      { label: '丟掉這些修改', action: 'ff-discard-yes', danger: true }
    ]);
  }

  function renderRippleConfirm() {
    confirmSheet('時間重疊', '後面 ' + state.editor.confirmRipple.count + ' 筆會被壓到', state.editor.confirmRipple.detail, [
      { label: '後面一起往後推', action: 'ff-ripple-yes', primary: true },
      { label: '就這樣存，我自己調', action: 'ff-ripple-no' },
      { label: '取消', action: 'ff-ripple-cancel' }
    ]);
  }

  function openEditor(id) {
    var item = findOccurrence(id);
    if (!item) return;
    state.selectedId = id;
    state.armedId = null;   // 開浮層就退出長按解鎖態
    var start = timeFromIso(item.fine && item.fine.startAt) || item.startTime || defaultTime(item.slot);
    var duration = minuteDuration(item) || 60;
    var place = item.placeId && typeof getPlace === 'function' ? getPlace(item.placeId) : null;
    var slotMeta = item.day && item.slot && typeof CNXCore !== 'undefined' && typeof CNXCore.getSlotMeta === 'function' ? CNXCore.getSlotMeta(activeVersion(), item.day, item.slot) : null;
    var sameSlot = item.day && item.slot ? activePlan().filter(function (entry) { return entry.day === item.day && entry.slot === item.slot; }) : [];
    var end = timeFromIso(item.fine && item.fine.endAt) || addMinutesToTime(start, duration);
    var date = fineDate(item);
    // 備註只剩一欄：有地點卡就寫地點卡（沿用舊的 occurrence.notes 當顯示回填，儲存時搬過去）。
    var note = place ? (place.note || item.notes || '') : (item.notes || '');
    state.editor = {
      id: id, versionId: activeVersion() && activeVersion().id, mode: 'single',
      title: occurrenceTitle(item), originalTitle: occurrenceTitle(item), notes: item.notes || '',
      note: note, originalNote: note,
      placeNote: place ? place.note || '' : '', placeId: item.placeId || null, originalPlaceId: item.placeId || null, placeCard: place ? copy(place) : null,
      originalMapsUrl: place ? place.mapsUrl || '' : null,
      category: item.category || '其他', customMapsUrl: (item.custom && item.custom.mapsUrl) || '',
      todos: copy(item.todos || []), originalTodos: JSON.stringify(item.todos || []),
      date: date, endDate: end <= start ? addDays(date, 1) : date,
      start: start, end: end,
      originalDate: date, originalEndDate: end <= start ? addDays(date, 1) : date, originalStart: start, originalEnd: end,
      openPicker: '', sheetH: 0,
      confirmDelete: false, confirmTodoDelete: null, confirmDiscard: null, confirmRipple: null,
      durationMin: duration, firstSchedule: !item.fine,
      coarseVisible: !!(item.day && item.slot), originalCoarseVisible: !!(item.day && item.slot), coarseDay: item.day || dayIdForDate(fineDate(item)),
      coarseSlot: item.slot || slotFromTime(start),
      originalCoarseSlot: item.slot || slotFromTime(start),
      coarseOrder: Math.max(0, sameSlot.findIndex(function (entry) { return entry.id === item.id; })),
      coarsePk: !!(slotMeta && slotMeta.pk), backupIds: slotMeta && Array.isArray(slotMeta.backups) ? slotMeta.backups.slice(0, 2) : [],
      travelMode: item.travelMode || '',
      targetId: '', transaction: null, error: '', notice: '', previewing: false, rulesOpen: false, advancedOpen: false
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
    // 「連動後面」不佔版面：只有動到時間、而且真的壓到後面的行程，儲存時才問一句。
    if (!editor.pointerCompact && !editor.rippleDecided) {
      var impact = rippleImpact(editor);
      if (impact) { editor.confirmRipple = impact; renderEditor(); return; }
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
        // 卡片只有一個標題＝庫卡名。掛著庫卡的行程不留自己的標題，否則那串字會躺在資料裡，
        // 哪天被同步回庫卡就把地點名字蓋掉（「住宿 Himku」被寫成「前往 Himku」就是這樣來的）。
        // 要不一樣的描述，就開一張不掛庫卡的描述卡。
        if (editedItem.placeId) { if (editedItem.custom) delete editedItem.custom.title; }
        else {
          if (!editedItem.custom) editedItem.custom = { kind: 'life' };
          editedItem.custom.title = editor.title.trim();
          editedItem.custom.mapsUrl = editor.customMapsUrl || '';
          editedItem.category = editor.category || '其他';
        }
        // 一欄備註：有地點卡就存地點卡，並把舊的單次備註搬空（避免同一段字在兩處各存一份）。
        if (editor.placeId && editor.placeCard) { editor.placeCard.note = editor.note || ''; editedItem.notes = ''; }
        else editedItem.notes = editor.note || '';
        // 待辦按 id 併回去，不整組覆蓋：編輯期間別人同步進來的待辦不能被打開浮層那一刻的快照洗掉。
        // 刪除只認「打開時就在、現在草稿裡沒有」的那些；同步進來的新待辦一律留著。
        var draftById = {};
        (editor.todos || []).forEach(function (todo) { draftById[todo.id] = todo; });
        var wasThere = {};
        try { JSON.parse(editor.originalTodos || '[]').forEach(function (todo) { wasThere[todo.id] = true; }); } catch (err) { /* 舊資料壞掉就當沒有 */ }
        var knownIds = {};
        editedItem.todos = (editedItem.todos || []).filter(function (todo) {
          if (wasThere[todo.id] && !draftById[todo.id]) return false;   // 在編輯卡裡被刪掉
          knownIds[todo.id] = true;
          if (draftById[todo.id]) { todo.done = !!draftById[todo.id].done; todo.text = draftById[todo.id].text; }
          return true;
        });
        (editor.todos || []).forEach(function (todo) { if (!knownIds[todo.id]) editedItem.todos.push(copy(todo)); });
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
      // 一定要先清掉再 afterChange()：afterChange 裡的 renderAll() 會馬上重畫日曆，
      // 這時 selectedId 還沒清就會把已經關掉的編輯浮層那張卡畫成「選取」，卡住不會退（Vivian 2026-08-19）。
      state.editor = null;
      state.selectedId = null;
      if (typeof afterChange === 'function') afterChange();
      if (typeof closeSheet === 'function') closeSheet();
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

  // 未排項目（沒有 fine.startAt）：原本掛在細流頂端一整條 bar，2026-08-20 併進這個清單。
  function unscheduledOccurrences() {
    var version = activeVersion();
    var api = calendarApi();
    var dates = api.buildDateWindow ? api.buildDateWindow(calendarAnchor(), calendarVisibleDays()) : [calendarAnchor()];
    var items = [];
    dates.forEach(function (date) {
      var dayId = dayIdForDate(date);
      var parts = scheduleParts(buildSchedule(version, dayId), dayId, version);
      (parts.unplanned || []).forEach(function (item) { items.push(item); });
    });
    return items;
  }

  function openTodos(dayId) {
    var entries = [];
    activePlan().forEach(function (item) {
      if (dayId && fineDayId(item) !== dayId) return;
      (item.todos || []).forEach(function (todo) { entries.push({ item: item, todo: todo }); });
    });
    entries.sort(function (a, b) { return (a.todo.done ? 1 : 0) - (b.todo.done ? 1 : 0); });
    var todoHead = '<h4 class="ff-todo-subhead">待辦（' + entries.filter(function (entry) { return !entry.todo.done; }).length + ' 項未完成）</h4>';
    var body = todoHead + (entries.length ? entries.map(function (entry) {
      var meta = dayMeta(fineDayId(entry.item));
      return '<div class="ff-todo-line">' +
        '<button type="button" class="ff-todo-row' + (entry.todo.done ? ' done' : '') + '" data-action="ff-todo-toggle" data-eid="' + h(entry.item.id) + '" data-todo="' + h(entry.todo.id) + '" aria-pressed="' + entry.todo.done + '">' +
        '<span class="ff-check">' + (entry.todo.done ? '✓' : '') + '</span><span><b>' + h(entry.todo.text) + '</b><small>' + h(meta.label + '・' + (timeFromIso(entry.item.fine && entry.item.fine.startAt) || '未排時間') + '・' + occurrenceTitle(entry.item)) + '</small></span></button>' +
        '<button type="button" class="ff-todo-edit-btn" data-action="ff-unscheduled-edit" data-eid="' + h(entry.item.id) + '" aria-label="編輯這筆行程">✎</button>' +
        '</div>';
    }).join('') : '<div class="ff-sheet-empty">目前沒有待辦</div>');
    var pending = unscheduledOccurrences();
    var pendingRows = pending.length ? pending.map(function (item) {
      return '<button type="button" class="ff-source-place-row" data-action="ff-unscheduled-edit" data-eid="' + h(item.id) + '"><b>' + h(occurrenceTitle(item)) + '</b><small>設定日期與時間</small></button>';
    }).join('') : '';
    var pendingSection = pendingRows ? '<h4 class="ff-todo-subhead">尚未排時間（' + pending.length + '）</h4>' + pendingRows : '';
    openSheet('<div class="ff-sheet ff-todo-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-todo-title"><div class="ff-sheet-head"><span class="ff-kicker">集中清單</span><h3 id="ff-todo-title">' + (dayId ? h(dayMeta(dayId).label + ' 待辦') : '待辦・尚未排時間') + '</h3><p>待辦會跟著行程本體一起移動；改文字請按 ✎ 進編輯卡。</p></div><div class="ff-sheet-scroll">' + body + pendingSection + '</div></div>', function () { openTodos(dayId); }, 'fineflow-todos');
  }

  function openCustom(dayId) {
    var options = (typeof DAYS !== 'undefined' ? DAYS : []).map(function (day) { return '<option value="' + h(day.id) + '"' + (day.id === (dayId || state.day) ? ' selected' : '') + '>' + h(day.label + '（' + day.wd + '）') + '</option>'; }).join('');
    openSheet('<div class="ff-sheet ff-custom-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-add-title"><div class="ff-sheet-head"><span class="ff-kicker">新增</span><h3 id="ff-add-title">自訂行程</h3><p>適合起床、退房、排隊或沒有地點卡的活動。</p></div><div class="ff-sheet-scroll"><label class="ff-field"><span>行程名稱</span><input id="ff_custom_title" maxlength="80" placeholder="例如：起床、整理行李"></label><label class="ff-field"><span>日期</span><select id="ff_custom_day">' + options + '</select></label><div class="ff-time-fields"><label class="ff-field"><span>開始</span><input id="ff_custom_start" type="time" value="09:00"></label><span aria-hidden="true">→</span><label class="ff-field"><span>結束</span><input id="ff_custom_end" type="time" value="10:00"></label></div></div><div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-add-save">新增行程</button></div></div>', function () { openCustom(dayId); }, 'fineflow-custom');
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
      fine: { startAt: startAt, endAt: endAt, originalDurationMin: duration,
        manualOrder: activePlan().length },
      scheduleKind: 'custom', travelMode: '', todos: [], seq: activePlan().length
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
    var target = calPx(minute * calendarPixelsPerHour() / 60) - 145;
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
    var span = (minuteValue(end) - minuteValue(start) + 1440) % 1440;
    return '<label class="ff-field"><span>日期</span><input type="date" data-ff-create-date value="' + h(date) + '" min="' + h(minDate) + '" max="' + h(maxDate) + '"></label>' +
      '<input type="hidden" data-ff-create-start value="' + h(start) + '">' +
      '<input type="hidden" data-ff-create-end value="' + h(end) + '">' +
      '<div class="ff-time-fields"><div class="ff-timepick-label">開始</div>' + renderTimePicker('data-ff-create-start', start, '開始') +
      '<p class="ff-time-span">' + h(timeSpanNote(span)) + '</p>' +
      '<div class="ff-timepick-label">結束</div>' + renderTimePicker('data-ff-create-end', end, '結束') + '</div>';
  }

  function creationCoarseFields(draft) {
    var suggested = suggestedCoarsePosition(draft.date || calendarAnchor(), draft.start || '09:00');
    if (typeof draft.coarseVisible !== 'boolean') draft.coarseVisible = false;
    draft.coarseDay = draft.coarseDay || suggested.day;
    draft.coarseSlot = draft.coarseSlot || suggested.slot;
    return '<section class="ff-coarse-control"><label class="ff-fixed-check"><input type="checkbox" data-ff-create-coarse' + (draft.coarseVisible ? ' checked' : '') + '><span><b>粗流也顯示這項</b><small>' + (draft.coarseVisible ? '同一筆行程，日期跟著上方日期' : '沒勾＝只在細流，交通與銜接行程通常不必放進粗流') + '</small></span></label><div class="ff-coarse-fields"' + (draft.coarseVisible ? '' : ' hidden') + '><label class="ff-field"><span>粗流時段</span><select data-ff-create-coarse-slot>' + coarseSlotOptions(draft.coarseSlot) + '</select></label></div></section>';
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
    openSheet('<div class="ff-sheet ff-create-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-create-title"><div class="ff-sheet-head"><span class="ff-kicker">自訂行程</span><h3 id="ff-create-title">新增自訂行程</h3><p>卡片會使用所選類別的同色系淺色。</p></div><div class="ff-sheet-scroll"><label class="ff-field"><span>行程名稱</span><input data-ff-create-title maxlength="80" placeholder="例如：起床、整理行李"></label><label class="ff-field"><span>類別</span><select data-ff-create-category>' + options + '</select></label><label class="ff-field"><span>備註</span><textarea data-ff-create-notes maxlength="500" placeholder="選填"></textarea></label>' + creationTimingFields(draft) + creationCoarseFields(draft) + '<div class="ff-create-error" role="alert"></div></div><div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-create-save" data-kind="custom">新增行程</button></div></div>', function () { openCustomCreate(); }, 'fineflow-create-custom');
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
    openSheet('<div class="ff-sheet ff-create-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-place-time-title"><div class="ff-sheet-head"><span class="ff-kicker">行程卡片</span><h3 id="ff-place-time-title">' + h(place.name) + '</h3><p>' + (occurrenceId ? '正在替粗流的同一筆行程補上精確時間。' : (cardMap ? 'Maps 連結會由這張行程卡片自動帶入，不必重貼。' : '這張行程卡片目前沒有 Maps 連結。')) + '</p></div><div class="ff-sheet-scroll">' + (cardMap ? '<a class="ff-card-map-preview" href="' + h(cardMap) + '" target="_blank" rel="noopener noreferrer">⌖ 查看卡片的 Maps 連結</a>' : '') + creationTimingFields(state.createDraft) + creationCoarseFields(state.createDraft) + '<div class="ff-create-error" role="alert"></div></div><div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-create-save" data-kind="place-card">' + (occurrenceId ? '排進細流' : '新增行程') + '</button></div></div>', function () { openPlaceTiming(placeId, occurrenceId); }, 'fineflow-create-place-time');
  }

  function openMapsCreate() {
    var draft = ensureCreateTimingDraft('新增 Maps 行程');
    var categories = typeof categoriesList === 'function' ? categoriesList() : [];
    var options = categories.map(function (category) { return '<option value="' + h(category.key) + '">' + h((category.icon || '') + ' ' + category.label) + '</option>'; }).join('');
    openSheet('<div class="ff-sheet ff-create-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-maps-title"><div class="ff-sheet-head"><span class="ff-kicker">Google Maps</span><h3 id="ff-maps-title">建立新的行程卡片</h3><p>這個入口會先建立卡片；之後排這張卡時，Maps 連結都會自動帶入。</p></div><div class="ff-sheet-scroll"><label class="ff-field"><span>Maps 連結</span><input type="url" data-ff-create-maps placeholder="https://maps.app.goo.gl/…"></label><label class="ff-field"><span>行程名稱</span><input data-ff-create-title maxlength="80" placeholder="店名或地點名稱"></label><label class="ff-field"><span>類別</span><select data-ff-create-category>' + options + '</select></label><label class="ff-field"><span>備註</span><textarea data-ff-create-notes maxlength="500" placeholder="選填"></textarea></label>' + creationTimingFields(draft) + creationCoarseFields(draft) + '<div class="ff-create-error" role="alert"></div></div><div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-create-save" data-kind="maps">新增行程</button></div></div>', function () { openMapsCreate(); }, 'fineflow-create-maps');
  }

  function creationValues() {
    function value(selector) { var el = sh.querySelector(selector); return el ? String(el.value || '').trim() : ''; }
    return { title: value('[data-ff-create-title]'), date: value('[data-ff-create-date]'), start: value('[data-ff-create-start]'), end: value('[data-ff-create-end]'), mapsUrl: value('[data-ff-create-maps]'), category: value('[data-ff-create-category]'), notes: value('[data-ff-create-notes]'), coarseVisible: !!(sh.querySelector('[data-ff-create-coarse]') || {}).checked, coarseDay: dayIdForDate(value('[data-ff-create-date]')), coarseSlot: value('[data-ff-create-coarse-slot]') };
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
      fine: { startAt: zonedIso(values.date, values.start), endAt: zonedIso(values.date, values.end), originalDurationMin: duration, manualOrder: activePlan().length },
      scheduleKind: kind === 'custom' ? 'custom' : 'place', travelMode: '', todos: [], seq: activePlan().length
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
    var customUrl = !place && item && item.custom && safeMapsUrl(item.custom.mapsUrl);
    if (customUrl) {
      identities[identity(customUrl)] = true;
      links.push({ label: '在 Google Maps 開啟', url: customUrl, source: 'custom' });
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
    var summary = preview.transaction && preview.transaction.summary || { add: 0, update: 0, skipped: preview.skipped.length, needsInput: preview.needsInput.length, errors: preview.errors.length };
    summary.update = summary.update || 0;
    var safeCount = summary.add + summary.update;
    var problems = preview.errors.concat(preview.needsInput).map(function (problem) { return '<li>' + h((problem.externalId ? problem.externalId + '：' : '') + problem.message) + '</li>'; }).join('');
    var partial = summary.errors || summary.needsInput ? '<p class="ff-import-warning">有 ' + (summary.errors + summary.needsInput) + ' 筆需要先修正；為避免粗流與細流斷開，本次不會寫入任何資料。</p>' : (summary.skipped ? '<p class="ff-import-warning">已略過 ' + summary.skipped + ' 筆先前匯入的資料。</p>' : '');
    openSheet('<div class="ff-sheet ff-import-sheet" role="dialog" aria-modal="true" aria-labelledby="ff-import-title"><div class="ff-sheet-head"><span class="ff-kicker">匯入預演</span><h3 id="ff-import-title">確認細流匯入</h3><p>沿用粗流 ' + summary.update + ' 筆・新增 ' + summary.add + ' 筆</p></div><div class="ff-sheet-scroll">' + partial + (problems ? '<ul class="ff-import-problems">' + problems + '</ul>' : '<div class="ff-no-issue">✓ 每筆行程都已安全對應</div>') + '</div><div class="ff-sheet-actions"><button type="button" data-action="close">取消</button><button type="button" class="primary" data-action="ff-import-apply"' + (!preview.canApply ? ' disabled' : '') + '>確認匯入 ' + safeCount + ' 筆</button></div></div>', function () { openImportPreview(payload); }, 'fineflow-import');
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
      state.armedId = null;
      renderFineFlow();
      return;
    }
    if (action === 'ff-prev-days' || action === 'ff-next-days') {
      var step = calendarIsDesktop() ? calendarVisibleDays() : 1;
      state.anchorDate = clampCalendarAnchor(addDays(calendarAnchor(), action === 'ff-next-days' ? step : -step));
      state.selectedId = null;
      state.armedId = null;
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
    // 編輯卡裡的待辦是草稿（按儲存才算）；行事曆卡片上的待辦仍是即時勾選。
    if (action === 'ff-detail-todo' && state.editor) {
      var draftTodo = (state.editor.todos || []).find(function (entry) { return entry.id === target.dataset.todo; });
      if (draftTodo) {
        draftTodo.done = !draftTodo.done;
        target.classList.toggle('done', draftTodo.done);   // 就地切，不重畫（重畫＝畫面跳一下）
        target.setAttribute('aria-pressed', String(draftTodo.done));
        target.querySelector('.ff-check').textContent = draftTodo.done ? '✓' : '';
      }
      return;
    }
    if (action === 'ff-detail-todo-add' && state.editor) {
      var todoInput = sh.querySelector('[data-ff-detail-todo-text]');
      var todoText = todoInput && todoInput.value.trim();
      if (!todoText) { if (todoInput) todoInput.focus(); return; }
      var added = { id: typeof uid === 'function' ? uid() : 'todo_' + Date.now(), text: todoText, done: false };
      state.editor.todos = (state.editor.todos || []).concat([added]);
      // 就地補一列，不整段重畫——重畫會讓整個畫面跳一下（她 2026-08-16 回饋）。
      var list = sh.querySelector('.ff-detail-todo-list');
      if (list) {
        var missing = list.querySelector('.ff-detail-missing');
        if (missing) missing.remove();
        list.insertAdjacentHTML('beforeend', todoRowHtml(state.editor.id, added));
        todoInput.value = '';
      } else renderEditor();
      return;
    }
    // 待辦刪除：左滑（或直接按紅塊）先問一次，確認了才從草稿拿掉；按儲存才寫進資料。
    if (action === 'ff-todo-del' && state.editor) {
      var doomed = (state.editor.todos || []).find(function (entry) { return entry.id === target.dataset.todo; });
      if (!doomed) return;
      state.editor.confirmTodoDelete = { id: doomed.id, text: doomed.text };
      // endSwipe 在觸發 click 前就把 del-armed 拿掉了；確認視窗開著時要把紅底留住，
      // 不然那一列會變成「白條往左飄、後面什麼都沒有」。
      var armedRow = target.closest('.ff-todo-swipe');
      if (armedRow) armedRow.classList.add('del-armed');
      openMiniConfirm('刪除這個待辦？', doomed.text, '刪除');
      return;
    }
    if (action === 'ff-todo-del-no' && state.editor) {
      state.editor.confirmTodoDelete = null;
      closeMiniConfirm();
      resetSwipedTodoRow();
      return;
    }
    if (action === 'ff-todo-del-yes' && state.editor) {
      var doomedId = state.editor.confirmTodoDelete && state.editor.confirmTodoDelete.id;
      state.editor.todos = (state.editor.todos || []).filter(function (entry) { return entry.id !== doomedId; });
      state.editor.confirmTodoDelete = null;
      closeMiniConfirm();
      // 就地移除那一列＝捲動位置不動（她要求刪完停在原畫面）
      var gone = sh.querySelector('.ff-todo-swipe [data-todo="' + doomedId + '"]');
      var goneWrap = gone && gone.closest('.ff-todo-swipe');
      var listHost = goneWrap && goneWrap.parentElement;
      if (goneWrap) goneWrap.remove();
      if (listHost && !listHost.querySelector('.ff-todo-swipe')) listHost.insertAdjacentHTML('beforeend', '<p class="ff-detail-missing">目前沒有待辦</p>');
      return;
    }
    if (action === 'ff-detail-todo') { toggleOccurrenceTodo(target.dataset.eid, target.dataset.todo, true); return; }
    if (action === 'ff-detail-todo-add') { addOccurrenceTodo(target.dataset.eid); return; }
    if (action === 'ff-detail-edit') { openEditor(target.dataset.eid); return; }
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
    if (action === 'ff-conflict-single' && state.editor && state.editor.pointerCompact) {
      var singleItem = findOccurrence(state.editor.id);
      var singleTransaction = state.editor.transaction;
      state.editor = null;
      state.selectedId = null;
      if (typeof closeSheet === 'function') closeSheet();
      applyPointerTransaction(singleItem, singleTransaction);
      return;
    }
    if (action === 'ff-conflict-ripple' && state.editor) {
      if (state.editor.pointerCompact) {
        var compactEditor = state.editor;
        var compactItem = findOccurrence(compactEditor.id);
        try {
          var rippleTransaction = previewPointerTransaction(compactEditor.pointerDraft, compactItem, 'ripple');
          state.editor = null;
          state.selectedId = null;
          if (typeof closeSheet === 'function') closeSheet();
          applyPointerTransaction(compactItem, rippleTransaction);
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
      state.armedId = null;
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
    if (action === 'ff-dawn-toggle') { state.dawnOpen = !state.dawnOpen; renderFineFlow(); return; }
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
    // ── 新版編輯卡：時間格展開／日期 chip／拉高／刪除／未存離開／連動 ──
    // 展開時間／日期不改 sheet 高度（她明說「一按就跳全高」很怪）；改成把那一列捲進視線內。
    if (action === 'ff-pick' && state.editor) {
      state.editor.openPicker = state.editor.openPicker === target.dataset.pick ? '' : target.dataset.pick;
      renderEditor();
      var opened = sh.querySelector('.ff-pick-open');
      if (opened && opened.scrollIntoView) opened.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (action === 'ff-copy-map') {
      var url = target.dataset.url || '';
      copyText(url);
      return;
    }
    if (action === 'ff-open-place' && typeof openEdit === 'function') { state.editorReloadOnReturn = true; openEdit(target.dataset.pid); return; }
    if (action === 'ff-set-date' && state.editor) {
      var pickedDate = target.dataset.date;
      if (target.dataset.which === 'start') {
        var dayShift = state.editor.endDate === state.editor.date ? 0 : 1;
        state.editor.date = pickedDate;
        state.editor.endDate = dayShift ? addDays(pickedDate, 1) : pickedDate;
      } else state.editor.endDate = pickedDate;
      state.editor.openPicker = '';
      var dateInput = sh.querySelector('[data-ff-date]');
      if (dateInput && target.dataset.which === 'start') { dateInput.value = pickedDate; dateInput.dispatchEvent(new Event('input', { bubbles: true })); }
      else { recomputeEditorDuration(); renderEditor(); clearTimeout(previewTimer); previewTimer = setTimeout(runPreview, 100); }
      return;
    }
    // 把手單點＝在半高與全高之間切一次；拖曳走上面的 pointer 流程（自由高度）。
    if (action === 'ff-grab' && state.editor) {
      var bounds = editorSheetBounds();
      state.editor.sheetH = state.editor.sheetH > bounds.min + 20 ? bounds.min : bounds.max;
      applyEditorSheetHeight();
      return;
    }
    if (action === 'ff-delete' && state.editor) { state.editor.confirmDelete = true; renderEditor(); return; }
    if (action === 'ff-delete-no' && state.editor) { state.editor.confirmDelete = false; renderEditor(); return; }
    if (action === 'ff-delete-yes' && state.editor) { deleteOccurrence(state.editor.id); return; }
    if (action === 'ff-discard-no' && state.editor) { state.editor.confirmDiscard = null; renderEditor(); return; }
    if (action === 'ff-discard-yes' && state.editor) {
      state.editor = null;
      state.selectedId = null;
      if (uiStore) uiStore.dispatch({ type: 'CANCEL' });
      if (typeof closeSheet === 'function') closeSheet();
      renderFineFlow();
      return;
    }
    if (action === 'ff-ripple-cancel' && state.editor) { state.editor.confirmRipple = null; renderEditor(); return; }
    if (action === 'ff-ripple-no' && state.editor) { state.editor.confirmRipple = null; state.editor.rippleDecided = 'single'; applyEditorTransaction(); return; }
    if (action === 'ff-ripple-yes' && state.editor) {
      state.editor.confirmRipple = null;
      state.editor.rippleDecided = 'ripple';
      state.editor.mode = 'ripple';
      state.editor.transaction = null;
      runPreview();
      applyEditorTransaction();
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
      state.armedId = null;
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
    var visibleDays = days.slice(index, index + visibleCount);
    var unscheduledCount = visibleDays.reduce(function (total, day) { return total + (+day.dataset.unscheduledCount || 0); }, 0);
    var todoBadge = calendar.querySelector('.ff-cal-todo-btn b');
    if (todoBadge) {
      var openTodos = activePlan().reduce(function (total, item) {
        return total + (item.todos || []).filter(function (todo) { return todo && todo.done !== true; }).length;
      }, 0);
      todoBadge.textContent = String(openTodos + unscheduledCount);
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
  // 模仿對象是 iOS 內建行事曆（長按事件→把手出現→拖把手改時長），Google Calendar 手機版根本沒有 resize，抄不了。
  // 門檻本來抄平台預設（iOS UILongPressGestureRecognizer 0.5s／Android LONG_PRESS_TIMEOUT 500ms），
  // 但 Vivian 真機實測「太久」→ 350ms：明顯短於平台預設，又仍在「刻意按住」的感知下限之上（低於約 300ms 會開始像誤觸）。
  var POINTER_LONG_PRESS_MS = 350;
  // 時間縮短本身就提高了誤觸機率，位移門檻不能跟著放寬：手指滑超過 10px 就當作要捲頁，取消長按（14px 太寬鬆）。
  var POINTER_TOUCH_CANCEL_PX = 10;
  var POINTER_AUTOSCROLL_MAX = 14;    // px/frame 上限
  var POINTER_AUTOSCROLL_EDGE_MIN = 44;
  var POINTER_AUTOSCROLL_EDGE_MAX = 88;

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
    return snapPointerMinute(calPxInverse(clientY - scrollRectTop + scrollTop) * 60 / calendarPixelsPerHour());
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

  function pointerGeometry(draft) {
    if (draft && draft.geometry) return draft.geometry;
    var parts = scrollAndDays();
    var holder = parts.days[0] && parts.days[0].parentElement;
    var geometry = {
      scroll: parts.scroll,
      days: parts.days,
      scrollRect: parts.scroll ? parts.scroll.getBoundingClientRect() : null,
      dayRects: parts.days.map(function (day) { return day.getBoundingClientRect(); }),
      holderRect: holder ? holder.getBoundingClientRect() : null
    };
    if (draft) draft.geometry = geometry;
    return geometry;
  }

  function dayAtPointer(clientX, geometry) {
    var days = geometry.days;
    for (var i = 0; i < days.length; i++) {
      var rect = geometry.dayRects[i];
      if (rect && rect.width > 0 && clientX >= rect.left && clientX < rect.right) return days[i];
    }
    var holderRect = geometry.holderRect;
    var index = holderRect ? calendarColumnAt(clientX, holderRect.left, holderRect.width, days.length) : -1;
    return index >= 0 ? days[index] : null;
  }

  function pointerPosition(clientX, clientY, draft) {
    var geometry = pointerGeometry(draft);
    if (!geometry.scroll || !geometry.days.length) return { valid: false };
    var scrollRect = geometry.scrollRect;
    var day = dayAtPointer(clientX, geometry);
    var vertical = clientY >= scrollRect.top && clientY <= scrollRect.bottom;
    return {
      valid: !!day && vertical,
      day: day,
      date: day && day.dataset.date,
      dayId: day && day.dataset.day,
      minute: minuteAtPointer(clientY, geometry.scroll.scrollTop, scrollRect.top),
      scroll: geometry.scroll,
      scrollRect: scrollRect
    };
  }

  function removePointerVisuals(draft) {
    if (!draft) return;
    clearTimeout(draft.timer);
    if (draft.autoFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(draft.autoFrame);
    if (draft.previewFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(draft.previewFrame);
    draft.previewFrame = null;
    if (draft.ghost && draft.ghost.parentNode) draft.ghost.parentNode.removeChild(draft.ghost);
    if (draft.card) draft.card.classList.remove('is-pointer-origin', 'is-pressing', 'is-lifted');
    document.body.classList.remove('ff-pointer-active');
  }

  // 退出「長按解鎖」態。刻意不走 renderFineFlow：解鎖態常常要在 pointerdown 當下退掉，
  // 整頁重繪會把手勢正在用的 DOM 抽走（原 card／captureTarget 變成孤兒節點）。
  function disarmCard() {
    if (!state.armedId) return;
    state.armedId = null;
    var root = document.getElementById(rootId);
    var card = root && root.querySelector('.ff-cal-card.is-armed');
    if (!card) return;
    card.classList.remove('is-armed');
    Array.prototype.slice.call(card.querySelectorAll('.ff-cal-resize, .ff-cal-drag-handle'))
      .forEach(function (handle) { if (handle.parentNode) handle.parentNode.removeChild(handle); });
  }

  // 退出解鎖態的那一下，只能用來退出——不可以順便執行它落點的動作（點到別張卡開詳情、點到空白格建立新行程）。
  // pointerdown 只負責 disarm，後面跟著的 click 是獨立事件、預設會繼續傳到目標，所以要在 capture 階段先吃掉那一次。
  // 手法與總覽的 suppressNextClick 一致：一次性攔截、逾時自清（沒有 click 跟上來時不留殘留旗標）。
  // 只吃日曆容器內的 click：分頁、浮層等容器外的操作照常生效，不會被「剛好處於解鎖態」吞掉一次。
  function suppressNextCalendarClick() {
    var timer = null;
    // 同時關掉 :active／tap highlight：click 被吃掉了，格子還閃一下會讓人以為真的點到（Vivian）。
    document.body.classList.add('ff-disarming');
    var done = function () {
      document.removeEventListener('click', kill, true);
      clearTimeout(timer);
      document.body.classList.remove('ff-disarming');
    };
    var kill = function (event) {
      var inCalendar = event.target.closest && event.target.closest('#' + rootId);
      done();
      if (!inCalendar) return;
      event.stopPropagation();
      event.preventDefault();
    };
    document.addEventListener('click', kill, true);
    timer = setTimeout(done, 700);
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
    if (draft.card) {
      draft.card.classList.remove('is-pressing');
      // 觸發瞬間先跳一下（scale 1.02 ＋ 深陰影），接著才淡成拖曳來源＝「連續變化後的跳變」。
      draft.card.classList.add('is-lifted', 'is-pointer-origin');
    }
    try { draft.captureTarget.setPointerCapture(draft.pointerId); } catch (_) {}
    // iOS Safari 沒有 Vibration API（唯一已知的 checkbox switch hack 也已被 iOS 26.5 封掉），
    // 所以觸發回饋一律靠視覺；這行只有 Android Chrome 會真的震。
    if (draft.pointerType === 'touch' && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(10); } catch (_) {}
    }
    updatePointerPreview(draft.lastX, draft.lastY);
  }

  function schedulePointerPreview() {
    var draft = pointerDraft;
    if (!draft || !draft.active) return;
    if (typeof requestAnimationFrame !== 'function') { updatePointerPreview(draft.lastX, draft.lastY); return; }
    if (draft.previewFrame) return;
    draft.previewFrame = requestAnimationFrame(function () {
      draft.previewFrame = null;
      if (pointerDraft !== draft || !draft.active) return;
      updatePointerPreview(draft.lastX, draft.lastY);
    });
  }

  function flushPointerPreview(draft) {
    if (!draft || !draft.previewFrame) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(draft.previewFrame);
    draft.previewFrame = null;
    if (pointerDraft === draft && draft.active) updatePointerPreview(draft.lastX, draft.lastY);
  }

  function updatePointerPreview(clientX, clientY) {
    var draft = pointerDraft;
    if (!draft || !draft.active) return;
    draft.lastX = clientX;
    draft.lastY = clientY;
    var position = pointerPosition(clientX, clientY, draft);
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
    // 時間預覽 ghost 是「拖曳中」才該有的東西。手指還沒移動就畫，等於長按一滿 350ms 就有一塊比卡片還大的
    // 藍框蓋住卡片（欄寬只有 92px，時間＋日期＋標題整條塞不下＝被截斷），放開才收——真機上就是
    // 「跳出超大的時間、字超出框框、看不到資訊」。改成有位移才畫，長按放開進解鎖態時畫面只剩外框高亮＋把手。
    if (!draft.didDrag) {
      if (draft.ghost && draft.ghost.parentNode) draft.ghost.parentNode.removeChild(draft.ghost);
      return;
    }
    var ghost = ensurePointerGhost(draft, targetDay || draft.sourceDay);
    ghost.classList.toggle('is-invalid', !draft.preview.valid);
    var pixelsPerHour = calendarPixelsPerHour();
    var offset = calPx(interval.start * pixelsPerHour / 60);
    var height = Math.max(16, calPx(interval.end * pixelsPerHour / 60) - offset);
    if (draft.ghostOffset !== offset) { ghost.style.transform = 'translateY(' + offset + 'px)'; draft.ghostOffset = offset; }
    if (draft.ghostHeight !== height) { ghost.style.height = height + 'px'; draft.ghostHeight = height; }
    var timeText = draft.preview.valid ? labelForMinute(interval.start) + '–' + labelForMinute(interval.end) : '不能放在這裡';
    if (draft.ghostTimeText !== timeText) { ghost.querySelector('.ff-cal-pointer-time').textContent = timeText; draft.ghostTimeText = timeText; }
    var labelText = (draft.preview.date || draft.sourceDate) + (draft.mode === 'create' ? '・新增行程' : '・' + draft.title);
    if (draft.ghostLabelText !== labelText) { ghost.querySelector('strong').textContent = labelText; draft.ghostLabelText = labelText; }
    if (position.scroll) {
      // 自動捲動：門檻用容器高度百分比（react-beautiful-dnd 的做法，固定 px 在小螢幕上太窄），
      // 速度用二次 easing 並在「距真邊緣 8px」前就到頂速——使用者不必精準把手指貼在邊上。
      var containerHeight = position.scrollRect.height || (position.scrollRect.bottom - position.scrollRect.top) || 0;
      var edge = clamp(containerHeight * 0.12, POINTER_AUTOSCROLL_EDGE_MIN, POINTER_AUTOSCROLL_EDGE_MAX);
      var depth = 0;
      if (clientY < position.scrollRect.top + edge) depth = clientY - (position.scrollRect.top + edge);
      else if (clientY > position.scrollRect.bottom - edge) depth = clientY - (position.scrollRect.bottom - edge);
      var ratio = depth ? clamp(Math.abs(depth) / Math.max(1, edge - 8), 0, 1) : 0;
      var speed = ratio ? (depth < 0 ? -1 : 1) * Math.max(1, Math.round(POINTER_AUTOSCROLL_MAX * ratio * ratio)) : 0;
      draft.autoSpeed = clamp(speed, -POINTER_AUTOSCROLL_MAX, POINTER_AUTOSCROLL_MAX);
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
    var arming = { geometry: null };
    var position = pointerPosition(event.clientX, event.clientY, arming);
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
      minimumDuration: POINTER_SNAP,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      active: false,
      didDrag: false,
      immediate: !!source.immediate,
      card: source.card || null,
      captureTarget: source.captureTarget || event.target,
      timer: null,
      ghost: null,
      autoFrame: null,
      autoSpeed: 0,
      previewFrame: null,
      geometry: arming.geometry,
      title: item ? occurrenceTitle(item) : ''
    };
    // 手機：卡片本體一律要長按 500ms 才進拖曳，按下即拖會讓每次誤觸都變成改時間、連正常捲動都做不到。
    // 例外是把手（immediate）：手機上把手只有在「上一次手勢已結束、卡片進了 is-armed」之後才 render 出來，
    // touch-action:none 的鎖定時機合法，所以按下即拖，不必再長按一次。
    if (pointerDraft.pointerType === 'touch') {
      if (pointerDraft.immediate) activatePointerDraft(pointerDraft);
      else {
        if (pointerDraft.card) pointerDraft.card.classList.add('is-pressing');
        pointerDraft.timer = setTimeout(function () {
          if (pointerDraft && pointerDraft.pointerId === event.pointerId) activatePointerDraft(pointerDraft);
        }, POINTER_LONG_PRESS_MS);
      }
    }
  }

  document.addEventListener('pointerdown', function (event) {
    if (event.button != null && event.button !== 0) return;
    // 按在解鎖卡以外的任何地方＝退出解鎖態（含長按另一張卡）。
    if (state.armedId && !(event.target.closest && event.target.closest('.ff-cal-card.is-armed'))) {
      disarmCard();
      suppressNextCalendarClick();   // 這一下只退出解鎖態，什麼都不做；要再點第二次才執行原本的動作。
    }
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
      if (resizeItem && resizeItem.fine && (event.pointerType || 'mouse') === 'touch') event.preventDefault();
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
    if (slot && (event.pointerType || 'mouse') !== 'touch') {
      armPointerDraft(event, 'create', { captureTarget: slot, date: slot.dataset.date, dayId: slot.dataset.day });
    }
  });

  document.addEventListener('pointermove', function (event) {
    var draft = pointerDraft;
    if (!draft || draft.pointerId !== event.pointerId) return;
    draft.lastX = event.clientX;
    draft.lastY = event.clientY;
    var distance = Math.max(Math.abs(event.clientX - draft.startX), Math.abs(event.clientY - draft.startY));
    if (!draft.active && draft.pointerType === 'touch' && distance > POINTER_TOUCH_CANCEL_PX) {
      removePointerVisuals(draft);
      pointerDraft = null;
      return;
    }
    if (!draft.active && draft.pointerType !== 'touch' && distance > 4) activatePointerDraft(draft);
    if (!draft.active) return;
    event.preventDefault();
    // 第一次真的移動＝ghost 從無到有，同步畫出來（等下一幀會讓「開始拖」慢半拍）；之後才交給 rAF 節流。
    if (!draft.didDrag) updatePointerPreview(event.clientX, event.clientY);
    else schedulePointerPreview();
  }, { passive: false });

  function pointerRequest(draft, item) {
    var preview = draft.preview;
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

  function occurrenceRangeMs(item) {
    if (!item || !item.fine) return null;
    var start = Date.parse(item.fine.startAt), end = Date.parse(item.fine.endAt);
    return isFinite(start) && isFinite(end) ? { start: start, end: end } : null;
  }

  // 拖完只問一件事：**這張卡**的新時間有沒有壓到後面的行程？會的話才讓她選「只移這項／連動後面」。
  // 舊版是掃整天任意兩張相鄰卡有沒有重疊——她的資料本來就有同時段並排的卡（8/23、8/24、8/25 都有），
  // 於是不管拖到哪個空檔都回 true，變成每次移動都被逼按一次沒意義的決策。
  // 相鄰（前一項的結束 == 下一項的開始）不算重疊，只有嚴格重疊才問。
  function pointerNeedsDecision(transaction, itemId) {
    var items = transaction && transaction.afterSchedule && Array.isArray(transaction.afterSchedule.items) ?
      transaction.afterSchedule.items : [];
    var moved = null;
    for (var i = 0; i < items.length; i++) if (items[i] && items[i].id === itemId) moved = items[i];
    var movedRange = occurrenceRangeMs(moved);
    if (!movedRange) return false;
    return items.some(function (other) {
      if (!other || other.id === itemId) return false;
      var range = occurrenceRangeMs(other);
      // 嚴格重疊才算；貼齊（前一項結束 == 下一項開始）不算。
      return !!range && movedRange.start < range.end && range.start < movedRange.end;
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

  function renderPointerDecision() {
    var editor = state.editor;
    var item = editor && findOccurrence(editor.id);
    if (!editor || !item) return;
    var description = '這個時間會壓到後面的行程。'; 
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
    flushPointerPreview(draft);
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
    // 長按滿 500ms 但手指沒移動就放開＝不寫資料，讓這張卡進入解鎖態（模仿 iOS 內建行事曆：
    // 長按到把手浮出來，再拖把手改時長）。只有這一張卡會長出把手。
    if (!cancelled && draft.active && !draft.didDrag && draft.pointerType === 'touch' && draft.mode === 'move' && !draft.immediate && draft.itemId) {
      state.armedId = draft.itemId;
      state.suppressCardClick = draft.itemId;   // 這次 pointerup 後面跟著的 click 不該再開詳情
      setTimeout(function () { if (state.suppressCardClick === draft.itemId) state.suppressCardClick = false; }, 0);
      renderFineFlow();
      return;
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
      if (pointerNeedsDecision(transaction, item.id)) openPointerDecision(draft, item, transaction);
      else applyPointerTransaction(item, transaction);
    } catch (error) {
      if (typeof toast === 'function') toast(error && error.message || '無法建立這次時間調整');
    }
  }

  document.addEventListener('pointerup', function (event) { finishPointerDraft(event, false); });
  document.addEventListener('pointercancel', function (event) { finishPointerDraft(event, true); });
  document.addEventListener('lostpointercapture', function (event) { finishPointerDraft(event, true); });
  // iOS 鎖捲的唯一有效防線：pointermove 上的 preventDefault() 擋不住 iOS 捲動（捲動不是 pointer event 的
  // default action），而 touchmove 上的 preventDefault() 有效、且不限第一個 touchmove——只要在「進入捲動模式
  // 之前」呼叫即可。長按等待期間手指本來就靜止（動超過 10px 就取消長按），所以長按觸發時捲動模式還沒進入，
  // 這裡一定來得及。CSS 那邊在手勢進行中改 touch-action 是無效的（WebKit 在手勢開始時就鎖定了）。
  document.addEventListener('touchmove', function (event) {
    if (!pointerDraft || !pointerDraft.active) return;
    event.preventDefault();
  }, { passive: false });

  // 長按期間別讓 iOS 跳出選字／放大鏡／系統選單。
  document.addEventListener('contextmenu', function (event) {
    if (pointerDraft && pointerDraft.pointerType === 'touch') { event.preventDefault(); return; }
    if (state.armedId && event.target.closest && event.target.closest('.ff-cal-card.is-armed')) event.preventDefault();
  });

  // 捲動＝退出解鎖態。這裡刻意聽「使用者手勢」而不是 scroll 事件：進解鎖態本身要重繪一次日曆，
  // 重繪會還原捲動位置、程式化地打出一個 scroll 事件，聽 scroll 會讓解鎖態當場自己消失（真機才看得到）。
  function disarmOnUserScroll() { if (state.armedId && !pointerDraft) disarmCard(); }
  document.addEventListener('touchmove', disarmOnUserScroll, { passive: true });
  document.addEventListener('wheel', disarmOnUserScroll, { passive: true });

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
    if (event.key === 'Escape' && (state.createDraft || state.editor || state.selectedId || state.armedId)) {
      state.createDraft = null;
      state.editor = null;
      state.selectedId = null;
      state.armedId = null;
      if (uiStore) uiStore.dispatch({ type: 'ESCAPE' });
      renderFineFlow();
    }
  });

  // 把手拖曳＝自由高度，手指到哪就到哪（她要的不是兩段跳）。下限是半高，上限 92dvh。
  var grabDrag = null;

  function editorSheetBounds() {
    var viewport = (typeof window !== 'undefined' && window.innerHeight) || 800;
    return { min: Math.round(viewport * 0.5), max: Math.round(viewport * 0.92) };
  }

  function applyEditorSheetHeight() {
    if (typeof sh === 'undefined' || !sh || !state.editor) return;
    var bounds = editorSheetBounds();
    if (!state.editor.sheetH) { sh.style.removeProperty('max-height'); return; }
    sh.style.maxHeight = clamp(state.editor.sheetH, bounds.min, bounds.max) + 'px';
  }

  document.addEventListener('pointerdown', function (event) {
    var grab = event.target && event.target.closest && event.target.closest('.ff-grab');
    if (!grab || !state.editor) return;
    grabDrag = { y: event.clientY, base: sh.getBoundingClientRect().height, moved: false };
    if (grab.setPointerCapture && event.pointerId != null) { try { grab.setPointerCapture(event.pointerId); } catch (err) { /* 舊瀏覽器沒有就算了 */ } }
  }, true);

  document.addEventListener('pointermove', function (event) {
    if (!grabDrag || !state.editor) return;
    var delta = grabDrag.y - event.clientY;   // 往上拖＝變高
    if (!grabDrag.moved && Math.abs(delta) < 4) return;
    grabDrag.moved = true;
    event.preventDefault();
    var bounds = editorSheetBounds();
    state.editor.sheetH = clamp(Math.round(grabDrag.base + delta), bounds.min, bounds.max);
    sh.style.maxHeight = state.editor.sheetH + 'px';
  }, true);

  document.addEventListener('pointerup', function () { grabDrag = null; }, true);
  document.addEventListener('pointercancel', function () { grabDrag = null; }, true);

  // 小視窗：點背板或按 Esc＝取消
  document.addEventListener('click', function (event) {
    if (event.target && event.target.matches && event.target.matches('[data-ff-mini]')) {
      if (state.editor) state.editor.confirmTodoDelete = null;
      closeMiniConfirm();
      resetSwipedTodoRow();
    }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !document.querySelector('[data-ff-mini]')) return;
    event.stopPropagation();
    if (state.editor) state.editor.confirmTodoDelete = null;
    closeMiniConfirm();
    resetSwipedTodoRow();
  }, true);

  // 未存就想離開（✕／取消／點背景）＝先問。沒改過任何東西就直接放行，不囉嗦。
  document.addEventListener('click', function (event) {
    if (!state.editor || state.editor.confirmDiscard || state.editor.confirmDelete || state.editor.confirmTodoDelete || state.editor.confirmRipple || state.editor.pointerCompact) return;
    var closer = event.target && event.target.closest && event.target.closest('[data-action="close"]');
    if (!closer || !closer.closest('.ff-editor-sheet')) return;
    var changes = editorPendingChanges(state.editor);
    if (!changes.length) return;
    event.preventDefault();
    event.stopPropagation();
    state.editor.confirmDiscard = changes;
    renderEditor();
  }, true);

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
      state.editor.note = event.target.value;
      return;
    } else if (event.target.matches('[data-ff-todo-edit]')) {
      var editedTodo = (state.editor.todos || []).find(function (todo) { return todo.id === event.target.dataset.todo; });
      if (editedTodo) editedTodo.text = event.target.value;
      return;
    } else if (event.target.matches('[data-ff-place-maps]')) {
      if (state.editor.placeCard) state.editor.placeCard.mapsUrl = event.target.value;
      else state.editor.customMapsUrl = event.target.value;
      return;
    } else if (event.target.matches('[data-ff-date]')) {
      var previousDate = state.editor.date;
      state.editor.date = event.target.value;
      // 結束日期跟著整段平移（原本同日就同日，原本跨午夜就繼續跨）。
      state.editor.endDate = state.editor.endDate === previousDate ? event.target.value : addDays(event.target.value, 1);
      if (state.editor.coarseVisible) {
        state.editor.coarseDay = dayIdForDate(state.editor.date);
        state.editor.coarseSlot = slotFromTime(state.editor.start);
      }
    } else if (event.target.matches('[data-ff-start]')) {
      state.editor.start = event.target.value;
      state.editor.end = addMinutesToTime(state.editor.start, state.editor.durationMin);
      state.editor.endDate = state.editor.end <= state.editor.start ? addDays(state.editor.date, 1) : state.editor.date;
      if (state.editor.coarseVisible) state.editor.coarseSlot = slotFromTime(state.editor.start);
      var endInput = sh.querySelector('[data-ff-end]');
      if (endInput) endInput.value = state.editor.end;
      syncTimePicker(sh.querySelector('.ff-timepick[data-ff-timepick="data-ff-end"]'), state.editor.end);   // 結束時間跟著平移，軌道也要跟上（只改視覺、不再 dispatch）
    } else if (event.target.matches('[data-ff-end]')) {
      state.editor.end = event.target.value;
      recomputeEditorDuration();
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
    if (event.target.matches('[data-ff-coarse]')) {
      state.editor.coarseVisible = event.target.checked;
      if (state.editor.coarseVisible) state.editor.coarseDay = dayIdForDate(state.editor.date);
      renderEditor();
      return;
    }
    else if (event.target.matches('[data-ff-coarse-day]')) { state.editor.coarseDay = event.target.value; renderEditor(); return; }
    else if (event.target.matches('[data-ff-coarse-slot]')) { state.editor.coarseSlot = event.target.value; renderEditor(); return; }
    else if (event.target.matches('[data-ff-category]')) { state.editor.category = event.target.value; return; }
    else return;
    state.editor.notice = '';
    runPreview();
  });

  document.addEventListener('toggle', function (event) {
    if (!state.editor || !event.target.matches) return;
    if (event.target.matches('.ff-advanced')) state.editor.advancedOpen = event.target.open;
    else if (event.target.matches('.ff-rules')) state.editor.rulesOpen = event.target.open;
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
    initTimePickers: initTimePickers,
    renderTimePicker: renderTimePicker,
    pointerMath: {
      snapMinute: snapPointerMinute,
      minuteAtPointer: minuteAtPointer,
      columnAt: calendarColumnAt,
      interval: pointerInterval,
      labelForMinute: labelForMinute,
      needsDecision: pointerNeedsDecision
    },
    resetTransient: function () {
      state.createDraft = null;
      state.selectedId = null;
      state.armedId = null;
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
