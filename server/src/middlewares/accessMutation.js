import { pool, transaction } from "../../db/pool.js";
import { authorize, resolveGrants, audit } from "../utils/authorization.js";
import { BadRequestError, UnauthorizedError } from "../errors/customErrors.js";
import { assertOwnerContinuity } from '../utils/ownership.js';

const adminCount = async (db, org) => {
  const { rows } = await db.query(
    `WITH admins AS (
      SELECT ur.user_id
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id AND r.active
      JOIN role_permissions rp ON rp.role_id = r.id
      JOIN users u ON u.id = ur.user_id AND u.active
      WHERE (ur.organization_id = $1 OR ur.organization_id IS NULL)
        AND ur.scope = 'organization'
        AND rp.permission_id = 'access.manage'
      UNION
      SELECT up.user_id
      FROM user_permissions up
      JOIN users u ON u.id = up.user_id AND u.active
      WHERE (up.organization_id = $1 OR up.organization_id IS NULL)
        AND up.scope = 'organization'
        AND up.permission_id = 'access.manage'
    )
    SELECT count(DISTINCT user_id)::int AS count FROM admins`,
    [org]
  );
  return rows[0]?.count || 0;
};

// Serialize all access changes per organization and recheck current authorization after acquiring the lock.
export const mutate = (permission, action, operation) => async (req, res) => {
  const targetPool = req.clientDb || pool;

  // 1. Check platform membership and organization status first
  const membership = await pool.query(
    `SELECT 1 FROM memberships m 
     JOIN organizations o ON o.id=m.organization_id 
     WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active AND o.active AND o.status != 'suspended'`,
    [req.user.organizationId, req.user.userId],
  );
  if (!membership.rowCount) throw new UnauthorizedError("Membership revoked or organization unavailable");

  // 2. Execute mutation in client database
  const result = await transaction(async (db) => {
    const actor = {
      ...req.user,
      grants: await resolveGrants(req.user.userId, req.user.organizationId, db),
    };
    authorize(actor, permission);
    const before = await adminCount(db, actor.organizationId);

    // If target is a user, sync user identity into client roster first
    const targetUserId = req.params.id || req.body?.userId;
    if (targetUserId) {
      const centralUser = (await pool.query('SELECT id, name, email, active FROM users WHERE id=$1', [targetUserId])).rows[0];
      if (centralUser) {
        await db.query(
          `INSERT INTO users (id, name, email, active)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
          [centralUser.id, centralUser.name, centralUser.email, centralUser.active]
        );
      }
    }

    const opResult = await operation(db, actor, req);

    await assertOwnerContinuity(db, actor.organizationId);

    if (before > 0 && (await adminCount(db, actor.organizationId)) === 0)
      throw new BadRequestError("Cannot remove the last access administrator");

    const metadata = Object.fromEntries(
      [
        "userId",
        "roleId",
        "permission",
        "permissions",
        "scope",
        "department",
        "active",
        "name",
        "code",
        "currency",
        "timeZone",
        "expectedVersion",
      ]
        .filter((k) => Object.hasOwn(req.body || {}, k))
        .map((k) => [k, req.body[k]]),
    );
    await audit(
      db,
      actor,
      action,
      req.params.id || opResult?.id || actor.organizationId,
      metadata,
    );
    return opResult;
  }, targetPool);

  // 3. Coordinated sync to platform memberships if member active status or department was updated
  if (req.params.id && (req.body?.active !== undefined || req.body?.department !== undefined)) {
    await pool.query(
      `UPDATE memberships
       SET active = COALESCE($3, active),
           department_code = COALESCE($4, department_code)
       WHERE organization_id = $1 AND user_id = $2`,
      [req.user.organizationId, req.params.id, req.body.active, req.body.department]
    );
  }

  res.json(result || { ok: true });
};
