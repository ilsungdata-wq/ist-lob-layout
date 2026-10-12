/* Read the original OOXML sheet, including drawings that SheetJS does not expose.
   Output is a self-contained image: no external resources or workbook scripts. */
(function(root){
 const all=(node,name)=>Array.from(node?.getElementsByTagNameNS('*',name)||[]);
 const first=(node,name)=>all(node,name)[0];
 const child=(node,name)=>Array.from(node?.children||[]).find(n=>n.localName===name);
 const attr=(node,name,fallback='')=>node?.getAttribute(name)??fallback;
 const num=(node,name,fallback=0)=>Number(attr(node,name,fallback));
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const emu=value=>Number(value||0)/9525;
 function resolve(base,target){const parts=base.split('/');parts.pop();for(const p of target.split('/')){if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p)}return parts.join('/')}
 function bytes(value){if(typeof value==='string')return Uint8Array.from(value,c=>c.charCodeAt(0)&255);return value instanceof Uint8Array?value:new Uint8Array(value||[])}
 function packageReader(workbook){
  const files=workbook.files;if(!files)throw Error('Cần đọc lại file Excel để tạo ảnh gốc.');
  const read=path=>{const f=files[path];if(!f)throw Error(`Thiếu thành phần Excel: ${path}`);return bytes(f.content??f)};
  const xml=path=>{const doc=new DOMParser().parseFromString(new TextDecoder().decode(read(path)),'application/xml');if(first(doc,'parsererror'))throw Error(`XML không hợp lệ: ${path}`);return doc};
  const rels=path=>{const at=path.lastIndexOf('/'),rp=path.slice(0,at+1)+'_rels/'+path.slice(at+1)+'.rels';if(!files[rp])return new Map();return new Map(all(xml(rp),'Relationship').filter(r=>attr(r,'TargetMode')!=='External').map(r=>[attr(r,'Id'),resolve(path,attr(r,'Target'))]))};
  return{read,xml,rels};
 }
 function base64(data){let text='';for(let i=0;i<data.length;i+=8192)text+=String.fromCharCode(...data.subarray(i,i+8192));return btoa(text)}
 function preview(workbook,sheetName){
  const pkg=packageReader(workbook),wb=pkg.xml('xl/workbook.xml'),sheet=all(wb,'sheet').find(s=>attr(s,'name')===sheetName);
  if(!sheet)throw Error('Không tìm thấy sheet gốc.');
  const sheetPath=pkg.rels('xl/workbook.xml').get(attr(sheet,'r:id')),xml=pkg.xml(sheetPath),ws=workbook.Sheets[sheetName];
  const warnings=new Set(),stats={images:0,shapes:0};
  const theme=workbook.files['xl/theme/theme1.xml']?pkg.xml('xl/theme/theme1.xml'):null;
  const scheme=first(theme,'clrScheme'),themeColors=Array.from(scheme?.children||[]).map(n=>attr(n.firstElementChild,'lastClr',attr(n.firstElementChild,'val','000000')));
  const schemeMap={lt1:1,dk1:0,lt2:3,dk2:2,accent1:4,accent2:5,accent3:6,accent4:7,accent5:8,accent6:9,hlink:10,folHlink:11};
  function color(node,fallback='#111111'){
   if(!node)return fallback;
   const raw=attr(node,'rgb')||attr(node,'val')||attr(node,'lastClr');
   // Spreadsheet theme indices start lt1, dk1, lt2, dk2; DrawingML stores
   // dk1, lt1, dk2, lt2. Mixing these turns white cell fills into black.
   const spreadsheetTheme=node.hasAttribute('theme')?num(node,'theme'):-1;
   const themeIndex=spreadsheetTheme>=0?([1,0,3,2][spreadsheetTheme]??spreadsheetTheme):(schemeMap[raw]??-1);
   let hex=/^[0-9a-f]{6,8}$/i.test(raw)?raw.slice(-6):themeColors[themeIndex];
   if(!hex||!/^[0-9a-f]{6}$/i.test(hex))return fallback;
   let rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)),tint=num(node,'tint',0);
   rgb=rgb.map(v=>tint<0?v*(1+tint):v+(255-v)*tint);
   const lumMod=first(node,'lumMod'),lumOff=first(node,'lumOff');if(lumMod)rgb=rgb.map(v=>v*num(lumMod,'val')/100000);if(lumOff)rgb=rgb.map(v=>v+255*num(lumOff,'val')/100000);
   return '#'+rgb.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  }
  const defaultRow=num(first(xml,'sheetFormatPr'),'defaultRowHeight',15)*4/3;
  const colDefs=all(xml,'col'),rowDefs=new Map(all(xml,'row').map(r=>[num(r,'r')-1,r]));
  const widths=[],heights=[],xs=[0],ys=[0];
  function x(index){if(index>2000)throw Error('Sheet quá rộng để tạo ảnh.');while(xs.length<=index){const i=widths.length,d=colDefs.find(c=>i>=num(c,'min')-1&&i<num(c,'max'));const w=attr(d,'hidden')==='1'?0:Math.floor(num(d,'width',8.43)*7+5);widths.push(w);xs.push(xs.at(-1)+w)}return xs[index]}
  function y(index){if(index>10000)throw Error('Sheet quá dài để tạo ảnh.');while(ys.length<=index){const d=rowDefs.get(heights.length),h=attr(d,'hidden')==='1'?0:num(d,'ht',defaultRow*3/4)*4/3;heights.push(h);ys.push(ys.at(-1)+h)}return ys[index]}
  const styles=workbook.files['xl/styles.xml']?pkg.xml('xl/styles.xml'):null;
  const fonts=Array.from(first(styles,'fonts')?.children||[]),fills=Array.from(first(styles,'fills')?.children||[]),borders=Array.from(first(styles,'borders')?.children||[]),formats=Array.from(first(styles,'cellXfs')?.children||[]);
  const merges=(ws['!merges']||[]),cells=[],drawings=[];let maxX=1,maxY=1,id=0;
  function textBlock(text,b,font={}){
   const size=font.size||14,lines=String(text).split(/\r?\n/).flatMap(line=>{if(!font.wrap)return[line];const length=Math.max(1,Math.floor((b.w-6)/(size*.52)));const out=[];let rest=line;while(rest.length>length){let at=rest.lastIndexOf(' ',length);if(at<1)at=length;out.push(rest.slice(0,at));rest=rest.slice(at).trimStart()}return[...out,rest]});
   const align=font.align||'left',tx=align==='center'?b.x+b.w/2:align==='right'?b.x+b.w-3:b.x+3,anchor=align==='center'?'middle':align==='right'?'end':'start',lineHeight=size*1.2;
   const top=font.valign==='top'?b.y+size:font.valign==='center'?b.y+(b.h-lines.length*lineHeight)/2+size:b.y+b.h-(lines.length-1)*lineHeight-3;
   const clip='excel-clip-'+(++id);
   return `<defs><clipPath id="${clip}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/></clipPath></defs><g clip-path="url(#${clip})"><text font-family="${escape(font.family||'Arial')}" font-size="${size}" font-weight="${font.bold?'bold':'normal'}" font-style="${font.italic?'italic':'normal'}" fill="${font.color||'#111'}" text-anchor="${anchor}">${lines.map((line,i)=>`<tspan x="${tx}" y="${top+i*lineHeight}">${escape(line)}</tspan>`).join('')}</text></g>`;
  }
  for(const cell of all(xml,'c')){
   const address=attr(cell,'r'),coord=XLSX.utils.decode_cell(address),value=ws[address],style=formats[num(cell,'s')],font=fonts[num(style,'fontId')],fill=fills[num(style,'fillId')],border=borders[num(style,'borderId')],align=child(style,'alignment');
   const merge=merges.find(m=>coord.r>=m.s.r&&coord.r<=m.e.r&&coord.c>=m.s.c&&coord.c<=m.e.c);if(merge&&(merge.s.r!==coord.r||merge.s.c!==coord.c))continue;
   const end=merge?.e||coord,b={x:x(coord.c),y:y(coord.r),w:x(end.c+1)-x(coord.c),h:y(end.r+1)-y(coord.r)};
   if(!b.w||!b.h)continue;
   const pattern=first(fill,'patternFill'),bg=attr(pattern,'patternType')==='solid'?color(first(pattern,'fgColor'),'#fff'):null;
   const text=value?.w??value?.v??'';if(!text&&!bg&&!border?.children.length)continue;
   maxX=Math.max(maxX,b.x+b.w);maxY=Math.max(maxY,b.y+b.h);
   if(bg)cells.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${bg}"/>`);
   for(const [side,points] of Object.entries({left:[b.x,b.y,b.x,b.y+b.h],right:[b.x+b.w,b.y,b.x+b.w,b.y+b.h],top:[b.x,b.y,b.x+b.w,b.y],bottom:[b.x,b.y+b.h,b.x+b.w,b.y+b.h]})){
    const edge=child(border,side),style=attr(edge,'style');if(!style)continue;
    cells.push(`<line x1="${points[0]}" y1="${points[1]}" x2="${points[2]}" y2="${points[3]}" stroke="${color(child(edge,'color'))}" stroke-width="${/medium|thick|double/.test(style)?2:1}" ${/dash|dotted/i.test(style)?'stroke-dasharray="4 3"':''}/>`);
   }
   if(text!=='')cells.push(textBlock(text,b,{size:num(child(font,'sz'),'val',11)*4/3,family:attr(child(font,'name'),'val','Arial'),bold:!!child(font,'b'),italic:!!child(font,'i'),color:color(child(font,'color')),align:attr(align,'horizontal',typeof value?.v==='number'?'right':'left'),valign:attr(align,'vertical','bottom'),wrap:attr(align,'wrapText')==='1'}));
  }
  const marker=node=>({x:x(Number(child(node,'col')?.textContent||0))+emu(child(node,'colOff')?.textContent),y:y(Number(child(node,'row')?.textContent||0))+emu(child(node,'rowOff')?.textContent)});
  function shape(node,box,rels){
   if(node.localName==='grpSp'){
    const xf=first(child(node,'grpSpPr'),'xfrm'),off=child(xf,'chOff'),ext=child(xf,'chExt'),cx=num(ext,'cx',box.w*9525),cy=num(ext,'cy',box.h*9525);
    return Array.from(node.children).filter(n=>['sp','pic','grpSp','cxnSp'].includes(n.localName)).map(n=>{const tf=first(child(n,n.localName==='grpSp'?'grpSpPr':'spPr'),'xfrm'),o=child(tf,'off'),e=child(tf,'ext');return shape(n,{x:box.x+(num(o,'x')-num(off,'x'))/cx*box.w,y:box.y+(num(o,'y')-num(off,'y'))/cy*box.h,w:num(e,'cx',cx)/cx*box.w,h:num(e,'cy',cy)/cy*box.h},rels)}).join('');
   }
   const sp=child(node,'spPr'),xf=child(sp,'xfrm'),rot=num(xf,'rot')/60000,b={x:0,y:0,w:box.w,h:box.h};
   let output='',transform=`translate(${box.x} ${box.y})`;
   if(rot)transform+=` rotate(${rot} ${b.w/2} ${b.h/2})`;
   if(attr(xf,'flipH')==='1')transform+=` translate(${b.w} 0) scale(-1 1)`;
   if(attr(xf,'flipV')==='1')transform+=` translate(0 ${b.h}) scale(1 -1)`;
   if(node.localName==='pic'){
    const blip=first(node,'blip'),path=rels.get(attr(blip,'r:embed')),ext=path?.split('.').at(-1).toLowerCase(),mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',bmp:'image/bmp'}[ext];
    if(!mime){warnings.add('Có ảnh EMF/WMF hoặc định dạng chưa hỗ trợ xem trên web.');return ''}
    stats.images++;const crop=first(node,'srcRect'),l=num(crop,'l')/100000,t=num(crop,'t')/100000,r=num(crop,'r')/100000,bt=num(crop,'b')/100000,clip='excel-picture-'+(++id);
    output=`<defs><clipPath id="${clip}"><rect width="${b.w}" height="${b.h}"/></clipPath></defs><image href="data:${mime};base64,${base64(pkg.read(path))}" x="${-l*b.w/(1-l-r)}" y="${-t*b.h/(1-t-bt)}" width="${b.w/(1-l-r)}" height="${b.h/(1-t-bt)}" preserveAspectRatio="none" clip-path="url(#${clip})"/>`;
   }else{
    stats.shapes++;const solid=child(sp,'solidFill'),line=child(sp,'ln'),fill=child(sp,'noFill')?'none':color(solid?.firstElementChild,'#ffffff'),stroke=child(line,'noFill')?'none':color(first(line,'solidFill')?.firstElementChild,'#000000'),sw=emu(num(line,'w',9525));
    const prst=attr(child(sp,'prstGeom'),'prst','rect'),custom=child(sp,'custGeom');
    let geometry='';
    if(custom){
     const values={w:b.w*9525,h:b.h*9525,l:0,t:0,r:b.w*9525,b:b.h*9525,hc:b.w*9525/2,vc:b.h*9525/2,wd2:b.w*9525/2,hd2:b.h*9525/2,cd2:10800000,cd4:5400000};
     const v=key=>Number.isFinite(Number(key))?Number(key):values[key]??0;
     for(const gd of all(custom,'gd')){const [op,a,c,d]=attr(gd,'fmla').split(' '),aa=v(a),cc=v(c),dd=v(d);values[attr(gd,'name')]=op==='val'?aa:op==='*/'?aa*cc/(dd||1):op==='+-'?aa+cc-dd:op==='+/'?(aa+cc)/(dd||1):op==='?:'?(aa>0?cc:dd):op==='abs'?Math.abs(aa):op==='min'?Math.min(aa,cc):op==='max'?Math.max(aa,cc):op==='sqrt'?Math.sqrt(aa):op==='pin'?Math.max(aa,Math.min(cc,dd)):op==='sin'?aa*Math.sin(cc*Math.PI/10800000):op==='cos'?aa*Math.cos(cc*Math.PI/10800000):0}
     for(const path of all(custom,'path')){const pw=num(path,'w',values.w)||1,ph=num(path,'h',values.h)||1;let d='',last={x:0,y:0};for(const command of Array.from(path.children)){const points=all(command,'pt').map(p=>({x:v(attr(p,'x')),y:v(attr(p,'y'))})),coords=points.map(p=>`${p.x} ${p.y}`).join(' ');if(command.localName==='moveTo')d+='M '+coords;else if(command.localName==='lnTo')d+=' L '+coords;else if(command.localName==='cubicBezTo')d+=' C '+coords;else if(command.localName==='quadBezTo')d+=' Q '+coords;else if(command.localName==='close')d+=' Z';else if(command.localName==='arcTo'){const rx=v(attr(command,'wR')),ry=v(attr(command,'hR')),start=v(attr(command,'stAng'))*Math.PI/10800000,sweep=v(attr(command,'swAng'))*Math.PI/10800000,end={x:last.x+rx*(Math.cos(start+sweep)-Math.cos(start)),y:last.y+ry*(Math.sin(start+sweep)-Math.sin(start))};d+=` A ${rx} ${ry} 0 ${Math.abs(sweep)>Math.PI?1:0} ${sweep>0?1:0} ${end.x} ${end.y}`;last=end}if(points.length)last=points.at(-1)}geometry+=`<path d="${d}" transform="scale(${b.w/pw} ${b.h/ph})" fill="${attr(path,'fill')==='none'?'none':fill}" stroke="${attr(path,'stroke')==='0'?'none':stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke"/>`}
    }else if(prst==='ellipse')geometry=`<ellipse cx="${b.w/2}" cy="${b.h/2}" rx="${b.w/2}" ry="${b.h/2}"/>`;
    else if(prst==='line'||node.localName==='cxnSp')geometry=`<line x1="0" y1="0" x2="${b.w}" y2="${b.h}"/>`;
    else if(prst==='triangle')geometry=`<path d="M ${b.w/2} 0 L ${b.w} ${b.h} L 0 ${b.h} Z"/>`;
    else if(prst==='arc'||prst==='blockArc'){geometry=`<path d="M ${b.w*.15} ${b.h*.8} A ${b.w*.45} ${b.h*.45} 0 1 1 ${b.w*.85} ${b.h*.8} L ${b.w*.67} ${b.h*.65} A ${b.w*.23} ${b.h*.23} 0 1 0 ${b.w*.33} ${b.h*.65} Z"/>`;warnings.add('Một số AutoShape được hiển thị gần đúng trên web.');}
    else{geometry=`<rect width="${b.w}" height="${b.h}" rx="${prst==='roundRect'?Math.min(b.w,b.h)*.15:0}"/>`;if(!['rect','roundRect'].includes(prst))warnings.add('Một số AutoShape được hiển thị gần đúng trên web.');}
    output=`<g fill="${fill}" stroke="${stroke}" stroke-width="${sw}">${geometry}</g>`;
    const body=child(node,'txBody');if(body){const text=all(body,'p').map(p=>all(p,'t').map(t=>t.textContent).join('')).join('\n'),props=first(body,'rPr')||first(body,'defRPr'),bodyPr=child(body,'bodyPr'),paragraph=first(body,'pPr');output+=textBlock(text,b,{size:num(props,'sz',1100)/100*4/3,bold:attr(props,'b')==='1',color:color(first(props,'solidFill')?.firstElementChild),align:({ctr:'center',r:'right'})[attr(paragraph,'algn')]||'left',valign:attr(bodyPr,'anchor')==='ctr'?'center':'top',wrap:true})}
   }
   return `<g transform="${transform}">${output}</g>`;
  }
  const sheetRels=pkg.rels(sheetPath);
  for(const drawing of all(xml,'drawing')){
   const path=sheetRels.get(attr(drawing,'r:id'));if(!path)continue;
   const doc=pkg.xml(path),rels=pkg.rels(path);
   for(const anchor of Array.from(doc.documentElement.children)){
    const from=child(anchor,'from'),to=child(anchor,'to'),pos=child(anchor,'pos'),ext=child(anchor,'ext'),a=from?marker(from):{x:emu(attr(pos,'x')),y:emu(attr(pos,'y'))},z=to?marker(to):{x:a.x+emu(attr(ext,'cx')),y:a.y+emu(attr(ext,'cy'))};
    const box={x:a.x,y:a.y,w:Math.max(.1,z.x-a.x),h:Math.max(.1,z.y-a.y)};maxX=Math.max(maxX,z.x);maxY=Math.max(maxY,z.y);
    for(const node of Array.from(anchor.children))if(['sp','pic','grpSp','cxnSp'].includes(node.localName))drawings.push(shape(node,box,rels));else if(node.localName==='graphicFrame')warnings.add('Biểu đồ Excel không được chuyển thành ảnh; mở file gốc để xem đầy đủ.');
   }
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.ceil(maxX+8)}" height="${Math.ceil(maxY+8)}" viewBox="0 0 ${Math.ceil(maxX+8)} ${Math.ceil(maxY+8)}"><rect width="100%" height="100%" fill="white"/>${cells.join('')}${drawings.join('')}</svg>`;
  return{svg,dataUrl:'data:image/svg+xml;base64,'+base64(new TextEncoder().encode(svg)),warnings:[...warnings],...stats};
 }
 root.ISTExcelReference={preview};
})(globalThis);
