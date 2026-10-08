import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs';

const office=fs.readFileSync(new URL('../office-page-editor.js',import.meta.url),'utf8');
const fabric=fs.readFileSync(new URL('../fabric-engine.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('Phase 2D Save commits Fabric transforms and keeps revision save explicit',()=>{
 assert.match(office,/async function phase2dSaveLayout\(\)/);
 assert.match(office,/phase2CommitCanvasTransform\(\)/);
 assert.match(office,/await saveCurrent\('LAYOUT'\)/);
 assert.match(office,/Revision \$\{revision\}/);
 assert.doesNotMatch(office,/phase2dSaveLayout[\s\S]{0,500}publish/i);
});

test('Phase 2D inline text supports Enter, Shift+Enter and Escape at the Fabric viewport position',()=>{
 assert.match(office,/function phase2dViewportPoint\(object\)/);
 assert.match(office,/event\.key==='Enter'&&!event\.shiftKey/);
 assert.match(office,/event\.key==='Escape'/);
 assert.match(office,/row\.text=input\.value/);
 assert.match(office,/position:'fixed'/);
 assert.match(css,/\.fabric-inline-editor\{position:fixed/);
});

test('Phase 2D drawing ignores clicks, creates once and returns to Select',()=>{
 assert.match(office,/Math\.hypot\(end\.x-start\.x,end\.y-start\.y\)<4/);
 assert.match(office,/phase2dFinishDrawing\(end\);proSetTool\('select'\)/);
 assert.match(fabric,/path:created/);
});

test('Phase 2D page properties persist physical dimensions and Fit centers the page',()=>{
 assert.match(office,/data-page-prop/);
 assert.match(office,/canvas\.width=Math\.round\(canvas\.widthMeters\*canvas\.pixelsPerMeter\)/);
 assert.match(office,/canvas\.height=Math\.round\(canvas\.heightMeters\*canvas\.pixelsPerMeter\)/);
 assert.match(office,/requestAnimationFrame\(\(\)=>fitOffice\(\)\)/);
 assert.match(office,/fabricLayoutCanvas\.setViewportTransform\(\[zoom,0,0,zoom,x,y\]\)/);
});

test('Phase 2D print exports an identity-transform page without editor selection',()=>{
 assert.match(office,/function phase2dLayoutImage\(\)/);
 assert.match(office,/discardActiveObject\(\)/);
 assert.match(office,/setViewportTransform\(\[1,0,0,1,0,0\]\)/);
 assert.match(office,/officePrintSheet/);
});
