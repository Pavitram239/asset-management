import "express-async-errors"; // avoids app crashing for async errors
import './config/env.js';
import { randomUUID } from 'node:crypto';
import express from "express";
import { v2 as cloudinary } from "cloudinary";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { authenticateUser } from "./middlewares/authMiddleware.js";
// Routes
import userRouter from "./routes/userRoutes.js";
import authRouter from "./routes/authRoutes.js";
import productRouter from "./routes/productRoutes.js";
// middlewares
import errorHandlerMiddleware from "./middlewares/errorHandlerMiddleware.js";
import { cleanupUploads } from './middlewares/multerMiddleware.js';

import { pool } from '../db/pool.js';

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

import accessRouter from './routes/accessRoutes.js';
import ownershipRouter, {ownershipCommandLookup} from './routes/ownershipRoutes.js';
import identityRouter from './routes/identityRoutes.js';
import { accountCommandLookup } from './services/identity.js';
import onboardingRouter from './routes/onboardingRoutes.js';
import { onboardingCommandLookup } from './services/onboarding.js';
import configurationRouter, {configurationCommandLookup,configurationOperations} from './routes/configurationRoutes.js';
import catalogRouter,{inventoryOperations,inventoryCommandLookup} from './routes/catalogRoutes.js';
import attachmentRouter,{attachmentOperations,attachmentCommandLookup} from './routes/attachmentRoutes.js';
import { organizationContext } from './utils/authorization.js';

const app = express();
app.disable('x-powered-by');
if(!['0','1'].includes(process.env.TRUST_PROXY_HOPS || '0')) throw new Error('TRUST_PROXY_HOPS must be 0 or 1');
app.set('trust proxy',process.env.TRUST_PROXY_HOPS==='1'?1:false);

if (process.env.NODE_ENV === "development") {
  // Log only pathname, never token-bearing queries or request bodies.
  app.use(morgan((tokens,req,res)=>`${tokens.method(req,res)} ${req.path} ${tokens.status(req,res)} ${tokens['response-time'](req,res)} ms`));
}

app.use((req, res, next) => {
  req.requestId=randomUUID();
  req.commandContract=req.path.startsWith('/api/v1/ownership/')||req.path.startsWith('/api/v1/commands/')||
    /^\/api\/v1\/auth\/(verification-requests|email-verifications|recovery-requests|password-resets)$/.test(req.path)||
    req.path==='/api/v1/workspaces'||req.path.startsWith('/api/v1/invitations')||/^\/api\/v1\/(locations|categories|units-of-measure|catalog|inventory|attachments)(\/|$)/.test(req.path);
  res.setHeader('X-Request-Id',req.requestId);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
// Cookie-authenticated mutations must originate from this application. No permissive CORS.
app.use((req,res,next)=>{
  if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
    const origin=req.get('origin');
    let mismatch=false;
    if(origin){try{mismatch=new URL(origin).host!==req.get('host');}catch{mismatch=true;}}
    if(mismatch || req.get('sec-fetch-site')==='cross-site') return res.status(403).json({msg:'Cross-origin request denied',...(req.commandContract?{code:'FORBIDDEN',requestId:req.requestId}:{})});
  }
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(cleanupUploads);
app.use('/uploads', (req, res) => res.sendStatus(404));

// Products Routes
app.get('/api/v1/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.status(200).json({ status: 'ok', database: 'postgresql' });
});
app.use("/api/v1/products", authenticateUser, (req,res,next)=>{
  // Embedded image/download links cannot set headers; validate their explicit context identically.
  if(req.method==='GET' && /^\/[0-9a-f-]+\/files\/(image|invoice)$/.test(req.path) && !req.get('X-Organization-Id') && typeof req.query.organizationId==='string') req.headers['x-organization-id']=req.query.organizationId;
  next();
}, organizationContext, productRouter);

// User Routes
app.use("/api/v1/users", authenticateUser, userRouter);

app.use("/api/v1/access", authenticateUser, accessRouter);
const commandContract=(req,res,next)=>{req.commandContract=true;next();};
app.use('/api/v1/ownership',commandContract,authenticateUser,organizationContext,ownershipRouter);
app.get('/api/v1/commands/:operationId/:idempotencyKey',commandContract,authenticateUser,(req,res,next)=>{
  if(req.query.context==='account')return req.params.operationId==='requestVerification'?accountCommandLookup(req,res):onboardingCommandLookup(req,res);
  next();
},organizationContext,(req,res)=>attachmentOperations.has(req.params.operationId)?attachmentCommandLookup(req,res):inventoryOperations.has(req.params.operationId)?inventoryCommandLookup(req,res):configurationOperations.has(req.params.operationId)?configurationCommandLookup(req,res):['inviteEmployee','revokeInvitation'].includes(req.params.operationId)?onboardingCommandLookup(req,res):ownershipCommandLookup(req,res));
app.use('/api/v1', (req,res,next)=>req.path==='/workspaces'||req.path.startsWith('/invitations')?onboardingRouter(req,res,next):next());
app.use('/api/v1',(req,res,next)=>/^\/(locations|categories|units-of-measure)(\/|$)/.test(req.path)?configurationRouter(req,res,next):next());
app.use('/api/v1',(req,res,next)=>/^\/(catalog|inventory)(\/|$)/.test(req.path)?catalogRouter(req,res,next):next());
app.use('/api/v1/attachments',attachmentRouter);

// Auth Routes
app.use('/api/v1/auth', identityRouter);
app.use("/api/v1/auth", authRouter);
app.use('/api', (req, res) => res.status(404).json({ msg: 'API route not found' }));

// 404
app.use("*", (req, res) => {
  res.status(404).json({
    message: "Page not found",
  });
});

app.use(errorHandlerMiddleware);

export default app;
