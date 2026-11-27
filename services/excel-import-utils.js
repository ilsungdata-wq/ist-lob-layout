(function(root){
 const clean=value=>String(value||'').replace(/^\s*layout\s*/i,'').replace(/\s+/g,' ').trim();
 function normalizeModelName(sheetName){
  return clean(sheetName).replace(/\s+block\s*[-_]?\s*(\d+)$/i,' Block $1').replace(/\s+/g,' ').trim();
 }
 function isLayoutCandidate(sheetName,knownModels=[]){
  const raw=String(sheetName||'').trim(),normalized=normalizeModelName(raw).toUpperCase();
  return /^layout\b/i.test(raw)||knownModels.some(name=>normalizeModelName(name).toUpperCase()===normalized);
 }
 function stableProcessId(modelName,processNo,processName){
  const slug=`${normalizeModelName(modelName)}-${processNo}-${processName}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72);
  return `process-${slug||processNo}`;
 }
 function versionRank(value){const matches=String(value||'').match(/\d+(?:\.\d+)?/g)||[];return matches.reduce((rank,part,index)=>rank+Number(part)/Math.pow(100,index),0)}
 function sortVersionsNewest(rows){return [...rows].sort((a,b)=>versionRank(b.version_number||b.version)-versionRank(a.version_number||a.version)||new Date(b.created_at||b.updated_at||0)-new Date(a.created_at||a.updated_at||0))}
 function nextVersionNumber(rows){const max=Math.max(0,...rows.map(row=>versionRank(row.version_number||row.version)));return `Ver ${Math.floor(max)+1}`}
 function previewSummary(candidate){
  const processes=candidate.data?.processes||[],mp=processes.reduce((sum,row)=>sum+(Number(row.mp)||0),0),layoutObjects=candidate.data?.layoutObjects?.length||processes.filter(row=>row.isActive!==false).length;
  return{processCount:processes.length,mp,layoutObjects,images:candidate.media?.images||0,shapes:candidate.media?.shapes||0,multiSkill:processes.filter(row=>row.multiSkills?.length||row.skill25||row.skill40).length,warnings:candidate.warnings||[]};
 }
 const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/Đ/g,'D').trim();
 const cell=(XLSX,ws,r,c)=>ws[XLSX.utils.encode_cell({r,c})]?.v;
 const number=value=>{if(value===null||value===undefined||String(value).trim()===''||typeof value==='boolean')return null;const parsed=typeof value==='number'?value:Number(String(value).replace(',','.'));return Number.isFinite(parsed)?parsed:null};

 function parseWorkforce(XLSX,ws,modelName){
  const range=XLSX.utils.decode_range(ws['!ref']||'A1:A1'),key=v=>norm(v).replace(/[^A-Z0-9]/g,'');
  for(let r=range.s.r;r<=range.e.r;r++){
   const cols={};for(let c=range.s.c;c<=range.e.c;c++){const k=key(cell(XLSX,ws,r,c));if(['MODEL','LEADER','DKN','SUPPORT','MP','TOTAL'].includes(k))cols[k]=c}
   if(cols.MODEL===undefined||cols.MP===undefined||cols.LEADER===undefined||cols.SUPPORT===undefined)continue;
   let dataRow=-1;
   for(let d=r+1;d<=Math.min(r+5,range.e.r);d++)if(normalizeModelName(cell(XLSX,ws,d,cols.MODEL)).toUpperCase()===normalizeModelName(modelName).toUpperCase()){dataRow=d;break}
   if(dataRow<0)continue;
   const out={};
   for(const [k,c] of Object.entries(cols)){const v=number(cell(XLSX,ws,dataRow,c));if(v!==null&&v>=0)out[{LEADER:'leader',DKN:'dkn',SUPPORT:'support',MP:'mp',TOTAL:'sourceTotal'}[k]||k.toLowerCase()]=v}
   for(let h=r;h<dataRow;h++)for(let c=range.s.c;c<=range.e.c;c++){
    const name=key(cell(XLSX,ws,h,c)),k={IQC:'iqc',OQC:'oqc',PQC:'pqc',VISIONLASER:'visionLaser',VISIONEND:'visionEnd'}[name];
    if(k){const v=number(cell(XLSX,ws,dataRow,c));if(v!==null&&v>=0)out[k]=v}
   }
   if(out.mp===undefined)continue;
   for(const k of ['leader','dkn','support','iqc','oqc','pqc','visionLaser','visionEnd'])out[k]??=0;
   out.qc=out.iqc+out.oqc+out.visionLaser+out.visionEnd;
   out.total=out.leader+out.support+out.mp+out.qc+out.pqc;
   out.sourceRow=dataRow+1;return out;
  }
  return null;
 }

 function parseLayoutWorksheet(XLSX,ws,sheetName){
  const range=XLSX.utils.decode_range(ws['!ref']||'A1:A1'),blocks=[],ignored=new Set(['MODEL','TYPE','LINE','LEADER','DKN','SUPPORT','TOTAL MP','TOTAL','PROCESS','TT AVG','MP','NHAN VIEN']);
  const rowLabel=(r,label)=>{for(let c=range.s.c;c<=range.e.c;c++){const value=norm(cell(XLSX,ws,r,c));if(value===label||value.replace(/\s/g,'')===label.replace(/\s/g,''))return true}return false};
  for(let r=range.s.r;r<=range.e.r-1;r++){const mpRow=[1,2,3,4].map(offset=>r+offset).find(row=>row<=range.e.r&&rowLabel(row,'MP')),ttRow=[1,2,3,4].map(offset=>r+offset).find(row=>row<=range.e.r&&(rowLabel(row,'T/T')||rowLabel(row,'TT'))),items=[];for(let c=range.s.c;c<=range.e.c;c++){const raw=cell(XLSX,ws,r,c),name=typeof raw==='string'?raw.replace(/\s+/g,' ').trim():'';if(!name||name.startsWith('=')||ignored.has(norm(name)))continue;const first=number(cell(XLSX,ws,r+1,c)),second=number(cell(XLSX,ws,r+2,c));let time=ttRow===undefined?first:number(cell(XLSX,ws,ttRow,c)),mp=mpRow!==undefined?number(cell(XLSX,ws,mpRow,c)):ttRow!==undefined?first:second;if(time!==null&&(time<0||time>300))time=null;if(mp!==null&&(mp<0||mp>30))mp=null;const no=number(cell(XLSX,ws,r-1,c));if(time===null&&mp===null&&!(no>0&&no<300))continue;items.push({name,time,mp,no:no&&no>0&&no<300?Math.round(no):null,col:c})}if((items.length>=3&&items.filter(item=>item.no!==null).length>=3)||(items.length>=1&&items.some(item=>item.no!==null)&&mpRow!==undefined&&ttRow!==undefined)){const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)],times=items.map(x=>x.time).filter(x=>x!==null),mps=items.map(x=>x.mp).filter(x=>x!==null);if(!mpRow&&times.length&&mps.length&&median(times)<=3&&median(mps)>3)for(const item of items)[item.time,item.mp]=[item.mp,item.time];blocks.push({row:r,items})}}
  if(!blocks.length)throw new Error(`Không tìm thấy bảng Công đoạn / T/T / MP trong ${sheetName}.`);
  const items=[],seen=new Set();for(const [blockIndex,block] of blocks.entries())for(const [columnIndex,item] of block.items.sort((a,b)=>a.col-b.col).entries()){const key=(item.no||'')+'|'+norm(item.name);if(!seen.has(key)){seen.add(key);items.push({...item,block:blockIndex,columnIndex})}}items.forEach((item,index)=>{if(!item.no)item.no=index+1});items.sort((a,b)=>a.no-b.no||a.block-b.block||a.col-b.col);
  const modelName=normalizeModelName(sheetName),lobSummary={},lobLabels={LOB:'lob',OPERATION_TIME_SEC:'operationTime',PROCESS:'processCount',NECK_TIME:'neckTime',AVG:'average',NET_TIME:'netTime',TT:'tt',UPH:'uph',ST:'st',RATE:'rate'};let line=1,type=/block/i.test(modelName)?'block':'normal';
  for(let r=range.s.r;r<=range.e.r;r++){
   for(let c=range.s.c;c<=range.e.c;c++){
    const label=norm(cell(XLSX,ws,r,c));
    if(label==='LINE'){const value=number(cell(XLSX,ws,r+2,c));if(Number.isInteger(value)&&value>0)line=value}
    if(label==='TYPE'){const value=String(cell(XLSX,ws,r+2,c)||'').trim().toLowerCase();if(value)type=value.includes('block')?'block':'normal'}
    const key=lobLabels[label.replace(/\s+/g,'_')];if(!key)continue;
    const value=[1,2,3].map(offset=>number(cell(XLSX,ws,r,c+offset))).find(value=>value!==null);
    if(value!==undefined)lobSummary[key]=key==='lob'||key==='rate'?(value>1?value/100:value):value;
   }
  }
  return{modelName,line,type,items,lobSummary,workforce:parseWorkforce(XLSX,ws,modelName)};
 }
 const api={normalizeModelName,isLayoutCandidate,stableProcessId,sortVersionsNewest,nextVersionNumber,previewSummary,parseLayoutWorksheet,parseWorkforce};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;root.ISTExcelImport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
