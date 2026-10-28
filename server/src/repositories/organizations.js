import { audit } from "../utils/authorization.js";

export const provisionOrganization = async (db, userId, name) => {
  const org = (
    await db.query("INSERT INTO organizations(name) VALUES($1) RETURNING *", [
      name,
    ])
  ).rows[0];
  await db.query(
    "INSERT INTO memberships(organization_id,user_id) VALUES($1,$2)",
    [org.id, userId],
  );
  const role = (
    await db.query(
      "INSERT INTO roles(organization_id,name) VALUES($1,$2) RETURNING id",
      [org.id, "Organization owner"],
    )
  ).rows[0];
  await db.query(
    "INSERT INTO role_permissions(role_id,permission_id) SELECT $1,id FROM permissions",
    [role.id],
  );
  await db.query(
    "INSERT INTO user_roles(organization_id,user_id,role_id,scope) VALUES($1,$2,$3,'organization')",
    [org.id, userId, role.id],
  );
  await audit(
    db,
    { userId, organizationId: org.id },
    "organization.create",
    org.id,
  );
  return org;
};
