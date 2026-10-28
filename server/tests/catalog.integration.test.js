import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {testDatabase} from '../testing/testDatabase.js';

test('catalog and opening stock through PostgreSQL/HTTP',{skip:!process.env.TEST_DATABASE_URL},async t=>{
 process.env.NODE_ENV='test';
 const {pool,api:rawApi}=await testDatabase(t);
 const contract=JSON.parse(await readFile(new URL('../../docs/openapi.json',import.meta.url),'utf8'));
 const Ajv=createRequire(import.meta.url)('ajv'),ajv=new Ajv({allErrors:true,nullable:true}),validators=new Map();
 const api=async(route,options={})=>{
  const response=await rawApi(route,options),path=route.split('?')[0].replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,36}(?=\/|$)/g,'/{id}');
  if(/^\/(catalog|inventory)(\/|$)/.test(path)){
   const method=(options.method||'GET').toLowerCase(),key=path+method+response.status,declared=contract.paths[path]?.[method]?.responses[String(response.status)];assert(declared,`Undeclared ${method} ${path} ${response.status}`);
   if(!validators.has(key)){const definition=declared.$ref?declared.$ref.slice(2).split('/').reduce((v,k)=>v[k],contract):declared;validators.set(key,ajv.compile({...definition.content['application/json'].schema,components:contract.components}));}
   const validate=validators.get(key);assert(validate(response.data),`${path}: ${JSON.stringify(validate.errors)}`);
  }
  return response;
 };
 const {createJWT}=await import('../src/utils/tokenUtils.js');
 const person=async()=>{const id=randomUUID();await pool.query("INSERT INTO users(id,name,email,password_hash,email_verified_at) VALUES($1,'Catalog reviewer',$2,'fixture-only',now())",[id,id+'@example.test']);return {id,cookie:'token='+createJWT({userId:id})};};
 const call=(f,path,body,method='POST',actor=f.owner,key=randomUUID())=>api(path,{method,body,cookie:actor.cookie,organization:f.org,headers:{'Idempotency-Key':key}});
 const get=(f,path,actor=f.owner)=>api(path,{cookie:actor.cookie,organization:f.org});
 const fixture=async()=>{
  const owner=await person(),workspace=await api('/workspaces',{method:'POST',cookie:owner.cookie,headers:{'Idempotency-Key':randomUUID()},body:{name:'Catalog company',currency:'INR',timeZone:'Asia/Kolkata'}});
  assert.equal(workspace.status,201,JSON.stringify(workspace.data));
  const f={owner,org:workspace.data.data.id};
  await pool.query("INSERT INTO organization_departments(organization_id,code,name) VALUES($1,'kitchen','Kitchen')",[f.org]);
  const location=await call(f,'/locations',{name:'Kitchen store',kind:'store'});assert.equal(location.status,201);f.location=location.data.data.id;
  const category=await call(f,'/categories',{name:'Kitchen equipment',fields:[{key:'material',label:'Material',type:'text',required:true}]});f.category=category.data.data.id;
  for(const [code,scale]of [['EA',0],['KG',3]]){const unit=await call(f,'/units-of-measure',{name:code,code,quantityScale:scale});f[code]=unit.data.data.id;}
  return f;
 };
 const item=async(f,mode='reusable_stock',unit='EA')=>{
  const response=await call(f,'/catalog/items',{name:mode==='individual'?'Laptop':mode==='consumable'?'Rice':'Kitchen pans',categoryId:f.category,unitId:f[unit],departmentCode:'kitchen',owningLocationId:f.location,trackingMode:mode,attributes:{material:'Steel'}});
  assert.equal(response.status,201,JSON.stringify(response.data));return response.data.data;
 };
 const opening=(f,itemId,extra={})=>({itemId,locationId:f.location,quantity:'2',reason:'Verified stock already on hand',receivedOn:'2026-10-20',...extra});
 const member=async f=>{const p=await person();await pool.query('INSERT INTO memberships(organization_id,user_id) VALUES($1,$2)',[f.org,p.id]);return p;};
 const grant=async(f,p,permission,scope='organization',location=null)=>pool.query('INSERT INTO user_permissions(organization_id,user_id,permission_id,scope,location_id) VALUES($1,$2,$3,$4,$5)',[f.org,p.id,permission,scope,location]);
 t.beforeEach(()=>pool.query('DELETE FROM authentication_attempts'));

 await t.test('three tracking modes retain original lots, exact quantities, warranty dates and unique individual identities',async()=>{
  const f=await fixture(),pan=await item(f),rice=await item(f,'consumable','KG'),laptop=await item(f,'individual');
  const panEntry=await call(f,'/inventory/opening-balances',opening(f,pan.id,{unitCost:{amount:'250.5',currency:'INR'},purchasedOn:'2026-10-01',warranty:{expiresOn:'2027-10-01',coverage:'Manufacturing faults',supportUrl:'https://example.test/support'}}));
  assert.equal(panEntry.status,201,JSON.stringify(panEntry.data));
  assert.equal((await call(f,'/inventory/opening-balances',opening(f,rice.id,{quantity:'10.125'}))).status,201);
  assert.equal((await call(f,'/inventory/opening-balances',opening(f,laptop.id,{units:[{assetTag:'LAP-001',serialNumber:'SERIAL-ONE'},{assetTag:'LAP-002',serialNumber:'SERIAL-ONE'}]}))).status,201);
  const balances=await get(f,'/inventory/balances');assert.equal(balances.status,200,JSON.stringify(balances.data));
  assert.deepEqual(balances.data.data.filter(b=>b.itemId===laptop.id).map(b=>b.quantity),['1','1']);
  assert.equal(balances.data.data.find(b=>b.itemId===rice.id).quantity,'10.125');
  const lot=await get(f,'/inventory/lots/'+panEntry.data.data.lotId);assert.equal(lot.status,200,JSON.stringify(lot.data));
  assert.deepEqual(lot.data.data.unitCost,{amount:'250.5',currency:'INR'});assert.equal(lot.data.data.costBasis,'declared_opening');
  assert.equal(lot.data.data.receivedOn,'2026-10-20');assert.equal(lot.data.data.purchasedOn,'2026-10-01');assert.equal(lot.data.data.warranty.expiresOn,'2027-10-01');
  const list=await get(f,'/inventory/lots?itemId='+pan.id);assert.equal(list.status,200,JSON.stringify(list.data));assert.equal(list.data.data.length,1);
  const unknown=(await get(f,'/inventory/lots?itemId='+rice.id)).data.data[0];assert.equal(unknown.unitCost,null);assert.equal(unknown.costBasis,'unknown');
  const units=(await pool.query('SELECT id FROM products WHERE catalog_item_id=$1',[laptop.id])).rows;
  const unit=await get(f,'/products/'+units[0].id);assert.equal(unit.status,200);assert.equal(unit.data.product.serialNumber,'SERIAL-ONE');assert.equal(unit.data.product.capabilities.update,false);
  assert.equal((await call(f,'/products/'+units[0].id,{assignedToId:f.owner.id},'PATCH')).data.code,'WORKFLOW_REQUIRED');
  assert.equal((await call(f,'/products/'+units[0].id,undefined,'DELETE')).data.code,'WORKFLOW_REQUIRED');
 });
 await t.test('opening is replay-safe after cache expiry and duplicate tags roll back the whole acquisition',async()=>{
  const f=await fixture(),laptop=await item(f,'individual'),key=randomUUID(),body=opening(f,laptop.id,{units:[{assetTag:'A'},{assetTag:'B'}]});
  const responses=await Promise.all([call(f,'/inventory/opening-balances',body,'POST',f.owner,key),call(f,'/inventory/opening-balances',body,'POST',f.owner,key)]);
  assert.deepEqual(responses.map(r=>r.status),[201,201]);assert.equal(responses[0].data.data.id,responses[1].data.data.id);
  await pool.query("UPDATE api_commands SET result=NULL WHERE organization_id=$1 AND operation_id='postOpeningBalance'",[f.org]);
  assert.equal((await call(f,'/inventory/opening-balances',body,'POST',f.owner,key)).data.data.id,responses[0].data.data.id);
  assert.equal((await get(f,'/commands/postOpeningBalance/'+key)).status,200);
  assert.equal((await call(f,'/inventory/opening-balances',{...body,reason:'Changed intent'},'POST',f.owner,key)).data.code,'IDEMPOTENCY_MISMATCH');
  const duplicate=await call(f,'/inventory/opening-balances',opening(f,laptop.id,{units:[{assetTag:' a '},{assetTag:'C'}]}));assert.equal(duplicate.status,409);
  assert.equal((await pool.query('SELECT 1 FROM inventory_lots WHERE organization_id=$1',[f.org])).rowCount,1);
  assert.equal((await pool.query('SELECT 1 FROM products WHERE organization_id=$1',[f.org])).rowCount,2);
  assert.equal((await pool.query('SELECT 1 FROM inventory_journals WHERE organization_id=$1',[f.org])).rowCount,1);
 });
 await t.test('cost is independent from stock visibility and is redacted again on replay after revocation',async()=>{
  const f=await fixture(),pan=await item(f),posted=await call(f,'/inventory/opening-balances',opening(f,pan.id,{unitCost:{amount:'0',currency:'INR'}})),lotId=posted.data.data.lotId,p=await member(f);
  await grant(f,p,'inventory.read');await grant(f,p,'catalog.manage');await grant(f,p,'inventory.opening');
  const hidden=(await get(f,'/inventory/lots/'+lotId,p)).data.data;assert(!Object.hasOwn(hidden,'unitCost'));assert(!Object.hasOwn(hidden,'costBasis'));
  assert.equal((await call(f,'/inventory/opening-balances',opening(f,pan.id,{unitCost:{amount:'1',currency:'INR'}}),'POST',p)).status,403);
  await grant(f,p,'cost.read');const key=randomUUID(),support={expectedVersion:1,warranty:{coverage:'Updated support'},reason:'Supplier support clarified'};
  const first=await call(f,`/inventory/lots/${lotId}/support`,support,'PATCH',p,key);assert.equal(first.status,200,JSON.stringify(first.data));assert.deepEqual(first.data.data.unitCost,{amount:'0',currency:'INR'});
  await pool.query("DELETE FROM user_permissions WHERE organization_id=$1 AND user_id=$2 AND permission_id='cost.read'",[f.org,p.id]);
  const replay=await call(f,`/inventory/lots/${lotId}/support`,support,'PATCH',p,key);assert.equal(replay.status,200,JSON.stringify(replay.data));assert(!Object.hasOwn(replay.data.data,'unitCost'));
  assert.equal((await pool.query('SELECT 1 FROM inventory_lot_history WHERE lot_id=$1',[lotId])).rowCount,2);
 });
 await t.test('category changes flag incompatible attributes, preserve item history and block unreconciled new acquisition',async()=>{
  const f=await fixture(),pan=await item(f);
  const changed=await call(f,'/categories/'+f.category,{expectedVersion:1,fields:[{key:'capacity',label:'Capacity',type:'number',required:true}]},'PATCH');assert.equal(changed.status,200);
  const current=await get(f,'/catalog/items/'+pan.id);assert(current.data.data.attributeIssues.length);
  assert.equal((await call(f,'/inventory/opening-balances',opening(f,pan.id))).data.code,'CATEGORY_REVIEW_REQUIRED');
  const fixed=await call(f,'/catalog/items/'+pan.id,{expectedVersion:1,attributes:{capacity:5}},'PATCH');assert.equal(fixed.status,200,JSON.stringify(fixed.data));assert.deepEqual(fixed.data.data.attributeIssues,[]);
  const history=await get(f,`/catalog/items/${pan.id}/history`);assert.equal(history.status,200,JSON.stringify(history.data));assert.deepEqual(history.data.data.map(row=>row.attributes),[{capacity:5},{material:'Steel'}]);
  assert.equal((await call(f,'/inventory/opening-balances',opening(f,pan.id))).status,201);
  assert.equal((await call(f,'/catalog/items/'+pan.id,{expectedVersion:1,name:'Stale'},'PATCH')).data.code,'VERSION_CONFLICT');
 });
 await t.test('location scope unions are tenant-bound; employee-safe requestability never exposes quantities or unit identities',async()=>{
  const f=await fixture(),other=await fixture(),pan=await item(f),foreign=await item(other),p=await member(f);
  const south=(await call(f,'/locations',{name:'Other branch',kind:'branch'})).data.data.id;
  await grant(f,p,'catalog.read','location',f.location);await grant(f,p,'inventory.read','location',f.location);await grant(f,p,'catalog.requestable.read','location',f.location);
  await call(f,'/inventory/opening-balances',opening(f,pan.id));
  assert.equal((await get(f,'/catalog/items',p)).data.data.length,1);
  assert.equal((await get(f,'/catalog/items/'+foreign.id,p)).status,404);
  assert.equal((await get(f,'/locations',p)).data.data.length,1);assert.equal((await get(f,'/locations/'+south,p)).status,404);
  const employee=await member(f);await grant(f,employee,'catalog.requestable.read');
  const requestable=await get(f,'/catalog/requestable-items',employee);assert.equal(requestable.status,200);assert.deepEqual(Object.keys(requestable.data.data[0]).sort(),['id','name','categoryId','unitId','trackingMode'].sort());
  assert.equal((await get(f,'/catalog/items',employee)).status,403);assert.equal((await get(f,'/inventory/balances',employee)).status,403);
  assert.equal((await get(f,'/inventory/balances?itemId='+foreign.id,p)).data.data.length,0);
 });
 await t.test('invalid modes, unit precision, wrong identities, foreign references, dates and archive routing fail before posting',async()=>{
  const f=await fixture(),other=await fixture(),pan=await item(f),rice=await item(f,'consumable','KG'),laptop=await item(f,'individual');
  const invalidBodies=[opening(f,pan.id,{quantity:'1.5'}),opening(f,rice.id,{quantity:'1.0001'}),opening(f,laptop.id),opening(f,laptop.id,{units:[{assetTag:'A'},{assetTag:'a'}]}),opening(f,pan.id,{units:[{assetTag:'A'}]}),opening(f,pan.id,{receivedOn:'2026-02-30'}),opening(f,pan.id,{purchasedOn:'2026-10-21'}),opening(f,pan.id,{locationId:other.location}),opening(f,pan.id,{warranty:{supportUrl:'javascript:alert(1)'}})];
  for(const body of invalidBodies)assert.equal((await call(f,'/inventory/opening-balances',body)).status,400,JSON.stringify(body));
  assert.equal((await pool.query('SELECT 1 FROM inventory_journals WHERE organization_id=$1',[f.org])).rowCount,0);
  assert.equal((await call(f,'/catalog/items',{name:'Invalid individual',categoryId:f.category,unitId:f.KG,departmentCode:'kitchen',trackingMode:'individual',attributes:{material:'Steel'}})).status,400);
  await call(f,'/catalog/items/'+pan.id,{expectedVersion:1,active:false},'PATCH');assert.equal((await call(f,'/inventory/opening-balances',opening(f,pan.id))).status,400);
 });
 await t.test('archive preserves stock/history despite an archived category; financial fields cannot become public specifications',async()=>{
  const f=await fixture(),pan=await item(f);await call(f,'/inventory/opening-balances',opening(f,pan.id));
  assert.equal((await call(f,'/categories',{name:'Financial specifications',fields:[{key:'unit_cost',label:'Unit cost',type:'number',required:false}]})).status,400);
  assert.equal((await call(f,'/catalog/items',{name:'Null attributes',categoryId:f.category,unitId:f.EA,departmentCode:'kitchen',trackingMode:'reusable_stock',attributes:null})).status,400);
  assert.equal((await call(f,'/categories/'+f.category,{expectedVersion:1,active:false},'PATCH')).status,200);
  const archived=await call(f,'/catalog/items/'+pan.id,{expectedVersion:1,active:false},'PATCH');assert.equal(archived.status,200,JSON.stringify(archived.data));assert.deepEqual(archived.data.data.attributes,{material:'Steel'});
  assert.equal((await get(f,'/inventory/balances?itemId='+pan.id)).data.data[0].quantity,'2');assert.equal((await get(f,'/catalog/items/'+pan.id+'/history')).data.data.length,2);
  assert.equal((await call(f,'/inventory/opening-balances',opening(f,pan.id))).status,400);
 });
});
