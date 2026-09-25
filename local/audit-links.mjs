import {chromium} from 'playwright';
import fs from 'node:fs';
const run=JSON.parse(fs.readFileSync('.local/runs/3e572d4b-5bf7-4e28-8792-dac93b062091/run.json'));
const browser=await chromium.launch({executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true});
const results=[];
try{
 for(const p of run.result.positions){
  const page=await browser.newPage();const url=p.url.replace('/Recruit?','/recruit?');
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  let ok=false;try{await page.getByText(p.title,{exact:true}).first().waitFor({timeout:25000});await page.getByText('职位描述',{exact:true}).first().waitFor({timeout:15000});ok=true}catch{}
  const body=await page.locator('body').innerText();results.push({title:p.title,url,status:ok?'verified':'unverified',checkedAt:new Date().toISOString(),text:body.slice(0,450)});console.log(JSON.stringify(results.at(-1)));await page.close();
 }
 fs.writeFileSync('.local/link-audit.json',JSON.stringify(results,null,2));
}finally{await browser.close()}
