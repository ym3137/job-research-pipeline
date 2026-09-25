type Context={registerTool:(tool:object,options:{signal:AbortSignal})=>void|Promise<void>};
export function registerCareerTools(stage:(input:{company:string;url:string})=>void){
 const ctx=(document as Document & {modelContext?:Context}).modelContext;if(!ctx)return;
 const lifecycle=new AbortController();
 Promise.resolve(ctx.registerTool({name:'stage_career_research',title:'填写岗位研究',description:'填写公司和官方招聘链接，不执行 AI 任务。工作台会先从官网核实投递上限，再确定推荐岗位数量。',inputSchema:{type:'object',additionalProperties:false,required:['company','url'],properties:{company:{type:'string'},url:{type:'string'}}},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input:unknown){const i=input as {company:string;url:string};if(!i||typeof i.company!=='string'||!i.company.trim()||i.company.length>100||typeof i.url!=='string')throw Error('公司或官网链接无效');const u=new URL(i.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('需要有效官网链接');stage(i);return {staged:true,started:false}}},{signal:lifecycle.signal})).catch(()=>{});
 return ()=>lifecycle.abort();
}
