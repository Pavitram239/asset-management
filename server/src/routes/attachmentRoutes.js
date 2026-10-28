import {Router} from 'express';
import {pool} from '../../db/pool.js';
import {authenticateUser,checkForTestUser} from '../middlewares/authMiddleware.js';
import {attachmentUpload} from '../middlewares/multerMiddleware.js';
import {authorize,organizationContext,audit} from '../utils/authorization.js';
import {organizationCommand} from '../utils/commands.js';
import {sharedRateLimit} from '../middlewares/sharedRateLimit.js';
import {readStoredFile} from '../utils/firebase/firebaseFileOps.js';
import {attachmentDto,attachmentRow,listAttachments,prepareAttachment,stageAttachment,linkAttachment,removeAttachment} from '../services/attachments.js';
import {identityError} from '../services/identity.js';

const router=Router();
export const attachmentOperations=new Map();
router.use(authenticateUser,(req,res,next)=>{
 if(req.method==='GET'&&/^\/[0-9a-f-]+\/content$/.test(req.path)&&!req.get('X-Organization-Id')&&typeof req.query.organizationId==='string')req.headers['x-organization-id']=req.query.organizationId;
 next();
},organizationContext);
const limit=sharedRateLimit({namespace:'attachments',max:30,keyFor:req=>req.user.userId});
const command=(operationId,execute,statusCode=200)=>{
 const readResult=(db,actor,result)=>attachmentDto(db,actor,result.resource_id,true,operationId==='removeAttachment');
 attachmentOperations.set(operationId,readResult);
 return organizationCommand({operationId,resourceType:'attachment',statusCode,authorize:async(db,actor)=>authorize(actor,'attachment.write'),execute,readResult});
};
router.get('/',listAttachments);
router.post('/',checkForTestUser,limit,(req,res,next)=>{authorize(req.user,'attachment.write');next();},attachmentUpload,prepareAttachment,command('stageAttachment',stageAttachment,201));
router.post('/:id/links',checkForTestUser,limit,command('linkAttachment',linkAttachment));
router.post('/:id/removals',checkForTestUser,limit,command('removeAttachment',removeAttachment));
router.get('/:id/content',async(req,res)=>{
 const row=await attachmentRow(pool,req.user,req.params.id);
 if(!process.env.FIREBASE_STORAGE_BUCKET)throw identityError(503,'STORAGE_UNAVAILABLE','Private file storage is not configured');
 const file=await readStoredFile(row.storage_key,'invoice');
 await audit(pool,req.user,'attachment.read',row.id);
 res.set({'Content-Type':file.contentType,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.file_name).replace(/['()*]/g,value=>'%'+value.charCodeAt(0).toString(16).toUpperCase())}`,'Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox"});res.send(file.data);
});
export const attachmentCommandLookup=async(req,res)=>{
 const readResult=attachmentOperations.get(req.params.operationId);if(!readResult)throw identityError(404,'NOT_FOUND','Command not found');authorize(req.user,'attachment.write');
 const row=(await pool.query('SELECT * FROM api_commands WHERE organization_id=$1 AND actor_id=$2 AND operation_id=$3 AND idempotency_key=$4 AND committed_at IS NOT NULL',[req.user.organizationId,req.user.userId,req.params.operationId,req.params.idempotencyKey])).rows[0];
 if(!row)throw identityError(404,'NOT_FOUND','Command not found');await readResult(pool,req.user,row);
 res.json({data:{operationId:row.operation_id,idempotencyKey:row.idempotency_key,status:'committed',resourceType:row.resource_type,resourceId:row.resource_id,committedAt:row.committed_at}});
};
export default router;
