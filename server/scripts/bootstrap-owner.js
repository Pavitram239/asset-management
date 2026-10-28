import { pool, transaction } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { provisionOrganization } from "../src/repositories/organizations.js";
import { reviewLegacyOwner } from '../src/utils/ownership.js';
import { audit } from '../src/utils/authorization.js';
// Operator-only command; no public HTTP bootstrap and no credentials in command output.
const [email, name] = process.argv.slice(2);
try {
  if (!email || !name)
    throw new Error(
      "Usage: npm run bootstrap:owner --workspace=server -- existing-email organization-name",
    );
  await migrate();
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(73410203)");
    if ((await db.query("SELECT 1 FROM organizations LIMIT 1")).rowCount)
      throw new Error(
        "Bootstrap requires an empty organizations table; use authorized management for additional organizations",
      );
    const { rows } = await db.query(
      "SELECT id FROM users WHERE email=$1 AND active",
      [email.trim().toLowerCase()],
    );
    if (!rows.length) throw new Error("Register the owner account first");
    const organization=await provisionOrganization(db, rows[0].id, name.trim());
    await reviewLegacyOwner(db,organization.id,rows[0].id);
    await audit(db,{organizationId:organization.id},'ownership.operator_review',rows[0].id,{source:'bootstrap-owner CLI'});
  });
  console.log("Owner organization provisioned");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
