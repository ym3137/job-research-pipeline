import fs from 'node:fs';
import {dimensions} from './comparison.mjs';
const file='.local/runs/3e572d4b-5bf7-4e28-8792-dac93b062091/run.json';
const r=JSON.parse(fs.readFileSync(file));
const campus='https://career.hebut.edu.cn/home/correcruit/content/id/80110.html';
const historical='https://www.nowcoder.com/jobs/detail/390734';
const facts=[
 {promotion:'两年培养与轮岗，JD提及导师及晋升机会；实际晋升时间未承诺',salaryGrowth:'从增长分析延展到营销策略；3–5年薪资涨幅未披露',skills:'漏斗分析、实验设计、投放ROI与跨团队业务判断',transferability:'可迁移至增长、商业分析、用户策略及国际营销',industry:'跨境电商增长链条较完整，需持续适应市场与平台规则',growthCost:'全球协作与营销活动可能压缩作息弹性，需核实大促节奏',workLife:'工时未披露；需问跨时区会议、大促与补休安排',mobility:'业务面向全球；国际协作不等于获得外派资格'},
 {promotion:'向商品策略 / 分析骨干发展；职级与晋升周期未披露',salaryGrowth:'商品决策和策略落地可提升职责范围；无可靠薪资预测',skills:'商品结构、价格、上新策略与消费者洞察',transferability:'可迁移至品类策略、经营分析与商业分析',industry:'直接接近电商商品经营，可积累业务判断；受季节与需求波动影响',growthCost:'策略落地需要协调业务，可能面对业绩与时效压力',workLife:'常态工时未披露；核实大促分析与临时需求频率',mobility:'广州岗位；JD未承诺国际轮岗或外派'},
 {promotion:'从统计分析与指标治理向分析骨干发展；晋升速度待确认',salaryGrowth:'定价与数据治理技能有迁移价值；3–5年金额未知',skills:'SQL、统计推断、回归、指标口径与数据治理',transferability:'可迁移至定价分析、商业分析、BI与经营分析',industry:'定价与经营效率关联较强，业务解释能力决定成长上限',growthCost:'需平衡数据准确性与业务时效，技术深度需持续补足',workLife:'工时及上线值守未披露；需询问日常支持与紧急需求',mobility:'广州岗位；暂无岗位级外派证据'},
 {promotion:'培养定位为全球仓储质量监控骨干；管理晋升不等于已承诺',salaryGrowth:'业务管理范围扩大可能带来提升；具体薪资空间未知',skills:'质量指标、风险预警、跨区域沟通与问题闭环',transferability:'可迁移至供应链分析、运营质量与跨区域运营管理',industry:'与跨境履约效率直接相关，仓储专业积累较深',growthCost:'肇庆及仓储场景可能涉及现场 / 时差协作，需核实轮班与驻外安排',workLife:'班次、现场与夜间支持未披露；作为面试必问项',mobility:'JD涉及全球仓储和海外协作；实际外派、国家与安全安排待确认'},
 {promotion:'定向培养仓储经营分析骨干；具体晋升标准与周期未知',salaryGrowth:'经营诊断与管理汇报可拓展职责；没有可核验涨薪数字',skills:'指标体系、目标拆解、经营诊断与管理层汇报',transferability:'可迁移至经营分析、供应链策略与运营管理',industry:'在真实履约成本与经营效率场景积累，行业关联较强',growthCost:'肇庆工作地点与仓储现场接触需接受；不应将管理培养等同轻松作息',workLife:'常态工时及仓库现场比例未知；核实月末 / 季末汇报节奏',mobility:'以肇庆经营分析为主，JD没有明确外派承诺'},
 {promotion:'可向平台治理或风险策略骨干发展；晋升时间无公开证据',salaryGrowth:'量化治理与策略自动化可增加技能价值；具体薪资空间未知',skills:'风险归因、量化策略、治理自动化与跨团队推动',transferability:'可迁移至平台治理、风控策略与数据产品策略',industry:'平台治理需求随规模增长，但规则与合规环境变化快',growthCost:'治理事件可能产生响应压力；缺少团队工时样本',workLife:'上海岗位；工时未知，需确认应急响应及提前实习安排',mobility:'国际业务背景不代表个人外派；岗位级机会待确认'}
];
for(const [i,p] of r.result.positions.entries()){
 const j=r.inventory.jobs.find(j=>j.title===p.title);if(!j)throw Error('Missing official job');
 const old=p.url;p.url=j.applicationUrl;p.applicationUrl=j.applicationUrl;p.jdSnapshot=j.description;
 p.comparison=Object.fromEntries(Object.keys(dimensions).map(k=>[k,{value:'暂无可核验信息',basis:'unknown',source:''}]));
 p.comparison.salary={value:'2027届本岗位起薪 / 总包未披露，需HR确认',basis:'unknown',source:campus};
 if(i===1||i===2)p.comparison.salaryReference={value:'历史参考：15–40K × 16薪。2025届北京数据分析岗，已结束；不能视为本岗报价。',basis:'platform',source:historical};
 for(const [k,value] of Object.entries(facts[i]))p.comparison[k]={value,basis:'inference',source:p.url};
 p.comparison.competitiveness={value:i===0?'数据与英语背景匹配；直接电商 / 投放实习是缺口':i===1||i===2?'分析方法匹配；需用作品证明复杂SQL与业务落地':i===3||i===4?'分析与运营项目有基础；直接仓储业务经验不足':'分析能力可迁移；治理实习与提前实习条件是缺口',basis:'inference',source:p.url};
 p.evidence=p.evidence.replaceAll(old,p.url);r.result.report=r.result.report.replaceAll(old,p.url);
 j.url=p.url;
}
r.result.report+='\n\n## 比较维度补充\n\n当期岗位未分别披露薪资。历史平台样本不能当作本轮岗位报价。每岗已补充起薪、历史薪资参考、3–5年薪资空间、晋升、能力复利、迁移性、赛道、成长代价、工作生活平衡、国际流动及竞争力11项对比，区分来源与推断。\n';
r.updated=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(r,null,2));
fs.writeFileSync('SHEIN-2027届-修正后的岗位比较.md',r.result.report+'\n\n'+r.result.positions.map(p=>'## '+p.title+'\n\n[网申原始入口]('+p.url+')\n\n'+Object.entries(p.comparison).map(([k,v])=>'- **'+dimensions[k]+'**：'+v.value+'（'+v.basis+'）'+(v.source?' [依据]('+v.source+')':'')).join('\n')).join('\n\n'));
console.log('Updated six roles with all comparison dimensions.');
