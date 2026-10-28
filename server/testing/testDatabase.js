import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Never fall back to DATABASE_URL. Every suite owns only its generated schema.
export const testDatabase = async t => {
  const connectionString=process.env.TEST_DATABASE_URL;
  assert(connectionString,'TEST_DATABASE_URL is required');
  assert.match(decodeURIComponent(new URL(connectionString).pathname),/_test$/);
  const schema='test_'+randomUUID().replaceAll('-','');
  const control=new pg.Pool({connectionString,connectionTimeoutMillis:5000});
  await control.query(`CREATE SCHEMA "${schema}"`);
  let pool,server;
  t.after(async()=>{
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(pool)await pool.end();
    await control.query(`DROP SCHEMA "${schema}" CASCADE`);
    await control.end();
  });
  process.env.DATABASE_URL=connectionString;
  process.env.PGOPTIONS=`-c search_path=${schema}`;
  process.env.PGAPPNAME=schema;
  process.env.JWT_SECRET='isolated-foundation-tests-only-secret-123456789';
  process.env.COOKIE_SECURE='false';
  process.env.MAIL_ADAPTER='capture';
  process.env.APP_PUBLIC_URL='http://localhost:5173';
  process.env.OUTBOX_ENCRYPTION_KEY ||= Buffer.alloc(32,7).toString('base64');
  ({pool}=await import('../db/pool.js'));
  const {migrate}=await import('../db/migrate.js');await migrate();
  const {default:app}=await import('../src/app.js');
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api/v1`;
  const api=async(route,{method='GET',body,cookie,organization,headers={}}={})=>{
    const response=await fetch(base+route,{method,signal:AbortSignal.timeout(15000),headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(organization?{'X-Organization-Id':organization}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json().catch(()=>null),headers:response.headers};
  };
  return {pool,api,base,schema};
};
