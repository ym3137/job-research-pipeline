export const sourceAccessSchema={type:'array',items:{type:'object',additionalProperties:false,properties:Object.fromEntries(['source','status','reason','impact','url','checkedAt'].map(k=>[k,k==='status'?{type:'string',enum:['accessible','partial','blocked','unverified','not_attempted']}:{type:'string'}])),required:['source','status','reason','impact','url','checkedAt']}};
const labels={accessible:'已读取',partial:'部分读取',blocked:'访问受限',unverified:'未核实',not_attempted:'未检索'};
export function discloseSources(result){
 const rows=Array.isArray(result.sourceAccess)&&result.sourceAccess.length?result.sourceAccess:[{source:'社区来源',status:'unverified',reason:'本轮没有保存逐来源访问记录，不能判定所有论坛均受限。',impact:'薪资、工时和员工体验尚缺完整交叉验证。',url:'',checkedAt:''}];
 result.sourceAccess=rows;
 const clean=v=>String(v||'').replace(/\|/g,'／').replace(/\n/g,' ');
 const table=['| 来源 | 状态 | 原因 / 范围 | 对结论的影响 |','| --- | --- | --- | --- |',...rows.map(r=>`| ${clean(r.source)}${r.url?.startsWith('https://')?` [链接](${r.url})`:''}${r.checkedAt?`（${clean(r.checkedAt)}）`:''} | ${labels[r.status]||'未核实'} | ${clean(r.reason)} | ${clean(r.impact)} |`)].join('\n');
 const block='<!-- source-access:start -->\n## 来源访问与结论限制\n\n'+table+'\n\n'+(result.communityVerification==='verified'?'社区交叉验证状态：已报告完成，请结合各来源覆盖范围阅读。':'**社区交叉验证尚未完成。岗位职责可依据官网判断；薪资、工作生活平衡和员工体验的待确认部分不能当作已核实事实。**')+'\n<!-- source-access:end -->\n\n';
 result.report=block+result.report.replace(/<!-- source-access:start -->[\s\S]*?<!-- source-access:end -->\s*/g,'');
 return result;
}
