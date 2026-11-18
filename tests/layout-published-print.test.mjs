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

test('print setup offers paper size, orientation, print scale and a rendered preview',()=>{
 assert.match(print,/id="layoutPrintPaper"/);
 assert.match(print,/id="layoutPrintOrientation"/);
 assert.match(print,/id="layoutPrintScale"/);
 assert.match(print,/id="layoutPrintPreviewImage"/);
 assert.match(print,/Math\.max\(45,Math\.min\(100/);
 assert.match(print,/singlePageScale\(sheet\.scrollWidth/);
 assert.match(print,/waitForPublishedReference\(\)/);
 assert.match(styles,/\.layout-print-setup-dialog/);
 assert.match(html,/viewer-print-ux\.js\?v=[^"']+/);
});

test('visible PDF has priority even when saved source is edited (S936)',()=>{
 const a=print.indexOf(' function displayedLayoutMode(){'),b=print.indexOf(' function waitForPublishedReference(){',a);
 const context=vm.createContext({$:id=>id==='layoutReferenceInline'?{hidden:false}:null,publishedLayoutMode:()=> 'interactive',globalThis:{}});
 vm.runInContext(print.slice(a,b),context);
 assert.equal(context.displayedLayoutMode(),'excel');
});
test('preview source choice controls the exact image printed without changing published state',()=>{
 assert.match(print,/const mode=displayedLayoutMode\(\)/);
 assert.match(print,/id="layoutPrintLayoutMode"/);
 assert.match(print,/selector.onchange=renderPreview/);
 assert.match(print,/options.image=dialog.querySelector\('#layoutPrintPreviewImage'\).src/);
 assert.match(print,/options.image\|\|await optimizedLayoutImage/);
 assert.match(print,/seq!==request/);
 assert.doesNotMatch(print,/model\(\)\.viewerLayoutSource\s*=/);
});
