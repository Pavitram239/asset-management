import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { testDatabase } from '../testing/testDatabase.js';

test('inventory configuration and descendant access through PostgreSQL/HTTP', {skip:!process.env.TEST_DATABASE_URL}, async t => {
  process.env.NODE_ENV='test';
  const {pool,api:rawApi}=await testDatabase(t);
  const contract=JSON.parse(await readFile(new URL('../../docs/openapi.json',import.meta.url),'utf8'));
  const Ajv=createRequire(import.meta.url)('ajv'),ajv=new Ajv({allErrors:true,nullable:true}),validators=new Map();
  const api=async(route,options={})=>{
    const response=await rawApi(route,options);
    const path=route.split('?')[0].replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,36}(?=\/|$)/g,'/{id}');
    if(/^\/(locations|categories|units-of-measure)(\/|$)/.test(path)){
      const method=(options.method||'GET').toLowerCase(),key=path+method+response.status;
      const declared=contract.paths[path]?.[method]?.responses[String(response.status)];
      assert(declared,`Undeclared ${method} ${path} ${response.status}`);
      if(!validators.has(key)){
        const definition=declared.$ref?declared.$ref.slice(2).split('/').reduce((v,k)=>v[k],contract):declared;
        validators.set(key,ajv.compile({...definition.content['application/json'].schema,components:contract.components}));
      }
      const validate=validators.get(key);assert(validate(response.data),`${path}: ${JSON.stringify(validate.errors)}`);
    }
    return response;
  };
  const {createJWT}=await import('../src/utils/tokenUtils.js');
  const {resolveGrants,allows}=await import('../src/utils/authorization.js');
  const {decryptPayload}=await import('../src/services/deliveryCrypto.js');
  const person=async()=>{
    const id=randomUUID(),email=id+'@example.test';
    await pool.query("INSERT INTO users(id,name,email,password_hash,email_verified_at) VALUES($1,'Configuration reviewer',$2,'test-fixture-no-login',now())",[id,email]);
    return {id,email,cookie:'token='+createJWT({userId:id})};
  };
  const call=(f,path,body,method='POST',key=randomUUID(),actor=f.owner)=>api(path,{method,body,cookie:actor.cookie,organization:f.org,headers:{'Idempotency-Key':key}});
  const workspace=async()=>{
    const owner=await person(),response=await api('/workspaces',{method:'POST',cookie:owner.cookie,body:{name:'Inventory configuration company',currency:'INR',timeZone:'Asia/Kolkata'},headers:{'Idempotency-Key':randomUUID()}});
    assert.equal(response.status,201,JSON.stringify(response.data));return {owner,org:response.data.data.id};
  };
  const location=async(f,name,parentId=null)=>{
    const r=await call(f,'/locations',{name,kind:'room',parentId});assert.equal(r.status,201,JSON.stringify(r.data));return r.data.data;
  };
  const member=async(f)=>{const p=await person();await pool.query('INSERT INTO memberships(organization_id,user_id) VALUES($1,$2)',[f.org,p.id]);return p;};
  const grant=async(f,p,code,scope='organization',loc=null,dept=null)=>pool.query('INSERT INTO user_permissions(organization_id,user_id,permission_id,scope,location_id,department_code) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[f.org,p.id,code,scope,loc,dept]);
  const preview=async(f,loc,parent,version=1)=>{
    const response=await call(f,`/locations/${loc.id}/move-previews`,{expectedVersion:version,newParentId:parent});assert.equal(response.status,201,JSON.stringify(response.data));return response.data.data;
  };
  const move=(f,p,key=randomUUID())=>call(f,`/locations/${p.locationId}/moves`,{expectedVersion:p.version,newParentId:p.newParentId,impactPreviewId:p.id,acknowledgeScopeChanges:true},'POST',key);
  t.beforeEach(()=>pool.query('DELETE FROM authentication_attempts'));

  await t.test('tenant-bound tree rejects cycles, foreign parents and inactive ancestors at the API and database',async()=>{
    const f=await workspace(),other=await workspace(),root=await location(f,'Building'),child=await location(f,'Kitchen',root.id),room=await location(f,'Pantry',child.id),foreign=await location(other,'Other company');
    assert.equal((await call(f,`/locations/${root.id}/move-previews`,{expectedVersion:1,newParentId:room.id})).status,400);
    assert.equal((await call(f,'/locations',{name:'Foreign child',kind:'room',parentId:foreign.id})).status,400);
    await assert.rejects(()=>pool.query('UPDATE locations SET parent_id=$2 WHERE id=$1',[root.id,room.id]),error=>error.code==='23514');
    await assert.rejects(()=>pool.query("INSERT INTO locations(organization_id,name,kind,parent_id) VALUES($1,'Foreign FK','room',$2)",[f.org,foreign.id]),error=>error.code==='23503');
    assert.equal((await call(f,`/locations/${child.id}`,{expectedVersion:1,active:false},'PATCH')).status,200);
    assert.equal((await call(f,'/locations',{name:'Blocked below archive',kind:'room',parentId:room.id})).status,400);
    assert.equal((await api('/locations/'+room.id,{cookie:f.owner.cookie,organization:f.org})).status,200);
    assert.equal((await api('/locations/'+foreign.id,{cookie:f.owner.cookie,organization:f.org})).status,404);
    assert.equal((await pool.query('SELECT 1 FROM location_ancestry WHERE ancestor_id=$1 AND descendant_id=$2',[root.id,room.id])).rowCount,1);
  });
  await t.test('versions, replay after response loss, cursor isolation and revoked authority fail safely',async()=>{
    const f=await workspace(),other=await workspace(),key=randomUUID(),body={name:'Main store',kind:'store'};
    const responses=await Promise.all([call(f,'/locations',body,'POST',key),call(f,'/locations',body,'POST',key)]);
    assert.deepEqual(responses.map(r=>r.status),[201,201]);assert.equal(responses[0].data.data.id,responses[1].data.data.id);
    const id=responses[0].data.data.id;
    assert.equal((await call(f,'/locations',{...body,name:'Other intent'},'POST',key)).data.code,'IDEMPOTENCY_MISMATCH');
    await pool.query("UPDATE api_commands SET result=NULL WHERE actor_id=$1 AND operation_id='createLocation'",[f.owner.id]);
    assert.equal((await call(f,'/locations',body,'POST',key)).data.data.id,id);
    assert.equal((await api('/commands/createLocation/'+key,{cookie:f.owner.cookie,organization:f.org})).status,200);
    assert.equal((await call(f,'/locations/'+id,{expectedVersion:1,name:'Renamed store'},'PATCH')).status,200);
    assert.equal((await call(f,'/locations/'+id,{expectedVersion:1,name:'Stale name'},'PATCH')).data.code,'VERSION_CONFLICT');
    await location(f,'Another location');
    const page=await api('/locations?pageSize=1',{cookie:f.owner.cookie,organization:f.org});assert(page.data.meta.nextCursor);
    assert.equal((await api('/locations?cursor='+page.data.meta.nextCursor,{cookie:other.owner.cookie,organization:other.org})).status,400);
    assert.equal((await api('/categories?cursor='+page.data.meta.nextCursor,{cookie:f.owner.cookie,organization:f.org})).status,400);
    await pool.query("DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE organization_id=$1) AND permission_id='location.manage'",[f.org]);
    await pool.query("DELETE FROM user_permissions WHERE organization_id=$1 AND user_id=$2 AND permission_id='location.manage'",[f.org,f.owner.id]);
    assert.equal((await call(f,'/locations',body,'POST',key)).status,403);
    assert.equal((await api('/commands/createLocation/'+key,{cookie:f.owner.cookie,organization:f.org})).status,403);
  });
  await t.test('location scopes include descendants and combine with department/self scopes without cross-company leakage',async()=>{
    const f=await workspace(),root=await location(f,'North'),child=await location(f,'Kitchen',root.id),outside=await location(f,'South'),p=await member(f);
    await pool.query("INSERT INTO organization_departments(organization_id,code,name) VALUES($1,'lab','Laboratory'),($1,'unknown','Unspecified')",[f.org]);
    await grant(f,p,'asset.read','location',root.id);await grant(f,p,'asset.read','department',null,'lab');await grant(f,p,'asset.read','self');
    const product=async(name,loc,dept,assigned=null)=>{
      const id=randomUUID();await pool.query(`INSERT INTO products(id,organization_id,name,company,department_code,location_id,creator_id,created_by,assigned_to_id,qr) VALUES($1,$2,$3,'Synthetic',$4,$5,$6,'Synthetic reviewer',$7,'test-qr')`,[id,f.org,name,dept,loc,f.owner.id,assigned]);return id;
    };
    const scopedRecipient=await member(f);
    const descendant=await product('Descendant',child.id,'unknown',scopedRecipient.id),department=await product('Department',outside.id,'lab'),self=await product('Self',null,'unknown',p.id);
    await product('Denied',outside.id,'unknown');await product('Unmapped legacy',null,'unknown');
    const result=await api('/products',{cookie:p.cookie,organization:f.org});assert.equal(result.status,200,JSON.stringify(result.data));
    assert.deepEqual(result.data.products.map(row=>row._id).sort(),[descendant,department,self].sort());
    const actor={userId:p.id,organizationId:f.org,grants:await resolveGrants(p.id,f.org)};
    assert(allows(actor,'asset.read',{organizationId:f.org,locationId:child.id}));assert(!allows(actor,'asset.read',{organizationId:randomUUID(),locationId:child.id}));
    assert.equal((await api('/locations',{cookie:p.cookie,organization:f.org})).status,403);
    await grant(f,p,'directory.read','location',root.id);await grant(f,p,'statistics.read','location',root.id);
    assert.deepEqual((await api('/users/users-list',{cookie:p.cookie,organization:f.org})).data.users.map(row=>row._id),[scopedRecipient.id]);
    assert.deepEqual((await api('/users/admin/app-stats',{cookie:p.cookie,organization:f.org})).data,{users:1,products:1});
    await call(f,`/locations/${root.id}`,{expectedVersion:1,active:false},'PATCH');
    assert.equal((await api('/products/'+descendant,{cookie:p.cookie,organization:f.org})).status,200); // Retain historical scope while preventing new routing.
  });
  await t.test('move previews account for both lost and gained descendant coverage and reject changed grants',async()=>{
    const f=await workspace(),north=await location(f,'North'),south=await location(f,'South'),room=await location(f,'Kitchen',north.id),p=await member(f);
    const oldGrant=(await grant(f,p,'asset.read','location',north.id)).rows[0].id;
    const newGrant=(await grant(f,p,'asset.read','location',south.id)).rows[0].id;
    const first=await preview(f,room,south.id);
    assert.deepEqual(first.affectedGrantIds.sort(),[oldGrant,newGrant].sort());
    assert.deepEqual(first.affectedScopes.map(s=>[s.locationName,s.change]).sort(),[['North','loses'],['South','gains']]);
    await grant(f,p,'asset.update','location',north.id);
    assert.equal((await move(f,first)).data.code,'SCOPE_PREVIEW_STALE');
    assert.equal((await pool.query('SELECT parent_id FROM locations WHERE id=$1',[room.id])).rows[0].parent_id,north.id);
    const fresh=await preview(f,room,south.id),key=randomUUID();
    assert.equal((await move(f,fresh,key)).status,200);assert.equal((await move(f,fresh,key)).status,200);
    assert.equal((await move(f,fresh)).data.code,'VERSION_CONFLICT');
    assert.equal((await pool.query('SELECT 1 FROM location_ancestry WHERE ancestor_id=$1 AND descendant_id=$2',[north.id,room.id])).rowCount,0);
    assert.equal((await pool.query('SELECT 1 FROM location_ancestry WHERE ancestor_id=$1 AND descendant_id=$2',[south.id,room.id])).rowCount,1);
    assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE organization_id=$1 AND action='location.move'",[f.org])).rowCount,1);
    const back=await preview(f,{id:room.id},north.id,2);
    await pool.query("UPDATE location_move_previews SET expires_at=now()-interval '1 second' WHERE id=$1",[back.id]);
    assert.equal((await move(f,back)).data.code,'SCOPE_PREVIEW_STALE');
  });
  await t.test('location invitation delegation is bounded by current descendants and pending grants invalidate previews',async()=>{
    const f=await workspace(),north=await location(f,'North'),south=await location(f,'South'),room=await location(f,'Kitchen',north.id),inviter=await member(f),recipient=await person();
    for(const code of ['membership.manage','access.manage'])await grant(f,inviter,code);
    await grant(f,inviter,'asset.read','location',north.id);
    const first=await preview(f,room,south.id);
    const response=await call(f,'/invitations',{email:recipient.email,grants:[{permissionCode:'asset.read',scope:'location',locationId:room.id}]},'POST',randomUUID(),inviter);
    assert.equal(response.status,201,JSON.stringify(response.data));
    assert.equal((await move(f,first)).data.code,'SCOPE_PREVIEW_STALE');
    assert.equal((await call(f,'/invitations',{email:'outside@example.test',grants:[{permissionCode:'asset.read',scope:'location',locationId:south.id}]},'POST',randomUUID(),inviter)).status,403);
    const dto=response.data.data,row=(await pool.query('SELECT i.*,o.topic,o.encrypted_payload FROM organization_invitations i JOIN outbox_events o ON o.id=i.outbox_id WHERE i.id=$1',[dto.id])).rows[0];
    const token=decryptPayload(row.encrypted_payload,`outbox:${row.outbox_id}:${row.topic}`).token;
    const fresh=await preview(f,room,south.id);assert.equal((await move(f,fresh)).status,200);
    const accepted=await api('/invitations/acceptance',{method:'POST',cookie:recipient.cookie,body:{token},headers:{'Idempotency-Key':randomUUID()}});
    assert.equal(accepted.status,403); // Inviter no longer controls the moved location.
    assert.equal((await pool.query('SELECT 1 FROM memberships WHERE user_id=$1 AND organization_id=$2',[recipient.id,f.org])).rowCount,0);
  });
  await t.test('category revisions retain earlier definitions and units cannot change their meaning',async()=>{
    const f=await workspace(),field={key:'material',label:'Material',type:'choice',required:true,choices:['Steel','Iron']};
    const created=await call(f,'/categories',{name:'Kitchen',fields:[field]});assert.equal(created.status,201,JSON.stringify(created.data));
    const id=created.data.data.id;
    assert.equal((await call(f,'/categories/'+id,{expectedVersion:1,fields:[{key:'material',label:'Material',type:'text',required:false}]},'PATCH')).status,200);
    assert.deepEqual((await pool.query('SELECT fields FROM category_revisions WHERE category_id=$1 ORDER BY version',[id])).rows.map(r=>r.fields[0].type),['choice','text']);
    await assert.rejects(()=>pool.query('DELETE FROM category_revisions WHERE category_id=$1',[id]),error=>error.code==='23514');
    for(const fields of [[field,field],[{...field,choices:['Steel','Steel']}],[{...field,key:'constructor'}],[{...field,type:'number'}]])assert.equal((await call(f,'/categories',{name:'Invalid',fields})).status,400);
    const unit=await call(f,'/units-of-measure',{name:'Kilograms',code:'kg',quantityScale:3});assert.equal(unit.status,201);assert.equal(unit.data.data.code,'KG');
    assert.equal((await call(f,'/units-of-measure',{name:'Whole items',code:'EA',quantityScale:7})).status,400);
    assert.equal((await call(f,'/units-of-measure',{name:'Duplicate',code:'KG',quantityScale:0})).status,409);
    await assert.rejects(()=>pool.query('UPDATE unit_definitions SET quantity_scale=0 WHERE id=$1',[unit.data.data.id]),error=>error.code==='23514');
    await assert.rejects(()=>pool.query('DELETE FROM unit_definitions WHERE id=$1',[unit.data.data.id]),error=>error.code==='23514');
  });
});
