const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function worker({getTab=async id=>({id,url:'http://localhost:8080'}),setBadge=async()=>{},setPanel=async()=>{}}={}) {
  const listeners={},errors=[],updates=[];
  const event=name=>({addListener:fn=>{listeners[name]=fn;}});
  const ctx=vm.createContext({URL,console:{error:(...args)=>errors.push(args.join(' '))},chrome:{
    runtime:{onInstalled:event('installed')},
    sidePanel:{setPanelBehavior:setPanel},
    tabs:{get:getTab,onUpdated:event('updated'),onActivated:event('activated')},
    action:{setBadgeText:async opts=>{updates.push(opts);await setBadge(opts);},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},
  }});
  ctx.self=ctx;
  ctx.importScripts=(...urls)=>{for(const url of urls){const resolved=new URL(url,'chrome-extension://test/extension/background.js');const file=path.join(process.cwd(),resolved.pathname);vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:resolved.pathname});}};
  vm.runInContext(fs.readFileSync('extension/background.js','utf8'),ctx);
  return {listeners,errors,updates};
}
test('packaged background imports real environment data and updates DEV badge',async()=>{
  const {listeners,updates}=worker();await listeners.activated({tabId:7});
  assert.equal(updates[0].text,'DEV');
});
test('a tab closed before activation lookup does not reject or log an error',async()=>{
  const {listeners,errors}=worker({getTab:async()=>{throw new Error('No tab with id: 1436224539.');}});
  await assert.doesNotReject(listeners.activated({tabId:1436224539}));assert.deepEqual(errors,[]);
});
test('a tab closed during badge update does not cause an unhandled rejection',async()=>{
  const {listeners,errors}=worker({setBadge:async()=>{throw new Error('No tab with id: 1436224546.');}});
  await listeners.updated(1436224546,{status:'complete'},{url:'http://localhost:8080'});
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(errors,[]);
});
test('unexpected badge failures remain visible without rejecting event handler',async()=>{
  const {listeners,errors}=worker({getTab:async()=>{throw new Error('Permission denied');}});
  await assert.doesNotReject(listeners.activated({tabId:3}));assert.match(errors[0],/Permission denied/);
});
test('side-panel setup rejection is handled and reported',async()=>{
  const {listeners,errors}=worker({setPanel:async()=>{throw new Error('Panel unavailable');}});
  await listeners.installed();await new Promise(resolve=>setImmediate(resolve));assert.match(errors[0],/Panel unavailable/);
});
