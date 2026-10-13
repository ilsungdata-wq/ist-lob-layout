/* Choose between the maintained layout canvas and the imported PDF/Excel image. */
(()=>{
  let sourceMode='edited',bound=false,lastWorkspace='';
  const key=()=>`ist-layout-source:${model()?.name||''}:${model()?.version||''}`;
  const hasEditedLayout=()=>shapeArray().length>0;
  const readMode=()=>sessionStorage.getItem(key())||(hasEditedLayout()?'edited':'reference');
  function sync(){
    const panel=$('layoutReferenceInline'),image=$('layoutReferenceInlineImage'),status=$('layoutReferenceInlineStatus'),canvas=document.querySelector('.shapes-canvas-scroll'),source=$('excelReferenceImage');
    if(!panel||!image||!status||!canvas)return;
    const useReference=sourceMode==='reference',available=!!source?.getAttribute('src')&&!source.hidden;
    panel.hidden=!useReference;
    canvas.hidden=useReference;
    document.querySelectorAll('[data-layout-source]').forEach(button=>button.classList.toggle('active',button.dataset.layoutSource===sourceMode));
    if(!useReference)return;
    if(available){image.src=source.src;image.hidden=false;status.textContent=$('excelReferenceName')?.textContent||'File gốc';}
    else {image.removeAttribute('src');image.hidden=true;status.textContent='Model này chưa có ảnh PDF/Excel gốc. Chọn “Layout đã edit” để xem canvas.';}
  }
  function select(mode){sourceMode=mode;sessionStorage.setItem(key(),mode);renderExcelReference();sync();setTimeout(sync,700)}
  function refresh(){
    const workspace=key();
    if(workspace!==lastWorkspace){lastWorkspace=workspace;sourceMode=readMode();}
    renderExcelReference();sync();
  }
  function init(){
    if(bound)return;bound=true;
    document.querySelectorAll('[data-layout-source]').forEach(button=>button.onclick=()=>select(button.dataset.layoutSource));
    $('excelReferenceImage')?.addEventListener('load',sync);
    $('excelReferenceImage')?.addEventListener('error',sync);
    const baseRenderStudio=renderStudio;
    renderStudio=function(){baseRenderStudio();refresh()};
    const baseSwitchView=switchView;
    switchView=function(view){
      baseSwitchView(view);
      if(view!=='overview')return;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if($('overviewView').hidden||$('layoutReferenceInline')?.hidden===false)return;
        renderShapesCanvas();
        if(typeof proFitLayout==='function')proFitLayout();
        else if(typeof proFit==='function')proFit();
      }));
    };
  }
  document.addEventListener('DOMContentLoaded',init);
})();
