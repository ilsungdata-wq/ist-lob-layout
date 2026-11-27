/* Searchable Model dropdowns; native selects remain authoritative. */
(function(){
'use strict';
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().trim();
const filterOptions=(options,query)=>options.filter(option=>normalize(option.text).includes(normalize(query)));
function enhance(select){
 if(!select||select.dataset.modelSearchReady)return;
 select.dataset.modelSearchReady='1';
 const label=select.id==='lobModelSelect'?'Model LOB':select.id==='jigModelSelect'?'Model Thiết bị & Jig':'Model';
 const wrapper=document.createElement('div');wrapper.className='model-search';
 const trigger=document.createElement('button');trigger.type='button';trigger.className='model-search-trigger';trigger.setAttribute('role','combobox');trigger.setAttribute('aria-label',label);trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-haspopup','listbox');
 const popup=document.createElement('div');popup.className='model-search-popup';popup.hidden=true;
 const input=document.createElement('input');input.type='search';input.placeholder='Gõ tên Model…';input.setAttribute('aria-label','Tìm '+label);input.autocomplete='off';
 const list=document.createElement('div');list.className='model-search-options';list.id=select.id+'-search-options';list.setAttribute('role','listbox');list.setAttribute('aria-label','Danh sách '+label);
 trigger.setAttribute('aria-controls',list.id);
 const status=document.createElement('div');status.className='model-search-status';status.setAttribute('role','status');
 popup.append(input,list,status);select.before(wrapper);wrapper.append(select,trigger,popup);select.classList.add('model-search-native');select.tabIndex=-1;
 let active=0,options=[];
 function close(focus=false){popup.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus()}
 function render(){
  options=filterOptions([...select.options].map(o=>({value:o.value,text:o.textContent,disabled:o.disabled})),input.value);
  active=Math.min(Math.max(active,0),Math.max(0,options.length-1));list.replaceChildren();
  options.forEach((option,index)=>{
   const button=document.createElement('button');button.type='button';button.className='model-search-option';button.textContent=option.text;button.disabled=option.disabled;button.setAttribute('role','option');button.setAttribute('aria-selected',String(option.value===select.value));button.classList.toggle('keyboard-active',index===active);
   button.onclick=event=>{event.preventDefault();choose(index)};list.append(button);
  });
  status.textContent=options.length?options.length+' Model':'Không tìm thấy Model';
 }
 function choose(index){
  const option=options[index];if(!option||option.disabled)return;
  select.value=option.value;close();select.dispatchEvent(new Event('change',{bubbles:true}));sync();
 }
 function sync(){
  trigger.textContent=(select.selectedOptions[0]?.textContent||'Chọn Model')+' ▾';trigger.disabled=select.disabled;
  if(!popup.hidden)render();
 }
 function open(){input.value='';active=0;popup.hidden=false;trigger.setAttribute('aria-expanded','true');render();input.focus()}
 trigger.onclick=event=>{event.preventDefault();popup.hidden?open():close()};
 trigger.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open()}};
 input.oninput=()=>{active=0;render()};
 input.onkeydown=event=>{
  if(event.key==='Escape'){event.preventDefault();close(true);return}
  if(event.key==='Enter'){event.preventDefault();choose(active);return}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();active=Math.max(0,Math.min(options.length-1,active+(event.key==='ArrowDown'?1:-1)));render();list.children[active]?.scrollIntoView({block:'nearest'})}
 };
 wrapper.addEventListener('focusout',event=>{if(!wrapper.contains(event.relatedTarget))close()});
 document.addEventListener('pointerdown',event=>{if(!wrapper.contains(event.target))close()});
 select.addEventListener('change',sync);
 new MutationObserver(sync).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected']});sync();
}
function init(){['lobModelSelect','jigModelSelect'].forEach(id=>enhance(document.getElementById(id)))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
globalThis.ISTModelSearch={normalize,filterOptions,enhance};
})();
