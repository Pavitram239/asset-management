import {
  UnauthenticatedError,
  BadRequestError,
} from "../errors/customErrors.js";
import { verifyJWT } from "../utils/tokenUtils.js";
import { users } from '../repositories/users.js';
import { isUUID } from '../utils/accessPolicy.js';
export const authenticateUser = async (req, res, next) => {
  const token = req.cookies?.token || (req.headers?.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);
  if (!token) throw new UnauthenticatedError("Authentication invalid");
  try {
    const { userId, sessionVersion = 0 } = verifyJWT(token);
    if (!isUUID(userId)) throw new UnauthenticatedError('Authentication invalid');
    const user = await users.findById(userId);
    if (!user || user.active === false || !Number.isInteger(sessionVersion) || sessionVersion !== (user.sessionVersion ?? 0)) throw new UnauthenticatedError('Authentication invalid');
    const { name, isSuperAdmin } = user;
    const testUser = user.isDemo;
    req.user = { userId, testUser, name, sessionVersion, isSuperAdmin: !!isSuperAdmin };
    next();
  } catch (error) {
    throw new UnauthenticatedError("Authentication invalid");
  }
};

// Compatibility export: callers must pass permission identifiers, never role names.
export { requirePermission as authorizePermissions } from '../utils/authorization.js';

export const checkForTestUser = (req, res, next) => {
  if (req.user.testUser) throw new BadRequestError("Demo User. Read Only!");
  next();
};
