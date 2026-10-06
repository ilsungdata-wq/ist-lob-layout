import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const url=process.env.SUPABASE_URL?.trim();
const publishableKey=(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY)?.trim();

if(!url||!publishableKey){
  console.error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY.');
  process.exit(1);
}
if(!/^https:\/\/.+\.supabase\.co\/?$/.test(url)){
  console.error('SUPABASE_URL must be an https://*.supabase.co URL.');
  process.exit(1);
}

const config=`// Generated from deployment environment variables. Do not edit or commit.\nwindow.IST_LOB_CONFIG=${JSON.stringify({supabase:{url:url.replace(/\/$/,''),publishableKey}})};\n`;
await writeFile(resolve('supabase-config.js'),config,'utf8');
console.log('Generated supabase-config.js');
