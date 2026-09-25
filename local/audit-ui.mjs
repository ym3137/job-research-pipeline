import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['local/server.mjs'],{stdio:'ignore'});
let browser;
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:4318/api/health');break}catch{await new Promise(r=>setTimeout(r,250))}}
 browser=await chromium.launch({executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true});
 const page=await browser.newPage({viewport:{width:1600,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4318/');await page.getByText('机会，放在一起看。').waitFor();
 assert.equal(await page.locator('.comparison-table tbody tr').count(),6);
 assert.equal(await page.locator('.job-card').count(),6);
 assert.equal(await page.locator('a[href*="/Recruit?"]').count(),0);
 assert.equal(await page.locator('.job-top a[href*="app.mokahr.com"]').count(),6);
 await page.getByText('小红书：本次访问受网络风控阻挡。登录 Edge 不会自动连接到研究任务。').waitFor();
 await page.getByText('补充能打开的帖子',{exact:true}).click();
 await page.route('**/api/community/evidence',async route=>{const data=route.request().postDataJSON();assert.equal(data.company,'SHEIN');await route.fulfill({json:{saved:true}})});
 await page.getByLabel('社区原帖链接').fill('https://www.xiaohongshu.com/explore/ui-test');await page.getByLabel('社区原帖正文').fill('仅用于界面测试，不提交到真实来源库。');await page.getByRole('button',{name:'保存来源'}).click();await page.getByText('已保存，下次研究这家公司时会使用。').waitFor();await page.getByText('补充能打开的帖子',{exact:true}).click();
 await page.screenshot({path:'.local/workbench-desktop.png'});
 await page.getByRole('button',{name:'成长性细看'}).click();await page.getByRole('columnheader',{name:'3–5年薪资空间'}).waitFor();
 await page.locator('.comparison-title').scrollIntoViewIfNeeded();await page.screenshot({path:'.local/workbench-growth.png'});
 await page.locator('.dimension-details summary').first().click();assert.ok(await page.locator('.dimension-details[open] dt').count()===11);
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'mobile page overflows');
 await page.screenshot({path:'.local/workbench-mobile.png'});
 assert.deepEqual(errors,[]);fs.writeFileSync('.local/ui-audit.json',JSON.stringify({checkedAt:new Date().toISOString(),jobs:6,dimensions:11,mobileOverflow:false,errors},null,2));
 console.log('UI passed: six roles, working comparison modes, eleven dimensions, mobile width and no runtime errors.');
}finally{await browser?.close();server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
