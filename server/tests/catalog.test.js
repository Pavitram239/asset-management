import test from 'node:test';
import assert from 'node:assert/strict';
import {companyToday,civilDate,attributeIssues} from '../src/services/catalog.js';

test('civil acquisition dates follow company midnight without UTC date shifts',()=>{
 const instant=new Date('2026-10-20T20:00:00Z');
 assert.equal(companyToday('Asia/Kolkata',instant),'2026-10-21');
 assert.equal(companyToday('America/Los_Angeles',instant),'2026-10-20');
 assert.equal(companyToday('Pacific/Kiritimati',new Date('2026-12-31T12:00:00Z')),'2027-01-01');
 assert.equal(civilDate('2024-02-29'),'2024-02-29');
 for(const date of ['2026-02-29','2026-02-30','0000-01-01','20/10/2026',null])assert.throws(()=>civilDate(date));
 assert.throws(()=>companyToday(null,instant));
});
test('category compatibility reports required, unsupported, malformed and financial attribute fields',()=>{
 const fields=[{key:'material',type:'choice',required:true,choices:['Steel','Iron']},{key:'capacity',type:'number',required:false}];
 assert.deepEqual(attributeIssues({material:'Steel',capacity:1.5},fields),[]);
 assert(attributeIssues({material:'Copper'},fields).length);
 assert(attributeIssues({},fields).length);
 assert(attributeIssues({material:'Steel',capacity:'1.5'},fields).length);
 assert(attributeIssues({material:'Steel',unit_cost:200},fields).length);
 assert(attributeIssues({material:'Steel',legacy_unknown:'Preserved in earlier history'},fields).length);
});
