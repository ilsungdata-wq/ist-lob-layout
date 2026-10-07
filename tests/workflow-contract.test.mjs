import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const integration=fs.readFileSync(new URL('../supabase-integration.js',import.meta.url),'utf8');
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
test('permission save reloads and verifies persisted capability state',()=>{
 assert.match(app,/changes=permissionCapabilities\.filter/);
 assert.match(app,/permissionCache=await persistenceBridge\.permissionData\(\)/);
 assert.match(app,/Supabase chưa phản ánh đầy đủ quyền vừa lưu/);
});
test('phase 2A uses one Fabric Office editor with real-world geometry and dedicated edit mode',()=>{
 const professional=fs.readFileSync(new URL('../professional-editor.js',import.meta.url),'utf8');
 const office=fs.readFileSync(new URL('../office-page-editor.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../overrides.css',import.meta.url),'utf8');
 assert.match(app,/applyRole\(\);if\(layoutEditing&&typeof initProfessionalLayoutEditor/);
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
 assert.match(office,/Object\.assign\(row,next\)/);
 assert.match(office,/proSyncWorld\(row\)/);
 assert.match(office,/object:modified/);
 assert.match(office,/pointerup/);
 assert.match(office,/scheduleSave\(\)/);
 assert.match(css,/body\.layout-editing \.shape-toolbar/);
 assert.match(css,/\.upper-canvas\{z-index:2;pointer-events:auto!important/);
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
