import fs from "node:fs";

const html = fs.readFileSync("dist/index.html", "utf8");
const css = fs.readFileSync("dist/styles.css", "utf8");
const overrides = fs.readFileSync("dist/overrides.css", "utf8");
const app = fs.readFileSync("dist/app.js", "utf8");
const owner = "huyquynhtran96@gmail.com";

const runtime = String.raw`
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const asset=(value,type)=>new Response(value,{headers:{"content-type":type,"cache-control":"public, max-age=300"}});
const emailOf=r=>(r.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase();
async function roleOf(r,env){const email=emailOf(r);if(email===OWNER)return{role:"owner",email};if(!email)return{role:"viewer",email:""};const row=await env.DB.prepare("SELECT email FROM editors WHERE email = ?").bind(email).first();return{role:row?"editor":"viewer",email};}
async function api(request,env,url){
  const user=await roleOf(request,env);
  if(url.pathname==="/api/session")return json(user);
  if(url.pathname==="/api/layouts"&&request.method==="GET"){
    const result=await env.DB.prepare("SELECT id, model, version, is_latest, data_json, updated_at, updated_by FROM layouts ORDER BY model, is_latest DESC, updated_at DESC").all();
    return json({layouts:(result.results||[]).map(r=>({...r,is_latest:!!r.is_latest,data:JSON.parse(r.data_json)})),user});
  }
  if(url.pathname==="/api/layouts"&&request.method==="POST"){
    if(!["owner","editor"].includes(user.role))return json({error:"Bạn chỉ có quyền xem. Hãy đăng nhập bằng tài khoản đã được cấp quyền sửa."},403);
    const body=await request.json();const m=body?.data;
    if(!m||typeof m.name!=="string"||typeof m.version!=="string"||!Array.isArray(m.processes))return json({error:"Dữ liệu layout không hợp lệ."},400);
    if(m.processes.length>200)return json({error:"Một layout tối đa 200 công đoạn."},400);
    const id=String(body.id||m.name+"::"+m.version).slice(0,160);const latest=body.isLatest===false?0:1;
    const statements=[];
    if(latest)statements.push(env.DB.prepare("UPDATE layouts SET is_latest = 0 WHERE model = ?").bind(m.name));
    statements.push(env.DB.prepare("INSERT INTO layouts(id,model,version,is_latest,data_json,updated_at,updated_by) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(id) DO UPDATE SET model=excluded.model,version=excluded.version,is_latest=excluded.is_latest,data_json=excluded.data_json,updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by").bind(id,m.name,m.version,latest,JSON.stringify(m),user.email));
    await env.DB.batch(statements);return json({ok:true,id,updatedBy:user.email});
  }
  if(url.pathname==="/api/editors"&&request.method==="GET"){
    if(user.role!=="owner")return json({error:"Chỉ chủ sở hữu được quản lý quyền."},403);
    const result=await env.DB.prepare("SELECT email, created_at, created_by FROM editors ORDER BY email").all();return json({editors:result.results||[]});
  }
  if(url.pathname==="/api/editors"&&request.method==="POST"){
    if(user.role!=="owner")return json({error:"Chỉ chủ sở hữu được quản lý quyền."},403);
    const body=await request.json();const email=String(body?.email||"").trim().toLowerCase();if(!email.includes("@")||email.length>200)return json({error:"Email không hợp lệ."},400);
    await env.DB.prepare("INSERT INTO editors(email,created_by) VALUES(?,?) ON CONFLICT(email) DO NOTHING").bind(email,user.email).run();return json({ok:true,email});
  }
  if(url.pathname==="/api/editors"&&request.method==="DELETE"){
    if(user.role!=="owner")return json({error:"Chỉ chủ sở hữu được quản lý quyền."},403);
    const email=String(url.searchParams.get("email")||"").trim().toLowerCase();await env.DB.prepare("DELETE FROM editors WHERE email = ?").bind(email).run();return json({ok:true});
  }
  return json({error:"Không tìm thấy."},404);
}
export default {async fetch(request,env){try{const url=new URL(request.url);if(url.pathname.startsWith("/api/"))return await api(request,env,url);if(url.pathname==="/styles.css")return asset(CSS,"text/css; charset=utf-8");if(url.pathname==="/overrides.css")return asset(OVERRIDES,"text/css; charset=utf-8");if(url.pathname==="/app.js")return asset(APP,"text/javascript; charset=utf-8");if(url.pathname==="/"||url.pathname==="/index.html")return asset(HTML,"text/html; charset=utf-8");return new Response("Not found",{status:404});}catch(error){console.error(error);return json({error:"Dịch vụ tạm thời không khả dụng."},500);}}};
`;

const output = `const HTML=${JSON.stringify(html)};\nconst CSS=${JSON.stringify(css)};\nconst OVERRIDES=${JSON.stringify(overrides)};\nconst APP=${JSON.stringify(app)};\nconst OWNER=${JSON.stringify(owner)};\n${runtime}`;
fs.mkdirSync("dist/server", { recursive: true });
fs.writeFileSync("dist/server/index.js", output);
