import{rpc}from'./services/supabase/client.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0});
const decimal=new Intl.NumberFormat('vi-VN',{minimumFractionDigits:3,maximumFractionDigits:3});
const PAGE_SIZE=40,CACHE_KEY='ist-st-catalog-v1',CACHE_MS=15*60*1000;
let catalog=[],filtered=[],selectedCode='',page=1,loaded=false,loading=false,vocRows=[];
const historyCache=new Map();

function dateLabel(value){if(!value)return'—';const date=new Date(value);return Number.isNaN(date.getTime())?esc(value):date.toLocaleDateString('vi-VN')}
function typeLabel(value){return String(value||'Smart').toLowerCase()==='tab'?'Tab':'Smart'}
function deltaLabel(value){const number=Number(value||0);return`${number>0?'+':''}${decimal.format(number)} phút`}
function toastMessage(message){if(typeof toast==='function')toast(message);else console.info(message)}
function currentSession(){return globalThis.ISTAppHost?.session?.()||{}}
function canImport(){return currentSession().globalRole==='ADMIN'}

async function loadCatalog({fresh=false}={}){
 if(loading)return;loading=true;$('stTableHost').innerHTML='<div class="st-loading">Đang tải danh sách S/T…</div>';
 try{
  if(!fresh){try{const cached=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null');if(cached&&Date.now()-cached.savedAt<CACHE_MS)catalog=cached.rows||[]}catch{}}
  if(!catalog.length||fresh){catalog=await rpc('get_st_catalog');sessionStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),rows:catalog}))}
  loaded=true;renderKpis();applyFilters();
 }catch(error){$('stTableHost').innerHTML=`<div class="st-error"><b>Không tải được dữ liệu S/T</b><span>${esc(error.message)}</span></div>`}
 finally{loading=false}
}

function renderKpis(){
 const models=new Set(catalog.map(row=>row.model_name).filter(Boolean));
 const smart=catalog.filter(row=>typeLabel(row.product_type)==='Smart').length,tab=catalog.length-smart,changed=catalog.filter(row=>Number(row.change_count)>0).length;
 $('stKpis').innerHTML=[['Prod. Material',catalog.length,'Giá hiện hành > 1.000 VND'],['Model',models.size,'Định danh từ BOM'],['Smart / Tab',`${smart} / ${tab}`,'Theo labor cost áp dụng'],['Đã thay đổi',changed,'Có lịch sử sau mốc ban đầu']].map(([label,value,note])=>`<article><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(note)}</small></article>`).join('');
}

function applyFilters(){
 const query=$('stSearch').value.trim().toLowerCase(),type=$('stTypeFilter').value,change=$('stChangeFilter').value;
 filtered=catalog.filter(row=>{if(query&&!`${row.product_code} ${row.model_name||''}`.toLowerCase().includes(query))return false;if(type&&typeLabel(row.product_type)!==type)return false;if(change==='changed'&&Number(row.change_count)<=0)return false;if(change==='baseline'&&Number(row.change_count)>0)return false;return true});
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));page=Math.min(page,pages);$('stResultCount').textContent=`${filtered.length.toLocaleString('vi-VN')} mã · ${pages} trang`;renderTable();renderPager();
}

function renderTable(){
 const start=(page-1)*PAGE_SIZE,rows=filtered.slice(start,start+PAGE_SIZE);
 $('stTableHost').innerHTML=rows.length?`<table class="st-table"><thead><tr><th>Prod. Material</th><th>Model</th><th>Loại</th><th class="st-money">Net Price</th><th class="st-number">S/T</th><th class="st-number">GAP gần nhất</th></tr></thead><tbody>${rows.map(row=>{const gap=Number(row.latest_gap_st||0);return`<tr data-st-code="${esc(row.product_code)}" class="${row.product_code===selectedCode?'active':''}"><td class="st-code">${esc(row.product_code)}</td><td class="st-model">${esc(row.model_name||'Chưa định danh')}</td><td><span class="st-type ${typeLabel(row.product_type)==='Tab'?'tab':''}">${typeLabel(row.product_type)}</span></td><td class="st-money">${money.format(row.current_price)} ₫</td><td class="st-number">${decimal.format(row.current_st)}</td><td class="st-number st-gap ${gap>0?'up':gap<0?'down':'st-muted'}">${Number(row.change_count)>0?deltaLabel(gap):'—'}</td></tr>`}).join('')}</tbody></table>`:'<div class="st-loading">Không tìm thấy Prod. Material phù hợp.</div>';
 $('stTableHost').querySelectorAll('[data-st-code]').forEach(row=>row.onclick=()=>selectProduct(row.dataset.stCode));
}

function renderPager(){
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));if(pages<=1){$('stPager').innerHTML='';return}
 const numbers=[1,page-1,page,page+1,pages].filter(number=>number>=1&&number<=pages).filter((number,index,array)=>array.indexOf(number)===index).sort((a,b)=>a-b),parts=[];
 let previous=0;for(const number of numbers){if(previous&&number-previous>1)parts.push('<span>…</span>');parts.push(`<button type="button" data-st-page="${number}" class="${number===page?'active':''}">${number}</button>`);previous=number}
 $('stPager').innerHTML=`<button type="button" data-st-page="${page-1}" ${page===1?'disabled':''}>‹</button>${parts.join('')}<button type="button" data-st-page="${page+1}" ${page===pages?'disabled':''}>›</button>`;
 $('stPager').querySelectorAll('[data-st-page]').forEach(button=>button.onclick=()=>{page=Math.max(1,Math.min(pages,Number(button.dataset.stPage)));renderTable();renderPager();$('stTableHost').scrollTo({top:0,behavior:'smooth'})});
}

async function selectProduct(code){
 selectedCode=code;renderTable();const row=catalog.find(item=>item.product_code===code);if(!row)return;
 $('stDetailPanel').innerHTML=detailHtml(row,null,true);if(innerWidth<=1100)$('stDetailPanel').scrollIntoView({behavior:'smooth',block:'start'});
 try{let history=historyCache.get(code);if(!history){history=await rpc('get_st_history',{p_product_code:code});historyCache.set(code,history)}if(selectedCode===code)$('stDetailPanel').innerHTML=detailHtml(row,history,false)}catch(error){if(selectedCode===code)$('stDetailPanel').innerHTML=detailHtml(row,[{error:error.message}],false)}
}

function detailHtml(row,history,waiting){
 const gap=Number(row.latest_gap_st||0),changed=Number(row.change_count)>0;
 const historyHtml=waiting?'<div class="st-loading">Đang tải lịch sử…</div>':history?.[0]?.error?`<div class="st-error">${esc(history[0].error)}</div>`:(history||[]).map(item=>`<article class="st-history-item"><header><b>${esc(item.source==='VOC'?(item.voc_code||'VOC'):'Cập nhật giá ERP')}</b><time>${dateLabel(item.change_date)}</time></header><dl><dt>Đơn giá</dt><dd>${item.old_price==null?'Mốc ban đầu':`${money.format(item.old_price)} → `}${money.format(item.new_price)} ₫</dd><dt>S/T</dt><dd>${item.old_st==null?'—':decimal.format(item.old_st)+' → '}${decimal.format(item.new_st)}</dd><dt>GAP</dt><dd class="st-gap ${Number(item.gap_st)>0?'up':Number(item.gap_st)<0?'down':''}">${item.old_st==null?'—':deltaLabel(item.gap_st)}</dd><dt>Lý do</dt><dd>${esc(item.reason||'Để trống')}</dd></dl><span class="st-source ${item.source==='VOC'?'voc':''}">${esc(item.source)}</span></article>`).join('')||'<p class="st-muted">Chưa có lịch sử.</p>';
 return`<div class="st-detail-head"><span>PROD. MATERIAL</span><h2>${esc(row.product_code)}</h2><p>${esc(row.model_name||'Chưa định danh')} · ${typeLabel(row.product_type)} · ${changed?'Đã có thay đổi':'Mốc ban đầu'}</p></div><div class="st-detail-metrics"><article><span>Net Price hiện hành</span><b>${money.format(row.current_price)} ₫</b></article><article><span>S/T hiện hành</span><b>${decimal.format(row.current_st)} phút</b></article><article><span>Labor cost</span><b>${money.format(row.labor_cost)} ₫/phút</b></article><article><span>GAP gần nhất</span><b class="st-gap ${gap>0?'up':gap<0?'down':''}">${changed?deltaLabel(gap):'—'}</b></article></div><p class="st-formula">S/T = ${money.format(row.current_price)} ÷ ${money.format(row.labor_cost)} = <b>${decimal.format(row.current_st)} phút/SP</b><br>Cập nhật gần nhất: ${dateLabel(row.last_change_at)}</p><section class="st-history"><h3>Lịch sử thay đổi</h3><div class="st-history-list">${historyHtml}</div></section>`;
}

function normalizedHeader(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function field(row,names){const entries=Object.entries(row),keys=names.map(normalizedHeader);for(const [key,value]of entries)if(keys.includes(normalizedHeader(key)))return value;return''}
function parsePrice(value){if(typeof value==='number')return value;let text=String(value||'').trim().replace(/\s/g,'');if(/^\d{1,3}([.,]\d{3})+$/.test(text))text=text.replace(/[.,]/g,'');else text=text.replace(',','.');return Number(text)}
function parseDate(value){if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);if(typeof value==='number'&&globalThis.XLSX?.SSF){const part=XLSX.SSF.parse_date_code(value);if(part)return`${part.y}-${String(part.m).padStart(2,'0')}-${String(part.d).padStart(2,'0')}`}const text=String(value||'').trim();if(!text)return new Date().toISOString().slice(0,10);const match=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);return match?`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`:text.slice(0,10)}

async function readVocFile(file){
 const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true}),sheet=workbook.Sheets[workbook.SheetNames[0]],raw=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:true});
 const known=new Set(catalog.map(row=>row.product_code)),deduped=new Map();
 for(const row of raw){const code=String(field(row,['Prod. Material','Parent Code','Code','GH96 Code'])||'').trim().toUpperCase(),price=parsePrice(field(row,['Net Price new (2)','Net Price','Giá mới','New Price','Đơn giá mới'])),reason=String(field(row,['Lý do','Reason','Nội dung VOC','VOC Content'])||'').trim(),vocCode=String(field(row,['Mã VOC','VOC','VOC Code'])||'').trim(),changeDate=parseDate(field(row,['Ngày hiệu lực','Ngày thay đổi','Effective Date','Change Date']));if(!code&&!price)continue;deduped.set(code,{product_code:code,new_price:price,reason:reason||null,voc_code:vocCode||null,change_date:changeDate,valid:/^GH96-[A-Z0-9]+$/.test(code)&&Number.isFinite(price)&&price>1000&&known.has(code)})}
 vocRows=[...deduped.values()];renderVocPreview();
}

function renderVocPreview(){
 const valid=vocRows.filter(row=>row.valid),invalid=vocRows.length-valid.length;$('stVocSummary').textContent=`${valid.length} dòng hợp lệ${invalid?` · ${invalid} dòng cần kiểm tra`:''}. Hệ thống chỉ lưu giá mới và lịch sử S/T, không lưu toàn bộ file Excel.`;
 $('stVocPreviewTable').innerHTML=`<table><thead><tr><th>GH96</th><th>Giá mới</th><th>Ngày</th><th>VOC</th><th>Lý do</th></tr></thead><tbody>${vocRows.slice(0,100).map(row=>`<tr class="${row.valid?'':'invalid'}"><td>${esc(row.product_code||'Thiếu code')}</td><td>${Number.isFinite(row.new_price)?money.format(row.new_price):'Không hợp lệ'}</td><td>${esc(row.change_date)}</td><td>${esc(row.voc_code||'—')}</td><td>${esc(row.reason||'Để trống')}</td></tr>`).join('')}</tbody></table>`;
 $('stVocConfirmBtn').disabled=!valid.length;$('stVocPreviewDialog').showModal();
}

async function applyVoc(event){
 event.preventDefault();const rows=vocRows.filter(row=>row.valid).map(({valid,...row})=>row);if(!rows.length)return;$('stVocConfirmBtn').disabled=true;$('stVocConfirmBtn').textContent='Đang ghi nhận…';
 try{const result=await rpc('apply_st_voc_batch',{p_rows:rows});$('stVocPreviewDialog').close();historyCache.clear();sessionStorage.removeItem(CACHE_KEY);catalog=[];await loadCatalog({fresh:true});toastMessage(`Đã ghi nhận ${result?.updated||0} thay đổi VOC.`)}catch(error){toastMessage('Không thể ghi nhận VOC: '+error.message)}finally{$('stVocConfirmBtn').disabled=false;$('stVocConfirmBtn').textContent='Ghi nhận VOC'}
}

function bind(){
 ['stSearch','stTypeFilter','stChangeFilter'].forEach(id=>$(id).addEventListener(id==='stSearch'?'input':'change',()=>{page=1;applyFilters()}));
 $('stRefreshBtn').onclick=()=>{sessionStorage.removeItem(CACHE_KEY);catalog=[];historyCache.clear();loadCatalog({fresh:true})};
 $('stVocImportBtn').onclick=()=>$('stVocFile').click();$('stVocFile').onchange=event=>{const file=event.target.files[0];if(file)readVocFile(file).catch(error=>toastMessage(error.message));event.target.value=''};
 $('stVocPreviewForm').onsubmit=applyVoc;$('stVocCloseBtn').onclick=$('stVocCancelBtn').onclick=()=>$('stVocPreviewDialog').close();
}

function activate(){
 $('stVocImportBtn').hidden=!canImport();if(!loaded&&!loading)loadCatalog();
}

bind();globalThis.ISTSTInfo={activate,refresh:()=>loadCatalog({fresh:true})};
