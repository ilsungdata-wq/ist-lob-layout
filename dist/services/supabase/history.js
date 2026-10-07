import{supabaseRequest,rpc}from'./client.js';
const one=data=>Array.isArray(data)?data[0]||null:data||null;
export const historyApi={
 async list(versionId){return(await supabaseRequest(`/rest/v1/version_revisions?version_id=eq.${encodeURIComponent(versionId)}&select=*&order=revision.desc,created_at.desc`)).data},
 async save({versionId,expectedRevision,layoutData,module='LAYOUT',changeNote=null}){return one(await rpc('save_layout_revision',{p_version_id:versionId,p_expected_revision:expectedRevision,p_layout_data:layoutData,p_module:module,p_change_note:changeNote}))},
 async restore(historyId,expectedRevision){return one(await rpc('restore_layout_revision',{p_history_id:historyId,p_expected_revision:expectedRevision}))}
};
