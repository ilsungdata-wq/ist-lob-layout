import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../supabase/functions/lob-mcp/handler.mjs";
const env = { SUPABASE_URL:"https://example.supabase.co", SUPABASE_ANON_KEY:"a".repeat(36) };
const userId="0414d7fa-75e4-49df-96b4-c5661082d8ca";
const encode = x => Buffer.from(JSON.stringify(x)).toString("base64url");
const oauthToken=()=>[encode({alg:"RS256",typ:"JWT"}),encode({
  iss:"https://example.supabase.co/auth/v1",sub:userId,
  client_id:"chatgpt-client-id",aud:"authenticated",role:"authenticated",
  exp:Math.floor(Date.now()/1000)+3600
}),"signature"].join(".");
const source=[
  { product_code:"GH96-111A",model_name:"F766 Main",product_type:"Smart",labor_cost:3445,current_price:25000,current_st:7.256894,latest_gap_st:0.156894,change_count:2,last_change_at:"2026-10-29T01:00:00Z",material_count:2 },
  { product_code:"GH96-112B",model_name:"F766 Main",product_type:"Smart",labor_cost:3445,current_price:24000,current_st:6.966618,latest_gap_st:0,change_count:0,last_change_at:"2026-10-28T01:00:00Z",material_count:2 },
  { product_code:"GH96-222A",model_name:"F741 Sub",product_type:"Tab",labor_cost:3566,current_price:13000,current_st:3.645541,latest_gap_st:-0.1,change_count:1,last_change_at:"2026-10-20T01:00:00Z",material_count:1 }
];
function fetchStub({admin=true,denyToken=false}={}) {
  const calls=[];
  const fetchImpl=async(url, opts)=>{
    calls.push(url);
    if(url.endsWith("/auth/v1/user")) return denyToken ? Response.json({msg:"Invalid JWT"},{status:401}):Response.json({id:userId,email:"admin@company.example"});
    if(url.endsWith("/rpc/is_admin")) return Response.json(admin);
    if(url.endsWith("/rpc/get_st_catalog")) return Response.json(source);
    if(url.endsWith("/rpc/get_st_history")) {
      assert.deepEqual(JSON.parse(opts.body),{p_product_code:"GH96-111A"});
      return Response.json([{old_price:22000,new_price:25000,old_st:6.2,new_st:7.256894,gap_st:1.056894,source:"ERP",change_date:"2026-10-29",voc_code:null,reason:"Adjusted price"}]);
    }
    if(url.endsWith("/rpc/get_st_model_history")) {
      assert.deepEqual(JSON.parse(opts.body),{p_model_name:"F766 Main"});
      return Response.json([{model_name:"F766 Main",product_code:"GH96-111A",old_price:22000,new_price:25000,old_st:6.2,new_st:7.256894,gap_st:1.056894,source:"ERP",change_date:"2026-10-29"}]);
    }
    if(url.endsWith("/rpc/get_st_labor_cost_history")) return Response.json([{product_type:"ALL",labor_cost:3445,effective_date:"2026-10-01",note:"annual",created_at:"2026-10-01T00:00:00Z"}]);
    throw new Error("Unexpected network request: "+url);
  };
  return {calls,fetchImpl};
}
function call(name,args={},token=oauthToken(),network=fetchStub()) {
  const headers={"Content-Type":"application/json"};
  if(token)headers.Authorization="Bearer "+token;
  const request=new Request("https://example.supabase.co/functions/v1/lob-mcp",{method:"POST",headers,body:JSON.stringify({
    jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:args}
  })});
  return handleRequest(request,env,network.fetchImpl);
}
test("private tools are declared OAuth-secured; public tools remain anonymous",async()=>{
  const req=new Request("https://example.supabase.co/functions/v1/lob-mcp",{method:"POST",body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list",params:{}})});
  const result=await (await handleRequest(req,env)).json();
  const list=result.result.tools;
  assert.equal(list.find(t=>t.name==="get_st_parent_code_report").securitySchemes[0].type,"oauth2");
  assert.ok(!list.find(t=>t.name==="list_published_models").securitySchemes);
});
test("RFC9728 metadata advertises the Supabase Auth OAuth provider",async()=>{
  const req=new Request("https://example.supabase.co/functions/v1/lob-mcp/.well-known/oauth-protected-resource");
  const res=await handleRequest(req,env);
  assert.equal(res.status,200);
  const json=await res.json();
  assert.equal(json.resource,"https://example.supabase.co/functions/v1/lob-mcp");
  assert.deepEqual(json.authorization_servers,["https://example.supabase.co/auth/v1"]);
});
test("no token blocks prices before any Supabase read",async()=>{
  const network=fetchStub();
  const res=await call("search_st_parent_codes",{},null,network);
  const body=await res.json();
  assert.equal(body.result.isError,true);
  assert.equal(body.result.content[0].text,"ST_OAUTH_REQUIRED");
  assert.ok(res.headers.get("WWW-Authenticate").includes("oauth-protected-resource"));
  assert.ok(body.result._meta["mcp/www_authenticate"]);
  assert.equal(network.calls.length,0);
});
test("invalid OAuth token cannot access S/T",async()=>{
  const net=fetchStub({denyToken:true});
  const out=await(await call("list_st_models",{},oauthToken(),net)).json();
  assert.equal(out.result.isError,true);
  assert.ok(!net.calls.some(s=>s.endsWith("/rpc/get_st_catalog")));
});
test("normal Supabase webapp JWT with no OAuth client_id is refused",async()=>{
  const bad=[encode({alg:"RS256"}),encode({
    iss:"https://example.supabase.co/auth/v1",sub:userId,aud:"authenticated",
    exp:Math.floor(Date.now()/1000)+3600
  }),"signature"].join(".");
  const net=fetchStub();
  const out=await(await call("list_st_models",{},bad,net)).json();
  assert.equal(out.result.isError,true);
  assert.equal(out.result.content[0].text,"ST_OAUTH_REQUIRED");
  assert.ok(!net.calls.some(s=>s.includes("/rpc/is_admin")));
});
test("non-admin authenticated OAuth client is denied before financial reads",async()=>{
  const net=fetchStub({admin:false});
  const out=await(await call("get_st_parent_code_report",{parent_code:"GH96-111A"},oauthToken(),net)).json();
  assert.equal(out.result.isError,true);
  assert.equal(out.result.content[0].text,"ST_ADMIN_PERMISSION_REQUIRED");
  assert.ok(!net.calls.some(s=>s.includes("/rpc/get_st_catalog")));
});
test("authorized full S/T report by exact Parent Code",async()=>{
  const result=(await(await call("get_st_parent_code_report",{parent_code:"gh96-111a"})).json()).result;
  assert.equal(result.isError,false);
  assert.equal(result.structuredContent.parent_code.net_price_vnd,25000);
  assert.equal(result.structuredContent.parent_code.st_minutes,7.256894);
  assert.equal(result.structuredContent.history[0].new_price_vnd,25000);
  assert.equal(result.structuredContent.history[0].source,"ERP");
});
test("authorized S/T filter by Model and page",async()=>{
  const result=(await(await call("search_st_parent_codes",{model:"F766",limit:1,offset:1})).json()).result.structuredContent;
  assert.equal(result.total,2);assert.equal(result.parent_codes.length,1);
  assert.equal(result.parent_codes[0].parent_code,"GH96-112B");
  assert.equal(result.parent_codes[0].gap_st_minutes,0);
});
test("Model report provides all code counts, price and GAP with dated history",async()=>{
  const data=(await(await call("get_st_model_report",{model:"f766 main",include_history:true})).json()).result.structuredContent;
  assert.equal(data.model.parent_code_count,2);
  assert.equal(data.total_parent_codes,2);
  assert.equal(data.model.avg_net_price_vnd_per_code,24500);
  assert.equal(data.history_for_page[0].new_price_vnd,25000);
});
test("Model comparison and Labor Cost history are read-only",async()=>{
  const compare=(await(await call("compare_st_models",{models:["F766 Main","F741 Sub"]})).json()).result.structuredContent;
  assert.equal(compare.models.length,2);
  const labor=(await(await call("get_st_labor_cost_history",{})).json()).result.structuredContent;
  assert.equal(labor.records[0].labor_cost_vnd,3445);
});
test("unknown mutation tools never execute",async()=>{
  const res=await call("apply_st_voc_batch",{p_rows:[]});
  assert.equal(res.status,400);
  assert.equal((await res.json()).error.code,-32602);
});
