import {chromium} from 'playwright';
import fs from 'node:fs';
const browser=await chromium.launch({executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true});
try{
 const page=await browser.newPage();
 page.on('response',async res=>{if(/jobDetail|Recruit.*js|recruit.*js/.test(res.url())){console.log(res.status(),res.url());const body=await res.text().catch(()=> '');if(/jobDetail/.test(res.url()))console.log(res.request().postData(),body.slice(0,1000));else fs.writeFileSync('/tmp/current-shein-detail.js',body)}});
 await page.goto('https://careers.shein.cn/recruit?id=8fb7f93e-f089-49ae-8621-cad6638f0ad2');await page.waitForTimeout(8000);
 const data=JSON.parse(fs.readFileSync('.local/shein-audit-inventory.json'));const j=data.jobs.find(j=>j.id==='8fb7f93e-f089-49ae-8621-cad6638f0ad2');
 await page.goto(j.applicationUrl,{waitUntil:'domcontentloaded'});await page.waitForTimeout(6000);console.log('MOKA',page.url(),(await page.locator('body').innerText()).slice(0,1500));
}finally{await browser.close()}
