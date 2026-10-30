// 현재 탭 안에서 실행되는 함수들 (chrome.scripting.executeScript의 func로 직렬화되어 실행됨).
// 그래서 각 함수는 바깥 변수를 참조하지 않고 스스로 완결되어야 한다.
// 입력칸의 '값'은 읽지 않는다 (비밀번호 포함). 라벨/이름/종류만 읽는다.

// 화면 구조를 읽는다. 눌러볼 만한 항목에는 id를 붙여 두고, 이후 highlightTargets가 그 id로 같은 요소를 찾는다.
function extractPage() {
  window.__guideEls = [];
  window.__guideSnapshot = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
  const snapshot = window.__guideSnapshot, snapshotUrl = location.href, metadata = [], elementIds = new Map();
  const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
  const signature = el => JSON.stringify([el.tagName,el.type,el.id,el.getAttribute('name'),el.getAttribute('role'),el.getAttribute('href'),el.getAttribute('aria-label'),el.getAttribute('placeholder'),el.getAttribute('title'),
    el.labels?.[0]?.textContent || '', el.matches('input:not([type=button]):not([type=submit]),textarea,select,[contenteditable=true],[role=textbox]') ? '' : (el.innerText || el.textContent || el.value || '')]);
  const reg = (el, label) => {
    if (elementIds.has(el)) return elementIds.get(el);
    const id = window.__guideEls.push(el) - 1; elementIds.set(el,id);
    metadata[id] = {el,label,signature:signature(el)}; return id;
  };

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
  nav = navList.map((x) => ({ id: reg(x.el,x.t), t: x.t, h: x.h }));

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
  const links = others.slice(0, 80).map((x) => ({ id: reg(x.el,x.t), t: x.t, h: x.h.slice(0, 100) }));

  const fieldLabel = i => (i.labels?.[0] ? txt(i.labels[0]) : '') || i.placeholder || i.getAttribute('aria-label') ||
      (/^(button|submit)$/.test(i.type || '') || i.tagName === 'BUTTON' ? txt(i) || i.value : '') || i.name || i.id || '';
  const fieldOf = (i) => {
    const label = fieldLabel(i);
    return {
    id: reg(i,label),
    type: i.type || i.tagName.toLowerCase(),
    name: i.name || i.id || "",
    label,
  }; };

  const forms = [...document.querySelectorAll("form")].filter(vis).slice(0, 5).map((f) => ({
    action: f.getAttribute("action") || "",
    fields: [...f.querySelectorAll("input,select,textarea,button")].filter(vis).slice(0, 25).map(fieldOf),
  }));

  const loose = [...document.querySelectorAll('input,select,textarea,[contenteditable="true"],[role="textbox"]')].filter(el => !el.closest('form') && !elementIds.has(el) && !/^(button|submit|reset|hidden|image)$/.test(el.type || '') && vis(el)).slice(0, 40);
  if (loose.length) forms.push({ action: '', fields: loose.map(fieldOf) });

  // 폼 밖의 버튼
  const buttons = [...document.querySelectorAll("button, [role=button], input[type=button], input[type=submit]")]
    .filter((b) => vis(b) && !b.closest("form") && !elementIds.has(b)).slice(0, 25)
    .map((b) => {
      const label = (txt(b) || b.value || b.getAttribute('aria-label') || b.title || b.querySelector('img[alt]')?.alt || '').slice(0,80);
      return {
      id: reg(b,label),
      t: label,
      pos: posOf(b),
    }; });

  // Count eligible elements before link deduplication and snapshot limits can hide ambiguity.
  const occurrences=new Map(),ambiguousNames=new Set();
  for(const el of document.querySelectorAll('a[href],[role=link],[role=tab],[role=menuitem],button,[role=button],input,select,textarea,[contenteditable=true],[role=textbox]')) {
    if(!vis(el))continue;
    const label=el.matches('a[href],[role=link],[role=tab],[role=menuitem]')?txt(el).slice(0,40):
      el.matches('input,select,textarea,[contenteditable=true],[role=textbox]')?fieldLabel(el):
      (txt(el)||el.value||el.getAttribute('aria-label')||el.title||el.querySelector('img[alt]')?.alt||'').slice(0,80);
    const key=norm(label);if(!key)continue;
    const seen=occurrences.get(key)||new Set();seen.add(el);occurrences.set(key,seen);if(seen.size>1)ambiguousNames.add(key);
  }
  for(const item of [...nav,...links,...buttons,...forms.flatMap(f=>f.fields)]) {
    const meta=metadata[item.id];item.ambiguous=ambiguousNames.has(norm(meta.label));
    item.disabled=meta.el.matches(':disabled')||meta.el.getAttribute('aria-disabled')==='true';
  }
  window.__guideState = { snapshot, resolve(id, expected, {scroll = false} = {}) {
    const item = metadata[id], el = item?.el;
    const fail = reason => ({ok:false,reason});
    if (window.__guideSnapshot !== snapshot) return fail('stale');
    if (location.href !== snapshotUrl) return fail('navigated');
    if (!el?.isConnected || !expected || norm(expected) !== norm(item.label)) return fail('target-mismatch');
    if (ambiguousNames.has(norm(expected))||metadata.filter(x => norm(x.label) === norm(expected)).length !== 1) return fail('ambiguous');
    if (signature(el) !== item.signature) return fail('changed');
    if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') return fail('disabled');
    if (el.checkVisibility && !el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) return fail('hidden');
    if (scroll) el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    const rect = el.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    if (!(rect.width > 0 && rect.height > 0 && x > 0 && x < innerWidth && y > 0 && y < innerHeight)) return fail('offscreen');
    for (let p=el.parentElement;p&&p!==document.documentElement;p=p.parentElement) {
      const style=getComputedStyle(p);
      if (/(hidden|auto|scroll|clip)/.test(style.overflow+style.overflowX+style.overflowY)) { const r=p.getBoundingClientRect(); if(x<r.left||x>r.right||y<r.top||y>r.bottom)return fail('clipped'); }
    }
    const hit=document.elementFromPoint(x,y);
    if (!hit || (hit !== el && !el.contains(hit))) return fail('covered');
    return {ok:true,element:el,rect,x,y,label:item.label};
  }};

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
function clearHighlight() {
  const o = document.getElementById("__guide_overlay");
  if (o && o.__stop) o.__stop();
  if (o) o.remove();
  return { shown: 0 };
}

// 사용자가 확인한 계획을 실행한다. 허용 동작은 입력(type)·Enter(enter)·클릭(click)뿐이다.
// (페이지 안에서 한 번 더 검증한다: 비밀번호 칸, 삭제·결제·전송 계열, 비밀번호가 있는 로그인 폼 제출은 막는다)
function performActions(actions, snapshot, token) {
  const control=window.__cenNaviControl,state=window.__guideState;
  const fail=note=>{if(control&&control.token===token)control.dispose();return Promise.resolve([{ok:false,note}]);};
  if (!snapshot || snapshot !== window.__guideSnapshot) return fail('화면 분석이 갱신됐어요. 다시 요청해 주세요.');
  if(!token||control?.token!==token||!state||state.snapshot!==snapshot)return fail('실행 표시를 확인하지 못했어요. 다시 요청해 주세요.');
  const DANGER = /삭제|제거|결제|구매|주문하기|송금|이체|전송|발송|탈퇴|해지|확정|승인|제출|초기화|로그아웃|delete|remove|pay|purchase|buy|send|submit|confirm|withdraw|logout|sign ?out/i;
  const TEXT_TYPES = ["text", "search", "email", "url", "tel", "number", ""];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const labelOf = (el) => ((el.innerText || el.value || el.getAttribute("aria-label") || el.title || "") + " " + (el.getAttribute("href") || "")).trim();

  return (async () => {
    const results = [];
    try {
    for (const a of (actions || []).slice(0, 4)) {
      if(control.cancelled){results.push({ok:false,note:'실행을 중지했어요.'});break;}
      let found=state.resolve(a.id,a.target,{scroll:true});
      if(!found.ok){results.push({ok:false,note:'대상이 바뀌었거나 보이지 않아 실행하지 않았어요 ('+found.reason+').'});break;}
      let el=found.element;
      try {
        if(a.type==='click'&&(DANGER.test(labelOf(el))||(el.form&&el.form.querySelector('input[type=password]')&&/submit/i.test(el.type||'')))){results.push({ok:false,note:'안전을 위해 직접 눌러야 하는 항목이에요.'});break;}
        if((a.type==='type'||a.type==='enter')&&((el.type||'').toLowerCase()==='password'||(a.type==='enter'&&el.form?.querySelector('input[type=password]')))){results.push({ok:false,note:'비밀번호가 있는 로그인은 직접 해 주세요.'});break;}
        await control.moveTo(found);
        if(control.cancelled){results.push({ok:false,note:'실행을 중지했어요.'});break;}
        let current=state.resolve(a.id,a.target);
        if(!current.ok||Math.abs(current.x-found.x)>4||Math.abs(current.y-found.y)>4){results.push({ok:false,note:'조작 중 대상 위치가 바뀌어 중지했어요. 다시 확인해 주세요.'});break;}
        found=current;
        if(a.type==='click'||a.type==='enter')await control.press(found);
        if(control.cancelled){results.push({ok:false,note:'실행을 중지했어요.'});break;}
        current=state.resolve(a.id,a.target);
        if(!current.ok||Math.abs(current.x-found.x)>4||Math.abs(current.y-found.y)>4){results.push({ok:false,note:'실행 직전에 대상이 바뀌어 중지했어요.'});break;}found=current;el=found.element;
        if (a.type === "type" || a.type === "enter") {
          const isInput = el.tagName === "INPUT" && TEXT_TYPES.includes((el.type || "").toLowerCase());
          const isArea = el.tagName === "TEXTAREA";
          if (!isInput && !isArea && !el.isContentEditable) { results.push({ ok: false, note: "입력할 수 없는 칸이에요" }); break; }
          if (a.type === 'enter' && el.form && el.form.querySelector('input[type=password]')) { results.push({ok:false,note:'비밀번호가 있는 로그인은 직접 해 주세요'}); break; }
          el.focus({preventScroll:true});
          if(control.cancelled||!state.resolve(a.id,a.target).ok){results.push({ok:false,note:'대상이 바뀌었거나 실행을 중지했어요.'});break;}
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
    } finally {control.dispose();}
  })();
}
