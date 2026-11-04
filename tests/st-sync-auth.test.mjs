import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/st-sheet-sync/index.ts',import.meta.url),'utf8'));
function setup({valid=true,admin=true}={}){
 let handler;const calls=[];
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-key',SUPABASE_SERVICE_ROLE_KEY:'service-role',ST_GOOGLE_SYNC_URL:'https://sheet.example/sync',ST_GOOGLE_SYNC_TOKEN:'private-sync-token'};
 vm.runInNewContext(source,{Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},Response,AbortController,DOMException,setTimeout,clearTimeout,fetch:async(url,options)=>{calls.push({url,options});if(url.endsWith('/auth/v1/user'))return Response.json(valid?{id:'user-id'}:{message:'invalid token'},{status:valid?200:401});if(url.endsWith('/rpc/is_admin'))return Response.json(admin);return Response.json({ok:true,rows:[],history_rows:[]});}});
 return {calls,request:(token,body)=>handler(new Request('https://edge.example',{method:'POST',headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}))};
}
test('sync rejects missing bearer without contacting Sheet',async()=>{const s=setup();assert.equal((await s.request()).status,401);assert.equal(s.calls.length,0)});
test('sync rejects invalid/expired token before admin or Sheet',async()=>{const s=setup({valid:false});assert.equal((await s.request('invalid')).status,401);assert.equal(s.calls.length,1)});
test('sync rejects authenticated non-admin before Sheet',async()=>{const s=setup({admin:false});assert.equal((await s.request('valid')).status,403);assert.equal(s.calls.length,2)});
test('sync reads Sheet only after Auth and admin verification with caller token',async()=>{const s=setup();const r=await s.request('valid');assert.equal(r.status,200);assert.equal((await r.json()).ok,true);assert.equal(s.calls.length,3);assert.equal(s.calls[0].options.headers.Authorization,'Bearer valid');assert.equal(s.calls[1].options.headers.Authorization,'Bearer valid');assert.equal(JSON.parse(s.calls[2].options.body).token,'private-sync-token')});
test('automatic request needs the private bridge token',async()=>{const s=setup();const r=await s.request();assert.equal(r.status,401);assert.equal(s.calls.length,0)});
test('manual fast sync is admin-only and applies on the Edge without sending history to the browser',async()=>{const s=setup(),r=await s.request('valid',{mode:'apply'}),body=await r.json();assert.equal(r.status,200);assert.equal(body.mode,'manual');assert.equal(JSON.parse(s.calls[2].options.body).include_history,false);assert.match(s.calls.at(-1).url,/record_st_google_sync/);assert.equal(s.calls.at(-1).options.headers.Authorization,'Bearer service-role')});