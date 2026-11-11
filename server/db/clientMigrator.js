import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Runs versioned migrations against a dedicated client database.
 * Ensures client databases are cleanly initialized and safely upgraded over time.
 */
export const runClientMigrations = async (clientPool) => {
  const client = await clientPool.connect();
  try {
    // Serialize migrations across concurrent requests on this client database
    await client.query('SELECT pg_advisory_lock(84910302)');

    // 1. Create client schema migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 2. Discover migration files
    const migrationsDir = resolve(__dirname, 'clientMigrations');
    const names = (await readdir(migrationsDir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();

    const applied = [];
    for (const name of names) {
      const { rows } = await client.query(
        'SELECT version FROM client_schema_migrations WHERE version = $1',
        [name]
      );
      if (rows.length > 0) continue;

      const sqlPath = resolve(migrationsDir, name);
      const sql = await readFile(sqlPath, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO client_schema_migrations (version) VALUES ($1)',
          [name]
        );
        await client.query('COMMIT');
        applied.push(name);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Client migration ${name} failed: ${err.message}`);
      }
    }

    return applied;
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(84910302)'); } catch (_) {}
    client.release();
  }
};

