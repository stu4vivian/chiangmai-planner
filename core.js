// core.js — 清邁行程工具的純邏輯。無 DOM。瀏覽器當全域 CNXCore、Node 當模組。
(function (root) {
  'use strict';

  var SCHEMA_VERSION = 10;

  function defaultPer(type) { return type === '住宿' ? 'shared' : 'person'; }

  function normalizePlace(p) {
    p = p || {};
    var type = p.type || '其他';
    var cost = (p.cost && typeof p.cost === 'object') ? p.cost : {};
    return {
      id: p.id,
      name: p.name || '未命名地點',
      en: p.en || '',
      type: type,
      area: p.area || '其他',
      lat: (typeof p.lat === 'number') ? p.lat : null,
      lng: (typeof p.lng === 'number') ? p.lng : null,
      hours: p.hours || '',
      price: p.price || '',
      note: p.note || '',
      cost: {
        low: (typeof cost.low === 'number') ? cost.low : null,
        high: (typeof cost.high === 'number') ? cost.high : null,
        per: (cost.per === 'shared' || cost.per === 'person') ? cost.per : defaultPer(type)
      }
    };
  }

  function migrate(db) {
    db = db || {};
    var out = {
      schemaVersion: SCHEMA_VERSION,
      places: Array.isArray(db.places) ? db.places.slice() : [],
      plan: [],
      manualLines: Array.isArray(db.manualLines) ? db.manualLines.slice() : [],
      settings: (db.settings && typeof db.settings === 'object') ? Object.assign({}, db.settings) : {},
      typeIcons: db.typeIcons || {},
      typeColors: db.typeColors || {}
    };
    if (typeof out.settings.people !== 'number') out.settings.people = 2;

    var migCount = 0;
    (Array.isArray(db.plan) ? db.plan : []).forEach(function (e) {
      if (!e) return;
      if (e.placeId) {
        out.plan.push({ id: e.id, placeId: e.placeId, day: e.day, slot: e.slot });
      } else if (e.label || e.placeholder) {
        var newId = 'mig_' + (migCount++);
        out.places.push({
          id: newId, name: e.label || '待定', en: '',
          type: e.type || '其他', area: '其他',
          lat: null, lng: null, hours: '', price: '', note: ''
        });
        out.plan.push({ id: e.id, placeId: newId, day: e.day, slot: e.slot });
      }
    });

    out.places = out.places.map(normalizePlace);
    return out;
  }

  function coerceRange(low, high) {
    var l = (typeof low === 'number') ? low : null;
    var h = (typeof high === 'number') ? high : null;
    if (l == null && h == null) return null;
    if (l == null) l = h;
    if (h == null) h = l;
    return { low: l, high: h };
  }

  function sumRanges(items) {
    var low = 0, high = 0;
    (items || []).forEach(function (r) {
      if (!r) return;
      low += (typeof r.low === 'number') ? r.low : 0;
      high += (typeof r.high === 'number') ? r.high : 0;
    });
    return { low: low, high: high };
  }

  function expandForScope(range, per, people, scope) {
    people = (typeof people === 'number' && people > 0) ? people : 2;
    var f;
    if (per === 'shared') f = (scope === 'perPerson') ? (1 / people) : 1;
    else f = (scope === 'perPerson') ? 1 : people;
    return {
      low: (range && typeof range.low === 'number' ? range.low : 0) * f,
      high: (range && typeof range.high === 'number' ? range.high : 0) * f
    };
  }

  function occurrenceContribs(plan, places) {
    var byId = {};
    (places || []).forEach(function (p) { byId[p.id] = p; });
    var out = [];
    (plan || []).forEach(function (e) {
      var p = byId[e.placeId];
      if (!p || !p.cost) return;
      var r = coerceRange(p.cost.low, p.cost.high);
      if (!r) return;
      out.push({
        type: p.type || '其他',
        per: (p.cost.per === 'shared' ? 'shared' : 'person'),
        range: r, label: p.name, day: e.day, slot: e.slot, placeId: p.id
      });
    });
    return out;
  }

  function manualContribs(manualLines) {
    var out = [];
    (manualLines || []).forEach(function (m) {
      var qty = (typeof m.qty === 'number' && m.qty > 0) ? m.qty : 1;
      var r = coerceRange(m.low, m.high);
      if (!r) return;
      out.push({
        type: m.type || '其他',
        per: (m.per === 'shared' ? 'shared' : 'person'),
        range: { low: r.low * qty, high: r.high * qty },
        label: m.label || '手動花費', qty: qty, manualId: m.id
      });
    });
    return out;
  }

  var TYPES_ORDER = ['食物','景點','娛樂','逛街','住宿','其他'];

  function rollupBudget(plan, places, manualLines, settings) {
    var people = (settings && typeof settings.people === 'number' && settings.people > 0) ? settings.people : 2;
    var contribs = occurrenceContribs(plan, places).concat(manualContribs(manualLines));
    var byType = {};
    TYPES_ORDER.forEach(function (t) {
      byType[t] = { trip:{low:0,high:0}, perPerson:{low:0,high:0}, items: [] };
    });
    contribs.forEach(function (c) {
      var t = byType[c.type] ? c.type : '其他';
      var trip = expandForScope(c.range, c.per, people, 'trip');
      var pp = expandForScope(c.range, c.per, people, 'perPerson');
      byType[t].trip.low += trip.low;   byType[t].trip.high += trip.high;
      byType[t].perPerson.low += pp.low; byType[t].perPerson.high += pp.high;
      byType[t].items.push(c);
    });
    var total = { trip:{low:0,high:0}, perPerson:{low:0,high:0} };
    TYPES_ORDER.forEach(function (t) {
      total.trip.low += byType[t].trip.low;   total.trip.high += byType[t].trip.high;
      total.perPerson.low += byType[t].perPerson.low; total.perPerson.high += byType[t].perPerson.high;
    });
    var median = {
      trip: (total.trip.low + total.trip.high) / 2,
      perPerson: (total.perPerson.low + total.perPerson.high) / 2
    };
    return { byType: byType, total: total, median: median, people: people, order: TYPES_ORDER.slice() };
  }

  function scheduledPlaceIds(plan) {
    var s = {};
    (plan || []).forEach(function (e) { if (e && e.placeId) s[e.placeId] = true; });
    return Object.keys(s);
  }
  function isScheduled(placeId, plan) {
    return (plan || []).some(function (e) { return e && e.placeId === placeId; });
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

  function mergeDb(base, mine, theirs) {
    base = base || {}; mine = mine || {}; theirs = theirs || {};
    var merged = {
      schemaVersion: Math.max(base.schemaVersion || 0, mine.schemaVersion || 0, theirs.schemaVersion || 0, SCHEMA_VERSION),
      places: merge3wayById(base.places, mine.places, theirs.places),
      plan: merge3wayById(base.plan, mine.plan, theirs.plan),
      manualLines: merge3wayById(base.manualLines, mine.manualLines, theirs.manualLines),
      settings: mergeObjField(base.settings, mine.settings, theirs.settings),
      typeIcons: mergeObjField(base.typeIcons, mine.typeIcons, theirs.typeIcons),
      typeColors: mergeObjField(base.typeColors, mine.typeColors, theirs.typeColors)
    };
    return migrate(merged);
  }

  var api = { SCHEMA_VERSION: SCHEMA_VERSION, defaultPer: defaultPer, normalizePlace: normalizePlace, migrate: migrate, coerceRange: coerceRange, sumRanges: sumRanges, expandForScope: expandForScope, occurrenceContribs: occurrenceContribs, manualContribs: manualContribs, rollupBudget: rollupBudget, scheduledPlaceIds: scheduledPlaceIds, isScheduled: isScheduled, merge3wayById: merge3wayById, mergeObjField: mergeObjField, mergeDb: mergeDb };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CNXCore = api;
})(typeof self !== 'undefined' ? self : this);
