import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { authenticateUser, checkForTestUser } from '../middlewares/authMiddleware.js';
import { authorize, organizationContext } from '../utils/authorization.js';
import { organizationCommand } from '../utils/commands.js';
import { sharedRateLimit } from '../middlewares/sharedRateLimit.js';
import { uuid } from '../utils/accessInput.js';
import { configurationDto, createConfiguration, listConfiguration, moveLocation, previewLocationMove, updateConfiguration,configurationReadScope } from '../services/configuration.js';
import { identityError } from '../services/identity.js';

const router = Router();
export const configurationOperations = new Map();
router.use(authenticateUser, organizationContext);
const limit = sharedRateLimit({ namespace: 'configuration', max: 100, keyFor: req => req.user.userId });
const command = (operationId, type, execute, statusCode = 200) => {
  const resource = operationId === 'previewLocationMove' ? 'preview' : type;
  configurationOperations.set(operationId, { type, resource });
  return [checkForTestUser, limit, organizationCommand({ operationId, resourceType: resource, statusCode, authorize: async (db, actor) => authorize(actor, `${type}.manage`), execute,
    readResult: (db, actor, result) => configurationDto(db, resource, result.resource_id, actor.organizationId) })];
};
for (const [path, type, suffix] of [['/locations', 'location', 'Location'], ['/categories', 'category', 'Category'], ['/units-of-measure', 'unit', 'UnitOfMeasure']]) {
  router.get(path, listConfiguration(type));
  router.post(path, ...command('create' + suffix, type, createConfiguration(type), 201));
  if (type === 'unit') continue;
  router.get(path + '/:id', async (req, res) => { const scope=configurationReadScope(req.user,type);const id=uuid(req.params.id);if(!scope.all&&!scope.ids.includes(id))throw identityError(404,'NOT_FOUND','Record not found');res.json({ data: await configurationDto(pool, type, id, req.user.organizationId) }); });
  router.patch(path + '/:id', ...command('update' + suffix, type, updateConfiguration(type)));
}
router.post('/locations/:id/move-previews', ...command('previewLocationMove', 'location', previewLocationMove, 201));
router.post('/locations/:id/moves', ...command('moveLocation', 'location', moveLocation));
export const configurationCommandLookup = async (req, res) => {
  const config = configurationOperations.get(req.params.operationId);
  if (!config) throw identityError(404, 'NOT_FOUND', 'Command not found');
  authorize(req.user, config.type + '.manage');
  const result = (await pool.query(`SELECT operation_id AS "operationId",idempotency_key AS "idempotencyKey",resource_type AS "resourceType",resource_id AS "resourceId",committed_at AS "committedAt" FROM api_commands
    WHERE actor_id=$1 AND organization_id=$2 AND operation_id=$3 AND idempotency_key=$4 AND committed_at IS NOT NULL`, [req.user.userId, req.user.organizationId, req.params.operationId, req.params.idempotencyKey])).rows[0];
  if (!result) throw identityError(404, 'NOT_FOUND', 'Command not found');
  await configurationDto(pool, config.resource, result.resourceId, req.user.organizationId);
  res.json({ data: { ...result, status: 'committed' } });
};
export default router;
