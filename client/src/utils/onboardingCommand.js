import customFetch, { organizationKey } from './customFetch.js';

// Persist an opaque intent hash/key, never an invitation token.
export const onboardingCommand = async (operation, path, body, userId, account = false, method = 'post') => {
  const organizationId=account?null:sessionStorage.getItem(organizationKey);
  const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(value=>value.toString(16).padStart(2,'0')).join('');
  const [hash,legacyHash]=await Promise.all([digest({path,method,body}),digest(body)]);
  const storage = `asset-intent:${userId}:${account ? 'account' : organizationId}:${operation}:${hash}`;
  const legacyStorage=`asset-intent:${userId}:${account?'account':organizationId}:${operation}:${legacyHash}`;
  const key = sessionStorage.getItem(storage) || sessionStorage.getItem(legacyStorage) || crypto.randomUUID();
  sessionStorage.setItem(storage, key);
  const result = await customFetch.request({url:path,method,data:body,identityContext:account,headers:{'Idempotency-Key':key,...(organizationId?{'X-Organization-Id':organizationId}:{})}});
  sessionStorage.removeItem(storage);
  if(sessionStorage.getItem(legacyStorage)===key)sessionStorage.removeItem(legacyStorage);
  return result.data.data;
};
