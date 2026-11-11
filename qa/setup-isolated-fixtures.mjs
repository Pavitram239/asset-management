import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

// Safety: Verify and enforce isolated test database constraints
export function validateTestDatabaseConfig(dbUrl) {
  if (!dbUrl) {
    throw new Error('QA_DATABASE_URL or TEST_DATABASE_URL environment variable is strictly required. Fallbacks are disabled.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(dbUrl);
  } catch (err) {
    throw new Error(`Invalid database URL format: ${err.message}`);
  }

  const dbName = parsedUrl.pathname.replace(/^\//, '').trim();
  if (!dbName) {
    throw new Error('Database URL must specify a database name.');
  }

  const FORBIDDEN_DATABASES = [
    'asset_management',
    'postgres',
    'template0',
    'template1',
    'production',
    'prod',
    'main',
    'master',
    'development',
    'dev'
  ];

  if (FORBIDDEN_DATABASES.includes(dbName.toLowerCase())) {
    throw new Error(`CRITICAL SAFETY VIOLATION: Target database "${dbName}" is forbidden. Cannot drop or modify production/shared database.`);
  }

  if (
    !dbName.toLowerCase().endsWith('_test') &&
    !dbName.toLowerCase().endsWith('_ui_test') &&
    !dbName.toLowerCase().includes('test')
  ) {
    throw new Error(`CRITICAL SAFETY VIOLATION: Target database "${dbName}" does not match required test naming pattern (*_test, *_ui_test, or *test*). Refusing to drop.`);
  }

  // Ensure database name is safe identifier
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
    throw new Error(`Database name "${dbName}" contains illegal characters.`);
  }

  return dbName;
}

export async function setupIsolatedTestDb() {
  const testDbUrl = process.env.QA_DATABASE_URL || process.env.TEST_DATABASE_URL;
  const safeDbName = validateTestDatabaseConfig(testDbUrl);

  const ownerPassword = process.env.QA_OWNER_PASSWORD || process.env.QA_TEST_PASSWORD;
  const employeePassword = process.env.QA_EMPLOYEE_PASSWORD || process.env.QA_TEST_PASSWORD;

  if (!ownerPassword || !employeePassword) {
    throw new Error('QA_OWNER_PASSWORD and QA_EMPLOYEE_PASSWORD (or QA_TEST_PASSWORD) environment variables are strictly required.');
  }

  const ownerEmail = process.env.QA_OWNER_EMAIL || 'test.owner@example.test';
  const employeeEmail = process.env.QA_EMPLOYEE_EMAIL || 'test.employee@example.test';

  // Determine admin maintenance URL (connects to postgres db to recreate test db)
  let adminUrl = process.env.QA_ADMIN_DATABASE_URL;
  if (!adminUrl) {
    const urlObj = new URL(testDbUrl);
    urlObj.pathname = '/postgres';
    adminUrl = urlObj.toString();
  }

  console.log(`[SAFEGUARD CHECK PASSED] Dropping and recreating verified isolated test database: "${safeDbName}"...`);
  const adminClient = new pg.Client({ connectionString: adminUrl });
  await adminClient.connect();

  await adminClient.query(`
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid();
  `, [safeDbName]);

  await adminClient.query(`DROP DATABASE IF EXISTS "${safeDbName}";`);
  await adminClient.query(`CREATE DATABASE "${safeDbName}";`);
  await adminClient.end();

  // Run all migrations against the freshly created test DB
  process.env.DATABASE_URL = testDbUrl;
  const { migrate } = await import('../server/db/migrate.js');
  await migrate();

  const client = new pg.Client({ connectionString: testDbUrl });
  await client.connect();

  console.log(`Seeding isolated fixtures in freshly migrated ${safeDbName}...`);

  const ownerPasswordHash = await bcrypt.hash(ownerPassword, 10);
  const employeePasswordHash = await bcrypt.hash(employeePassword, 10);
  const ownerId = randomUUID();
  const employeeId = randomUUID();
  const orgId = randomUUID();

  // 1. Users, Organization, Departments, Memberships
  await client.query('BEGIN');
  await client.query(`
    INSERT INTO users (id, name, first_name, email, password_hash, location, active, email_verified_at)
    VALUES 
      ($1, 'Test Owner', 'Test', $2, $4, 'HQ Campus', true, now()),
      ($3, 'Test Employee', 'Test', $5, $6, 'HQ Campus', true, now())
  `, [ownerId, ownerEmail, employeeId, ownerPasswordHash, employeeEmail, employeePasswordHash]);

  await client.query(`
    INSERT INTO organizations (id, name, schema_name, active, ownership_activated_at)
    VALUES ($1, 'Synthetic Test Corporation', 'tenant_synthetic_test', true, now())
  `, [orgId]);

  // Provision schema for tenant
  await client.query(`CALL provision_tenant_schema('tenant_synthetic_test', $1)`, [orgId]);

  await client.query(`
    INSERT INTO organization_departments (organization_id, code, name, active)
    VALUES 
      ($1, 'ENG', 'Engineering', true),
      ($1, 'accounts', 'Accounts', true)
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

  // 2. Set up Roles & Permissions
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
    'department.manage', 'role.manage', 'organization.manage', 'audit.read',
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

  const asset1 = randomUUID();
  const asset2 = randomUUID();
  const asset3 = randomUUID();

  // Insert products in tenant schema AND public for compatibility
  await client.query(`
    INSERT INTO tenant_synthetic_test.products (id, organization_id, name, company, department_code, assigned_to_id, warranty, qr)
    VALUES 
      ($1::uuid, $2::uuid, 'ThinkPad T14 Gen 3', 'Lenovo', 'accounts', $3::uuid, '3 Years Onsite', 'SYNTH-QR-001'),
      ($4::uuid, $2::uuid, 'MacBook Pro 16 M2', 'Apple', 'accounts', null, '1 Year AppleCare', 'SYNTH-QR-002'),
      ($5::uuid, $2::uuid, 'Ergonomic Task Chair', 'Herman Miller', 'accounts', null, '12 Years', 'SYNTH-QR-003')
  `, [asset1, orgId, employeeId, asset2, asset3]);

  await client.query(`
    INSERT INTO products (id, organization_id, name, company, department_code, creator_id, assigned_to_id, created_by, status, qr)
    VALUES 
      ($1::uuid, $2::uuid, 'ThinkPad T14 Gen 3', 'Lenovo', 'accounts', $3::uuid, $4::uuid, 'Test Owner', 'In department', 'SYNTH-QR-001'),
      ($5::uuid, $2::uuid, 'MacBook Pro 16 M2', 'Apple', 'accounts', $3::uuid, null, 'Test Owner', 'In department', 'SYNTH-QR-002'),
      ($6::uuid, $2::uuid, 'Ergonomic Task Chair', 'Herman Miller', 'accounts', $3::uuid, null, 'Test Owner', 'Not in Department', 'SYNTH-QR-003')
  `, [asset1, orgId, ownerId, employeeId, asset2, asset3]);

  // Create Requisitions in tenant schema
  await client.query(`
    INSERT INTO tenant_synthetic_test.asset_requisitions (
      organization_id, requisition_number, requester_id, department_code, item_name, purpose, needed_until, status
    )
    VALUES ($1, 'REQ-2026-0001', $2, 'ENG', 'Dell UltraSharp 27 Monitor', 'New workstation monitor for engineering work', now() + interval '30 days', 'pending_approval')
  `, [orgId, employeeId]);

  console.log('Isolated test fixtures created successfully:');
  console.log(`- Database: ${safeDbName}`);
  console.log(`- Org ID: ${orgId}`);
  console.log(`- Owner: ${ownerEmail}`);
  console.log(`- Employee: ${employeeEmail}`);

  await client.end();
  return { orgId, ownerId, employeeId };
}

if (process.argv[1]?.endsWith('setup-isolated-fixtures.mjs')) {
  setupIsolatedTestDb()
    .then(() => {
      console.log('Fixtures seeded successfully. Exiting.');
      process.exit(0);
    })
    .catch(e => {
      console.error('Fixture setup failed:', e.message);
      process.exit(1);
    });
}
