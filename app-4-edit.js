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
