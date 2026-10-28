import { createHash } from 'node:crypto';
import { transaction } from '../../db/pool.js';
import { resolveGrants } from './authorization.js';
import { BadRequestError, UnauthorizedError } from '../errors/customErrors.js';

export const conflict = (code, message) => Object.assign(new Error(message), {statusCode:409,apiCode:code});
const canonical = value => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
export const commandHash = (path, body) => createHash('sha256').update(JSON.stringify(canonical({path,body}))).digest('hex');

export const organizationCommand = ({operationId,authorize,execute,readResult,resourceType='workspace',statusCode=200}) => async (req,res) => {
  const key=req.get('Idempotency-Key');
  if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new BadRequestError('A stable Idempotency-Key of 16–100 letters, digits, underscores or hyphens is required');
  const hash=commandHash(req.path,req.body);
  try {
    const result=await transaction(async db=>{
      await db.query("SET LOCAL lock_timeout='3s'");
      const identity=[req.user.userId,req.user.organizationId,operationId,key];
      const company=(await db.query('SELECT * FROM organizations WHERE id=$1 AND active FOR UPDATE',[req.user.organizationId])).rows[0];
      if(!company)throw new UnauthorizedError('Workspace unavailable');
      const actor={...req.user,grants:await resolveGrants(req.user.userId,req.user.organizationId,db)};
      await authorize(db,actor);
      // Claim after the organization lock: the actor FK must not hold a key-share
      // user lock while another command holds this company and checks that user.
      await db.query(`INSERT INTO api_commands(actor_id,organization_id,operation_id,idempotency_key,request_hash)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[...identity,hash]);
      const command=(await db.query(`SELECT * FROM api_commands WHERE actor_id=$1 AND organization_id=$2 AND operation_id=$3 AND idempotency_key=$4`,identity)).rows[0];
      if(command.request_hash!==hash)throw conflict('IDEMPOTENCY_MISMATCH','This key already identifies a different action');
      // Rebuild under current resource grants on every replay. A cached response
      // can contain fields (for example acquisition costs) since revoked.
      if(command.committed_at)return {data:await readResult(db,actor,command)};
      const data=await execute(db,actor,req,company,command);
      const result={data};
      await db.query('UPDATE api_commands SET resource_type=$2,resource_id=$3,result=$4,committed_at=clock_timestamp() WHERE id=$1',[command.id,resourceType,data.id,result]);
      return result;
    });
    res.status(statusCode).json(result);
  }catch(error){
    if(error.code==='55P03') {res.setHeader('Retry-After','1');throw conflict('COMMAND_IN_PROGRESS','Another workspace command is in progress. Retry with the same key.');}
    throw error;
  }
};
