/* W.I → EQM pressure import. Client-side only; nothing is changed until confirmed. */
(function(){
'use strict';
const $id=id=>document.getElementById(id);
const norm=value=>String(value??'').normalize('NFKC').toUpperCase().replace(/\([^)]*\)/g,' ').replace(/\b(?:S|SIDE)\s+(?=METAL\s+SHEET)/g,'').replace(/\b\d+\s*P\b/g,'').replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const numbers=value=>{const m=String(value??'').match(/\(([^)]*)\)/);return m?(m[1].match(/\d+/g)||[]).sort((a,b)=>+a-+b).join(','):''};
const pressure=value=>{
 const lines=String(value??'').split(/\n|\r|(?=■)/).map(v=>v.trim());
 for(const line of lines){
  if(!/(?:입력\s*공압|공압|압착력|압력|PRESSURE|ÁP\s*LỰC|AP\s*LUC)/i.test(line))continue;
  const m=line.match(/(\d+(?:[.,]\d+)?)\s*(?:(±|\+\s*\/\s*-|\+\s*-|\+\s*−|\+)\s*(\d+(?:[.,]\d+)?))?\s*(kgf\s*(?:\/|／)\s*(?:㎠|cm\s*(?:\^?2|²))|MPa\b|bar\b)/i);
  if(!m)continue;
  const unit=/^kgf/i.test(m[4])?'kgf/㎠':/^mpa/i.test(m[4])?'MPa':'bar';
  const tolerance=m[2]?' '+(m[2].trim()==='+'?'+':'±')+' '+m[3].replace('.',','):'';
  return 'Áp lực: '+m[1].replace('.',',')+tolerance+' '+unit;
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
  if(workbook.Workbook?.Sheets?.find(s=>s.name===name)?.Hidden)continue;
  const sheet=workbook.Sheets[name];if(!sheet)continue;
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
  let titleRow=-1,stageColumn=-1,noteColumn=-1,jigColumn=-1;
  for(let i=0;i<Math.min(rows.length,35);i++){
   const values=rows[i]||[];const a=values.findIndex(v=>isStageHeader(cell(v))),b=values.findIndex(v=>isNoteHeader(cell(v)));
   if(a>=0&&b>=0){titleRow=i;stageColumn=a;noteColumn=b;jigColumn=values.findIndex(v=>/^(?:APPLY\s*JIG|JIG\s*NAME|적용\s*지그)/i.test(cell(v)));break}
  }
  for(let i=Math.max(0,titleRow+1);i<rows.length;i++){
   const row=rows[i]||[];const indexed=titleRow>=0?pressure(row[noteColumn]):'';
   const found=indexed||row.map(pressure).find(Boolean);
   if(!found)continue;
   let stationName=titleRow>=0?(jigColumn>=0?cell(row[jigColumn]):'')||cell(row[stageColumn]):'';
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
  let status='unmatched',station=null,jig=null,newJig;
  if(hits.length===1||(hits.length&&hits[0].score>hits[1]?.score)){station=hits[0].station;const jigs=getJigs(station).filter(Boolean);if(jigs.length===1){status='ready';jig=jigs[0]}else if(jigs.length>1){status='select-jig'}else {status='ready';newJig=item.stationName}}
  else if(hits.length)status='ambiguous';
  list.push({...item,status,station,jig,...(newJig?{newJig}:{}),candidates:hits.map(x=>x.station)});
 }
 const duplicates=new Map();for(const p of list)if(p.station){const key=p.station.id;duplicates.set(key,(duplicates.get(key)||0)+1)}
 for(const p of list)if(p.station&&duplicates.get(p.station.id)>1){p.status='duplicate';p.jig=null}
 return list;
}
function enc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
let pending=null;
function mayStartEditing(){return typeof editableVersion==='function'&&editableVersion()&&typeof can==='function'&&(can('equipment.edit')||can('jig.edit'))}
function mayApply(){
 return typeof canEditEquipment==='function'&&canEditEquipment();
}
function renderPreview(){
 const box=$id('wiSpecPreviewBody');if(!box||!pending)return;
 const {items,stations}=pending;
 const stats={ready:0,review:0};items.forEach(p=>p.status==='ready'?stats.ready++:stats.review++);
 $id('wiSpecPreviewSummary').textContent=`${pending.filename} · ${items.length} dòng áp lực · ${stats.ready} khớp · ${stats.review} cần rà soát`;
 box.innerHTML=items.map((p,i)=>{
  let choice='';
  if(p.station&&getJigs(p.station).length>1){const opts=getJigs(p.station).map((j,k)=>`<option value="${k}" ${j===p.jig?'selected':''}>${enc(j.name||j.eqType||'Jig '+(k+1))}</option>`).join('');choice=`<select data-jig-choice="${i}"><option value="">Chọn Jig phù hợp…</option>${opts}</select>`}
  if(p.status==='no-jig'||p.newJig!==undefined)choice=`<input data-new-jig="${i}" aria-label="Tên Jig mới" placeholder="Nhập tên Jig để tạo" value="${enc(p.newJig||'')}">`;
  const stationOptions=stations.map((station,k)=>`<option value="${k}" ${p.station===station?'selected':''}>${enc(station.name)}</option>`).join('');
  const stationChoice=`<select data-station-choice="${i}" aria-label="Công đoạn LOB"><option value="">Chọn công đoạn…</option>${stationOptions}</select>`;
  const label={ready:'Sẵn sàng',unmatched:'Không khớp',ambiguous:'Trùng công đoạn',duplicate:'Trùng dữ liệu W.I', 'select-jig':'Chọn Jig','no-jig':'Chưa khai báo Jig'}[p.status];
  return `<tr><td>${enc(p.sheet)} · ${p.row}</td><td>${enc(p.stationName)}</td><td>${stationChoice}</td><td>${enc(p.spec)}</td><td>${choice||enc(p.jig?.name||label)}</td><td>${enc(label)}</td></tr>`;
 }).join('');
 box.querySelectorAll('[data-station-choice]').forEach(select=>select.onchange=()=>{
  const p=items[Number(select.dataset.stationChoice)];
  p.station=select.value===''?null:stations[Number(select.value)];
  delete p.newJig;
  const jigs=p.station?getJigs(p.station):[];
  p.jig=jigs.length===1?jigs[0]:null;
  if(p.station&&!jigs.length)p.newJig=p.stationName;
  p.status=!p.station?'unmatched':p.jig||p.newJig?'ready':jigs.length?'select-jig':'no-jig';
  renderPreview();
 });
 box.querySelectorAll('[data-jig-choice]').forEach(select=>select.onchange=()=>{
  const p=items[Number(select.dataset.jigChoice)];
  p.jig=select.value===''?null:getJigs(p.station)[Number(select.value)];
  p.status=p.jig?'ready':'select-jig';
  renderPreview();
 });
 box.querySelectorAll('[data-new-jig]').forEach(input=>input.oninput=()=>{
  const p=items[Number(input.dataset.newJig)];
  p.newJig=input.value;
  p.status=input.value.trim()?'ready':'no-jig';
  updateApply();
 });
 updateApply();
}
function updateApply(){
 const button=$id('wiSpecApply');
 button.disabled=!((mayApply()||mayStartEditing())&&pending.items.some(p=>p.status==='ready'));
 button.title=!(mayApply()||mayStartEditing())?'Bạn chưa có quyền sửa Thiết bị & Jig trên Version này.':button.disabled?'Chọn công đoạn và Jig hoặc nhập tên Jig mới.':!mayApply()?'Xác nhận để chuyển sang chế độ Sửa Thiết bị & Jig và cập nhật.':'';

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
  pending={key,filename:file.name,file,items,stations:current.processes||[]};
  renderPreview();$id('wiSpecPreviewDialog').showModal();
 }catch(error){alert('Không đọc được Excel W.I: '+error.message)}
}
async function apply(){
 if(!pending)return;
 const current=model(),key=current._remote?.versionId||current.name+'::'+current.version;
 if(key!==pending.key){alert('Model/Version đã thay đổi. Hãy tải lại W.I.');return}
 const needsEditMode=!mayApply();
 if(needsEditMode&&!mayStartEditing()){alert('Bạn chưa có quyền sửa Thiết bị & Jig trên Version này. Hãy nhờ Admin cấp quyền equipment.edit hoặc jig.edit.');return}
 const ready=pending.items.filter(p=>p.status==='ready'&&p.station&&(p.jig||p.newJig?.trim()));
 if(!ready.length)return;
 const targets=new Map();
 for(const p of ready){
  if(!current.processes.includes(p.station)||(p.jig&&!getJigs(p.station).includes(p.jig))){alert('Danh sách công đoạn hoặc Jig đã thay đổi. Hãy tải lại Process Map.');return}
  const key=p.jig||p.station;
  if(targets.has(key)){alert('Có nhiều dòng W.I cùng chọn một Jig. Hãy rà soát lại lựa chọn trước khi lưu.');return}
  targets.set(key,p);
 }
 const count=ready.filter(p=>p.jig?.spec!==p.spec).length;
 if(!count){if(pending.file)await saveProcessMapOriginal(current,pending.file);$id('wiSpecPreviewDialog').close();return}
 if(!confirm(`Cập nhật thông số áp lực cho ${count} Jig trên ${current.name} · ${current.version}? Thông số cũ của những Jig này sẽ được thay thế.`))return;
 if(needsEditMode){enterEditMode('equipment');if(!mayApply())throw Error('Không chuyển được sang chế độ sửa Thiết bị & Jig.');}
 if(pending.file)await saveProcessMapOriginal(current,pending.file);
 snapshot();
 for(const p of ready){
  if(p.jig)p.jig.spec=p.spec;
  else getJigs(p.station).push({name:p.newJig.trim(),spec:p.spec,setup:0});
 }
 renderAll();scheduleSave();
 $id('wiSpecPreviewDialog').close();pending=null;
 alert('Đã cập nhật '+count+' thông số Jig. Hãy kiểm tra cột Thông số setup và nhấn Lưu thiết bị để xác nhận.');
}

async function processMapApi(){
 return import('./services/supabase/client.js?v=20261016-cache-v2');
}
function processMapPrefix(current){
 const remote=current?._remote;
 if(!remote?.modelId||!remote?.versionId)throw Error('Model/Version chưa được lưu trên Supabase.');
 return remote.modelId+'/process-map/'+remote.versionId+'/';
}
async function saveProcessMapOriginal(current,file){
 const prefix=processMapPrefix(current);
 if(!persistenceBridge?.uploadAsset)throw Error('Chưa kết nối kho file Supabase.');
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const ext=/\.xlsm$/i.test(file.name)?'.xlsm':/\.xlsx$/i.test(file.name)?'.xlsx':null;
 if(!ext)throw Error('Lưu file gốc hiện hỗ trợ .xlsx hoặc .xlsm. Hãy lưu lại file Excel theo một trong hai định dạng này.');
 const api=await processMapApi();
 const found=await api.supabaseRequest('/rest/v1/assets?select=storage_path&model_id=eq.'+current._remote.modelId+'&storage_path=like.'+encodeURIComponent(prefix+'*')+'&order=created_at.desc&limit=1');
 if(found.data?.[0]?.storage_path.endsWith(digest+ext))return;
 const path=prefix+Date.now()+'-'+digest+ext;
 const mime=ext==='.xlsm'?'application/vnd.ms-excel.sheet.macroEnabled.12':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 const original=new File([file],file.name,{type:mime});
 await persistenceBridge.uploadAsset(current._remote.modelId,original,{path:path.slice(current._remote.modelId.length+1)});
}
async function downloadProcessMapOriginal(){
 const current=model(),prefix=processMapPrefix(current),api=await processMapApi();
 const rows=await api.supabaseRequest('/rest/v1/assets?select=storage_path,file_name&model_id=eq.'+current._remote.modelId+'&storage_path=like.'+encodeURIComponent(prefix+'*')+'&order=created_at.desc&limit=1');
 const file=rows.data?.[0];if(!file)throw Error('Version này chưa lưu Process Map gốc. Hãy import và xác nhận cập nhật một lần.');
 const signed=await persistenceBridge.getAssetUrl(file.storage_path),url=signed.signedURL||signed.signedUrl;
 const response=await fetch(url);if(!response.ok)throw Error('Không tải được file gốc ('+response.status+').');
 const blob=await response.blob(),objectUrl=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=objectUrl;a.download=file.file_name;a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);
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
 const originalButton=$id('processMapOriginalDownloadBtn');
 if(originalButton)originalButton.onclick=async()=>{originalButton.disabled=true;try{await downloadProcessMapOriginal()}catch(error){alert(error.message)}finally{originalButton.disabled=false}};
 if(processUpload&&processFile){
  processUpload.onclick=()=>processFile.click();
  processFile.onchange=()=>{const f=processFile.files?.[0];processFile.value='';chooseExcel(f)};
 }
 $id('wiSpecCancel').onclick=()=>dlg.close();
 $id('wiSpecApply').onclick=()=>apply().catch(error=>alert('Chưa cập nhật Process Map: '+error.message));
 const sync=()=>{
  const allowed=typeof canEditEquipment==='function'&&canEditEquipment();
  btn.hidden=!allowed;
 };
 sync();new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
globalThis.ISTWiSpecSync={extract,pressure,scoreMatch,proposals,mayStartEditing,processMapPrefix};
})();
