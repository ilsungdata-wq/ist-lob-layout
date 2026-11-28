import fs from 'node:fs';
import path from 'node:path';
export const root=path.resolve(import.meta.dirname,'..');
export function siteAssets(){
 const files=fs.readdirSync(root).filter(name=>/\.(html|js|css|png|LICENSE)$/.test(name)&&name!=='supabase-config.js');
 const walk=dir=>{for(const item of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
  const name=dir+'/'+item.name;if(item.isDirectory())walk(name);else files.push(name);
 }};
 for(const dir of ['assets','vendor','layout-reference','services','oauth'])walk(dir);
 return files.sort();
}
