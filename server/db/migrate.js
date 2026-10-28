import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool, transaction } from "./pool.js";

// The same manifest drives upgrades, read-only verification and isolated fixtures.
export const migrationManifest = async () => {
  const directory = new URL("./migrations/", import.meta.url);
  const names = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(new URL(name, directory), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
};

// 012 is already checksum-recorded on empty installations. Its populated import
// block needs explicit variable precedence for the historical `company` name.
// Scope the compiler directive to that block; do not rewrite the applied file or
// change a connection-wide setting (which would also require elevated rights).
export const executeMigration = async (client, { name, sql }) => {
  if (name === '012_legacy_inventory_cutover.sql') {
    const declaration = 'DECLARE company uuid;';
    if (!sql.includes(declaration)) throw new Error('Legacy import declaration missing');
    sql = sql.replace(declaration, '#variable_conflict use_variable\n' + declaration);
  }
  return client.query(sql);
};

export const migrate = async () =>
  transaction(async (client) => {
    // Serialize migrations across concurrent application instances.
    await client.query("SELECT pg_advisory_xact_lock(73410201)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
    for (const { name, sql, checksum } of await migrationManifest()) {
      const { rows } = await client.query(
        "SELECT checksum FROM schema_migrations WHERE version = $1",
        [name],
      );
      if (rows.length) {
        if (rows[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await executeMigration(client, { name, sql });
      await client.query(
        "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
        [name, checksum],
      );
      console.log(`Applied migration: ${name}`);
    }
  });

// Read-only startup verification for a production runtime identity without DDL privileges.
export const verifyMigrations = async () => {
  const { rows } = await pool.query(
    "SELECT version,checksum FROM schema_migrations",
  );
  for (const { name, checksum } of await migrationManifest()) {
    if (!rows.some((row) => row.version === name && row.checksum === checksum))
      throw new Error(`Run deployment migrations before startup: ${name}`);
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await migrate();
    console.log("PostgreSQL schema is up to date");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
