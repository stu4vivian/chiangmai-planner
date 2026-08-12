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
  // opts: { client, tripId, getLocalDb, applyDb, onStatus, mergeDb,
  //         get/setSyncedVersion, get/setSyncedDb, get/setLocalDirty }
  function createSyncController(opts) {
    var client = opts.client, tripId = opts.tripId;
    var getLocalDb = opts.getLocalDb;      // () => 目前整包 blob
    var applyDb = opts.applyDb;            // (db) => 設全域 + renderAll
    var onStatus = opts.onStatus || function () {};
    var mergeDb = opts.mergeDb;            // CNXCore.mergeDb
    var getSyncedVersion = opts.getSyncedVersion, setSyncedVersion = opts.setSyncedVersion;   // 以下三份同步狀態都必須由呼叫端以 tripId 隔離
    var getSyncedDb = opts.getSyncedDb, setSyncedDb = opts.setSyncedDb;
    var getLocalDirty = opts.getLocalDirty, setLocalDirty = opts.setLocalDirty;
    var iv = getSyncedVersion ? getSyncedVersion() : -1;
    var synced = null, syncedVersion = (typeof iv === 'number' ? iv : -1), saveTimer = null, pollTimer = null, saving = false;
    function clone(o) { return JSON.parse(JSON.stringify(o)); }   // synced 必須是「不可變快照」，不能持有 App 會就地改動的活陣列參照
    function setVer(v) { syncedVersion = v; if (setSyncedVersion) setSyncedVersion(v); }   // 更新 syncedVersion 一律走這裡＝順手持久化，reload 後才判斷得出雲端有沒有領先
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function setSnapshot(db) { synced = clone(db); if (setSyncedDb) setSyncedDb(synced); }
    function setDirty(v) { if (setLocalDirty) setLocalDirty(!!v); }

    function load() {
      onStatus('syncing');
      return client.getTrip(tripId).then(function (row) {
        if (!row) throw new Error('trip not found');
        var localDb = getLocalDb();
        var savedSnapshot = getSyncedDb ? getSyncedDb() : null;
        var hasRealPendingEdit = !!(getLocalDirty && getLocalDirty()) && !!savedSnapshot && localDb && !same(localDb, savedSnapshot);
        if (hasRealPendingEdit) {
          if (syncedVersion >= 0 && row.version === syncedVersion) {
            // 同版號：雲端沒有新變更，保留 debounce 尚未送出的本機編輯。
            synced = clone(savedSnapshot);
            onStatus('synced');
            scheduleSave();
            return row;
          }
          if (syncedVersion < 0 || row.version > syncedVersion) {
            // 本機離線編輯與雲端新版同時存在：以上次同步快照做 base 三方合併，不丟任一邊。
            var mergedBoot = mergeDb(savedSnapshot, localDb, row.data);
            applyDb(mergedBoot);
            setSnapshot(row.data);
            setVer(row.version);
            setDirty(true);
            scheduleSave();
            return row;
          }
        }
        applyDb(row.data); setSnapshot(getLocalDb()); setVer(row.version); setDirty(false);  // 首次、無 dirty 或雲端領先：一律以雲端為準
        onStatus('synced'); return row;
      }).catch(function (e) { onStatus('offline'); throw e; });
    }

    function finishSave(saved, version) {
      setSnapshot(saved);
      setVer(version);
      saving = false;
      if (same(getLocalDb(), saved)) {
        setDirty(false);
        onStatus('synced');
      } else {
        // request 送出後又有新編輯：舊 request 成功不得清掉新 dirty。
        setDirty(true);
        scheduleSave();
      }
    }

    function doSave() {
      saveTimer = null;
      if (saving) return;
      saving = true;
      var local = clone(getLocalDb());                              // 凍結這一刻的本機狀態當「mine」
      return client.saveTrip(tripId, local, syncedVersion).then(function (v) {
        if (v !== -1) { finishSave(local, v); return; }
        return client.getTrip(tripId).then(function (row) {            // 衝突 → 拉遠端、合併、重試一次
          var merged = mergeDb(synced, clone(getLocalDb()), row.data); // 連第一次 request 送出後的新編輯也一起合併
          applyDb(merged);
          var mergedLocal = clone(getLocalDb());                       // 套用後快照（同 load 的紀律），衝突後 poll 才不會誤判 dirty
          return client.saveTrip(tripId, mergedLocal, row.version).then(function (v2) {
            if (v2 !== -1) finishSave(mergedLocal, v2);
            else { saving = false; setSnapshot(row.data); setVer(row.version); setDirty(true); scheduleSave(); } // 仍衝突 → 稍後再合併
          });
        });
      }).catch(function () { saving = false; setDirty(true); onStatus('offline'); });
    }

    function scheduleSave() {
      var local = getLocalDb();
      if (synced && same(local, synced) && !saving) {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        setDirty(false);
        return;
      } // 普通開頁／尚未送出就復原：取消 debounce，不可讓雲端空增版本
      setDirty(true);                                                // debounce 前先持久化，reload 才知道這是同旅程的真編輯
      onStatus('syncing');
      if (saving) return;                                            // 進行中的 request 完成後會比對當下資料並續送
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, 800);
    }

    function poll() {
      return client.getTripVersion(tripId).then(function (v) {
        var dirty = !!(getLocalDirty && getLocalDirty()) || !same(getLocalDb(), synced);
        if (dirty) { scheduleSave(); return; }                         // 離線存檔失敗後，網路恢復時自動重送／衝突合併
        if (typeof v === 'number' && v > syncedVersion) {
          return client.getTrip(tripId).then(function (row) {
            applyDb(row.data); setSnapshot(getLocalDb()); setVer(row.version); setDirty(false); onStatus('synced');
          });
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
