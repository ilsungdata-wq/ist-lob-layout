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
const end=print.indexOf(' function waitForPublishedReference(){',start);
assert.ok(start>=0&&end>start,'source selector must be available');

function publishedSource(data){
 const context=vm.createContext({model:()=>data});
 vm.runInContext(print.slice(start,end),context);
 return context.publishedLayoutMode();
}

test('print honors the selected published viewer source rather than presenting two choices',()=>{
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
 assert.match(html,/viewer-print-ux\.js\?v=20261113-published-print-v1/);
});
