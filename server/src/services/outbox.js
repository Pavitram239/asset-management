import { randomUUID } from 'node:crypto';
import { transaction } from '../../db/pool.js';
import { encryptPayload, payloadHash } from './deliveryCrypto.js';

const terminalStates = new Set(['delivered', 'failed', 'cancelled', 'expired']);

// Caller supplies its business transaction. No provider call occurs here.
export const enqueueDelivery = async (db, { topic, key, payload, expiresAt, maxAttempts = 5 }) => {
  if (!/^[a-z][a-z0-9_.]{0,79}$/.test(topic) || typeof key !== 'string' || key.length < 1 || key.length > 200 ||
      !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10 ||
      !Number.isFinite(new Date(expiresAt).getTime()) || Buffer.byteLength(JSON.stringify(payload) || '') > 32768)
    throw new Error('Invalid delivery event');
  const id = randomUUID(), hash = payloadHash(payload);
  const encrypted = encryptPayload(payload, `outbox:${id}:${topic}`);
  const { rows } = await db.query(`INSERT INTO outbox_events(id,topic,deduplication_key,payload_hash,encrypted_payload,expires_at,max_attempts)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(deduplication_key) DO NOTHING RETURNING id`,
  [id, topic, key, hash, encrypted, expiresAt, maxAttempts]);
  if (rows.length) return id;
  const { rows: existing } = await db.query('SELECT id,topic,payload_hash FROM outbox_events WHERE deduplication_key=$1', [key]);
  if (existing[0].topic !== topic || existing[0].payload_hash !== hash) throw new Error('Delivery deduplication mismatch');
  return existing[0].id;
};

const finish = async (db, event, status, errorCode = null, retryDelayMs = null) => {
  if (event.lease_token) await db.query(`UPDATE delivery_attempts SET status=$2,error_code=$3,finished_at=clock_timestamp()
    WHERE id=$1 AND status='leased'`, [event.lease_token, status === 'retry_scheduled' && errorCode === 'LEASE_EXPIRED' ? 'abandoned' : status, errorCode]);
  await db.query(`UPDATE outbox_events SET status=$2,last_error_code=$3,lease_token=NULL,lease_until=NULL,
    next_attempt_at=CASE WHEN $4::double precision IS NULL THEN next_attempt_at ELSE clock_timestamp()+($4*interval '1 millisecond') END,
    encrypted_payload=CASE WHEN $5 THEN NULL ELSE encrypted_payload END,
    finished_at=CASE WHEN $5 THEN clock_timestamp() ELSE NULL END WHERE id=$1`,
  [event.id, status, errorCode, retryDelayMs, terminalStates.has(status)]);
};

// Bounded housekeeping also works when every event is expired or exhausted.
export const sweepDeliveries = () => transaction(async db => {
  const { rows } = await db.query(`SELECT *,expires_at<=clock_timestamp() AS is_expired FROM outbox_events WHERE
    (status IN ('pending','retry_scheduled','leased') AND expires_at<=clock_timestamp()) OR
    (status='leased' AND lease_until<=clock_timestamp())
    ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED`);
  for (const event of rows) {
    if (event.is_expired) await finish(db, event, 'expired');
    else if (event.attempts >= event.max_attempts) await finish(db, event, 'failed', 'LEASE_EXPIRED');
    else await finish(db, event, 'retry_scheduled', 'LEASE_EXPIRED', 0);
  }
  await db.query(`DELETE FROM captured_mail WHERE id IN
    (SELECT id FROM captured_mail WHERE expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT 100)`);
  return rows.length;
});

export const claimDelivery = async ({ leaseMs = 60000 } = {}) => {
  if (!Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 300000) throw new Error('Invalid delivery lease');
  return transaction(async db => {
    const { rows } = await db.query(`SELECT * FROM outbox_events WHERE status IN ('pending','retry_scheduled')
      AND attempts<max_attempts AND next_attempt_at<=clock_timestamp() AND expires_at>clock_timestamp()
      ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`);
    if (!rows.length) return null;
    const event = rows[0], leaseToken = randomUUID();
    const updated = await db.query(`UPDATE outbox_events SET status='leased',attempts=attempts+1,lease_token=$2,
      lease_until=clock_timestamp()+($3*interval '1 millisecond') WHERE id=$1 RETURNING *`, [event.id, leaseToken, leaseMs]);
    await db.query(`INSERT INTO delivery_attempts(id,event_id,attempt_number,status) VALUES($1,$2,$3,'leased')`,
      [leaseToken, event.id, updated.rows[0].attempts]);
    return updated.rows[0];
  });
};

export const settleDelivery = (event, { errorCode = null, retryDelayMs = 1000 } = {}) => transaction(async db => {
  if (errorCode && !['DELIVERY_FAILED', 'DELIVERY_TIMEOUT', 'INVALID_PAYLOAD', 'CONTEXT_REVOKED'].includes(errorCode))
    throw new Error('Invalid delivery error code');
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 3600000) throw new Error('Invalid delivery retry');
  const { rows } = await db.query(`SELECT *,expires_at<=clock_timestamp() AS is_expired FROM outbox_events WHERE id=$1 AND status='leased' AND lease_token=$2
    AND lease_until>clock_timestamp() FOR UPDATE`, [event.id, event.lease_token]);
  if (!rows.length) return false; // Lost lease: an old worker cannot acknowledge another attempt.
  const current = rows[0];
  let status = 'delivered';
  if (current.is_expired) status = 'expired';
  else if (errorCode === 'CONTEXT_REVOKED') status = 'cancelled';
  else if (errorCode) status = current.attempts >= current.max_attempts || errorCode === 'INVALID_PAYLOAD' ? 'failed' : 'retry_scheduled';
  await finish(db, current, status, errorCode, retryDelayMs);
  return true;
});

export const cancelDelivery = async (db, id) => {
  const { rows } = await db.query(`SELECT * FROM outbox_events WHERE id=$1 AND status IN ('pending','leased','retry_scheduled') FOR UPDATE`, [id]);
  if (rows.length) await finish(db, rows[0], 'cancelled', 'CONTEXT_REVOKED');
};
