const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=process.cwd(),server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root+path.sep)||file.endsWith('local-config.js')){res.writeHead(404);res.end();return;}fs.readFile(file,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(d);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let mode='answer',calls=0;
 await page.addInitScript(()=>{window.spoken=[];window.starts=0;window.SpeechRecognition=class{constructor(){window.recognition=this;}start(){window.starts++;this.onstart?.();}abort(){this.onend?.();}};window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel(){},speak(u){spoken.push(u.text);window.utterance=u;}}});});
 await page.route('**/generativelanguage.googleapis.com/**',r=>{calls++;return r.fulfill({json:{candidates:[{content:{parts:[{text:JSON.stringify(mode==='plan'?{answer:'주문 조회를 열 계획입니다.',actions:[{type:'click',id:1,target:'주문 조회'}],steps:[]}:{answer:'주문은 12건입니다.',actions:[],steps:[]})}]}}]}});});
 await page.goto(`http://127.0.0.1:${server.address().port}/extension/preview.html`);
 await page.evaluate(()=>{EnvGemini.save({key:'fake-only'});window.executed=0;const native=chrome.scripting.executeScript;chrome.scripting.executeScript=async opts=>{if(opts.func.name==='performActions')executed++;return native(opts);};});
 const say=async(text,isFinal=true)=>{await page.waitForFunction(()=>document.querySelector('[data-conversation]').dataset.listening==='true');await page.evaluate(({text,isFinal})=>recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal})]}),{text,isFinal});};
 await page.click('[data-conversation]');await page.click('[data-voice-consent]');await page.click('.voice-help summary');await page.selectOption('[data-voice-delay]','5000');await page.click('.voice-help summary');
 await say('삭제할 초안');await say('입력 지우기');assert.equal(await page.inputValue('#cmd'),'');
 await say('/요약');await say('메시지 전송',false);assert.equal(calls,0);assert.equal(await page.inputValue('#cmd'),'/요약');
 await say('메시지 전송');await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);assert.equal(calls,1);assert.equal(await page.locator('.msg.user').count(),1);await page.evaluate(()=>utterance.onend());
 await page.waitForFunction(()=>document.querySelector('[data-conversation]').dataset.listening==='true');
 const before=await page.evaluate(()=>starts);await page.evaluate(()=>recognition.onend());await page.waitForFunction(n=>starts>n,before);
 await say('메시지 전송');assert.equal(calls,1); // empty draft never sends
 await say('다음 내용');await say('입력 지우기');assert.equal(await page.inputValue('#cmd'),'');
 await page.click('.voice-help summary');await page.click('[data-auto-read]');await page.click('.voice-help summary');mode='plan';await say('주문 조회 눌러줘');await say('엔터키');await page.waitForSelector('[data-plan-run]:enabled');
 assert.equal(await page.evaluate(()=>executed),0);
 await say('실행 확인');assert.equal(await page.evaluate(()=>executed),0); // answer playback cannot confirm
 // An audio service can finalize captured speaker audio AFTER playback completion.
 await page.evaluate(()=>{window.echoRecognition=recognition;utterance.onend();echoRecognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'실행 확인'}],{isFinal:true})]});});
 await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>executed),0);
 await page.locator('[data-read-answer]').last().click();
 await page.waitForFunction(()=>document.querySelector('[data-conversation]').dataset.listening==='true');
 await page.evaluate(()=>window.echoRecognition=recognition);
 await say('읽기 중지');
 await page.evaluate(()=>echoRecognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'실행 확인'}],{isFinal:true})]}));
 await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>executed),0);
 await say('실행 확인');await page.waitForFunction(()=>executed===1);await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);
 await say('실행 확인');assert.equal(await page.evaluate(()=>executed),1); // no duplicate execution
 mode='answer';await say('결과 확인');await page.waitForFunction(()=>!document.querySelector('#cmd').disabled);assert.match(await page.locator('#feed').innerText(),/12건/);
 await say('읽기 중지');await say('음성 입력 중지');assert.equal(await page.getAttribute('[data-conversation]','aria-pressed'),'false');
 await page.waitForTimeout(400);assert.equal(await page.getAttribute('[data-conversation]','aria-pressed'),'false');
 assert.deepEqual(errors,[]);console.log('Voice commands browser checks passed: draft/clear, final-only send, Enter alias, restart, empty guard, playback isolation, confirmation, next step and stop.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
