import { pool, transaction } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { hashedPassword } from "../src/utils/passwordUtils.js";
import { randomBytes, randomUUID } from "node:crypto";

const [email, name, password] = process.argv.slice(2);

try {
  if (!email) {
    throw new Error(
      "Usage: npm run bootstrap:superadmin --workspace=server -- <email> [name] [password]"
    );
  }

  await migrate();

  const cleanEmail = email.trim().toLowerCase();
  await transaction(async (db) => {
    const { rows } = await db.query(
      "SELECT id, name FROM users WHERE email = $1",
      [cleanEmail]
    );

    if (rows.length > 0) {
      await db.query(
        "UPDATE users SET is_super_admin = true, active = true WHERE id = $1",
        [rows[0].id]
      );
      console.log(`Granted Platform Super Admin privileges to existing user: ${cleanEmail} (${rows[0].id})`);
    } else {
      const newId = randomUUID();
      const pwd = password || randomBytes(16).toString('hex');
      const hash = await hashedPassword(pwd);
      await db.query(
        `INSERT INTO users (id, name, email, password_hash, is_super_admin, active, email_verified_at)
         VALUES ($1, $2, $3, $4, true, true, now())`,
        [newId, name || 'Platform Super Admin', cleanEmail, hash]
      );
      console.log(`Created new Platform Super Admin: ${cleanEmail}`);
      if (!password) {
        console.log(`Generated temporary password: ${pwd}`);
      }
    }
  });
} catch (err) {
  console.error("Bootstrap error:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

