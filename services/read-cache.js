// Short-lived, memory-only cache. Callers explicitly choose read operations.
export function createReadCache({ttl=30000,maxEntries=40,now=Date.now,scope=()=>''}={}){
 const entries=new Map();let activeScope;
 function clear(){entries.clear()}
 async function read(key,fetcher){
  const current=scope();if(current!==activeScope){clear();activeScope=current}
  const existing=entries.get(key);
  if(existing&&(existing.pending||existing.expires>now()))return existing.promise;
  const entry={pending:true,expires:0};
  entry.promise=Promise.resolve().then(fetcher).then(value=>{
   entry.pending=false;entry.expires=now()+ttl;return value;
  },error=>{if(entries.get(key)===entry)entries.delete(key);throw error});
  entries.delete(key);entries.set(key,entry);
  while(entries.size>maxEntries)entries.delete(entries.keys().next().value);
  return entry.promise;
 }
 return{read,clear};
}
