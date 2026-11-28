(function(){
 const base=new URL('../',document.currentScript.src);let excelPromise;
 async function excel(){
  if(globalThis.XLSX)return globalThis.XLSX;
  if(!excelPromise){
   excelPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=new URL('xlsx.full.min.js',base).href;script.async=true;
    const fail=()=>{clearTimeout(timer);script.remove();excelPromise=null;reject(new Error('Không tải được bộ đọc Excel. Vui lòng thử lại.'))};
    const timer=setTimeout(fail,30000);
    script.onload=()=>{if(!globalThis.XLSX)return fail();clearTimeout(timer);resolve(globalThis.XLSX)};
    script.onerror=fail;document.head.append(script);
   });
  }
  return excelPromise;
 }
 globalThis.ISTAssets={excel};
})();
