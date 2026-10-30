// Real extension worker in a disposable Chromium profile. Never uses the user's Chrome profile.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=process.cwd(),tempRoot=path.resolve(os.tmpdir());
 const profile=fs.mkdtempSync(path.join(tempRoot,'cennavi-background-'));
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
  console.log(`Extension checks passed: CenNavi ${startup.version}, single-file worker, panel startup, 12 tab closures, same-profile restart and production blocking.`);
 } finally {
  await context?.close();
  assert.equal(path.dirname(path.resolve(profile)),tempRoot);
  assert.ok(path.basename(profile).startsWith('cennavi-background-'));
  fs.rmSync(profile,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
