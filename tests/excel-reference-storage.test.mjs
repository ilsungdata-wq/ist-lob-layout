import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../supabase-integration.js',import.meta.url),'utf8');
const attach=source.slice(source.indexOf('async function attachSourceWorkbook('),source.indexOf('async function importCandidates('));

test('each imported sheet stores a fresh preview and original workbook without keeping an old image',async()=>{
 const calls=[];
 const context={File,crypto,layoutService:{async uploadAsset(model,file,options){calls.push({model,file,path:options.path});return{path:model+'/'+options.path,record:{id:'asset-'+calls.length}}}}};
 vm.createContext(context);vm.runInContext(attach,context);
 const candidate={sourceFile:new File(['source bytes'],'layout.xlsm'),sheetName:'Layout A',referenceSvg:'<svg xmlns="http://www.w3.org/2000/svg"><text>NEW</text></svg>'};
 const payload={referenceImage:'old image',referenceAsset:{path:'old path'}};
 await context.attachSourceWorkbook('model1',candidate,payload);
 assert.equal(calls.length,2);
 assert.equal(calls[0].file.type,'application/vnd.ms-excel.sheet.macroenabled.12');
 assert.equal(await calls[0].file.text(),'source bytes');
 assert.equal(await calls[1].file.text(),candidate.referenceSvg);
 assert.equal(calls[1].file.type,'image/svg+xml');
 assert.equal(payload.sourceExcelAsset.sheetName,'Layout A');
 assert.match(payload.referenceAsset.path,/model1\/excel-reference\/.+\.svg$/);
 assert.equal(payload.referenceImage,undefined);
 const second={};await context.attachSourceWorkbook('model1',candidate,second);
 assert.notEqual(second.referenceAsset.path,payload.referenceAsset.path);
});

test('an image upload failure aborts the import instead of saving a version with a stale image',async()=>{
 let calls=0;const context={File,crypto,layoutService:{async uploadAsset(){if(++calls===2)throw Error('Storage failed');return{path:'source'}}}};
 vm.createContext(context);vm.runInContext(attach,context);
 await assert.rejects(context.attachSourceWorkbook('m',{sourceFile:new File(['x'],'test.xlsx'),sheetName:'Layout A',referenceSvg:'<svg/>'},{}),/Storage failed/);
});
