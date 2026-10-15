const ERP_SPREADSHEET_ID = '1BJTaqs76rJlYZHQFzDgpZiZJsBJCenKmbfenba1YdIw';
const ERP_SHEET_NAME = 'DATA BASE ERP';
const BOM_SPREADSHEET_ID = '1hA6a9EJsPOnhjbJUWtJmg7NSZGWaTKFAyvdEdmnZwuY';
const BOM_SHEET_NAME = 'BOM';

function doPost(event) {
  try {
    const body = JSON.parse((event && event.postData && event.postData.contents) || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('ST_SYNC_TOKEN');
    if (!expected || body.token !== expected) return output_({ok:false,message:'unauthorized'});
    return output_(buildSnapshot_());
  } catch (error) {
    return output_({ok:false,message:String(error && error.message || error)});
  }
}

function buildSnapshot_() {
  const erpSheet = SpreadsheetApp.openById(ERP_SPREADSHEET_ID).getSheetByName(ERP_SHEET_NAME);
  const bomSheet = SpreadsheetApp.openById(BOM_SPREADSHEET_ID).getSheetByName(BOM_SHEET_NAME);
  if (!erpSheet || !bomSheet) throw new Error('Không tìm thấy sheet nguồn ERP hoặc BOM.');

  const erpHeaders = erpSheet.getRange(1,1,1,erpSheet.getLastColumn()).getDisplayValues()[0];
  const productColumn = headerColumn_(erpHeaders,'Prod. Material');
  const priceColumn = headerColumn_(erpHeaders,'Net Price');
  const erpRows = Math.max(0,erpSheet.getLastRow()-1);
  const products = erpRows ? erpSheet.getRange(2,productColumn,erpRows,1).getDisplayValues() : [];
  const prices = erpRows ? erpSheet.getRange(2,priceColumn,erpRows,1).getDisplayValues() : [];
  const latestPrice = new Map();
  for (let index=0; index<erpRows; index++) {
    const code = String(products[index][0] || '').trim().toUpperCase();
    const price = number_(prices[index][0]);
    if (/^GH96-[A-Z0-9]+$/.test(code) && price > 1000) latestPrice.set(code,price);
  }

  const bomHeaders = bomSheet.getRange(1,1,1,bomSheet.getLastColumn()).getDisplayValues()[0];
  const modelColumn = headerColumn_(bomHeaders,'Model');
  const parentColumn = headerColumn_(bomHeaders,'Parent Code');
  const bomRows = Math.max(0,bomSheet.getLastRow()-1);
  const models = bomRows ? bomSheet.getRange(2,modelColumn,bomRows,1).getDisplayValues() : [];
  const parents = bomRows ? bomSheet.getRange(2,parentColumn,bomRows,1).getDisplayValues() : [];
  const modelByCode = new Map();
  for (let index=0; index<bomRows; index++) {
    const code = String(parents[index][0] || '').trim().toUpperCase();
    const model = String(models[index][0] || '').trim();
    if (/^GH96-[A-Z0-9]+$/.test(code) && model) modelByCode.set(code,model);
  }

  const rows = [];
  let unmapped = 0;
  latestPrice.forEach((netPrice,code) => {
    const modelName = modelByCode.get(code);
    if (!modelName) { unmapped++; return; }
    const productType = /^(P6|T|X)/i.test(modelName) ? 'Tab' : 'Smart';
    rows.push({product_code:code,model_name:modelName,product_type:productType,net_price:netPrice});
  });
  rows.sort((a,b) => a.model_name.localeCompare(b.model_name) || a.product_code.localeCompare(b.product_code));
  return {ok:true,generated_at:new Date().toISOString(),rows:rows,stats:{erp_rows:erpRows,unique_codes:latestPrice.size,mapped_codes:rows.length,unmapped_codes:unmapped,bom_rows:bomRows}};
}

function headerColumn_(headers,name) {
  const target = normalize_(name);
  const index = headers.findIndex(value => normalize_(value) === target);
  if (index < 0) throw new Error('Thiếu cột '+name);
  return index + 1;
}

function normalize_(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function number_(value) {
  const text = String(value || '').trim().replace(/\s/g,'');
  if (!text) return NaN;
  if (/^\d{1,3}([.,]\d{3})+$/.test(text)) return Number(text.replace(/[.,]/g,''));
  return Number(text.replace(',','.'));
}

function output_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
