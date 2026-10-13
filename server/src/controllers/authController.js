import { users } from '../repositories/users.js';
import { comparePassword, hashedPassword } from '../utils/passwordUtils.js';
import { UnauthenticatedError, BadRequestError } from '../errors/customErrors.js';
import { createJWT } from '../utils/tokenUtils.js';
import { pickProfileFields } from '../utils/accessPolicy.js';
import { USER_DEPARTMENTS } from '../utils/constants.js';

export const register = async (req, res) => {
  const input = pickProfileFields(req.body);
  if (req.body.department && !Object.values(USER_DEPARTMENTS).includes(req.body.department))
    throw new BadRequestError('Invalid department');
  input.department = req.body.department;
  input.password = await hashedPassword(req.body.password);
  await users.register(input);
  res.status(201).json({ msg: 'User created' });
};
export const login = async (req, res) => {
  const user = await users.findByEmail(req.body.email);
  if (!user || !(await comparePassword(req.body.password, user.password)))
    throw new UnauthenticatedError('Invalid credentials');
  const token = createJWT({ userId: user._id });
  res.cookie('token', token, {
    httpOnly: true, sameSite: 'lax',
    expires: new Date(Date.now() + 86400000),
    secure: process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  });
  res.status(200).json({ msg: 'User logged in' });
};
export const logout = async (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
  res.status(200).json({ msg: 'User logged out' });
};
