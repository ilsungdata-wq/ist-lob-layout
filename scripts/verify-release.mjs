import {createHash} from 'node:crypto';
const base=process.env.PAGE_URL,revision=process.env.GITHUB_SHA;
if(!base||!revision)throw Error('PAGE_URL and GITHUB_SHA are required');
const get=async(name,attempt)=>{
 const url=new URL(name,base.endsWith('/')?base:base+'/');url.searchParams.set('verify',revision+'-'+attempt);
 const res=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error(`${name}: HTTP ${res.status}`);return Buffer.from(await res.arrayBuffer());
};
for(let attempt=1;attempt<=12;attempt++){
 try{
  const manifest=JSON.parse(await get('release.json',attempt));
  if(manifest.revision!==revision)throw Error('Public release is not the deployed revision yet');
  for(const name of ['index.html','app.js','st-info.js','services/lazy-assets.js','services/read-cache.js']){
   const hash=createHash('sha256').update(await get(name,attempt)).digest('hex');
   if(hash!==manifest.assets[name])throw Error(`Public asset differs: ${name}`);
  }
  console.log(`Verified public release ${revision} and critical asset hashes`);process.exit(0);
 }catch(error){console.log(`Verification ${attempt}: ${error.message}`);if(attempt===12)throw error}
 await new Promise(resolve=>setTimeout(resolve,5000));
}
