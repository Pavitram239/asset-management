import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { BadRequestError } from '../../errors/customErrors.js';
// Server-only credentials; never return service account material or persistent download tokens.
const bucket=()=>{
  if(!process.env.FIREBASE_STORAGE_BUCKET) throw new Error('FIREBASE_STORAGE_BUCKET must be configured');
  const app=getApps().find(a=>a.name==='asset-private-storage') || initializeApp({credential:applicationDefault(),storageBucket:process.env.FIREBASE_STORAGE_BUCKET},'asset-private-storage');
  return getStorage(app).bucket();
};
export const uploadFile=async(file,folder,type,name)=>{
  const key=`${folder}/${type}/${name}`;
  await bucket().upload(file.path,{destination:key,resumable:false,metadata:{contentType:file.mimetype,cacheControl:'private, no-store'}});
  return key;
};
export const removeFile=async(folder,type,name)=>bucket().file(`${folder}/${type}/${name}`).delete({ignoreNotFound:true});
export const storedObjectKey=(value)=>{
  if(value.startsWith('assets/')) return value;
  // Compatibility with existing Firebase token URLs: extract only this configured bucket's key, never fetch arbitrary URLs.
  let url;try{url=new URL(value);}catch{throw new BadRequestError('Invalid stored file');}
  const match=url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if(url.hostname!=='firebasestorage.googleapis.com' || !match || decodeURIComponent(match[1])!==process.env.FIREBASE_STORAGE_BUCKET) throw new BadRequestError('Invalid stored file');
  const key=decodeURIComponent(match[2]);
  if(!key.startsWith('assets/')) throw new BadRequestError('Legacy file requires operator migration');
  return key;
};
export const readStoredFile=async(value,category)=>{
  const file=bucket().file(storedObjectKey(value));
  const [metadata]=await file.getMetadata();
  if(Number(metadata.size)>5*1024*1024) throw new BadRequestError('Stored file exceeds supported size');
  const contentType=metadata.contentType;
  const allowed=['image/jpeg','image/png','image/webp',...(category==='invoice'?['application/pdf']:[])];
  if(!allowed.includes(contentType)) throw new BadRequestError('Unsupported stored file');
  const chunks=[];let size=0;
  // Bound the read itself even if an operator replaces an object between metadata and download.
  for await(const chunk of file.createReadStream({start:0,end:5*1024*1024})){
    size+=chunk.length;
    if(size>5*1024*1024) throw new BadRequestError('Stored file exceeds supported size');
    chunks.push(chunk);
  }
  return {data:Buffer.concat(chunks),contentType};
};
