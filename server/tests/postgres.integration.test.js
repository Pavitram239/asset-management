import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const connectionString = process.env.TEST_DATABASE_URL;
test('PostgreSQL migrations and real API workflows', { skip: !connectionString }, async (t) => {
  // Never clean an application database: isolate all fixtures in a generated test schema.
  const url = new URL(connectionString);
  assert.match(decodeURIComponent(url.pathname), /_test$/,
    'TEST_DATABASE_URL must name a dedicated database ending in _test');
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const control = new pg.Pool({ connectionString });
  await control.query(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = connectionString;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  process.env.JWT_SECRET = 'integration-test-only-secret';
  process.env.JWT_EXPIRES_IN = '1d';
  process.env.COOKIE_SECURE = 'false';
  const { pool } = await import('../db/pool.js');
  let server;
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
    await control.query(`DROP SCHEMA "${schema}" CASCADE`);
    await control.end();
  });
  const { migrate } = await import('../db/migrate.js');
  await migrate();
  await migrate();
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, 1);
  const { default: app } = await import('../src/app.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const api = async (route, method = 'GET', body, cookie) => {
    const response = await fetch(base + route, {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const registration = (name, email, department) => ({ name, email, department, location: 'Office', password: 'test-password-123', role: 'admin' });
  const credentials = [registration('First user', 'first@example.test', 'accounts'), registration('Second user', 'second@example.test', 'kitchen')];
  await t.test('concurrent registration creates exactly one administrator', async () => {
    const responses = await Promise.all(credentials.map((body) => api('/auth/register', 'POST', body)));
    assert.deepEqual(responses.map((response) => response.status), [201, 201]);
    const roles = (await pool.query('SELECT role, count(*)::int AS count FROM users GROUP BY role')).rows;
    assert.equal(roles.find((row) => row.role === 'admin').count, 1);
    assert.equal(roles.find((row) => row.role === 'user').count, 1);
  });
  const initialUsers = (await pool.query('SELECT id, email, role FROM users ORDER BY email')).rows;
  const admin = initialUsers.find((user) => user.role === 'admin');
  const head = initialUsers.find((user) => user.role === 'user');
  await pool.query("UPDATE users SET role = 'head', department_code = 'accounts' WHERE id = $1", [head.id]);
  const login = async (email) => {
    const response = await api('/auth/login', 'POST', { email: email.toUpperCase(), password: 'test-password-123' });
    assert.equal(response.status, 200);
    assert.ok(response.cookie);
    return response.cookie;
  };
  const adminCookie = await login(admin.email);
  const headCookie = await login(head.email);
  assert.equal((await api('/auth/register', 'POST', registration('Employee', 'employee@example.test', 'kitchen'))).status, 201);
  const employee = (await pool.query("SELECT id FROM users WHERE email = 'employee@example.test'")).rows[0];
  const employeeCookie = await login('employee@example.test');

  await t.test('database constraints enforce unique emails and valid references', async () => {
    const duplicate = await api('/auth/register', 'POST', registration('Duplicate', 'EMPLOYEE@example.test', 'kitchen'));
    assert.equal(duplicate.status, 400);
    await assert.rejects(() => pool.query('UPDATE users SET department_code = $1 WHERE id = $2', ['missing', employee.id]), (error) => error.code === '23503');
    await assert.rejects(() => pool.query('UPDATE users SET email = $1 WHERE id = $2', [admin.email, employee.id]), (error) => error.code === '23505');
    await assert.rejects(() => pool.query("UPDATE users SET role = 'owner' WHERE id = $1", [employee.id]), (error) => error.code === '23514');
  });
  let asset;
  await t.test('asset creation, UUID assignment and details retain frontend response shape', async () => {
    const response = await api('/products', 'POST', {
      name: 'Laptop 100%_test', company: 'Dell', department: 'kitchen', assignedToId: employee.id,
      purchaseDate: '2026-01-01', warrantyDate: '2099-01-01', serialNumber: 'SN-001', creator: head.id,
    }, adminCookie);
    assert.equal(response.status, 201);
    asset = response.data.product;
    assert.match(asset._id, /^[0-9a-f-]{36}$/);
    assert.equal(asset.creator, admin.id);
    assert.equal(asset.assignedToId, employee.id);
    assert.equal(asset.assignedTo, 'Employee');
    assert.equal(asset.serialNumber, 'SN-001');
    assert.equal(asset.warranty, 'active');
    assert.match(asset.qr, /^data:image\/png;base64,/);
    const detail = await api(`/products/${asset._id}`, 'GET', undefined, employeeCookie);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.product._id, asset._id);
  });
  await t.test('department boundaries and role permissions hold across SQL-backed routes', async () => {
    assert.equal((await api(`/products/${asset._id}`, 'GET', undefined, headCookie)).status, 403);
    assert.equal((await api(`/products/${asset._id}`, 'PATCH', { company: 'Other' }, headCookie)).status, 403);
    assert.equal((await api('/products', 'POST', { name: 'Forbidden', company: 'Dell' }, employeeCookie)).status, 403);
    const list = await api('/products', 'GET', undefined, headCookie);
    assert.equal(list.data.totalProducts, 0);
    const userList = await api('/users/users-list', 'GET', undefined, headCookie);
    assert.ok(userList.data.users.every((user) => user.department === 'accounts'));
    assert.equal((await api('/products', 'GET')).status, 401);
    assert.equal((await api('/products/not-a-uuid', 'GET', undefined, adminCookie)).status, 400);
  });
  await t.test('profile updates cannot alter privileges and assignment resolves renamed users', async () => {
    const response = await api('/users/update-user', 'PATCH', {
      name: 'Renamed employee', email: 'employee@example.test', location: 'Office', role: 'admin', department: 'accounts',
    }, employeeCookie);
    assert.equal(response.status, 200);
    const current = (await api('/users/current-user', 'GET', undefined, employeeCookie)).data.user;
    assert.equal(current.role, 'user');
    assert.equal(current.department, 'kitchen');
    assert.equal('password' in current, false);
    assert.equal((await api(`/products/${asset._id}`, 'GET', undefined, adminCookie)).data.product.assignedTo, 'Renamed employee');
  });
  await t.test('literal search, filters, pagination and overview use PostgreSQL correctly', async () => {
    assert.equal((await api('/products?search=%25_test', 'GET', undefined, adminCookie)).data.totalProducts, 1);
    assert.equal((await api('/products?search=%27%20OR%201%3D1--', 'GET', undefined, adminCookie)).data.totalProducts, 0);
    assert.equal((await api('/products?productWarranty=expired', 'GET', undefined, adminCookie)).data.totalProducts, 0);
    assert.equal((await api('/products?limit=101', 'GET', undefined, adminCookie)).status, 400);
    const overview = await api('/products/overview', 'GET', undefined, adminCookie);
    assert.equal(overview.data.total, 1);
    assert.equal(overview.data.assigned, 1);
    assert.equal(overview.data.expired, 0);
    assert.equal((await api('/products/overview', 'GET', undefined, headCookie)).data.total, 0);
  });
  await t.test('assignment validation and updates support returns and department transfers', async () => {
    assert.equal((await api(`/products/${asset._id}`, 'PATCH', { assignedToId: head.id }, adminCookie)).status, 400);
    const update = await api(`/products/${asset._id}`, 'PATCH', { assignedToId: '', warrantyDate: '2000-01-01', company: 'Updated Dell', power: '65W' }, adminCookie);
    assert.equal(update.status, 200);
    assert.equal(update.data.updatedProduct.assignedToId, null);
    assert.equal(update.data.updatedProduct.warranty, 'expired');
    assert.equal(update.data.updatedProduct.serialNumber, 'SN-001');
    assert.equal(update.data.updatedProduct.power, '65W');
    const transfer = await api(`/products/${asset._id}`, 'PATCH', { department: 'accounts' }, adminCookie);
    assert.equal(transfer.status, 200);
    assert.equal((await api(`/products/${asset._id}`, 'GET', undefined, headCookie)).status, 200);
  });
  await t.test('asset deletion, health checks and logout work', async () => {
    assert.equal((await api(`/products/${asset._id}`, 'DELETE', undefined, adminCookie)).status, 200);
    assert.equal((await api(`/products/${asset._id}`, 'GET', undefined, adminCookie)).status, 404);
    assert.equal((await api('/health')).data.database, 'postgresql');
    assert.equal((await api('/does-not-exist')).status, 404);
    const logout = await api('/auth/logout', 'GET', undefined, adminCookie);
    assert.equal(logout.status, 200);
    assert.equal((await api('/users/current-user', 'GET', undefined, logout.cookie)).status, 401);
  });
});
