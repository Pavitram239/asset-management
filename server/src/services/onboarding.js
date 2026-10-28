import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { body, validationResult } from 'express-validator';
import { pool, transaction } from '../../db/pool.js';
import { authorize, audit, PERMISSIONS, resolveGrants, permissionScopes } from '../utils/authorization.js';
import { text, uuid, activeDepartment } from '../utils/accessInput.js';
import { companySettings, expectedVersion } from '../utils/companyInput.js';
import { commandHash, conflict } from '../utils/commands.js';
import { reviewLegacyOwner, workspaceDto } from '../utils/ownership.js';
import { provisionOrganization } from '../repositories/organizations.js';
import { identityConfiguration, identityError } from './identity.js';
import { enqueueDelivery, cancelDelivery } from './outbox.js';

const tokenHash = token => createHash('sha256').update(token).digest('hex');
const bad = message => identityError(400, 'VALIDATION_ERROR', message);
const denied = message => identityError(403, 'FORBIDDEN', message);
export const fields = (body, allowed) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) throw bad('Unexpected request fields');
};
export const verifiedAccount = async (db, userId, sessionVersion) => {
  const user = (await db.query('SELECT id,email,active,email_verified_at,is_demo,session_version FROM users WHERE id=$1', [userId])).rows[0];
  if (!user?.active || (sessionVersion !== undefined && user.session_version !== sessionVersion)) throw identityError(401, 'UNAUTHENTICATED', 'Authentication invalid');
  if (!user.email_verified_at || user.is_demo) throw denied('Verify your email before continuing');
  return user;
};
export const invitationAuthority = async (db, actor) => {
  await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor.userId]);
  await verifiedAccount(db, actor.userId, actor.sessionVersion);
  authorize(actor, 'membership.manage'); authorize(actor, 'access.manage');
};
const resourcePermission = code => permissionScopes(code).includes('department') && code!=='cost.read';
const canDelegate = (actor, code, grant) => actor.grants.some(held => held.permission === code &&
  (held.scope === 'organization' || (grant.scope === 'department' && held.scope === 'department' && held.department === grant.departmentCode) ||
    (grant.scope==='location' && held.scope==='location' && held.locationIds?.includes(grant.locationId))));

export const validateInvitationGrants = async (db, actor, input, snapshots = false) => {
  if (!Array.isArray(input) || input.length < 1 || input.length > 50) throw bad('Choose between one and 50 grants');
  const normalized = [], unique = new Set();
  for (const source of input) {
    fields(source, ['roleId', 'permissionCode', 'scope', 'departmentCode', 'locationId', ...(snapshots ? ['permissions'] : [])]);
    if (Object.hasOwn(source, 'roleId') === Object.hasOwn(source, 'permissionCode') || !['organization', 'department', 'location', 'self'].includes(source.scope)) throw bad('Each grant needs one role or permission and a supported scope');
    const grant = { scope: source.scope, ...(source.roleId ? { roleId: uuid(source.roleId) } : { permissionCode: text(source.permissionCode, 100) }) };
    if (source.scope === 'department') {
      grant.departmentCode = text(source.departmentCode, 100);
      await activeDepartment(db, actor.organizationId, grant.departmentCode);
    } else if (Object.hasOwn(source, 'departmentCode')) throw bad('Department only applies to department scope');
    if(source.scope==='location') {grant.locationId=uuid(source.locationId);const {activeLocation}=await import('./configuration.js');await activeLocation(db,actor.organizationId,grant.locationId);}
    else if(Object.hasOwn(source,'locationId'))throw bad('Location only applies to location scope');
    let permissions;
    if (grant.roleId) {
      const role = await db.query('SELECT 1 FROM roles WHERE organization_id=$1 AND id=$2 AND active', [actor.organizationId, grant.roleId]);
      if (!role.rowCount) throw bad('Choose an active role from this company');
      permissions = (await db.query('SELECT permission_id FROM role_permissions WHERE role_id=$1 ORDER BY permission_id', [grant.roleId])).rows.map(row => row.permission_id);
    } else permissions = [grant.permissionCode];
    if (!permissions.length || permissions.some(code => !PERMISSIONS.includes(code) || code === 'ownership.manage' ||
      !permissionScopes(code).includes(grant.scope))) throw bad('This role or permission cannot be delegated with that scope');
    if (permissions.some(code => !canDelegate(actor, code, grant))) throw denied('You cannot delegate access outside your own permission scope');
    if (snapshots && JSON.stringify([...source.permissions].sort()) !== JSON.stringify(permissions)) throw conflict('INVITATION_CHANGED', 'The invited role changed. Revoke and send a new invitation.');
    const identity = JSON.stringify(grant);
    if (unique.has(identity)) throw bad('Duplicate invitation grant');
    unique.add(identity); normalized.push({ ...grant, permissions });
  }
  return normalized;
};
const savedGrants = async (db, id, organizationId) => (await db.query(`SELECT role_id AS "roleId",permission_id AS "permissionCode",scope,
  department_code AS "departmentCode",location_id AS "locationId",permission_snapshot AS permissions FROM invitation_grants WHERE organization_id=$1 AND invitation_id=$2 ORDER BY id`, [organizationId, id])).rows
  .map(row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)));
export const invitationDto = async (db, id, organizationId) => {
  const row = (await db.query(`SELECT id,email,version,CASE WHEN state='pending' AND expires_at<=clock_timestamp() THEN 'expired' ELSE state END AS status,
    expires_at AS "expiresAt" FROM organization_invitations WHERE organization_id=$1 AND id=$2`, [organizationId, id])).rows[0];
  if (!row) throw identityError(404, 'NOT_FOUND', 'Invitation not found');
  return { ...row, version: Number(row.version), grants: (await savedGrants(db, id, organizationId)).map(({ permissions, ...grant }) => grant), allowedActions: row.status === 'pending' ? ['revokeInvitation'] : [] };
};
const memberWorkspace = async (db, organizationId) => {
  const { ownerUserIds, ...workspace } = await workspaceDto(db, organizationId);
  return workspace;
};

const accountCommand = ({ operationId, prepare, execute, statusCode }) => async (req, res) => {
  const key = req.get('Idempotency-Key');
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(key || '')) throw bad('A stable Idempotency-Key is required');
  const hash = commandHash(req.path, req.body);
  try {
    const data = await transaction(async db => {
      await db.query("SET LOCAL lock_timeout='3s'");
      const identity = [req.user.userId, operationId, key];
      const previous = (await db.query(`SELECT * FROM api_commands WHERE actor_id=$1 AND operation_id=$2 AND idempotency_key=$3 AND organization_id IS NULL`, identity)).rows[0];
      if (previous && previous.request_hash !== hash) throw conflict('IDEMPOTENCY_MISMATCH', 'This key already identifies another request');
      const context = await prepare(db, req);
      await db.query(`INSERT INTO api_commands(actor_id,operation_id,idempotency_key,request_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [...identity, hash]);
      const command = (await db.query(`SELECT * FROM api_commands WHERE actor_id=$1 AND operation_id=$2 AND idempotency_key=$3 AND organization_id IS NULL`, identity)).rows[0];
      if (command.request_hash !== hash) throw conflict('IDEMPOTENCY_MISMATCH', 'This key already identifies another request');
      if (command.committed_at) return visibleWorkspace(db, req.user.userId, command.resource_id);
      const workspace = await execute(db, req, context);
      await db.query(`UPDATE api_commands SET resource_type='workspace',resource_id=$2,result=$3,committed_at=clock_timestamp() WHERE id=$1`, [command.id, workspace.id, { data: workspace }]);
      return workspace;
    });
    res.status(statusCode).json({ data });
  } catch (error) {
    if (error.code === '55P03') { res.setHeader('Retry-After', '1'); throw conflict('COMMAND_IN_PROGRESS', 'Retry with the same key'); }
    throw error;
  }
};
const visibleWorkspace = async (db, userId, organizationId) => {
  const member = await db.query(`SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id
    WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active AND o.active`, [organizationId, userId]);
  if (!member.rowCount) throw denied('Workspace membership is unavailable');
  return memberWorkspace(db, organizationId);
};
export const createWorkspace = accountCommand({ operationId: 'createWorkspace', statusCode: 201,
  prepare: async (db, req) => {
    fields(req.body, ['name', 'currency', 'timeZone']);
    const name = text(req.body.name), settings = companySettings(req.body);
    if (!settings.currency || !settings.timeZone) throw bad('Currency and time zone are required');
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.user.userId]);
    await verifiedAccount(db, req.user.userId, req.user.sessionVersion);
    return { name, settings };
  }, execute: async (db, req, { name, settings }) => {
    const org = await provisionOrganization(db, req.user.userId, name);
    await db.query('UPDATE organizations SET currency=$2,time_zone=$3 WHERE id=$1', [org.id, settings.currency, settings.timeZone]);
    await reviewLegacyOwner(db, org.id, req.user.userId);
    const starters = [
      ['Administrator', PERMISSIONS.filter(code => !['ownership.manage', 'organization.create'].includes(code))],
      ['Asset manager', PERMISSIONS.filter(resourcePermission)],
      ['Employee', ['asset.read', 'asset.file.read']],
    ];
    for (const [roleName, permissions] of starters) {
      const role = (await db.query('INSERT INTO roles(organization_id,name) VALUES($1,$2) RETURNING id', [org.id, roleName])).rows[0];
      await db.query('INSERT INTO role_permissions(role_id,permission_id) SELECT $1,unnest($2::text[])', [role.id, permissions]);
    }
    return memberWorkspace(db, org.id);
  },
});

export const inviteEmployee = async (db, actor, req) => {
  fields(req.body, ['email', 'grants']);
  await body('email').isString().bail().trim().isEmail().run(req);
  const email = text(req.body.email, 254).toLowerCase();
  if (!validationResult(req).isEmpty()) throw bad('Enter a valid email');
  const grants = await validateInvitationGrants(db, actor, req.body.grants);
  const existing = await db.query(`SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND u.email=$2`, [actor.organizationId, email]);
  if (existing.rowCount) throw conflict('MEMBERSHIP_EXISTS', 'This account already has a membership. Manage it explicitly instead.');
  const expired = (await db.query(`UPDATE organization_invitations SET state='expired',version=version+1
    WHERE organization_id=$1 AND email=$2 AND state='pending' AND expires_at<=clock_timestamp() RETURNING outbox_id`, [actor.organizationId, email])).rows;
  for (const row of expired) await cancelDelivery(db, row.outbox_id);
  if ((await db.query("SELECT 1 FROM organization_invitations WHERE organization_id=$1 AND email=$2 AND state='pending'", [actor.organizationId, email])).rowCount)
    throw conflict('INVITATION_PENDING', 'An invitation is already pending. Revoke it before sending a replacement.');
  const origin = identityConfiguration(), id = randomUUID(), token = randomBytes(32).toString('base64url');
  const expiresAt = (await db.query("SELECT clock_timestamp()+interval '7 days' AS expiry")).rows[0].expiry;
  const outboxId = await enqueueDelivery(db, { topic: 'company.invitation', key: 'invitation:' + id,
    payload: { invitationId: id, organizationId: actor.organizationId, email, token, origin }, expiresAt });
  await db.query(`INSERT INTO organization_invitations(id,organization_id,email,inviter_id,token_hash,outbox_id,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, actor.organizationId, email, actor.userId, tokenHash(token), outboxId, expiresAt]);
  for (const grant of grants) await db.query(`INSERT INTO invitation_grants(organization_id,invitation_id,role_id,permission_id,scope,department_code,permission_snapshot,location_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [actor.organizationId, id, grant.roleId || null, grant.permissionCode || null, grant.scope, grant.departmentCode || null, grant.permissions,grant.locationId||null]);
  await audit(db, actor, 'invitation.create', id, { grantCount: grants.length });
  return invitationDto(db, id, actor.organizationId);
};
export const revokeInvitation = async (db, actor, req) => {
  fields(req.body, ['expectedVersion', 'reason']);
  const id = uuid(req.params.id), reason = text(req.body.reason, 2000);
  const invitation = (await db.query('SELECT *,expires_at>clock_timestamp() AS unexpired FROM organization_invitations WHERE organization_id=$1 AND id=$2 FOR UPDATE', [actor.organizationId, id])).rows[0];
  if (!invitation) throw identityError(404, 'NOT_FOUND', 'Invitation not found');
  expectedVersion(req.body.expectedVersion, invitation.version);
  if (invitation.state !== 'pending' || !invitation.unexpired) throw conflict('INVITATION_CLOSED', 'This invitation is no longer pending');
  await db.query("UPDATE organization_invitations SET state='revoked',revoked_at=clock_timestamp(),version=version+1 WHERE id=$1", [id]);
  await cancelDelivery(db, invitation.outbox_id);
  await audit(db, actor, 'invitation.revoke', id, { reason });
  return invitationDto(db, id, actor.organizationId);
};

export const acceptInvitation = accountCommand({ operationId: 'acceptInvitation', statusCode: 200,
  prepare: async (db, req) => {
    fields(req.body, ['token']);
    if (!/^[A-Za-z0-9_-]{43}$/.test(req.body.token || '')) throw bad('A valid invitation link is required');
    const invitation = (await db.query('SELECT * FROM organization_invitations WHERE token_hash=$1', [tokenHash(req.body.token)])).rows[0];
    if (!invitation) throw identityError(400, 'INVALID_TOKEN', 'This invitation is invalid or expired');
    const company = await db.query('SELECT id FROM organizations WHERE id=$1 AND active FOR UPDATE', [invitation.organization_id]);
    if (!company.rowCount) throw denied('Workspace is unavailable');
    await db.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[req.user.userId, invitation.inviter_id]]);
    const user = await verifiedAccount(db, req.user.userId, req.user.sessionVersion);
    if (user.email !== invitation.email) throw denied('Sign in with the verified email that received this invitation');
    return { invitation, user };
  }, execute: async (db, req, { invitation, user }) => {
    // Re-read after locks: revocation and competing acceptance serialize on company.
    const current = (await db.query('SELECT *,expires_at>clock_timestamp() AS unexpired FROM organization_invitations WHERE id=$1 FOR UPDATE', [invitation.id])).rows[0];
    if (current.state !== 'pending' || !current.unexpired) throw conflict('INVITATION_CLOSED', 'This invitation is no longer pending');
    const inviter = { userId: current.inviter_id, organizationId: current.organization_id, grants: await resolveGrants(current.inviter_id, current.organization_id, db) };
    await invitationAuthority(db, inviter);
    const grants = await validateInvitationGrants(db, inviter, await savedGrants(db, current.id, current.organization_id), true);
    if ((await db.query('SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$2', [current.organization_id, user.id])).rowCount)
      throw conflict('MEMBERSHIP_EXISTS', 'An existing membership must be managed explicitly');
    await db.query('INSERT INTO memberships(organization_id,user_id,invitation_id) VALUES($1,$2,$3)', [current.organization_id, user.id, current.id]);
    for (const grant of grants) {
      if (grant.roleId) await db.query('INSERT INTO user_roles(organization_id,user_id,role_id,scope,department_code,location_id) VALUES($1,$2,$3,$4,$5,$6)', [current.organization_id, user.id, grant.roleId, grant.scope, grant.departmentCode || null,grant.locationId||null]);
      else await db.query('INSERT INTO user_permissions(organization_id,user_id,permission_id,scope,department_code,location_id) VALUES($1,$2,$3,$4,$5,$6)', [current.organization_id, user.id, grant.permissionCode, grant.scope, grant.departmentCode || null,grant.locationId||null]);
    }
    await db.query("UPDATE organization_invitations SET state='accepted',accepted_by=$2,accepted_at=clock_timestamp(),version=version+1 WHERE id=$1", [current.id, user.id]);
    await cancelDelivery(db, current.outbox_id);
    await audit(db, { userId: user.id, organizationId: current.organization_id }, 'invitation.accept', current.id);
    return memberWorkspace(db, current.organization_id);
  },
});

export const listInvitations = async (req, res) => {
  await invitationAuthority(pool, req.user);
  const size = req.query.pageSize === undefined ? 25 : Number(req.query.pageSize);
  if (!Number.isInteger(size) || size < 1 || size > 100) throw bad('Page size must be 1–100');
  let after = null;
  if (req.query.cursor) {
    try {
      const cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString());
      if (cursor.organizationId !== req.user.organizationId) throw new Error();
      after = uuid(cursor.after);
    } catch { throw bad('Restart this invitation list'); }
  }
  const { rows } = await pool.query('SELECT id FROM organization_invitations WHERE organization_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3', [req.user.organizationId, after, size + 1]);
  const page = rows.slice(0, size);
  res.json({ data: await Promise.all(page.map(row => invitationDto(pool, row.id, req.user.organizationId))), meta: {
    pageSize: size, nextCursor: rows.length > size ? Buffer.from(JSON.stringify({ organizationId: req.user.organizationId, after: page.at(-1).id })).toString('base64url') : null,
  } });
};

export const onboardingCommandLookup = async (req, res) => {
  const account = req.query.context === 'account';
  if (!(account ? ['createWorkspace', 'acceptInvitation'] : ['inviteEmployee', 'revokeInvitation']).includes(req.params.operationId)) throw identityError(404, 'NOT_FOUND', 'Command not found');
  if (account) await verifiedAccount(pool, req.user.userId, req.user.sessionVersion);
  else await invitationAuthority(pool, req.user);
  const { rows } = await pool.query(`SELECT operation_id AS "operationId",idempotency_key AS "idempotencyKey",resource_type AS "resourceType",resource_id AS "resourceId",committed_at AS "committedAt"
    FROM api_commands WHERE actor_id=$1 AND operation_id=$2 AND idempotency_key=$3 AND organization_id IS NOT DISTINCT FROM $4::uuid AND committed_at IS NOT NULL`,
  [req.user.userId, req.params.operationId, req.params.idempotencyKey, account ? null : req.user.organizationId]);
  if (!rows.length) throw identityError(404, 'NOT_FOUND', 'Command not found');
  if (account) await visibleWorkspace(pool, req.user.userId, rows[0].resourceId);
  res.json({ data: { ...rows[0], status: 'committed' } });
};

export const invitationRenderers = { 'company.invitation': async (payload, { event }) => {
  const row = (await pool.query(`SELECT * FROM organization_invitations WHERE id=$1 AND organization_id=$2 AND email=$3 AND token_hash=$4
    AND outbox_id=$5 AND state='pending' AND expires_at>clock_timestamp()`, [payload.invitationId, payload.organizationId, payload.email, tokenHash(payload.token), event.id])).rows[0];
  if (!row) return null;
  const actor = { userId: row.inviter_id, organizationId: row.organization_id, grants: await resolveGrants(row.inviter_id, row.organization_id) };
  try { await invitationAuthority(pool, actor); await validateInvitationGrants(pool, actor, await savedGrants(pool, row.id, row.organization_id), true); }
  catch (error) { if (error.statusCode >= 400 && error.statusCode < 500) return null; throw error; }
  return { to: row.email, subject: 'Your AssetOS workspace invitation', text: `You have been invited to an AssetOS workspace. Sign in or register with this email, verify it, then open this link to accept:\n${payload.origin}/invite#${payload.token}\nThis link expires in seven days. Ignore it if you did not expect this invitation.` };
} };
