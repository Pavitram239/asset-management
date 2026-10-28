import { pool } from '../../db/pool.js';
import { audit } from '../utils/authorization.js';
import { commandHash, conflict } from '../utils/commands.js';
import { uuid, text } from '../utils/accessInput.js';
import { quantity, quantityString } from '../utils/quantities.js';
import { expectedVersion } from '../utils/companyInput.js';
import { identityError } from './identity.js';

const externalKinds = new Set(['external','variance']);
const sourceTables = {openingId:'inventory_openings',adjustmentId:'stock_adjustments'};
const invalid = message => identityError(400,'VALIDATION_ERROR',message);

// Internal helpers require the caller's transaction and current workflow authority.
// There is intentionally no generic HTTP stock-posting route.
export const ledgerAccount = async (db, actor, {itemId,lotId,unitId=null,kind,locationId=null}) => {
  for(const id of [actor.organizationId,itemId,lotId,...(unitId?[unitId]:[]),...(locationId?[locationId]:[])])uuid(id);
  const values=[actor.organizationId,itemId,lotId,unitId,kind,locationId];
  await db.query(`INSERT INTO inventory_accounts(organization_id,item_id,lot_id,unit_id,kind,location_id)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,values);
  const account=(await db.query(`SELECT * FROM inventory_accounts WHERE organization_id=$1 AND item_id=$2 AND lot_id=$3
    AND unit_id IS NOT DISTINCT FROM $4::uuid AND kind=$5 AND location_id IS NOT DISTINCT FROM $6::uuid`,values)).rows[0];
  if(!account)throw invalid('Invalid inventory account');
  await db.query(`INSERT INTO inventory_balances(organization_id,account_id,unit_id,bucket) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[actor.organizationId,account.id,unitId,kind]);
  return account;
};
export const journalDto = async (db, actor, id) => {
  const journal=(await db.query(`SELECT id,action,created_at AS "createdAt" FROM inventory_journals WHERE organization_id=$1 AND id=$2`,[actor.organizationId,uuid(id)])).rows[0];
  if(!journal)throw identityError(404,'NOT_FOUND','Inventory posting not found');
  return journal;
};

export const postJournal = async (db, actor, {commandId,source,action,entries}) => {
  uuid(commandId);text(action,100);
  if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).length!==1||!sourceTables[Object.keys(source)[0]])throw invalid('Choose one typed inventory source');
  const sourceName=Object.keys(source)[0],sourceId=uuid(source[sourceName]),org=actor.organizationId;
  if(!Array.isArray(entries)||entries.length<2||entries.length>400)throw invalid('Use 2–400 balanced inventory entries');
  const normalized=entries.map(entry=>{
    uuid(entry.accountId);
    if(typeof entry.quantity!=='string')throw invalid('Inventory quantity must be an exact decimal string');
    const negative=entry.quantity.startsWith('-');
    const parsed=quantity(negative?entry.quantity.slice(1):entry.quantity,6,true)*(negative?-1n:1n);
    return {accountId:entry.accountId,quantity:quantityString(parsed),...(entry.expectedVersion!==undefined?{expectedVersion:entry.expectedVersion}:{})};
  }).sort((a,b)=>a.accountId.localeCompare(b.accountId));
  if(new Set(normalized.map(e=>e.accountId)).size!==normalized.length)throw invalid('Combine repeated inventory accounts before posting');
  const intentHash=commandHash(action,{source,entries:normalized});
  await db.query('SELECT id FROM organizations WHERE id=$1 AND active FOR UPDATE',[org]);
  const active=await db.query(`SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id AND u.active JOIN organizations o ON o.id=m.organization_id AND o.active
    WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active`,[org,actor.userId]);
  if(!active.rowCount)throw identityError(403,'FORBIDDEN','Active company membership required');
  const command=(await db.query('SELECT * FROM api_commands WHERE organization_id=$1 AND actor_id=$2 AND id=$3 FOR UPDATE',[org,actor.userId,commandId])).rows[0];
  if(!command)throw invalid('Inventory requires the current durable command');
  const existing=(await db.query('SELECT id,intent_hash FROM inventory_journals WHERE command_id=$1',[commandId])).rows[0];
  if(existing){if(existing.intent_hash!==intentHash)throw conflict('IDEMPOTENCY_MISMATCH','This command already posted another inventory intent');return journalDto(db,actor,existing.id);}
  if(command.committed_at)throw conflict('COMMAND_ALREADY_COMMITTED','This command already completed');
  const document=(await db.query(`SELECT * FROM ${sourceTables[sourceName]} WHERE organization_id=$1 AND id=$2 FOR UPDATE`,[org,sourceId])).rows[0];
  if(!document)throw identityError(404,'NOT_FOUND','Inventory source not found');
  if(document.state!=='draft')throw conflict('SOURCE_ALREADY_POSTED','Inventory source is no longer a draft');
  const accounts=(await db.query(`SELECT a.*,b.quantity,b.version,u.quantity_scale,i.tracking_mode FROM inventory_accounts a
    JOIN inventory_balances b ON b.organization_id=a.organization_id AND b.account_id=a.id
    JOIN catalog_items i ON i.organization_id=a.organization_id AND i.id=a.item_id
    JOIN unit_definitions u ON u.organization_id=i.organization_id AND u.id=i.unit_id
    WHERE a.organization_id=$1 AND a.id=ANY($2::uuid[]) ORDER BY a.id FOR UPDATE OF b`,[org,normalized.map(e=>e.accountId)])).rows;
  if(accounts.length!==normalized.length)throw invalid('Every posting account must belong to this company');
  const units=[...new Set(accounts.map(a=>a.unit_id).filter(Boolean))].sort();
  if(units.length)await db.query('SELECT id FROM products WHERE organization_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',[org,units]);
  const groups=new Map();
  const changes=normalized.map(entry=>{
    const account=accounts.find(a=>a.id===entry.accountId),negative=entry.quantity.startsWith('-');
    const delta=quantity(negative?entry.quantity.slice(1):entry.quantity,account.quantity_scale,true)*(negative?-1n:1n);
    if(account.unit_id && delta!==1000000n&&delta!==-1000000n)throw invalid('Individual units move exactly one at a time');
    if(negative&&!externalKinds.has(account.kind)&&entry.expectedVersion===undefined)throw invalid('A current source balance version is required');
    if(entry.expectedVersion!==undefined)expectedVersion(entry.expectedVersion,account.version);
    const current=account.quantity.startsWith('-')?-quantity(account.quantity.slice(1)):quantity(account.quantity);
    if(!externalKinds.has(account.kind)&&current+delta<0n)throw conflict('INSUFFICIENT_STOCK','The requested stock is no longer available');
    const group=[account.item_id,account.lot_id,account.unit_id||''].join(':');groups.set(group,(groups.get(group)||0n)+delta);
    return {account,delta,next:current+delta};
  });
  if([...groups.values()].some(total=>total!==0n))throw invalid('Inventory must balance separately for each item, lot and unit');
  const journal=(await db.query('INSERT INTO inventory_journals(organization_id,command_id,actor_id,action,intent_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',[org,commandId,actor.userId,action,intentHash])).rows[0];
  await db.query(`INSERT INTO inventory_journal_sources(organization_id,journal_id,${sourceName==='openingId'?'opening_id':'adjustment_id'}) VALUES($1,$2,$3)`,[org,journal.id,sourceId]);
  // Clear debited individual positions first so the unique positive-position index
  // also protects moves without ever allowing two positive physical accounts.
  for(const change of changes.sort((a,b)=>a.delta<b.delta?-1:a.delta>b.delta?1:0)){
    await db.query('INSERT INTO inventory_entries(organization_id,journal_id,account_id,signed_quantity) VALUES($1,$2,$3,$4)',[org,journal.id,change.account.id,quantityString(change.delta)]);
    await db.query('UPDATE inventory_balances SET quantity=$3,version=version+1 WHERE organization_id=$1 AND account_id=$2',[org,change.account.id,quantityString(change.next)]);
  }
  await db.query(`UPDATE ${sourceTables[sourceName]} SET state='posted',version=version+1 WHERE organization_id=$1 AND id=$2`,[org,sourceId]);
  await audit(db,actor,'inventory.'+action,journal.id,{commandId,source});
  await db.query('INSERT INTO inventory_journal_events(organization_id,journal_id) VALUES($1,$2)',[org,journal.id]);
  return journalDto(db,actor,journal.id);
};

export const readBalance = async (actor, accountId, db=pool) => {
  const row=(await db.query('SELECT quantity,version FROM inventory_balances WHERE organization_id=$1 AND account_id=$2',[actor.organizationId,uuid(accountId)])).rows[0];
  if(!row)throw identityError(404,'NOT_FOUND','Inventory balance not found');
  return {quantity:quantityString(row.quantity.startsWith('-')?-quantity(row.quantity.slice(1)):quantity(row.quantity)),version:Number(row.version)};
};
