import { Router } from "express";
import { mutate } from "../middlewares/accessMutation.js";
import {
  text,
  uuid,
  boolean,
  requireRow,
  rejectSelf,
  permissionList,
  scopeInput,
  grantTarget,
} from "../utils/accessInput.js";
import { BadRequestError, UnauthorizedError } from "../errors/customErrors.js";
import {permissionScopes} from '../utils/authorization.js';
const router = Router();
router.post(
  "/roles",
  mutate("role.manage", "role.create", async (db, actor, req) => {
    const permissions = permissionList(req.body.permissions || []);
    const role = requireRow(
      await db.query(
        "INSERT INTO roles(organization_id,name) VALUES($1,$2) RETURNING id",
        [actor.organizationId, text(req.body.name)],
      ),
    );
    for (const p of permissions)
      await db.query(
        "INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2)",
        [role.id, p],
      );
    return role;
  }),
);
router.patch(
  "/roles/:id",
  mutate("role.manage", "role.update", async (db, actor, req) => {
    uuid(req.params.id);
    const own = await db.query(
      "SELECT 1 FROM user_roles WHERE organization_id=$1 AND user_id=$2 AND role_id=$3",
      [actor.organizationId, actor.userId, req.params.id],
    );
    if (
      own.rowCount &&
      (req.body.permissions !== undefined || req.body.active !== undefined)
    )
      throw new UnauthorizedError(
        "Cannot change permissions or activation of a role assigned to yourself",
      );
    const role = requireRow(
      await db.query(
        "UPDATE roles SET name=COALESCE($3,name),active=COALESCE($4,active) WHERE organization_id=$1 AND id=$2 RETURNING id",
        [
          actor.organizationId,
          req.params.id,
          req.body.name === undefined ? null : text(req.body.name),
          req.body.active === undefined ? null : boolean(req.body.active),
        ],
      ),
    );
    if (req.body.permissions !== undefined) {
      const permissions = permissionList(req.body.permissions);
      await db.query("DELETE FROM role_permissions WHERE role_id=$1", [
        role.id,
      ]);
      for (const p of permissions)
        await db.query(
          "INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2)",
          [role.id, p],
        );
    }
    return role;
  }),
);
router.post(
  "/assignments",
  mutate("access.manage", "role.assign", async (db, actor, req) => {
    const userId = uuid(req.body.userId);
    rejectSelf(actor, userId);
    const [scope, department, locationId] = scopeInput(req.body);
    await grantTarget(db, actor, userId, department, locationId);
    const selectedRole = await db.query(
      "SELECT 1 FROM roles WHERE organization_id=$1 AND id=$2 AND active",
      [actor.organizationId, uuid(req.body.roleId)],
    );
    if (!selectedRole.rowCount)
      throw new BadRequestError("Active organization role required");
    if(scope!=='organization') {
      const permissions=(await db.query('SELECT permission_id FROM role_permissions WHERE role_id=$1',[req.body.roleId])).rows;
      if(permissions.some(({permission_id:p})=>!permissionScopes(p).includes(scope)))throw new BadRequestError('This role contains permissions that do not support the selected scope');
    }
    return requireRow(
      await db.query(
        "INSERT INTO user_roles(organization_id,user_id,role_id,scope,department_code,location_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
        [
          actor.organizationId,
          userId,
          uuid(req.body.roleId),
          scope,
          department,
          locationId,
        ],
      ),
    );
  }),
);
router.post(
  "/grants",
  mutate("access.manage", "permission.grant", async (db, actor, req) => {
    const userId = uuid(req.body.userId);
    rejectSelf(actor, userId);
    permissionList([req.body.permission]);
    const [scope, department, locationId] = scopeInput(req.body);
    await grantTarget(db, actor, userId, department, locationId);
    if (
      !permissionScopes(req.body.permission).includes(scope)
    )
      throw new BadRequestError(
        "Management permissions require organization scope",
      );
    return requireRow(
      await db.query(
        "INSERT INTO user_permissions(organization_id,user_id,permission_id,scope,department_code,location_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
        [actor.organizationId, userId, req.body.permission, scope, department, locationId],
      ),
    );
  }),
);
for (const [path, table, action] of [
  ["assignments", "user_roles", "role.revoke"],
  ["grants", "user_permissions", "permission.revoke"],
]) {
  router.delete(
    `/${path}/:id`,
    mutate("access.manage", action, async (db, actor, req) => {
      const row = requireRow(
        await db.query(
          `SELECT user_id FROM ${table} WHERE organization_id=$1 AND id=$2`,
          [actor.organizationId, uuid(req.params.id)],
        ),
      );
      rejectSelf(actor, row.user_id);
      await db.query(
        `DELETE FROM ${table} WHERE organization_id=$1 AND id=$2`,
        [actor.organizationId, req.params.id],
      );
    }),
  );
}

export default router;
