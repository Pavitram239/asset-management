import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectFileType,validateUploadedFiles } from '../src/utils/uploadValidation.js';
test('detect actual file signatures and reject forged types, extensions, PDFs as images and oversize files',async(t)=>{
  assert.equal(detectFileType(Buffer.from('malicious')) ,null);
  assert.equal(detectFileType(Buffer.from('%PDF-1.7 content')),'application/pdf');
  const dir=await mkdtemp(path.join(tmpdir(),'asset-upload-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'upload');await writeFile(file,'%PDF-1.7 content');
  const input={path:file,originalname:'invoice.pdf',mimetype:'application/pdf',size:16};
  await validateUploadedFiles({invoice:[input]});
  await assert.rejects(()=>validateUploadedFiles({productImg:[input]}),/content/);
  await assert.rejects(()=>validateUploadedFiles({invoice:[{...input,mimetype:'image/jpeg'}]}),/content/);
  await assert.rejects(()=>validateUploadedFiles({invoice:[{...input,originalname:'invoice.exe'}]}),/content/);
  await assert.rejects(()=>validateUploadedFiles({invoice:[{...input,size:6*1024*1024}]}),/5 MB/);
});
