import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const print=read('viewer-print-ux.js');
const studio=read('studio.js');
const html=read('index.html');
const styles=read('overrides.css');

const start=print.indexOf(' function publishedLayoutMode(){');
const end=print.indexOf(' function displayedLayoutMode(){',start);
assert.ok(start>=0&&end>start,'source selector must be available');

function publishedSource(data){
 const context=vm.createContext({model:()=>data});
 vm.runInContext(print.slice(start,end),context);
 return context.publishedLayoutMode();
}

test('published source remains the fallback when no active display is available',()=>{
 assert.equal(publishedSource({viewerLayoutSource:'reference',referenceAsset:{path:'saved.pdf'}}),'excel');
 assert.equal(publishedSource({viewerLayoutSource:'edited',referenceAsset:{path:'saved.pdf'}}),'interactive');
 assert.equal(publishedSource({referenceAsset:{path:'saved.png'}}),'excel');
 assert.equal(publishedSource({}),'interactive');
 assert.match(studio,/ISTViewerPrinting\?\.openSetup/);
 assert.match(print,/function openSetup\(/);
 assert.doesNotMatch(studio,/function openPrintChoice\(\)\{[^}]*showModal/);
});

test('direct browser print fits one A4 landscape page with full image',()=>{
 assert.doesNotMatch(print,/layoutPrintSetupDialog/);
 assert.match(print,/const paper='A4',orientation='landscape'/);
 assert.match(print,/object-fit:contain;object-position:center/);
 assert.match(print,/layout-only \.content\{height:100%;width:100%\}/);
 assert.match(print,/singlePageScale\(sheet\.scrollWidth/);
 assert.match(html,/viewer-print-ux\.js\?v=[^"']+/);
});

test('visible PDF has priority even when saved source is edited (S936)',()=>{
 const a=print.indexOf(' function displayedLayoutMode(){'),b=print.indexOf(' function waitForPublishedReference(){',a);
 const context=vm.createContext({$:id=>id==='layoutReferenceInline'?{hidden:false}:null,publishedLayoutMode:()=> 'interactive',globalThis:{}});
 vm.runInContext(print.slice(a,b),context);
 assert.equal(context.displayedLayoutMode(),'excel');
});
test('two source choices default to visible layout and open native print',()=>{
 assert.match(print,/visible=displayedLayoutMode\(\)/);
 assert.match(print,/id='layoutPrintSourceDialog'/);
 assert.match(print,/data-layout-print-source="excel"/);
 assert.match(print,/data-layout-print-source="interactive"/);
 assert.match(print,/printSelectedLayout\(source\)/);
 assert.match(print,/image:cropped,scale:100/);
 assert.match(print,/win\.print\(\)/);
 assert.doesNotMatch(print,/model\(\)\.viewerLayoutSource\s*=/);
});
