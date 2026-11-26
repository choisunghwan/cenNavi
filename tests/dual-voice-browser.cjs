const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=process.cwd();const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root+path.sep)||file.endsWith('local-config.js')){res.writeHead(404);res.end();return;}fs.readFile(file,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(d);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:360,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 await page.addInitScript(()=>{
 window.spoken=[];window.speechCancelled=0;
 window.SpeechRecognition=class{constructor(){window.recognition=this;}start(){this.onstart?.();}stop(){this.onend?.();}abort(){this.onend?.();}};
 window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel(){window.speechCancelled++;},speak(u){window.spoken.push(u.text);window.utterance=u;}}});
 });
 await page.route('**/generativelanguage.googleapis.com/**',r=>r.fulfill({json:{candidates:[{content:{parts:[{text:JSON.stringify({answer:'주문은 **12건**입니다.',actions:[],steps:[]})}]}}]}}));
 await page.goto(`http://127.0.0.1:${server.address().port}/extension/preview.html`);
 const say=async(text,isFinal=true)=>page.evaluate(({text,isFinal})=>recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal})]}),{text,isFinal});
 await page.evaluate(()=>EnvGemini.save({key:'fake-only'}));
 await page.locator('#cmd').press('Enter');
 await page.click('[data-mic]');await page.click('[data-voice-consent]');
 await say('메시지 전송');assert.equal(await page.inputValue('#cmd'),'메시지 전송');
 await page.waitForTimeout(2200);assert.equal(await page.locator('.msg.user').count(),0);
 await page.keyboard.press('Escape');await page.fill('#cmd','');
 await page.click('[data-conversation]');assert.equal(await page.getAttribute('[data-conversation]','aria-pressed'),'true');
 assert.notEqual(await page.locator('[data-conversation] .voice-wave').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 const firstFrame=await page.locator('[data-conversation] .voice-wave').first().evaluate(el=>getComputedStyle(el).transform);
 await page.waitForTimeout(160);
 assert.notEqual(await page.locator('[data-conversation] .voice-wave').first().evaluate(el=>getComputedStyle(el).transform),firstFrame);
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('[data-conversation] .voice-wave').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await say('주문 내용을 알려줘',false);await page.waitForTimeout(2200);assert.equal(await page.locator('.msg.user').count(),0);
 await page.evaluate(()=>recognition.onend());await page.waitForFunction(()=>document.querySelector('[data-conversation]').dataset.listening==='true');assert.equal(await page.inputValue('#cmd'),'');
 await say('주문 내용을 알려줘');await say('아직 확정 안 된 덧말',false);await page.evaluate(()=>recognition.onend());assert.equal(await page.inputValue('#cmd'),'주문 내용을 알려줘');await page.waitForSelector('.msg.user');await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);
 assert.equal(await page.locator('.msg.user').count(),1);assert.equal(await page.evaluate(()=>spoken.length),1);assert.notEqual(await page.locator('[data-conversation] .voice-wave').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.evaluate(()=>{window.oldRecognition=recognition;utterance.onend();oldRecognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'메시지 전송'}],{isFinal:true})]});});
 await page.waitForFunction(()=>document.querySelector('[data-conversation]').getAttribute('data-state')==='listening');
 await say('다음 내용을 알려줘');await page.waitForFunction(()=>document.querySelectorAll('.msg.user').length===2);await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);
 assert.equal(await page.evaluate(()=>spoken.length),2);
 await page.click('[data-conversation]');assert.equal(await page.getAttribute('[data-conversation]','aria-pressed'),'false');
 await page.waitForTimeout(2100);assert.equal(await page.locator('.msg.user').count(),2);
 await page.click('[data-mic]');await say('받아쓰기만 해줘');await page.evaluate(()=>recognition.onend());assert.equal(await page.getAttribute('[data-mic]','aria-pressed'),'false');assert.equal(await page.inputValue('#cmd'),'받아쓰기만 해줘');
 await page.reload();assert.equal(await page.getAttribute('[data-conversation]','aria-pressed'),'false');assert.equal(await page.evaluate(()=>spoken.length),0);
 await page.screenshot({path:'docs/screenshots/13-dual-voice.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('Dual voice checks passed: literal dictation, final-only automatic send, spoken reply, second turn, stale echo isolation, mode stop and reload.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
