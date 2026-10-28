import { pool } from '../../db/pool.js';
import { StatusCodes } from "http-status-codes";

const errorHandlerMiddleware = async (err, req, res, next) => {
  const send=(status,msg,code)=>res.status(status).json({msg,...((req.commandContract||err.apiCode)?{code:err.apiCode||code,requestId:req.requestId}:{})});
  if([401,403].includes(err.statusCode)) {
    try{await pool.query(`INSERT INTO audit_events(actor_id,organization_id,action,target,outcome) VALUES($1,$2,$3,$4,'denied')`,
      [req.user?.userId || null,req.user?.organizationId || null,err.statusCode===401?'authentication.denied':'authorization.denied',req.route?.path || req.path]);}
    catch{console.error(JSON.stringify({event:'security_audit_unavailable',requestId:req.requestId}));}
  }
  if (err.code === '23505') return send(409,'Email or unique record already exists','UNIQUE_CONFLICT');
  if (['23503', '23514', '23502', '22P02', '22007', '22008', '22001'].includes(err.code))
    return send(400,'Invalid record values or references','VALIDATION_ERROR');
  const statusCode = err.statusCode || (err.name === 'MulterError' || err.name === 'ValidationError' ? 400 : StatusCodes.INTERNAL_SERVER_ERROR);
  if (statusCode >= 500) console.error(JSON.stringify({event:'request_failed',requestId:req.requestId,errorType:err.name,code:err.code}));
  const safeStorageMessage=statusCode===503&&err.apiCode==='STORAGE_UNAVAILABLE';
  const msg = statusCode >= 500&&!safeStorageMessage ? 'Something went wrong, please try again later' : err.message;
  send(statusCode,msg,({400:'VALIDATION_ERROR',401:'UNAUTHENTICATED',403:'FORBIDDEN',404:'NOT_FOUND',409:'CONFLICT',429:'RATE_LIMITED'}[statusCode] || 'INTERNAL_ERROR'));
};

export default errorHandlerMiddleware;
