import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const TEST_DB_URL = 'postgresql://asset_user:asset-local-dev@localhost:5432/asset_management_ui_test';

export async function setupIsolatedTestDb() {
  // Recreate clean database
  const adminClient = new pg.Client({ connectionString: 'postgresql://asset_user:asset-local-dev@localhost:5432/postgres' });
  await adminClient.connect();
  await adminClient.query(`
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'asset_management_ui_test' AND pid <> pg_backend_pid();
  `);
  await adminClient.query(`DROP DATABASE IF EXISTS asset_management_ui_test;`);
  await adminClient.query(`CREATE DATABASE asset_management_ui_test;`);
  await adminClient.end();

  // Run all migrations
  process.env.DATABASE_URL = TEST_DB_URL;
  const { migrate } = await import('../server/db/migrate.js');
  await migrate();

  const client = new pg.Client({ connectionString: TEST_DB_URL });
  await client.connect();

  console.log('Seeding isolated fixtures in freshly migrated asset_management_ui_test...');

  const passwordHash = await bcrypt.hash('SyntheticTestPass123!', 10);
  const ownerId = randomUUID();
  const employeeId = randomUUID();
  const orgId = randomUUID();

  // 2. Perform initial creation in transaction
  await client.query('BEGIN');
  await client.query(`
    INSERT INTO users (id, name, first_name, email, password_hash, location, active, email_verified_at)
    VALUES 
      ($1, 'Test Owner', 'Test', 'test.owner@example.test', $3, 'HQ Campus', true, now()),
      ($2, 'Test Employee', 'Test', 'test.employee@example.test', $3, 'HQ Campus', true, now())
  `, [ownerId, employeeId, passwordHash]);

  await client.query(`
    INSERT INTO organizations (id, name, schema_name, active, ownership_activated_at)
    VALUES ($1, 'Synthetic Test Corporation', 'tenant_synthetic_test', true, now())
  `, [orgId]);

  await client.query(`
    INSERT INTO organization_departments (organization_id, code, name, active)
    VALUES ($1, 'ENG', 'Engineering', true)
  `, [orgId]);

  await client.query(`
    INSERT INTO memberships (organization_id, user_id, active, department_code)
    VALUES 
      ($1, $2, true, 'ENG'),
      ($1, $3, true, 'ENG')
  `, [orgId, ownerId, employeeId]);

  await client.query(`
    INSERT INTO organization_owners (organization_id, user_id, created_by)
    VALUES ($1, $2, $2)
  `, [orgId, ownerId]);
  await client.query('COMMIT');

  // 6. Set up Roles & Permissions
  // Get Starter Roles
  const rolesRes = await client.query(`SELECT id, name FROM roles WHERE organization_id = $1`, [orgId]);
  let ownerRoleId = rolesRes.rows.find(r => r.name === 'Organization owner')?.id;
  let empRoleId = rolesRes.rows.find(r => r.name === 'Employee')?.id;

  if (!ownerRoleId) {
    const r1 = await client.query(`INSERT INTO roles (organization_id, name) VALUES ($1, 'Organization owner') RETURNING id`, [orgId]);
    ownerRoleId = r1.rows[0].id;
  }
  if (!empRoleId) {
    const r2 = await client.query(`INSERT INTO roles (organization_id, name) VALUES ($1, 'Employee') RETURNING id`, [orgId]);
    empRoleId = r2.rows[0].id;
  }

  // User roles
  await client.query(`
    INSERT INTO user_roles (organization_id, user_id, role_id, scope)
    VALUES 
      ($1, $2, $4, 'organization'),
      ($1, $3, $5, 'self')
  `, [orgId, ownerId, employeeId, ownerRoleId, empRoleId]);

  // Direct permissions for Owner
  const ownerPerms = [
    'ownership.manage', 'location.manage', 'category.manage', 'unit.manage',
    'catalog.read', 'catalog.manage', 'catalog.requestable.read', 'inventory.read',
    'inventory.opening', 'cost.read', 'attachment.read', 'attachment.write',
    'asset.read', 'asset.create', 'asset.update', 'asset.delete', 'asset.file.read',
    'directory.read', 'membership.manage', 'statistics.read', 'access.manage',
    'requisition.read', 'requisition.create', 'requisition.approve', 'requisition.fulfill'
  ];

  for (const perm of ownerPerms) {
    await client.query(`
      INSERT INTO user_permissions (organization_id, user_id, permission_id, scope)
      VALUES ($1, $2, $3, 'organization')
      ON CONFLICT DO NOTHING
    `, [orgId, ownerId, perm]);
  }

  // Direct permissions for Employee
  const empPerms = [
    ['asset.read', 'self'],
    ['asset.file.read', 'self'],
    ['requisition.read', 'self'],
    ['requisition.create', 'self']
  ];
  for (const [perm, scope] of empPerms) {
    await client.query(`
      INSERT INTO user_permissions (organization_id, user_id, permission_id, scope)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
    `, [orgId, employeeId, perm, scope]);
  }

  // 7. Create Department
  await client.query(`
    INSERT INTO organization_departments (organization_id, code, name, active)
    VALUES ($1, 'ENG', 'Engineering', true)
    ON CONFLICT DO NOTHING
  `, [orgId]);

  // 8. Create Tenant Schema and Products
  await client.query(`CREATE SCHEMA IF NOT EXISTS tenant_synthetic_test;`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS tenant_synthetic_test.products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL,
      name text NOT NULL,
      company text NOT NULL,
      department_code text,
      creator_id uuid NOT NULL,
      assigned_to_id uuid,
      created_by text NOT NULL,
      qr text,
      status text NOT NULL DEFAULT 'In department',
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const asset1 = randomUUID();
  const asset2 = randomUUID();
  const asset3 = randomUUID();

  // Insert products in tenant schema AND public for compatibility
  const productQueries = [
    `INSERT INTO tenant_synthetic_test.products (id, organization_id, name, company, department_code, creator_id, assigned_to_id, created_by, status, qr)
     VALUES 
       ($1, $4, 'ThinkPad T14 Gen 3', 'Lenovo', 'accounts', $2, $3, 'Test Owner', 'In department', 'SYNTH-QR-001'),
       ($5, $4, 'MacBook Pro 16 M2', 'Apple', 'accounts', $2, null, 'Test Owner', 'In department', 'SYNTH-QR-002'),
       ($6, $4, 'Ergonomic Task Chair', 'Herman Miller', 'accounts', $2, null, 'Test Owner', 'Not in Department', 'SYNTH-QR-003')`,
    `INSERT INTO products (id, organization_id, name, company, department_code, creator_id, assigned_to_id, created_by, status, qr)
     VALUES 
       ($1, $4, 'ThinkPad T14 Gen 3', 'Lenovo', 'accounts', $2, $3, 'Test Owner', 'In department', 'SYNTH-QR-001'),
       ($5, $4, 'MacBook Pro 16 M2', 'Apple', 'accounts', $2, null, 'Test Owner', 'In department', 'SYNTH-QR-002'),
       ($6, $4, 'Ergonomic Task Chair', 'Herman Miller', 'accounts', $2, null, 'Test Owner', 'Not in Department', 'SYNTH-QR-003')`
  ];

  for (const q of productQueries) {
    await client.query(q, [asset1, ownerId, employeeId, orgId, asset2, asset3]);
  }

  // 9. Create Requisitions
  await client.query(`
    INSERT INTO asset_requisitions (organization_id, requisition_number, requester_id, department_code, status, priority, reason)
    VALUES ($1, 'REQ-2026-0001', $2, 'ENG', 'pending', 'standard', 'New workstation monitor for engineering work')
  `, [orgId, employeeId]);

  console.log('Isolated test fixtures created successfully:');
  console.log(`- Org ID: ${orgId}`);
  console.log(`- Owner: test.owner@example.test (Password: SyntheticTestPass123!)`);
  console.log(`- Employee: test.employee@example.test (Password: SyntheticTestPass123!)`);

  await client.end();
  return { orgId, ownerId, employeeId };
}

if (process.argv[1]?.endsWith('setup-isolated-fixtures.mjs')) {
  setupIsolatedTestDb().catch(e => {
    console.error('Fixture setup failed:', e);
    process.exit(1);
  });
}
