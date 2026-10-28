import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {testDatabase} from '../testing/testDatabase.js';

test('private inventory attachment metadata and authorization without a storage provider',{skip:!process.env.TEST_DATABASE_URL},async t=>{
 process.env.NODE_ENV='test';delete process.env.FIREBASE_STORAGE_BUCKET;
 const {pool,api:rawApi,base}=await testDatabase(t);
 const contract=JSON.parse(await readFile(new URL('../../docs/openapi.json',import.meta.url),'utf8')),Ajv=createRequire(import.meta.url)('ajv'),ajv=new Ajv({allErrors:true,nullable:true}),validators=new Map();
 const check=(route,method,response)=>{
  const path=route.split('?')[0].replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,36}(?=\/|$)/g,'/{id}');
  if(!path.startsWith('/attachments'))return response;
  const key=path+method+response.status,declared=contract.paths[path]?.[method]?.responses[String(response.status)];assert(declared,`Undeclared ${method} ${path} ${response.status}`);
  if(!validators.has(key)){const definition=declared.$ref?declared.$ref.slice(2).split('/').reduce((v,k)=>v[k],contract):declared;validators.set(key,ajv.compile({...definition.content['application/json'].schema,components:contract.components}));}
  const validate=validators.get(key);assert(validate(response.data),`${path}: ${JSON.stringify(validate.errors)}`);return response;
 };
 const api=async(route,options={})=>check(route,(options.method||'GET').toLowerCase(),await rawApi(route,options));
 const {createJWT}=await import('../src/utils/tokenUtils.js'),{provisionOrganization}=await import('../src/repositories/organizations.js');
 const person=async()=>{const id=randomUUID();await pool.query("INSERT INTO users(id,name,email,password_hash,email_verified_at) VALUES($1,'Attachment reviewer',$2,'fixture-only',now())",[id,id+'@example.test']);return {id,cookie:'token='+createJWT({userId:id})};};
 const fixture=async()=>{
  const owner=await person(),org=(await provisionOrganization(pool,owner.id,'Private file fixture')).id,f={owner,org};
  await pool.query("UPDATE organizations SET currency='INR',time_zone='Asia/Kolkata' WHERE id=$1",[org]);
  await pool.query("INSERT INTO organization_departments(organization_id,code,name) VALUES($1,'kitchen','Kitchen')",[org]);
  f.location=(await pool.query("INSERT INTO locations(organization_id,name,kind) VALUES($1,'Store','store') RETURNING id",[org])).rows[0].id;
  f.category=(await pool.query("INSERT INTO category_definitions(organization_id,name,fields) VALUES($1,'Equipment','[]') RETURNING id",[org])).rows[0].id;
  await pool.query("INSERT INTO category_revisions(organization_id,category_id,version,fields,actor_id) VALUES($1,$2,1,'[]',$3)",[org,f.category,owner.id]);
  f.unit=(await pool.query("INSERT INTO unit_definitions(organization_id,code,name,quantity_scale) VALUES($1,'EA','Each',0) RETURNING id",[org])).rows[0].id;
  f.item=(await pool.query("INSERT INTO catalog_items(organization_id,category_id,category_version,unit_id,name,tracking_mode,department_code,owning_location_id) VALUES($1,$2,1,$3,'Synthetic item','individual','kitchen',$4) RETURNING id",[org,f.category,f.unit,f.location])).rows[0].id;return f;
 };
 const call=(f,path,body,actor=f.owner,key=randomUUID())=>api(path,{method:'POST',body,cookie:actor.cookie,organization:f.org,headers:{'Idempotency-Key':key}});
 const get=(f,path,actor=f.owner)=>api(path,{cookie:actor.cookie,organization:f.org});
 // Metadata fixture only: no private object is uploaded or represented as present.
 const staged=async(f,actor=f.owner,{expired=false,type='application/pdf'}={})=>{
  const id=randomUUID(),command=(await pool.query("INSERT INTO api_commands(actor_id,organization_id,operation_id,idempotency_key,request_hash) VALUES($1,$2,'stageAttachment',$3,'synthetic-metadata-only') RETURNING id",[actor.id,f.org,randomUUID()])).rows[0].id;
  await pool.query(`INSERT INTO attachments(id,organization_id,created_by,command_id,file_name,media_type,size_bytes,content_hash,storage_key,expires_at)
   VALUES($1,$2,$3,$4,'Synthetic product document.pdf',$5,100,$6,$7,clock_timestamp()+($8*interval '1 hour'))`,[id,f.org,actor.id,command,type,'0'.repeat(64),`assets/documents/${f.org}/${id}/${randomUUID()}`,expired?-1:24]);
  await pool.query("UPDATE api_commands SET resource_type='attachment',resource_id=$2,result=$3,committed_at=clock_timestamp() WHERE id=$1",[command,id,{data:{id}}]);return id;
 };
 const link=(f,id,targetType='item',targetId=f.item,category='document',actor=f.owner,key=randomUUID())=>call(f,`/attachments/${id}/links`,{expectedVersion:1,targetType,targetId,category},actor,key);
 t.beforeEach(()=>pool.query('DELETE FROM authentication_attempts'));

 await t.test('typed target links are tenant-bound, immutable, replay-safe and never disclose object keys',async()=>{
  const f=await fixture(),other=await fixture(),id=await staged(f),key=randomUUID();
  const first=await link(f,id,'item',f.item,'document',f.owner,key);assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(first.data.data.targetId,f.item);
  assert(!JSON.stringify(first.data).includes('assets/documents'));
  assert.deepEqual((await link(f,id,'item',f.item,'document',f.owner,key)).data,first.data);
  assert.equal((await get(f,`/attachments?targetType=item&targetId=${f.item}`)).data.data.length,1);
  const fresh=await staged(f);assert.equal((await link(f,fresh,'item',other.item)).status,404);
  await assert.rejects(()=>pool.query('INSERT INTO attachment_links(organization_id,attachment_id,item_id,category,created_by) VALUES($1,$2,$3,\'document\',$4)',[f.org,fresh,other.item,f.owner.id]),error=>error.code==='23503');
  await assert.rejects(()=>pool.query('UPDATE attachment_links SET item_id=$2 WHERE attachment_id=$1',[id,other.item]),/immutable/);
  const missing=await staged(f);await assert.rejects(()=>pool.query("UPDATE attachments SET state='linked' WHERE id=$1",[missing]),/typed target/);
  assert.equal((await link(f,fresh,'purchase_order',randomUUID())).status,400);
 });
 await t.test('financial filenames/content/list results require cost visibility and cached replay cannot leak them',async()=>{
  const f=await fixture(),p=await person();await pool.query('INSERT INTO memberships(organization_id,user_id) VALUES($1,$2)',[f.org,p.id]);
  for(const permission of ['attachment.read','attachment.write','catalog.read','catalog.manage'])await pool.query("INSERT INTO user_permissions(organization_id,user_id,permission_id,scope) VALUES($1,$2,$3,'organization')",[f.org,p.id,permission]);
  const own=await staged(f,p);assert.equal((await link(f,own,'item',f.item,'invoice',p)).status,403);
  await pool.query("INSERT INTO user_permissions(organization_id,user_id,permission_id,scope) VALUES($1,$2,'cost.read','organization')",[f.org,p.id]);
  const key=randomUUID(),linked=await link(f,own,'item',f.item,'invoice',p,key);assert.equal(linked.status,200);assert.equal(linked.data.data.containsCost,true);
  await pool.query("DELETE FROM user_permissions WHERE organization_id=$1 AND user_id=$2 AND permission_id='cost.read'",[f.org,p.id]);
  assert.equal((await link(f,own,'item',f.item,'invoice',p,key)).status,404);
  const list=await get(f,`/attachments?targetType=item&targetId=${f.item}`,p);assert.equal(list.status,200);assert.deepEqual(list.data.data,[]);
  assert.equal((await get(f,`/attachments/${own}/content`,p)).status,404);
 });
 await t.test('staging belongs to its uploader, expires, and removal retains history with durable cleanup intent',async()=>{
  const f=await fixture(),other=await person();await pool.query('INSERT INTO memberships(organization_id,user_id) VALUES($1,$2)',[f.org,other.id]);
  await pool.query("INSERT INTO user_permissions(organization_id,user_id,permission_id,scope) VALUES($1,$2,'attachment.write','organization')",[f.org,other.id]);
  const stagedId=await staged(f);assert.equal((await link(f,stagedId,'item',f.item,'document',other)).status,404);
  const expired=await staged(f,f.owner,{expired:true});assert.equal((await link(f,expired)).status,404);assert.equal((await get(f,`/attachments/${expired}/content`)).status,404);
  const linked=await staged(f);await link(f,linked);const key=randomUUID(),body={expectedVersion:2,reason:'Synthetic replacement'};
  const removed=await call(f,`/attachments/${linked}/removals`,body,f.owner,key);assert.equal(removed.status,200,JSON.stringify(removed.data));assert.equal(removed.data.data.status,'removed');
  assert.equal((await call(f,`/attachments/${linked}/removals`,body,f.owner,key)).status,200);
  assert.equal((await get(f,`/attachments/${linked}/content`)).status,404);assert.equal((await pool.query('SELECT 1 FROM attachment_links WHERE attachment_id=$1',[linked])).rowCount,1);
  assert.equal((await pool.query("SELECT 1 FROM storage_cleanup WHERE folder='assets' AND category='documents' AND object_name LIKE $1",[f.org+'/'+linked+'/%'])).rowCount,1);
  const unlinked=await staged(f);assert.equal((await call(f,`/attachments/${unlinked}/removals`,{expectedVersion:1,reason:'Unused staging'})).status,200);
 });
 await t.test('lot/unit attachments use their current scoped stock context and download context still needs authentication',async()=>{
  const f=await fixture(),posted=await call(f,'/inventory/opening-balances',{itemId:f.item,locationId:f.location,quantity:'1',reason:'Fixture baseline',receivedOn:'2026-10-20',units:[{assetTag:'PRIVATE-1'}]});assert.equal(posted.status,201,JSON.stringify(posted.data));
  const unit=(await pool.query('SELECT id FROM products WHERE catalog_item_id=$1',[f.item])).rows[0].id;
  for(const [type,id]of [['lot',posted.data.data.lotId],['unit',unit]]){const file=await staged(f);assert.equal((await link(f,file,type,id)).status,200);assert.equal((await get(f,`/attachments?targetType=${type}&targetId=${id}`)).data.data.length,1);
   assert.equal((await api(`/attachments/${file}/content?organizationId=${f.org}`)).status,401);
   assert.equal((await api(`/attachments/${file}/content?organizationId=${f.org}`,{cookie:f.owner.cookie})).status,503);
  }
 });
 await t.test('unconfigured storage and forged file types fail without metadata commits or provider calls',async()=>{
  const f=await fixture();
  const upload=async(data,type,name)=>{const form=new FormData();form.append('file',new Blob([data],{type}),name);const response=await fetch(base+'/attachments',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Cookie:f.owner.cookie,'X-Organization-Id':f.org,'Idempotency-Key':randomUUID()},body:form});return check('/attachments','post',{status:response.status,data:await response.json()});};
  assert.equal((await upload('plain text','image/png','forged.png')).status,400);
  const unavailable=await upload('%PDF-1.7\nSynthetic fixture','application/pdf','fixture.pdf');assert.equal(unavailable.status,503);assert.equal(unavailable.data.code,'STORAGE_UNAVAILABLE');
  assert.equal((await pool.query('SELECT 1 FROM attachments WHERE organization_id=$1',[f.org])).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM api_commands WHERE organization_id=$1',[f.org])).rowCount,0);
 });
});
