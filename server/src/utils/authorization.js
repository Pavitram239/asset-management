import { pool } from "../../db/pool.js";
import { getClientPool } from "../../db/clientPoolManager.js";
import { BadRequestError, UnauthorizedError } from "../errors/customErrors.js";
import { isUUID } from "./accessPolicy.js";

export const PERMISSIONS = Object.freeze([
  "asset.read",
  "asset.create",
  "asset.update",
  "asset.delete",
  "asset.file.read",
  "asset.file.write",
  "directory.read",
  "statistics.read",
  "organization.create",
  "organization.manage",
  "department.manage",
  "membership.manage",
  "role.manage",
  "access.manage",
  "audit.read",
  "ownership.manage",
  "location.manage",
  "category.manage",
  "unit.manage",
  'catalog.read','catalog.manage','catalog.requestable.read','inventory.read','inventory.opening','cost.read','attachment.read','attachment.write','requisition.create','requisition.read','requisition.approve','requisition.fulfill',
]);

const assetPermission = (permission) =>
  permission.startsWith("asset.") ||
  ["directory.read", "statistics.read"].includes(permission);

const businessScoped = new Set(['catalog.read','catalog.manage','catalog.requestable.read','inventory.read','inventory.opening','cost.read','attachment.read','attachment.write','requisition.fulfill']);

export const permissionScopes = permission => assetPermission(permission)?['organization','department','location','self']:
  ['requisition.create','requisition.read'].includes(permission)?['organization','department','self']:
  permission === 'requisition.approve'?['organization','department']:
  businessScoped.has(permission)?['organization','department','location']:['organization'];

export const resolveGrants = async (userId, organizationId, db = pool) => {
  const { rows } = await db.query(
    `SELECT rp.permission_id AS permission, ur.scope, ur.department_code AS department,
            ur.location_id AS "locationId",
            COALESCE((SELECT jsonb_agg(a.descendant_id ORDER BY a.descendant_id) FROM location_ancestry a WHERE (a.organization_id=$2 OR a.organization_id IS NULL) AND a.ancestor_id=ur.location_id),'[]'::jsonb) AS "locationIds"
     FROM user_roles ur 
     JOIN roles r ON r.id=ur.role_id AND r.active
     JOIN role_permissions rp ON rp.role_id=r.id
     LEFT JOIN organization_departments d ON (d.organization_id=$2 OR d.organization_id IS NULL) AND d.code=ur.department_code
     WHERE ur.user_id=$1 AND (ur.organization_id=$2 OR ur.organization_id IS NULL) AND (ur.scope<>'department' OR d.active)
     UNION 
     SELECT up.permission_id, up.scope, up.department_code, up.location_id,
            COALESCE((SELECT jsonb_agg(a.descendant_id ORDER BY a.descendant_id) FROM location_ancestry a WHERE (a.organization_id=$2 OR a.organization_id IS NULL) AND a.ancestor_id=up.location_id),'[]'::jsonb)
     FROM user_permissions up
     LEFT JOIN organization_departments d ON (d.organization_id=$2 OR d.organization_id IS NULL) AND d.code=up.department_code
     WHERE up.user_id=$1 AND (up.organization_id=$2 OR up.organization_id IS NULL) AND (up.scope<>'department' OR d.active)`,
    [userId, organizationId]
  );
  return rows.map(row=>row.scope==='location'?row:({permission:row.permission,scope:row.scope,department:row.department})).filter(
    (grant) =>
      PERMISSIONS.includes(grant.permission) &&
      permissionScopes(grant.permission).includes(grant.scope),
  );
};

export const allows = (actor, permission, resource) => {
  if (
    !actor?.organizationId ||
    !actor?.userId ||
    !PERMISSIONS.includes(permission)
  )
    return false;
  if (resource && resource.organizationId !== actor.organizationId)
    return false;
  return (Array.isArray(actor.grants) ? actor.grants : []).some(
    (grant) =>
      grant.permission === permission &&
      (grant.scope === "organization" ||
        (permissionScopes(permission).includes(grant.scope) &&
          ((grant.scope === "department" &&
            (!resource || resource.department === grant.department)) ||
            (grant.scope === 'location' && (!resource || grant.locationIds?.includes(resource.locationId))) ||
            (grant.scope === "self" &&
              (!resource || resource.assignedToId === actor.userId))))),
  );
};

export const authorize = (actor, permission, resource) => {
  if (!allows(actor, permission, resource))
    throw new UnauthorizedError("Permission denied");
};

// Shared SQL predicate for both collection and object access; values are always bound.
export const assetScope = (actor, permission, alias = "p", start = 0) => {
  const values = [];
  const bind = (value) => {
    values.push(value);
    return `$${start + values.length}`;
  };
  const organization = bind(actor?.organizationId || null);
  const clauses = [];
  for (const grant of actor?.userId &&
  actor?.organizationId &&
  Array.isArray(actor.grants)
    ? actor.grants
    : []) {
    if (grant.permission !== permission || !PERMISSIONS.includes(permission))
      continue;
    if (grant.scope === "organization") {
      clauses.push("TRUE");
      break;
    }
    if (grant.scope === "department")
      clauses.push(`${alias}.department_code=${bind(grant.department)}`);
    if (grant.scope === "self")
      clauses.push(`${alias}.assigned_to_id=${bind(actor.userId)}`);
    if (grant.scope === 'location') clauses.push(`${alias}.location_id IN (SELECT descendant_id FROM location_ancestry WHERE (organization_id IS NULL OR organization_id=${organization}) AND ancestor_id=${bind(grant.locationId)})`);
  }
  return {
    sql: `(${alias}.organization_id IS NULL OR ${alias}.organization_id=${organization}) AND ${alias}.deleted_at IS NULL AND (${clauses.join(" OR ") || "FALSE"})`,
    values,
  };
};

export const organizationContext = async (req, res, next) => {
  const id = req.get("X-Organization-Id");
  if (!isUUID(id))
    throw new BadRequestError(
      "Select an active organization using X-Organization-Id",
    );

  const { rows } = await pool.query(
    `SELECT m.department_code, o.schema_name, o.status, o.database_name, o.provisioning_status
     FROM memberships m 
     JOIN organizations o ON o.id=m.organization_id
     WHERE m.user_id=$1 AND m.organization_id=$2 AND m.active AND o.active`,
    [req.user.userId, id],
  );

  if (!rows.length)
    throw new UnauthorizedError("Organization membership required");

  const orgRecord = rows[0];

  if (orgRecord.status === 'suspended') {
    throw new UnauthorizedError("Client organization is currently suspended");
  }

  if (orgRecord.provisioning_status === 'failed') {
    throw new UnauthorizedError("Client database provisioning failed. Please contact platform administration.");
  }

  const clientDb = await getClientPool(id);
  req.clientPool = clientDb;
  req.clientDb = clientDb;
  req.user.organizationId = id;
  req.user.schemaName = orgRecord.schema_name;
  req.user.department = orgRecord.department_code;
  req.user.grants = await resolveGrants(req.user.userId, id, clientDb);
  next();
};

export const requirePermission = (permission) => (req, res, next) => {
  authorize(req.user, permission);
  next();
};

export const audit = async (db, actor, action, target, metadata = {}) =>
  db.query(
    "INSERT INTO audit_events(organization_id,actor_id,action,target,metadata) VALUES($1,$2,$3,$4,$5)",
    [
      actor.organizationId || null,
      actor.userId || null,
      action,
      String(target),
      JSON.stringify(metadata),
    ],
  );
