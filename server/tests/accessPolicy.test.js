import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessAsset, pickProfileFields, assetInput, pagination } from '../src/utils/accessPolicy.js';

const head = { role: 'head', department: 'kitchen' };
test('asset access stays inside department for heads and users', () => {
  for (const role of ['head', 'user']) {
    assert.equal(canAccessAsset({ ...head, role }, { department: 'accounts' }), false);
    assert.equal(canAccessAsset({ ...head, role }, { department: 'kitchen' }), true);
  }
  assert.equal(canAccessAsset({ role: 'admin' }, { department: 'accounts' }), true);
});
test('profile updates cannot grant privileges or change department', () => {
  assert.deepEqual(pickProfileFields({ name: ' Alice ', role: 'admin', department: 'accounts', password: 'x', avatarPublicId: 'x' }), { name: 'Alice' });
});
test('asset input rejects cross-department transfer and strips protected fields', () => {
  assert.throws(() => assetInput({ name: 'Laptop', company: 'Dell', department: 'accounts' }, head), /another department/);
  assert.deepEqual(assetInput({ name: 'Laptop', company: 'Dell', creator: 'forged', qr: 'fake' }, head), { name: 'Laptop', company: 'Dell', department: 'kitchen' });
});
test('asset validation enforces required fields, dates and statuses', () => {
  assert.throws(() => assetInput({ name: '' }, head), /required/);
  assert.throws(() => assetInput({ status: 'made-up' }, head, true), /status/);
  assert.throws(() => assetInput({ warrantyDate: 'not-a-date' }, head, true), /warrantyDate/);
  assert.equal(assetInput({ warrantyDate: '2000-01-01' }, head, true).warranty, 'expired');
  assert.equal(assetInput({ warrantyDate: '2099-01-01' }, head, true).warranty, 'active');
});
test('pagination bounds database queries', () => {
  for (const query of [{ page: '-1' }, { limit: '101' }, { page: 'NaN' }, { page: '1.5' }]) assert.throws(() => pagination(query));
  assert.deepEqual(pagination({ page: '2', limit: '25' }), { page: 2, limit: 25, skip: 25 });
});
