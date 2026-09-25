import {chromium} from 'playwright';
import fs from 'node:fs';
const browser=await chromium.launch({executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true});
try{
 const page=await browser.newPage();
 for(const route of ['Recruit','recruit']){
  const url=`https://careers.shein.cn/${route}?id=8fb7f93e-f089-49ae-8621-cad6638f0ad2`;
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4500);
  console.log(JSON.stringify({url,text:(await page.locator('body').innerText()).slice(0,2200)}));
 }
 await page.goto('https://www.xiaohongshu.com/explore',{waitUntil:'domcontentloaded'});
 await page.locator('#search-input').fill('SHEIN 校招 薪资');await page.locator('#search-input').press('Enter');await page.waitForTimeout(2500);
 const text=await page.locator('body').innerText();console.log(JSON.stringify({source:'xiaohongshu',url:page.url(),text:text.slice(0,1400)}));
 fs.writeFileSync('.local/xhs-access-check.json',JSON.stringify({checkedAt:new Date().toISOString(),url:page.url(),text:text.slice(0,2000)},null,2));
}finally{await browser.close();}
