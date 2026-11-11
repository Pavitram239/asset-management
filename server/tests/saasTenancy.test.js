import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { pool as platformPool } from '../db/pool.js';
import { getClientPool, closeClientPool, closeAllClientPools } from '../db/clientPoolManager.js';
import {
  ensureDatabaseExists,
  applyClientSchema,
  seedClientDatabaseDefaults,
  provisionClientDatabase,
  retryClientProvisioning,
  getPrivilegedAdminUrl,
} from '../src/services/provisioning.js';
import { resolveGrants, allows } from '../src/utils/authorization.js';

test('SaaS Model: Separate database per client, tenant routing, and super-admin lifecycle', async (t) => {
  const adminUrl = getPrivilegedAdminUrl();
  const testDatabasesToClean = [];

  const cleanupClientDb = async (dbName) => {
    try {
      const client = new pg.Client({ connectionString: adminUrl });
      await client.connect();
      await client.query(`
        SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [dbName]);
      await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      await client.end();
    } catch (e) {
      // Ignore cleanup error
    }
  };

  t.after(async () => {
    await closeAllClientPools();
    for (const dbName of testDatabasesToClean) {
      await cleanupClientDb(dbName);
    }
    await platformPool.end();
  });

  // 1. Privileged Provisioning of Dedicated Database
  await t.test('provisions separate PostgreSQL database with dedicated schema', async () => {
    const orgName = `TestCorp_${Date.now()}`;
    const result = await provisionClientDatabase({
      name: orgName,
      adminEmail: `admin_${Date.now()}@testcorp.example.com`,
      adminName: 'Test Administrator',
    });

    assert.equal(result.success, true);
    assert(result.organizationId);
    assert(result.databaseName);
    testDatabasesToClean.push(result.databaseName);

    // Verify physical database exists
    const adminClient = new pg.Client({ connectionString: adminUrl });
    await adminClient.connect();
    const dbCheck = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [result.databaseName]
    );
    assert.equal(dbCheck.rowCount, 1, 'Physical database must exist on PostgreSQL server');
    await adminClient.end();

    // Verify client tables exist inside the new database
    const clientPool = await getClientPool(result.organizationId);
    const tableRes = await clientPool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('products', 'roles', 'locations', 'organization_departments', 'audit_events')
    `);
    const tables = tableRes.rows.map(r => r.table_name);
    assert(tables.includes('products'), 'products table must exist in client database');
    assert(tables.includes('roles'), 'roles table must exist in client database');
    assert(tables.includes('locations'), 'locations table must exist in client database');
    assert(tables.includes('organization_departments'), 'organization_departments must exist');

    // Verify initial owner role was seeded in client DB
    const roleRes = await clientPool.query('SELECT name FROM roles WHERE name = $1', ['Organization owner']);
    assert.equal(roleRes.rowCount, 1);
  });

  // 2. Safe Provisioning Retry
  await t.test('recovering failed provisioning is safe and idempotent', async () => {
    const orgId = randomUUID();
    const dbName = `client_asset_retry_${Date.now()}`;
    testDatabasesToClean.push(dbName);

    // Seed organization in failed state
    await platformPool.query(
      `INSERT INTO organizations (id, name, database_name, status, provisioning_status, provisioning_error)
       VALUES ($1, $2, $3, 'failed', 'failed', 'Simulated network timeout during DDL')`,
      [orgId, 'Retry Corp', dbName]
    );

    // Retry provisioning
    const retryResult = await retryClientProvisioning(orgId);
    assert.equal(retryResult.success, true);
    assert.equal(retryResult.status, 'active');
    assert.equal(retryResult.provisioningStatus, 'provisioned');

    // Verify status updated in platform DB
    const { rows } = await platformPool.query('SELECT status, provisioning_status, provisioning_error FROM organizations WHERE id = $1', [orgId]);
    assert.equal(rows[0].status, 'active');
    assert.equal(rows[0].provisioning_status, 'provisioned');
    assert.equal(rows[0].provisioning_error, null);

    // Running retry a second time on already provisioned client does not fail or duplicate
    const secondRetry = await retryClientProvisioning(orgId);
    assert.equal(secondRetry.success, true);
  });

  // 3. Complete Tenant Isolation & Overlapping IDs across separate client databases
  await t.test('two clients have completely isolated databases and support overlapping IDs without collision', async () => {
    const clientA = await provisionClientDatabase({
      name: `TenantA_${Date.now()}`,
      adminEmail: `adminA_${Date.now()}@example.com`,
    });
    const clientB = await provisionClientDatabase({
      name: `TenantB_${Date.now()}`,
      adminEmail: `adminB_${Date.now()}@example.com`,
    });
    testDatabasesToClean.push(clientA.databaseName, clientB.databaseName);

    const poolA = await getClientPool(clientA.organizationId);
    const poolB = await getClientPool(clientB.organizationId);

    // Same asset ID in both client databases!
    const identicalAssetId = randomUUID();

    // Insert asset into Client A DB
    await poolA.query(
      `INSERT INTO products (id, organization_id, name, company, price, status)
       VALUES ($1, $2, 'Client A Laptop', 'Apple', 1500, 'active')`,
      [identicalAssetId, clientA.organizationId]
    );

    // Insert asset with EXACT SAME ID into Client B DB, but with different data
    await poolB.query(
      `INSERT INTO products (id, organization_id, name, company, price, status)
       VALUES ($1, $2, 'Client B Heavy Generator', 'Caterpillar', 8500, 'active')`,
      [identicalAssetId, clientB.organizationId]
    );

    // Query Client A DB for that ID
    const resA = await poolA.query('SELECT name, price FROM products WHERE id = $1', [identicalAssetId]);
    assert.equal(resA.rows[0].name, 'Client A Laptop');
    assert.equal(Number(resA.rows[0].price), 1500);

    // Query Client B DB for that ID
    const resB = await poolB.query('SELECT name, price FROM products WHERE id = $1', [identicalAssetId]);
    assert.equal(resB.rows[0].name, 'Client B Heavy Generator');
    assert.equal(Number(resB.rows[0].price), 8500);

    // Client A cannot see Client B's record count
    const countA = await poolA.query('SELECT count(*)::int AS count FROM products');
    const countB = await poolB.query('SELECT count(*)::int AS count FROM products');
    assert.equal(countA.rows[0].count, 1);
    assert.equal(countB.rows[0].count, 1);
  });

  // 4. Suspension Enforcement
  await t.test('suspending a client closes connection pool and prevents subsequent client access', async () => {
    const client = await provisionClientDatabase({
      name: `SuspendCorp_${Date.now()}`,
      adminEmail: `admin_suspend_${Date.now()}@example.com`,
    });
    testDatabasesToClean.push(client.databaseName);

    // Verify active pool can be fetched
    const pool = await getClientPool(client.organizationId);
    assert(pool);

    // Suspend organization
    await platformPool.query(
      "UPDATE organizations SET status = 'suspended' WHERE id = $1",
      [client.organizationId]
    );
    await closeClientPool(client.organizationId);

    // Attempting to resolve client pool for suspended client must fail closed
    await assert.rejects(
      () => getClientPool(client.organizationId),
      /suspended/i,
      'Suspended client organization must block database connection'
    );

    // Reactivate organization
    await platformPool.query(
      "UPDATE organizations SET status = 'active' WHERE id = $1",
      [client.organizationId]
    );

    // Now connection pool succeeds again
    const reactivatedPool = await getClientPool(client.organizationId);
    assert(reactivatedPool);
    const ping = await reactivatedPool.query('SELECT 1 AS ok');
    assert.equal(ping.rows[0].ok, 1);
  });

  // 5. HTTP Layer Verification: Super Admin separation, Tenant Boundary Enforcement, and Suspended Blocking
  await t.test('HTTP endpoints enforce super admin permissions, tenant isolation and suspended client rejection', async () => {
    const { default: app } = await import('../src/app.js');
    const { createJWT } = await import('../src/utils/tokenUtils.js');
    const server = app.listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}/api/v1`;

    try {
      // 1. Create a Super Admin user
      const superAdminId = randomUUID();
      await platformPool.query(
        `INSERT INTO users (id, name, email, password_hash, is_super_admin, active, email_verified_at)
         VALUES ($1, 'Global Admin', $2, 'hash123', true, true, now())`,
        [superAdminId, `superadmin_${Date.now()}@platform.test`]
      );
      const superAdminCookie = `token=${createJWT({ userId: superAdminId })}`;

      // 2. Create regular user A
      const userAId = randomUUID();
      await platformPool.query(
        `INSERT INTO users (id, name, email, password_hash, is_super_admin, active, email_verified_at)
         VALUES ($1, 'User A', $2, 'hash123', false, true, now())`,
        [userAId, `usera_${Date.now()}@example.test`]
      );
      const userACookie = `token=${createJWT({ userId: userAId })}`;

      // 3. Regular user CANNOT access platform super-admin routes
      const nonAdminRes = await fetch(`${base}/platform/clients`, {
        headers: { Cookie: userACookie },
      });
      assert.equal(nonAdminRes.status, 403, 'Non-super-admin must be denied from /platform/clients');

      // 4. Super Admin CAN access platform super-admin routes
      const adminRes = await fetch(`${base}/platform/clients`, {
        headers: { Cookie: superAdminCookie },
      });
      assert.equal(adminRes.status, 200, 'Super admin must be able to list clients');
      const adminData = await adminRes.json();
      assert(Array.isArray(adminData.clients));

      // 5. Provision client organizations for testing HTTP boundary
      const clientA = await provisionClientDatabase({
        name: `HttpCorpA_${Date.now()}`,
        adminEmail: `admin_http_a_${Date.now()}@example.test`,
      });
      const clientB = await provisionClientDatabase({
        name: `HttpCorpB_${Date.now()}`,
        adminEmail: `admin_http_b_${Date.now()}@example.test`,
      });
      testDatabasesToClean.push(clientA.databaseName, clientB.databaseName);

      // Add user A to client A memberships, but NOT client B
      await platformPool.query(
        'INSERT INTO memberships (organization_id, user_id, active) VALUES ($1, $2, true)',
        [clientA.organizationId, userAId]
      );

      // Give user A asset.read permission in Client A DB
      const poolA = await getClientPool(clientA.organizationId);
      await poolA.query(
        'INSERT INTO users (id, name, email, active) VALUES ($1, $2, $3, true) ON CONFLICT (id) DO NOTHING',
        [userAId, 'User A', 'usera@example.test']
      );
      const roleId = randomUUID();
      await poolA.query(
        'INSERT INTO roles (id, name, active, organization_id) VALUES ($1, $2, true, $3)',
        [roleId, 'Viewer', clientA.organizationId]
      );
      await poolA.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
        [roleId, 'asset.read']
      );
      await poolA.query(
        'INSERT INTO user_roles (user_id, role_id, scope, organization_id) VALUES ($1, $2, $3, $4)',
        [userAId, roleId, 'organization', clientA.organizationId]
      );

      // User A querying Client A succeeds
      const clientARes = await fetch(`${base}/products`, {
        headers: { Cookie: userACookie, 'X-Organization-Id': clientA.organizationId },
      });
      assert.equal(clientARes.status, 200, 'User A should access their authorized client workspace');

      // User A querying Client B fails closed (tenant isolation!)
      const clientBRes = await fetch(`${base}/products`, {
        headers: { Cookie: userACookie, 'X-Organization-Id': clientB.organizationId },
      });
      assert.equal(clientBRes.status, 403, 'User A must NOT be able to access Client B');

      // Suspend Client A and verify User A is blocked immediately
      await platformPool.query("UPDATE organizations SET status = 'suspended' WHERE id = $1", [clientA.organizationId]);
      await closeClientPool(clientA.organizationId);

      const suspendedRes = await fetch(`${base}/products`, {
        headers: { Cookie: userACookie, 'X-Organization-Id': clientA.organizationId },
      });
      assert.equal(suspendedRes.status, 403, 'Suspended client must block requests');
      const suspendedData = await suspendedRes.json();
      assert.match(suspendedData.msg, /suspended/i);

    } finally {
      server.closeAllConnections();
      await new Promise(r => server.close(r));
    }
  });
});
