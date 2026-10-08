import{modelsApi}from'./supabase/models.js';
import{versionsApi}from'./supabase/versions.js';
import{permissionsApi}from'./supabase/permissions.js';
import{storageApi}from'./supabase/storage.js';
import{profilesApi}from'./supabase/profiles.js';
import{auth}from'./supabase/auth.js';
import{historyApi}from'./supabase/history.js';
export const layoutService={
 auth,profile:userId=>profilesApi.getCurrent(userId),
 listModels:()=>modelsApi.list(),getModel:id=>modelsApi.get(id),createModel:data=>modelsApi.create(data),renameModel:(id,name)=>modelsApi.rename(id,name),deleteModel:id=>modelsApi.softDelete(id),
 listVersions:modelId=>versionsApi.list(modelId),getVersion:id=>versionsApi.get(id),loadLayout:async id=>(await versionsApi.get(id))?.layout_data||null,
 createVersion:data=>versionsApi.create(data),saveLayout:data=>versionsApi.save(data),saveRevision:data=>historyApi.save(data),publishVersion:id=>versionsApi.publish(id),archiveVersion:id=>versionsApi.archive(id),renameVersion:(id,name)=>versionsApi.rename(id,name),deleteVersion:id=>versionsApi.softDelete(id),listPublicVersions:id=>versionsApi.listPublic(id),
 listHistory:id=>historyApi.list(id),restoreHistory:(id,revision)=>historyApi.restore(id,revision),
 getModelPermissions:id=>permissionsApi.list(id),getMyPermission:id=>permissionsApi.getMyPermission(id),getMyCapabilities:(id,versionId)=>permissionsApi.getMyCapabilities(id,versionId),listProfiles:()=>permissionsApi.profiles(),listCapabilityGrants:()=>permissionsApi.grants(),setCapability:(...args)=>permissionsApi.setCapability(...args),setProfileActive:(...args)=>permissionsApi.setProfileActive(...args),setModelPermission:(modelId,userId,permission)=>permissionsApi.set(modelId,userId,permission),removeModelPermission:(modelId,userId)=>permissionsApi.remove(modelId,userId),
 uploadAsset:(modelId,file,options)=>storageApi.upload(modelId,file,options),
 getAssetUrl:(path,expiresIn)=>storageApi.signedUrl(path,expiresIn)
};
