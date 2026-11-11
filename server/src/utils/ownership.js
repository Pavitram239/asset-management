import { authorize } from './authorization.js';
import { UnauthorizedError, BadRequestError } from '../errors/customErrors.js';
import { conflict } from './commands.js';
import { pool } from '../../db/pool.js';

export const requireOwner = async (db, actor) => {
  const active = (await db.query(
    `SELECT 1 FROM organization_owners own
     JOIN users u ON u.id = own.user_id
     WHERE own.organization_id = $1 AND own.user_id = $2 AND u.active`,
    [actor.organizationId, actor.userId]
  )).rowCount;
  if (!active) throw new UnauthorizedError('Only a protected company owner can manage ownership');
  authorize(actor, 'ownership.manage');
};

export const ownerCount = async (db, organizationId) => {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n 
     FROM organization_owners own
     JOIN users u ON u.id = own.user_id
     WHERE own.organization_id = $1 AND u.active`,
    [organizationId]
  );
  return Number(rows[0]?.n || 0);
};

export const assertOwnerContinuity = async (db, organizationId) => {
  const count = await ownerCount(db, organizationId);
  if (count === 0) {
    throw conflict('LAST_OWNER', 'Appoint another active owner before removing the last owner');
  }
};

export const workspaceDto = async (db, organizationId) => {
  const company = (await pool.query(
    'SELECT id, name, version, currency, time_zone, active FROM organizations WHERE id = $1',
    [organizationId]
  )).rows[0];
  if (!company) throw new BadRequestError('Workspace unavailable');
  const ownerRows = (await db.query(
    'SELECT user_id FROM organization_owners WHERE organization_id = $1 ORDER BY user_id',
    [organizationId]
  )).rows;
  return {
    id: company.id,
    name: company.name,
    version: Number(company.version),
    currency: company.currency,
    timeZone: company.time_zone,
    status: company.active ? 'active' : 'inactive',
    ownerUserIds: ownerRows.map(r => r.user_id),
  };
};

export const reviewLegacyOwner = async (db, organizationId, userId, actorId = userId) => {
  const company = (await pool.query(
    'SELECT id, ownership_activated_at FROM organizations WHERE id = $1 AND active FOR UPDATE',
    [organizationId]
  )).rows[0];
  if (!company) throw new BadRequestError('Active workspace required');
  if (company.ownership_activated_at) throw new BadRequestError('Ownership is already reviewed; use owner appointment instead');
  
  await db.query(
    'INSERT INTO organization_owners(organization_id, user_id, created_by) VALUES ($1, $2, $3) ON CONFLICT (organization_id, user_id) DO NOTHING',
    [organizationId, userId, actorId]
  );
  await db.query(
    "INSERT INTO user_permissions(organization_id, user_id, permission_id, scope) VALUES ($1, $2, 'ownership.manage', 'organization') ON CONFLICT DO NOTHING",
    [organizationId, userId]
  );
  await pool.query(
    'UPDATE organizations SET ownership_activated_at = now(), version = version + 1 WHERE id = $1',
    [organizationId]
  );
};
