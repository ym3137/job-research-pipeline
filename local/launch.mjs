import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function healthy(){try{const r=await fetch('http://127.0.0.1:4318/api/health',{signal:AbortSignal.timeout(1500)});return (await r.json()).app==='career-desk'}catch{return false}}
if(!await healthy()){
 fs.mkdirSync(path.join(root,'.local'),{recursive:true});
 const fd=fs.openSync(path.join(root,'.local/service.log'),'a',0o600);
 const child=spawn(process.execPath,[path.join(root,'local/server.mjs')],{cwd:root,detached:true,stdio:['ignore',fd,fd]});child.unref();fs.writeFileSync(path.join(root,'.local/service.pid'),String(child.pid));fs.closeSync(fd);
 let ready=false;for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,250));if(await healthy()){ready=true;break}}
 if(!ready)throw Error('求职工作台未能启动，请查看本机服务日志。');
}
spawnSync('/usr/bin/open',['http://127.0.0.1:4318/']);
