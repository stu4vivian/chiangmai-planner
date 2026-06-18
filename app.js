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
let peekScrollY=null;       // 進 co-view 前的頁面捲動位置，關卡還原（iOS：cardpeek 開地圖抽屜會丟捲動→「編輯完跳回最前面」）
function autoSpot(ids, opts){
  opts=opts||{};
  const list=(Array.isArray(ids)?ids:[ids]).filter(id=>{ const p=getPlace(id); return p&&p.lat!=null&&p.lng!=null; });
  if(!list.length) return;                                   // 沒定位→靜默跳過（不進 co-view、不 toast）
  const set=new Set(list);
  spotFromCard=true;
  if(!isDesktop() && document.body.classList.contains('split')){
    pendingSpot=set; pendingFromCard=true; return;           // 並看中：只佇列，待開地圖時亮（reveal-on-close；不觸發 openDrawer→exitSplit、不破並看版面）
  }
  if(!isDesktop()){                                          // 手機非並看：進 co-view（地圖小窗＋卡片同屏）
    if(prevDrawerState===null){                              // 首次進 co-view session 才記抽屜原狀態（用 prevDrawerState 非 class——openSheet 已清 class；view→edit 巢狀不覆寫）
      prevDrawerState = mapPinned ? 'pinned' : (drawerOpen()?'expanded':'collapsed');
      peekScrollY = window.scrollY;                          // 記住開卡前捲動位置，關卡還原（同上）
    }
    document.body.classList.add('cardpeek');
    document.body.classList.toggle('peek-edit', !!opts.edit);
  }
  mapSpotlightSet([...set]);                                 // 既有：抽屜開→直接 applySpot；收合→pendingSpot+openDrawer→deferred render→applySpot
  if(pendingSpot) pendingFromCard=true;                      // 收合路徑：spotlight 由 deferred render 套用→標記它來自卡片（render 後復原 spotFromCard，關卡才清得掉）
}
function exitCardPeek(){
  document.body.classList.remove('cardpeek','peek-edit');    // idempotent（openSheet 可能已清）；以 prevDrawerState 判定有沒有 co-view session 要還原
  if(prevDrawerState==='collapsed'){ mapPinned=false; closeDrawer(); }   // 開卡前是收合→還原收回（其餘狀態留著地圖）
  prevDrawerState=null;
  if(peekScrollY!=null){ const y=peekScrollY; peekScrollY=null;          // 還原開卡前捲動位置（rAF 等版面回穩後再捲；修 iOS「編輯完跳頂」）
    requestAnimationFrame(()=>window.scrollTo(0,y)); }
}
function isDesktop(){ return window.matchMedia&&window.matchMedia('(min-width:1100px)').matches; }   // 桌機三欄（spec §4.12）
const NEAR_M=2500;   // 「附近」門檻（清邁市區小）；未來可進設定
function nearSeg(p, seg){   // 卡片 p 是否屬該天基地「附近」：有座標→參考點距離≤NEAR_M；無座標→region key 相同
  if(!seg) return false;
  const ref=CNXCore.dayReferencePoint(seg, places, TRIP);
  if(ref && p.lat!=null && p.lng!=null){ const d=CNXCore.distanceM(p,ref); return d!=null && d<=NEAR_M; }
  return p.area===seg.region;   // 無座標退 region 相同
}

// ── 庫頁（Task 17 §4.8）：膠囊篩選＋triage＋三行列＋行內快標 tier ──
const CAP_DEFS=[
  {key:'areas', label:'地區', kind:'set', opts:()=>regionsList().filter(r=>places.some(p=>p.area===r.key)).map(r=>[r.key,r.label])},
  {key:'tiers', label:'Tier', kind:'set', opts:()=>[1,2,3,4].map(t=>[t,TIER_LABEL[t]+' tier'+t]), valLabel:v=>TIER_LABEL[v]},
  {key:'bands', label:'價格', kind:'set', opts:()=>(TRIP.priceBands.tiers||[]).map(t=>[t.label,t.label])},
  {key:'cuisines', label:'菜系', kind:'set', opts:()=>(TRIP.cuisinesList||[]).map(c=>[c.key,c.label])},
  {key:'slots', label:'時段', kind:'set', opts:()=>[['morning','早'],['noon','中午'],['evening','晚上']]},
  {key:'sched', label:'狀態', kind:'sched'}
];
const SCHED_OPTS=[['all','全部'],['in','已排入'],['out','未排入']];
function capText(def){
  if(def.kind==='sched'){ const cur=libF.sched; if(cur==='all') return def.label+' ▾';
    const o=SCHED_OPTS.find(o=>o[0]===cur); return def.label+'·'+(o?o[1]:cur)+' ▾'; }
  const set=libF[def.key]; if(!set.size) return def.label+' ▾';
  const f=def.valLabel||(v=>v); const vals=[...set].map(f);
  return def.label+'·'+(vals.length<=1?vals[0]:vals.length+'項')+' ▾';
}
function renderCaps(){
  const el=document.getElementById('libCaps'); if(!el) return;
  el.innerHTML=CAP_DEFS.map(def=>{ const active=def.kind==='sched'?libF.sched!=='all':libF[def.key].size>0;
    return `<span class="cap ${active?'set':''}${capPanelKey===def.key?' open':''}" data-action="lib-cap" data-cap="${def.key}">${esc(capText(def))}</span>`; }).join('');
}
let capPanelKey=null;   // 目前就地展開的膠囊維度（null＝收合）
function capPanelChipsHTML(def){
  if(def.kind==='sched') return SCHED_OPTS.map(([v,l])=>`<span class="fchip ${libF.sched===v?'on':''}" data-action="cap-sched" data-v="${v}">${esc(l)}</span>`).join('');
  return def.opts().map(([v,l])=>`<span class="fchip ${libF[def.key].has(typeof v==='number'?v:String(v))?'on':''}" data-action="cap-tog" data-cap="${def.key}" data-v="${esc(String(v))}" data-num="${typeof v==='number'?1:''}">${esc(l)}</span>`).join('');
}
function renderCapPanel(){   // 就地展開面板（取代彈窗）：自動高度、緊貼膠囊列、用同一套 .fchip
  const el=document.getElementById('libCapPanel'); if(!el) return;
  const def=capPanelKey?CAP_DEFS.find(d=>d.key===capPanelKey):null;
  if(!def){ el.hidden=true; el.innerHTML=''; return; }
  el.hidden=false;
  el.innerHTML=`<div class="cn-head"><span class="lab">${esc(def.label)}</span><span class="hint">${def.kind==='set'?'可複選':'單選'}</span><button class="done" data-action="cap-close">收起</button></div><div class="cn-chips">${capPanelChipsHTML(def)}</div>`;
}
function toggleCapPanel(key){ capPanelKey=(capPanelKey===key)?null:key; renderCaps(); renderCapPanel(); }
function libRow(p){
  const band=CNXCore.priceBandOf(p.cost&&p.cost.amount, TRIP.priceBands);
  const pr=costLabel(p.cost);
  const memo=(p.note||'').split('\n')[0].trim();
  const sc=placeSched(p.id);
  const tnum=p.tier||0;
  const facts=[esc(CNXCore.condenseHours(p)), esc(p.cuisine?cuisineLabel(p.cuisine):''), esc(p.area?regionLabel(p.area):''), sc.length?'<span class="on">已排 '+esc(sc[0])+(sc.length>1?' +'+(sc.length-1):'')+'</span>':'未排入'].filter(Boolean).join('｜');
  return `<div class="lrow" data-action="lib-detail" data-id="${p.id}">
    <div class="l1"><span class="tbadge ltier t${tnum}" data-action="lib-tier" data-id="${p.id}">${tnum?('T'+tnum):'＋標'}</span>${placeEmoji(p)} <span class="nm">${esc(p.name)}</span>${pr?`<span class="pr">${pr}${band?'·'+esc(band):''}</span>`:''}</div>
    ${memo?`<div class="l2">💬 ${esc(memo)}</div>`:''}
    <div class="l3">${facts}</div></div>`;
}
let triageCollapsed=localStorage.getItem('cnx-triage-collapsed')==='1';
let triageSkipped=new Set();   // 本次 session「跳過」的待標卡（不改資料、只暫時不催）
let triageShowAll=false;       // 本次 session 是否展開「看更多」（預設只露前 N 列，避免條太長）
const TRIAGE_CAP=6;            // 預設可見列數上限
function needsTier(p){ return CNXCore.roleOf(TRIP,p.type)==='normal'; }
function renderTriage(){
  const el=document.getElementById('triageStrip'); if(!el) return;
  const todo=places.filter(p=>p.tier==null&&needsTier(p)&&!triageSkipped.has(p.id)&&matchQ(p)).sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''));
  if(!todo.length){ el.innerHTML=''; return; }
  let body='';
  if(!triageCollapsed){
    const vis=triageShowAll?todo:todo.slice(0,TRIAGE_CAP);
    body=vis.map(p=>`<div class="ti">${placeEmoji(p)} <span class="nm">${esc(p.name)}</span>
    <div class="tset">${[1,2,3,4].map(n=>`<span class="tchip t${n}" data-action="triage-tier" data-id="${p.id}" data-tier="${n}">T${n}</span>`).join('')}<span class="skip" data-action="triage-skip" data-id="${p.id}">跳過</span></div></div>`).join('');
    if(!triageShowAll&&todo.length>TRIAGE_CAP) body+=`<div class="ti" style="justify-content:center"><span class="skip" data-action="triage-more" style="margin:2px auto">看更多（${todo.length-TRIAGE_CAP}）</span></div>`;
  }
  el.innerHTML=`<div class="triage"><div class="th" data-action="triage-toggle">🆕 ${todo.length} 家待標<span class="tg">${triageCollapsed?'展開 ▾':'收起 ▴'}</span></div>${body}</div>`;
}
function renderLib(){
  renderCaps(); renderCapPanel(); renderTriage();
  const list=places.filter(p=>passLib(p)&&matchQ(p)).sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''));   // 新卡置頂（依 addedAt 新→舊，比照 renderTriage）
  const cntEl=document.getElementById('libCount'); if(cntEl) cntEl.textContent=list.length+' 家'+(list.length!==places.length?(' / 共 '+places.length):'');
  const el=document.getElementById('listgrid'); if(!el) return;
  el.innerHTML=list.length?list.map(libRow).join(''):'<div class="lib-empty">（沒有符合的卡片）</div>';
}

function slotMetaOf(day,slot){ return slotMetaArr.find(m=>m.day===day&&m.slot===slot); }
// ── 總覽矩陣（切片 A Task 7，藍本＝_prototype_overview.html 行 145–167，資料改吃 CNXCore.overviewModel 與細看同源）──
function ovCellHTML(items,tentative){
  if(!items.length) return tentative
    ? '<div class="ov-empty ov-tent" title="這格已標待定·之後要填">⏳ 待定</div>'   // 空格＋待定→提醒「這還要填」（Vivian #3）
    : '<div class="ov-empty">＋</div>';
  const tip = tentative ? '<div class="ov-tent-line" title="這格已標待定">⏳ 待定</div>' : '';   // 有項目又標待定→也提示
  return tip + items.map(it=>{
    const p=getPlace(it.placeId);
    const warn=it.warn?`<span class="ov-warn" title="${esc(it.warn)}">⚠️</span>`:'';
    return `<div class="ov-line">${warn}<span class="em">${placeEmoji(p)}</span><span class="nm">${esc(it.name)}</span></div>`;
  }).join('');
}
function renderOverviewMatrix(){
  const el=document.getElementById('ribbon'); if(!el) return;
  const model=CNXCore.overviewModel(DAYS, plan, places, slotMetaArr);   // slotMetaArr→待定旗標同源
  el.innerHTML=model.map(row=>{
    const seg=CNXCore.baseForDay(base,row.day.id)||{};
    const col=zoneColor(seg.region);
    return `<div class="ov-day" data-action="openday" data-day="${row.day.id}">
      <div class="ov-dnode"><div class="ov-dchip" style="background:${col}"><span>${esc((row.day.label.split('/')[1])||row.day.label)}</span><span class="wd">${esc(row.day.wd)}</span></div><div class="ov-zone">${esc(regionLabel(seg.region)||'—')}</div></div>
      <div class="ov-cell">${ovCellHTML(row.periods['早'],row.tentative['早'])}</div>
      <div class="ov-cell">${ovCellHTML(row.periods['午'],row.tentative['午'])}</div>
      <div class="ov-cell">${ovCellHTML(row.periods['晚'],row.tentative['晚'])}</div>
    </div>`;
  }).join('');
}
function renderOverview(){
  const flow=document.getElementById('pg-flow');
  const m=ovMode();
  if(flow){ flow.classList.toggle('mode-table', m==='table'); flow.classList.toggle('mode-matrix', m!=='table'); }
  if(m==='table') renderOverviewTable(); else renderOverviewMatrix();
}
// ── v1 表格總覽（粗流雙版面）：直欄＝天、橫列＝細時段；資料讀 plan（與細排同源）、點擊走 v2、天欄/住宿讀 base 地區、⚠️走 cellWarning ──
function renderOverviewTable(){   // v1 風格：前段/後段兩塊 table.mx；移植 v1 matrix 視覺、資料/色彩改吃 v2
  const el=document.getElementById('ribbon'); if(!el) return;
  const blocks=[DAYS.slice(0,6), DAYS.slice(6)].filter(d=>d.length);   // 不橫向擠成一條（像 v1 分前段/後段）
  el.innerHTML=blocks.map((days,i)=>
    `<div class="ovt-blocklab">${i===0?'前段':'後段'} ${esc(days[0].label)}–${esc(days[days.length-1].label)}</div><div class="ovt-wrap">${ovtTable(days)}</div>`
  ).join('');
}
function ovtTable(days){
  const regOf=d=>(CNXCore.baseForDay(base,d.id)||{}).region||'';
  const tintOf=d=>zoneColor(regOf(d))+'1c';   // 區色淡染（同色低透明，像 v1 zold/znim/zmkt 的暖/冷/綠底）
  const cols='<colgroup><col class="slcol">'+days.map(()=>'<col class="daycol">').join('')+'</colgroup>';
  const head='<tr><th class="corner"></th>'+days.map(d=>{ const r=regOf(d);
    return `<th>${esc(d.label)}<br><span class="zc" style="background:${zoneColor(r)}">${esc(d.wd)}·${esc(regionLabel(r)||'—')}</span></th>`;
  }).join('')+'</tr>';
  let body='';
  SLOTS.forEach(s=>{
    const lab=`<td class="sl ${s.kind}">${s.kind==='meal'?esc(s.icon||'')+' ':s.kind==='stay'?'🏨 ':''}${esc(s.label)}${s.ctx?'<br><span class="ctx">'+esc(s.ctx)+'</span>':''}</td>`;
    body+=`<tr class="${s.kind}">`+lab+days.map(d=>{
      const tint=tintOf(d);
      if(s.kind==='stay'){
        const seg=CNXCore.baseForDay(base,d.id)||{}, hp=seg.hotelPlaceId?getPlace(seg.hotelPlaceId):null;
        const nm=hp?esc(hp.name):'（'+esc(regionLabel(seg.region)||'未設')+'・待訂）';
        return `<td class="c" style="background:${tint}" data-action="openday" data-day="${d.id}"><div class="ovt-mi" style="border-left-color:${zoneColor(seg.region)}">🏨 <span class="nm">${nm}</span></div></td>`;
      }
      const meta=slotMetaOf(d.id,s.key); let pre='';
      if(meta&&meta.pk) pre+=`<span class="ovt-pk">2選1</span>`;
      if(meta&&meta.tentative) pre+=`<span class="ovt-tent" data-action="cleartent" data-day="${d.id}" data-slot="${s.key}">⏳ 待定</span>`;
      const entries=plan.filter(e=>e.day===d.id&&e.slot===s.key);
      let inner;
      if(entries.length){
        const day=DAYS.find(x=>x.id===d.id), per=CNXCore.slotPeriod(s.key);
        inner=entries.map(e=>{ const p=getPlace(e.placeId); if(!p) return '';
          const warn=per?CNXCore.cellWarning(p,day,per):'';
          return `<div class="ovt-mi" style="border-left-color:${tcolor(p.type)}" data-action="occpanel" data-eid="${e.id}">${warn?`<span class="warn" title="${esc(warn)}">⚠️</span>`:''}${placeEmoji(p)} <span class="nm">${esc(p.name)}</span></div>`;
        }).join('');
      } else inner='<span class="cempty">＋</span>';
      return `<td class="c" style="background:${tint}" data-action="pickslot" data-day="${d.id}" data-slot="${s.key}">${pre}${inner}</td>`;
    }).join('')+'</tr>';
  });
  return `<table class="mx">${cols}${head}${body}</table>`;
}
function renderFlowbar(){
  const el=document.getElementById('flowbar'); if(!el) return;
  const m=ovMode(), split=document.body.classList.contains('split');
  el.innerHTML=`<span class="ovseg">
    <span class="${m==='table'?'on':''}" data-action="ovmode" data-m="table">表格</span>
    <span class="${m==='matrix'?'on':''}" data-action="ovmode" data-m="matrix">矩陣</span>
  </span>
  <button class="flowsplit" data-action="flow-split">${split?'⇅ 收回':'⇅ 並看'}</button>`;
}
function applyOvMode(){ renderFlowbar(); renderOverview(); applyDesk(); }
function renderRibbon(){ renderOverview(); }   // renderAll 呼叫點保留、內部走總覽（表格/矩陣）
// ── 細排（Task 12）：點某天→bottom sheet；每 occurrence 獨立一列、原生 time picker、⏳待定列、住宿列 ──
function dayRowsHTML(dayId){   // 共用：某天細排各 slot 列（細看 sheet／桌機右欄細看共用）
  const seg=CNXCore.baseForDay(base,dayId)||{};
  let rows='';
  SLOTS.forEach(s=>{
    if(s.kind==='stay'){
      const hp=seg.hotelPlaceId?getPlace(seg.hotelPlaceId):null;
      rows+=`<div class="erow"><div class="etl">🏨住宿</div><div class="ec"><div class="stayrow">🏨 <span class="nm">${hp?esc(hp.name):'（'+esc(regionLabel(seg.region)||'未設')+'・待訂）'}</span><span class="chg" data-action="hotel-pick" data-day="${dayId}">${hp?'換飯店':'選飯店'}</span><span class="chg" data-action="openbase" data-day="${dayId}">改地區</span></div></div></div>`;
      return;
    }
    const isMeal=s.kind==='meal';
    const meta=slotMetaOf(dayId,s.key);
    const entries=plan.filter(e=>e.day===dayId&&e.slot===s.key);
    let cells='';
    if(meta&&meta.tentative) cells+=`<div class="tentrow" data-action="cleartent" data-day="${dayId}" data-slot="${s.key}">⏳ 待定中（點一下取消）</div>`;
    if(entries.length){
      // 已填→緊湊：占用列堆左欄＋右側小「＋」加第二項（密度，Vivian 回饋）。精確鐘點＝切片6，此處不放編輯鈕；已設時間唯讀顯示。
      const items=entries.map(e=>{ const p=getPlace(e.placeId); if(!p) return '';
        const tm=e.startTime?`<span class="dtime">🕑${esc(e.startTime)}</span>`:'';
        return `<div class="ditem ${isMeal?'meal':''}" data-action="occpanel" data-eid="${e.id}">${placeEmoji(p)} <span class="nm">${esc(p.name)}</span>${tm}</div>`;
      }).join('');
      cells+=`<div class="fillrow"><div class="fillitems">${items}</div><div class="dadd-mini" data-action="pickslot" data-day="${dayId}" data-slot="${s.key}" title="再加一項">＋</div></div>`;
    } else {
      cells+=`<div class="dadd" data-action="pickslot" data-day="${dayId}" data-slot="${s.key}">＋ 加入${isMeal?s.label:''}</div>`;
    }
    rows+=`<div class="erow"><div class="etl ${isMeal?'meal':''}">${isMeal?s.icon:''}${s.label}${s.ctx?'<br><span style="font-size:11px;color:#b3a489">'+s.ctx+'</span>':''}</div><div class="ec">${cells}</div></div>`;
  });
  return rows;
}
// ── 細看（切片 A Phase 3）：點總覽某天 → 升起該天細排。手機＝複用 openSheet（bottom sheet＋scrim＋ESC＋關閉鈕現成）；桌機右欄＝Phase 4。
// 內容複用既有 .day-exp 細排（dayRowsHTML，與並看 mini 同源），不另造一套。標題列＝該天 N日（週幾）·區域。
function detailDayHTML(dayId){
  const d=DAYS.find(x=>x.id===dayId); if(!d) return '';
  const seg=CNXCore.baseForDay(base,dayId)||{};
  return `<div class="dt-head"><h3>${esc(d.label.split('/')[1]||d.label)} 日（${esc(d.wd)}）</h3><span class="dt-zone">· ${esc(regionLabel(seg.region)||'—')}</span></div><div class="day-exp">${dayRowsHTML(dayId)}</div>`;
}
let detailDay=null;   // 桌機右欄細看：目前開哪天（afterChange 後重繪用）。手機走 sheet、不依賴它
function detailPaneHTML(dayId){ return '<button class="dt-paneclose" data-action="detail-close">關閉</button>'+detailDayHTML(dayId); }
function openDetail(dayId){
  if(!DAYS.find(x=>x.id===dayId)) return;
  detailDay=dayId;
  if(isDesktop() && ovMode()!=='table'){ document.getElementById('pg-detail').innerHTML=detailPaneHTML(dayId); document.body.classList.add('has-detail'); }   // 矩陣桌機＝右欄細看
  else openSheet(detailDayHTML(dayId));   // 表格模式（或手機）：用 sheet overlay，不佔 col3、不與庫軌衝突
}
function closeDetail(){ document.body.classList.remove('has-detail'); detailDay=null; }
// ── 挑選器（openPicker，Task 13）：細排「＋加入」／粗流空錨點直開；mode='assign'|'backup'（backup 供 Task 15）──
let pkFilters={areas:new Set(),types:new Set(),bands:new Set(),cuisines:new Set(),slots:new Set()};   // 臨時態，開啟時重置
let pkFiltersOpen=false;   // 篩選分組展開/收合（同 session 記住）
// 列：line1＝[⚠️前置][Tier]emoji 名稱；line2＝左對齊單行 meta。closed=當天公休→前置紅徽。distTxt 已是純文字（含 ←/→）。
function pickerRow(p,distTxt,closed,schedTxt){
  const band=CNXCore.priceBandOf(p.cost&&p.cost.amount,TRIP.priceBands);
  const tnum=p.tier||0;
  const meta=[
    costLabel(p.cost),
    band?esc(band):'',
    esc(CNXCore.condenseHours(p)),
    distTxt?esc(distTxt):'',
    schedTxt?esc(schedTxt):''
  ].filter(Boolean).join(' · ');
  return `<div class="pk-row${schedTxt?' sch':''}" data-action="pick2" data-id="${p.id}">
    <div class="l1">${closed?'<span class="warn">⚠️ 今天休</span>':''}${tierBadge(tnum)}${placeEmoji(p)} <span class="nm">${esc(p.name)}</span></div>
    ${meta?`<div class="meta">${meta}</div>`:''}</div>`;
}
function openPicker(day,slot,mode){
  pkFilters={areas:new Set(),types:new Set(),bands:new Set(),cuisines:new Set(),slots:new Set()};
  renderPicker(day,slot,mode||'assign');
  // 桌機：挑選器開啟＝地圖亮「當日基地附近」的候選（壓暗遠的）；只在地圖已展開才亮、收起不硬撐開（桌機#3）。亮全部=沒對比=看不出來，故只亮附近。
  if(isDesktop() && drawerOpen()){
    const seg=CNXCore.baseForDay(base,day)||{};
    const cand=places.filter(p=>p.lat&&p.lng&&nearSeg(p,seg)).map(p=>p.id);
    if(cand.length){ mapSpotlightSet(cand); spotFromPicker=true; }
  }
}
function renderPicker(day,slot,mode){
  const d=DAYS.find(x=>x.id===day)||{label:day,wd:''}, seg=CNXCore.baseForDay(base,day)||{};   // ||{} 防呆：越界日不崩
  const SLOT_KEYS=SLOTS.filter(s=>s.kind!=='stay').map(s=>s.key);
  const anch=CNXCore.anchorsForSlot(plan,day,slot,SLOT_KEYS);
  const hotel=seg.hotelPlaceId?getPlace(seg.hotelPlaceId):null;
  const prevP=anch.prev?getPlace(anch.prev):hotel, nextP=anch.next?getPlace(anch.next):hotel;
  const wdIdx=CNXCore.WD_ZH.indexOf(d.wd);
  const pool=places.filter(p=>CNXCore.passLibFilters(p,{types:pkFilters.types,areas:pkFilters.areas,tiers:new Set(),
    bands:pkFilters.bands,cuisines:pkFilters.cuisines,slots:pkFilters.slots,sched:'all'},{plan,bands:TRIP.priceBands}));
  const inArea=p=>nearSeg(p, seg);
  const f=x=>x==null?'':(x>=1000?(x/1000).toFixed(1)+'km':x+'m');
  // 距離：只列有資料的那一側（待訂飯店 lat/lng 為 null → 該側略過）；兩側皆有→「←前/→後」。
  const distTxt=p=>{ const a=prevP?CNXCore.distanceM(p,prevP):null, b=nextP?CNXCore.distanceM(p,nextP):null;
    const parts=[]; if(a!=null) parts.push('←'+f(a)); if(b!=null) parts.push('→'+f(b)); return parts.join('/'); };
  const isClosed=p=>(Array.isArray(p.closedDays)&&p.closedDays.includes(wdIdx));
  function section(list){
    const un=list.filter(p=>!CNXCore.isScheduled(p.id,plan)), sch=list.filter(p=>CNXCore.isScheduled(p.id,plan));
    const sortT=(x,y)=>(x.tier||9)-(y.tier||9);
    let h=un.length?un.sort(sortT).map(p=>pickerRow(p,distTxt(p),isClosed(p))).join('')
                   :'<div class="pk-empty">（此區沒有符合的店）</div>';
    if(sch.length) h+=`<div class="pk-sub" data-action="pk-togglesch" style="cursor:pointer">▸ 已安排（${sch.length}）</div><div class="pkSch" style="display:none">`+
       sch.sort(sortT).map(p=>pickerRow(p,distTxt(p),isClosed(p),'已排 '+placeSched(p.id).join('、'))).join('')+`</div>`;
    return h;
  }
  const same=pool.filter(inArea), other=pool.filter(p=>!inArea(p));
  // 距離基準：只在「前站≠後站」且至少一端是真實地點（非待訂飯店）時才顯示一行；前後相同或皆待訂→省略，不重複印同一飯店。
  const isReal=x=>x&&x.lat!=null&&x.lng!=null;   // 待訂飯店 lat/lng 為 null
  const showDist = prevP && nextP && prevP.id!==nextP.id && (isReal(prevP)||isReal(nextP));
  const nm=x=>esc(x?x.name:'—');
  const fcount=pkFilters.areas.size+pkFilters.types.size+pkFilters.bands.size+pkFilters.cuisines.size+pkFilters.slots.size;
  const grp=(ax,items)=>`<div class="pk-frow"><span class="ax">${ax}</span><div class="fset">${items}</div></div>`;
  const filtersHTML=`<div class="pk-filters"${pkFiltersOpen?'':' hidden'}>
    ${grp('地區', regionsList().map(r=>`<span class="fchip ${pkFilters.areas.has(r.key)?'on':''}" data-action="pk-area" data-v="${esc(r.key)}">${esc(r.label)}</span>`).join(''))}
    ${grp('類別', categoriesList().map(c=>`<span class="fchip ${pkFilters.types.has(c.key)?'on':''}" data-action="pk-type" data-v="${esc(c.key)}">${esc(c.icon)} ${esc(c.label)}</span>`).join(''))}
    ${grp('價位', (TRIP.priceBands.tiers||[]).map(t=>`<span class="fchip ${pkFilters.bands.has(t.label)?'on':''}" data-action="pk-band" data-v="${esc(t.label)}">${esc(t.label)}</span>`).join(''))}
    ${grp('菜系', (TRIP.cuisinesList||[]).map(c=>`<span class="fchip ${pkFilters.cuisines.has(c.key)?'on':''}" data-action="pk-cui" data-v="${esc(c.key)}">${esc(c.label)}</span>`).join(''))}
    ${grp('時段', [['morning','早'],['noon','中午'],['evening','晚上']].map(kl=>`<span class="fchip ${pkFilters.slots.has(kl[0])?'on':''}" data-action="pk-slot" data-v="${kl[0]}">${kl[1]}</span>`).join(''))}
  </div>`;
  let h=`<div class="pk-handle" data-action="pk-grow"></div>
  <div class="pk-head">
    <h3>${esc(d.label)}（${esc(d.wd)}）· ${esc(slotObj(slot).label)}<span class="pk-sub-t">${mode==='backup'?'掛備案':'選一家'}</span></h3>
    <div class="pk-acts">
      ${mode==='assign'?`<span class="pa" data-action="pk-tent">⏳ 標待定</span>
      <span class="pa" data-action="pk-newlink">🔗 貼連結</span>`:''}
      <span class="pa" data-action="pk-near">🗺️ 附近</span>
    </div>
    ${showDist?`<div class="pk-dist">🚶 ${nm(prevP)} <span class="ar">⟶</span> ${nm(nextP)}</div>`:''}
    <input id="pkSearch" class="pk-search" placeholder="🔍 搜店名／memo">
    <button class="pk-ftoggle${pkFiltersOpen?' open':''}" data-action="pk-ftoggle">篩選${fcount?`<span class="cnt">${fcount}</span>`:''}<span class="car">▾</span></button>
    ${filtersHTML}
  </div>
  <div class="pk-list">
    <div class="pk-sec">📍 ${esc(regionLabel(seg.region)||'本區')}（當日基地）</div>${section(same)}
    <div class="pk-sec">其他區域</div>${section(other)}
  </div>`;
  openSheet(h); sh.classList.add('sheet-picker','pk2');
  sh.dataset.pkDay=day; sh.dataset.pkSlot=slot; sh.dataset.pkMode=mode;
}

const ov=document.getElementById('overlay'),sh=document.getElementById('sheet');
function openSheet(html){ sh.classList.remove('sheet-edit','sheet-picker','pk2','tall'); document.body.classList.remove('cardpeek','peek-edit'); ['pkDay','pkSlot','pkMode','qaPid','qaMove','omPid','omMove','omDay','omSlot','opEid'].forEach(k=>delete sh.dataset[k]); sh.innerHTML='<button class="sheetclose" data-action="close">關閉</button>'+html; ov.classList.add('on'); document.body.classList.add('sheet-open'); }
// ↑ 每次開新 sheet 先清 co-view class：看卡/編輯/占用面板會在 openSheet 後再由 autoSpot 重加；其餘 sheet（排入/挑選器…）保持正常深背景、正常高度（修：從卡片開排入/掛備案時 cardpeek 殘留樣式）。抽屜還原/spotlight 清除仍由 closeSheet→exitCardPeek（看 prevDrawerState，非 class）負責。
function closeSheet(){
  // 手機：關的若是「細看的子彈窗」（挑選器/編輯/選飯店…，非細看本身）→ 關完回到那天的細看（Vivian #4：回上一個操作畫面，非跳回總覽）
  const backToDetail = !isDesktop() && detailDay && sh && !sh.querySelector('.dt-head');
  ov.classList.remove('on');
  document.body.classList.remove('sheet-open');
  exitCardPeek();                                                  // 手機 co-view：移除 cardpeek＋還原抽屜（內含 guard，非 co-view 時 no-op）
  if(spotFromCard){ spotIds=null; spotFromCard=false; if(drawerOpen()) renderMarkers(); }   // 看/編輯卡的自動 spotlight：關卡即清、地圖回正常（桌機＋手機）
  if(isDesktop()&&spotFromPicker&&spotIds){ spotIds=null; spotFromPicker=false; renderMarkers(); }   // 挑選器關閉→清除自身 spotlight
  if(backToDetail){ openDetail(detailDay); }       // 回那天細看（待定/新加入的項目都看得到→也讓 #3「標待定」變可見）
  else if(!isDesktop()) detailDay=null;             // 關的是細看本身→清掉
}

// ── 快速排入面板（openAssign，Task 14）：卡片/地圖「排入」與「移到別格」共用；moveEid 有值＝移格模式 ──
function openAssign(placeId, moveEid){
  const p=getPlace(placeId); if(!p) return;
  const SLOT_KEYS=SLOTS.filter(s=>s.kind!=='stay').map(s=>s.key);
  // 自錨點排除：移格模式下，把正被移動的那筆 occurrence 從 plan 排除再算推薦/距離（否則自己當錨點 dist 0）
  const ver=av(); const recoVer = moveEid ? {...ver, plan: ver.plan.filter(e=>e.id!==moveEid)} : ver;
  const recos=CNXCore.recommendSlots(p, recoVer, places, SLOT_KEYS, TRIP);
  const f=x=>x==null?'—':(x>=1000?(x/1000).toFixed(1)+'km':x+'m');
  let h=`<h3>${moveEid?'移到別格':'排入'}：${placeEmoji(p)} ${esc(p.name)}</h3>
  <div class="sd">${esc(regionLabel(p.area))}${costLabel(p.cost)?('・'+costLabel(p.cost)):''}${CNXCore.condenseHours(p)?('・'+esc(CNXCore.condenseHours(p))):''}</div>`;
  if(recos.length) h+=`<div class="qa-reco"><div class="rt">🎯 離它最近的空格</div>`+recos.map(r=>{
    const d=DAYS.find(x=>x.id===r.day)||{label:r.day};
    return `<span class="rc" data-action="qa-place" data-day="${r.day}" data-slot="${r.slot}"><b>${esc(d.label||r.day)} ${esc(slotObj(r.slot).label)}</b><span class="d">${f(r.dist)}</span></span>`;
  }).join('')+`</div>`;
  DAYS.forEach(d=>{
    const seg=CNXCore.baseForDay(base,d.id)||{}, same=nearSeg(p, seg);
    const wdIdx=CNXCore.WD_ZH.indexOf(d.wd);
    const closed=Array.isArray(p.closedDays)&&p.closedDays.includes(wdIdx);
    let rows='', emptyRun=[];
    const flush=()=>{ if(!emptyRun.length) return;
      const dist=CNXCore.emptySlotDist(p, recoVer, places, d.id, emptyRun[0], SLOT_KEYS);
      rows+=`<div class="qa-grp"><div class="chips">`+emptyRun.map(k=>
        `<span class="qa-chip" data-action="qa-place" data-day="${d.id}" data-slot="${k}">＋${esc(slotObj(k).label)}</span>`).join('')+
        `</div>${dist!=null?`<div class="dist">←→ ${f(dist)}</div>`:''}</div>`; emptyRun=[]; };
    SLOT_KEYS.forEach(k=>{
      const ents=plan.filter(e=>e.day===d.id&&e.slot===k&&e.id!==moveEid);   // 移格模式不把自己當占用
      if(ents.length){ flush(); ents.forEach(e=>{ const op=getPlace(e.placeId);
        rows+=`<div class="qa-anchor" data-action="qa-occupied" data-day="${d.id}" data-slot="${k}">${placeEmoji(op)} <span class="nm">${esc(slotObj(k).label)}・${esc(op?op.name:'')}</span><span class="tap">換/並存 ›</span></div>`; }); }
      else emptyRun.push(k);
    }); flush();
    const totalEmpty=!plan.some(e=>e.day===d.id&&e.slot!=='stay'&&e.id!==moveEid);
    const hotel=seg.hotelPlaceId?getPlace(seg.hotelPlaceId):null;
    const dHotel=hotel?CNXCore.distanceM(p,hotel):null;
    const num=d.label.split('/')[1]||d.label;
    h+=`<div class="qa-day ${same?'same':''} ${closed?'closed':''}">
      <div class="dh"><span class="dot" style="background:${zoneColor(seg.region)}">${esc(num)}</span>${esc(d.wd)}
      ${same?'<span class="same-tag">同區</span>':''}${closed?'<span style="color:#b54545;font-size:11px;font-weight:700">⚠️ 這天休</span>':''}
      ${totalEmpty?`<span class="info">整天空${dHotel!=null?('・離住宿 '+f(dHotel)):''}</span>`:''}</div>${rows}</div>`;
  });
  openSheet(h); sh.classList.add('sheet-picker');
  sh.dataset.qaPid=placeId; sh.dataset.qaMove=moveEid||'';
}
function openOccupiedMenu(day, slot, newPid, moveEid){
  const ents=plan.filter(e=>e.day===day&&e.slot===slot&&e.id!==moveEid); if(!ents.length) return;
  const first=getPlace(ents[0].placeId), nm=esc(first?first.name:'');
  const d=DAYS.find(x=>x.id===day)||{label:day};
  openSheet(`<h3>${esc(d.label||day)} ${esc(slotObj(slot).label)}已有「${nm}」</h3>
   <div class="opt" data-action="om-both"><div>➕ 也排這格（都去）<small>兩家都去、都算進預算</small></div></div>
   <div class="opt" data-action="om-pk"><div>⚔️ 跟${nm}比較（2 選 1）<small>兩張都留著、掛「2 選 1」醒目標，之後再裁決</small></div></div>
   <div class="opt" data-action="om-swap" data-eid="${ents[0].id}"><div>↔ 換掉${nm}（回板凳）<small>${nm}降為這格備案，不會消失</small></div></div>
   <div class="opt cancel" data-action="close">取消</div>`);
  sh.dataset.omPid=newPid; sh.dataset.omMove=moveEid||''; sh.dataset.omDay=day; sh.dataset.omSlot=slot;
}
// ── 已排項目面板（openOccPanel，Task 15）：換將中心＝這格備案＋同區板凳候選；2選1 格多「⚔️ 裁決」；換將→原卡降備案 ──
function openOccPanelBySlot(day,slot){ const e=plan.find(x=>x.day===day&&x.slot===slot); if(e) openOccPanel(e.id); }
function openOccPanel(eid){
  const e=plan.find(x=>x.id===eid); if(!e) return;
  const p=getPlace(e.placeId); if(!p) return;
  const d=DAYS.find(x=>x.id===e.day)||{label:e.day,wd:''};
  const meta=CNXCore.getSlotMeta(av(), e.day, e.slot)||{backups:[]};
  const memo=(p.note||'').split('\n')[0];
  // 同區板凳候選：未排、同 area、非本格現任、非已是備案，按距離排序取 top3
  const bench=places.filter(x=>x.id!==p.id && !CNXCore.isScheduled(x.id,plan) && x.area===p.area && !meta.backups.includes(x.id))
    .map(x=>({x, dd:CNXCore.distanceM(p,x)})).filter(o=>o.dd!=null).sort((a,b)=>a.dd-b.dd).slice(0,3);
  const f=x=>x>=1000?(x/1000).toFixed(1)+'km':x+'m';
  const cand=(x,tag,dd)=>`<div class="op-cand ${tag?'bak':''}">${placeEmoji(x)} <span class="nm">${esc(x.name)}</span>${tag?'<span class="bktag">備案</span>':''}${x.tier?tierBadge(x.tier):''}<span class="meta">${dd!=null?f(dd):''}${costLabel(x.cost)?('・'+costLabel(x.cost)):''}</span><span class="swap" data-action="op-swap" data-pid="${x.id}">換它 ⇄</span>${tag?`<span class="bkdel" data-action="op-delbak" data-pid="${x.id}">✕</span>`:''}</div>`;
  let pkBlock='';
  if(meta.pk){ const ents=plan.filter(x=>x.day===e.day&&x.slot===e.slot);
    pkBlock=`<div class="op-seclab">⚔️ 2 選 1 裁決</div>`+ents.map(x=>{const pp=getPlace(x.placeId); if(!pp) return '';
      return `<div class="op-cand">${placeEmoji(pp)} <span class="nm">${esc(pp.name)}</span><span class="meta">${costLabel(pp.cost)||'—'}・${esc(CNXCore.condenseHours(pp))}</span><span class="swap" data-action="op-keep" data-eid="${x.id}">留它 ✓</span></div>`;}).join(''); }
  openSheet(`<div class="op">
    <div class="t1"><span class="op-name">${placeEmoji(p)} ${esc(p.name)}</span><span class="when">${esc(d.label)}（${esc(d.wd)}）· ${esc(slotObj(e.slot).label)}</span></div>
    <div class="facts">${esc(CNXCore.condenseHours(p))||'—'} ｜ ${costLabel(p.cost)||'—'}${memo?(' ｜ 💬 '+esc(memo)):''}</div>
    ${pkBlock}
    <div class="op-big"><span data-action="op-move">↪ 移到別格</span><span class="danger" data-action="op-remove">🗑 回板凳</span></div>
    <div class="op-seclab">⇄ 換將 — 這格的備案</div>
    ${meta.backups.map(id=>{const x=getPlace(id); return x?cand(x,true,CNXCore.distanceM(p,x)):'';}).join('')}
    ${meta.backups.length<2?`<div class="op-addbak" data-action="op-addbak">＋ 掛備案（最多 2）</div>`:''}
    <div class="op-seclab">⇄ 換將 — 附近的板凳</div>
    ${bench.map(o=>cand(o.x,false,o.dd)).join('')||'<div class="sd">同區沒有未排的候選</div>'}
    <div class="op-minor"><span data-action="op-map">🗺️ 地圖看它</span><a href="${esc(gmaps(p))}" target="_blank" rel="noopener">🔗 Maps</a><span data-action="op-edit">✎ 編輯卡片</span></div>
  </div>`);
  sh.dataset.opEid=eid;
  autoSpot(CNXCore.occSpotlightIds(av(), eid, places));   // 占用面板→占用者＋備案＋2選1 一起亮
}
ov.addEventListener('click',e=>{ if(e.target===ov) closeSheet(); });
// 全域 Escape：有 sheet/overlay（細看/挑選器/編輯卡/版本…）開著就關它。單一 document 級處理器
function sheetOpen(){ return ov.classList.contains('on'); }
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape') return;
  if(sheetOpen()){ closeSheet(); e.preventDefault(); return; }   // sheet 優先（手機細看/挑選器/編輯卡…）
  if(document.body.classList.contains('has-detail')){ closeDetail(); e.preventDefault(); }   // 桌機右欄細看
});
// 卡片 icon 的 emoji 選單，依分類排列（收合、點才展開；不夠用可直接在欄位打字／用系統 emoji 鍵盤）
const EMOJI_CATS=[
  {label:'食物',emojis:['🍜','🍲','🍛','🥘','🍢','🍡','🥟','🍳','🌶️','🍤','🍗','🍖','🥩','🥗','🍚','🍙','🍱','🍝','🌯','🥪','🍔','🍟','🍕','🌭','🥞','🧇','🥨','🥐','🍞','🧀','🥚','🥓','🍣','🍥','🥠']},
  {label:'甜點/水果',emojis:['🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍮','🍯','🍫','🍬','🍭','🍓','🍉','🍊','🍋','🍌','🍍','🥭','🍑','🍒','🥥','🥝','🍅','🥑','🍇','🍈','🥕']},
  {label:'飲料',emojis:['☕','🍵','🧋','🥤','🧃','🍹','🍸','🍺','🍻','🍷','🥂','🍶','🥃','🧉','🍾','🥛']},
  {label:'景點/自然',emojis:['🛕','⛩️','🏯','🏰','🏛️','⛪','🕌','🗿','🌅','🌄','🏞️','🏔️','⛰️','🌋','🏖️','🏝️','🌳','🌲','🌴','🌵','🌸','🌺','🌻','🌷','🍀','🍁','🐘','🐅','🦋','🐢','🐠','🐬','🦜','♨️','💦','🌊']},
  {label:'活動/娛樂',emojis:['💆','🧖','💅','🛀','🎉','🎊','🎭','🎨','🖼️','🎵','🎶','🎤','🎸','🥁','🎮','🎡','🎢','🎠','🛶','🚣','🏊','🚴','🥾','🧘','📷','📸','🎬','🎫','🎯']},
  {label:'購物',emojis:['🛍️','🛒','🏪','🏬','🧺','🎁','👗','👚','👕','👖','👜','👠','👟','💄','💍','💎','🧵','🧶','🕶️','🧢','🌂']},
  {label:'住宿',emojis:['🏨','🏩','🛏️','🛌','🏡','🏠','🏚️','⛺','🏕️','🛖','🗝️']},
  {label:'交通',emojis:['✈️','🛫','🛬','🚕','🚗','🚙','🛵','🏍️','🚌','🚎','🚐','🚉','🚆','🚊','🚲','⛴️','🚤','🛺','🗺️','📍','🧭','🛟']},
  {label:'符號/其他',emojis:['⭐','🌟','✨','❤️','🧡','💛','💚','💙','💜','🔥','💧','☀️','🌙','⛅','☔','❄️','✅','❗','❓','💡','📝','📌','🔖','🏆','🥇','💵','💰','🧳','🕐','🌈']}
];

// ── 檢視卡 detailSheet（Task 16）：六區塊瘦身——標題+Tier／💬memo／事實行（具體時間+公休｜NT$/人｜區域）／菜系 chip／排程狀態／矮小動作列 ──
function closedTxt(p){ if(!(Array.isArray(p.closedDays)&&p.closedDays.length)) return ''; if((p.hours||'').includes('休')) return ''; return '・週'+p.closedDays.map(d=>CNXCore.WD_ZH[d]).join('')+'休'; }
function detailSheet(id){
  const p=getPlace(id); if(!p) return;
  const memo=(p.note||'').split('\n')[0].trim();
  const costTxt=costLabel(p.cost)||'—';
  const facts=`${esc(p.hours||'—')}${closedTxt(p)} ｜ ${costTxt} ｜ ${esc(regionLabel(p.area)||'—')}`;
  const sc=placeSched(id);
  const schedTxt = sc.length ? ('📅 已排：'+esc(sc.join('、'))) : '未排入';
  const h=`<div class="vcard">
    <h3>${placeEmoji(p)} ${esc(p.name)}${p.tier?' '+tierBadge(p.tier):''}</h3>
    ${memo?`<div class="vmemo">💬 ${esc(memo)}</div>`:''}
    <div class="vfacts">${facts}</div>
    ${p.cuisine?`<div class="vtags"><span class="vcui">${esc(cuisineLabel(p.cuisine))}</span></div>`:''}
    <div class="vsched${sc.length?'':' none'}">${schedTxt}</div>
    <div class="vacts">
      <span class="pill pri" data-action="detail-assign" data-id="${p.id}">📅 排入</span>
      <span class="pill" data-action="detail-map" data-id="${p.id}">🗺️ 地圖看它</span>
      <a class="pill" href="${esc(gmaps(p))}" target="_blank" rel="noopener">🔗 Maps</a>
      <span class="pill" data-action="detail-edit" data-id="${p.id}">✎</span>
    </div></div>`;
  openSheet(h);
  autoSpot(id);                 // 看卡片→自動亮該卡 pin（沒定位則靜默跳過）
}

let pendingAddTarget=null;   // {day,slot}：從挑選器🔗新增時，存檔後自動排進該格（Task 13；Task 16 沿用）
let pendingHotelDay=null;    // dayId：從住宿列「建新飯店」新增時，存檔後設為該 base 段 hotelPlaceId（切片A #6）
let pendingPrefill=null;     // 貼連結建卡：解析結果裡「無表單欄位」的 lat/lng/placeId/cid，save-edit 新卡時注入（切片2 Task4）
function openEdit(id,addTarget,prefill){
  pendingAddTarget=(addTarget&&addTarget.day&&addTarget.slot)?{day:addTarget.day,slot:addTarget.slot}:null;
  pendingHotelDay=(addTarget&&addTarget.hotelDay)?addTarget.hotelDay:null;
  pendingPrefill=(!id&&prefill)?prefill:null;
  const isNew=!id; const p=isNew?CNXCore.normalizePlace(prefill||{type:'其他'}):getPlace(id);
  const nameVal=isNew?((prefill&&prefill.name)||''):p.name;
  const cuisines=(TRIP.cuisinesList||[]);
  const curCui=p.cuisine||null;
  const body=`<h3>${isNew?'新增地點':'編輯卡片'}</h3>
  <div class="seclabel">名稱（暱稱）</div>
  <div class="iconrow"><input class="em" id="ed_icon" value="${esc(p.icon||'')}" placeholder="${esc(temoji(p.type))}"><input id="ed_name" style="flex:1;margin:0" value="${esc(nameVal)}" placeholder="地點／店名"><button type="button" class="iconpickbtn" data-action="toggle-emoji">選 emoji ▾</button></div>
  <div id="emojiPanel" class="emojipanel" style="display:none"><div class="emojigrid" style="margin-bottom:2px"><span class="emojibtn dflt" data-action="pick-emoji" data-emoji="">↺ 用類別預設</span></div>${EMOJI_CATS.map(c=>`<div class="emojicat">${c.label}</div><div class="emojigrid">${c.emojis.map(em=>`<span class="emojibtn" data-action="pick-emoji" data-emoji="${em}">${em}</span>`).join('')}</div>`).join('')}</div>
  <div class="seclabel">備註 / memo（第一行會顯示在卡片上）</div>
  <textarea id="ed_note" rows="2" placeholder="選填">${esc(p.note||'')}</textarea>
  <div class="seclabel">菜系</div>
  <div class="row" id="ed_cuirow" style="margin-bottom:8px">${cuisines.map(c=>`<span class="chip ${curCui===c.key?'on':''}" data-action="ed-cui" data-cui="${esc(c.key)}">${esc(c.label)}</span>`).join('')}<span class="chip ${curCui==null?'on':''}" data-action="ed-cui" data-cui="">無</span></div>
  <div class="seclabel">Tier（你來標：①一定去 ②滿想去 ③順路 ④可不去）</div>
  <div class="row" id="ed_tierrow" style="margin-bottom:8px">${[1,2,3,4,0].map(n=>`<span class="tchip ed-t t${n} ${((p.tier||0)===n)?'on':''}" data-action="ed-tier" data-tier="${n}">${n===0?'未分':('T'+n+' '+['','一定去','滿想去','順路','可不去'][n])}</span>`).join('')}</div>
  <div class="seclabel">每人價格（NT$）</div>
  <input id="ed_amount" inputmode="numeric" value="${p.cost&&p.cost.amount!=null?p.cost.amount:''}" placeholder="例如 350">
  <div class="row" style="margin-bottom:4px"><span class="chip ${(!p.cost||p.cost.per!=='shared')?'on':''}" data-action="ed-per" data-per="person">每人</span><span class="chip ${(p.cost&&p.cost.per==='shared')?'on':''}" data-action="ed-per" data-per="shared">共用（房/車）</span></div>
  <div class="seclabel">連結（Google Maps）${p.placeId?'<span class="auto">已驗證 ✓</span>':''}</div>
  <input id="ed_link" value="${esc(p.mapsUrl||'')}" placeholder="貼 Maps 連結（手機分享的也可以）">
  <div class="seclabel">營業時間</div><input id="ed_hours" value="${esc(p.hours||'')}" placeholder="選填">
  <div class="two"><div><div class="seclabel">區域</div><select id="ed_area">${regionsList().map(r=>`<option value="${esc(r.key)}" ${r.key===p.area?'selected':''}>${esc(r.label)}</option>`).join('')}</select></div>
  <div><div class="seclabel">類型</div><select id="ed_type">${categoriesList().map(c=>`<option value="${esc(c.key)}" ${c.key===p.type?'selected':''}>${esc(c.icon)} ${esc(c.label)}</option>`).join('')}</select></div></div>
  <label class="ed-hide"><input type="checkbox" id="ed_hide"${p.hideInOverview?' checked':''}> 不在總覽顯示（仍會留在這天的細看）</label>`;
  const foot=`<div class="edfoot">${isNew?'':`<span class="pill del" data-action="del-card" data-id="${id}">🗑</span>`}<span class="pill cancel" data-action="close">取消</span><span class="pill save" data-action="save-edit" data-id="${isNew?'__new__':id}">${isNew?'新增':'儲存'}</span></div>`;
  openSheet(`<div class="edscroll">${body}</div>${foot}`);
  sh.classList.add('sheet-edit');
  sh.dataset.per=(p.cost&&p.cost.per==='shared')?'shared':'person'; sh.dataset.tier=(p.tier?String(p.tier):''); sh.dataset.cui=(curCui||'');
  autoSpot(id,{edit:true});     // 編輯卡→自動亮該卡 pin（地圖小窗更薄）；新卡 id=null → 靜默跳過
}

// ── 貼連結建卡（切片2 Task5）：Edge Function 解析→去重→預填 openEdit ──
const RESOLVE_URL = (SYNC_URL && SYNC_ANON) ? (SYNC_URL+'/functions/v1/resolve-place') : '';
let pendingResolve=null;   // 去重「仍建新卡」時暫存解析結果

function openLinkPrompt(addTarget){
  openSheet(`<h3>🔗 貼連結建卡</h3>
    <div class="sd">貼 Google Maps 連結（手機分享的短連結也可以），自動解析建卡。</div>
    <input id="lnk_url" placeholder="https://maps.app.goo.gl/… 或長連結" style="margin-bottom:10px">
    <div class="row"><span class="pill pri" data-action="lnk-go"${addTarget?` data-day="${esc(addTarget.day)}" data-slot="${esc(addTarget.slot)}"`:''}>建卡</span></div>`);
  setTimeout(()=>{ const el=document.getElementById('lnk_url'); if(el) el.focus(); },50);
}

// Google Places primaryType → 你的類別 key（對不到回 undefined＝落「其他」由你選）。
function placesTypeToCat(t){
  if(!t) return undefined;
  t=String(t).toLowerCase();
  if(/restaurant|cafe|coffee|food|bakery|\bbar\b|bistro|diner|meal_|ice_cream|dessert|tea_house|noodle|steak|sushi|pub/.test(t)) return '食物';
  if(/spa|massage|wellness|beauty|nail|night_club|karaoke/.test(t)) return '娛樂';
  if(/tourist|temple|worship|museum|\bpark\b|gallery|landmark|monument|zoo|garden|viewpoint|historical|cultural|shrine/.test(t)) return '景點';
  if(/shop|store|market|mall|boutique|supermarket/.test(t)) return '逛街';
  if(/hotel|lodging|hostel|resort|guest_house|motel|bed_and_breakfast/.test(t)) return '住宿';
  return undefined;
}
// 解析結果→預填卡（含座標自動判最近地區、Google 分類自動判類型）。resolveAndCreate 與 dup-new 共用。
function resolvedPrefill(d, url){
  return {name:d.name||'',lat:d.lat,lng:d.lng,mapsUrl:url||d.mapsUrl,hours:d.hours||'',placeId:d.placeId,cid:d.cid,
    area:CNXCore.nearestRegion(TRIP,d.lat,d.lng)||undefined, type:placesTypeToCat(d.primaryType)};
}
async function resolveAndCreate(url, addTarget){
  url=(url||'').trim();
  if(!url) return;
  if(!RESOLVE_URL){ toast('未設定解析服務，先手動建卡'); openEdit(null,addTarget,{mapsUrl:url}); return; }
  toast('解析連結中…');
  let data=null;
  try{
    const r=await fetch(RESOLVE_URL,{method:'POST',headers:{'content-type':'application/json','apikey':SYNC_ANON,'Authorization':'Bearer '+SYNC_ANON},body:JSON.stringify({url})});
    data=await r.json();
  }catch(_){ data=null; }
  if(!data||!data.ok){ toast('解不出來，手動補一下'); openEdit(null,addTarget,{mapsUrl:url}); return; }
  const dup=CNXCore.findDuplicate(places,{placeId:data.placeId,cid:data.cid,lat:data.lat,lng:data.lng,name:data.name});
  if(dup){ promptDuplicate(dup,data,addTarget); return; }
  openEdit(null,addTarget,resolvedPrefill(data,url));
  if(data.degraded) toast('解不出店名，手動補一下');
}

function promptDuplicate(dup,data,addTarget){
  pendingResolve={data,addTarget};
  const canLocate=(dup.lat==null||dup.lng==null||!dup.placeId)&&(data.lat!=null);
  openSheet(`<h3>這家好像已經有卡了</h3>
    <div class="sd">既有：${esc(dup.icon||temoji(dup.type))} ${esc(dup.name)}</div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <span class="pill pri" data-action="dup-open" data-id="${esc(dup.id)}">開既有卡</span>
      ${canLocate?`<span class="pill" data-action="dup-locate" data-id="${esc(dup.id)}">補定位到它</span>`:''}
      <span class="pill" data-action="dup-new">仍建新卡</span>
    </div>`);
}

function openImpExp(){
  const data=JSON.stringify(getLocalDb(),null,2);   // 全量備份（trip/places/manualLines/settings/versions），可整包還原
  let h=`<h3>匯入／匯出</h3><div class="sd">匯出＝整份備份（行程/卡片/版本/設定）。匯入：整包 → 取代還原；只有 {"places":[…]}／[…] → 併入卡片。</div>
  <div class="seclabel">⤓ 匯出（整份備份）</div><textarea class="code" id="exp" readonly>${esc(data)}</textarea>
  <div class="row" style="margin-bottom:12px"><span class="pill pri" data-action="copy-export">複製</span></div>
  <div class="seclabel">⤒ 匯入（貼上備份或 Claude 給的卡片 JSON）</div><textarea class="code" id="imp" placeholder='貼上整份備份，或 {"places":[...]} ／ [...] '></textarea>
  <div class="row"><span class="pill pri" data-action="do-import">匯入</span></div>`;   // 去除底部重複關閉（右上角一致關閉鈕）
  openSheet(h);
}

// ── 版本下拉（openVersions，Task 18）：切換/複製/重命名/刪除；active 本地（setActiveLocal，不寫 DB）──
function baseSummary(ver){   // 版本摘要：base 段「古城內4・尼曼3」串接；晚數＝DAYS 落在 [fromDay,toDay] 的天數
  const segs=(ver.base||[]).filter(s=>s.region);
  if(!segs.length) return '未設基地';
  return segs.map(s=>esc(regionLabel(s.region))+DAYS.filter(d=>d.id>=s.fromDay&&d.id<=s.toDay).length).join('・');
}
// 版本差異化（Task E）：同基地時 baseSummary 會一樣 → 補「已排 N 項・NT$總額」讓各版可區分。N＝非住宿的排程筆數；總額＝該版 plan 跑 rollupBudget 的 trip 總和（含共用住宿手動列）。
function versionStats(ver){
  const n=(ver.plan||[]).filter(e=>e.slot!=='stay'&&e.placeId).length;
  let budget=0; try{ budget=CNXCore.rollupBudget(ver.plan||[], places, manualLines, settings, TRIP).total.trip||0; }catch(_){}
  return '已排 '+n+' 項'+(budget>0?('・NT$'+budget.toLocaleString('en-US')):'');
}
function openVersions(){
  const curId=av().id;
  let h=`<h3>🗂️ 版本</h3><div class="sd">各版自己的排法＋基地＋預算，互不影響。目前看哪一版只記在這台裝置。</div>`;
  DB.versions.forEach(v=>{ const cur=v.id===curId;
    h+=`<div class="opt" data-action="switchver" data-id="${v.id}"><span style="flex:none;width:11px;height:11px;border-radius:50%;margin-top:3px;background:${cur?'#2e9e7d':'#d8d0c2'}"></span><div style="flex:1">${esc(v.name)}${cur?' <span style="font-size:11px;color:#2e9e7d;font-weight:700">· 目前</span>':''}<small>${baseSummary(v)}<br>${esc(versionStats(v))}</small></div></div>`;
  });
  h+=`<div class="row" style="margin-top:10px"><span class="pill pri" data-action="dupver">＋ 複製目前成新版本</span><span class="pill" data-action="renamever">✎ 重命名</span>${DB.versions.length>1?'<span class="pill danger" data-action="delver">🗑 刪除目前</span>':''}</div>`;   // 去除底部重複關閉（右上角一致關閉鈕）
  openSheet(h);
}
// ── 基地段落編輯（openBase，Task 18）：住宿區 <select> 讀 regionsList()（value=key、顯示 label）；只動 active 版本的 base（base 為 av().base 活參照）──
function openBase(){
  const regOpts=region=>regionsList().map(r=>`<option value="${esc(r.key)}" ${r.key===region?'selected':''}>${esc(r.label)}</option>`).join('');
  let h=`<h3>🏨 基地（住哪區）· ${esc(av().name)}</h3><div class="sd">每個版本各自一組；從<b>地區清單</b>挑一個。改了粗流色塊與住宿列跟著變。</div>`;
  if(!base.length){ h+=`<div class="sd" style="color:#a59c8b">這版還沒排住宿，先在細排「🏨住宿」格加一家飯店即可自動推導基地段落。</div>`; }
  base.forEach(seg=>{
    const nights=DAYS.filter(d=>d.id>=seg.fromDay&&d.id<=seg.toDay).length;
    const hp=seg.hotelPlaceId?getPlace(seg.hotelPlaceId):null;
    const dt=s=>esc(s.slice(0,2)+'/'+s.slice(2));
    h+=`<div style="background:#fff;border-radius:12px;padding:11px 12px;margin-bottom:9px;box-shadow:0 1px 3px rgba(46,42,36,.07);border-left:5px solid ${zoneColor(seg.region)}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px"><span style="font-size:14px;font-weight:800">${dt(seg.fromDay)}–${dt(seg.toDay)}</span><span style="font-size:11px;color:#a59c8b">${nights} 晚</span>
      <select data-action="basezone" data-seg="${seg.id}" style="margin-left:auto;width:150px;font-size:16px;padding:6px 9px;border:1px solid var(--line);border-radius:7px;background:#fff">${regOpts(seg.region)}</select></div>
      <div style="font-size:12px;color:#6b6356">🏨 ${hp?esc(hp.name):'（待訂）'}</div></div>`;
  });
  // 基地改 region 即時持久（basezone change handler→afterChange）；關閉用右上角一致關閉鈕（去除底部重複「完成」）
  openSheet(h);
}
// 住宿列「選/換飯店」（切片A #6）：挑現有住宿卡或建新→寫該 base 段 hotelPlaceId；成本隨卡片算進預算
function openHotelPick(dayId){
  const seg=CNXCore.baseForDay(base,dayId); if(!seg){ toast('這天還沒有住宿段'); return; }
  const dt=s=>esc(s.slice(0,2)+'/'+s.slice(2));
  const hotels=places.filter(p=>isLodging(p));
  let h=`<h3>🏨 ${esc(regionLabel(seg.region)||'')}住宿 · ${dt(seg.fromDay)}–${dt(seg.toDay)}</h3><div class="sd">這段住哪？選了寫進這段、成本算進預算。</div>`;
  h+=hotels.map(p=>`<div class="opt" data-action="hotel-set" data-day="${dayId}" data-pid="${p.id}">${placeEmoji(p)} ${esc(p.name)}${seg.hotelPlaceId===p.id?' ✓':''}${(p.cost&&p.cost.amount)?`<small>NT$${p.cost.amount}${p.cost.per==='person'?'/人':'/共用'}</small>`:''}</div>`).join('');
  h+=`<div class="opt" data-action="hotel-new" data-day="${dayId}">＋ 建一家新飯店卡</div>`;
  if(seg.hotelPlaceId) h+=`<div class="opt cancel" data-action="hotel-clear" data-day="${dayId}">✕ 清除這段飯店</div>`;
  openSheet(h);
}
// basezone：地區 <select> change（值為 region key）→ 改 av().base 段的 region；色塊/住宿列即時跟著變
document.addEventListener('change',e=>{
  const t=e.target.closest('[data-action="basezone"]'); if(!t) return;
  const seg=base.find(s=>s.id===t.dataset.seg);
  if(seg){ seg.region=t.value||''; afterChange(); openBase(); }
});
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-action]'); if(!t) return;
  const a=t.dataset.action;
  if(a==='tab'){ switchTab(t.dataset.pg); return; }
  if(a==='ovmode'){ if(ovMode()!==t.dataset.m){ closeDetail(); setOvMode(t.dataset.m); applyOvMode(); } return; }   // 切模式先關桌機右欄細看：table 不用右欄、否則殘留並擠進 46px 軌欄＋庫軌被藏
  if(a==='flow-split'){ if(document.body.classList.contains('split')) exitSplit(); else enterSplit(); return; }
  if(a==='verbtn'){ openVersions(); return; }
  if(a==='switchver'){ setActiveLocal(t.dataset.id); save(); renderAll(); closeSheet(); return; }   // active 本地（localStorage），不寫 DB、不進雲端文件（F15）
  if(a==='dupver'){ const name=prompt('新版本名稱', av().name+' 複本'); if(name===null) return;
    const nid=uid(); const copy=CNXCore.duplicateVersion(DB, av().id, nid, name.trim()||'新版本');
    if(copy){ setActiveLocal(nid); save(); renderAll(); openVersions(); } return; }   // 複製後自動切到新版（非破壞性：原版深拷貝、互不影響）
  if(a==='renamever'){ const name=prompt('版本名稱', av().name); if(name===null||!name.trim()) return;
    CNXCore.renameVersion(DB, av().id, name.trim()); save(); renderAll(); openVersions(); return; }
  if(a==='delver'){ if(DB.versions.length<=1){ toast('至少要留一版'); return; }
    if(confirm('刪除「'+av().name+'」？此版排法/基地會消失')){ const delId=av().id; CNXCore.deleteVersion(DB, delId);
      setActiveLocal(DB.versions[0].id); save(); renderAll(); openVersions(); } return; }   // 切到倖存版（localStorage 同步更新，不靠 fallback）
  if(a==='mapbar'){ if(drawerOpen()){ mapPinned=false; closeDrawer(); } else { openDrawer(); } return; }
  if(a==='mappin'){ mapPinned=!mapPinned; if(mapPinned) openDrawer(); else updateDrawerUI(); return; }
  if(a==='lib-rail'){ document.body.classList.remove('libcollapsed'); return; }     // 點右軌→展開庫
  if(a==='lib-collapse'){ document.body.classList.add('libcollapsed'); return; }    // 點收合鈕→庫收成軌
  if(a==='assign'){ openAssign(t.dataset.id); return; }
  // ── 檢視卡 detailSheet（Task 16）動作列 ──
  if(a==='detail-assign'){ openAssign(t.dataset.id); return; }
  if(a==='detail-map'){ mapSpotlight(t.dataset.id); return; }
  if(a==='detail-edit'){ openEdit(t.dataset.id); return; }
  // ── 快速排入面板（Task 14）handlers ──
  if(a==='qa-place'){ const s=sh.dataset, day=t.dataset.day, slot=t.dataset.slot, lbl=((DAYS.find(x=>x.id===day)||{}).label||day)+' '+slotObj(slot).label;
    if(s.qaMove){ const mid=s.qaMove; const e=plan.find(x=>x.id===mid); if(!e) return;   // 捕獲 mid（sh.dataset 會被下個 openSheet 清掉）
      const pd=e.day, ps=e.slot; e.day=day; e.slot=slot; afterChange(); closeSheet();
      toast('已移到 '+lbl, {undo:()=>{ const x=plan.find(y=>y.id===mid); if(x){ x.day=pd; x.slot=ps; } afterChange(); }}); }
    else { const nid=uid(); plan.push({id:nid, placeId:s.qaPid, day, slot}); afterChange(); closeSheet();
      toast('已排入 '+lbl, {undo:()=>{ const i=plan.findIndex(y=>y.id===nid); if(i>=0) plan.splice(i,1); afterChange(); }}); }
    return; }
  if(a==='qa-occupied'){ openOccupiedMenu(t.dataset.day, t.dataset.slot, sh.dataset.qaPid, sh.dataset.qaMove); return; }
  if(a==='om-both'||a==='om-pk'||a==='om-swap'){ const s=sh.dataset, day=s.omDay, slot=s.omSlot, pid=s.omPid;
    const lbl=((DAYS.find(x=>x.id===day)||{}).label||day)+' '+slotObj(slot).label;
    const mv=s.omMove?plan.find(e=>e.id===s.omMove):null;   // 移格模式：搬移既有 occurrence（保留 id/startTime），不新增——否則原格殘留＝重複（bug）
    if(mv){ const pd=mv.day, ps=mv.slot; mv.day=day; mv.slot=slot;   // 把被移動的卡搬進這格（與占用者同格）
      if(a==='om-pk'){ const wasPk=!!(CNXCore.getSlotMeta(av(),day,slot)||{}).pk; CNXCore.setSlotFlag(av(),day,slot,'pk',true); afterChange(); closeSheet();
        toast('已移入 2 選 1・'+lbl, {undo:()=>{ mv.day=pd; mv.slot=ps; if(!wasPk) CNXCore.setSlotFlag(av(),day,slot,'pk',false); afterChange(); }}); return; }
      if(a==='om-swap'){ const occ=plan.find(e=>e.id===t.dataset.eid), occPid=occ&&occ.placeId;
        const prevBackups=(CNXCore.getSlotMeta(av(),day,slot)||{backups:[]}).backups.slice();
        if(occ){ const i=plan.indexOf(occ); if(i>=0) plan.splice(i,1); if(occPid) CNXCore.addBackup(av(),day,slot,occPid); }   // 原占用者降備案
        afterChange(); closeSheet();
        toast('已移入・原占用回備案', {undo:()=>{ mv.day=pd; mv.slot=ps; if(occ) plan.push(occ); const m=CNXCore.ensureSlotMeta(av(),day,slot); m.backups=prevBackups.slice(); CNXCore.pruneSlotMeta(av()); afterChange(); }}); return; }
      afterChange(); closeSheet();   // om-both：搬進這格、與占用者並存
      toast('兩家都去・'+lbl, {undo:()=>{ mv.day=pd; mv.slot=ps; afterChange(); }}); return; }
    if(a==='om-both'){ const nid=uid(); plan.push({id:nid, placeId:pid, day, slot}); afterChange(); closeSheet();
      toast('兩家都去・'+lbl, {undo:()=>{ const i=plan.findIndex(y=>y.id===nid); if(i>=0) plan.splice(i,1); afterChange(); }}); return; }
    if(a==='om-pk'){ const wasPk=!!(CNXCore.getSlotMeta(av(),day,slot)||{}).pk; const nid=uid();
      plan.push({id:nid, placeId:pid, day, slot}); CNXCore.setSlotFlag(av(),day,slot,'pk',true); afterChange(); closeSheet();
      toast('已加入 2 選 1・'+lbl, {undo:()=>{ const i=plan.findIndex(y=>y.id===nid); if(i>=0) plan.splice(i,1); if(!wasPk) CNXCore.setSlotFlag(av(),day,slot,'pk',false); afterChange(); }}); return; }
    if(a==='om-swap'){ const eid=t.dataset.eid;
      const prevBackups=(CNXCore.getSlotMeta(av(),day,slot)||{backups:[]}).backups.slice();   // 換之前的備案快照（換入卡本身可能就在裡面）
      const r=CNXCore.swapOccurrence(av(), eid, pid, {demote:true}); afterChange(); closeSheet();
      const old=r&&r.old;
      toast(r&&r.demoted===false?'已換入（備案已滿，原卡回板凳）':'已換入・原卡回備案', {undo:()=>{
        const en=plan.find(y=>y.id===eid); if(en&&old) en.placeId=old;              // occurrence 還原
        const m=CNXCore.ensureSlotMeta(av(),day,slot); m.backups=prevBackups.slice(); // 備案還原成確切快照
        CNXCore.pruneSlotMeta(av());                                                  // 空快照→正確刪掉 meta
        afterChange(); }});
      return; }
    return; }
  if(a==='pickslot'){ openPicker(t.dataset.day, t.dataset.slot); return; }   // 空餐錨點（A 案）＋細排「＋加入」：直開挑選器
  if(a==='openday'){ openDetail(t.dataset.day); return; }   // 點總覽某天列 → 升起該天細看（手機 bottom sheet；桌機右欄）
  if(a==='detail-close'){ closeDetail(); return; }          // 桌機右欄細看關閉
  // ── 挑選器（Task 13）handlers ──
  if(a==='pk-ftoggle'){ pkFiltersOpen=!pkFiltersOpen;   // 篩選分組就地展開/收合（不重繪列表，純切面板，保留捲動）
    const panel=sh.querySelector('.pk-filters'); if(panel) panel.hidden=!pkFiltersOpen; t.classList.toggle('open',pkFiltersOpen); return; }
  if(a==='pk-area'||a==='pk-type'||a==='pk-band'||a==='pk-cui'||a==='pk-slot'){ const v=t.dataset.v;
    const set=a==='pk-area'?pkFilters.areas:a==='pk-type'?pkFilters.types:a==='pk-band'?pkFilters.bands:a==='pk-cui'?pkFilters.cuisines:pkFilters.slots;
    set.has(v)?set.delete(v):set.add(v); t.classList.toggle('on');   // 即時視覺回饋
    // 重繪列表（套用篩選）＋更新 toggle 計數；面板維持展開（pkFiltersOpen 為真）。把列表捲回頂避免空集殘留視窗。
    const s=sh.dataset, wasTall=sh.classList.contains('tall'); renderPicker(s.pkDay,s.pkSlot,s.pkMode); if(wasTall) sh.classList.add('tall'); return; }
  if(a==='pk-grow'){ sh.classList.toggle('tall'); return; }                  // 把手：半屏⇄2/3
  if(a==='pk-togglesch'){ const box=t.nextElementSibling; if(box&&box.classList.contains('pkSch')){ const open=box.style.display!=='none'; box.style.display=open?'none':'block'; t.textContent=t.textContent.replace(open?'▾':'▸', open?'▸':'▾'); } return; }
  if(a==='pk-tent'){ const s=sh.dataset; CNXCore.setSlotFlag(av(), s.pkDay, s.pkSlot, 'tentative', true); afterChange(); closeSheet(); toast('已標待定'); return; }
  if(a==='pk-newlink'){ const s=sh.dataset; openLinkPrompt({day:s.pkDay,slot:s.pkSlot}); return; }   // 貼連結建卡，存檔後排進該格（切片2）
  if(a==='pk-near'){ const s=sh.dataset, seg=CNXCore.baseForDay(base,s.pkDay)||{};   // 收 sheet、開地圖、亮當日基地區的候選
    const ids=places.filter(p=>p.lat&&p.lng&&nearSeg(p,seg)&&CNXCore.passLibFilters(p,{types:pkFilters.types,areas:new Set(),tiers:new Set(),bands:pkFilters.bands,cuisines:pkFilters.cuisines,slots:pkFilters.slots,sched:'all'},{plan,bands:TRIP.priceBands})).map(p=>p.id);
    closeSheet(); mapSpotlightSet(ids); return; }
  if(a==='pick2'){ const s=sh.dataset, pid=t.dataset.id;
    if(s.pkMode==='backup'){ const bd=s.pkDay, bs=s.pkSlot; CNXCore.addBackup(av(), bd, bs, pid); afterChange(); openOccPanelBySlot(bd, bs); toast('已掛備案'); return; }   // 回到該格的已排面板（Task 15）
    const day=s.pkDay, slot=s.pkSlot, occupied=plan.some(e=>e.day===day&&e.slot===slot);
    if(!occupied){ const nid=uid(); plan.push({id:nid,placeId:pid,day,slot}); afterChange(); closeSheet();
      toast('已排入', {undo:()=>{ const i=plan.findIndex(y=>y.id===nid); if(i>=0) plan.splice(i,1); afterChange(); }}); }
    else openOccupiedMenu(day, slot, pid);                                  // 已占用→三選一（Task 14）
    return; }
  if(a==='occpanel'){ openOccPanel(t.dataset.eid); return; }
  // ── 已排項目面板（Task 15）handlers ──
  if(a==='op-move'){ const eid=sh.dataset.opEid, en=plan.find(x=>x.id===eid); if(!en) return; closeSheet(); openAssign(en.placeId, eid); return; }
  if(a==='op-remove'){ const eid=sh.dataset.opEid, en=plan.find(x=>x.id===eid); if(!en) return;
    const lbl=(DAYS.find(x=>x.id===en.day)||{}).label+' '+slotObj(en.slot).label, snap=Object.assign({},en);
    const wasPk=!!(CNXCore.getSlotMeta(av(),en.day,en.slot)||{}).pk;   // 快照 pk，undo 還原
    const ri=plan.indexOf(en); plan.splice(ri,1);
    if(plan.filter(x=>x.day===snap.day&&x.slot===snap.slot).length<=1) CNXCore.setSlotFlag(av(),snap.day,snap.slot,'pk',false);   // 降到 ≤1 占用→清 2選1（否則 ribbon 殘留徽章＋裁決區仍出）
    afterChange(); closeSheet();
    toast('已回板凳・'+lbl, {undo:()=>{ if(!plan.some(x=>x.id===snap.id)) plan.push(Object.assign({},snap)); if(wasPk) CNXCore.setSlotFlag(av(),snap.day,snap.slot,'pk',true); afterChange(); }}); return; }
  if(a==='op-swap'){ const eid=sh.dataset.opEid, pid=t.dataset.pid; if(!plan.some(x=>x.id===eid)) return;
    const r=CNXCore.swapOccurrence(av(), eid, pid, {demote:true}); afterChange();
    if(r&&r.demoted===false) toast('備案已滿，原卡回板凳');
    openOccPanel(eid); return; }   // swapOccurrence 原地改 placeId → eid 仍有效，重開面板顯示新店＋原店降備案
  if(a==='op-delbak'){ const eid=sh.dataset.opEid, en=plan.find(x=>x.id===eid); if(!en) return;
    CNXCore.removeBackup(av(), en.day, en.slot, t.dataset.pid); afterChange(); openOccPanel(eid); return; }
  if(a==='op-addbak'){ const eid=sh.dataset.opEid, en=plan.find(x=>x.id===eid); if(!en) return; openPicker(en.day, en.slot, 'backup'); return; }
  if(a==='op-keep'){ const keepId=t.dataset.eid, keep=plan.find(x=>x.id===keepId); if(!keep) return;
    const day=keep.day, slot=keep.slot, pp=getPlace(keep.placeId);
    const wasPk=!!(CNXCore.getSlotMeta(av(),day,slot)||{}).pk;   // 復原用：pk 旗標快照（2選1 格通常為 true）
    const losers=plan.filter(x=>x.day===day&&x.slot===slot&&x.id!==keepId).map(x=>Object.assign({},x));   // 被刪的敗方 occurrence 深拷貝（含 id/placeId/day/slot/startTime）→ 復原能完整還原，不再是不可逆刪除
    av().plan=plan.filter(x=>!(x.day===day&&x.slot===slot&&x.id!==keepId)); syncActive();
    CNXCore.setSlotFlag(av(),day,slot,'pk',false); afterChange(); closeSheet();
    toast('已留「'+((pp&&pp.name)||'這家')+'」、清掉 2 選 1', {undo:()=>{
      losers.forEach(l=>{ if(!plan.some(x=>x.id===l.id)) plan.push(Object.assign({},l)); });   // 推回敗方（含 startTime）
      if(wasPk) CNXCore.setSlotFlag(av(),day,slot,'pk',true);                                   // 還原 2選1 旗標
      afterChange(); }}); return; }
  if(a==='op-map'){ const eid=sh.dataset.opEid, en=plan.find(x=>x.id===eid); if(en){ closeSheet(); mapSpotlight(en.placeId); } return; }   // 🗺️ 地圖看它 → spotlight
  if(a==='op-edit'){ const eid=sh.dataset.opEid, en=plan.find(x=>x.id===eid); if(!en) return; openEdit(en.placeId); return; }   // 已排面板→直接進編輯卡（非檢視卡）
  if(a==='settime'){ const en=plan.find(x=>x.id===t.dataset.eid); if(!en) return;
    document.querySelectorAll('input[data-tpx]').forEach(n=>n.remove());
    const inp=document.createElement('input'); inp.type='time'; inp.value=en.startTime||'';
    inp.style.cssText='position:fixed;opacity:0;pointer-events:none';
    inp.dataset.tpx='1'; inp.tabIndex=-1;
    document.body.appendChild(inp);
    inp.addEventListener('change',()=>{ if(inp.value) en.startTime=inp.value; else delete en.startTime;
      afterChange(); });   // afterChange→renderRibbon 重繪總覽／並看 mini；不再重開 sheet
    inp.addEventListener('blur',()=>inp.remove());
    inp.showPicker ? inp.showPicker() : inp.click(); return; }
  if(a==='cleartent'){ CNXCore.setSlotFlag(av(), t.dataset.day, t.dataset.slot, 'tentative', false); afterChange(); return; }   // 同上：afterChange 已就地重繪
  if(a==='openbase'){ openBase(); return; }
  if(a==='hotel-pick'){ openHotelPick(t.dataset.day); return; }                                                        // 住宿列「選/換飯店」（切片A #6）
  if(a==='hotel-set'){ const seg=CNXCore.baseForDay(base,t.dataset.day); if(seg) seg.hotelPlaceId=t.dataset.pid; closeSheet(); afterChange(); openDetail(t.dataset.day); return; }
  if(a==='hotel-clear'){ const seg=CNXCore.baseForDay(base,t.dataset.day); if(seg) seg.hotelPlaceId=null; closeSheet(); afterChange(); openDetail(t.dataset.day); return; }
  if(a==='hotel-new'){ openEdit(null,{hotelDay:t.dataset.day}); return; }
  if(a==='btoggle'){ const ty=t.dataset.type; budgetOpen.has(ty)?budgetOpen.delete(ty):budgetOpen.add(ty); renderBudget(); return; }
  if(a==='ml-add'){ openManualLine(null); return; }
  if(a==='ml-edit'){ openManualLine(t.dataset.id); return; }
  if(a==='ml-per'){ sh.querySelectorAll('[data-action="ml-per"]').forEach(x=>x.classList.toggle('on',x===t)); sh.dataset.mlper=t.dataset.per; return; }
  if(a==='ml-save'){
    const v=id=>document.getElementById(id).value.trim();
    const numOrNull=s=>{ s=(s||'').trim(); if(s==='')return null; const n=parseFloat(s); return isNaN(n)?null:n; };
    const qn=parseFloat(v('ml_qty')); const obj={label:v('ml_label')||'手動花費',type:document.getElementById('ml_type').value,amount:numOrNull(v('ml_amount')),per:sh.dataset.mlper==='shared'?'shared':'person',qty:(isNaN(qn)||qn<1)?1:qn};
    if(t.dataset.id==='__new__'){ obj.id=uid(); manualLines.push(obj); } else { const m=manualLines.find(x=>x.id===t.dataset.id); if(m) Object.assign(m,obj); }
    afterChange(); closeSheet(); return; }
  if(a==='ml-del'){ manualLines=manualLines.filter(x=>x.id!==t.dataset.id); afterChange(); closeSheet(); return; }
  if(a==='settings'){ openSettings(); return; }
  if(a==='open-cfg'){ openConfig(t.dataset.tab); return; }
  if(a==='cfg-tab'){ cfgTab=t.dataset.tab; renderConfig(); return; }
  if(a==='cfg-cat-add'){ const key='c_'+uid(); TRIP.categories.push({key,label:'新類別',color:'#9b9b9b',icon:'📍',role:'normal',desc:''}); save(); renderConfig(); return; }
  if(a==='cfg-cat-del'){ const k=t.dataset.key, r=CNXCore.canDeleteCategory(TRIP,k,places,manualLines);
    if(!r.ok){ toast(r.reason==='in-use'?'還有卡片用這個類別，先改掛別類再刪':'這個分類不能刪'); return; }
    TRIP.categories=TRIP.categories.filter(c=>c.key!==k); save(); renderConfig(); renderAllExceptSheet(); return; }
  if(a==='cfg-cat-up'){ const k=t.dataset.key, arr=TRIP.categories, i=arr.findIndex(c=>c.key===k);
    if(i>0){ [arr[i-1],arr[i]]=[arr[i],arr[i-1]]; save(); renderConfig(); renderAllExceptSheet(); } return; }
  if(a==='cfg-rg-add'){ const key='r_'+uid(); TRIP.regions.push({key,label:'新地區',color:'#9b9b9b',lat:null,lng:null,desc:''}); save(); renderConfig(); return; }
  if(a==='cfg-rg-del'){ const k=t.dataset.key, r=CNXCore.canDeleteRegion(TRIP,k,places);
    if(!r.ok){ toast(r.reason==='in-use'?`還有 ${r.count} 張卡片在這區，先改區再刪`:'這個地區不能刪'); return; }
    TRIP.regions=TRIP.regions.filter(x=>x.key!==k); save(); renderConfig(); renderAllExceptSheet(); return; }
  if(a==='cfg-rg-up'){ const k=t.dataset.key, arr=TRIP.regions, i=arr.findIndex(x=>x.key===k);
    if(i>0){ [arr[i-1],arr[i]]=[arr[i],arr[i-1]]; save(); renderConfig(); renderAllExceptSheet(); } return; }
  if(a==='cfg-cu-add'){ const key='q_'+uid(); TRIP.cuisinesList.push({key,label:'新菜系',desc:''}); save(); renderConfig(); return; }
  if(a==='cfg-cu-del'){ const k=t.dataset.key; TRIP.cuisinesList=TRIP.cuisinesList.filter(c=>c.key!==k);
    places.forEach(p=>{ if(p.cuisine===k) p.cuisine=null; }); save(); renderConfig(); renderAllExceptSheet(); return; }
  if(a==='cfg-cu-up'){ const k=t.dataset.key, arr=TRIP.cuisinesList, i=arr.findIndex(c=>c.key===k);
    if(i>0){ [arr[i-1],arr[i]]=[arr[i],arr[i-1]]; save(); renderConfig(); renderAllExceptSheet(); } return; }
  if(a==='cfg-pb-add'){ const ts=TRIP.priceBands.tiers;
    const prevUpTo=ts.length>=2?(ts[ts.length-2].upTo||0):0; ts.splice(ts.length-1,0,{upTo:prevUpTo+200,label:'新一段',color:'#9a6e25'});
    TRIP.priceBands=CNXCore.normPriceBands(TRIP.priceBands); save(); renderConfig(); renderAllExceptSheet(); return; }
  if(a==='cfg-pb-del'){ const i=+t.dataset.idx; if(TRIP.priceBands.tiers.length<=1) return;
    TRIP.priceBands.tiers.splice(i,1);
    TRIP.priceBands.tiers[TRIP.priceBands.tiers.length-1].upTo=null;
    TRIP.priceBands=CNXCore.normPriceBands(TRIP.priceBands); save(); renderConfig(); renderAllExceptSheet(); return; }
  if(a==='edit'){ openEdit(t.dataset.id); return; }
  if(a==='ed-per'){ sh.querySelectorAll('[data-action="ed-per"]').forEach(x=>x.classList.toggle('on',x===t)); sh.dataset.per=t.dataset.per; return; }
  if(a==='ed-cui'){ sh.querySelectorAll('[data-action="ed-cui"]').forEach(x=>x.classList.toggle('on',x===t)); sh.dataset.cui=t.dataset.cui||''; return; }
  if(a==='ed-tier'){ sh.querySelectorAll('[data-action="ed-tier"]').forEach(x=>x.classList.toggle('on',x===t)); sh.dataset.tier=t.dataset.tier==='0'?'':t.dataset.tier; return; }
  if(a==='toggle-emoji'){ const pn=document.getElementById('emojiPanel'); if(pn){ const open=pn.style.display==='none'; pn.style.display=open?'block':'none'; t.textContent=open?'選 emoji ▴':'選 emoji ▾'; } return; }
  if(a==='pick-emoji'){ const el=document.getElementById('ed_icon'); if(el) el.value=t.dataset.emoji; const pn=document.getElementById('emojiPanel'); if(pn) pn.style.display='none'; const tb=sh.querySelector('[data-action="toggle-emoji"]'); if(tb) tb.textContent='選 emoji ▾'; return; }
  if(a==='impexp'){ openImpExp(); return; }
  if(a==='copy-link'){ copySyncLink(); return; }
  if(a==='copy-export'){ const ta=document.getElementById('exp'); ta.select(); try{navigator.clipboard.writeText(ta.value);}catch(e){} toast('已複製，貼給 Claude 即可'); return; }
  if(a==='do-import'){ importJSON(document.getElementById('imp').value); return; }
  if(a==='save-edit'){
    const v=id=>document.getElementById(id).value.trim();
    const numOrNull=s=>{ s=(s||'').trim(); if(s==='')return null; const n=parseFloat(s); return isNaN(n)?null:n; };
    const cost={amount:numOrNull(v('ed_amount')),per:sh.dataset.per==='shared'?'shared':'person'};
    const icon=v('ed_icon'); const cuisine=sh.dataset.cui||null;
    const link=v('ed_link');
    const hide=!!(document.getElementById('ed_hide')&&document.getElementById('ed_hide').checked);   // 不在總覽顯示（全手動，預設 false）
    // 連結欄存檔：有值→解析座標；長連結→寫 lat/lng+mapsUrl、短連結→只存 mapsUrl＋誠實提示（不假成功）
    // Fix: 長連結解到不同座標（搬址）→清除過時 placeId，避免「已驗證✓」誤顯
    const applyLink=target=>{ if(!link){ target.mapsUrl=''; return null; }
      if(!/^https?:\/\//i.test(link)) return 'invalid';                // 只接受 http(s)：擋 javascript: 等危險 scheme 進入同步 blob（save 防護）；不存、不假定位
      if(/["'<>]/.test(link)) return 'invalid';                        // 擋含引號/尖括號的畸形 URL（合法 Maps URL 不含這些字元）；防 stored-XSS 進入同步 blob
      const ll=CNXCore.parseLatLngFromMapsUrl(link);
      target.mapsUrl=link;
      if(ll){
        const relocated=(target.lat!=null&&target.lng!=null)&&(target.lat!==ll.lat||target.lng!==ll.lng);
        if(relocated) target.placeId=null;
        target.lat=ll.lat; target.lng=ll.lng; return 'located';
      }
      return 'short'; };
    if(t.dataset.id==='__new__'){ const pf=pendingPrefill; pendingPrefill=null;
      const np=makePlace(Object.assign({},pf||{},{name:v('ed_name')||'未命名地點',icon,cuisine,type:document.getElementById('ed_type').value,area:document.getElementById('ed_area').value,hours:v('ed_hours'),note:v('ed_note'),cost,tier:sh.dataset.tier?+sh.dataset.tier:null,hideInOverview:hide})); const lr=applyLink(np); places.push(np);
      const tgt=pendingAddTarget; pendingAddTarget=null;   // 從挑選器🔗新增：存檔後排進該格
      if(tgt) plan.push({id:uid(),placeId:np.id,day:tgt.day,slot:tgt.slot});
      const hd=pendingHotelDay; pendingHotelDay=null;       // 住宿列「建新飯店」：掛為該段 hotelPlaceId（切片A #6）
      if(hd){ const hseg=CNXCore.baseForDay(base,hd); if(hseg) hseg.hotelPlaceId=np.id; }
      afterChange(); closeSheet();
      if(lr==='invalid') toast('已新增「'+np.name+'」（連結需 http/https，未存）');
      else if(lr==='short'&&np.lat==null) toast('短連結已存，之後會自動補上定位');
      else toast(tgt?('已新增並排入「'+np.name+'」'):('已新增「'+np.name+'」'+(lr==='located'?'並定位':'')));
    }
    else { const p=getPlace(t.dataset.id); if(!p){ closeSheet(); toast('這張卡已不存在'); return; }   // 開著編輯卡時，另一台裝置/同步把這張刪了→p 為 undefined，存檔會 TypeError 卡住面板；防呆關閉
      p.name=v('ed_name')||p.name; p.icon=icon; p.cuisine=cuisine; p.type=document.getElementById('ed_type').value; p.area=document.getElementById('ed_area').value; p.hours=v('ed_hours'); CNXCore.applyHoursDerived(p); p.note=v('ed_note'); p.cost=cost; p.tier=sh.dataset.tier?+sh.dataset.tier:null; p.hideInOverview=hide; const lr=applyLink(p); afterChange(); closeSheet();
      if(lr==='invalid') toast('連結需 http/https，未存（其他已更新）'); else if(lr==='short') toast('短連結已存，之後會自動補上定位'); else if(lr==='located') toast('已更新並定位'); }
    return; }
  if(a==='del-card'){ if(confirm('刪除這張卡片？（已排的也會一起移除）')){ const id=t.dataset.id;
      DB.versions.forEach(v=>{ v.plan=(v.plan||[]).filter(e=>e.placeId!==id);   // 清「每一個版本」的排程，不只 active（否則他版 occurrence 變孤兒：渲染空白、仍存進同步 blob）
        (v.slotMeta||[]).forEach(m=>{ m.backups=(m.backups||[]).filter(b=>b!==id); });   // 也從任何版本的備案移除（被刪 id 殘留成備案會渲染空白＋仍佔 backups<2 額度）
        CNXCore.pruneSlotMeta(v); });                                          // 清掉因移除備案而變空的 slotMeta
      places=places.filter(x=>x.id!==id); syncActive();                        // 重綁 plan/base/slotMeta 指向 active 版的新陣列
      afterChange(); closeSheet(); } return; }
  // ── 庫頁膠囊／triage／快標 tier（Task 17）handlers ──
  if(a==='lib-new'){ openEdit(null); return; }
  if(a==='lib-link'){ openLinkPrompt(null); return; }   // 貼連結建卡（切片2）
  if(a==='lnk-go'){ const el=document.getElementById('lnk_url'); const url=el?el.value:''; const at=(t.dataset.day&&t.dataset.slot)?{day:t.dataset.day,slot:t.dataset.slot}:null; resolveAndCreate(url,at); return; }
  if(a==='dup-open'){ pendingResolve=null; openEdit(t.dataset.id); return; }
  if(a==='dup-new'){ const pr=pendingResolve; pendingResolve=null; if(!pr){ closeSheet(); return; } openEdit(null,pr.addTarget,resolvedPrefill(pr.data)); return; }
  if(a==='dup-locate'){ const pr=pendingResolve; pendingResolve=null; const p=getPlace(t.dataset.id); if(!p||!pr){ closeSheet(); return; } const d=pr.data;
    if(typeof d.lat==='number') p.lat=d.lat; if(typeof d.lng==='number') p.lng=d.lng;
    if(d.placeId&&!p.placeId) p.placeId=d.placeId; if(d.cid&&!p.cid) p.cid=d.cid;
    if(d.mapsUrl&&!p.mapsUrl) p.mapsUrl=d.mapsUrl; if(d.hours&&!p.hours){ p.hours=d.hours; CNXCore.applyHoursDerived(p); }
    afterChange(); closeSheet(); toast('已補定位到「'+p.name+'」'); return; }
  if(a==='lib-detail'){ detailSheet(t.dataset.id); return; }
  if(a==='lib-cap'){ toggleCapPanel(t.dataset.cap); return; }   // 就地展開（取代彈窗）
  if(a==='cap-close'){ capPanelKey=null; renderCaps(); renderCapPanel(); return; }
  if(a==='cap-tog'){ const key=t.dataset.cap, num=t.dataset.num, raw=t.dataset.v, v=num?+raw:raw, set=libF[key];
    set.has(v)?set.delete(v):set.add(v); t.classList.toggle('on'); renderLib(); renderMarkers(); return; }   // renderLib→renderCaps 重繪膠囊列（更新標籤/open 態），面板 chip 已就地 toggle
  if(a==='cap-sched'){ libF.sched=t.dataset.v;
    const pnl=document.getElementById('libCapPanel'); if(pnl) pnl.querySelectorAll('[data-action="cap-sched"]').forEach(x=>x.classList.toggle('on',x===t));
    renderLib(); renderMarkers(); return; }
  if(a==='lib-tier'){ e.stopPropagation();   // 行內展開 tier chips（不開檢視卡）
    const row=t.closest('.lrow'); if(!row) return; const ex=row.querySelector('.ltier-pop');
    if(ex){ ex.remove(); return; }
    document.querySelectorAll('.ltier-pop').forEach(n=>n.remove());
    const pid=t.dataset.id, p=getPlace(pid), cur=p&&p.tier||0;
    const pop=document.createElement('div'); pop.className='ltier-pop';
    pop.innerHTML=[1,2,3,4,0].map(n=>`<span class="tchip t${n}${cur===n?' on':''}" data-action="lib-settier" data-id="${pid}" data-tier="${n}">${n===0?'未分':('T'+n)}</span>`).join('');
    row.appendChild(pop); return; }
  if(a==='lib-settier'){ e.stopPropagation(); const p=getPlace(t.dataset.id); if(p){ p.tier=t.dataset.tier==='0'?null:+t.dataset.tier; afterChange(); } return; }
  if(a==='triage-tier'){ const p=getPlace(t.dataset.id); if(p){ p.tier=+t.dataset.tier; afterChange(); } return; }
  if(a==='triage-skip'){ triageSkipped.add(t.dataset.id); renderTriage(); return; }
  if(a==='triage-more'){ triageShowAll=true; renderTriage(); return; }   // 展開剩餘待標列
  if(a==='triage-toggle'){ triageCollapsed=!triageCollapsed; localStorage.setItem('cnx-triage-collapsed',triageCollapsed?'1':'0'); renderTriage(); return; }
  if(a==='reset'){ if(confirm('重設成初始資料？')){ DB=finishLoad({places:JSON.parse(JSON.stringify(SEED_PLACES)),plan:seedPlan()}); TRIP=DB.trip; DAYS=CNXCore.deriveDays(TRIP); places=DB.places; manualLines=DB.manualLines; settings=DB.settings; syncActive(); save(); renderAll(); } return; }
  if(a==='close'){ closeSheet(); return; }
});
// 挑選器搜尋（Task 13）：聚焦→拉高防鍵盤蓋列表；輸入→DOM 過濾店名／memo
document.addEventListener('focusin',e=>{
  if(e.target&&e.target.id==='pkSearch') sh.classList.add('tall');
  if(e.target&&e.target.id==='libSearch'&&document.body.classList.contains('split')) document.body.classList.add('searching');   // 並看：聚焦搜尋→上半暫收防鍵盤擠壓
});
document.addEventListener('focusout',e=>{ if(e.target&&e.target.id==='libSearch') document.body.classList.remove('searching'); });
document.addEventListener('input',e=>{
  if(e.target&&e.target.id==='libSearch'){ libF.q=e.target.value; renderLib(); renderMarkers(); return; }   // 庫頁搜尋：name/memo（input 在 .lib-search 外於 #listgrid，重渲不失焦）
  if(!e.target||e.target.id!=='pkSearch') return;
  const q=e.target.value.trim().toLowerCase();
  sh.querySelectorAll('.pk-row').forEach(row=>{ const p=getPlace(row.dataset.id);
    const hit=!q||(p&&((p.name||'')+' '+(p.note||'')).toLowerCase().includes(q));
    row.style.display=hit?'':'none'; });
});
function importJSON(text){
  let d; try{ d=JSON.parse(text); }catch(e){ toast('JSON 格式有誤，無法匯入'); return; }
  // 整份備份（含 versions 陣列）→ 整包還原（走 applyDb→finishLoad→migrate，升級路徑＋持久＋重繪）
  if(d && !Array.isArray(d) && Array.isArray(d.versions)){
    if(!confirm('匯入整份備份會「取代」目前所有資料（行程/卡片/版本/設定），確定？')) return;
    applyDb(d); closeSheet(); toast('已從備份還原'); return;
  }
  // 否則＝Claude 卡片 JSON（窄）：併入 places（＋ optional plan）
  const inPlaces=Array.isArray(d)?d:(d.places||[]);
  if(!inPlaces.length){ toast('沒有可匯入的卡片'); return; }
  let added=0,updated=0,nameWarn=0; const touched=[];
  inPlaces.forEach(ip=>{
    if(!ip||!ip.name) return;
    let ex=null;
    if(ip.id) ex=getPlace(ip.id);                                  // id-based 優先（穩定、不誤併）
    else { const sameName=places.filter(p=>p.name===ip.name);      // 無 id 才退而求其次比對名稱
      if(sameName.length===1) ex=sameName[0];
      else if(sameName.length>1){ nameWarn++; ex=null; } }         // 同名多筆＝歧義：不靜默覆蓋任何一筆，當新卡匯入並提醒
    if(ex){ Object.assign(ex,ip); Object.assign(ex,CNXCore.normalizePlace(ex)); updated++; touched.push(ex); }
    else { const np=CNXCore.normalizePlace(Object.assign({id:ip.id||uid(),addedAt:new Date().toISOString()},ip)); places.push(np); added++; touched.push(np); }   // 匯入新卡也蓋 addedAt（blob 自帶則保留），triage 排序才有依據
  });
  // plan 驗證：placeId 須是「已存在或本次匯入」的真卡、day 須在 DAYS、slot 須在 SLOTS；不合格者丟棄並回報筆數（避免畸形項造成假髒污重存）
  let planAdded=0,planDropped=0;
  if(d.plan&&Array.isArray(d.plan)){
    const knownIds=new Set(places.map(p=>p.id)), validDays=new Set(DAYS.map(x=>x.id)), validSlots=new Set(SLOTS.map(s=>s.key));
    d.plan.forEach(e=>{
      if(!e||typeof e!=='object'){ planDropped++; return; }
      if(!knownIds.has(e.placeId)||!validDays.has(e.day)||!validSlots.has(e.slot)){ planDropped++; return; }
      if(plan.some(x=>x.id===e.id)){ return; }                     // 已存在（同 id）→ 跳過，不算丟棄也不算新增
      plan.push({id:(e.id||uid()),placeId:e.placeId,day:e.day,slot:e.slot,...(e.startTime?{startTime:e.startTime}:{})});   // 只取白名單欄位，去除 junk
      planAdded++;
    });
  }
  afterChange(); closeSheet();
  const noloc=touched.filter(p=>!(p.lat&&p.lng)).length;
  toast(`匯入完成：新增 ${added}、更新 ${updated}`+(planAdded?`、排程 +${planAdded}`:'')+(planDropped?`（丟棄 ${planDropped} 筆無效排程）`:'')+(nameWarn?`（${nameWarn} 筆同名歧義→當新卡）`:'')+(noloc?`（${noloc} 筆未含座標）`:''));
}
const budgetOpen=new Set();
function nt(n){ return 'NT$ '+Math.round(n).toLocaleString('en-US'); }
function renderBudget(){
  const el=document.getElementById('pg-budget'); if(!el) return;
  const b=CNXCore.rollupBudget(plan,places,manualLines,settings,TRIP);
  const big=(label,val)=>`<div class="bd-big"><div class="lab">${label}</div><div class="val">${nt(val)}</div></div>`;
  let h=`<div class="bd-summary">${big('每人（含機票）',b.total.perPerson)}${big('全程 '+b.people+' 人',b.total.trip)}</div>`;
  h+=`<div class="bd-card">
    <div class="bd-row head"><span class="bd-name">類別（點開看細項）</span><span class="bd-num">總額</span><span class="bd-num">每人</span></div>`;
  b.order.forEach(type=>{
    const row=b.byType[type]; const open=budgetOpen.has(type);
    h+=`<div class="bd-row cat" data-action="btoggle" data-type="${type}">
        <span class="bd-name">${open?'▾':'▸'} ${esc(temoji(type))} ${esc(tlabel(type))} <span class="sub">· ${row.items.length} 筆</span></span>
        <span class="bd-num">${nt(row.trip)}</span><span class="bd-num">${nt(row.perPerson)}</span></div>`;
    if(open){
      h+=`<div class="bd-items">`;
      if(!row.items.length) h+=`<div class="bd-empty">（這類還沒有花費，去卡片填估價或加手動花費）</div>`;
      row.items.forEach(it=>{
        const ctx=it.day?((DAYS.find(d=>d.id===it.day)||{}).label+' '+slotObj(it.slot).label):(it.qty>1?'×'+it.qty:'手動');
        const tripV=CNXCore.expandForScope(it.amount,it.per,b.people,'trip');
        const ppV=CNXCore.expandForScope(it.amount,it.per,b.people,'perPerson');
        h+=`<div class="bd-item"><span class="bd-name">${esc(it.label)} <span class="ctx">${esc(ctx)}</span></span><span class="bd-num">${nt(tripV)}</span><span class="bd-num">${nt(ppV)}</span></div>`;
      });
      h+=`</div>`;
    }
  });
  h+=`</div>`;
  h+=`<div style="margin-top:12px"><div class="flabel" style="margin-bottom:6px">手動花費（沒有卡片的：機票/計程車/簽證…）</div>`;
  manualLines.forEach(m=>{
    h+=`<div class="bd-manual">
      <span class="bd-name">${esc(m.label||'手動花費')} <span class="sub">· ${esc(tlabel(m.type||'其他'))} · ${m.per==='shared'?'共用':'每人'}${m.qty>1?' · ×'+m.qty:''}</span></span>
      <span class="bd-num">${m.amount!=null?nt(m.amount):'—'}</span>
      <span class="tinytool" data-action="ml-edit" data-id="${m.id}" style="flex:none;margin-left:8px">✎</span></div>`;
  });
  h+=`<span class="ghostbtn" data-action="ml-add">＋ 加一筆手動花費</span></div>`;
  el.innerHTML=h;
}
function openManualLine(id){
  const m=id?manualLines.find(x=>x.id===id):{label:'',type:'其他',amount:null,per:'person',qty:1};
  const isNew=!id;
  let h=`<h3>${isNew?'加一筆手動花費':'編輯手動花費'}</h3><div class="sd">沒有卡片的花費（機票/計程車/簽證/SIM/每日雜支…）。qty 是份數，例如每日雜支 ×10 天。</div>
  <div class="seclabel">名稱</div><input id="ml_label" value="${esc(m.label||'')}" placeholder="例如 計程車/Grab">
  <div class="two"><div><div class="seclabel">類別</div><select id="ml_type">${categoriesList().map(c=>`<option value="${esc(c.key)}" ${c.key===(m.type||'其他')?'selected':''}>${esc(c.label)}</option>`).join('')}</select></div>
  <div><div class="seclabel">份數 qty</div><input id="ml_qty" inputmode="numeric" value="${m.qty||1}"></div></div>
  <div class="seclabel">預估金額（單筆 NT$）</div><input id="ml_amount" inputmode="numeric" value="${m.amount!=null?m.amount:''}" placeholder="例如 13000">
  <div class="row" style="margin-bottom:8px"><span class="chip ${m.per!=='shared'?'on':''}" data-action="ml-per" data-per="person">每人</span><span class="chip ${m.per==='shared'?'on':''}" data-action="ml-per" data-per="shared">共用</span></div>
  <div class="row" style="margin-top:6px"><span class="pill pri" data-action="ml-save" data-id="${isNew?'__new__':id}">${isNew?'新增':'儲存'}</span>${isNew?'':`<span class="pill danger" data-action="ml-del" data-id="${id}">刪除</span>`}<span class="pill" data-action="close">取消</span></div>`;
  openSheet(h); sh.dataset.mlper=m.per==='shared'?'shared':'person';
}
function afterChange(){ save(); renderAll();
  if(document.body.classList.contains('has-detail')&&detailDay){ const pd=document.getElementById('pg-detail'); if(pd) pd.innerHTML=detailPaneHTML(detailDay); }   // 桌機右欄細看：資料變動後同步重繪
  if(!isDesktop()&&detailDay&&sheetOpen()&&sh.querySelector('.dt-head')){ sh.innerHTML='<button class="sheetclose" data-action="close">關閉</button>'+detailDayHTML(detailDay); }   // 手機細看 sheet 開著→就地重繪（修 cleartent/標待定後 UI 沒反應，Vivian #3）
}

// ── 並看（粗流頁觸發）：body 級「上 pg-flow（當前 ovMode）＋下 pg-lib 庫」；手機限定、與地圖抽屜互斥 ──
let splitState=null;     // 進入時快照 {drawerWasOpen, wasPinned} 供退出還原
function enterSplit(){
  if(deskMq.matches) return;                                  // 桌機三欄常駐、用展開庫軌即可
  splitState={drawerWasOpen:drawerOpen(), wasPinned:mapPinned};
  mapPinned=false; closeDrawer();                             // 與地圖抽屜互斥
  if(curTab!=='flow') switchTab('flow');
  document.body.classList.add('split');
  document.getElementById('pg-flow').style.height='';         // CSS 預設高（拖曳才覆寫）
  renderLib(); renderFlowbar();
}
function exitSplit(){
  if(!document.body.classList.contains('split')) return;
  document.body.classList.remove('split','searching');
  document.getElementById('pg-flow').style.height='';
  if(splitState){ if(splitState.drawerWasOpen){ openDrawer(); mapPinned=splitState.wasPinned; updateDrawerUI(); } splitState=null; }
  renderFlowbar();
}
// splitbar 拖曳：改上半 #pg-flow 高度（30–70vh），上下各自獨立捲動
(function(){ const bar=document.getElementById('splitbar'); if(!bar) return; let dragging=false;
  const top=()=>document.getElementById('pg-flow');
  bar.addEventListener('pointerdown',ev=>{ if(!document.body.classList.contains('split')) return; dragging=true; bar.setPointerCapture(ev.pointerId); ev.preventDefault(); });
  bar.addEventListener('pointermove',ev=>{ if(!dragging) return;
    const t0=top().getBoundingClientRect().top;
    const min=window.innerHeight*0.30, max=window.innerHeight*0.70;
    let h=ev.clientY-t0; h=Math.max(min,Math.min(max,h)); top().style.height=h+'px'; });
  const end=ev=>{ if(dragging){ dragging=false; try{bar.releasePointerCapture(ev.pointerId);}catch(_){}}};
  bar.addEventListener('pointerup',end); bar.addEventListener('pointercancel',end);
})();

let curTab='flow';
function switchTab(pg){
  if(document.body.classList.contains('split')) exitSplit();   // 並看在粗流頁；切任何分頁＝退出並看
  if(pg!=='flow') closeDetail();                              // 切走總覽＝關桌機右欄細看（免殘留蓋住庫/預算）
  curTab=pg;
  document.getElementById('pg-flow').hidden = pg!=='flow';
  document.getElementById('pg-lib').hidden = pg!=='lib';      // 桌機 #pg-lib 由 CSS 恆顯示於右欄
  document.getElementById('pg-budget').hidden = pg!=='budget';
  document.querySelectorAll('.tabbtn').forEach(x=>x.classList.toggle('active',x.dataset.pg===pg));
}
let lastSync='—';
function syncStatusText(s){ return s==='synced'?'已同步':s==='syncing'?'同步中…':s==='offline'?'離線（已存本機）':'—'; }
function setSyncStatus(s){ lastSync=s; const el=document.getElementById('syncStatus'); if(el) el.textContent=syncStatusText(s); }
function syncLink(){ const id=localStorage.getItem(TRIPKEY); return id?location.origin+location.pathname+'#t='+id:''; }
function copySyncLink(){ const l=syncLink(); if(!l){ toast('尚未連上雲端'); return; } navigator.clipboard.writeText(l).then(()=>toast('連結已複製')).catch(()=>toast(l)); }
function openSettings(){
  const syncBlock = SYNC_URL ? `<div class="seclabel">雲端同步</div><div class="sd">🔗 把同步連結傳給旅伴即可一起編輯。狀態：<span id="syncStatus">${syncStatusText(lastSync)}</span></div><div class="row"><span class="pill pri" data-action="copy-link">📋 複製同步連結</span></div>` : '';
  let h=`<h3>⚙ 設定</h3><div class="sd">資料與外觀</div>
  ${syncBlock}
  <div class="seclabel">資料</div><div class="row"><span class="pill" data-action="impexp">⤒⤓ 匯入／匯出</span><span class="pill danger" data-action="reset">↺ 重設成初始</span></div>
  <div class="seclabel">自訂分類（類別／地區／菜系／價位）</div><div class="row"><span class="pill" data-action="open-cfg" data-tab="cat">🧩 管理分類設定</span></div>`;   // 去除底部重複關閉（右上角一致關閉鈕）
  openSheet(h);
}

let cfgTab='cat';
const CFG_TABS=[['cat','類別'],['region','地區'],['cuisine','菜系'],['price','價位']];
function openConfig(tab){ cfgTab=tab||cfgTab; renderConfig(); }
function renderConfig(){
  const tabs=CFG_TABS.map(([k,l])=>`<span class="cfg-tab ${cfgTab===k?'on':''}" data-action="cfg-tab" data-tab="${k}">${l}</span>`).join('');
  let body = cfgTab==='cat'?cfgCatHTML() : cfgTab==='region'?cfgRegionHTML() : cfgTab==='cuisine'?cfgCuisineHTML() : cfgPriceHTML();
  openSheet(`<h3>🧩 自訂分類設定</h3><div class="cfg-tabs">${tabs}</div><div class="cfg-body">${body}</div>`);
  sh.classList.add('tall');
}
function cfgCatHTML(){
  const rows=categoriesList().map((c,i)=>{
    const lock=c.role!=='normal';
    return `<div class="cfg-row" data-key="${esc(c.key)}">
      <input type="text" style="width:40px;flex:none;text-align:center" value="${esc(c.icon)}" data-cfg="cat-icon" data-key="${esc(c.key)}">
      <input type="color" value="${esc(c.color)}" data-cfg="cat-color" data-key="${esc(c.key)}">
      <input type="text" value="${esc(c.label)}" data-cfg="cat-label" data-key="${esc(c.key)}">
      ${lock?`<span class="cfg-role">${c.role==='lodging'?'住宿':'其他'}</span>`:''}
      <span class="mv" data-action="cfg-cat-up" data-key="${esc(c.key)}" ${i===0?'style="opacity:.2"':''}>↑</span>
      <span class="del ${lock?'lock':''}" ${lock?'':`data-action="cfg-cat-del" data-key="${esc(c.key)}"`}>🗑</span></div>`;
  }).join('');
  return rows+`<span class="cfg-add" data-action="cfg-cat-add">＋ 新類別</span>`;
}
function findCat(k){ return (TRIP.categories||[]).find(c=>c.key===k); }
let cfgSaveT=null;
function saveCfgDebounced(){ clearTimeout(cfgSaveT); cfgSaveT=setTimeout(()=>{ save(); renderAllExceptSheet(); }, 400); }
function renderAllExceptSheet(){ updateVerBtn(); renderFlowbar(); renderRibbon(); renderLib(); renderBudget(); renderMarkers(); }
function cfgRegionHTML(){
  const rows=regionsList().map((r,i)=>{
    const lock=r.key==='其他';
    return `<div class="cfg-row" data-key="${esc(r.key)}">
      <input type="color" value="${esc(r.color)}" data-cfg="rg-color" data-key="${esc(r.key)}">
      <input type="text" value="${esc(r.label)}" data-cfg="rg-label" data-key="${esc(r.key)}">
      <span class="mv" data-action="cfg-rg-up" data-key="${esc(r.key)}" ${i===0?'style="opacity:.2"':''}>↑</span>
      <span class="del ${lock?'lock':''}" ${lock?'':`data-action="cfg-rg-del" data-key="${esc(r.key)}"`}>🗑</span></div>`;
  }).join('');
  return `<div class="sd">地區用在卡片與居住地；中心點（座標）用來算「附近」推薦，新地區暫無座標、用名稱比對。</div>`+rows+`<span class="cfg-add" data-action="cfg-rg-add">＋ 新地區</span>`;
}
function findRegion(k){ return (TRIP.regions||[]).find(r=>r.key===k); }
function cfgCuisineHTML(){
  const rows=(TRIP.cuisinesList||[]).map((c,i)=>`<div class="cfg-row" data-key="${esc(c.key)}">
    <input type="text" value="${esc(c.label)}" data-cfg="cu-label" data-key="${esc(c.key)}">
    <span class="mv" data-action="cfg-cu-up" data-key="${esc(c.key)}" ${i===0?'style="opacity:.2"':''}>↑</span>
    <span class="del" data-action="cfg-cu-del" data-key="${esc(c.key)}">🗑</span></div>`).join('');
  return `<div class="sd">刪除菜系會把用到的卡片該欄清空（菜系本為選填）。</div>`+rows+`<span class="cfg-add" data-action="cfg-cu-add">＋ 新菜系</span>`;
}
function cfgPriceHTML(){
  const tiers=TRIP.priceBands.tiers||[];
  const rows=tiers.map((t,i)=>{
    const last=i===tiers.length-1;
    return `<div class="cfg-row" data-idx="${i}">
      <input type="color" value="${esc(t.color)}" data-cfg="pb-color" data-idx="${i}">
      <input type="text" value="${esc(t.label)}" data-cfg="pb-label" data-idx="${i}">
      ${last?`<span class="cfg-role">以上</span>`:`≤<input class="num" inputmode="numeric" value="${t.upTo!=null?t.upTo:''}" data-cfg="pb-upto" data-idx="${i}">`}
      <span class="del ${tiers.length<=1?'lock':''}" ${tiers.length<=1?'':`data-action="cfg-pb-del" data-idx="${i}"`}>🗑</span></div>`;
  }).join('');
  return `<div class="sd">由卡片金額自動判斷落在哪段。每段填「上限金額（含）」，最後一段為「以上」。</div>`+rows+`<span class="cfg-add" data-action="cfg-pb-add">＋ 新一段</span>`;
}
document.addEventListener('input',e=>{
  const t=e.target.closest('[data-cfg^="cat-"]'); if(!t) return;
  const c=findCat(t.dataset.key); if(!c) return;
  if(t.dataset.cfg==='cat-label') c.label=t.value;
  else if(t.dataset.cfg==='cat-icon') c.icon=t.value;
  else if(t.dataset.cfg==='cat-color') c.color=t.value;
  saveCfgDebounced();
});
document.addEventListener('input',e=>{
  const t=e.target.closest('[data-cfg^="rg-"]'); if(!t) return;
  const r=findRegion(t.dataset.key); if(!r) return;
  if(t.dataset.cfg==='rg-label') r.label=t.value;
  else if(t.dataset.cfg==='rg-color') r.color=t.value;
  saveCfgDebounced();
});
document.addEventListener('input',e=>{
  const t=e.target.closest('[data-cfg^="cu-"]'); if(!t) return;
  const c=(TRIP.cuisinesList||[]).find(x=>x.key===t.dataset.key); if(!c) return;
  if(t.dataset.cfg==='cu-label') c.label=t.value;
  saveCfgDebounced();
});
document.addEventListener('input',e=>{
  const t=e.target.closest('[data-cfg^="pb-"]'); if(!t) return;
  const i=+t.dataset.idx, tier=TRIP.priceBands.tiers[i]; if(!tier) return;
  if(t.dataset.cfg==='pb-label') tier.label=t.value;
  else if(t.dataset.cfg==='pb-color') tier.color=t.value;
  else if(t.dataset.cfg==='pb-upto'){ const n=parseFloat(t.value); tier.upTo=(isNaN(n)?null:n); }
  saveCfgDebounced();
});
function updateVerBtn(){ const v=av(); document.getElementById('verbtn').innerHTML='🗂️ <span class="vname">'+esc((v&&v.name)||'A 版')+'</span> ▾'; }   /* 名字進 .vname（可截斷），🗂️/▾ 留外面永遠可見（FIX1） */
function renderAll(){ updateVerBtn(); renderFlowbar(); renderRibbon(); renderLib(); renderBudget(); renderMarkers(); }
const deskMq=window.matchMedia('(min-width:1100px)');
function applyDesk(){
  if(!deskMq.matches){ document.body.classList.remove('libcollapsed'); return; }   // 手機無側軌
  if(document.body.classList.contains('split')) exitSplit();                       // 並看是手機形態：resize 到桌機即退出
  if(curTab==='lib') switchTab('flow');
  if(ovMode()==='table'){ openDrawer(); document.body.classList.add('libcollapsed'); }   // 表格(v1樣)：地圖留著、庫收成軌、表格佔右側
  else { openDrawer(); document.body.classList.remove('libcollapsed'); }                    // 矩陣：v2 三欄
}
deskMq.addEventListener('change',applyDesk);
renderAll(); applyDesk();
async function initSync(){
  if(!SYNC_URL || !SYNC_ANON) return;                 // 尚未設定 → 維持純本機
  const client = CNXSync.makeClient(SYNC_URL, SYNC_ANON);
  let tripId = (location.hash.match(/t=([0-9a-f-]{36})/)||[])[1] || localStorage.getItem(TRIPKEY) || '';
  try{
    if(!tripId){                                       // 首次：用目前本機資料種一份到雲端
      tripId = await client.createTrip(getLocalDb());
      localStorage.setItem(TRIPKEY, tripId);
      if(!location.hash) location.hash = 't='+tripId;
    } else { localStorage.setItem(TRIPKEY, tripId); }
    syncCtl = CNXSync.createSyncController({
      client, tripId, getLocalDb, applyDb, mergeDb:CNXCore.mergeDb, onStatus:setSyncStatus
    });
    await syncCtl.load();                              // 拉雲端最新覆蓋本機畫面
    syncCtl.startPolling();
  }catch(e){ setSyncStatus('offline'); }
}
initSync();
