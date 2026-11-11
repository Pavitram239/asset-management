import { randomUUID } from "node:crypto";
import { users } from "../repositories/users.js";
import { provisionOrganization } from "../repositories/organizations.js";
import { comparePassword, hashedPassword } from "../utils/passwordUtils.js";
import { UnauthenticatedError, BadRequestError } from "../errors/customErrors.js";
import { createJWT, verifyJWT } from "../utils/tokenUtils.js";
import { pickProfileFields } from "../utils/accessPolicy.js";
import { identityConfiguration, issueAccountToken } from '../services/identity.js';
import { tokenHash } from '../services/provisioning.js';
import { pool, transaction } from '../../db/pool.js';
import { getClientPool } from '../../db/clientPoolManager.js';
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

  const result = await transaction(async (client) => {
    const { rows } = await client.query(
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
      const newHash = await hashedPassword(password);
      await client.query(
        `UPDATE users
         SET password_hash = $1, email_verified_at = clock_timestamp(), updated_at = now()
         WHERE id = $2`,
        [newHash, row.user_id]
      );
    }

    // Mark token consumed
    await client.query(
      `UPDATE client_setup_tokens
       SET consumed_at = clock_timestamp()
       WHERE id = $1`,
      [row.id]
    );

    // Activate membership
    await client.query(
      `UPDATE memberships
       SET active = true
       WHERE organization_id = $1 AND user_id = $2`,
      [row.organization_id, row.user_id]
    );

    return {
      userId: row.user_id,
      email: row.email,
      name: row.user_name,
      organizationId: row.organization_id,
      sessionVersion: row.user_session_version || 0,
    };
  });

  // Ensure user and owner role in client database
  try {
    const clientPool = await getClientPool(result.organizationId);
    await clientPool.query(
      `INSERT INTO users (id, name, email, active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (id) DO UPDATE SET active = true, email = EXCLUDED.email, name = EXCLUDED.name`,
      [result.userId, result.name, result.email]
    );

    const ownerRole = (await clientPool.query(
      `SELECT id FROM roles WHERE organization_id = $1 AND name = 'Organization owner' LIMIT 1`,
      [result.organizationId]
    )).rows[0];

    if (ownerRole) {
      await clientPool.query(
        `INSERT INTO user_roles (user_id, role_id, scope, organization_id)
         VALUES ($1, $2, 'organization', $3)
         ON CONFLICT DO NOTHING`,
        [result.userId, ownerRole.id, result.organizationId]
      );
    }
  } catch (err) {
    console.error('Failed to sync admin user in client DB:', err.message);
  }

  // Issue session cookie
  const sessionToken = createJWT({ userId: result.userId, sessionVersion: result.sessionVersion });
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
    organizationId: result.organizationId,
    user: { id: result.userId, name: result.name, email: result.email },
  });
};
