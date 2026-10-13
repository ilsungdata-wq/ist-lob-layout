/* Select the one layout published to Viewer: the web layout or the original PDF/Excel. */
(()=>{
  let sourceMode='edited',bound=false,lastWorkspace='',resizeFrame=0,lastCanvasSize='';
  const publisher=()=>!!(manageMode&&can('version.publish'));
  const hasEditedLayout=()=>shapeArray().length>0;
  const selectedMode=()=>model()?.viewerLayoutSource||(hasEditedLayout()?'edited':'reference');
  function sync(){
    const panel=$('layoutReferenceInline'),image=$('layoutReferenceInlineImage'),status=$('layoutReferenceInlineStatus'),canvas=document.querySelector('.shapes-canvas-scroll'),source=$('excelReferenceImage'),control=$('layoutSourceControl'),select=$('layoutSourceSelect');
    if(!panel||!image||!status||!canvas)return;
    const useReference=sourceMode==='reference',available=!!source?.getAttribute('src')&&!source.hidden;
    panel.hidden=!useReference;canvas.hidden=useReference;
    if(control)control.hidden=!publisher();
    if(select){select.value=sourceMode;select.querySelector('option[value="reference"]').disabled=!available;}
    if(!useReference){fitViewerCanvas();return}
    if(available){image.src=source.src;image.hidden=false;status.textContent=$('excelReferenceName')?.textContent||'File gốc đã Pushlist';}
    else {image.removeAttribute('src');image.hidden=true;status.textContent='Phiên bản này chưa có file PDF/Excel gốc.';}
  }
  function select(mode){
    if(!publisher())return;
    sourceMode=mode;model().viewerLayoutSource=mode;persistLocal();scheduleSave();renderExcelReference();sync();
    toast('Đã chọn '+(mode==='reference'?'PDF / Excel gốc':'Layout đã edit')+'. Nhấn Pushlist để phát hành cho người xem.');
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
    if(size!==lastCanvasSize){fabricLayoutCanvas.setDimensions({width,height});fabricLayoutCanvas.calcOffset();lastCanvasSize=size;}
    if(typeof proFitLayout==='function')proFitLayout();
    fabricLayoutCanvas.requestRenderAll();
  }
  function queueFit(){cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(fitViewerCanvas)}
  function init(){
    if(bound)return;bound=true;
    $('layoutSourceSelect')?.addEventListener('change',event=>select(event.target.value));
    $('excelReferenceImage')?.addEventListener('load',sync);$('excelReferenceImage')?.addEventListener('error',sync);
    const baseRenderStudio=renderStudio;renderStudio=function(){baseRenderStudio();refresh()};
    const baseSwitchView=switchView;switchView=function(view){baseSwitchView(view);if(view==='overview')requestAnimationFrame(()=>requestAnimationFrame(queueFit))};
    new ResizeObserver(queueFit).observe(document.documentElement);
  }
  document.addEventListener('DOMContentLoaded',init);
})();
