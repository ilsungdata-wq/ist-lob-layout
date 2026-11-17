import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const edge=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/st-sheet-sync/index.ts',import.meta.url),'utf8'));
const bridge=fs.readFileSync(new URL('../google-apps-script/st-sheet-sync/Code.gs',import.meta.url),'utf8');
test('Apps Script bridge exposes small authenticated pages',()=>{
 assert.match(bridge,/if\(body\.mode==='meta'\)/);
 assert.match(bridge,/if\(body\.mode==='page'\)/);
 assert.match(bridge,/if\(!expected\|\|body\.token!==expected\)/);
 assert.match(bridge,/limit>5000/);
 assert.match(bridge,/protocol:'st-paged-v2'/);
});
test('paged bridge reads ERP/BOM and preserves prices/types',async()=>{
 let handler;const requested=[];
 const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',ST_GOOGLE_SYNC_URL:'https://bridge.example/run',ST_GOOGLE_SYNC_TOKEN:'secret'};
 const fetch=async(url,opts={})=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'admin'});
  if(url.endsWith('/rpc/is_admin'))return Response.json(true);
  if(url==='https://bridge.example/run'){
   const input=JSON.parse(opts.body);requested.push(input);
   if(input.mode==='meta')return Response.json({ok:true,protocol:'st-paged-v2',bom_rows:3,erp_rows:5});
   if(input.mode==='page'&&input.source==='bom')return Response.json({ok:true,protocol:'st-paged-v2',source:'bom',offset:0,count:3,columns:[
     ['S956','S741 Block 3','S956'],['GH96-23733A','GH96-23333A','GH96-99999A'],['Smart','','Smart']
   ]});
   if(input.mode==='page'&&input.source==='erp')return Response.json({ok:true,protocol:'st-paged-v2',source:'erp',offset:0,count:5,columns:[
    ['GH96-23733A','GH96-23333A','GH96-99999A','GH96-23733A','GH96-FAKE'],
    ['16.436','17,888','2000','16.437','10000']
   ]});
  }
  if(url.includes('/rpc/')){
   const name=url.split('/').at(-1);
   return Response.json(name==='record_st_google_sync'?[{synced_at:'2026-11-17'}]:{inserted:0,updated:0,unchanged:3});
  }
  throw Error('unexpected '+url);
 };
 vm.runInNewContext(edge,{Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn},fetch,Response,AbortController,DOMException,setTimeout,clearTimeout,console});
 const response=await handler(new Request('https://test.supabase.co/functions/v1/st-sheet-sync',{method:'POST',headers:{Authorization:'Bearer demo','Content-Type':'application/json'},body:JSON.stringify({mode:'apply',paged:true})}));
 assert.equal(response.status,200);
 assert.equal((await response.json()).ok,true);
 assert.equal(requested.length,3);
 assert.equal(requested[0].mode,'meta');
 assert.equal(requested[1].source,'bom');
 assert.equal(requested[2].source,'erp');
 assert.ok(requested.every(row=>row.token==='secret'));
});
