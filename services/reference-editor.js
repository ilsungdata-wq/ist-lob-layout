/* Original reference editor. Edits are staged until Save and never change LOB. */
(function(root){
 const $=id=>document.getElementById(id);
 const MAX_BYTES=25*1024*1024;
 let active=null,pdfLibrary=null;
 const canUpdate=()=>editableVersion()&&can('layout.edit');
 const readDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Không đọc được file.'));reader.readAsDataURL(blob)});
 function canvas(width,height){const output=document.createElement('canvas');output.width=Math.max(1,Math.round(width));output.height=Math.max(1,Math.round(height));return output}
 function copy(source){const output=canvas(source.width,source.height);output.getContext('2d').drawImage(source,0,0);return output}
 function announce(message,error=false){$('referenceEditStatus').textContent=message;$('referenceEditStatus').classList.toggle('error',error)}
 function busy(editor,value){if(active!==editor)return;editor.busy=value;$('referenceEditorDialog').querySelectorAll('button,input,select').forEach(node=>node.disabled=value);if(!value){$('referenceCropApply').disabled=!editor.crop;$('referenceSave').disabled=!editor.working}$('referenceEditorDialog').setAttribute('aria-busy',String(value))}
 function ensureDialog(){
  if($('referenceEditorDialog'))return;
  document.body.insertAdjacentHTML('beforeend',`<dialog id="referenceEditorDialog" class="reference-editor-dialog"><div class="reference-editor-shell"><header><div><h2>Sửa ảnh / PDF bản gốc</h2><p id="referenceEditContext"></p></div><button id="referenceCancelTop" class="btn" type="button">Đóng</button></header><div class="reference-edit-toolbar"><label class="btn reference-file-label">Tải ảnh / PDF<input id="referenceUploadFile" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"></label><label id="referencePageLabel" hidden>Trang PDF <select id="referencePdfPage" aria-label="Trang PDF"></select></label><button id="referenceRotateLeft" class="btn" type="button">↶ Xoay trái</button><button id="referenceRotateRight" class="btn" type="button">↷ Xoay phải</button><button id="referenceCropToggle" class="btn" type="button" aria-pressed="false">Cắt ảnh</button><button id="referenceCropApply" class="btn" type="button" disabled>Áp dụng cắt</button><button id="referenceReset" class="btn" type="button">Khôi phục trang gốc</button></div><p class="reference-edit-help">Tải ảnh hoặc PDF xuất từ Excel để giữ đúng bố cục. Với PDF nhiều trang, chọn trang cần dùng làm ảnh layout. Bật “Cắt ảnh” rồi kéo vùng muốn giữ.</p><div id="referenceEditStage" class="reference-edit-stage"><canvas id="referenceEditCanvas" aria-label="Ảnh đang chỉnh sửa"></canvas></div><footer><p id="referenceEditStatus" role="status" aria-live="polite"></p><div><button id="referenceCancel" class="btn" type="button">Hủy</button><button id="referenceSave" class="btn primary" type="button">Lưu ảnh</button></div></footer></div></dialog>`);
  const close=()=>{if(!active?.busy)$('referenceEditorDialog').close()};
  $('referenceCancel').onclick=$('referenceCancelTop').onclick=close;
  $('referenceEditorDialog').addEventListener('cancel',event=>{if(active?.busy)event.preventDefault()});
  $('referenceEditorDialog').addEventListener('close',()=>{const previous=active;active=null;previous?.pdf?.destroy?.();$('referenceUploadFile').value=''});
  $('referenceUploadFile').onchange=event=>{const file=event.target.files[0];event.target.value='';if(file)loadFile(active,file)};
  $('referencePdfPage').onchange=()=>loadPage(active,+$('referencePdfPage').value);
  $('referenceRotateLeft').onclick=()=>rotate(-90);$('referenceRotateRight').onclick=()=>rotate(90);
  $('referenceReset').onclick=()=>{if(!active?.original||active.busy)return;active.working=copy(active.original);active.operations=[];active.crop=null;draw();announce('Đã khôi phục ảnh / trang PDF gốc. Chưa lưu thay đổi.')};
  $('referenceCropToggle').onclick=()=>{if(!active||active.busy)return;active.cropMode=!active.cropMode;active.crop=null;draw()};
  $('referenceCropApply').onclick=applyCrop;
  $('referenceSave').onclick=save;
  const surface=$('referenceEditCanvas');
  const point=event=>{const rect=surface.getBoundingClientRect();return{x:Math.max(0,Math.min(surface.width,(event.clientX-rect.left)*surface.width/rect.width)),y:Math.max(0,Math.min(surface.height,(event.clientY-rect.top)*surface.height/rect.height))}};
  surface.onpointerdown=event=>{if(!active?.cropMode||active.busy||!active.working)return;event.preventDefault();active.drag=point(event);active.crop=null;surface.setPointerCapture(event.pointerId)};
  surface.onpointermove=event=>{if(!active?.drag)return;const end=point(event),start=active.drag;active.crop={x:Math.round(Math.min(start.x,end.x)),y:Math.round(Math.min(start.y,end.y)),width:Math.round(Math.abs(end.x-start.x)),height:Math.round(Math.abs(end.y-start.y))};draw()};
  surface.onpointerup=()=>{if(active)active.drag=null};surface.onpointercancel=()=>{if(active){active.drag=null;active.crop=null;draw()}};
 }
 function draw(){
  const editor=active,surface=$('referenceEditCanvas');if(!editor||!surface)return;
  $('referenceCropToggle').setAttribute('aria-pressed',String(!!editor.cropMode));surface.classList.toggle('cropping',!!editor.cropMode);
  $('referenceCropApply').disabled=!editor.crop||editor.crop.width<8||editor.crop.height<8||editor.busy;
  if(!editor.working){surface.width=1;surface.height=1;return}
  surface.width=editor.working.width;surface.height=editor.working.height;const ctx=surface.getContext('2d');ctx.drawImage(editor.working,0,0);
  if(editor.crop){const c=editor.crop;ctx.fillStyle='rgba(15,23,42,.45)';ctx.beginPath();ctx.rect(0,0,surface.width,surface.height);ctx.rect(c.x,c.y,c.width,c.height);ctx.fill('evenodd');ctx.strokeStyle='#00bfa5';ctx.lineWidth=Math.max(2,surface.width/600);ctx.strokeRect(c.x,c.y,c.width,c.height)}
 }
 async function pdfjs(){
  if(!pdfLibrary)pdfLibrary=import(new URL('./vendor/pdfjs/pdf.min.mjs',document.baseURI).href).then(lib=>{const workerUrl=new URL('./vendor/pdfjs/pdf.worker.min.mjs',document.baseURI).href;try{lib.GlobalWorkerOptions.workerPort=new Worker(workerUrl,{type:'module',name:'ist-pdf-renderer'})}catch{lib.GlobalWorkerOptions.workerSrc=workerUrl}return lib}).catch(error=>{pdfLibrary=null;throw error});
  return pdfLibrary;
 }
 // Resource URLs are relative to the site, including GitHub Pages subpaths.
 const resource=name=>new URL('./vendor/pdfjs/'+name+'/',document.baseURI).href;
 async function renderPage(editor,pageNumber){
  const page=await editor.pdf.getPage(pageNumber),unit=page.getViewport({scale:1});
  const scale=Math.min(3,6000/Math.max(unit.width,unit.height),Math.sqrt(18000000/(unit.width*unit.height))),viewport=page.getViewport({scale});
  const output=canvas(viewport.width,viewport.height);await page.render({canvasContext:output.getContext('2d'),viewport,background:'#ffffff'}).promise;
  return output;
 }
 async function loadPage(editor,pageNumber){
  if(!editor?.pdf||editor.busy)return;busy(editor,true);announce('Đang dựng trang PDF…');
  try{const output=await renderPage(editor,pageNumber);if(active!==editor)return;editor.page=pageNumber;editor.original=output;editor.working=copy(output);editor.operations=[];editor.crop=null;draw();announce(`Trang ${pageNumber} / ${editor.pdf.numPages} · ${output.width} × ${output.height} px`)}
  catch(error){announce('Không đọc được trang PDF: '+error.message,true)}finally{busy(editor,false)}
 }
 async function loadFile(editor,file,operations=[]){
  if(!editor)return;
  if(file.size>MAX_BYTES)return announce('File tối đa 25 MB.',true);
  busy(editor,true);announce('Đang đọc file…');let loadedPdf=null;
  try{
   const pdf=/\.pdf$/i.test(file.name)||file.type==='application/pdf';let output;
   if(pdf){
    const data=new Uint8Array(await file.arrayBuffer());if(new TextDecoder().decode(data.slice(0,5))!=='%PDF-')throw Error('File không phải PDF hợp lệ.');
    const lib=await pdfjs();announce('Đang phân tích PDF…');loadedPdf=await lib.getDocument({data,cMapUrl:resource('cmaps'),cMapPacked:true,standardFontDataUrl:resource('standard_fonts'),wasmUrl:resource('wasm'),isEvalSupported:false}).promise;announce('Đang dựng trang PDF…');
    const page=Math.min(editor.requestedPage||1,loadedPdf.numPages);output=await renderPage({pdf:loadedPdf},page);editor.page=page;
   }else{
    if(!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)&&!/^.+\.(png|jpe?g|webp)$/i.test(file.name))throw Error('Chọn ảnh PNG/JPG/WebP hoặc PDF.');
    const url=URL.createObjectURL(file);try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Không đọc được ảnh.'));image.src=url});const scale=Math.min(1,6000/Math.max(image.naturalWidth,image.naturalHeight),Math.sqrt(18000000/(image.naturalWidth*image.naturalHeight)));output=canvas(image.naturalWidth*scale,image.naturalHeight*scale);const ctx=output.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,output.width,output.height);ctx.drawImage(image,0,0,output.width,output.height)}finally{URL.revokeObjectURL(url)}
   }
   if(active!==editor){loadedPdf?.destroy?.();return}
   editor.pdf?.destroy?.();editor.pdf=loadedPdf;editor.file=file;editor.original=output;editor.working=copy(output);editor.operations=[];editor.crop=null;editor.cropMode=false;
   $('referencePageLabel').hidden=!loadedPdf;$('referencePdfPage').replaceChildren();
   if(loadedPdf){for(let n=1;n<=loadedPdf.numPages;n++){const option=document.createElement('option');option.value=n;option.textContent=`${n} / ${loadedPdf.numPages}`;$('referencePdfPage').appendChild(option)}$('referencePdfPage').value=String(editor.page)}
   for(const op of operations){if(op.type==='rotate')rotateCanvas(editor,op.degrees);else if(op.type==='crop')cropCanvas(editor,op)}
   editor.operations=operations.slice();draw();announce(`${file.name}${loadedPdf?' · chọn trang PDF cần dùng':''} · ${editor.working.width} × ${editor.working.height} px`);
  }catch(error){loadedPdf?.destroy?.();if(active===editor)announce(error.name==='PasswordException'?'PDF có mật khẩu. Hãy tải bản PDF không khóa.':error.message,true)}finally{busy(editor,false)}
 }
 function rotateCanvas(editor,degrees){const src=editor.working,out=canvas(src.height,src.width),ctx=out.getContext('2d');ctx.translate(out.width/2,out.height/2);ctx.rotate(degrees*Math.PI/180);ctx.drawImage(src,-src.width/2,-src.height/2);editor.working=out}
 function rotate(degrees){if(!active?.working||active.busy)return;rotateCanvas(active,degrees);active.operations.push({type:'rotate',degrees});active.crop=null;draw();announce('Đã xoay ảnh. Chưa lưu thay đổi.')}
 function cropCanvas(editor,rect){const src=editor.working,x=Math.max(0,Math.min(src.width-1,rect.x)),y=Math.max(0,Math.min(src.height-1,rect.y)),w=Math.max(1,Math.min(src.width-x,rect.width)),h=Math.max(1,Math.min(src.height-y,rect.height)),out=canvas(w,h);out.getContext('2d').drawImage(src,x,y,w,h,0,0,w,h);editor.working=out}
 function applyCrop(){if(!active?.crop||active.busy||active.crop.width<8||active.crop.height<8)return;const op={type:'crop',...active.crop};cropCanvas(active,op);active.operations.push(op);active.crop=null;active.cropMode=false;draw();announce('Đã cắt ảnh. Chưa lưu thay đổi.')}
 async function sourceFile(editor){
  const current=editor.document,asset=current.referenceSourceAsset;
  if(asset?.path){const signed=await persistenceBridge.getAssetUrl(asset.path,3600),res=await fetch(signed.signedURL||signed.signedUrl);if(!res.ok)throw Error('Không tải được file gốc để sửa.');return new File([await res.blob()],asset.name,{type:asset.mimeType})}
  const src=current.referenceSourceData||$('excelReferenceImage')?.getAttribute('src');if(!src)return null;
  const res=await fetch(src);if(!res.ok)throw Error('Không tải được ảnh hiện tại.');const blob=await res.blob();return new File([blob],current.referenceImageName||'layout.png',{type:blob.type});
 }
 async function open(file=null){
  if(!canUpdate())return toast('Bạn cần quyền sửa Layout để thay ảnh / PDF.');
  ensureDialog();const editor=active={document:model(),page:1,requestedPage:model().referenceEdit?.page||1,operations:[],busy:false,cropMode:false};
  $('referenceEditContext').textContent=`${model().name} · ${model().version}`;$('referencePageLabel').hidden=true;draw();$('referenceSave').disabled=true;$('referenceEditorDialog').showModal();
  if(file){editor.requestedPage=1;editor.newSource=true;return loadFile(editor,file)}
  busy(editor,true);announce('Đang tải ảnh hiện tại…');
  try{const original=await sourceFile(editor);if(active!==editor)return;if(original)await loadFile(editor,original,editor.document.referenceEdit?.operations||[]);else announce('Tải ảnh hoặc PDF để thêm bản gốc cho phiên bản này.')}
  catch(error){if(active===editor)announce(error.message+' Bạn có thể tải ảnh / PDF khác.',true)}finally{busy(editor,false)}
 }
 async function save(){
  const editor=active;if(!editor?.working||editor.busy)return;
  if(editor.document!==model()||!canUpdate())return announce('Phiên bản hoặc quyền truy cập đã thay đổi. Đóng cửa sổ và mở lại.',true);
  busy(editor,true);announce('Đang lưu ảnh…');
  try{
   const blob=await new Promise(resolve=>editor.working.toBlob(resolve,'image/png'));if(!blob)throw Error('Không tạo được ảnh.');if(blob.size>MAX_BYTES)throw Error('Ảnh sau chỉnh sửa vượt 25 MB. Hãy cắt vùng layout nhỏ hơn.');
   const current=editor.document,draft=structuredClone(current),name=(editor.file?.name||'layout').replace(/\.[^.]+$/,'')+'.png',imageFile=new File([blob],name,{type:'image/png'});
   if(persistenceBridge?.configured){
    const modelId=current._remote?.modelId;if(!modelId||!current._remote?.versionId)throw Error('Hãy lưu Model / Version trước khi thêm ảnh.');
    // Keep the original privately for later page selection/reset; publish only the preview.
    if(editor.file&&(!current.referenceSourceAsset||editor.newSource)){
     let file=editor.file;const type=/\.pdf$/i.test(file.name)?'application/pdf':file.type;
     if(type&&file.type!==type)file=new File([file],file.name,{type});
     if(type==='image/webp'){file=new File([await new Promise(resolve=>editor.original.toBlob(resolve,'image/png'))],file.name+'.png',{type:'image/png'})}
     const uploaded=await persistenceBridge.uploadAsset(modelId,file,{path:`reference-source/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9._-]/gi,'_')}`});
     draft.referenceSourceAsset={id:uploaded.record?.id||null,path:uploaded.path,name:file.name,mimeType:type==='image/webp'?'image/png':type,size:file.size};
    }
    const uploaded=await persistenceBridge.uploadAsset(modelId,imageFile,{path:`excel-reference/${crypto.randomUUID()}.png`});
    draft.referenceAsset={id:uploaded.record?.id||null,path:uploaded.path,name,mimeType:'image/png',size:blob.size};delete draft.referenceImage;delete draft.referenceSourceData;
   }else{draft.referenceImage=await readDataUrl(blob);delete draft.referenceAsset;if(editor.file)draft.referenceSourceData=await readDataUrl(editor.file)}
   draft.referenceImageName=editor.file?.name||name;draft.referenceWarnings=[];draft.referenceEdit={page:editor.pdf?editor.page:null,operations:editor.operations,width:editor.working.width,height:editor.working.height};
   if(editor.document!==model()||!canUpdate())throw Error('Phiên bản đã đổi; chưa lưu ảnh.');
   if(persistenceBridge?.configured)await persistenceBridge.saveCurrent(draft,'LAYOUT');
   else{const saved=structuredClone(state);saved.models[currentKey]=draft;localStorage.setItem(STORAGE.state,JSON.stringify(saved))}
   if(editor.document===model()){
    for(const key of ['referenceAsset','referenceImage','referenceSourceAsset','referenceSourceData','referenceImageName','referenceWarnings','referenceEdit','_remote']){if(key in draft)current[key]=draft[key];else delete current[key]}
    clearTimeout(saveTimer);hasUnsavedChanges=false;persistLocal();await renderExcelReference();$('saveState').innerHTML='<i></i>Đã lưu';
   }
   busy(editor,false);$('referenceEditorDialog').close();toast(current._remote?'Đã lưu ảnh. Publish phiên bản để cập nhật bản xem công khai.':'Đã lưu ảnh bản gốc.');
  }catch(error){announce(error.userMessage||error.message,true);busy(editor,false)}
 }
 // The picker within the dialog always starts a new source document.
 document.addEventListener('change',event=>{if(event.target.id==='referenceUploadFile'&&active){active.newSource=true;active.requestedPage=1}},true);
 root.ISTReferenceEditor={open,canUpdate};
})(globalThis);
