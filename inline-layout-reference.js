/* Select the one layout published to Viewer: the web layout or the original PDF/Excel. */
(()=>{
  let sourceMode='edited',bound=false,lastWorkspace='',resizeFrame=0,lastCanvasSize='',resizeObserver;
  // A layout editor chooses what will be included in the next Pushlist. The
  // separate version.publish permission still governs the actual publication.
  const canChooseSource=()=>!!(can('layout.edit')||can('version.publish'));
  const hasEditedLayout=()=>shapeArray().length>0;
  const selectedMode=()=>model()?.viewerLayoutSource||(hasEditedLayout()?'edited':'reference');
  function sync(){
    const panel=$('layoutReferenceInline'),image=$('layoutReferenceInlineImage'),status=$('layoutReferenceInlineStatus'),canvas=document.querySelector('.shapes-canvas-scroll'),office=$('professionalEditorShell'),source=$('excelReferenceImage'),control=$('layoutSourceControl'),select=$('layoutSourceSelect'),openReference=$('openExcelReferenceBtn');
    if(!panel||!image||!status||!canvas)return;
    const useReference=sourceMode==='reference',available=!!source?.getAttribute('src')&&!source.hidden;
    panel.hidden=!useReference;canvas.hidden=useReference;if(office)office.hidden=useReference;
    if(control)control.hidden=!canChooseSource();
    // VIEW receives one Pushlist choice only. The original-file dialog remains
    // available solely to users who can choose the next published source.
    if(openReference)openReference.hidden=!canChooseSource();
    if(select){select.value=sourceMode;select.querySelector('option[value="reference"]').disabled=!available;}
    if(!useReference){fitViewerCanvas();return}
    if(available){image.src=source.src;image.hidden=false;status.textContent=$('excelReferenceName')?.textContent||'File gốc đã Pushlist';}
    else {image.removeAttribute('src');image.hidden=true;status.textContent='Phiên bản này chưa có file PDF/Excel gốc.';}
  }
  function select(mode){
    if(!canChooseSource())return;
    if(mode===sourceMode)return;
    if(mode==='reference'&&!$('excelReferenceImage')?.getAttribute('src')){
      toast('Phiên bản này chưa có PDF hoặc Excel gốc để Pushlist.');
      return;
    }
    sourceMode=mode;model().viewerLayoutSource=mode;persistLocal();scheduleSave();renderExcelReference();sync();
    toast('Đã chọn '+(mode==='reference'?'PDF đã tải lên':'Layout vẽ trên webapp')+'. Lưu rồi Pushlist để phát hành cho người xem.');
  }
  function refresh(){
    const workspace=`${model()?.name||''}:${model()?.version||''}`;
    if(workspace!==lastWorkspace){lastWorkspace=workspace;sourceMode=selectedMode();lastCanvasSize='';}
    renderExcelReference();sync();
  }
  function fitViewerCanvas(){
    if(document.body.dataset.view!=='overview'||document.body.classList.contains('layout-editing')||sourceMode==='reference'||!fabricLayoutCanvas)return;
    const host=document.querySelector('.pro-canvas-host');if(!host)return;
    const rect=host.getBoundingClientRect(),width=Math.floor(rect.width),height=Math.floor(rect.height);
    if(width<240||height<180)return;
    const size=`${width}x${height}`;
    // Resizing the document root on every Fabric render created a feedback loop:
    // ResizeObserver -> fit -> render -> ResizeObserver.  Viewers only need a
    // resize when their actual canvas host changes size.
    if(size===lastCanvasSize)return;
    fabricLayoutCanvas.setDimensions({width,height});
    fabricLayoutCanvas.calcOffset();
    lastCanvasSize=size;
    if(typeof proFitLayout==='function')proFitLayout();
    fabricLayoutCanvas.requestRenderAll();
  }
  function queueFit(){cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(fitViewerCanvas)}
  function init(){
    if(bound)return;bound=true;
    $('layoutSourceSelect')?.addEventListener('change',event=>select(event.target.value));
    $('excelReferenceImage')?.addEventListener('load',sync);$('excelReferenceImage')?.addEventListener('error',sync);
    $('layoutReferenceInline')?.addEventListener('wheel',event=>{const image=$('layoutReferenceInlineImage');if(sourceMode!=='reference'||!image||image.hidden)return;event.preventDefault();const current=image.getBoundingClientRect().width||image.naturalWidth||600,next=Math.max(280,Math.min((image.naturalWidth||current)*3,current*(event.deltaY<0?1.12:.89)));image.style.maxWidth='none';image.style.width=Math.round(next)+'px';},{passive:false});
    const baseRenderStudio=renderStudio;renderStudio=function(){baseRenderStudio();refresh()};
    const baseSwitchView=switchView;switchView=function(view){baseSwitchView(view);if(view==='overview')requestAnimationFrame(()=>requestAnimationFrame(queueFit))};
    const host=document.querySelector('.pro-canvas-host');
    if(host){resizeObserver=new ResizeObserver(queueFit);resizeObserver.observe(host);}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
