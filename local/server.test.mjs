import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('local service authentication, validation, persistence, result and cancellation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'career-desk-test-'));
 const fake=path.join(dir,'fake-codex');
 const fakeBuilder=path.join(dir,'fake-builder');
 fs.writeFileSync(fakeBuilder,`const fs=require('fs');const a=process.argv.slice(2);fs.writeFileSync(a[a.indexOf('--docx')+1],'docx');fs.writeFileSync(a[a.indexOf('--pdf')+1],'pdf');`,{mode:0o700});
 fs.writeFileSync(fake,`#!${process.execPath}\nconst fs=require('fs');const a=process.argv.slice(2);if(a[0]==='login'){console.log('Logged in using ChatGPT');process.exit(0)}let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{if(input.includes('slow-fixture')){setTimeout(()=>process.exit(0),30000);return}const result={summary:'fixture result',applicationRule:'官方规则：每人限投 1 个。https://example.com/rules',applicationLimit:1,recommendedTarget:2,positions:[{title:'Analyst',url:'https://example.com/job',location:'Shanghai',fit:'fixture',evidence:'fixture',gaps:'fixture',comparison:{"salary":{"value":"No verified information","basis":"unknown","source":""},"salaryReference":{"value":"No verified information","basis":"unknown","source":""},"salaryGrowth":{"value":"No verified information","basis":"unknown","source":""},"promotion":{"value":"No verified information","basis":"unknown","source":""},"skills":{"value":"No verified information","basis":"unknown","source":""},"transferability":{"value":"No verified information","basis":"unknown","source":""},"industry":{"value":"No verified information","basis":"unknown","source":""},"growthCost":{"value":"No verified information","basis":"unknown","source":""},"workLife":{"value":"No verified information","basis":"unknown","source":""},"mobility":{"value":"No verified information","basis":"unknown","source":""},"competitiveness":{"value":"No verified information","basis":"unknown","source":""}}}],report:'# fixture report'};fs.writeFileSync(a[a.indexOf('-o')+1],JSON.stringify(result));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}))})`,{mode:0o700});
 const p=spawn(process.execPath,['local/server.mjs'],{cwd:process.cwd(),env:{...process.env,CAREER_PORT:'4320',CAREER_DATA_DIR:dir,CAREER_JOB_ROOT:dir,CAREER_CODEX:fake,CAREER_PYTHON:process.execPath,CAREER_RESUME_BUILDER:fakeBuilder,CAREER_QUOTA_DISABLED:'1'},stdio:'ignore'});
 const base='http://127.0.0.1:4320';
 try{
  let s;for(let n=0;n<50;n++){try{s=await (await fetch(base+'/api/state')).json();break}catch{await wait(100)}}
  assert.ok(s?.authenticated);assert.ok(s.token);
  const post=(route,data,token=s.token,origin=base)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Career-Token':token,Origin:origin},body:JSON.stringify(data)});
  assert.equal((await post('/api/profile',{profile:'x',resume:'y'},'wrong')).status,403);
  assert.equal((await post('/api/profile',{profile:'x',resume:'y'},s.token,'https://malicious.example')).status,403);
  assert.equal((await post('/api/profile',{profile:'confirmed',resume:'resume fixture'})).status,200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'profile.json'))).profile,'confirmed');
 const data={kind:'research',company:'Fixture',url:'https://example.com',notes:'',model:'gpt-5.6-terra',effort:'medium'};
  assert.equal((await post('/api/runs',{...data,url:'javascript:alert(1)'})).status,400);
  assert.equal((await post('/api/runs',{...data,model:'unapproved'})).status,400);
  assert.equal((await post('/api/runs',{...data,kind:'resume',parentId:'missing'})).status,400);
  assert.equal((await post('/api/community/evidence',{company:'Fixture',url:'https://evil.example/a',text:'A sufficiently long excerpt'})).status,400);
  assert.equal((await post('/api/community/evidence',{company:'Fixture',url:'https://www.xiaohongshu.com/explore/test',text:'A sufficiently long excerpt'})).status,200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'community-evidence.json')))[0].independentlyVerified,false);
  const started=await (await post('/api/runs',data)).json();assert.equal(started.status,'running');
  let done;for(let n=0;n<50;n++){done=(await (await fetch(base+'/api/state')).json()).runs.find(r=>r.id===started.id);if(done.status!=='running')break;await wait(100)}
  assert.equal(done.status,'partial');assert.equal(done.recommendedTarget,2);assert.equal(done.result.positions[0].title,'Analyst');assert.equal(done.usage.input_tokens,1);
  const resume=await (await post('/api/runs',{kind:'resume',company:'',url:'',notes:'',model:'gpt-5.6-terra',effort:'medium',parentId:started.id,position:done.result.positions[0]})).json();
  let resumeDone;for(let n=0;n<50;n++){resumeDone=(await (await fetch(base+'/api/state')).json()).runs.find(r=>r.id===resume.id);if(resumeDone.status!=='running')break;await wait(100)}
  assert.equal(resumeDone.status,'completed');assert.ok(resumeDone.resumeFiles.docx);assert.ok(resumeDone.resumeFiles.pdf);assert.ok(fs.existsSync(path.join(dir,resumeDone.resumeFiles.docx)));assert.ok(fs.existsSync(path.join(dir,resumeDone.resumeFiles.pdf)));
  assert.equal(path.dirname(resumeDone.resumeFiles.docx),'Fixture Analyst');assert.equal(resumeDone.progress.stage,4);
  assert.equal((await post(`/api/runs/${resume.id}/files/docx`,{})).status,200);
  assert.equal((await post(`/api/runs/${resume.id}/files/pdf`,{})).status,200);
  assert.equal((await post(`/api/runs/${resume.id}/files/exe`,{})).status,404);
  const slow=await (await post('/api/runs',{...data,notes:'slow-fixture'})).json();
  assert.equal((await post('/api/runs',data)).status,400);
  assert.equal((await post('/api/runs/'+slow.id+'/cancel',{})).status,200);
  await wait(300);const stopped=(await (await fetch(base+'/api/state')).json()).runs.find(r=>r.id===slow.id);assert.equal(stopped.status,'cancelled');
  const extensionId='b'.repeat(32),pair=await (await post('/api/edge/pair',{extensionId})).json();
  const edgePost=(route,data,origin=`chrome-extension://${extensionId}`)=>fetch(base+'/api/edge/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Edge-Token':pair.token,Origin:origin},body:JSON.stringify(data)});
  assert.equal((await edgePost('poll',{},'https://evil.example')).status,403);
  assert.equal((await fetch(base+'/api/state',{headers:{Origin:`chrome-extension://${extensionId}`,'X-Edge-Token':pair.token}})).status,403);
  await edgePost('poll',{});
  const pending=post('/api/runs',data);let job;
  for(let n=0;n<50;n++){job=(await (await edgePost('poll',{})).json()).job;if(job)break;await wait(50)}
  assert.ok(job);assert.ok(job.queries.every(q=>q.includes('Fixture')));
  await edgePost('update',{id:job.id,status:'waiting_user',reason:'请登录'});
  await edgePost('update',{id:job.id,status:'reading',note:{url:'https://www.xiaohongshu.com/explore/6aa0f531000000001103737f?xsec_token=private',title:'实际原帖',text:'个人笔试经历，需要专业论坛交叉核验。'}});
  await edgePost('update',{id:job.id,status:'complete',reason:'已读取1篇'});
  const bridged=await (await pending).json();let final;
  for(let n=0;n<50;n++){final=(await (await fetch(base+'/api/state')).json()).runs.find(r=>r.id===bridged.id);if(final?.result)break;await wait(100)}
  assert.equal(final.result.sourceAccess[0].status,'partial');assert.ok(final.result.report.includes('实际原帖'));
  assert.ok(!fs.readFileSync(path.join(dir,'runs',bridged.id,'edge-evidence.json'),'utf8').includes('private'));
 }finally{if(p.exitCode===null){p.kill('SIGTERM');await new Promise(r=>p.once('exit',r))}fs.rmSync(dir,{recursive:true,force:true})}
});
