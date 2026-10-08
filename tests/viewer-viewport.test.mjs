import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../office-page-editor.js',import.meta.url),'utf8');
const extract=(name,next)=>source.slice(source.indexOf(`function ${name}(`),source.indexOf(`function ${next}(`));
function viewer(heightMeters=8){
 const canvas={widthMeters:33,heightMeters,pixelsPerMeter:100},diagram={style:{}},label={},host={height:0,getClientRects:()=>[{}],getBoundingClientRect:()=>({width:1600,top:280}),style:{setProperty(_key,value){host.height=parseFloat(value)}}};
 const fabric={setDimensions(size){Object.assign(this,size)},setViewportTransform(value){this.viewportTransform=value},calcOffset(){},requestRenderAll(){}};
 const context={layoutEditing:false,fabricLayoutCanvas:fabric,innerHeight:900,matchMedia:()=>({matches:false}),document:{querySelector:()=>host},odoc:()=>({canvas}),$:id=>id==='equipmentDiagram'?diagram:id==='shapeZoomReset'?label:{getBoundingClientRect:()=>({width:1600,height:host.height})},shapeZoom:1,renderOfficeRulers(){},syncOfficePanControls(){},refreshOffice(){}};
 vm.createContext(context);vm.runInContext(extract('fitOffice','formatOffice')+extract('fitOfficeViewerWidth','finalLeaveOffice'),context);
 return {context,canvas,host,fabric,label};
}
for(const height of [8,40])test(`reload fits the complete ${height}m page inside one compact viewport`,()=>{
 const v=viewer(height),before=JSON.stringify(v.canvas);v.context.fitOfficeViewerWidth();
 const [z,,,zy,x,y]=v.fabric.viewportTransform;
 assert.equal(v.fabric.height,v.host.height);assert.ok(v.host.height<=604);
 assert.ok(x>=0&&y>=0);assert.ok(x+3300*z<=v.fabric.width);assert.ok(y+height*100*zy<=v.fabric.height);
 assert.equal(JSON.stringify(v.canvas),before);assert.equal(v.label.textContent,Math.round(z*100)+'%');
 if(height===8)assert.ok(v.host.height<500,'wide layouts must not leave a tall empty host');
});
test('viewer sizing leaves an active editor untouched',()=>{const v=viewer();v.context.layoutEditing=true;v.context.fitOfficeViewerWidth();assert.equal(v.fabric.width,undefined)});
