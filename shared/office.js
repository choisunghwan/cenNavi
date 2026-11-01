// CEN OFFICE 연결: 선택한 글을 OFFICE 의 승인된 도구로 보내 처리하고 결과를 보여 준다.
// 보내기 전에 무엇을 보내는지 보여 주고 확인받는다. 페이지 전체는 보내지 않고, 사용자가 선택한 글만 보낸다.
(function () {
  const KEY = 'cennavi.office.v1';
  const store = () => (typeof localStorage === 'undefined' ? null : localStorage);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function config() { try { return JSON.parse(store()?.getItem(KEY) || '{}'); } catch { return {}; } }
  function saveConfig(c) { store()?.setItem(KEY, JSON.stringify(c)); }

  // 서버 주소는 http(s) 의 출처(origin)만 받는다(경로·쿼리·계정 정보는 버림).
  function normalizeServer(raw) {
    try {
      const u = new URL(String(raw || '').trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.origin;
    } catch { return ''; }
  }

  // OFFICE 에는 글을 가져온 사이트의 도메인만 알린다.
  function hostOf(url) {
    try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : ''; } catch { return ''; }
  }

  async function api(path, options = {}) {
    const c = config();
    if (!c.server || !c.token) throw new Error('OFFICE 연결이 설정되지 않았어요. /오피스 설정 에서 서버 주소와 토큰을 입력해 주세요.');
    let res;
    try {
      res = await fetch(c.server + path, { ...options, headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' } });
    } catch { throw new Error('OFFICE 서버에 연결하지 못했어요. 서버 주소와 실행 여부를 확인해 주세요.'); }
    let body = null;
    try { body = await res.json(); } catch { /* 본문 없음 */ }
    if (!res.ok) throw new Error(body?.message || body?.error || (res.status === 401 ? 'CenNavi용 토큰이 올바르지 않거나 만료됐어요.' : 'OFFICE 응답 오류 (' + res.status + ')'));
    return body;
  }

  const listTools = () => api('/api/ext/tools');
  const start = (tool, input, host) => api('/api/ext/executions', { method: 'POST', body: JSON.stringify({ tool, input, host }) });
  const status = (id) => api('/api/ext/executions/' + encodeURIComponent(id));
  const cancel = (id) => api('/api/ext/executions/' + encodeURIComponent(id) + '/cancel', { method: 'POST' });

  const DONE = ['SUCCEEDED', 'FAILED', 'CANCELLED'];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function settingsHtml() {
    const c = config();
    return '<div class="bubble">OFFICE 연결 설정이에요. OFFICE 의 ‘AI에 연결’ 화면에서 <b>CenNavi</b> 탭으로 만든 토큰을 붙여 넣으세요.' +
      '<form data-office-form style="display:grid;gap:8px;margin-top:10px">' +
      '<input name="server" placeholder="서버 주소 (예: http://localhost:8080)" value="' + esc(c.server || '') + '" aria-label="서버 주소" autocomplete="off">' +
      '<input name="token" type="password" placeholder="토큰 (cen_pat_…)" value="' + esc(c.token || '') + '" aria-label="토큰" autocomplete="off">' +
      '<div><button type="submit">저장</button> <button type="button" data-office-clear>연결 해제</button></div>' +
      '<div data-office-msg role="status"></div></form></div>';
  }

  function bindSettings(box) {
    const form = box.querySelector('[data-office-form]'), msg = box.querySelector('[data-office-msg]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const server = normalizeServer(form.server.value), token = form.token.value.trim();
      if (!server) { msg.textContent = '서버 주소를 http:// 또는 https:// 로 시작하게 입력해 주세요.'; return; }
      if (!token.startsWith('cen_pat_')) { msg.textContent = '토큰은 cen_pat_ 로 시작해야 해요.'; return; }
      saveConfig({ server, token });
      msg.textContent = '확인하는 중이에요…';
      try { const r = await api('/api/ext/ping'); msg.textContent = '연결됐어요. ' + r.user + ' 계정으로 쓸 수 있어요.'; }
      catch (err) { msg.textContent = '저장했지만 연결을 확인하지 못했어요: ' + err.message; }
    });
    box.querySelector('[data-office-clear]').addEventListener('click', () => { store()?.removeItem(KEY); form.token.value = ''; msg.textContent = '연결을 해제했어요.'; });
  }

  // 확인 카드 → 실행 → 결과. 실패·취소는 성공처럼 보이지 않게 그대로 표시한다.
  function confirmCard(box, tool, selection, host, typed) {
    box.innerHTML = '<div class="bubble"><b>OFFICE로 보낼 내용을 확인해 주세요.</b>' +
      '<div class="p">도구: <code>' + esc(tool) + '</code> · ' + (typed ? '입력한 글 ' : '선택한 글 ') + selection.length.toLocaleString() + '자' + (host ? ' · 출처 ' + esc(host) : '') + '</div>' +
      '<div class="p" style="white-space:pre-wrap;max-height:120px;overflow:auto;border-left:2px solid var(--muted);padding-left:10px">' + esc(selection.slice(0, 300)) + (selection.length > 300 ? '…' : '') + '</div>' +
      '<div class="p">' + (typed ? '이 페이지의 내용은 보내지 않고, 위에 입력한 글만 OFFICE 서버로 보내요.' : '이 페이지 전체는 보내지 않고, 위에서 선택한 글만 OFFICE 서버로 보내요.') + '</div>' +
      '<div class="p"><button type="button" data-office-send>OFFICE로 보내기</button> <button type="button" data-office-cancel>취소</button></div></div>';
    return new Promise((resolve) => {
      box.querySelector('[data-office-send]').onclick = () => resolve(true);
      box.querySelector('[data-office-cancel]').onclick = () => { box.innerHTML = '<div class="bubble">보내지 않았어요.</div>'; resolve(false); };
    });
  }

  // text 가 있으면 사용자가 명령 뒤에 입력한 글을, 없으면 페이지에서 선택한 글을 보낸다.
  // 입력한 글은 페이지에서 온 것이 아니므로 출처 도메인을 기록하지 않는다.
  async function runTool(box, tool, getPage, { text } = {}) {
    let selection = String(text || '').trim(), host = '';
    const typed = !!selection;
    if (typed) {
      if (selection.length > 15000) { box.innerHTML = '<div class="bubble err">⚠️ 글이 너무 길어요. 15,000자 이하로 줄여 주세요.</div>'; return; }
    } else {
      let page;
      try { page = await getPage(); } catch (e) { box.innerHTML = '<div class="bubble err">⚠️ ' + esc(e.message) + '</div>'; return; }
      selection = String(page.selection || '').trim();
      if (!selection) { box.innerHTML = '<div class="bubble">처리할 글이 없어요. 페이지에서 글을 드래그해 선택하거나, <code>/' + esc(tool) + '</code> 뒤에 글을 붙여 넣어 주세요.</div>'; return; }
      host = hostOf(page.url);
    }
    if (!(await confirmCard(box, tool, selection, host, typed))) return;

    box.innerHTML = '<div class="bubble thinking" role="status">OFFICE에서 처리하고 있어요… <button type="button" data-office-stop>중지</button></div>';
    let id = null, stopped = false;
    box.querySelector('[data-office-stop]').onclick = async () => {
      stopped = true;
      if (id) { try { await cancel(id); } catch { /* 이미 끝났거나 취소를 지원하지 않는 경우 아래 폴링 결과를 따른다 */ } }
    };
    try {
      let ex = await start(tool, selection, host);
      id = ex.id;
      for (let i = 0; i < 150 && !DONE.includes(ex.status) && !(stopped && i > 3); i++) { await sleep(i < 5 ? 400 : 1000); ex = await status(id); }
      if (ex.status === 'SUCCEEDED') {
        box.innerHTML = '<div class="bubble"><div class="p" style="white-space:pre-wrap">' + esc(ex.result) + '</div>' +
          '<div class="p" style="color:var(--muted);font-size:12px">검토용 초안이에요. OFFICE 의 도구 화면 ‘내 실행 이력’에 “CenNavi에서 시작”으로 남았어요.</div></div>';
      } else if (ex.status === 'CANCELLED' || (stopped && !DONE.includes(ex.status))) {
        box.innerHTML = '<div class="bubble">중지했어요. 결과는 없어요.</div>';
      } else if (ex.status === 'FAILED') {
        box.innerHTML = '<div class="bubble err">⚠️ OFFICE에서 처리하지 못했어요: ' + esc(ex.error || '알 수 없는 오류') + '</div>';
      } else {
        box.innerHTML = '<div class="bubble err">⚠️ 시간이 오래 걸리고 있어요. OFFICE 의 실행 이력에서 결과를 확인해 주세요.</div>';
      }
    } catch (e) { box.innerHTML = '<div class="bubble err">⚠️ ' + esc(e.message) + '</div>'; }
  }

  // /오피스 [설정 | 도구이름]
  async function run(box, args, { getPage } = {}) {
    const word = String(args || '').trim();
    if (/^(설정|settings)$/i.test(word)) { box.innerHTML = settingsHtml(); bindSettings(box); return; }
    if (!getPage) { box.innerHTML = '<div class="bubble">OFFICE 연결은 크롬 확장 프로그램에서만 쓸 수 있어요.</div>'; return; }
    let tools;
    try { tools = await listTools(); } catch (e) { box.innerHTML = '<div class="bubble err">⚠️ ' + esc(e.message) + '</div>'; return; }
    if (!tools.length) { box.innerHTML = '<div class="bubble">사용할 수 있는 OFFICE 도구가 없어요. OFFICE 에서 승인된 도구인지 확인해 주세요.</div>'; return; }
    const chosen = tools.find((t) => t.name === word);
    if (chosen) { await runTool(box, chosen.name, getPage); return; }
    box.innerHTML = '<div class="bubble">페이지에서 글을 선택한 뒤, 처리할 OFFICE 도구를 골라 주세요.<div class="picks">' +
      tools.map((t) => '<button type="button" data-office-tool="' + esc(t.name) + '" title="' + esc(t.description) + '">' + esc(t.name) + '</button>').join('') + '</div></div>';
    box.querySelectorAll('[data-office-tool]').forEach((b) => { b.onclick = () => runTool(box, b.dataset.officeTool, getPage); });
  }

  // 슬래시 메뉴에 도구를 올리기 위한 조회. 설정이 없거나 서버에 닿지 않으면 조용히 빈 목록(메뉴에 아무것도 안 올림).
  async function loadTools() {
    const c = config();
    if (!c.server || !c.token) return [];
    try { return await listTools(); } catch { return []; }
  }

  window.EnvOffice = { run, runTool, loadTools, settingsHtml, normalizeServer, hostOf, api, listTools, start, status, cancel, config, saveConfig };
})();
