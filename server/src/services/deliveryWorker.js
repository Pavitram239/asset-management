import { decryptPayload } from './deliveryCrypto.js';
import { validateMail } from './mailAdapter.js';
import { claimDelivery, settleDelivery, sweepDeliveries } from './outbox.js';

export const retryDelay = attempt => Math.min(3600000, 1000 * 2 ** Math.min(attempt, 11)) * (0.5 + Math.random() * 0.5);

// Renderers are an explicit allowlist, never executable job input. Each owning module
// must recheck account/permission state before returning its message; null cancels.
export const processDelivery = async ({ adapter, renderers, leaseMs = 60000, timeoutMs = 20000, signal } = {}) => {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs >= leaseMs) throw new Error('Delivery timeout must be shorter than its lease');
  await sweepDeliveries();
  if (signal?.aborted) return false;
  const event = await claimDelivery({ leaseMs });
  if (!event) return false;
  const controller = new AbortController();
  let timer, stop;
  const interrupted = new Promise((_, reject) => {
    stop = () => { controller.abort(); reject(new Error('Delivery interrupted')); };
    signal?.addEventListener('abort', stop, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new Error('Delivery timed out')); }, timeoutMs);
  });
  let errorCode = null;
  try {
    const delivery = (async () => {
        let payload;
        try {
          if (!Object.hasOwn(renderers || {}, event.topic) || typeof renderers[event.topic] !== 'function') throw new Error('Unsupported delivery topic');
          payload = decryptPayload(event.encrypted_payload, `outbox:${event.id}:${event.topic}`);
        } catch { return 'INVALID_PAYLOAD'; }
        const message = await renderers[event.topic](payload, { event, signal: controller.signal });
        if (message === null) return 'CONTEXT_REVOKED';
        try { validateMail(message); } catch { return 'INVALID_PAYLOAD'; }
        controller.signal.throwIfAborted();
        await adapter.send(message, { event, signal: controller.signal });
        return null;
    })();
    if (signal?.aborted) stop();
    errorCode = await Promise.race([delivery, interrupted]);
  } catch { errorCode = controller.signal.aborted ? 'DELIVERY_TIMEOUT' : 'DELIVERY_FAILED'; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); }
  await settleDelivery(event, { errorCode, retryDelayMs: retryDelay(event.attempts) });
  return true;
};
