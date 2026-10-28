import { pool } from "../../db/pool.js";
import { authorize, resolveGrants } from "./authorization.js";
import { BadRequestError, UnauthorizedError } from "../errors/customErrors.js";
import { isUUID } from "./accessPolicy.js";
export const lockActor = async (db, actor, permission) => {
  await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
    actor.organizationId,
  ]);
  const result = await db.query(
    `SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id AND o.active
    JOIN users u ON u.id=m.user_id AND u.active WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active`,
    [actor.organizationId, actor.userId],
  );
  if (!result.rowCount) throw new UnauthorizedError("Membership revoked");
  const current = {
    ...actor,
    grants: await resolveGrants(actor.userId, actor.organizationId, db),
  };
  authorize(current, permission);
  return current;
};
export const validateDestination = async (
  input,
  actor,
  permission,
  previous,
  db = pool,
) => {
  const department = input.department || previous?.department;
  const result = await db.query(
    "SELECT 1 FROM organization_departments WHERE organization_id=$1 AND code=$2 AND active",
    [actor.organizationId, department],
  );
  if (!result.rowCount) throw new BadRequestError("Active department required");
  const assignedToId =
    "assignedToId" in input
      ? input.assignedToId || null
      : previous?.assignedToId;
  authorize(actor, permission, {
    organizationId: actor.organizationId,
    department,
    assignedToId,
    locationId: previous?.locationId || null,
  });
  if (assignedToId) {
    if (!isUUID(assignedToId))
      throw new BadRequestError("Invalid assigned user");
    const member = await db.query(
      `SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id AND u.active WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active AND m.department_code=$3`,
      [actor.organizationId, assignedToId, department],
    );
    if (!member.rowCount)
      throw new BadRequestError(
        "Assigned user must be an active member of the asset department",
      );
  }
};
