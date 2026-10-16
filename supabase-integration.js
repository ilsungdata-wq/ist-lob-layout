import{layoutService}from'./services/layout-service.js?v=20261016-authoritative-name-v1';
import{isSupabaseConfigured}from'./services/supabase/client.js?v=20261016-cache-v2';
import{RevisionConflictError}from'./services/supabase/versions.js';

const host=globalThis.ISTAppHost;
const configured=isSupabaseConfigured();
const remoteKey=id=>`supabase:${id}`;
const clone=value=>structuredClone(value);
let publicWorkspaceCache=null;
async function getPublicWorkspace({fresh=false}={}){
 if(!fresh&&publicWorkspaceCache)return clone(publicWorkspaceCache);
 const rows=await layoutService.listPublicWorkspace();
 publicWorkspaceCache=rows;
 return clone(rows);
}
function compactLayoutAssets(document){
 const assets={...(document.layoutAssets||{})},rows=document.layoutDocument?.objects||document.layoutObjects||[];
 for(const row of rows){if(row.type!=='image'||typeof row.src!=='string'||!row.src.startsWith('data:'))continue;let hash=2166136261;for(let index=0;index<row.src.length;index++){hash^=row.src.charCodeAt(index);hash=Math.imul(hash,16777619)}const key=`img-${(hash>>>0).toString(16)}-${row.src.length}`;assets[key]=row.src;row.assetRef=key;delete row.src}
 if(Object.keys(assets).length)document.layoutAssets=assets;return document
}

function profileSession(profile,user){
 if(!profile)throw new Error('Không tìm thấy public.profiles cho tài khoản này.');
 if(!profile.is_active)throw new Error('Tài khoản đã bị vô hiệu hóa.');
 return{email:user.email||profile.email,displayName:profile.display_name||user.email||profile.email,role:profile.global_role==='ADMIN'?'owner':'viewer',globalRole:profile.global_role,profileId:profile.id,profileActive:profile.is_active,authenticated:true};
}
async function mapWorkspaceLimit(items,limit,mapper){
 const rows=Array.from(items||[]),results=new Array(rows.length);let cursor=0;
 async function worker(){while(cursor<rows.length){const index=cursor++;results[index]=await mapper(rows[index],index)}}
 await Promise.all(Array.from({length:Math.min(Math.max(1,limit),rows.length)},worker));
 return results;
}
function workspaceDocument(row,version,permission,capabilities){
 const canEdit=capabilities.some(value=>['layout.edit','lob.edit','equipment.edit','jig.edit','version.manage'].includes(value));
 return{name:row.model_name||row.model_code,modelCode:row.model_code,description:row.description||'',version:version.version_number,processes:[],layoutObjects:[],published:version.status==='PUBLISHED',isLatest:false,_remote:{modelId:row.id,versionId:version.id,revision:version.revision,status:version.status,permission,capabilities,updatedAt:version.updated_at,publishedRevision:version.published_revision,lazy:true,canEdit}};
}
async function ensureLoaded(document){
 const remote=document?._remote;
 if(!remote?.lazy)return document;
 const version=remote.public
  ?await layoutService.getPublicVersion(remote.versionId)
  :await layoutService.getVersion(remote.versionId);
 if(!version)throw new Error('Không tìm thấy phiên bản Layout trên Supabase.');
 const source=remote.public||(!remote.canEdit&&version.status==='PUBLISHED')
  ?(version.published_snapshot||version.layout_data||{})
  :(version.layout_data||{});
 const loaded=clone(source);
 Object.assign(document,loaded,{name:document.name,modelCode:document.modelCode,description:document.description,version:version.version_number,processes:Array.isArray(loaded.processes)?loaded.processes:[],layoutObjects:Array.isArray(loaded.layoutObjects)?loaded.layoutObjects:[],published:remote.public||version.status==='PUBLISHED',_remote:{...remote,revision:version.revision,status:remote.public?'PUBLISHED':version.status,updatedAt:version.updated_at,publishedRevision:version.published_revision,lazy:false}});
 return document;
}
async function loadWorkspace(preferredVersionId=null){
 const profile=host.session(),models=await layoutService.listModels(),mapped={};let firstKey=null,editable=false;
 // Workspace startup is constant-query: model metadata, version metadata and
 // effective capabilities are each fetched once, regardless of layout count.
 const [allVersions,capabilityRows]=await Promise.all([layoutService.listWorkspaceMetadata(),profile.globalRole==='ADMIN'?Promise.resolve([]):layoutService.getWorkspaceCapabilities()]);
 const versionsByModel=new Map(),capabilitiesByVersion=new Map(),permissionByModel=new Map();
 for(const version of allVersions){const rows=versionsByModel.get(version.model_id)||[];rows.push(version);versionsByModel.set(version.model_id,rows)}
 for(const row of capabilityRows){const capabilities=capabilitiesByVersion.get(row.version_id)||[];capabilities.push(row.capability);capabilitiesByVersion.set(row.version_id,capabilities);if(row.permission)permissionByModel.set(row.model_id,row.permission)}
 const bundles=models.map(row=>{const permission=profile.globalRole==='ADMIN'?'MANAGE':permissionByModel.get(row.id)||null,versions=versionsByModel.get(row.id)||[];return{row,permission,enriched:versions.map(version=>({version,capabilities:profile.globalRole==='ADMIN'?capabilityList():capabilitiesByVersion.get(version.id)||[]}))}});
 for(const {row,permission,enriched} of bundles){
  const visible=[];
  for(const {version,capabilities} of enriched){
   const canEditVersion=capabilities.some(value=>['layout.edit','lob.edit','equipment.edit','jig.edit','version.manage'].includes(value));if(canEditVersion)editable=true;if(!canEditVersion&&version.status!=='PUBLISHED')continue;visible.push(version);
   const document=workspaceDocument(row,version,permission,capabilities);
   document.isLatest=visible[0]?.id===version.id;
   const key=remoteKey(version.id);mapped[key]=document;if(!firstKey||version.id===preferredVersionId)firstKey=key;
  }
 }
 if(!Object.keys(mapped).length){
  const key='supabase:empty';mapped[key]={name:'Chưa có Model',version:'—',processes:[],layoutObjects:[],_remote:{status:'EMPTY',permission:profile.globalRole==='ADMIN'?'MANAGE':null}};firstKey=key;
 }
 if(!preferredVersionId&&Object.keys(mapped).length)firstKey=Object.entries(mapped).sort(([,a],[,b])=>new Date(b._remote?.updatedAt||0)-new Date(a._remote?.updatedAt||0))[0][0];
 if(profile.globalRole!=='ADMIN')host.setSession({...profile,role:editable?'editor':'viewer'});
 if(mapped[firstKey]?._remote?.lazy)await ensureLoaded(mapped[firstKey]);
 host.replaceModels(mapped,firstKey);return mapped;
}
async function loadPublicWorkspace(){
 const rows=await getPublicWorkspace(),mapped={};let firstKey=null;
 for(const row of rows){
  const document={name:row.model_name||row.model_code,modelCode:row.model_code,description:row.description||'',version:row.version_number,processes:[],layoutObjects:[],lobSummary:row.lob_summary||{},visibleCategories:Array.isArray(row.visible_categories)?row.visible_categories:[],published:true,isLatest:row.id===row.current_published_version_id,_remote:{modelId:row.model_id,versionId:row.id,revision:row.revision,status:'PUBLISHED',permission:null,updatedAt:row.updated_at,lazy:true,public:true}};const key=remoteKey(row.id);mapped[key]=document;if(!firstKey||document.isLatest)firstKey=key;
 }
 if(Object.keys(mapped).length)firstKey=Object.entries(mapped).sort(([,a],[,b])=>new Date(b._remote?.updatedAt||0)-new Date(a._remote?.updatedAt||0))[0][0];
 if(!firstKey){firstKey='public:empty';mapped[firstKey]={name:'Chưa có Layout Published',version:'—',processes:[],layoutObjects:[],_remote:{status:'EMPTY',permission:null}}}
 if(mapped[firstKey]?._remote?.lazy)await ensureLoaded(mapped[firstKey]);
 host.replaceModels(mapped,firstKey);return mapped;
}
async function login(email,password){
 const authSession=await layoutService.auth.signInWithPassword(email,password);
 try{const user=authSession.user||await layoutService.auth.user(),profile=await layoutService.profile(user.id);host.setSession(profileSession(profile,user));await loadWorkspace();return profile}
 catch(error){await layoutService.auth.signOut();throw error}
}
async function restore(){
 if(!configured)return false;const restored=await layoutService.auth.restore();if(!restored)return false;
 try{const user=restored.user||await layoutService.auth.user(),profile=await layoutService.profile(user.id);host.setSession(profileSession(profile,user));await loadWorkspace();return true}catch(error){await layoutService.auth.signOut();throw error}
}
const capabilityList=()=>globalThis.ISTCapabilities?.mappings?.ADMIN||[];
async function saveCurrent(document,module='LAYOUT'){
 const remote=document._remote;if(!remote?.versionId)throw new Error('Hãy tạo Model và Version trên Supabase trước khi lưu.');
 if(remote.status==='ARCHIVED'||remote.deletedAt)throw new Error('Phiên bản đã lưu trữ hoặc xóa không thể chỉnh sửa.');
 try{
  const payload=compactLayoutAssets(clone(document));delete payload._remote;
  const saved=await layoutService.saveRevision({versionId:remote.versionId,expectedRevision:remote.revision,layoutData:payload,module,changeNote:document.note||null});
  document._remote={...remote,revision:saved.revision,status:saved.status,updatedAt:saved.updated_at};return saved;
 }catch(error){if(error instanceof RevisionConflictError)throw Object.assign(error,{userMessage:'Layout đã được người khác cập nhật. Hãy tải lại phiên bản mới nhất trước khi lưu.'});throw error}
}
async function createModel({modelCode,modelName,description,copyDocument}){
 const row=await layoutService.createModel({modelCode,modelName,description}),version=await layoutService.createVersion({modelId:row.id,sourceVersionId:null,versionNumber:'Ver 0.1',changeNote:'Phiên bản khởi tạo từ ứng dụng'});
 if(copyDocument){const payload=clone(copyDocument);delete payload._remote;payload.name=modelName||modelCode;payload.version='Ver 0.1';payload.modelCode=modelCode;await layoutService.saveRevision({versionId:version.id,expectedRevision:version.revision,layoutData:payload,module:'LAYOUT',changeNote:'Sao chép cấu trúc từ Model hiện tại'});}
 await loadWorkspace(version.id);return version;
}
async function createVersion(source,versionNumber,changeNote){
 const r=source._remote;if(!r?.modelId)throw new Error('Model hiện tại chưa nằm trên Supabase.');
 const version=await layoutService.createVersion({modelId:r.modelId,sourceVersionId:r.versionId,versionNumber,changeNote});await loadWorkspace(version.id);return version;
}
async function attachSourceWorkbook(modelId,candidate,payload){
 if(!candidate.sourceFile)return;
 const original=candidate.sourceFile,type=/\.xlsm$/i.test(original.name)?'application/vnd.ms-excel.sheet.macroEnabled.12':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 const file=new File([original],original.name,{type}),safeName=file.name.replace(/[^a-z0-9._-]/gi,'_'),uploaded=await layoutService.uploadAsset(modelId,file,{path:`excel-source/${crypto.randomUUID()}-${safeName}`});
 payload.sourceExcelAsset={id:uploaded.record?.id||null,path:uploaded.path,name:file.name,mimeType:file.type,size:file.size,sheetName:candidate.sheetName};
 if(candidate.referenceSvg){
  const previewFile=new File([candidate.referenceSvg],safeName+'.svg',{type:'image/svg+xml'});
  const preview=await layoutService.uploadAsset(modelId,previewFile,{path:'excel-reference/'+crypto.randomUUID()+'.svg'});
  payload.referenceAsset={id:preview.record?.id||null,path:preview.path,name:previewFile.name,mimeType:previewFile.type,size:previewFile.size};
  delete payload.referenceImage;
 }

}
async function importCandidates(candidates,mode='new'){
 let selectedVersionId=null;
 for(const candidate of candidates){
  const payload=clone(candidate.data);delete payload._remote;
  const existing=candidate.previousEntry?.[1],remote=existing?._remote;
  if(existing&&mode==='draft'){
   if(remote?.status!=='DRAFT')throw new Error(`${existing.name}: chỉ được Import trực tiếp vào Version DRAFT.`);
   await attachSourceWorkbook(remote.modelId,candidate,payload);
   const saved=await layoutService.saveRevision({versionId:remote.versionId,expectedRevision:remote.revision,layoutData:payload,module:'LAYOUT',changeNote:`Import Excel · ${candidate.sheetName}`});selectedVersionId=saved.id||remote.versionId;continue;
  }
  let modelId=remote?.modelId;
  if(!modelId){const code=String(payload.modelCode||payload.name).toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48);const row=await layoutService.createModel({modelCode:code,modelName:payload.name,description:`Import từ ${candidate.sheetName}`});modelId=row.id}
  const version=await layoutService.createVersion({modelId,sourceVersionId:remote?.versionId||null,versionNumber:candidate.versionNumber,changeNote:`Import Excel · ${candidate.sheetName}`});
  await attachSourceWorkbook(modelId,candidate,payload);
  const saved=await layoutService.saveRevision({versionId:version.id,expectedRevision:version.revision,layoutData:payload,module:'LAYOUT',changeNote:`Import Excel · ${candidate.sheetName}`});selectedVersionId=saved.id||version.id;
 }
 await loadWorkspace(selectedVersionId);return selectedVersionId;
}
async function publish(document){
 const id=document._remote?.versionId;if(!id)throw new Error('Phiên bản chưa nằm trên Supabase.');
 // The selected version remains authoritative: save it first, then publish that
 // exact id without replacing the editor workspace or resetting its viewport.
 const canvas=typeof fabricLayoutCanvas==='undefined'?null:fabricLayoutCanvas,viewport=canvas?.viewportTransform?.slice(),size=canvas?{width:canvas.width,height:canvas.height}:null;
 await saveCurrent(document,'LAYOUT');const published=await layoutService.publishVersion(id);
 publicWorkspaceCache=null;document.published=true;document._remote={...document._remote,status:'PUBLISHED',publishedRevision:published?.published_revision??document._remote.revision};
 host.refreshCurrent?.();
 requestAnimationFrame(()=>{const currentCanvas=typeof fabricLayoutCanvas==='undefined'?null:fabricLayoutCanvas;if(!viewport||!currentCanvas)return;if(size)currentCanvas.setDimensions(size);currentCanvas.setViewportTransform(viewport);currentCanvas.calcOffset();currentCanvas.requestRenderAll()});
 return published;
}
async function saveCategoryVisibility(visibleCategories){
 const saved=await layoutService.setPublicCategoryVisibility(visibleCategories);
 publicWorkspaceCache=null;
 return saved;
}
async function archive(document){const id=document._remote?.versionId;if(!id)throw new Error('Phiên bản chưa nằm trên Supabase.');await layoutService.archiveVersion(id);await loadWorkspace();}
async function reload(document){await loadWorkspace(document?._remote?.versionId)}
async function history(document){return layoutService.listHistory(document._remote.versionId)}
async function restoreHistory(document,historyId){const saved=await layoutService.restoreHistory(historyId,document._remote.revision);await loadWorkspace(saved.id);return saved}
async function deleteHistory(document,historyId){requireRemoteId(document,'versionId','Version');await layoutService.deleteHistory(historyId)}
function requireRemoteId(document,key,label){const value=document?._remote?.[key];if(!value)throw new Error(`${label} hiện tại chưa tồn tại trên Supabase.`);return value}
async function renameModel(document,name){const modelId=requireRemoteId(document,'modelId','Model'),renamed=await layoutService.renameModel(modelId,name);document.name=renamed?.model_name||name;publicWorkspaceCache=null;await loadWorkspace(document._remote.versionId);return renamed}
async function deleteModel(document){const modelId=requireRemoteId(document,'modelId','Model');await layoutService.deleteModel(modelId);await loadWorkspace()}
async function renameVersion(document,name){const versionId=requireRemoteId(document,'versionId','Version');await layoutService.renameVersion(versionId,name);await loadWorkspace(versionId)}
async function deleteVersion(document){const versionId=requireRemoteId(document,'versionId','Version');await layoutService.deleteVersion(versionId);await loadWorkspace()}
async function permissionData(){return{profiles:await layoutService.listProfiles(),grants:await layoutService.listCapabilityGrants()}}
async function setCapability({userId,modelId,versionId,capability,active}){return layoutService.setCapability(userId,modelId||null,versionId||null,capability,active)}
async function setProfileActive(userId,active){return layoutService.setProfileActive(userId,active)}
async function logout(){await layoutService.auth.signOut();host.setSession({role:'viewer',email:'',authenticated:false});location.reload()}

const bridge={configured,login,restore,logout,loadWorkspace,loadPublicWorkspace,loadLobSummary:()=>getPublicWorkspace(),ensureLoaded,saveCurrent,createModel,createVersion,importCandidates,publish,saveCategoryVisibility,archive,reload,history,deleteHistory,restoreHistory,renameModel,deleteModel,renameVersion,deleteVersion,permissionData,setCapability,setProfileActive,uploadAsset:layoutService.uploadAsset,getAssetUrl:layoutService.getAssetUrl};
host.register(bridge);
host.wireAuthentication(bridge);
restore().then(async active=>{if(configured&&!active){host.setSession({role:'viewer',email:'',authenticated:false});try{await loadPublicWorkspace()}catch(error){host.replaceModels({'public:error':{name:'Không tải được dữ liệu Published',version:'—',processes:[],layoutObjects:[],_remote:{status:'ERROR',permission:null}}},'public:error');host.authError(error.message)}}}).catch(error=>host.authError(error.message));
