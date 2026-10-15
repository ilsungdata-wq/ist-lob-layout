const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...corsHeaders,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
});

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(request.method!=='POST')return json({message:'method_not_allowed'},405);

  const supabaseUrl=Deno.env.get('SUPABASE_URL')||'';
  const anonKey=Deno.env.get('SUPABASE_ANON_KEY')||'';
  const syncUrl=Deno.env.get('ST_GOOGLE_SYNC_URL')||'';
  const syncToken=Deno.env.get('ST_GOOGLE_SYNC_TOKEN')||'';
  const authorization=request.headers.get('Authorization')||'';
  if(!authorization.startsWith('Bearer '))return json({message:'authentication_required'},401);
  if(!supabaseUrl||!anonKey)return json({message:'supabase_runtime_not_configured'},500);

  const adminResponse=await fetch(`${supabaseUrl}/rest/v1/rpc/is_admin`,{
    method:'POST',headers:{apikey:anonKey,Authorization:authorization,'Content-Type':'application/json'},body:'{}',
  });
  const isAdmin=adminResponse.ok&&await adminResponse.json()===true;
  if(!isAdmin)return json({message:'admin_required_to_sync_st'},403);
  if(!syncUrl||!syncToken)return json({message:'google_sheet_sync_not_configured'},503);

  try{
    const sourceResponse=await fetch(syncUrl,{
      method:'POST',redirect:'follow',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:syncToken}),
    });
    if(!sourceResponse.ok)return json({message:'google_sheet_source_unavailable',status:sourceResponse.status},502);
    const payload=await sourceResponse.json();
    if(payload?.ok!==true||!Array.isArray(payload.rows))return json({message:payload?.message||'invalid_google_sheet_response'},502);

    const unique=new Map<string,{product_code:string;model_name:string;product_type:'Smart'|'Tab';labor_cost:number;net_price:number}>();
    for(const raw of payload.rows.slice(0,5000)){
      const productCode=String(raw?.product_code||'').trim().toUpperCase();
      const modelName=String(raw?.model_name||'').trim();
      const netPrice=Number(raw?.net_price);
      const productType=String(raw?.product_type||'').toLowerCase()==='tab'?'Tab':'Smart';
      if(!/^GH96-[A-Z0-9]+$/.test(productCode)||!modelName||!Number.isFinite(netPrice)||netPrice<=1000)continue;
      unique.set(productCode,{product_code:productCode,model_name:modelName,product_type:productType,labor_cost:productType==='Tab'?3566:3445,net_price:netPrice});
    }
    return json({ok:true,generated_at:payload.generated_at||new Date().toISOString(),rows:[...unique.values()],stats:payload.stats||{}});
  }catch(error){
    return json({message:'google_sheet_sync_failed',detail:error instanceof Error?error.message:String(error)},502);
  }
});
