// 확장 프로그램과 웹이 함께 쓰는 공통 코어: 팩 검증, URL 매칭, 운영 차단, 화면 렌더링
(function () {
  const { ENV_LABEL, ENTRIES, rejected, isProd, hostOf } = EnvMatch;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const $ = (id) => document.getElementById(id);

  const accountsHtml = (accts, type) => `<div class="accts">` + accts.map((a) => `
    <div class="acct">
      <div class="avatar ${type}">${esc((a.id[0] || "?"))}</div>
      <div class="who"><div class="id">${esc(a.id)}</div><div class="memo">${esc(a.memo || "")}</div></div>
      <button data-copy="${esc(a.id)}" title="계정 ID 복사">📋 복사</button>
    </div>`).join("") + `</div>`;

  // 주어진 URL에 해당하는 환경/계정을 box에 그린다
  function renderNow(url, box) {
    const host = hostOf(url);
    if (!url) { box.innerHTML = `<div class="card empty-card"><div class="ico">🔎</div>URL을 입력하거나 선택하세요.</div>`; return; }
    if (!host) { box.innerHTML = `<div class="card empty-card"><div class="ico">❔</div>확인할 수 없는 주소예요.</div>`; return; }
    if (isProd(host)) {
      box.innerHTML = `<div class="card blocked"><div class="now-title"><b>⛔ 운영 환경</b></div>
        <div>운영은 지원하지 않습니다. 계정을 표시하지 않아요.</div><div class="url">${esc(url)}</div></div>`;
      return;
    }
    const hit = ENTRIES.filter((e) => e.host === host);
    if (!hit.length) {
      box.innerHTML = `<div class="card empty-card"><div class="ico">🗂️</div>등록된 환경이 아닙니다.<div class="url">${esc(url)}</div></div>`;
      return;
    }
    box.innerHTML = hit.map((e) => `
      <div class="card ${e.type}">
        <div class="now-title"><span class="badge ${e.type}">${ENV_LABEL[e.type]}</span><b>${esc(e.project)}</b></div>
        <div class="url">${esc(e.url)}</div>
        ${accountsHtml(e.accounts, e.type)}
      </div>`).join("");
  }

  // 전체 목록 + 검색
  function renderList(q, box) {
    const needle = (q || "").trim().toLowerCase();
    // 검색 데이터에 없는 일반 단어("계정", "환경" 등)는 무시한다. 말로 물을 때 섞여 들어오기 쉽다.
    const STOP = new Set(["계정", "계정들", "환경", "목록", "정보", "전체", "리스트"]);
    const tokens = needle.split(/\s+/).filter((t) => t && !STOP.has(t));
    const match = (e) => {
      const hay = [e.project, ENV_LABEL[e.type], e.url, ...e.accounts.flatMap((a) => [a.id, a.memo || ""])].join(" ").toLowerCase();
      const flat = hay.replace(/\s+/g, "");
      return tokens.every((t) => flat.includes(t));   // 여러 단어는 모두 포함(AND), 띄어쓰기는 무시
    };
    const byProject = {};
    ENTRIES.filter(match).forEach((e) => (byProject[e.project] ||= []).push(e));
    const html = Object.entries(byProject).map(([proj, envs]) => `
      <details class="proj" open>
        <summary>${esc(proj)}<span class="count">${envs.length}</span></summary>
        ${envs.map((e) => `
          <div class="card ${e.type}">
            <div class="env-head">
              <span class="badge ${e.type}">${ENV_LABEL[e.type]}</span>
              <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url)}</a>
            </div>
            ${accountsHtml(e.accounts, e.type)}
          </div>`).join("")}
      </details>`).join("");
    box.innerHTML = (html || `<div class="empty">검색 결과가 없어요.</div>`) +
      (rejected.length ? `<div class="warn-note">⚠ 운영 URL ${rejected.length}건이 팩에서 제외됨: ${rejected.map(esc).join(", ")}</div>` : "");
  }

  // 부분 입력(order-test, localhost:3000)을 등록 URL로 해석
  function resolveUrl(raw, candidates) {
    const v = raw.trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    return candidates.find((u) => u.toLowerCase().includes(v.toLowerCase())) || "http://" + v;
  }

  // ID 복사 버튼 처리
  function bindCopy() {
    document.addEventListener("click", (ev) => {
      const t = ev.target.closest("[data-copy]");
      if (!t) return;
      navigator.clipboard.writeText(t.dataset.copy).then(() => {
        const toast = $("toast");
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 900);
      });
    });
  }

  window.EnvCore = { ENTRIES, rejected, isProd, hostOf, esc, $, renderNow, renderList, resolveUrl, bindCopy };
})();
