import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
const connectionString=process.env.TEST_DATABASE_URL;
test('PostgreSQL migrations, tenant isolation and real API workflows',{skip:!connectionString},async(t)=>{
  const url=new URL(connectionString);assert.match(decodeURIComponent(url.pathname),/_test$/);
  const schema=`test_${randomUUID().replaceAll('-','')}`,control=new pg.Pool({connectionString});
  await control.query(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL=connectionString;process.env.PGOPTIONS=`-c search_path=${schema}`;
  process.env.JWT_SECRET='integration-test-only-secret';process.env.JWT_EXPIRES_IN='1d';process.env.COOKIE_SECURE='false';
  process.env.MAIL_ADAPTER='capture';process.env.APP_PUBLIC_URL='http://localhost:5173';process.env.OUTBOX_ENCRYPTION_KEY=Buffer.alloc(32,8).toString('base64');
  const {pool,transaction}=await import('../db/pool.js');let server;
  t.after(async()=>{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await pool.end();await control.query(`DROP SCHEMA "${schema}" CASCADE`);await control.end();});
  // Exercise a real legacy migration with IDs, assignments and customized departments preserved.
  const sql=await readFile(new URL('../db/migrations/001_initial.sql',import.meta.url),'utf8');
  await pool.query(sql);
  await pool.query('CREATE TABLE schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  await pool.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',['001_initial.sql',createHash('sha256').update(sql).digest('hex')]);
  await pool.query("INSERT INTO departments(code,name) VALUES('legacy-lab','Legacy laboratory')");
  const {hashedPassword}=await import('../src/utils/passwordUtils.js');const hash=await hashedPassword('test-password-123');
  const owner=randomUUID(),legacyUser=randomUUID(),legacyAsset=randomUUID();
  await pool.query(`INSERT INTO users(id,name,email,password_hash,role,department_code) VALUES($1,'Owner','owner@example.test',$3,'admin','accounts'),($2,'Legacy user','legacy@example.test',$3,'user','kitchen')`,[owner,legacyUser,hash]);
  await pool.query(`INSERT INTO products(id,name,company,department_code,creator_id,assigned_to_id,created_by,qr) VALUES($1,'Legacy laptop','Dell','kitchen',$2,$3,'Owner','legacy-qr')`,[legacyAsset,owner,legacyUser]);
  const {migrate,verifyMigrations,migrationManifest,executeMigration}=await import('../db/migrate.js');await migrate();await migrate();await verifyMigrations();
  const manifest=await migrationManifest();
  assert.deepEqual((await pool.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows,manifest.map(({name,checksum})=>({version:name,checksum})));
  const org=(await pool.query('SELECT id FROM organizations')).rows[0].id;
  assert.equal((await pool.query('SELECT organization_id FROM products WHERE id=$1',[legacyAsset])).rows[0].organization_id,org);
  await t.test('legacy identities, customized departments and imported assignment history survive reruns',async()=>{
    const product=(await pool.query('SELECT id,creator_id,assigned_to_id,qr FROM products WHERE id=$1',[legacyAsset])).rows[0];
    assert.deepEqual(product,{id:legacyAsset,creator_id:owner,assigned_to_id:legacyUser,qr:'legacy-qr'});
    assert.equal((await pool.query("SELECT name FROM organization_departments WHERE organization_id=$1 AND code='legacy-lab'",[org])).rows[0].name,'Legacy laboratory');
    const history=await pool.query('SELECT asset_id,user_id,actor_id FROM asset_assignment_history WHERE asset_id=$1',[legacyAsset]);
    assert.deepEqual(history.rows,[{asset_id:legacyAsset,user_id:legacyUser,actor_id:owner}]);
  });
  await t.test('populated cutover preserves manufacturer and custody while linked physical writes remain guarded',async()=>{
    const imported=(await pool.query(`SELECT li.snapshot,li.original_assignee_id,li.product_id,l.received_on,l.unit_cost,
      c.confirmation_state,c.recipient_user_id FROM legacy_inventory_imports li
      JOIN inventory_lots l ON l.organization_id=li.organization_id AND l.legacy_import_id=li.id
      JOIN custody_obligations c ON c.organization_id=li.organization_id AND c.legacy_import_id=li.id
      WHERE li.product_id=$1`,[legacyAsset])).rows[0];
    assert.equal(imported.snapshot.company,'Dell');
    assert.equal(imported.product_id,legacyAsset);
    assert.equal(imported.original_assignee_id,legacyUser);
    assert.equal(imported.recipient_user_id,legacyUser);
    assert.equal(imported.confirmation_state,'legacy_imported');
    assert.equal(imported.received_on,null);assert.equal(imported.unit_cost,null);
    assert.equal((await pool.query(`SELECT sum(e.signed_quantity)::text AS balance FROM inventory_entries e
      JOIN inventory_accounts a ON a.organization_id=e.organization_id AND a.id=e.account_id
      WHERE a.unit_id=$1`,[legacyAsset])).rows[0].balance,'0.000000');
    for(const sql of [
      'UPDATE products SET catalog_item_id=NULL,lot_id=NULL WHERE id=$1',
      'UPDATE products SET assigned_to_id=NULL WHERE id=$1',
      'UPDATE products SET deleted_at=now() WHERE id=$1',
      'DELETE FROM products WHERE id=$1',
    ])await assert.rejects(()=>pool.query(sql,[legacyAsset]),error=>error.code==='23514');
    const migration=manifest.find(row=>row.name==='012_legacy_inventory_cutover.sql');
    assert.equal(migration.checksum,createHash('sha256').update(migration.sql).digest('hex'));
    assert.equal((await pool.query('SELECT checksum FROM schema_migrations WHERE version=$1',[migration.name])).rows[0].checksum,migration.checksum);
  });
  await t.test('changed applied checksums fail closed without rewriting migration history',async()=>{
    const first=manifest[0];
    await pool.query('UPDATE schema_migrations SET checksum=$2 WHERE version=$1',[first.name,'altered-test-checksum']);
    try {
      await assert.rejects(()=>migrate(),/Applied migration changed/);
      await assert.rejects(()=>verifyMigrations(),/Run deployment migrations/);
      assert.equal((await pool.query('SELECT checksum FROM schema_migrations WHERE version=$1',[first.name])).rows[0].checksum,'altered-test-checksum');
    } finally {
      await pool.query('UPDATE schema_migrations SET checksum=$2 WHERE version=$1',[first.name,first.checksum]);
    }
    await verifyMigrations();
  });
  await t.test('fresh database bootstrap has no automatic administrator',async()=>{
    const fresh=schema+'_fresh';await control.query(`CREATE SCHEMA "${fresh}"`);
    const client=await control.connect();
    try{
      await client.query('BEGIN');await client.query(`SET LOCAL search_path="${fresh}"`);
      for(const migration of manifest)await executeMigration(client,migration);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM organizations')).rows[0].n,0);
      const person=(await client.query("INSERT INTO users(name,email,password_hash) VALUES('Initial owner','initial@example.test',$1) RETURNING id",[hash])).rows[0].id;
      assert.equal((await client.query('SELECT count(*)::int AS n FROM user_roles')).rows[0].n,0);
      const {provisionOrganization}=await import('../src/repositories/organizations.js');
      const organization=await provisionOrganization(client,person,'New organization');
      assert.ok(organization.id);
      const {PERMISSIONS}=await import('../src/utils/authorization.js');
      assert.deepEqual((await client.query('SELECT permission_id FROM role_permissions ORDER BY permission_id')).rows.map(r=>r.permission_id),[...PERMISSIONS].sort());
      await client.query('ROLLBACK');
    }catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();await control.query(`DROP SCHEMA "${fresh}" CASCADE`);}
  });
  const {default:app}=await import('../src/app.js');server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}/api/v1`;
  const api=async(route,method='GET',body,cookie,organization=org)=>{
    const response=await fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(organization?{'X-Organization-Id':organization}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>null);return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  const login=async(email)=>{const r=await api('/auth/login','POST',{email:email.toUpperCase(),password:'test-password-123'});assert.equal(r.status,200);return r.cookie;};
  const ownerCookie=await login('owner@example.test'),legacyCookie=await login('legacy@example.test');
  const register=async(name,email)=>{const r=await api('/auth/register','POST',{name,email,password:'test-password-123',location:'Office',role:'admin',department:'accounts'});assert.equal(r.status,201);return (await pool.query('SELECT id FROM users WHERE email=$1',[email])).rows[0].id;};
  const employee=await register('Employee','employee@example.test'),outsider=await register('Outsider','outsider@example.test');
  const employeeCookie=await login('employee@example.test'),outsiderCookie=await login('outsider@example.test');
  const post=async(path,body,cookie=ownerCookie,organization=org)=>api(path,'POST',body,cookie,organization);
  await t.test('same-origin browser mutations work and cross-site mutations are rejected',async()=>{
    const bad=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example.test'},body:JSON.stringify({email:'owner@example.test',password:'test-password-123'})});
    assert.equal(bad.status,403);
    const good=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:new URL(base).origin},body:JSON.stringify({email:'owner@example.test',password:'test-password-123'})});
    assert.equal(good.status,200);
  });
  await t.test('no automatic grants, missing context and IDOR protection',async()=>{
    assert.equal((await api('/products')).status,401);
    assert.equal((await api('/products','GET',null,ownerCookie,null)).status,400);
    assert.equal((await api('/products','GET',null,outsiderCookie)).status,403);
    assert.equal((await api('/users/current-user','GET',null,outsiderCookie,null)).data.user.grants.length,0);
    assert.equal((await api(`/products/${legacyAsset}`,'GET',null,legacyCookie)).status,200);
    assert.equal((await api('/products','POST',{name:'Denied',company:'x',department:'kitchen'},legacyCookie)).status,403);
    assert.equal((await api('/products/not-a-uuid','GET',null,ownerCookie)).status,400);
  });
  await t.test('dynamic departments and memberships, no grants from membership alone',async()=>{
    assert.equal((await post('/access/departments',{code:'research',name:'Research'})).status,200);
    assert.equal((await post('/access/members',{email:'employee@example.test',department:'research'})).status,200);
    assert.equal((await api('/products','GET',null,employeeCookie)).status,403);
    assert.equal((await post('/access/members',{email:'owner@example.test'})).status,403);
  });
  const role=(await post('/access/roles',{name:'Equipment editor',permissions:['asset.read','asset.create','asset.update','asset.delete','asset.file.read','directory.read']})).data.id;
  const assignment=(await post('/access/assignments',{userId:employee,roleId:role,scope:'department',department:'research'})).data.id;
  let asset;
  await t.test('custom department roles enforce SQL and object scope with live permission changes',async()=>{
    const r=await post('/products',{name:'Laptop 100%_test',company:'Dell',department:'research',assignedToId:employee,warrantyDate:'2099-01-01',serialNumber:'SN-001',creator:outsider},employeeCookie);
    assert.equal(r.status,201,JSON.stringify(r.data));asset=r.data.product;
    assert.equal(asset.creator,employee);assert.equal(asset.assignedToId,employee);assert.equal(asset.warranty,'active');assert.match(asset.qr,/^data:image/);
    assert.equal((await api(`/products/${legacyAsset}`,'GET',null,employeeCookie)).status,404);
    assert.equal((await api('/products','GET',null,employeeCookie)).data.totalProducts,1);
    assert.equal((await post('/products',{name:'Bad',company:'x',department:'kitchen'},employeeCookie)).status,403);
    assert.equal((await api(`/products/${asset._id}`,'PATCH',{department:'kitchen'},employeeCookie)).status,403);
    assert.equal((await api(`/products/${asset._id}`,'PATCH',{assignedToId:legacyUser},employeeCookie)).status,400);
    assert.equal((await api('/products?search=%25_test','GET',null,employeeCookie)).data.totalProducts,1);
    assert.equal((await api('/products?search=%27%20OR%201%3D1--','GET',null,employeeCookie)).data.totalProducts,0);
    assert.equal((await api('/products?limit=101','GET',null,employeeCookie)).status,400);
    assert.equal((await api('/products/overview','GET',null,employeeCookie)).data.total,1);
    assert.equal((await api('/access/roles/'+role,'PATCH',{permissions:['asset.read']},ownerCookie)).status,200);
    assert.equal((await api(`/products/${asset._id}`,'PATCH',{company:'No'},employeeCookie)).status,403);
    assert.equal((await api('/access/roles/'+role,'PATCH',{permissions:['asset.read','asset.update','directory.read']},ownerCookie)).status,200);
    assert.equal((await api(`/products/${asset._id}`,'PATCH',{company:'Updated',power:'65W'},employeeCookie)).status,200);
    assert.equal((await api(`/products/${asset._id}`,'GET',null,employeeCookie)).data.product.serialNumber,'SN-001');
    assert.equal((await api('/access/roles/'+role,'PATCH',{active:false},ownerCookie)).status,200);
    assert.equal((await api('/products','GET',null,employeeCookie)).status,403);
    assert.equal((await api('/access/roles/'+role,'PATCH',{active:true},ownerCookie)).status,200);
    assert.equal((await api('/access/departments/research','PATCH',{active:false},ownerCookie)).status,200);
    assert.equal((await api('/products','GET',null,employeeCookie)).status,403);
    assert.equal((await api('/access/departments/research','PATCH',{active:true},ownerCookie)).status,200);
    assert.equal((await api('/products','GET',null,employeeCookie)).status,200);
    assert.equal((await api('/access/members/'+employee,'PATCH',{department:'kitchen'},ownerCookie)).status,400);
  });
  let org2;
  await t.test('multiple memberships have independent roles and cross-tenant references fail',async()=>{
    const r=await post('/access/organizations',{name:'Second organization'});assert.equal(r.status,200);org2=r.data.id;
    assert.equal((await api('/products','GET',null,employeeCookie,org2)).status,403);
    assert.equal((await post('/access/departments',{code:'research',name:'Other research'},ownerCookie,org2)).status,200);
    assert.equal((await post('/access/members',{email:'employee@example.test',department:'research'},ownerCookie,org2)).status,200);
    assert.equal((await api('/products','GET',null,employeeCookie,org2)).status,403);
    assert.equal((await post('/access/grants',{userId:employee,permission:'asset.read',scope:'organization'},ownerCookie,org2)).status,200);
    assert.equal((await api('/products','GET',null,employeeCookie,org2)).data.totalProducts,0);
    assert.equal((await api(`/products/${asset._id}`,'GET',null,employeeCookie,org2)).status,404);
    assert.equal((await post('/access/assignments',{userId:employee,roleId:role,scope:'organization'},ownerCookie,org2)).status,400);
    assert.equal((await post('/products',{name:'Bad owner',company:'x',department:'research',assignedToId:legacyUser},ownerCookie,org2)).status,400);
    await assert.rejects(()=>pool.query('UPDATE products SET assigned_to_id=$1 WHERE id=$2',[outsider,asset._id]),e=>e.code==='23503');
  });
  await t.test('direct/self grants, revocation, deactivated memberships and self escalation',async()=>{
    assert.equal((await api('/access/assignments/'+assignment,'DELETE',null,ownerCookie)).status,200);
    assert.equal((await api('/products','GET',null,employeeCookie)).status,403);
    const g=await post('/access/grants',{userId:employee,permission:'asset.read',scope:'self'});assert.equal(g.status,200);
    assert.equal((await api('/products','GET',null,employeeCookie)).data.totalProducts,1);
    assert.equal((await api(`/products/${legacyAsset}`,'GET',null,employeeCookie)).status,404);
    assert.equal((await post('/access/grants',{userId:employee,permission:'asset.delete',scope:'organization'},employeeCookie)).status,403);
    assert.equal((await post('/access/grants',{userId:owner,permission:'access.manage',scope:'organization'})).status,403);
    assert.equal((await post('/access/grants',{userId:employee,permission:'invalid.permission',scope:'organization'})).status,400);
    assert.equal((await api('/access/members/'+employee,'PATCH',{active:false},ownerCookie)).status,200);
    assert.equal((await api('/products','GET',null,employeeCookie)).status,403);
    assert.equal((await api('/access/members/'+employee,'PATCH',{active:true},ownerCookie)).status,200);
    assert.equal((await api('/products','GET',null,employeeCookie)).status,200);
    assert.equal((await api('/access/grants/'+g.data.id,'DELETE',null,ownerCookie)).status,200);
    assert.equal((await api('/products','GET',null,employeeCookie)).status,403);
    const writeOnly=await post('/access/grants',{userId:employee,permission:'asset.update',scope:'department',department:'research'});
    const updated=await api(`/products/${asset._id}`,'PATCH',{company:'Write only'},employeeCookie);
    assert.equal(updated.status,200);assert.deepEqual(updated.data.updatedProduct,{_id:asset._id});
    assert.equal((await api('/access/grants/'+writeOnly.data.id,'DELETE',null,ownerCookie)).status,200);
  });
  await t.test('last administrator and own-role mutation are protected transactionally',async()=>{
    const ownerRole=(await pool.query('SELECT role_id FROM user_roles WHERE organization_id=$1 AND user_id=$2',[org,owner])).rows[0].role_id;
    assert.equal((await api('/access/roles/'+ownerRole,'PATCH',{permissions:[]},ownerCookie)).status,403);
    assert.equal((await post('/access/grants',{userId:employee,permission:'role.manage',scope:'organization'})).status,200);
    const rejected=await api('/access/roles/'+ownerRole,'PATCH',{permissions:[]},employeeCookie);
    assert.equal(rejected.status,400);assert.match(rejected.data.msg,/last access administrator/);
    assert.equal((await api('/products','GET',null,ownerCookie)).status,200);
    assert.equal((await post('/access/grants',{userId:employee,permission:'access.manage',scope:'department',department:'research'})).status,400);
  });
  await t.test('concurrent administrator removals preserve a live administrator',async()=>{
    assert.equal((await post('/access/grants',{userId:employee,permission:'access.manage',scope:'organization'})).status,200);
    assert.equal((await post('/access/grants',{userId:employee,permission:'membership.manage',scope:'organization'})).status,200);
    const results=await Promise.all([
      api('/access/members/'+employee,'PATCH',{active:false},ownerCookie),
      api('/access/members/'+owner,'PATCH',{active:false},employeeCookie)
    ]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,403]);
    // Restore isolated test fixtures for later regression checks.
    await pool.query('UPDATE memberships SET active=true WHERE organization_id=$1',[org]);
    await pool.query("DELETE FROM user_permissions WHERE organization_id=$1 AND user_id=$2 AND permission_id IN ('access.manage','membership.manage')",[org,employee]);
  });
  await t.test('profile cannot change privileges; transfers, soft deletion, audit and history persist',async()=>{
    const r=await api('/users/update-user','PATCH',{name:'Renamed',email:'employee@example.test',location:'Office',role:'admin',organizationId:org2,department:'accounts'},employeeCookie);
    assert.equal(r.status,200);
    assert.equal((await api(`/products/${asset._id}`,'GET',null,ownerCookie)).data.product.assignedTo,'Renamed');
    const transfer=await api(`/products/${asset._id}`,'PATCH',{department:'kitchen'},ownerCookie);
    assert.equal(transfer.status,200);assert.equal(transfer.data.updatedProduct.assignedToId,null);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM asset_assignment_history WHERE asset_id=$1',[asset._id])).rows[0].n,2);
    assert.equal((await api(`/products/${asset._id}`,'DELETE',null,ownerCookie)).status,200);
    assert.equal((await api(`/products/${asset._id}`,'GET',null,ownerCookie)).status,404);
    assert.ok((await pool.query('SELECT deleted_at FROM products WHERE id=$1',[asset._id])).rows[0].deleted_at);
    assert.ok((await api('/access/audit','GET',null,ownerCookie)).data.events.some(e=>e.action==='asset.delete'));
    await assert.rejects(()=>pool.query('DELETE FROM audit_events'),/append-only/);
    assert.equal((await api('/access/audit','GET',null,employeeCookie)).status,403);
  });
  await t.test('file authorization, invalid uploads and storage failure leave no asset records',async()=>{
    assert.equal((await api(`/products/${legacyAsset}/files/invoice`,'GET',null,employeeCookie)).status,403);
    const form=new FormData();form.set('name','Upload');form.set('company','x');form.set('department','kitchen');form.set('invoice',new Blob(['not a pdf'],{type:'application/pdf'}),'invoice.pdf');
    const invalid=await fetch(base+'/products',{method:'POST',headers:{Cookie:ownerCookie,'X-Organization-Id':org},body:form});assert.equal(invalid.status,400);
    const oversized=new FormData();oversized.set('name','Too large');oversized.set('company','x');oversized.set('department','kitchen');oversized.set('invoice',new Blob([new Uint8Array(5*1024*1024+1)],{type:'application/pdf'}),'invoice.pdf');
    const tooLarge=await fetch(base+'/products',{method:'POST',headers:{Cookie:ownerCookie,'X-Organization-Id':org},body:oversized});assert.equal(tooLarge.status,400);
    const noAuth=await fetch(base+`/products/${legacyAsset}/files/invoice?organizationId=${org}`);assert.equal(noAuth.status,401);
    const wrongTenant=await fetch(base+`/products/${legacyAsset}/files/invoice?organizationId=${org2}`,{headers:{Cookie:ownerCookie}});assert.equal(wrongTenant.status,404);
    const before=(await pool.query('SELECT count(*)::int AS n FROM products')).rows[0].n;
    const valid=new FormData();valid.set('name','Storage failure');valid.set('company','x');valid.set('department','kitchen');valid.set('invoice',new Blob(['%PDF-1.7 content'],{type:'application/pdf'}),'invoice.pdf');
    const previous=process.env.FIREBASE_STORAGE_BUCKET;delete process.env.FIREBASE_STORAGE_BUCKET;
    try{const failed=await fetch(base+'/products',{method:'POST',headers:{Cookie:ownerCookie,'X-Organization-Id':org},body:valid});assert.equal(failed.status,500);}finally{if(previous)process.env.FIREBASE_STORAGE_BUCKET=previous;}
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM products')).rows[0].n,before);
    assert.ok((await pool.query('SELECT 1 FROM storage_cleanup')).rowCount);
  });
  await t.test('shared rate limits are atomic across middleware instances and disabled accounts lose access',async()=>{
    const {sharedRateLimit}=await import('../src/middlewares/sharedRateLimit.js');
    const a=sharedRateLimit({namespace:'integration',max:2}),b=sharedRateLimit({namespace:'integration',max:2});let passed=0,status;
    const req={ip:'test-ip'},res={setHeader(){},status(code){status=code;return this;},json(){}};
    await Promise.all([a(req,res,()=>passed++),b(req,res,()=>passed++),a(req,res,()=>passed++)]);assert.equal(passed,2);assert.equal(status,429);
    await pool.query('UPDATE users SET active=false WHERE id=$1',[employee]);assert.equal((await api('/users/current-user','GET',null,employeeCookie)).status,401);
    assert.equal((await api('/health')).data.database,'postgresql');
    const logout=await api('/auth/logout','GET',null,ownerCookie);assert.equal(logout.status,200);assert.equal((await api('/users/current-user','GET',null,logout.cookie)).status,401);
  });
});
