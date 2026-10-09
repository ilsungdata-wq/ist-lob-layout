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
 async function printOnePage(view=activeView,layoutMode='interactive'){
  let frame;
  try{
   const content=reportContent(view,layoutMode),current=model(),title=({overview:'Layout',processes:'Thông tin LOB',jigs:'Thiết bị & Jig'})[view]||'Layout';
   document.getElementById('singlePagePrintFrame')?.remove();frame=document.createElement('iframe');frame.id='singlePagePrintFrame';frame.title='Bản in A4';frame.style.cssText='position:fixed;left:-12000px;top:0;width:1122px;height:794px;border:0';
   const loaded=new Promise(resolve=>frame.onload=resolve);
   frame.srcdoc=`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title+' · '+current.name)}</title><style>
    @page{size:A4 landscape;margin:6mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#163441;font-family:Arial,sans-serif;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:285mm;height:197mm;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:2mm}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #7f999f;padding:1mm 0}h1{font-size:16px;margin:2px 0}header p{margin:0}main{position:relative;min-height:0;overflow:hidden}.content{position:absolute;top:0;left:0;width:100%;transform-origin:top left}footer{display:flex;justify-content:space-between;font-size:9px;border-top:1px solid #b9cacc;padding-top:1mm}.metrics{display:flex;gap:18px;padding:5px 0}.chart{height:40mm;margin:2mm 0}.chart svg{width:100%;height:100%;min-width:0;max-width:100%}.layout-image{display:block;width:100%;height:151mm;object-fit:contain}.legend{margin:2px 0;font-size:10px}table{border-collapse:collapse;table-layout:auto;width:100%;font-size:10px}th,td{border:1px solid #bacace;padding:3px 4px;text-align:left;overflow-wrap:anywhere;vertical-align:middle}th{background:#e7f1ee}tr:nth-child(even){background:#f5f8f7}thead{display:table-header-group}tr{break-inside:avoid}button,input,select{display:none}body{overflow:visible}
    </style></head><body><section class="page"><header><div><b>IL-SUNG TECH · ${esc(title)}</b><h1>${esc(current.name)} · ${esc(current.version)}</h1></div><p>Rev ${esc(current._remote?.revision??'—')} · ${new Date().toLocaleDateString('vi-VN')}</p></header><main><div class="content">${content}</div></main><footer><span>${esc(title)} · ${esc(current.name)}</span><span>A4 · 1/1</span></footer></section></body></html>`;
   document.body.appendChild(frame);await loaded;const doc=frame.contentDocument,win=frame.contentWindow;
   await doc.fonts.ready;await Promise.all([...doc.images].map(img=>img.decode()));
   const box=doc.querySelector('main'),sheet=doc.querySelector('.content'),scale=singlePageScale(sheet.scrollWidth,sheet.scrollHeight,box.clientWidth,box.clientHeight);sheet.style.transform=`scale(${scale})`;
   win.addEventListener('afterprint',()=>setTimeout(()=>frame.remove(),0),{once:true});win.focus();win.print();
  }catch(error){frame?.remove();toast('Không thể chuẩn bị bản in: '+error.message)}
 }
 printCurrentView=function(layoutMode=layoutVisualMode){return printOnePage(activeView,layoutMode)};
 const detailPrint=printOffice;
 printOffice=function(mode){return mode==='detail'?detailPrint(mode):printOnePage('overview')};
 globalThis.ISTViewerPrinting={fitContent,printOnePage,reportContent};
})();
