import pg from 'pg';
import { pool as platformPool } from './pool.js';
import { UnauthorizedError } from '../src/errors/customErrors.js';

// Cache of active client pools: Map<organizationId, { pool: pg.Pool, lastAccessed: number }>
const clientPools = new Map();
const MAX_CACHED_POOLS = 50;

/**
 * Resolves the base runtime connection URL using DATABASE_URL or PG* environment variables.
 */
export const getBaseDatabaseUrl = () => {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
    return process.env.DATABASE_URL;
  }
  const host = process.env.PGHOST || 'localhost';
  const port = process.env.PGPORT || 5432;
  const user = encodeURIComponent(process.env.PGUSER || 'asset_user');
  const password = process.env.PGPASSWORD ? `:${encodeURIComponent(process.env.PGPASSWORD)}` : '';
  const database = encodeURIComponent(process.env.PGDATABASE || 'asset_management');
  return `postgresql://${user}${password}@${host}:${port}/${database}`;
};

/**
 * Resolves current platform database name safely.
 */
export const getCurrentDatabaseName = () => {
  if (process.env.PGDATABASE && process.env.PGDATABASE.trim() !== '') {
    return process.env.PGDATABASE;
  }
  const url = getBaseDatabaseUrl();
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return 'asset_management';
  }
};

/**
 * Builds connection options for a client database.
 * Never leaks credentials to caller or logs.
 */
export const getClientConnectionConfig = (org) => {
  const baseConnectionString = getBaseDatabaseUrl();
  const parsed = new URL(baseConnectionString);
  
  // Client database name is determined strictly by the server-side organization record.
  // Legacy / unmigrated organizations fall back to the central platform database.
  const dbName = org.database_name || getCurrentDatabaseName();
  if (!dbName) {
    throw new Error(`Organization ${org.id} does not have a database configured`);
  }

  // Allow optional per-tenant host/port/user overrides, otherwise default to base server
  parsed.pathname = `/${dbName}`;
  if (org.database_host) parsed.hostname = org.database_host;
  if (org.database_port) parsed.port = String(org.database_port);
  if (org.database_user) parsed.username = org.database_user;

  return {
    connectionString: parsed.toString(),
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
};

/**
 * Safely inserts a pool into the LRU cache, evicting the oldest idle pool when full.
 */
const setCachedPool = (organizationId, pool) => {
  if (clientPools.has(organizationId)) {
    const entry = clientPools.get(organizationId);
    entry.lastAccessed = Date.now();
    return;
  }

  // Enforce max cache boundary by evicting oldest
  if (clientPools.size >= MAX_CACHED_POOLS) {
    let oldestId = null;
    let oldestTime = Infinity;
    for (const [id, entry] of clientPools.entries()) {
      if (entry.pool !== platformPool && entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestId = id;
      }
    }
    if (oldestId) {
      const evicted = clientPools.get(oldestId);
      clientPools.delete(oldestId);
      if (evicted && evicted.pool !== platformPool) {
        evicted.pool.end().catch(() => null);
      }
    }
  }

  clientPools.set(organizationId, { pool, lastAccessed: Date.now() });
};

/**
 * Get or initialize a client pool for an active organization.
 * Rechecks status on EVERY call to guarantee suspension and lifecycle boundaries.
 * 
 * @param {string} organizationId
 * @param {object} [options]
 * @param {boolean} [options.internalProvisioning=false] - Allows internal provisioning path
 */
export const getClientPool = async (organizationId, options = {}) => {
  if (!organizationId) {
    throw new Error('Organization ID is required to resolve client database');
  }

  // 1. Query platform database for current client routing and lifecycle status
  const { rows } = await platformPool.query(
    `SELECT id, name, status, provisioning_status, database_name, database_host, database_port, database_user, schema_name
     FROM organizations
     WHERE id = $1`,
    [organizationId]
  );

  const org = rows[0];
  if (!org) {
    throw new UnauthorizedError('Organization not found');
  }

  // 2. Immediate fail-closed check for suspension (cached pools NEVER bypass suspension)
  if (org.status === 'suspended') {
    await closeClientPool(organizationId);
    throw new UnauthorizedError('Client organization is currently suspended');
  }

  // 3. Lifecycle status boundary check
  if (!options.internalProvisioning) {
    if (org.provisioning_status === 'failed') {
      throw new UnauthorizedError('Client database provisioning failed. Please contact platform administration.');
    }
    if (org.status !== 'active' || org.provisioning_status !== 'provisioned') {
      throw new UnauthorizedError('Client organization is not active or fully provisioned');
    }
  } else {
    // Internal provisioning path: allow 'provisioning', 'active', or 'failed' (during retry)
    if (org.status === 'suspended') {
      throw new UnauthorizedError(`Cannot perform internal provisioning on suspended organization`);
    }
  }

  // 4. Return cached pool if available
  if (clientPools.has(organizationId)) {
    const entry = clientPools.get(organizationId);
    entry.lastAccessed = Date.now();
    return entry.pool;
  }

  // 5. If database is the same as the platform database (or legacy single-db mode), return platformPool
  const currentDb = getCurrentDatabaseName();
  if (!org.database_name || org.database_name === currentDb) {
    setCachedPool(organizationId, platformPool);
    return platformPool;
  }

  // 6. Connect to dedicated client database
  const config = getClientConnectionConfig(org);
  const clientPool = new pg.Pool(config);

  clientPool.on('error', (err) => {
    console.error(`Client database pool error [${org.name}]:`, err.message);
  });

  setCachedPool(organizationId, clientPool);
  return clientPool;
};

/**
 * Safely drains and closes a client pool (e.g. upon suspension or test cleanup).
 */
export const closeClientPool = async (organizationId) => {
  const entry = clientPools.get(organizationId);
  clientPools.delete(organizationId);
  if (entry && entry.pool && entry.pool !== platformPool) {
    try {
      await entry.pool.end();
    } catch (e) {
      console.warn(`Error closing client pool for ${organizationId}:`, e.message);
    }
  }
};

/**
 * Closes all client pools (for server shutdown or test harness).
 */
export const closeAllClientPools = async () => {
  const promises = [];
  for (const [id, entry] of clientPools.entries()) {
    if (entry.pool !== platformPool) {
      promises.push(entry.pool.end().catch(() => null));
    }
  }
  clientPools.clear();
  await Promise.all(promises);
};

/**
 * Helper to run a transactional operation against a client database.
 */
export const clientTransaction = async (organizationId, operation, options = {}) => {
  const pool = await getClientPool(organizationId, options);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
