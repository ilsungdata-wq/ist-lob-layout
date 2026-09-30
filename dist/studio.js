let activeView='overview',layoutScale=1,historyOffset=0,historyModel='',historyRows=[];
const STUDIO={width:2060,origin:40,scale:60,beltY:250,beltHeight:70};
function modelType(){return model().type||(/block/i.test(model().name)?'block':'normal')}
function physicalObjects(){
  const objects=[],occupied=[];
  for(const [index,s] of model().processes.entries()){
    const rawLane=Math.max(0,Math.round(((+s.y||60)-60)/94));let x=Math.max(60,Math.min(1950,40+(+s.x||0))),y=rawLane===0?140:370+(rawLane-1)*140;
    while(occupied.some(p=>Math.abs(p.x-x)<76&&Math.abs(p.y-y)<116)){x+=78;if(x>1950){x=60;y+=140}}
    occupied.push({x,y});const positionOnly=positionUsage([s]).positionOnly>0,jigs=getJigs(s);
    const add=(key,kind,bx,by,width,height,extra={})=>{const saved=s.layoutObjects?.[key];objects.push({station:s,index,key,kind,x:Math.max(40,Math.min(2020-width,Number(saved?.x??bx)||40)),y:Math.max(40,Number(saved?.y??by)||40),width,height,...extra})};
    add(positionOnly?'machine':'table',positionOnly?'machine':'table',x,y,48,30,{label:(norm(s.name).match(/\b(DMC|WLT|VSWR)\b/)||[s.auto?'AUTO':''])[0]});
    const base=objects.at(-1);
    if(s.auto&&!positionOnly)add('machine','machine',base.x,base.y-46,44,30,{label:'AUTO'});
    if(+s.mp>0)add('person','person',base.x-26,base.y,22,28,{label:String(s.mp)});
    let pressCount=0,attachCount=0;
    jigs.forEach((j,n)=>{j.id=j.id||'legacy-'+n;const type=jigType(j),press=type==='press';add('jig:'+j.id,type,press?base.x+(pressCount++%3)*19:base.x+3+(attachCount++%3)*14,press?base.y-40-Math.floor((pressCount-1)/3)*34:base.y+3+Math.floor((attachCount-1)/3)*13,press?16:12,press?30:12,{jig:j,label:press?'V3':type==='attach'?'A':'T'})});
  }
  return objects;
}
function glyph(o){
  if(o.kind==='person')return `<path d="M17 3C5-3-4 8 2 20C5 26 13 27 18 21L15 17C8 22 3 10 11 8L17 10Z" fill="#0bbdea" stroke="#145e70" stroke-width="1.4"/><circle cx="18" cy="5" r="4" fill="#58d4ed" stroke="#145e70"/><text x="11" y="40" text-anchor="middle" font-size="11">${o.label} MP</text>`;
  if(o.kind==='table')return '<rect width="48" height="30" fill="#fbf7e8" stroke="#5d6d68" stroke-width="2"/><path d="M4 30v5M44 30v5" stroke="#5d6d68" stroke-width="2"/>';
  if(o.kind==='machine')return `<rect width="${o.width}" height="30" fill="#bfe5ec" stroke="#144a5c" stroke-width="2"/><rect x="4" y="3" width="${o.width-8}" height="8" fill="#fff" stroke="#144a5c"/><text x="${o.width/2}" y="24" font-size="10" text-anchor="middle" font-weight="bold">${esc(o.label)}</text>`;
  const press=o.kind==='press';return `<rect width="${o.width}" height="${o.height}" fill="${press?'#f6c6a3':o.kind==='attach'?'#c1efaa':'#d6e6f5'}" stroke="#5a5a44"/><path d="M2 3H${o.width-2}M2 ${o.height-3}H${o.width-2}" stroke="#7c8172"/><text x="${o.width/2}" y="${press?18:9}" font-size="${press?9:8}" text-anchor="middle" font-weight="bold">${o.label}</text>`;
}
function renderEquipmentDiagram(){
  const objects=physicalObjects(),height=Math.max(650,...objects.map(o=>o.y+130)),width=STUDIO.width;
  let marks='';for(let meter=0;meter<=33;meter++){const x=40+meter*60;marks+=`<line x1="${x}" y1="30" x2="${x}" y2="${height-15}" stroke="#e6eeeb"/><text x="${x}" y="20" font-size="11" text-anchor="middle">${meter}m</text>`}
  const belt=`<rect x="40" y="250" width="1620" height="70" fill="#00ad51" stroke="#1b793f"/><rect x="40" y="274" width="1620" height="23" fill="#c0eec7"/><text x="850" y="289" text-anchor="middle" font-size="13" fill="#164d31">BĂNG TẢI 27 m</text><rect x="1660" y="40" width="360" height="${height-55}" fill="#f4f8e8" fill-opacity=".5" stroke="#bdcbb2" stroke-dasharray="5 5"/><text x="1840" y="65" text-anchor="middle" font-size="12">KHU VỰC SẢN XUẤT · 27–33 m</text>`;
  const labels=objects.filter(o=>o.kind==='table'||(o.kind==='machine'&&positionUsage([o.station]).positionOnly)).map(o=>`<g data-station="${esc(o.station.id)}" class="object-label"><text x="${o.x+24}" y="${o.y+58}" text-anchor="middle" font-size="12" font-weight="bold">${o.index+1}${o.station.critical?' ★':''}</text><text x="${o.x+24}" y="${o.y+73}" text-anchor="middle" font-size="10">${esc(o.station.name.slice(0,15))}${o.station.name.length>15?'…':''}</text>${stationSkills(o.station).length?`<text x="${o.x+24}" y="${o.y+88}" text-anchor="middle" font-size="9" fill="#0d7156">ĐKN ${skillLabel(o.station)}</text>`:''}</g>`).join('');
  const graphics=objects.map((o,n)=>`<g class="layout-object" data-object="${n}" tabindex="0" role="button" aria-label="${esc((o.index+1)+'. '+o.station.name+' · '+o.kind)}" transform="translate(${o.x} ${o.y})"><title>${esc(o.station.name+' · '+(o.jig?.name||o.kind))}</title>${o.station.id===selectedId?`<rect x="-3" y="-3" width="${o.width+6}" height="${o.height+6}" fill="none" stroke="#e29121" stroke-width="2"/>`:''}${glyph(o)}</g>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Layout ${esc(model().name)} · vùng sản xuất 33 m"><rect x="40" y="30" width="1980" height="${height-45}" fill="#fff" stroke="#79988b"/>${marks}${belt}${graphics}${labels}</svg>`;
  $('equipmentDiagram').innerHTML=svg;applyLayoutZoom();
  $('equipmentDiagram').querySelectorAll('.layout-object').forEach(el=>{const o=objects[+el.dataset.object];el.onclick=()=>{if(el.dataset.dragged==='1'){el.dataset.dragged='0';return}select(o.station.id)};el.onkeydown=e=>{if(e.key==='Enter'){select(o.station.id)}};if(canEdit())el.onpointerdown=e=>dragObject(e,o,objects)});
  $('equipmentDiagram').querySelectorAll('.object-label').forEach(el=>el.onclick=()=>select(el.dataset.station));
}
function applyLayoutZoom(){const svg=$('equipmentDiagram').querySelector('svg');if(!svg)return;const value=$('layoutZoom').value;layoutScale=value==='fit'?Math.max(.15,($('equipmentDiagram').clientWidth-16)/STUDIO.width):Number(value)||1;svg.style.width=STUDIO.width*layoutScale+'px';svg.style.height=Number(svg.getAttribute('viewBox').split(' ')[3])*layoutScale+'px'}
function dragObject(e,o,objects){
  if(e.button!==0)return;e.preventDefault();const el=e.currentTarget,svg=el.ownerSVGElement,point=()=>svg.createSVGPoint();
  const local=ev=>{const p=point();p.x=ev.clientX;p.y=ev.clientY;return p.matrixTransform(svg.getScreenCTM().inverse())};
  const initial=local(e);let moved=false,newX=o.x,newY=o.y;el.setPointerCapture(e.pointerId);
  el.onpointermove=ev=>{const p=local(ev);if(!moved&&Math.hypot(p.x-initial.x,p.y-initial.y)<3)return;if(!moved){snapshot();moved=true}newX=Math.max(40,Math.min(2020-o.width,Math.round((o.x+p.x-initial.x)/3)*3));newY=Math.max(40,Math.min(svg.viewBox.baseVal.height-120,Math.round((o.y+p.y-initial.y)/3)*3));el.setAttribute('transform',`translate(${newX} ${newY})`)};
  const done=()=>{el.onpointermove=null;el.onpointerup=null;el.onpointercancel=null;if(!moved)return;const s=o.station;s.layoutObjects=s.layoutObjects||{};s.layoutObjects[o.key]={x:newX,y:newY};if(o.kind==='table'){for(const a of objects.filter(a=>a.station===s&&['attach','tool'].includes(a.kind)))s.layoutObjects[a.key]={x:Math.max(40,Math.min(2020-a.width,a.x+newX-o.x)),y:Math.max(40,a.y+newY-o.y)}}selectedId=s.id;el.dataset.dragged='1';renderEquipmentDiagram();renderInspector();scheduleSave();toast('Đã đổi vị trí '+(o.kind==='person'?'người':o.kind==='table'?'bàn':'thiết bị'))};el.onpointerup=done;el.onpointercancel=done;
}
function renderJigInventory(){
  if(!$('jigInventoryBody'))return;const records=model().processes.flatMap((s,i)=>getJigs(s).map(j=>({s,i,j}))),setup=records.reduce((n,r)=>n+(+r.j.setup||0),0);
  $('jigViewTitle').textContent=`Jig · ${model().name} · ${model().version==='Imported'?'Bản gốc':model().version}`;
  $('jigInventorySummary').innerHTML=`<b>${records.length} Jig / Tool</b><span>Press: ${records.filter(r=>jigType(r.j)==='press').length}</span><span>Attach: ${records.filter(r=>jigType(r.j)==='attach').length}</span><span>Tool: ${records.filter(r=>jigType(r.j)==='tool').length}</span><span>Setup: ${setup.toFixed(1)} phút</span>`;
  $('jigInventoryBody').innerHTML=records.length?records.map(({s,i,j},n)=>`<tr><td>${n+1}</td><td>${i+1}</td><td>${esc(s.name)}</td><td>${{press:'Jig Press · V3',attach:'Jig Attach',tool:'Tool'}[jigType(j)]}</td><td>${esc(j.name||'Chưa đặt tên')}</td><td>${+j.setup||'Chưa đo'}</td></tr>`).join(''):'<tr><td colspan="6">Chưa khai báo Jig cho model này.</td></tr>';
}
function renderCategories(s){const categories=[...new Set(['DÁN & ÉP',...(model().categories||[]),...model().processes.map(p=>p.category).filter(Boolean)])];$('categoryInput').innerHTML=categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');$('categoryInput').value=s.category}
function renderFlags(s){const tags=[...new Set([...(model().tagCatalog||[]),...model().processes.flatMap(p=>p.tags||[])])];$('flagOptions').innerHTML=tags.map(t=>`<label><input type="checkbox" value="${esc(t)}" ${(s.tags||[]).includes(t)?'checked':''} ${canEdit()?'':'disabled'}><span>${esc(t)}</span></label>`).join('')||'<small>Thêm nhãn để phân loại vị trí theo nhu cầu.</small>'}
function renderStudio(){
  $('lineMeta').value=Number(model().line)||1;$('typeMeta').value=modelType();$('lineMeta').disabled=$('typeMeta').disabled=!canEdit();renderLobChart();renderJigInventory();
  const rows=model().processes;let summary=$('layoutSummary');if(!summary){summary=document.createElement('div');summary.id='layoutSummary';summary.className='layout-summary';$('equipmentDiagram').before(summary)}
  summary.innerHTML=`<b>${rows.length} vị trí</b><span>${positionUsage().tables} bàn</span><span>${rows.filter(s=>s.auto).length} máy auto</span><span>${rows.filter(s=>s.critical).length} vị trí trọng điểm</span><span>${rows.filter(s=>stationSkills(s).length).length} vị trí ĐKN</span>`+[...(model().tagCatalog||[])].map(t=>`<span>${esc(t)}: ${rows.filter(s=>(s.tags||[]).includes(t)).length}</span>`).join('');
  $('layoutCapacityNote').textContent='Vùng sản xuất: 33 m · Băng tải: 27 m · Bàn: 0,8 × 0,5 m · Khoảng cách tham chiếu: 0,5 m · Tọa độ ngang tính từ đầu vùng sản xuất';
}
function switchView(view){activeView=view;document.body.dataset.view=view;$('overviewView').hidden=view!=='overview';$('processView').hidden=view!=='processes';$('jigView').hidden=view!=='jigs';document.querySelectorAll('.view-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('printBtn').textContent=view==='jigs'?'In danh sách Jig':view==='processes'?'In LOB':'In layout & setup';if(view==='jigs')renderJigInventory();if(view==='processes')renderLobChart();if(view==='overview')applyLayoutZoom()}
function printCurrentView(){
  renderStudio();const m=model(),report=$('printReport'),meta=`<h1>${esc(m.name)} · ${esc(m.version==='Imported'?'Bản gốc':m.version)}</h1><p>Line ${esc(Number(m.line)||1)} · Type ${esc(modelType())} · Vùng sản xuất 33 m · Băng tải 27 m · Bàn 0,8 × 0,5 m</p>`;
  let content=meta;
  if(activeView==='jigs'){content+='<h2>Danh sách Jig & setup</h2>'+$('jigInventorySummary').outerHTML+$('jigInventoryBody').closest('table').outerHTML}
  else if(activeView==='processes'){content+=$('lob-analysis')?.outerHTML||document.querySelector('.lob-analysis').outerHTML;content+=$('processTableBody').closest('table').outerHTML}
  else{
    const objects=physicalObjects(),byStation=new Map();objects.forEach(o=>{if(!byStation.has(o.station.id))byStation.set(o.station.id,[]);byStation.get(o.station.id).push(o)});
    content+=$('layoutSummary').outerHTML+'<p>V3 = Jig Press · A = Jig Attach · T = Tool · ★ = Trọng điểm · ĐKN = Đa kỹ năng. Số trên sơ đồ đối chiếu bảng setup.</p>'+$('equipmentDiagram').innerHTML;
    content+='<h2 class="page-break">Bảng setup công đoạn</h2><table><thead><tr><th>STT</th><th>Công đoạn</th><th>MP</th><th>Thiết bị / vị trí (m)</th><th>ĐKN / trọng điểm</th><th>Jig / setup</th></tr></thead><tbody>'+m.processes.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(s.name)}</td><td>${s.auto?'AUTO · ':''}${s.mp}</td><td>${(byStation.get(s.id)||[]).map(o=>`${{person:'Người',table:'Bàn',machine:'Máy',press:'V3',attach:'Attach',tool:'Tool'}[o.kind]}: x ${((o.x-40)/60).toFixed(2)}, y ${((o.y-30)/60).toFixed(2)}`).join('<br>')}</td><td>${s.critical?'★ Trọng điểm<br>':''}${skillLabel(s)}${(s.tags||[]).map(t=>'<br>'+esc(t)).join('')}</td><td>${getJigs(s).map(j=>`${esc(j.name||jigType(j))} (${jigType(j)}) · ${+j.setup?j.setup+' phút':'chưa đo'}`).join('<br>')||'—'}</td></tr>`).join('')+'</tbody></table><p>Tọa độ x/y tính theo mét, gốc ở góc trên trái vùng sản xuất. Bản in thu nhỏ; dùng tọa độ và kích thước ghi trên bản để setup.</p>';
    content+='<h2>Nhân lực</h2>'+$('workforceBody').closest('table').outerHTML;
  }
  report.innerHTML=content;window.print();
}
async function loadHistory(reset=true){
  if(reset){historyOffset=0;historyRows=[];historyModel=model().name;$('historyList').innerHTML='Đang tải lịch sử…'}
  try{const result=await request('/api/history?model='+encodeURIComponent(historyModel)+'&offset='+historyOffset);historyRows.push(...result.rows);historyOffset+=result.rows.length;$('moreHistoryBtn').hidden=!result.hasMore;$('historyList').innerHTML=historyRows.length?historyRows.map((r,i)=>`<article class="history-item"><b>${esc(r.version)}</b><small>${esc(r.created_at)} UTC · ${esc(r.note||'Tự động lưu')}</small><button class="btn" data-history="${i}">Xem bản lưu</button></article>`).join(''):'Chưa có lịch sử. Lần lưu tiếp theo sẽ được ghi nhận.';$('historyList').querySelectorAll('[data-history]').forEach(b=>b.onclick=()=>previewHistory(historyRows[+b.dataset.history]));}catch(error){$('historyList').textContent=error.message}
}
async function previewHistory(row){const result=await request('/api/history?id='+encodeURIComponent(row.id));const data=result.data;const container=$('historyList');container.innerHTML=`<button id="backHistoryBtn" class="btn">Về danh sách</button><h3>${esc(data.name)} · ${esc(data.version)}</h3><p>${data.processes.length} công đoạn · ${data.processes.flatMap(s=>getJigs(s)).length} Jig</p><p>${esc(data.note||'')}</p><div>${data.processes.map((s,i)=>`<p>${i+1}. ${esc(s.name)} · MP ${s.mp} · ${s.time}s</p>`).join('')}</div>${canEdit()?'<button id="restoreHistoryBtn" class="btn primary">Khôi phục thành phiên bản mới</button>':''}`;$('backHistoryBtn').onclick=()=>loadHistory(true);if(canEdit())$('restoreHistoryBtn').onclick=async()=>{try{await saveCurrent();snapshot();const copy=structuredClone(data);copy.version='Khôi phục '+new Date().toISOString();copy.note='Khôi phục từ '+data.version;currentKey=copy.name+'::'+copy.version;state.models[currentKey]=copy;copy.isLatest=true;await saveCurrent();$('historyDialog').close();renderAll();toast('Đã khôi phục; bản cũ vẫn nằm trong lịch sử')}catch(error){toast(error.message)}}}
function initStudio(){
  $('layoutZoom').onchange=applyLayoutZoom;$('printJigsBtn').onclick=()=>{switchView('jigs');printCurrentView()};
  $('saveMetaBtn').onclick=()=>{if(!canEdit())return;const line=Number($('lineMeta').value);if(!Number.isInteger(line)||line<1)return toast('Line phải là số nguyên từ 1.');snapshot();model().line=line;model().type=$('typeMeta').value;renderAll();scheduleSave()};
  $('addCategoryBtn').onclick=()=>{if(!canEdit())return;const name=window.prompt('Tên danh mục công đoạn mới:')?.trim();if(!name)return;snapshot();model().categories=[...new Set([...(model().categories||[]),name])];const s=model().processes.find(s=>s.id===selectedId);s.category=name;renderCategories(s);scheduleSave()};
  $('addFlagBtn').onclick=()=>{if(!canEdit())return;const name=window.prompt('Tên nhãn vị trí mới:')?.trim();if(!name)return;snapshot();model().tagCatalog=[...new Set([...(model().tagCatalog||[]),name])];const s=model().processes.find(s=>s.id===selectedId);s.tags=[...new Set([...(s.tags||[]),name])];renderFlags(s);renderStudio();scheduleSave()};
  $('historyBtn').onclick=()=>{$('historyDialog').showModal();loadHistory(true)};$('closeHistoryBtn').onclick=()=>$('historyDialog').close();$('moreHistoryBtn').onclick=()=>loadHistory(false);
  window.addEventListener('resize',()=>{if($('layoutZoom').value==='fit')applyLayoutZoom()});
}
function layoutPositions(rows){
  const positions=new Map(),occupied=[];
  for(const s of rows){let x=Math.max(0,Number(s.x)||0),y=Math.max(40,Number(s.y)||60);
    while(occupied.some(p=>Math.abs(p.x-x)<78&&Math.abs(p.y-y)<90))x+=78;
    const point={x,y};positions.set(s.id,point);occupied.push(point);
  }
  return positions;
}
function renderLobChart(){
  const rows=model().processes,m=metrics(),measured=rows.filter(s=>Number(s.time)>0),missing=rows.length-measured.length;
  $('chartModel').textContent=model().name;
  $('chartDataNote').textContent=missing?`${missing}/${rows.length} công đoạn chưa có T/T. Chỉ số hiện tại là tạm tính; màu xám: chưa đo.`:'T/T theo số thứ tự công đoạn · Đỏ: neck time · Xanh: các công đoạn còn lại.';
  const step=52,w=Math.max(780,rows.length*step+80),h=292,left=48,top=26,bottom=246,range=Math.max(1,Math.ceil(m.neck*1.12)),barWidth=28;
  let parts=[];
  for(let i=0;i<=4;i++){const value=range*i/4,y=bottom-(bottom-top)*i/4;parts.push(`<line x1="${left}" x2="${w-12}" y1="${y}" y2="${y}" stroke="#dce5e8"/><text x="${left-8}" y="${y+4}" text-anchor="end" fill="#6c8089" font-size="11">${value.toFixed(1)}</text>`)}
  rows.forEach((s,i)=>{const time=Math.max(0,+s.time||0),bh=(bottom-top)*time/range,x=left+14+i*step,y=bottom-bh,isNeck=m.neck>0&&time===m.neck;
    parts.push(`<g class="lob-bar" data-id="${esc(s.id)}" tabindex="0" role="button" aria-label="${esc((i+1)+'. '+s.name+': '+(time?time+' giây':'chưa có T/T'))}"><title>${esc(s.name)} · ${time?time.toFixed(2)+' giây':'Chưa có T/T'}</title><rect x="${x-5}" y="${top}" width="${step-4}" height="${bottom-top+30}" fill="transparent"/><rect x="${x}" y="${time?y:bottom-3}" width="${barWidth}" height="${time?bh:3}" fill="${!time?'#b1bfc4':isNeck?'#ed352d':'#1b6986'}"/><text x="${x+barWidth/2}" y="${time?y-6:bottom-8}" text-anchor="middle" fill="#34505b" font-size="10">${time?time.toFixed(2):'—'}</text><text x="${x+barWidth/2}" y="${bottom+19}" text-anchor="middle" font-size="11">${i+1}</text></g>`);
  });
  $('lobChart').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="Biểu đồ thời gian công đoạn từ 1 đến ${rows.length}"><text x="8" y="15" font-size="11">Giây</text>${parts.join('')}</svg>`;
  const avg=rows.length?m.sum/rows.length:0,min=measured.length?Math.min(...measured.map(s=>+s.time)):0;
  const stats=[['Model',model().name],['LOB',measured.length?(m.lob*100).toFixed(1)+'%':'—'],['Tổng thời gian',measured.length?m.sum.toFixed(2)+' s':'—'],['Công đoạn',rows.length],['Neck time',m.neck?m.neck.toFixed(2)+' s':'—'],['Trung bình',measured.length?avg.toFixed(2)+' s':'—'],['T/T nhỏ nhất đã đo',min?min.toFixed(2)+' s':'—'],['UPH',m.uph?m.uph.toFixed(0):'—'],['MP',m.mp]];
  $('lobStats').innerHTML='<table>'+stats.map(([label,value])=>`<tr><th>${label}</th><td>${esc(value)}</td></tr>`).join('')+'</table>';
  $('lobChart').querySelectorAll('.lob-bar').forEach(el=>{const activate=()=>{selectedId=el.dataset.id;renderProcessTable();const row=[...$('processTableBody').querySelectorAll('tr')].find(r=>r.dataset.id===selectedId);row?.classList.add('chart-selected');row?.scrollIntoView({block:'nearest',behavior:'smooth'})};el.onclick=activate;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate()}}});
}

