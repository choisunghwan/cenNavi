// Local SSE fixture + preview UI. No real credentials, AI calls, or site actions.
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const http=require('node:http'), fs=require('node:fs'), path=require('node:path');
const assert=require('node:assert/strict');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=process.cwd();let mode='paused',rewrite=false,finishStream;const requests=[];
 const event=(text,finishReason)=>'data: '+JSON.stringify({candidates:[{content:{parts:[{text}]},...(finishReason?{finishReason}:{})}]})+'\n\n';
 const server=http.createServer(async(req,res)=>{
  if(req.url.startsWith('/__test_api')) {
   let body='';for await(const chunk of req)body+=chunk;
   const payload=JSON.parse(body);requests.push(payload);
   if(!req.url.includes('streamGenerateContent')) {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({command:'분석',args:rewrite?'김영희 검색해줘':payload.contents[0].parts[0].text})}]}}]}));return;}
   res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');
   const outcomes={
    summary:{answer:'실시간 답변입니다. 끝까지 생성됐어요.',actions:[],steps:[]},
    first:{answer:'검색 화면을 열겠습니다.',actions:[{type:'click',id:1,target:'주문 조회'}],steps:[]},
    second:{answer:'김철수를 입력하고 조회하겠습니다.',actions:[{type:'type',id:10,target:'고객명',text:'김철수'},{type:'click',id:11,target:'조회'}],steps:[]},
    done:{answer:'화면에 김철수 조회 결과가 표시됩니다.',actions:[],steps:[]},
    blocked:{answer:'삭제하겠습니다.',actions:[{type:'click',id:12,target:'삭제'}],steps:[]},
    wrongTarget:{answer:'조회 버튼을 누르세요.',actions:[],steps:[{id:11,target:'주문 조회'}]},
    guided:{answer:'**조회** 버튼을 누르세요.',actions:[],steps:[{id:11,target:'조회',label:'조회'}]},
    guessed:{answer:'**조회** 버튼을 누르세요.',actions:[],steps:[]},
    wrongAction:{answer:'조회하겠습니다.',actions:[{type:'click',id:11,target:'AI 검색'}],steps:[]},
   };
   const requestMode=mode;
   const text=JSON.stringify(outcomes[requestMode]||outcomes.summary),split=Math.min(20,text.length-1);
   res.write(event(text.slice(0,split)));
   if(requestMode==='abort') { await new Promise(resolve=>res.once('close',resolve)); return; }
   if(requestMode==='paused') await new Promise(resolve=>{finishStream=resolve;}); else await delay(100);
   if(requestMode!=='truncated')res.write(event(text.slice(split),'STOP'));
   res.end();return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)||file.endsWith('local-config.js')||file.includes(path.sep+'.git'+path.sep)){res.writeHead(404);res.end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(data);});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:460,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const nativeFetch=window.fetch.bind(window);window.fetch=(url,opts)=>nativeFetch(String(url).startsWith('https://generativelanguage.googleapis.com/')?'/__test_api?'+(String(url).includes(':streamGenerateContent')?'streamGenerateContent':'generateContent'):url,opts);});
  await page.goto(`http://127.0.0.1:${server.address().port}/extension/preview.html`);
  const tool=async name=>{await page.locator('[data-menu-toggle]').click();await page.locator(`[data-cmd="${name}"]`).click();};
  await page.evaluate(()=>EnvGemini.save({key:'local-fixture-only'}));
  await tool('요약');
  await page.waitForSelector('.streaming');
  assert.equal(await page.locator('#cmd').isDisabled(),true);
  assert.match(await page.locator('.streaming').innerText(),/실시간/);
  assert.equal(await page.locator('[data-plan-run]').count(),0);
  finishStream();mode='summary';
  await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);
  assert.match(await page.locator('#feed').innerText(),/끝까지 생성/);
  await page.click('[data-new]');
  mode='truncated';await tool('요약');await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);
  assert.match(await page.locator('#feed').innerText(),/중단됐어요/);assert.equal(await page.locator('[data-plan-run]').count(),0);
  assert.equal(await page.evaluate(()=>EnvConversation.create('screenGuide.panel.v1').messages().filter(x=>x.role==='model').length),0);
  await page.click('[data-new]');mode='abort';await tool('요약');await page.waitForSelector('.streaming');await page.click('[data-stop]');
  await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);await page.reload();
  assert.doesNotMatch(await page.locator('#feed').innerText(),/실시간 답변/);
  await page.click('[data-new]');
  await page.evaluate(()=>{
   window.testActions=0;window.testHighlights=0;const script=chrome.scripting.executeScript;
   chrome.scripting.executeScript=async opts=>{if(opts.func.name==='performActions')window.testActions++;if(opts.func.name==='showVerifiedTargets')window.testHighlights++;return script(opts);};
   SAMPLE_PAGE.forms=[{fields:[{id:10,type:'text',label:'고객명'}]}];
   SAMPLE_PAGE.buttons=[{id:11,t:'조회'},{id:12,t:'삭제'}];
  });
  const ask=async text=>{await page.fill('#cmd',text);await page.press('#cmd','Enter');await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);};
  mode='first';await ask('김철수 검색해줘');
  assert.equal(await page.evaluate(()=>testActions),0);
  await page.click('[data-plan-run]');await page.waitForSelector('[data-plan-next]');
  assert.equal(await page.evaluate(()=>testActions),1);
  // A new tab must be rejected before any AI request or page extraction.
  const before=requests.length;
  await page.evaluate(()=>{window.originalQuery=chrome.tabs.query;chrome.tabs.query=async()=>[{id:2,url:document.querySelector('#fakeTab').value,status:'complete'}];});
  await page.click('[data-plan-next]');await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);
  assert.match(await page.locator('#feed').innerText(),/작업하던 탭/);assert.equal(requests.length,before);
  await page.evaluate(()=>{chrome.tabs.query=originalQuery;const select=document.querySelector('#fakeTab');select.value='https://order-test.company.example/login';select.dispatchEvent(new Event('change'));});
  mode='second';await page.click('[data-retry]');await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);
  assert.equal(await page.evaluate(()=>testActions),1);
  assert.match(requests.at(-1).contents.at(-1).parts[0].text,/원래 요청: 김철수 검색해줘/);
  assert.equal(await page.locator('[data-plan-run]:enabled').count(),1);
  assert.equal(await page.locator('.task-card').count(),1);
  assert.equal(await page.locator('.msg.user').count(),1);
  assert.equal(await page.locator('.task-history[open]').count(),0);
  assert.equal(await page.locator('.task-history .history-step').count(),1);
  await page.locator('[data-plan-run]:enabled').click();await page.waitForFunction(()=>window.testActions===2);
  await page.waitForFunction(()=>document.querySelectorAll('[data-plan-next]').length===1);
  mode='done';await page.locator('[data-plan-next]').last().click();await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);
  assert.match(await page.locator('#feed').innerText(),/조회 결과가 표시/);assert.equal(await page.evaluate(()=>testActions),2);
  assert.equal(await page.locator('.task-card').count(),1);assert.equal(await page.locator('.msg.user').count(),1);
  assert.equal(await page.locator('.task-history .history-step').count(),2);
  mode='blocked';await ask('삭제 버튼 눌러줘');assert.equal(await page.locator('[data-plan-run]:enabled').count(),0);
  assert.match(await page.locator('#feed').innerText(),/직접 해야 하는 동작/);
  await page.click('[data-new]');rewrite=true;mode='first';
  await ask('주문 환경에서 김철수 검색해줘');
  assert.match(requests.at(-1).contents.at(-1).parts[0].text,/질문: 주문 환경에서 김철수 검색해줘/);
  await page.locator('[data-plan-run]:enabled').click();await page.waitForSelector('[data-plan-next]');
  mode='second';await page.locator('[data-plan-next]').last().click();await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);
  assert.match(requests.at(-1).contents.at(-1).parts[0].text,/원래 요청: 주문 환경에서 김철수 검색해줘/);
  assert.equal(await page.locator('[data-plan-run]:enabled').count(),1);
  await page.evaluate(()=>{const feed=document.querySelector('#feed');feed.style.scrollBehavior='auto';feed.scrollTop=feed.scrollHeight;});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:'docs/screenshots/09-clean-task.png',fullPage:true});
  await page.click('[data-new]');
  mode='wrongTarget';await ask('조회 버튼은 어디야?');assert.equal(await page.evaluate(()=>testHighlights),0);
  mode='guessed';await ask('조회 버튼은 어디야?');assert.equal(await page.evaluate(()=>testHighlights),0);
  mode='guided';await ask('이 화면이 뭐야?');assert.equal(await page.evaluate(()=>testHighlights),0);
  await tool('요약');await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);assert.equal(await page.evaluate(()=>testHighlights),0);
  await ask('조회 버튼은 어디야?');assert.equal(await page.evaluate(()=>testHighlights),1);
  mode='wrongAction';await ask('조회 버튼 눌러줘');assert.equal(await page.locator('[data-plan-run]:enabled').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Workflow browser checks passed: partial streaming, truncated stream, stop/reload, navigation, same-tab continuation, fresh confirmation, blocked action.');
 } finally {await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
