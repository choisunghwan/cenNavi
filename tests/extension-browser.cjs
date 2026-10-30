// Real extension worker in a disposable Chromium profile. Never uses the user's Chrome profile.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const http=require('node:http');
(async()=>{
 const root=process.cwd(),tempRoot=path.resolve(os.tmpdir());
 const profile=fs.mkdtempSync(path.join(tempRoot,'cennavi-background-'));
 const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<form><label>고객명<input aria-label="고객명"></label><button type="button" onclick="document.querySelector(\'#result\').textContent=\'완료\'">조회</button></form><p id="result"></p>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 const launch=()=>chromium.launchPersistentContext(profile,{headless:true,
  ...(process.env.CENNAVI_CHROMIUM_PATH?{executablePath:process.env.CENNAVI_CHROMIUM_PATH}:{}),
  args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
 let context;
 try {
  context=await launch();
  await context.route('https://**/*',route=>route.abort());
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});
  assert.equal(new URL(worker.url()).pathname,'/'+manifest.background.service_worker);
  const startup=await worker.evaluate(()=>({name:chrome.runtime.getManifest().name,version:chrome.runtime.getManifest().version,
   loaded:!!(self.ENV_PACKS&&self.EnvMatch),kind:self.EnvMatch?.lookup('http://localhost:8080').kind}));
  assert.equal(startup.name,'CenNavi');assert.equal(startup.loaded,true);assert.equal(startup.kind,'env');
  await worker.evaluate(()=>{self.__testErrors=[];self.addEventListener('unhandledrejection',event=>self.__testErrors.push(String(event.reason)));const original=console.error.bind(console);console.error=(...args)=>{self.__testErrors.push(args.map(String).join(' '));original(...args);};});
  const id=new URL(worker.url()).host;
  const panel=await context.newPage();const errors=[];panel.on('pageerror',e=>errors.push(e.message));
  await panel.goto(`chrome-extension://${id}/extension/sidepanel.html`);
  assert.equal(await panel.title(),'CenNavi');assert.equal(await panel.locator('h1').innerText(),'CenNavi');
  for(let i=0;i<12;i++){const tab=await context.newPage();await tab.close();}
  const failures=await worker.evaluate(async()=>{await new Promise(resolve=>setTimeout(resolve,200));return self.__testErrors;});
  assert.deepEqual(failures,[]);assert.deepEqual(errors,[]);
  await context.close();context=undefined;
  context=await launch();await context.route('https://**/*',route=>route.abort());
  const resumed=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});
  assert.equal(new URL(resumed.url()).pathname,'/'+manifest.background.service_worker);
  const warm=await resumed.evaluate(()=>({dev:self.EnvMatch.lookup('http://localhost:8080').kind,prod:self.EnvMatch.lookup('https://order.company.example').kind}));
  assert.deepEqual(warm,{dev:'env',prod:'prod'});
  const reopened=await context.newPage();await reopened.goto(`chrome-extension://${id}/extension/sidepanel.html`);
  assert.equal(await reopened.locator('h1').innerText(),'CenNavi');
  const url=`http://127.0.0.1:${server.address().port}/`,site=await context.newPage();await site.goto(url);
  const operation=await resumed.evaluate(async url=>{
    const tab=(await chrome.tabs.query({})).find(t=>t.url===url);
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['extension/pagereader.js','extension/interaction.js']});
    const [{result:page}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>extractPage()});
    const item=page.forms.flatMap(f=>f.fields).find(x=>x.label==='조회');
    const [{result:started}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:s=>startControlOverlay(s,'isolated-test'),args:[page.snapshot]});
    const [{result:results}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:(id,s)=>performActions([{type:'click',id,target:'조회'}],s,'isolated-test'),args:[item.id,page.snapshot]});
    return {started,results};
  },url);
  assert.equal(operation.started.ok,true);assert.equal(operation.results[0].ok,true);assert.equal(await site.locator('#result').innerText(),'완료');
  assert.equal(await site.locator('#__cennavi_control').count(),0);
  console.log(`Extension checks passed: CenNavi ${startup.version}, worker/restart/tab closures/production blocking and real isolated-world visible control.`);
 } finally {
  await context?.close();
  await new Promise(resolve=>server.close(resolve));
  assert.equal(path.dirname(path.resolve(profile)),tempRoot);
  assert.ok(path.basename(profile).startsWith('cennavi-background-'));
  fs.rmSync(profile,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
