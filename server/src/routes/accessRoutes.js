import { Router } from "express";
import { pool } from "../../db/pool.js";
import {
  organizationContext,
  authorize,
  allows,
  resolveGrants,
  PERMISSIONS,
} from "../utils/authorization.js";
import { uuid, requireRow } from "../utils/accessInput.js";
import { BadRequestError } from "../errors/customErrors.js";
import { checkForTestUser } from "../middlewares/authMiddleware.js";
import { sharedRateLimit } from "../middlewares/sharedRateLimit.js";
import organizationManagementRouter from "./organizationManagementRoutes.js";
import roleManagementRouter from "./roleManagementRoutes.js";

const router = Router();
router.get("/organizations", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.id,o.name FROM organizations o JOIN memberships m ON m.organization_id=o.id WHERE m.user_id=$1 AND m.active AND o.active ORDER BY o.name`,
    [req.user.userId],
  );
  res.json({ organizations: rows });
});
router.use(organizationContext);
router.get("/effective", async (req, res) =>
  res.json({
    organizationId: req.user.organizationId,
    grants: req.user.grants,
  }),
);
router.get("/management", async (req, res) => {
  const actor = req.user,
    org = actor.organizationId;
  const read = async (permission, sql) =>
    allows(actor, permission) ||
    (["role.manage", "membership.manage", "department.manage"].includes(
      permission,
    ) &&
      allows(actor, "access.manage")) ||
    (permission === "department.manage" && ['membership.manage','catalog.manage','inventory.opening'].some(code=>allows(actor,code)))
      ? (await pool.query(sql, [org])).rows
      : [];
  res.json({
    permissions: PERMISSIONS,
    grants: actor.grants,
    organization: (
      await pool.query('SELECT id,name,active,currency,time_zone AS "timeZone",version::float8 AS version,ownership_activated_at AS "ownershipActivatedAt" FROM organizations WHERE id=$1', [
        org,
      ])
    ).rows[0],
    departments: await read(
      "department.manage",
      "SELECT code,name,active FROM organization_departments WHERE organization_id=$1 ORDER BY name",
    ),
    locations: allows(actor,'access.manage') || allows(actor,'location.manage') ? (await pool.query('SELECT id,name,active,parent_id AS "parentId" FROM locations WHERE organization_id=$1 ORDER BY name',[org])).rows : [],
    roles: await read(
      "role.manage",
      `SELECT r.*,COALESCE((SELECT json_agg(permission_id ORDER BY permission_id) FROM role_permissions WHERE role_id=r.id),'[]') AS permissions FROM roles r WHERE organization_id=$1 ORDER BY name`,
    ),
    memberships: await read(
      "membership.manage",
      `SELECT m.user_id AS id,u.name,u.email,u.email_verified_at IS NOT NULL AS "emailVerified",m.department_code AS department,m.active FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY u.name`,
    ),
    assignments: await read(
      "access.manage",
      "SELECT * FROM user_roles WHERE organization_id=$1 ORDER BY user_id",
    ),
    directGrants: await read(
      "access.manage",
      "SELECT * FROM user_permissions WHERE organization_id=$1 ORDER BY user_id",
    ),
    owners: allows(actor,'access.manage') || allows(actor,'ownership.manage') ? (await pool.query('SELECT user_id AS "userId" FROM organization_owners WHERE organization_id=$1 ORDER BY user_id',[org])).rows : [],
  });
});
router.get("/members/:id/effective", async (req, res) => {
  authorize(req.user, "access.manage");
  uuid(req.params.id);
  const m = await pool.query(
    "SELECT active FROM memberships WHERE organization_id=$1 AND user_id=$2",
    [req.user.organizationId, req.params.id],
  );
  requireRow(m);
  res.json({
    grants: m.rows[0].active
      ? await resolveGrants(req.params.id, req.user.organizationId)
      : [],
  });
});
router.get("/audit", async (req, res) => {
  authorize(req.user, "audit.read");
  const before = req.query.before
    ? Number(req.query.before)
    : Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(before) || before < 1)
    throw new BadRequestError("Invalid audit cursor");
  const { rows } = await pool.query(
    "SELECT * FROM audit_events WHERE organization_id=$1 AND id<$2 ORDER BY id DESC LIMIT 100",
    [req.user.organizationId, before],
  );
  res.json({ events: rows });
});
router.use(
  checkForTestUser,
  sharedRateLimit({ namespace: "administration", max: 100 }),
);
router.use(organizationManagementRouter);
router.use(roleManagementRouter);
export default router;
