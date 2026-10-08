import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../studio.js',import.meta.url),'utf8');
const start=source.indexOf('function renderLobChart(){');
const code=source.slice(start,source.indexOf('\n}',start)+2);
for(const compact of [true,false])test(`${compact?'mobile':'desktop'} chart keeps precise data with readable display labels`,()=>{
 const rows=Array.from({length:40},(_,index)=>({id:String(index),name:'Process '+index,time:index===0?23.63:25.3,mp:1}));
 const before=JSON.stringify(rows),nodes=Object.fromEntries(['chartModel','chartDataNote','lobChart','lobStats'].map(id=>[id,{querySelectorAll:()=>[]}]));
 const context={$:id=>nodes[id],model:()=>({name:'Test',processes:rows}),metrics:()=>({neck:25.3,sum:1000,mp:40,lob:.9,uph:142}),stationTime:s=>s.time,stationCycle:s=>s.time,esc:String,matchMedia:()=>({matches:compact}),window:{innerWidth:compact?320:1400}};
 vm.createContext(context);vm.runInContext(code,context);context.renderLobChart();
 assert.equal(JSON.stringify(rows),before);assert.match(nodes.lobChart.innerHTML,/<title>Process 0 · 23.63 giây<\/title>/);
 assert.ok(nodes.lobChart.innerHTML.includes(`font-weight="500">${compact?'23.6':'23.63'}</text>`));
 if(compact){const width=Number(nodes.lobChart.innerHTML.match(/viewBox="0 0 (\d+)/)[1]);assert.ok(width>=40*40+80,'each column must have room for its label')}
});
