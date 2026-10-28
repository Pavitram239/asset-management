import { createHash } from "node:crypto";
import { pool } from "../../db/pool.js";
// PostgreSQL provides a shared atomic store without another infrastructure dependency. Fail closed on store failure.
export const sharedRateLimit =
  ({
    namespace = "authentication",
    windowMs = 15 * 60 * 1000,
    max = 15,
    keyFor = req => req.ip || 'unknown',
  } = {}) =>
  async (req, res, next) => {
    const key =
      namespace +
      ":" +
      createHash("sha256")
        .update(String(keyFor(req)))
        .digest("hex");
    const { rows } = await pool.query(
      `INSERT INTO authentication_attempts(key,count,reset_at) VALUES($1,1,now()+($2 * interval '1 millisecond'))
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN authentication_attempts.reset_at<=now() THEN 1 ELSE authentication_attempts.count+1 END,
    reset_at=CASE WHEN authentication_attempts.reset_at<=now() THEN EXCLUDED.reset_at ELSE authentication_attempts.reset_at END RETURNING count,reset_at`,
      [key, windowMs],
    );
    if (rows[0].count > max) {
      res.setHeader(
        "Retry-After",
        String(
          Math.max(
            1,
            Math.ceil((new Date(rows[0].reset_at) - Date.now()) / 1000),
          ),
        ),
      );
      return res
        .status(429)
        .json({ msg: "Too many attempts. Please try again later.",...(req.commandContract?{code:'RATE_LIMITED',requestId:req.requestId}:{}) });
    }
    next();
  };
