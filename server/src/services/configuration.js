import { createHash } from 'node:crypto';
import { pool } from '../../db/pool.js';
import { audit, authorize } from '../utils/authorization.js';
import { text, uuid, boolean } from '../utils/accessInput.js';
import { expectedVersion } from '../utils/companyInput.js';
import { conflict } from '../utils/commands.js';
import { fields } from './onboarding.js';
import { identityError } from './identity.js';
import {financialAttribute} from '../utils/categoryAttributes.js';

const tables = { location: 'locations', category: 'category_definitions', unit: 'unit_definitions', preview: 'location_move_previews' };
export const configurationReadScope=(actor,type)=>{
  const permissions={location:['location.manage','inventory.read','inventory.opening','catalog.manage'],category:['category.manage','catalog.read','catalog.manage','catalog.requestable.read'],unit:['unit.manage','catalog.read','catalog.manage','catalog.requestable.read','inventory.read','inventory.opening']}[type];
  const grants=actor.grants.filter(grant=>permissions.includes(grant.permission));
  if(!grants.length)throw identityError(403,'FORBIDDEN','Permission denied');
  return {all:type!=='location'||grants.some(grant=>['organization','department'].includes(grant.scope)),ids:[...new Set(grants.flatMap(grant=>grant.locationIds||[]))]};
};
export const activeLocation = async (db, organizationId, id) => {
  uuid(id);
  const { rows } = await db.query(`SELECT l.* FROM locations l WHERE l.organization_id=$1 AND l.id=$2 AND l.active AND NOT EXISTS(
    SELECT 1 FROM location_ancestry a JOIN locations p ON p.id=a.ancestor_id AND p.organization_id=a.organization_id
    WHERE a.organization_id=l.organization_id AND a.descendant_id=l.id AND NOT p.active)`, [organizationId, id]);
  if (!rows.length) throw identityError(400, 'VALIDATION_ERROR', 'Choose an active company location and ancestors');
  return rows[0];
};
export const configurationDto = async (db, type, id, org) => {
  const row = (await db.query(`SELECT * FROM ${tables[type]} WHERE id=$1 AND organization_id=$2`, [id, org])).rows[0];
  if (!row) throw identityError(404, 'NOT_FOUND', 'Record not found');
  if (type === 'preview') return { id: row.id, version: Number(row.location_version), locationId: row.location_id, newParentId: row.new_parent_id, affectedGrantIds: row.affected_grant_ids, affectedScopes: row.affected_scopes, expiresAt: row.expires_at };
  const common = { id: row.id, version: Number(row.version) };
  if (type === 'unit') return { ...common, code: row.code, name: row.name, quantityScale: row.quantity_scale };
  return type === 'location' ? { ...common, name: row.name, parentId: row.parent_id, kind: row.kind, active: row.active } :
    { ...common, name: row.name, fields: row.fields, status: row.active ? 'active' : 'inactive' };
};
export const categoryFields = input => {
  if (!Array.isArray(input) || input.length > 200) throw identityError(400, 'VALIDATION_ERROR', 'Use at most 200 category fields');
  const seen = new Set();
  return input.map(field => {
    fields(field, ['key', 'label', 'type', 'required', 'choices']);
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(field.key || '') || ['__proto__', 'constructor', 'prototype'].includes(field.key) || seen.has(field.key) ||
      !['text', 'number', 'boolean', 'date', 'choice'].includes(field.type)) throw identityError(400, 'VALIDATION_ERROR', 'Use unique valid field keys and supported field types');
    seen.add(field.key);
    if(financialAttribute(field.key)||typeof field.label==='string'&&financialAttribute(field.label.replace(/[^a-z0-9]+/gi,'_')))throw identityError(400,'VALIDATION_ERROR','Use dedicated cost fields for financial information; category fields describe nonfinancial specifications');
    const result = { key: field.key, label: text(field.label, 100), type: field.type, required: boolean(field.required) };
    if (field.type === 'choice') {
      if (!Array.isArray(field.choices) || !field.choices.length || field.choices.length > 200) throw identityError(400, 'VALIDATION_ERROR', 'Choice fields need 1–200 options');
      result.choices = field.choices.map(value => text(value, 100));
      if (new Set(result.choices).size !== result.choices.length) throw identityError(400, 'VALIDATION_ERROR', 'Choice values must be unique');
    } else if (Object.hasOwn(field, 'choices')) throw identityError(400, 'VALIDATION_ERROR', 'Only choice fields accept choices');
    return result;
  });
};
export const createConfiguration = type => async (db, actor, req) => {
  const org = actor.organizationId;
  let row;
  if (type === 'location') {
    fields(req.body, ['name', 'parentId', 'kind']);
    if (!['branch', 'building', 'floor', 'room', 'store', 'offsite', 'unspecified'].includes(req.body.kind)) throw identityError(400, 'VALIDATION_ERROR', 'Choose a supported location kind');
    if (Object.hasOwn(req.body,'parentId') && req.body.parentId!==null) await activeLocation(db, org, uuid(req.body.parentId));
    row = (await db.query('INSERT INTO locations(organization_id,name,parent_id,kind) VALUES($1,$2,$3,$4) RETURNING id', [org, text(req.body.name), req.body.parentId || null, req.body.kind])).rows[0];
  } else if (type === 'category') {
    fields(req.body, ['name', 'fields']);
    row = (await db.query('INSERT INTO category_definitions(organization_id,name,fields) VALUES($1,$2,$3) RETURNING id', [org, text(req.body.name), JSON.stringify(categoryFields(req.body.fields))])).rows[0];
  } else {
    fields(req.body, ['code', 'name', 'quantityScale']);
    const code = text(req.body.code, 20).toUpperCase(), scale = req.body.quantityScale;
    if (!/^[A-Z][A-Z0-9_]{0,19}$/.test(code) || !Number.isInteger(scale) || scale < 0 || scale > 6) throw identityError(400, 'VALIDATION_ERROR', 'Choose a valid unit code and precision 0–6');
    row = (await db.query('INSERT INTO unit_definitions(organization_id,code,name,quantity_scale) VALUES($1,$2,$3,$4) RETURNING id', [org, code, text(req.body.name, 100), scale])).rows[0];
  }
  if (type === 'category') await db.query('INSERT INTO category_revisions(organization_id,category_id,version,fields,actor_id) SELECT organization_id,id,version,fields,$2 FROM category_definitions WHERE id=$1', [row.id, actor.userId]);
  await audit(db, actor, `${type}.create`, row.id);
  return configurationDto(db, type, row.id, org);
};
export const updateConfiguration = type => async (db, actor, req) => {
  fields(req.body, type === 'category' ? ['expectedVersion', 'name', 'fields', 'active'] : ['expectedVersion', 'name', 'active']);
  const current = await configurationDto(db, type, uuid(req.params.id), actor.organizationId);
  expectedVersion(req.body.expectedVersion, current.version);
  const name = req.body.name === undefined ? current.name : text(req.body.name);
  const active = req.body.active === undefined ? (type === 'category' ? current.status === 'active' : current.active) : boolean(req.body.active);
  const definitions = type === 'category' ? (req.body.fields === undefined ? current.fields : categoryFields(req.body.fields)) : null;
  await db.query(`UPDATE ${tables[type]} SET name=$3,active=$4,version=version+1${type === 'category' ? ',fields=$5' : ''} WHERE organization_id=$1 AND id=$2`, [actor.organizationId, current.id, name, active, ...(type === 'category' ? [JSON.stringify(definitions)] : [])]);
  if (type === 'category') await db.query('INSERT INTO category_revisions(organization_id,category_id,version,fields,actor_id) SELECT organization_id,id,version,fields,$2 FROM category_definitions WHERE id=$1', [current.id, actor.userId]);
  await audit(db, actor, `${type}.update`, current.id, { previousVersion: current.version });
  return configurationDto(db, type, current.id, actor.organizationId);
};

const moveImpact = async (db, org, id, parent) => {
  if (parent) {
    await activeLocation(db, org, parent);
    if ((await db.query('SELECT 1 FROM location_ancestry WHERE organization_id=$1 AND ancestor_id=$2 AND descendant_id=$3', [org, id, parent])).rowCount) throw identityError(400, 'VALIDATION_ERROR', 'A location cannot move under itself or its descendant');
  }
  const tree = (await db.query('SELECT id,name,parent_id,version,active FROM locations WHERE organization_id=$1 ORDER BY id', [org])).rows;
  const grants = (await db.query(`SELECT id,location_id,'role' AS kind,to_jsonb(ur) AS details FROM user_roles ur WHERE organization_id=$1 AND scope='location'
    UNION ALL SELECT id,location_id,'permission',to_jsonb(up) FROM user_permissions up WHERE organization_id=$1 AND scope='location'
    UNION ALL SELECT g.id,g.location_id,'invitation',to_jsonb(g) FROM invitation_grants g JOIN organization_invitations i ON i.id=g.invitation_id
      WHERE g.organization_id=$1 AND g.scope='location' AND i.state='pending' ORDER BY id`, [org])).rows;
  const ancestors = node => {
    const result = new Set(); let current = node;
    while (current) { if (result.has(current)) throw identityError(400, 'VALIDATION_ERROR', 'Invalid location tree'); result.add(current); current = tree.find(row => row.id === current)?.parent_id || null; }
    return result;
  };
  const before = ancestors(id); tree.find(row => row.id === id).parent_id = parent;
  const after = ancestors(id);
  const affectedGrants = grants.filter(grant => before.has(grant.location_id) !== after.has(grant.location_id));
  const affected = affectedGrants.map(grant => grant.id).sort();
  if (affected.length > 200) throw identityError(400, 'VALIDATION_ERROR', 'More than 200 grants are affected; reduce the access change before moving');
  const rolePermissions=(await db.query('SELECT rp.role_id,rp.permission_id FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.organization_id=$1 ORDER BY rp.role_id,rp.permission_id',[org])).rows;
  const affectedScopes = [...new Set(affectedGrants.map(grant=>grant.location_id))].sort().map(locationId=>({
    locationId, locationName: tree.find(row=>row.id===locationId).name,
    change: after.has(locationId)?'gains':'loses', grantCount: affectedGrants.filter(grant=>grant.location_id===locationId).length,
  }));
  return { fingerprint: createHash('sha256').update(JSON.stringify({ tree, grants, rolePermissions, parent })).digest('hex'), affected, affectedScopes };
};
export const previewLocationMove = async (db, actor, req) => {
  fields(req.body, ['expectedVersion', 'newParentId']);
  const current = await configurationDto(db, 'location', uuid(req.params.id), actor.organizationId);
  expectedVersion(req.body.expectedVersion, current.version);
  if (!Object.hasOwn(req.body, 'newParentId')) throw identityError(400, 'VALIDATION_ERROR', 'Choose a new parent or root');
  const parent = req.body.newParentId === null ? null : uuid(req.body.newParentId);
  const impact = await moveImpact(db, actor.organizationId, current.id, parent);
  const { rows } = await db.query(`INSERT INTO location_move_previews(organization_id,location_id,new_parent_id,actor_id,location_version,fingerprint,affected_grant_ids,affected_scopes)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [actor.organizationId, current.id, parent, actor.userId, current.version, impact.fingerprint, impact.affected, JSON.stringify(impact.affectedScopes)]);
  await audit(db, actor, 'location.move-preview', current.id, { affectedGrantIds: impact.affected });
  return configurationDto(db, 'preview', rows[0].id, actor.organizationId);
};
export const moveLocation = async (db, actor, req) => {
  fields(req.body, ['expectedVersion', 'newParentId', 'impactPreviewId', 'acknowledgeScopeChanges']);
  const current = await configurationDto(db, 'location', uuid(req.params.id), actor.organizationId);
  expectedVersion(req.body.expectedVersion, current.version);
  if (req.body.acknowledgeScopeChanges !== true) throw identityError(400, 'VALIDATION_ERROR', 'Review and acknowledge the access impact');
  const parent = req.body.newParentId === null ? null : uuid(req.body.newParentId);
  const preview = (await db.query('SELECT * FROM location_move_previews WHERE organization_id=$1 AND id=$2 AND actor_id=$3 AND consumed_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE', [actor.organizationId, uuid(req.body.impactPreviewId), actor.userId])).rows[0];
  const impact = await moveImpact(db, actor.organizationId, current.id, parent);
  if (!preview || preview.location_id !== current.id || preview.new_parent_id !== parent || Number(preview.location_version) !== current.version || preview.fingerprint !== impact.fingerprint)
    throw conflict('SCOPE_PREVIEW_STALE', 'Location or access changed. Review a new move preview.');
  await db.query('UPDATE locations SET parent_id=$3,version=version+1 WHERE organization_id=$1 AND id=$2', [actor.organizationId, current.id, parent]);
  await db.query('UPDATE location_move_previews SET consumed_at=clock_timestamp() WHERE id=$1', [preview.id]);
  await audit(db, actor, 'location.move', current.id, { previousParentId: current.parentId, newParentId: parent, affectedGrantIds: impact.affected });
  return configurationDto(db, 'location', current.id, actor.organizationId);
};

export const listConfiguration = type => async (req, res) => {
  const scope=configurationReadScope(req.user,type);
  const size = req.query.pageSize === undefined ? 25 : Number(req.query.pageSize);
  if (!Number.isInteger(size) || size < 1 || size > 100) throw identityError(400, 'VALIDATION_ERROR', 'Page size must be 1–100');
  let after = null;
  if (req.query.cursor) {
    try { const cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString()); if (cursor.org !== req.user.organizationId || cursor.type !== type) throw new Error(); after = uuid(cursor.after); }
    catch { throw identityError(400, 'VALIDATION_ERROR', 'Restart this list'); }
  }
  const rows = (await pool.query(`SELECT id FROM ${tables[type]} WHERE organization_id=$1 AND ($2::uuid IS NULL OR id>$2) AND ($4 OR id=ANY($5::uuid[])) ORDER BY id LIMIT $3`, [req.user.organizationId, after, size + 1,scope.all,scope.ids])).rows;
  const page = rows.slice(0, size);
  res.json({ data: await Promise.all(page.map(row => configurationDto(pool, type, row.id, req.user.organizationId))), meta: { pageSize: size, nextCursor: rows.length > size ? Buffer.from(JSON.stringify({ org: req.user.organizationId, type, after: page.at(-1).id })).toString('base64url') : null } });
};
