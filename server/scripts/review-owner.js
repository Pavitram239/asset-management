import { pathToFileURL } from 'node:url';
import { pool,transaction } from '../db/pool.js';
import { verifyMigrations } from '../db/migrate.js';
import { reviewLegacyOwner } from '../src/utils/ownership.js';
import { audit } from '../src/utils/authorization.js';
import { uuid,text } from '../src/utils/accessInput.js';

// Operator-only, explicit mapping. Never infer ownership or verified email from a role name.
export const run = async ([organizationId,email]) => {
  uuid(organizationId);text(email,254);
  await verifyMigrations();
  await transaction(async db=>{
    const user=(await db.query('SELECT id FROM users WHERE email=$1 AND active',[email.trim().toLowerCase()])).rows[0];
    if(!user)throw new Error('Active registered account required');
    await reviewLegacyOwner(db,organizationId,user.id);
    await audit(db,{organizationId},'ownership.operator_review',user.id,{source:'review-owner CLI'});
  });
};
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await run(process.argv.slice(2));console.log('Reviewed ownership recorded; email verification is unchanged');}
  catch(error){console.error(error.message);process.exitCode=1;}finally{await pool.end();}
}
