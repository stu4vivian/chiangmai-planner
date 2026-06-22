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
    var getSyncedVersion = opts.getSyncedVersion, setSyncedVersion = opts.setSyncedVersion;   // 持久化「上次同步到的雲端版本」（per-device localStorage）；boot 靠它判斷雲端有沒有領先本機
    var iv = getSyncedVersion ? getSyncedVersion() : -1;
    var synced = null, syncedVersion = (typeof iv === 'number' ? iv : -1), saveTimer = null, pollTimer = null;
    function clone(o) { return JSON.parse(JSON.stringify(o)); }   // synced 必須是「不可變快照」，不能持有 App 會就地改動的活陣列參照
    function setVer(v) { syncedVersion = v; if (setSyncedVersion) setSyncedVersion(v); }   // 更新 syncedVersion 一律走這裡＝順手持久化，reload 後才判斷得出雲端有沒有領先

    function load() {
      onStatus('syncing');
      return client.getTrip(tripId).then(function (row) {
        if (!row) throw new Error('trip not found');
        var localDb = getLocalDb();
        if (syncedVersion >= 0 && localDb && row.version === syncedVersion) {
          // 雲端 version 沒領先＝雲端沒有別人/另一裝置的新東西。本機 localStorage 才是真相（可能有 push 還沒跑完就 reload 的變更，例如剛刪的卡）。
          // 不可用雲端覆蓋（bug#1：否則 800ms push debounce 被 reload 打斷時，刪除/編輯會被雲端舊資料蓋回來＝復活）。保留本機，把未 push 的變更推上去。
          synced = clone(localDb);
          onStatus('synced');
          scheduleSave();   // ponytail: 無腦 push；正常 reload（本機==雲端）會多送一次相同內容＝version+1，低頻 app 不值得為省這次去比對 dirty
          return row;
        }
        applyDb(row.data); synced = clone(getLocalDb()); setVer(row.version);  // 首次或雲端領先：套用雲端。synced 抓「套用後」快照，避免 raw vs migrate 誤判 dirty
        onStatus('synced'); return row;
      }).catch(function (e) { onStatus('offline'); throw e; });
    }

    function doSave() {
      var local = clone(getLocalDb());                              // 凍結這一刻的本機狀態當「mine」
      return client.saveTrip(tripId, local, syncedVersion).then(function (v) {
        if (v !== -1) { synced = local; setVer(v); onStatus('synced'); return; }
        return client.getTrip(tripId).then(function (row) {            // 衝突 → 拉遠端、合併、重試一次
          var merged = mergeDb(synced, local, row.data);
          applyDb(merged);
          var mergedLocal = clone(getLocalDb());                       // 套用後快照（同 load 的紀律），衝突後 poll 才不會誤判 dirty
          return client.saveTrip(tripId, mergedLocal, row.version).then(function (v2) {
            if (v2 !== -1) { synced = mergedLocal; setVer(v2); onStatus('synced'); }
            else { synced = clone(row.data); setVer(row.version); scheduleSave(); } // 仍衝突 → 稍後再合併
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
              applyDb(row.data); synced = clone(getLocalDb()); setVer(row.version); onStatus('synced');
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

  var api = { makeClient: makeClient, createSyncController: createSyncController };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // Node（測試）— 同 core.js 的雙環境收尾
  else root.CNXSync = api;
})(typeof self !== 'undefined' ? self : this);
