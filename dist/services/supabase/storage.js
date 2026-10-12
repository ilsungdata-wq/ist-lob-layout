import{getStoredSession,getSupabaseConfig,rpc,supabaseRequest}from'./client.js';
const allowed=new Set(['image/svg+xml','image/png','image/jpeg','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel.sheet.macroEnabled.12']);
export const storageApi={
 async upload(modelId,file,{path=`${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9._-]/gi,'_')}`,upsert=false}={}){const mimeType=file.type.toLowerCase()==='application/vnd.ms-excel.sheet.macroenabled.12'?'application/vnd.ms-excel.sheet.macroEnabled.12':file.type;if(!allowed.has(mimeType))throw new Error('UNSUPPORTED_ASSET_TYPE');if(file.size>25*1024*1024)throw new Error('ASSET_TOO_LARGE');const c=getSupabaseConfig(),storagePath=`${modelId}/${path}`,res=await fetch(`${c.url}/storage/v1/object/factory-assets/${storagePath}`,{method:'POST',headers:{apikey:c.anonKey,Authorization:`Bearer ${getStoredSession()?.access_token}`,'Content-Type':mimeType,'x-upsert':String(upsert)},body:file});const data=await res.json();if(!res.ok)throw Object.assign(new Error(data.message||'Upload failed'),{details:data});const record=await rpc('register_asset',{p_model_id:modelId,p_storage_path:storagePath,p_file_name:file.name,p_mime_type:mimeType,p_byte_size:file.size,p_checksum_sha256:null});return{storage:data,record:Array.isArray(record)?record[0]:record,path:storagePath}},
 async signedUrl(path,expiresIn=3600){
  const data=(await supabaseRequest(`/storage/v1/object/sign/factory-assets/${path}`,{method:'POST',body:{expiresIn}})).data;
  const value=data?.signedURL||data?.signedUrl;
  if(!value)throw new Error('Không nhận được đường dẫn file.');
  // The Storage REST API returns a path relative to /storage/v1, not the app.
  const base=getSupabaseConfig().url;
  const signedUrl=/^https?:\/\//i.test(value)?value:value.startsWith('/storage/v1/')?base+value:`${base}/storage/v1/${value.replace(/^\/+/, '')}`;
  return{...data,signedURL:signedUrl,signedUrl};
 },
 async remove(assetId,path){const result=(await supabaseRequest('/storage/v1/object/factory-assets',{method:'DELETE',body:{prefixes:[path]}})).data;await rpc('delete_asset_record',{p_asset_id:assetId});return result}
};
