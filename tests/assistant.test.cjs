const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function runtime(fetch) {
  const data = new Map();
  const ctx = vm.createContext({ window: {}, self: {}, localStorage: { getItem: k => data.get(k), setItem: (k,v) => data.set(k,v) }, fetch, AbortController, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync('shared/gemini.js', 'utf8'), ctx);
  ctx.window.EnvGemini.save({key:'test-key'});
  return ctx.window.EnvGemini;
}
test('follow-up request sends previous user and assistant turns', async () => {
  let payload;
  const api = runtime(async (url, opts) => { payload = JSON.parse(opts.body); return {ok:true, json:async()=>({candidates:[{content:{parts:[{text:'{"answer":"다음 단계"}'}]}}]})}; });
  await api.answer('그다음은?', {title:'주문'}, null, '', {history:[{role:'user',text:'주문을 찾아줘'},{role:'model',text:'주문 조회를 여세요'}]});
  assert.equal(payload.contents.length, 3);
  assert.equal(payload.contents[1].parts[0].text, '주문 조회를 여세요');
});
test('abort signal reaches network request', async () => {
  const controller = new AbortController(); let signal;
  const api = runtime(async (url, opts) => {signal=opts.signal; return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"answer":"ok"}'}]}}]})};});
  await api.answer('요약', {}, null, '', {signal:controller.signal});
  assert.ok(signal);
});
test('conversation survives reload as plain messages and can be reset', () => {
  const data = new Map(); const ctx = vm.createContext({window:{},localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}});
  const source=fs.readFileSync('shared/conversation.js','utf8'); vm.runInContext(source,ctx);
  let session=ctx.window.EnvConversation.create(); session.append('user','hello'); session.append('model','world');
  session=ctx.window.EnvConversation.create(); assert.equal(session.messages()[1].text,'world');
  session.clear(); assert.equal(ctx.window.EnvConversation.create().messages().length,0);
});
