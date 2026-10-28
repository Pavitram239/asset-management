import { provisionOrganization } from "../repositories/organizations.js";
import { Router } from "express";
import { mutate } from "../middlewares/accessMutation.js";
import {
  text,
  uuid,
  boolean,
  requireRow,
  rejectSelf,
  activeDepartment,
} from "../utils/accessInput.js";
import { BadRequestError } from "../errors/customErrors.js";
import { companySettings, expectedVersion } from '../utils/companyInput.js';
const router = Router();
router.post(
  "/organizations",
  mutate(
    "organization.create",
    "organization.provision",
    async (db, actor, req) =>
      provisionOrganization(db, actor.userId, text(req.body.name)),
  ),
);
router.patch(
  "/organization",
  mutate(
    "organization.manage",
    "organization.update",
    async (db, actor, req) => {
      const settings=companySettings(req.body);
      const current=requireRow(await db.query('SELECT version FROM organizations WHERE id=$1',[actor.organizationId]));
      if(Object.keys(settings).length || Object.hasOwn(req.body,'expectedVersion'))expectedVersion(req.body.expectedVersion,current.version);
      const name = req.body.name === undefined ? null : text(req.body.name);
      const active =
        req.body.active === undefined ? null : boolean(req.body.active);
      return requireRow(
        await db.query(
          'UPDATE organizations SET name=COALESCE($2,name),active=COALESCE($3,active),currency=COALESCE($4,currency),time_zone=COALESCE($5,time_zone),version=version+1 WHERE id=$1 RETURNING id,name,active,currency,time_zone AS "timeZone",version::float8 AS version',
          [actor.organizationId, name, active,settings.currency,settings.timeZone],
        ),
      );
    },
  ),
);
router.post(
  "/departments",
  mutate("department.manage", "department.create", async (db, actor, req) => {
    const code = text(req.body.code, 100),
      name = text(req.body.name);
    return requireRow(
      await db.query(
        "INSERT INTO organization_departments(organization_id,code,name) VALUES($1,$2,$3) RETURNING *",
        [actor.organizationId, code, name],
      ),
    );
  }),
);
router.patch(
  "/departments/:id",
  mutate("department.manage", "department.update", async (db, actor, req) =>
    requireRow(
      await db.query(
        "UPDATE organization_departments SET name=COALESCE($3,name),active=COALESCE($4,active) WHERE organization_id=$1 AND code=$2 RETURNING *",
        [
          actor.organizationId,
          text(req.params.id, 100),
          req.body.name === undefined ? null : text(req.body.name),
          req.body.active === undefined ? null : boolean(req.body.active),
        ],
      ),
    ),
  ),
);
router.post(
  "/members",
  mutate("membership.manage", "membership.create", async (db, actor, req) => {
    const email = text(req.body.email, 254).toLowerCase();
    await activeDepartment(
      db,
      actor.organizationId,
      req.body.department ? text(req.body.department, 100) : null,
    );
    const user = requireRow(
      await db.query("SELECT id FROM users WHERE email=$1 AND active", [email]),
    );
    rejectSelf(actor, user.id);
    return requireRow(
      await db.query(
        "INSERT INTO memberships(organization_id,user_id,department_code) VALUES($1,$2,$3) RETURNING user_id AS id",
        [
          actor.organizationId,
          user.id,
          req.body.department ? text(req.body.department, 100) : null,
        ],
      ),
    );
  }),
);
router.patch(
  "/members/:id",
  mutate("membership.manage", "membership.update", async (db, actor, req) => {
    rejectSelf(actor, uuid(req.params.id));
    if (Object.hasOwn(req.body, "department")) {
      await activeDepartment(
        db,
        actor.organizationId,
        req.body.department ? text(req.body.department, 100) : null,
      );
      const assigned = await db.query(
        "SELECT 1 FROM products WHERE organization_id=$1 AND assigned_to_id=$2 AND deleted_at IS NULL AND department_code IS DISTINCT FROM $3 LIMIT 1",
        [actor.organizationId, req.params.id, req.body.department || null],
      );
      if (assigned.rowCount)
        throw new BadRequestError(
          "Return or transfer assigned assets before changing member department",
        );
    }
    return requireRow(
      await db.query(
        `UPDATE memberships SET active=COALESCE($3,active),department_code=CASE WHEN $4 THEN $5 ELSE department_code END
    WHERE organization_id=$1 AND user_id=$2 RETURNING user_id AS id,active,department_code`,
        [
          actor.organizationId,
          req.params.id,
          req.body.active === undefined ? null : boolean(req.body.active),
          Object.hasOwn(req.body, "department"),
          req.body.department ? text(req.body.department, 100) : null,
        ],
      ),
    );
  }),
);

export default router;
