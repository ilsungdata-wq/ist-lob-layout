import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=name=>fs.readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
const html=read('index.html');
const script=read('st-info.js');
const css=read('st-info.css');
const shellCss=read('overrides.css');
const migration=read('supabase/migrations/20261014000400_st_information.sql');
const syncMigration=read('supabase/migrations/20261015000100_st_google_sync.sql');
const edgeFunction=read('supabase/functions/st-sheet-sync/index.ts');
const appsScript=read('google-apps-script/st-sheet-sync/Code.gs');

test('S/T workspace is wired into navigation with responsive assets',()=>{
 assert.match(html,/data-view="st-info"/);
 assert.match(html,/id="stInfoView"/);
 assert.match(html,/st-info\.css\?v=20261015-st-v10/);
 assert.match(html,/st-info\.js\?v=20261015-st-v10/);
 assert.match(css,/@media\(max-width:768px\)/);
 assert.match(css,/body\[data-view="st-info"\] #printBtn/);
 assert.match(shellCss,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test('catalog uses one cached RPC, client filters, pagination, and lazy history',()=>{
 assert.match(script,/rpc\('get_st_catalog'\)/);
 assert.match(script,/CACHE_MS=15\*60\*1000/);
 assert.match(script,/PAGE_SIZE=40/);
 assert.match(script,/filtered=catalog\.filter/);
 assert.match(script,/async function selectProduct/);
 assert.match(script,/rpc\('get_st_history'/);
 assert.match(script,/historyCache=new Map/);
});

test('VOC import is admin-only and stores extracted changes rather than the workbook',()=>{
 assert.match(script,/globalRole==='ADMIN'/);
 assert.match(script,/sheet_to_json/);
 assert.match(script,/rpc\('apply_st_voc_batch'/);
 assert.match(script,/vocRows\.filter/);
 assert.match(migration,/if not public\.is_admin\(\) then/);
 assert.match(migration,/jsonb_array_length\(p_rows\) > 500/);
});

test('compact S/T schema is keyed by GH96 and computes S/T from labor cost',()=>{
 assert.match(migration,/product_code text primary key check \(product_code ~ '\^GH96-/);
 assert.match(migration,/current_price numeric\(14,2\) not null check \(current_price > 1000\)/);
 assert.match(migration,/round\(current_price\/labor_cost,6\)/);
 assert.match(migration,/create index if not exists st_price_history_product_date_idx/);
 assert.match(migration,/alter table public\.st_products enable row level security/);
 assert.match(migration,/revoke all on public\.st_products from anon,authenticated/);
 assert.match(migration,/grant execute on function public\.get_st_catalog\(\) to anon,authenticated/);
});

test('seed contains 309 unique mapped codes above the price threshold',()=>{
 const match=migration.match(/jsonb_to_recordset\('(\[.*?\])'::jsonb\)/s);
 assert.ok(match);
 const rows=JSON.parse(match[1]);
 assert.equal(rows.length,309);
 assert.equal(new Set(rows.map(row=>row.product_code)).size,309);
 assert.equal(new Set(rows.map(row=>row.model_name)).size,47);
 assert.ok(rows.every(row=>/^GH96-[A-Z0-9]+$/.test(row.product_code)&&row.model_name&&row.current_price>1000));
 assert.ok(rows.every(row=>row.labor_cost===(row.product_type==='Tab'?3566:3445)));
});

test('Google Sheet sync reads only required columns and deduplicates before Supabase',()=>{
 assert.match(appsScript,/headerColumn_\(erpHeaders,'Prod\. Material'\)/);
 assert.match(appsScript,/headerColumn_\(erpHeaders,'Net Price'\)/);
 assert.match(appsScript,/headerColumn_\(bomHeaders,'Parent Code'\)/);
 assert.match(appsScript,/headerColumn_\(bomHeaders,'Model'\)/);
 assert.match(appsScript,/history_rows/);
 assert.match(appsScript,/R\/D date/);
 assert.match(edgeFunction,/admin_required_to_sync_st/);
 assert.match(edgeFunction,/ST_GOOGLE_SYNC_TOKEN/);
 assert.match(edgeFunction,/unique=new Map/);
 assert.match(script,/compareSheetRows/);
 assert.match(script,/status!=='unchanged'/);
});

test('S/T supports Block, R/D history, model export, and viewer password',()=>{
 const historical=read('supabase/migrations/20261015000200_st_history_and_block.sql');
 assert.match(html,/id="stModelPicker"/);
 assert.match(html,/id="stModelAll"/);
 assert.match(html,/id="stExportModelBtn"/);
 assert.match(html,/id="stViewerPasswordDialog"/);
 assert.match(script,/typeForModel/);
 assert.match(script,/get_st_model_history/);
 assert.match(script,/import_st_erp_history/);
 assert.match(script,/XLSX\.writeFile/);
 assert.match(script,/inno@13579/);
 assert.match(historical,/\('Smart','Tab','Block'\)/);
 assert.match(css,/max-height:calc\(100vh - 280px\)/);
 assert.match(html,/id="stDateFrom"/);
 assert.match(html,/id="stDateTo"/);
 assert.match(html,/id="stPeriodFilter"/);
 assert.match(script,/historyPoints/);
 assert.match(html,/Theo quý/);
 assert.match(script,/Parent Code/);
 assert.match(script,/Net Price Avg/);
 assert.match(script,/S\/T Avg/);
 assert.match(script,/selectedModels/);
 assert.match(script,/renderHomeDashboard/);
 assert.match(html,/id="stHomeDashboard"/);
});

test('incremental sync inserts new codes and writes history only for real S/T changes',()=>{
 assert.match(syncMigration,/if not found then/);
 assert.match(syncMigration,/Thêm mã mới từ Google Sheet/);
 assert.match(syncMigration,/if not price_changed and not mapping_changed then/);
 assert.match(syncMigration,/if price_changed or next_st<>product\.current_st then/);
 assert.match(syncMigration,/jsonb_build_object\('inserted',inserted_count/);
});
