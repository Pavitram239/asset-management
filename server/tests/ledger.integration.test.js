import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from '../testing/testDatabase.js';

test('balanced inventory posting foundation through isolated PostgreSQL transactions',{skip:!process.env.TEST_DATABASE_URL},async t=>{
  process.env.NODE_ENV='test';
  const {pool}=await testDatabase(t);
  const {transaction}=await import('../db/pool.js');
  const {provisionOrganization}=await import('../src/repositories/organizations.js');
  const {ledgerAccount,postJournal,journalDto,readBalance}=await import('../src/services/inventoryLedger.js');
  const {organizationCommand}=await import('../src/utils/commands.js');
  const {authorize}=await import('../src/utils/authorization.js');
  const {quantityString,quantity}=await import('../src/utils/quantities.js');

  const fixture=async({mode='reusable_stock',scale=0,amount='2'}={})=>transaction(async db=>{
    const user=(await db.query("INSERT INTO users(name,email,password_hash,email_verified_at) VALUES('Ledger reviewer',$1,'fixture-only',now()) RETURNING id",[randomUUID()+'@example.test'])).rows[0].id;
    const org=(await provisionOrganization(db,user,'Ledger fixture company')).id,actor={organizationId:org,userId:user};
    await db.query("INSERT INTO organization_departments(organization_id,code,name) VALUES($1,'kitchen','Kitchen')",[org]);
    const category=(await db.query("INSERT INTO category_definitions(organization_id,name,fields) VALUES($1,'Equipment','[]') RETURNING id",[org])).rows[0].id;
    await db.query("INSERT INTO category_revisions(organization_id,category_id,version,fields,actor_id) VALUES($1,$2,1,'[]',$3)",[org,category,user]);
    const unit=(await db.query("INSERT INTO unit_definitions(organization_id,name,code,quantity_scale) VALUES($1,'Base unit','BASE',$2) RETURNING id",[org,scale])).rows[0].id;
    const location=(await db.query("INSERT INTO locations(organization_id,name,kind) VALUES($1,'Store','store') RETURNING id",[org])).rows[0].id;
    const item=(await db.query("INSERT INTO catalog_items(organization_id,category_id,category_version,unit_id,name,tracking_mode,department_code,owning_location_id) VALUES($1,$2,1,$3,'Synthetic item',$4,'kitchen',$5) RETURNING id",[org,category,unit,mode,location])).rows[0].id;
    const opening=(await db.query("INSERT INTO inventory_openings(organization_id,item_id,location_id,quantity,reason,received_on,actor_id) VALUES($1,$2,$3,$4,'Verified existing stock','2026-10-20',$5) RETURNING id",[org,item,location,amount,user])).rows[0].id;
    const lot=(await db.query("INSERT INTO inventory_lots(organization_id,item_id,opening_id,quantity_received,received_on) VALUES($1,$2,$3,$4,'2026-10-20') RETURNING id",[org,item,opening,amount])).rows[0].id;
    const identities=[];
    if(mode==='individual')for(let i=0;i<Number(amount);i++)identities.push((await db.query("INSERT INTO products(organization_id,name,company,department_code,creator_id,created_by,qr,catalog_item_id,lot_id,asset_tag) VALUES($1,'Synthetic unit','Synthetic','kitchen',$2,'Ledger reviewer','fixture-qr',$3,$4,$5) RETURNING id",[org,user,item,lot,'TAG-'+i])).rows[0].id);
    const positions=[];
    for(const unitId of mode==='individual'?identities:[null]){
      const base={itemId:item,lotId:lot,unitId};
      const source=await ledgerAccount(db,actor,{...base,kind:'external'}),available=await ledgerAccount(db,actor,{...base,kind:'available',locationId:location});
      positions.push({base,source:source.id,available:available.id});
    }
    return {actor,org,user,item,lot,location,opening,unit,positions,amount};
  });
  const adjustment=async f=>(await pool.query("INSERT INTO stock_adjustments(organization_id,reason,actor_id) VALUES($1,'Synthetic movement/variance source',$2) RETURNING id",[f.org,f.user])).rows[0].id;
  const post=async(f,body,key=randomUUID())=>{
    let response;
    const handler=organizationCommand({operationId:'ledgerFixture',resourceType:'journal',authorize:async(db,actor)=>authorize(actor,'location.manage'),
      execute:(db,actor,req,company,command)=>postJournal(db,actor,{...req.body,commandId:command.id}),
      readResult:(db,actor,command)=>journalDto(db,actor,command.resource_id)});
    const req={user:f.actor,path:'/internal-ledger-fixture',body,get:()=>key};
    const res={status(value){this.code=value;return this;},json(value){response={status:this.code,data:value};},setHeader(){}};
    try{await handler(req,res);return response;}catch(error){return {status:error.statusCode||500,error};}
  };
  const openingBody=f=>({action:'opening',source:{openingId:f.opening},entries:f.positions.flatMap(p=>[{accountId:p.source,quantity:'-'+(p.base.unitId?'1':f.amount)},{accountId:p.available,quantity:p.base.unitId?'1':f.amount}])});
  const open=async f=>{const result=await post(f,openingBody(f));assert.equal(result.status,200,result.error?.stack);return result.data.data;};

  await t.test('opening balances journal, source, audit and domain event commit once and survive response cache loss',async()=>{
    const f=await fixture(),key=randomUUID(),body=openingBody(f);
    const first=await post(f,body,key);assert.equal(first.status,200,first.error?.stack);
    assert.equal((await post(f,body,key)).data.data.id,first.data.data.id);
    await pool.query("UPDATE api_commands SET result=NULL WHERE actor_id=$1 AND operation_id='ledgerFixture'",[f.user]);
    assert.equal((await post(f,body,key)).data.data.id,first.data.data.id);
    assert.equal((await post(f,{...body,action:'changed'},key)).error.apiCode,'IDEMPOTENCY_MISMATCH');
    assert.deepEqual(await readBalance(f.actor,f.positions[0].available),{quantity:'2',version:2});
    assert.equal((await readBalance(f.actor,f.positions[0].source)).quantity,'-2');
    for(const table of ['inventory_journals','inventory_journal_sources','inventory_journal_events'])assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE organization_id=$1`,[f.org])).rowCount,1);
    assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE organization_id=$1 AND action='inventory.opening'",[f.org])).rowCount,1);
    assert.equal((await pool.query('SELECT state FROM inventory_openings WHERE id=$1',[f.opening])).rows[0].state,'posted');
    await assert.rejects(()=>pool.query('UPDATE inventory_openings SET quantity=3 WHERE id=$1',[f.opening]),/immutable/);
    await assert.rejects(()=>pool.query("UPDATE inventory_lots SET unit_cost=1,currency='INR',cost_basis='declared_opening' WHERE id=$1",[f.lot]),/immutable/);
  });
  await t.test('two competing last-unit commands permit only one movement and retain one positive individual position',async()=>{
    const f=await fixture({mode:'individual',amount:'1'});await open(f);
    const p=f.positions[0];
    const destination=await transaction(db=>ledgerAccount(db,f.actor,{...p.base,kind:'inspection',locationId:f.location}));
    const sources=await Promise.all([adjustment(f),adjustment(f)]);
    const bodies=sources.map(id=>({action:'inspection',source:{adjustmentId:id},entries:[{accountId:p.available,quantity:'-1',expectedVersion:2},{accountId:destination.id,quantity:'1'}]}));
    const results=await Promise.all(bodies.map(body=>post(f,body)));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(results.find(r=>r.status===409).error.apiCode,'VERSION_CONFLICT');
    assert.equal((await readBalance(f.actor,p.available)).quantity,'0');assert.equal((await readBalance(f.actor,destination.id)).quantity,'1');
    assert.equal((await pool.query("SELECT 1 FROM inventory_balances WHERE organization_id=$1 AND unit_id=$2 AND quantity>0 AND bucket NOT IN ('external','variance')",[f.org,p.base.unitId])).rowCount,1);
    const otherLocation=(await pool.query("INSERT INTO locations(organization_id,name,kind) VALUES($1,'Duplicate store','store') RETURNING id",[f.org])).rows[0].id;
    const duplicate=await transaction(db=>ledgerAccount(db,f.actor,{...p.base,kind:'available',locationId:otherLocation}));
    const rejected=await post(f,{action:'duplicate',source:{adjustmentId:await adjustment(f)},entries:[{accountId:p.source,quantity:'-1'},{accountId:duplicate.id,quantity:'1'}]});
    assert.equal(rejected.error.code,'23505');assert.equal((await readBalance(f.actor,duplicate.id)).quantity,'0');
  });
  await t.test('exact fractional quantities, per-lot balancing and nonnegative physical stock are enforced',async()=>{
    const f=await fixture({scale:3,amount:'2.125'});await open(f);const p=f.positions[0];
    const damaged=await transaction(db=>ledgerAccount(db,f.actor,{...p.base,kind:'damaged',locationId:f.location}));
    const command=amount=>({action:'inspection',source:{adjustmentId:randomUUID()},entries:[{accountId:p.available,quantity:'-'+amount,expectedVersion:2},{accountId:damaged.id,quantity:amount}]});
    const over=command('3');over.source.adjustmentId=await adjustment(f);assert.equal((await post(f,over)).error.apiCode,'INSUFFICIENT_STOCK');
    const precision=command('0.0001');precision.source.adjustmentId=await adjustment(f);assert.equal((await post(f,precision)).status,400);
    const valid=command('0.125');valid.source.adjustmentId=await adjustment(f);assert.equal((await post(f,valid)).status,200);
    assert.equal((await readBalance(f.actor,p.available)).quantity,'2');assert.equal((await readBalance(f.actor,damaged.id)).quantity,'0.125');
    const foreign=await fixture();await open(foreign);
    const cross=command('1');cross.source.adjustmentId=await adjustment(f);cross.entries[1].accountId=foreign.positions[0].available;
    assert.equal((await post(f,cross)).status,400);
    await assert.rejects(()=>pool.query("UPDATE catalog_items SET tracking_mode='consumable' WHERE id=$1",[f.item]),/immutable/);
    await assert.rejects(()=>pool.query('UPDATE inventory_balances SET quantity=0 WHERE account_id=$1',[p.available]),/reconcile/);
    assert.equal(quantityString(quantity((await readBalance(f.actor,p.available)).quantity)+quantity((await readBalance(f.actor,damaged.id)).quantity)),'2.125');
  });
  await t.test('outbox failure rolls back journal, balances, audit, source transition and command identity together',async()=>{
    const f=await fixture();
    await pool.query(`CREATE FUNCTION reject_inventory_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic outbox failure'; END $$;
      CREATE TRIGGER reject_inventory_event BEFORE INSERT ON inventory_journal_events FOR EACH ROW EXECUTE FUNCTION reject_inventory_event()`);
    try{const result=await post(f,openingBody(f));assert.equal(result.status,500);assert.match(result.error.message,/Synthetic outbox failure/);}finally{await pool.query('DROP TRIGGER reject_inventory_event ON inventory_journal_events; DROP FUNCTION reject_inventory_event()');}
    for(const table of ['inventory_journals','inventory_entries','inventory_journal_events','api_commands'])assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE organization_id=$1`,[f.org])).rowCount,0);
    assert.equal((await readBalance(f.actor,f.positions[0].available)).quantity,'0');
    assert.equal((await pool.query('SELECT state FROM inventory_openings WHERE id=$1',[f.opening])).rows[0].state,'draft');
    assert.equal((await pool.query("SELECT 1 FROM audit_events WHERE organization_id=$1 AND action='inventory.opening'",[f.org])).rowCount,0);
    await open(f);
  });
  await t.test('database rejects rewriting entries, appending to committed journals, missing typed source and forged projection',async()=>{
    const f=await fixture();const journal=await open(f),p=f.positions[0];
    await assert.rejects(()=>pool.query('UPDATE inventory_entries SET signed_quantity=3 WHERE journal_id=$1',[journal.id]),/immutable/);
    await assert.rejects(()=>pool.query('INSERT INTO inventory_entries(organization_id,journal_id,account_id,signed_quantity) VALUES($1,$2,$3,1)',[f.org,journal.id,p.available]),/Cannot append/);
    await assert.rejects(()=>pool.query("UPDATE inventory_balances SET bucket='external',quantity=-2 WHERE account_id=$1",[p.available]),/reconcile/);
    await assert.rejects(()=>transaction(async db=>{
      const command=(await db.query("INSERT INTO api_commands(actor_id,organization_id,operation_id,idempotency_key,request_hash) VALUES($1,$2,'invalid-ledger',$3,'fixture') RETURNING id",[f.user,f.org,randomUUID()])).rows[0].id;
      await db.query("INSERT INTO inventory_journals(organization_id,command_id,actor_id,action,intent_hash) VALUES($1,$2,$3,'invalid',$4)",[f.org,command,f.user,'0'.repeat(64)]);
    }),/typed source/);
    const duplicateUnit=await fixture({mode:'individual',amount:'1'});
    await assert.rejects(()=>pool.query("INSERT INTO products(organization_id,name,company,department_code,creator_id,created_by,qr,catalog_item_id,lot_id,asset_tag) VALUES($1,'Duplicate','Synthetic','kitchen',$2,'Reviewer','qr',$3,$4,' tag-0 ')",[duplicateUnit.org,duplicateUnit.user,duplicateUnit.item,duplicateUnit.lot]),error=>error.code==='23505');
    await assert.rejects(()=>transaction(db=>ledgerAccount(db,f.actor,{...p.base,unitId:duplicateUnit.positions[0].base.unitId,kind:'available',locationId:f.location})),error=>['23514','23503'].includes(error.code));
  });
  await t.test('deferred database checks reject an unbalanced posting even when projections and event are written',async()=>{
    const f=await fixture();await open(f);const p=f.positions[0];
    const damaged=await transaction(db=>ledgerAccount(db,f.actor,{...p.base,kind:'damaged',locationId:f.location}));
    const source=await adjustment(f);
    await assert.rejects(()=>transaction(async db=>{
      const command=(await db.query("INSERT INTO api_commands(actor_id,organization_id,operation_id,idempotency_key,request_hash) VALUES($1,$2,'invalid-ledger',$3,'fixture') RETURNING id",[f.user,f.org,randomUUID()])).rows[0].id;
      const journal=(await db.query("INSERT INTO inventory_journals(organization_id,command_id,actor_id,action,intent_hash) VALUES($1,$2,$3,'invalid',$4) RETURNING id",[f.org,command,f.user,'0'.repeat(64)])).rows[0].id;
      await db.query('INSERT INTO inventory_journal_sources(organization_id,journal_id,adjustment_id) VALUES($1,$2,$3)',[f.org,journal,source]);
      await db.query('INSERT INTO inventory_entries(organization_id,journal_id,account_id,signed_quantity) VALUES($1,$2,$3,-1),($1,$2,$4,0.5)',[f.org,journal,p.available,damaged.id]);
      await db.query('UPDATE inventory_balances SET quantity=quantity-1 WHERE account_id=$1',[p.available]);
      await db.query('UPDATE inventory_balances SET quantity=0.5 WHERE account_id=$1',[damaged.id]);
      await db.query('INSERT INTO inventory_journal_events(organization_id,journal_id) VALUES($1,$2)',[f.org,journal]);
    }),/does not balance/);
    assert.equal((await readBalance(f.actor,p.available)).quantity,'2');
    assert.equal((await readBalance(f.actor,damaged.id)).quantity,'0');
  });
  await t.test('current posting authority is rechecked after a competing access change holds the company lock',async()=>{
    const f=await fixture(),db=await pool.connect();let pending;
    try{
      await db.query('BEGIN');await db.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[f.org]);
      await db.query("DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE organization_id=$1) AND permission_id='location.manage'",[f.org]);
      pending=post(f,openingBody(f));
      await db.query('COMMIT');
      assert.equal((await pending).status,403);
      assert.equal((await pool.query('SELECT 1 FROM inventory_journals WHERE organization_id=$1',[f.org])).rowCount,0);
    }finally{await db.query('ROLLBACK');db.release();if(pending)await pending;}
  });
});
