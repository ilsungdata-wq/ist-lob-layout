import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root} from './site-assets.mjs';
const target=path.join(root,'.build/worker/index.mjs');
const build=()=>execFileSync(process.execPath,['build-worker.mjs','--output',target],{cwd:root});
build();const first=fs.readFileSync(target);
build();assert.deepEqual(fs.readFileSync(target),first,'Worker build must be deterministic');
execFileSync(process.execPath,['--check',target]);
const worker=(await import(pathToFileURL(target).href)).default;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n?/g,'\n');
const routes=['/',...Array.from(html.matchAll(/(?:src|href)=["']\.\/([^"'?]+\.(?:js|css))(?:\?[^"']*)?["']/g),m=>'/'+m[1]),'/services/read-cache.js','/services/supabase/auth.js','/services/supabase/client.js'];
for(const route of new Set(routes)){
 if(route==='/supabase-config.js')continue; // supplied by deployment environment
 const res=await worker.fetch(new Request('https://worker.test'+route),{});
 assert.equal(res.status,200,route);
 assert.equal(await res.text(),route==='/'?html:fs.readFileSync(path.join(root,route.slice(1)),'utf8').replace(/\r\n?/g,'\n'),route+' must match current source');
}
assert.equal((await worker.fetch(new Request('https://worker.test/missing.js'),{})).status,404);
console.log(`Worker verified: deterministic build, ${new Set(routes).size-1} current source routes, unknown route 404`);
