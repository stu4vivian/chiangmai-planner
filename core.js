// core.js — 清邁行程工具的純邏輯。無 DOM。瀏覽器當全域 CNXCore、Node 當模組。
(function (root) {
  'use strict';

  var SCHEMA_VERSION = 19;

  // 安全淨化（堵同步/匯入設定欄 stored-XSS）：顏色只認 #hex，否則退預設；文字標籤剝 HTML 特殊字元。
  var COLOR_FALLBACK = '#9b9b9b';
  function safeColor(c, fallback) { return (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : fallback; }
  function safeLabel(s) { return (typeof s === 'string') ? s.replace(/[<>"'&]/g, '') : s; }
  function sanitizeTypeColors(tc) {
    var out = {};
    if (tc && typeof tc === 'object') Object.keys(tc).forEach(function (k) { out[k] = safeColor(tc[k], COLOR_FALLBACK); });
    return out;
  }
  function sanitizeTypeIcons(ti) {
    var out = {};
    if (ti && typeof ti === 'object') Object.keys(ti).forEach(function (k) { out[k] = safeLabel(ti[k]); });
    return out;
  }

  var CAT_ROLES = { normal:1, lodging:1, other:1 };
  function safeRole(r) { return CAT_ROLES[r] ? r : 'normal'; }
  function safeKey(k) { return (typeof k === 'string' && /^[\w一-鿿/\-]+$/.test(k)) ? k : null; }
  function safeStr(s) { return (typeof s === 'string') ? safeLabel(s) : ''; }

  // 種子預設（key＝現有卡片存的中文，故既有資料零遷移）
  var CAT_DEFAULT = [
    { key:'食物', label:'食物', color:'#e8623a', icon:'🍜', role:'normal', desc:'' },
    { key:'景點', label:'景點', color:'#3a9aa0', icon:'🛕', role:'normal', desc:'' },
    { key:'娛樂', label:'娛樂', color:'#d98a2b', icon:'🎉', role:'normal', desc:'' },
    { key:'逛街', label:'逛街', color:'#d4756b', icon:'🛍️', role:'normal', desc:'' },
    { key:'住宿', label:'住宿', color:'#5a7fb0', icon:'🏨', role:'lodging', desc:'' },
    { key:'其他', label:'其他', color:'#9b9b9b', icon:'📍', role:'other', desc:'' }
  ];
  var BAND_PALETTE = ['#5a9367', '#d98a2b', '#c8623e', '#9a6e25', '#6a8caf'];

  function defaultPer(type, trip) {
    if (trip && Array.isArray(trip.categories)) return roleOf(trip, type) === 'lodging' ? 'shared' : 'person';
    return type === '住宿' ? 'shared' : 'person';   // 無 trip 時退舊行為（normalizePlace 的 1-arg 呼叫）
  }

  // 由帶 amount/low/high 的物件取單一金額：有 amount 直用，否則由 low/high 推中位數（只有一邊則用那邊）
  function midOf(o) {
    if (!o || typeof o !== 'object') return null;
    if (typeof o.amount === 'number') return o.amount;
    var l = (typeof o.low === 'number') ? o.low : null;
    var h = (typeof o.high === 'number') ? o.high : null;
    if (l == null && h == null) return null;
    if (l == null) return h;
    if (h == null) return l;
    return Math.round((l + h) / 2);
  }

  // 把「事實價格」依使用者門檻、用區間中位數機械歸帶（乙案）。priceFact: {lowThb, highThb}（每人 THB；單一金額則 low==high）。
  // 無數字金額（只有符號或 null）→ 'unknown'。中位數＝衍生事實，不是主觀判斷；門檻與取捨仍是使用者的。
  // 【保留】Task 19 決策：classifyPriceBand＋settings.priceBands（THB 來源）目前無 UI 消費者（UI 走 priceBandOf/TRIP.priceBands 的 NT$），
  //   但切片2「即時入庫 ฿ 預填」會用到——刻意保留、勿默刪（已有測試覆蓋）。
  function classifyPriceBand(priceFact, bands) {
    bands = (bands && typeof bands === 'object') ? bands : {};
    var mid = (typeof bands.mid === 'number') ? bands.mid : 200;
    var high = (typeof bands.high === 'number') ? bands.high : 500;
    if (!priceFact || typeof priceFact.lowThb !== 'number' || typeof priceFact.highThb !== 'number') return 'unknown';
    var lo = Math.min(priceFact.lowThb, priceFact.highThb);
    var hi = Math.max(priceFact.lowThb, priceFact.highThb);
    var midpoint = Math.round((lo + hi) / 2);
    return (midpoint <= mid) ? 'budget' : (midpoint <= high ? 'mid' : 'high');
  }

  var WD_ZH = ['日','一','二','三','四','五','六'];

  // 總覽聚合用：把細時段（slot）歸到「早／午／晚」三段。snack 點心歸午後段；stay 不屬任何 period（住宿不進總覽）。
  var OVERVIEW_PERIODS = [
    { key: '早', slots: ['breakfast', 'am'] },
    { key: '午', slots: ['lunch', 'afternoon', 'snack'] },
    { key: '晚', slots: ['evening', 'dinner', 'night'] }
  ];
  var PERIOD_KEYS = OVERVIEW_PERIODS.map(function (x) { return x.key; });   // 段名單一來源（防三處 ['早','午','晚'] 漂移）
  function slotPeriod(slotKey) {
    for (var i = 0; i < OVERVIEW_PERIODS.length; i++) {
      if (OVERVIEW_PERIODS[i].slots.indexOf(slotKey) >= 0) return OVERVIEW_PERIODS[i].key;
    }
    return null;
  }
  // 段內排序鍵：早餐(0)排在上午活動(1)之前…；不在任何段回 99。
  function slotOrderInPeriod(slotKey) {
    for (var i = 0; i < OVERVIEW_PERIODS.length; i++) {
      var idx = OVERVIEW_PERIODS[i].slots.indexOf(slotKey);
      if (idx >= 0) return idx;
    }
    return 99;
  }

  // 清邁預設 trip：colors 取自 HTML 舊 AREAS/STAY_CLASS
  var CM_TRIP_DEFAULT = {
    name: '清邁 2026', startDate: '2026-08-22', endDate: '2026-09-01', currency: 'NTD',
    zones: [
      { key:'old', label:'古城內', color:'#e8a13a', areaLabels:['古城','北/東北'] },
      { key:'nim', label:'尼曼',   color:'#6a8caf', areaLabels:['尼曼/西'] },
      { key:'mkt', label:'夜市區', color:'#5a9367', areaLabels:['濱河/東'] } ],
    areas: [
      { label:'古城',   color:'#e8a13a', lat:18.7880, lng:98.9860 },
      { label:'北/東北', color:'#5a9367', lat:18.8080, lng:98.9800 },
      { label:'尼曼/西', color:'#6a8caf', lat:18.7960, lng:98.9660 },
      { label:'濱河/東', color:'#b07aa1', lat:18.7900, lng:99.0010 },
      { label:'南郊',   color:'#c98a4b', lat:18.7150, lng:99.0350 },
      { label:'東郊',   color:'#7a9b6a', lat:18.7450, lng:99.1150 },
      { label:'其他',   color:'#9b9b9b', lat:null,    lng:null    } ],
    mapCenter: { lat:18.7888, lng:98.9935, zoom:13 },
    cuisines: ['泰北','西式','清淡'],
    priceBands: { mid:200, high:400, per:'person', currency:'NTD', labels:['便宜','中高','高價'] }
  };
  // 淨化單一 zone/area：color 限 #hex（退預設）、label 剝 HTML 特殊字元；其餘欄位原樣帶過。
  function safeZone(z) {
    z = (z && typeof z === 'object') ? z : {};
    var out = Object.assign({}, z);
    out.label = safeLabel(z.label);
    out.color = safeColor(z.color, COLOR_FALLBACK);
    return out;
  }
  function safeCategory(c) {
    c = (c && typeof c === 'object') ? c : {};
    var key = safeKey(c.key); if (!key) return null;
    return { key:key, label:safeStr(c.label) || key, color:safeColor(c.color, COLOR_FALLBACK),
      icon:safeStr(c.icon) || '📍', role:safeRole(c.role), desc:safeStr(c.desc) };
  }
  function safeRegion(r) {
    r = (r && typeof r === 'object') ? r : {};
    var key = safeKey(r.key); if (!key) return null;
    var out = { key:key, label:safeStr(r.label) || key, color:safeColor(r.color, COLOR_FALLBACK),
      lat:(typeof r.lat === 'number') ? r.lat : null, lng:(typeof r.lng === 'number') ? r.lng : null,
      desc:safeStr(r.desc) };
    return out;
  }
  function safeCuisine(c) {
    c = (c && typeof c === 'object') ? c : {};
    var key = safeKey(c.key); if (!key) return null;
    return { key:key, label:safeStr(c.label) || key, desc:safeStr(c.desc) };
  }
  function normPriceBands(pb) {
    pb = (pb && typeof pb === 'object') ? pb : {};
    var tiers = Array.isArray(pb.tiers) ? pb.tiers.map(function (t) {
      t = t || {};
      return { upTo:(typeof t.upTo === 'number' && t.upTo >= 0) ? t.upTo : null,
        label:safeLabel(t.label) || '—', color:safeColor(t.color, COLOR_FALLBACK) };
    }) : null;
    if (!tiers || !tiers.length) {   // 無 tiers → 由舊 {mid,high,labels} 轉，再無就預設 200/400
      var mid = (typeof pb.mid === 'number') ? pb.mid : 200, high = (typeof pb.high === 'number') ? pb.high : 400;
      var labs = Array.isArray(pb.labels) ? pb.labels : ['便宜','中高','高價'];
      tiers = [ { upTo:mid, label:safeLabel(labs[0]) || '便宜', color:BAND_PALETTE[0] },
                { upTo:high, label:safeLabel(labs[1]) || '中高', color:BAND_PALETTE[1] },
                { upTo:null, label:safeLabel(labs[2]) || '高價', color:BAND_PALETTE[2] } ];
    }
    // 排序：upTo 升冪、null（無上限）永遠最後
    tiers.sort(function (a, b) { if (a.upTo == null && b.upTo == null) return 0; if (a.upTo == null) return 1; if (b.upTo == null) return -1; return a.upTo - b.upTo; });
    return { per:(pb.per === 'shared') ? 'shared' : 'person', currency:safeStr(pb.currency) || 'NTD', tiers:tiers };
  }
  CM_TRIP_DEFAULT.categories = CAT_DEFAULT;
  CM_TRIP_DEFAULT.regions = CM_TRIP_DEFAULT.areas.map(function (a) {
    return { key:a.label, label:a.label, color:a.color, lat:a.lat, lng:a.lng, desc:'' };
  });
  CM_TRIP_DEFAULT.cuisinesV18 = CM_TRIP_DEFAULT.cuisines.map(function (c) { return { key:c, label:c, desc:'' }; });
  // 常用 emoji 種子＝她資料用過的（🛕🧘🍹🏋️🚗💼🗝️💤）＋清邁行程高頻；可在設定增刪
  CM_TRIP_DEFAULT.emojiListDefault = ['🛕','⛩️','☕','🍜','🍲','🥘','🍢','🌶️','🧋','🍺','🍹','🌃','💆','🧘','🏋️','🛍️','🏨','🗝️','🚗','🛵','💼','🌅','♨️','💤','📍','⭐'];
  CM_TRIP_DEFAULT.priceBandsV18 = normPriceBands(CM_TRIP_DEFAULT.priceBands);
  // 「和色」初始色盤（Vivian 2026-06-21 從和色庫挑定）：normalizeTrip 一次性套用 by key，套完標記 paletteWashoku；之後她在設定改色不會被蓋
  var WASHOKU_REGION = { '古城':'#ed784a', '北/東北':'#00aa90', '尼曼/西':'#58b2dc', '濱河/東':'#4c6cb3', '南郊':'#f8b500', '東郊':'#90b44b', '其他':'#d7c4bb' };
  var WASHOKU_CAT = { '食物':'#fc9f4d', '景點':'#7ebeab', '娛樂':'#e95464', '逛街':'#f4b3c2', '住宿':'#6a9bd1', '其他':'#d7c4bb' };
  // tier 四色資料化（Vivian 可在設定改）：fg＝章/字色、bg＝tbadge 淡底；預設＝她挑定的和色，須與 styles.css :root 的 --tN-fg/bg 一致（CSS 值為無 JS 後備）
  var TIER_COLORS_DEFAULT = {
    t1:{fg:'#b7282e', bg:'#f6dcdc'}, t2:{fg:'#ed6d3d', bg:'#fbe2d5'},
    t3:{fg:'#3b7960', bg:'#dae9e2'}, t4:{fg:'#6e6f72', bg:'#e6e6e9'}
  };
  function normTierColors(tc) {
    tc = (tc && typeof tc === 'object') ? tc : {};
    var out = {};
    ['t1','t2','t3','t4'].forEach(function (k) {
      var v = (tc[k] && typeof tc[k] === 'object') ? tc[k] : {};
      out[k] = { fg: safeColor(v.fg, TIER_COLORS_DEFAULT[k].fg), bg: safeColor(v.bg, TIER_COLORS_DEFAULT[k].bg) };
    });
    return out;
  }
  function normalizeTrip(t) {
    t = (t && typeof t === 'object') ? t : {};
    var d = CM_TRIP_DEFAULT;
    var trip = {
      name: t.name || d.name, startDate: t.startDate || d.startDate, endDate: t.endDate || d.endDate,
      currency: t.currency || d.currency,
      mapCenter: (t.mapCenter && typeof t.mapCenter.lat === 'number') ? t.mapCenter : Object.assign({}, d.mapCenter),
      // 任何非空 priceBands（含舊 {mid,high,labels}）都轉發給 normPriceBands 轉 tiers；缺席/空 {} 才退種子預設（防舊自訂價位遺失）
      priceBands: normPriceBands((t.priceBands && typeof t.priceBands === 'object' && Object.keys(t.priceBands).length) ? t.priceBands : d.priceBandsV18),
      categories: (Array.isArray(t.categories) && t.categories.length) ? t.categories.map(safeCategory).filter(Boolean) : JSON.parse(JSON.stringify(d.categories)),
      regions: (Array.isArray(t.regions) && t.regions.length) ? t.regions.map(safeRegion).filter(Boolean) : JSON.parse(JSON.stringify(d.regions)),
      cuisinesList: (Array.isArray(t.cuisinesList) && t.cuisinesList.length) ? t.cuisinesList.map(safeCuisine).filter(Boolean) : JSON.parse(JSON.stringify(d.cuisinesV18)),
      emojiList: (Array.isArray(t.emojiList) && t.emojiList.length) ? t.emojiList.filter(function(e){return typeof e==='string'&&e.trim();}).slice(0,80) : JSON.parse(JSON.stringify(d.emojiListDefault)),
      tierColors: normTierColors(t.tierColors),   // tier 四色（缺席→預設和色；app 層注入 CSS 變數 --tN-fg/bg）
      paletteWashoku: !!t.paletteWashoku   // 和色初始色盤是否已套（app 層 applyWashokuPalette 一次性套用、見下）；此處僅保留旗標、不在淨化時動色（免污染 migrate/預設）
    };
    return trip;
  }
  // 一次性把和色初始色盤（Vivian 挑定）套進 regions/categories（by key）；已套過(flag)即跳過，回傳是否有變動（app 載入時呼叫、有變動才 save；之後她在設定改色 flag 已 true 不會被蓋）
  function applyWashokuPalette(trip) {
    if (!trip || trip.paletteWashoku) return false;
    (trip.regions || []).forEach(function (r) { if (WASHOKU_REGION[r.key]) r.color = WASHOKU_REGION[r.key]; });
    (trip.categories || []).forEach(function (c) { if (WASHOKU_CAT[c.key]) c.color = WASHOKU_CAT[c.key]; });
    trip.paletteWashoku = true;
    return true;
  }
  function deriveDays(trip) {
    var out = [];
    var d = new Date(trip.startDate + 'T00:00:00Z'), end = new Date(trip.endDate + 'T00:00:00Z');
    while (d <= end) {
      var mm = d.getUTCMonth() + 1, dd = d.getUTCDate();
      out.push({ id: ('0'+mm).slice(-2) + ('0'+dd).slice(-2), label: mm + '/' + dd, wd: WD_ZH[d.getUTCDay()], wdNum: d.getUTCDay() });
      d = new Date(d.getTime() + 86400000);
    }
    return out;
  }
  function normSlotMeta(s) {
    if (!s || !s.day || !s.slot) return null;
    var backups = []; (Array.isArray(s.backups) ? s.backups : []).forEach(function (id) {
      if (id && backups.indexOf(id) < 0 && backups.length < 2) backups.push(id); });
    var out = { id: s.day + '_' + s.slot, day: s.day, slot: s.slot,
      tentative: !!s.tentative, pk: !!s.pk, backups: backups };
    if (!out.tentative && !out.pk && !out.backups.length) return null;   // 空 meta 不留
    return out;
  }

  // 從 Google Maps 連結／字串解析座標。只認「已含座標」的長連結與裸座標；短連結(goo.gl)回 null。
  function parseLatLngFromMapsUrl(url) {
    if (typeof url !== 'string') return null;
    var s = url.trim();
    if (!s) return null;
    function mk(a, b) {
      var lat = parseFloat(a), lng = parseFloat(b);
      if (!isFinite(lat) || !isFinite(lng)) return null;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      return { lat: lat, lng: lng };
    }
    var m;
    m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);            // /@lat,lng
    if (m) return mk(m[1], m[2]);
    m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);         // !3dlat!4dlng
    if (m) return mk(m[1], m[2]);
    m = s.match(/[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/); // ?q=lat,lng（容許逗號後空白）
    if (m) return mk(m[1], m[2]);
    m = s.match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/); // 裸 "lat, lng"
    if (m) return mk(m[1], m[2]);
    return null;
  }

  // 卡片是否通過篩選。三個集合（Set，有 .size/.has）：空集合＝該維度不篩。
  function passFilters(p, fTypes, fAreas, fTiers) {
    p = p || {};
    if (fTypes && fTypes.size && !fTypes.has(p.type)) return false;
    if (fAreas && fAreas.size && !fAreas.has(p.area)) return false;
    if (fTiers && fTiers.size && !fTiers.has(p.tier)) return false;
    return true;
  }

  function normalizePlace(p) {
    p = p || {};
    var type = p.type || '其他';
    var cost = (p.cost && typeof p.cost === 'object') ? p.cost : {};
    var out = {
      id: p.id,
      name: p.name || '未命名地點',
      en: p.en || '',
      icon: p.icon || '',
      type: type,
      area: p.area || '其他',
      lat: (typeof p.lat === 'number') ? p.lat : null,
      lng: (typeof p.lng === 'number') ? p.lng : null,
      hours: p.hours || '',
      price: p.price || '',
      note: p.note || '',
      tentative: p.tentative === true,
      tier: (p.tier === 1 || p.tier === 2 || p.tier === 3 || p.tier === 4) ? p.tier : null,
      placeId: (typeof p.placeId === 'string' && p.placeId) ? p.placeId : null,
      cid: (typeof p.cid === 'string' && p.cid) ? p.cid : null,
      cost: {
        amount: midOf(cost),
        per: (cost.per === 'shared' || cost.per === 'person') ? cost.per : defaultPer(type)
      }
    };
    out.hideInOverview = (p.hideInOverview === true);   // 全手動：只有顯式 true 才藏，無 type 自動藏
    out.cuisine = (typeof p.cuisine === 'string' && p.cuisine) ? p.cuisine : null;
    out.mapsUrl = (typeof p.mapsUrl === 'string') ? p.mapsUrl : '';
    if (Array.isArray(p.closedDays)) out.closedDays = p.closedDays.filter(function(n){return typeof n === 'number' && n % 1 === 0 && n >= 0 && n <= 6;});
    if (Array.isArray(p.openSlots)) out.openSlots = p.openSlots.slice();
    // 缺結構欄位時，從 hours 文字推導（顯式欄位優先，空陣列＝無資訊不強塞）
    if (!(Array.isArray(out.closedDays) && out.closedDays.length) && typeof out.hours === 'string' && out.hours) {
      var cd = closedDaysFromText(out.hours);
      if (cd.length) out.closedDays = cd;
    }
    // 「只營業在某些天」（夜市/週末市集）→ 反推其餘天為公休（Vivian #5：週六夜市排到別天要⚠️）
    if (!(Array.isArray(out.closedDays) && out.closedDays.length) && typeof out.hours === 'string' && out.hours) {
      var od = openDaysFromText(out.hours);
      if (od && od.length && od.length < 7) out.closedDays = [0, 1, 2, 3, 4, 5, 6].filter(function (d) { return od.indexOf(d) < 0; });
    }
    if (!(Array.isArray(out.openSlots) && out.openSlots.length) && typeof out.hours === 'string' && out.hours) {
      var os = openSlotsFromHours(out.hours);
      if (os && os.length) out.openSlots = os;
    }
    if (typeof p.addedAt === 'string' && p.addedAt) out.addedAt = p.addedAt;
    return out;
  }

  function migManual(m) {
    if (!m) return null;
    return {
      id: m.id,
      label: m.label,
      type: safeLabel(m.type) || '其他',
      per: (m.per === 'shared') ? 'shared' : 'person',
      qty: (typeof m.qty === 'number' && m.qty > 0) ? m.qty : 1,
      amount: midOf(m)
    };
  }

  function migrateVersion(v, zoneMap) {
    v = v || {};
    var plan = (Array.isArray(v.plan) ? v.plan : []).map(function (e) {
      if (!e || !e.placeId) return null;
      var o = { id: e.id, placeId: e.placeId, day: e.day, slot: e.slot };
      if (typeof e.startTime === 'string' && e.startTime) o.startTime = e.startTime;
      return o;
    }).filter(Boolean);
    var base = (Array.isArray(v.base) ? v.base : []).map(function (s) {
      if (!s) return null;
      var region = s.region || (zoneMap && zoneMap[s.zone]) || s.zone || '';
      return {
        id: s.id, fromDay: s.fromDay, toDay: s.toDay, region: region,
        hotelPlaceId: (typeof s.hotelPlaceId === 'string' && s.hotelPlaceId) ? s.hotelPlaceId : null
      };
    }).filter(Boolean);
    var slotMeta = (Array.isArray(v.slotMeta) ? v.slotMeta : []).map(normSlotMeta).filter(Boolean);
    return { id: v.id, name: v.name || '版本', plan: plan, base: base, slotMeta: slotMeta };
  }

  function migrate(db) {
    db = db || {};
    var out = {
      schemaVersion: SCHEMA_VERSION,
      trip: normalizeTrip(db.trip),
      places: Array.isArray(db.places) ? db.places.slice() : [],
      manualLines: (Array.isArray(db.manualLines) ? db.manualLines : []).map(migManual).filter(Boolean),
      settings: (db.settings && typeof db.settings === 'object') ? Object.assign({}, db.settings) : {},
      versions: [],
      activeVersionId: null
    };
    if (typeof out.settings.people !== 'number') out.settings.people = 2;
    if (!out.settings.priceBands || typeof out.settings.priceBands !== 'object') {
      out.settings.priceBands = { mid: 200, high: 500, per: 'person', currency: 'THB' };
    }

    // v17→v18：舊 base.zone 詞彙映射到 region key
    var zoneMap = {};
    (Array.isArray(db.trip && db.trip.zones) ? db.trip.zones : []).forEach(function (z) {
      if (!z || !z.label) return;
      var target = (Array.isArray(z.areaLabels) && z.areaLabels.length) ? z.areaLabels[0] : z.label;  // 取首個 areaLabel 作 region key（一段只屬一區）
      target = safeLabel(target);                       // 邊界淨化：剝 HTML 特殊字元（同步/匯入髒資料）
      if (!target) return;                              // 淨化後為空 → 跳過此 zone
      zoneMap[z.label] = target;                        // 注意：map 的 key 用原始 z.label 以對應 base[].zone；value 是淨化後的 region key
      // 自訂 zone（target 不在 regions）→ 當新 region 補進清單
      if (safeKey(target) && !findByKey(out.trip.regions, target)) {
        out.trip.regions.push({ key: target, label: target, color: safeColor(z.color, COLOR_FALLBACK), lat: null, lng: null, desc: '' });
      }
    });

    // v17→v18：舊 typeColors/typeIcons 折入 categories 的 color/icon
    var oldTC = sanitizeTypeColors(db.typeColors), oldTI = sanitizeTypeIcons(db.typeIcons || {});
    out.trip.categories.forEach(function (c) {
      if (oldTC[c.key]) c.color = oldTC[c.key];
      if (oldTI[c.key]) c.icon = oldTI[c.key];
    });

    if (Array.isArray(db.versions) && db.versions.length) {
      out.versions = db.versions.map(function (v) { return migrateVersion(v, zoneMap); });
    } else {
      var legacyPlan = [];
      var migCount = 0;
      (Array.isArray(db.plan) ? db.plan : []).forEach(function (e) {
        if (!e) return;
        if (e.placeId) {
          var o = { id: e.id, placeId: e.placeId, day: e.day, slot: e.slot };
          if (typeof e.startTime === 'string' && e.startTime) o.startTime = e.startTime;
          legacyPlan.push(o);
        } else if (e.label || e.placeholder) {
          var nid = 'mig_' + (migCount++);
          out.places.push({ id: nid, name: e.label || '待定', en: '', type: e.type || '其他', area: '其他', lat: null, lng: null, hours: '', price: '', note: '' });
          legacyPlan.push({ id: e.id, placeId: nid, day: e.day, slot: e.slot });
        }
      });
      out.versions = [ { id: 'v1', name: 'A 版', plan: legacyPlan, base: [], slotMeta: [] } ];
    }

    if (!out.versions.length) out.versions = [ { id: 'v1', name: 'A 版', plan: [], base: [], slotMeta: [] } ];
    var ids = out.versions.map(function (v) { return v.id; });
    out.activeVersionId = (db.activeVersionId === null) ? null :
      ((db.activeVersionId && ids.indexOf(db.activeVersionId) >= 0) ? db.activeVersionId : out.versions[0].id);

    out.places = out.places.map(normalizePlace);
    return out;
  }

  function expandForScope(amount, per, people, scope) {
    people = (typeof people === 'number' && people > 0) ? people : 2;
    var a = (typeof amount === 'number') ? amount : 0;
    var f;
    if (per === 'shared') f = (scope === 'perPerson') ? (1 / people) : 1;
    else f = (scope === 'perPerson') ? 1 : people;
    return a * f;
  }

  function occurrenceContribs(plan, places) {
    var byId = {};
    (places || []).forEach(function (p) { byId[p.id] = p; });
    var out = [];
    (plan || []).forEach(function (e) {
      var p = byId[e.placeId];
      if (!p || !p.cost || typeof p.cost.amount !== 'number') return;
      out.push({
        type: p.type || '其他',
        per: (p.cost.per === 'shared' ? 'shared' : 'person'),
        amount: p.cost.amount, label: p.name, day: e.day, slot: e.slot, placeId: p.id
      });
    });
    return out;
  }

  function manualContribs(manualLines) {
    var out = [];
    (manualLines || []).forEach(function (m) {
      if (typeof m.amount !== 'number') return;
      var qty = (typeof m.qty === 'number' && m.qty > 0) ? m.qty : 1;
      out.push({
        type: m.type || '其他',
        per: (m.per === 'shared' ? 'shared' : 'person'),
        amount: m.amount * qty,
        label: m.label || '手動花費', qty: qty, manualId: m.id
      });
    });
    return out;
  }

  function rollupBudget(plan, places, manualLines, settings, trip) {
    var people = (settings && typeof settings.people === 'number' && settings.people > 0) ? settings.people : 2;
    var cats = (trip && Array.isArray(trip.categories) && trip.categories.length) ? trip.categories : CAT_DEFAULT;
    var order = cats.map(function (c) { return c.key; });
    var otherKey = (cats.filter(function (c) { return c.role === 'other'; })[0] || { key:'其他' }).key;
    var contribs = occurrenceContribs(plan, places).concat(manualContribs(manualLines));
    var byType = {};
    order.forEach(function (t) { byType[t] = { trip:0, perPerson:0, items: [] }; });
    contribs.forEach(function (c) {
      var t = byType[c.type] ? c.type : otherKey;
      byType[t].trip += expandForScope(c.amount, c.per, people, 'trip');
      byType[t].perPerson += expandForScope(c.amount, c.per, people, 'perPerson');
      byType[t].items.push(c);
    });
    var total = { trip:0, perPerson:0 };
    order.forEach(function (t) { total.trip += byType[t].trip; total.perPerson += byType[t].perPerson; });
    return { byType: byType, total: total, people: people, order: order };
  }

  function scheduledPlaceIds(plan) {
    var s = {};
    (plan || []).forEach(function (e) { if (e && e.placeId) s[e.placeId] = true; });
    return Object.keys(s);
  }
  function isScheduled(placeId, plan) {
    return (plan || []).some(function (e) { return e && e.placeId === placeId; });
  }

  // ── 查表 helper（key→label/color/icon/role）──────────────────────────────────
  function findByKey(list, key) { for (var i = 0; i < (list||[]).length; i++) if (list[i].key === key) return list[i]; return null; }
  function catLabel(trip, key)  { var c = findByKey(trip.categories, key); return c ? c.label : key; }
  function catColor(trip, key)  { var c = findByKey(trip.categories, key); return c ? c.color : COLOR_FALLBACK; }
  function catIcon(trip, key)   { var c = findByKey(trip.categories, key); return c ? c.icon : '📍'; }
  function roleOf(trip, key)    { var c = findByKey(trip.categories, key); return c ? c.role : 'normal'; }
  function regionLabel(trip, key) { var r = findByKey(trip.regions, key); return r ? r.label : (key || '其他'); }
  function regionColor(trip, key) { var r = findByKey(trip.regions, key); return r ? r.color : COLOR_FALLBACK; }
  function regionOf(trip, key)    { return findByKey(trip.regions, key); }
  function cuisineLabel(trip, key) { var c = findByKey(trip.cuisinesList, key); return c ? c.label : key; }

  // 吃 trip.priceBands（含 tiers）；由低到高走訪、回第一個 amount<=upTo（或 upTo===null）的段標籤
  function priceBandOf(amount, pb) {
    if (amount == null || !Number.isFinite(amount) || !pb || !Array.isArray(pb.tiers) || !pb.tiers.length) return null;
    for (var i = 0; i < pb.tiers.length; i++) {
      var up = pb.tiers[i].upTo;
      if (up == null || amount <= up) return pb.tiers[i].label;
    }
    return pb.tiers[pb.tiers.length - 1].label;   // 防呆 backstop：未經 normPriceBands 正規化（無 null 末段）的 tiers，金額超出所有 upTo → 落最後段
  }
  function passLibFilters(p, f, ctx) {
    if (!passFilters(p, f.types, f.areas, f.tiers)) return false;    // 沿用 type/area/tier
    if (f.bands && f.bands.size) {
      var b = priceBandOf(p.cost ? p.cost.amount : null, ctx.bands);
      if (!b || !f.bands.has(b)) return false;
    }
    if (f.cuisines && f.cuisines.size && (!p.cuisine || !f.cuisines.has(p.cuisine))) return false;
    if (f.slots && f.slots.size) {
      if (!Array.isArray(p.openSlots)) return false;
      var hit = p.openSlots.some(function (s) { return f.slots.has(s); });
      if (!hit) return false;
    }
    if (f.sched === 'in' && !isScheduled(p.id, ctx.plan)) return false;
    if (f.sched === 'out' && isScheduled(p.id, ctx.plan)) return false;
    return true;
  }

  function indexById(arr) {
    var m = {};
    (arr || []).forEach(function (r) { if (r && r.id != null) m[r.id] = r; });
    return m;
  }
  function sameRec(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function merge3wayById(base, mine, theirs) {
    var B = indexById(base), M = indexById(mine), T = indexById(theirs);
    var ids = {};
    [B, M, T].forEach(function (m) { Object.keys(m).forEach(function (k) { ids[k] = 1; }); });
    var out = [];
    Object.keys(ids).sort().forEach(function (id) {
      var b = B[id], m = M[id], t = T[id];
      var inB = !!b, inM = !!m, inT = !!t;
      if (!inB) { out.push(inM ? m : t); return; }          // 新增（雙方都加同 id 時 mine 勝）
      var mChanged = inM && !sameRec(b, m);
      var tChanged = inT && !sameRec(b, t);
      if (!inM && !inT) return;                              // 雙方都刪
      if (!inM) { if (tChanged) out.push(t); return; }       // 我刪：對方有改才保留
      if (!inT) { if (mChanged) out.push(m); return; }       // 對方刪：我有改才保留
      if (mChanged) { out.push(m); return; }                 // 我改（含雙方都改→mine 勝）
      if (tChanged) { out.push(t); return; }                 // 只有對方改
      out.push(m);                                           // 都沒改
    });
    return out;
  }

  function deriveBaseFromStay(days, plan, places) {
    days = Array.isArray(days) ? days : [];
    plan = Array.isArray(plan) ? plan : [];
    var stayByDay = {};
    plan.forEach(function (e) { if (e && e.slot === 'stay' && e.placeId) stayByDay[e.day] = e.placeId; });
    var base = [], cur = null;
    days.forEach(function (d) {
      if (!d) return;
      var zone = d.stay || '';
      if (cur && cur.region === zone) {
        cur.toDay = d.id;
        if (!cur.hotelPlaceId && stayByDay[d.id]) cur.hotelPlaceId = stayByDay[d.id];
      } else {
        cur = { id: 'b_' + d.id, fromDay: d.id, toDay: d.id, region: zone, hotelPlaceId: stayByDay[d.id] || null };
        base.push(cur);
      }
    });
    return { base: base, plan: plan.filter(function (e) { return !(e && e.slot === 'stay'); }) };
  }

  function getActiveVersion(db) {
    if (!db || !Array.isArray(db.versions)) return null;
    var id = db.activeVersionId;
    return db.versions.filter(function (v) { return v.id === id; })[0] || db.versions[0] || null;
  }
  function setActiveVersion(db, id) {
    if (db && Array.isArray(db.versions) && db.versions.some(function (v) { return v.id === id; })) db.activeVersionId = id;
    return db;
  }
  function duplicateVersion(db, srcId, newId, newName) {
    var src = (db.versions || []).filter(function (v) { return v.id === srcId; })[0];
    if (!src) return null;
    var copy = { id: newId, name: newName || (src.name + ' 複本'),
      plan: JSON.parse(JSON.stringify(src.plan || [])),
      base: JSON.parse(JSON.stringify(src.base || [])),
      slotMeta: JSON.parse(JSON.stringify(src.slotMeta || [])) };
    db.versions.push(copy);
    db.activeVersionId = newId;
    return copy;
  }
  function renameVersion(db, id, name) {
    var v = (db.versions || []).filter(function (x) { return x.id === id; })[0];
    if (v && name) v.name = name;
    return v;
  }
  function deleteVersion(db, id) {
    if (!db || !Array.isArray(db.versions) || db.versions.length <= 1) return false;
    var before = db.versions.length;
    db.versions = db.versions.filter(function (v) { return v.id !== id; });
    if (db.versions.length === before) return false;   // id 不存在
    if (db.activeVersionId === id) db.activeVersionId = db.versions[0].id;
    return true;
  }

  // dayId 為零補 MMDD 字串；同一年內字典序＝時序
  function baseForDay(base, dayId) {
    return (base || []).filter(function (s) { return s.fromDay <= dayId && dayId <= s.toDay; })[0] || null;
  }

  // ── 住宿段晚數模型：共用「算每段晚數→重分配(cascade)→重鋪 fromDay/toDay」。days＝deriveDays 有序陣列。──
  // 規則層級（Vivian）：區域＝最上層。setRegionNights＝設「這區住幾晚」，相鄰區補 -delta；兩區各自把內部飯店 cascade 重分配（縮減從最後一家往前壓、每家≥1），所以縮區域時裡面飯店跟著壓、區域最少＝飯店數。
  // setHotelNights＝只在「同一區內」調某家晚數，其他同區飯店補 -delta（這區總晚不變、絕不擠到別區）。
  function _baseIdx(days) { var m = {}; for (var i = 0; i < days.length; i++) m[days[i].id] = i; return function (id) { return (id in m) ? m[id] : -1; }; }
  function _orderedN(base, idx) { var o = base.slice().sort(function (a, b) { return a.fromDay < b.fromDay ? -1 : (a.fromDay > b.fromDay ? 1 : 0); }); for (var i = 0; i < o.length; i++) o[i]._n = idx(o[i].toDay) - idx(o[i].fromDay) + 1; return o; }
  function _regionGroups(o) { var g = []; for (var i = 0; i < o.length; i++) { var c = g[g.length - 1]; if (c && c.region === o[i].region) c.segs.push(o[i]); else g.push({ region: o[i].region, segs: [o[i]] }); } return g; }
  function _sumN(s) { var t = 0; for (var i = 0; i < s.length; i++) t += s[i]._n; return t; }
  function _redistN(segs, T) { var d = T - _sumN(segs); if (d > 0) segs[segs.length - 1]._n += d; else if (d < 0) { var need = -d; for (var i = segs.length - 1; i >= 0 && need > 0; i--) { var take = Math.min(segs[i]._n - 1, need); segs[i]._n -= take; need -= take; } } }
  function _retileN(o, days) { var cur = 0; for (var i = 0; i < o.length; i++) { var s = o[i]; s.fromDay = days[cur].id; s.toDay = days[cur + s._n - 1].id; cur += s._n; delete s._n; } }
  function _dropN(o) { for (var i = 0; i < o.length; i++) delete o[i]._n; }
  function setRegionNights(base, segId, nights, days) {
    if (!Array.isArray(base) || !Array.isArray(days) || !base.length) return false;
    var o = _orderedN(base, _baseIdx(days)), gps = _regionGroups(o);
    var gi = -1; for (var i = 0; i < gps.length; i++) if (gps[i].segs.some(function (s) { return s.id === segId; })) { gi = i; break; }
    if (gi < 0) { _dropN(o); return false; }
    var G = gps[gi], adj = gps[gi + 1] || gps[gi - 1];
    if (!adj) { _dropN(o); return false; }   // 整趟只有這一區→改總晚＝改 trip（改起訖）
    var curT = _sumN(G.segs), aT = _sumN(adj.segs);
    nights = Math.max(G.segs.length, Math.min(curT + (aT - adj.segs.length), Math.round(nights)));   // 夾在 [這區飯店數, 現值+鄰區能讓出的]
    if (nights === curT) { _dropN(o); return false; }
    _redistN(G.segs, nights); _redistN(adj.segs, aT - (nights - curT)); _retileN(o, days); return true;
  }
  function setHotelNights(base, segId, nights, days) {
    if (!Array.isArray(base) || !Array.isArray(days) || !base.length) return false;
    var o = _orderedN(base, _baseIdx(days)), gps = _regionGroups(o);
    var G = null, X = null; for (var i = 0; i < gps.length && !G; i++) for (var j = 0; j < gps[i].segs.length; j++) if (gps[i].segs[j].id === segId) { G = gps[i]; X = gps[i].segs[j]; break; }
    if (!G || G.segs.length < 2) { _dropN(o); return false; }   // 單飯店區：飯店層不適用（改區域總晚即可）
    var regionT = _sumN(G.segs), others = G.segs.filter(function (s) { return s !== X; });
    nights = Math.max(1, Math.min(regionT - others.length, Math.round(nights)));   // 這家最多＝區總晚−其他每家1晚
    if (nights === X._n) { _dropN(o); return false; }
    X._n = nights; _redistN(others, regionT - nights); _retileN(o, days); return true;
  }

  // 按晚拆飯店：把 segId 那段的「最後一晚」拆成一個新段（同 region、待訂 hotelPlaceId=null），原段縮 1 晚。
  // 回傳新段 id（成功）或 null（不足 2 晚不能拆）。newId 由呼叫端給（core 無 uid）。
  function splitSegTail(base, segId, days, newId) {
    if (!Array.isArray(base) || !Array.isArray(days)) return null;
    var idx = function (id) { for (var i = 0; i < days.length; i++) if (days[i].id === id) return i; return -1; };
    var seg = null; for (var k = 0; k < base.length; k++) if (base[k].id === segId) { seg = base[k]; break; }
    if (!seg) return null;
    var fi = idx(seg.fromDay), ti = idx(seg.toDay);
    if (fi < 0 || ti < 0 || ti - fi < 1) return null;   // 不足 2 晚不能拆
    base.push({ id: newId, region: seg.region, fromDay: days[ti].id, toDay: days[ti].id, hotelPlaceId: null });
    seg.toDay = days[ti - 1].id;
    return newId;
  }

  // 改起訖用：把住宿段裁到新範圍 [lo, hi]（dayId MMDD 字串、同年字典序＝時序）。全在範圍外→丟、左右越界→裁；補頭尾讓 base 鋪滿新範圍（按日期錨定：原本哪天屬哪區就留哪天，頭尾延伸/裁切）。
  function refitBaseToRange(base, lo, hi) {
    if (!Array.isArray(base)) return;
    var kept = [];
    for (var i = 0; i < base.length; i++) {
      var s = base[i];
      if (s.toDay < lo || s.fromDay > hi) continue;   // 全在新範圍外→丟
      if (s.fromDay < lo) s.fromDay = lo;              // 左越界→裁
      if (s.toDay > hi) s.toDay = hi;                  // 右越界→裁
      kept.push(s);
    }
    kept.sort(function (a, b) { return a.fromDay < b.fromDay ? -1 : (a.fromDay > b.fromDay ? 1 : 0); });
    if (kept.length) { kept[0].fromDay = lo; kept[kept.length - 1].toDay = hi; }   // 補頭尾缺口（頭段延到 lo、尾段延到 hi）
    base.length = 0; for (var j = 0; j < kept.length; j++) base.push(kept[j]);
  }

  // 相鄰「同 region 且同一家飯店」的段→併成一段（連住同飯店不該顯示兩條，Vivian #3）。回傳是否有併。
  function mergeBaseSegs(base) {
    if (!Array.isArray(base) || base.length < 2) return false;
    base.sort(function (a, b) { return a.fromDay < b.fromDay ? -1 : (a.fromDay > b.fromDay ? 1 : 0); });
    var out = [base[0]], merged = false;
    for (var i = 1; i < base.length; i++) {
      var prev = out[out.length - 1], cur = base[i];
      if (prev.region === cur.region && prev.hotelPlaceId && cur.hotelPlaceId && prev.hotelPlaceId === cur.hotelPlaceId) {
        if (cur.toDay > prev.toDay) prev.toDay = cur.toDay;   // 吃掉後段（連住同飯店）
        merged = true;
      } else out.push(cur);
    }
    if (merged) { base.length = 0; for (var j = 0; j < out.length; j++) base.push(out[j]); }
    return merged;
  }
  // 區內重排飯店順序（segIds＝某區塊內所有段 id 的新順序；保留各家晚數→重鋪，Vivian #2b 握把拖曳）。回傳是否成功。
  function reorderRegionHotels(base, segIds, days) {
    if (!Array.isArray(base) || !Array.isArray(days) || !Array.isArray(segIds) || segIds.length < 2) return false;
    var o = _orderedN(base, _baseIdx(days)), idxs = [], regs = {};
    for (var i = 0; i < o.length; i++) if (segIds.indexOf(o[i].id) >= 0) { idxs.push(i); regs[o[i].region] = 1; }
    if (idxs.length !== segIds.length || Object.keys(regs).length !== 1) { _dropN(o); return false; }   // 必須剛好是同一區的那些段
    for (var k = 1; k < idxs.length; k++) if (idxs[k] !== idxs[k - 1] + 1) { _dropN(o); return false; }   // 且連續
    var start = idxs[0], byId = {};
    for (var j = 0; j < o.length; j++) byId[o[j].id] = o[j];
    for (var m = 0; m < segIds.length; m++) o[start + m] = byId[segIds[m]];   // 依新順序放回
    _retileN(o, days); return true;
  }
  // 刪一家飯店（Vivian #2b）：晚數給同 region 鄰家（前優先）；單飯店區→只清成待訂（不刪段、避免日期破洞）。回傳是否成功。
  function removeHotelSeg(base, segId, days) {
    if (!Array.isArray(base) || !Array.isArray(days) || !base.length) return false;
    var o = _orderedN(base, _baseIdx(days)), gps = _regionGroups(o);
    var G = null, X = null, xi = -1;
    for (var i = 0; i < gps.length && !G; i++) for (var j = 0; j < gps[i].segs.length; j++) if (gps[i].segs[j].id === segId) { G = gps[i]; X = gps[i].segs[j]; xi = j; break; }
    if (!G) { _dropN(o); return false; }
    if (G.segs.length < 2) { X.hotelPlaceId = null; _dropN(o); return true; }   // 單飯店區→待訂（不刪段）
    var sib = G.segs[xi - 1] || G.segs[xi + 1]; sib._n += X._n;   // 同區鄰家吸收這幾晚
    o.splice(o.indexOf(X), 1); var bk = base.indexOf(X); if (bk >= 0) base.splice(bk, 1);
    _retileN(o, days); return true;
  }
  // 加飯店（Vivian #3 修）：從「整區」擠一晚出來給新飯店（待訂），而非只拆最後一家。只要區總晚 > 現有飯店數就行（現有飯店 cascade 壓 1 晚）。回傳新段 id 或 null（每晚都不同飯店→沒得分）。
  function addHotelToRegion(base, segId, days, newId) {
    if (!Array.isArray(base) || !Array.isArray(days) || !base.length) return null;
    var o = _orderedN(base, _baseIdx(days)), gps = _regionGroups(o), G = null;
    for (var i = 0; i < gps.length && !G; i++) for (var j = 0; j < gps[i].segs.length; j++) if (gps[i].segs[j].id === segId) { G = gps[i]; break; }
    if (!G) { _dropN(o); return null; }
    var T = _sumN(G.segs);
    if (T <= G.segs.length) { _dropN(o); return null; }   // 每家都已 1 晚→沒有多餘晚數可分
    _redistN(G.segs, T - 1);   // 現有飯店壓 1 晚（從最後能讓的那家 cascade）
    var last = G.segs[G.segs.length - 1], pos = o.indexOf(last);
    var ns = { id: newId, region: G.region, fromDay: days[0].id, toDay: days[0].id, hotelPlaceId: null, _n: 1 };
    o.splice(pos + 1, 0, ns); base.push(ns);
    _retileN(o, days); return newId;
  }

  function mergeObjField(base, mine, theirs) {
    base = base || {}; mine = mine || {}; theirs = theirs || {};
    var keys = {};
    [base, mine, theirs].forEach(function (o) { Object.keys(o).forEach(function (k) { keys[k] = 1; }); });
    var out = {};
    Object.keys(keys).sort().forEach(function (k) {
      var bs = JSON.stringify(base[k]);
      var mChanged = JSON.stringify(mine[k]) !== bs;
      var tChanged = JSON.stringify(theirs[k]) !== bs;
      var val = mChanged ? mine[k] : (tChanged ? theirs[k] : (k in mine ? mine[k] : base[k]));
      if (val !== undefined) out[k] = val;                  // val===undefined ⇒ 被刪，不收
    });
    return out;
  }

  function mergeVersions(base, mine, theirs) {
    var B = indexById(base), M = indexById(mine), T = indexById(theirs);
    var ids = {};
    [B, M, T].forEach(function (m) { Object.keys(m).forEach(function (k) { ids[k] = 1; }); });
    var out = [];
    Object.keys(ids).sort().forEach(function (id) {
      var b = B[id], m = M[id], t = T[id];
      if (!b) { out.push(m || t); return; }
      if (!m && !t) return;
      if (!m) { if (!sameRec(b, t)) out.push(t); return; }
      if (!t) { if (!sameRec(b, m)) out.push(m); return; }
      out.push({
        id: id,
        name: (m.name !== b.name) ? m.name : (t.name !== b.name ? t.name : m.name),
        plan: merge3wayById(b.plan, m.plan, t.plan),
        base: merge3wayById(b.base, m.base, t.base),
        slotMeta: merge3wayById(b.slotMeta || [], m.slotMeta || [], t.slotMeta || [])  // 同格兩端同時改：mine 整筆勝（merge3wayById 語義），theirs 的備案會被蓋
      });
    });
    return out;
  }

  function categoryInUse(key, places, manualLines) {
    return (places || []).some(function (p) { return p.type === key; }) ||
           (manualLines || []).some(function (m) { return m.type === key; });
  }
  function regionInUse(key, places) {
    var n = (places || []).filter(function (p) { return p.area === key; }).length;
    return { inUse: n > 0, count: n };
  }
  function canDeleteCategory(trip, key, places, manualLines) {
    var c = findByKey(trip.categories, key);
    if (!c) return { ok:false, reason:'not-found' };
    if (c.role !== 'normal') return { ok:false, reason:'role-protected' };
    if (categoryInUse(key, places, manualLines)) return { ok:false, reason:'in-use' };
    return { ok:true };
  }
  function canDeleteRegion(trip, key, places) {
    if (key === '其他') return { ok:false, reason:'fallback-protected' };
    if (!findByKey(trip.regions, key)) return { ok:false, reason:'not-found' };
    var u = regionInUse(key, places);
    if (u.inUse) return { ok:false, reason:'in-use', count:u.count };
    return { ok:true };
  }

  function mergeDb(base, mine, theirs) {
    base = migrate(base || {}); mine = migrate(mine || {}); theirs = migrate(theirs || {});
    var merged = {
      schemaVersion: SCHEMA_VERSION,
      trip: mergeObjField(base.trip, mine.trip, theirs.trip),
      places: merge3wayById(base.places, mine.places, theirs.places),
      manualLines: merge3wayById(base.manualLines, mine.manualLines, theirs.manualLines),
      settings: mergeObjField(base.settings, mine.settings, theirs.settings),
      versions: mergeVersions(base.versions, mine.versions, theirs.versions),
      activeVersionId: null
    };
    return migrate(merged);
  }

  // 營業時間範圍：兩端用數字 + 分隔號，且「至少一端帶 :MM」才算時間，
  // 並用前後數字界線（lookaround）避免從 300–500、8/22–8/25 等長數字／日期中誤切出 00–500。
  // 這樣可拒絕價格（NT$300–500）、時長（1hr 2-3）、日期範圍（8/22–8/25）等非營業時間字串。
  function hoursRangeRe() {
    return /(?<![\d:])(\d{1,2})(?::(\d{2}))?\s*[–\-~～到]\s*(\d{1,2})(?::(\d{2}))?(?![\d:])/g;
  }
  function isTimeMatch(m) {                                // 至少一端有分鐘（:MM）才視為時間
    return m[2] != null || m[4] != null;
  }
  function parseHoursRange(str) {
    var re = hoursRangeRe(), m;
    while ((m = re.exec(str || ''))) {
      if (!isTimeMatch(m)) continue;                       // 跳過價格/日期等非時間範圍
      var s = +m[1] + (+m[2] || 0) / 60, e = +m[3] + (+m[4] || 0) / 60;
      if (e <= s) e += 24;                                 // 過午夜
      return { s: s, e: e };
    }
    return null;
  }
  function openSlotsFromHours(str) {
    var re = hoursRangeRe(), m, found = false;
    var morning = false, noon = false, evening = false;
    while ((m = re.exec(str || ''))) {
      if (!isTimeMatch(m)) continue;                       // 跳過價格/日期等非時間範圍
      found = true;
      var s = +m[1] + (+m[2] || 0) / 60, e = +m[3] + (+m[4] || 0) / 60;
      if (e <= s) e += 24;
      if (s < 11) morning = true;
      if (s < 15 && e > 11) noon = true;
      if (e > 17) evening = true;
    }
    if (!found) return null;
    var out = [];
    if (morning) out.push('morning'); if (noon) out.push('noon'); if (evening) out.push('evening');
    return out;
  }
  function closedDaysFromText(str) {
    // 擷取「休」前一連串週幾字（容許共用或重複「週/周」前綴），再逐字展開——
    // 這樣「週一週二休」「週一二休」等連續公休都能解析，單日「週一休」仍可。
    var out = [], re = /(?:週|周)((?:[日一二三四五六](?:週|周)?)+)(?:公)?休/g, m;
    while ((m = re.exec(str || ''))) {
      var run = m[1].replace(/[週周]/g, '');               // 去掉內嵌的「週/周」，只留週幾字
      for (var k = 0; k < run.length; k++) {
        var i = WD_ZH.indexOf(run[k]);
        if (i >= 0 && out.indexOf(i) < 0) out.push(i);
      }
    }
    return out;
  }
  // 「只營業在某些天」→ 回營業日陣列（其餘天＝公休，供總覽⚠️）；推不出明確營業日／含「休」字 → null（交給 closedDaysFromText）。
  // 例：「週六 17:00–22:00」→[6]、「週末」→[0,6]、「二–日」→[2,3,4,5,6,0]、「每晚 17:00–24:00」→null（不亂推）。
  function openDaysFromText(str) {
    str = String(str || '');
    if (!str || /休/.test(str)) return null;                 // 有「休」→不在此推（closedDaysFromText 負責）
    if (/平日/.test(str)) return [1, 2, 3, 4, 5];
    if (/週末|周末|假日/.test(str)) return [0, 6];
    var ORDER = ['一', '二', '三', '四', '五', '六', '日'];   // Mon-first 週序，供範圍展開
    var rng = str.match(/(?:週|周)?([日一二三四五六])\s*[–\-~至到]\s*(?:週|周)?([日一二三四五六])/);
    if (rng) {
      var a = ORDER.indexOf(rng[1]), b = ORDER.indexOf(rng[2]);
      if (a >= 0 && b >= 0) {
        var days = [], i = a, guard = 0;
        while (guard++ < 8) { days.push(WD_ZH.indexOf(ORDER[i])); if (i === b) break; i = (i + 1) % 7; }
        return days;
      }
    }
    var single = [], re = /(?:週|周)([日一二三四五六])/g, m;   // 明確列出的「週X」當營業日（不含範圍/休）
    while ((m = re.exec(str))) { var idx = WD_ZH.indexOf(m[1]); if (idx >= 0 && single.indexOf(idx) < 0) single.push(idx); }
    if (single.length && single.length < 7) return single;
    return null;
  }
  function condenseHours(p) {
    if (!p) return '';
    var slots = Array.isArray(p.openSlots) ? p.openSlots : openSlotsFromHours(p.hours);
    var word = '';
    if (slots) {
      if (slots.length >= 3) word = '整天';
      else word = slots.map(function (s) { return s === 'morning' ? '早' : s === 'noon' ? '中午' : '晚上'; }).join('');
      if (word === '早中午') word = '早午'; if (word === '中午晚上') word = '午晚'; if (word === '早晚上') word = '早晚';
    }
    // 顯式 closedDays（含空陣列＝無休）優先；缺席時從 hours 文字推導（推不出休字→不寫休）
    var cd = Array.isArray(p.closedDays) ? p.closedDays : null;
    if (cd === null) { var dcd = closedDaysFromText(p.hours); if (dcd.length) cd = dcd; }
    var rest = cd ? (cd.length ? '週' + cd.map(function (d) { return WD_ZH[d]; }).join('') + '休' : '無休') : '';
    return [word, rest].filter(Boolean).join('・');
  }
  function applyHoursDerived(p) {            // 編輯 hours 後就地重算衍生欄位：closedDays/openSlots 唯一來源是 hours 文字，
    if (!p) return p;                        // 改 hours 須同步刷新，空/無休/無時間→清掉殘值，避免時段濾鏡與「⚠️休」用到過時資料
    var cd = closedDaysFromText(p.hours);
    if (cd.length) p.closedDays = cd; else delete p.closedDays;
    var os = openSlotsFromHours(p.hours);
    if (os && os.length) p.openSlots = os; else delete p.openSlots;
    return p;
  }

  // 總覽格警告（spec #10）：給一張卡＋某天（含 wdNum）＋period（早/午/晚），回警告原因字串（''＝無警告，不亂報）。
  var PERIOD_TOKEN = { '早': 'morning', '午': 'noon', '晚': 'evening' };
  function cellWarning(place, day, periodKey) {
    if (!place || !day) return '';
    if (Array.isArray(place.closedDays) && place.closedDays.indexOf(day.wdNum) >= 0) return '公休';
    var tok = PERIOD_TOKEN[periodKey];
    if (tok && Array.isArray(place.openSlots) && place.openSlots.length && place.openSlots.indexOf(tok) < 0) return '非營業時段';
    return '';
  }

  // 同源聚合（§Phase 1 同源根）：把一份 plan 投影成「天×早午晚」格子模型。
  // 回傳每天一物件 { day, periods: { 早:[item], 午:[item], 晚:[item] } }，item＝{ eid, placeId, name, type, slot, warn }。
  // 規則：排除 hideInOverview===true、排除 slotPeriod 為 null（stay 等）、段內依 slotOrderInPeriod 排序、孤兒 plan（找不到 place）跳過。
  function overviewModel(days, plan, places, slotMetaArr) {
    var byId = {};
    (places || []).forEach(function (p) { if (p && p.id) byId[p.id] = p; });
    var metas = slotMetaArr || [];
    return (days || []).map(function (day) {
      var periods = {};
      PERIOD_KEYS.forEach(function (k) { periods[k] = []; });
      (plan || []).forEach(function (e) {
        if (!e || e.day !== day.id) return;
        var per = slotPeriod(e.slot);
        if (!per) return;
        var p = byId[e.placeId];
        if (!p || p.hideInOverview === true) return;
        periods[per].push({ eid: e.id, placeId: p.id, name: p.name, type: p.type, slot: e.slot, warn: cellWarning(p, day, per) });
      });
      PERIOD_KEYS.forEach(function (k) {
        periods[k].sort(function (a, b) { return slotOrderInPeriod(a.slot) - slotOrderInPeriod(b.slot); });
      });
      // 待定旗標（Vivian #3）：該天某 period 內任一細 slot 被標 tentative → 總覽該格顯「待定」提示
      var tentative = {};
      OVERVIEW_PERIODS.forEach(function (pd) {
        tentative[pd.key] = metas.some(function (m) {
          return m && m.day === day.id && m.tentative === true && pd.slots.indexOf(m.slot) >= 0;
        });
      });
      return { day: day, periods: periods, tentative: tentative };
    });
  }
  function distanceM(a, b) {
    if (!a || !b || a.lat == null || b.lat == null || a.lng == null || b.lng == null) return null;
    var R = 6371000, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(2 * R * Math.asin(Math.sqrt(s)));
  }
  // 店名正規化＋相似：去空白/標點、小寫後，一方包含另一方（較短者 ≥2 字元）。中英泰文都吃。
  function dupNameKey(s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s　.,\-_\/&()'"，。、·！？!?：:；;]+/g, ''); }
  function dupNameSimilar(a, b) {
    a = dupNameKey(a); b = dupNameKey(b);
    if (a.length < 2 || b.length < 2) return false;
    return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }
  // 在現有卡片裡找「同一家店」：placeId 全等 ＞ cid 全等 ＞ 座標兜底。命中回該 place，無回 null。
  var DUP_M = 60;
  function findDuplicate(places, anchor) {
    if (!Array.isArray(places) || !anchor) return null;
    var a = anchor;
    if (a.placeId) {
      var byPid = places.find(function (p) { return p && p.placeId && p.placeId === a.placeId; });
      if (byPid) return byPid;
    }
    if (a.cid) {
      var byCid = places.find(function (p) { return p && p.cid && p.cid === a.cid; });
      if (byCid) return byCid;
    }
    // 座標兜底：只匹配「缺 placeId 的既有卡（未查證、可能要補定位）且 名字相似」。
    // 有 placeId 的既有卡＝已確認的店，placeId 對不上就是不同店，不靠距離兜（清邁同街多店、40m 內常是不同家）。
    if (typeof a.lat === 'number' && typeof a.lng === 'number') {
      var near = places.find(function (p) {
        return p && !p.placeId
          && typeof p.lat === 'number' && typeof p.lng === 'number'
          && distanceM(p, a) < DUP_M
          && dupNameSimilar(p.name, a.name);
      });
      if (near) return near;
    }
    return null;
  }
  // 座標→最近的有座標 region key（regions 的 lat/lng；都無座標或輸入無座標→null）。area 自動填用。
  function nearestRegion(trip, lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    var regs = (trip && trip.regions) || [];
    var best = null, bestD = Infinity;
    regs.forEach(function (r) {
      if (r && typeof r.lat === 'number' && typeof r.lng === 'number') {
        var d = distanceM({ lat: lat, lng: lng }, { lat: r.lat, lng: r.lng });
        if (d < bestD) { bestD = d; best = r.key; }
      }
    });
    return best;
  }
  function anchorsForSlot(plan, day, slot, slotKeys) {
    var idx = slotKeys.indexOf(slot), prev = null, next = null;
    if (idx < 0) return { prev: null, next: null };
    plan.forEach(function (e) {
      if (!e || e.day !== day) return;
      var i = slotKeys.indexOf(e.slot); if (i < 0) return;
      if (i < idx) { if (prev === null || i >= prev.i) prev = { i: i, id: e.placeId }; }
      if (i > idx) { if (next === null || i < next.i) next = { i: i, id: e.placeId }; }
    });
    return { prev: prev && prev.id, next: next && next.id };
  }
  function emptySlotDist(place, version, places, day, slot, slotKeys) {
    var byId = {}; places.forEach(function (p) { byId[p.id] = p; });
    var a = anchorsForSlot(version.plan, day, slot, slotKeys), sum = 0, n = 0;
    [a.prev, a.next].forEach(function (id) {
      var d = id && byId[id] ? distanceM(place, byId[id]) : null;
      if (d != null) { sum += d; n++; }
    });
    return n ? sum : null;                                   // 無錨點（含住宿無座標）→ null
  }
  // 限同一年內的旅程
  function nextDayId(id) {                                   // '0823'→'0824'（跨月正確）
    var d = new Date(Date.UTC(2026, +id.slice(0, 2) - 1, +id.slice(2)) + 86400000);
    return ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2);
  }
  // 某天「附近」的參考點：住宿座標 → region 中心 → null（交給呼叫端退錨點/region-key）
  function dayReferencePoint(seg, places, trip) {
    if (!seg) return null;
    if (seg.hotelPlaceId) {
      var byId = {}; (places || []).forEach(function (p) { if (p && p.id) byId[p.id] = p; });
      var h = byId[seg.hotelPlaceId];
      if (h && h.lat != null && h.lng != null) return { lat:h.lat, lng:h.lng };
    }
    var r = regionOf(trip, seg.region);
    if (r && r.lat != null && r.lng != null) return { lat:r.lat, lng:r.lng };
    return null;
  }
  function recommendSlots(place, version, places, slotKeys, trip) {
    var out = [];
    var occupied = {}; (version.plan || []).forEach(function (e) { occupied[e.day + '_' + e.slot] = 1; });
    (version.base || []).forEach(function (seg) {
      for (var d = seg.fromDay; d <= seg.toDay; d = nextDayId(d)) {
        slotKeys.forEach(function (s) {
          if (occupied[d + '_' + s]) return;
          var dist = emptySlotDist(place, version, places, d, s, slotKeys);
          if (dist != null) out.push({ day: d, slot: s, dist: dist });
        });
        if (d === seg.toDay) break;
      }
    });
    out.sort(function (x, y) { return x.dist - y.dist; });
    return out.slice(0, 2);
  }

  function getSlotMeta(version, day, slot) {
    return (version.slotMeta || []).filter(function (m) { return m.day === day && m.slot === slot; })[0] || null;
  }
  function ensureSlotMeta(version, day, slot) {
    if (!Array.isArray(version.slotMeta)) version.slotMeta = [];
    var m = getSlotMeta(version, day, slot);
    if (!m) { m = { id: day + '_' + slot, day: day, slot: slot, tentative: false, pk: false, backups: [] }; version.slotMeta.push(m); }
    return m;
  }
  function pruneSlotMeta(version) {
    var arr = version.slotMeta || [];
    for (var i = arr.length - 1; i >= 0; i--) {
      var m = arr[i];
      if (!(m.tentative || m.pk || (m.backups && m.backups.length))) arr.splice(i, 1);
    }
  }
  function setSlotFlag(version, day, slot, flag, val) {
    if (flag !== 'tentative' && flag !== 'pk') return null;
    var m = ensureSlotMeta(version, day, slot); m[flag] = !!val; pruneSlotMeta(version);
    return getSlotMeta(version, day, slot);
  }
  function addBackup(version, day, slot, placeId) {
    if (!placeId) return null;
    var occupied = false;
    var plan = version.plan || [];
    for (var i = 0; i < plan.length; i++) {
      if (plan[i] && plan[i].day === day && plan[i].slot === slot && plan[i].placeId === placeId) {
        occupied = true; break;
      }
    }
    if (occupied) return getSlotMeta(version, day, slot);
    var m = ensureSlotMeta(version, day, slot);
    if (m.backups.indexOf(placeId) < 0 && m.backups.length < 2) m.backups.push(placeId);
    return m;
  }
  function removeBackup(version, day, slot, placeId) {
    var m = getSlotMeta(version, day, slot); if (!m) return;
    m.backups = m.backups.filter(function (id) { return id !== placeId; }); pruneSlotMeta(version);
  }
  function swapOccurrence(version, occId, newPlaceId, opts) {
    opts = opts || {};
    var occ = (version.plan || []).filter(function (e) { return e.id === occId; })[0];
    if (!occ) return null;
    var old = occ.placeId; occ.placeId = newPlaceId;
    removeBackup(version, occ.day, occ.slot, newPlaceId);
    var demoted = false;
    if (opts.demote && old) {
      addBackup(version, occ.day, occ.slot, old);
      var meta = getSlotMeta(version, occ.day, occ.slot);
      demoted = !!(meta && meta.backups.indexOf(old) >= 0);
    }
    return { old: old, demoted: demoted };
  }

  // 占用面板聚焦用：回傳「這格相關的一組 placeId」＝占用者＋備案＋(2選1)同格對手；去重、保序、只取有定位者。純函式（無 DOM）。
  function occSpotlightIds(version, eid, places) {
    var plan = (version && version.plan) || [];
    var e = plan.find(function (x) { return x.id === eid; });
    if (!e) return [];
    var meta = getSlotMeta(version, e.day, e.slot) || { backups: [] };
    var ids = [e.placeId].concat(meta.backups || []);
    if (meta.pk) {
      plan.forEach(function (x) { if (x.day === e.day && x.slot === e.slot) ids.push(x.placeId); });
    }
    var seen = {}, out = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (!id || seen[id]) continue;
      seen[id] = 1;
      var p = (places || []).find(function (pp) { return pp.id === id; });
      if (p && p.lat != null && p.lng != null) out.push(id);
    }
    return out;
  }

  var api = { SCHEMA_VERSION: SCHEMA_VERSION, WD_ZH: WD_ZH, OVERVIEW_PERIODS: OVERVIEW_PERIODS, slotPeriod: slotPeriod, slotOrderInPeriod: slotOrderInPeriod, defaultPer: defaultPer, normalizePlace: normalizePlace, classifyPriceBand: classifyPriceBand, parseLatLngFromMapsUrl: parseLatLngFromMapsUrl, passFilters: passFilters, migrate: migrate, deriveBaseFromStay: deriveBaseFromStay, getActiveVersion: getActiveVersion, setActiveVersion: setActiveVersion, duplicateVersion: duplicateVersion, renameVersion: renameVersion, deleteVersion: deleteVersion, baseForDay: baseForDay, setRegionNights: setRegionNights, setHotelNights: setHotelNights, splitSegTail: splitSegTail, refitBaseToRange: refitBaseToRange, mergeBaseSegs: mergeBaseSegs, reorderRegionHotels: reorderRegionHotels, removeHotelSeg: removeHotelSeg, addHotelToRegion: addHotelToRegion, expandForScope: expandForScope, occurrenceContribs: occurrenceContribs, manualContribs: manualContribs, rollupBudget: rollupBudget, scheduledPlaceIds: scheduledPlaceIds, isScheduled: isScheduled, priceBandOf: priceBandOf, passLibFilters: passLibFilters, merge3wayById: merge3wayById, mergeObjField: mergeObjField, mergeVersions: mergeVersions, mergeDb: mergeDb, CM_TRIP_DEFAULT: CM_TRIP_DEFAULT, normalizeTrip: normalizeTrip, applyWashokuPalette: applyWashokuPalette, deriveDays: deriveDays, parseHoursRange: parseHoursRange, openSlotsFromHours: openSlotsFromHours, closedDaysFromText: closedDaysFromText, openDaysFromText: openDaysFromText, condenseHours: condenseHours, applyHoursDerived: applyHoursDerived, cellWarning: cellWarning, overviewModel: overviewModel, distanceM: distanceM, findDuplicate: findDuplicate, nearestRegion: nearestRegion, anchorsForSlot: anchorsForSlot, emptySlotDist: emptySlotDist, dayReferencePoint: dayReferencePoint, recommendSlots: recommendSlots, nextDayId: nextDayId, getSlotMeta: getSlotMeta, ensureSlotMeta: ensureSlotMeta, pruneSlotMeta: pruneSlotMeta, setSlotFlag: setSlotFlag, addBackup: addBackup, removeBackup: removeBackup, swapOccurrence: swapOccurrence, occSpotlightIds: occSpotlightIds, findByKey: findByKey, catLabel: catLabel, catColor: catColor, catIcon: catIcon, roleOf: roleOf, regionLabel: regionLabel, regionColor: regionColor, regionOf: regionOf, cuisineLabel: cuisineLabel, normPriceBands: normPriceBands, categoryInUse: categoryInUse, regionInUse: regionInUse, canDeleteCategory: canDeleteCategory, canDeleteRegion: canDeleteRegion };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CNXCore = api;
})(typeof self !== 'undefined' ? self : this);
