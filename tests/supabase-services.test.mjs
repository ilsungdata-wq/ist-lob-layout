import test from 'node:test';
import assert from 'node:assert/strict';

const memory=new Map();
globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
globalThis.IST_LOB_CONFIG={supabase:{url:'https://test.supabase.co',anonKey:'anon-test-key-with-more-than-twenty-characters'}};

const {auth}=await import('../services/supabase/auth.js');
const {versionsApi,RevisionConflictError}=await import('../services/supabase/versions.js');
const {historyApi}=await import('../services/supabase/history.js');
const {permissionsApi}=await import('../services/supabase/permissions.js');

test('email/password login stores the Supabase session and uses only the anon key',async()=>{
 let request;
 globalThis.fetch=async(url,options)=>{request={url,options};return new Response(JSON.stringify({access_token:'access',refresh_token:'refresh',expires_at:9999999999,user:{id:'u1'}}),{status:200,headers:{'content-type':'application/json'}})};
 const session=await auth.signInWithPassword('admin@example.com','password');
 assert.equal(session.user.id,'u1');
 assert.equal(request.options.headers.apikey,globalThis.IST_LOB_CONFIG.supabase.anonKey);
 assert.equal(request.options.headers.Authorization,undefined);
 assert.equal(auth.session().access_token,'access');
});

test('revision save and restore use dedicated recoverable history RPCs',async()=>{
 const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify([{id:'v1',revision:calls.length+6,status:'DRAFT'}]),{status:200,headers:{'content-type':'application/json'}})};
 await historyApi.save({versionId:'v1',expectedRevision:6,layoutData:{objects:[{id:'a'}]},module:'LAYOUT',changeNote:'save'});
 assert.match(calls[0].url,/save_layout_revision/);assert.equal(calls[0].body.p_expected_revision,6);assert.equal(calls[0].body.p_module,'LAYOUT');
 await historyApi.restore('history-15',7);
 assert.match(calls[1].url,/restore_layout_revision/);assert.equal(calls[1].body.p_history_id,'history-15');assert.equal(calls[1].body.p_expected_revision,7);
});

test('save layout sends the expected revision and maps a revision conflict',async()=>{
 let body;
 globalThis.fetch=async(_url,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify([{id:'v1',revision:6,status:'DRAFT'}]),{status:200,headers:{'content-type':'application/json'}})};
 const saved=await versionsApi.save({versionId:'v1',expectedRevision:5,layoutData:{objects:[]}});
 assert.equal(body.p_expected_revision,5);
 assert.equal(saved.revision,6);

 globalThis.fetch=async()=>new Response(JSON.stringify({code:'40001',message:'revision_conflict'}),{status:409,headers:{'content-type':'application/json'}});
 await assert.rejects(()=>versionsApi.save({versionId:'v1',expectedRevision:5,layoutData:{}}),RevisionConflictError);
});

test('capability grant saves the exact account/model/version scope and reloads',async()=>{
 const calls=[];globalThis.fetch=async(url,options={})=>{calls.push({url,body:options.body?JSON.parse(options.body):null});const data=url.includes('/rpc/set_capability_grant')?[{id:'g1',user_id:'u2',model_id:'m1',version_id:'v1',capability:'layout.edit',is_active:true}]:[{id:'g1',user_id:'u2',model_id:'m1',version_id:'v1',capability:'layout.edit',is_active:true}];return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}})};
 await permissionsApi.setCapability('u2','m1','v1','layout.edit',true);
 const grants=await permissionsApi.grants();
 assert.deepEqual(calls[0].body,{p_user_id:'u2',p_model_id:'m1',p_version_id:'v1',p_capability:'layout.edit',p_active:true});
 assert.equal(grants[0].capability,'layout.edit');assert.equal(grants[0].is_active,true);
});
