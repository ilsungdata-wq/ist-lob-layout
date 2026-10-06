import test from 'node:test';
import assert from 'node:assert/strict';
await import('../services/capabilities.js');
const c=globalThis.ISTCapabilities;

test('VIEW only receives read capabilities',()=>{
 c.configure({globalRole:'USER',modelPermission:'VIEW',authenticated:true});
 assert.equal(c.can('layout.view'),true);assert.equal(c.can('lob.view'),true);assert.equal(c.can('equipment.view'),true);
 assert.equal(c.can('layout.edit'),false);assert.equal(c.can('excel.import'),false);assert.equal(c.can('version.publish'),false);
});
test('EDIT receives operational edit capabilities without management',()=>{
 c.configure({globalRole:'USER',modelPermission:'EDIT',authenticated:true});
 assert.equal(c.can('layout.edit'),true);assert.equal(c.can('lob.edit'),true);assert.equal(c.can('jig.edit'),true);assert.equal(c.can('tt.measure'),true);assert.equal(c.can('excel.import'),true);
 assert.equal(c.can('version.publish'),false);assert.equal(c.can('model.manage'),false);
});
test('MANAGE receives model/version management without global permission management',()=>{
 c.configure({globalRole:'USER',modelPermission:'MANAGE',authenticated:true});
 assert.equal(c.can('version.create'),true);assert.equal(c.can('version.publish'),true);assert.equal(c.can('model.manage'),true);assert.equal(c.can('permission.manage'),false);
});
test('ADMIN receives every declared capability',()=>{
 c.configure({globalRole:'ADMIN',modelPermission:null,authenticated:true});
 for(const capability of c.mappings.ADMIN)assert.equal(c.can(capability),true,capability);
});
