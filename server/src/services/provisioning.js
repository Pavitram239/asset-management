import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import { pool as platformPool } from '../../db/pool.js';
import { getClientPool } from '../../db/clientPoolManager.js';
import { PERMISSIONS } from '../utils/authorization.js';
import { enqueueDelivery } from './outbox.js';
import { identityConfiguration } from './identity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

/**
 * Resolves connection string for privileged DDL operations (e.g. CREATE DATABASE).
 * Defaults to PROVISIONING_DATABASE_URL or derives from DATABASE_URL connecting to "postgres".
 */
export const getPrivilegedAdminUrl = () => {
  if (process.env.PROVISIONING_DATABASE_URL) {
    return process.env.PROVISIONING_DATABASE_URL;
  }
  const appUrl = process.env.DATABASE_URL;
  if (!appUrl) throw new Error('DATABASE_URL is not set');

  const parsed = new URL(appUrl);
  parsed.pathname = '/postgres';
  return parsed.toString();
};

/**
 * Sanitizes and generates a safe, valid PostgreSQL database name.
 */
export const generateClientDatabaseName = (name, orgId) => {
  const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 20).replace(/^_|_$/g, '') || 'client';
  const suffix = (orgId || randomUUID()).replace(/-/g, '').slice(0, 8);
  return `client_asset_${clean}_${suffix}`;
};

/**
 * Creates physical PostgreSQL database if it does not already exist.
 */
export const ensureDatabaseExists = async (databaseName) => {
  // Validate database name identifier strictly to avoid SQL injection
  if (!/^[a-zA-Z0-9_]{3,63}$/.test(databaseName)) {
    throw new Error(`Invalid database name identifier: ${databaseName}`);
  }

  const adminUrl = getPrivilegedAdminUrl();
  const adminClient = new pg.Client({ connectionString: adminUrl });
  await adminClient.connect();

  try {
    const { rows } = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName]
    );

    if (rows.length === 0) {
      // DDL requires identifier interpolation
      await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await adminClient.end();
  }
};

/**
 * Applies the client DDL schema to the client database.
 */
export const applyClientSchema = async (clientDbPool) => {
  const schemaPath = resolve(__dirname, '../../db/clientSchema.sql');
  const ddl = readFileSync(schemaPath, 'utf8');

  const client = await clientDbPool.connect();
  try {
    await client.query(ddl);
  } finally {
    client.release();
  }
};

/**
 * Seeds initial roles, permissions, departments, and location into the client database.
 */
export const seedClientDatabaseDefaults = async (clientDbPool, orgId, adminUserId) => {
  const client = await clientDbPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Starter Location
    const locRes = await client.query('SELECT id FROM locations LIMIT 1');
    let locId = locRes.rows[0]?.id;
    if (!locId) {
      locId = randomUUID();
      await client.query(
        `INSERT INTO locations (id, name, kind, active, organization_id)
         VALUES ($1, 'Main Premises / Head Office', 'branch', true, $2)`,
        [locId, orgId]
      );
      await client.query(
        `INSERT INTO location_ancestry (ancestor_id, descendant_id, depth, organization_id)
         VALUES ($1, $1, 0, $2)`,
        [locId, orgId]
      );
    }

    // 2. Starter Departments
    const depts = [
      { code: 'ADMIN', name: 'Administration' },
      { code: 'OPERATIONS', name: 'Operations' },
    ];
    for (const d of depts) {
      await client.query(
        `INSERT INTO organization_departments (code, name, active, organization_id)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (code) DO NOTHING`,
        [d.code, d.name, orgId]
      );
    }

    // 3. Roles
    const rolesToCreate = [
      { name: 'Organization owner', perms: PERMISSIONS },
      { name: 'Administrator', perms: PERMISSIONS.filter(p => !['ownership.manage', 'organization.create'].includes(p)) },
      { name: 'Asset manager', perms: ['asset.read', 'asset.create', 'asset.update', 'asset.delete', 'catalog.read', 'catalog.manage', 'inventory.read', 'inventory.opening', 'requisition.read', 'requisition.approve', 'requisition.fulfill'] },
      { name: 'Employee', perms: ['asset.read', 'asset.file.read', 'requisition.create', 'requisition.read'] },
    ];

    let ownerRoleId = null;
    for (const r of rolesToCreate) {
      const existing = (await client.query('SELECT id FROM roles WHERE name = $1 AND (organization_id = $2 OR organization_id IS NULL)', [r.name, orgId])).rows[0];
      let roleId = existing?.id;
      if (!roleId) {
        roleId = randomUUID();
        await client.query(
          `INSERT INTO roles (id, name, active, organization_id)
           VALUES ($1, $2, true, $3)`,
          [roleId, r.name, orgId]
        );
      }
      if (r.name === 'Organization owner') {
        ownerRoleId = roleId;
      }

      // Seed permissions for role
      for (const p of r.perms) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [roleId, p]
        );
      }
    }

    // 4. Assign Owner Role to admin user in the client database if provided
    if (adminUserId) {
      // Sync local roster info for joins without cross-db queries
      const userRow = (await platformPool.query('SELECT name, email FROM users WHERE id = $1', [adminUserId])).rows[0];
      if (userRow) {
        await client.query(
          `INSERT INTO users (id, name, email, active)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
          [adminUserId, userRow.name, userRow.email]
        );
      }

      if (ownerRoleId) {
        const userRoleExists = (await client.query(
          'SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = $2',
          [adminUserId, ownerRoleId]
        )).rowCount > 0;

        if (!userRoleExists) {
          await client.query(
            `INSERT INTO user_roles (user_id, role_id, scope, organization_id)
             VALUES ($1, $2, 'organization', $3)`,
            [adminUserId, ownerRoleId, orgId]
          );
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Creates or retrieves the administrator user in the platform database and issues an invitation.
 */
export const setupClientAdminUser = async (platformClient, orgId, adminEmail, adminName) => {
  const email = adminEmail.trim().toLowerCase();
  let user = (await platformClient.query('SELECT id, email, active FROM users WHERE email = $1', [email])).rows[0];

  if (!user) {
    const newUserId = randomUUID();
    const { rows } = await platformClient.query(
      `INSERT INTO users (id, name, email, password_hash, active, email_verified_at)
       VALUES ($1, $2, $3, 'INVITED_SETUP_PENDING', true, now())
       RETURNING id, email, active`,
      [newUserId, adminName || 'Client Administrator', email]
    );
    user = rows[0];
  }

  // Ensure membership in platform DB
  await platformClient.query(
    `INSERT INTO memberships (organization_id, user_id, active)
     VALUES ($1, $2, true)
     ON CONFLICT (organization_id, user_id) DO UPDATE SET active = true`,
    [orgId, user.id]
  );

  // Check if an invitation token is needed (if user hasn't set password or explicitly invited)
  const token = randomBytes(32).toString('base64url');
  const tokenHashVal = tokenHash(token);
  const origin = identityConfiguration();
  const invitationId = randomUUID();
  const expiresAt = (await platformClient.query("SELECT clock_timestamp() + interval '7 days' AS expiry")).rows[0].expiry;

  // Record invitation for setup flow
  const outboxId = await enqueueDelivery(platformClient, {
    topic: 'company.invitation',
    key: `admin-setup:${invitationId}`,
    payload: {
      invitationId,
      organizationId: orgId,
      email,
      token,
      origin,
      isInitialAdmin: true,
    },
    expiresAt,
  });

  await platformClient.query(
    `INSERT INTO organization_invitations (id, organization_id, email, inviter_id, token_hash, outbox_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [invitationId, orgId, email, user.id, tokenHashVal, outboxId, expiresAt]
  );

  return { userId: user.id, email: user.email, setupToken: token, invitationId };
};

/**
 * Orchestrates full, recoverable client database provisioning.
 */
export const provisionClientDatabase = async ({
  name,
  adminEmail,
  adminName,
  currency = 'USD',
  timeZone = 'UTC',
  customDatabaseName = null,
}) => {
  const orgId = randomUUID();
  const databaseName = customDatabaseName || generateClientDatabaseName(name, orgId);

  // 1. Register organization in platform database with 'provisioning' status
  const client = await platformPool.connect();
  try {
    await client.query('BEGIN');

    const schemaName = 'tenant_' + orgId.replace(/-/g, '').slice(0, 12);
    const { rows } = await client.query(
      `INSERT INTO organizations (id, name, schema_name, database_name, status, provisioning_status, currency, time_zone)
       VALUES ($1, $2, $3, $4, 'provisioning', 'provisioning', $5, $6)
       RETURNING *`,
      [orgId, name, schemaName, databaseName, currency, timeZone]
    );
    const org = rows[0];

    // Setup admin user & membership in platform DB
    let adminResult = null;
    if (adminEmail) {
      adminResult = await setupClientAdminUser(client, orgId, adminEmail, adminName);
    }

    await client.query('COMMIT');

    // 2. Provision dedicated database
    try {
      await ensureDatabaseExists(databaseName);
      const clientPool = await getClientPool(orgId);
      await applyClientSchema(clientPool);
      await seedClientDatabaseDefaults(clientPool, orgId, adminResult?.userId);

      // 3. Mark client as active & fully provisioned
      await platformPool.query(
        `UPDATE organizations
         SET status = 'active', provisioning_status = 'provisioned', provisioning_error = NULL, updated_at = now()
         WHERE id = $1`,
        [orgId]
      );

      return {
        success: true,
        organizationId: orgId,
        name,
        databaseName,
        admin: adminResult,
      };
    } catch (provisionErr) {
      console.error(`Provisioning step failed for ${name} [${databaseName}]:`, provisionErr.message);
      await platformPool.query(
        `UPDATE organizations
         SET status = 'failed', provisioning_status = 'failed', provisioning_error = $2, updated_at = now()
         WHERE id = $1`,
        [orgId, provisionErr.message]
      );
      throw provisionErr;
    }
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Safe and idempotent retry for failed client provisioning.
 */
export const retryClientProvisioning = async (organizationId) => {
  const { rows } = await platformPool.query(
    'SELECT * FROM organizations WHERE id = $1',
    [organizationId]
  );
  const org = rows[0];
  if (!org) throw new Error('Client organization not found');

  // Mark status as provisioning
  await platformPool.query(
    `UPDATE organizations
     SET status = 'provisioning', provisioning_status = 'provisioning', provisioning_error = NULL
     WHERE id = $1`,
    [organizationId]
  );

  try {
    const databaseName = org.database_name || generateClientDatabaseName(org.name, org.id);
    if (!org.database_name) {
      await platformPool.query('UPDATE organizations SET database_name = $1 WHERE id = $2', [databaseName, organizationId]);
    }

    // Idempotent database creation and schema application
    await ensureDatabaseExists(databaseName);
    const clientPool = await getClientPool(organizationId);
    await applyClientSchema(clientPool);

    // Find admin user if present
    const memberRow = (await platformPool.query(
      `SELECT m.user_id FROM memberships m WHERE m.organization_id = $1 LIMIT 1`,
      [organizationId]
    )).rows[0];

    await seedClientDatabaseDefaults(clientPool, organizationId, memberRow?.user_id);

    // Mark provisioned
    await platformPool.query(
      `UPDATE organizations
       SET status = 'active', provisioning_status = 'provisioned', provisioning_error = NULL, updated_at = now()
       WHERE id = $1`,
      [organizationId]
    );

    return { success: true, organizationId, status: 'active', provisioningStatus: 'provisioned' };
  } catch (err) {
    console.error(`Retry provisioning failed for ${org.name}:`, err.message);
    await platformPool.query(
      `UPDATE organizations
       SET status = 'failed', provisioning_status = 'failed', provisioning_error = $2, updated_at = now()
       WHERE id = $1`,
      [organizationId, err.message]
    );
    throw err;
  }
};
