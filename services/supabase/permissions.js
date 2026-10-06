import{supabaseRequest,rpc}from'./client.js';
const one=data=>Array.isArray(data)?data[0]||null:data||null;
export const permissionsApi={
 async list(modelId){return(await supabaseRequest(`/rest/v1/model_permissions?model_id=eq.${encodeURIComponent(modelId)}&select=*&order=created_at`)).data},
 async getMyPermission(modelId){return await rpc('get_model_permission',{p_model_id:modelId})},
 async set(modelId,userId,permission){return one(await rpc('set_model_permission',{p_model_id:modelId,p_user_id:userId,p_permission:permission}))},
 async remove(modelId,userId){await rpc('remove_model_permission',{p_model_id:modelId,p_user_id:userId})}
};
