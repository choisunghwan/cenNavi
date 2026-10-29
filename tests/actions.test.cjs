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
  const ctx=vm.createContext({ chrome:{tabs:{query:async()=>[tab],onUpdated:{addListener(){},removeListener(){}},onActivated:{addListener(){}}},windows:{onFocusChanged:{addListener(){}}},scripting:{executeScript}},EnvCore:{bindCopy(){}},EnvMatch:{lookup:()=>({kind:'none'})},EnvChat:{mount(){},setStatus(){}},setTimeout:timers,clearTimeout,performActions(){}});
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
