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
