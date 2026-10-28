import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { organizationCommand, conflict } from '../utils/commands.js';
import { requireOwner, workspaceDto, assertOwnerContinuity } from '../utils/ownership.js';
import { expectedVersion } from '../utils/companyInput.js';
import { uuid, text } from '../utils/accessInput.js';
import { audit } from '../utils/authorization.js';
import { BadRequestError, NotFoundError } from '../errors/customErrors.js';
import { checkForTestUser } from '../middlewares/authMiddleware.js';
import { sharedRateLimit } from '../middlewares/sharedRateLimit.js';

const router=Router();
router.use(checkForTestUser,sharedRateLimit({namespace:'ownership',max:50}));
const readResult=(db,actor,command)=>workspaceDto(db,command.resource_id);
const fields=(body,allowed)=>{
  if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(key=>!allowed.includes(key)))
    throw new BadRequestError('Unexpected command fields');
};
router.post('/appointments',organizationCommand({operationId:'appointOwner',authorize:requireOwner,readResult,execute:async(db,actor,req,company)=>{
  fields(req.body,['expectedVersion','userId']);
  expectedVersion(req.body.expectedVersion,company.version);
  const userId=uuid(req.body.userId);
  const target=(await db.query(`SELECT u.email_verified_at FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active AND u.active FOR UPDATE OF u`,[actor.organizationId,userId])).rows[0];
  if(!target?.email_verified_at)throw new BadRequestError('Choose a verified active workspace member');
  if((await db.query('SELECT 1 FROM organization_owners WHERE organization_id=$1 AND user_id=$2',[actor.organizationId,userId])).rowCount)
    throw conflict('ALREADY_OWNER','This member is already an owner');
  await db.query('INSERT INTO organization_owners(organization_id,user_id,created_by) VALUES($1,$2,$3)',[actor.organizationId,userId,actor.userId]);
  await db.query("INSERT INTO user_permissions(organization_id,user_id,permission_id,scope) VALUES($1,$2,'ownership.manage','organization') ON CONFLICT DO NOTHING",[actor.organizationId,userId]);
  await db.query('UPDATE organizations SET version=version+1 WHERE id=$1',[actor.organizationId]);
  await audit(db,actor,'ownership.appoint',userId,{command:'appointOwner'});
  return workspaceDto(db,actor.organizationId);
}}));
router.post('/:id/removals',organizationCommand({operationId:'removeOwner',authorize:requireOwner,readResult,execute:async(db,actor,req,company)=>{
  fields(req.body,['expectedVersion','reason']);
  expectedVersion(req.body.expectedVersion,company.version);
  const userId=uuid(req.params.id),reason=text(req.body.reason,2000);
  const removed=await db.query('DELETE FROM organization_owners WHERE organization_id=$1 AND user_id=$2 RETURNING user_id',[actor.organizationId,userId]);
  if(!removed.rowCount)throw new NotFoundError('Owner not found in this workspace');
  await assertOwnerContinuity(db,actor.organizationId);
  await db.query('UPDATE organizations SET version=version+1 WHERE id=$1',[actor.organizationId]);
  await audit(db,actor,'ownership.remove',userId,{reason});
  return workspaceDto(db,actor.organizationId);
}}));
export const ownershipCommandLookup=async(req,res)=>{
  await requireOwner(pool,req.user);
  if(!['appointOwner','removeOwner'].includes(req.params.operationId))throw new NotFoundError('Command not found');
  const command=(await pool.query(`SELECT operation_id,idempotency_key,resource_type,resource_id,committed_at FROM api_commands
    WHERE organization_id=$1 AND actor_id=$2 AND operation_id=$3 AND idempotency_key=$4 AND committed_at IS NOT NULL`,
    [req.user.organizationId,req.user.userId,req.params.operationId,req.params.idempotencyKey])).rows[0];
  if(!command)throw new NotFoundError('Command not found');
  res.json({data:{operationId:command.operation_id,idempotencyKey:command.idempotency_key,status:'committed',resourceType:command.resource_type,resourceId:command.resource_id,committedAt:command.committed_at}});
};
export default router;
