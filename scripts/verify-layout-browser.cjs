const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end()}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/supabase-config.js*',route=>route.fulfill({contentType:'text/javascript',body:'globalThis.IST_LOB_CONFIG={};'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>typeof ISTAppHost!=='undefined');
  await page.evaluate(()=>{ISTAppHost.setSession({role:'owner',globalRole:'ADMIN',authenticated:true});enterEditMode('layout')});
  await page.waitForTimeout(600);
  const editor=await page.evaluate(async()=>{
   const rows=shapeArray(),process=model().processes[0];
   const a=makeShape('rectangle',400,180,{width:140,height:70,rotation:30,text:'COPY TEST'}),b=makeShape('worker-pink',620,220,{width:50,height:60});
   a.metadata={processId:process.id,processNo:'12'};a.layerId=b.layerId='production';proSyncWorld(a);proSyncWorld(b);rows.push(a,b);renderShapesCanvas();
   fabricLayoutCanvas.setViewportTransform([1.3,0,0,1.3,-360,-120]);shapeZoom=1.3;
   const original={x:a.x,y:a.y,width:a.width,height:a.height,rotation:a.rotation};
   const objects=fabricLayoutCanvas.getObjects().filter(o=>[a.id,b.id].includes(o.layoutId));
   fabricLayoutCanvas.setActiveObject(new fabric.ActiveSelection(objects,{canvas:fabricLayoutCanvas}));
   proCopy();const copied=structuredClone(proEditor.clipboard);proPaste();
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const view=fabricLayoutCanvas.viewportTransform.slice(),pasted=shapeArray().filter(row=>proEditor.selection.includes(row.id)).map(row=>({x:row.x,y:row.y,width:row.width,height:row.height,rotation:row.rotation}));
   const label=fabricLayoutCanvas.getObjects().find(o=>o.officeProcessLabel===a.id)?.text;
   const active=fabricLayoutCanvas.getActiveObject();active.set({left:active.left+55,top:active.top+35});active.setCoords();phase2CommitCanvasTransform();
   const moved=shapeArray().filter(row=>proEditor.selection.includes(row.id)).map(row=>({x:row.x,y:row.y}));
   const firstCopy=shapeArray().find(row=>row.id===proEditor.selection[0]);
   const copyObject=fabricLayoutCanvas.getObjects().find(o=>o.layoutId===firstCopy.id);fabricLayoutCanvas.discardActiveObject();fabricLayoutCanvas.setActiveObject(copyObject);proRenderPanels();
   const input=document.querySelector('[data-pro-meta="processNo"]');input.value='27';input.dispatchEvent(new Event('change'));
   const edited=fabricLayoutCanvas.getObjects().find(o=>o.officeProcessLabel===firstCopy.id)?.text;
   return{original,copied,pasted,view,label,moved,edited};
  });
  const close=(a,b)=>assert.ok(Math.abs(a-b)<.0001,`${a} != ${b}`);
  for(const key of ['x','y','width','height','rotation'])close(editor.copied[0][key],editor.original[key]);
  for(let i=0;i<2;i++){close(editor.pasted[i].x,editor.copied[i].x+24);close(editor.pasted[i].y,editor.copied[i].y+24);close(editor.pasted[i].width,editor.copied[i].width);close(editor.moved[i].x,editor.pasted[i].x+55);close(editor.moved[i].y,editor.pasted[i].y+35)}
  assert.deepEqual(editor.view,[1.3,0,0,1.3,-360,-120]);assert.equal(editor.label,'12');assert.equal(editor.edited,'27');
  console.log('PASS editor: rotated multi-copy, group movement, viewport stability, editable process labels');
  await page.screenshot({path:path.join(root,'../page-edit-verified.png'),fullPage:false});
  const preview=await page.evaluate(async()=>{
   const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['LAYOUT ORIGINAL'],[1,2,3],['IQC','PRESS','OQC'],[1,2,1],[12,15,10],['T/T']]),'Layout TEST');
   const data=XLSX.write(book,{type:'array',bookType:'xlsx'}),cfb=XLSX.CFB.read(new Uint8Array(data),{type:'array'});
   const entry=cfb.FileIndex[cfb.FullPaths.findIndex(p=>p.endsWith('/xl/worksheets/sheet1.xml'))];let sheet=new TextDecoder().decode(entry.content);sheet=sheet.replace('</worksheet>','<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rDrawing"/></worksheet>');
   const add=(name,text)=>XLSX.CFB.utils.cfb_add(cfb,name,new TextEncoder().encode(text));add('xl/worksheets/sheet1.xml',sheet);
   add('xl/worksheets/_rels/sheet1.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rDrawing" Target="../drawings/drawing1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"/></Relationships>');
   add('xl/drawings/drawing1.xml','<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:row>7</xdr:row></xdr:from><xdr:to><xdr:col>5</xdr:col><xdr:row>13</xdr:row></xdr:to><xdr:sp><xdr:spPr><a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="00AA44"/></a:solidFill></xdr:spPr><xdr:txBody><a:bodyPr anchor="ctr"/><a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="1800" b="1"/><a:t>NEW LAYOUT</a:t></a:r></a:p></xdr:txBody></xdr:sp></xdr:twoCellAnchor></xdr:wsDr>');
   const raster=document.createElement('canvas');raster.width=raster.height=8;raster.getContext('2d').fillStyle='#d979c5';raster.getContext('2d').fillRect(0,0,8,8);
   const png=Uint8Array.from(atob(raster.toDataURL().split(',')[1]),c=>c.charCodeAt(0));XLSX.CFB.utils.cfb_add(cfb,'xl/media/image1.png',png);
   add('xl/drawings/_rels/drawing1.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="picture1" Target="../media/image1.png" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/></Relationships>');
   const drawingEntry=cfb.FileIndex[cfb.FullPaths.findIndex(p=>p.endsWith('/xl/drawings/drawing1.xml'))];
   add('xl/drawings/drawing1.xml',new TextDecoder().decode(drawingEntry.content).replace('</xdr:wsDr>','<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:row>7</xdr:row></xdr:from><xdr:ext cx="381000" cy="381000"/><xdr:pic><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="picture1"/></xdr:blipFill><xdr:spPr/></xdr:pic></xdr:oneCellAnchor></xdr:wsDr>'));
   const file=new File([XLSX.CFB.write(cfb,{type:'buffer',fileType:'zip'})],'layout-test.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
   const wb=XLSX.read(await file.arrayBuffer(),{type:'array',bookFiles:true,cellStyles:true}),result=ISTExcelReference.preview(wb,'Layout TEST');
   const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=result.dataUrl});
   const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);
   const color=Array.from(canvas.getContext('2d').getImageData(70,145,1,1).data);
   window.testExcelFile=file;
   return{shapes:result.shapes,images:result.images,svg:result.svg,width:image.naturalWidth,color,picture:Array.from(canvas.getContext('2d').getImageData(10,150,1,1).data)};
  });
  assert.equal(preview.shapes,1);assert.equal(preview.images,1);assert.deepEqual(preview.picture,[217,121,197,255]);assert.match(preview.svg,/NEW LAYOUT/);assert.match(preview.svg,/IQC/);assert.deepEqual(preview.color,[0,170,68,255]);
  console.log('PASS original Excel preview: sheet values, DrawingML shape, rendered pixels');
  await page.evaluate(()=>{window.importJob=importExcelWorkbook(window.testExcelFile)});
  await page.locator('#importPreviewDialog').waitFor({state:'visible'});
  await page.locator('#confirmImportPreviewBtn').click();await page.evaluate(()=>window.importJob);
  const imported=await page.evaluate(()=>({name:model().name,ref:model().referenceImage,processes:model().processes.length}));
  assert.equal(imported.name,'TEST');assert.equal(imported.processes,3);assert.match(imported.ref,/^data:image\/svg\+xml;base64,/);
  await page.locator('#openExcelReferenceBtn').click();
  await page.waitForFunction(()=>document.getElementById('excelReferenceImage').naturalWidth>0&&!document.getElementById('excelReferenceImage').hidden);
  await page.screenshot({path:path.join(root,'../excel-reference-verified.png'),fullPage:false});
  console.log('PASS upload Excel -> import -> View Original Excel');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1;server.close()});
