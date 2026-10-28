import {PERMISSIONS,permissionScopes} from './authorization.js';

// Column names come from repository code, never a request parameter.
export const resourceScope=(actor,permission,alias='i',locationColumn='owning_location_id',departmentColumn='department_code',start=0)=>{
  const values=[actor?.organizationId||null],org='$'+(start+1),parts=[];
  const bind=value=>{values.push(value);return '$'+(start+values.length);};
  for(const grant of actor?.userId&&PERMISSIONS.includes(permission)?actor.grants||[]:[]){
    if(grant.permission!==permission||!permissionScopes(permission).includes(grant.scope))continue;
    if(grant.scope==='organization'){parts.push('TRUE');break;}
    if(grant.scope==='department')parts.push(`${alias}.${departmentColumn}=${bind(grant.department)}`);
    if(grant.scope==='location')parts.push(`${alias}.${locationColumn} IN (SELECT descendant_id FROM location_ancestry WHERE organization_id=${org} AND ancestor_id=${bind(grant.locationId)})`);
  }
  return {sql:`${alias}.organization_id=${org} AND (${parts.join(' OR ')||'FALSE'})`,values};
};
