const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared/targets.js'), 'utf8'), context);
const api = context.window.EnvTargets;
const plain = value => JSON.parse(JSON.stringify(value));
const page = {
  nav: [{ id: 1, label: '주문 관리', href: '/orders' }],
  links: [{ id: 2, label: '도움말', href: '/help' }],
  buttons: [{ id: 3, label: '검색', type: 'submit' }],
  forms: [{ hasPassword: true, fields: [{ id: 4, name: '검색어', type: 'search' }] }],
};
const first = { id: 1, target: '주문 관리' };
const second = { id: 2, target: '도움말' };

test('index collects all snapshot sources and field name fallback without mutation', () => {
  const before = JSON.stringify(page);
  const items = api.index(page);
  assert.equal(items.size, 4);
  assert.deepEqual(plain(items.get(1)), { kind: 'link', label: '주문 관리', href: '/orders' });
  assert.deepEqual(plain(items.get(4)), { kind: 'field', label: '검색어', type: 'search', hasPassword: true });
  assert.equal(JSON.stringify(page), before);
  assert.equal(api.index(null).size, 0);
});

test('resolve requires an integer ID paired with a complete nonempty target', () => {
  for (const candidate of [null, {}, { target: '주문 관리' }, { id: '1', target: '주문 관리' },
    { id: 1.5, target: '주문 관리' }, { id: 99, target: '주문 관리' },
    { id: 1 }, { id: 1, target: ' ' }, { id: 1, target: '주문' },
    { id: 1, target: '도움말' }]) {
    const result = api.resolve(candidate, page);
    assert.equal(result.ok, false);
    assert.match(result.why, /[가-힣]/);
  }
  assert.equal(api.resolve({ id: 1, target: '  주문   관리 ' }, page).ok, true);
  assert.equal(api.resolve({ id: 9, target: 'help' }, { links: [{ id: 9, label: 'HELP' }] }).ok, true);
});

test('duplicate normalized labels across kinds are ambiguous', () => {
  const duplicate = { ...page, buttons: [...page.buttons, { id: 8, label: ' 주문  관리 ' }] };
  assert.equal(api.resolve(first, duplicate).ok, false);
  assert.deepEqual(plain(api.guidance([first], duplicate, '주문 관리로 이동하세요', '주문 어디?')), []);
});

test('no candidates or invalid candidates never cause fallback guessing', () => {
  for (const steps of [undefined, [], [{ id: 1 }], [{ target: '주문 관리' }], [{ id: 99, target: '주문 관리' }]]) {
    assert.deepEqual(plain(api.guidance(steps, page, '주문 관리 메뉴를 누르세요', '주문 어디?')), []);
  }
});

test('generic explanations, summaries, translations and read-only never highlight', () => {
  for (const question of ['이 화면 설명해줘', '이 페이지 요약해줘', '주문 관리 번역해줘', '어떻게 작동하는지 설명해줘', 'Explain how this works']) {
    assert.deepEqual(plain(api.guidance([first], page, '주문 관리 메뉴입니다', question)), []);
  }
  assert.deepEqual(plain(api.guidance([first], page, '주문 관리로 이동하세요', '주문 어디?', { readOnly: true })), []);
});

test('guidance requires full answer mention and returns at most two unique verified steps', () => {
  assert.deepEqual(plain(api.guidance([first], page, '주문 메뉴입니다', '주문 어디?')), []);
  assert.deepEqual(plain(api.guidance([first], page, '주문 관리 메뉴로 이동하세요', '주문 어디?')),
    [{ id: 1, target: '주문 관리', label: '주문 관리' }]);
  assert.deepEqual(plain(api.guidance([first, first, second, { id: 3, target: '검색' }], page,
    '주문 관리, 도움말, 검색을 차례로 누르세요', '어떻게 이동해?')),
  [{ id: 1, target: '주문 관리', label: '주문 관리' }, { id: 2, target: '도움말', label: '도움말' }]);
});

test('pure field location questions cannot highlight unrelated buttons', () => {
  const steps = [{ id: 3, target: '검색' }, { id: 4, target: '검색어' }];
  assert.deepEqual(plain(api.guidance(steps, page, '검색 버튼과 검색어 입력칸입니다', '검색창 어디?')),
    [{ id: 4, target: '검색어', label: '검색어' }]);
});

test('duplicate IDs are rejected rather than selecting an arbitrary entry', () => {
  assert.equal(api.resolve(first, { ...page, links: [{ id: 1, label: '다른 메뉴' }] }).ok, false);
});

test('supports compact snapshot labels and derives password context from fields', () => {
  const snapshot = { nav: [{ id: 0, t: 'Home', h: '/' }], buttons: [{ id: 2, t: '로그인' }],
    forms: [{ fields: [{ id: 3, label: '비밀번호', type: 'PASSWORD' }] }] };
  assert.deepEqual(plain(api.index(snapshot).get(0)), { kind: 'link', label: 'Home', href: '/' });
  assert.equal(api.index(snapshot).get(3).hasPassword, true);
  assert.equal(api.resolve({ id: 2, target: '로그인' }, snapshot).ok, true);
});
