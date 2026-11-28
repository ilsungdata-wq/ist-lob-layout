import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadCache} from '../services/read-cache.js';
test('concurrent reads share one request, expire and support manual refresh',async()=>{
 let time=0,calls=0;const cache=createReadCache({ttl:30,now:()=>time});
 const fetcher=async()=>++calls;
 assert.deepEqual(await Promise.all(Array.from({length:8},()=>cache.read('periods',fetcher))),Array(8).fill(1));
 assert.equal(await cache.read('periods',fetcher),1);
 time=31;assert.equal(await cache.read('periods',fetcher),2);
 cache.clear();assert.equal(await cache.read('periods',fetcher),3);
});
test('failures are retried, not cached',async()=>{
 const cache=createReadCache();let calls=0;
 const fetcher=async()=>{if(++calls===1)throw Error('JWT expired');return 42};
 await assert.rejects(cache.read('periods',fetcher),/JWT expired/);
 assert.equal(await cache.read('periods',fetcher),42);
});
test('changing session cannot reuse another session data or in-flight result',async()=>{
 let session='A',finish;const cache=createReadCache({scope:()=>session});
 const old=cache.read('periods',()=>new Promise(resolve=>{finish=resolve}));
 await Promise.resolve();session='B';
 assert.equal(await cache.read('periods',async()=>'B'), 'B');
 finish('A');await old;
 assert.equal(await cache.read('periods',async()=>'wrong'),'B');
});
test('refresh during an in-flight request keeps the new result',async()=>{
 const cache=createReadCache();let finish;
 const old=cache.read('periods',()=>new Promise(resolve=>{finish=resolve}));await Promise.resolve();
 cache.clear();assert.equal(await cache.read('periods',async()=>'fresh'),'fresh');
 finish('old');await old;assert.equal(await cache.read('periods',async()=>'wrong'),'fresh');
});
