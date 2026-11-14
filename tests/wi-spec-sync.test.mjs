import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../wi-spec-sync.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function parser(stations=[]){
 const ctx={document:{readyState:'loading',addEventListener(){}},getJigs:s=>s.jigs||[],XLSX:{utils:{sheet_to_json:s=>s.rows}}};
 ctx.globalThis=ctx;ctx.model=()=>({name:'S956',processes:stations});
 vm.runInNewContext(source,ctx);
 return ctx.ISTWiSpecSync;
}
test('Korean input pneumatic pressure converts to Vietnamese format',()=>{
 const p=parser().pressure;
 assert.equal(p('■ 입력 공압 : 5.5±0.5 Kgf/㎠\n■ 순수 압착시간 : 2초'),'Áp lực: 5,5 ± 0,5 kgf/㎠');
 assert.equal(p('PRESSURE: 6.0 ± 0.3 MPa'),'Áp lực: 6,0 ± 0,3 MPa');
 assert.equal(p('JIG 오버랩양 : 1.0 ± 0.2mm'),'');
});
test('detects variable header positions and process-to-remark columns',()=>{
 const rows=[['','',''],['비고','적용 지그','OTHER'],['입력 공압 : 5.5±0.5 Kgf/㎠','SIDE METAL SHEET ATTACH (15,16,17,18)','']];
 const found=parser().extract({SheetNames:['any-name'],Sheets:{'any-name':{rows}}});
 assert.equal(found.length,1);
 assert.equal(found[0].stationName,'SIDE METAL SHEET ATTACH (15,16,17,18)');
 assert.equal(found[0].spec,'Áp lực: 5,5 ± 0,5 kgf/㎠');
});
test('maps S956 pressure only when a unique station and Jig is available',()=>{
 const stations=[
  {id:'a',name:'METAL SHEET (15,16,17,18)',jigs:[{id:'j1',name:'SIDE METAL SHEET ATTACH'}]},
  {id:'b',name:'S METAL SHEET ATTACH BTM 2 (4,5,6,7,10)',jigs:[{id:'j2',name:'Jig 1'},{id:'j3',name:'Jig 2'}]}
 ];
 const api=parser(stations),rows=[
  {sheet:'W.I',row:9,stationName:'SIDE METAL SHEET ATTACH (15,16,17,18)',spec:'Áp lực: 5,5 ± 0,5 kgf/㎠'},
  {sheet:'W.I',row:10,stationName:'S METAL SHEET ATTACH BTM 2 (4,5,6,7,10)',spec:'Áp lực: 5,5 ± 0,5 kgf/㎠'}
 ];
 const p=api.proposals(rows,stations);
 assert.equal(p[0].status,'ready');
 assert.equal(p[0].jig.id,'j1');
 assert.equal(p[1].status,'select-jig');
 assert.equal(p[1].jig,null);
});
test('preview is exposed only in the equipment tab',()=>{
 assert.match(html,/id="wiSpecImportBtn"/);
 assert.match(html,/id="wiSpecPreviewDialog"/);
 assert.match(html,/wi-spec-sync\.js\?v=/);
 assert.match(source,/snapshot\(\)/);
 assert.match(source,/scheduleSave\(\)/);
});
