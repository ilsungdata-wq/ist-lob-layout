import{modelsApi}from'./supabase/models.js';
import{versionsApi}from'./supabase/versions.js';
import{permissionsApi}from'./supabase/permissions.js';
import{storageApi}from'./supabase/storage.js';
import{profilesApi}from'./supabase/profiles.js';
import{auth}from'./supabase/auth.js';
export const layoutService={
 auth,profile:userId=>profilesApi.getCurrent(userId),
 listModels:()=>modelsApi.list(),getModel:id=>modelsApi.get(id),createModel:data=>modelsApi.create(data),
 listVersions:modelId=>versionsApi.list(modelId),getVersion:id=>versionsApi.get(id),loadLayout:async id=>(await versionsApi.get(id))?.layout_data||null,
 createVersion:data=>versionsApi.create(data),saveLayout:data=>versionsApi.save(data),publishVersion:id=>versionsApi.publish(id),archiveVersion:id=>versionsApi.archive(id),
 getModelPermissions:id=>permissionsApi.list(id),getMyPermission:id=>permissionsApi.getMyPermission(id),setModelPermission:(modelId,userId,permission)=>permissionsApi.set(modelId,userId,permission),removeModelPermission:(modelId,userId)=>permissionsApi.remove(modelId,userId),
 uploadAsset:(modelId,file,options)=>storageApi.upload(modelId,file,options)
};
