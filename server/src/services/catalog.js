import {randomUUID} from 'node:crypto';
import qrcode from 'qrcode';
import {pool} from '../../db/pool.js';
import {authorize,allows,audit} from '../utils/authorization.js';
import {resourceScope} from '../utils/resourceScope.js';
import {text,uuid,boolean,activeDepartment} from '../utils/accessInput.js';
import {expectedVersion} from '../utils/companyInput.js';
import {conflict} from '../utils/commands.js';
import {quantity,quantityString} from '../utils/quantities.js';
import {fields} from './onboarding.js';
import {identityError} from './identity.js';
import {activeLocation} from './configuration.js';
import {ledgerAccount,postJournal} from './inventoryLedger.js';
import {financialAttribute,specificationAttributes} from '../utils/categoryAttributes.js';

const invalid=message=>identityError(400,'VALIDATION_ERROR',message);
export const civilDate=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000')||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw invalid('Choose a valid calendar date');
  return value;
};
export const companyToday=(timeZone,now=new Date())=>{
  if(!timeZone)throw invalid('Configure the company time zone before posting stock');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
export const attributeIssues=(attributes,definitions)=>{
  const issues=[];
  for(const [key,value]of Object.entries(attributes)){
    const field=definitions.find(f=>f.key===key);
    if(financialAttribute(key)||!field){issues.push(`Review field ${key}`);continue;}
    const valid=field.type==='text'?typeof value==='string'&&value.length<=4000:field.type==='number'?typeof value==='number'&&Number.isFinite(value):field.type==='boolean'?typeof value==='boolean':field.type==='choice'?field.choices.includes(value):typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
    if(!valid||(field.required&&value===''))issues.push(`Review field ${key}`);
  }
  for(const field of definitions)if(field.required&&!Object.hasOwn(attributes,field.key))issues.push(`Provide field ${field.key}`);
  return issues;
};
const validateAttributes=(input,definitions)=>{
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>100)throw invalid('Use up to 100 nonfinancial category fields');
  const issues=attributeIssues(input,definitions);if(issues.length)throw invalid(issues.join('; ').slice(0,1000));return input;
};
const category=async(db,org,id)=>{
  const row=(await db.query('SELECT * FROM category_definitions WHERE organization_id=$1 AND id=$2',[org,uuid(id)])).rows[0];
  if(!row?.active)throw invalid('Choose an active company category');return row;
};
export const itemResource=row=>({organizationId:row.organization_id,department:row.department_code,locationId:row.owning_location_id});
export const itemRow=async(db,actor,id,permission='catalog.read')=>{
  const row=(await db.query('SELECT * FROM catalog_items WHERE organization_id=$1 AND id=$2',[actor.organizationId,uuid(id)])).rows[0];
  if(!row||!allows(actor,permission,itemResource(row)))throw identityError(404,'NOT_FOUND','Item not found');return row;
};
export const itemDto=async(db,actor,id,permission='catalog.read')=>{
  const row=await itemRow(db,actor,id,permission);
  const current=(await db.query('SELECT version,fields FROM category_definitions WHERE organization_id=$1 AND id=$2',[actor.organizationId,row.category_id])).rows[0];
  const issues=attributeIssues(row.attributes,current.fields);
  return {id:row.id,version:Number(row.version),name:row.name,categoryId:row.category_id,unitId:row.unit_id,trackingMode:row.tracking_mode,departmentCode:row.department_code,owningLocationId:row.owning_location_id,
    attributes:specificationAttributes(row.attributes),requestable:row.requestable,active:row.active,categoryRevision:Number(row.category_version),currentCategoryRevision:Number(current.version),attributeIssues:issues,
    allowedActions:[...(allows(actor,'catalog.manage',itemResource(row))?['updateItem']:[]),...(row.active&&!issues.length&&allows(actor,'inventory.opening',itemResource(row))?['postOpeningBalance']:[])]};
};
const itemHistory=async(db,actor,id)=>{
  const row=(await db.query('SELECT * FROM catalog_items WHERE id=$1 AND organization_id=$2',[id,actor.organizationId])).rows[0];
  await db.query('INSERT INTO catalog_item_history(organization_id,item_id,version,actor_id,snapshot) VALUES($1,$2,$3,$4,$5)',[actor.organizationId,id,row.version,actor.userId,JSON.stringify(row)]);
};
export const createItem=async(db,actor,req)=>{
  fields(req.body,['name','categoryId','unitId','trackingMode','departmentCode','owningLocationId','attributes','requestable']);
  const input=req.body,org=actor.organizationId,definition=await category(db,org,input.categoryId);
  if(!['individual','reusable_stock','consumable'].includes(input.trackingMode))throw invalid('Choose a supported tracking mode');
  const unit=(await db.query('SELECT * FROM unit_definitions WHERE organization_id=$1 AND id=$2',[org,uuid(input.unitId)])).rows[0];
  if(!unit||(input.trackingMode==='individual'&&unit.quantity_scale!==0))throw invalid('Choose a company base unit; individual items require whole units');
  const department=text(input.departmentCode,100),location=input.owningLocationId===undefined||input.owningLocationId===null?null:uuid(input.owningLocationId);
  await activeDepartment(db,org,department);if(location)await activeLocation(db,org,location);
  authorize(actor,'catalog.manage',{organizationId:org,department,locationId:location});
  const id=(await db.query(`INSERT INTO catalog_items(organization_id,category_id,category_version,unit_id,name,tracking_mode,department_code,owning_location_id,attributes,requestable)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[org,definition.id,definition.version,unit.id,text(input.name),input.trackingMode,department,location,JSON.stringify(validateAttributes(input.attributes===undefined?{}:input.attributes,definition.fields)),input.requestable===undefined?true:boolean(input.requestable)])).rows[0].id;
  await itemHistory(db,actor,id);await audit(db,actor,'catalog.create',id);
  return itemDto(db,actor,id,'catalog.manage');
};
export const updateItem=async(db,actor,req)=>{
  fields(req.body,['expectedVersion','name','categoryId','attributes','active','requestable']);
  const row=await itemRow(db,actor,req.params.id,'catalog.manage');expectedVersion(req.body.expectedVersion,row.version);
  const reviewing=req.body.categoryId!==undefined||req.body.attributes!==undefined;
  const definition=reviewing?await category(db,actor.organizationId,req.body.categoryId===undefined?row.category_id:req.body.categoryId):{id:row.category_id,version:row.category_version};
  const attributes=reviewing?validateAttributes(req.body.attributes===undefined?row.attributes:req.body.attributes,definition.fields):row.attributes;
  await db.query(`UPDATE catalog_items SET name=$3,category_id=$4,category_version=$5,attributes=$6,active=$7,requestable=$8,version=version+1 WHERE organization_id=$1 AND id=$2`,
    [actor.organizationId,row.id,req.body.name===undefined?row.name:text(req.body.name),definition.id,definition.version,JSON.stringify(attributes),req.body.active===undefined?row.active:boolean(req.body.active),req.body.requestable===undefined?row.requestable:boolean(req.body.requestable)]);
  await itemHistory(db,actor,row.id);await audit(db,actor,'catalog.update',row.id,{previousVersion:Number(row.version)});
  return itemDto(db,actor,row.id,'catalog.manage');
};

export const warrantyInput=input=>{
  if(input===undefined)return {};
  fields(input,['expiresOn','coverage','supportUrl']);
  const result={};if(input.expiresOn!==undefined)result.expiresOn=civilDate(input.expiresOn);
  if(input.coverage!==undefined)result.coverage=text(input.coverage,4000);
  if(input.supportUrl!==undefined){let url;try{url=new URL(input.supportUrl);}catch{throw invalid('Choose an HTTPS support link');}if(url.protocol!=='https:'||url.username||url.password||input.supportUrl.length>2000)throw invalid('Choose an HTTPS support link');result.supportUrl=url.href;}
  return result;
};
const locationResource=(actor,row,location)=>({organizationId:actor.organizationId,department:row.department_code,locationId:location});
export const openingDto=async(db,actor,id)=>{
  const opening=(await db.query('SELECT o.*,s.journal_id,l.id AS lot_id FROM inventory_openings o JOIN inventory_journal_sources s ON s.organization_id=o.organization_id AND s.opening_id=o.id JOIN inventory_lots l ON l.organization_id=o.organization_id AND l.opening_id=o.id WHERE o.organization_id=$1 AND o.id=$2',[actor.organizationId,uuid(id)])).rows[0];
  if(!opening)throw identityError(404,'NOT_FOUND','Stock entry not found');
  const item=await itemRow(db,actor,opening.item_id,'inventory.opening');authorize(actor,'inventory.opening',locationResource(actor,item,opening.location_id));
  return {id:opening.id,version:Number(opening.version),status:opening.state,journalId:opening.journal_id,sourceId:opening.id,lotId:opening.lot_id};
};
export const postOpening=async(db,actor,req,company,command)=>{
  fields(req.body,['itemId','locationId','quantity','reason','receivedOn','purchasedOn','unitCost','warranty','units']);
  const input=req.body,item=await itemRow(db,actor,uuid(input.itemId),'inventory.opening'),org=actor.organizationId;
  if(!item.active)throw invalid('Reactivate this catalog item before adding stock');
  const definition=await category(db,org,item.category_id);
  if(attributeIssues(item.attributes,definition.fields).length)throw conflict('CATEGORY_REVIEW_REQUIRED','Review the item fields against the current category before adding stock');
  await activeDepartment(db,org,item.department_code);await activeLocation(db,org,uuid(input.locationId));
  authorize(actor,'inventory.opening',locationResource(actor,item,input.locationId));
  const unit=(await db.query('SELECT quantity_scale FROM unit_definitions WHERE id=$1 AND organization_id=$2',[item.unit_id,org])).rows[0];
  const amount=quantity(input.quantity,unit.quantity_scale,true),received=civilDate(input.receivedOn),purchased=input.purchasedOn===undefined?null:civilDate(input.purchasedOn),warranty=warrantyInput(input.warranty);
  if(received>companyToday(company.time_zone)||(purchased&&purchased>received))throw invalid('Stock received date cannot be in the future; purchase date cannot follow receipt');
  let cost=null,currency=null;
  if(input.unitCost!==undefined){
    authorize(actor,'cost.read',itemResource(item));authorize(actor,'cost.read',locationResource(actor,item,input.locationId));
    fields(input.unitCost,['amount','currency']);cost=quantityString(quantity(input.unitCost.amount));currency=input.unitCost.currency;
    if(typeof currency!=='string'||!Intl.supportedValuesOf('currency').includes(currency))throw invalid('Choose a supported acquisition currency');
  }
  let identities=[];
  if(item.tracking_mode==='individual'){
    if(!Array.isArray(input.units)||!input.units.length||input.units.length>200||BigInt(input.units.length)*1000000n!==amount)throw invalid('Provide one unique tag for every individual unit, up to 200 per entry');
    identities=input.units.map(value=>{fields(value,['assetTag','serialNumber']);return {tag:text(value.assetTag,100).normalize('NFKC'),serial:value.serialNumber===undefined?null:text(value.serialNumber,200)};});
    if(new Set(identities.map(value=>value.tag.trim().toLowerCase())).size!==identities.length)throw invalid('Asset tags must be company-unique');
  }else if(input.units!==undefined)throw invalid('Pooled stock and consumables do not take individual asset tags');
  const opening=(await db.query('INSERT INTO inventory_openings(organization_id,item_id,location_id,quantity,reason,received_on,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[org,item.id,input.locationId,quantityString(amount),text(input.reason,2000),received,actor.userId])).rows[0].id;
  const lot=(await db.query(`INSERT INTO inventory_lots(organization_id,item_id,opening_id,quantity_received,received_on,purchased_on,unit_cost,currency,cost_basis,expires_on,support_metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[org,item.id,opening,quantityString(amount),received,purchased,cost,currency,cost===null?'unknown':'declared_opening',warranty.expiresOn||null,JSON.stringify(warranty)])).rows[0].id;
  const physicalUnits=[];
  for(const identity of identities){
    const id=randomUUID(),qr=await qrcode.toDataURL(id,{errorCorrectionLevel:'H',margin:1,width:300});
    await db.query(`INSERT INTO products(id,organization_id,name,company,department_code,creator_id,created_by,qr,catalog_item_id,lot_id,asset_tag,serial_number,location_id,purchase_date,warranty_date)
      VALUES($1,$2,$3,'Unspecified',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[id,org,item.name,item.department_code,actor.userId,actor.name||'Employee',qr,item.id,lot,identity.tag,identity.serial,input.locationId,purchased,warranty.expiresOn||null]);
    physicalUnits.push(id);
  }
  const entries=[];
  for(const unitId of item.tracking_mode==='individual'?physicalUnits:[null]){
    const base={itemId:item.id,lotId:lot,unitId};
    const source=await ledgerAccount(db,actor,{...base,kind:'external'}),destination=await ledgerAccount(db,actor,{...base,kind:'available',locationId:input.locationId});
    const count=unitId?'1':quantityString(amount);entries.push({accountId:source.id,quantity:'-'+count},{accountId:destination.id,quantity:count});
  }
  await postJournal(db,actor,{commandId:command.id,source:{openingId:opening},action:'opening',entries});
  await db.query('INSERT INTO inventory_lot_history(organization_id,lot_id,version,actor_id,reason,support_snapshot) VALUES($1,$2,1,$3,$4,$5)',[org,lot,actor.userId,'Existing-stock acquisition',JSON.stringify(warranty)]);
  return openingDto(db,actor,opening);
};

export const lotRow=async(db,actor,id,permission='inventory.read')=>{
  const row=(await db.query(`SELECT l.*,to_char(l.received_on,'YYYY-MM-DD') AS received_day,to_char(l.purchased_on,'YYYY-MM-DD') AS purchased_day,i.department_code,i.owning_location_id,o.location_id AS opening_location FROM inventory_lots l JOIN catalog_items i ON i.organization_id=l.organization_id AND i.id=l.item_id
    JOIN inventory_openings o ON o.organization_id=l.organization_id AND o.id=l.opening_id WHERE l.organization_id=$1 AND l.id=$2`,[actor.organizationId,uuid(id)])).rows[0];
  if(!row)throw identityError(404,'NOT_FOUND','Acquisition lot not found');
  const locations=(await db.query(`SELECT DISTINCT a.location_id FROM inventory_accounts a JOIN inventory_balances b ON b.organization_id=a.organization_id AND b.account_id=a.id
    WHERE a.organization_id=$1 AND a.lot_id=$2 AND b.quantity>0 AND a.kind NOT IN ('external','variance')`,[actor.organizationId,row.id])).rows.map(value=>value.location_id);
  const contexts=[row.opening_location,...locations];
  if(!contexts.every(location=>allows(actor,permission,locationResource(actor,row,location))))throw identityError(404,'NOT_FOUND','Acquisition lot not found');
  return {...row,contexts};
};
export const lotDto=async(db,actor,id)=>{
  const row=await lotRow(db,actor,id);
  const costAllowed=row.contexts.every(location=>allows(actor,'cost.read',locationResource(actor,row,location)));
  return {id:row.id,version:Number(row.version),itemId:row.item_id,quantityReceived:quantityString(quantity(row.quantity_received)),receivedOn:row.received_day,...(row.purchased_day?{purchasedOn:row.purchased_day}:{}),warranty:row.support_metadata,
    ...(costAllowed?{costBasis:row.cost_basis,unitCost:row.unit_cost===null?null:{amount:quantityString(quantity(row.unit_cost)),currency:row.currency}}:{})};
};
export const updateLotSupport=async(db,actor,req)=>{
  fields(req.body,['expectedVersion','warranty','reason']);
  const row=await lotRow(db,actor,req.params.id,'catalog.manage');expectedVersion(req.body.expectedVersion,row.version);
  await lotRow(db,actor,row.id,'inventory.read');
  const warranty=warrantyInput(req.body.warranty),reason=text(req.body.reason,2000);
  await db.query('UPDATE inventory_lots SET support_metadata=$3,expires_on=$4,version=version+1 WHERE organization_id=$1 AND id=$2',[actor.organizationId,row.id,JSON.stringify(warranty),warranty.expiresOn||null]);
  await db.query('INSERT INTO inventory_lot_history(organization_id,lot_id,version,actor_id,reason,support_snapshot) VALUES($1,$2,$3,$4,$5,$6)',[actor.organizationId,row.id,Number(row.version)+1,actor.userId,reason,JSON.stringify(warranty)]);
  await audit(db,actor,'inventory.support.update',row.id,{previousVersion:Number(row.version)});
  return lotDto(db,actor,row.id);
};

export const cursorPage=(req,type,filters={})=>{
  const pageSize=req.query.pageSize===undefined?25:Number(req.query.pageSize);
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw invalid('Page size must be 1–100');
  let after=null;
  if(req.query.cursor)try{const value=JSON.parse(Buffer.from(req.query.cursor,'base64url').toString());if(value.org!==req.user.organizationId||value.type!==type||JSON.stringify(value.filters)!==JSON.stringify(filters))throw Error();after=uuid(value.after);}catch{throw invalid('Restart this list with the current filters');}
  return {pageSize,after,meta:(rows)=>({pageSize,nextCursor:rows.length>pageSize?Buffer.from(JSON.stringify({org:req.user.organizationId,type,filters,after:rows[pageSize-1].id})).toString('base64url'):null})};
};
export const listItems=requestable=>async(req,res)=>{
  const permission=requestable?'catalog.requestable.read':'catalog.read';authorize(req.user,permission);
  const search=req.query.search===undefined?'':text(req.query.search,200),scope=resourceScope(req.user,permission),page=cursorPage(req,requestable?'requestable':'catalog',{search});
  const rows=(await pool.query(`SELECT i.id,i.name,i.category_id,i.unit_id,i.tracking_mode FROM catalog_items i WHERE ${scope.sql} AND ($${scope.values.length+1}::uuid IS NULL OR i.id>$${scope.values.length+1})
    AND strpos(lower(i.name),lower($${scope.values.length+2}))>0 ${requestable?'AND i.active AND i.requestable':''} ORDER BY i.id LIMIT $${scope.values.length+3}`,[...scope.values,page.after,search,page.pageSize+1])).rows;
  const data=requestable?rows.slice(0,page.pageSize).map(row=>({id:row.id,name:row.name,categoryId:row.category_id,unitId:row.unit_id,trackingMode:row.tracking_mode})):await Promise.all(rows.slice(0,page.pageSize).map(row=>itemDto(pool,req.user,row.id)));
  res.json({data,meta:page.meta(rows)});
};
