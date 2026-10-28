import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool, transaction } from '../../db/pool.js';
import { enqueueDelivery, cancelDelivery } from './outbox.js';
import { verifyDeliveryKey } from './deliveryCrypto.js';
import { commandHash } from '../utils/commands.js';

export const identityError = (statusCode, apiCode, message) => Object.assign(new Error(message), { statusCode, apiCode });
const hashToken = token => createHash('sha256').update(token).digest('hex');
export const accepted = { data: { accepted: true } };

export const identityConfiguration = () => {
  try {
    verifyDeliveryKey();
    const url = new URL(process.env.APP_PUBLIC_URL);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error();
    if (process.env.MAIL_ADAPTER !== 'capture' || !['development', 'test'].includes(process.env.NODE_ENV)) throw new Error();
    return url.origin;
  } catch { throw identityError(503, 'DELIVERY_UNAVAILABLE', 'Account mail is not configured'); }
};

const revokeTokens = async (db, userId, purpose) => {
  const { rows } = await db.query(`UPDATE account_tokens SET revoked_at=clock_timestamp()
    WHERE user_id=$1 AND ($2::text IS NULL OR purpose=$2) AND consumed_at IS NULL AND revoked_at IS NULL RETURNING outbox_id`, [userId, purpose]);
  for (const token of rows) await cancelDelivery(db, token.outbox_id);
};

// Requires a locked user row (newly inserted users are already locked by INSERT).
export const issueAccountToken = async (db, user, purpose) => {
  const origin = identityConfiguration();
  await revokeTokens(db, user.id, purpose);
  const token = randomBytes(32).toString('base64url'), id = randomUUID();
  const { rows } = await db.query(`SELECT clock_timestamp()+($1*interval '1 minute') AS expires_at`, [purpose === 'verification' ? 1440 : 30]);
  const expiresAt = rows[0].expires_at;
  const outboxId = await enqueueDelivery(db, {
    topic: 'account.' + purpose, key: 'account-token:' + id,
    payload: { tokenId: id, userId: user.id, email: user.email, token, origin }, expiresAt,
  });
  await db.query(`INSERT INTO account_tokens(id,user_id,purpose,email,token_hash,outbox_id,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, user.id, purpose, user.email, hashToken(token), outboxId, expiresAt]);
};

export const requestVerification = async (req, res) => {
  const key = req.get('Idempotency-Key');
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(key || '') || (req.body && (Array.isArray(req.body) || typeof req.body !== 'object' || Object.keys(req.body).length)))
    throw identityError(400, 'VALIDATION_ERROR', 'Supply an Idempotency-Key and an empty body');
  identityConfiguration();
  const hash = commandHash(req.path, {});
  try {
    await transaction(async db => {
      await db.query("SET LOCAL lock_timeout='3s'");
      // Lock before inserting the FK-backed command to avoid competing key-share upgrades.
      const { rows: accounts } = await db.query('SELECT id,email,email_verified_at,active,session_version FROM users WHERE id=$1 FOR UPDATE', [req.user.userId]);
      const user = accounts[0];
      if (!user?.active || user.session_version !== req.user.sessionVersion) throw identityError(401, 'UNAUTHENTICATED', 'Authentication invalid');
      await db.query(`INSERT INTO api_commands(id,actor_id,operation_id,idempotency_key,request_hash)
        VALUES($1,$2,'requestVerification',$3,$4) ON CONFLICT DO NOTHING`, [randomUUID(), req.user.userId, key, hash]);
      const { rows: commands } = await db.query(`SELECT * FROM api_commands WHERE actor_id=$1 AND organization_id IS NULL
        AND operation_id='requestVerification' AND idempotency_key=$2`, [user.id, key]);
      const command = commands[0];
      if (command.request_hash !== hash) throw identityError(409, 'IDEMPOTENCY_MISMATCH', 'This key belongs to a different request');
      if (command.committed_at) return;
      if (!user.email_verified_at) await issueAccountToken(db, user, 'verification');
      await db.query(`UPDATE api_commands SET resource_type='account',resource_id=$2,result=$3,committed_at=clock_timestamp() WHERE id=$1`, [command.id, user.id, accepted.data]);
    });
  } catch (error) {
    if (error.code === '55P03') { res.setHeader('Retry-After', '1'); throw identityError(409, 'COMMAND_IN_PROGRESS', 'Retry this request with the same key'); }
    throw error;
  }
  res.status(202).json(accepted);
};

export const requestRecovery = async (req, res) => {
  identityConfiguration();
  await transaction(async db => {
    const { rows } = await db.query('SELECT id,email,active,is_demo FROM users WHERE email=$1 FOR UPDATE', [req.body.email]);
    if (rows[0]?.active && !rows[0].is_demo) await issueAccountToken(db, rows[0], 'recovery');
  });
  res.status(202).json(accepted);
};

export const consumeAccountToken = async (token, purpose, passwordHash) => transaction(async db => {
  const invalid = () => identityError(400, 'INVALID_TOKEN', 'This link is invalid or expired. Request a new link.');
  // Discover without locking; all mutations lock user before token to match resend/profile.
  const { rows: matches } = await db.query('SELECT user_id FROM account_tokens WHERE token_hash=$1 AND purpose=$2', [hashToken(token), purpose]);
  if (!matches.length) throw invalid();
  const { rows: users } = await db.query('SELECT id,email,active,is_demo FROM users WHERE id=$1 FOR UPDATE', [matches[0].user_id]);
  const user = users[0];
  const { rows } = await db.query(`SELECT * FROM account_tokens WHERE token_hash=$1 AND purpose=$2 AND consumed_at IS NULL
    AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`, [hashToken(token), purpose]);
  if (!user?.active || user.is_demo || !rows.length || rows[0].email !== user.email) throw invalid();
  await db.query('UPDATE account_tokens SET consumed_at=clock_timestamp() WHERE id=$1', [rows[0].id]);
  await cancelDelivery(db, rows[0].outbox_id);
  if (purpose === 'verification') await db.query('UPDATE users SET email_verified_at=clock_timestamp() WHERE id=$1', [user.id]);
  else {
    await db.query('UPDATE users SET password_hash=$2,session_version=session_version+1 WHERE id=$1', [user.id, passwordHash]);
    await revokeTokens(db, user.id, 'recovery');
  }
  await db.query(`INSERT INTO audit_events(actor_id,action,target,outcome) VALUES($1,$2,$3,'success')`, [user.id, purpose === 'verification' ? 'account.verified' : 'account.password-reset', user.id]);
});

export const identityRenderers = Object.fromEntries(['verification', 'recovery'].map(purpose => ['account.' + purpose, async (payload, { event }) => {
  const { rows } = await pool.query(`SELECT 1 FROM account_tokens t JOIN users u ON u.id=t.user_id
    WHERE t.id=$1 AND t.user_id=$2 AND t.outbox_id=$3 AND t.purpose=$4 AND t.email=$5 AND u.email=t.email
    AND t.token_hash=$6 AND u.active AND t.consumed_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>clock_timestamp()
    AND ($4<>'verification' OR u.email_verified_at IS NULL)`, [payload.tokenId, payload.userId, event.id, purpose, payload.email, hashToken(payload.token)]);
  if (!rows.length) return null;
  const verification = purpose === 'verification';
  return { to: payload.email, subject: verification ? 'Verify your AssetOS email' : 'Reset your AssetOS password',
    text: `${verification ? 'Verify your email' : 'Choose a new password'}: ${payload.origin}/${verification ? 'verify-email' : 'reset-password'}#${payload.token}\nThis link expires ${verification ? 'in 24 hours' : 'in 30 minutes'} and can be used once. If you did not request it, ignore this message.` };
}]));

export const accountCommandLookup = async (req, res) => {
  if (req.params.operationId !== 'requestVerification' || !/^[A-Za-z0-9_-]{16,100}$/.test(req.params.idempotencyKey))
    throw identityError(404, 'NOT_FOUND', 'Command not found');
  const { rows } = await pool.query(`SELECT operation_id AS "operationId",idempotency_key AS "idempotencyKey",resource_type AS "resourceType",
    resource_id AS "resourceId",committed_at AS "committedAt" FROM api_commands WHERE actor_id=$1 AND organization_id IS NULL
    AND operation_id=$2 AND idempotency_key=$3 AND committed_at IS NOT NULL`, [req.user.userId, req.params.operationId, req.params.idempotencyKey]);
  if (!rows.length) throw identityError(404, 'NOT_FOUND', 'Command not found');
  res.json({ data: { ...rows[0], status: 'committed' } });
};
