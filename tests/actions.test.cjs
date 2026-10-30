const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
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
  const ctx=vm.createContext({window:{__guideSnapshot:'same',__guideEls:[el]},setTimeout,KeyboardEvent:class{}});
  vm.runInContext(fs.readFileSync('extension/pagereader.js','utf8'),ctx);
  const results=await ctx.performActions([{type:'enter',id:0}], 'same');
  assert.equal(results[0].ok,false);assert.equal(submitted,false);
});

function panelRuntime(tab, executeScript, timers = setTimeout) {
  const ctx=vm.createContext({ chrome:{tabs:{query:async()=>[tab],onUpdated:{addListener(){},removeListener(){}},onActivated:{addListener(){}}},windows:{onFocusChanged:{addListener(){}}},scripting:{executeScript}},EnvCore:{bindCopy(){}},EnvMatch:{lookup:()=>({kind:'none'})},EnvChat:{mount(){},setStatus(){}},setTimeout:timers,clearTimeout,extractPage(){},performActions(){}});
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
  const ctx=vm.createContext({window:{__guideSnapshot:'same',__guideEls:[button(0),button(1)]},setTimeout});
  vm.runInContext(fs.readFileSync('extension/pagereader.js','utf8'),ctx);
  const results=await ctx.performActions([{type:'click',id:0},{type:'click',id:1}],'same');
  assert.deepEqual(clicked,[0]);assert.equal(results.length,1);
});
test('Enter ends the batch before the next planned click',async()=>{
  let clicked=false;
  const input={isConnected:true,tagName:'INPUT',type:'text',form:null,focus(){},dispatchEvent(){return true;}};
  const button={isConnected:true,innerText:'조회',getAttribute(){return '';},scrollIntoView(){},click(){clicked=true;}};
  const ctx=vm.createContext({window:{__guideSnapshot:'same',__guideEls:[input,button]},setTimeout,KeyboardEvent:class{}});
  vm.runInContext(fs.readFileSync('extension/pagereader.js','utf8'),ctx);
  const results=await ctx.performActions([{type:'enter',id:0},{type:'click',id:1}],'same');
  assert.equal(clicked,false);assert.equal(results.length,1);assert.equal(results[0].ok,true);
});
