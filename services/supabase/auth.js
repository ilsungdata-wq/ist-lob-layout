import{getSupabaseConfig,getStoredSession,isSupabaseConfigured,storeSession,supabaseRequest}from'./client.js';
export const auth={
 configured:isSupabaseConfigured,
 session:getStoredSession,
 async signInWithPassword(email,password){const {data}=await supabaseRequest('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email,password}});storeSession(data);return data},
 async signUp(email,password,displayName=''){const {data}=await supabaseRequest('/auth/v1/signup',{method:'POST',auth:false,body:{email,password,data:{display_name:displayName}}});if(data?.access_token)storeSession(data);return data},
 async refresh(){const current=getStoredSession();if(!current?.refresh_token)return null;const {data}=await supabaseRequest('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:{refresh_token:current.refresh_token}});storeSession(data);return data},
 async signOut(){try{await supabaseRequest('/auth/v1/logout',{method:'POST'})}finally{storeSession(null)}},
 async user(){const {data}=await supabaseRequest('/auth/v1/user');return data},
 async requestPasswordReset(email,redirectTo=location.href){return(await supabaseRequest(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,{method:'POST',auth:false,body:{email}})).data}
};
