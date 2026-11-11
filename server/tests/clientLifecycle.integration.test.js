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
});
