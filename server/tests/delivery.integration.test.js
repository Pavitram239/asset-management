import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from '../testing/testDatabase.js';

test('durable encrypted delivery through real PostgreSQL', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  process.env.NODE_ENV = 'test';
  process.env.OUTBOX_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  const { pool } = await testDatabase(t);
  const { transaction } = await import('../db/pool.js');
  const { enqueueDelivery, claimDelivery, settleDelivery, sweepDeliveries, cancelDelivery } = await import('../src/services/outbox.js');
  const { processDelivery } = await import('../src/services/deliveryWorker.js');
  const { capturedMailAdapter } = await import('../src/services/mailAdapter.js');
  const { decryptPayload } = await import('../src/services/deliveryCrypto.js');
  const message = { to: 'synthetic@example.test', subject: 'Account verification', text: 'Synthetic private link #synthetic-token' };
  const renderers = { 'fixture.mail': async payload => payload };
  const adapter = capturedMailAdapter();
  const enqueue = (options = {}) => transaction(db => enqueueDelivery(db, {
    topic: 'fixture.mail', key: randomUUID(), payload: message, expiresAt: new Date(Date.now() + 600000), ...options,
  }));
  const event = id => pool.query('SELECT * FROM outbox_events WHERE id=$1', [id]).then(r => r.rows[0]);
  const due = id => pool.query("UPDATE outbox_events SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1", [id]);
  const expireLease = id => pool.query("UPDATE outbox_events SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [id]);
  const expireEvent = id => pool.query("UPDATE outbox_events SET created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE id=$1", [id]);
  const capture = async id => {
    const { rows } = await pool.query('SELECT * FROM captured_mail WHERE event_id=$1 ORDER BY captured_at', [id]);
    return rows.map(row => decryptPayload(row.encrypted_message, `capture:${row.id}:${id}`));
  };

  await t.test('event and business write roll back together; logical duplicates do not mutate payload', async () => {
    const key = randomUUID(), businessId = randomUUID();
    await assert.rejects(() => transaction(async db => {
      await db.query("INSERT INTO users(id,name,email,password_hash) VALUES($1,'Synthetic rollback',$2,'unused')", [businessId, businessId + '@example.test']);
      await enqueueDelivery(db, { topic: 'fixture.mail', key, payload: message, expiresAt: new Date(Date.now() + 600000) });
      throw new Error('Synthetic transaction failure');
    }), /Synthetic transaction/);
    assert.equal((await pool.query('SELECT 1 FROM outbox_events WHERE deduplication_key=$1', [key])).rowCount, 0);
    assert.equal((await pool.query('SELECT 1 FROM users WHERE id=$1', [businessId])).rowCount, 0);
    const ids = await Promise.all([enqueue({ key }), enqueue({ key })]);
    assert.equal(ids[0], ids[1]);
    await assert.rejects(() => enqueue({ key, payload: { ...message, text: 'Changed intent' } }), /deduplication mismatch/);
    const row = await event(ids[0]);
    assert(!JSON.stringify(row).includes(message.to));
    assert(!JSON.stringify(row).includes('synthetic-token'));
    await transaction(db => cancelDelivery(db, ids[0]));
  });

  await t.test('competing workers have one lease, expired leases are reclaimable and old acknowledgements are fenced', async () => {
    const id = await enqueue();
    const claims = await Promise.all([claimDelivery(), claimDelivery()]);
    assert.equal(claims.filter(Boolean).length, 1);
    const first = claims.find(Boolean);
    assert.equal(first.id, id);
    await expireLease(id);
    assert.equal(await settleDelivery(first), false);
    await sweepDeliveries();
    const second = await claimDelivery();
    assert.equal(second.attempts, 2);
    assert.notEqual(second.lease_token, first.lease_token);
    assert.equal(await settleDelivery(first), false);
    assert.equal(await settleDelivery(second), true);
    assert.deepEqual((await pool.query('SELECT status FROM delivery_attempts WHERE event_id=$1 ORDER BY attempt_number', [id])).rows.map(r => r.status), ['abandoned', 'delivered']);
    assert.equal((await event(id)).encrypted_payload, null);
  });

  await t.test('capture preserves readable local mail only as encrypted expiring data', async () => {
    const id = await enqueue();
    assert.equal(await processDelivery({ adapter, renderers }), true);
    const row = await event(id);
    assert.equal(row.status, 'delivered');
    assert.equal(row.attempts, 1);
    assert.equal(row.encrypted_payload, null);
    assert.deepEqual(await capture(id), [message]);
    const stored = (await pool.query('SELECT encrypted_message FROM captured_mail WHERE event_id=$1', [id])).rows[0];
    assert(!JSON.stringify(stored).includes(message.to));
    await pool.query("UPDATE captured_mail SET expires_at=clock_timestamp()-interval '1 second' WHERE event_id=$1", [id]);
    await sweepDeliveries();
    assert.equal((await capture(id)).length, 0);
    assert.equal(await claimDelivery(), null);
  });

  await t.test('delivery retry is delayed, bounded and records only safe error codes', async () => {
    const id = await enqueue({ maxAttempts: 2 });
    const failing = { send: async () => { throw new Error('SECRET provider-body synthetic-token'); } };
    await processDelivery({ adapter: failing, renderers });
    let row = await event(id);
    assert.equal(row.status, 'retry_scheduled');
    assert.equal(row.last_error_code, 'DELIVERY_FAILED');
    assert(new Date(row.next_attempt_at) > new Date());
    assert.equal(await claimDelivery(), null);
    await due(id);
    await processDelivery({ adapter: failing, renderers });
    row = await event(id);
    assert.equal(row.status, 'failed');
    assert.equal(row.attempts, 2);
    assert.equal(row.encrypted_payload, null);
    assert.equal(await claimDelivery(), null);
    assert(!JSON.stringify((await pool.query('SELECT * FROM delivery_attempts WHERE event_id=$1', [id])).rows).includes('SECRET'));
  });

  await t.test('unknown outcome may duplicate mail but cannot repeat the committed business action', async () => {
    const key = randomUUID(), businessId = randomUUID();
    const id = await transaction(async db => {
      await db.query("INSERT INTO users(id,name,email,password_hash) VALUES($1,'Synthetic committed action',$2,'unused')", [businessId, businessId + '@example.test']);
      return enqueueDelivery(db, { topic: 'fixture.mail', key, payload: message, expiresAt: new Date(Date.now() + 600000) });
    });
    const uncertain = { send: async (...args) => { await adapter.send(...args); throw new Error('Synthetic acknowledgement lost'); } };
    await processDelivery({ adapter: uncertain, renderers });
    assert.equal((await event(id)).status, 'retry_scheduled');
    await due(id);
    await processDelivery({ adapter, renderers });
    assert.equal((await event(id)).status, 'delivered');
    assert.equal((await capture(id)).length, 2);
    assert.equal((await pool.query('SELECT 1 FROM users WHERE id=$1', [businessId])).rowCount, 1);
    assert.equal(await enqueue({ key }), id);
    assert.equal(await claimDelivery(), null);
  });

  await t.test('expiry, cancellation and exhausted crashed attempts scrub payloads without delivery', async () => {
    const id = await enqueue();
    await expireEvent(id);
    await processDelivery({ adapter, renderers });
    assert.equal((await event(id)).status, 'expired');
    assert.equal((await event(id)).encrypted_payload, null);
    const crashedId = await enqueue({ maxAttempts: 1 });
    const stale = await claimDelivery();
    await expireLease(crashedId);
    await sweepDeliveries();
    assert.equal((await event(crashedId)).status, 'failed');
    assert.equal((await event(crashedId)).last_error_code, 'LEASE_EXPIRED');
    assert.equal((await event(crashedId)).encrypted_payload, null);
    assert.equal(await settleDelivery(stale), false);
    const cancelled = await enqueue();
    const leased = await claimDelivery();
    await transaction(db => cancelDelivery(db, cancelled));
    assert.equal((await event(cancelled)).encrypted_payload, null);
    await assert.rejects(() => adapter.send(message, { event: leased }));
    assert.equal(await settleDelivery(leased), false);
  });

  await t.test('unsupported or altered payloads fail closed; revoked delivery context cancels', async () => {
    const unknown = await enqueue({ topic: 'unimplemented.topic' });
    await processDelivery({ adapter, renderers });
    assert.equal((await event(unknown)).last_error_code, 'INVALID_PAYLOAD');
    const altered = await enqueue();
    await pool.query(`UPDATE outbox_events SET encrypted_payload=jsonb_set(encrypted_payload,'{tag}','"invalid"') WHERE id=$1`, [altered]);
    await processDelivery({ adapter, renderers });
    assert.equal((await event(altered)).status, 'failed');
    const revoked = await enqueue();
    await processDelivery({ adapter, renderers: { 'fixture.mail': async () => null } });
    assert.equal((await event(revoked)).status, 'cancelled');
    assert.equal((await capture(revoked)).length, 0);
  });

  await t.test('bounded timeout aborts delivery and leaves a safe retry', async () => {
    const id = await enqueue();
    let observedAbort = false;
    const stalled = { send: (_, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => { observedAbort = true; reject(new Error('Aborted')); }, { once: true });
    }) };
    await processDelivery({ adapter: stalled, renderers, timeoutMs: 40 });
    assert.equal(observedAbort, true);
    assert.equal((await event(id)).status, 'retry_scheduled');
    assert.equal((await event(id)).last_error_code, 'DELIVERY_TIMEOUT');
    await transaction(db => cancelDelivery(db, id));
  });
});
