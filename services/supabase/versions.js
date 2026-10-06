import{supabaseRequest,rpc}from'./client.js';
const one=data=>Array.isArray(data)?data[0]||null:data||null;
export class RevisionConflictError extends Error{constructor(details){super('Layout changed by another user. Reload before saving.');this.name='RevisionConflictError';this.details=details}}
export const versionsApi={
 async list(modelId){return(await supabaseRequest(`/rest/v1/layout_versions?model_id=eq.${encodeURIComponent(modelId)}&select=*&order=created_at.desc`)).data},
 async get(id){return(await supabaseRequest(`/rest/v1/layout_versions?id=eq.${encodeURIComponent(id)}&select=*&limit=1`)).data?.[0]||null},
 async create({modelId,sourceVersionId=null,versionNumber,changeNote=null}){return one(await rpc('create_layout_version',{p_model_id:modelId,p_source_version_id:sourceVersionId,p_version_number:versionNumber,p_change_note:changeNote}))},
 async save({versionId,expectedRevision,layoutData,changeNote=null}){try{return one(await rpc('save_layout_version',{p_version_id:versionId,p_expected_revision:expectedRevision,p_layout_data:layoutData,p_change_note:changeNote}))}catch(e){if(e.code==='40001'||/revision_conflict/i.test(e.message))throw new RevisionConflictError(e.details);throw e}},
 async publish(versionId){return one(await rpc('publish_layout_version',{p_version_id:versionId}))},
 async archive(versionId){return one(await rpc('archive_layout_version',{p_version_id:versionId}))}
};
