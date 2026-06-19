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
function renderRibbon(){   // renderAll 呼叫點保留、內部走總覽（表格/矩陣）
  const sl=[...document.querySelectorAll('#ribbon .ovt-wrap')].map(w=>w.scrollLeft);   // 表格模式：存住橫向捲動位置（前段/後段各一）
  renderOverview();
  if(sl.some(x=>x)){ const w=document.querySelectorAll('#ribbon .ovt-wrap'); w.forEach((el,i)=>{ if(sl[i]!=null) el.scrollLeft=sl[i]; }); }   // 重建後還原（修：編輯/任何變更後表格跳回最左邊）
}
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
