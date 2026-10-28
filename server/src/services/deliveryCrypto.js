import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const encryptionKey = () => {
  const value = process.env.OUTBOX_ENCRYPTION_KEY || '';
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value)
    throw new Error('OUTBOX_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  return key;
};
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
};
export const payloadHash = payload => createHmac('sha256', encryptionKey())
  .update(JSON.stringify(canonical(JSON.parse(JSON.stringify(payload))))).digest('hex');

export const encryptPayload = (payload, context) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
};
export const decryptPayload = (payload, context) => {
  if (payload?.v !== 1) throw new Error('Invalid encrypted payload');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(payload.iv, 'base64'));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8'));
};
export const verifyDeliveryKey = () => { encryptionKey(); };
