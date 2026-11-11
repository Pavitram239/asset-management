import { pool as platformPool } from '../db/pool.js';
import { getClientPool } from '../db/clientPoolManager.js';
import {
  ensureDatabaseExists,
  applyClientSchema,
  generateClientDatabaseName,
} from '../src/services/provisioning.js';

const isLive = process.argv.includes('--live');
const isRehearsal = process.argv.includes('--rehearsal');

const TABLES_TO_MIGRATE = [
  'organization_departments',
  'roles',
  'role_permissions',
  'user_roles',
  'user_permissions',
  'locations',
  'location_ancestry',
  'category_definitions',
  'category_revisions',
  'unit_definitions',
  'products',
  'asset_assignment_history',
  'catalog_items',
  'catalog_item_history',
  'inventory_lots',
  'inventory_lot_history',
  'inventory_accounts',
  'inventory_journals',
  'inventory_journal_sources',
  'inventory_entries',
  'inventory_balances',
  'inventory_journal_events',
  'api_commands',
  'attachments',
  'attachment_links',
  'asset_requisitions',
  'requisition_items',
  'audit_events',
];

async function run() {
  console.log('=================================================================');
  console.log(` TENANT DATA MIGRATION ENGINE (Mode: ${isLive ? 'LIVE' : isRehearsal ? 'REHEARSAL' : 'DRY-RUN'})`);
  console.log('=================================================================');

  if (!isLive && !isRehearsal) {
    console.log('ℹ️  Running in DRY-RUN mode. No databases or records will be modified.');
    console.log('   Pass --rehearsal to test migration on a synthetic client, or --live to perform actual migration.\n');
  }

  // 1. Fetch all existing organizations
  const { rows: orgs } = await platformPool.query(
    'SELECT id, name, schema_name, database_name, status FROM organizations ORDER BY created_at ASC'
  );

  console.log(`Found ${orgs.length} client organization(s) in platform registry:\n`);

  for (const org of orgs) {
    console.log(`-----------------------------------------------------------------`);
    console.log(`Organization: "${org.name}" (ID: ${org.id})`);
    console.log(`Source Schema: ${org.schema_name || 'public'}`);
    console.log(`Current DB:    ${org.database_name || 'platform default'}`);

    const targetDbName = generateClientDatabaseName(org.name, org.id);
    console.log(`Target DB:     ${targetDbName}`);

    // Inspect record counts in source
    const counts = {};
    const schema = org.schema_name;

    for (const table of TABLES_TO_MIGRATE) {
      try {
        let query;
        if (schema) {
          query = `SELECT count(*)::int AS count FROM "${schema}"."${table}"`;
        } else {
          query = `SELECT count(*)::int AS count FROM "${table}" WHERE organization_id = $1`;
        }
        const res = await platformPool.query(query, schema ? [] : [org.id]);
        counts[table] = res.rows[0]?.count || 0;
      } catch (_) {
        counts[table] = 0;
      }
    }

    const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`\nDiscovered ${totalRecords} total business records to migrate:`);
    for (const [table, cnt] of Object.entries(counts)) {
      if (cnt > 0) {
        console.log(`  - ${table.padEnd(28)} : ${cnt}`);
      }
    }

    if (isLive || (isRehearsal && org.name.toLowerCase().includes('test'))) {
      console.log(`\n🚀 Executing migration to separate database: ${targetDbName}...`);

      // 1. Ensure separate database exists
      await ensureDatabaseExists(targetDbName);
      console.log(`   ✓ Target database "${targetDbName}" ensured`);

      // 2. Apply clean schema to target database
      await platformPool.query(
        'UPDATE organizations SET database_name = $1 WHERE id = $2',
        [targetDbName, org.id]
      );
      const targetPool = await getClientPool(org.id);
      await applyClientSchema(targetPool);
      console.log(`   ✓ Applied client DDL schema to "${targetDbName}"`);

      // 3. Migrate tables safely without deleting source
      const targetClient = await targetPool.connect();
      try {
        await targetClient.query('BEGIN');
        for (const table of TABLES_TO_MIGRATE) {
          if (counts[table] === 0) continue;

          let selectQuery;
          if (schema) {
            selectQuery = `SELECT * FROM "${schema}"."${table}"`;
          } else {
            selectQuery = `SELECT * FROM "${table}" WHERE organization_id = $1`;
          }
          const { rows } = await platformPool.query(selectQuery, schema ? [] : [org.id]);

          if (rows.length > 0) {
            const cols = Object.keys(rows[0]);
            const colList = cols.map(c => `"${c}"`).join(', ');
            for (const r of rows) {
              const valPlaceholders = cols.map((_, i) => `$${i + 1}`).join(', ');
              const values = cols.map(c => r[c]);
              await targetClient.query(
                `INSERT INTO "${table}" (${colList}) VALUES (${valPlaceholders}) ON CONFLICT DO NOTHING`,
                values
              );
            }
          }
        }
        await targetClient.query('COMMIT');
        console.log(`   ✓ Copied all business records cleanly`);
      } catch (err) {
        await targetClient.query('ROLLBACK');
        throw err;
      } finally {
        targetClient.release();
      }

      // 4. Verify record counts
      console.log(`\nVerifying destination record counts:`);
      let allMatched = true;
      for (const [table, expected] of Object.entries(counts)) {
        if (expected === 0) continue;
        const targetRes = await targetPool.query(`SELECT count(*)::int AS count FROM "${table}"`);
        const actual = targetRes.rows[0]?.count || 0;
        const matches = actual >= expected;
        if (!matches) allMatched = false;
        console.log(`  - ${table.padEnd(28)} : Expected ${expected}, Found ${actual} [${matches ? 'OK' : 'MISMATCH'}]`);
      }

      if (allMatched) {
        console.log(`\n✅ Migration verified successfully for "${org.name}"!`);
      } else {
        console.warn(`\n⚠️ Record count mismatch detected for "${org.name}". Original data remains intact.`);
      }
    }
  }

  console.log('\n=================================================================');
  console.log(' MIGRATION RUN COMPLETE (Original tables & schemas preserved)');
  console.log('=================================================================\n');
}

run()
  .catch((e) => {
    console.error('Migration error:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await platformPool.end();
  });

