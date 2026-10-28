import {Router} from 'express';
import {pool} from '../../db/pool.js';
import {authenticateUser,checkForTestUser} from '../middlewares/authMiddleware.js';
import {authorize,allows,organizationContext} from '../utils/authorization.js';
import {organizationCommand} from '../utils/commands.js';
import {resourceScope} from '../utils/resourceScope.js';
import {uuid} from '../utils/accessInput.js';
import {sharedRateLimit} from '../middlewares/sharedRateLimit.js';
import {identityError} from '../services/identity.js';
import {createItem,updateItem,itemDto,itemRow,listItems,postOpening,openingDto,lotDto,lotRow,updateLotSupport,cursorPage} from '../services/catalog.js';
import {quantity,quantityString} from '../utils/quantities.js';
import {specificationAttributes} from '../utils/categoryAttributes.js';

const router=Router();router.use(authenticateUser,organizationContext);
const limit=sharedRateLimit({namespace:'catalog_inventory',max:100,keyFor:req=>req.user.userId});
export const inventoryOperations=new Map();
const command=(operationId,permission,type,execute,readResult,statusCode=200)=>{
  inventoryOperations.set(operationId,{permission,type,readResult});
  return [checkForTestUser,limit,organizationCommand({operationId,resourceType:type,statusCode,authorize:async(db,actor)=>authorize(actor,permission),execute,readResult})];
};
const itemResult=(db,actor,result)=>itemDto(db,actor,result.resource_id,'catalog.manage');
const lotResult=async(db,actor,result)=>{await lotRow(db,actor,result.resource_id,'catalog.manage');return lotDto(db,actor,result.resource_id);};
router.get('/catalog/items',listItems(false));
router.get('/catalog/requestable-items',listItems(true));
router.post('/catalog/items',...command('createItem','catalog.manage','item',createItem,itemResult,201));
router.get('/catalog/items/:id',async(req,res)=>res.json({data:await itemDto(pool,req.user,req.params.id)}));
router.patch('/catalog/items/:id',...command('updateItem','catalog.manage','item',updateItem,itemResult));
router.post('/inventory/opening-balances',...command('postOpeningBalance','inventory.opening','opening',postOpening,(db,actor,result)=>openingDto(db,actor,result.resource_id),201));
router.get('/inventory/lots/:id',async(req,res)=>res.json({data:await lotDto(pool,req.user,req.params.id)}));
router.patch('/inventory/lots/:id/support',...command('updateLotSupport','catalog.manage','lot',updateLotSupport,lotResult));
router.get('/inventory/lots',async(req,res)=>{
  authorize(req.user,'inventory.read');
  const itemId=req.query.itemId===undefined?null:uuid(req.query.itemId),page=cursorPage(req,'lots',{itemId});
  const origin=resourceScope(req.user,'inventory.read','r','location_id'),positions=resourceScope(req.user,'inventory.read','p','location_id','department_code',origin.values.length);
  const values=[...origin.values,...positions.values],offset=values.length;
  const rows=(await pool.query(`WITH positions AS(SELECT a.*,i.department_code,b.quantity FROM inventory_accounts a
    JOIN inventory_balances b ON b.organization_id=a.organization_id AND b.account_id=a.id JOIN catalog_items i ON i.organization_id=a.organization_id AND i.id=a.item_id),
    lots AS(SELECT l.*,i.department_code,o.location_id FROM inventory_lots l JOIN catalog_items i ON i.organization_id=l.organization_id AND i.id=l.item_id
      JOIN inventory_openings o ON o.organization_id=l.organization_id AND o.id=l.opening_id)
    SELECT r.id FROM lots r WHERE ${origin.sql} AND ($${offset+1}::uuid IS NULL OR r.id>$${offset+1}) AND ($${offset+2}::uuid IS NULL OR r.item_id=$${offset+2})
      AND NOT EXISTS(SELECT 1 FROM positions p WHERE p.organization_id=r.organization_id AND p.lot_id=r.id AND p.quantity>0 AND p.kind NOT IN ('external','variance') AND NOT COALESCE((${positions.sql}),false))
    ORDER BY r.id LIMIT $${offset+3}`,[...values,page.after,itemId,page.pageSize+1])).rows;
  res.json({data:await Promise.all(rows.slice(0,page.pageSize).map(row=>lotDto(pool,req.user,row.id))),meta:page.meta(rows)});
});
router.get('/inventory/balances',async(req,res)=>{
  authorize(req.user,'inventory.read');
  const filters={};for(const key of ['itemId','locationId','lotId'])filters[key]=req.query[key]===undefined?null:uuid(req.query[key]);
  const buckets=['available','inspection','damaged','retired','consumed','lost','disposed','returned_to_supplier'];
  if(req.query.bucket!==undefined&&!buckets.includes(req.query.bucket))throw identityError(400,'VALIDATION_ERROR','Choose a supported stock bucket');
  filters.bucket=req.query.bucket||null;
  const page=cursorPage(req,'balances',filters),scope=resourceScope(req.user,'inventory.read','r','location_id'),offset=scope.values.length;
  const rows=(await pool.query(`WITH balances AS(SELECT a.*,i.department_code,i.name AS item_name,i.tracking_mode,u.code AS unit_code,p.asset_tag,b.quantity,b.version FROM inventory_accounts a JOIN inventory_balances b ON b.organization_id=a.organization_id AND b.account_id=a.id
    JOIN catalog_items i ON i.organization_id=a.organization_id AND i.id=a.item_id JOIN unit_definitions u ON u.organization_id=i.organization_id AND u.id=i.unit_id LEFT JOIN products p ON p.organization_id=a.organization_id AND p.id=a.unit_id)
    SELECT r.* FROM balances r WHERE ${scope.sql} AND r.quantity>0 AND r.kind NOT IN ('external','variance') AND ($${offset+1}::uuid IS NULL OR r.id>$${offset+1})
      AND ($${offset+2}::uuid IS NULL OR r.item_id=$${offset+2}) AND ($${offset+3}::uuid IS NULL OR r.location_id=$${offset+3}) AND ($${offset+4}::uuid IS NULL OR r.lot_id=$${offset+4})
      AND ($${offset+5}::text IS NULL OR r.kind=$${offset+5}) ORDER BY r.id LIMIT $${offset+6}`,[...scope.values,page.after,filters.itemId,filters.locationId,filters.lotId,filters.bucket,page.pageSize+1])).rows;
  res.json({data:rows.slice(0,page.pageSize).map(row=>({accountId:row.id,itemId:row.item_id,itemName:row.item_name,unitCode:row.unit_code,trackingMode:row.tracking_mode,lotId:row.lot_id,...(row.unit_id?{unitId:row.unit_id,assetTag:row.asset_tag}:{}),...(row.location_id?{locationId:row.location_id}:{}),bucket:row.kind,quantity:quantityString(quantity(row.quantity)),version:Number(row.version)})),meta:page.meta(rows)});
});
router.get('/catalog/items/:id/history',async(req,res)=>{
  const item=await itemRow(pool,req.user,req.params.id),size=req.query.pageSize===undefined?25:Number(req.query.pageSize);
  if(!Number.isInteger(size)||size<1||size>100)throw identityError(400,'VALIDATION_ERROR','Page size must be 1–100');
  let before=Number.MAX_SAFE_INTEGER;
  if(req.query.cursor)try{const cursor=JSON.parse(Buffer.from(req.query.cursor,'base64url').toString());if(cursor.org!==req.user.organizationId||cursor.item!==item.id||!Number.isSafeInteger(cursor.before)||cursor.before<1)throw Error();before=cursor.before;}catch{throw identityError(400,'VALIDATION_ERROR','Restart this item history');}
  const rows=(await pool.query('SELECT version,actor_id AS "actorId",created_at AS "createdAt",snapshot FROM catalog_item_history WHERE organization_id=$1 AND item_id=$2 AND version<$3 ORDER BY version DESC LIMIT $4',[req.user.organizationId,item.id,before,size+1])).rows;
  res.json({data:rows.slice(0,size).map(row=>({version:Number(row.version),actorId:row.actorId,createdAt:row.createdAt,name:row.snapshot.name,categoryId:row.snapshot.category_id,attributes:specificationAttributes(row.snapshot.attributes),active:row.snapshot.active,requestable:row.snapshot.requestable})),meta:{pageSize:size,nextCursor:rows.length>size?Buffer.from(JSON.stringify({org:req.user.organizationId,item:item.id,before:Number(rows[size-1].version)})).toString('base64url'):null}});
});
export const inventoryCommandLookup=async(req,res)=>{
  const definition=inventoryOperations.get(req.params.operationId);if(!definition)throw identityError(404,'NOT_FOUND','Command not found');
  authorize(req.user,definition.permission);
  const row=(await pool.query('SELECT * FROM api_commands WHERE actor_id=$1 AND organization_id=$2 AND operation_id=$3 AND idempotency_key=$4 AND committed_at IS NOT NULL',[req.user.userId,req.user.organizationId,req.params.operationId,req.params.idempotencyKey])).rows[0];
  if(!row)throw identityError(404,'NOT_FOUND','Command not found');await definition.readResult(pool,req.user,row);
  res.json({data:{operationId:row.operation_id,idempotencyKey:row.idempotency_key,status:'committed',resourceType:row.resource_type,resourceId:row.resource_id,committedAt:row.committed_at}});
};
export default router;
