import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const fabric=read('fabric-engine.js');
const html=read('index.html');
const start=fabric.indexOf('function fabricTypeCounts(items){');
const finish=fabric.indexOf('function bindLayoutSummaryCards(){',start);
assert.ok(start>=0&&finish>start,'pure summary count helpers must exist');

function withModel(modelData){
 const ctx=vm.createContext({
  model:()=>modelData,
  getJigs:row=>row.jigs||[],
  stationSkills:row=>row.multiSkills||[],
  jigType:j=>j.type||'tool'
 });
 vm.runInContext(fabric.slice(start,finish),ctx);
 return ctx;
}
test('automatic Layout counters count active LOB staff by role, not ĐKN as headcount',()=>{
 const modelData={processes:[
  {name:'ASSEMBLY',mp:3,multiSkills:[40],equipment:'DMC',jigs:[{name:'Jig A'},{name:'Jig B'}]},
  {name:'LEADER',mp:1},{name:'SUPPORT',mp:1},{name:'IQC',mp:1},
  {name:'OQC',mp:2},{name:'PQC',mp:1},
  {name:'INACTIVE',mp:88,isActive:false}
 ]};
 const ctx=withModel(modelData);
 const counts=ctx.fabricTypeCounts([{type:'star',visible:true}]);
 assert.equal(counts.leader,1);
 assert.equal(counts.support,1);
 assert.equal(counts.mp,3);
 assert.equal(counts.iqc,1);
 assert.equal(counts.oqc,2);
 assert.equal(counts.pqc,1);
 assert.equal(counts.dkn,1);
 assert.equal(counts.total,9);
 assert.equal(counts.equipment,1);
 assert.equal(counts.jig,2);
});
test('automatic Layout counters fall back to visible drawing symbols without a LOB',()=>{
 const ctx=withModel({processes:[],layoutDocument:{layers:[{id:'hidden',visible:false}]}});
 const counts=ctx.fabricTypeCounts([
  {type:'worker-leader'},{type:'worker-support'},
  {type:'worker'},{type:'worker'},{type:'worker'},{type:'worker-pink',text:'QC'},
  {type:'star'},{type:'laser'},{type:'jig-v3'},{type:'worker',layerId:'hidden'}
 ]);
 assert.equal(counts.mp,3);
 assert.equal(counts.leader,1);
 assert.equal(counts.support,1);
 assert.equal(counts.oqc,1);
 assert.equal(counts.dkn,1);
 assert.equal(counts.total,6);
 assert.equal(counts.equipment,1);
 assert.equal(counts.jig,1);
});
test('manual Layout overrides allow zero, recompute Total, and can override Total itself',()=>{
 const ctx=withModel({processes:[]});
 const auto={leader:1,dkn:3,support:1,mp:20,iqc:1,oqc:2,pqc:0,total:25,equipment:5,jig:7};
 const resolved=ctx.resolvedLayoutSummaryCounts(auto,{mp:0,iqc:3,jig:10});
 assert.equal(resolved.mp,0);
 assert.equal(resolved.iqc,3);
 assert.equal(resolved.jig,10);
 assert.equal(resolved.total,7);
 const manualTotal=ctx.resolvedLayoutSummaryCounts(auto,{mp:0,iqc:3,total:12});
 assert.equal(manualTotal.total,12);
 const reset=ctx.resolvedLayoutSummaryCounts(auto,{});
 assert.equal(reset.total,25);
});
test('all ten Layout cards can be edited, reset and saved per Model/Version',()=>{
 const keys=['leader','dkn','support','mp','iqc','oqc','pqc','total','equipment','jig'];
 for(const key of keys){
  assert.match(html,new RegExp('data-layout-summary="'+key+'"'));
  assert.match(html,new RegExp('data-summary-auto="'+key+'"'));
 }
 assert.match(fabric,/model\(\)\.layoutSummaryManual/);
 assert.match(fabric,/input\.disabled=!canEditLayout\(\)/);
 assert.match(fabric,/snapshot\(\)/);
 assert.match(fabric,/persistLocal\(\);scheduleSave\(\)/);
 assert.doesNotMatch(fabric,/alwaysAutomatic=new Set\(\['total','equipment','jig'\]\)/);
 assert.match(html,/fabric-engine\.js\?v=20261111-layout-summary-v24/);
 assert.match(html,/overrides\.css\?v=20261111-layout-counters-v1/);
});
