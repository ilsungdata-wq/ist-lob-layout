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
 assert.match(app,/Chỉnh sửa ▾/);assert.match(app,/Quản lý ▾/);
 assert.match(app,/editingModule==='equipment'/);
 assert.match(app,/canAccessDrafts=.*session\.authenticated/);
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
