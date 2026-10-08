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
 function parseLayoutWorksheet(XLSX,ws,sheetName){
  const range=XLSX.utils.decode_range(ws['!ref']||'A1:A1'),blocks=[],ignored=new Set(['MODEL','TYPE','LINE','LEADER','DKN','SUPPORT','TOTAL MP','QC','TOTAL','PROCESS','TT AVG','MP','NHAN VIEN','ATTACH','DINO','WLT']);
  for(let r=range.s.r;r<=range.e.r-2;r++){const items=[];for(let c=range.s.c;c<=range.e.c;c++){const raw=cell(XLSX,ws,r,c),name=typeof raw==='string'?raw.replace(/\s+/g,' ').trim():'';if(!name||name.startsWith('=')||ignored.has(norm(name)))continue;const time=number(cell(XLSX,ws,r+1,c)),mp=number(cell(XLSX,ws,r+2,c));if(time===null||mp===null||time<0||time>300||mp<0||mp>30)continue;const no=number(cell(XLSX,ws,r-1,c));items.push({name,time,mp,no:no&&no>0&&no<300?Math.round(no):null,col:c})}if(items.length>=3){const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];if(median(items.map(x=>x.time))<=3&&median(items.map(x=>x.mp))>3)for(const item of items)[item.time,item.mp]=[item.mp,item.time];blocks.push({row:r,items})}}
  if(!blocks.length)throw new Error(`Không tìm thấy bảng Công đoạn / T/T / MP trong ${sheetName}.`);
  const items=[],seen=new Set();for(const [blockIndex,block] of blocks.entries())for(const [columnIndex,item] of block.items.sort((a,b)=>a.col-b.col).entries()){const key=(item.no||'')+'|'+norm(item.name);if(!seen.has(key)){seen.add(key);items.push({...item,block:blockIndex,columnIndex})}}items.forEach((item,index)=>{if(!item.no)item.no=index+1});items.sort((a,b)=>a.no-b.no||a.block-b.block||a.col-b.col);
  const modelName=normalizeModelName(sheetName);let line=1,type=/block/i.test(modelName)?'block':'normal';for(let r=range.s.r;r<=range.e.r;r++)for(let c=range.s.c;c<=range.e.c;c++){const label=norm(cell(XLSX,ws,r,c));if(label==='LINE'){const value=number(cell(XLSX,ws,r+2,c));if(Number.isInteger(value)&&value>0)line=value}if(label==='TYPE'){const value=String(cell(XLSX,ws,r+2,c)||'').trim().toLowerCase();if(value)type=value.includes('block')?'block':'normal'}}return{modelName,line,type,items};
 }
 const api={normalizeModelName,isLayoutCandidate,stableProcessId,sortVersionsNewest,nextVersionNumber,previewSummary,parseLayoutWorksheet};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;root.ISTExcelImport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
