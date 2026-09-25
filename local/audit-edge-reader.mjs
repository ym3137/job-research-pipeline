import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readPage} from '../edge-extension/reader.js';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'});
try{
 const page=await browser.newPage();
 await page.route('https://www.xiaohongshu.com/**',r=>r.fulfill({body:'<html><body></body></html>',contentType:'text/html'}));
 await page.goto('https://www.xiaohongshu.com/explore/6aa0f531000000001103737f');
 await page.setContent('<aside>AI总结：虚构薪资99万</aside><div class="note-container"><div id="detail-title">真实原帖</div><div id="detail-desc">这是原帖实际正文。仅为个人经历，需要交叉验证。</div><div class="comments-container">可见评论</div></div>');
 let r=await page.evaluate(readPage);assert.equal(r.kind,'note');assert.ok(!r.text.includes('99万'));assert.ok(r.text.includes('可见评论'));
 await page.setContent('<div class="login-container">扫码登录</div>');r=await page.evaluate(readPage);assert.equal(r.kind,'waiting_user');
 await page.setContent('<section class="note-item"><a href="https://www.xiaohongshu.com/explore/6aa0f531000000001103737f?xsec_token=test"><span class="title">岗位经历</span></a></section>');r=await page.evaluate(readPage);assert.equal(r.kind,'search');assert.equal(r.links.length,1);
 await page.setContent('<div>加载中</div>');r=await page.evaluate(readPage);assert.equal(r.kind,'unknown');
 console.log('Edge 页面读取测试通过：原帖/评论、排除AI摘要、登录等待、搜索链接和空白页。');
}finally{await browser.close()}
