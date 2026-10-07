import{layoutService}from'./services/layout-service.js';
import{isSupabaseConfigured}from'./services/supabase/client.js';
import{RevisionConflictError}from'./services/supabase/versions.js';

const host=globalThis.ISTAppHost;
const configured=isSupabaseConfigured();
const remoteKey=id=>`supabase:${id}`;
const clone=value=>structuredClone(value);

function profileSession(profile,user){
 if(!profile)throw new Error('Không tìm thấy public.profiles cho tài khoản này.');
 if(!profile.is_active)throw new Error('Tài khoản đã bị vô hiệu hóa.');
 return{email:user.email||profile.email,displayName:profile.display_name||user.email||profile.email,role:profile.global_role==='ADMIN'?'owner':'viewer',globalRole:profile.global_role,profileId:profile.id,profileActive:profile.is_active,authenticated:true};
}
async function loadWorkspace(preferredVersionId=null){
 const profile=host.session(),models=await layoutService.listModels(),mapped={};let firstKey=null,editable=false;
 for(const row of models){
 const permission=profile.globalRole==='ADMIN'?'MANAGE':await layoutService.getMyPermission(row.id);
  const rows=await layoutService.listVersions(row.id),versions=[];
  for(const version of rows){
   const capabilities=profile.globalRole==='ADMIN'?capabilityList():await layoutService.getMyCapabilities(row.id,version.id),canEditVersion=capabilities.some(value=>['layout.edit','lob.edit','equipment.edit','jig.edit','version.manage'].includes(value));
   if(canEditVersion)editable=true;if(!canEditVersion&&version.status!=='PUBLISHED')continue;versions.push(version);
   const document=clone(!canEditVersion&&version.status==='PUBLISHED'?(version.published_snapshot||version.layout_data||{}):(version.layout_data||{}));
   document.name=row.model_name||row.model_code;document.modelCode=row.model_code;document.description=row.description||'';
   document.version=version.version_number;document.processes=Array.isArray(document.processes)?document.processes:[];
   document.published=version.status==='PUBLISHED';document.isLatest=versions[0]?.id===version.id;
   document._remote={modelId:row.id,versionId:version.id,revision:version.revision,status:version.status,permission,capabilities,updatedAt:version.updated_at,publishedRevision:version.published_revision};
   const key=remoteKey(version.id);mapped[key]=document;if(!firstKey||version.id===preferredVersionId)firstKey=key;
  }
 }
 if(!Object.keys(mapped).length){
  const key='supabase:empty';mapped[key]={name:'Chưa có Model',version:'—',processes:[],layoutObjects:[],_remote:{status:'EMPTY',permission:profile.globalRole==='ADMIN'?'MANAGE':null}};firstKey=key;
 }
 if(profile.globalRole!=='ADMIN')host.setSession({...profile,role:editable?'editor':'viewer'});
 host.replaceModels(mapped,firstKey);return mapped;
}
async function loadPublicWorkspace(){
 const models=await layoutService.listModels(),mapped={};let firstKey=null;
 for(const row of models){
  const versions=await layoutService.listPublicVersions(row.id);
  for(const version of versions){
   const document=clone(version.layout_data||{});document.name=row.model_name||row.model_code;document.modelCode=row.model_code;document.description=row.description||'';document.version=version.version_number;document.processes=Array.isArray(document.processes)?document.processes:[];document.published=true;document.isLatest=version.id===row.current_published_version_id;document._remote={modelId:row.id,versionId:version.id,revision:version.revision,status:'PUBLISHED',permission:null,updatedAt:version.updated_at};const key=remoteKey(version.id);mapped[key]=document;if(!firstKey||document.isLatest)firstKey=key;
  }
 }
 if(!firstKey){firstKey='public:empty';mapped[firstKey]={name:'Chưa có Layout Published',version:'—',processes:[],layoutObjects:[],_remote:{status:'EMPTY',permission:null}}}
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
  const payload=clone(document);delete payload._remote;
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
async function publish(document){const id=document._remote?.versionId;if(!id)throw new Error('Phiên bản chưa nằm trên Supabase.');await layoutService.publishVersion(id);await loadWorkspace(id)}
async function archive(document){const id=document._remote?.versionId;if(!id)throw new Error('Phiên bản chưa nằm trên Supabase.');await layoutService.archiveVersion(id);await loadWorkspace();}
async function reload(document){await loadWorkspace(document?._remote?.versionId)}
async function history(document){return layoutService.listHistory(document._remote.versionId)}
async function restoreHistory(document,historyId){const saved=await layoutService.restoreHistory(historyId,document._remote.revision);await loadWorkspace(saved.id);return saved}
async function renameModel(document,name){await layoutService.renameModel(document._remote.modelId,name);await loadWorkspace(document._remote.versionId)}
async function deleteModel(document){await layoutService.deleteModel(document._remote.modelId);await loadWorkspace()}
async function renameVersion(document,name){await layoutService.renameVersion(document._remote.versionId,name);await loadWorkspace(document._remote.versionId)}
async function deleteVersion(document){await layoutService.deleteVersion(document._remote.versionId);await loadWorkspace()}
async function permissionData(){return{profiles:await layoutService.listProfiles(),grants:await layoutService.listCapabilityGrants()}}
async function setCapability({userId,modelId,versionId,capability,active}){return layoutService.setCapability(userId,modelId||null,versionId||null,capability,active)}
async function setProfileActive(userId,active){return layoutService.setProfileActive(userId,active)}
async function logout(){await layoutService.auth.signOut();host.setSession({role:'viewer',email:'',authenticated:false});location.reload()}

const bridge={configured,login,restore,logout,loadWorkspace,loadPublicWorkspace,saveCurrent,createModel,createVersion,publish,archive,reload,history,restoreHistory,renameModel,deleteModel,renameVersion,deleteVersion,permissionData,setCapability,setProfileActive,uploadAsset:layoutService.uploadAsset};
host.register(bridge);
host.wireAuthentication(bridge);
restore().then(async active=>{if(configured&&!active){host.setSession({role:'viewer',email:'',authenticated:false});try{await loadPublicWorkspace()}catch(error){host.replaceModels({'public:error':{name:'Không tải được dữ liệu Published',version:'—',processes:[],layoutObjects:[],_remote:{status:'ERROR',permission:null}}},'public:error');host.authError(error.message)}}}).catch(error=>host.authError(error.message));
