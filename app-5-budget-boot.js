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
  const seg=`<span class="mlseg"><span class="seg ${m.per!=='shared'?'on':''}" data-action="ml-per" data-per="person">每人</span><span class="seg ${m.per==='shared'?'on':''}" data-action="ml-per" data-per="shared">共用</span></span>`;
  let h=`<h3>${isNew?'加一筆手動花費':'編輯手動花費'}</h3><div class="sd">沒有卡片的花費（機票／計程車／簽證／SIM／每日雜支…）。份數＝同一筆重複幾次，例如每日雜支 ×10。</div>
  <div class="mlform">
    <div class="mlrow"><span class="lab">名稱</span><input id="ml_label" value="${esc(m.label||'')}" placeholder="例如 計程車／Grab"></div>
    <div class="mlrow"><span class="lab">金額</span><input id="ml_amount" inputmode="numeric" value="${m.amount!=null?m.amount:''}" placeholder="NT$">${seg}</div>
    <div class="mlrow"><span class="lab">類別</span><select id="ml_type">${categoriesList().map(c=>`<option value="${esc(c.key)}" ${c.key===(m.type||'其他')?'selected':''}>${esc(c.icon)} ${esc(c.label)}</option>`).join('')}</select></div>
    <div class="mlrow"><span class="lab">份數</span><input id="ml_qty" inputmode="numeric" value="${m.qty||1}"></div>
  </div>
  <div class="mlfoot">${isNew?'':`<span class="mlf-del" data-action="ml-del" data-id="${id}" aria-label="刪除">🗑</span>`}<span class="mlf-sp"></span><span class="mlf-cancel" data-action="close">取消</span><span class="mlf-save" data-action="ml-save" data-id="${isNew?'__new__':id}">${isNew?'新增':'儲存'}</span></div>`;
  openSheet(h); sh.dataset.mlper=m.per==='shared'?'shared':'person';
}
function afterChange(){ save(); renderAll();
  if(document.body.classList.contains('has-detail')&&detailDay){ const pd=document.getElementById('pg-detail'); if(pd) pd.innerHTML=detailPaneHTML(detailDay); }   // 桌機右欄細看：資料變動後同步重繪
  if(!isDesktop()&&detailDay&&sheetOpen()&&sh.querySelector('.dt-head')){ sh.innerHTML='<button class="sheetclose" data-action="close" aria-label="關閉">✕</button>'+detailDayHTML(detailDay); }   // 手機細看 sheet 開著→就地重繪（修 cleartent/標待定後 UI 沒反應，Vivian #3）
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
  renderLib(); renderTopTools();             // renderTopTools：split 時清掉 header 工具（改由 split 切換列出，免重複）
}
function exitSplit(){
  if(!document.body.classList.contains('split')) return;
  document.body.classList.remove('split','searching');
  document.getElementById('pg-flow').style.height='';
  if(splitState){ if(splitState.drawerWasOpen){ openDrawer(); mapPinned=splitState.wasPinned; updateDrawerUI(); } splitState=null; }
  renderTopTools();                          // 退出 split：header 工具復原
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
  try{ localStorage.setItem(TAB_KEY, pg); }catch(_){}   // 記住分頁（per-device）→ reload 不跳回總覽
  document.getElementById('pg-flow').hidden = pg!=='flow';
  document.getElementById('pg-lib').hidden = pg!=='lib';      // 桌機 #pg-lib 由 CSS 恆顯示於右欄
  document.getElementById('pg-budget').hidden = pg!=='budget';
  document.querySelectorAll('.tabbtn').forEach(x=>x.classList.toggle('active',x.dataset.pg===pg));
  renderTopTools();   // 換分頁：header 工具（粗流群組）只在粗流出現
}
function restoreTab(){   // boot：還原上次分頁（lib/budget）；flow 為預設不必動。桌機的 lib 由隨後 applyDesk 導回 flow（lib 在桌機是常駐欄、非分頁）
  const t=localStorage.getItem(TAB_KEY);
  if(t==='lib'||t==='budget') switchTab(t);
}
let lastSync='—';
function syncStatusText(s){ return s==='synced'?'已同步':s==='syncing'?'同步中…':s==='offline'?'離線（已存本機）':'—'; }
function setSyncStatus(s){ lastSync=s; const el=document.getElementById('syncStatus'); if(el) el.textContent=syncStatusText(s); }
function syncLink(){ const id=localStorage.getItem(TRIPKEY); return id?location.origin+location.pathname+'#t='+id:''; }
function copySyncLink(){ const l=syncLink(); if(!l){ toast('尚未連上雲端'); return; } navigator.clipboard.writeText(l).then(()=>toast('連結已複製')).catch(()=>toast(l)); }
function openSettings(){   // 版B Hub 清單（Vivian 2026-06-22）：分區扁平髮絲線列、每列點進專屬編輯頁（拿掉「管理分類設定」中間層）；登記 navStack 父層→子窗關閉回設定
  const tiers=['t1','t2','t3','t4'].map(k=>`<i style="background:${esc(((TRIP.tierColors||{})[k]||{}).fg||'#999')}"></i>`).join('');
  const sync = SYNC_URL ? `<div class="seclabel">共編</div><div class="sd">🔗 把連結傳給旅伴即可一起編輯。狀態：<span id="syncStatus">${syncStatusText(lastSync)}</span></div>
    <div class="setrow" data-action="copy-link"><span class="e">📋</span><span class="n">複製同步連結</span></div>` : '';
  let h=`<h3>⚙ 設定</h3><div class="sd">資料與外觀</div>
    <div class="seclabel">行程</div>
    <div class="setrow" data-action="openbase"><span class="e">${lodgingIcon()}</span><span class="n">住宿規劃</span><span class="go">›</span></div>
    <div class="seclabel">分類與外觀</div>
    ${CFG_TABS.map(([k,l])=>`<div class="setrow" data-action="open-cfg" data-tab="${k}"><span class="e">${CFG_ICON[k]||'📍'}</span><span class="n">${k==='emoji'?'常用 emoji':esc(l)}</span>${k==='tier'?`<span class="settiers">${tiers}</span>`:''}<span class="go">›</span></div>`).join('')}
    <div class="seclabel">資料</div>
    <div class="setrow" data-action="impexp"><span class="e">⤓⤒</span><span class="n">匯入／匯出</span><span class="go">›</span></div>
    <div class="setrow danger" data-action="reset"><span class="e">↺</span><span class="n">重設成初始</span></div>
    ${sync}`;
  openSheet(h, ()=>openSettings(), 'settings');
}

let cfgTab='cat';
const CFG_TABS=[['cat','類別'],['price','價位'],['region','地區'],['tier','分級'],['emoji','emoji']];   /* 順序按常用度（Vivian 2026-06-21）；菜系退役 */
const CFG_ICON={cat:'🧩',price:'💰',region:'🗺️',tier:'🎖️',emoji:'😀'};   /* 設定 hub 分類列圖示（順序＝CFG_TABS、單一真相，Vivian #4） */
function openConfig(tab){ cfgTab=tab||cfgTab; renderConfig(); }
function renderConfig(){
  const tabs=CFG_TABS.map(([k,l])=>`<span class="cfg-tab ${cfgTab===k?'on':''}" data-action="cfg-tab" data-tab="${k}">${l}</span>`).join('');
  let body = cfgTab==='cat'?cfgCatHTML() : cfgTab==='price'?cfgPriceHTML() : cfgTab==='region'?cfgRegionHTML() : cfgTab==='tier'?cfgTierHTML() : cfgEmojiHTML();
  openSheet(`<div class="cfg-head"><h3>🧩 自訂分類設定</h3><div class="cfg-tabs">${tabs}</div></div><div class="cfg-body">${body}</div>`);
  sh.classList.add('sheet-cfg');
}
function cfgCatHTML(){
  const rows=categoriesList().map((c,i)=>{
    const lock=c.role!=='normal';
    return `<div class="cfg-row" data-key="${esc(c.key)}">
      <button type="button" class="cfg-ic emojibox" data-action="open-cat-emoji" data-key="${esc(c.key)}" aria-label="選圖示">${esc(c.icon||'📍')}</button>
      <button type="button" class="cfg-sw" data-action="open-wpick" data-kind="cat" data-key="${esc(c.key)}" data-lbl="類別・${esc(c.label)}" data-cur="${esc(c.color)}" style="background:${esc(c.color)}" aria-label="改顏色"></button>
      <input class="cfg-nm" type="text" value="${esc(c.label)}" data-cfg="cat-label" data-key="${esc(c.key)}">
      ${lock?`<span class="cfg-role">${c.role==='lodging'?'住宿':'其他'}</span>`:''}
      <span class="mv" data-action="cfg-cat-up" data-key="${esc(c.key)}" ${i===0?'style="opacity:.25;pointer-events:none"':''}>↑</span>
      <span class="del ${lock?'lock':''}" ${lock?'':`data-action="cfg-cat-del" data-key="${esc(c.key)}"`}>🗑</span></div>`;
  }).join('');
  return `<div class="sd">卡片的大分類；可改圖示、顏色、名稱與順序。住宿／其他為系統類別、不可刪。</div>`+rows+`<span class="cfg-add" data-action="cfg-cat-add">＋ 新類別</span>`;
}
function findCat(k){ return (TRIP.categories||[]).find(c=>c.key===k); }
let cfgSaveT=null;
function saveCfgDebounced(){ clearTimeout(cfgSaveT); cfgSaveT=setTimeout(()=>{ save(); renderAllExceptSheet(); }, 400); }
function renderAllExceptSheet(){ updateVerBtn(); renderTopTools(); renderRibbon(); renderLib(); renderBudget(); renderMarkers(); }
function cfgRegionHTML(){
  const rows=regionsList().map((r,i)=>{
    const lock=r.key==='其他';
    return `<div class="cfg-row" data-key="${esc(r.key)}">
      <button type="button" class="cfg-sw" data-action="open-wpick" data-kind="region" data-key="${esc(r.key)}" data-lbl="地區・${esc(r.label)}" data-cur="${esc(r.color)}" style="background:${esc(r.color)}" aria-label="改顏色"></button>
      <input class="cfg-nm" type="text" value="${esc(r.label)}" data-cfg="rg-label" data-key="${esc(r.key)}">
      <span class="mv" data-action="cfg-rg-up" data-key="${esc(r.key)}" ${i===0?'style="opacity:.25;pointer-events:none"':''}>↑</span>
      <span class="del ${lock?'lock':''}" ${lock?'':`data-action="cfg-rg-del" data-key="${esc(r.key)}"`}>🗑</span></div>`;
  }).join('');
  return `<div class="sd">地區用在卡片與居住地；中心點（座標）用來算「附近」推薦，新地區暫無座標、用名稱比對。</div>`+rows+`<span class="cfg-add" data-action="cfg-rg-add">＋ 新地區</span>`;
}
function findRegion(k){ return (TRIP.regions||[]).find(r=>r.key===k); }
function cfgTierHTML(){
  const names=['T1','T2','T3','T4'];
  const rows=['t1','t2','t3','t4'].map((k,i)=>{
    const tc=(TRIP.tierColors||{})[k]||{}, fg=tc.fg||'#999';
    return `<div class="cfg-row">
      <button type="button" class="cfg-sw" data-action="open-wpick" data-kind="tier" data-key="${k}" data-lbl="分級・${names[i]}" data-cur="${esc(fg)}" style="background:${esc(fg)}" aria-label="改顏色"></button>
      <span class="cfg-nm-ro">${names[i]}</span>
      <span class="tbadge ${k}">${names[i]}</span></div>`;
  }).join('');
  return `<div class="sd">T1–T4＝卡片重要度的四色。點色塊改色（從和色庫挑）；右邊淡章底色會自動算。</div>`+rows;
}
function cfgEmojiHTML(){
  const chips=(TRIP.emojiList||[]).map((em,i)=>`<span class="emcfg">${esc(em)}<button type="button" class="emcfg-x" data-action="cfg-emoji-del" data-i="${i}" aria-label="刪除">✕</button></span>`).join('');
  return `<div class="sd">這份「常用 emoji」會出現在編輯卡選擇器最上面；打／貼一個 emoji 按加入。</div>
    <div class="emcfg-list">${chips||'<span style="color:var(--faint);font-size:13px">還沒有，加幾個吧</span>'}</div>
    <div class="row" style="margin-top:10px"><input id="cfg_emoji_in" maxlength="6" placeholder="打／貼一個 emoji" style="flex:1;min-width:0;margin:0"><span class="pill pri" data-action="cfg-emoji-add">加入</span></div>`;
}
function cfgPriceHTML(){
  const tiers=TRIP.priceBands.tiers||[];
  const rows=tiers.map((t,i)=>{
    const last=i===tiers.length-1;
    return `<div class="cfg-row" data-idx="${i}">
      <button type="button" class="cfg-sw" data-action="open-wpick" data-kind="pb" data-key="${i}" data-lbl="價位・${esc(t.label)}" data-cur="${esc(t.color)}" style="background:${esc(t.color)}" aria-label="改顏色"></button>
      <input class="cfg-nm" type="text" value="${esc(t.label)}" data-cfg="pb-label" data-idx="${i}">
      ${last?`<span class="cfg-role">以上</span>`:`<span class="cfg-upto">≤<input class="num" inputmode="numeric" value="${t.upTo!=null?t.upTo:''}" data-cfg="pb-upto" data-idx="${i}"></span>`}
      <span class="del ${tiers.length<=1?'lock':''}" ${tiers.length<=1?'':`data-action="cfg-pb-del" data-idx="${i}"`}>🗑</span></div>`;
  }).join('');
  return `<div class="sd">由卡片金額自動判斷落在哪段。每段填「上限金額（含）」，最後一段為「以上」。</div>`+rows+`<span class="cfg-add" data-action="cfg-pb-add">＋ 新一段</span>`;
}
document.addEventListener('input',e=>{
  const t=e.target.closest('[data-cfg^="cat-"]'); if(!t) return;
  const c=findCat(t.dataset.key); if(!c) return;
  if(t.dataset.cfg==='cat-label') c.label=t.value;
  saveCfgDebounced();
});
document.addEventListener('input',e=>{
  const t=e.target.closest('[data-cfg^="rg-"]'); if(!t) return;
  const r=findRegion(t.dataset.key); if(!r) return;
  if(t.dataset.cfg==='rg-label') r.label=t.value;
  saveCfgDebounced();
});
document.addEventListener('input',e=>{
  const t=e.target.closest('[data-cfg^="pb-"]'); if(!t) return;
  const i=+t.dataset.idx, tier=TRIP.priceBands.tiers[i]; if(!tier) return;
  if(t.dataset.cfg==='pb-label') tier.label=t.value;
  else if(t.dataset.cfg==='pb-upto'){ const n=parseFloat(t.value); tier.upTo=(isNaN(n)?null:n); }
  saveCfgDebounced();
});
function updateVerBtn(){ const v=av(); document.getElementById('verbtn').innerHTML='🗂️<span class="vname"> '+esc((v&&v.name)||'A 版')+'</span><span class="vcaret"> ▾</span>'; }   /* 名字/▾ 進 span：桌機顯示全名，手機 CSS 隱藏只留 🗂️（點進去看版本）*/
function renderAll(){ updateVerBtn(); renderTopTools(); renderRibbon(); renderLib(); renderBudget(); renderMarkers(); }
const deskMq=window.matchMedia('(min-width:1100px)');
function applyDesk(){
  applyDrag();                          // 桌機↔手機切換時更新 body.drag-on（桌機常開直接拖；手機改長按進拖、不鎖捲）
  renderTopTools();                     // resize：跨手機↔桌機門檻時重繪 header 工具（粗流群組/檢視鈕該不該出現）
  if(!deskMq.matches){ document.body.classList.remove('libcollapsed'); return; }   // 手機無側軌
  if(document.body.classList.contains('split')) exitSplit();                       // 並看是手機形態：resize 到桌機即退出
  if(curTab==='lib') switchTab('flow');
  if(ovMode()==='table'){ openDrawer(); document.body.classList.add('libcollapsed'); }   // 表格(v1樣)：地圖留著、庫收成軌、表格佔右側
  else { openDrawer(); document.body.classList.remove('libcollapsed'); }                    // 矩陣：v2 三欄
}
deskMq.addEventListener('change',applyDesk);
renderAll(); restoreTab(); applyDesk();   // restoreTab 在 applyDesk 前：桌機若還原到 lib，applyDesk 會導回 flow（lib 桌機是常駐欄）
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
    const svKey=(V2_ENV?'cnx-sv-v2:':'cnx-sv:')+tripId;   // 上次同步到的雲端版本（per-device、per-trip）：boot 靠它判斷雲端有沒有領先本機，避免用雲端舊資料蓋掉還沒 push 完的本機變更（bug#1 刪卡復活）
    syncCtl = CNXSync.createSyncController({
      client, tripId, getLocalDb, applyDb, mergeDb:CNXCore.mergeDb, onStatus:setSyncStatus,
      getSyncedVersion:function(){ const r=localStorage.getItem(svKey); return r==null?-1:(+r); },
      setSyncedVersion:function(v){ localStorage.setItem(svKey, String(v)); }
    });
    await syncCtl.load();                              // boot 同步：雲端領先才覆蓋、否則保留本機（見 sync.js load）
    syncCtl.startPolling();
  }catch(e){ setSyncStatus('offline'); }
}
initSync();
