import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discloseSources} from './source-disclosure.mjs';
test('report always discloses limits and keeps partial reading distinct from blocked access',()=>{
 const r={report:'Original report',communityVerification:'unavailable',sourceAccess:[{source:'小红书',status:'blocked',reason:'网络风控',impact:'无法核验',url:'',checkedAt:'2026-09-10'},{source:'牛客',status:'partial',reason:'仅历史帖子',impact:'不代表当期',url:'',checkedAt:''}]};
 discloseSources(r);discloseSources(r);assert.equal(r.report.split('## 来源访问与结论限制').length,2);assert.match(r.report,/牛客.*部分读取/);assert.match(r.report,/小红书.*访问受限/);assert.ok(r.report.endsWith('Original report'));
 const unknown=discloseSources({report:'x'});assert.match(unknown.report,/不能判定所有论坛均受限/);
});
