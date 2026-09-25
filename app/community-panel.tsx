'use client';
import {useState} from 'react';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';
export function CommunityPanel({company,token,access}:{company:string;token:string;access?:{status:string;checkedAt:string}}){
 const [url,setUrl]=useState(''),[text,setText]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function save(){setBusy(true);try{const r=await fetch('/api/community/evidence',{method:'POST',headers:{'Content-Type':'application/json','X-Career-Token':token},body:JSON.stringify({company,url,text})});const d=await r.json() as {error?:string;saved?:boolean};if(!r.ok)throw Error(d.error);setMessage('已保存，下次研究这家公司时会使用。');setUrl('');setText('')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 return <div className="community-panel"><span className="source-dot"/><strong>社区核验</strong><p>{access?.status==='edge_readable'?'历史检查：已通过 Edge 手动读取部分原帖。本轮自动连接状态见上方。':access?.status==='network_restricted'?'历史检查：独立浏览器访问曾受网络风控阻挡。本轮 Edge 连接状态见上方。':'小红书与论坛的读取状态会单独核验。'}</p>{access?.checkedAt&&<small>检查于 {new Date(access.checkedAt).toLocaleDateString('zh-CN')}</small>}<details><summary>补充能打开的帖子</summary><p>当前公司：{company||'请先填写公司'}。粘贴原帖链接与正文，供下次研究比较；保存不等于已完成独立核验。</p><Input aria-label="社区原帖链接" placeholder="原帖链接 https://…" value={url} onChange={e=>setUrl(e.target.value)}/><Textarea aria-label="社区原帖正文" placeholder="帖子正文、日期、岗位及城市信息" value={text} onChange={e=>setText(e.target.value)}/><Button variant="outline" disabled={busy||!company||!url||text.trim().length<10} onClick={save}>保存来源</Button><p role="status">{message}</p></details></div>;
}
