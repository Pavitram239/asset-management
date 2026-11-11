import { randomUUID } from "node:crypto";
import { users } from "../repositories/users.js";
import { provisionOrganization } from "../repositories/organizations.js";
import { comparePassword, hashedPassword } from "../utils/passwordUtils.js";
import { UnauthenticatedError, BadRequestError, InternalServerError } from "../errors/customErrors.js";
import { createJWT, verifyJWT } from "../utils/tokenUtils.js";
import { pickProfileFields } from "../utils/accessPolicy.js";
import { identityConfiguration, issueAccountToken } from '../services/identity.js';
import { tokenHash } from '../services/provisioning.js';
import { pool, transaction } from '../../db/pool.js';
import { getClientPool } from '../../db/clientPoolManager.js';
import { PERMISSIONS } from '../utils/authorization.js';
const unknownAccountHash = await hashedPassword(randomUUID());

export const register = async (req, res) => {
  identityConfiguration();
  const input = pickProfileFields(req.body);
  input.password = await hashedPassword(req.body.password);

  const companyName = (req.body.companyName || input.location || `${input.name.trim()}'s Workspace`).trim();
  const organizationType = req.body.organizationType || null;

  let createdOrg = null;
  const user = await transaction(async (client) => {
    // 1. Insert user
    const { rows } = await client.query(
      `INSERT INTO users (name, first_name, email, password_hash, location)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id AS "_id", name, first_name AS "firstName", email, location, active, session_version AS "sessionVersion"`,
      [input.name, input.firstName || null, input.email.toLowerCase(), input.password, input.location || companyName]
    );
    const u = rows[0];

    // Issue background verification token
    await issueAccountToken(client, { id: u._id, email: u.email }, 'verification');

    // 2. Atomically provision company & tenant schema
    createdOrg = await provisionOrganization(client, u._id, companyName, organizationType);

    return u;
  });

  // 3. Issue instant login token session
  const token = createJWT({ userId: user._id, sessionVersion: user.sessionVersion });
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    expires: new Date(verifyJWT(token).exp * 1000),
    secure:
      process.env.COOKIE_SECURE !== undefined
        ? process.env.COOKIE_SECURE === "true"
        : process.env.NODE_ENV === "production",
  });

  res.status(201).json({
    msg: "Company account created successfully",
    user,
    organization: { id: createdOrg.id, name: createdOrg.name },
    token,
  });
};

export const login = async (req, res) => {
  const user = await users.findByEmail(req.body.email);
  const passwordMatches = await comparePassword(
    req.body.password,
    user?.password || unknownAccountHash,
  );
  if (!user || !user.active || !passwordMatches)
    throw new UnauthenticatedError("Invalid credentials");
  const token = createJWT({ userId: user._id, sessionVersion: user.sessionVersion });
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    expires: new Date(verifyJWT(token).exp * 1000),
    secure:
      process.env.COOKIE_SECURE !== undefined
        ? process.env.COOKIE_SECURE === "true"
        : process.env.NODE_ENV === "production",
  });
  res.status(200).json({ msg: "User logged in", token });
};

export const logout = async (req, res) => {
  res.clearCookie("token", { httpOnly: true, sameSite: "lax" });
  res.status(200).json({ msg: "User logged out" });
};

export const verifyAdminSetupToken = async (req, res) => {
  const token = req.query.token;
  if (!token || typeof token !== 'string' || token.length < 20) {
    throw new BadRequestError('A valid setup token is required');
  }

  const hash = tokenHash(token);
  const { rows } = await pool.query(
    `SELECT t.id, t.organization_id, t.email, t.expires_at, t.consumed_at, t.revoked_at,
            o.name AS organization_name, o.status AS organization_status,
            u.id AS user_id, u.name AS user_name, u.password_hash, u.active AS user_active
     FROM client_setup_tokens t
     JOIN organizations o ON o.id = t.organization_id
     JOIN users u ON u.email = t.email
     WHERE t.token_hash = $1`,
    [hash]
  );

  if (!rows.length) {
    throw new BadRequestError('Invalid or expired administrator setup link');
  }

  const row = rows[0];

  if (row.consumed_at) {
    throw new BadRequestError('This administrator setup link has already been used. Please log in.');
  }

  if (row.revoked_at) {
    throw new BadRequestError('This administrator setup link has been revoked. A newer link may have been issued.');
  }

  if (new Date(row.expires_at) <= new Date()) {
    throw new BadRequestError('This administrator setup link has expired. Please contact platform administration for a new invitation.');
  }

  if (row.organization_status === 'suspended') {
    throw new BadRequestError('This client organization is currently suspended.');
  }

  if (!row.user_active) {
    throw new BadRequestError('This user account is currently deactivated.');
  }

  const isExistingUser = row.password_hash !== '!SETUP_PENDING';

  res.status(200).json({
    valid: true,
    email: row.email,
    name: row.user_name,
    organizationName: row.organization_name,
    isExistingUser,
  });
};

export const completeAdminSetup = async (req, res) => {
  const { token, password, currentPassword } = req.body;
  if (!token || typeof token !== 'string' || token.length < 20) {
    throw new BadRequestError('A valid setup token is required');
  }

  const hash = tokenHash(token);

  // 1. Lock and validate setup token and user in platform database
  const platformClient = await pool.connect();
  let row;
  let newPasswordHash = null;

  try {
    await platformClient.query('BEGIN');
    const { rows } = await platformClient.query(
      `SELECT t.id, t.organization_id, t.email, t.expires_at, t.consumed_at, t.revoked_at,
              o.name AS organization_name, o.status AS organization_status,
              u.id AS user_id, u.name AS user_name, u.password_hash, u.active AS user_active,
              u.session_version AS user_session_version
       FROM client_setup_tokens t
       JOIN organizations o ON o.id = t.organization_id
       JOIN users u ON u.email = t.email
       WHERE t.token_hash = $1
       FOR UPDATE OF t, u`,
      [hash]
    );

    if (!rows.length) {
      throw new BadRequestError('Invalid or expired administrator setup link');
    }

    row = rows[0];

    if (row.consumed_at) {
      throw new BadRequestError('This administrator setup link has already been used. Please log in.');
    }

    if (row.revoked_at) {
      throw new BadRequestError('This administrator setup link has been revoked. A newer link may have been issued.');
    }

    if (new Date(row.expires_at) <= new Date()) {
      throw new BadRequestError('This administrator setup link has expired. Please contact platform administration for a new invitation.');
    }

    if (row.organization_status === 'suspended') {
      throw new BadRequestError('This client organization is currently suspended.');
    }

    if (!row.user_active) {
      throw new BadRequestError('This user account is currently deactivated.');
    }

    const isExistingUser = row.password_hash !== '!SETUP_PENDING';

    if (isExistingUser) {
      if (!currentPassword) {
        throw new UnauthenticatedError('Existing account password is required to activate access.');
      }
      const match = await comparePassword(currentPassword, row.password_hash);
      if (!match) {
        throw new UnauthenticatedError('Invalid current account password.');
      }
    } else {
      if (!password || typeof password !== 'string' || password.length < 8) {
        throw new BadRequestError('Password must be at least 8 characters long.');
      }
      newPasswordHash = await hashedPassword(password);
    }
  } catch (err) {
    try { await platformClient.query('ROLLBACK'); } catch (_) {}
    platformClient.release();
    throw err;
  }

  // 2. Synchronize user and permissions in the dedicated client database BEFORE consuming token
  let clientPool;
  try {
    clientPool = await getClientPool(row.organization_id);
    const clientDb = await clientPool.connect();
    try {
      await clientDb.query('BEGIN');

      // Sync user into client database
      await clientDb.query(
        `INSERT INTO users (id, name, email, active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (id) DO UPDATE SET active = true, email = EXCLUDED.email, name = EXCLUDED.name`,
        [row.user_id, row.user_name, row.email]
      );

      // Locate or seed 'Organization owner' role
      let ownerRole = (await clientDb.query(
        `SELECT id FROM roles WHERE (organization_id = $1 OR organization_id IS NULL) AND name = 'Organization owner' LIMIT 1`,
        [row.organization_id]
      )).rows[0];

      if (!ownerRole) {
        const ownerRoleId = randomUUID();
        await clientDb.query(
          `INSERT INTO roles (id, name, active, organization_id)
           VALUES ($1, 'Organization owner', true, $2)`,
          [ownerRoleId, row.organization_id]
        );
        for (const p of PERMISSIONS) {
          await clientDb.query(
            `INSERT INTO role_permissions (role_id, permission_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [ownerRoleId, p]
          );
        }
        ownerRole = { id: ownerRoleId };
      }

      // Assign owner role in client database
      await clientDb.query(
        `INSERT INTO user_roles (user_id, role_id, scope, organization_id)
         VALUES ($1, $2, 'organization', $3)
         ON CONFLICT DO NOTHING`,
        [row.user_id, ownerRole.id, row.organization_id]
      );

      // Record protected ownership in client database
      await clientDb.query(
        `INSERT INTO organization_owners (organization_id, user_id, created_by)
         VALUES ($1, $2, $2)
         ON CONFLICT (organization_id, user_id) DO NOTHING`,
        [row.organization_id, row.user_id]
      );

      // Grant ownership.manage
      await clientDb.query(
        `INSERT INTO user_permissions (organization_id, user_id, permission_id, scope)
         VALUES ($1, $2, 'ownership.manage', 'organization')
         ON CONFLICT DO NOTHING`,
        [row.organization_id, row.user_id]
      );

      await clientDb.query('COMMIT');
    } catch (clientErr) {
      try { await clientDb.query('ROLLBACK'); } catch (_) {}
      throw clientErr;
    } finally {
      clientDb.release();
    }
  } catch (syncErr) {
    // If client DB synchronization fails, roll back platform transaction so token remains unconsumed for retry
    try { await platformClient.query('ROLLBACK'); } catch (_) {}
    platformClient.release();
    throw new InternalServerError(`Failed to synchronize administrator access in client workspace: ${syncErr.message}`);
  }

  // 3. Client DB synchronization succeeded! Now consume setup token and activate membership in platform DB
  try {
    if (newPasswordHash) {
      await platformClient.query(
        `UPDATE users
         SET password_hash = $1, email_verified_at = clock_timestamp(), updated_at = now()
         WHERE id = $2`,
        [newPasswordHash, row.user_id]
      );
    }

    await platformClient.query(
      `UPDATE client_setup_tokens
       SET consumed_at = clock_timestamp()
       WHERE id = $1`,
      [row.id]
    );

    await platformClient.query(
      `UPDATE memberships
       SET active = true
       WHERE organization_id = $1 AND user_id = $2`,
      [row.organization_id, row.user_id]
    );

    await platformClient.query('COMMIT');
  } catch (platformErr) {
    try { await platformClient.query('ROLLBACK'); } catch (_) {}
    throw platformErr;
  } finally {
    platformClient.release();
  }

  // Issue session cookie
  const sessionToken = createJWT({ userId: row.user_id, sessionVersion: row.user_session_version || 0 });
  res.cookie("token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    expires: new Date(verifyJWT(sessionToken).exp * 1000),
    secure:
      process.env.COOKIE_SECURE !== undefined
        ? process.env.COOKIE_SECURE === "true"
        : process.env.NODE_ENV === "production",
  });

  res.status(200).json({
    msg: "Administrator account setup completed successfully",
    organizationId: row.organization_id,
    user: { id: row.user_id, name: row.user_name, email: row.email },
  });
};
