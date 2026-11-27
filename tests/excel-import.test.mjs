import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';
import{createRequire}from'node:module';const require=createRequire(import.meta.url),XLSX=require('../dist/xlsx.full.min.js');
const source=fs.readFileSync(new URL('../services/excel-import-utils.js',import.meta.url),'utf8'),context={};vm.createContext(context);vm.runInContext(source,context);const x=context.ISTExcelImport;
test('detects and preserves complete generic Layout model names',()=>{assert.equal(x.normalizeModelName('Layout S948'),'S948');assert.equal(x.normalizeModelName('Layout S948 Block 3'),'S948 Block 3');assert.equal(x.normalizeModelName('Layout S947 Block-3'),'S947 Block 3');assert.equal(x.normalizeModelName('Layout F731 Main'),'F731 Main');assert.equal(x.normalizeModelName('Layout F731 Sub'),'F731 Sub');assert.equal(x.isLayoutCandidate('Layout X999'),true);assert.equal(x.isLayoutCandidate('Notes'),false)});
test('stable process ids do not depend on import time',()=>{assert.equal(x.stableProcessId('S948',5,'Tape Press'),x.stableProcessId('S948',5,'Tape Press'));assert.match(x.stableProcessId('S948',5,'Tape Press'),/^process-s948-5-tape-press$/)});
test('versions sort newest first and latest remains separate from published',()=>{const rows=x.sortVersionsNewest([{version:'Ver 2',published:true},{version:'Ver 3',published:false},{version:'Ver 1',published:false}]);assert.equal(rows[0].version,'Ver 3');assert.equal(rows.find(row=>row.published).version,'Ver 2');assert.equal(x.nextVersionNumber(rows),'Ver 4')});
test('preview reports imported content and fidelity warnings',()=>{const p=x.previewSummary({data:{processes:[{mp:1,isActive:true,multiSkills:[40]},{mp:0,isActive:true}],layoutObjects:[]},media:{images:2,shapes:1},warnings:['DrawingML']});assert.deepEqual(JSON.parse(JSON.stringify(p)),{processCount:2,mp:1,layoutObjects:2,images:2,shapes:1,multiSkill:1,warnings:['DrawingML']})});
test('worksheet parser maps process name, T/T and MP without hard-coded models',()=>{const ws=XLSX.utils.aoa_to_sheet([[1,2,3],['IQC','PRESS','OQC'],[12.5,15.2,13.1],[1,2,1]]),parsed=x.parseLayoutWorksheet(XLSX,ws,'Layout F731 Main');assert.equal(parsed.modelName,'F731 Main');assert.deepEqual(JSON.parse(JSON.stringify(parsed.items.map(i=>[i.no,i.name,i.time,i.mp]))),[[1,'IQC',12.5,1],[2,'PRESS',15.2,2],[3,'OQC',13.1,1]])});
test('worksheet parser imports process and MP when T/T is blank',()=>{const ws=XLSX.utils.aoa_to_sheet([[1,2,3],['IQC','PRESS','OQC'],[1,2,1],['','',''],['','','T/T']]),parsed=x.parseLayoutWorksheet(XLSX,ws,'Layout S956');assert.deepEqual(JSON.parse(JSON.stringify(parsed.items.map(i=>[i.no,i.name,i.time,i.mp]))),[[1,'IQC',null,1],[2,'PRESS',null,2],[3,'OQC',null,1]])});
test('an existing model sheet remains an import candidate even when it only contains Excel drawing content',()=>{assert.equal(x.isLayoutCandidate('Layout S956',['S956']),true);assert.equal(x.normalizeModelName('Layout S956'),'S956')});

test('imports WLT, DINO, ATTACH and QC as real stations including zero MP and blank T/T',()=>{
 const ws=XLSX.utils.aoa_to_sheet([[1,2,3,4,5,''],['IQC','WLT','DINO','ATTACH','QC','MP'],[1,0,0,1,2,'MP'],[12,15,14,null,13,'T/T']]);
 const p=x.parseLayoutWorksheet(XLSX,ws,'Layout S958 Block 3');
 assert.deepEqual(JSON.parse(JSON.stringify(p.items.map(i=>i.name))),['IQC','WLT','DINO','ATTACH','QC']);
 assert.equal(p.items.find(i=>i.name==='WLT').mp,0);
 assert.equal(p.items.find(i=>i.name==='ATTACH').time,null);
});
test('keeps a short last process block with explicit MP/T/T labels',()=>{
 const ws=XLSX.utils.aoa_to_sheet([[1,2,3,''],['IQC','PRESS','OQC',''],[1,1,2,'MP'],[12,13,14,'T/T'],[],[4,''],['WLT',''],[0,'MP'],[15.2,'T/T']]);
 const p=x.parseLayoutWorksheet(XLSX,ws,'Layout S958 Block 3');
 assert.equal(p.items.length,4);assert.equal(p.items.at(-1).name,'WLT');assert.equal(p.items.at(-1).time,15.2);assert.equal(p.items.at(-1).mp,0);
});
test('retains a station with no process number within a recognized block',()=>{
 const ws=XLSX.utils.aoa_to_sheet([[1,2,3,null,''],['IQC','PRESS','OQC','WLT',''],[1,1,2,0,'MP'],[12,13,14,15,'T/T']]);
 const p=x.parseLayoutWorksheet(XLSX,ws,'Layout S958');assert.equal(p.items.length,4);assert.ok(p.items.some(i=>i.name==='WLT'));
});

test('preserves numbered WLT with both T/T and MP absent without inventing values',()=>{
 const ws=XLSX.utils.aoa_to_sheet([[1,2,3,4,''],['IQC','PRESS','OQC','WLT',''],[1,1,2,null,'MP'],[12,13,14,null,'T/T']]);
 const p=x.parseLayoutWorksheet(XLSX,ws,'Layout S958');const w=p.items.find(i=>i.name==='WLT');
 assert.ok(w);assert.equal(w.time,null);assert.equal(w.mp,null);assert.equal(p.items.length,4);
});
