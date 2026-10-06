import{supabaseRequest}from'./client.js';
export const profilesApi={
 async getCurrent(userId){return(await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,display_name,global_role,is_active&limit=1`)).data?.[0]||null}
};
