/* Viewer navigation changes only the camera, never saved object geometry. */
function viewerContentBounds(objects,page){
 const boxes=objects.filter(object=>object.layoutId&&object.visible!==false).map(object=>object.getBoundingRect()).map(box=>({left:Math.max(0,box.left),top:Math.max(0,box.top),right:Math.min(page.width,box.left+box.width),bottom:Math.min(page.height,box.top+box.height)})).filter(box=>box.right>box.left&&box.bottom>box.top);
 if(!boxes.length)return{left:0,top:0,width:page.width,height:page.height};
 const left=Math.min(...boxes.map(box=>box.left)),top=Math.min(...boxes.map(box=>box.top));
 return{left,top,width:Math.max(...boxes.map(box=>box.right))-left,height:Math.max(...boxes.map(box=>box.bottom))-top};
}
function viewerFitTransform(bounds,width,height){
 const zoom=Math.max(.01,Math.min(4,(width-64)/Math.max(1,bounds.width),(height-64)/Math.max(1,bounds.height)));
 return[zoom,0,0,zoom,width/2-(bounds.left+bounds.width/2)*zoom,height/2-(bounds.top+bounds.height/2)*zoom];
}
function singlePageScale(contentWidth,contentHeight,availableWidth,availableHeight){return Math.min(1,availableWidth/Math.max(1,contentWidth),availableHeight/Math.max(1,contentHeight))*.995}

(()=>{
 const compact=()=>matchMedia('(max-width: 768px), (max-height: 500px) and (max-width: 950px)').matches;
 const viewing=()=>!layoutEditing&&document.body.classList.contains('viewer-mode')&&!compact();
 let fittedModel=null;
 function refreshCamera(){shapeZoom=fabricLayoutCanvas.getZoom();if($('shapeZoomReset'))$('shapeZoomReset').textContent=Math.round(shapeZoom*100)+'%';renderOfficeRulers();syncOfficePanControls();fabricLayoutCanvas.requestRenderAll()}
 function fitContent(){
  if(!viewing()||!fabricLayoutCanvas)return;
  const host=document.querySelector('#professionalEditorShell .pro-canvas-host');if(!host||!host.getClientRects().length)return;
  const rect=host.getBoundingClientRect(),width=Math.max(1,Math.floor(rect.width)),height=Math.max(240,Math.floor(innerHeight-rect.top-12));
  host.style.setProperty('--viewer-height',height+'px');fabricLayoutCanvas.setDimensions({width,height});
  const page=odoc().canvas,bounds=viewerContentBounds(fabricLayoutCanvas.getObjects(),{width:page.widthMeters*page.pixelsPerMeter,height:page.heightMeters*page.pixelsPerMeter});
  fabricLayoutCanvas.setViewportTransform(viewerFitTransform(bounds,width,height));fabricLayoutCanvas.calcOffset();refreshCamera();
 }
 function bindNavigation(){
  if(!viewing()||!fabricLayoutCanvas)return;const canvas=fabricLayoutCanvas,upper=canvas.upperCanvasEl;
  if(!upper||upper.dataset.viewerNavigation)return;upper.dataset.viewerNavigation='true';
  let drag=null;
  upper.addEventListener('wheel',event=>{if(!viewing())return;event.preventDefault();event.stopImmediatePropagation();const rect=upper.getBoundingClientRect(),delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rect.height:1),zoom=Math.max(.02,Math.min(6,canvas.getZoom()*Math.exp(-delta*.0015)));canvas.zoomToPoint(new fabric.Point((event.clientX-rect.left)*canvas.width/rect.width,(event.clientY-rect.top)*canvas.height/rect.height),zoom);refreshCamera()},{passive:false,capture:true});
  upper.addEventListener('pointerdown',event=>{if(!viewing()||event.pointerType==='touch'||![0,1].includes(event.button))return;event.preventDefault();event.stopImmediatePropagation();drag={id:event.pointerId,x:event.clientX,y:event.clientY};upper.setPointerCapture(event.pointerId);upper.classList.add('viewer-dragging')},true);
  upper.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId||!viewing())return;event.preventDefault();event.stopImmediatePropagation();const rect=upper.getBoundingClientRect(),v=canvas.viewportTransform.slice();v[4]+=(event.clientX-drag.x)*canvas.width/rect.width;v[5]+=(event.clientY-drag.y)*canvas.height/rect.height;drag.x=event.clientX;drag.y=event.clientY;canvas.setViewportTransform(v);refreshCamera()},true);
  const finish=event=>{if(!drag||drag.id!==event.pointerId)return;event.stopImmediatePropagation();if(upper.hasPointerCapture(event.pointerId))upper.releasePointerCapture(event.pointerId);drag=null;upper.classList.remove('viewer-dragging')};
  upper.addEventListener('pointerup',finish,true);upper.addEventListener('pointercancel',finish,true);
  upper.addEventListener('mousedown',event=>{if(viewing()){event.preventDefault();event.stopImmediatePropagation()}},true);
  upper.addEventListener('contextmenu',event=>{if(viewing()){event.preventDefault();event.stopImmediatePropagation()}},true);
  upper.addEventListener('dblclick',event=>{if(viewing()){event.preventDefault();event.stopImmediatePropagation();fitContent()}},true);
 }
 const baseRender=renderShapesCanvas;
 renderShapesCanvas=function(){baseRender();requestAnimationFrame(()=>{if(!viewing())return;bindNavigation();if(fittedModel!==model()){fittedModel=model();fitContent()}})};
 const baseViewerFit=fitOfficeViewerWidth;
 fitOfficeViewerWidth=function(fit=true){if(viewing()&&fit)return fitContent();return baseViewerFit(fit)};
 const baseFitButton=$('shapeFitLayout').onclick;
 $('shapeFitLayout').onclick=()=>viewing()?fitContent():baseFitButton();
 $('shapeFitLayout').title='Vừa toàn bộ công đoạn và thiết bị';
 requestAnimationFrame(()=>{bindNavigation();fitContent();fittedModel=model()});

 function table(headers,rows){return'<table><thead><tr>'+headers.map(value=>'<th>'+esc(value)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
 function reportContent(view,layoutMode){
  const current=model(),value=metrics(),rows=current.processes||[],facts=`<div class="metrics"><b>LOB ${(value.lob*100).toFixed(1)}%</b><b>Neck ${value.neck.toFixed(2)} s</b><b>UPH ${Math.round(value.uph)}</b><b>MP ${value.mp}</b><b>${rows.length} công đoạn</b></div>`;
  if(view==='processes'){
   renderLobChart();const chart=$('lobChart').querySelector('svg')?.outerHTML||'';
   return facts+'<div class="chart">'+chart+'</div>'+table(['STT','Công đoạn','T/T (s)','MP','Neck %','ĐKN','Auto','Thiết bị / Jig · Setup (phút)','Tổng setup','Trạng thái'],rows.map((row,index)=>{const jigs=getJigs(row);return[index+1,row.name,stationTime(row).toFixed(2),row.mp??0,value.neck?(stationCycle(row)/value.neck*100).toFixed(1):'—',skillLabel(row)||'—',row.auto?'AUTO':'—',jigs.map(jig=>(jig.name||jig.eqType||jig.type||'—')+' · '+(Number(jig.setup)||0)).join('; '),jigs.reduce((sum,jig)=>sum+(Number(jig.setup)||0),0).toFixed(1),stationTime(row)>0?'Đã đo':'Chưa đo']}));
  }
  if(view==='jigs')return facts+table(['STT','Công đoạn','Loại','Thiết bị / Jig','Thông số','Setup (phút)'],rows.flatMap((row,index)=>getJigs(row).map(jig=>[index+1,row.name,jig.eqType||jig.type||'—',jig.name||'—',jig.spec||'—',Number(jig.setup||jig.setupTimeMin||0).toFixed(1)])));
  const image=layoutMode==='excel'?$('excelReferenceImage')?.src:phase2dLayoutImage();
  if(!image)throw new Error('Không có ảnh Layout để in.');
  return facts+`<img class="layout-image" alt="Layout" src="${esc(image)}"><p class="legend">T/T: Thời gian · MP: Nhân lực · AUTO: Tự động · ĐKN: Đa kỹ năng</p>`;
 }
 function publishedLayoutMode(){
  const data=model(),mode=data?.viewerLayoutSource;
  if(mode==='edited')return'interactive';
  if(mode==='reference')return'excel';
  const hasReference=!!(data?.referenceAsset?.path||data?.referenceImage||data?.referenceSourceAsset?.path||data?.sourceExcelAsset?.path);
  return hasReference?'excel':'interactive';
 }
 function displayedLayoutMode(){
  const panel=$('layoutReferenceInline'),image=$('layoutReferenceInlineImage');
  if(globalThis.ISTReferenceViewer?.active?.()||panel&&!panel.hidden)return'excel';
  const canvas=$('professionalEditorShell');
  if(canvas&&!canvas.hidden&&canvas.getClientRects().length)return'interactive';
  return publishedLayoutMode();
 }
 function waitForPublishedReference(){
  const image=$('excelReferenceImage');
  if(!image)return Promise.reject(new Error('Không tìm thấy ảnh PDF / Excel gốc.'));
  if(image.complete&&image.naturalWidth>0&&!image.hidden)return Promise.resolve();
  if(typeof renderExcelReference==='function')renderExcelReference();
  return new Promise((resolve,reject)=>{
   let done=false,timer;
   const finish=error=>{if(done)return;done=true;clearTimeout(timer);image.removeEventListener('load',loaded);image.removeEventListener('error',failed);error?reject(error):resolve();};
   const loaded=()=>finish(),failed=()=>finish(new Error('Không tải được PDF / Excel đã Pushlist.'));
   image.addEventListener('load',loaded);image.addEventListener('error',failed);
   timer=setTimeout(()=>finish(new Error('Hết thời gian tải file gốc. Hãy kiểm tra mạng và thử lại.')),12000);
   if(image.complete&&image.naturalWidth>0&&!image.hidden)finish();
  });
 }
 function processSetupPages(current,paper,orientation){
  const rows=(current.processes||[]).filter(row=>row.isActive!==false);
  if(!rows.length)return '';
  const perPage=orientation==='portrait'?(paper==='A3'?13:10):(paper==='A3'?20:14);
  const pages=[];
  for(let start=0;start<rows.length;start+=perPage){
   const chunk=rows.slice(start,start+perPage);
   const body=chunk.map((row,idx)=>{
    const jigs=typeof getJigs==='function'?getJigs(row):row.jigs||[];
    const details=jigs.map(j=>{
     const spec=String(j.spec||'').trim(),label=String(j.name||j.eqType||j.type||'Jig');
     return label+(spec?' · '+spec:'');
    }).join('; ')||String(row.equipment||row.equipmentName||row.machineName||'—');
    const value=typeof stationTime==='function'?stationTime(row):Number(row.tt||row.time||0);
    return '<tr><td class="setup-no">'+(start+idx+1)+'</td><td class="setup-process">'+esc(row.name||'—')+'</td><td>'+esc(Number.isFinite(value)?Number(value).toFixed(2):'—')+'</td><td>'+esc(String(row.mp??row.manpower??0))+'</td><td class="setup-equip">'+esc(details)+'</td></tr>';
   }).join('');
   const index=pages.length+1,total=Math.ceil(rows.length/perPage);
   pages.push('<section class="page setup-sheet"><header><div><b>IL-SUNG TECH · DANH SÁCH CÔNG ĐOẠN SETUP</b><h1>'+esc(current.name)+' · '+esc(current.version)+'</h1></div><p>Trang công đoạn '+index+'/'+total+'</p></header><main><div class="setup-content"><table class="setup-process-table"><thead><tr><th>STT</th><th>TÊN CÔNG ĐOẠN</th><th>T/T (s)</th><th>MP</th><th>THIẾT BỊ / JIG · THÔNG SỐ SETUP</th></tr></thead><tbody>'+body+'</tbody></table></div></main><footer><span>Danh sách công đoạn phục vụ setup tại chuyền · '+rows.length+' công đoạn</span><span>'+paper+' · '+(orientation==='landscape'?'Ngang':'Dọc')+'</span></footer></section>');
  }
  return pages.join('');
 }
 async function optimizedLayoutImage(source){
  // Trim blank margins only for printing. Saved PDF/image assets are never modified.
  const image=new Image();image.crossOrigin='anonymous';image.src=source;
  try{await image.decode()}catch{return source}
  try{
   const width=image.naturalWidth,height=image.naturalHeight;
   if(width<100||height<100)return source;
   const factor=Math.min(1,1400/Math.max(width,height)),w=Math.max(1,Math.round(width*factor)),h=Math.max(1,Math.round(height*factor));
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return source;
   ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(image,0,0,w,h);
   const data=ctx.getImageData(0,0,w,h).data;
   let left=w,top=h,right=-1,bottom=-1;
   // Ignore tiny compression artifacts; preserve any dark text, graphics and borders.
   for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){
    const n=(y*w+x)*4,r=data[n],g=data[n+1],b=data[n+2];
    if(Math.min(r,g,b)<215){
     left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
   }
   if(right<left||bottom<top)return source;
   const margin=Math.max(8,Math.round(Math.min(w,h)*.015));
   left=Math.max(0,left-margin);top=Math.max(0,top-margin);
   right=Math.min(w,right+margin);bottom=Math.min(h,bottom+margin);
   const croppedWidth=right-left,croppedHeight=bottom-top;
   if(croppedWidth>=w*.96&&croppedHeight>=h*.96)return source;
   // Reject accidental tiny bounding boxes.
   if(croppedWidth<w*.15||croppedHeight<h*.12)return source;
   const result=document.createElement('canvas');result.width=Math.round(croppedWidth/factor);result.height=Math.round(croppedHeight/factor);
   const output=result.getContext('2d');output.fillStyle='#fff';output.fillRect(0,0,result.width,result.height);
   output.drawImage(image,left/factor,top/factor,croppedWidth/factor,croppedHeight/factor,0,0,result.width,result.height);
   return result.toDataURL('image/png');
  }catch{return source} // Cross-origin or unsupported images retain original printing.
 }
 function openSetup(){
  if(activeView!=='overview')return printOnePage(activeView);
  const current=model(),visible=displayedLayoutMode();
  let dialog=document.getElementById('layoutPrintSourceDialog');
  if(!dialog){
   dialog=document.createElement('dialog');dialog.id='layoutPrintSourceDialog';
   dialog.style.cssText='border:0;border-radius:12px;padding:22px;width:min(420px,calc(100vw - 32px));box-shadow:0 20px 65px #0004;color:#123047';
   dialog.innerHTML='<h2 style="margin:0 0 8px;font-size:19px">Chọn bản cần in</h2><p id="layoutPrintSourceModel" style="margin:0 0 16px;color:#526575;font-size:13px"></p><div style="display:grid;gap:9px"><button type="button" class="btn" data-layout-print-source="excel" style="text-align:left;padding:13px">In bản PDF / Excel gốc</button><button type="button" class="btn" data-layout-print-source="interactive" style="text-align:left;padding:13px">In Layout Web</button><button type="button" class="btn" id="layoutPrintSourceCancel">Hủy</button></div><p style="font-size:12px;margin:12px 0 0;color:#526575">Tự Fit toàn bộ Layout trên 1 trang A4 ngang.</p>';
   document.body.appendChild(dialog);
   dialog.querySelector('#layoutPrintSourceCancel').onclick=()=>dialog.close();
  }
  dialog.querySelector('#layoutPrintSourceModel').textContent=current.name+' · '+current.version;
  const hasReference=!!(current.referenceAsset?.path||current.referenceImage||current.referenceSourceAsset?.path||current.sourceExcelAsset?.path||$('excelReferenceImage')?.getAttribute('src')||visible==='excel');
  for(const button of dialog.querySelectorAll('[data-layout-print-source]')){
   const source=button.dataset.layoutPrintSource;
   button.disabled=source==='excel'&&!hasReference;
   button.classList.toggle('primary',source===visible);
   button.textContent=(source==='excel'?'In bản PDF / Excel gốc':'In Layout Web')+(source===visible?' · Đang hiển thị':'');
   button.onclick=()=>{if(button.disabled)return;dialog.close();if(model()!==current)return toast('Model đã thay đổi, hãy in lại.');printSelectedLayout(source);};
  }
  if(!dialog.open)dialog.showModal();
 }
 async function printSelectedLayout(mode){
  const current=model();
  try{
   let image;
   if(mode==='excel'){
    const inline=$('layoutReferenceInlineImage');
    if(displayedLayoutMode()==='excel'&&inline?.complete&&inline.naturalWidth>0&&!inline.hidden)image=inline.src;
    else{await waitForPublishedReference();image=$('excelReferenceImage')?.src;}
   }else image=phase2dLayoutImage();
   if(model()!==current)throw Error('Model đã thay đổi, hãy in lại.');
   if(!image)throw Error('Không có Layout đang hiển thị để in.');
   const cropped=await optimizedLayoutImage(image);
   if(model()!==current)throw Error('Model đã thay đổi, hãy in lại.');
   return printOnePage('overview',mode,{image:cropped,scale:100});
  }catch(error){toast('Không thể chuẩn bị bản in: '+error.message)}
 }
 async function printOnePage(view=activeView,layoutMode='interactive',options={}){
  const paper='A4',orientation='landscape';
  const pageSizes={A4:{landscape:[285,197],portrait:[198,285]},A3:{landscape:[408,285],portrait:[285,408]}};
  const [pageWidth,pageHeight]=view==='overview'?[288,200]:pageSizes[paper][orientation];
  const requestedScale=Math.max(45,Math.min(100,Number(options.scale)||100))/100;
  let frame;
  try{
   if(view==='overview'&&layoutMode==='excel'&&!options.image)await waitForPublishedReference();
   const content=view==='overview'?'<img class="layout-image" alt="Layout để setup" src="'+esc(options.image||await optimizedLayoutImage(layoutMode==='excel'?$('excelReferenceImage').src:phase2dLayoutImage()))+'">':reportContent(view,layoutMode);
   const current=model(),title=({overview:'Layout',processes:'Thông tin LOB',jigs:'Thiết bị & Jig'})[view]||'Layout';
   document.getElementById('singlePagePrintFrame')?.remove();frame=document.createElement('iframe');frame.id='singlePagePrintFrame';frame.title='Bản in '+paper;frame.style.cssText='position:fixed;left:-12000px;top:0;width:1122px;height:794px;border:0';
   const loaded=new Promise(resolve=>frame.onload=resolve);
   frame.srcdoc=`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title+' · '+current.name)}</title><style>
    @page{size:${paper} ${orientation};margin:${view==='overview'?4:6}mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#163441;font-family:Arial,sans-serif;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:${pageWidth}mm;height:${pageHeight}mm;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:1mm}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #7f999f;padding:1mm 0}h1{font-size:16px;margin:2px 0}header p{margin:0}main{position:relative;min-height:0;overflow:hidden}.content{position:absolute;top:0;left:0;width:100%;transform-origin:top left}footer{display:flex;justify-content:space-between;font-size:9px;border-top:1px solid #b9cacc;padding-top:1mm}.metrics{display:flex;gap:18px;padding:5px 0}.chart{height:40mm;margin:2mm 0}.chart svg{width:100%;height:100%;min-width:0;max-width:100%}.page{page-break-after:always;break-after:page}.page:last-child{page-break-after:auto;break-after:auto}.setup-sheet main{overflow:visible}.setup-content{width:100%;height:100%}.setup-process-table{font-size:14px;table-layout:fixed;width:100%;line-height:1.3}.setup-process-table th{font-size:14px;background:#dcebef;color:#0d3043;padding:8px 7px}.setup-process-table td{font-size:14px;padding:8px 7px;white-space:normal;vertical-align:middle}.setup-process-table th:nth-child(1){width:7%}.setup-process-table th:nth-child(2){width:37%}.setup-process-table th:nth-child(3){width:9%}.setup-process-table th:nth-child(4){width:7%}.setup-process-table th:nth-child(5){width:40%}.setup-process-table .setup-process{font-weight:750;color:#0b2a42}.setup-sheet h1{font-size:20px}.setup-sheet footer{font-size:11px}.layout-image{display:block;width:100%;height:100%;object-fit:contain;object-position:center}.layout-only{grid-template-rows:auto minmax(0,1fr);gap:1mm}.layout-only footer{display:none}.layout-only .content{height:100%;width:100%}.layout-only header{padding:0;border-bottom:0}.layout-only h1{font-size:13px;margin:0}.layout-only header b{font-size:9px}.legend{margin:2px 0;font-size:10px}table{border-collapse:collapse;table-layout:auto;width:100%;font-size:10px}th,td{border:1px solid #bacace;padding:3px 4px;text-align:left;overflow-wrap:anywhere;vertical-align:middle}th{background:#e7f1ee}tr:nth-child(even){background:#f5f8f7}thead{display:table-header-group}tr{break-inside:avoid}button,input,select{display:none}body{overflow:visible}
    </style></head><body><section class="page ${view==='overview'?'layout-only':''}"><header><div><b>IL-SUNG TECH · ${esc(title)}</b><h1>${esc(current.name)} · ${esc(current.version)}</h1></div><p>Rev ${esc(current._remote?.revision??'—')} · ${new Date().toLocaleDateString('vi-VN')}</p></header><main><div class="content">${content}</div></main><footer><span>${esc(title)} · ${esc(current.name)}</span><span>${paper} ${orientation==='landscape'?'ngang':'dọc'} · 1/1</span></footer></section></body></html>`;
   document.body.appendChild(frame);await loaded;const doc=frame.contentDocument,win=frame.contentWindow;
   await doc.fonts.ready;await Promise.all([...doc.images].map(img=>img.decode()));
   const box=doc.querySelector('main'),sheet=doc.querySelector('.content'),scale=(view==='overview'?1:singlePageScale(sheet.scrollWidth,sheet.scrollHeight,box.clientWidth,box.clientHeight))*requestedScale;sheet.style.left=Math.max(0,(box.clientWidth-sheet.scrollWidth*scale)/2)+'px';sheet.style.transform=`scale(${scale})`;
   win.addEventListener('afterprint',()=>setTimeout(()=>frame.remove(),0),{once:true});win.focus();win.print();
  }catch(error){frame?.remove();toast('Không thể chuẩn bị bản in: '+error.message)}
 }
 printCurrentView=function(layoutMode){return activeView==='overview'?openSetup():printOnePage(activeView,layoutMode)};
 const detailPrint=printOffice;
 printOffice=function(mode){return mode==='detail'?detailPrint(mode):openSetup()};
 globalThis.ISTViewerPrinting={fitContent,printOnePage,reportContent,openSetup,publishedLayoutMode};
})();

