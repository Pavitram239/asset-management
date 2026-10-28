import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { testDatabase } from '../testing/testDatabase.js';

test('company ownership and settings through real database/HTTP',{skip:!process.env.TEST_DATABASE_URL},async t=>{
  const {pool,api,schema}=await testDatabase(t);
  const {transaction}=await import('../db/pool.js');
  const {hashedPassword}=await import('../src/utils/passwordUtils.js');
  const {createJWT}=await import('../src/utils/tokenUtils.js');
  const {provisionOrganization}=await import('../src/repositories/organizations.js');
  const {reviewLegacyOwner}=await import('../src/utils/ownership.js');
  const password=await hashedPassword('synthetic-test-password');
  const user=async(verified=true)=>{
    const id=randomUUID();
    await pool.query('INSERT INTO users(id,name,email,password_hash,email_verified_at) VALUES($1,$2,$3,$4,$5)',[id,'Synthetic member',id+'@example.test',password,verified?new Date():null]);
    return {id,cookie:'token='+createJWT({userId:id})};
  };
  const fixture=async(reviewed=true)=>{
    const owner=await user(),member=await user(),outsider=await user(),unverified=await user(false);
    const org=await transaction(db=>provisionOrganization(db,owner.id,'Synthetic company'));
    for(const person of [member,unverified])await pool.query('INSERT INTO memberships(organization_id,user_id) VALUES($1,$2)',[org.id,person.id]);
    if(reviewed)await transaction(db=>reviewLegacyOwner(db,org.id,owner.id));
    const version=()=>pool.query('SELECT version::float8 AS version FROM organizations WHERE id=$1',[org.id]).then(r=>r.rows[0].version);
    const call=(route,body,actor=owner,key=randomUUID())=>api(route,{method:'POST',body,cookie:actor.cookie,organization:org.id,headers:{'Idempotency-Key':key}});
    return {owner,member,outsider,unverified,org,version,call};
  };
  await t.test('legacy roles do not silently establish owners or verified email',async()=>{
    const f=await fixture(false);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM organization_owners WHERE organization_id=$1',[f.org.id])).rows[0].n,0);
    const result=await f.call('/ownership/appointments',{expectedVersion:await f.version(),userId:f.member.id});
    assert.equal(result.status,403);
    assert.equal((await pool.query('SELECT email_verified_at FROM users WHERE id=$1',[f.unverified.id])).rows[0].email_verified_at,null);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM api_commands WHERE organization_id=$1',[f.org.id])).rows[0].n,0);
  });
  await t.test('command errors retain typed authentication and validation responses',async()=>{
    const f=await fixture();
    const anonymous=await api('/ownership/appointments',{method:'POST',body:{userId:f.member.id}});
    assert.equal(anonymous.status,401);assert.equal(anonymous.data.code,'UNAUTHENTICATED');assert(anonymous.data.requestId);
    const missingKey=await api('/ownership/appointments',{method:'POST',body:{userId:f.member.id},cookie:f.owner.cookie,organization:f.org.id});
    assert.equal(missingKey.status,400);assert.equal(missingKey.data.code,'VALIDATION_ERROR');
    const crossOrigin=await api('/ownership/appointments',{method:'POST',body:{userId:f.member.id},cookie:f.owner.cookie,organization:f.org.id,headers:{Origin:'https://foreign.example.test'}});
    assert.equal(crossOrigin.status,403);assert.equal(crossOrigin.data.code,'FORBIDDEN');
  });
  await t.test('appointments are verified, tenant-bound, durable and replay-safe',async()=>{
    const f=await fixture(),version=await f.version();
    assert.equal((await f.call('/ownership/appointments',{expectedVersion:version,userId:f.unverified.id})).status,400);
    assert.equal((await f.call('/ownership/appointments',{expectedVersion:version,userId:f.outsider.id})).status,400);
    await assert.rejects(()=>pool.query('INSERT INTO organization_owners(organization_id,user_id,created_by) VALUES($1,$2,$3)',[f.org.id,f.outsider.id,f.owner.id]),e=>e.code==='23503');
    assert.equal((await f.call('/ownership/appointments',{expectedVersion:version,userId:f.member.id},f.member)).status,403);
    const key=randomUUID(),body={expectedVersion:version,userId:f.member.id};
    const first=await f.call('/ownership/appointments',body,f.owner,key);
    assert.equal(first.status,200,JSON.stringify(first.data));assert(first.data.data.ownerUserIds.includes(f.member.id));
    assert.deepEqual((await f.call('/ownership/appointments',body,f.owner,key)).data,first.data);
    await pool.query('UPDATE api_commands SET result=NULL WHERE organization_id=$1 AND idempotency_key=$2',[f.org.id,key]);
    assert.deepEqual((await f.call('/ownership/appointments',body,f.owner,key)).data,first.data);
    await assert.rejects(()=>pool.query('DELETE FROM api_commands WHERE organization_id=$1 AND idempotency_key=$2',[f.org.id,key]),e=>e.code==='23514');
    const mismatch=await f.call('/ownership/appointments',{...body,userId:f.owner.id},f.owner,key);
    assert.equal(mismatch.status,409);assert.equal(mismatch.data.code,'IDEMPOTENCY_MISMATCH');
    const stale=await f.call('/ownership/appointments',{expectedVersion:version,userId:f.owner.id});
    assert.equal(stale.status,409);assert.equal(stale.data.code,'VERSION_CONFLICT');
    const lookup=await api('/commands/appointOwner/'+key,{cookie:f.owner.cookie,organization:f.org.id});
    assert.equal(lookup.status,200);assert.equal(lookup.data.data.resourceId,f.org.id);
    assert.equal((await api('/commands/appointOwner/'+key,{cookie:f.member.cookie,organization:f.org.id})).status,404);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE organization_id=$1 AND action='ownership.appoint'",[f.org.id])).rows[0].n,1);
    const deactivated=await api('/access/members/'+f.owner.id,{method:'PATCH',body:{active:false},cookie:f.member.cookie,organization:f.org.id});
    // Being an owner never grants unrelated membership-management powers.
    assert.equal(deactivated.status,403);
    await pool.query('UPDATE memberships SET active=false WHERE organization_id=$1 AND user_id=$2',[f.org.id,f.member.id]);
    assert.equal((await f.call('/ownership/appointments',body,f.member,key)).status,403);
  });
  await t.test('last owner remains protected independently of other access administrators',async()=>{
    const f=await fixture(),version=await f.version();
    await pool.query("INSERT INTO user_permissions(organization_id,user_id,permission_id,scope) VALUES($1,$2,'access.manage','organization'),($1,$2,'membership.manage','organization')",[f.org.id,f.member.id]);
    const removed=await f.call('/ownership/'+f.owner.id+'/removals',{expectedVersion:version,reason:'Synthetic transfer test'});
    assert.equal(removed.status,409);assert.equal(removed.data.code,'LAST_OWNER');
    const deactivation=await api('/access/members/'+f.owner.id,{method:'PATCH',body:{active:false},cookie:f.member.cookie,organization:f.org.id});
    assert.equal(deactivation.status,409);assert.equal(deactivation.data.code,'LAST_OWNER');
    await assert.rejects(()=>pool.query('UPDATE memberships SET active=false WHERE organization_id=$1 AND user_id=$2',[f.org.id,f.owner.id]),e=>e.code==='23514');
    await assert.rejects(()=>pool.query('UPDATE users SET active=false WHERE id=$1',[f.owner.id]),e=>e.code==='23514');
    assert.equal((await f.call('/ownership/appointments',{expectedVersion:version,userId:f.member.id})).status,200);
    const current=await f.version();
    const results=await Promise.all([
      f.call('/ownership/'+f.owner.id+'/removals',{expectedVersion:current,reason:'Concurrent transfer'},f.owner),
      f.call('/ownership/'+f.member.id+'/removals',{expectedVersion:current,reason:'Concurrent transfer'},f.member)
    ]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM organization_owners WHERE organization_id=$1',[f.org.id])).rows[0].n,1);
    const survivor=(await pool.query('SELECT user_id FROM organization_owners WHERE organization_id=$1',[f.org.id])).rows[0].user_id;
    const actor=survivor===f.owner.id?f.owner:f.member;
    assert.equal((await f.call('/ownership/'+survivor+'/removals',{expectedVersion:await f.version(),reason:'Cannot remove final owner'},actor)).data.code,'LAST_OWNER');
  });
  await t.test('company settings validate currency/time zone and reject stale writes',async()=>{
    const f=await fixture();
    const change=body=>api('/access/organization',{method:'PATCH',body,cookie:f.owner.cookie,organization:f.org.id});
    const version=await f.version();
    for(const body of [{currency:'ZZZ',expectedVersion:version},{timeZone:'Not/AZone',expectedVersion:version},{currency:'INR'}])assert.equal((await change(body)).status,400);
    const saved=await change({currency:'INR',timeZone:'Asia/Kolkata',expectedVersion:version});
    assert.equal(saved.status,200);assert.equal(saved.data.currency,'INR');assert.equal(saved.data.timeZone,'Asia/Kolkata');
    assert.equal((await change({currency:'USD',expectedVersion:version})).status,409);
    const unauthorized=await api('/access/organization',{method:'PATCH',body:{currency:'USD',expectedVersion:saved.data.version},cookie:f.member.cookie,organization:f.org.id});
    assert.equal(unauthorized.status,403);
    const oldClient=await change({name:'Renamed company'});assert.equal(oldClient.status,200);assert.equal(oldClient.data.currency,'INR');
    const settings=(await api('/access/management',{cookie:f.owner.cookie,organization:f.org.id})).data;
    assert.equal(settings.organization.version,await f.version());assert(settings.owners.some(o=>o.userId===f.owner.id));
  });
  await t.test('revoked ownership is rechecked after waiting for the workspace lock',async()=>{
    const f=await fixture();
    assert.equal((await f.call('/ownership/appointments',{expectedVersion:await f.version(),userId:f.member.id})).status,200);
    const blocker=await pool.connect();
    let pending;
    try {
      await blocker.query('BEGIN');await blocker.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[f.org.id]);
      pending=f.call('/ownership/'+f.owner.id+'/removals',{expectedVersion:await f.version(),reason:'Revocation race'},f.member);
      let waiting=false;
      for(let i=0;i<50;i++) {
        waiting=(await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND (query LIKE 'SELECT * FROM organizations%' OR query LIKE 'INSERT INTO api_commands%')",[schema])).rowCount>0;
        if(waiting)break;await delay(20);
      }
      assert(waiting,'The command must be waiting on the workspace lock before revocation');
      await blocker.query('DELETE FROM organization_owners WHERE organization_id=$1 AND user_id=$2',[f.org.id,f.member.id]);
      await blocker.query('COMMIT');
      assert.equal((await pending).status,403);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM api_commands WHERE organization_id=$1 AND operation_id='removeOwner'",[f.org.id])).rows[0].n,0);
    } finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
  });
  await t.test('changing email clears verification without accepting a client-supplied verification flag',async()=>{
    const f=await fixture();
    const {users}=await import('../src/repositories/users.js');
    const same=f.member.id+'@example.test';
    await users.update(f.member.id,{email:same.toUpperCase()});
    assert((await pool.query('SELECT email_verified_at FROM users WHERE id=$1',[f.member.id])).rows[0].email_verified_at);
    const changed=await api('/users/update-user',{method:'PATCH',cookie:f.member.cookie,organization:f.org.id,body:{name:'Synthetic member',email:'changed-'+randomUUID()+'@example.test',location:'Test office',emailVerified:true}});
    assert.equal(changed.status,200);
    assert.equal((await pool.query('SELECT email_verified_at FROM users WHERE id=$1',[f.member.id])).rows[0].email_verified_at,null);
    assert.equal((await f.call('/ownership/appointments',{expectedVersion:await f.version(),userId:f.member.id})).status,400);
  });
});
