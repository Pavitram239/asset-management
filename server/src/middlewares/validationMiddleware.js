import { body, validationResult } from 'express-validator';
import { BadRequestError, NotFoundError } from '../errors/customErrors.js';
import { users } from '../repositories/users.js';
import { products } from '../repositories/products.js';
import { isUUID } from '../utils/accessPolicy.js';

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
    if (await users.findByEmail(value)) throw new BadRequestError('Unable to register using the supplied details');
  }),
  body('password').isString().bail().isLength({ min: 8, max: 72 }).withMessage('Password must be between 8 and 72 characters').bail().custom(value=>Buffer.byteLength(value,'utf8')<=72).withMessage('Password must be at most 72 UTF-8 bytes'),
  location(),
]);
export const validateLoginInput = withValidationErrors([
  email(), body('password').isString().bail().notEmpty().withMessage('Password is required').isLength({ max: 72 }).bail()
    .custom(value=>Buffer.byteLength(value,'utf8')<=72).withMessage('Password must be at most 72 UTF-8 bytes'),
]);
export const validateUpdateUserInput = withValidationErrors([
  name(), email().bail().custom(async (value, { req }) => {
    const user = await users.findByEmail(value);
    if (user && user._id !== req.user.userId) throw new BadRequestError('Email already exists');
  }), location(),
]);

export const validateProductIdParam = async (req, res, next) => {
  if (!isUUID(req.params.id)) throw new BadRequestError('Invalid asset ID');
  const permission = req.params.category ? 'asset.file.read' : req.method === 'GET' ? 'asset.read' : req.method === 'DELETE' ? 'asset.delete' : 'asset.update';
  const product = await products.findById(req.params.id, req.user, permission);
  if (!product) throw new NotFoundError('Asset not found');
  req.product = product;
  next();
};
