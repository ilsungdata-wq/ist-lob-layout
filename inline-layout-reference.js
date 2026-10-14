/* Select the one layout published to Viewer: the web layout or the original PDF/Excel. */
(()=>{
  let sourceMode='edited',bound=false,lastWorkspace='',resizeFrame=0,lastCanvasSize='',resizeObserver,referenceZoom=1,drag;
  const canChooseSource=()=>!!(can('layout.edit')||can('version.publish'));
  const hasEditedLayout=()=>shapeArray().length>0;
  const selectedMode=()=>model()?.viewerLayoutSource||(hasEditedLayout()?'edited':'reference');
  const reference=()=>({panel:$('layoutReferenceInline'),image:$('layoutReferenceInlineImage')});
  const referenceActive=()=>{const {panel,image}=reference();return sourceMode==='reference'&&!!panel&&!panel.hidden&&!!image?.src&&!image.hidden};
  function updateZoomLabel(){const label=$('shapeZoomReset');if(label&&referenceActive())label.textContent=Math.round(referenceZoom*100)+'%';}
  function referenceFit(){const {panel,image}=reference();if(!referenceActive())return false;referenceZoom=1;image.style.width='';image.style.maxWidth='';image.style.maxHeight='';panel.classList.remove('reference-zoomed');panel.scrollTo({left:0,top:0,behavior:'smooth'});updateZoomLabel();return true;}
  function referenceZoomBy(factor,event){const {panel,image}=reference();if(!referenceActive())return false;const before=image.getBoundingClientRect(),base=Math.max(260,Math.min(image.naturalWidth||before.width||600,Math.max(260,panel.clientWidth-24)));const next=Math.max(.35,Math.min(4,referenceZoom*factor));if(next===referenceZoom)return true;const pointerX=event?event.clientX-panel.getBoundingClientRect().left:panel.clientWidth/2,pointerY=event?event.clientY-panel.getBoundingClientRect().top:panel.clientHeight/2;const ratioX=before.width?Math.max(0,Math.min(1,(pointerX-(before.left-panel.getBoundingClientRect().left))/before.width)):.5,ratioY=before.height?Math.max(0,Math.min(1,(pointerY-(before.top-panel.getBoundingClientRect().top))/before.height)):.5;referenceZoom=next;image.style.width=Math.round(base*next)+'px';image.style.maxWidth='none';image.style.maxHeight='none';panel.classList.add('reference-zoomed');requestAnimationFrame(()=>{panel.scrollLeft=Math.max(0,ratioX*image.offsetWidth-pointerX);panel.scrollTop=Math.max(0,ratioY*image.offsetHeight-pointerY);});updateZoomLabel();return true;}
  globalThis.ISTReferenceViewer={active:referenceActive,fit:referenceFit,zoomIn:()=>referenceZoomBy(1.25),zoomOut:()=>referenceZoomBy(.8)};
  function sync(){
    const panel=$('layoutReferenceInline'),image=$('layoutReferenceInlineImage'),status=$('layoutReferenceInlineStatus'),canvas=document.querySelector('.shapes-canvas-scroll'),office=$('professionalEditorShell'),source=$('excelReferenceImage'),control=$('layoutSourceControl'),select=$('layoutSourceSelect'),openReference=$('openExcelReferenceBtn');
    if(!panel||!image||!status||!canvas)return;
    const useReference=sourceMode==='reference',available=!!source?.getAttribute('src')&&!source.hidden;
    panel.hidden=!useReference;canvas.hidden=useReference;if(office)office.hidden=useReference;
    if(control)control.hidden=!canChooseSource();
    if(openReference)openReference.hidden=!canChooseSource();
    if(select){select.value=sourceMode;select.querySelector('option[value="reference"]').disabled=!available;}
    if(!useReference){fitViewerCanvas();return;}
    if(available){if(image.src!==source.src){referenceZoom=1;image.removeAttribute('style');panel.classList.remove('reference-zoomed');}image.src=source.src;image.hidden=false;status.textContent=$('excelReferenceName')?.textContent||'File gốc đã Pushlist';updateZoomLabel();}
    else {image.removeAttribute('src');image.hidden=true;status.textContent='Phiên bản này chưa có file PDF/Excel gốc.';}
  }
  function select(mode){
    if(!canChooseSource())return;
    if(mode===sourceMode)return;
    if(mode==='reference'&&!$('excelReferenceImage')?.getAttribute('src')){toast('Phiên bản này chưa có PDF hoặc Excel gốc để Pushlist.');return;}
    sourceMode=mode;referenceZoom=1;model().viewerLayoutSource=mode;persistLocal();scheduleSave();renderExcelReference();sync();
    toast('Đã chọn '+(mode==='reference'?'PDF đã tải lên':'Layout vẽ trên webapp')+'. Lưu rồi Pushlist để phát hành cho người xem.');
  }
  function refresh(){const workspace=`${model()?.name||''}:${model()?.version||''}`;if(workspace!==lastWorkspace){lastWorkspace=workspace;sourceMode=selectedMode();referenceZoom=1;lastCanvasSize='';}renderExcelReference();sync();}
  function fitViewerCanvas(){
    if(document.body.dataset.view!=='overview'||document.body.classList.contains('layout-editing')||sourceMode==='reference'||!fabricLayoutCanvas)return;
    const host=document.querySelector('.pro-canvas-host');if(!host)return;const rect=host.getBoundingClientRect(),width=Math.floor(rect.width),height=Math.floor(rect.height);if(width<240||height<180)return;
    const size=`${width}x${height}`;if(size===lastCanvasSize)return;lastCanvasSize=size;if(typeof resizeOfficeViewport==='function'){resizeOfficeViewport(true);return;}fabricLayoutCanvas.setDimensions({width,height});fabricLayoutCanvas.calcOffset();if(typeof proFitLayout==='function')proFitLayout();fabricLayoutCanvas.requestRenderAll();
  }
  function queueFit(){cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(fitViewerCanvas);}
  function bindReferenceNavigation(){const {panel,image}=reference();if(!panel||panel.dataset.referenceNavigation)return;panel.dataset.referenceNavigation='true';
    panel.addEventListener('wheel',event=>{if(!referenceActive())return;event.preventDefault();event.stopPropagation();referenceZoomBy(event.deltaY<0?1.16:1/1.16,event);},{passive:false,capture:true});
    panel.addEventListener('dblclick',event=>{if(!referenceActive())return;event.preventDefault();referenceFit();});
    panel.addEventListener('pointerdown',event=>{if(!referenceActive()||referenceZoom<=1||event.button!==0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:panel.scrollLeft,top:panel.scrollTop};panel.setPointerCapture(event.pointerId);panel.classList.add('reference-panning');event.preventDefault();});
    panel.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;panel.scrollLeft=drag.left-(event.clientX-drag.x);panel.scrollTop=drag.top-(event.clientY-drag.y);});
    const end=event=>{if(!drag||drag.id!==event.pointerId)return;if(panel.hasPointerCapture(event.pointerId))panel.releasePointerCapture(event.pointerId);drag=null;panel.classList.remove('reference-panning');};panel.addEventListener('pointerup',end);panel.addEventListener('pointercancel',end);
    image?.addEventListener('load',()=>{if(referenceZoom===1)referenceFit();});
  }
  function init(){
    if(bound)return;bound=true;$('layoutSourceSelect')?.addEventListener('change',event=>select(event.target.value));$('excelReferenceImage')?.addEventListener('load',sync);$('excelReferenceImage')?.addEventListener('error',sync);bindReferenceNavigation();
    const baseRenderStudio=renderStudio;renderStudio=function(){baseRenderStudio();refresh();};const baseSwitchView=switchView;switchView=function(view){baseSwitchView(view);if(view==='overview'){lastCanvasSize='';requestAnimationFrame(()=>requestAnimationFrame(()=>{queueFit();setTimeout(queueFit,80)}));}};
    const host=document.querySelector('.pro-canvas-host');if(host){resizeObserver=new ResizeObserver(queueFit);resizeObserver.observe(host);}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
