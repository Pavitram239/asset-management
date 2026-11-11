import { randomUUID } from "node:crypto";
import { audit } from "../utils/authorization.js";

export const provisionOrganization = async (db, userId, name, orgType = null) => {
  const schemaSlug = 'tenant_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30);
  const schemaName = `${schemaSlug}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const org = (
    await db.query("INSERT INTO organizations(name, schema_name) VALUES($1, $2) RETURNING *", [
      name,
      schemaName,
    ])
  ).rows[0];
  await db.query("CALL provision_tenant_schema($1, $2)", [schemaName, org.id]);
  await db.query(
    "INSERT INTO memberships(organization_id,user_id) VALUES($1,$2)",
    [org.id, userId],
  );

  // 1. Seed Starter Facility Location in Tenant Schema
  const locId = randomUUID();
  await db.query(
    `INSERT INTO ${schemaName}.locations (id, name, kind, active, organization_id)
     VALUES ($1, $2, 'branch', true, $3)`,
    [locId, 'Main Premises / Head Office', org.id]
  );
  await db.query(
    `INSERT INTO ${schemaName}.location_ancestry (ancestor_id, descendant_id, depth, organization_id)
     VALUES ($1, $1, 0, $2)`,
    [locId, org.id]
  );

  // 2. Seed Starter Departments in Tenant Schema & Public
  const starterDepts = [
    { code: 'ADMIN', name: 'Administration' },
    { code: 'OPERATIONS', name: 'Operations' },
  ];
  for (const d of starterDepts) {
    await db.query(
      `INSERT INTO ${schemaName}.organization_departments (code, name, active, organization_id)
       VALUES ($1, $2, true, $3) ON CONFLICT (code) DO NOTHING`,
      [d.code, d.name, org.id]
    );
    await db.query(
      `INSERT INTO organization_departments (code, name, active, organization_id)
       VALUES ($1, $2, true, $3) ON CONFLICT (organization_id, code) DO NOTHING`,
      [d.code, d.name, org.id]
    ).catch(() => null);
  }

  // 3. Pre-seed Organization Owner Role in Tenant Schema
  const ownerRoleId = randomUUID();
  await db.query(
    `INSERT INTO ${schemaName}.roles (id, name, active, organization_id)
     VALUES ($1, 'Organization owner', true, $2)`,
    [ownerRoleId, org.id]
  );
  await db.query(
    `INSERT INTO ${schemaName}.role_permissions (role_id, permission_id)
     SELECT $1, id FROM permissions`,
    [ownerRoleId]
  );
  await db.query(
    `INSERT INTO ${schemaName}.user_roles (organization_id, user_id, role_id, scope)
     VALUES ($1, $2, $3, 'organization')`,
    [org.id, userId, ownerRoleId]
  );

  // 4. Pre-seed Department Head, Storekeeper, Employee in Tenant Schema
  const deptHeadRoleId = randomUUID();
  await db.query(
    `INSERT INTO ${schemaName}.roles (id, name, active, organization_id)
     VALUES ($1, 'Department head', true, $2)`,
    [deptHeadRoleId, org.id]
  );
  await db.query(
    `INSERT INTO ${schemaName}.role_permissions (role_id, permission_id)
     VALUES
       ($1, 'asset.read'),
       ($1, 'requisition.create'),
       ($1, 'requisition.read'),
       ($1, 'requisition.approve'),
       ($1, 'directory.read')`,
    [deptHeadRoleId]
  );

  const storekeeperRoleId = randomUUID();
  await db.query(
    `INSERT INTO ${schemaName}.roles (id, name, active, organization_id)
     VALUES ($1, 'Storekeeper', true, $2)`,
    [storekeeperRoleId, org.id]
  );
  await db.query(
    `INSERT INTO ${schemaName}.role_permissions (role_id, permission_id)
     VALUES
       ($1, 'asset.read'),
       ($1, 'requisition.read'),
       ($1, 'requisition.fulfill'),
       ($1, 'catalog.read'),
       ($1, 'inventory.read')`,
    [storekeeperRoleId]
  );

  const employeeRoleId = randomUUID();
  await db.query(
    `INSERT INTO ${schemaName}.roles (id, name, active, organization_id)
     VALUES ($1, 'Employee', true, $2)`,
    [employeeRoleId, org.id]
  );
  await db.query(
    `INSERT INTO ${schemaName}.role_permissions (role_id, permission_id)
     VALUES
       ($1, 'asset.read'),
       ($1, 'asset.file.read'),
       ($1, 'requisition.create'),
       ($1, 'requisition.read')`,
    [employeeRoleId]
  );

  // 5. Establish formal Company Owner continuity in public tables
  await db.query(
    `INSERT INTO organization_owners (organization_id, user_id, created_by)
     VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
    [org.id, userId]
  );
  await db.query(
    `UPDATE organizations
     SET ownership_activated_at = now()
     WHERE id = $1`,
    [org.id]
  );

  // 6. Keep public template roles in sync for public fallback queries
  await db.query(
    `INSERT INTO public.roles (id, name, active, organization_id)
     VALUES ($1, 'Organization owner', true, $2) ON CONFLICT DO NOTHING`,
    [ownerRoleId, org.id]
  );
  await db.query(
    `INSERT INTO public.role_permissions (role_id, permission_id)
     SELECT $1, id FROM permissions ON CONFLICT DO NOTHING`,
    [ownerRoleId]
  );
  await db.query(
    `INSERT INTO public.user_roles (organization_id, user_id, role_id, scope)
     VALUES ($1, $2, $3, 'organization')`,
    [org.id, userId, ownerRoleId]
  );

  await audit(
    db,
    { userId, organizationId: org.id },
    "organization.create",
    org.id,
    { schemaName, organizationType: orgType }
  );
  return org;
};
