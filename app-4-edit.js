// ── 基地段落編輯（openBase，Task 18）：住宿區 <select> 讀 regionsList()（value=key、顯示 label）；只動 active 版本的 base（base 為 av().base 活參照）──
// 住宿規劃（openBase）＝H1：trip header＋區塊(連續同 region 群、左區域色條)＋飯店子列(每段一家、按晚拆)。
// 模型 schema 不變：一段 {region,fromDay,toDay,hotelPlaceId}＝一家飯店住的連續幾晚；連續同 region 多段＝一個區塊。
function openBase(){
  const regOpts=region=>regionsList().map(r=>`<option value="${esc(r.key)}" ${r.key===region?'selected':''}>${esc(r.label)}</option>`).join('');
  const dt=s=>esc((+s.slice(0,2))+'/'+(+s.slice(2,4)));   // 0822→8/22
  const d0=DAYS[0], dN=DAYS[DAYS.length-1];
  let h=`<h3>${lodgingIcon()} 住宿規劃 · ${esc(av().name)}</h3>`;
  h+=`<div class="bt-line"><span class="tr"><b>${d0?dt(d0.id):'—'} – ${dN?dt(dN.id):'—'}</b> · ${DAYS.length}天 ${DAYS.length>0?DAYS.length-1:0}晚</span><span class="bt-edit" data-action="edit-trip-dates">改起訖</span></div>`;
  if(!base.length){ h+=`<div class="sd">這版還沒排住宿——下面「新增一段」開始，或在細排「${lodgingIcon()}住宿」格加飯店自動帶入。</div>`; }
  const segs=base.slice().sort((a,b)=> a.fromDay<b.fromDay?-1:(a.fromDay>b.fromDay?1:0));
  const groups=[];   // 連續同 region 收成一個區塊（各段＝該區塊裡的一家飯店，按晚拆）
  segs.forEach(s=>{ const g=groups[groups.length-1]; if(g && g.region===s.region) g.segs.push(s); else groups.push({region:s.region, segs:[s]}); });
  groups.forEach(g=>{
    const col=zoneColor(g.region), multi=g.segs.length>1, lastSeg=g.segs[g.segs.length-1];
    const gFrom=g.segs[0].fromDay, gTo=lastSeg.toDay;
    const gNights=DAYS.filter(d=>d.id>=gFrom&&d.id<=gTo).length;
    h+=`<div class="bseg2" style="--rc:${col}">
      <div class="bs-hd"><span class="bz-dot" style="background:${col}"></span><select class="bz-sel" data-action="basezone" data-seg="${esc(g.segs.map(s=>s.id).join(','))}">${regOpts(g.region)}</select><span class="bdt" data-action="edit-region-dates" data-seg="${esc(g.segs[0].id)}">${dt(gFrom)}–${dt(gTo)} · ${gNights}晚</span></div>`;
    g.segs.forEach(s=>{
      const hp=s.hotelPlaceId?getPlace(s.hotelPlaceId):null;
      const sN=DAYS.filter(d=>d.id>=s.fromDay&&d.id<=s.toDay).length;
      const cost=(hp&&hp.cost&&hp.cost.amount)?`<span class="bhpr">NT$${hp.cost.amount}<i>${hp.cost.per==='person'?'/人':'/共用'}</i></span>`:'';
      const sub=multi?`<span class="bhsub bhsub-edit" data-action="edit-hotel-dates" data-seg="${esc(s.id)}">${dt(s.fromDay)}–${dt(s.toDay)} · ${sN}晚</span>`:'';   // 多飯店：每家晚數可編（只在區內對調）
      const body=`<span class="bhe">${lodgingIcon()}</span><span class="bhn">${hp?esc(hotelName(hp)):'（待訂）'}</span>${sub}${cost}`;
      if(multi){   // 多飯店＝版C 手勢：左握把拖曳排序＋左滑刪除（Vivian #2b）；列本身乾淨不放按鈕
        h+=`<div class="bhrow swrow" data-seg="${esc(s.id)}"><span class="bhgrip" aria-label="拖曳排序">⠿</span><div class="bh-body" data-action="hotel-pick" data-day="${esc(s.fromDay)}" data-from="base">${body}</div><span class="bh-del" data-action="hotel-del" data-seg="${esc(s.id)}">🗑 刪除</span></div>`;
      } else {
        h+=`<div class="bhrow" data-action="hotel-pick" data-day="${esc(s.fromDay)}" data-from="base">${body}</div>`;
      }
    });
    h+=`<div class="baddh" data-action="seg-add-hotel" data-seg="${esc(lastSeg.id)}">＋ 加飯店（換到別晚）</div></div>`;
  });
  h+=`<div class="baddseg" data-action="seg-add">＋ 新增一段</div>`;
  openSheet(h, ()=>openBase(), 'base');   // 登記返回（換飯店等子窗自動回基地）
}
// 晚數 stepper（Phase 3，從住宿規劃日期膠囊開、完成回住宿規劃 navStack）。兩層（Vivian 模型：區域＝最上層）：
// mode='region'＝優先設「這區住幾晚」(挪鄰區、setRegionNights，縮區域時裡面飯店 cascade 壓縮)；mode='hotel'＝區內某家晚數(只跟同區別家對調、setHotelNights、不擠別區)。
function openSegDates(segId, mode){
  const seg=base.find(s=>s.id===segId); if(!seg){ closeSheet(); return; }
  const dt=s=>esc((+s.slice(0,2))+'/'+(+s.slice(2,4)));
  const idx=id=>DAYS.findIndex(d=>d.id===id);
  const ordered=base.slice().sort((a,b)=> a.fromDay<b.fromDay?-1:(a.fromDay>b.fromDay?1:0));
  const adj=(a,b)=>idx(b.fromDay)===idx(a.toDay)+1;
  let gi=ordered.findIndex(s=>s.id===seg.id), gs=gi, ge=gi;   // 區塊＝連續同 region
  while(gs>0 && ordered[gs-1].region===seg.region && adj(ordered[gs-1],ordered[gs])) gs--;
  while(ge<ordered.length-1 && ordered[ge+1].region===seg.region && adj(ordered[ge],ordered[ge+1])) ge++;
  const group=ordered.slice(gs,ge+1), nb=ordered[ge+1]||ordered[gs-1];
  const regionT=idx(group[group.length-1].toDay)-idx(group[0].fromDay)+1;   // 這區總晚
  let adjT=0, adjHotels=0;   // 相鄰區塊總晚＋飯店數（算這區還能不能再加）
  if(nb){ let an=ordered.indexOf(nb), as=an, ae=an;
    while(as>0 && ordered[as-1].region===nb.region && adj(ordered[as-1],ordered[as])) as--;
    while(ae<ordered.length-1 && ordered[ae+1].region===nb.region && adj(ordered[ae],ordered[ae+1])) ae++;
    adjHotels=ae-as+1; adjT=idx(ordered[ae].toDay)-idx(ordered[as].fromDay)+1; }
  let nights, title, hint, range, canDec, canInc;
  if(mode==='hotel'){
    nights=idx(seg.toDay)-idx(seg.fromDay)+1;
    const hp=seg.hotelPlaceId?getPlace(seg.hotelPlaceId):null;
    title=`${hp?esc(hotelName(hp)):'這家'}・住幾晚`;
    hint=`只在 <b>${esc(regionLabel(seg.region)||'這區')}</b> 內調整：這區總晚數不變、跟同區另一家對調。`;
    range=`${dt(seg.fromDay)} – ${dt(seg.toDay)}`;
    canDec=nights>1; canInc=(regionT-nights)>(group.length-1);   // 同區其他家還有得讓
  } else {   // region：整區總晚（優先層級）
    nights=regionT;
    title=`${esc(regionLabel(seg.region)||'')}・這區住幾晚`;
    hint=nb?`整區的總晚數；調整時 <b>${esc(regionLabel(nb.region)||'鄰區')}</b> 跟著補（整趟不變）。`:`整趟只有這一區——改天數請用「改起訖」。`;
    range=`${dt(group[0].fromDay)} – ${dt(group[group.length-1].toDay)}`;
    canDec=nights>group.length; canInc=!!nb && adjT>adjHotels;   // 區最少＝飯店數；加被鄰區飯店數地板擋
  }
  const btn=(act,en)=>`<button class="segn-btn" data-action="${act}" data-oseg="${esc(segId)}" data-mode="${mode}" data-nights="${nights}"${en?'':' disabled'}>${act==='segn-dec'?'−':'＋'}</button>`;
  let h=`<h3>🗓️ ${title}</h3><div class="sd">${hint}</div>`;
  h+=`<div class="segn-row">${btn('segn-dec',canDec)}<div class="segn-val"><b>${nights}</b> 晚</div>${btn('segn-inc',canInc)}</div>`;
  h+=`<div class="segn-range">${range}</div>`;
  h+=`<div class="row" style="margin-top:14px;justify-content:center"><span class="pill pri" data-action="close">完成</span></div>`;
  openSheet(h, ()=>openSegDates(segId, mode), 'segdates');
}
// 按晚拆飯店（Phase 3）：把該區塊最後一段的最後一晚拆成新段（同區待訂）→ 開選飯店給它；之後可在每家的日期膠囊調晚數。
function segAddHotel(segId){
  const nid=uid();
  if(!CNXCore.addHotelToRegion(base, segId, DAYS, nid)){ toast('這區每晚都排了不同飯店，沒有多的晚可分給新飯店'); return; }   // 從整區擠一晚（非只拆最後一家），區總晚不變、現有飯店壓一晚（Vivian #3）
  afterChange();
  const ns=base.find(s=>s.id===nid); if(!ns){ openBase(); return; }
  openHotelPick(ns.fromDay, true);   // 選飯店給擠出來的那晚（from=base→選完回住宿規劃）
}
// 新增一段（Phase 3）：從整趟最後一晚拆出新段、預設一個跟最後一區不同的區域（她再改區域/飯店/晚數）。
function segAdd(){
  const ordered=base.slice().sort((a,b)=> a.fromDay<b.fromDay?-1:(a.fromDay>b.fromDay?1:0));
  if(!ordered.length){ toast('還沒有住宿段——先在細排「'+lodgingIcon()+'住宿」格加飯店帶入'); return; }
  const last=ordered[ordered.length-1], nid=uid();
  if(!CNXCore.splitSegTail(base, last.id, DAYS, nid)){ toast('最後一段只有 1 晚、挪不出來——先把它住久一點'); return; }
  const ns=base.find(s=>s.id===nid), regs=regionsList();
  ns.region=(regs.find(r=>r.key!==last.region)||regs[0]||{key:''}).key;   // 預設一個跟最後一區不同的區域，她可改
  afterChange();
  openBase();   // 回住宿規劃；新段在最後，她設區域(下拉)/飯店/晚數
}
// 改起訖（Phase 3）：原生日期輸入改整趟起訖；套到每個版本（trip 日期全 trip 共用）：住宿段按日期裁到新範圍、超範圍排程移除。
function openTripDates(){
  let h=`<h3>🗓️ 改整趟起訖</h3><div class="sd">改開始/結束日。住宿段會自動裁到新範圍、超出範圍的排程會移除（每個版本都套）。</div>`;
  h+=`<div class="td-row"><span class="td-lab">開始</span><input type="date" id="td_start" value="${esc(TRIP.startDate)}"></div>`;
  h+=`<div class="td-row"><span class="td-lab">結束</span><input type="date" id="td_end" value="${esc(TRIP.endDate)}"></div>`;
  h+=`<div class="row" style="margin-top:16px;justify-content:center"><span class="pill pri" data-action="td-save">完成</span></div>`;
  openSheet(h, ()=>openTripDates(), 'tripdates');
}
function applyTripDates(newStart, newEnd){
  TRIP.startDate=newStart; TRIP.endDate=newEnd;
  DAYS=CNXCore.deriveDays(TRIP);
  const lo=DAYS[0].id, hi=DAYS[DAYS.length-1].id;
  let dropped=0;
  DB.versions.forEach(v=>{
    v.base=v.base||[]; CNXCore.refitBaseToRange(v.base, lo, hi);
    const before=(v.plan||[]).length;
    v.plan=(v.plan||[]).filter(e=> e.day>=lo && e.day<=hi);            // 丟超範圍排程
    dropped+=before-v.plan.length;
    v.slotMeta=(v.slotMeta||[]).filter(m=> m.day>=lo && m.day<=hi);
  });
  afterChange(); openBase();
  toast(dropped?`已改起訖（移除 ${dropped} 筆超範圍排程）`:'已改起訖');
}
// 住宿列「選/換飯店」（切片A #6）：挑現有住宿卡或建新→寫該 base 段 hotelPlaceId；成本隨卡片算進預算
function openHotelPick(dayId, fromBase){
  const seg=CNXCore.baseForDay(base,dayId); if(!seg){ toast('這天還沒有住宿段'); return; }
  const dt=s=>esc(s.slice(0,2)+'/'+s.slice(2));
  const nights=DAYS.filter(d=>d.id>=seg.fromDay&&d.id<=seg.toDay).length;
  const hotels=places.filter(p=>isLodging(p));
  let h=`<h3>${lodgingIcon()} ${esc(regionLabel(seg.region)||'')}住宿 · ${dt(seg.fromDay)}–${dt(seg.toDay)}${nights?' · '+nights+'晚':''}</h3><div class="sd">這段住哪？選了寫進這段、成本算進預算。</div>`;
  h+=hotels.map(p=>{ const cur=seg.hotelPlaceId===p.id;
    const price=(p.cost&&p.cost.amount!=null)?`<b>NT$${p.cost.amount}</b>${p.cost.per==='person'?'/人':'/共用'}`:'';
    const meta=[`<span class="hp-rdot" style="background:${zoneColor(p.area)}"></span>${esc(regionLabel(p.area)||'—')}`,price].filter(Boolean).join(' · ');
    return `<div class="hp-card${cur?' cur':''}" data-action="hotel-set" data-day="${dayId}" data-pid="${p.id}"><span class="hp-stamp">${placeEmoji(p)}</span><div class="hp-body"><div class="hp-nm">${esc(hotelName(p))}${cur?'<span class="hp-cur">目前</span>':''}</div><div class="hp-meta">${meta}</div></div></div>`;
  }).join('');
  h+=`<div class="eqacts"><span class="pill" data-action="hotel-new" data-day="${dayId}">＋ 建新飯店卡</span>${seg.hotelPlaceId?`<span class="pill" data-action="hotel-clear" data-day="${dayId}">✕ 清除</span>`:''}</div>`;
  openSheet(h, ()=>openHotelPick(dayId, fromBase), 'hotelpick');   // 登記返回（任何子窗如「建新飯店卡」自動回選飯店）
}
// basezone：地區 <select> change（值為 region key）→ 改 av().base 段的 region；色塊/住宿列即時跟著變
document.addEventListener('change',e=>{
  const t=e.target.closest('[data-action="basezone"]'); if(!t) return;
  const ids=(t.dataset.seg||'').split(',');
  base.forEach(s=>{ if(ids.includes(s.id)) s.region=t.value||''; });   // 區塊可能含多段同區→一起改 region
  CNXCore.mergeBaseSegs(base);   // 改區後若跟鄰段同區同飯店→併（Vivian #3）
  afterChange(); openBase();
});
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-action]'); if(!t) return;
  const a=t.dataset.action;
  if(a==='tab'){ if(sheetOpen()){ navStack.length=0; closeSheet(); if(t.dataset.pg==='lib' && isDesktop()) return; }   // 浮層開著切視圖＝先強制全關（清 navStack 不返回父層）；點庫＝關浮層露出底下庫欄、不再 toggle 改它（修「編輯卡開著點庫畫面亂」，Vivian）
    if(t.dataset.pg==='lib' && isDesktop()){ document.body.classList.toggle('libcollapsed'); return; } switchTab(t.dataset.pg); return; }   // 桌機 📕＝庫欄開關 toggle（常駐、再點收庫；非切分頁），Vivian
  if(a==='flow-split'){ if(document.body.classList.contains('split')) exitSplit(); else enterSplit(); return; }
  if(a==='ovmode-toggle'){ closeDetail(); setOvMode(ovMode()==='table'?'matrix':'table'); applyOvMode(); return; }   // 手機 header 單顆切換鈕：表格↔日卡（B 精簡）
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
  if(a==='mapbar'){ if(drawerOpen()){ mapPinned=false; closeDrawer(); } else { openDrawer(); } renderTopTools(); return; }   // 重繪 header 工具：🗺️ 圖示反映地圖開/關（亮起＝開）
  if(a==='mappin'){ mapPinned=!mapPinned; if(mapPinned) openDrawer(); else updateDrawerUI(); return; }
  if(a==='lib-rail'){ document.body.classList.remove('libcollapsed'); return; }     // 點右軌→展開庫
  if(a==='lib-collapse'){ document.body.classList.add('libcollapsed'); return; }    // 點收合鈕→庫收成軌
  if(a==='assign'){ armPlace(t.dataset.id); return; }                  // 庫卡「排入」→ 進入待命、回總覽亮格點放（spec §2 亮格模型）
  if(a==='arm-cancel'){ disarm(); return; }                            // 待命橫幅「取消」（spec §7）
  // ── 檢視卡 detailSheet（Task 16）動作列 ──
  if(a==='detail-assign'){ armPlace(t.dataset.id); return; }
  if(a==='detail-edit'){ openEdit(t.dataset.id); return; }
  // （qa-place / qa-occupied handler 已隨 openAssign 面板退役；放入/移格改走 dropInto，撞格走 openOccupiedMenu，見 app-2）
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
  if(a==='pickslot'){ if(armed) dropInto(t.dataset.day, t.dataset.slot); else openPicker(t.dataset.day, t.dataset.slot); return; }   // 待命中＝放入亮格（spec §2）；否則直開挑選器
  if(a==='drop-slot'){ const s=sh.dataset; armed={placeId:s.dsPid, moveEid:s.dsMove||undefined}; dropInto(t.dataset.day, t.dataset.slot); return; }   // 日卡細格選單選一格→re-arm→切片 A 放入/撞格（切片 B）
  if(a==='reorder-up'){ if(nudgeInSlot(t.dataset.eid,-1)) openOccPanel(t.dataset.eid); return; }   // 占用面板 ▲▼：同格上移、重開面板看新序（同格排序）
  if(a==='reorder-dn'){ if(nudgeInSlot(t.dataset.eid, 1)) openOccPanel(t.dataset.eid); return; }   // 同格下移
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
  if(a==='occpanel'){ if(armed){ const e=plan.find(x=>x.id===t.dataset.eid); if(e) dropInto(e.day, e.slot); return; } openOccPanel(t.dataset.eid); return; }   // 待命中點已占格的店→撞格（dropInto 判定已占→openOccupiedMenu）；非待命才開占用面板
  // ── 已排項目面板（Task 15）handlers ──
  if(a==='op-move'){ const eid=sh.dataset.opEid, en=plan.find(x=>x.id===eid); if(!en) return; armMove(eid); return; }   // 「移到別格」→ 進入移動待命（armMove 內已 closeSheet＋跳總覽＋亮格，spec §3）
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
  if(a==='op-edit'){ const eid=sh.dataset.opEid, en=plan.find(x=>x.id===eid); if(!en) return; openEdit(en.placeId); return; }   // 已排面板→編輯卡；存檔/取消後自動回換將中心（openSheet 巢狀返回）
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
  if(a==='edit-region-dates'){ openSegDates(t.dataset.seg, 'region'); return; }   // 區域總晚（優先層級）
  if(a==='edit-hotel-dates'){ openSegDates(t.dataset.seg, 'hotel'); return; }     // 區內某家晚數（只在區內對調）
  if(a==='segn-inc'||a==='segn-dec'){ const oseg=t.dataset.oseg, mode=t.dataset.mode, n=(+t.dataset.nights)+(a==='segn-inc'?1:-1);
    const ok=mode==='region'?CNXCore.setRegionNights(base,oseg,n,DAYS):CNXCore.setHotelNights(base,oseg,n,DAYS);
    if(ok){ afterChange(); openSegDates(oseg,mode); } return; }
  if(a==='seg-add-hotel'){ segAddHotel(t.dataset.seg); return; }   // 按晚拆飯店（Phase 3）
  if(a==='seg-add'){ segAdd(); return; }   // 新增一段（Phase 3）
  if(a==='edit-trip-dates'){ openTripDates(); return; }   // 改起訖（Phase 3）
  if(a==='td-save'){ const ns=(document.getElementById('td_start')||{}).value, ne=(document.getElementById('td_end')||{}).value; if(!ns||!ne||ns>ne){ toast('日期不對：開始要不晚於結束'); return; } applyTripDates(ns,ne); return; }
  if(a==='hotel-pick'){ openHotelPick(t.dataset.day, t.dataset.from==='base'); return; }                                 // 住宿列「選/換飯店」（切片A #6）；from=base→選完回基地
  if(a==='hotel-set'){ const seg=CNXCore.baseForDay(base,t.dataset.day); if(seg) seg.hotelPlaceId=t.dataset.pid; CNXCore.mergeBaseSegs(base); afterChange(); closeSheet(); return; }   // 選同飯店→併相鄰同區段（Vivian #3）；回哪交給返回堆疊（基地/總覽/細流），不再寫死 openDetail（Vivian bug3）
  if(a==='hotel-del'){ if(CNXCore.removeHotelSeg(base, t.dataset.seg, DAYS)){ afterChange(); openBase(); } return; }   // 左滑刪一家飯店（晚數給同區鄰家；單飯店區→待訂，Vivian #2b）
  if(a==='hotel-clear'){ const seg=CNXCore.baseForDay(base,t.dataset.day); if(seg) seg.hotelPlaceId=null; afterChange(); closeSheet(); return; }
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
  if(a==='cfg-emoji-add'){ const el=document.getElementById('cfg_emoji_in'); const v=(el&&el.value||'').trim();
    if(!v){ if(el) el.focus(); return; }
    TRIP.emojiList=TRIP.emojiList||[]; if(!TRIP.emojiList.includes(v)) TRIP.emojiList.push(v);
    save(); renderConfig(); return; }   // 常用 emoji 不影響已 render 的卡片，免 renderAllExceptSheet
  if(a==='cfg-emoji-del'){ const i=+t.dataset.i; if(Array.isArray(TRIP.emojiList)&&i>=0&&i<TRIP.emojiList.length){ TRIP.emojiList.splice(i,1); save(); renderConfig(); } return; }
  if(a==='cfg-pb-add'){ const ts=TRIP.priceBands.tiers;
    const prevUpTo=ts.length>=2?(ts[ts.length-2].upTo||0):0; ts.splice(ts.length-1,0,{upTo:prevUpTo+200,label:'新一段',color:'#9a6e25'});
    TRIP.priceBands=CNXCore.normPriceBands(TRIP.priceBands); save(); renderConfig(); renderAllExceptSheet(); return; }
  if(a==='cfg-pb-del'){ const i=+t.dataset.idx; if(TRIP.priceBands.tiers.length<=1) return;
    TRIP.priceBands.tiers.splice(i,1);
    TRIP.priceBands.tiers[TRIP.priceBands.tiers.length-1].upTo=null;
    TRIP.priceBands=CNXCore.normPriceBands(TRIP.priceBands); save(); renderConfig(); renderAllExceptSheet(); return; }
  if(a==='open-wpick'){ openWashokuPicker(t.dataset.kind, t.dataset.key, t.dataset.lbl, t.dataset.cur); return; }   // 設定色塊→開和色庫挑色（地區/類別/tier/價位 共用）
  if(a==='pick-washoku'){ const hex=t.dataset.hex, kind=sh.dataset.wkKind, key=sh.dataset.wkKey;
    if(kind==='region'){ const r=findRegion(key); if(r) r.color=hex; }
    else if(kind==='cat'){ const c=findCat(key); if(c) c.color=hex; }
    else if(kind==='pb'){ const tr=(TRIP.priceBands.tiers||[])[+key]; if(tr) tr.color=hex; }
    else if(kind==='tier'){ const tc=(TRIP.tierColors||{})[key]; if(tc){ tc.fg=hex; tc.bg=tintHex(hex,0.86); applyTierColors(); } }   // tbadge 淡底自動算；即時注入 CSS 變數
    save(); renderAllExceptSheet(); openConfig(); return; }   // 寫色→存→回設定（openConfig 無參＝沿用目前分頁，含價位）
  if(a==='wpick-back'){ openConfig(); return; }   // 選色頁 ✕ → 回設定清單（非整個關掉，Vivian #2）
  if(a==='open-cat-emoji'){ openCatEmojiPicker(t.dataset.key); return; }   // 類別圖示方塊→開 emoji 選擇器（同卡片編輯，Vivian #3）
  if(a==='pick-cat-emoji'){ const c=findCat(sh.dataset.emCat); if(c) c.icon=t.dataset.emoji; save(); renderAllExceptSheet(); openConfig('cat'); return; }
  if(a==='edit'){ openEdit(t.dataset.id); return; }
  if(a==='ed-per'){ sh.querySelectorAll('[data-action="ed-per"]').forEach(x=>x.classList.toggle('on',x===t)); sh.dataset.per=t.dataset.per; return; }
  if(a==='ed-tier'){ sh.querySelectorAll('[data-action="ed-tier"]').forEach(x=>x.classList.toggle('on',x===t)); sh.dataset.tier=t.dataset.tier==='0'?'':t.dataset.tier; return; }
  if(a==='toggle-emoji'){ const pn=document.getElementById('emojiPanel'); if(pn) pn.style.display=(pn.style.display==='none'?'block':'none'); return; }
  if(a==='pick-emoji'){ const el=document.getElementById('ed_icon'); if(el) el.value=t.dataset.emoji;
    const box=document.getElementById('ed_iconbox'); if(box) box.textContent=t.dataset.emoji||temoji((document.getElementById('ed_type')||{}).value);   // 空＝用類別預設，方塊顯示該 type 的預設 emoji
    const pn=document.getElementById('emojiPanel'); if(pn) pn.style.display='none'; return; }
  if(a==='impexp'){ openImpExp(); return; }
  if(a==='copy-link'){ copySyncLink(); return; }
  if(a==='copy-export'){ const ta=document.getElementById('exp'); ta.select(); try{navigator.clipboard.writeText(ta.value);}catch(e){} toast('已複製，貼給 Claude 即可'); return; }
  if(a==='do-import'){ importJSON(document.getElementById('imp').value); return; }
  if(a==='save-edit'){
    const v=id=>document.getElementById(id).value.trim();
    const numOrNull=s=>{ s=(s||'').trim(); if(s==='')return null; const n=parseFloat(s); return isNaN(n)?null:n; };
    const cost={amount:numOrNull(v('ed_amount')),per:sh.dataset.per==='shared'?'shared':'person'};
    const icon=v('ed_icon');   // 菜系欄已砍（97 張只 1 張用過）：save 不碰 p.cuisine，保留既有值不清空
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
      const np=makePlace(Object.assign({},pf||{},{name:v('ed_name')||'未命名地點',icon,type:document.getElementById('ed_type').value,area:document.getElementById('ed_area').value,hours:v('ed_hours'),note:v('ed_note'),cost,tier:sh.dataset.tier?+sh.dataset.tier:null,hideInOverview:hide})); const lr=applyLink(np); places.push(np);
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
      p.name=v('ed_name')||p.name; p.icon=icon; p.type=document.getElementById('ed_type').value; p.area=document.getElementById('ed_area').value; p.hours=v('ed_hours'); CNXCore.applyHoursDerived(p); p.note=v('ed_note'); p.cost=cost; p.tier=sh.dataset.tier?+sh.dataset.tier:null; p.hideInOverview=hide; const lr=applyLink(p); afterChange(); closeSheet();
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
// ── 左滑刪除（pointer events＝手機觸控＋桌機滑鼠通用）：抽成共用，換將候選＋住宿規劃多飯店列共用 ──
function initSwipeDelete(rowSel, bodySel, actSel, ignoreSel){
  let sw=null;
  document.addEventListener('pointerdown',e=>{
    const row=e.target.closest(rowSel); if(!row) return;
    if(ignoreSel && e.target.closest(ignoreSel)) return;   // 點「換」/握把/刪除本身不算滑
    const body=row.querySelector(bodySel); if(!body) return;
    sw={row,body,x0:e.clientX,y0:e.clientY,dx:0,horiz:false,w:row.getBoundingClientRect().width||300};
  });
  document.addEventListener('pointermove',e=>{
    if(!sw) return;
    const dx=e.clientX-sw.x0, dy=e.clientY-sw.y0;
    if(!sw.horiz){ if(Math.abs(dx)<6&&Math.abs(dy)<6) return;
      if(Math.abs(dx)<=Math.abs(dy)){ sw=null; return; }              // 垂直＝放手讓 sheet 捲動
      sw.horiz=true; sw.row.classList.add('swiping'); }
    sw.dx=Math.max(-sw.w,Math.min(0,dx));
    sw.body.style.transform='translateX('+sw.dx+'px)';
    sw.row.classList.toggle('del-armed', sw.dx < -sw.w*0.5);          // 過半個列寬＝放開就刪（紅塊變深提示）
    e.preventDefault();
  },{passive:false});
  function endSwipe(){ if(!sw) return; const s=sw; sw=null; s.row.classList.remove('swiping','del-armed');
    if(s.dx < -s.w*0.5){ const act=s.row.querySelector(actSel); if(act) act.click(); }   // 要滑過半個列寬才算確認刪除（給反悔空間，Vivian）
    else s.body.style.transform=''; }                                                     // 沒過＝彈回
  document.addEventListener('pointerup',endSwipe);
  document.addEventListener('pointercancel',endSwipe);
}
initSwipeDelete('.op-cand.bak','.cand-body','.cand-del','.swap,.cand-del');   // 換將候選（拔 ✕、改左滑含桌機）
initSwipeDelete('.bhrow.swrow','.bh-body','.bh-del','.bhgrip,.bh-del');        // 住宿規劃多飯店列（Vivian #2b 版C）
// ── 住宿規劃多飯店列「握把拖曳排序」：拖動即時換 DOM 順序、放手套用 reorderRegionHotels ──
(function(){
  let dg=null;
  document.addEventListener('pointerdown',e=>{
    const grip=e.target.closest('.bhgrip'); if(!grip) return;
    const row=grip.closest('.bhrow.swrow'); if(!row) return;
    dg={row, wrap:row.closest('.bseg2')}; row.classList.add('bhdrag');
    e.preventDefault();
  });
  document.addEventListener('pointermove',e=>{
    if(!dg) return; const y=e.clientY;
    const sibs=[...dg.wrap.querySelectorAll('.bhrow.swrow')].filter(s=>s!==dg.row);
    for(const s of sibs){
      const r=s.getBoundingClientRect(), mid=r.top+r.height/2;
      const below=dg.row.compareDocumentPosition(s)&Node.DOCUMENT_POSITION_FOLLOWING;   // s 在拖曳列之後（下方）
      if(below && y>mid){ s.parentNode.insertBefore(dg.row,s.nextSibling); break; }      // 往下拖過下方鄰列→移到它之後
      if(!below && y<mid){ s.parentNode.insertBefore(dg.row,s); break; }                 // 往上拖過上方鄰列→移到它之前
    }
    e.preventDefault();
  },{passive:false});
  function endDrag(){ if(!dg) return; const d=dg; dg=null; d.row.classList.remove('bhdrag');
    const order=[...d.wrap.querySelectorAll('.bhrow.swrow')].map(r=>r.dataset.seg);
    if(CNXCore.reorderRegionHotels(base, order, DAYS)) afterChange();
    openBase();   // 重渲：套用後的真實日期；順序沒變也把列歸位
  }
  document.addEventListener('pointerup',endDrag);
  document.addEventListener('pointercancel',endDrag);
})();
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
