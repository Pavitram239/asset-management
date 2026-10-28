import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateUser, checkForTestUser } from '../middlewares/authMiddleware.js';
import { sharedRateLimit } from '../middlewares/sharedRateLimit.js';
import { hashedPassword } from '../utils/passwordUtils.js';
import { accepted, consumeAccountToken, identityError, requestRecovery, requestVerification } from '../services/identity.js';

const router = Router();
const ipLimit = sharedRateLimit({ namespace: 'account-links', max: 20 });
const requestLimit = namespace => sharedRateLimit({ namespace, max: 3,
  keyFor: req => req.user?.userId || req.body.email });
const validate = fields => (req, res, next) => {
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object' || Object.keys(req.body).some(key => !fields.includes(key)) || !validationResult(req).isEmpty())
    throw identityError(400, 'VALIDATION_ERROR', fields.includes('password') ? 'Passwords need 12–72 characters and at most 72 UTF-8 bytes. Check the supplied fields.' : 'Check the supplied email or link.');
  next();
};
const token = () => body('token').isString().bail().matches(/^[A-Za-z0-9_-]{43}$/);
router.post('/verification-requests', ipLimit, authenticateUser, checkForTestUser,
  requestLimit('verification-account'), requestVerification);
router.post('/email-verifications', ipLimit, token(), validate(['token']), async (req, res) => {
  await consumeAccountToken(req.body.token, 'verification');
  res.json(accepted);
});
router.post('/recovery-requests', ipLimit,
  body('email').isString().bail().trim().toLowerCase().isEmail().isLength({ max: 254 }), validate(['email']),
  requestLimit('recovery-address'), requestRecovery);
router.post('/password-resets', ipLimit, token(),
  body('password').isString().bail().isLength({ min: 12, max: 72 }).bail().custom(value => Buffer.byteLength(value, 'utf8') <= 72),
  validate(['token', 'password']), async (req, res) => {
    await consumeAccountToken(req.body.token, 'recovery', await hashedPassword(req.body.password));
    res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
    res.json(accepted);
  });
export default router;
