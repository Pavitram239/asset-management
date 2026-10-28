import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { testDatabase } from '../testing/testDatabase.js';

test('verified identity and recovery through real database, HTTP and captured mail', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  process.env.NODE_ENV = 'test';
  const { pool, api } = await testDatabase(t);
  const { transaction } = await import('../db/pool.js');
  const { decryptPayload } = await import('../src/services/deliveryCrypto.js');
  const { processDelivery } = await import('../src/services/deliveryWorker.js');
  const { cancelDelivery } = await import('../src/services/outbox.js');
  const { capturedMailAdapter } = await import('../src/services/mailAdapter.js');
  const { identityRenderers } = await import('../src/services/identity.js');
  const { createJWT } = await import('../src/utils/tokenUtils.js');
  const password = 'Synthetic-original-password';
  const contract = JSON.parse(await readFile(new URL('../../docs/openapi.json', import.meta.url), 'utf8'));
  const Ajv = createRequire(import.meta.url)('ajv');
  const ajv = new Ajv({ allErrors: true, nullable: true });
  const identityPaths = new Set(['/auth/verification-requests', '/auth/email-verifications', '/auth/recovery-requests', '/auth/password-resets']);
  const validators = new Map();
  const post = async (route, body, cookie, headers = {}) => {
    const response = await api(route, { method: 'POST', body, cookie, headers });
    if (identityPaths.has(route)) {
      const key = route + ':' + response.status;
      if (!validators.has(key)) {
        const definition = contract.paths[route].post.responses[String(response.status)];
        const resolved = definition.$ref ? definition.$ref.slice(2).split('/').reduce((value, part) => value[part], contract) : definition;
        validators.set(key, ajv.compile({ ...resolved.content['application/json'].schema, components: contract.components }));
      }
      const validate = validators.get(key);
      assert(validate(response.data), `${route} ${response.status}: ${JSON.stringify(validate.errors)}`);
    }
    return response;
  };
  t.beforeEach(async () => { await pool.query('DELETE FROM authentication_attempts'); });
  const fixture = async () => {
    const email = randomUUID() + '@example.test';
    const register = await post('/auth/register', { name: 'Synthetic account', location: 'Office', email, password, role: 'admin', emailVerified: true });
    assert.equal(register.status, 201, JSON.stringify(register.data));
    assert.equal(register.headers.get('set-cookie'), null);
    const user = (await pool.query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
    const cookie = 'token=' + createJWT({ userId: user.id }); // Legacy version-0 compatibility.
    return { ...user, cookie };
  };
  const tokenFor = async (id, purpose) => {
    const { rows } = await pool.query(`SELECT t.*,o.encrypted_payload,o.topic FROM account_tokens t JOIN outbox_events o ON o.id=t.outbox_id
      WHERE t.user_id=$1 AND t.purpose=$2 AND t.consumed_at IS NULL AND t.revoked_at IS NULL ORDER BY t.created_at DESC LIMIT 1`, [id, purpose]);
    const row = rows[0];
    return { ...row, raw: decryptPayload(row.encrypted_payload, `outbox:${row.outbox_id}:${row.topic}`).token };
  };
  const resend = (f, key = randomUUID()) => post('/auth/verification-requests', {}, f.cookie, { 'Idempotency-Key': key });

  await t.test('registration queues a recipient-bound encrypted link without a session or any membership/grant', async () => {
    const f = await fixture(), token = await tokenFor(f.id, 'verification');
    assert.equal(f.email_verified_at, null);
    assert.equal(f.session_version, 0);
    assert.equal((await pool.query('SELECT 1 FROM memberships WHERE user_id=$1', [f.id])).rowCount, 0);
    assert.equal((await pool.query('SELECT 1 FROM user_permissions WHERE user_id=$1', [f.id])).rowCount, 0);
    assert.notEqual(token.token_hash, token.raw);
    assert(!JSON.stringify((await pool.query('SELECT * FROM account_tokens WHERE id=$1', [token.id])).rows).includes(token.raw));
    await processDelivery({ adapter: capturedMailAdapter(), renderers: identityRenderers });
    const captured = (await pool.query('SELECT * FROM captured_mail WHERE event_id=$1', [token.outbox_id])).rows[0];
    const mail = decryptPayload(captured.encrypted_message, `capture:${captured.id}:${token.outbox_id}`);
    assert.equal(mail.to, f.email);
    assert(mail.text.includes('/verify-email#' + token.raw));
    assert(!mail.text.includes('?token='));
    assert.equal((await api('/users/current-user', { cookie: f.cookie })).data.user.emailVerified, false);
  });

  await t.test('verification consumes once, grants nothing and never verifies another account', async () => {
    const f = await fixture(), other = await fixture(), token = await tokenFor(f.id, 'verification');
    const results = await Promise.all([post('/auth/email-verifications', { token: token.raw }, other.cookie), post('/auth/email-verifications', { token: token.raw })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
    assert((await pool.query('SELECT email_verified_at FROM users WHERE id=$1', [f.id])).rows[0].email_verified_at);
    assert.equal((await pool.query('SELECT email_verified_at FROM users WHERE id=$1', [other.id])).rows[0].email_verified_at, null);
    assert.equal((await pool.query('SELECT 1 FROM memberships WHERE user_id=$1', [f.id])).rowCount, 0);
    assert.equal((await post('/auth/email-verifications', { token: token.raw })).data.code, 'INVALID_TOKEN');
    assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE actor_id=$1 AND action='account.verified'", [f.id])).rowCount, 1);
  });

  await t.test('resend revokes previous tokens and recovers a durable account command across response-cache expiry', async () => {
    const f = await fixture(), previous = await tokenFor(f.id, 'verification'), key = randomUUID();
    const responses = await Promise.all([resend(f, key), resend(f, key)]);
    assert.deepEqual(responses.map(r => r.status), [202, 202]);
    const current = await tokenFor(f.id, 'verification');
    assert.notEqual(current.id, previous.id);
    assert.equal((await post('/auth/email-verifications', { token: previous.raw })).status, 400);
    assert.equal((await pool.query('SELECT status,encrypted_payload FROM outbox_events WHERE id=$1', [previous.outbox_id])).rows[0].status, 'cancelled');
    await pool.query("UPDATE api_commands SET result=NULL WHERE actor_id=$1 AND operation_id='requestVerification'", [f.id]);
    assert.equal((await resend(f, key)).status, 202);
    assert.equal((await tokenFor(f.id, 'verification')).id, current.id);
    const lookup = await api('/commands/requestVerification/' + key + '?context=account', { cookie: f.cookie });
    assert.equal(lookup.status, 200);
    assert.equal(lookup.data.data.resourceId, f.id);
    const outsider = await fixture();
    assert.equal((await api('/commands/requestVerification/' + key + '?context=account', { cookie: outsider.cookie })).status, 404);
  });

  await t.test('expired, disabled and old-address links fail without changing verification', async () => {
    const f = await fixture(), token = await tokenFor(f.id, 'verification');
    await pool.query("UPDATE account_tokens SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' WHERE id=$1", [token.id]);
    assert.equal((await post('/auth/email-verifications', { token: token.raw })).status, 400);
    await resend(f);
    const disabled = await tokenFor(f.id, 'verification');
    await pool.query('UPDATE users SET active=false WHERE id=$1', [f.id]);
    assert.equal((await post('/auth/email-verifications', { token: disabled.raw })).status, 400);
    await pool.query('UPDATE users SET active=true WHERE id=$1', [f.id]);
    await post('/auth/recovery-requests', { email: f.email });
    const recovery = await tokenFor(f.id, 'recovery');
    await pool.query('UPDATE users SET email=$2,email_verified_at=clock_timestamp() WHERE id=$1', [f.id, randomUUID() + '@example.test']);
    assert.equal((await pool.query('SELECT email_verified_at FROM users WHERE id=$1', [f.id])).rows[0].email_verified_at, null);
    assert.equal((await post('/auth/email-verifications', { token: disabled.raw })).status, 400);
    assert.equal((await post('/auth/password-resets', { token: recovery.raw, password: 'Synthetic-new-password' })).status, 400);
    assert.equal((await pool.query('SELECT 1 FROM account_tokens WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL', [f.id])).rowCount, 0);
  });

  await t.test('recovery is generic for unknown/disabled/demo accounts and supersedes older recovery links', async () => {
    const f = await fixture();
    const present = await post('/auth/recovery-requests', { email: f.email.toUpperCase() });
    const missing = await post('/auth/recovery-requests', { email: 'unknown@example.test' });
    assert.equal(present.status, 202); assert.deepEqual(missing.data, present.data);
    const previous = await tokenFor(f.id, 'recovery');
    await post('/auth/recovery-requests', { email: f.email });
    const current = await tokenFor(f.id, 'recovery');
    assert.notEqual(current.id, previous.id);
    assert.equal((await post('/auth/password-resets', { token: previous.raw, password: 'Synthetic-new-password' })).status, 400);
    await pool.query('UPDATE users SET active=false WHERE id=$1', [f.id]);
    assert.deepEqual((await post('/auth/recovery-requests', { email: f.email })).data, present.data);
    const count = (await pool.query("SELECT count(*)::int AS n FROM account_tokens WHERE user_id=$1 AND purpose='recovery'", [f.id])).rows[0].n;
    assert.equal(count, 2);
    const demo = await fixture();
    await pool.query('UPDATE users SET is_demo=true WHERE id=$1', [demo.id]);
    assert.deepEqual((await post('/auth/recovery-requests', { email: demo.email })).data, present.data);
    assert.equal((await pool.query("SELECT 1 FROM account_tokens WHERE user_id=$1 AND purpose='recovery'", [demo.id])).rowCount, 0);
  });

  await t.test('password reset consumes once, invalidates legacy/current sessions, preserves verification and requires the new password', async () => {
    const f = await fixture(), verification = await tokenFor(f.id, 'verification');
    await post('/auth/email-verifications', { token: verification.raw });
    const logged = await post('/auth/login', { email: f.email, password });
    const currentCookie = logged.headers.get('set-cookie').split(';')[0];
    await post('/auth/recovery-requests', { email: f.email });
    const token = await tokenFor(f.id, 'recovery'), nextPassword = 'Synthetic-next-password';
    assert.equal((await post('/auth/password-resets', { token: token.raw, password: 'é'.repeat(37) })).status, 400);
    const resets = await Promise.all([post('/auth/password-resets', { token: token.raw, password: nextPassword }), post('/auth/password-resets', { token: token.raw, password: nextPassword })]);
    assert.deepEqual(resets.map(r => r.status).sort(), [200, 400]);
    for (const cookie of [f.cookie, currentCookie]) assert.equal((await api('/users/current-user', { cookie })).status, 401);
    assert.equal((await post('/auth/login', { email: f.email, password })).status, 401);
    const login = await post('/auth/login', { email: f.email, password: nextPassword });
    assert.equal(login.status, 200);
    const profile = await api('/users/current-user', { cookie: login.headers.get('set-cookie').split(';')[0] });
    assert.equal(profile.status, 200); assert.equal(profile.data.user.emailVerified, true); assert(!('sessionVersion' in profile.data.user));
    assert.equal((await pool.query('SELECT session_version FROM users WHERE id=$1', [f.id])).rows[0].session_version, 1);
  });

  await t.test('cross-origin denial, authenticated resend, strict validation and recipient throttling are enforced', async () => {
    const f = await fixture();
    assert.equal((await post('/auth/verification-requests', {})).status, 401);
    assert.equal((await post('/auth/verification-requests', {}, f.cookie)).status, 400);
    assert.equal((await post('/auth/recovery-requests', { email: f.email }, null, { Origin: 'https://foreign.example.test' })).status, 403);
    assert.equal((await post('/auth/recovery-requests', { email: f.email, role: 'admin' })).status, 400);
    for (let i = 0; i < 3; i++) assert.equal((await post('/auth/recovery-requests', { email: 'missing-limit@example.test' })).status, 202);
    const limited = await post('/auth/recovery-requests', { email: 'missing-limit@example.test' });
    assert.equal(limited.status, 429); assert(limited.headers.get('retry-after')); assert(limited.data.requestId);
  });

  await t.test('expired recovery fails; resetting an unverified account never marks its email verified', async () => {
    const f = await fixture();
    await post('/auth/recovery-requests', { email: f.email });
    const expired = await tokenFor(f.id, 'recovery');
    await pool.query("UPDATE account_tokens SET created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE id=$1", [expired.id]);
    assert.equal((await post('/auth/password-resets', { token: expired.raw, password: 'Synthetic-new-password' })).status, 400);
    await post('/auth/recovery-requests', { email: f.email });
    const current = await tokenFor(f.id, 'recovery');
    assert.equal((await post('/auth/password-resets', { token: current.raw, password: 'Synthetic-new-password' })).status, 200);
    assert.equal((await pool.query('SELECT email_verified_at FROM users WHERE id=$1', [f.id])).rows[0].email_verified_at, null);
  });

  await t.test('profile email change and new link commit together; delivery configuration failure preserves the saved account', async () => {
    const f = await fixture(), initial = await tokenFor(f.id, 'verification');
    await post('/auth/email-verifications', { token: initial.raw });
    const nextEmail = randomUUID() + '@example.test';
    const body = { name: 'Synthetic updated account', email: nextEmail, location: 'Office', emailVerified: true };
    const key = process.env.OUTBOX_ENCRYPTION_KEY;
    process.env.OUTBOX_ENCRYPTION_KEY = '';
    try {
      assert.equal((await api('/users/update-user', { method: 'PATCH', body, cookie: f.cookie })).status, 503);
      const row = (await pool.query('SELECT email,email_verified_at FROM users WHERE id=$1', [f.id])).rows[0];
      assert.equal(row.email, f.email); assert(row.email_verified_at);
    } finally { process.env.OUTBOX_ENCRYPTION_KEY = key; }
    assert.equal((await api('/users/update-user', { method: 'PATCH', body, cookie: f.cookie })).status, 200);
    const row = (await pool.query('SELECT email,email_verified_at FROM users WHERE id=$1', [f.id])).rows[0];
    assert.equal(row.email, nextEmail); assert.equal(row.email_verified_at, null);
    const issued = await tokenFor(f.id, 'verification');
    assert.equal(issued.email, nextEmail);
    assert.equal((await post('/auth/email-verifications', { token: issued.raw })).status, 200);
  });

  await t.test('mail configuration failure rolls back registration; invalidated contexts do not reach the adapter', async () => {
    const key = process.env.OUTBOX_ENCRYPTION_KEY;
    process.env.OUTBOX_ENCRYPTION_KEY = '';
    try {
      assert.equal((await post('/auth/register', { email: 'config-failure@example.test', name: 'Synthetic', location: 'Office', password })).status, 503);
      assert.equal((await pool.query("SELECT 1 FROM users WHERE email='config-failure@example.test'")).rowCount, 0);
    } finally { process.env.OUTBOX_ENCRYPTION_KEY = key; }
    const pending = (await pool.query("SELECT id FROM outbox_events WHERE status IN ('pending','retry_scheduled')")).rows;
    await transaction(async db => { for (const row of pending) await cancelDelivery(db, row.id); });
    const f = await fixture(), token = await tokenFor(f.id, 'verification');
    await pool.query('UPDATE users SET active=false WHERE id=$1', [f.id]);
    let called = false;
    await processDelivery({ adapter: { send: async () => { called = true; } }, renderers: identityRenderers });
    assert.equal(called, false);
    assert.equal((await pool.query('SELECT status FROM outbox_events WHERE id=$1', [token.outbox_id])).rows[0].status, 'cancelled');
  });
});
