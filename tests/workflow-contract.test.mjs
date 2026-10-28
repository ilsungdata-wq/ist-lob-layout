import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const studio=fs.readFileSync(new URL('../studio.js',import.meta.url),'utf8');
const integration=fs.readFileSync(new URL('../supabase-integration.js',import.meta.url),'utf8');
const referenceEditor=fs.readFileSync(new URL('../services/reference-editor.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20261006000300_permissions_revisions_management.sql',import.meta.url),'utf8');

test('admin defaults to viewer and layout edit requires explicit edit mode',()=>{
 assert.match(app,/manageMode=false,layoutEditing=false,editingModule=null/);
 assert.match(app,/canEditLayout=\(\)=>editingModule==='layout'&&layoutEditing/);
 assert.match(app,/function enterEditMode\(module\)/);
 assert.match(app,/setSession\(next\).*editingModule=null/);
});
test('phase 1 uses one global model/version context and capability menus',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.equal((html.match(/id="modelSelect"/g)||[]).length,1);
 assert.equal((html.match(/id="versionSelect"/g)||[]).length,1);
 assert.match(html,/class="global-context"/);
 assert.match(app,/tr\('edit'\)/);assert.match(app,/tr\('management'\)/);
 assert.match(app,/editingModule==='equipment'/);
 assert.match(app,/canAccessDrafts=.*session\.authenticated/);
});
test('phase 2 shell, i18n, restore and print controls are explicit',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const studio=fs.readFileSync(new URL('../studio.js',import.meta.url),'utf8');
 const i18n=fs.readFileSync(new URL('../services/i18n.js',import.meta.url),'utf8');
 assert.match(html,/LAYOUT &amp; LOB IL-SUNGTECH/);assert.match(html,/class="context-bar"/);
 assert.match(i18n,/vi:\{/);assert.match(i18n,/en:\{/);assert.match(i18n,/ist-lob-language/);
 assert.match(studio,/session\.authenticated\|\|!can\('model\.manage'\)/);
 assert.match(studio,/printExcelVersionBtn'\)\.disabled=!available/);
 assert.match(html,/In bản Excel gốc/);assert.match(html,/In bản đã chỉnh sửa/);
 assert.equal((html.match(/id="layoutXlsxImportBtn"/g)||[]).length,1);
});
test('public Viewer uses one published workspace RPC instead of a request per Model',()=>{
 assert.match(integration,/async function getPublicWorkspace/);
 assert.match(integration,/const rows=await layoutService\.listPublicWorkspace\(\);/);
 assert.match(integration,/const rows=await getPublicWorkspace\(\),mapped=\{\}/);
 assert.match(integration,/loadLobSummary:\(\)=>getPublicWorkspace\(\)/);
 assert.doesNotMatch(integration,/async function loadPublicWorkspace\(\)\{\s*const models=await layoutService\.listModels/);
 const migration=fs.readFileSync(new URL('../supabase/migrations/20261009000100_optimize_public_workspace.sql',import.meta.url),'utf8');
 assert.match(migration,/create or replace function public\.get_published_workspace\(\)/);
 assert.match(migration,/lv\.status='PUBLISHED'/);
 assert.match(migration,/grant execute on function public\.get_published_workspace\(\) to anon,authenticated/);
});
test('remote workspace waits for Supabase data instead of drawing the local sample first',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/workspace-loading/);
 assert.match(app,/remoteWorkspacePending=!!globalThis\.IST_LOB_CONFIG/);
 assert.match(app,/if\(supabaseConfigured\)\{setWorkspaceLoading\(true\);applyRole\(\);return\}/);
 assert.match(app,/if\(!remoteWorkspacePending\)renderAll\(\)/);
 assert.match(app,/remoteWorkspacePending=false;persistLocal\(\);applyRole\(\);enforcePublicVersion\(\);renderAll\(\);setWorkspaceLoading\(false\)/);
});
test('permission save reloads and verifies persisted capability state',()=>{
 assert.match(app,/changes=permissionCapabilities\.filter/);
 assert.match(app,/permissionCache=await persistenceBridge\.permissionData\(\)/);
 assert.match(app,/Supabase chưa phản ánh đầy đủ quyền vừa lưu/);
});
test('phase 2A uses one Fabric Office editor with real-world geometry and dedicated edit mode',()=>{
 const professional=fs.readFileSync(new URL('../professional-editor.js',import.meta.url),'utf8');
 const office=fs.readFileSync(new URL('../office-page-editor.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../overrides.css',import.meta.url),'utf8');
 assert.match(app,/renderAll\(\);if\(layoutEditing&&typeof mountAuthoritativeOfficeEditor/);
 assert.match(professional,/pixelsPerMeter/);assert.match(professional,/proSyncWorld/);
 assert.match(professional,/new fabric\.ActiveSelection/);assert.match(professional,/Ctrl|ctrlKey/);
 assert.match(office,/LAYOUT &amp; LOB IL-SUNGTECH/);
 assert.match(office,/data-oc="exit"/);assert.match(office,/exit:setViewerMode/);
 assert.match(office,/selectionKey=\['shiftKey','ctrlKey','metaKey'\]/);
 assert.match(office,/\['home','insert','format','page','view'\]/);
 assert.match(css,/body\.layout-editing #professionalEditorShell/);
 assert.match(css,/pro-ruler-v\{display:block!important\}/);
});
test('phase 2A.1 persists transforms from existing Fabric objects and keeps legacy editor hidden',()=>{
 const professional=fs.readFileSync(new URL('../professional-editor.js',import.meta.url),'utf8');
 const office=fs.readFileSync(new URL('../office-page-editor.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../overrides.css',import.meta.url),'utf8');
 assert.match(professional,/model\(\)\.layoutDocument\?\.canvas\|\|ensureLayoutDocument\(\)\.canvas/);
 assert.match(office,/function phase2CommitCanvasTransform\(\)/);
 assert.match(office,/fabricLayoutCanvas\.getActiveObjects\(\)/);
 assert.match(office,/commitOfficeObjectGeometry\(object,row\)/);
 assert.match(office,/proSyncWorld\(row\)/);
 assert.match(office,/object:modified/);
 assert.match(office,/pointerup/);
 assert.match(office,/scheduleSave\(\)/);
 assert.match(css,/body\.layout-editing \.shape-toolbar/);
 assert.match(css,/\.upper-canvas\{z-index:2;pointer-events:auto!important/);
});
test('phase 2A.2 real Edit Layout route mounts exactly one authoritative Office canvas',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const professional=fs.readFileSync(new URL('../professional-editor.js',import.meta.url),'utf8');
 const office=fs.readFileSync(new URL('../office-page-editor.js',import.meta.url),'utf8');
 assert.match(app,/enterEditMode\(module\).*mountAuthoritativeOfficeEditor/);
 assert.match(office,/function mountAuthoritativeOfficeEditor\(\)/);
 assert.match(office,/function officeEditorRuntimeState\(\)/);
 assert.match(office,/interactiveCanvasCount!==1/);
 assert.match(office,/dataset\.authoritativeEditor=active\?'office':'inactive'/);
 assert.match(office,/globalThis\.ISTEditorRuntime=runtime/);
 assert.match(professional,/legacy\.hidden=true;legacy\.inert=true/);
 assert.match(html,/office-page-editor\.js\?v=/);
});
test('phase 2A.3 uses capabilities for empty-workspace creation and real Excel import',()=>{
 const studio=fs.readFileSync(new URL('../studio.js',import.meta.url),'utf8');
 assert.match(studio,/openNewModelDialog\(\).*can\('model\.create'\)/);
 assert.doesNotMatch(studio,/openNewModelDialog\(\).*canEdit\(\)/);
 assert.match(app,/import:'importBtn'/);
 assert.match(app,/importExcelWorkbook\(file\).*can\('excel\.import'\)/s);
 assert.match(app,/hasRemoteModel=.*_remote\?\.modelId/);
 assert.match(app,/hasRemoteVersion=.*_remote\?\.versionId/);
});
test('phase 2A.3 permission management resolves an existing profile by email only',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="permissionEmail" type="email"/);
 assert.match(html,/id="permissionEmailOptions"/);
 assert.match(app,/function resolvePermissionEmail\(\)/);
 assert.match(app,/Tài khoản này chưa tồn tại trên hệ thống/);
 assert.match(app,/This account does not exist in the system yet/);
 assert.doesNotMatch(app,/createUser|signUp.*permission/i);
});
test('phase 2B exposes a visible Office ribbon, registry library and real properties panel',()=>{
 const office=fs.readFileSync(new URL('../office-page-editor.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../overrides.css',import.meta.url),'utf8');
 assert.match(office,/left:true,right:true/);
 for(const tab of ['home','insert','format','page','view'])assert.match(office,new RegExp(`'${tab}'`));
 assert.match(office,/function renderOfficeLibrary\(lib\)/);
 assert.match(office,/Tìm đối tượng\.\.\./);
 for(const category of ['People','Machines / Equipment','Jig / Fixture','Material','Logistics','Infrastructure','Quality','LOB / Process','Line / Conveyor'])assert.match(office,new RegExp(category.replace(/[\/]/g,'\\/')));
 assert.match(office,/function proInspector=function|proInspector=function/);
 assert.match(office,/data-page-prop="widthMeters"/);
 assert.match(css,/grid-template-columns:220px minmax\(520px,1fr\) 270px/);
 assert.match(css,/Layout Editor đầy đủ được tối ưu cho máy tính/);
});
test('phase 2B ribbon commands and physical grid operate on the authoritative objects',()=>{
 const office=fs.readFileSync(new URL('../office-page-editor.js',import.meta.url),'utf8');
 const professional=fs.readFileSync(new URL('../professional-editor.js',import.meta.url),'utf8');
 const fabric=fs.readFileSync(new URL('../fabric-engine.js',import.meta.url),'utf8');
 for(const command of ['duplicate','delete','rotate-right','flip-h','flip-v'])assert.match(office,new RegExp(command));
 const geometry=fs.readFileSync(new URL('../services/editor-geometry.js',import.meta.url),'utf8');
 assert.match(geometry,/util\.multiplyTransformMatrices/);
 assert.match(geometry,/util\.qrDecompose/);
 assert.match(professional,/invertTransform\(fabricLayoutCanvas\.viewportTransform/);
 assert.match(fabric,/canvas\?\.snapGrid/);
 assert.match(fabric,/canvas\.gridMeters/);
 assert.doesNotMatch(fabric,/if\(!shapeSnapEnabled\)return;const g=SHAPE_CANVAS\.grid/);
});
test('model and version management guard EMPTY workspace before exact RPC contracts',()=>{
 assert.match(integration,/function requireRemoteId\(document,key,label\)/);
 assert.match(integration,/renameModel\(document,name\).*requireRemoteId\(document,'modelId','Model'\)/);
 assert.match(integration,/renameVersion\(document,name\).*requireRemoteId\(document,'versionId','Version'\)/);
 assert.match(integration,/deleteModel\(document\).*requireRemoteId\(document,'modelId','Model'\)/);
 assert.match(integration,/deleteVersion\(document\).*requireRemoteId\(document,'versionId','Version'\)/);
});
test('save remains in the same version and creates recoverable revision history',()=>{
 assert.match(integration,/saveRevision\(/);
 assert.match(migration,/revision=revision\+1/);
 assert.match(migration,/insert into public\.version_revisions/);
 assert.match(migration,/RESTORE/);
 assert.doesNotMatch(integration,/createVersion\([^\n]*saveCurrent/);
});
test('published snapshot and anonymous read-only path are explicit',()=>{
 assert.match(migration,/published_snapshot/);
 assert.match(migration,/get_published_versions/);
 assert.match(migration,/revoke select on public\.layout_versions from anon/);
 assert.match(migration,/grant execute on function public\.get_published_versions\(uuid\) to anon/);
});
test('legacy admin PIN authorization is absent',()=>{
 const studio=fs.readFileSync(new URL('../studio.js',import.meta.url),'utf8');
 assert.doesNotMatch(studio,/ADMIN_PIN_HASH|Mã PIN Admin/);
 assert.match(studio,/mật khẩu mã hóa file backup/);
});

test('phase 2B+ keeps fixed-page geometry and persists real Fabric resize transforms',()=>{
 const office=fs.readFileSync(new URL('../office-page-editor.js',import.meta.url),'utf8');
 const professional=fs.readFileSync(new URL('../professional-editor.js',import.meta.url),'utf8');
 const fabric=fs.readFileSync(new URL('../fabric-engine.js',import.meta.url),'utf8');
 assert.match(professional,/widthMeters:33,heightMeters:8/);
 const geometry=fs.readFileSync(new URL('../services/editor-geometry.js',import.meta.url),'utf8');
 assert.match(geometry,/base\.width\*Math\.abs\(after\.scaleX\/before\.scaleX\)/);
 assert.match(geometry,/base\.height\*Math\.abs\(after\.scaleY\/before\.scaleY\)/);
 assert.doesNotMatch(fabric,/obj\.scaleX=1;obj\.scaleY=1/);
 assert.match(professional,/opt\.e\.ctrlKey\|\|opt\.e\.metaKey/);
 assert.match(professional,/opt\.e\.button===1/);
 assert.match(office,/o\.clipPath=layoutEditing\?null:new fabric\.Rect/);
});
test('phase 2B+ smart process stations remain LOB-linked and duplicate-safe',()=>{
 const office=fs.readFileSync(new URL('../office-page-editor.js',import.meta.url),'utf8');
 for(const contract of ['officeProcessFor','officeProcessFacts','officeStationLabel','generateProcessStations'])assert.match(office,new RegExp(`function ${contract}\\(`));
 assert.match(office,/row\.metadata\?\.processId/);
 assert.match(office,/model\(\)\.processes\.find/);
 assert.match(office,/existing=new Set/);
 assert.match(office,/filter\(process=>!existing\.has\(process\.id\)\)/);
 assert.match(office,/facts\?\.dkn/);
 assert.match(office,/data-station-process/);
 assert.match(office,/data-station-display/);
});
test('phase 2B+ localizes the Office workspace and prints only layout plus KPI',()=>{
 const office=fs.readFileSync(new URL('../office-page-editor.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../overrides.css',import.meta.url),'utf8');
 assert.match(office,/function localizeOffice\(/);
 assert.match(office,/ist-language-change/);
 assert.match(office,/officePrintSheet/);
 assert.match(office,/shapeSummaryCards/);
 assert.match(css,/body\.office-print #officePrintSheet/);
 assert.match(css,/grid-template-columns:repeat\(9,1fr\)/);
});

test('phase 2C uses responsive mobile cards instead of desktop LOB and equipment tables',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const mobile=fs.readFileSync(new URL('../mobile-ux.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../overrides.css',import.meta.url),'utf8');
 assert.match(html,/id="mobileLobPanel"/);
 assert.match(html,/id="mobileEquipmentPanel"/);
 assert.match(html,/mobile-ux\.js\?v=20261028-mobile-layout-v2/);
 assert.match(mobile,/function renderMobileLobCards\(/);
 assert.match(mobile,/function renderMobileEquipment\(/);
 assert.match(mobile,/Number\(value\|\|0\)\.toFixed\(2\)/);
 assert.match(mobile,/data-mobile-reference/);
 assert.match(css,/@media\(max-width:768px\)/);
 assert.match(css,/\.process-table-wrap[^}]*display:none!important/);
 assert.match(css,/min-height:50px/);
});
test('category visibility is a single persisted workspace setting for every public Model',()=>{
 const settingsMigration=fs.readFileSync(new URL('../supabase/migrations/20261014000300_workspace_category_visibility.sql',import.meta.url),'utf8');
 assert.match(settingsMigration,/create table if not exists public\.workspace_settings/);
 assert.match(settingsMigration,/set_workspace_visible_categories/);
 assert.match(settingsMigration,/cross join public\.workspace_settings settings/);
 assert.match(integration,/async function saveCategoryVisibility\(visibleCategories\)/);
 assert.match(app,/persistenceBridge\.saveCategoryVisibility\(selected\)/);
});
test('public Viewer exposes only the layout source selected for Pushlist',()=>{
 const inline=fs.readFileSync(new URL('../inline-layout-reference.js',import.meta.url),'utf8');
 assert.match(inline,/model\(\)\?\.viewerLayoutSource/);
 assert.match(inline,/canvas\.hidden=useReference/);
 assert.match(inline,/const canChooseSource=.*can\('layout\.edit'\).*can\('version\.publish'\)/);
 assert.match(inline,/openReference\.hidden=!canChooseSource\(\)/);
 assert.match(inline,/workspace!==lastWorkspace\|\|!canChooseSource\(\)/);
});
test('Excel import reuses a Model that has no remaining visible Version',()=>{
 const integration=fs.readFileSync(new URL('../supabase-integration.js',import.meta.url),'utf8');
 assert.match(integration,/const remoteModels=await layoutService\.listModels\(\)/);
 assert.match(integration,/remoteModels\.find\(row=>importModelCode\(row\.model_code\)===code\)/);
 assert.match(integration,/models_model_code_key\|duplicate key/);
});
test('LOB toolbar separates production and QC manpower from station names',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../overrides.css',import.meta.url),'utf8');
 assert.match(html,/id="lobWorkforceSummary"/);
 assert.match(app,/function lobWorkforce\(processes\)/);
 assert.match(app,/IQC\|OQC\)\\b\|VISION\\s\*LASER/);
 assert.match(app,/Nhân lực sản xuất/);
 assert.match(app,/Nhân lực QC/);
 assert.match(css,/#processView>\.tab-file-actions/);
 assert.match(css,/#processView #lobWorkforceSummary/);
});
test('Home LOB summary loads current process data and splits production from QC manpower',()=>{
 const summary=fs.readFileSync(new URL('../lob-summary.js',import.meta.url),'utf8');
 assert.match(summary,/const workforceFor=processes/);
 assert.match(summary,/persistenceBridge\.ensureLoaded/);
 assert.match(summary,/Nhân lực sản xuất/);
 assert.match(summary,/Nhân lực QC/);
 assert.match(summary,/hasLiveRows\?Math\.max\(0,\.\.\.cycles\):n\(s\.neckTime\)/);
});
test('phase 2C mobile layout is a pan zoom inspect viewer and never mounts desktop edit chrome',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const mobile=fs.readFileSync(new URL('../mobile-ux.js',import.meta.url),'utf8');
 const fabric=fs.readFileSync(new URL('../fabric-engine.js',import.meta.url),'utf8');
 assert.match(app,/module==='layout'&&matchMedia\('\(max-width: 768px\), \(max-height: 500px\) and \(max-width: 950px\)'\)\.matches/);
 assert.match(mobile,/function fitMobileLayout\(/);
 assert.match(mobile,/pointerdown/);
 assert.match(mobile,/pointers\.size===2/);
 assert.match(mobile,/inspectMobileObject/);
 assert.match(mobile,/officeProcessFacts/);
 assert.match(fabric,/inspectable=!editable/);
});
test('mobile PDF reference provides visible fit zoom fullscreen controls and touch pinch navigation',()=>{
 const inline=fs.readFileSync(new URL('../inline-layout-reference.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../overrides.css',import.meta.url),'utf8');
 assert.match(inline,/function ensureMobileControls\(/);
 assert.match(inline,/data-reference-action=\"full\"/);
 assert.match(inline,/referencePointers\.size===2/);
 assert.match(inline,/reference-fullscreen/);
 assert.match(css,/\.layout-reference-mobile-controls/);
 assert.match(css,/\.layout-reference-inline\.reference-fullscreen/);
});
test('phase 2C stopwatch entry respects tt.measure and updates existing process workflow',()=>{
 const mobile=fs.readFileSync(new URL('../mobile-ux.js',import.meta.url),'utf8');
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const studio=fs.readFileSync(new URL('../studio.js',import.meta.url),'utf8');
 assert.match(mobile,/can\('tt\.measure'\)/);
 assert.match(mobile,/enterEditMode\('measure'\)/);
 assert.match(mobile,/openStopwatch\(station\)/);
 assert.match(mobile,/stopwatchReset\(\);stopwatchStart\(\)/);
 assert.match(studio,/function stopwatchApply\(/);
 assert.match(app,/editingModule==='measure'&&can\('tt\.measure'\)/);
 assert.match(app,/value="\$\{hasTime\?tt\.toFixed\(2\):''\}"/);
});


test('phase 2C orientation reflows phone landscape without resetting app or timer state',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const mobile=fs.readFileSync(new URL('../mobile-ux.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../overrides.css',import.meta.url),'utf8');
 const studio=fs.readFileSync(new URL('../studio.js',import.meta.url),'utf8');
 assert.match(html,/viewport-fit=cover/);
 assert.doesNotMatch(html+mobile,/orientation\.lock\(/);
 assert.match(mobile,/orientationchange/);
 assert.match(mobile,/visualViewport\?\.addEventListener\('resize'/);
 assert.match(mobile,/layoutViewMode==='fit'/);
 assert.match(mobile,/worldCenter/);
 assert.match(mobile,/fabricLayoutCanvas\.calcOffset\(\)/);
 assert.match(css,/@media\(max-height:500px\) and \(max-width:950px\) and \(orientation:landscape\)/);
 assert.match(css,/safe-area-inset-left/);
 assert.match(css,/\.viewer-mode \.upper-canvas\{pointer-events:auto!important;touch-action:none!important\}/);
 assert.match(studio,/performance\.now\(\)-stopwatch\.startAt/);
});
test('published version keeps its state without showing the PUBLISHED suffix',()=>{assert.match(app,/remoteStatus&&remoteStatus!=='PUBLISHED'/)});
test('LOB highlights automatic stations and Excel references follow each imported source sheet',()=>{assert.match(app,/auto-badge/);assert.match(app,/classList\.add\('auto-row'\)/);assert.match(app,/const displayModelName=m=>m\?\.sourceSheet/);assert.match(app,/norm\(displayModelName\(m\)\)/);assert.match(studio,/current\.sourceSheet&&globalThis\.ISTExcelImport/);assert.match(studio,/ISTExcelImport\.normalizeModelName\(current\.sourceSheet\)/)});
test('Supabase deployments do not duplicate the full database into browser localStorage',()=>{assert.match(app,/const remote=!!globalThis\.IST_LOB_CONFIG\?\.supabase\?\.url/);assert.match(app,/if\(remote\)localStorage\.removeItem\(STORAGE\.state\)/);assert.match(app,/if\(!remote\)toast\('Bộ nhớ trình duyệt đã đầy/)});
test('Excel reference images and PDFs use private Supabase Storage instead of base64 in remote layout data',()=>{assert.match(referenceEditor,/persistenceBridge\.uploadAsset\(modelId,file/);assert.match(referenceEditor,/draft\.referenceAsset=\{/);assert.match(referenceEditor,/delete draft\.referenceImage/);assert.match(studio,/persistenceBridge\.getAssetUrl\(path,3600\)/);assert.match(integration,/getAssetUrl:layoutService\.getAssetUrl/)});
test('top navigation menus close on outside click and Escape',()=>{assert.match(app,/event\.target\.closest\('\.shell-menu'\)/);assert.match(app,/querySelectorAll\('\.shell-menu\[open\]'\)/);assert.match(app,/event\.key==='Escape'/)});
