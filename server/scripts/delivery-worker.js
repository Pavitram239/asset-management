import { setTimeout as delay } from 'node:timers/promises';
import { pool } from '../db/pool.js';
import { verifyMigrations } from '../db/migrate.js';
import { verifyDeliveryKey } from '../src/services/deliveryCrypto.js';
import { configuredMailAdapter } from '../src/services/mailAdapter.js';
import { processDelivery } from '../src/services/deliveryWorker.js';
import { identityRenderers } from '../src/services/identity.js';
import { invitationRenderers } from '../src/services/onboarding.js';

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => controller.abort());
try {
  if (process.argv.length !== 3 || !['once', 'run'].includes(process.argv[2])) throw new Error('Use once or run');
  await verifyMigrations();
  verifyDeliveryKey();
  const adapter = configuredMailAdapter();
  const renderers = { ...identityRenderers, ...invitationRenderers };
  do {
    const processed = await processDelivery({ adapter, renderers, signal: controller.signal });
    if (process.argv[2] === 'once') break;
    if (!processed) await delay(1000, undefined, { signal: controller.signal });
  } while (!controller.signal.aborted);
  console.log('Delivery worker stopped');
} catch {
  if (!controller.signal.aborted) {
    console.error('Delivery worker failed. Check configuration, migration state and delivery status.');
    process.exitCode = 1;
  }
} finally { await pool.end(); }
