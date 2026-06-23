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
let navStack=[], curReopen=null, curKey=null;   // 返回堆疊＋自動巢狀：每個「父層」sheet 開窗時登記 curReopen(怎麼重開自己)+curKey；開不同子窗→openSheet 自動 push 父層→closeSheet pop 回去。統一取代散落旗標，且新浮層不會再漏（巢狀自動記住，非逐點手接）
function openSheet(html, reopen, key){
  if(document.body.classList.contains('sheet-open') && curReopen && key!==curKey) navStack.push(curReopen);   // 在父層上開「不同的」子窗→自動記住回父層（同 key＝原地重繪不記；父層自己登記 curReopen，任何子窗都涵蓋、不漏）
  sh.classList.remove('sheet-edit','sheet-picker','pk2','tall','sheet-cfg'); document.body.classList.remove('cardpeek','peek-edit'); ['pkDay','pkSlot','pkMode','omPid','omMove','omDay','omSlot','opEid','dsPid','dsMove','wkKind','wkKey','emCat'].forEach(k=>delete sh.dataset[k]); sh.innerHTML='<button class="sheetclose" data-action="close" aria-label="關閉">✕</button>'+html; ov.classList.add('on'); document.body.classList.add('sheet-open');
  curReopen=reopen||null; curKey=key||null;   // 登記「怎麼重開現在這個畫面」（過場/葉子不傳＝不可被返回）
}
// ↑ 每次開新 sheet 先清 co-view class：看卡/編輯/占用面板會在 openSheet 後再由 autoSpot 重加；其餘 sheet（排入/挑選器…）保持正常深背景、正常高度（修：從卡片開排入/掛備案時 cardpeek 殘留樣式）。抽屜還原/spotlight 清除仍由 closeSheet→exitCardPeek（看 prevDrawerState，非 class）負責。
function closeSheet(){
  const back=navStack.pop();                                       // 返回堆疊：有上一層就回去，沒有才真的關
  curReopen=null; curKey=null;                                     // 先清：避免 back() 重開父層時把「剛關掉的子窗」誤 push（return-flow 不 push）
  exitCardPeek();                                                  // 每次關都做：co-view／spotlight 拆解（回上一層或真關都要）
  if(spotFromCard){ spotIds=null; spotFromCard=false; if(drawerOpen()) renderMarkers(); }
  if(isDesktop()&&spotFromPicker&&spotIds){ spotIds=null; spotFromPicker=false; renderMarkers(); }
  if(back){ back(); return; }                                      // 回上一個畫面（back()→openX→openSheet 重設 curReopen/curKey）
  ov.classList.remove('on'); document.body.classList.remove('sheet-open');   // 沒有上一層＝真正關閉
  if(!isDesktop()) detailDay=null;
}

// （openAssign「面板選格」已退役 → 改「總覽亮格點放」：armPlace/armMove/dropInto 在 app-2，spec §11；
//  原本面板的「🎯 離它最近的空格」距離推薦改複用 recommendSlots 至 armedReco，亮格時標 🎯。）
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
  const cand=(x,tag,dd)=>{ const band=CNXCore.priceBandOf(x.cost&&x.cost.amount, TRIP.priceBands);   // 價格改價帶標籤（便宜/中價…比 NT$ 短）；備案改「左滑刪除」無 ✕（Vivian）
    const mt=[dd!=null?f(dd):'', band?esc(band):''].filter(Boolean).join('・');
    return `<div class="op-cand ${tag?'bak':''}"${tag?` data-bak="${x.id}"`:''}><div class="cand-body">${placeEmoji(x)} <span class="nm">${esc(x.name)}</span>${x.tier?tierBadge(x.tier):''}${mt?`<span class="meta">${mt}</span>`:''}<span class="swap" data-action="op-swap" data-pid="${x.id}">換</span></div>${tag?`<div class="cand-del" data-action="op-delbak" data-pid="${x.id}">刪除</div>`:''}</div>`; };
  let pkBlock='';
  if(meta.pk){ const ents=plan.filter(x=>x.day===e.day&&x.slot===e.slot);
    pkBlock=`<div class="op-seclab">⚔️ 2 選 1 裁決</div>`+ents.map(x=>{const pp=getPlace(x.placeId); if(!pp) return '';
      return `<div class="op-cand"><div class="cand-body">${placeEmoji(pp)} <span class="nm">${esc(pp.name)}</span><span class="meta">${costLabel(pp.cost)||'—'}・${esc(CNXCore.condenseHours(pp))}</span><span class="swap" data-action="op-keep" data-eid="${x.id}">留它</span></div></div>`;}).join(''); }
  // 這格順序（▲▼ 點按排序，給點選模式；同格 2 家以上才出現）：小格子不塞鈕、控制放這個有空間的面板
  const slotEnts=slotSort(plan.filter(x=>x.day===e.day&&x.slot===e.slot));
  const orderBlock = slotEnts.length>=2 ? `<div class="op-seclab">↕ 這格順序（${slotEnts.length} 家）</div><div class="op-order">`+slotEnts.map((x,i)=>{ const xp=getPlace(x.placeId); if(!xp) return '';
    return `<div class="opo${x.id===eid?' cur':''}"><span class="e">${placeEmoji(xp)}</span><span class="nm">${esc(xp.name)}</span><span class="opo-btns"><button data-action="reorder-up" data-eid="${x.id}"${i===0?' disabled':''} aria-label="上移">▲</button><button data-action="reorder-dn" data-eid="${x.id}"${i===slotEnts.length-1?' disabled':''} aria-label="下移">▼</button></span></div>`;
  }).join('')+`</div>` : '';
  openSheet(`<div class="op">
    <div class="t1"><span class="op-name">${placeEmoji(p)} ${esc(p.name)}${p.tier?tierBadge(p.tier):''}</span></div>
    <div class="op-ctx">${esc(d.label)}（${esc(d.wd)}）· ${esc(slotObj(e.slot).label)}${p.area?(' · '+esc(regionLabel(p.area))):''}</div>
    <div class="op-info-lines">
      <div>🕐 ${esc(CNXCore.condenseHours(p))||'—'}</div>
      <div>💰 ${costLabel(p.cost)||'—'}</div>
      ${memo?`<div>💬 ${esc(memo)}</div>`:''}
    </div>
    <div class="op-acts">
      <a class="oa" href="${esc(gmaps(p))}" target="_blank" rel="noopener">📍 Maps</a>
      <span class="oa" data-action="op-move">↪ 改時間</span>
      <span class="oa" data-action="op-edit">✎ 編輯</span>
      <span class="oa dgr" data-action="op-remove">🗑 拿掉</span>
    </div>
    ${orderBlock}
    ${pkBlock}
    <div class="op-swap">
      <div class="op-seclab">↔ 換成別家</div>
      ${meta.backups.map(id=>{const x=getPlace(id); return x?cand(x,true,CNXCore.distanceM(p,x)):'';}).join('')}
      ${meta.backups.length<2?`<div class="op-addbak" data-action="op-addbak">＋ 掛備案（最多 2）</div>`:''}
      ${bench.map(o=>cand(o.x,false,o.dd)).join('')||'<div class="sd">同區沒有未排的候選</div>'}
    </div>
  </div>`, ()=>openOccPanel(eid), 'occ');
  sh.dataset.opEid=eid;
  autoSpot(CNXCore.occSpotlightIds(av(), eid, places));   // 占用面板→占用者＋備案＋2選1 一起亮
}
ov.addEventListener('click',e=>{ if(e.target!==ov) return; if(sh.dataset.wkKind||sh.dataset.emCat){ openConfig(); } else { closeSheet(); } });   // 選色／選圖示頁點背景＝回設定清單（與 ✕ 一致、不整個關，Vivian #4）
// 全域 Escape：有 sheet/overlay（細看/挑選器/編輯卡/版本…）開著就關它。單一 document 級處理器
function sheetOpen(){ return ov.classList.contains('on'); }
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape') return;
  if(sheetOpen()){ if(sh.dataset.wkKind||sh.dataset.emCat){ openConfig(); } else { closeSheet(); } e.preventDefault(); return; }   // sheet 優先；選色/選圖示頁回設定（與 ✕/點背景一致，非整頁關——Vivian：Esc 別全關）
  if(typeof armed!=='undefined' && armed){ disarm(); e.preventDefault(); return; }   // 待命狀態（排入/移動）Esc 跳出（Vivian）；此時無 sheet（enterArm 已 closeSheet）
  if(document.body.classList.contains('has-detail')){ closeDetail(); e.preventDefault(); }   // 桌機右欄細看
});
// 卡片 icon 的 emoji 選單，依分類排列（收合、點才展開；不夠用可直接在欄位打字／用系統 emoji 鍵盤）
// 和色庫（Vivian 2026-06-21 從和色庫挑定、widget 認可）：地區/類別/tier 取色器共用；9 色相群、約 100 經典和色。她日後可在設定增刪（之後再做）。
const WASHOKU_LIB=[
 {label:'紅',colors:[['茜色','#b7282e'],['紅','#c9171e'],['韓紅','#e2041b'],['緋色','#d3381c'],['真朱','#ec6d51'],['臙脂','#b94047'],['蘇芳','#9e3d3f'],['銀朱','#bf3232'],['深緋','#ad3140'],['浅緋','#df7163']]},
 {label:'橙・茶',colors:[['柿色','#ed6d3d'],['朱色','#eb6101'],['纁','#ed784a'],['橙色','#ee7800'],['柑子色','#f8b862'],['萱草色','#fc9f4d'],['杏色','#f7b977'],['琥珀色','#bb5535'],['駱駝色','#bf794e'],['煉瓦色','#b55233'],['樺色','#b64925'],['茶色','#965042'],['焦茶','#6f4b3e'],['枯茶','#8d6449']]},
 {label:'黃',colors:[['山吹色','#f8b500'],['黄色','#ffd900'],['鬱金','#fabf14'],['刈安','#f5e56b'],['菜の花色','#ffec47'],['玉子色','#fcd575'],['砥粉色','#e4d2ad'],['黄檗','#d9cd90'],['金茶','#e29c45'],['芥子色','#cd9a36'],['鳥の子色','#fff1cf']]},
 {label:'綠',colors:[['千歳緑','#3b7960'],['萌黄','#aacf53'],['若草色','#c3d825'],['草色','#7b8d42'],['抹茶色','#c5c56a'],['鶯色','#928c36'],['苔色','#69821b'],['常磐色','#007b43'],['緑青','#47885e'],['青丹','#90b44b'],['松葉色','#839b5c'],['若竹色','#68be8d'],['青磁色','#7ebeab']]},
 {label:'青',colors:[['浅葱色','#00a3af'],['新橋色','#59b9c6'],['納戸色','#008899'],['青緑','#00aa90'],['水色','#bce2e8'],['甕覗','#a2d7dd'],['白群','#83ccd2'],['青竹色','#7ebea5'],['錆浅葱','#5c9291'],['御召茶','#43676b'],['鉄色','#005243']]},
 {label:'藍',colors:[['縹色','#2792c3'],['露草色','#38a1db'],['空色','#a0d8ef'],['勿忘草','#89c3eb'],['群青色','#4d4398'],['瑠璃色','#1e50a2'],['藍色','#165e83'],['紺色','#223a70'],['杜若','#3e62ad'],['紺青','#192f60']]},
 {label:'紫',colors:[['藤色','#8b81c3'],['菫色','#7058a3'],['江戸紫','#745399'],['古代紫','#895b8a'],['桔梗色','#5654a2'],['楝色','#95859c'],['滅紫','#594255'],['紫','#884898'],['葡萄色','#522f60'],['二藍','#915c8b'],['藤紫','#a59aca']]},
 {label:'粉',colors:[['桜色','#fef4f4'],['紅梅色','#f2a0a1'],['鴇色','#f4b3c2'],['撫子','#eebbcb'],['珊瑚色','#f5b1aa'],['一斤染','#f5b199'],['桃色','#f09199'],['退紅','#e597b2'],['薄紅','#e87a90'],['牡丹色','#e0467f'],['長春色','#c97586']]},
 {label:'中性',colors:[['鈍色','#6e6f72'],['銀鼠','#91989f'],['鼠色','#949495'],['利休鼠','#888e7e'],['灰色','#7d7d7d'],['白鼠','#dcdddd'],['胡粉色','#f7f7f2'],['生成色','#fbf7ef'],['象牙色','#f8f4e6'],['砂色','#dcd3b2'],['亜麻色','#d7c4bb'],['藍鼠','#6c848d'],['墨','#1c1c1c'],['消炭色','#524e4d']]}
];
const WASHOKU_NAMED={'#4c6cb3':'群青色','#e95464':'韓紅'};   // 她 6/21 挑的色裡有「和色庫已有同名、但 hex 不同」的（群青/韓紅）；用對照表正名（colordic 查證），不在選色盤塞重複名
function washokuName(hex){ hex=(hex||'').toLowerCase(); if(WASHOKU_NAMED[hex]) return WASHOKU_NAMED[hex]; for(const g of WASHOKU_LIB){ for(const c of g.colors){ if(c[1].toLowerCase()===hex) return c[0]; } } return hex; }
function wkCellHTML(name,hex,on){ return `<div class="wk-cell${on?' on':''}" data-action="pick-washoku" data-hex="${esc(hex)}" data-name="${esc(name)}"><div class="wk-sw" style="background:${esc(hex)}"></div><div class="wk-nm">${esc(name)}</div></div>`; }
function washokuPickerHTML(label,current){
  const cur=(current||'').toLowerCase();
  const anchor = current ? `<div class="wk-g"><div class="wk-gl">目前</div><div class="wk-row">${wkCellHTML(washokuName(current),current,true)}</div></div>` : '';   // 目前色釘在最上、打勾、可點回（她怕改了找不回，Vivian #1）
  const board=WASHOKU_LIB.map(g=>`<div class="wk-g"><div class="wk-gl">${esc(g.label)}</div><div class="wk-row">${g.colors.map(c=>wkCellHTML(c[0],c[1],c[1].toLowerCase()===cur)).join('')}</div></div>`).join('');
  return `<h3>選顏色 · ${esc(label)}</h3><div class="wk-board">${anchor}${board}</div>`;
}
function openWashokuPicker(kind,key,label,current){ openSheet(washokuPickerHTML(label,current)); sh.classList.add('tall'); sh.dataset.wkKind=kind; sh.dataset.wkKey=key||''; const x=sh.querySelector('.sheetclose'); if(x){ x.dataset.action='wpick-back'; x.setAttribute('aria-label','返回設定'); } }   // ✕ 改成回設定清單（非整個關掉，Vivian #2）
// 類別圖示選擇器：同卡片編輯的 emoji 邏輯（⭐常用＋庫分類），以 sheet 呈現；✕／點背景＝回設定（Vivian #3）
function catEmojiPickerHTML(label,current){
  const star=`<div class="emojicat">⭐ 常用</div><div class="emojigrid"><span class="emojibtn dflt" data-action="pick-cat-emoji" data-emoji="📍">📍 預設</span>${(TRIP.emojiList||[]).map(em=>`<span class="emojibtn${em===current?' on':''}" data-action="pick-cat-emoji" data-emoji="${esc(em)}">${esc(em)}</span>`).join('')}</div>`;
  const lib=EMOJI_CATS.map(c=>`<div class="emojicat">${esc(c.label)}</div><div class="emojigrid">${c.emojis.map(em=>`<span class="emojibtn${em===current?' on':''}" data-action="pick-cat-emoji" data-emoji="${em}">${em}</span>`).join('')}</div>`).join('');
  return `<h3>選圖示 · ${esc(label)}</h3>${star}<details class="emojilib" open><summary>更多分類…</summary>${lib}</details>`;
}
function openCatEmojiPicker(catKey){ const c=findCat(catKey); openSheet(catEmojiPickerHTML('類別・'+(c?c.label:''), c?c.icon:'')); sh.classList.add('tall'); sh.dataset.emCat=catKey; const x=sh.querySelector('.sheetclose'); if(x){ x.dataset.action='wpick-back'; x.setAttribute('aria-label','返回設定'); } }
// 庫＝「常用」之外的 fallback，按 Vivian 的類別精選清邁會用到的（砍掉原本一大堆甜點/水果/速食）
const EMOJI_CATS=[
  {label:'食物',emojis:['🍜','🍲','🍛','🥘','🍢','🍳','🌶️','🍤','🍗','🥗','🍱','🥟','🍚','🥩','🍞','🍙']},
  {label:'咖啡／飲料',emojis:['☕','🍵','🧋','🥤','🍹','🍸','🍺','🥥','🧃','🥛']},
  {label:'景點／自然',emojis:['🛕','⛩️','🏛️','🏯','🗿','🌅','🏞️','🌳','🌴','🐘','♨️','🌊','🏖️','🌸','🦋']},
  {label:'娛樂／按摩',emojis:['💆','🧖','💅','🛀','🧘','🏋️','🎉','🎵','🎤','🎫','📸','🎯','🎬']},
  {label:'逛街',emojis:['🛍️','🛒','🏪','🏬','🎁','👗','👜','💍','🕶️','🧺']},
  {label:'住宿',emojis:['🏨','🏩','🛏️','🏡','🗝️','⛺','🛖']},
  {label:'交通',emojis:['✈️','🚗','🚕','🛵','🚌','🚲','🛺','⛴️','🗺️','📍','🧭']},
  {label:'標記／其他',emojis:['⭐','❤️','🔥','☀️','🌙','💰','📝','✅','⚠️','🕐','💤','💼','📌']}
];

// ── 檢視卡 detailSheet（Task 16）：六區塊瘦身——標題+Tier／💬memo／事實行（具體時間+公休｜NT$/人｜區域）／菜系 chip／排程狀態／矮小動作列 ──
function closedTxt(p){ if(!(Array.isArray(p.closedDays)&&p.closedDays.length)) return ''; if((p.hours||'').includes('休')) return ''; return '・週'+p.closedDays.map(d=>CNXCore.WD_ZH[d]).join('')+'休'; }
function detailSheet(id){
  const p=getPlace(id); if(!p) return;
  const memo=(p.note||'').split('\n')[0].trim();
  const band=CNXCore.priceBandOf(p.cost&&p.cost.amount, TRIP.priceBands);
  const costTxt=costLabel(p.cost)||'—';
  const sc=placeSched(id);
  const schedTxt = sc.length ? ('📅 已排：'+esc(sc.join('、'))) : '尚未排入行程';
  // 檢視卡＝換將中心同款 info-first（給「還沒排的店」、主動作＝排入）；無「地圖看它」（點卡已自動亮、bug#3）
  const h=`<div class="op">
    <div class="t1"><span class="op-name">${placeEmoji(p)} ${esc(p.name)}${p.tier?tierBadge(p.tier):''}</span></div>
    <div class="op-ctx">${esc(regionLabel(p.area)||'—')}</div>
    <div class="op-info-lines">
      <div>🕐 ${esc(p.hours||'—')}${closedTxt(p)}</div>
      <div>💰 ${costTxt}${band?('　'+esc(band)):''}</div>
      ${memo?`<div>💬 ${esc(memo)}</div>`:''}
    </div>
    <div class="op-sched${sc.length?'':' none'}">${schedTxt}</div>
    <div class="op-acts">
      <span class="oa pri" data-action="detail-assign" data-id="${p.id}">📅 排入</span>
      <a class="oa" href="${esc(gmaps(p))}" target="_blank" rel="noopener">📍 Maps</a>
      <span class="oa" data-action="detail-edit" data-id="${p.id}">✎ 編輯</span>
    </div>
  </div>`;
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
  const body=`<h3>${isNew?'新增地點':'編輯卡片'}</h3>
  <div class="seclabel">名稱（暱稱）</div>
  <div class="iconrow"><button type="button" class="emojibox" id="ed_iconbox" data-action="toggle-emoji" aria-label="選 emoji（點開選擇器）">${esc(p.icon||temoji(p.type))}</button><input id="ed_name" style="flex:1;margin:0" value="${esc(nameVal)}" placeholder="地點／店名"><input type="hidden" id="ed_icon" value="${esc(p.icon||'')}"></div>
  <div id="emojiPanel" class="emojipanel" style="display:none"><div class="emojicat">⭐ 常用<span class="emojicfg-hint" data-action="open-cfg" data-tab="emoji">在設定編輯 →</span></div><div class="emojigrid"><span class="emojibtn dflt" data-action="pick-emoji" data-emoji="">↺ 預設</span>${(TRIP.emojiList||[]).map(em=>`<span class="emojibtn" data-action="pick-emoji" data-emoji="${esc(em)}">${esc(em)}</span>`).join('')}</div><details class="emojilib"><summary>更多分類…</summary>${EMOJI_CATS.map(c=>`<div class="emojicat">${c.label}</div><div class="emojigrid">${c.emojis.map(em=>`<span class="emojibtn" data-action="pick-emoji" data-emoji="${em}">${em}</span>`).join('')}</div>`).join('')}</details></div>
  <div class="seclabel">備註 / memo（第一行會顯示在卡片上）</div>
  <textarea id="ed_note" rows="2" placeholder="選填">${esc(p.note||'')}</textarea>
  <div class="seclabel">Tier（你來標：①一定去 ②滿想去 ③順路 ④可不去）</div>
  <div class="row" id="ed_tierrow" style="margin-bottom:8px">${[1,2,3,4,0].map(n=>`<span class="tchip ed-t t${n} ${((p.tier||0)===n)?'on':''}" data-action="ed-tier" data-tier="${n}">${n===0?'未分':('T'+n+' '+['','一定去','滿想去','順路','可不去'][n])}</span>`).join('')}</div>
  <div class="seclabel">每人價格（NT$）</div>
  <div class="priceRow"><input id="ed_amount" inputmode="numeric" value="${p.cost&&p.cost.amount!=null?p.cost.amount:''}" placeholder="例如 350" style="flex:1;margin:0"><span class="chip ${(!p.cost||p.cost.per!=='shared')?'on':''}" data-action="ed-per" data-per="person">每人</span><span class="chip ${(p.cost&&p.cost.per==='shared')?'on':''}" data-action="ed-per" data-per="shared">共用</span></div>
  <details class="ed-link"${p.placeId?'':' open'}><summary class="seclabel">連結（Google Maps）${p.placeId?'<span class="auto">已驗證 ✓</span>':''}</summary>
  <input id="ed_link" value="${esc(p.mapsUrl||'')}" placeholder="貼 Maps 連結（手機分享的也可以）"></details>
  <div class="seclabel">營業時間</div><input id="ed_hours" value="${esc(p.hours||'')}" placeholder="選填">
  <div class="two"><div><div class="seclabel">區域</div><select id="ed_area">${regionsList().map(r=>`<option value="${esc(r.key)}" ${r.key===p.area?'selected':''}>${esc(r.label)}</option>`).join('')}</select></div>
  <div><div class="seclabel">類型</div><select id="ed_type">${categoriesList().map(c=>`<option value="${esc(c.key)}" ${c.key===p.type?'selected':''}>${esc(c.icon)} ${esc(c.label)}</option>`).join('')}</select></div></div>
  <label class="ed-hide"><input type="checkbox" id="ed_hide"${p.hideInOverview?' checked':''}> 不在總覽顯示（仍會留在這天的細看）</label>`;
  const foot=`<div class="edfoot">${isNew?'':`<span class="pill del" data-action="del-card" data-id="${id}">🗑</span>`}<span class="pill cancel" data-action="close">取消</span><span class="pill save" data-action="save-edit" data-id="${isNew?'__new__':id}">${isNew?'新增':'儲存'}</span></div>`;
  openSheet(`<div class="edscroll">${body}</div>${foot}`);
  sh.classList.add('sheet-edit','tall');   // 編輯＝高表單；不進地圖共視（手機才不會擠成小一塊・Vivian 真機 #3）
  sh.dataset.per=(p.cost&&p.cost.per==='shared')?'shared':'person'; sh.dataset.tier=(p.tier?String(p.tier):'');
}

// ── 貼連結建卡（切片2 Task5）：Edge Function 解析→去重→預填 openEdit ──
const RESOLVE_URL = (SYNC_URL && SYNC_ANON) ? (SYNC_URL+'/functions/v1/resolve-place') : '';
let pendingResolve=null;   // 去重「仍建新卡」時暫存解析結果

function openLinkPrompt(addTarget){
  openSheet(`<h3>🔗 貼連結建卡</h3>
    <div class="sd">貼 Google Maps 連結（手機分享的短連結也可以），自動解析建卡。</div>
    <input id="lnk_url" placeholder="https://maps.app.goo.gl/… 或長連結" style="margin-bottom:10px">
    <div class="row"><span class="pill pri" data-action="lnk-go"${addTarget?` data-day="${esc(addTarget.day)}" data-slot="${esc(addTarget.slot)}"`:''}>建卡</span></div>
    <div class="hint">自動帶出：店名・座標・地區・類別（解析後可再改）</div>`);
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
  const newReg=(data.lat!=null)?(regionLabel(CNXCore.nearestRegion(TRIP,data.lat,data.lng))||''):'';   // 新貼的：座標就近判區域，給對照
  const dupReg=regionLabel(dup.area)||'';
  openSheet(`<h3>這家好像已經有卡了</h3>
    <div class="dupcmp">
      <div class="duprow"><span class="duplab new">你剛貼</span><span class="dupnm">${esc(data.name||'未命名')}</span>${newReg?`<span class="dupmeta">${esc(newReg)}</span>`:''}</div>
      <div class="duprow"><span class="duplab old">既有卡</span><span class="dupnm">${esc(dup.icon||temoji(dup.type))} ${esc(dup.name)}</span>${dupReg?`<span class="dupmeta">${esc(dupReg)}</span>`:''}</div>
    </div>
    <div class="sd">同一家＝開既有卡；不同家（例如別分店）＝仍建新卡。</div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <span class="pill pri" data-action="dup-open" data-id="${esc(dup.id)}">開既有卡</span>
      ${canLocate?`<span class="pill" data-action="dup-locate" data-id="${esc(dup.id)}">補定位到它</span>`:''}
      <span class="pill" data-action="dup-new">仍建新卡</span>
    </div>`);
}

function openImpExp(){
  const data=JSON.stringify(getLocalDb(),null,2);   // 全量備份（trip/places/manualLines/settings/versions），可整包還原
  let h=`<h3>⤓⤒ 匯入／匯出</h3><div class="sd">匯出＝整份備份（行程/卡片/版本/設定）。匯入：整包 → 取代還原；只有 {"places":[…]}／[…] → 併入卡片。</div>
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
    h+=`<div class="vrow${cur?' cur':''}" data-action="switchver" data-id="${v.id}"><span class="vn">${esc(v.name)}</span>${cur?'<span class="vcur">目前</span>':''}<div class="vsub">${baseSummary(v)} · ${esc(versionStats(v))}</div></div>`;
  });
  h+=`<div class="eqacts"><span class="pill" data-action="dupver">＋ 複製成新版</span><span class="pill" data-action="renamever">✎ 重命名</span>${DB.versions.length>1?'<span class="pill danger" data-action="delver">🗑 刪除</span>':''}</div>`;   // 等寬動作列（右上角一致關閉鈕，不重複底部關閉）
  openSheet(h);
}
