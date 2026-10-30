// 사이드 패널은 열려 있는 동안 계속 살아 있으므로, 탭 전환/주소 변경 때마다 상태 표시를 갱신한다
EnvCore.bindCopy();

// Compare an epoch as well as the final tab: switching away and back also invalidates a capture.
let contextVersion = 0;
chrome.tabs.onActivated.addListener(() => { contextVersion++; });
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.url || info.status === 'loading') contextVersion++; });
chrome.windows.onFocusChanged.addListener(() => { contextVersion++; });

const getUrl = async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.url || "";
};

// 현재 탭의 화면 구조를 읽어온다 (입력값은 읽지 않음)
const currentTab = async (expected = {}) => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || (expected.tabId !== undefined && tab.id !== expected.tabId) || (expected.url && tab.url !== expected.url)) throw new Error('작업하던 탭 또는 화면이 바뀌었어요. 원래 탭에서 다시 시도해 주세요.');
  if (tab.status === 'loading') throw new Error('페이지를 불러오는 중이에요. 로딩이 끝난 뒤 다시 눌러 주세요.');
  if (EnvMatch.lookup(tab.url).kind === 'prod') throw new Error('운영 환경의 화면은 분석하거나 실행하지 않아요.');
  return tab;
};
const getPage = async (expected = {}) => {
  const version = contextVersion;
  const tab = await currentTab(expected);
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage });
  await currentTab({tabId:tab.id,url:tab.url});
  if (version !== contextVersion) throw new Error('분석 중 탭 또는 화면이 바뀌었어요. 다시 요청해 주세요.');
  if (res.result.url !== tab.url) throw new Error('분석 중 화면이 이동했어요. 다시 요청해 주세요.');
  return { ...res.result, tabId: tab.id };
};

// 현재 탭의 보이는 영역을 캡처한다 (JPEG로 줄여서 전송량을 낮춘다)
const getShot = async (page = {}) => {
  const version = contextVersion;
  const tab = await currentTab(page);
  const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 70 });
  await currentTab({tabId:tab.id,url:tab.url});
  if (version !== contextVersion) throw new Error('캡처 중 탭 또는 화면이 바뀌었어요. 다시 요청해 주세요.');
  return shot;
};

// 안내한 항목을 화면에 표시/해제 (조작은 하지 않음)
const runInTab = async (func, args = [], page = {}) => {
  const tab = await currentTab(page);
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
  return res.result;
};
const highlight = (ids, labels, page = {}, targets = []) => runInTab(showVerifiedTargets, [ids, labels || [], page.snapshot, targets], page);
const unhighlight = (page = {}) => runInTab(clearHighlight, [], page);

// 연결 점검: 어느 단계에서 막히는지 확인한다
const diagnose = async () => {
  const rows = [];
  const add = (name, ok, detail = "") => rows.push({ name, ok, detail });
  add("확장 프로그램 버전", true, chrome.runtime.getManifest().version);

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const u = tab?.url ? new URL(tab.url) : null;
    if (!u) add("현재 탭 주소", false, "주소를 읽을 수 없어요");
    else if (!/^https?:$/.test(u.protocol))
      add("현재 탭 주소", "warn", `${u.protocol}// 페이지예요. 크롬이 확장 프로그램의 접근을 막는 페이지라 읽을 수 없어요. 일반 웹사이트(http/https)를 연 상태에서 다시 점검해 주세요.`);
    else add("현재 탭 주소", true, u.host);
  } catch (e) { add("현재 탭 주소", false, e.message); }

  if (tab?.url && /^https?:/i.test(tab.url)) {
    try {
      const ok = await chrome.permissions.contains({ origins: [new URL(tab.url).origin + "/*"] });
      add("사이트 접근 권한", ok, ok ? "" : "chrome://extensions → 이 확장 프로그램 → '사이트 액세스'를 '모든 사이트'로 바꿔 주세요");
    } catch (e) { add("사이트 접근 권한", false, "이 페이지는 확장 프로그램이 접근할 수 없어요 (" + e.message + ")"); }
    try {
      const p = await getPage();
      add("화면 읽기", true, `메뉴 ${p.nav.length} · 폼 ${p.forms.length} · 버튼 ${p.buttons.length}`);
    } catch (e) { add("화면 읽기", false, e.message); }
    try {
      const s = await getShot();
      add("스크린샷", !!s, s ? Math.round(s.length / 1024) + "KB" : "비어 있어요");
    } catch (e) { add("스크린샷", false, e.message); }
  }

  try {
    await EnvGemini.translate("도움말", { projects: [] });
    add("Gemini 호출", true, EnvGemini.getModel());
  } catch (e) { add("Gemini 호출", false, e.message); }
  return rows;
};

// 브라우저 이동: 사용자가 답변 안의 버튼을 눌렀을 때만 실행된다
const browserNav = async (action) => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (action === "back") await chrome.tabs.goBack(tab.id);
  else if (action === "forward") await chrome.tabs.goForward(tab.id);
  else if (action === "reload") await chrome.tabs.reload(tab.id);
};

// 확인 후 실행: 사용자가 계획 카드에서 [실행]을 눌렀을 때만 호출된다
let activeActionRun = null;
const cancelAct = () => activeActionRun?.cancel();
const act = async (actions, url, context = {}) => {
  if(activeActionRun)throw new Error('다른 실행이 진행 중이에요.');
  let tab,onUpdated,timer,cancel,onActivated,onFocus,overlayRequested=false;
  const cancelled=new Promise(resolve=>{cancel=()=>resolve([{ok:false,note:'실행을 중지했어요.'}]);});
  const task={token:'cennavi-'+Date.now()+'-'+Math.random(),cancelled:false,cancel(){task.cancelled=true;cancel();}};
  activeActionRun=task;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve([{ ok: false, note: "시간이 초과되어 완료 여부를 확인하지 못했어요. 화면을 확인해 주세요." }]), 8000); });
  try {
  // The cancellable run exists before the first asynchronous browser call.
  const initial=await Promise.race([
    chrome.tabs.query({active:true,lastFocusedWindow:true}).then(tabs=>({tabs})),
    cancelled.then(results=>({results})),timeout.then(results=>({results})),
  ]);
  if(initial.results)return initial.results;
  [tab]=initial.tabs;
  if(task.cancelled)return [{ok:false,note:'실행을 중지했어요.'}];
  if (!tab || tab.id !== context.tabId || tab.url !== url) throw new Error("화면이 바뀌었어요. 다시 요청해 주세요.");
  if (EnvMatch.lookup(tab.url).kind === "prod") throw new Error("운영 환경에서는 실행하지 않아요.");
  onActivated=info=>{if(info.tabId!==tab.id)task.cancel();};
  onFocus=id=>{if(id!==tab.windowId)task.cancel();};
  chrome.tabs.onActivated.addListener(onActivated);chrome.windows.onFocusChanged.addListener(onFocus);
  const moved = new Promise((resolve) => {
    onUpdated = (id, info) => { if (id === tab.id && (info.status === "loading" || (info.url && info.url !== url))) { task.cancelled=true; resolve([{ ok: false, note: "페이지가 이동했어요. 새 화면에서 결과를 확인해 주세요." }]); } };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
  const run = (async()=>{
    overlayRequested=true;
    const [start]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:startControlOverlay,args:[context.snapshot,task.token]});
    if(task.cancelled)return [{ok:false,note:'실행을 중지했어요.'}];
    if(!start?.result?.ok)throw new Error('실행 표시를 시작하지 못했어요. 화면을 다시 확인해 주세요.');
    await currentTab({tabId:tab.id,url});
    if(task.cancelled)return [{ok:false,note:'실행을 중지했어요.'}];
    return chrome.scripting.executeScript({ target: { tabId: tab.id }, func: performActions, args: [actions, context.snapshot, task.token] });
  })()
    .then(([res]) => (res && res.result) || [{ ok: false, note: "페이지가 이동했어요. 새 화면에서 결과를 확인해 주세요." }])
    .catch((e) => {
      if (/frame|removed|closed|navigat|context/i.test(e.message)) return [{ ok: false, note: "페이지가 이동했어요. 새 화면에서 결과를 확인해 주세요." }];   // 실행 도중 페이지가 바뀐 경우
      throw e;
    });
  return await Promise.race([run, moved, timeout, cancelled]);
  }
  finally {
    task.cancelled=true;clearTimeout(timer);
    if(onUpdated)chrome.tabs.onUpdated.removeListener(onUpdated);
    if(onActivated)chrome.tabs.onActivated.removeListener?.(onActivated);if(onFocus)chrome.windows.onFocusChanged.removeListener?.(onFocus);
    if(overlayRequested&&tab)chrome.scripting.executeScript({target:{tabId:tab.id},func:stopControlOverlay,args:[task.token]}).catch(()=>{});
    if(activeActionRun===task)activeActionRun=null;
  }
};

EnvChat.mount({ getUrl, getPage, getShot, highlight, unhighlight, browserNav, act, cancelAct, diagnose });

async function refresh() { EnvChat.setStatus(await getUrl()); }
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tab.active && (info.url || info.status === "complete")) refresh();
});
chrome.windows.onFocusChanged.addListener(refresh);
refresh();
