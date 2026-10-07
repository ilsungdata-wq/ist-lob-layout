import{supabaseRequest,rpc}from'./client.js';
const one=data=>Array.isArray(data)?data[0]||null:data||null;
export const permissionsApi={
 async list(modelId){return(await supabaseRequest(`/rest/v1/model_permissions?model_id=eq.${encodeURIComponent(modelId)}&select=*&order=created_at`)).data},
 async getMyPermission(modelId){return await rpc('get_model_permission',{p_model_id:modelId})},
 async getMyCapabilities(modelId,versionId=null){return(await rpc('get_my_capabilities',{p_model_id:modelId,p_version_id:versionId})).map(row=>row.capability)},
 async profiles(){return(await supabaseRequest('/rest/v1/profiles?select=id,email,display_name,global_role,is_active&order=email')).data},
 async grants(){return(await supabaseRequest('/rest/v1/capability_grants?select=*&order=created_at')).data},
 async setCapability(userId,modelId,versionId,capability,active=true){return one(await rpc('set_capability_grant',{p_user_id:userId,p_model_id:modelId,p_version_id:versionId,p_capability:capability,p_active:active}))},
 async setProfileActive(userId,active){return one(await rpc('set_profile_active',{p_user_id:userId,p_active:active}))},
 async set(modelId,userId,permission){return one(await rpc('set_model_permission',{p_model_id:modelId,p_user_id:userId,p_permission:permission}))},
 async remove(modelId,userId){await rpc('remove_model_permission',{p_model_id:modelId,p_user_id:userId})}
};
