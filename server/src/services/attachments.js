import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pool} from '../../db/pool.js';
import {authorize,allows,audit} from '../utils/authorization.js';
import {uuid,text,boolean} from '../utils/accessInput.js';
import {expectedVersion} from '../utils/companyInput.js';
import {conflict} from '../utils/commands.js';
import {fields} from './onboarding.js';
import {identityError} from './identity.js';
import {itemRow,itemResource,lotRow,cursorPage} from './catalog.js';
import {validateUploadedFiles} from '../utils/uploadValidation.js';
import {uploadFile} from '../utils/firebase/firebaseFileOps.js';

const targets={item:'item_id',lot:'lot_id',unit:'unit_id'},financial=new Set(['invoice','quotation','contract']);
const invalid=message=>identityError(400,'VALIDATION_ERROR',message);
export const attachmentTarget=async(db,actor,type,id,write=false)=>{
 if(!targets[type])throw invalid('Choose a supported inventory attachment target');uuid(id);
 let contexts;
 if(type==='item')contexts=[itemResource(await itemRow(db,actor,id,write?'catalog.manage':'catalog.read'))];
 else if(type==='lot'){
  const row=await lotRow(db,actor,id,'inventory.read');if(write)await lotRow(db,actor,id,'catalog.manage');
  contexts=row.contexts.map(locationId=>({organizationId:actor.organizationId,department:row.department_code,locationId}));
 }else{
  const row=(await db.query(`SELECT p.id,i.department_code,i.owning_location_id,a.location_id FROM products p JOIN catalog_items i ON i.organization_id=p.organization_id AND i.id=p.catalog_item_id
   JOIN inventory_accounts a ON a.organization_id=p.organization_id AND a.unit_id=p.id JOIN inventory_balances b ON b.organization_id=a.organization_id AND b.account_id=a.id
   WHERE p.organization_id=$1 AND p.id=$2 AND p.deleted_at IS NULL AND b.quantity>0 AND a.kind NOT IN ('external','variance')`,[actor.organizationId,id])).rows[0];
  if(!row)throw identityError(404,'NOT_FOUND','Individual unit not found');
  const resource={organizationId:actor.organizationId,department:row.department_code,locationId:row.location_id};
  if(!allows(actor,'inventory.read',resource)||write&&!allows(actor,'catalog.manage',{...resource,locationId:row.owning_location_id}))throw identityError(404,'NOT_FOUND','Individual unit not found');
  contexts=[resource];
 }
 for(const resource of contexts)authorize(actor,write?'attachment.write':'attachment.read',resource);
 return {contexts,cost:contexts.every(resource=>allows(actor,'cost.read',resource))};
};
export const attachmentRow=async(db,actor,id,write=false,includeRemoved=false)=>{
 const row=(await db.query(`SELECT f.*,f.expires_at<=clock_timestamp() AS expired,l.item_id,l.lot_id,l.unit_id,l.category,l.contains_cost
   FROM attachments f LEFT JOIN attachment_links l ON l.organization_id=f.organization_id AND l.attachment_id=f.id WHERE f.organization_id=$1 AND f.id=$2`,[actor.organizationId,uuid(id)])).rows[0];
 if(!row||row.state==='removed'&&!includeRemoved)throw identityError(404,'NOT_FOUND','Attachment not found');
 if(!row.item_id&&!row.lot_id&&!row.unit_id){
  authorize(actor,write?'attachment.write':'attachment.read');
  if(row.created_by!==actor.userId||(row.state==='staged'&&row.expired))throw identityError(404,'NOT_FOUND','Staged attachment expired or is unavailable');
 }else{
  const type=row.item_id?'item':row.lot_id?'lot':'unit',target=await attachmentTarget(db,actor,type,row[targets[type]],write);
  if(row.contains_cost&&!target.cost)throw identityError(404,'NOT_FOUND','Attachment not found');
 }
 return row;
};
export const attachmentDto=async(db,actor,id,write=false,includeRemoved=false)=>{
 const row=await attachmentRow(db,actor,id,write,includeRemoved);
 const type=row.item_id?'item':row.lot_id?'lot':row.unit_id?'unit':null;
 return {id:row.id,version:Number(row.version),status:row.state,fileName:row.file_name,mediaType:row.media_type,sizeBytes:row.size_bytes,
  ...(type?{targetType:type,targetId:row[targets[type]],category:row.category,containsCost:row.contains_cost}:{}),...(row.state==='staged'?{expiresAt:row.expires_at}:{})};
};
export const prepareAttachment=async(req,res,next)=>{
 if(!req.file||req.file.size===0)throw invalid('Choose one nonempty file, at most 5 MB');
 await validateUploadedFiles({invoice:[req.file]});
 req.body={fileName:text(path.basename(req.file.originalname),255),mediaType:req.file.mimetype,sizeBytes:req.file.size,contentHash:createHash('sha256').update(await readFile(req.file.path)).digest('hex')};
 next();
};
export const stageAttachment=async(db,actor,req,company,command)=>{
 if(!process.env.FIREBASE_STORAGE_BUCKET)throw identityError(503,'STORAGE_UNAVAILABLE','Private file storage is not configured');
 const id=randomUUID(),name=`${actor.organizationId}/${id}/${randomUUID()}`,key='assets/documents/'+name,input=req.body;
 // The cleanup intent deliberately commits on a separate connection before the
 // external write. A provider success followed by rollback/crash stays collectible.
 await pool.query("INSERT INTO storage_cleanup(folder,category,object_name) VALUES('assets','documents',$1)",[name]);
 await db.query('INSERT INTO attachments(id,organization_id,created_by,command_id,file_name,media_type,size_bytes,content_hash,storage_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,actor.organizationId,actor.userId,command.id,input.fileName,input.mediaType,input.sizeBytes,input.contentHash,key]);
 let timer;
 try{
  await Promise.race([uploadFile(req.file,'assets','documents',name),new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(identityError(503,'STORAGE_UNAVAILABLE','Private upload timed out. Retry the same file.')),20000);})]);
 }finally{clearTimeout(timer);}
 await audit(db,actor,'attachment.stage',id);
 return attachmentDto(db,actor,id,true);
};
export const linkAttachment=async(db,actor,req)=>{
 fields(req.body,['expectedVersion','targetType','targetId','category','containsCost']);
 const input=req.body,row=await attachmentRow(db,actor,req.params.id,true);expectedVersion(input.expectedVersion,row.version);
 if(row.state!=='staged')throw conflict('ATTACHMENT_ALREADY_LINKED','This file already has a target');
 if(!['image','document','invoice','quotation','evidence','contract'].includes(input.category))throw invalid('Choose a supported attachment category');
 if(input.category==='image'&&!row.media_type.startsWith('image/'))throw invalid('Image attachments require an image file');
 const target=await attachmentTarget(db,actor,input.targetType,uuid(input.targetId),true),declaredCost=input.containsCost===undefined?false:boolean(input.containsCost),containsCost=financial.has(input.category)||declaredCost;
 if(containsCost&&!target.cost)throw identityError(403,'FORBIDDEN','Financial documents require current cost visibility');
 await db.query(`INSERT INTO attachment_links(organization_id,attachment_id,${targets[input.targetType]},category,contains_cost,created_by) VALUES($1,$2,$3,$4,$5,$6)`,[actor.organizationId,row.id,input.targetId,input.category,containsCost,actor.userId]);
 await db.query("UPDATE attachments SET state='linked',version=version+1 WHERE id=$1",[row.id]);
 await audit(db,actor,'attachment.link',row.id,{targetType:input.targetType,targetId:input.targetId,category:input.category,containsCost});
 return attachmentDto(db,actor,row.id,true);
};
export const removeAttachment=async(db,actor,req)=>{
 fields(req.body,['expectedVersion','reason']);const row=await attachmentRow(db,actor,req.params.id,true);expectedVersion(req.body.expectedVersion,row.version);
 await db.query("UPDATE attachments SET state='removed',version=version+1 WHERE id=$1",[row.id]);
 const name=row.storage_key.slice('assets/documents/'.length);
 await db.query("INSERT INTO storage_cleanup(folder,category,object_name) VALUES('assets','documents',$1)",[name]);
 await audit(db,actor,'attachment.remove',row.id,{reason:text(req.body.reason,2000)});
 return attachmentDto(db,actor,row.id,true,true);
};
export const listAttachments=async(req,res)=>{
 const type=req.query.targetType,id=uuid(req.query.targetId),target=await attachmentTarget(pool,req.user,type,id),page=cursorPage(req,'attachments',{type,id});
 const rows=(await pool.query(`SELECT f.id FROM attachments f JOIN attachment_links l ON l.organization_id=f.organization_id AND l.attachment_id=f.id
  WHERE f.organization_id=$1 AND l.${targets[type]}=$2 AND f.state='linked' AND ($3 OR NOT l.contains_cost) AND ($4::uuid IS NULL OR f.id>$4) ORDER BY f.id LIMIT $5`,[req.user.organizationId,id,target.cost,page.after,page.pageSize+1])).rows;
 res.json({data:await Promise.all(rows.slice(0,page.pageSize).map(row=>attachmentDto(pool,req.user,row.id))),meta:page.meta(rows)});
};
