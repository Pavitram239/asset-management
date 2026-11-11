import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import { pool as platformPool, transaction } from '../../db/pool.js';
import { getClientPool, getBaseDatabaseUrl } from '../../db/clientPoolManager.js';
import { runClientMigrations } from '../../db/clientMigrator.js';
import { PERMISSIONS } from '../utils/authorization.js';
import { enqueueDelivery, cancelDelivery } from './outbox.js';
import { identityConfiguration } from './identity.js';
import { conflict } from '../utils/commands.js';
import { BadRequestError } from '../errors/customErrors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

/**
 * Resolves connection string for privileged DDL operations (e.g. CREATE DATABASE).
 * Defaults to PROVISIONING_DATABASE_URL or derives from DATABASE_URL / PG* connecting to "postgres".
 */
export const getPrivilegedAdminUrl = () => {
  if (process.env.PROVISIONING_DATABASE_URL) {
    return process.env.PROVISIONING_DATABASE_URL;
  }
  const appUrl = getBaseDatabaseUrl();
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
      await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await adminClient.end();
  }
};

/**
 * Applies versioned client schema migrations to the client database.
 */
export const applyClientSchema = async (clientDbPool) => {
  return runClientMigrations(clientDbPool);
};

/**
 * Seeds initial roles, permissions, departments, and location into the client database.
 * Designed to be idempotent: never overwrites customized roles or re-inserts revoked grants.
 */
export const seedClientDatabaseDefaults = async (clientDbPool, orgId, adminUserId) => {
  const client = await clientDbPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Starter Location (only if none exists)
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

    // 3. Starter Roles
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

      // Seed default permissions for starter roles (DO NOTHING if already present)
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
      const userRow = (await platformPool.query('SELECT name, email, active FROM users WHERE id = $1', [adminUserId])).rows[0];
      if (userRow) {
        await client.query(
          `INSERT INTO users (id, name, email, active)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
          [adminUserId, userRow.name, userRow.email, userRow.active]
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
 * Creates or retrieves the administrator user in the platform database and issues an expiring setup token.
 * Never leaks the setup token to API responses or logs.
 */
export const setupClientAdminUser = async (platformClient, orgId, adminEmail, adminName) => {
  const email = adminEmail.trim().toLowerCase();
  let user = (await platformClient.query('SELECT id, email, active, password_hash FROM users WHERE email = $1', [email])).rows[0];

  if (!user) {
    const newUserId = randomUUID();
    const { rows } = await platformClient.query(
      `INSERT INTO users (id, name, email, password_hash, active, email_verified_at)
       VALUES ($1, $2, $3, '!SETUP_PENDING', true, NULL)
       RETURNING id, email, active`,
      [newUserId, adminName || 'Client Administrator', email]
    );
    user = rows[0];
  } else {
    if (!user.active) {
      throw new BadRequestError('Designated administrator user account is inactive. Please contact platform administration.');
    }
  }

  // Record initial admin on organization
  await platformClient.query(
    `UPDATE organizations 
     SET initial_admin_email = $2, initial_admin_id = $3
     WHERE id = $1`,
    [orgId, email, user.id]
  );

  // Inactive membership until setup is accepted
  await platformClient.query(
    `INSERT INTO memberships (organization_id, user_id, active)
     VALUES ($1, $2, false)
     ON CONFLICT (organization_id, user_id) DO NOTHING`,
    [orgId, user.id]
  );

  // Revoke any previous unconsumed setup tokens for this organization
  const { rows: revoked } = await platformClient.query(
    `UPDATE client_setup_tokens
     SET revoked_at = clock_timestamp()
     WHERE organization_id = $1 AND email = $2 AND consumed_at IS NULL AND revoked_at IS NULL
     RETURNING outbox_id`,
    [orgId, email]
  );
  for (const r of revoked) {
    if (r.outbox_id) await cancelDelivery(platformClient, r.outbox_id);
  }

  // Issue secure setup token (7 day expiry)
  const token = randomBytes(32).toString('base64url');
  const tokenHashVal = tokenHash(token);
  const origin = identityConfiguration();
  const setupId = randomUUID();
  const expiresAt = (await platformClient.query("SELECT clock_timestamp() + interval '7 days' AS expiry")).rows[0].expiry;

  const outboxId = await enqueueDelivery(platformClient, {
    topic: 'client.admin_setup',
    key: `admin-setup:${setupId}`,
    payload: {
      setupId,
      organizationId: orgId,
      email,
      token,
      origin,
    },
    expiresAt,
  });

  await platformClient.query(
    `INSERT INTO client_setup_tokens (id, organization_id, email, token_hash, outbox_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [setupId, orgId, email, tokenHashVal, outboxId, expiresAt]
  );

  return { userId: user.id, email: user.email, setupInvitationPending: true };
};

/**
 * Orchestrates full, recoverable, idempotent client database provisioning.
 */
export const provisionClientDatabase = async ({
  name,
  adminEmail,
  adminName,
  currency = 'USD',
  timeZone = 'UTC',
  customDatabaseName = null,
  idempotencyKey = null,
  requestHash = null,
  actorId = null,
}) => {
  // If idempotency key provided, check for prior command in platform DB
  if (idempotencyKey && actorId) {
    const prior = (await platformPool.query(
      `SELECT * FROM api_commands 
       WHERE actor_id = $1 AND organization_id IS NULL AND operation_id = 'createClient' AND idempotency_key = $2`,
      [actorId, idempotencyKey]
    )).rows[0];

    if (prior) {
      if (prior.request_hash !== requestHash) {
        throw conflict('IDEMPOTENCY_MISMATCH', 'This idempotency key already identifies a different client creation request');
      }
      if (prior.committed_at && prior.result?.data) {
        return { ...prior.result.data, replayed: true };
      }
    }
  }

  const orgId = randomUUID();
  const databaseName = customDatabaseName || generateClientDatabaseName(name, orgId);

  // 1. Register organization in platform database with 'provisioning' status
  const client = await platformPool.connect();
  let adminResult = null;
  try {
    await client.query('BEGIN');

    // Register idempotency command record if provided
    if (idempotencyKey && actorId) {
      await client.query(
        `INSERT INTO api_commands (actor_id, organization_id, operation_id, idempotency_key, request_hash)
         VALUES ($1, NULL, 'createClient', $2, $3)
         ON CONFLICT DO NOTHING`,
        [actorId, idempotencyKey, requestHash]
      );
    }

    const schemaName = 'tenant_' + orgId.replace(/-/g, '').slice(0, 12);
    const { rows } = await client.query(
      `INSERT INTO organizations (id, name, schema_name, database_name, status, provisioning_status, currency, time_zone, initial_admin_email)
       VALUES ($1, $2, $3, $4, 'provisioning', 'provisioning', $5, $6, $7)
       RETURNING *`,
      [orgId, name, schemaName, databaseName, currency, timeZone, adminEmail ? adminEmail.trim().toLowerCase() : null]
    );
    const org = rows[0];

    // Setup admin user & inactive membership in platform DB with expiring setup link
    if (adminEmail) {
      adminResult = await setupClientAdminUser(client, orgId, adminEmail, adminName);
    }

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }

  // 2. Provision dedicated database
  try {
    await ensureDatabaseExists(databaseName);
    const clientPool = await getClientPool(orgId, { internalProvisioning: true });
    await runClientMigrations(clientPool);
    await seedClientDatabaseDefaults(clientPool, orgId, adminResult?.userId);

    // 3. Mark client as active & fully provisioned
    await platformPool.query(
      `UPDATE organizations
       SET status = 'active', provisioning_status = 'provisioned', provisioning_error = NULL, updated_at = now()
       WHERE id = $1`,
      [orgId]
    );

    const clientData = {
      success: true,
      organizationId: orgId,
      name,
      databaseName,
      status: 'active',
      provisioningStatus: 'provisioned',
      admin: adminResult,
    };

    // Commit idempotency command record if present
    if (idempotencyKey && actorId) {
      await platformPool.query(
        `UPDATE api_commands
         SET resource_type = 'client_organization',
             resource_id = $2,
             result = $3,
             committed_at = clock_timestamp()
         WHERE actor_id = $1 AND organization_id IS NULL AND operation_id = 'createClient' AND idempotency_key = $4`,
        [actorId, orgId, JSON.stringify({ data: clientData }), idempotencyKey]
      );
    }

    return clientData;
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
};

/**
 * Safe, serialized and restricted retry for failed client provisioning.
 */
export const retryClientProvisioning = async (organizationId) => {
  const client = await platformPool.connect();
  let org;
  try {
    await client.query('BEGIN');

    // Serialize concurrent retries with row lock
    const { rows } = await client.query(
      'SELECT * FROM organizations WHERE id = $1 FOR UPDATE',
      [organizationId]
    );
    org = rows[0];
    if (!org) throw new BadRequestError('Client organization not found');

    if (org.status === 'suspended') {
      throw new BadRequestError('Cannot retry provisioning on a suspended client organization');
    }

    if (org.status === 'active' && org.provisioning_status === 'provisioned') {
      await client.query('COMMIT');
      return { success: true, organizationId, status: 'active', provisioningStatus: 'provisioned', alreadyProvisioned: true };
    }

    if (!['failed', 'provisioning', 'pending'].includes(org.provisioning_status)) {
      throw new BadRequestError(`Cannot retry provisioning for organization in status '${org.provisioning_status}'`);
    }

    // Mark status as provisioning
    await client.query(
      `UPDATE organizations
       SET status = 'provisioning', provisioning_status = 'provisioning', provisioning_error = NULL, updated_at = now()
       WHERE id = $1`,
      [organizationId]
    );

    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }

  try {
    const databaseName = org.database_name || generateClientDatabaseName(org.name, org.id);
    if (!org.database_name) {
      await platformPool.query('UPDATE organizations SET database_name = $1 WHERE id = $2', [databaseName, organizationId]);
    }

    // Idempotent database creation and versioned schema migration
    await ensureDatabaseExists(databaseName);
    const clientPool = await getClientPool(organizationId, { internalProvisioning: true });
    await runClientMigrations(clientPool);

    // Explicit admin user resolution: never infer from LIMIT 1 of memberships!
    let adminUserId = org.initial_admin_id;
    if (!adminUserId && org.initial_admin_email) {
      const u = (await platformPool.query('SELECT id FROM users WHERE email = $1', [org.initial_admin_email])).rows[0];
      adminUserId = u?.id || null;
    }

    await seedClientDatabaseDefaults(clientPool, organizationId, adminUserId);

    // Mark provisioned & active
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

/**
 * Delivery worker mail renderer for initial client administrator setup links.
 */
export const adminSetupRenderer = {
  'client.admin_setup': async (payload, { event }) => {
    const row = (await platformPool.query(
      `SELECT t.*, o.name AS organization_name, o.status AS organization_status
       FROM client_setup_tokens t
       JOIN organizations o ON o.id = t.organization_id
       WHERE t.id = $1 AND t.token_hash = $2 AND t.outbox_id = $3
         AND t.consumed_at IS NULL AND t.revoked_at IS NULL AND t.expires_at > clock_timestamp()`,
      [payload.setupId, tokenHash(payload.token), event.id]
    )).rows[0];

    if (!row || row.organization_status === 'suspended') return null;

    return {
      to: row.email,
      subject: `Complete your administrator setup for ${row.organization_name}`,
      text: `You have been appointed as the client administrator for ${row.organization_name}.\nTo verify your email and complete your setup, open this link:\n${payload.origin}/setup-admin#${payload.token}\nThis link expires in 7 days and can only be used once. If you did not expect this message, please ignore it.`
    };
  }
};
