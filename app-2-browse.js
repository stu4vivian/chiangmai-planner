// ── 總覽互動・亮格點放（切片 A，spec §11）：待命狀態 ──
// armed＝正在排入/移動的東西：{placeId} 排入；{placeId, moveEid} 移動已排的店；null＝沒在待命。
// 進入＝庫卡「排入」(armPlace) / 占用面板「移到別格」(armMove)；離開＝放入成功 / 取消 (disarm)。
// 用 var（非 let）：跨 app 檔共享＋掛上全域，讓 app.test.js 能讀 armed 斷言狀態轉換。
var armed=null;
function armPlace(placeId){ if(!getPlace(placeId)) return; if(armed&&!armed.moveEid&&armed.placeId===placeId){ disarm(); return; } armed={placeId}; enterArm(); }   // 再點同一張卡＝取消（toggle，spec §7）
function armMove(eid){ const e=plan.find(x=>x.id===eid); if(!e) return; armed={placeId:e.placeId, moveEid:eid}; enterArm(); }
function enterArm(){ closeSheet(); switchTab('flow'); renderArm(); renderRibbon(); }   // 進入待命：關浮層、跳總覽、亮格＋升起橫幅
function disarm(){ armed=null; renderArm(); renderRibbon(); }                            // 離開待命：收橫幅、復原亮格
function armedReco(){   // 待命中算「離它最近的一個空格」{day,slot,dist}，給亮格標 🎯（複用 recommendSlots，不重造面板那套）
  if(!armed) return null;
  const p=getPlace(armed.placeId); if(!p) return null;
  const SLOT_KEYS=SLOTS.filter(s=>s.kind!=='stay').map(s=>s.key);
  const ver=av(); const recoVer=armed.moveEid?{...ver, plan:ver.plan.filter(e=>e.id!==armed.moveEid)}:ver;   // 移格不把自己當錨點
  const r=CNXCore.recommendSlots(p, recoVer, places, SLOT_KEYS, TRIP);
  return r&&r.length?r[0]:null;
}
function renderArm(){   // 待命橫幅（總覽頂）：黑底、店名、提示、取消
  const el=document.getElementById('armbar'); if(!el) return;
  if(!armed){ el.hidden=true; el.innerHTML=''; return; }
  const p=getPlace(armed.placeId);
  el.hidden=false;
  el.innerHTML=`<span class="ab-txt">✋ ${armed.moveEid?'移動':'排入'} <b>${placeEmoji(p)} ${esc((p&&p.name)||'')}</b><span class="ab-hint">點亮起的格放入</span></span><button class="ab-x" data-action="arm-cancel">取消</button>`;
}
function dropInto(day, slot){   // 待命中點亮起的真實格＝放入/移過去（複用 qa-place 的排入/移格邏輯）
  if(!armed) return;
  const occupied=plan.some(e=>e.day===day&&e.slot===slot&&e.id!==armed.moveEid);   // 移動模式不把自己當占用
  if(occupied){ openOccupiedMenu(day, slot, armed.placeId, armed.moveEid); disarm(); return; }   // 撞格→現有三選一選單（§4），狀態交棒給選單 dataset
  const so=slotObj(slot), lbl=((DAYS.find(x=>x.id===day)||{}).label||day)+' '+(so.ctx||so.label);   // 行程格用 ctx（上午/晚）比 label（行程）清楚
  if(armed.moveEid){
    const eid=armed.moveEid, e=plan.find(x=>x.id===eid); if(!e){ disarm(); return; }
    const pd=e.day, ps=e.slot; e.day=day; e.slot=slot; closeSheet(); disarm(); afterChange();   // closeSheet：關細排 sheet（手機點天展開那層）回總覽看結果
    toast('已移到 '+lbl, {undo:()=>{ const x=plan.find(y=>y.id===eid); if(x){ x.day=pd; x.slot=ps; } afterChange(); }});
  } else {
    const nid=uid(); plan.push({id:nid, placeId:armed.placeId, day, slot}); closeSheet(); disarm(); afterChange();
    toast('已排入 '+lbl, {undo:()=>{ const i=plan.findIndex(y=>y.id===nid); if(i>=0) plan.splice(i,1); afterChange(); }});
  }
}

// ── 同格排序（seq）：同一 (day,slot) 多家時的手動順序 ──────────────────────────────
// render 一律照 seq 排＝雲端同步(merge3wayById 照 id 重排陣列)也不會打亂顯示。只有「重排」時才寫 seq；
// 沒 seq 的維持原陣列序（stable sort）＝舊資料/新加入（無 seq）自動排在後面。控制不進小格子，只在細排拖／占用面板 ▲▼。
function slotSort(entries){ return entries.slice().sort((a,b)=>{ const sa=a.seq, sb=b.seq; if(sa==null&&sb==null) return 0; if(sa==null) return 1; if(sb==null) return -1; return sa-sb; }); }
function seqOf(eid){ const e=plan.find(x=>x.id===eid); return e&&e.seq!=null?e.seq:null; }
function moveWithinSlot(eid, targetEid, before){   // 拖曳重排：把 eid 插到同格 targetEid 的前/後，重寫整格 seq 0..n
  const e=plan.find(x=>x.id===eid); if(!e||eid===targetEid) return;
  let arr=slotSort(plan.filter(x=>x.day===e.day&&x.slot===e.slot)).filter(x=>x.id!==eid);
  const ti=arr.findIndex(x=>x.id===targetEid); if(ti<0) return;
  arr.splice(before?ti:ti+1, 0, e);
  arr.forEach((x,i)=>{ x.seq=i; });
  afterChange();
}
function nudgeInSlot(eid, dir){   // ▲▼ 微調：同格內上移(-1)/下移(+1)一格、重寫 seq。回傳有沒有動（到頂/底＝false）
  const e=plan.find(x=>x.id===eid); if(!e) return false;
  const arr=slotSort(plan.filter(x=>x.day===e.day&&x.slot===e.slot));
  const i=arr.findIndex(x=>x.id===eid), j=i+dir;
  if(j<0||j>=arr.length) return false;
  arr.splice(i,1); arr.splice(j,0,e); arr.forEach((x,k)=>{ x.seq=k; });
  afterChange(); return true;
}

// ── 總覽互動・拖曳（切片 B，spec §5/§11）──────────────────────────────────────────
// 拖曳＝切片 A「移格」的快路徑：拖起既有項目＝設 armed{moveEid}（直接設、不走 enterArm＝不跳分頁、不升橫幅，
// 只亮格），放到亮起的真實格＝呼叫 dropInto（撞格→openOccupiedMenu、復原 toast、亮格樣式全部重用切片 A）。
// 桌機拖曳常開（直接拖）；手機改長按進拖（按住 LONGPRESS_MS 不動才起拖、計時中移動＝當捲動放掉）＝免整理模式、免握把。跨天遠移仍走切片 A 點放。
function applyDrag(){ document.body.classList.toggle('drag-on', isDesktop()); }   // drag-on（grab 游標＋項目 touch-action:none）只給桌機；手機平常不鎖捲、長按進拖才靠 body.dragging 鎖
function finishDrop(day, slot){   // pointer 放開解析到的目的格（可能 null）→ 放入/撞格 或 取消。抽成函式＝可單元測（不靠 pointer/版面）
  const e=armed&&armed.moveEid?plan.find(x=>x.id===armed.moveEid):null;
  if(day&&slot&&!(e&&e.day===day&&e.slot===slot)) dropInto(day, slot);     // 真實格、且非拖回原格→切片 A 放入/撞格/復原
  else disarm();                                                          // 格外或拖回原格＝取消
}
let dragSt=null;          // {eid, srcEl, x0, y0, lastX, lastY, moved, ghost, armed, lpTimer}；null＝沒在拖
const DRAG_THRESH=6;      // px：分辨「拖」與「點」——未過門檻＝純點擊，放行原本的看卡/占用面板/展開那天
const LONGPRESS_MS=400;   // 手機：按住不動這麼久才進拖移（真機可調手感）
const LP_MOVE_TOL=10;     // 手機：長按計時中手指移動超過此 px＝判定要捲動/點擊、取消長按（比 DRAG_THRESH 稍寬，容忍按壓微動）
const DRAGSEL='.it[data-eid],.ditem[data-eid],.tlday li[data-eid]';   // 可拖來源：表格項目／細排項目／日卡項目
function onItemDown(ev){
  if(ev.button>0) return;                                                 // 只主鍵（觸控 button=0）
  const it=ev.target.closest(DRAGSEL); if(!it) return;                    // 住宿/日卡空段(.ph 無 data-eid)→自然不可拖（spec §0/§5）
  const eid=it.dataset.eid; if(!plan.some(x=>x.id===eid)) return;
  dragSt={eid, srcEl:it, x0:ev.clientX, y0:ev.clientY, lastX:ev.clientX, lastY:ev.clientY, moved:false, ghost:null, armed:isDesktop()};   // 桌機 armed＝過門檻即起拖；手機 armed=false＝等長按計時器
  document.addEventListener('pointermove', onItemMove, true);
  document.addEventListener('pointerup', onItemUp, true);
  document.addEventListener('pointercancel', onItemUp, true);
  if(!isDesktop()){ startCharging(it); dragSt.lpTimer=setTimeout(lpFire, LONGPRESS_MS); document.addEventListener('touchmove', onTouchMoveGuard, {passive:false}); }   // 手機：長按閘＋按住漸進浮起預告＋touchmove guard（一定從這就綁，見 onTouchMoveGuard）
}
function lpFire(){ if(dragSt&&!dragSt.armed){ dragSt.armed=true; beginDrag(); } }   // 長按到時：手指還按著、進拖（位置≈x0/y0，lastX/Y 已記）
function beginDrag(){
  stopCharging();                                                          // 進拖：清長按漸進浮起視覺（日卡不重繪時尤其要清）
  const e=plan.find(x=>x.id===dragSt.eid); if(!e){ endDrag(); return; }
  dragSt.moved=true;
  const ss=dragSt.srcEl.closest('[data-day][data-slot]');                  // 來源格（同格重排比對用）：表格 .ovg-cl／細排 .fillrow 都帶 day+slot
  if(ss){ dragSt.day=ss.dataset.day; dragSt.slot=ss.dataset.slot; }
  else { const ts=dragSt.srcEl.closest('.tlslot[data-day]'); if(ts){ dragSt.day=ts.dataset.day; dragSt.slot=dragSt.srcEl.dataset.slot; } }   // 日卡 li：day 在 .tlslot、slot 在 li
  try{ const sel=window.getSelection&&window.getSelection(); if(sel&&sel.removeAllRanges) sel.removeAllRanges(); }catch(_){}   // 清掉按下→過門檻間可能起頭的反白（user-select:none 擋後續擴張）
  armed={placeId:e.placeId, moveEid:dragSt.eid};                          // 切片 A 待命（移格）；直接設、不走 enterArm
  if(ovMode()!=='matrix' && isDesktop()){ renderRibbon();                // 桌機表格：重繪亮起可放的真實格（滑鼠不怕拖曳源被 #ribbon 重建）
    if(document.body.classList.contains('has-detail')&&detailDay){ const pd=document.getElementById('pg-detail'); if(pd) pd.innerHTML=detailPaneHTML(detailDay); }   // 桌機右欄細排同步亮
  }                                                                        // 手機表格＆日卡：都不重繪＝不銷毀 touch 起始的源元素（否則 iOS 因 target detach 發 pointercancel→長按後一滑就斷，bug#1 第2修）；落點靠 onItemMove 的 .dragover 動態高亮、日卡時段塊靠 body.dragging CSS
  const g=dragSt.srcEl.cloneNode(true); g.classList.add('dragghost'); document.body.appendChild(g); dragSt.ghost=g;   // 跟指標的浮影
  document.body.classList.add('dragging');
  markLifted(); moveGhost(dragSt.lastX, dragSt.lastY);
}
function markLifted(){
  document.querySelectorAll('.lifted').forEach(x=>x.classList.remove('lifted'));
  document.querySelectorAll(DRAGSEL).forEach(x=>{ if(x.dataset.eid===dragSt.eid&&!x.classList.contains('dragghost')) x.classList.add('lifted'); });
}
function moveGhost(x,y){ const g=dragSt&&dragSt.ghost; if(g) g.style.transform='translate('+(x+10)+'px,'+(y+8)+'px)'; }
function dropCellAt(x,y){
  const g=dragSt&&dragSt.ghost; if(g) g.style.display='none';             // 浮影讓開，才量得到底下的格
  const el=document.elementFromPoint(x,y);
  if(g) g.style.display='';
  if(!el) return null;
  return el.closest('[data-action="pickslot"]') || el.closest('.fillrow[data-day]') || el.closest('.tlslot[data-per]');   // 表格真實格／細排列(data-day+slot)／日卡時段塊(data-day+per)
}
function siblingReorderTarget(x,y){   // 拖曳中：指標下若是「同格的另一家」項目→回傳 {eid,before,el}，給同格重排（插入線）；否則 null（走移動）
  if(!dragSt||dragSt.day==null) return null;
  const g=dragSt.ghost; if(g) g.style.display='none';
  const el=document.elementFromPoint(x,y);
  if(g) g.style.display='';
  if(!el) return null;
  const sib=el.closest('.ditem[data-eid],.tlslot li[data-eid],.ovg-cl .it[data-eid]');
  if(!sib||sib.dataset.eid===dragSt.eid) return null;
  let sday,sslot; const ss=sib.closest('[data-day][data-slot]');
  if(ss){ sday=ss.dataset.day; sslot=ss.dataset.slot; }
  else { const ts=sib.closest('.tlslot[data-day]'); if(ts){ sday=ts.dataset.day; sslot=sib.dataset.slot; } }
  if(sday!==dragSt.day||sslot!==dragSt.slot) return null;                 // 只在同一 (day,slot) 內才重排
  const r=sib.getBoundingClientRect();
  return {eid:sib.dataset.eid, before:y<r.top+r.height/2, el:sib};
}
function onItemMove(ev){
  if(!dragSt) return;
  dragSt.lastX=ev.clientX; dragSt.lastY=ev.clientY;                       // 提前記＝長按到時 beginDrag 用得到最新位置
  if(!dragSt.armed){                                                       // 手機長按計時中：手指移動超門檻＝判定要捲動/點擊，取消長按、放行（不 preventDefault→瀏覽器照常捲）
    if(Math.abs(ev.clientX-dragSt.x0)+Math.abs(ev.clientY-dragSt.y0)>=LP_MOVE_TOL) endDrag();
    return;
  }
  if(!dragSt.moved){ if(Math.abs(ev.clientX-dragSt.x0)+Math.abs(ev.clientY-dragSt.y0)<DRAG_THRESH) return; beginDrag(); }   // 桌機：過門檻才起拖
  ev.preventDefault();
  moveGhost(ev.clientX, ev.clientY);
  document.querySelectorAll('.ins-top,.ins-bot').forEach(x=>x.classList.remove('ins-top','ins-bot'));
  const sib=siblingReorderTarget(ev.clientX, ev.clientY);                 // 同格另一家→重排（插入線）；否則→移動（亮落點）
  if(sib){ dragSt.reorder=sib; sib.el.classList.add(sib.before?'ins-top':'ins-bot'); document.querySelectorAll('.dragover').forEach(x=>x.classList.remove('dragover')); }
  else { dragSt.reorder=null; refreshDragover(); }
  edgeScroll(ev.clientY);                                                 // 拖到畫面上/下緣→自動捲（日卡跨天搆得到遠天）
}
function refreshDragover(){
  if(!dragSt) return;
  const c=dropCellAt(dragSt.lastX, dragSt.lastY);
  document.querySelectorAll('.dragover').forEach(x=>x.classList.remove('dragover'));
  if(c&&c.dataset.day&&(c.dataset.slot||c.dataset.per)) c.classList.add('dragover');   // 真實格(slot)或日卡時段塊(per)都可高亮
}
function onItemUp(ev){
  if(!dragSt) return;
  const moved=dragSt.moved, eid=dragSt.eid, reorder=dragSt.reorder;
  const c=(moved&&!reorder)?dropCellAt(ev.clientX, ev.clientY):null;
  endDrag();
  if(!moved) return;                                                     // 純點擊：放行 click（看卡/占用面板/展開那天照常）
  suppressNextClick();                                                   // 拖過＝吃掉隨後那個 click（否則放完又觸發 occpanel/openday）
  if(reorder){ disarm(); moveWithinSlot(eid, reorder.eid, reorder.before); return; }   // 同格重排：先 disarm 清掉 beginDrag 設的移格待命（否則 armed 殘留→afterChange 重繪細流時冒出 armHint bar 關不掉，bug#2），再重排
  if(c&&c.dataset.day&&c.dataset.per&&!c.dataset.slot) openDropSlotMenu(c.dataset.day, c.dataset.per);   // 日卡時段塊→跳細格選單（Vivian 定）
  else finishDrop(c&&c.dataset.day, c&&c.dataset.slot);                   // 表格/細排真實格→直接放入/撞格
}
function endDrag(){
  if(dragSt&&dragSt.lpTimer) clearTimeout(dragSt.lpTimer);                  // 清長按計時器（計時中取消／放開都要）
  stopCharging();                                                          // 清長按漸進浮起視覺
  document.removeEventListener('pointermove', onItemMove, true);
  document.removeEventListener('pointerup', onItemUp, true);
  document.removeEventListener('pointercancel', onItemUp, true);
  document.removeEventListener('touchmove', onTouchMoveGuard, {passive:false});
  if(dragSt&&dragSt.ghost) dragSt.ghost.remove();
  stopEdgeScroll();
  document.querySelectorAll('.dragover').forEach(x=>x.classList.remove('dragover'));
  document.querySelectorAll('.ins-top,.ins-bot').forEach(x=>x.classList.remove('ins-top','ins-bot'));
  document.querySelectorAll('.lifted').forEach(x=>x.classList.remove('lifted'));
  document.body.classList.remove('dragging');
  dragSt=null;
}
function onTouchMoveGuard(e){ if(dragSt&&dragSt.armed) e.preventDefault(); }   // 進拖(armed)才鎖捲；計時中(!armed)放行＝讓捲動發生好取消長按。**從 onItemDown 就綁**（非 beginDrag），iOS 才不會在 touchstart 把這個 touch 判給捲動、害長按成立後一滑就 pointercancel 中斷（bug#1）
function startCharging(el){ el.style.transition='transform '+LONGPRESS_MS+'ms ease, background-color '+LONGPRESS_MS+'ms ease'; el.classList.add('lpcharge'); }   // 手機長按計時中：漸進浮起預告（到時 beginDrag 接手；CSS .lpcharge）
function stopCharging(){ document.querySelectorAll('.lpcharge').forEach(el=>{ el.classList.remove('lpcharge'); el.style.transition='transform .14s ease, background-color .14s ease'; setTimeout(()=>{ if(!el.classList.contains('lpcharge')) el.style.transition=''; }, 160); }); }
function suppressNextClick(){
  // 只吃「總覽上」的合成 click（拖放後源項目/天會冒出 openday/occpanel）；放行選單/浮層(#sheet)的點擊——
  // 否則日卡拖到時段塊開細格選單後，妳在選單上的第一下會被誤吃。
  const kill=e=>{ document.removeEventListener('click',kill,true); if(e.target.closest&&e.target.closest('#ribbon')){ e.stopPropagation(); e.preventDefault(); } };
  document.addEventListener('click', kill, true);
  setTimeout(()=>document.removeEventListener('click',kill,true), 320);  // 沒觸發就逾時自清
}
// 邊緣自動捲（拖到畫面上/下緣→捲動容器，讓日卡跨天搆得到遠天）。ghost 用 fixed 跟指標，捲動後靠 refreshDragover 重算指向格。
let edgeRAF=null, edgeDir=0;
function dragScrollEl(){ for(let p=document.getElementById('ribbon'); p; p=p.parentElement){ const o=getComputedStyle(p).overflowY; if((o==='auto'||o==='scroll')&&p.scrollHeight>p.clientHeight+2) return p; } return document.scrollingElement||document.documentElement; }
function edgeScroll(y){
  const sc=dragScrollEl(), Z=52;
  const top=(sc===document.scrollingElement||sc===document.documentElement)?0:sc.getBoundingClientRect().top;
  const bottom=(sc===document.scrollingElement||sc===document.documentElement)?window.innerHeight:sc.getBoundingClientRect().bottom;
  edgeDir = y<top+Z ? -1 : (y>bottom-Z ? 1 : 0);
  if(edgeDir && !edgeRAF) edgeRAF=requestAnimationFrame(edgeStep);
}
function edgeStep(){ if(!dragSt||!edgeDir){ edgeRAF=null; return; } dragScrollEl().scrollTop+=edgeDir*10; refreshDragover(); edgeRAF=requestAnimationFrame(edgeStep); }
function stopEdgeScroll(){ edgeDir=0; if(edgeRAF){ cancelAnimationFrame(edgeRAF); edgeRAF=null; } }
// 日卡拖到「時段塊」→ 跳細格選單（Vivian 定）：列出該段真實格＋占用狀況，點哪格＝dropInto（撞格/復原 重用切片 A）。
// 仿 openOccupiedMenu：開選單即 disarm、狀態存 sh.dataset，關/取消都不殘留 armed；選一格時 drop-slot 再 re-arm→dropInto。
function openDropSlotMenu(day, period){
  if(!armed) return;
  const po=(CNXCore.OVERVIEW_PERIODS||[]).find(p=>p.key===period);
  const pid=armed.placeId, mv=armed.moveEid; disarm();
  if(!po) return;
  const d=DAYS.find(x=>x.id===day)||{label:day};
  const rows=po.slots.map(sk=>{
    const so=slotObj(sk), lbl=so.kind==='meal'?so.label:(so.ctx||so.label);
    const occ=plan.filter(e=>e.day===day&&e.slot===sk&&e.id!==mv);
    const occTxt=occ.length?('已有 '+occ.map(e=>{const p=getPlace(e.placeId);return p?esc(p.name):'';}).filter(Boolean).join('、')+'（會問撞格）'):'空格';
    return `<div class="opt" data-action="drop-slot" data-day="${esc(day)}" data-slot="${esc(sk)}"><div>${esc(lbl)}<small>${esc(occTxt)}</small></div></div>`;
  }).join('');
  openSheet(`<h3>放到 ${esc(d.label||day)}・${esc(period)} — 選一格</h3>${rows}<div class="opt cancel" data-action="close">取消</div>`);
  sh.dataset.dsPid=pid; sh.dataset.dsMove=mv||'';
}
document.addEventListener('pointerdown', onItemDown, true);

// ── 庫頁（Task 17 §4.8）：膠囊篩選＋triage＋三行列＋行內快標 tier ──
const CAP_DEFS=[
  {key:'areas', label:'地區', kind:'set', opts:()=>regionsList().filter(r=>places.some(p=>p.area===r.key)).map(r=>[r.key,r.label])},
  {key:'tiers', label:'Tier', kind:'set', opts:()=>[1,2,3,4].map(t=>[t,TIER_LABEL[t]+' tier'+t]), valLabel:v=>TIER_LABEL[v]},
  {key:'bands', label:'價格', kind:'set', opts:()=>(TRIP.priceBands.tiers||[]).map(t=>[t.label,t.label])},
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
function libRow(p){   // 庫②卡片（定稿 A-完整四頁＋庫兩版.html §庫·版②）：左 emoji 章＋右 店名/價格/tier/meta；店名不截斷（換行）；tier 章保留就地快標、memo 補一列（密度）。
  const memo=(p.note||'').split('\n')[0].trim();
  const sc=placeSched(p.id);
  const tnum=p.tier||0;
  const pr=(p.cost&&p.cost.amount!=null)?`NT$${p.cost.amount}<i>${p.cost.per==='shared'?'/共用':'/人'}</i>`:'';
  const meta=[esc(tlabel(p.type)), esc(p.area?regionLabel(p.area):''), esc(CNXCore.condenseHours(p))].filter(Boolean).join(' · ');
  const sched=sc.length?`<span class="on">已排 ${esc(sc[0])}${sc.length>1?' +'+(sc.length-1):''}</span>`:'未排入';
  return `<div class="bcard" data-action="lib-detail" data-id="${p.id}">
    <div class="stamp">${placeEmoji(p)}</div>
    <div class="info">
      <div class="r1"><span class="bnm">${esc(p.name)}</span>${pr?`<span class="bprice">${pr}</span>`:''}</div>
      <div class="r2"><span class="tbadge ltier t${tnum}" data-action="lib-tier" data-id="${p.id}">${tnum?('T'+tnum):'＋標'}</span><span class="bmeta">${meta}${meta?' · ':''}${sched}</span></div>
      ${memo?`<div class="r3">💬 ${esc(memo)}</div>`:''}
    </div></div>`;
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
// ── 總覽・編輯時間軸（模式1，定稿＝v1-編輯時間軸_真資料.html）：直向一天一段、早午晚直堆、大日號＋區域左帽/小標＋rubric＋髮絲線。
//    矩陣＝導航（spec §0）：整天可點 openday→展開細排；早午晚＝合併摘要、空段顯示淡＋（永不直接加，因一段含 2–3 真實格）。資料同源 CNXCore.overviewModel。──
const PERIOD_KICK={'早':'MORNING','午':'NOON','晚':'NIGHT'};
function tlPeriodHTML(items,tentative,col){
  if(items&&items.length){
    items=items.slice().sort((a,b)=>{ const d=CNXCore.slotOrderInPeriod(a.slot)-CNXCore.slotOrderInPeriod(b.slot); if(d) return d;   // 先照真實格（早餐→上午…），同一真實格內再照 seq（手動順序）
      const sa=seqOf(a.eid), sb=seqOf(b.eid); if(sa==null&&sb==null) return 0; if(sa==null) return 1; if(sb==null) return -1; return sa-sb; });
    let lis=items.map(it=>{
      const p=getPlace(it.placeId), tn=(p&&p.tier)||0;
      const warn=it.warn?`<span class="tlwarn" title="${esc(it.warn)}">⚠️</span>`:'';
      return `<li data-eid="${esc(it.eid)}" data-slot="${esc(it.slot)}">${warn}<span class="e">${placeEmoji(p)}</span><span class="nm">${esc(it.name)}</span>${tn?`<span class="t" style="color:${col}">T${tn}</span>`:''}</li>`;   // data-eid/slot＝日卡項目可拖（切片 B・日卡跨天）
    }).join('');
    if(tentative) lis+='<li class="tent">⏳ 待定</li>';   // 有項目又標待定→也提示（保留舊行為）
    return lis;
  }
  return `<li class="ph">${tentative?'⏳ 待定':'＋'}</li>`;   // 空段：待定→提醒、否則淡＋（點整天展開）
}
function renderOverviewMatrix(){   // 名稱沿用（ovMode 'matrix' 支）；內容＝編輯時間軸
  const el=document.getElementById('ribbon'); if(!el) return;
  const model=CNXCore.overviewModel(DAYS, plan, places, slotMetaArr);   // slotMetaArr→待定旗標同源
  const reco=armed?armedReco():null;   // 待命中：有空格的天亮起、最近的標 🎯
  const arts=model.map(row=>{
    const seg=CNXCore.baseForDay(base,row.day.id)||{};
    const col=zoneColor(seg.region), zlab=regionLabel(seg.region)||'—';
    const dnum=(row.day.label.split('/')[1])||row.day.label;
    const hp=seg.hotelPlaceId?getPlace(seg.hotelPlaceId):null;
    const stayNm=hp?esc(hotelName(hp)):'（'+esc(zlab)+'・待訂）';
    const slots=['早','午','晚'].map(per=>{
      const empty=!(row.periods[per]&&row.periods[per].length);
      return `<div class="tlslot${empty?' empty':''}" data-day="${row.day.id}" data-per="${per}"><span class="tlrub">${per}<i>${PERIOD_KICK[per]}</i></span><ul>${tlPeriodHTML(row.periods[per],row.tentative[per],col)}</ul></div>`;   // data-day/per＝拖曳落點（時段塊，切片 B・日卡跨天）
    }).join('');
    let dcl='tlday';
    if(armed){ dcl+=' armday'; if(reco&&reco.day===row.day.id) dcl+=' armday-near'; }   // 待命中：每天都亮（點天展開→細排放入/撞格）；最近空格的天標 🎯
    return `<article class="${dcl}" data-action="openday" data-day="${row.day.id}" style="--rail:${col}">
      <div class="tld-h"><div class="tld-num">${esc(dnum)}</div><div class="tld-meta"><b>${esc(row.day.wd)}</b><span>${esc(row.day.label)}</span></div><span class="tld-zone" style="color:${col};background:${col}14">${esc(zlab)}</span></div>
      ${slots}
      <div class="tlstay" data-action="openbase"><span class="e">${lodgingIcon()}</span><span class="nm">${stayNm}</span><i class="go">›</i></div>
    </article>`;
  });
  let html='';   // 兩天一組：桌機 .tlpair=subgrid 讓並排兩天的早午晚＋住宿底線對齊；手機 .tlpair=block，天照常直堆
  for(let i=0;i<arts.length;i+=2) html+='<div class="tlpair">'+arts[i]+(arts[i+1]||'')+'</div>';
  el.innerHTML='<div class="tl">'+html+'</div>';
}
function renderOverview(){
  const flow=document.getElementById('pg-flow');
  const m=ovMode();
  if(flow){ flow.classList.toggle('mode-table', m==='table'); flow.classList.toggle('mode-matrix', m!=='table'); }
  if(m==='table') renderOverviewTable(); else renderOverviewMatrix();
}
// ── v1 表格總覽（粗流雙版面）：直欄＝天、橫列＝細時段；資料讀 plan（與細排同源）、點擊走 v2、天欄/住宿讀 base 地區、⚠️走 cellWarning ──
const OVT_WEEK=7;   // 表格每排固定幾天（一週；多的往下一排，Vivian 改起訖後回報）
function renderOverviewTable(){   // v1 風格：每排固定 OVT_WEEK 天、上下堆疊；移植 v1 matrix 視覺、資料/色彩改吃 v2
  const el=document.getElementById('ribbon'); if(!el) return;
  const blocks=[]; for(let i=0;i<DAYS.length;i+=OVT_WEEK) blocks.push(DAYS.slice(i,i+OVT_WEEK));   // 固定每排 7 天、餘數往下排（不再「上6＋剩下全塞一排」）
  const reco=armed?armedReco():null;   // 待命中：算一次最近空格，下傳給亮格標 🎯
  el.innerHTML=blocks.map(days=>`<div class="ovt-wrap">${ovtTable(days, reco)}</div>`).join('');
}
function ovtTable(days, reco){   // 版① 扁平髮絲線 CSS grid（定稿 A-版1-真實上下區）：時段欄＋天欄、cell 只有底髮絲線、欄距斷線；item＝純 emoji＋店名（無小卡/色條）。互動沿用：cell→pickslot、item→occpanel、住宿→hotel-pick（直接換飯店）。待命中空格亮 armdrop。
  const regOf=d=>(CNXCore.baseForDay(base,d.id)||{}).region||'';
  let h=`<div class="ovg" style="grid-template-columns:var(--ovtSL) repeat(${days.length},var(--ovtDay))"><div class="ovg-cap"></div>`;
  days.forEach(d=>{ const r=regOf(d);
    const dp=d.label.split('/'), dmo=dp[0], dday=dp[1]||d.label;   // 每天「8/29（六）」＝日期都一樣大＋星期全形括弧；地區第二排（Vivian）
    h+=`<div class="ovg-hd" style="--rg:${zoneColor(r)}"><div class="dhd">${esc(dmo)}/${esc(dday)}<span class="wd">（${esc(d.wd)}）</span></div><span class="rg">${esc(regionLabel(r)||'—')}</span></div>`;
  });
  SLOTS.forEach(s=>{
    const lab=s.kind==='meal'?s.label:(s.kind==='stay'?'住宿':(s.ctx||s.label));
    h+=s.kind==='stay'?`<div class="ovg-lab stayplan" data-action="openbase">${esc(lab)}<i class="go">›</i></div>`:`<div class="ovg-lab">${esc(lab)}</div>`;   // 住宿列開頭→住宿規劃（Phase4 入口①·表格版）
    days.forEach(d=>{
      if(s.kind==='stay'){
        const seg=CNXCore.baseForDay(base,d.id)||{}, hp=seg.hotelPlaceId?getPlace(seg.hotelPlaceId):null;
        const nm=hp?esc(hotelName(hp)):'（'+esc(regionLabel(seg.region)||'未設')+'・待訂）';
        h+=`<div class="ovg-cl st" data-action="openbase" data-day="${d.id}"><span class="it dim"><span class="e">${lodgingIcon()}</span><span class="nm">${nm}</span></span></div>`;   // 住宿格→住宿規劃（與日卡統一，Vivian #2a）
        return;
      }
      const meta=slotMetaOf(d.id,s.key); let pre='';
      if(meta&&meta.pk) pre+=`<span class="ovg-pk">2選1</span>`;
      if(meta&&meta.tentative) pre+=`<span class="ovg-tent" data-action="cleartent" data-day="${d.id}" data-slot="${s.key}">⏳ 待定</span>`;
      const entries=slotSort(plan.filter(e=>e.day===d.id&&e.slot===s.key));   // 同格照 seq 排（手動順序）
      let inner;
      if(entries.length){
        const day=DAYS.find(x=>x.id===d.id), per=CNXCore.slotPeriod(s.key);
        inner=entries.map(e=>{ const p=getPlace(e.placeId); if(!p) return '';
          const warn=per?CNXCore.cellWarning(p,day,per):'';
          return `<span class="it" data-action="occpanel" data-eid="${e.id}">${warn?`<span class="warn" title="${esc(warn)}">⚠️</span>`:''}<span class="e">${placeEmoji(p)}</span><span class="nm">${esc(p.name)}</span></span>`;
        }).join('');
      } else inner='<span class="cempty">＋</span>';
      let clc='ovg-cl';
      if(armed){ clc+=' armdrop'; if(reco&&reco.day===d.id&&reco.slot===s.key) clc+=' armnear'; }   // 待命中所有真實格都亮（空格放入、已占格點了走撞格）；最近空格標 🎯
      h+=`<div class="${clc}" data-action="pickslot" data-day="${d.id}" data-slot="${s.key}">${pre}${inner}</div>`;
    });
  });
  return h+'</div>';
}
function renderTopTools(){   // header 一排：粗流專屬(👀檢視/✏️整理/📖並看)→#flowtools(接在 📅 後・淡底群組・非粗流整組消失)；全域 🗺️地圖→#hdrtools(靠右)；⚙在獨立 gear
  const ft=document.getElementById('flowtools'), gt=document.getElementById('hdrtools');
  const flow=curTab==='flow', split=document.body.classList.contains('split');
  const ic=(emoji,act,label,on)=>`<button class="htico${on?' on':''}" data-action="${act}" aria-label="${label}" title="${label}">${emoji}</button>`;
  if(ft) ft.innerHTML = !flow ? '' : (isDesktop()
    ? ic('👀','ovmode-toggle','表格／日卡切換')                                      // 桌機粗流工具只有檢視👀（整理＝拖曳常開、並看＝三欄常駐 都不需要）
    : ic('👀','ovmode-toggle','表格／日卡切換')+ic('📖','flow-split','並看（總覽＋庫）',split));   // 拔掉 ✏️整理（手機改長按拖移、免模式切換）
  if(gt) gt.innerHTML = isDesktop() ? '' : ic('🗺️','mapbar','地圖',drawerOpen());   // 地圖＝全域（各分頁都在）；桌機地圖在自己的欄、不放 header
}
function applyOvMode(){ renderTopTools(); renderOverview(); applyDesk(); }
function renderRibbon(){   // renderAll 呼叫點保留、內部走總覽（表格/矩陣）
  const ribbon=document.getElementById('ribbon');                                      // 修 bug2：任何變更後捲動歸零——存→重建→還原（垂直＋橫向、手機頁面/桌機#pg-flow/表格#ribbon 都涵蓋，取代只救 ovt-wrap 橫向的舊 OK 繃）
  const pg=document.getElementById('pg-flow');                                         // 桌機：總覽在 #pg-flow 內捲（非頁面、非 #ribbon）
  const sc=document.scrollingElement||document.documentElement;                        // 手機：頁面捲
  const pageY=sc?sc.scrollTop:0, ribY=ribbon?ribbon.scrollTop:0, pgY=pg?pg.scrollTop:0;
  const sl=[...document.querySelectorAll('#ribbon .ovt-wrap')].map(w=>w.scrollLeft);   // 表格橫向捲動（前段/後段各一）
  renderOverview();
  document.querySelectorAll('#ribbon .ovt-wrap').forEach((el,i)=>{ if(sl[i]!=null) el.scrollLeft=sl[i]; });
  if(ribbon) ribbon.scrollTop=ribY;
  if(pg) pg.scrollTop=pgY;
  if(sc) sc.scrollTop=pageY;
}
// ── 細排（Task 12）：點某天→bottom sheet；每 occurrence 獨立一列、原生 time picker、⏳待定列、住宿列 ──
function dayRowsHTML(dayId){   // 共用：某天細排各 slot 列（細看 sheet／桌機右欄細看共用）
  const seg=CNXCore.baseForDay(base,dayId)||{};
  const reco=armed?armedReco():null;   // 待命中：細排空格亮起、最近的標 🎯
  let rows='';
  SLOTS.forEach(s=>{
    if(s.kind==='stay'){
      const hp=seg.hotelPlaceId?getPlace(seg.hotelPlaceId):null;
      rows+=`<div class="erow"><div class="etl">${lodgingIcon()}住宿</div><div class="ec"><div class="stayrow">${lodgingIcon()} <span class="nm">${hp?esc(hotelName(hp)):'（'+esc(regionLabel(seg.region)||'未設')+'・待訂）'}</span><span class="chg" data-action="hotel-pick" data-day="${dayId}">${hp?'換飯店':'選飯店'}</span><span class="chg" data-action="openbase" data-day="${dayId}">改地區</span></div></div></div>`;
      return;
    }
    const isMeal=s.kind==='meal';
    const meta=slotMetaOf(dayId,s.key);
    const entries=slotSort(plan.filter(e=>e.day===dayId&&e.slot===s.key));   // 同格照 seq 排（手動順序）
    let cells='';
    if(meta&&meta.tentative) cells+=`<div class="tentrow" data-action="cleartent" data-day="${dayId}" data-slot="${s.key}">⏳ 待定中（點一下取消）</div>`;
    if(entries.length){
      // 已填→緊湊：占用列堆左欄＋右側小「＋」加第二項（密度，Vivian 回饋）。精確鐘點＝切片6，此處不放編輯鈕；已設時間唯讀顯示。
      const items=entries.map(e=>{ const p=getPlace(e.placeId); if(!p) return '';
        const tm=e.startTime?`<span class="dtime">🕑${esc(e.startTime)}</span>`:'';
        return `<div class="ditem ${isMeal?'meal':''}" data-action="occpanel" data-eid="${e.id}">${placeEmoji(p)} <span class="nm">${esc(p.name)}</span>${tm}</div>`;
      }).join('');
      cells+=`<div class="fillrow${armed?' armdrop':''}" data-day="${dayId}" data-slot="${s.key}"><div class="fillitems">${items}</div><div class="dadd-mini" data-action="pickslot" data-day="${dayId}" data-slot="${s.key}" title="再加一項">＋</div></div>`;   // data-day/slot＝拖曳放到已填列也接得住（切片 B）
    } else {
      let dc='dadd';
      if(armed){ dc+=' armdrop'; if(reco&&reco.day===dayId&&reco.slot===s.key) dc+=' armnear'; }   // 待命中空格亮起；最近格標 🎯
      cells+=`<div class="${dc}" data-action="pickslot" data-day="${dayId}" data-slot="${s.key}">＋ 加入${isMeal?s.label:''}</div>`;
    }
    const etlTxt=isMeal?(s.icon+s.label):(s.ctx||s.label);   // 非餐＝時段名（上午/午後/傍晚/晚），不再每格重複「行程」（Vivian）
    rows+=`<div class="erow"><div class="etl ${isMeal?'meal':''}">${etlTxt}</div><div class="ec">${cells}</div></div>`;
  });
  return rows;
}
// ── 細看（切片 A Phase 3）：點總覽某天 → 升起該天細排。手機＝複用 openSheet（bottom sheet＋scrim＋ESC＋關閉鈕現成）；桌機右欄＝Phase 4。
// 內容複用既有 .day-exp 細排（dayRowsHTML，與並看 mini 同源），不另造一套。標題列＝該天 N日（週幾）·區域。
function detailDayHTML(dayId){
  const d=DAYS.find(x=>x.id===dayId); if(!d) return '';
  const seg=CNXCore.baseForDay(base,dayId)||{};
  const ap=armed?getPlace(armed.placeId):null;   // 待命中：手機 bottom sheet 會蓋住底部浮起的橫幅，故 sheet 內也放一條提示＋取消
  const armHint=ap?`<div class="dt-armhint">✋ ${armed.moveEid?'移動':'排入'} ${placeEmoji(ap)} <b>${esc(ap.name)}</b>　點格放入<button data-action="arm-cancel">取消</button></div>`:'';
  const dp=d.label.split('/');   // 細流單日 header 補月份（跨月清楚，Vivian #2）
  return `<div class="dt-head"><h3>${esc(dp[0])}月${esc(dp[1]||d.label)}日（${esc(d.wd)}）</h3><span class="dt-zone">· ${esc(regionLabel(seg.region)||'—')}</span></div>${armHint}<div class="day-exp">${dayRowsHTML(dayId)}</div>`;
}
let detailDay=null;   // 桌機右欄細看：目前開哪天（afterChange 後重繪用）。手機走 sheet、不依賴它
function detailPaneHTML(dayId){ return '<button class="dt-paneclose" data-action="detail-close">關閉</button>'+detailDayHTML(dayId); }
function openDetail(dayId){
  if(!DAYS.find(x=>x.id===dayId)) return;
  detailDay=dayId;
  if(isDesktop() && ovMode()!=='table'){ document.getElementById('pg-detail').innerHTML=detailPaneHTML(dayId); document.body.classList.add('has-detail'); }   // 矩陣桌機＝右欄細看
  else openSheet(detailDayHTML(dayId), ()=>openDetail(dayId), 'detail');   // 表格模式（或手機）：sheet overlay；登記返回（任何子窗自動回這天細流）
}
function closeDetail(){ document.body.classList.remove('has-detail'); detailDay=null; }
