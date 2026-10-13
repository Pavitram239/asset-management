import { body, validationResult } from 'express-validator';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../errors/customErrors.js';
import { users } from '../repositories/users.js';
import { products } from '../repositories/products.js';
import { canAccessAsset, isUUID } from '../utils/accessPolicy.js';

const withValidationErrors = (validators) => [
  validators,
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new BadRequestError(errors.array().map((error) => error.msg));
    next();
  },
];
const email = () => body('email').isString().bail().trim().toLowerCase().isEmail().withMessage('Email is invalid').isLength({ max: 254 });
const name = () => body('name').isString().bail().trim().notEmpty().withMessage('Name is required').isLength({ max: 200 });
const location = () => body('location').isString().bail().trim().notEmpty().withMessage('Location is required').isLength({ max: 500 });

export const validateRegisterInput = withValidationErrors([
  name(), email().bail().custom(async (value) => {
    if (await users.findByEmail(value)) throw new BadRequestError('Email already in use');
  }),
  body('password').isString().bail().isLength({ min: 8, max: 72 }).withMessage('Password must be between 8 and 72 characters'),
  location(),
]);
export const validateLoginInput = withValidationErrors([
  email(), body('password').isString().bail().notEmpty().withMessage('Password is required').isLength({ max: 72 }),
]);
export const validateUpdateUserInput = withValidationErrors([
  name(), email().bail().custom(async (value, { req }) => {
    const user = await users.findByEmail(value);
    if (user && user._id !== req.user.userId) throw new BadRequestError('Email already exists');
  }), location(),
]);

export const validateProductIdParam = async (req, res, next) => {
  if (!isUUID(req.params.id)) throw new BadRequestError('Invalid asset ID');
  const product = await products.findById(req.params.id);
  if (!product) throw new NotFoundError('Asset not found');
  if (!canAccessAsset(req.user, product)) throw new UnauthorizedError('Not authorized to access this asset');
  req.product = product;
  next();
};
