import { authorize } from './authorization.js';
import { UnauthorizedError, BadRequestError } from '../errors/customErrors.js';
import { conflict } from './commands.js';

export const requireOwner = async (db,actor) => {
  const active=(await db.query(`SELECT 1 FROM organization_owners own JOIN memberships m USING(organization_id,user_id)
    JOIN users u ON u.id=own.user_id JOIN organizations o ON o.id=own.organization_id
    WHERE own.organization_id=$1 AND own.user_id=$2 AND m.active AND u.active AND o.active AND o.ownership_activated_at IS NOT NULL`,[actor.organizationId,actor.userId])).rowCount;
  if(!active)throw new UnauthorizedError('Only a protected company owner can manage ownership');
  authorize(actor,'ownership.manage');
};
export const ownerCount = async (db,organizationId) => Number((await db.query(`SELECT count(*) AS n FROM organization_owners own
  JOIN memberships m USING(organization_id,user_id) JOIN users u ON u.id=own.user_id
  WHERE own.organization_id=$1 AND m.active AND u.active`,[organizationId])).rows[0].n);
export const assertOwnerContinuity = async (db,organizationId) => {
  const company=(await db.query('SELECT ownership_activated_at FROM organizations WHERE id=$1',[organizationId])).rows[0];
  if(company?.ownership_activated_at && await ownerCount(db,organizationId)===0)
    throw conflict('LAST_OWNER','Appoint another active owner before removing the last owner');
};
export const workspaceDto = async (db,organizationId) => {
  const company=(await db.query('SELECT id,name,version,currency,time_zone,active FROM organizations WHERE id=$1',[organizationId])).rows[0];
  return {id:company.id,name:company.name,version:Number(company.version),currency:company.currency,timeZone:company.time_zone,
    status:company.active?'active':'inactive',ownerUserIds:(await db.query('SELECT user_id FROM organization_owners WHERE organization_id=$1 ORDER BY user_id',[organizationId])).rows.map(r=>r.user_id)};
};
export const reviewLegacyOwner = async (db,organizationId,userId,actorId=userId) => {
  const company=(await db.query('SELECT id,ownership_activated_at FROM organizations WHERE id=$1 AND active FOR UPDATE',[organizationId])).rows[0];
  if(!company)throw new BadRequestError('Active workspace required');
  if(company.ownership_activated_at)throw new BadRequestError('Ownership is already reviewed; use owner appointment instead');
  const member=(await db.query(`SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active AND u.active`,[organizationId,userId])).rowCount;
  if(!member)throw new BadRequestError('Reviewed owner must already be an active member');
  await db.query('INSERT INTO organization_owners(organization_id,user_id,created_by) VALUES($1,$2,$3)',[organizationId,userId,actorId]);
  await db.query("INSERT INTO user_permissions(organization_id,user_id,permission_id,scope) VALUES($1,$2,'ownership.manage','organization') ON CONFLICT DO NOTHING",[organizationId,userId]);
  await db.query("INSERT INTO user_permissions(organization_id,user_id,permission_id,scope) SELECT $1,$2,id,'organization' FROM permissions WHERE id IN ('location.manage','category.manage','unit.manage','catalog.read','catalog.manage','catalog.requestable.read','inventory.read','inventory.opening','cost.read','attachment.read','attachment.write') ON CONFLICT DO NOTHING",[organizationId,userId]);
  await db.query('UPDATE organizations SET ownership_activated_at=now(),version=version+1 WHERE id=$1',[organizationId]);
};
