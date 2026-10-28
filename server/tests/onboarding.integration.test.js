import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { testDatabase } from '../testing/testDatabase.js';

test('verified workspaces and invitation lifecycle through PostgreSQL/HTTP', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  process.env.NODE_ENV = 'test';
  const { pool, api, schema } = await testDatabase(t);
  const { transaction } = await import('../db/pool.js');
  const { createJWT } = await import('../src/utils/tokenUtils.js');
  const { hashedPassword } = await import('../src/utils/passwordUtils.js');
  const { decryptPayload } = await import('../src/services/deliveryCrypto.js');
  const { processDelivery } = await import('../src/services/deliveryWorker.js');
  const { capturedMailAdapter } = await import('../src/services/mailAdapter.js');
  const { invitationRenderers } = await import('../src/services/onboarding.js');
  const hash = await hashedPassword('Synthetic-invitation-password');
  const person = async (verified = true) => {
    const id = randomUUID(), email = id + '@example.test';
    await pool.query(`INSERT INTO users(id,name,email,password_hash,email_verified_at) VALUES($1,'Synthetic employee',$2,$3,$4)`, [id, email, hash, verified ? new Date() : null]);
    return { id, email, cookie: 'token=' + createJWT({ userId: id }) };
  };
  const contract = JSON.parse(await readFile(new URL('../../docs/openapi.json', import.meta.url), 'utf8'));
  const Ajv = createRequire(import.meta.url)('ajv'), ajv = new Ajv({ allErrors: true, nullable: true });
  const validators = new Map();
  const call = async (actor, route, body, org, key = randomUUID()) => {
    const response = await api(route, { method: 'POST', body, cookie: actor.cookie, organization: org, headers: { 'Idempotency-Key': key } });
    const path = route.endsWith('/revocations') ? '/invitations/{id}/revocations' : route;
    const identity = path + ':' + response.status;
    if (!validators.has(identity)) {
      const definition = contract.paths[path].post.responses[String(response.status)];
      const resolved = definition.$ref ? definition.$ref.slice(2).split('/').reduce((value, key) => value[key], contract) : definition;
      validators.set(identity, ajv.compile({ ...resolved.content['application/json'].schema, components: contract.components }));
    }
    const validate = validators.get(identity);
    assert(validate(response.data), `${path} ${response.status}: ${JSON.stringify(validate.errors)}`);
    return response;
  };
  const workspace = async (owner = null) => {
    owner ||= await person();
    const response = await call(owner, '/workspaces', { name: 'Synthetic company', currency: 'INR', timeZone: 'Asia/Kolkata' });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    const org = response.data.data.id;
    const roles = (await pool.query('SELECT * FROM roles WHERE organization_id=$1', [org])).rows;
    return { owner, org, employeeRole: roles.find(role => role.name === 'Employee').id, roles };
  };
  const invite = async (f, recipient = null, grants = null, actor = f.owner) => {
    recipient ||= await person();
    const body = { email: recipient.email, grants: grants || [{ roleId: f.employeeRole, scope: 'self' }] };
    const response = await call(actor, '/invitations', body, f.org);
    assert.equal(response.status, 201, JSON.stringify(response.data));
    const id = response.data.data.id;
    const row = (await pool.query('SELECT i.*,o.encrypted_payload,o.topic FROM organization_invitations i JOIN outbox_events o ON o.id=i.outbox_id WHERE i.id=$1', [id])).rows[0];
    const token = decryptPayload(row.encrypted_payload, `outbox:${row.outbox_id}:${row.topic}`).token;
    return { recipient, token, id, dto: response.data.data, body, row };
  };
  t.beforeEach(() => pool.query('DELETE FROM authentication_attempts'));

  await t.test('verified creation is isolated, replay-safe and independent of existing company headers', async () => {
    const owner = await person(), foreign = await workspace(), key = randomUUID();
    const body = { name: 'Another company', currency: 'USD', timeZone: 'UTC' };
    const results = await Promise.all([call(owner, '/workspaces', body, foreign.org, key), call(owner, '/workspaces', body, foreign.org, key)]);
    assert.deepEqual(results.map(r => r.status), [201, 201]);
    assert.equal(results[0].data.data.id, results[1].data.data.id);
    const org = results[0].data.data.id;
    assert.equal((await pool.query('SELECT 1 FROM organization_owners WHERE organization_id=$1 AND user_id=$2', [org, owner.id])).rowCount, 1);
    assert.equal((await pool.query('SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$2', [foreign.org, owner.id])).rowCount, 0);
    assert.equal((await pool.query('SELECT 1 FROM roles WHERE organization_id=$1', [org])).rowCount, 4);
    assert.equal((await call(owner, '/workspaces', { ...body, name: 'Changed intent' }, null, key)).data.code, 'IDEMPOTENCY_MISMATCH');
    await pool.query("UPDATE api_commands SET result=NULL WHERE actor_id=$1 AND operation_id='createWorkspace'", [owner.id]);
    assert.equal((await call(owner, '/workspaces', body, null, key)).data.data.id, org);
    assert.equal((await api('/commands/createWorkspace/' + key + '?context=account', { cookie: owner.cookie })).status, 200);
    assert.equal((await api('/products', { cookie: owner.cookie, organization: foreign.org })).status, 403);
  });
  await t.test('unverified, disabled and demo accounts cannot create; signup still grants nothing', async () => {
    const unverified = await person(false);
    assert.equal((await call(unverified, '/workspaces', { name: 'Denied', currency: 'INR', timeZone: 'UTC' })).status, 403);
    await pool.query('UPDATE users SET email_verified_at=now(),is_demo=true WHERE id=$1', [unverified.id]);
    assert.equal((await call(unverified, '/workspaces', { name: 'Denied', currency: 'INR', timeZone: 'UTC' })).status, 400);
    await pool.query('UPDATE users SET is_demo=false,active=false WHERE id=$1', [unverified.id]);
    assert.equal((await call(unverified, '/workspaces', { name: 'Denied', currency: 'INR', timeZone: 'UTC' })).status, 401);
    assert.equal((await pool.query('SELECT 1 FROM memberships WHERE user_id=$1', [unverified.id])).rowCount, 0);
  });
  await t.test('invitation acceptance requires the matching verified account and creates only the reviewed grants', async () => {
    const f = await workspace(), recipient = await person(false), invited = await invite(f, recipient), stranger = await person();
    assert.equal((await call(stranger, '/invitations/acceptance', { token: invited.token }, f.org)).status, 403);
    assert.equal((await call(recipient, '/invitations/acceptance', { token: invited.token })).status, 403);
    assert.equal((await pool.query('SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$2', [f.org, recipient.id])).rowCount, 0);
    await pool.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [recipient.id]);
    const key = randomUUID();
    const results = await Promise.all([call(recipient, '/invitations/acceptance', { token: invited.token }, null, key), call(recipient, '/invitations/acceptance', { token: invited.token }, null, key)]);
    assert.deepEqual(results.map(r => r.status), [200, 200]);
    const grants = (await api('/access/effective', { cookie: recipient.cookie, organization: f.org })).data.grants;
    assert.deepEqual(grants.map(g => g.permission).sort(), ['asset.file.read', 'asset.read']);
    assert(grants.every(grant => grant.scope === 'self'));
    assert.equal((await pool.query('SELECT invitation_id FROM memberships WHERE organization_id=$1 AND user_id=$2', [f.org, recipient.id])).rows[0].invitation_id, invited.id);
    assert.equal((await call(recipient, '/invitations/acceptance', { token: invited.token })).status, 409);
    assert.equal((await api('/commands/acceptInvitation/' + key + '?context=account', { cookie: recipient.cookie })).status, 200);
    await pool.query('UPDATE memberships SET active=false WHERE organization_id=$1 AND user_id=$2', [f.org, recipient.id]);
    assert.equal((await call(recipient, '/invitations/acceptance', { token: invited.token }, null, key)).status, 403);
  });
  await t.test('invites can precede registration, while existing/inactive memberships are never overwritten', async () => {
    const f = await workspace(), email = randomUUID() + '@example.test';
    const response = await call(f.owner, '/invitations', { email, grants: [{ permissionCode: 'asset.read', scope: 'self' }] }, f.org);
    assert.equal(response.status, 201);
    assert.equal((await pool.query('SELECT 1 FROM users WHERE email=$1', [email])).rowCount, 0);
    const invited = await invite(f);
    await pool.query('INSERT INTO memberships(organization_id,user_id,active) VALUES($1,$2,false)', [f.org, invited.recipient.id]);
    assert.equal((await call(invited.recipient, '/invitations/acceptance', { token: invited.token })).data.code, 'MEMBERSHIP_EXISTS');
    assert.equal((await call(f.owner, '/invitations', invited.body, f.org)).data.code, 'MEMBERSHIP_EXISTS');
    assert.equal((await pool.query('SELECT active FROM memberships WHERE organization_id=$1 AND user_id=$2', [f.org, invited.recipient.id])).rows[0].active, false);
  });
  await t.test('revocation is scoped, versioned, replay-safe and cancels pending mail', async () => {
    const f = await workspace(), other = await workspace(), invited = await invite(f), key = randomUUID();
    const path = `/invitations/${invited.id}/revocations`, body = { expectedVersion: 1, reason: 'Synthetic replacement' };
    assert.equal((await call(other.owner, path, body, other.org)).status, 404);
    assert.equal((await call(f.owner, path, { ...body, expectedVersion: 5 }, f.org)).status, 409);
    assert.equal((await call(f.owner, path, body, f.org, key)).status, 200);
    assert.equal((await call(f.owner, path, body, f.org, key)).data.data.status, 'revoked');
    assert.equal((await call(invited.recipient, '/invitations/acceptance', { token: invited.token })).status, 409);
    assert.equal((await pool.query('SELECT encrypted_payload FROM outbox_events WHERE id=$1', [invited.row.outbox_id])).rows[0].encrypted_payload, null);
    await invite(f, invited.recipient);
  });
  await t.test('delegation rejects foreign roles, invalid scopes, ownership and grants beyond the inviter', async () => {
    const f = await workspace(), other = await workspace(), member = await person();
    await pool.query('INSERT INTO memberships(organization_id,user_id) VALUES($1,$2)', [f.org, member.id]);
    for (const code of ['membership.manage', 'access.manage']) await pool.query("INSERT INTO user_permissions(organization_id,user_id,permission_id,scope) VALUES($1,$2,$3,'organization')", [f.org, member.id, code]);
    const body = { email: 'synthetic-target@example.test', grants: [{ permissionCode: 'asset.read', scope: 'self' }] };
    assert.equal((await call(member, '/invitations', body, f.org)).status, 403);
    for (const grant of [{ roleId: null, permissionCode: 'asset.read', scope: 'self' }, { roleId: other.employeeRole, scope: 'self' }, { permissionCode: 'ownership.manage', scope: 'organization' }, { permissionCode: 'membership.manage', scope: 'self' }, { permissionCode: 'asset.read', scope: 'location', locationId: randomUUID() }])
      assert.equal((await call(f.owner, '/invitations', { ...body, grants: [grant] }, f.org)).status, 400);
    await pool.query("INSERT INTO organization_departments(organization_id,code,name) VALUES($1,'kitchen','Kitchen')", [f.org]);
    await pool.query("INSERT INTO user_permissions(organization_id,user_id,permission_id,scope,department_code) VALUES($1,$2,'asset.read','department','kitchen')", [f.org, member.id]);
    assert.equal((await call(member, '/invitations', { ...body, grants: [{ permissionCode: 'asset.read', scope: 'department', departmentCode: 'kitchen' }] }, f.org)).status, 201);
    assert.equal((await call(member, '/invitations', { ...body, email: 'another-target@example.test', grants: [{ permissionCode: 'asset.read', scope: 'organization' }] }, f.org)).status, 403);
  });
  await t.test('current inviter authority and role snapshots are checked at acceptance and delivery', async () => {
    const f = await workspace(), invited = await invite(f);
    await pool.query("DELETE FROM role_permissions WHERE role_id=$1 AND permission_id='asset.file.read'", [f.employeeRole]);
    assert.equal((await call(invited.recipient, '/invitations/acceptance', { token: invited.token })).data.code, 'INVITATION_CHANGED');
    const rendered = await invitationRenderers['company.invitation']({ invitationId: invited.id, organizationId: f.org, email: invited.recipient.email, token: invited.token }, { event: { id: invited.row.outbox_id } });
    assert.equal(rendered, null);
    await pool.query('UPDATE memberships SET active=false WHERE organization_id=$1 AND user_id=$2', [f.org, invited.recipient.id]); // no implicit membership exists
    await pool.query('UPDATE users SET email_verified_at=NULL WHERE id=$1', [f.owner.id]);
    assert.equal((await call(invited.recipient, '/invitations/acceptance', { token: invited.token })).status, 403);
  });
  await t.test('expired invitations cannot be consumed and can be replaced without reviving their token', async () => {
    const f = await workspace(), invited = await invite(f);
    await pool.query("UPDATE organization_invitations SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' WHERE id=$1", [invited.id]);
    assert.equal((await call(invited.recipient, '/invitations/acceptance', { token: invited.token })).status, 409);
    const replacement = await invite(f, invited.recipient);
    assert.notEqual(replacement.id, invited.id);
    assert.equal((await call(invited.recipient, '/invitations/acceptance', { token: invited.token })).status, 409);
  });
  await t.test('list pagination is tenant-bound and pending duplicates do not create another job', async () => {
    const f = await workspace(), first = await invite(f); await invite(f);
    assert.equal((await call(f.owner, '/invitations', first.body, f.org)).data.code, 'INVITATION_PENDING');
    const page = await api('/invitations?pageSize=1', { cookie: f.owner.cookie, organization: f.org });
    assert.equal(page.status, 200); assert.equal(page.data.data.length, 1); assert(page.data.meta.nextCursor);
    const next = await api('/invitations?pageSize=1&cursor=' + page.data.meta.nextCursor, { cookie: f.owner.cookie, organization: f.org });
    assert.notEqual(next.data.data[0].id, page.data.data[0].id);
    const other = await workspace();
    assert.equal((await api('/invitations?cursor=' + page.data.meta.nextCursor, { cookie: other.owner.cookie, organization: other.org })).status, 400);
  });
  await t.test('an invitation revocation committed while acceptance waits prevents membership creation', async () => {
    const f = await workspace(), invited = await invite(f), lock = await pool.connect();
    await lock.query('BEGIN'); await lock.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [f.org]);
    const response = call(invited.recipient, '/invitations/acceptance', { token: invited.token });
    try {
      let waiting = false;
      for (let i = 0; i < 80; i++) {
        waiting = (await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM organizations%'", [schema])).rowCount > 0;
        if (waiting) break;
        await new Promise(resolve => setTimeout(resolve, 15));
      }
      assert(waiting, 'acceptance reached its company lock');
      await lock.query("UPDATE organization_invitations SET state='revoked',version=version+1,revoked_at=clock_timestamp() WHERE id=$1", [invited.id]);
      await lock.query('COMMIT');
      assert.equal((await response).status, 409);
      assert.equal((await pool.query('SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$2', [f.org, invited.recipient.id])).rowCount, 0);
    } finally { await lock.query('ROLLBACK'); lock.release(); }
  });
  await t.test('inviter permission revocation is rechecked after the company lock', async () => {
    const f = await workspace(), manager = await person();
    await pool.query('INSERT INTO memberships(organization_id,user_id) VALUES($1,$2)', [f.org, manager.id]);
    for (const code of ['membership.manage', 'access.manage', 'asset.read']) await pool.query("INSERT INTO user_permissions(organization_id,user_id,permission_id,scope) VALUES($1,$2,$3,'organization')", [f.org, manager.id, code]);
    const invited = await invite(f, null, [{ permissionCode: 'asset.read', scope: 'self' }], manager);
    const lock = await pool.connect(); await lock.query('BEGIN'); await lock.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [f.org]);
    const result = call(invited.recipient, '/invitations/acceptance', { token: invited.token });
    try {
      let waiting = false;
      for (let i = 0; i < 80; i++) {
        waiting = (await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM organizations%'", [schema])).rowCount > 0;
        if (waiting) break;
        await new Promise(resolve => setTimeout(resolve, 15));
      }
      assert(waiting);
      await lock.query("DELETE FROM user_permissions WHERE organization_id=$1 AND user_id=$2 AND permission_id='membership.manage'", [f.org, manager.id]);
      await lock.query('COMMIT');
      assert.equal((await result).status, 403);
      assert.equal((await pool.query('SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$2', [f.org, invited.recipient.id])).rowCount, 0);
    } finally { await lock.query('ROLLBACK'); lock.release(); }
  });
  await t.test('invitation creation replays across cache removal; competing new acceptance keys produce one membership', async () => {
    const f = await workspace(), recipient = await person(), key = randomUUID();
    const body = { email: recipient.email, grants: [{ roleId: f.employeeRole, scope: 'self' }] };
    const first = await call(f.owner, '/invitations', body, f.org, key);
    await pool.query("UPDATE api_commands SET result=NULL WHERE actor_id=$1 AND operation_id='inviteEmployee' AND idempotency_key=$2", [f.owner.id, key]);
    assert.deepEqual((await call(f.owner, '/invitations', body, f.org, key)).data, first.data);
    const row = (await pool.query('SELECT i.*,o.topic,o.encrypted_payload FROM organization_invitations i JOIN outbox_events o ON o.id=i.outbox_id WHERE i.id=$1', [first.data.data.id])).rows[0];
    const token = decryptPayload(row.encrypted_payload, `outbox:${row.outbox_id}:${row.topic}`).token;
    const attempts = await Promise.all([call(recipient, '/invitations/acceptance', { token }), call(recipient, '/invitations/acceptance', { token })]);
    assert.deepEqual(attempts.map(value => value.status).sort(), [200, 409]);
    assert.equal((await pool.query('SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$2', [f.org, recipient.id])).rowCount, 1);
  });
  await t.test('outbox failure rolls back invitations and the real worker renders only authorized private links', async () => {
    const f = await workspace(), recipient = await person(), key = process.env.OUTBOX_ENCRYPTION_KEY;
    process.env.OUTBOX_ENCRYPTION_KEY = '';
    try { assert.equal((await call(f.owner, '/invitations', { email: recipient.email, grants: [{ roleId: f.employeeRole, scope: 'self' }] }, f.org)).status, 503); }
    finally { process.env.OUTBOX_ENCRYPTION_KEY = key; }
    assert.equal((await pool.query('SELECT 1 FROM organization_invitations WHERE organization_id=$1', [f.org])).rowCount, 0);
    const pending = (await pool.query("SELECT id FROM outbox_events WHERE status IN ('pending','retry_scheduled')")).rows;
    const { cancelDelivery } = await import('../src/services/outbox.js');
    await transaction(async db => { for (const row of pending) await cancelDelivery(db, row.id); });
    const invited = await invite(f, recipient);
    await processDelivery({ adapter: capturedMailAdapter(), renderers: invitationRenderers });
    const capture = (await pool.query('SELECT * FROM captured_mail WHERE event_id=$1', [invited.row.outbox_id])).rows[0];
    const message = decryptPayload(capture.encrypted_message, `capture:${capture.id}:${capture.event_id}`);
    assert.equal(message.to, recipient.email); assert(message.text.includes('/invite#' + invited.token));
    assert(!JSON.stringify((await pool.query('SELECT * FROM organization_invitations WHERE id=$1', [invited.id])).rows).includes(invited.token));
  });
});
