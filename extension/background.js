importScripts("../shared/sample-pack.js", "../shared/match.js");

// 툴바 아이콘을 누르면 사이드 패널이 열리도록 설정
chrome.runtime.onInstalled.addListener(async () => {
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); }
  catch (error) { console.error('CenNavi: side-panel setup failed:', error.message); }
});

// 등록된 사이트에 들어가면 툴바 아이콘에 환경 배지를 표시 (탭별로 따로 표시됨)
const BADGE = {
  dev: { text: "DEV", color: "#15803d" },
  test: { text: "TEST", color: "#b45309" },
};

async function updateBadge(tabId, url) {
  const { kind, entries } = EnvMatch.lookup(url || "");
  let text = "", color = "#6b7280", title = "CenNavi";

  if (kind === "env") {
    const type = entries[0].type;
    ({ text, color } = BADGE[type]);
    const n = entries.reduce((sum, e) => sum + e.accounts.length, 0);
    title = `${EnvMatch.ENV_LABEL[type]} · 계정 ${n}개 (클릭해서 보기)`;
  } else if (kind === "prod") {
    text = "!"; color = "#dc2626"; title = "운영 환경 — 지원하지 않습니다";
  }
  await Promise.all([
    chrome.action.setBadgeText({ tabId, text }),
    chrome.action.setBadgeBackgroundColor({ tabId, color }),
    chrome.action.setTitle({ tabId, title }),
  ]);
}

async function refreshBadge(tabId, url) {
  try {
    if (url === undefined) url = (await chrome.tabs.get(tabId)).url;
    await updateBadge(tabId, url);
  } catch (error) {
    // Activation/update events can outlive their tab. Only this expected race is ignored.
    if (!/^No tab with id:/i.test(error.message || '')) console.error('CenNavi: badge update failed:', error.message);
  }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === "complete") return refreshBadge(tabId, tab.url);
});
chrome.tabs.onActivated.addListener(({ tabId }) => refreshBadge(tabId));
