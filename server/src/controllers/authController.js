import { randomUUID } from "node:crypto";
import { users } from "../repositories/users.js";
import { provisionOrganization } from "../repositories/organizations.js";
import { comparePassword, hashedPassword } from "../utils/passwordUtils.js";
import { UnauthenticatedError, BadRequestError } from "../errors/customErrors.js";
import { createJWT, verifyJWT } from "../utils/tokenUtils.js";
import { pickProfileFields } from "../utils/accessPolicy.js";
import { identityConfiguration, issueAccountToken } from '../services/identity.js';
import { transaction } from '../../db/pool.js';
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
