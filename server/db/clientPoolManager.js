import pg from 'pg';
import { pool as platformPool } from './pool.js';
import { UnauthorizedError } from '../src/errors/customErrors.js';

// Cache of active client pools keyed by organization ID
const clientPools = new Map();

/**
 * Builds connection options for a client database.
 * Never leaks credentials to caller or logs.
 */
export const getClientConnectionConfig = (org) => {
  const baseConnectionString = process.env.DATABASE_URL;
  if (!baseConnectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  const parsed = new URL(baseConnectionString);
  
  // Client database name is determined strictly by the server-side organization record
  const dbName = org.database_name;
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
 * Get or initialize a client pool for an active organization.
 */
export const getClientPool = async (organizationId) => {
  if (!organizationId) {
    throw new Error('Organization ID is required to resolve client database');
  }

  if (clientPools.has(organizationId)) {
    return clientPools.get(organizationId);
  }

  // Query platform database for client routing record
  const { rows } = await platformPool.query(
    `SELECT id, name, status, database_name, database_host, database_port, database_user
     FROM organizations
     WHERE id = $1`,
    [organizationId]
  );

  const org = rows[0];
  if (!org) {
    throw new UnauthorizedError('Organization not found');
  }

  if (org.status === 'suspended') {
    throw new UnauthorizedError('Client organization is currently suspended');
  }

  if (org.provisioning_status === 'failed') {
    throw new UnauthorizedError('Client database provisioning failed. Please contact platform administration.');
  }

  // If database is the same as the platform database (e.g. legacy/single-db mode), return platformPool
  const currentDb = decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.replace(/^\//, ''));
  if (org.database_name === currentDb) {
    clientPools.set(organizationId, platformPool);
    return platformPool;
  }

  const config = getClientConnectionConfig(org);
  const clientPool = new pg.Pool(config);

  clientPool.on('error', (err) => {
    console.error(`Client database pool error [${org.name}]:`, err.message);
  });

  clientPools.set(organizationId, clientPool);
  return clientPool;
};

/**
 * Safely drains and closes a client pool (e.g., upon suspension or test cleanup).
 */
export const closeClientPool = async (organizationId) => {
  const pool = clientPools.get(organizationId);
  if (pool && pool !== platformPool) {
    clientPools.delete(organizationId);
    try {
      await pool.end();
    } catch (e) {
      console.warn(`Error closing client pool for ${organizationId}:`, e.message);
    }
  } else {
    clientPools.delete(organizationId);
  }
};

/**
 * Closes all client pools (for server shutdown or test harness).
 */
export const closeAllClientPools = async () => {
  const promises = [];
  for (const [id, pool] of clientPools.entries()) {
    if (pool !== platformPool) {
      promises.push(pool.end().catch(() => null));
    }
  }
  clientPools.clear();
  await Promise.all(promises);
};

/**
 * Helper to run a transactional operation against a client database.
 */
export const clientTransaction = async (organizationId, operation) => {
  const pool = await getClientPool(organizationId);
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

