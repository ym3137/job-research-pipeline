export const dimensions={salary:'起薪与总包',salaryReference:'历史与市场薪资参考',salaryGrowth:'3–5年薪资空间',promotion:'晋升路径',skills:'专业与管理能力',transferability:'技能可迁移性',industry:'行业与赛道',growthCost:'成长代价',workLife:'工作生活平衡',mobility:'国际流动机会',competitiveness:'竞争力与录用难点'};
export const factSchema={type:'object',additionalProperties:false,properties:{value:{type:'string'},basis:{type:'string',enum:['official','platform','sample','inference','unknown']},source:{type:'string'}},required:['value','basis','source']};
export const comparisonSchema={type:'object',additionalProperties:false,properties:Object.fromEntries(Object.keys(dimensions).map(k=>[k,factSchema])),required:Object.keys(dimensions)};
export function validateComparison(p){
 return p.comparison&&Object.keys(dimensions).every(k=>{
  const f=p.comparison[k];
  return f&&typeof f.value==='string'&&f.value.trim()&&['official','platform','sample','inference','unknown'].includes(f.basis)&&typeof f.source==='string'&&(f.basis==='unknown'||/^https:\/\//.test(f.source));
 });
}
