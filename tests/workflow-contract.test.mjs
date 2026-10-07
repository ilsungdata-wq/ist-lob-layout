import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const integration=fs.readFileSync(new URL('../supabase-integration.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/202610060003_permissions_revisions_management.sql',import.meta.url),'utf8');

test('admin defaults to viewer and layout edit requires explicit edit mode',()=>{
 assert.match(app,/manageMode=false,layoutEditing=false/);
 assert.match(app,/canEditLayout=\(\)=>manageMode&&layoutEditing/);
 assert.match(app,/edit\.textContent=layoutEditing\?'Xem Layout':'Edit Layout'/);
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