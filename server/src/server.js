import "./config/env.js";
import app from "./app.js";
import { pool } from "../db/pool.js";
import { migrate, verifyMigrations } from "../db/migrate.js";

const PORT = process.env.PORT || 5100;
try {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET must be configured");
  if (
    process.env.NODE_ENV === "production" &&
    process.env.JWT_SECRET.length < 32
  )
    throw new Error(
      "Production JWT_SECRET must contain at least 32 characters",
    );
  if (
    process.env.NODE_ENV === "production" &&
    !["true", "false"].includes(process.env.COOKIE_SECURE)
  )
    throw new Error("Set COOKIE_SECURE explicitly for deployment transport");
  if (!["true", "false"].includes(process.env.RUN_MIGRATIONS || "true"))
    throw new Error("RUN_MIGRATIONS must be true or false");
  if (process.env.RUN_MIGRATIONS === "false") await verifyMigrations();
  else await migrate();
  console.log("Connected to PostgreSQL");
  const server = app.listen(PORT, () =>
    console.log(`Server started on port ${PORT}`),
  );
  const shutdown = () =>
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} catch (error) {
  console.error("Database startup failed:", error.message);
  await pool.end();
  process.exitCode = 1;
}
