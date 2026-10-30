const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function actionRuntime(els){
  const ctx=vm.createContext({window:{__guideSnapshot:'same',__guideEls:els,
    __guideState:{snapshot:'same',resolve:(id,target)=>els[id]&&target?{ok:true,element:els[id],x:50,y:50}:{ok:false,reason:'missing'}},
    __cenNaviControl:{token:'run',cancelled:false,moveTo:async()=>{},press:async()=>{},dispose(){}}},setTimeout,KeyboardEvent:class{}});
  vm.runInContext(fs.readFileSync('extension/pagereader.js','utf8'),ctx);return ctx;
}
test('a stale page snapshot cannot execute a click', async()=>{
  let clicked=false;
  const ctx=vm.createContext({window:{__guideSnapshot:'new',__guideEls:[{isConnected:true,innerText:'조회',getAttribute(){return '';},scrollIntoView(){},click(){clicked=true;}}]},setTimeout});
  vm.runInContext(fs.readFileSync('extension/pagereader.js','utf8'),ctx);
  const results=await ctx.performActions([{type:'click',id:0}], 'old');
  assert.equal(results[0].ok,false); assert.equal(clicked,false);
});
test('Enter cannot submit a password form',async()=>{
  let submitted=false;
  const el={isConnected:true,tagName:'INPUT',type:'text',form:{querySelector:()=>({}),requestSubmit(){submitted=true;}},focus(){},dispatchEvent(){return true;}};
  const ctx=actionRuntime([el]);
  const results=await ctx.performActions([{type:'enter',id:0,target:'검색어'}], 'same','run');
  assert.equal(results[0].ok,false);assert.match(results[0].note,/비밀번호/);assert.equal(submitted,false);
});

function panelRuntime(tab, executeScript, timers = setTimeout) {
  const ctx=vm.createContext({ chrome:{tabs:{query:async()=>[tab],onUpdated:{addListener(){},removeListener(){}},onActivated:{addListener(){}}},windows:{onFocusChanged:{addListener(){}}},scripting:{executeScript}},EnvCore:{bindCopy(){}},EnvMatch:{lookup:()=>({kind:'none'})},EnvChat:{mount(){},setStatus(){}},setTimeout:timers,clearTimeout,extractPage(){},performActions(){},startControlOverlay(){},stopControlOverlay(){}});
  vm.runInContext(fs.readFileSync('extension/sidepanel.js','utf8'),ctx);return ctx;
}
test('same URL in a different tab cannot execute a saved plan',async()=>{
  let called=false;
  const ctx=panelRuntime({id:2,url:'https://example.test'},async()=>{called=true;});
  await assert.rejects(vm.runInContext("act([], 'https://example.test', {tabId:1,snapshot:'x'})",ctx),/화면이 바뀌었어요/);
  assert.equal(called,false);
});
test('execution timeout reports an unconfirmed result rather than success',async()=>{
  let timeout;
  const ctx=panelRuntime({id:1,url:'https://example.test'},()=>new Promise(()=>{}),fn=>{timeout=fn;return 1;});
  const pending=vm.runInContext("act([], 'https://example.test', {tabId:1,snapshot:'x'})",ctx);
  await new Promise(resolve=>setImmediate(resolve));timeout();
  const result=await pending;assert.equal(result[0].ok,false);assert.match(result[0].note,/완료 여부/);
});

test('continuation refuses to read another active tab before extraction',async()=>{
  let extracted=false;
  const ctx=panelRuntime({id:2,url:'https://example.test',status:'complete'},async()=>{extracted=true;return [{result:{url:'https://example.test'}}];});
  await assert.rejects(vm.runInContext("getPage({tabId:1})",ctx),/탭|화면/);
  assert.equal(extracted,false);
});
test('continuation waits for the original page to finish loading',async()=>{
  let extracted=false;
  const ctx=panelRuntime({id:1,url:'https://example.test',status:'loading'},async()=>{extracted=true;return [{result:{url:"https://example.test"}}];});
  await assert.rejects(vm.runInContext("getPage({tabId:1})",ctx),/로딩|불러/);
  assert.equal(extracted,false);
});
test('capture rejects a switch away and back even if the final tab is unchanged',async()=>{
  const ctx=panelRuntime({id:1,url:'https://example.test',status:'complete'},async()=>[]);
  // Re-evaluate with event listeners observable at the Chrome boundary.
  const callbacks=[];
  ctx.chrome.tabs.onActivated.addListener=fn=>callbacks.push(fn);
  ctx.chrome.tabs.captureVisibleTab=async()=>{
    callbacks.forEach(fn=>fn({tabId:2}));callbacks.forEach(fn=>fn({tabId:1}));
    return 'pixels-of-tab-2';
  };
  const isolated=vm.createContext({...ctx});
  vm.runInContext(fs.readFileSync('extension/sidepanel.js','utf8'),isolated);
  await assert.rejects(vm.runInContext("getShot({tabId:1,url:'https://example.test'})",isolated),/화면|탭/);
});
test('a click ends the batch before an element on the next screen can be clicked',async()=>{
  const clicked=[];
  const button=id=>({isConnected:true,innerText:'조회',getAttribute(){return '';},scrollIntoView(){},click(){clicked.push(id);}});
  const ctx=actionRuntime([button(0),button(1)]);
  const results=await ctx.performActions([{type:'click',id:0,target:'조회'},{type:'click',id:1,target:'다음'}],'same','run');
  assert.deepEqual(clicked,[0]);assert.equal(results.length,1);
});
test('Enter ends the batch before the next planned click',async()=>{
  let clicked=false;
  const input={isConnected:true,tagName:'INPUT',type:'text',form:null,focus(){},dispatchEvent(){return true;}};
  const button={isConnected:true,innerText:'조회',getAttribute(){return '';},scrollIntoView(){},click(){clicked=true;}};
  const ctx=actionRuntime([input,button]);
  const results=await ctx.performActions([{type:'enter',id:0,target:'검색어'},{type:'click',id:1,target:'조회'}],'same','run');
  assert.equal(clicked,false);assert.equal(results.length,1);assert.equal(results[0].ok,true);
});
test('panel cancellation while starting the overlay never proceeds to actions',async()=>{
  let ready;const called=[];
  const ctx=panelRuntime({id:1,url:'https://example.test',status:'complete'},({func})=>{called.push(func.name);return func.name==='startControlOverlay'?new Promise(resolve=>ready=resolve):Promise.resolve([{result:{stopped:true}}]);});
  const pending=vm.runInContext("act([{type:'click',id:0,target:'조회'}], 'https://example.test', {tabId:1,snapshot:'x'})",ctx);
  await new Promise(resolve=>setImmediate(resolve));vm.runInContext('cancelAct()',ctx);
  const results=await pending;ready([{result:{ok:true}}]);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(results[0].ok,false);assert.match(results[0].note,/중지/);assert.equal(called.includes('performActions'),false);
});
test('stop during the first tab query settles before the query and never starts control',async()=>{
  const called=[];let queryReady,settled=false;
  const ctx=panelRuntime({id:1,url:'https://example.test'},async({func})=>{called.push(func.name);return [{result:func.name==='startControlOverlay'?{ok:true}:[{ok:true,note:'clicked'}]}];});
  ctx.chrome.tabs.query=()=>new Promise(resolve=>queryReady=resolve);
  const pending=vm.runInContext("act([], 'https://example.test', {tabId:1,snapshot:'x'})",ctx).then(result=>{settled=true;return result;});
  vm.runInContext('cancelAct()',ctx);await new Promise(resolve=>setImmediate(resolve));const wasSettled=settled;
  queryReady([{id:1,url:'https://example.test'}]);await pending;
  assert.equal(wasSettled,true);assert.equal(called.includes('startControlOverlay'),false);
});
test('SPA URL updates without loading end the active operation',async()=>{
  let timeout,settled=false;const callbacks=[];
  const ctx=panelRuntime({id:1,url:'https://example.test'},({func})=>func.name==='performActions'?new Promise(()=>{}):Promise.resolve([{result:{ok:true}}]),fn=>{timeout=fn;return 1;});
  ctx.chrome.tabs.onUpdated.addListener=fn=>callbacks.push(fn);const isolated=vm.createContext({...ctx});
  vm.runInContext(fs.readFileSync('extension/sidepanel.js','utf8'),isolated);
  const pending=vm.runInContext("act([], 'https://example.test', {tabId:1,snapshot:'x'})",isolated).then(results=>{settled=true;return results;});
  await new Promise(resolve=>setImmediate(resolve));callbacks.forEach(fn=>fn(1,{url:'https://example.test/next'},{active:true}));
  await new Promise(resolve=>setImmediate(resolve));const ended=settled;if(!settled)timeout();const results=await pending;
  assert.equal(ended,true);assert.equal(results[0].ok,false);assert.match(results[0].note,/이동/);
});
