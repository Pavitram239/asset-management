import { randomUUID } from 'node:crypto';
import { transaction } from '../../db/pool.js';
import { encryptPayload } from './deliveryCrypto.js';

export const validateMail = message => {
  if (!message || typeof message.to !== 'string' || message.to.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to) ||
      typeof message.subject !== 'string' || !message.subject.length || message.subject.length > 200 || /[\r\n]/.test(message.subject) ||
      typeof message.text !== 'string' || !message.text.length || message.text.length > 16000 ||
      Object.keys(message).some(key => !['to', 'subject', 'text'].includes(key))) throw new Error('Invalid mail payload');
  return message;
};

// No network, no console message body and no unauthenticated inbox endpoint.
// Test/operator readers must have database access and the separate encryption key.
export const capturedMailAdapter = () => {
  if (!['development', 'test'].includes(process.env.NODE_ENV)) throw new Error('Captured mail requires development or test mode');
  return {
    async send(message, { event, signal }) {
      validateMail(message);
      signal?.throwIfAborted();
      return transaction(async db => {
        const { rows } = await db.query(`SELECT id FROM outbox_events WHERE id=$1 AND status='leased' AND lease_token=$2
          AND lease_until>clock_timestamp() AND expires_at>clock_timestamp() FOR UPDATE`, [event.id, event.lease_token]);
        if (!rows.length || signal?.aborted) throw new Error('Delivery lease unavailable');
        const id = randomUUID();
        await db.query(`INSERT INTO captured_mail(id,event_id,attempt_id,encrypted_message,expires_at)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(attempt_id) DO NOTHING`,
        [id, event.id, event.lease_token, encryptPayload(message, `capture:${id}:${event.id}`), event.expires_at]);
      });
    },
  };
};

export const configuredMailAdapter = () => {
  if (process.env.MAIL_ADAPTER !== 'capture') throw new Error('Configure MAIL_ADAPTER=capture for local mail; live mail is not configured');
  return capturedMailAdapter();
};
