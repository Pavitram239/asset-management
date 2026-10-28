import { isUUID } from "./accessPolicy.js";
import { PERMISSIONS } from "./authorization.js";
import {
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
} from "../errors/customErrors.js";

export const text = (value, max = 200) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new BadRequestError("Invalid text value");
  return value.trim();
};
export const uuid = (value) => {
  if (!isUUID(value)) throw new BadRequestError("Invalid reference");
  return value;
};
export const boolean = (value) => {
  if (typeof value !== "boolean") throw new BadRequestError("Expected boolean");
  return value;
};
export const requireRow = (result) => {
  if (!result.rowCount) throw new NotFoundError("Record not found");
  return result.rows[0];
};
export const rejectSelf = (actor, id) => {
  if (id === actor.userId)
    throw new UnauthorizedError("Cannot change your own access");
};
export const permissionList = (value) => {
  if (
    !Array.isArray(value) ||
    value.length > PERMISSIONS.length ||
    value.some((p) => !PERMISSIONS.includes(p))
  )
    throw new BadRequestError("Unknown permission");
  return [...new Set(value)];
};
export const scopeInput = (body) => {
  if (!["organization", "department", "location", "self"].includes(body.scope))
    throw new BadRequestError("Invalid scope");
  if (body.scope === 'location') {
    if(body.department)throw new BadRequestError('Choose one scope reference');
    return [body.scope,null,uuid(body.locationId)];
  }
  if(body.locationId)throw new BadRequestError('Location requires location scope');
  if (body.scope === "department")
    return [body.scope, text(body.department, 100)];
  if (body.department)
    throw new BadRequestError("Department requires department scope");
  return [body.scope, null];
};

export const activeDepartment = async (db, organizationId, department) => {
  if (!department) return;
  const result = await db.query(
    "SELECT 1 FROM organization_departments WHERE organization_id=$1 AND code=$2 AND active",
    [organizationId, department],
  );
  if (!result.rowCount)
    throw new BadRequestError("Active organization department required");
};
export const grantTarget = async (db, actor, userId, department, locationId) => {
  const result = await db.query(
    `SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id AND u.active WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active`,
    [actor.organizationId, userId],
  );
  if (!result.rowCount)
    throw new BadRequestError("Active organization member required");
  await activeDepartment(db, actor.organizationId, department);
  if(locationId){const {activeLocation}=await import('../services/configuration.js');await activeLocation(db,actor.organizationId,locationId);}
};
