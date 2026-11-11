import { pool as platformPool } from '../../db/pool.js';
import { closeClientPool } from '../../db/clientPoolManager.js';
import { provisionClientDatabase, retryClientProvisioning } from '../services/provisioning.js';
import { BadRequestError, NotFoundError } from '../errors/customErrors.js';
import { isUUID } from '../utils/accessPolicy.js';

/**
 * Super Admin audit logger.
 */
const platformAudit = async (actorId, action, targetClientId, metadata = {}) => {
  try {
    await platformPool.query(
      `INSERT INTO platform_audit_events (actor_id, action, target_client_id, metadata)
       VALUES ($1, $2, $3, $4)`,
      [actorId, action, targetClientId, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('Platform audit error:', err.message);
  }
};

/**
 * List all client organizations with status, database name, and admin details.
 * Excludes sensitive credentials.
 */
export const listClients = async (req, res) => {
  const { rows } = await platformPool.query(
    `SELECT 
       o.id,
       o.name,
       o.status,
       o.provisioning_status AS "provisioningStatus",
       o.provisioning_error AS "provisioningError",
       o.database_name AS "databaseName",
       o.currency,
       o.time_zone AS "timeZone",
       o.created_at AS "createdAt",
       o.updated_at AS "updatedAt",
       (SELECT count(*) FROM memberships m WHERE m.organization_id = o.id AND m.active)::int AS "memberCount",
       (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = o.id LIMIT 1) AS "adminEmail"
     FROM organizations o
     ORDER BY o.created_at DESC`
  );

  res.status(200).json({ clients: rows });
};

/**
 * Get single client organization details.
 */
export const getClient = async (req, res) => {
  const { id } = req.params;
  if (!isUUID(id)) throw new BadRequestError('Invalid client organization ID');

  const { rows } = await platformPool.query(
    `SELECT 
       o.id,
       o.name,
       o.status,
       o.provisioning_status AS "provisioningStatus",
       o.provisioning_error AS "provisioningError",
       o.database_name AS "databaseName",
       o.currency,
       o.time_zone AS "timeZone",
       o.created_at AS "createdAt",
       o.updated_at AS "updatedAt",
       (SELECT count(*) FROM memberships m WHERE m.organization_id = o.id AND m.active)::int AS "memberCount",
       (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = o.id LIMIT 1) AS "adminEmail"
     FROM organizations o
     WHERE o.id = $1`,
    [id]
  );

  if (!rows.length) throw new NotFoundError('Client organization not found');

  // Also fetch platform audit history for this client
  const { rows: audits } = await platformPool.query(
    `SELECT id, action, outcome, metadata, created_at AS "createdAt"
     FROM platform_audit_events
     WHERE target_client_id = $1
     ORDER BY created_at DESC LIMIT 20`,
    [id]
  );

  res.status(200).json({ client: rows[0], auditLog: audits });
};

/**
 * Super Admin initiates creation and provisioning of a new client.
 */
export const createClient = async (req, res) => {
  const { name, adminEmail, adminName, currency = 'USD', timeZone = 'UTC' } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    throw new BadRequestError('Client company name must be at least 2 characters');
  }

  if (adminEmail && (!/^\S+@\S+\.\S+$/.test(adminEmail))) {
    throw new BadRequestError('Valid administrator email is required');
  }

  const result = await provisionClientDatabase({
    name: name.trim(),
    adminEmail,
    adminName,
    currency,
    timeZone,
  });

  await platformAudit(req.user.userId, 'client.create_and_provision', result.organizationId, {
    clientName: name,
    databaseName: result.databaseName,
    adminEmail,
  });

  res.status(201).json({
    msg: 'Client created and database provisioned successfully',
    client: {
      id: result.organizationId,
      name: result.name,
      databaseName: result.databaseName,
      status: 'active',
      provisioningStatus: 'provisioned',
    },
    adminSetupToken: result.admin?.setupToken || null,
  });
};

/**
 * Retries failed provisioning safely.
 */
export const retryProvisioning = async (req, res) => {
  const { id } = req.params;
  if (!isUUID(id)) throw new BadRequestError('Invalid client organization ID');

  const result = await retryClientProvisioning(id);

  await platformAudit(req.user.userId, 'client.retry_provisioning', id, { result });

  res.status(200).json({
    msg: 'Client provisioning retried successfully',
    result,
  });
};

/**
 * Suspend an active client.
 * Immediately drains client connection pool and updates status to 'suspended'.
 */
export const suspendClient = async (req, res) => {
  const { id } = req.params;
  const { reason = 'Suspended by platform administrator' } = req.body || {};
  if (!isUUID(id)) throw new BadRequestError('Invalid client organization ID');

  const { rowCount } = await platformPool.query(
    `UPDATE organizations
     SET status = 'suspended', updated_at = now()
     WHERE id = $1 AND status != 'suspended'`,
    [id]
  );

  if (!rowCount) {
    throw new BadRequestError('Client organization not found or already suspended');
  }

  // Drain and close active connections for this client
  await closeClientPool(id);

  await platformAudit(req.user.userId, 'client.suspend', id, { reason });

  res.status(200).json({ msg: 'Client organization suspended successfully' });
};

/**
 * Reactivate a suspended client.
 */
export const reactivateClient = async (req, res) => {
  const { id } = req.params;
  if (!isUUID(id)) throw new BadRequestError('Invalid client organization ID');

  const { rowCount } = await platformPool.query(
    `UPDATE organizations
     SET status = 'active', updated_at = now()
     WHERE id = $1 AND status = 'suspended'`,
    [id]
  );

  if (!rowCount) {
    throw new BadRequestError('Client organization not found or is not suspended');
  }

  await platformAudit(req.user.userId, 'client.reactivate', id);

  res.status(200).json({ msg: 'Client organization reactivated successfully' });
};
