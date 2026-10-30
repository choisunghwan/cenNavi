// 현재 탭 안에서 실행되는 함수들 (chrome.scripting.executeScript의 func로 직렬화되어 실행됨).
// 그래서 각 함수는 바깥 변수를 참조하지 않고 스스로 완결되어야 한다.
// 입력칸의 '값'은 읽지 않는다 (비밀번호 포함). 라벨/이름/종류만 읽는다.

// 화면 구조를 읽는다. 눌러볼 만한 항목에는 id를 붙여 두고, 이후 highlightTargets가 그 id로 같은 요소를 찾는다.
function extractPage() {
  window.__guideEls = [];
  window.__guideSnapshot = crypto.randomUUID();
  const reg = (el) => window.__guideEls.push(el) - 1;

  const txt = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  // 조상의 overflow 영역에 가려졌는지 (접힌 서랍 메뉴, 스크롤 영역 밖 등) 확인한다
  const ovCache = new Map();
  const clipped = (el, r) => {
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      let c = ovCache.get(p);
      if (!c) {
        const s = getComputedStyle(p);
        c = { clip: /(hidden|auto|scroll|clip)/.test(s.overflow + s.overflowX + s.overflowY), rect: null };
        if (c.clip) c.rect = p.getBoundingClientRect();
        ovCache.set(p, c);
      }
      if (c.clip && (cx < c.rect.left || cx > c.rect.right || cy < c.rect.top || cy > c.rect.bottom)) return true;
    }
    return false;
  };
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    if (r.right <= 0 || r.left >= innerWidth) return false;                 // 화면 옆으로 밀려난 메뉴
    if (el.checkVisibility) { if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false; }
    else { const s = getComputedStyle(el); if (s.visibility === "hidden" || s.display === "none") return false; }
    return !clipped(el, r);
  };
  const posOf = (el) => {   // 화면 안 대략 위치 (예: 상단좌)
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return (cy < innerHeight / 3 ? "상단" : cy > innerHeight * 2 / 3 ? "하단" : "중단") + (cx < innerWidth / 3 ? "좌" : cx > innerWidth * 2 / 3 ? "우" : "중");
  };
  const uniq = (arr, key) => { const seen = new Set(); return arr.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };

  const navSel = "nav a, aside a, [role=navigation] a, [role=menu] a, [role=menuitem], header a, .menu a, .sidebar a, .gnb a, .lnb a, [class*=menu] a, [class*=nav] a";
  const linkOf = (a) => ({ el: a, t: txt(a).slice(0, 40), h: a.getAttribute("href") || "" });
  let nav = [...document.querySelectorAll(navSel)].filter(vis).map(linkOf).filter((x) => x.t);
  if (nav.length < 3) {   // 메뉴 구조를 못 찾으면 보이는 링크 일부를 사용
    nav = [...document.querySelectorAll("a[href]")].filter(vis).map(linkOf).filter((x) => x.t);
  }
  const navList = uniq(nav, (x) => x.t + x.h).slice(0, 60);
  const taken = new Set(navList.map((x) => x.t + "|" + x.h));
  nav = navList.map((x) => ({ id: reg(x.el), t: x.t, h: x.h }));

  const shownKeys = new Set(nav.map((x) => x.t + "|" + x.h));
  const hiddenNav = uniq(
    [...document.querySelectorAll(navSel)].filter((el) => !vis(el)).map(linkOf).filter((x) => x.t && !shownKeys.has(x.t + "|" + x.h)),
    (x) => x.t + x.h).slice(0, 40).map((x) => ({ t: x.t, h: x.h.slice(0, 80) }));

  // 메뉴 밖의 다른 링크(로그인 박스, 본문 링크 등): 지금 화면에 보이는 것을 먼저 담는다
  const inView = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const others = uniq(
    [...document.querySelectorAll("a[href], [role=link], [role=tab]")].filter(vis).map(linkOf)
      .filter((x) => x.t && !taken.has(x.t + "|" + x.h)),
    (x) => x.t + x.h);
  others.sort((a, b) => inView(b.el) - inView(a.el));
  const links = others.slice(0, 80).map((x) => ({ id: reg(x.el), t: x.t, h: x.h.slice(0, 100) }));

  const fieldOf = (i) => ({
    id: reg(i),
    type: i.type || i.tagName.toLowerCase(),
    name: i.name || i.id || "",
    label: (i.labels && i.labels[0] ? txt(i.labels[0]) : "") || i.placeholder || i.getAttribute("aria-label") || txt(i).slice(0, 30),
  });

  const forms = [...document.querySelectorAll("form")].filter(vis).slice(0, 5).map((f) => ({
    action: f.getAttribute("action") || "",
    fields: [...f.querySelectorAll("input,select,textarea,button")].filter(vis).slice(0, 25).map(fieldOf),
  }));

  const loose = [...document.querySelectorAll('input,select,textarea,[contenteditable="true"],[role="textbox"]')].filter(el => !el.closest('form') && vis(el)).slice(0, 40);
  if (loose.length) forms.push({ action: '', fields: loose.map(fieldOf) });

  // 폼 밖의 버튼
  const buttons = [...document.querySelectorAll("button, [role=button], input[type=button], input[type=submit]")]
    .filter((b) => vis(b) && !b.closest("form")).slice(0, 25)
    .map((b) => ({
      id: reg(b),
      t: (txt(b) || b.value || b.getAttribute("aria-label") || b.title || (b.querySelector("img[alt]") || {}).alt || "").slice(0, 30)
         || ("(아이콘) " + String(b.className || b.id || "").slice(0, 24)),
      pos: posOf(b),
    }));

  return {
    snapshot: window.__guideSnapshot,
    selection: String(window.getSelection() || "").slice(0, 12000),
    url: location.href,
    title: document.title,
    headings: [...document.querySelectorAll("h1,h2,h3")].filter(vis).slice(0, 30).map(txt).filter(Boolean),
    nav,
    hiddenNav,
    links,
    forms,
    buttons,
    tables: [...document.querySelectorAll("table")].filter(vis).slice(0, 5)
      .map((t) => ({ headers: [...t.querySelectorAll("th")].slice(0, 20).map(txt).filter(Boolean),
        rows: [...t.querySelectorAll("tr")].slice(0, 30).map(row => [...row.querySelectorAll('td')].slice(0, 20).map(cell => txt(cell).slice(0, 200))).filter(row => row.length) })),
    text: txt(document.querySelector("main,article,[role=main]") || document.body).slice(0, 24000),
  };
}

// 안내한 항목 주위에 주황 테두리와 "여기예요" 표시를 띄운다. (클릭 등 조작은 하지 않는다)
function highlightTargets(ids, labels, snapshot) {
  if (snapshot && snapshot !== window.__guideSnapshot) return {shown:0,reason:'stale'};
  const OLD = document.getElementById("__guide_overlay");
  if (OLD && OLD.__stop) OLD.__stop();
  if (OLD) OLD.remove();
  const els = window.__guideEls || [];
  const multi = (ids || []).length > 1;
  const pairs = (ids || []).map((id, n) => ({ el: els[id], label: (labels || [])[n], step: n + 1 })).filter((p) => p.el && p.el.isConnected);
  if (!pairs.length) return { shown: 0, reason: "missing" };

  pairs[0].el.scrollIntoView({ block: "center", inline: "center" });
  // 화면 안에 실제로 보이는 항목만 표시한다 (접힌 메뉴처럼 화면 밖에 있는 항목은 제외)
  const onScreen = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
  };
  const targets = pairs.filter((p) => onScreen(p.el));
  if (!targets.length) return { shown: 0, reason: "offscreen" };
  // 첫 번째 안내 항목에 포커스를 둔다 (입력칸이면 바로 입력할 수 있는 상태가 된다)
  try { targets[0].el.focus({ preventScroll: true }); } catch (e) { /* 포커스할 수 없는 요소 */ }

  // 사이트의 스타일(예: 모든 div에 overflow:hidden)이 표시를 가리지 못하도록 Shadow DOM 안에 그린다.
  // 화면 좌표(fixed)로 두고, 매 프레임 대상의 실제 위치를 다시 읽어 따라간다.
  // (스크롤, 창 크기 변경, 사이트가 나중에 화면을 다시 배치하는 경우에도 어긋나지 않게)
  const root = document.createElement("div");
  root.id = "__guide_overlay";
  root.style.cssText =
    "all:initial!important;display:block!important;position:fixed!important;left:0!important;top:0!important;" +
    "width:0!important;height:0!important;overflow:visible!important;z-index:2147483647!important;pointer-events:none!important;";
  const shadow = root.attachShadow({ mode: "open" });

  const items = targets.map(({ el, label, step }) => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:absolute;box-sizing:border-box;border:3px solid #f59e0b;border-radius:10px;" +
      "box-shadow:0 0 0 4px rgba(245,158,11,.35),0 0 18px rgba(245,158,11,.85);";
    // 여러 단계면 번호 배지(1, 2, …)를 모서리에 붙인다
    if (multi) {
      const badge = document.createElement("div");
      badge.textContent = String(step);
      badge.style.cssText =
        "position:absolute;left:-15px;top:-15px;width:28px;height:28px;border-radius:50%;box-sizing:border-box;" +
        "background:#f59e0b;color:#111;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);" +
        "font:800 15px/24px 'Segoe UI','Malgun Gothic',sans-serif;text-align:center;";
      box.appendChild(badge);
    }
    let tag = null;
    const text = label || (multi ? "" : "여기예요");
    if (text) {
      tag = document.createElement("div");
      tag.textContent = (multi ? "" : "👉 ") + text;
      tag.style.cssText =
        `position:absolute;left:${multi ? 16 : 0}px;` +
        "background:#f59e0b;color:#111;font:700 12px/1 'Segoe UI','Malgun Gothic',sans-serif;" +
        "padding:6px 9px;border-radius:7px;white-space:nowrap;";
      box.appendChild(tag);
    }
    box.animate([{ transform: "scale(1)" }, { transform: "scale(1.04)" }, { transform: "scale(1)" }], { duration: 900, iterations: 6 });
    shadow.appendChild(box);
    return { el, box, tag };
  });

  const update = () => {
    for (const { el, box, tag } of items) {
      const r = el.getBoundingClientRect();
      if (!el.isConnected || !(r.width > 0 && r.height > 0)) { box.style.display = "none"; continue; }
      box.style.display = "block";
      box.style.left = `${r.left - 6}px`; box.style.top = `${r.top - 6}px`;
      box.style.width = `${r.width + 12}px`; box.style.height = `${r.height + 12}px`;
      if (tag) { const above = r.top > 44; tag.style.top = above ? "-32px" : `${r.height + 14}px`; }
    }
  };
  update();
  document.documentElement.appendChild(root);

  let raf = 0;
  const tick = () => { if (!root.isConnected) return; update(); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);

  // 안내한 항목을 직접 누르면 사라지고, 아니면 60초 뒤 사라진다 (화면의 다른 곳을 눌러도 유지)
  const stop = () => { cancelAnimationFrame(raf); removeEventListener("click", onClick, true); };
  const off = () => { stop(); root.remove(); };
  const onClick = (e) => { if (targets.some((t) => t.el.contains(e.target))) off(); };
  root.__stop = stop;
  setTimeout(off, 60000);
  addEventListener("click", onClick, true);
  return { shown: targets.length, total: pairs.length, focused: document.activeElement === targets[0].el };
}

function clearHighlight() {
  const o = document.getElementById("__guide_overlay");
  if (o && o.__stop) o.__stop();
  if (o) o.remove();
  return { shown: 0 };
}

// 사용자가 확인한 계획을 실행한다. 허용 동작은 입력(type)·Enter(enter)·클릭(click)뿐이다.
// (페이지 안에서 한 번 더 검증한다: 비밀번호 칸, 삭제·결제·전송 계열, 비밀번호가 있는 로그인 폼 제출은 막는다)
function performActions(actions, snapshot) {
  if (!snapshot || snapshot !== window.__guideSnapshot) return Promise.resolve([{ ok:false, note:'화면 분석이 갱신됐어요. 다시 요청해 주세요.' }]);
  const DANGER = /삭제|제거|결제|구매|주문하기|송금|이체|전송|발송|탈퇴|해지|확정|승인|제출|초기화|로그아웃|delete|remove|pay|purchase|buy|send|submit|confirm|withdraw|logout|sign ?out/i;
  const TEXT_TYPES = ["text", "search", "email", "url", "tel", "number", ""];
  const els = window.__guideEls || [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const labelOf = (el) => ((el.innerText || el.value || el.getAttribute("aria-label") || el.title || "") + " " + (el.getAttribute("href") || "")).trim();

  return (async () => {
    const results = [];
    for (const a of (actions || []).slice(0, 4)) {
      const el = els[a.id];
      if (!el || !el.isConnected) { results.push({ ok: false, note: "화면에서 항목을 찾을 수 없어요" }); break; }
      try {
        if (a.type === "type" || a.type === "enter") {
          const isInput = el.tagName === "INPUT" && TEXT_TYPES.includes((el.type || "").toLowerCase());
          const isArea = el.tagName === "TEXTAREA";
          if (!isInput && !isArea && !el.isContentEditable) { results.push({ ok: false, note: "입력할 수 없는 칸이에요" }); break; }
          if (a.type === 'enter' && el.form && el.form.querySelector('input[type=password]')) { results.push({ok:false,note:'비밀번호가 있는 로그인은 직접 해 주세요'}); break; }
          el.focus();
          if (a.type === "type") {
            if (isInput || isArea) {
              const proto = isArea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
              Object.getOwnPropertyDescriptor(proto, "value").set.call(el, String(a.text || ""));   // React 등 제어 입력 대응
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
            } else {
              document.execCommand("insertText", false, String(a.text || ""));
            }
            results.push({ ok: true, note: `"${a.text}" 입력했어요` });
          } else {
            const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
            const proceed = el.dispatchEvent(new KeyboardEvent("keydown", opts));
            el.dispatchEvent(new KeyboardEvent("keyup", opts));
            // 페이지가 Enter를 직접 처리하지 않았다면 폼을 제출한다
            if (proceed && el.form) { if (el.form.requestSubmit) el.form.requestSubmit(); else el.form.submit(); }
            results.push({ ok: true, note: "Enter로 실행했어요. 결과 확인 후 다음 단계를 진행하세요." });
            break;
          }
        } else if (a.type === "click") {
          if (DANGER.test(labelOf(el))) { results.push({ ok: false, note: "안전을 위해 직접 눌러야 하는 항목이에요" }); break; }
          if (el.form && el.form.querySelector("input[type=password]") && /submit/i.test(el.type || "")) {
            results.push({ ok: false, note: "비밀번호가 있는 로그인은 직접 해 주세요" }); break;
          }
          el.scrollIntoView({ block: "center" });
          el.click();
          results.push({ ok: true, note: "눌렀어요. 결과 확인 후 다음 단계를 진행하세요." });
          break;
        } else {
          results.push({ ok: false, note: "지원하지 않는 동작이에요" }); break;
        }
      } catch (e) {
        results.push({ ok: false, note: String((e && e.message) || e) }); break;
      }
      await sleep(250);
    }
    return results;
  })();
}
