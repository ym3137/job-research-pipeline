import {test} from 'node:test';
import assert from 'node:assert/strict';
test('extension resumes after login, retains search access URLs and submits actual notes only',async()=>{
 const saved={token:'fixture'},updates=[];let active=false;let page={kind:'waiting_user',reason:'请登录'};
 let job={id:'job',queries:['SHEIN 校招'],maxNotes:2};
 const original={fetch:globalThis.fetch,chrome:globalThis.chrome,setInterval:globalThis.setInterval,setTimeout:globalThis.setTimeout};
 globalThis.setInterval=()=>0;globalThis.setTimeout=fn=>original.setTimeout(fn,0);
 globalThis.fetch=async(url,options)=>({ok:true,json:async()=>{if(url.endsWith('/poll'))return {job};updates.push(JSON.parse(options.body));return {ok:true}}});
 globalThis.chrome={storage:{local:{get:async key=>({[key]:saved[key]}),set:async o=>Object.assign(saved,structuredClone(o)),remove:async key=>{delete saved[key]}}},tabs:{get:async()=>({id:1}),create:async()=>({id:1}),update:async(id,o)=>{if(o.active)active=true;return {id}}},scripting:{executeScript:async()=>[{result:page}]},runtime:{onMessage:{addListener(){}},onStartup:{addListener(){}},onInstalled:{addListener(){}}},alarms:{onAlarm:{addListener(){}}}};
 try{
  const {step}=await import('../edge-extension/worker.js');
  await step();assert.equal(updates.at(-1).status,'waiting_user');assert.equal(active,true);
  const url='https://www.xiaohongshu.com/explore/6aa0f531000000001103737f?xsec_token=temporary';
  page={kind:'search',links:[{url,title:'真实笔试经历'}]};await step();assert.equal(saved.progress.stage,'note');
  page={kind:'note',url,title:'真实笔试经历',text:'正文样本，不是搜索页AI总结。'};await step();
  assert.equal(updates.find(x=>x.note).note.text,page.text);assert.equal(updates.at(-1).status,'complete');assert.equal(saved.progress,undefined);
  job={id:'larger-job',queries:['SHEIN 面经','SHEIN 薪资'],maxNotes:20};
  page={kind:'search',links:Array.from({length:7},(_,i)=>({url:`https://www.xiaohongshu.com/explore/${i.toString(16).padStart(24,'0')}`,title:`相关原帖 ${i}`}))};
  await step();assert.equal(saved.progress.queue.length,5);assert.equal(saved.progress.stage,'note');
  job=null;await step();assert.equal(saved.progress,undefined);
 }finally{Object.assign(globalThis,original)}
});
