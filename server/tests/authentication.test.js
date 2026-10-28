import test from 'node:test';
import assert from 'node:assert/strict';
import { users } from '../src/repositories/users.js';
import { authenticateUser, authorizePermissions } from '../src/middlewares/authMiddleware.js';
import { createJWT } from '../src/utils/tokenUtils.js';

test('authentication uses current database permissions instead of stale token claims', async (t) => {
  const originalFind = users.findById;
  const originalSecret = process.env.JWT_SECRET;
  const originalExpiry = process.env.JWT_EXPIRES_IN;
  t.after(() => {
    users.findById = originalFind;
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
    if (originalExpiry === undefined) delete process.env.JWT_EXPIRES_IN; else process.env.JWT_EXPIRES_IN = originalExpiry;
  });
  process.env.JWT_SECRET = 'isolated-test-secret';
  process.env.JWT_EXPIRES_IN = '1d';
  users.findById = async () => ({ role: 'user', department: 'kitchen', name: 'Test user' });
  const req = { cookies: { token: createJWT({ userId: '507f1f77-bcf8-4cd7-9943-9011507f1f77', role: 'admin', department: 'accounts' }) } };
  let nextCalled = false;
  await authenticateUser(req, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.user.role, undefined);
  assert.equal(req.user.department, undefined);
  assert.throws(() => authorizePermissions('admin', 'head')(req, {}, () => {}), (error) => error.statusCode === 403);
  users.findById = async () => ({ active:false });
  await assert.rejects(() => authenticateUser(req, {}, () => {}), (error) => error.statusCode === 401);
  users.findById = async () => null;
  await assert.rejects(() => authenticateUser(req, {}, () => {}), (error) => error.statusCode === 401);
});
