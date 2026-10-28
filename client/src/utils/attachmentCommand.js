import customFetch,{organizationKey} from './customFetch.js';
import {onboardingCommand} from './onboardingCommand.js';

export const uploadAttachment=async(file,target,userId)=>{
 const organizationId=sessionStorage.getItem(organizationKey);
 if(!file||file.size<1||file.size>5*1024*1024)throw new Error('Choose a nonempty file up to 5 MB.');
 const contentHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(value=>value.toString(16).padStart(2,'0')).join('');
 const intentHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({contentHash,name:file.name,size:file.size,type:file.type,target}))))).map(value=>value.toString(16).padStart(2,'0')).join('');
 const storage=`asset-file-intent:${userId}:${organizationId}:${intentHash}`,key=sessionStorage.getItem(storage)||crypto.randomUUID();sessionStorage.setItem(storage,key);
 const checkCompany=()=>{if(sessionStorage.getItem(organizationKey)!==organizationId)throw new Error('Return to the previous company to finish this file upload.');};
 checkCompany();const form=new FormData();form.append('file',file);
 const response=await customFetch.post('/attachments',form,{headers:{'Idempotency-Key':key,'X-Organization-Id':organizationId}}),staged=response.data.data;checkCompany();
 let linked;
 if(staged.status==='linked'){
  if(staged.targetType!==target.targetType||staged.targetId!==target.targetId||staged.category!==target.category)throw new Error('This upload already belongs to another target.');linked=staged;
 }else if(staged.status==='removed')throw new Error('This file was removed. Choose a new upload.');
 else linked=await onboardingCommand('linkAttachment',`/attachments/${staged.id}/links`,{expectedVersion:staged.version,...target},userId);
 sessionStorage.removeItem(storage);return linked;
};
