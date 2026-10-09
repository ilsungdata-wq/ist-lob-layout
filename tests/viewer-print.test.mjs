import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../viewer-print-ux.js',import.meta.url),'utf8');
const context=vm.createContext({});
vm.runInContext(source.split('(()=>{')[0],context);
test('viewer fits visible objects inside the printable page without changing geometry',()=>{
 const box={left:100,top:200,width:500,height:150};
 const objects=[{layoutId:'a',getBoundingRect:()=>box},{layoutId:'hidden',visible:false,getBoundingRect:()=>({left:0,top:0,width:1000,height:1000})},{layoutId:'outside',getBoundingRect:()=>({left:1100,top:100,width:50,height:50})}];
 const bounds=context.viewerContentBounds(objects,{width:1000,height:800});
 assert.equal(JSON.stringify(bounds),JSON.stringify(box));
 const [z,,,zy,x,y]=context.viewerFitTransform(bounds,1200,600);
 assert.equal(z,zy);assert.ok(x+bounds.left*z>=32);assert.ok(y+bounds.top*z>=32);
 assert.ok(x+(bounds.left+bounds.width)*z<=1168);assert.ok(y+(bounds.top+bounds.height)*z<=568);
 assert.deepEqual(box,{left:100,top:200,width:500,height:150});
});
test('empty layout falls back to the configured page',()=>{
 assert.equal(JSON.stringify(context.viewerContentBounds([],{width:900,height:600})),JSON.stringify({left:0,top:0,width:900,height:600}));
});
test('A4 scale fits both wide and long reports including hundreds of rows',()=>{
 for(const [width,height] of [[1077,600],[1077,1200],[2200,700],[1077,10000]]){
  const scale=context.singlePageScale(width,height,1077,673);
  assert.ok(width*scale<=1077);assert.ok(height*scale<=673);assert.ok(scale>0&&scale<=1);
 }
});
