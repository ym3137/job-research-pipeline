import fs from 'node:fs';
import path from 'node:path';
export function readCommunity(dir){try{return JSON.parse(fs.readFileSync(path.join(dir,'community-evidence.json'),'utf8'))}catch{return []}}
export function communityAccess(dir){
 try{const d=JSON.parse(fs.readFileSync(path.join(dir,'xhs-access-check.json'),'utf8'));return {checkedAt:d.checkedAt,status:d.mode==='edge_logged_in'&&d.readable===true?'edge_readable':String(d.url||'').includes('error_code=300012')?'network_restricted':'not_verified'}}catch{return {status:'not_checked',checkedAt:''}}
}
export function validateCommunity(data){
 if(typeof data.company!=='string'||!data.company.trim()||data.company.length>100||typeof data.text!=='string'||data.text.trim().length<10||data.text.length>12000)throw Error('请填写公司和10–12000字的原帖内容');
 let u;try{u=new URL(data.url)}catch{throw Error('原帖链接无效')}
 if(u.protocol!=='https:'||u.username||u.password||!/(^|\.)(xiaohongshu\.com|xhslink\.com|nowcoder\.com|maimai\.cn)$/.test(u.hostname))throw Error('请使用小红书、牛客或脉脉的原帖链接');
 return {company:data.company.trim(),url:u.href,text:data.text.trim(),sourceType:'user_supplied_excerpt',checkedAt:new Date().toISOString(),independentlyVerified:false};
}
