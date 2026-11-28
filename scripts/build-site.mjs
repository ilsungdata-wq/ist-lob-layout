import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root,siteAssets} from './site-assets.mjs';
const out=path.join(root,'_site');
const revision=process.env.GITHUB_SHA||'local';
if(!/^[a-zA-Z0-9_-]+$/.test(revision))throw Error('Invalid release revision');
// Only clear this generated directory, never source files or uploaded data.
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
const files=[...siteAssets(),'supabase-config.js'];const hashes={};
for(const name of files){
 let content=fs.readFileSync(path.join(root,name));
 if(/\.(html|js)$/.test(name)&&!name.startsWith('vendor/')&&!name.endsWith('.min.js')){
  let text=content.toString('utf8');
  // Give all local module imports the same revision, including auth/client singletons.
  text=text.replace(/((?:from\s*|import\s*\(\s*)['"])(\.\.?\/[^'"?]+\.m?js)(?:\?[^'"]*)?(['"])/g,`$1$2?v=${revision}$3`);
  if(name==='index.html'){
   text=text.replace(/((?:src|href)=["'])(\.\/[^"'?]+\.(?:js|css))(?:\?[^"']*)?(["'])/g,`$1$2?v=${revision}$3`);
   text=text.replace('</head>',`<meta name="ist-release" content="${revision}">\n</head>`);
  }
  content=Buffer.from(text);
 }
 const dest=path.join(out,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content);
 hashes[name]=createHash('sha256').update(content).digest('hex');
}
fs.writeFileSync(path.join(out,'.nojekyll'),'');
fs.writeFileSync(path.join(out,'release.json'),JSON.stringify({revision,assets:hashes},null,2)+'\n');
console.log(`Built ${files.length} assets for ${revision}`);
