const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function apiWith(response) {
  const data=new Map();
  const ctx=vm.createContext({window:{},self:{},localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},fetch:response,AbortController,setTimeout,clearTimeout,TextDecoder,DOMException});
  vm.runInContext(fs.readFileSync('shared/gemini.js','utf8'),ctx);
  ctx.window.EnvGemini.save({key:'test-only'});return ctx.window.EnvGemini;
}
function event(text,finishReason) { return 'data: '+JSON.stringify({candidates:[{content:{parts:[{text}]},...(finishReason?{finishReason}:{})}]})+'\r\n\r\n'; }
function stream(bytes,onRead=()=>{}) {
  let offset=0;
  return {ok:true,headers:{get:()=> 'text/event-stream'},body:{getReader:()=>({read:async()=>{onRead(offset); return offset<bytes.length?{done:false,value:bytes.slice(offset,++offset)}:{done:true};},cancel:async()=>{}})}};
}
test('SSE displays incremental escaped answer while action JSON stays private',async()=>{
 const texts=[];let url;
 const wire=event('{"answer":"첫 줄\\n\\uD5')+event('5C국 \\"인용\\"","actions":[{"type":"click","id":4}]}','STOP');
 const api=apiWith(async u=>{url=u;return stream(new TextEncoder().encode(wire));});
 const result=await api.answer('질문',{},null,'',{onText:t=>texts.push(t)});
 assert.match(url,/:streamGenerateContent\?alt=sse/);
 assert.equal(result.answer,'첫 줄\n한국 "인용"');
 assert.ok(texts.includes('첫 줄\n'));
 assert.equal(texts.at(-1),'첫 줄\n한국 "인용"');
 assert.ok(texts.every(x=>!x.includes('actions')));
 assert.equal(result.actions[0].id,4);
});
test('a truncated stream never returns an executable plan',async()=>{
 const wire=event('{"answer":"미완성","actions":[{"type":"click","id":1}]}');
 const api=apiWith(async()=>stream(new TextEncoder().encode(wire)));
 await assert.rejects(api.answer('질문',{},null,'',{onText(){}}),/완료|중단|응답/);
});
test('blocked or malformed model output cannot become an execution plan',async()=>{
 const wire=event('{"answer":"일부 답변"','SAFETY');
 const api=apiWith(async()=>stream(new TextEncoder().encode(wire)));
 await assert.rejects(api.answer('질문',{},null,'',{onText(){}}));
});
test('aborting while reading SSE stops callbacks and rejects',async()=>{
 const controller=new AbortController();let emitted=0;
 const wire=event('{"answer":"중지 테스트"}','STOP');
 const api=apiWith(async()=>stream(new TextEncoder().encode(wire),n=>{if(n===30)controller.abort();}));
 await assert.rejects(api.answer('질문',{},null,'',{signal:controller.signal,onText(){emitted++;}}),{name:'AbortError'});
 assert.equal(emitted,0);
});
test('a blocked JSON fallback never exposes actions',async()=>{
 const api=apiWith(async()=>({ok:true,json:async()=>({candidates:[{finishReason:'SAFETY',content:{parts:[{text:'{"answer":"部分","actions":[{"type":"click","id":1}]}'}]}}]})}));
 await assert.rejects(api.answer('질문',{},null,'',{onText(){}}),/완료|차단/);
});
test('complete JSON without a string answer is rejected',async()=>{
 const api=apiWith(async()=>stream(new TextEncoder().encode(event('{"actions":[{"type":"click","id":1}]}','STOP'))));
 await assert.rejects(api.answer('질문',{},null,'',{onText(){}}),/형식/);
});
