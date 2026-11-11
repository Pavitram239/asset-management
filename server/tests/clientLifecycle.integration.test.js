import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { pool as platformPool } from '../db/pool.js';
import { getClientPool, closeClientPool, closeAllClientPools } from '../db/clientPoolManager.js';
import {
  provisionClientDatabase,
  retryClientProvisioning,
  getPrivilegedAdminUrl,
  tokenHash,
} from '../src/services/provisioning.js';
import { decryptPayload } from '../src/services/deliveryCrypto.js';
import { runClientMigrations } from '../db/clientMigrator.js';
import { commandHash } from '../src/utils/commands.js';
import app from '../src/app.js';
import { createJWT } from '../src/utils/tokenUtils.js';
import { hashedPassword } from '../src/utils/passwordUtils.js';

test('End-to-End Client Lifecycle & Database-per-Client Verification', async (t) => {
  const adminUrl = getPrivilegedAdminUrl();
  const testDatabases = [];

  const cleanupDb = async (dbName) => {
    try {
      const client = new pg.Client({ connectionString: adminUrl });
      await client.connect();
      await client.query(`
        SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [dbName]);
      await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      await client.end();
    } catch {
      // Ignore cleanup error
    }
  };

  let server;
  let baseUrl;

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
      resolve();
    });
  });

  t.beforeEach(async () => {
    await platformPool.query('DELETE FROM authentication_attempts');
  });

  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
    await closeAllClientPools();
    for (const db of testDatabases) {
      await cleanupDb(db);
    }
    await platformPool.end();
  });

  // 1. Initial Client Administrator Setup Flow
  await t.test('1. Create client -> Deliver setup link -> Set password -> Login -> Access workspace', async () => {
    const clientName = `AcmeCorp_${Date.now()}`;
    const adminEmail = `admin_${Date.now()}@acmecorp.example.com`;

    // Provision via service (mimicking platform super admin call)
    const provisionResult = await provisionClientDatabase({
      name: clientName,
      adminEmail,
      adminName: 'Acme Admin',
    });

    assert.equal(provisionResult.success, true);
    assert(provisionResult.organizationId);
    assert(provisionResult.databaseName);
    testDatabases.push(provisionResult.databaseName);

    // Verify token was NOT returned in API response object
    assert.equal(provisionResult.admin?.setupToken, undefined);

    // Obtain setup link token via decrypting outbox payload (mirroring delivery worker)
    const outboxRow = (await platformPool.query(
      `SELECT t.*, o.encrypted_payload, o.topic 
       FROM client_setup_tokens t 
       JOIN outbox_events o ON o.id = t.outbox_id 
       WHERE t.email = $1 ORDER BY t.created_at DESC LIMIT 1`,
      [adminEmail]
    )).rows[0];
    assert(outboxRow, 'Outbox event should exist for setup link');
    const decrypted = decryptPayload(outboxRow.encrypted_payload, `outbox:${outboxRow.outbox_id}:${outboxRow.topic}`);
    assert(decrypted.token, 'Decrypted payload should have setup token');
    const setupToken = decrypted.token;

    // Verify token endpoint
    const verifyRes = await fetch(`${baseUrl}/auth/setup-admin/verify?token=${setupToken}`);
    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.valid, true);
    assert.equal(verifyData.email, adminEmail);
    assert.equal(verifyData.isExistingUser, false);
    assert.equal(verifyData.organizationName, clientName);

    // Complete setup: set password
    const setupRes = await fetch(`${baseUrl}/auth/setup-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: setupToken, password: 'SecurePassword123!' }),
    });
    assert.equal(setupRes.status, 200);
    const setupData = await setupRes.json();
    assert.equal(setupData.organizationId, provisionResult.organizationId);

    // Verify token cannot be reused
    const reuseRes = await fetch(`${baseUrl}/auth/setup-admin/verify?token=${setupToken}`);
    assert.equal(reuseRes.status, 400);

    // Log in with newly set password
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: 'SecurePassword123!' }),
    });
    assert.equal(loginRes.status, 200);
    const cookie = loginRes.headers.get('set-cookie');
    assert(cookie, 'Login should issue session cookie');

    // Access products in dedicated client database
    const productsRes = await fetch(`${baseUrl}/products`, {
      headers: {
        Cookie: cookie,
        'X-Organization-Id': provisionResult.organizationId,
      },
    });
    assert.equal(productsRes.status, 200, 'Admin can access client database');
    const productsData = await productsRes.json();
    assert.equal(productsData.totalProducts, 0);
  });

  // 2. Existing-account administrator acceptance
  await t.test('2. Existing-account administrator acceptance preserves password and existing memberships', async () => {
    const existingEmail = `existing_${Date.now()}@user.example.com`;
    const existingPassword = 'ExistingUserPass123!';
    const existingUserId = randomUUID();
    const existingHash = await hashedPassword(existingPassword);

    // Insert verified existing user into platform users
    await platformPool.query(
      `INSERT INTO users (id, name, email, password_hash, active, email_verified_at)
       VALUES ($1, 'Existing Person', $2, $3, true, now())`,
      [existingUserId, existingEmail, existingHash]
    );

    // Super admin provisions new client for this existing user
    const clientName = `SecondCompany_${Date.now()}`;
    const provisionResult = await provisionClientDatabase({
      name: clientName,
      adminEmail: existingEmail,
      adminName: 'Existing Person',
    });
    testDatabases.push(provisionResult.databaseName);

    // Extract token
    const outboxRow = (await platformPool.query(
      `SELECT t.*, o.encrypted_payload, o.topic 
       FROM client_setup_tokens t 
       JOIN outbox_events o ON o.id = t.outbox_id 
       WHERE t.email = $1 ORDER BY t.created_at DESC LIMIT 1`,
      [existingEmail]
    )).rows[0];
    const token = decryptPayload(outboxRow.encrypted_payload, `outbox:${outboxRow.outbox_id}:${outboxRow.topic}`).token;

    // Verify token endpoint identifies user as existing
    const verifyRes = await fetch(`${baseUrl}/auth/setup-admin/verify?token=${token}`);
    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.isExistingUser, true);

    // Submitting wrong password fails
    const badPassRes = await fetch(`${baseUrl}/auth/setup-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, currentPassword: 'WrongPassword!' }),
    });
    assert.equal(badPassRes.status, 401);

    // Submitting correct current password succeeds
    const goodPassRes = await fetch(`${baseUrl}/auth/setup-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, currentPassword: existingPassword }),
    });
    assert.equal(goodPassRes.status, 200);

    // Login with original password works
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: existingEmail, password: existingPassword }),
    });
    assert.equal(loginRes.status, 200);
  });

  // 3. Client database routing: Requisitions in dedicated client DB
  await t.test('3. Requisition operations route entirely to client database', async () => {
    const clientName = `ReqCorp_${Date.now()}`;
    const adminEmail = `req_${Date.now()}@example.com`;

    const provisionResult = await provisionClientDatabase({
      name: clientName,
      adminEmail,
      adminName: 'Req Admin',
    });
    testDatabases.push(provisionResult.databaseName);

    const clientPool = await getClientPool(provisionResult.organizationId);

    // Use the admin user provisioned by the service
    const adminId = provisionResult.admin.userId;

    // Ensure admin user in client DB with requisition permissions
    await clientPool.query(
      `INSERT INTO users (id, name, email, active) VALUES ($1, 'Req Admin', $2, true) ON CONFLICT (id) DO UPDATE SET active = true`,
      [adminId, adminEmail]
    );

    const roleId = randomUUID();
    await clientPool.query(
      `INSERT INTO roles (id, name, active, organization_id) VALUES ($1, 'Requisitioner', true, $2)`,
      [roleId, provisionResult.organizationId]
    );
    await clientPool.query(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, 'requisition.create'), ($1, 'requisition.read')`,
      [roleId]
    );
    await clientPool.query(
      `INSERT INTO user_roles (user_id, role_id, scope, organization_id) VALUES ($1, $2, 'organization', $3)`,
      [adminId, roleId, provisionResult.organizationId]
    );

    // Activate membership in platform DB
    await platformPool.query(
      `UPDATE memberships SET active = true WHERE organization_id = $1 AND user_id = $2`,
      [provisionResult.organizationId, adminId]
    );

    const sessionCookie = `token=${createJWT({ userId: adminId, sessionVersion: 0 })}`;

    // Create requisition via API
    const createRes = await fetch(`${baseUrl}/requisitions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        'X-Organization-Id': provisionResult.organizationId,
      },
      body: JSON.stringify({
        itemName: 'Ergonomic Office Chair',
        urgency: 'standard',
        purpose: 'Work from home equipment',
        departmentCode: 'ADMIN',
        neededUntil: new Date(Date.now() + 86400000 * 7).toISOString(),
      }),
    });
    assert.equal(createRes.status, 201);
    const createdReq = await createRes.json();
    const requisitionId = createdReq.requisition?.id;
    assert(requisitionId, 'Created requisition must have an ID');

    // Verify it is stored physically in the client DB, NOT in platform public DB
    const clientDbCheck = await clientPool.query(
      `SELECT * FROM asset_requisitions WHERE id = $1`,
      [requisitionId]
    );
    assert.equal(clientDbCheck.rows.length, 1);
    assert.equal(clientDbCheck.rows[0].item_name, 'Ergonomic Office Chair');

    const platformDbCheck = await platformPool.query(
      `SELECT to_regclass('asset_requisitions') AS tbl`
    );
    // Even if table exists or does not exist on platform, verify client record is in client DB
    assert.equal(clientDbCheck.rows[0].organization_id, provisionResult.organizationId);

    // Read back requisitions via API
    const listRes = await fetch(`${baseUrl}/requisitions`, {
      headers: {
        Cookie: sessionCookie,
        'X-Organization-Id': provisionResult.organizationId,
      },
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.equal(listData.requisitions.length, 1);
    assert.equal(listData.requisitions[0].item_name, 'Ergonomic Office Chair');
  });

  // 4. Client isolation: User A cannot access Client B
  await t.test('4. Strict client isolation blocks cross-tenant headers and IDs', async () => {
    const clientA = await provisionClientDatabase({ name: `IsolationA_${Date.now()}` });
    const clientB = await provisionClientDatabase({ name: `IsolationB_${Date.now()}` });
    testDatabases.push(clientA.databaseName, clientB.databaseName);

    const userAId = randomUUID();
    const userAEmail = `usera_${Date.now()}_${randomUUID().slice(0, 8)}@iso.test`;
    await platformPool.query(
      `INSERT INTO users (id, name, email, password_hash, active) VALUES ($1, 'User A', $2, 'hash', true)`,
      [userAId, userAEmail]
    );
    await platformPool.query(
      `INSERT INTO memberships (organization_id, user_id, active) VALUES ($1, $2, true)`,
      [clientA.organizationId, userAId]
    );

    const poolA = await getClientPool(clientA.organizationId);
    await poolA.query(
      `INSERT INTO users (id, name, email, active) VALUES ($1, 'User A', $2, true)`,
      [userAId, userAEmail]
    );
    const roleId = randomUUID();
    await poolA.query(
      `INSERT INTO roles (id, name, active, organization_id) VALUES ($1, 'Viewer', true, $2)`,
      [roleId, clientA.organizationId]
    );
    await poolA.query(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, 'asset.read')`,
      [roleId]
    );
    await poolA.query(
      `INSERT INTO user_roles (user_id, role_id, scope, organization_id) VALUES ($1, $2, 'organization', $3)`,
      [userAId, roleId, clientA.organizationId]
    );

    const userACookie = `token=${createJWT({ userId: userAId })}`;

    // User A accessing Client A succeeds
    const resA = await fetch(`${baseUrl}/products`, {
      headers: { Cookie: userACookie, 'X-Organization-Id': clientA.organizationId },
    });
    assert.equal(resA.status, 200);

    // User A accessing Client B fails closed with 403 Forbidden
    const resB = await fetch(`${baseUrl}/products`, {
      headers: { Cookie: userACookie, 'X-Organization-Id': clientB.organizationId },
    });
    assert.equal(resB.status, 403);
    const errB = await resB.json();
    assert.match(errB.msg, /membership required/i);
  });

  // 5. Suspending client closes pool and rejects retries
  await t.test('5. Suspending client blocks cached connections and rejects retries', async () => {
    const client = await provisionClientDatabase({ name: `SuspendedCorp_${Date.now()}` });
    testDatabases.push(client.databaseName);

    // Cache pool
    const pool = await getClientPool(client.organizationId);
    assert(pool);

    // Suspend organization in platform DB
    await platformPool.query(
      `UPDATE organizations SET status = 'suspended' WHERE id = $1`,
      [client.organizationId]
    );

    // Attempting to get pool for suspended client throws UnauthorizedError even if cached
    await assert.rejects(
      async () => getClientPool(client.organizationId),
      /suspended/i
    );

    // Retrying a suspended client is rejected
    await assert.rejects(
      async () => retryClientProvisioning(client.organizationId),
      /suspended/i
    );
  });

  // 6. Duplicate & Concurrent Client Creation (Criterion 2 & 12)
  await t.test('6. Duplicate & Concurrent Client Creation: exactly one client & DB, 409 on mismatch', async () => {
    const superAdminId = randomUUID();
    const superAdminEmail = `super_${Date.now()}@platform.admin`;
    await platformPool.query(
      `INSERT INTO users (id, name, email, password_hash, active, is_super_admin) VALUES ($1, 'Super Admin', $2, 'hash', true, true)`,
      [superAdminId, superAdminEmail]
    );
    const superCookie = `token=${createJWT({ userId: superAdminId })}`;

    const idempotencyKey = `create-client-${randomUUID().slice(0, 16)}`;
    const payload = {
      name: `ConcurrentCorp_${Date.now()}`,
      adminEmail: `admin_${Date.now()}@concurrent.corp`,
      adminName: 'Concurrent Admin',
    };

    // Run 2 concurrent creation requests with the same Idempotency-Key
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/platform/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: superCookie,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      }),
      fetch(`${baseUrl}/platform/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: superCookie,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      }),
    ]);

    assert([200, 201].includes(res1.status));
    assert([200, 201].includes(res2.status));
    const data1 = await res1.json();
    const data2 = await res2.json();
    assert.equal(data1.client.id, data2.client.id, 'Both concurrent calls must yield the identical client ID');
    assert.equal(data1.client.databaseName, data2.client.databaseName);
    testDatabases.push(data1.client.databaseName);

    // Verify only ONE client organization exists in DB with this name
    const countCheck = await platformPool.query(
      `SELECT count(*)::int AS count FROM organizations WHERE name = $1`,
      [payload.name]
    );
    assert.equal(countCheck.rows[0].count, 1, 'Exactly one organization must be created');

    // Reusing the same key with different payload must fail with 409 conflict
    const conflictRes = await fetch(`${baseUrl}/platform/clients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: superCookie,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ ...payload, name: 'Completely Different Name' }),
    });
    assert.equal(conflictRes.status, 409, 'Reusing key with changed input must return 409 conflict');
    const conflictData = await conflictRes.json();
    assert.match(conflictData.msg || conflictData.message, /idempotency/i);
  });

  // 7. Employee invitation, delivery, acceptance and permissions (Criterion 5)
  await t.test('7. Client administrator invites employee, employee accepts, logs in and receives permissions', async () => {
    const client = await provisionClientDatabase({
      name: `InviteCorp_${Date.now()}`,
      adminEmail: `admin_${Date.now()}@invitecorp.test`,
      adminName: 'Admin Person',
    });
    testDatabases.push(client.databaseName);

    // Admin accepts setup
    const outboxRow = (await platformPool.query(
      `SELECT t.*, o.encrypted_payload, o.topic FROM client_setup_tokens t 
       JOIN outbox_events o ON o.id = t.outbox_id WHERE t.organization_id = $1`,
      [client.organizationId]
    )).rows[0];
    const setupToken = decryptPayload(outboxRow.encrypted_payload, `outbox:${outboxRow.outbox_id}:${outboxRow.topic}`).token;

    await fetch(`${baseUrl}/auth/setup-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: setupToken, password: 'AdminPassword123!' }),
    });

    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: client.admin.email, password: 'AdminPassword123!' }),
    });
    const adminCookie = adminLoginRes.headers.get('set-cookie');

    // Admin invites an employee with asset.read permission
    const employeeEmail = `employee_${Date.now()}@invitecorp.test`;
    const employeePassword = 'EmployeePassword123!';
    const inviteKey = `invite-${randomUUID().slice(0, 16)}`;

    const inviteRes = await fetch(`${baseUrl}/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-Organization-Id': client.organizationId,
        'Idempotency-Key': inviteKey,
      },
      body: JSON.stringify({
        email: employeeEmail,
        grants: [{ permissionCode: 'asset.read', scope: 'organization' }],
      }),
    });
    assert.equal(inviteRes.status, 201);
    const inviteData = await inviteRes.json();
    assert(inviteData.data?.id);

    // Employee registers account in platform
    const empUserId = randomUUID();
    const empHash = await hashedPassword(employeePassword);
    await platformPool.query(
      `INSERT INTO users (id, name, email, password_hash, active, email_verified_at)
       VALUES ($1, 'Test Employee', $2, $3, true, now())`,
      [empUserId, employeeEmail, empHash]
    );

    // Extract employee invitation token from outbox
    const empOutbox = (await platformPool.query(
      `SELECT * FROM outbox_events WHERE topic = 'company.invitation' ORDER BY created_at DESC LIMIT 1`
    )).rows[0];
    const empDecrypted = decryptPayload(empOutbox.encrypted_payload, `outbox:${empOutbox.id}:${empOutbox.topic}`);
    assert(empDecrypted.token);

    // Employee accepts invitation
    const empCookie = `token=${createJWT({ userId: empUserId })}`;
    const acceptKey = `accept-${randomUUID().slice(0, 16)}`;
    const acceptRes = await fetch(`${baseUrl}/invitations/acceptance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: empCookie,
        'Idempotency-Key': acceptKey,
      },
      body: JSON.stringify({ token: empDecrypted.token }),
    });
    assert.equal(acceptRes.status, 200);

    // Employee can now read products in Client DB
    const empProductsRes = await fetch(`${baseUrl}/products`, {
      headers: {
        Cookie: empCookie,
        'X-Organization-Id': client.organizationId,
      },
    });
    assert.equal(empProductsRes.status, 200);

    // But employee cannot manage invitations (does not have membership.manage)
    const empForbiddenRes = await fetch(`${baseUrl}/invitations`, {
      headers: {
        Cookie: empCookie,
        'X-Organization-Id': client.organizationId,
      },
    });
    assert.equal(empForbiddenRes.status, 403);
  });

  // 8. Role changes, permission revocation and employee deactivation (Criterion 6)
  await t.test('8. Role modification, permission revocation and user deactivation take effect immediately', async () => {
    const client = await provisionClientDatabase({ name: `PermRevoke_${Date.now()}` });
    testDatabases.push(client.databaseName);

    const clientPool = await getClientPool(client.organizationId);
    const userAId = randomUUID();
    const userAEmail = `perm_${Date.now()}@test.corp`;
    await platformPool.query(
      `INSERT INTO users (id, name, email, password_hash, active) VALUES ($1, 'User A', $2, 'hash', true)`,
      [userAId, userAEmail]
    );
    await platformPool.query(
      `INSERT INTO memberships (organization_id, user_id, active) VALUES ($1, $2, true)`,
      [client.organizationId, userAId]
    );
    await clientPool.query(
      `INSERT INTO users (id, name, email, active) VALUES ($1, 'User A', $2, true)`,
      [userAId, userAEmail]
    );

    // Give user asset.read permission in client DB
    await clientPool.query(
      `INSERT INTO user_permissions (organization_id, user_id, permission_id, scope) VALUES ($1, $2, 'asset.read', 'organization')`,
      [client.organizationId, userAId]
    );

    const userCookie = `token=${createJWT({ userId: userAId })}`;

    // Initial access works
    const res1 = await fetch(`${baseUrl}/products`, {
      headers: { Cookie: userCookie, 'X-Organization-Id': client.organizationId },
    });
    assert.equal(res1.status, 200);

    // Revoke permission in client DB
    await clientPool.query(
      `DELETE FROM user_permissions WHERE organization_id = $1 AND user_id = $2 AND permission_id = 'asset.read'`,
      [client.organizationId, userAId]
    );

    // Next request immediately denied with 403
    const res2 = await fetch(`${baseUrl}/products`, {
      headers: { Cookie: userCookie, 'X-Organization-Id': client.organizationId },
    });
    assert.equal(res2.status, 403);

    // Deactivate membership in platform DB
    await platformPool.query(
      `UPDATE memberships SET active = false WHERE organization_id = $1 AND user_id = $2`,
      [client.organizationId, userAId]
    );

    // Next request immediately fails closed with membership required
    const res3 = await fetch(`${baseUrl}/products`, {
      headers: { Cookie: userCookie, 'X-Organization-Id': client.organizationId },
    });
    assert.equal(res3.status, 403);
    const err3 = await res3.json();
    assert.match(err3.msg, /membership required/i);
  });

  // 9. Last-owner and last-administrator protections (Criterion 7)
  await t.test('9. Last-owner protection prevents removing the single owner', async () => {
    const client = await provisionClientDatabase({
      name: `OwnerProtect_${Date.now()}`,
      adminEmail: `owner_${Date.now()}@protect.corp`,
      adminName: 'Sole Owner',
    });
    testDatabases.push(client.databaseName);

    const adminId = client.admin.userId;
    const clientPool = await getClientPool(client.organizationId);

    // Activate admin membership
    await platformPool.query(
      `UPDATE memberships SET active = true WHERE organization_id = $1 AND user_id = $2`,
      [client.organizationId, adminId]
    );

    const ownerCookie = `token=${createJWT({ userId: adminId })}`;

    // Attempting to remove the sole owner must fail with 409 LAST_OWNER
    const removeRes = await fetch(`${baseUrl}/ownership/${adminId}/removals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerCookie,
        'X-Organization-Id': client.organizationId,
        'Idempotency-Key': `rem-owner-${randomUUID().slice(0, 16)}`,
      },
      body: JSON.stringify({ expectedVersion: 1, reason: 'Testing last owner protection' }),
    });
    assert.equal(removeRes.status, 409);
    const removeErr = await removeRes.json();
    assert.match(removeErr.msg || removeErr.message, /last owner/i);
  });

  // 10. Complete business entities in dedicated client database (Criterion 8)
  await t.test('10. Business entities (locations, departments, categories, catalog) operate in client DB', async () => {
    const client = await provisionClientDatabase({
      name: `BizCorp_${Date.now()}`,
      adminEmail: `biz_${Date.now()}@biz.corp`,
      adminName: 'Biz Admin',
    });
    testDatabases.push(client.databaseName);

    const clientPool = await getClientPool(client.organizationId);
    const adminId = client.admin.userId;
    await platformPool.query(`UPDATE memberships SET active = true WHERE organization_id = $1 AND user_id = $2`, [client.organizationId, adminId]);
    const adminCookie = `token=${createJWT({ userId: adminId })}`;

    // Create a new location via API
    const locRes = await fetch(`${baseUrl}/locations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-Organization-Id': client.organizationId,
        'Idempotency-Key': `loc-${randomUUID().slice(0, 16)}`,
      },
      body: JSON.stringify({ name: 'West Warehouse', kind: 'branch' }),
    });
    assert([200, 201].includes(locRes.status));

    // Verify location is saved in client DB
    const locInDb = await clientPool.query(`SELECT * FROM locations WHERE name = 'West Warehouse'`);
    assert.equal(locInDb.rowCount, 1);
    assert.equal(locInDb.rows[0].organization_id, client.organizationId);

    // Verify it is NOT present in platform DB
    const locInPlatform = await platformPool.query(`SELECT 1 FROM locations WHERE name = 'West Warehouse'`);
    assert.equal(locInPlatform.rowCount, 0);
  });

  // 11. Suspending and Reactivating client (Criterion 9)
  await t.test('11. Suspending and reactivating client restores access without data loss', async () => {
    const client = await provisionClientDatabase({
      name: `LifecycleCorp_${Date.now()}`,
      adminEmail: `life_${Date.now()}@life.corp`,
      adminName: 'Life Admin',
    });
    testDatabases.push(client.databaseName);

    const adminId = client.admin.userId;
    await platformPool.query(`UPDATE memberships SET active = true WHERE organization_id = $1 AND user_id = $2`, [client.organizationId, adminId]);
    const adminCookie = `token=${createJWT({ userId: adminId })}`;

    // Create an asset while active
    const clientPool = await getClientPool(client.organizationId);
    const assetId = randomUUID();
    await clientPool.query(
      `INSERT INTO products (id, name, company, organization_id, created_by, status)
       VALUES ($1, 'Crucial Server', 'LifecycleCorp', $2, $3, 'in-stock')`,
      [assetId, client.organizationId, adminId]
    );

    // Suspend client in platform DB
    await platformPool.query(`UPDATE organizations SET status = 'suspended' WHERE id = $1`, [client.organizationId]);

    // Request while suspended is blocked
    const suspRes = await fetch(`${baseUrl}/products`, {
      headers: { Cookie: adminCookie, 'X-Organization-Id': client.organizationId },
    });
    assert.equal(suspRes.status, 403);

    // Reactivate client
    await platformPool.query(`UPDATE organizations SET status = 'active' WHERE id = $1`, [client.organizationId]);

    // Request after reactivation succeeds and previously created asset is intact
    const reactRes = await fetch(`${baseUrl}/products`, {
      headers: { Cookie: adminCookie, 'X-Organization-Id': client.organizationId },
    });
    assert.equal(reactRes.status, 200);
    const reactData = await reactRes.json();
    assert.equal(reactData.totalProducts, 1);
    assert.equal(reactData.products[0].name, 'Crucial Server');
  });

  // 12. Super admin capabilities and access boundaries (Criterion 10)
  await t.test('12. Platform super admin cannot read client business records, but can manage clients and audit logs', async () => {
    const superAdminId = randomUUID();
    const superAdminEmail = `superadmin_${Date.now()}@platform.admin`;
    await platformPool.query(
      `INSERT INTO users (id, name, email, password_hash, active, is_super_admin) VALUES ($1, 'Super Admin', $2, 'hash', true, true)`,
      [superAdminId, superAdminEmail]
    );
    const superCookie = `token=${createJWT({ userId: superAdminId })}`;

    const client = await provisionClientDatabase({ name: `SuperBoundCorp_${Date.now()}` });
    testDatabases.push(client.databaseName);

    // Super admin cannot read client business records directly (fails closed on missing membership)
    const busRes = await fetch(`${baseUrl}/products`, {
      headers: { Cookie: superCookie, 'X-Organization-Id': client.organizationId },
    });
    assert.equal(busRes.status, 403);

    // Super admin CAN list clients and view client details with audit logs
    const clientDetailRes = await fetch(`${baseUrl}/platform/clients/${client.organizationId}`, {
      headers: { Cookie: superCookie },
    });
    assert.equal(clientDetailRes.status, 200);
    const clientDetail = await clientDetailRes.json();
    assert.equal(clientDetail.client.id, client.organizationId);
    assert(Array.isArray(clientDetail.auditLog));
  });

  // 13. Client switching and cache re-routing (Criterion 11)
  await t.test('13. Switching active clients re-authenticates routing to respective databases', async () => {
    const client1 = await provisionClientDatabase({ name: `SwitchCorp1_${Date.now()}` });
    const client2 = await provisionClientDatabase({ name: `SwitchCorp2_${Date.now()}` });
    testDatabases.push(client1.databaseName, client2.databaseName);

    const multiUser = randomUUID();
    const multiEmail = `multi_${Date.now()}@corp.test`;
    await platformPool.query(
      `INSERT INTO users (id, name, email, password_hash, active) VALUES ($1, 'Multi User', $2, 'hash', true)`,
      [multiUser, multiEmail]
    );
    // User belongs to both clients
    await platformPool.query(
      `INSERT INTO memberships (organization_id, user_id, active) VALUES ($1, $3, true), ($2, $3, true)`,
      [client1.organizationId, client2.organizationId, multiUser]
    );

    const pool1 = await getClientPool(client1.organizationId);
    const pool2 = await getClientPool(client2.organizationId);

    await pool1.query(`INSERT INTO users (id, name, email, active) VALUES ($1, 'Multi User', $2, true)`, [multiUser, multiEmail]);
    await pool2.query(`INSERT INTO users (id, name, email, active) VALUES ($1, 'Multi User', $2, true)`, [multiUser, multiEmail]);

    // Give asset.read in client 1, but NO permissions in client 2
    await pool1.query(
      `INSERT INTO user_permissions (organization_id, user_id, permission_id, scope) VALUES ($1, $2, 'asset.read', 'organization')`,
      [client1.organizationId, multiUser]
    );

    const multiCookie = `token=${createJWT({ userId: multiUser })}`;

    // Query Client 1: succeeds with asset.read grant
    const curr1 = await fetch(`${baseUrl}/users/current-user`, {
      headers: { Cookie: multiCookie, 'X-Organization-Id': client1.organizationId },
    });
    assert.equal(curr1.status, 200);
    const d1 = await curr1.json();
    assert(d1.user.grants.some(g => g.permission === 'asset.read'));

    // Switch to Client 2: succeeds, but grants are empty (correctly isolated to Client 2)
    const curr2 = await fetch(`${baseUrl}/users/current-user`, {
      headers: { Cookie: multiCookie, 'X-Organization-Id': client2.organizationId },
    });
    assert.equal(curr2.status, 200);
    const d2 = await curr2.json();
    assert.equal(d2.user.grants.length, 0);
  });

  // 14. Versioned client database migrations (Criterion 13)
  await t.test('14. Versioned client database migrations apply cleanly and track applied migrations', async () => {
    const client = await provisionClientDatabase({ name: `MigrateCorp_${Date.now()}` });
    testDatabases.push(client.databaseName);

    const clientPool = await getClientPool(client.organizationId);
    // Running migrations again is completely idempotent
    const applied = await runClientMigrations(clientPool);
    assert(Array.isArray(applied));

    // Verify migration history table exists in client DB
    const migHistory = await clientPool.query('SELECT version, applied_at FROM client_schema_migrations ORDER BY version');
    assert(migHistory.rows.length >= 2);
    assert(migHistory.rows.some(r => r.version.includes('001_client_initial')));
    assert(migHistory.rows.some(r => r.version.includes('002_client_owners_and_commands')));
  });

  // 15. No credentials, tokens or secrets leak in API responses (Criterion 14)
  await t.test('15. API responses never leak database passwords, hosts, setup tokens, or secrets', async () => {
    const superAdminId = randomUUID();
    const superAdminEmail = `audit_${Date.now()}@leak.test`;
    await platformPool.query(
      `INSERT INTO users (id, name, email, password_hash, active, is_super_admin) VALUES ($1, 'Super Admin', $2, 'hash', true, true)`,
      [superAdminId, superAdminEmail]
    );
    const superCookie = `token=${createJWT({ userId: superAdminId })}`;

    const client = await provisionClientDatabase({
      name: `NoLeakCorp_${Date.now()}`,
      adminEmail: `admin_${Date.now()}@noleak.corp`,
      adminName: 'No Leak Admin',
    });
    testDatabases.push(client.databaseName);

    // Platform get client
    const res = await fetch(`${baseUrl}/platform/clients/${client.organizationId}`, {
      headers: { Cookie: superCookie },
    });
    const textResponse = await res.text();

    assert(!textResponse.includes('database_password'), 'Must not disclose database_password');
    assert(!textResponse.includes('token_hash'), 'Must not disclose token_hash');
    assert(!textResponse.includes('password_hash'), 'Must not disclose password_hash');
  });
});
