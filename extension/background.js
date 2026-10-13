importScripts("../shared/sample-pack.js", "../shared/match.js");

// 툴바 아이콘을 누르면 사이드 패널이 열리도록 설정
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// 등록된 사이트에 들어가면 툴바 아이콘에 환경 배지를 표시 (탭별로 따로 표시됨)
const BADGE = {
  dev: { text: "DEV", color: "#15803d" },
  test: { text: "TEST", color: "#b45309" },
};

function updateBadge(tabId, url) {
  const { kind, entries } = EnvMatch.lookup(url || "");
  let text = "", color = "#6b7280", title = "화면 길잡이";

  if (kind === "env") {
    const type = entries[0].type;
    ({ text, color } = BADGE[type]);
    const n = entries.reduce((sum, e) => sum + e.accounts.length, 0);
    title = `${EnvMatch.ENV_LABEL[type]} · 계정 ${n}개 (클릭해서 보기)`;
  } else if (kind === "prod") {
    text = "!"; color = "#dc2626"; title = "운영 환경 — 지원하지 않습니다";
  }
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setTitle({ tabId, title });
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === "complete") updateBadge(tabId, tab.url);
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  updateBadge(tabId, tab.url);
});
