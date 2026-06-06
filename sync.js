// sync.js — 瀏覽器同步層。掛在 window.CNXSync。所有網路 I/O 集中於此。
(function (root) {
  'use strict';

  function makeClient(url, anonKey) {
    function rpc(fn, body) {
      return fetch(url + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: 'Bearer ' + anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(fn + ' ' + r.status + ' ' + t); });
        return r.json();
      });
    }
    return {
      createTrip: function (data) { return rpc('create_trip', { p_data: data }); },           // → uuid 字串
      getTrip: function (id) {
        return rpc('get_trip', { p_id: id }).then(function (rows) {
          var row = Array.isArray(rows) ? rows[0] : rows; return row || null;                 // {data, version} | null
        });
      },
      getTripVersion: function (id) { return rpc('get_trip_version', { p_id: id }); },         // → int（查無 -1）
      saveTrip: function (id, data, expected) { return rpc('save_trip', { p_id: id, p_data: data, p_expected: expected }); } // → int（衝突 -1）
    };
  }

  // 控制器：把 client、本機狀態存取、套用回呼、合併函式接起來。
  // opts: { client, tripId, getLocalDb, applyDb, onStatus, mergeDb }
  function createSyncController(opts) {
    var client = opts.client, tripId = opts.tripId;
    var getLocalDb = opts.getLocalDb;      // () => 目前整包 blob
    var applyDb = opts.applyDb;            // (db) => 設全域 + renderAll
    var onStatus = opts.onStatus || function () {};
    var mergeDb = opts.mergeDb;            // CNXCore.mergeDb
    var synced = null, syncedVersion = -1, saveTimer = null, pollTimer = null;
    function clone(o) { return JSON.parse(JSON.stringify(o)); }   // synced 必須是「不可變快照」，不能持有 App 會就地改動的活陣列參照

    function load() {
      onStatus('syncing');
      return client.getTrip(tripId).then(function (row) {
        if (!row) throw new Error('trip not found');
        applyDb(row.data); synced = clone(getLocalDb()); syncedVersion = row.version;  // synced 抓「套用後」的快照，避免 raw vs migrate 誤判 dirty
        onStatus('synced'); return row;
      }).catch(function (e) { onStatus('offline'); throw e; });
    }

    function doSave() {
      var local = clone(getLocalDb());                              // 凍結這一刻的本機狀態當「mine」
      return client.saveTrip(tripId, local, syncedVersion).then(function (v) {
        if (v !== -1) { synced = local; syncedVersion = v; onStatus('synced'); return; }
        return client.getTrip(tripId).then(function (row) {            // 衝突 → 拉遠端、合併、重試一次
          var merged = mergeDb(synced, local, row.data);
          applyDb(merged);
          return client.saveTrip(tripId, merged, row.version).then(function (v2) {
            if (v2 !== -1) { synced = clone(merged); syncedVersion = v2; onStatus('synced'); }
            else { synced = clone(row.data); syncedVersion = row.version; scheduleSave(); } // 仍衝突 → 稍後再合併
          });
        });
      }).catch(function () { onStatus('offline'); });
    }

    function scheduleSave() {
      onStatus('syncing');
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, 800);
    }

    function poll() {
      return client.getTripVersion(tripId).then(function (v) {
        if (typeof v === 'number' && v > syncedVersion) {
          var dirty = JSON.stringify(getLocalDb()) !== JSON.stringify(synced);
          if (!dirty) {
            return client.getTrip(tripId).then(function (row) {
              applyDb(row.data); synced = clone(getLocalDb()); syncedVersion = row.version; onStatus('synced');
            });
          } // 有本機未存變動就先不動，下次 scheduleSave 會合併
        }
      }).catch(function () {});
    }

    function startPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(poll, 20000);
      window.addEventListener('focus', poll);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
    }

    return { load: load, scheduleSave: scheduleSave, startPolling: startPolling, poll: poll };
  }

  root.CNXSync = { makeClient: makeClient, createSyncController: createSyncController };
})(window);
