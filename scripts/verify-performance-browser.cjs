const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..',process.env.SITE_DIR||'.');
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end()}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.wasm':'application/wasm'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
 try{
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true}),errors=[];let excelRequests=0,failExcel=false,periodRequests=0,coverageRequests=0;
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/supabase-config.js*',route=>route.fulfill({contentType:'text/javascript',body:'globalThis.IST_LOB_CONFIG={};'}));
   await page.route('**/xlsx.full.min.js*',route=>{excelRequests++;return failExcel?route.abort():route.continue()});
   await page.route('https://performance-test.supabase.co/**',async route=>{
    const url=new URL(route.request().url()),name=url.pathname.split('/').pop();let data=[];
    if(name==='get_st_erp_catalog')data=['S947','S948'].map((model,i)=>({model_name:model,product_code:'GH96-1000'+i,product_type:'Smart',current_price:20000+i*1000,current_st:6+i,material_count:1,change_count:0}));
    if(name==='get_st_erp_periods'){
     periodRequests++;await new Promise(resolve=>setTimeout(resolve,70));
     data=['S947','S948'].map((model,i)=>({model_name:model,parent_code:'GH96-1000'+i,start_date:'2026-11-01',end_date:'2026-11-27',net_price:20000+i*1000,plan_qty:100,plan_days:27,old_price:null,gap_value:null}));
    }
    if(name==='st_erp_days'){coverageRequests++;data=[{rd_date:'2026-11-01',synced_at:'2026-11-27T00:00:00Z'}]}
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   });
   await page.goto(`http://127.0.0.1:${server.address().port}/`);
   await page.waitForFunction(()=>globalThis.ISTSTInfo&&globalThis.ISTAssets);
   assert.equal(excelRequests,0,'Excel must not block the initial viewer');
   // A failed download remains retryable, with one request for concurrent callers.
   failExcel=true;
   assert.equal(await page.evaluate(()=>ISTAssets.excel().then(()=>false,()=>true)),true);
   failExcel=false;
   assert.equal(await page.evaluate(async()=>{const result=await Promise.all([ISTAssets.excel(),ISTAssets.excel(),ISTAssets.excel()]);return result.every(lib=>lib===XLSX)}),true);
   assert.equal(excelRequests,2,'one failed request and one shared successful retry');
   const roundtrip=await page.evaluate(()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Model','MP'],['S947',33]]),'LOB');const reopened=XLSX.read(XLSX.write(wb,{type:'array',bookType:'xlsx'}));return XLSX.utils.sheet_to_json(reopened.Sheets.LOB)[0]});
   assert.deepEqual(roundtrip,{Model:'S947',MP:33});
   await page.evaluate(()=>{
    ISTAppHost.setSession({role:'owner',globalRole:'ADMIN',authenticated:true});
    globalThis.IST_LOB_CONFIG={supabase:{url:'https://performance-test.supabase.co',publishableKey:'test-publishable-key-1234567890'}};
    switchView('st-info');
   });
   await page.waitForFunction(()=>document.querySelectorAll('#stModelOptions input').length===2);
   await page.waitForFunction(()=>document.getElementById('stErpModelSummary').textContent.includes('S947'));
   const initialPeriods=periodRequests,initialCoverage=coverageRequests;
   for(let i=0;i<4;i++){
    await page.evaluate(i=>{const inputs=document.querySelectorAll('#stModelOptions input');inputs[0].checked=i%2===0;inputs[1].checked=true;inputs[0].dispatchEvent(new Event('change',{bubbles:true}))},i);
   }
   await page.waitForTimeout(200);
   assert.equal(periodRequests,initialPeriods,'changing model reuses ERP periods');
   assert.equal(coverageRequests,initialCoverage,'changing model reuses coverage dates');
   await page.evaluate(()=>ISTSTInfo.refresh());
   await page.waitForFunction(()=>document.getElementById('stErpModelSummary').textContent.includes('S948'));
   assert.equal(periodRequests,initialPeriods+1,'manual refresh fetches new ERP data');
   // Real export handler, not just library availability.
   const downloaded=page.waitForEvent('download');
   await page.evaluate(()=>document.getElementById('stExportModelBtn').click());
   const download=await downloaded;assert.match(download.suggestedFilename(),/^Bao-cao-ST-.*\.xlsx$/);
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width}px: no initial Excel request; failed-load retry; shared loader; workbook roundtrip; model-filter RPC reuse; refresh; S/T Excel export`);
   await page.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1;server.close()});
