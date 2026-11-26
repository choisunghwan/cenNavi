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
 await page.locator('[data-mic]').click();await page.locator('[data-voice-consent]').click();
 assert.equal(await page.locator('[data-mic]').getAttribute('aria-pressed'),'true');
 await page.evaluate(()=>recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'이 페이지 요약해줘'}],{isFinal:true})]}));
 assert.equal(await page.locator('#cmd').inputValue(),'이 페이지 요약해줘');assert.equal(await page.locator('.msg.user').count(),0);
 await page.keyboard.press('Escape');assert.equal(await page.locator('[data-mic]').getAttribute('aria-pressed'),'false');
 await page.evaluate(()=>EnvGemini.save({key:'fake-only'}));
 await page.click('.voice-help summary');await page.locator('[data-auto-read]').click();await page.click('.voice-help summary');await page.locator('#cmd').fill('/요약');await page.locator('#cmd').press('Enter');await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);
 assert.deepEqual(await page.evaluate(()=>spoken),['주문은 12건입니다.']);
 await page.locator('[data-voice-stop]').click();await page.locator('[data-read-answer]').last().click();assert.equal(await page.evaluate(()=>spoken.length),2);
 await page.locator('[data-mic]').click();assert.equal(await page.locator('[data-voice-stop]').isHidden(),true);
 await page.evaluate(()=>recognition.onerror({error:'not-allowed'}));assert.match(await page.locator('[data-voice-status]').innerText(),/권한/);
 await page.screenshot({path:'docs/screenshots/12-voice-controls.png',fullPage:true});
 await page.locator('[data-new]').click();assert.equal(await page.locator('[data-mic]').getAttribute('aria-pressed'),'false');
 await page.reload();assert.equal(await page.evaluate(()=>spoken.length),0);assert.equal(await page.locator('[data-auto-read]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 // Keyboard edits stop dictation, and late recognition events cannot overwrite them.
 await page.locator('[data-mic]').click();
 await page.evaluate(()=>window.staleRecognition=recognition);
 await page.locator('#cmd').fill('직접 수정한 내용');
 await page.evaluate(()=>staleRecognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'늦게 온 인식'}],{isFinal:true})]}));
 assert.equal(await page.locator('#cmd').inputValue(),'직접 수정한 내용');
 // Plans must read the targets and operations, not merely the model summary.
 await page.evaluate(()=>{const body=document.createElement('div');body.id='voice-plan-test';body.innerHTML='<div class="plan"><div class="plan-summary">검색 계획입니다.</div><ol class="plan-steps"><li><span class="step-target">고객명</span><span>김철수 입력</span></li><li>조회 버튼 클릭</li></ol><div class="plan-controls"><button>실행</button></div></div>';document.querySelector('#feed').appendChild(body);EnvSpeechTest=EnvSpeech.mount;});
 // Exercise a fresh module instance using the same production DOM API.
 await page.evaluate(()=>{window.voiceTest=EnvSpeech.mount({input:document.querySelector('#cmd'),form:document.querySelector('#form'),feed:document.querySelector('#feed')});voiceTest.complete(document.querySelector('#voice-plan-test'),false);});
 await page.locator('#voice-plan-test [data-read-answer]').click();
 assert.match(await page.evaluate(()=>spoken.at(-1)),/고객명.*김철수 입력.*조회 버튼 클릭/s);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});const before=spoken.length;voiceTest.complete(document.querySelector('#voice-plan-test'));window.hiddenSpoke=spoken.length!==before;delete document.hidden;});
 assert.equal(await page.evaluate(()=>hiddenSpoke),false);
 await page.evaluate(()=>{voiceTest.cancel();document.querySelector('#voice-plan-test').remove();document.querySelector('.voice-controls:last-of-type')?.remove();});
 assert.deepEqual(errors,[]);
 console.log('Speech browser checks passed: consent, dictation draft, no auto-send, Escape, auto/manual read, stop, permission failure, reset and reload.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
