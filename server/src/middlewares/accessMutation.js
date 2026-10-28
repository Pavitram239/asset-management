import { transaction } from "../../db/pool.js";
import { authorize, resolveGrants, audit } from "../utils/authorization.js";
import { BadRequestError, UnauthorizedError } from "../errors/customErrors.js";
import { assertOwnerContinuity } from '../utils/ownership.js';

const adminCount = async (db, org) =>
  (
    await db.query(
      `SELECT count(DISTINCT m.user_id)::int AS count FROM memberships m JOIN users u ON u.id=m.user_id AND u.active
  WHERE m.organization_id=$1 AND m.active AND (EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id AND r.active
  JOIN role_permissions rp ON rp.role_id=r.id WHERE ur.organization_id=m.organization_id AND ur.user_id=m.user_id AND ur.scope='organization' AND rp.permission_id='access.manage')
  OR EXISTS(SELECT 1 FROM user_permissions up WHERE up.organization_id=m.organization_id AND up.user_id=m.user_id AND up.scope='organization' AND up.permission_id='access.manage'))`,
      [org],
    )
  ).rows[0].count;
// Serialize all access changes per organization and recheck current authorization after acquiring the lock.
export const mutate = (permission, action, operation) => async (req, res) => {
  const result = await transaction(async (db) => {
    await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
      req.user.organizationId,
    ]);
    const membership = await db.query(
      `SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active AND o.active`,
      [req.user.organizationId, req.user.userId],
    );
    if (!membership.rowCount) throw new UnauthorizedError("Membership revoked");
    const actor = {
      ...req.user,
      grants: await resolveGrants(req.user.userId, req.user.organizationId, db),
    };
    authorize(actor, permission);
    const before = await adminCount(db, actor.organizationId);
    const result = await operation(db, actor, req);
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
      req.params.id || result?.id || actor.organizationId,
      metadata,
    );
    return result;
  });
  res.json(result || { ok: true });
};
