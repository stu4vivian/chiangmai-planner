const SLOTS=[
 {key:'breakfast',label:'早餐',kind:'meal',ctx:'',icon:'🌅'},{key:'am',label:'行程',kind:'act',ctx:'上午'},
 {key:'lunch',label:'午餐',kind:'meal',ctx:'',icon:'🍴'},{key:'afternoon',label:'行程',kind:'act',ctx:'午後'},
 {key:'snack',label:'點心',kind:'meal',ctx:'',icon:'🍢'},{key:'evening',label:'行程',kind:'act',ctx:'傍晚'},
 {key:'dinner',label:'晚餐',kind:'meal',ctx:'',icon:'🌙'},{key:'night',label:'行程',kind:'act',ctx:'晚'},
 {key:'stay',label:'住宿',kind:'stay',ctx:''}
];
function slotObj(k){return SLOTS.find(s=>s.key===k)||{label:k,kind:'act',ctx:''};}
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}   // &<>"' 全跳脫：擋屬性逃逸＋未來單引號屬性洞

const SEED_PLACES=[
 {id:'p_arrival',name:'抵達清邁機場',en:'Chiang Mai Airport',type:'其他',area:'其他',lat:18.7669,lng:98.9626,hours:'8/22 下午',price:'',note:'黃昏前進城安頓'},
 {id:'p_fly',name:'回程班機',en:'Chiang Mai Airport',type:'其他',area:'其他',lat:18.7669,lng:98.9626,hours:'9/1 晚',price:'',note:'白天還能採購收尾'},
 {id:'p_north',name:'北門夜市 鳳飛飛豬腳飯',en:'Cowgirl Hat Lady Khao Kha Moo Chang Phueak',type:'食物',area:'古城',lat:18.7948,lng:98.9862,hours:'每晚 17:00–24:00',price:'豬腳飯 30–40',note:'第一晚抓物價第一印象'},
 {id:'p_khaosoi',name:'咖哩麵 Khao Soi',en:'Khao Soi Mae Sai',type:'食物',area:'北/東北',lat:18.7990,lng:98.9740,hours:'午餐',price:'50–80',note:'清邁必吃'},
 {id:'p_chedi',name:'契迪隆寺',en:'Wat Chedi Luang',type:'景點',area:'古城',lat:18.7869,lng:98.9863,hours:'8:00–18:00',price:'門票 ~40',note:'正午曬→排早晚'},
 {id:'p_singh',name:'帕辛寺',en:'Wat Phra Singh',type:'景點',area:'古城',lat:18.7887,lng:98.9817,hours:'6:00–20:00',price:'門票 ~20',note:'古城散步'},
 {id:'p_baan',name:'藝術村 Baan Kang Wat',en:'Baan Kang Wat',type:'景點',area:'尼曼/西',lat:18.7760,lng:98.9430,hours:'二–日 10:00–18:00（週一休）',price:'免費逛',note:'排週四 8/27·別排週一'},
 {id:'p_sunday',name:'週日夜市',en:'Sunday Walking Street Chiang Mai',type:'娛樂',area:'古城',lat:18.7882,lng:98.9890,hours:'週日 16:00–23:00',price:'隨意',note:'8/23、8/30 兩個週日'},
 {id:'p_saturday',name:'週六夜市',en:'Saturday Walking Street Wua Lai',type:'娛樂',area:'古城',lat:18.7820,lng:98.9888,hours:'週六 17:00–22:00',price:'隨意',note:'8/29 夜市區步行可達'},
 {id:'p_cmu',name:'清邁大學夜市',en:'CMU Night Market (Front Gate)',type:'娛樂',area:'尼曼/西',lat:18.8030,lng:98.9530,hours:'傍晚起',price:'小吃 30–60',note:'尼曼段晚上'},
 {id:'p_bazaar',name:'觀光夜市',en:'Chiang Mai Night Bazaar',type:'娛樂',area:'濱河/東',lat:18.7872,lng:99.0005,hours:'每晚 18:00–24:00',price:'隨意',note:'夜市區步行 8 分'},
 {id:'p_massage',name:'泰式按摩（質感店）',en:'Fah Lanna Spa',type:'娛樂',area:'古城',lat:18.7905,lng:98.9921,hours:'依店家',price:'1hr 300–500',note:'正午躲熱的好選擇'},
 {id:'p_jingjai',name:'真心市集',en:'Jing Jai Market',type:'逛街',area:'北/東北',lat:18.8062,lng:98.9990,hours:'週末早 6:00–14:00',price:'小吃 30–60',note:'週末限定·趁早最涼'},
 {id:'p_coconut',name:'椰林市集',en:'Rustic Market Chiang Mai',type:'逛街',area:'北/東北',lat:18.8120,lng:99.0180,hours:'週五–日 8:00–15:00',price:'小吃 30–60',note:'偏郊·拍照為主·可略'},
 {id:'p_warorot',name:'瓦洛洛市場',en:'Warorot Market',type:'逛街',area:'濱河/東',lat:18.7905,lng:98.9985,hours:'6:00–17:00',price:'在地行情',note:'古城東 7 分·順遊'},
 {id:'p_onenimman',name:'One Nimman',en:'One Nimman',type:'逛街',area:'尼曼/西',lat:18.7967,lng:98.9672,hours:'11:00–22:00',price:'美食街 100–300',note:'冷氣避熱·有果汁'},
 {id:'p_maya',name:'Maya 美食街',en:'Maya Lifestyle Shopping Center',type:'逛街',area:'尼曼/西',lat:18.8016,lng:98.9669,hours:'11:00–22:00',price:'美食街 100–300',note:'正午躲熱·可工作'},
 {id:'p_hotel_old',name:'古城內飯店（待訂）',en:'',type:'住宿',area:'古城',lat:null,lng:null,hours:'8/22–8/25 四晚',price:'',note:'點編輯填實際飯店'},
 {id:'p_hotel_nimman',name:'尼曼飯店（待訂）',en:'',type:'住宿',area:'尼曼/西',lat:null,lng:null,hours:'8/26–8/28 三晚',price:'',note:'點編輯填實際飯店'},
 {id:'p_hotel_market',name:'夜市區飯店（待訂）',en:'',type:'住宿',area:'濱河/東',lat:null,lng:null,hours:'8/29–8/31 三晚',price:'',note:'點編輯填實際飯店'}
];
function seedPlan(){
  const p=[
    {id:'pl_a',placeId:'p_arrival',day:'0822',slot:'afternoon'},
    {id:'pl_f',placeId:'p_fly',day:'0901',slot:'night'},
    {id:'pl_n',placeId:'p_north',day:'0822',slot:'dinner'},
  ];
  ['0822','0823','0824','0825'].forEach((d,i)=>p.push({id:'pl_ho'+i,placeId:'p_hotel_old',day:d,slot:'stay'}));
  ['0826','0827','0828'].forEach((d,i)=>p.push({id:'pl_hn'+i,placeId:'p_hotel_nimman',day:d,slot:'stay'}));
  ['0829','0830','0831'].forEach((d,i)=>p.push({id:'pl_hm'+i,placeId:'p_hotel_market',day:d,slot:'stay'}));
  return p;
}

const SYNC_URL='https://htfwjemyiwikqmjinwou.supabase.co';   // Supabase Project URL
const SYNC_ANON='sb_publishable_u4WsC2jEAtZuughbmTnS4g_hs46ApK5';  // Supabase anon/publishable key（設計上可公開）
const V2_ENV = /(^|\/)v2(\/|$)/.test(location.pathname);   // 部署在 /v2/ 子路徑＝獨立沙盒：localStorage 與正式版完全隔離（碰不到正式版的真實行程；v2 自開一份測試行程）
const TRIPKEY=V2_ENV?'cnx-trip-id-v2':'cnx-trip-id';
let syncCtl=null;    // 同步控制器（連上線後才有）
const KEY=V2_ENV?'cnx-proto-v2':'cnx-proto-v10', OLDKEY=V2_ENV?'cnx-proto-v2-none':'cnx-proto-v9';
let DB=load(), places=DB.places, manualLines=DB.manualLines, settings=DB.settings;
let TRIP=DB.trip, DAYS=CNXCore.deriveDays(TRIP);
let plan, base, slotMetaArr;
const AV_KEY=V2_ENV?'cnx-active-v-v2':'cnx-active-v';   // active 版本是每台裝置自己的（不進雲端文件）
const OVMODE_KEY=V2_ENV?'cnx-ov-mode-v2':'cnx-ov-mode';   // 粗流顯示模式（per-device、不進雲端）；預設桌機 table、手機 matrix
function ovMode(){ const m=localStorage.getItem(OVMODE_KEY); return (m==='table'||m==='matrix')?m:(isDesktop()?'table':'matrix'); }
function setOvMode(m){ localStorage.setItem(OVMODE_KEY, m==='table'?'table':'matrix'); }
function av(){ const id=localStorage.getItem(AV_KEY);
  return DB.versions.find(v=>v.id===id) || DB.versions[0]; }
function setActiveLocal(id){ if(DB.versions.some(v=>v.id===id)){ localStorage.setItem(AV_KEY,id); syncActive(); } }
function syncActive(){ const v=av(); plan=v.plan; base=v.base; slotMetaArr=v.slotMeta; }
syncActive();
function regionsList(){ return (TRIP.regions||[]); }
function regionLabel(k){ return CNXCore.regionLabel(TRIP,k); }
function cuisineLabel(k){ return CNXCore.cuisineLabel(TRIP,k); }
function zoneColor(z){ return CNXCore.regionColor(TRIP,z); }   // 名稱沿用、內部改 regionColor；呼叫點傳的是 region key
function finishLoad(db){   // migrate＋升級路徑：plan 內還有 stay 項且 base 空 → 推導 base（zone 依「實際住宿卡的 area→zone」對應，非寫死日期）
  db=CNXCore.migrate(db);
  // 對「每一個」版本各自升級（不只 active）：active 是 per-device，若只升 active，同一份備份在兩台裝置會升出不同結果＋他版維持壞掉
  const upgradeVer=v=>{
    if(!(v && (!v.base||!v.base.length) && (v.plan||[]).some(e=>e.slot==='stay'))) return;
    const stayByDay={}, nights={};
    v.plan.forEach(e=>{ if(e.slot==='stay'&&e.placeId){ stayByDay[e.day]=e.placeId; nights[e.placeId]=(nights[e.placeId]||0)+1; } });
    let prevZone='';
    const days=CNXCore.deriveDays(db.trip).map(d=>{
      const hotel=db.places.find(p=>p.id===stayByDay[d.id]);
      const zone=hotel ? hotel.area : prevZone;   // v18：hotel.area 已是 region key，住宿區＝該 key；無住宿日沿用前一天（涵蓋退房日），開頭沒住宿則為 ''
      prevZone=zone;
      return Object.assign({},d,{stay:zone});
    });
    // 升級補償：stay 排程移除後住宿成本改掛手動花費（id 決定性 → 兩台裝置各自升級也能 merge3wayById 去重；多版本各自升級也靠 id 去重不重複加）
    Object.keys(nights).forEach(pid=>{
      const p=db.places.find(x=>x.id===pid);
      if(!p||!p.cost||p.cost.amount==null) return;
      const mid='ml_stay_'+pid;
      if(db.manualLines.some(m=>m.id===mid)) return;
      db.manualLines.push({id:mid,label:'住宿 '+p.name+' ×'+nights[pid]+'晚',type:'住宿',per:p.cost.per==='person'?'person':'shared',qty:1,amount:nights[pid]*p.cost.amount});
    });
    const r=CNXCore.deriveBaseFromStay(days, v.plan, db.places);
    v.base=r.base; v.plan=r.plan;
  };
  (db.versions||[]).forEach(upgradeVer);
  return db;
}
function load(){
  try{
    const r=localStorage.getItem(KEY);
    if(r){ const d=JSON.parse(r); if(d&&d.places) return finishLoad(d); }
    const old=localStorage.getItem(OLDKEY);
    if(old){ const od=JSON.parse(old); if(od&&od.places){ const mig=finishLoad(od); localStorage.setItem(KEY,JSON.stringify(mig)); return mig; } } // 讀舊寫新，舊 key 留作備份
  }catch(e){}
  return finishLoad({places:JSON.parse(JSON.stringify(SEED_PLACES)),plan:seedPlan()});
}
function getLocalDb(){ return {schemaVersion:CNXCore.SCHEMA_VERSION, trip:TRIP, places, manualLines, settings, versions:DB.versions}; }   // 不含 activeVersionId（per-device）
function applyDb(db){
  DB=finishLoad(db);
  TRIP=DB.trip; DAYS=CNXCore.deriveDays(TRIP);
  places=DB.places; manualLines=DB.manualLines; settings=DB.settings;
  syncActive();   // active 來自本機 localStorage，不被雲端蓋
  localStorage.setItem(KEY, JSON.stringify(getLocalDb()));
  renderAll();
}
function save(){
  localStorage.setItem(KEY, JSON.stringify(getLocalDb()));   // 本機立即持久（離線快取）
  if(syncCtl) syncCtl.scheduleSave();                        // 有連線才排同步
}
function tcolor(t){ return CNXCore.catColor(TRIP,t); }
function temoji(t){ return CNXCore.catIcon(TRIP,t); }
function tlabel(t){ return CNXCore.catLabel(TRIP,t); }
function categoriesList(){ return (TRIP.categories||[]); }
function isLodging(p){ return CNXCore.roleOf(TRIP, p&&p.type)==='lodging'; }
function placeEmoji(p){ return esc((p&&p.icon)?p.icon:temoji(p.type)); }   // 在源頭跳脫：p.icon 為使用者自由輸入（防 XSS）；類別 emoji 無 &"< 不受影響
// 價格標籤單一真相（Task A）：shared（房/車/spa）→「/共用」，否則「/人」。所有顯示價格的地方都走這裡，避免共用品被標成「/人」誤導。
function costLabel(cost){ if(!cost||cost.amount==null) return ''; return 'NT$'+cost.amount+(cost.per==='shared'?'/共用':'/人'); }
// Tier 徽章單一真相（Task B）：一套沙墨色票 T1–T4（非飽和原色），全畫面共用。esc 安全（tier 來自固定 1–4，但仍只輸出受控字串）。t0=未標。
function tierBadge(tier){ const n=+tier||0; return `<span class="tbadge t${n}">${n?('T'+n):'＋標'}</span>`; }
function getPlace(id){ return places.find(p=>p.id===id); }
let uidSeq=0;
function uid(){ return 'x'+(Math.round(performance.now()*1000)%1e9).toString(36)+(uidSeq++).toString(36); }   // 單調遞增計數器去碰撞：同毫秒內連續建立也保證唯一（粗時鐘＋module 級序號）
function makePlace(partial){ return CNXCore.normalizePlace(Object.assign({id:uid(),addedAt:new Date().toISOString()},partial||{})); }   // addedAt：triage「🆕 待標」依此排序（新→舊）；normalizePlace 會保留字串 addedAt
function gmaps(p){
  if(p.mapsUrl && /^https?:\/\//i.test(p.mapsUrl)) return p.mapsUrl;  // 使用者貼的原連結最準（Task 16）；只信 http(s)，擋 javascript: 等危險 scheme（render 防護，含已同步髒資料）
  const term=(p.en&&/[a-zA-Z]/.test(p.en))?p.en:p.name;
  const base='https://www.google.com/maps/search/?api=1&query=';     // Google 官方跨平台 Maps URL：手機 app 也認得（舊 /place/?q=place_id: 在手機 Google Maps app 常開不了→連結全失效）
  if(p.placeId) return base+encodeURIComponent(term||'Chiang Mai')+'&query_place_id='+encodeURIComponent(p.placeId);  // query_place_id 釘準店家、query 必填當門面
  if(p.lat&&p.lng) return base+encodeURIComponent(p.lat+','+p.lng); // 有座標無 placeId：釘精確座標
  return base+encodeURIComponent((term||'')+' Chiang Mai');         // 都沒有：用店名搜尋
}
function placeSched(id){ return plan.filter(e=>e.placeId===id).map(e=>{const d=DAYS.find(x=>x.id===e.day)||{label:e.day};return (d.label||e.day||'?')+' '+slotObj(e.slot).label;}); }   // ||{} 防呆：匯入越界日（不在 DAYS）不崩 renderLib

let toastT=null;
function toast(msg, opts){ const el=document.getElementById('toast'); clearTimeout(toastT);
  el.textContent=msg;                                              // 純文字（自動跳脫）
  const undo=opts&&opts.undo;
  if(typeof undo==='function'){
    const b=document.createElement('span'); b.className='undo'; b.textContent='復原';
    b.addEventListener('click',()=>{ clearTimeout(toastT); el.classList.remove('on'); undo(); },{once:true});
    el.appendChild(b);
  }
  el.classList.add('on');
  toastT=setTimeout(()=>el.classList.remove('on'), undo?5000:2600);
}

// ── 地圖抽屜（collapsed ⇄ expanded＋📌 釘住） ──
let mapPinned=false;
const drawer=document.getElementById('mapdrawer');
function drawerOpen(){ return !drawer.classList.contains('collapsed'); }
function updateDrawerUI(){
  document.getElementById('mapbartxt').textContent = '🗺️ 地圖 '+(drawerOpen()?'▴':'▾');
  document.getElementById('pinbtn').classList.toggle('on',mapPinned);
  drawer.classList.toggle('pinned',mapPinned); // Task 17 並看互斥／styling 用的 drawer 層 hook（刻意保留）
}
function openDrawer(){
  if(document.body.classList.contains('split')) exitSplit();   // 並看與地圖抽屜互斥（手機#1：開地圖＝退出並看，不再兩個疊著沒處收）
  if(drawerOpen()){ updateDrawerUI(); return; }
  drawer.classList.remove('collapsed'); drawer.classList.add('expanded'); updateDrawerUI();
  initMap();
  setTimeout(()=>{ if(map){ map.invalidateSize(); renderMarkers(); } },60);   // 容器尺寸改變後 Leaflet 需要 invalidateSize
}
function closeDrawer(){
  // 純狀態切換：只收合抽屜，不動 mapPinned（Task 17 並看互斥需要收合後保留 pin 狀態以便還原）
  if(!drawerOpen()) return;
  drawer.classList.remove('expanded'); drawer.classList.add('collapsed'); updateDrawerUI();
}

let map,markers=[];
function initMap(){
  if(map) return;
  map=L.map('map').setView([TRIP.mapCenter.lat,TRIP.mapCenter.lng],TRIP.mapCenter.zoom||13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  if(!pendingSpot) renderMarkers();   // 有 pendingSpot 時跳過首次同步渲染：交給 openDrawer 的 deferred render（invalidateSize 後 marker 才有 el，spotlight 才套得上）
}
// ── 統一篩選狀態（Task 17）：庫頁列表＋地圖 marker 共用同一份 libF（雙向同步）──
let libF={areas:new Set(), tiers:new Set(), bands:new Set(), cuisines:new Set(), slots:new Set(), sched:'all', q:''};
function passLib(p){ return CNXCore.passLibFilters(p, {types:new Set(),areas:libF.areas,tiers:libF.tiers,bands:libF.bands,cuisines:libF.cuisines,slots:libF.slots,sched:libF.sched}, {plan, bands:TRIP.priceBands}); }
function matchQ(p){ const q=(libF.q||'').trim().toLowerCase(); if(!q) return true; return ((p.name||'')+' '+(p.note||'')).toLowerCase().includes(q); }

const TIER_LABEL={1:'①',2:'②',3:'③',4:'④'};
function renderMarkers(){
  if(!map||!drawerOpen()) return;   // 抽屜收合時不渲染（省效能；展開時會重繪一次）
  markers.forEach(m=>map.removeLayer(m)); markers=[];
  spotIds=null; spotFromPicker=false; spotFromCard=false; // 任何重繪/篩選清除 spotlight 狀態（新 marker 為乾淨樣式）
  places.filter(p=>(p.lat&&p.lng)&&passLib(p)).forEach(p=>{
    const icon=L.divIcon({className:'',html:`<div class="mapicon" style="border-color:${tcolor(p.type)}">${placeEmoji(p)}</div>`,iconSize:[26,26],iconAnchor:[13,13],popupAnchor:[0,-13]});
    const m=L.marker([p.lat,p.lng],{icon,riseOnHover:true,title:p.name}).addTo(map);   // title＝原生 hover tooltip（桌機滑過才出，手機不擋版面）
    m._pid=p.id;                    // spotlight 用：marker→place 對照
    const memo=(p.note||'').split('\n')[0].trim();
    m.bindPopup(`<b>${esc(p.name)}</b>${memo?'<br>💬 '+esc(memo):''}<br>
      <span class="popbtn" data-action="assign" data-id="${p.id}">📅 排入</span><span class="popbtn" data-action="edit" data-id="${p.id}">✎</span>`);
    markers.push(m);
  });
  if(pendingSpot){ const s=pendingSpot; pendingSpot=null; applySpot(s); spotFromCard=pendingFromCard; pendingFromCard=false; }   // 僅套用「剛被 mapSpotlight* 觸發開啟抽屜」的待辦（消費一次；一般篩選重繪不套用＝清除）；復原 spotFromCard（line 191 剛清掉、但這是開卡的 deferred 套用）
}

// ── 地圖 spotlight（Task 17 §4.10）：跳至＋放大目標＋壓暗其他；任何重繪/篩選清除 ──
// 時序模型（收合抽屜首開）：mapSpotlightSet 設 pendingSpot→openDrawer。initMap 偵測到 pendingSpot 跳過首次同步 renderMarkers；
// openDrawer 的 setTimeout(60) 在 invalidateSize（marker el 已佈局）後唯一一次 renderMarkers，於該次 build 完消費 pendingSpot→applySpot→設 spotIds。
// 故 deferred render 之後 spotlight 持續存在；之後任一篩選重繪 renderMarkers 會 spotIds=null＝清除。已開著時走 mapSpotlightSet 的 applySpot 直套，不經此路徑。
let spotIds=null;       // 目前生效的高亮集合（renderMarkers 重繪即歸 null）
let pendingSpot=null;   // 待套用（mapSpotlight* 開啟收合中的抽屜→等 deferred renderMarkers 後套用一次）
let spotFromPicker=false; // 目前 spotlight 是由挑選器 openPicker 觸發（close 時需清除；地圖看它/op-map 不屬此路徑）
function applySpot(ids){
  const set=ids instanceof Set?ids:new Set(ids); let any=false, bounds=[];
  markers.forEach(m=>{ if(set.has(m._pid)){ const p=getPlace(m._pid); if(p&&p.lat){ any=true; bounds.push([p.lat,p.lng]); } } });
  spotIds=any?set:null;   // 套用成功才保留；若目標被篩掉（無對應 marker）則放棄
  // 地圖移動：只在「有目標不在現有視野內」才移；全部已在畫面內→不動（避免亂跳）。先移動再套樣式（animate:false 同步寫定 translate3d，否則 setView/pan 重排覆寫 scale → 放大消失）。
  if(any&&bounds.length){
    const mb=map.getBounds();
    const allIn=bounds.every(b=>mb.contains(b));
    if(!allIn){
      if(bounds.length===1) map.panTo(bounds[0],{animate:false});            // 單目標：純平移、維持現有 zoom（不再強拉 16）
      else map.fitBounds(bounds,{padding:[40,40],maxZoom:15,animate:false});  // 多目標：一起框進畫面
    }
  }
  markers.forEach(m=>{ const el=m.getElement&&m.getElement(); if(!el) return;
    const hit=set.has(m._pid);
    el.style.opacity=hit?'1':'0.25';
    el.style.transform=el.style.transform.replace(/\s*scale\([^)]*\)/,'')+(hit?' scale(1.15)':'');   // 放大 1.25→1.15（清邁點密，太大會蓋鄰近 pin）
    el.style.zIndex=hit?'650':'';
  });
  return any;
}
function mapSpotlightSet(ids){ spotFromPicker=false;         // 重置：非挑選器路徑（地圖看它/op-map/pk-near）不標為 picker 來源；openPicker 會在呼叫本函式後立即覆寫為 true
  const list=(ids||[]).filter(id=>{ const p=getPlace(id); return p&&p.lat&&p.lng; });
  if(!list.length){ toast('這些卡片都沒有定位'); return; }
  const set=new Set(list);
  if(drawerOpen()&&map){ applySpot(set); }                 // 已開著→openDrawer 不重繪，直接套用
  else { pendingSpot=set; openDrawer(); }                  // 收合中→記下，openDrawer 的 setTimeout 會 renderMarkers→消費 pendingSpot
}
function mapSpotlight(id){ spotFromPicker=false;            // 重置：地圖看它不屬挑選器路徑，spotlight 應持久存在
  const p=getPlace(id); if(!p||!p.lat){ toast('這張卡沒有定位'); return; } mapSpotlightSet([id]); }
// ── 看/編輯卡片自動聚焦（本切片）：開卡自動亮該卡 pin；手機進「地圖小窗＋卡片同屏」co-view ──
let spotFromCard=false;     // 目前 spotlight 由「看/編輯卡片」自動觸發（關卡時清除；與手動「地圖看它」persist 區隔）
let pendingFromCard=false;  // 收合抽屜開卡時：deferred renderMarkers 會重置 spotFromCard，靠此旗標在套用 pendingSpot 後復原（否則桌機收軌開卡→關卡 spotlight 殘留）
let prevDrawerState=null;   // 進 co-view 前的抽屜狀態（'collapsed'|'expanded'|'pinned'），關卡還原
function autoSpot(ids, opts){
  opts=opts||{};
  const list=(Array.isArray(ids)?ids:[ids]).filter(id=>{ const p=getPlace(id); return p&&p.lat!=null&&p.lng!=null; });
  if(!list.length) return;                                   // 沒定位→靜默跳過（不進 co-view、不 toast）
  const set=new Set(list);
  // 手機：不硬開地圖。Vivian 回饋①點行程不該強制跳出地圖 ②開地圖抽屜(svh/dvh reflow)害 iOS 編輯完捲動跳回最前面。
  // 規則：地圖「已經開著」才更新 pin；沒開就完全不動地圖、不進 co-view。要看地圖→用卡片裡的「🗺️ 地圖看它」。
  if(!isDesktop()){
    if(document.body.classList.contains('split')){ spotFromCard=true; pendingSpot=set; pendingFromCard=true; return; }   // 並看：佇列，待開地圖時才亮
    if(drawerOpen()){ spotFromCard=true; mapSpotlightSet([...set]); }   // 地圖已開→更新 pin（不開抽屜、不捲動）
    return;
  }
  // 桌機：地圖是側欄、不擠版面，維持看/編輯卡自動聚焦
  spotFromCard=true;
  mapSpotlightSet([...set]);
  if(pendingSpot) pendingFromCard=true;
}
function exitCardPeek(){
  document.body.classList.remove('cardpeek','peek-edit');    // idempotent（openSheet 可能已清）；以 prevDrawerState 判定有沒有 co-view session 要還原
  if(prevDrawerState==='collapsed'){ mapPinned=false; closeDrawer(); }   // 開卡前是收合→還原收回（其餘狀態留著地圖）
  prevDrawerState=null;
}
function isDesktop(){ return window.matchMedia&&window.matchMedia('(min-width:1100px)').matches; }   // 桌機三欄（spec §4.12）
const NEAR_M=2500;   // 「附近」門檻（清邁市區小）；未來可進設定
function nearSeg(p, seg){   // 卡片 p 是否屬該天基地「附近」：有座標→參考點距離≤NEAR_M；無座標→region key 相同
  if(!seg) return false;
  const ref=CNXCore.dayReferencePoint(seg, places, TRIP);
  if(ref && p.lat!=null && p.lng!=null){ const d=CNXCore.distanceM(p,ref); return d!=null && d<=NEAR_M; }
  return p.area===seg.region;   // 無座標退 region 相同
}

