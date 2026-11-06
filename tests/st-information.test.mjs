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
const syncStatusMigration=read('supabase/migrations/20261029000100_st_google_sync_status.sql');
const syncAuditFixMigration=read('supabase/migrations/20261106000200_fix_google_sync_audit_service_role.sql');
const edgeFunction=read('supabase/functions/st-sheet-sync/index.ts');
const appsScript=read('google-apps-script/st-sheet-sync/Code.gs');
const laborMigration=read('supabase/migrations/20261016000200_labor_cost_history_and_model_rename.sql');
const nameMigration=read('supabase/migrations/20261016000300_force_layout_model_name.sql');
const passwordMigration=read('supabase/migrations/20261019000100_st_view_password_management.sql');

test('S/T workspace is wired into navigation with responsive assets',()=>{
 assert.match(html,/data-view="st-info"/);
 assert.match(html,/id="stInfoView"/);
 assert.match(html,/st-info\.css\?v=20261105-model-filter-v5/);
 assert.match(html,/st-info\.js\?v=20261106-gap-zero-v20/);
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
 assert.match(edgeFunction,/unique\s*=\s*new Map/);
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
 assert.match(script,/Tong hop Model/);
 assert.match(script,/Chi tiet Parent Code/);
 assert.match(script,/Danh sách code/);
 assert.match(script,/verify_st_view_password/);
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
 assert.match(script,/st-chart-summary/);
 assert.match(script,/data-changes/);
 assert.match(script,/picker\?\.open/);
 assert.match(script,/\$\('stModelPicker'\)\.open=false/);
 assert.match(script,/autoFrom/);
 assert.match(script,/line gap/);
});

test('S/T viewer password is verified and changed only through protected RPCs',()=>{
 assert.match(html,/id="stViewerPasswordManageDialog"/);
 assert.match(script,/rpc\('verify_st_view_password'/);
 assert.match(script,/rpc\('set_st_view_password'/);
 assert.match(script,/openPasswordManager/);
 assert.match(passwordMigration,/password_hash text not null/);
 assert.match(passwordMigration,/has_capability\('permission.manage'/);
 assert.match(passwordMigration,/grant execute on function public\.verify_st_view_password\(text\) to anon,authenticated/);
 assert.doesNotMatch(script,/inno@13579/);
 assert.match(read('app.js'),/st-password/);
});

test('incremental sync inserts new codes and writes history only for real S/T changes',()=>{
 assert.match(syncMigration,/if not found then/);
 assert.match(syncMigration,/Thêm mã mới từ Google Sheet/);
 assert.match(syncMigration,/if not price_changed and not mapping_changed then/);
 assert.match(syncMigration,/if price_changed or next_st<>product\.current_st then/);
 assert.match(syncMigration,/jsonb_build_object\('inserted',inserted_count/);
});
test('S/T shows and records the most recent Google Sheet synchronization',()=>{
 assert.match(html,/id="stSyncStatus"/);
 assert.match(script,/rpc\('get_st_google_sync_status'\)/);
 assert.match(script,/rpc\('record_st_google_sync'/);
 assert.match(script,/Đồng bộ Google Sheet gần nhất/);
 assert.match(script,/google_sheet_source_timeout/);
 assert.match(script,/Đồng bộ xong trong/);
 assert.match(css,/\.st-sync-status/);
 assert.match(syncStatusMigration,/create table if not exists public\.st_google_sync_runs/);
 assert.match(syncStatusMigration,/create or replace function public\.get_st_google_sync_status/);
 assert.match(syncStatusMigration,/create or replace function public\.record_st_google_sync/);
 assert.match(syncStatusMigration,/grant execute on function public\.get_st_google_sync_status\(\) to anon, authenticated/);
 assert.match(syncAuditFixMigration,/auth\.role\(\) <> 'service_role'/);
 assert.match(syncAuditFixMigration,/to authenticated,service_role/);
});
test('BOM mapping preserves Block models and is applied by the production sync migration',()=>{
 const bomMappingMigration=read('supabase/migrations/20261022000100_fix_st_bom_mapping.sql');
 assert.match(syncMigration,/when lower\(trim\(item->>'product_type'\)\)='block' then 'Block'/);
 assert.match(bomMappingMigration,/create or replace function public\.sync_st_erp_snapshot/);
 assert.match(bomMappingMigration,/when lower\(trim\(item->>'product_type'\)\)='block' then 'Block'/);
 assert.match(bomMappingMigration,/set model_name=next_model,product_type=next_type/);
});
test('Google Sheet preview and completion identify each S/T direction and effective date',()=>{
 assert.match(script,/old_price:old\?\.current_price/);
 assert.match(script,/gap_st:oldSt==null\?null:newSt-oldSt/);
 assert.match(script,/effective_date:r\.rd_date/);
 assert.match(script,/Tăng S\/T/);
 assert.match(script,/Giảm S\/T/);
 assert.match(script,/S\/T cũ → mới/);
 assert.match(script,/renderSheetSyncResult/);
 assert.match(html,/id="stSheetSyncTitle"/);
 assert.match(html,/id="stSheetSyncNote"/);
});
test('selected code chart keeps individual change dates and GAP instead of grouping by period',()=>{
 assert.match(script,/function detailHistoryPoints/);
 assert.match(script,/Gộp theo \$\{periodLabel\}/);
 assert.match(script,/gap-bar/);
 assert.match(script,/chartHtml\(history,\[\],true\)/);
 assert.match(script,/data-gap=/);
 assert.match(script,/GAP S\/T:/);
 assert.match(script,/Ngày thay đổi thực tế/);
 assert.match(script,/<th>Ngày đổi<\/th>/);
 assert.match(script,/st-chart-empty/);
 assert.match(css,/S\/T remains readable from compact 320px phones/);
});
test('saved and published layout payloads cannot restore an old model name',()=>{
 assert.match(nameMigration,/create trigger layout_versions_force_model_name/);
 assert.match(nameMigration,/before insert or update of model_id,layout_data,published_snapshot/);
 assert.match(nameMigration,/jsonb_set\(coalesce\(new\.layout_data/);
});
test('Labor cost uses an effective-date history and keeps previous S/T records',()=>{
 assert.match(html,/id="stLaborCostBtn"/);
 assert.match(script,/rpc\('apply_st_labor_cost'/);
 assert.match(laborMigration,/create table if not exists public\.st_labor_cost_history/);
 assert.match(laborMigration,/p_effective_date date/);
 assert.match(laborMigration,/Cập nhật Labor cost/);
 assert.match(laborMigration,/source in \('ERP','VOC','LABOR'\)/);
 assert.match(laborMigration,/create or replace function public\.rename_model/);
});


test('Home model defaults are global and load independently of the active version',()=>{
 const dashboardMigration=read('supabase/migrations/20261016000400_dashboard_default_models.sql');
 const lobSummary=read('lob-summary.js');
 const integration=read('supabase-integration.js');
 assert.match(dashboardMigration,/dashboard_default_models jsonb/);
 assert.match(dashboardMigration,/get_dashboard_default_models/);
 assert.match(dashboardMigration,/set_dashboard_default_models\(p_models jsonb\)/);
 assert.match(lobSummary,/persistenceBridge\.loadDashboardDefaults/);
 assert.match(lobSummary,/persistenceBridge\.saveDashboardDefaults/);
 assert.doesNotMatch(lobSummary,/model\(\)\.dashboardDefaultModels/);
 assert.match(integration,/loadDashboardDefaults,saveDashboardDefaults/);
});

test('BOM catalog supports unpriced Parent Codes, manual price entry, and layout staffing metrics',()=>{
 const bomCatalogMigration=read('supabase/migrations/20261103000100_st_bom_catalog_and_model_metrics.sql');
 assert.match(html,/id="stManualPriceBtn"/);
 assert.match(html,/id="stManualPriceDialog"/);
 assert.match(html,/Net Price mới/);
 assert.match(script,/get_st_bom_price_entry_catalog/);
 assert.match(script,/apply_st_manual_price/);
 assert.match(script,/Net price old/);
 assert.match(script,/Net price new/);
 assert.match(script,/get_st_model_layout_metrics/);
 assert.match(script,/S\/T Avg \/ Direct MP/);
 assert.match(bomCatalogMigration,/create table if not exists public\.st_bom_catalog/);
 assert.match(bomCatalogMigration,/sync_st_bom_catalog/);
 assert.match(bomCatalogMigration,/parent_code_not_found_in_bom/);
 assert.match(bomCatalogMigration,/get_st_model_layout_metrics/);
 assert.match(appsScript,/typeColumn=headerColumnOptional_/);
 assert.match(appsScript,/bom_rows/);
 assert.match(edgeFunction,/bomRows/);
 assert.match(edgeFunction,/sync_st_bom_catalog/);
});


test('model summary puts Set Person, average price and per-person price above S/T filters',()=>{
 const modelSummaryMigration=read('supabase/migrations/20261104000100_st_model_summary_metrics.sql');
 assert.match(html,/id="stModelSummary"/);
 assert.match(script,/get_st_all_model_layout_metrics/);
 assert.match(script,/Net Price Avg \/ Direct MP/);
 assert.match(script,/Chưa có Direct MP/);
 assert.match(script,/refreshStSession/);
 assert.match(script,/body:\{mode:\x27apply\x27\}/);
 assert.match(script,/jwtExpired/);
 assert.match(script,/Net Price \/ người/);
 assert.match(script,/st-model-summary-table/);
 assert.match(modelSummaryMigration,/get_st_all_model_layout_metrics/);
 assert.match(modelSummaryMigration,/jsonb_array_elements/);
});

test('full model report presents financial, S/T and layout metrics in one compact view',()=>{
 const reportMigration=read('supabase/migrations/20261105000100_st_model_summary_report.sql');
 const reportFixMigration=read('supabase/migrations/20261106000100_fix_st_report_lob_and_mp.sql');
 assert.match(html,/id="stReportBtn"/);
 assert.match(html,/id="stReportDialog"/);
 assert.match(html,/Net Price \/ người/);
 assert.match(html,/Set \/ Person/);
 assert.match(script,/get_st_all_model_report_metrics/);
 assert.match(script,/openStSummaryReport/);
 assert.match(script,/LOB Avg/);
 assert.match(html,/id="stReportModelPicker"/);
 assert.match(script,/renderReportModelPicker/);
 assert.match(script,/showModelOverviewBase/);
 assert.match(script,/Net Price \/ người/);
 assert.match(script,/Set \/ Person/);
 assert.match(script,/metricNameByKey/);
 assert.match(script,/catalogNameByKey/);
 assert.match(script,/modelKey/);
 assert.match(script,/percent\(row\.lob\)/);
 assert.match(reportMigration,/get_st_all_model_report_metrics/);
 assert.match(reportMigration,/published_snapshot/);
 assert.match(reportMigration,/grant execute/);
 assert.match(script,/percentValue/);
 assert.match(reportFixMigration,/saved_lob<=1 then calculated\.saved_lob\*100/);
 assert.match(reportFixMigration,/sum\(coalesce.*direct_mp/);
 assert.doesNotMatch(reportFixMigration,/filter\s*\(where lower/);
});


test('S/T model filter reuses the Home default selection and admins can save it',()=>{
 assert.match(html,/id="stSaveModelDefaultsBtn"/);
 assert.match(script,/loadStModelDefaults/);
 assert.match(script,/saveStModelDefaults/);
 assert.match(script,/set_dashboard_default_models/);
 assert.match(script,/get_dashboard_default_models/);
 assert.match(script,/UPH/);
});


test('S/T latest sync exposes and filters only newly inserted Parent Codes',()=>{
 const latest=read('supabase/migrations/20261106000400_latest_st_sync_new_codes.sql');
 assert.match(latest,/create or replace function public\.get_st_google_sync_status\(\)/);
 assert.match(latest,/Thêm mã mới từ Google Sheet/);
 assert.match(latest,/h\.created_at<=r\.synced_at/);
 assert.match(latest,/previous_sync/);
 assert.match(latest,/new_codes/);
 assert.match(html,/<option value="new-latest">Mã mới - đồng bộ gần nhất<\/option>/);
 assert.match(script,/latestSyncNewCodes=new Set/);
 assert.match(script,/change==='new-latest'/);
 assert.match(script,/latestSyncNewCodes\.has\(String\(r\.product_code\)/);
 assert.match(script,/await loadSyncStatus\(\);historyCache\.clear\(\)/);
});


test('S/T GAP always displays a numeric value even for baseline codes',()=>{
 assert.match(script,/title="\$\{changed\?'GAP S\/T so với lần thay đổi gần nhất':'Chưa thay đổi S\/T từ mốc ban đầu'\}"/);
 assert.match(script,/>\$\{deltaLabel\(gap\)\}<\/td>/m);
 assert.doesNotMatch(script,/changed\?deltaLabel\(gap\):'—'/);
 assert.match(shellCss,/\.st-gap\.down\{color:#dc2626!important\}/);
 assert.match(shellCss,/\.st-gap\.up\{color:#15803d!important\}/);
});
