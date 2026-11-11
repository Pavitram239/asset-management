import { Router } from 'express';
import { authenticateUser } from '../middlewares/authMiddleware.js';
import { UnauthorizedError } from '../errors/customErrors.js';
import { pool as platformPool } from '../../db/pool.js';
import {
  listClients,
  getClient,
  createClient,
  retryProvisioning,
  suspendClient,
  reactivateClient,
} from '../controllers/platformController.js';

const router = Router();

/**
 * Super Admin enforcement middleware.
 * Verifies that the authenticated user has platform super-admin privileges.
 * Keeps platform permissions completely separated from client administrator roles.
 */
export const requireSuperAdmin = async (req, res, next) => {
  if (!req.user || !req.user.userId) {
    throw new UnauthorizedError('Authentication required');
  }

  // Check via database to prevent stale token claims or bypassing
  const { rows } = await platformPool.query(
    'SELECT email, is_super_admin FROM users WHERE id = $1 AND active = true',
    [req.user.userId]
  );

  const user = rows[0];
  const isEnvSuperAdmin = process.env.SUPERADMIN_EMAIL && user?.email?.toLowerCase() === process.env.SUPERADMIN_EMAIL.toLowerCase();

  if (!user || (!user.is_super_admin && !isEnvSuperAdmin)) {
    throw new UnauthorizedError('Platform super administrator privileges required');
  }

  req.user.isSuperAdmin = true;
  next();
};

router.use(authenticateUser, requireSuperAdmin);

router.get('/clients', listClients);
router.get('/clients/:id', getClient);
router.post('/clients', createClient);
router.post('/clients/:id/retry', retryProvisioning);
router.patch('/clients/:id/suspend', suspendClient);
router.patch('/clients/:id/reactivate', reactivateClient);

export default router;

