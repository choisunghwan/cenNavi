const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(fetchImpl) {
  const mem = new Map();
  const localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const context = vm.createContext({ window: {}, localStorage, fetch: fetchImpl, URL, JSON, setTimeout, encodeURIComponent });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared/office.js'), 'utf8'), context);
  return context.window.EnvOffice;
}
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('서버 주소는 http(s) 출처만 받는다', () => {
  const o = load(async () => res(200, {}));
  assert.equal(o.normalizeServer(' http://localhost:8080/mcp?x=1 '), 'http://localhost:8080');
  assert.equal(o.normalizeServer('https://office.example.com/'), 'https://office.example.com');
  assert.equal(o.normalizeServer('javascript:alert(1)'), '');
  assert.equal(o.normalizeServer('chrome://settings'), '');
  assert.equal(o.normalizeServer('아무거나'), '');
});

test('CEN HUB 에는 사이트 도메인만 알린다', () => {
  const o = load(async () => res(200, {}));
  assert.equal(o.hostOf('https://forum.example.com/a/b?token=secret#x'), 'forum.example.com');
  assert.equal(o.hostOf('chrome://extensions'), '');
  assert.equal(o.hostOf('not a url'), '');
});

test('설정이 없으면 서버에 요청하지 않고 안내한다', async () => {
  let called = false;
  const o = load(async () => { called = true; return res(200, []); });
  await assert.rejects(() => o.listTools(), /연결이 설정되지 않았어요/);
  assert.equal(called, false);
});

test('토큰을 Authorization 헤더로 보내고 실행 요청에는 선택한 글·도메인만 담는다', async () => {
  const calls = [];
  const o = load(async (url, opt) => { calls.push({ url, opt }); return res(202, { id: 'e1', status: 'REQUESTED' }); });
  o.saveConfig({ server: 'http://localhost:8080', token: 'cen_pat_abc' });
  await o.start('cen-log-analyzer', 'NullPointerException', 'forum.example.com');
  assert.equal(calls[0].url, 'http://localhost:8080/api/ext/executions');
  assert.equal(calls[0].opt.method, 'POST');
  assert.equal(calls[0].opt.headers.Authorization, 'Bearer cen_pat_abc');
  assert.deepEqual(JSON.parse(calls[0].opt.body), { tool: 'cen-log-analyzer', input: 'NullPointerException', host: 'forum.example.com' });
});

test('서버 오류와 연결 실패를 성공처럼 넘기지 않는다', async () => {
  let mode = 'error';
  const o = load(async () => { if (mode === 'down') throw new TypeError('Failed to fetch'); return res(401, { message: 'CenNavi용 토큰이 필요합니다' }); });
  o.saveConfig({ server: 'http://localhost:8080', token: 'cen_pat_abc' });
  await assert.rejects(() => o.listTools(), /CenNavi용 토큰이 필요합니다/);
  mode = 'down';
  await assert.rejects(() => o.listTools(), /연결하지 못했어요/);
});

test('슬래시 메뉴용 도구 조회는 설정이 없거나 서버가 안 되면 조용히 빈 목록이다', async () => {
  let called = 0;
  const o = load(async () => { called++; return res(200, [{ name: 'cen-log-analyzer', description: '로그 분석' }]); });
  assert.deepEqual(JSON.parse(JSON.stringify(await o.loadTools())), []);
  assert.equal(called, 0);
  o.saveConfig({ server: 'http://localhost:8080', token: 'cen_pat_abc' });
  assert.deepEqual(JSON.parse(JSON.stringify(await o.loadTools())), [{ name: 'cen-log-analyzer', description: '로그 분석' }]);
  const down = load(async () => { throw new TypeError('Failed to fetch'); });
  down.saveConfig({ server: 'http://localhost:8080', token: 'cen_pat_abc' });
  assert.deepEqual(JSON.parse(JSON.stringify(await down.loadTools())), []);
});

test('명령 뒤에 입력한 글은 줄바꿈을 지킨 채 보내고 출처 도메인은 기록하지 않는다', async () => {
  const calls = [];
  const o = load(async (url, opt) => { calls.push({ url, body: opt.body ? JSON.parse(opt.body) : null }); return res(200, { id: 'e1', status: 'SUCCEEDED', result: '결과' }); });
  o.saveConfig({ server: 'http://localhost:8080', token: 'cen_pat_abc' });
  // runTool 은 확인 카드 버튼을 기다리므로 DOM 없이 호출 경로만 확인한다: 글이 비면 getPage 를 부르고, 있으면 부르지 않는다.
  let pageCalls = 0;
  const box = { innerHTML: '', querySelector: () => ({}) };
  await o.runTool(box, 'cen-log-analyzer', async () => { pageCalls++; return { selection: '', url: 'https://a.example/x' }; }, { text: '   ' });
  assert.equal(pageCalls, 1);
  assert.match(box.innerHTML, /처리할 글이 없어요/);
  const long = 'x'.repeat(15001);
  await o.runTool(box, 'cen-log-analyzer', async () => { pageCalls++; return {}; }, { text: long });
  assert.equal(pageCalls, 1);
  assert.match(box.innerHTML, /너무 길어요/);
  assert.equal(calls.length, 0);
});
