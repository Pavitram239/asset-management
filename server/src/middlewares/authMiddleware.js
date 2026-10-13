import {
  UnauthenticatedError,
  BadRequestError,
} from "../errors/customErrors.js";
import { verifyJWT } from "../utils/tokenUtils.js";
import { users } from '../repositories/users.js';
import { isUUID } from '../utils/accessPolicy.js';
import { UnauthorizedError } from '../errors/customErrors.js';
export const authenticateUser = async (req, res, next) => {
  const { token } = req.cookies;
  if (!token) throw new UnauthenticatedError("Authentication invalid");
  try {
    const { userId } = verifyJWT(token);
    if (!isUUID(userId)) throw new UnauthenticatedError('Authentication invalid');
    const user = await users.findById(userId);
    if (!user) throw new UnauthenticatedError('Authentication invalid');
    const { role, department, name } = user;
    const testUser = user.isDemo;
    req.user = { userId, role, department, testUser, name };
    next();
  } catch (error) {
    throw new UnauthenticatedError("Authentication invalid");
  }
};

export const authorizePermissions = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      throw new UnauthorizedError("not authorized to access this route");

    next();
  };
};

export const checkForTestUser = (req, res, next) => {
  if (req.user.testUser) throw new BadRequestError("Demo User. Read Only!");
  next();
};
