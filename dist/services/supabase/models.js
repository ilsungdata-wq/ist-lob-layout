import{supabaseRequest,rpc}from'./client.js';
const one=data=>Array.isArray(data)?data[0]||null:data||null;
export const modelsApi={
 async list(){return(await supabaseRequest('/rest/v1/models?select=*&order=model_code.asc')).data},
 async get(id){return(await supabaseRequest(`/rest/v1/models?id=eq.${encodeURIComponent(id)}&select=*,layout_versions(*)&limit=1`)).data?.[0]||null},
 async create({modelCode,modelName=null,description=null}){return one(await rpc('create_model',{p_model_code:modelCode,p_model_name:modelName,p_description:description}))}
};
