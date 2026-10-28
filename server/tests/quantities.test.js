import test from 'node:test';
import assert from 'node:assert/strict';
import { quantity, quantityString } from '../src/utils/quantities.js';

test('exact quantities retain six-digit precision and whole-item restrictions', () => {
  assert.equal(quantityString(quantity('0.1') + quantity('0.2')), '0.3');
  assert.equal(quantityString(quantity('99999999999999.999999')), '99999999999999.999999');
  assert.equal(quantityString(-quantity('2.000001')), '-2.000001');
  assert.equal(quantityString(quantity('2.000', 3)), '2');
  assert.equal(quantity('2', 0, true), 2000000n);
  for (const invalid of [2, null, '', ' 2', '+2', '-1', '01', '1.', '.2', '1e3', 'NaN', '0.0000001', '100000000000000']) assert.throws(() => quantity(invalid));
  assert.throws(() => quantity('2.0', 0));
  assert.throws(() => quantity('1.001', 2));
  assert.throws(() => quantity('0', 0, true));
});
