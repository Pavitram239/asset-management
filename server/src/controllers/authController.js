import { randomUUID } from "node:crypto";
import { users } from "../repositories/users.js";
import { comparePassword, hashedPassword } from "../utils/passwordUtils.js";
import { UnauthenticatedError } from "../errors/customErrors.js";
import { createJWT, verifyJWT } from "../utils/tokenUtils.js";
import { pickProfileFields } from "../utils/accessPolicy.js";
import { identityConfiguration, issueAccountToken } from '../services/identity.js';
const unknownAccountHash = await hashedPassword(randomUUID());

export const register = async (req, res) => {
  identityConfiguration();
  const input = pickProfileFields(req.body);
  input.password = await hashedPassword(req.body.password);
  await users.register(input, (db, user) => issueAccountToken(db, { id: user._id, email: user.email }, 'verification'));
  res.status(201).json({ msg: "User created" });
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
  res.status(200).json({ msg: "User logged in" });
};
export const logout = async (req, res) => {
  res.clearCookie("token", { httpOnly: true, sameSite: "lax" });
  res.status(200).json({ msg: "User logged out" });
};
