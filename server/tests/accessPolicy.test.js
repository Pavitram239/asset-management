import test from 'node:test';
import assert from 'node:assert/strict';
import { pickProfileFields, assetInput, pagination } from '../src/utils/accessPolicy.js';
import { allows, assetScope } from '../src/utils/authorization.js';
const actor={userId:'person',organizationId:'org',grants:[{permission:'asset.read',scope:'department',department:'kitchen'}]};
test('deny by default, unknown permissions and missing organization context',()=>{
  assert.equal(allows({},'asset.read'),false);
  assert.equal(allows({...actor,grants:[]},'asset.read'),false);
  assert.equal(allows(actor,'unknown'),false);
  assert.equal(allows({...actor,organizationId:null},'asset.read'),false);
});
test('department, organization and self grants never cross tenants',()=>{
  assert.equal(allows(actor,'asset.read',{organizationId:'org',department:'kitchen'}),true);
  assert.equal(allows(actor,'asset.read',{organizationId:'org',department:'accounts'}),false);
  assert.equal(allows(actor,'asset.read',{organizationId:'other',department:'kitchen'}),false);
  const self={...actor,grants:[{permission:'asset.read',scope:'self'}]};
  assert.equal(allows(self,'asset.read',{organizationId:'org',assignedToId:'person'}),true);
  assert.equal(allows(self,'asset.read',{organizationId:'org',assignedToId:'other'}),false);
  assert.equal(allows({...actor,grants:[{permission:'access.manage',scope:'department',department:'kitchen'}]},'access.manage'),false);
});
test('SQL scope is bound and closed when no grant matches',()=>{
  assert.match(assetScope({},'asset.read').sql,/FALSE/);
  assert.match(assetScope({organizationId:'org',grants:[{permission:'asset.read',scope:'organization'}]},'asset.read').sql,/FALSE/);
  const result=assetScope({...actor,grants:[{permission:'asset.read',scope:'department',department:"x' OR TRUE--"}]},'asset.read');
  assert.equal(result.sql.includes("x'"),false);
  assert.deepEqual(result.values,['org',"x' OR TRUE--"]);
});
test('profile and asset writable fields exclude privilege and identity fields',()=>{
  assert.deepEqual(pickProfileFields({name:' Alice ',role:'admin',department:'accounts',password:'x'}),{name:'Alice'});
  assert.deepEqual(assetInput({name:'Laptop',company:'Dell',department:'new-department',organizationId:'forged',creator:'forged',qr:'fake'},actor),{name:'Laptop',company:'Dell',department:'new-department'});
});
test('asset validation enforces required fields, exact dates and statuses',()=>{
  assert.throws(()=>assetInput({name:''},actor),/required/);
  assert.throws(()=>assetInput({status:'made-up'},actor,true),/status/);
  for(const date of ['not-a-date','2026-02-30','2026-1-1']) assert.throws(()=>assetInput({warrantyDate:date},actor,true),/warrantyDate/);
  assert.equal(assetInput({warrantyDate:new Date().toISOString().slice(0,10)},actor,true).warranty,'expired');
  assert.equal(assetInput({warrantyDate:'2000-01-01'},actor,true).warranty,'expired');
  assert.equal(assetInput({warrantyDate:'2099-01-01'},actor,true).warranty,'active');
});
test('pagination bounds database queries',()=>{
  for(const query of [{page:'-1'},{limit:'101'},{page:'NaN'},{page:'1.5'}]) assert.throws(()=>pagination(query));
  assert.deepEqual(pagination({page:'2',limit:'25'}),{page:2,limit:25,skip:25});
});
