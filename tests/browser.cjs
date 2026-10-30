// Uses an installed Playwright. No real Gemini requests or API keys are used.
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const root=process.cwd();
 const server=http.createServer((req,res)=>{
   const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
   if(!file.startsWith(root+path.sep)||file.endsWith('local-config.js')){res.writeHead(404);res.end();return;}
   fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(data);});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try {
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:460,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const payloads=[]; let hold=false, release;
 await page.route('**/generativelanguage.googleapis.com/**',async route=>{
   payloads.push(route.request().postDataJSON());
   if(hold) await new Promise(r=>{release=r;});
   await route.fulfill({json:{candidates:[{content:{parts:[{text:JSON.stringify({answer:'주문은 총 12건입니다.',steps:[],actions:[]})}]}}]}}).catch(()=>{});
 });
 const origin=`http://127.0.0.1:${server.address().port}`;
 const tool=async name=>{await page.locator('[data-menu-toggle]').click();await page.locator(`[data-cmd="${name}"]`).click();};
 await page.goto(origin+'/extension/preview.html');
 await page.evaluate(()=>EnvGemini.save({key:'fake-browser-test'}));
 await tool('요약');
 await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);
 assert.match(await page.locator('#feed').innerText(),/주문은 총 12건/);
 await page.fill('#cmd','그다음은?');await page.press('#cmd','Enter');
 await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);
 assert.equal(payloads[1].contents.length,3);
 await page.reload();
 assert.match(await page.locator('#feed').innerText(),/이전 대화를 복원/);
 assert.equal(await page.locator('[data-plan-run]').count(),0);
 hold=true;
 await tool('요약');await page.waitForFunction(()=>!document.querySelector('[data-stop]').hidden);await page.click('[data-stop]');release?.();hold=false;
 await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);
 assert.match(await page.locator('#feed').innerText(),/중지했어요/);
 await page.click('[data-new]');await page.reload();
 assert.doesNotMatch(await page.locator('#feed').innerText(),/주문은 총 12건/);
 await tool('선택');await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);
 assert.match(await page.locator('#feed').innerText(),/글을 드래그/);
 // Exercise extraction against real DOM, including inputs outside a form and table rows.
 await page.goto(origin+'/demo-site/orders-search.html');
 await page.addScriptTag({path:path.join(root,'extension/pagereader.js')});
 const result=await page.evaluate(()=>{
   const el=document.createElement('input');el.placeholder='외부 검색';document.body.prepend(el);
   const text=document.createElement('p');text.textContent='선택한 테스트 문장';document.body.prepend(text);
   const range=document.createRange();range.selectNodeContents(text);getSelection().removeAllRanges();getSelection().addRange(range);
   return extractPage();
 });
 assert.equal(result.selection,'선택한 테스트 문장');
 assert.ok(result.forms.some(f=>f.fields.some(x=>x.label==='외부 검색')));
 assert.ok(result.snapshot);
 assert.deepEqual(errors,[]);
 console.log('Browser checks passed: summary, follow-up, restore, stop, reset, selection, extraction, no script errors.');
 } finally {await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
