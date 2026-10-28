import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db/pool.js';
import { sharedRateLimit } from '../src/middlewares/sharedRateLimit.js';
test('shared authentication limit permits attempts and supplies a retry window after exhaustion',async(t)=>{
  const original=pool.query;t.after(()=>{pool.query=original;});
  const limiter=sharedRateLimit({max:2});let passed=0,status,retry;
  const req={ip:'client'},res={setHeader(name,value){if(name==='Retry-After')retry=Number(value);},status(value){status=value;return this;},json(){}};
  pool.query=async()=>({rows:[{count:2,reset_at:new Date(Date.now()+60000)}]});
  await limiter(req,res,()=>passed++);assert.equal(passed,1);
  pool.query=async()=>({rows:[{count:3,reset_at:new Date(Date.now()+60000)}]});
  await limiter(req,res,()=>passed++);assert.equal(passed,1);assert.equal(status,429);assert.ok(retry>=59 && retry<=60);
});
test('shared limit fails closed when PostgreSQL is unavailable',async(t)=>{
  const original=pool.query;t.after(()=>{pool.query=original;});pool.query=async()=>{throw new Error('unavailable');};
  let passed=false;await assert.rejects(()=>sharedRateLimit()({ip:'client'},{},()=>{passed=true;}),/unavailable/);assert.equal(passed,false);
});
