/* W.I → EQM pressure import. Client-side only; nothing is changed until confirmed. */
(function(){
'use strict';
const $id=id=>document.getElementById(id);
const norm=value=>String(value??'').normalize('NFKC').toUpperCase().replace(/\([^)]*\)/g,' ').replace(/\b(?:S|SIDE)\s+(?=METAL\s+SHEET)/g,'').replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const numbers=value=>{const m=String(value??'').match(/\(([^)]*)\)/);return m?(m[1].match(/\d+/g)||[]).sort((a,b)=>+a-+b).join(','):''};
const pressure=value=>{
 const lines=String(value??'').split(/\n|\r|(?=■)/).map(v=>v.trim());
 for(const line of lines){
  if(!/(?:입력\s*공압|공압|PRESSURE|ÁP\s*LỰC|AP\s*LUC)/i.test(line))continue;
  const m=line.match(/(\d+(?:[.,]\d+)?)\s*(?:±|\+\s*\/\s*-|\+\s*-|\+\s*−)\s*(\d+(?:[.,]\d+)?)/);
  if(!m)continue;
  const unit=/kgf\s*(?:\/|／)\s*(?:㎠|cm\s*(?:\^?2|²))/i.test(line)?'kgf/㎠':/\bMPa\b/i.test(line)?'MPa':/\bbar\b/i.test(line)?'bar':null;
  if(!unit)continue;
  return 'Áp lực: '+m[1].replace('.',',')+' ± '+m[2].replace('.',',')+' '+unit;
 }
 return '';
};
const scoreMatch=(raw,station)=>{
 const a=norm(raw),b=norm(station);if(!a||!b)return 0;
 const ax=numbers(raw),bx=numbers(station);
 if(ax&&bx&&ax!==bx)return 0;
 if(a===b)return 100;
 if(a.length>10&&b.length>10&&(a.includes(b)||b.includes(a)))return 90;
 const aa=a.split(' ').filter(v=>v.length>1),bb=b.split(' ').filter(v=>v.length>1);
 if(ax&&bx&&ax===bx&&aa.includes('METAL')&&aa.includes('SHEET')&&bb.includes('METAL')&&bb.includes('SHEET'))return 88;
 if(aa.length<3||bb.length<3)return 0;
 const shared=aa.filter(v=>bb.includes(v)).length;
 return shared/Math.max(aa.length,bb.length)>=.85?85:0;
};
const cell=v=>String(v??'').trim();
const isStageHeader=t=>/^(?:APPLY\s*JIG|JIG\s*NAME|공정명|적용\s*지그|PROCESS\s*NAME|TÊN\s*CÔNG\s*ĐOẠN)/i.test(t.trim());
const isNoteHeader=t=>/^(?:비고|REMARK|NOTE|GHI\s*CHÚ|SPECIFICATION|THÔNG\s*SỐ)/i.test(t.trim());
function extract(workbook){
 const out=[];
 for(const name of workbook.SheetNames){
  const sheet=workbook.Sheets[name];if(!sheet)continue;
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
  let titleRow=-1,stageColumn=-1,noteColumn=-1;
  for(let i=0;i<Math.min(rows.length,35);i++){
   const values=rows[i]||[];const a=values.findIndex(v=>isStageHeader(cell(v))),b=values.findIndex(v=>isNoteHeader(cell(v)));
   if(a>=0&&b>=0){titleRow=i;stageColumn=a;noteColumn=b;break}
  }
  for(let i=Math.max(0,titleRow+1);i<rows.length;i++){
   const row=rows[i]||[];const indexed=titleRow>=0?pressure(row[noteColumn]):'';
   const found=indexed||row.map(pressure).find(Boolean);
   if(!found)continue;
   let stationName=titleRow>=0?cell(row[stageColumn]):'';
   if(!stationName){
    const strings=row.map(cell).filter(v=>/[A-Z]{3}/i.test(v)&&!/\bKgf\b|공압|PRESSURE/i.test(v));
    stationName=strings.find(v=>/SHEET|ATTACH|WELD|PRESS|JIG|ASSY|LASER|TEST|DINO|VISION/i.test(v))||'';
   }
   if(!stationName)continue;
   out.push({sheet:name,row:i+1,stationName,spec:found});
  }
 }
 return out;
}
function proposals(rows,stations){
 const list=[];
 for(const item of rows){
  const hits=stations.map(station=>({station,score:scoreMatch(item.stationName,station.name)})).filter(x=>x.score>=85).sort((a,b)=>b.score-a.score);
  let status='unmatched',station=null,jig=null;
  if(hits.length===1||(hits.length&&hits[0].score>hits[1]?.score)){station=hits[0].station;const jigs=getJigs(station).filter(Boolean);if(jigs.length===1){status='ready';jig=jigs[0]}else if(jigs.length>1){status='select-jig'}else status='no-jig'}
  else if(hits.length)status='ambiguous';
  list.push({...item,status,station,jig,candidates:hits.map(x=>x.station)});
 }
 const duplicates=new Map();for(const p of list)if(p.station){const key=p.station.id;duplicates.set(key,(duplicates.get(key)||0)+1)}
 for(const p of list)if(p.station&&duplicates.get(p.station.id)>1){p.status='duplicate';p.jig=null}
 return list;
}
function enc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
let pending=null;
function mayApply(){
 return typeof canEditEquipment==='function'&&canEditEquipment();
}
function renderPreview(){
 const box=$id('wiSpecPreviewBody');if(!box||!pending)return;
 const {items}=pending;
 const stats={ready:0,review:0};items.forEach(p=>p.status==='ready'?stats.ready++:stats.review++);
 $id('wiSpecPreviewSummary').textContent=`${pending.filename} · ${items.length} dòng áp lực · ${stats.ready} khớp · ${stats.review} cần rà soát`;
 box.innerHTML=items.map((p,i)=>{
  let choice='';
  if(p.status==='select-jig'&&p.station){const opts=getJigs(p.station).map((j,k)=>`<option value="${k}">${enc(j.name||j.eqType||'Jig '+(k+1))}</option>`).join('');choice=`<select data-jig-choice="${i}"><option value="">Chọn Jig phù hợp…</option>${opts}</select>`}
  const label={ready:'Sẵn sàng',unmatched:'Không khớp',ambiguous:'Trùng công đoạn',duplicate:'Trùng dữ liệu W.I', 'select-jig':'Chọn Jig','no-jig':'Chưa khai báo Jig'}[p.status];
  return `<tr><td>${enc(p.sheet)} · ${p.row}</td><td>${enc(p.stationName)}</td><td>${enc(p.station?.name||'—')}</td><td>${enc(p.spec)}</td><td>${choice||enc(p.jig?.name||label)}</td><td>${enc(label)}</td></tr>`;
 }).join('');
 box.querySelectorAll('select[data-jig-choice]').forEach(select=>select.onchange=()=>{
  const p=items[Number(select.dataset.jigChoice)],idx=Number(select.value);
  if(select.value!==''&&Number.isInteger(idx)){p.jig=getJigs(p.station)[idx];p.status='ready'}else{p.jig=null;p.status='select-jig'}
  renderPreview();
 });
 $id('wiSpecApply').disabled=!(mayApply()&&items.some(p=>p.status==='ready'));
 $id('wiSpecApply').title=$id('wiSpecApply').disabled?'Viewer chỉ xem/đối chiếu; hãy chuyển sang Sửa Thiết bị & Jig để cập nhật.':'';
}
async function chooseExcel(file){
 if(!file)return;
 if(!window.XLSX){alert('Chưa tải được bộ đọc Excel.');return}
 try{
  const current=model(),key=(current._remote?.versionId||current.name+'::'+current.version);
  const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});
  const extracted=extract(workbook);
  if(!extracted.length){alert('Đã đọc Process Map nhưng chưa tìm thấy thông số áp lực gắn với công đoạn.');return}
  const items=proposals(extracted,current.processes||[]);
  pending={key,filename:file.name,items};
  renderPreview();$id('wiSpecPreviewDialog').showModal();
 }catch(error){alert('Không đọc được Excel W.I: '+error.message)}
}
function apply(){
 if(!pending)return;
 const current=model(),key=current._remote?.versionId||current.name+'::'+current.version;
 if(key!==pending.key){alert('Model/Version đã thay đổi. Hãy tải lại W.I.');return}
 if(!mayApply()){alert('Chỉ chế độ Sửa Thiết bị & Jig mới được xác nhận cập nhật. Viewer có thể tải Process Map lên để xem và đối chiếu.');return}
 const ready=pending.items.filter(p=>p.status==='ready'&&p.station&&p.jig);
 if(!ready.length)return;
 const count=ready.filter(p=>p.jig.spec!==p.spec).length;
 if(!count){$id('wiSpecPreviewDialog').close();return}
 if(!confirm(`Cập nhật thông số áp lực cho ${count} Jig trên ${current.name} · ${current.version}? Thông số cũ của những Jig này sẽ được thay thế.`))return;
 snapshot();
 for(const p of ready)p.jig.spec=p.spec;
 renderAll();scheduleSave();
 $id('wiSpecPreviewDialog').close();pending=null;
 alert('Đã cập nhật '+count+' thông số Jig. Hãy kiểm tra cột Thông số setup và nhấn Lưu thiết bị để xác nhận.');
}
function downloadEquipmentTemplate(){
 if(!window.XLSX){alert('Chưa tải được bộ đọc Excel.');return}
 const data=[['Tên công đoạn','Loại thiết bị','Tên thiết bị','Thông số setup','Version','Setup (phút)','Ghi chú'],['METAL SHEET (15,16,17,18)','ATTACH','SIDE METAL SHEET ATTACH','Áp lực: 5,5 ± 0,5 kgf/㎠','','','']];
 const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(data);
 sheet['!cols']=[{wch:40},{wch:18},{wch:38},{wch:35},{wch:18},{wch:18},{wch:26}];
 XLSX.utils.book_append_sheet(book,sheet,'Thiết bị & Jig');
 XLSX.writeFile(book,'Mau_Excel_Thiet_bi_Jig.xlsx');
}
function init(){
 const btn=$id('wiSpecImportBtn'),file=$id('wiSpecFile'),dlg=$id('wiSpecPreviewDialog');
 if(!btn||!file||!dlg)return;
 btn.onclick=()=>file.click();
 file.onchange=()=>{const f=file.files?.[0];file.value='';chooseExcel(f)};
 const template=$id('jigXlsxTemplateBtn'),processUpload=$id('jigXlsxImportBtn'),processFile=$id('jigXlsxFile');
 if(template)template.onclick=downloadEquipmentTemplate;
 if(processUpload&&processFile){
  processUpload.onclick=()=>processFile.click();
  processFile.onchange=()=>{const f=processFile.files?.[0];processFile.value='';chooseExcel(f)};
 }
 $id('wiSpecCancel').onclick=()=>dlg.close();
 $id('wiSpecApply').onclick=apply;
 const sync=()=>{
  const allowed=typeof canEditEquipment==='function'&&canEditEquipment();
  btn.hidden=!allowed;
 };
 sync();new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
globalThis.ISTWiSpecSync={extract,pressure,scoreMatch,proposals};
})();
