// Documentation-only checks. This does not call or test the application API.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const Ajv = require('ajv');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,'');
const planned = JSON.parse(read('docs/openapi-planned.json'));
const current = JSON.parse(read('docs/openapi.json'));
const methods = new Set(['get','post','patch','put','delete','head','options']);
const operations=[];
for(const [p,item] of Object.entries(planned.paths))for(const [method,op] of Object.entries(item))if(methods.has(method))operations.push({path:p,method,op});
const resolve = r => {
 assert(r.startsWith('#/'),`Non-local reference ${r}`);
 const result=r.slice(2).split('/').map(s=>s.replace(/~1/g,'/').replace(/~0/g,'~')).reduce((v,k)=>v?.[k],planned);
 assert(result,`Unresolved reference ${r}`); return result;
};
let referenceCount=0,exampleCount=0,compiledSchemas=0;
const ids=new Set();
for(const {path:p,method,op} of operations) {
 assert(!ids.has(op.operationId),`Duplicate operationId ${op.operationId}`);ids.add(op.operationId);
 assert.equal(op['x-implementation-status'],'planned');
 assert(!current.paths[p]?.[method],`Overlaps current operation ${method} ${p}`);
 const params=(op.parameters||[]).map(v=>v.$ref?resolve(v.$ref):v);
 for(const name of [...p.matchAll(/\{([^}]+)\}/g)].map(m=>m[1]))assert(params.some(v=>v.name===name&&v.in==='path'&&v.required),`Missing path parameter ${p} ${name}`);
 if(op['x-tenant-context']==='required')assert(params.some(v=>v.name==='X-Organization-Id'&&v.required),`Missing required company header ${p}`);
 if(op['x-idempotent-command'])assert(params.some(v=>v.name==='Idempotency-Key'&&v.required),`Missing command key ${p}`);
 if(op.security?.length===0)assert(op['x-tenant-context']==='identity-only',`Public tenant operation ${p}`);
 assert(op.responses['400']&&op.responses['401']&&op.responses['403']&&op.responses['404']&&op.responses['409'],`Incomplete error family ${p}`);
}
const ajv=new Ajv({allErrors:true,nullable:true,jsonPointers:true,schemaId:'auto'});
const validators=new Map();
const validator=schema=>{
 const key=JSON.stringify(schema);
 if(!validators.has(key))validators.set(key,ajv.compile({...schema,components:planned.components}));
 return validators.get(key);
};
const checkExample=(schema,example,label)=>{
 const valid=validator(schema);assert(valid(example),`${label}: ${JSON.stringify(valid.errors)}`);exampleCount++;
};
function walk(node,label) {
 if(!node||typeof node!=='object')return;
 if(node.$ref){resolve(node.$ref);referenceCount++;}
 if(node.schema&&Object.hasOwn(node,'example'))checkExample(node.schema,node.example,label);
 if(node.type&&Object.hasOwn(node,'example'))checkExample(node,node.example,label);
 for(const [key,value] of Object.entries(node))if(key!=='example')walk(value,label+'/'+key);
}
walk(planned,'planned');
for(const [name,schema] of Object.entries(planned.components.schemas)){validator(schema);compiledSchemas++;}
// Runtime contract examples must also stay aligned when operations are promoted.
const currentAjv=new Ajv({allErrors:true,nullable:true,jsonPointers:true,schemaId:'auto'});
let currentExamples=0;
function walkCurrent(node,label) {
 if(!node||typeof node!=='object')return;
 if(node.$ref)assert(node.$ref.startsWith('#/')&&node.$ref.slice(2).split('/').reduce((value,key)=>value?.[key],current),`Unresolved current reference ${node.$ref}`);
 const schema=node.schema&&Object.hasOwn(node,'example')?node.schema:node.type&&Object.hasOwn(node,'example')?node:null;
 if(schema){const validate=currentAjv.compile({...schema,components:current.components});assert(validate(node.example),`${label}: ${JSON.stringify(validate.errors)}`);currentExamples++;}
 for(const [key,value] of Object.entries(node))if(key!=='example')walkCurrent(value,label+'/'+key);
}
walkCurrent(current,'current');
const quantity=validator({$ref:'#/components/schemas/Quantity'});
for(const valid of ['0','0.000001','99999999999999.999999','10'])assert(quantity(valid));
for(const invalid of [1,'-1','1e3','01','0.0000001','100000000000000'])assert(!quantity(invalid));
const positive=validator({$ref:'#/components/schemas/PositiveQuantity'});
for(const invalid of ['0','0.0','0.000000'])assert(!positive(invalid));
assert(positive('0.000001'));
const inspection=validator({$ref:'#/components/schemas/InspectionInput'});
assert(!inspection({lines:[]}),'Missing expectedVersion/empty inspections should fail');
const docs=['README.md','AGENTS.md','API.md','ARCHITECTURE.md','DATABASE.md','IMPLEMENTATION.md','docs/TECHNICAL-BLUEPRINT.md','docs/WORKFLOWS.md','docs/PERMISSIONS.md','docs/IMPLEMENTATION-BACKLOG.md','docs/BLUEPRINT-VERIFICATION.md','docs/RBAC-IMPLEMENTATION.md','docs/RBAC-OPERATIONS.md','docs/COMPANY-FOUNDATION-VERIFICATION.md','docs/DELIVERY-OPERATIONS.md','docs/IDENTITY-DELIVERY-VERIFICATION.md','docs/WORKSPACE-ONBOARDING-VERIFICATION.md','docs/INVENTORY-CONFIGURATION-VERIFICATION.md','docs/INVENTORY-LEDGER-VERIFICATION.md','docs/CATALOG-INVENTORY-VERIFICATION.md','docs/LEGACY-CUTOVER-DESIGN.md'];
let checkedLinks=0;
for(const doc of docs) {
 const lines=read(doc).split(/\r?\n/);
 for(let i=0;i<lines.length;i++)assert(!/[\t ]+$/.test(lines[i]),`Trailing whitespace in ${doc}:${i+1}`);
 for(let i=0;i<lines.length;i++)if(lines[i].startsWith('|')&&!lines[i-1]?.startsWith('|')) {
  assert(/^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[i+1]||''),`Orphan table or missing separator in ${doc}:${i+1}`);
 }
}
for(const doc of docs)for(const match of read(doc).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
 const target=match[1].replace(/^<|>$/g,'');
 if(/^(https?:|mailto:|app:|codex:|#)/i.test(target))continue;
 const withoutAnchor=decodeURIComponent(target.split('#')[0]);
 if(!withoutAnchor)continue;
 const absolute=path.resolve(path.dirname(path.join(root,doc)),withoutAnchor);
 assert(fs.existsSync(absolute),`Broken link in ${doc}: ${target}`); checkedLinks++;
}
const backlog=read('docs/IMPLEMENTATION-BACKLOG.md');
const coverage=backlog.split('## Acceptance coverage')[1].split('## Screen coverage')[0];
for(let i=1;i<=16;i++)assert(coverage.includes(`| A${String(i).padStart(2,'0')} |`),`Missing PRD coverage A${i}`);
const screens=backlog.split('## Screen coverage')[1].split('## Completion')[0];
for(let i=1;i<=32;i++)assert(screens.includes(`S${String(i).padStart(2,'0')}`),`Missing screen S${i}`);
const slices=[...backlog.matchAll(/^\| B(\d{2}) \|/gm)].map(m=>Number(m[1]));
assert.deepEqual(slices,Array.from({length:24},(_,i)=>i));
// Dependency references in the delivery table must point only backwards.
for(const line of backlog.split('## Acceptance coverage')[0].split('\n').filter(l=>/^\| B\d{2} \|/.test(l))) {
 const columns=line.split('|'),self=Number(columns[1].trim().slice(1));
 for(const dep of columns[3].matchAll(/B(\d{2})/g))assert(Number(dep[1])<self,`Forward/circular dependency B${self}->${dep[0]}`);
}
const permissions=read('docs/PERMISSIONS.md');
const known=new Set(permissions.match(/\b[a-z][a-z_]*(?:\.[a-z_]+)+\b/g));
for(const {op} of operations)for(const expression of op['x-required-capabilities'])for(const cap of expression.split(/\s+OR\s+/))assert(known.has(cap),`Capability missing from permissions guide: ${cap}`);
const result={operations:operations.length,paths:Object.keys(planned.paths).length,schemas:compiledSchemas,references:referenceCount,examples:exampleCount,currentExamples,localLinks:checkedLinks,acceptanceScenarios:16,screenGroups:32,backlogSlices:slices.length,currentContractSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'docs/openapi.json'))).digest('hex')};
console.log(JSON.stringify(result,null,2));
