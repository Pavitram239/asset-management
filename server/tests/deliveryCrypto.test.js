import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decryptPayload, encryptPayload, payloadHash } from '../src/services/deliveryCrypto.js';
import { capturedMailAdapter } from '../src/services/mailAdapter.js';

test('delivery encryption binds ciphertext to its event and fails closed for changed data, keys and context', t => {
  const previous = process.env.OUTBOX_ENCRYPTION_KEY;
  t.after(() => { if (previous === undefined) delete process.env.OUTBOX_ENCRYPTION_KEY; else process.env.OUTBOX_ENCRYPTION_KEY = previous; });
  process.env.OUTBOX_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  const payload = { token: 'synthetic-one-use-secret', email: 'synthetic@example.test' };
  const encrypted = encryptPayload(payload, 'outbox:synthetic:account.verify');
  assert.deepEqual(decryptPayload(encrypted, 'outbox:synthetic:account.verify'), payload);
  assert(!JSON.stringify(encrypted).includes(payload.token));
  assert(!JSON.stringify(encrypted).includes(payload.email));
  assert.notDeepEqual(encrypted, encryptPayload(payload, 'outbox:synthetic:account.verify'));
  assert.throws(() => decryptPayload(encrypted, 'outbox:other:account.verify'));
  assert.throws(() => decryptPayload({ ...encrypted, tag: randomBytes(16).toString('base64') }, 'outbox:synthetic:account.verify'));
  assert.equal(payloadHash({ a: 1, b: [2, 3] }), payloadHash({ b: [2, 3], a: 1 }));
  assert.notEqual(payloadHash({ b: [2, 3] }), payloadHash({ b: [3, 2] }));
  assert.notEqual(payloadHash({ at: new Date(0) }), payloadHash({ at: new Date(1) }));
  assert.equal(payloadHash({ at: new Date(0) }), payloadHash({ at: new Date(0).toISOString() }));
  process.env.OUTBOX_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  assert.throws(() => decryptPayload(encrypted, 'outbox:synthetic:account.verify'));
  process.env.OUTBOX_ENCRYPTION_KEY = 'invalid';
  assert.throws(() => encryptPayload(payload, 'context'), /32-byte/);
});

test('local capture is unavailable in production or an unspecified environment', t => {
  const previous = process.env.NODE_ENV;
  t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; });
  for (const environment of ['production', '']) {
    process.env.NODE_ENV = environment;
    assert.throws(() => capturedMailAdapter(), /development or test/);
  }
});
