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

test('Viewer can download equipment template and open Process Map without write access',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../overrides.css',import.meta.url),'utf8');
 assert.match(html,/id="jigXlsxTemplateBtn"/);
 assert.match(html,/id="jigXlsxImportBtn"[^>]*>Tải Process Map lên/);
 assert.match(app,/for\(const id of \['jigXlsxTemplateBtn','jigXlsxImportBtn'\]\)if\(\$\(id\)\)\$\(id\)\.hidden=false/);
 assert.match(css,/body\.viewer-mode #jigView \.tab-file-actions\{display:flex!important/);
 assert.match(source,/template\.onclick=downloadEquipmentTemplate/);
 assert.match(source,/processUpload\.onclick=\(\)=>processFile\.click\(\)/);
 assert.match(source,/const button=\$id\('wiSpecApply'\)/);
 assert.match(source,/mayApply\(\)\|\|mayStartEditing\(\)/);
 assert.match(source,/needsEditMode&&!mayStartEditing\(\)/);
 assert.match(source,/return typeof canEditEquipment==='function'&&canEditEquipment\(\)/);
 assert.match(source,/if\(needsEditMode\)\{enterEditMode\('equipment'\)/);
});

test('press-force Korean label supports symmetric, fixed and one-sided values without changing meaning',()=>{
 const p=parser().pressure;
 assert.equal(p('■ 압착력 : 5.5±0.5 Kgf/㎠\n■ 오버랩양 : 1 ± 0.2mm'),'Áp lực: 5,5 ± 0,5 kgf/㎠');
 assert.equal(p('■ 압착력 : 3 Kgf/㎠'),'Áp lực: 3 kgf/㎠');
 assert.equal(p('■ 압착력 : 3.0+0.5 Kgf/㎠'),'Áp lực: 3,0 + 0,5 kgf/㎠');
 assert.equal(p('■ 순수 압착시간 : 5초\n■ 오버랩양 : 1 ± 0.2mm'),'');
});
test('prefer applied Jig column over Korean process text and exclude hidden sheets',()=>{
 const sheet={rows:[['공정명','적용 지그','비고'],['측면 METAL SHEET 부착','SIDE S METAL SHEET ATTACH 4P (16,17,18,19)','■ 압착력 : 5.5±0.5 Kgf/㎠']]};
 const found=parser().extract({SheetNames:['active','hidden'],Sheets:{active:sheet,hidden:sheet},Workbook:{Sheets:[{name:'active',Hidden:0},{name:'hidden',Hidden:1}]}});
 assert.equal(found.length,1);assert.equal(found[0].stationName,'SIDE S METAL SHEET ATTACH 4P (16,17,18,19)');
 assert.ok(parser().scoreMatch('SIDE S METAL SHEET ATTACH 4P (16,17,18,19)','METAL SHEET (16,17,18,19)')>=85);
 assert.equal(parser().scoreMatch('SIDE S METAL SHEET ATTACH 4P (16,17,18,19)','METAL SHEET (1,2,3)'),0);
});

test('unique matched station without Jig proposes source Jig name, duplicate targets still require review',()=>{
 const api=parser(),stations=[{id:'a',name:'METAL SHEET (16,17,18,19)',jigs:[]}],row={sheet:'active',row:7,stationName:'SIDE S METAL SHEET ATTACH 4P (16,17,18,19)',spec:'Áp lực: 5,5 ± 0,5 kgf/㎠'};
 const one=api.proposals([row],stations);assert.equal(one[0].status,'ready');assert.equal(one[0].newJig,row.stationName);assert.equal(stations[0].jigs.length,0);
 const duplicate=api.proposals([row,{...row,row:8}],stations);assert.equal(duplicate[0].status,'duplicate');assert.equal(duplicate[1].status,'duplicate');
});

test('confirmation can start equipment editing only with version edit permission',()=>{
 function allowed(editable,granted){const ctx={document:{readyState:'loading',addEventListener(){}},editableVersion:()=>editable,can:cap=>granted.includes(cap),canEditEquipment:()=>false};ctx.globalThis=ctx;vm.runInNewContext(source,ctx);return ctx.ISTWiSpecSync.mayStartEditing()}
 assert.equal(allowed(true,['equipment.edit']),true);
 assert.equal(allowed(true,['jig.edit']),true);
 assert.equal(allowed(true,[]),false);
 assert.equal(allowed(false,['equipment.edit']),false);
});
test('original workbook is private and scoped to the exact Model/Version',()=>{
 const api=parser();assert.equal(api.processMapPrefix({_remote:{modelId:'model-a',versionId:'version-1'}}),'model-a/process-map/version-1/');
 assert.notEqual(api.processMapPrefix({_remote:{modelId:'model-a',versionId:'version-1'}}),api.processMapPrefix({_remote:{modelId:'model-a',versionId:'version-2'}}));
 assert.throws(()=>api.processMapPrefix({}));
 assert.match(html,/id="processMapOriginalDownloadBtn"/);
 assert.match(source,/persistenceBridge\.uploadAsset/);
 assert.match(source,/persistenceBridge\.getAssetUrl/);
});

test('confirming ready Jig from Viewer enters edit mode and applies once when authorized',async()=>{
 const station={id:'s1',name:'PRESS',jigs:[]},current={name:'S958',version:'Ver 1',processes:[station]};
 const pending={key:'S958::Ver 1',items:[{status:'ready',station,newJig:'PRESS JIG',spec:'Áp lực: 5,5 ± 0,5 kgf/㎠'}]};
 let editing=false,saved=0,snapshots=0,closed=0;
 const ctx={testPending:pending,document:{readyState:'loading',addEventListener(){},getElementById(){return{close(){closed++}}}},model:()=>current,getJigs:s=>s.jigs,canEditEquipment:()=>editing,editableVersion:()=>true,can:c=>c==='equipment.edit',enterEditMode:()=>{editing=true},confirm:()=>true,alert(){},snapshot(){snapshots++},renderAll(){},scheduleSave(){saved++}};
 ctx.globalThis=ctx;
 vm.runInNewContext(source.replace('let pending=null;','let pending=globalThis.testPending;').replace('globalThis.ISTWiSpecSync={','globalThis.ISTWiSpecSync={apply,'),ctx);
 await ctx.ISTWiSpecSync.apply();
 assert.equal(editing,true);assert.equal(station.jigs.length,1);assert.equal(station.jigs[0].name,'PRESS JIG');assert.equal(saved,1);assert.equal(snapshots,1);assert.equal(closed,1);
});
