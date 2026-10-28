import { v2 as cloudinary } from "cloudinary";
import { pool } from "../db/pool.js";
import {verifyMigrations} from '../db/migrate.js';
import { removeFile } from "../src/utils/firebase/firebaseFileOps.js";
// Run periodically as a single operator job. Grace period protects in-flight uploads.
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_SECRET,
});
try {
  await verifyMigrations();
  const { rows } = await pool.query(
    `SELECT * FROM storage_cleanup WHERE created_at<now()-interval '24 hours' ORDER BY id LIMIT 100`,
  );
  for (const row of rows) {
    const key = `${row.folder}/${row.category}/${row.object_name}`;
    const live = await pool.query(
      `SELECT 1 FROM products WHERE product_img=$1 OR invoice=$1 UNION ALL
       SELECT 1 FROM attachments WHERE storage_key=$1 AND (state='linked' OR (state='staged' AND expires_at>clock_timestamp())) LIMIT 1`,
      [key],
    );
    if (row.folder === "cloudinary") {
      const avatar = await pool.query(
        "SELECT 1 FROM users WHERE avatar_public_id=$1 LIMIT 1",
        [row.object_name],
      );
      if (!avatar.rowCount) await cloudinary.uploader.destroy(row.object_name);
    } else if (!live.rowCount)
      await removeFile(row.folder, row.category, row.object_name);
    await pool.query("DELETE FROM storage_cleanup WHERE id=$1", [row.id]);
  }
  await pool.query("DELETE FROM authentication_attempts WHERE reset_at<now()");
  console.log("Storage cleanup batch complete");
} catch (error) {
  console.error("Storage cleanup failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
