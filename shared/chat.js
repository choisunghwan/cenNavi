// 대화형 UI: 슬래시 명령 + 퀵 메뉴. 결과는 기존 화면(renderNow/renderList)을 카드로 재사용한다.
(function () {
  const { $, esc, renderNow, renderList, resolveUrl, ENTRIES } = EnvCore;

  function mount({ getUrl, getPage, getShot, highlight, unhighlight, browserNav, act, diagnose, manual = false }) {
    const feed = $("feed"), input = $("cmd"), menu = $("slashMenu"), chips = $("chips"), form = $("form");

    // 명령 정의: name(한글) + alias(영문 등), arg가 있으면 인자를 받는 명령
    const COMMANDS = [
      { name: "로그인", alias: ["login"], icon: "🔑", arg: "[주소]", argOptional: true,
        desc: manual ? "주소(또는 키워드)로 로그인 계정 보기" : "현재 사이트의 로그인 계정 보기 · 주소 지정 가능",
        run: async (box, args) => {
          const urls = ENTRIES.map((e) => e.url);
          const url = args ? resolveUrl(args, urls) : await getUrl();
          if (!url) {
            box.innerHTML = `<div class="bubble">어느 사이트의 계정을 볼까요? 주소를 입력하거나 아래에서 골라 주세요.
              <div class="picks">` + ENTRIES.map((e) => `<button type="button" data-run="/로그인 ${esc(e.url)}">
              <span class="badge ${e.type}">${esc(EnvMatch.ENV_LABEL[e.type])}</span>${esc(e.url)}</button>`).join("") + `</div></div>`;
            return;
          }
          renderNow(url, box);
          if (manual) setStatus(url);
        } },
      { name: "환경", alias: ["env", "목록"], icon: "🗂️", arg: "[키워드]", argOptional: true, desc: "전체 환경 목록 · 키워드로 검색",
        run: (box, args) => renderList(args, box) },
      { name: "분석", alias: ["analyze", "질문"], icon: "🔍", arg: "[질문]", argOptional: true,
        desc: "지금 열린 화면이 뭔지, 어디로 가야 하는지 물어보기 (확장 프로그램 전용)",
        run: (box, args) => analyze(box, args) },
      { name: "진단", alias: ["diag", "doctor"], icon: "🩺", desc: "연결 상태 점검: 권한, 화면 읽기, Gemini (확장 프로그램 전용)",
        run: (box) => runDiag(box) },
      { name: "도움말", alias: ["help"], icon: "❓", desc: "사용할 수 있는 명령 보기",
        run: (box) => { box.innerHTML = helpHtml(); } },
      { name: "설정", alias: ["settings", "키"], icon: "⚙️", desc: "Gemini 키·모델 설정 (자연어 입력용)",
        run: (box) => { box.innerHTML = settingsHtml(); } },
      { name: "지우기", alias: ["clear"], icon: "🧹", desc: "대화 내용 지우기",
        run: () => { feed.innerHTML = ""; greet(); }, silent: true },
    ];

    // 아주 간단한 서식: **굵게**, `코드`, "- " 불릿
    const fmt = (t) => esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>")
      .split("\n").map((l) => /^\s*\d+[.)]\s+/.test(l) ? `<div class="li step"><span class="n">${l.match(/\d+/)[0]}</span><span>${l.replace(/^\s*\d+[.)]\s+/, "")}</span></div>`
        : /^\s*[-*]\s+/.test(l) ? `<div class="li">• ${l.replace(/^\s*[-*]\s+/, "")}</div>`
        : l.trim() ? `<div class="p">${l}</div>` : "").join("");

    // 연결 점검: 어디서 막히는지 한눈에 보여준다
    async function runDiag(box) {
      if (!diagnose) {
        box.innerHTML = `<div class="bubble">연결 점검은 <b>확장 프로그램</b>에서만 쓸 수 있어요.</div>`;
        return;
      }
      box.innerHTML = `<div class="bubble thinking">🩺 점검 중이에요…</div>`;
      const rows = await diagnose();
      box.innerHTML = `<div class="bubble"><b>🩺 연결 점검</b><div class="diag">` + rows.map((r) =>
        `<div class="diag-row ${r.ok === true ? "ok" : r.ok === "warn" ? "warn" : "bad"}"><span>${r.ok === true ? "✅" : r.ok === "warn" ? "⚠️" : "❌"} ${esc(r.name)}</span><span class="muted">${esc(r.detail || "")}</span></div>`).join("") +
        `</div></div>`;
    }

    const NAV_LABEL = { back: "⬅ 이전 화면으로 이동", forward: "➡ 앞 화면으로 이동", reload: "🔄 새로고침" };
    const hlLabels = new Map();   // 다시 표시할 때 쓸 단계 설명 (ids → labels)

    // Gemini가 번호를 주지 않았을 때: 답변의 **굵은 글씨**·'따옴표' 이름을 화면 항목과 맞춰 본다
    const norm = (t) => String(t || "").replace(/\s+/g, "").toLowerCase();
    function guessTargets(answer, page) {
      const items = [
        // 입력칸을 가장 먼저 찾는다 ("검색창", "입력칸"을 말했는데 같은 이름의 다른 버튼이 잡히지 않도록)
        ...page.forms.flatMap((f) => f.fields.filter((x) => /^(text|search|email|url|tel|number|textarea|password)$/.test(x.type)).map((x) => ({ id: x.id, t: x.label || x.name }))),
        ...(page.buttons || []), ...page.nav, ...(page.links || []),
        ...page.forms.flatMap((f) => f.fields.filter((x) => !/^(text|search|email|url|tel|number|textarea|password)$/.test(x.type)).map((x) => ({ id: x.id, t: x.label || x.name }))),
      ].filter((x) => x.t);
      const names = [...answer.matchAll(/\*\*(.+?)\*\*|['"“‘「]([^'"”’」]{2,24})['"”’」]/g)].map((m) => norm(m[1] || m[2])).filter((n) => n.length >= 2);
      const ids = [];
      for (const n of names) {
        const hit = items.find((x) => norm(x.t) === n) || items.find((x) => norm(x.t).includes(n) || (norm(x.t).length >= 2 && n.includes(norm(x.t))));
        if (hit && !ids.includes(hit.id)) ids.push(hit.id);
      }
      return ids.slice(0, 3);
    }

    // ===== 확인 후 실행: 계획 검증과 계획 카드 =====
    const DANGER = /삭제|제거|결제|구매|주문하기|송금|이체|전송|발송|탈퇴|해지|확정|승인|제출|초기화|로그아웃|delete|remove|pay|purchase|buy|send|submit|confirm|withdraw|logout|sign ?out/i;
    const TEXT_TYPES = ["text", "search", "email", "url", "tel", "number", "textarea", ""];
    function indexItems(page) {
      const m = new Map();
      page.nav.forEach((x) => m.set(x.id, { kind: "link", label: x.t, href: x.h }));
      (page.links || []).forEach((x) => m.set(x.id, { kind: "link", label: x.t, href: x.h }));
      (page.buttons || []).forEach((x) => m.set(x.id, { kind: "button", label: x.t }));
      page.forms.forEach((f) => f.fields.forEach((x) => m.set(x.id, {
        kind: "field", type: (x.type || "").toLowerCase(), label: x.label || x.name || "", hasPassword: f.fields.some((y) => y.type === "password"),
      })));
      return m;
    }
    // 실행 전 검증: 허용된 동작인지, 입력할 글이 사용자의 요청에서 나왔는지(화면 속 문장이 시킨 것이 아닌지) 확인한다
    function vetActions(actions, page, userText) {
      const idx = indexItems(page), steps = [], blocked = [];
      for (const a of actions) {
        const it = idx.get(a.id);
        if (!it) { blocked.push({ a, why: "화면에서 항목을 찾지 못했어요" }); continue; }
        const name = it.label || "(이름 없음)";
        if (a.type === "type") {
          if (it.kind !== "field" || !TEXT_TYPES.includes(it.type)) blocked.push({ a, name, why: "입력할 수 없는 칸이에요 (비밀번호·파일 등은 직접 입력해 주세요)" });
          else if (!a.text || !norm(userText).includes(norm(a.text))) blocked.push({ a, name, why: "입력할 내용이 요청에 없어요" });
          else steps.push({ a, target: name, desc: `"${a.text}" 입력`, short: a.label || `${a.text} 입력` });
        } else if (a.type === "enter") {
          if (it.kind !== "field" || !TEXT_TYPES.includes(it.type)) blocked.push({ a, name, why: "Enter를 누를 수 없는 칸이에요" });
          else steps.push({ a, target: name, desc: "Enter 키로 실행", short: a.label || "Enter로 실행" });
        } else if (a.type === "click") {
          const text = `${name} ${it.href || ""}`;
          if (DANGER.test(text)) blocked.push({ a, name, why: "삭제·결제·전송·로그아웃 같은 동작은 직접 눌러 주세요" });
          else if (it.kind === "field" && (it.hasPassword || !/^(submit|button)$/.test(it.type))) blocked.push({ a, name, why: it.hasPassword ? "비밀번호가 있는 로그인은 직접 해 주세요" : "누를 수 없는 항목이에요" });
          else {
            let dest = "";
            if (it.href) { try { dest = new URL(it.href, "http://x/").host; if (dest === "x") dest = ""; } catch { dest = ""; } }
            steps.push({ a, target: name, desc: "클릭" + (dest ? ` → ${dest}` : ""), short: a.label || "클릭" });
          }
        } else blocked.push({ a, name, why: "지원하지 않는 동작이에요" });
      }
      return { steps, blocked };
    }

    // 모델이 실수로 실행 계획을 내더라도, 사용자가 "대신 해 달라"고 한 경우에만 계획을 허용한다.
    // ("어떻게 해", "어디서 해"처럼 방법을 묻는 말은 안내만 한다)
    const HOWTO = /어떻게|어디서|어디로|어디에|어디야|방법|하려면|하는 ?법|알려|가르쳐|뭐야|뭔가요|궁금/;
    const REQUEST = /(해 ?줘|해 ?줄래|해 ?주세요|해 ?주라|해라|해봐|눌러 ?(줘|주세요)|입력해|검색해|들어가 ?(줘|주세요)|열어 ?(줘|주세요)|클릭해|이동해|가 ?줘|넣어 ?(줘|주세요))/;
    const wantsAction = (t) => REQUEST.test(t) && !HOWTO.test(t);

    const plans = new Map(); let planSeq = 0;
    function planHtml(answer, steps, url, shot) {
      const id = ++planSeq;
      plans.set(id, { actions: steps.map((s) => s.a), url });
      return (shot ? `<div class="shot-wrap"><img class="shot" src="${shot}" alt="분석한 화면"><span class="muted">분석에 사용한 화면</span></div>` : "") +
        `<div class="bubble answer">${fmt(answer)}</div>
         <div class="plan"><div class="plan-title">🧭 이렇게 실행할게요</div>
           <div class="plan-steps">${steps.map((s, i) => `<div class="li step"><span class="n">${i + 1}</span><span><b>${esc(s.target)}</b> — ${esc(s.desc)}</span></div>`).join("")}</div>
           <div class="hl-actions"><button type="button" class="go" data-plan-run="${id}">▶ 실행</button><button type="button" data-plan-cancel="${id}">취소</button><span class="muted">눌러야 실행돼요</span></div>
           <div class="plan-result muted"></div></div>`;
    }

    // 안내만 하는 답변에서 "눌러 드릴게요"처럼 대신 해 주겠다는 말투를 안내 말투로 바꾼다 (실제로는 대신 하지 않으므로)
    const soften = (t) => t
      .replace(/눌러\s*드릴게요/g, "눌러 주세요").replace(/눌러\s*드리겠습니다/g, "눌러 주세요")
      .replace(/클릭하겠습니다/g, "클릭해 주세요").replace(/클릭할게요/g, "클릭해 주세요")
      .replace(/누르겠습니다/g, "눌러 주세요").replace(/누를게요/g, "눌러 주세요");

    // 현재 화면 분석: 화면 정보를 읽어 Gemini가 자연어로 답한다
    async function analyze(box, question) {
      if (!getPage) {
        box.innerHTML = `<div class="bubble">화면 분석은 <b>확장 프로그램</b>에서만 쓸 수 있어요. (웹 페이지는 다른 사이트의 화면을 읽을 수 없어요)</div>`;
        return;
      }
      if (!EnvGemini.getKey()) {
        box.innerHTML = `<div class="bubble">화면 분석에는 Gemini 키가 필요해요. <code>/설정</code>에서 입력해 주세요.</div>`;
        return;
      }
      const url = await getUrl();
      const found = EnvMatch.lookup(url);
      if (found.kind === "prod") {
        box.innerHTML = `<div class="bubble err">⛔ 운영 환경의 화면은 분석하지 않아요.</div>`;
        return;
      }
      box.innerHTML = `<div class="bubble thinking">🔍 화면을 캡처하고 읽고 있어요…</div>`;
      try {
        let page;
        try { page = await getPage(); }
        catch (e) { box.innerHTML = `<div class="bubble err">이 화면은 읽을 수 없어요. (크롬 내부 페이지, 웹스토어 등은 막혀 있어요)<br><span class="muted">사유: ${esc(e.message)}</span><br><code>/진단</code>으로 권한을 점검해 보세요.</div>`; return; }
        // 스크린샷은 선택 사항: 실패해도 텍스트/구조 정보만으로 계속 진행한다
        let shot = "";
        if (getShot) { try { shot = await getShot(); } catch { shot = ""; } }
        const env = found.entries.length ? found.entries.map((e) => ({
          project: e.project, environment: EnvMatch.ENV_LABEL[e.type], accounts: e.accounts.map((a) => ({ id: a.id, memo: a.memo })),
        })) : null;
        const q = (question || "").trim() || "이 화면이 어떤 화면인지, 여기서 무엇을 할 수 있는지 알려줘.";
        box.innerHTML = `<div class="bubble thinking">🤖 생각 중…</div>`;
        const res = await EnvGemini.answer(q, page, env, shot);
        // 대신 실행해 달라는 요청: 계획을 보여주고 확인을 받는다 (확인 없이는 실행하지 않는다)
        if (act && res.actions && res.actions.length && !wantsAction(q)) {
          // 방법만 물은 경우: 실행하지 않고 안내(화면 표시)로 바꾼다
          const seen = new Set(), ids = [], labs = [];
          for (const a of res.actions) if (!seen.has(a.id)) { seen.add(a.id); ids.push(a.id); labs.push(a.label || ""); }
          res.highlights = ids; res.labels = labs; res.actions = [];
          res.answer = res.answer.replace(/\s*아래에서\s*확인\s*후\s*실행해\s*주세요\.?/g, "").trim();
        }
        if (act && res.actions && res.actions.length) {
          const vetted = vetActions(res.actions, page, q);
          if (vetted.steps.length && !vetted.blocked.length) {
            const grouped = new Map();
            vetted.steps.forEach((s) => grouped.set(s.a.id, [...(grouped.get(s.a.id) || []), s.short]));
            if (highlight) { try { await highlight([...grouped.keys()], [...grouped.values()].map((l) => l.join(" → "))); } catch { /* 표시 실패는 무시 */ } }
            box.innerHTML = planHtml(res.answer, vetted.steps, url, shot);
            return;
          }
          // 직접 해야 하는 동작이 섞여 있으면 실행하지 않고, 해당 위치를 표시해서 안내한다
          const bids = vetted.blocked.map((b) => b.a.id).filter(Number.isInteger);
          if (highlight && bids.length) { try { await highlight(bids, bids.map(() => "직접 하세요")); } catch { /* 무시 */ } }
          box.innerHTML = `<div class="bubble err">⚠️ 안전을 위해 <b>직접 해야 하는 동작</b>이 있어서 대신 실행하지 않아요.<ul class="why">${
            vetted.blocked.map((b) => `<li>${b.name ? "<b>" + esc(b.name) + "</b> — " : ""}${esc(b.why)}</li>`).join("")}</ul>
            ${bids.length ? "해당 위치를 화면에 표시했어요." : ""}</div>`;
          return;
        }
        res.answer = soften(res.answer);
        // 안내한 항목을 화면에서 표시 (실패해도 답변은 그대로 보여준다)
        let shown = [], guessed = false;
        if (highlight) {
          let ids = res.highlights;
          if (!ids.length && res.browserAction === "none") { ids = guessTargets(res.answer, page); guessed = ids.length > 0; }
          if (ids.length) {
            const labels = guessed ? [] : (res.labels || []);
            try { const r = await highlight(ids, labels); if (r && r.shown) { shown = ids; hlLabels.set(ids.join(","), labels); } } catch { shown = []; }
          }
        }
        box.innerHTML = (shot ? `<div class="shot-wrap"><img class="shot" src="${shot}" alt="분석한 화면"><span class="muted">분석에 사용한 화면</span></div>` : "") +
          `<div class="bubble answer">${fmt(res.answer)}</div>` +
          (res.browserAction !== "none" && browserNav ? `<div class="hl-actions"><button type="button" class="go" data-nav="${res.browserAction}">${NAV_LABEL[res.browserAction]}</button><span class="muted">눌러야 이동해요</span></div>` : "") +
          (shown.length ? `<div class="hl-actions"><span class="muted">📍 화면에 표시했어요${guessed ? " (답변 내용으로 찾았어요)" : ""}</span>
            <button type="button" data-hl="${shown.join(",")}">다시 표시</button>
            <button type="button" data-hl-clear>표시 끄기</button></div>`
            : res.highlights.length ? `<div class="hl-actions"><span class="muted">⚠️ 안내한 항목이 지금 화면에 보이지 않아 표시하지 못했어요. 접힌 메뉴 안에 있거나 화면이 바뀌었을 수 있어요.</span></div>` : "") +
          `<div class="foot muted">읽은 항목: 메뉴 ${page.nav.length}${(page.hiddenNav || []).length ? " (+접힌 메뉴 " + page.hiddenNav.length + ")" : ""} · 링크 ${(page.links || []).length} · 입력칸 ${page.forms.reduce((n, f) => n + f.fields.length, 0)} · 버튼 ${(page.buttons || []).length}${shot ? " · 스크린샷 포함" : ""}</div>`;
      } catch (e) {
        box.innerHTML = `<div class="bubble err">⚠️ 분석에 실패했어요: ${esc(e.message)}</div>`;
      }
    }

    const aiCtx = () => ({ projects: [...new Set(ENTRIES.map((e) => e.project))] });
    const settingsHtml = () => `<div class="bubble gem-settings">
      <b>⚙️ Gemini 설정</b> <span class="muted">테스트용 · 이 브라우저에만 저장돼요</span>
      <div class="gem-state">현재: ${EnvGemini.getKey() ? "키 설정됨 (" + esc(EnvGemini.maskedKey()) + ")" : "키 없음"} · 모델 ${esc(EnvGemini.getModel())}</div>
      <input class="plain" type="password" name="key" placeholder="Gemini API 키 (비워두면 기존 키 유지)" autocomplete="off">
      <input class="plain" type="text" name="model" value="${esc(EnvGemini.getModel())}" placeholder="모델 이름">
      <button type="button" data-save>저장하고 연결 테스트</button>
      <div class="gem-result"></div></div>`;

    const helpHtml = () => `<div class="bubble">사용할 수 있는 명령이에요.<div class="help">` +
      COMMANDS.map((c) => `<div><code>/${esc(c.name)}${c.arg ? " " + esc(c.arg) : ""}</code><span>${esc(c.desc)}</span></div>`).join("") +
      `</div></div>`;

    const scroll = () => { feed.scrollTop = feed.scrollHeight; };
    const addUser = (text) => {
      const m = document.createElement("div");
      m.className = "msg user";
      m.innerHTML = `<div class="bubble">${esc(text)}</div>`;
      feed.appendChild(m); scroll();
    };
    const addBot = () => {
      const m = document.createElement("div");
      m.className = "msg bot";
      m.innerHTML = `<img class="mini" src="../icons/icon32.png" alt=""><div class="body"></div>`;
      feed.appendChild(m);
      return m.querySelector(".body");
    };

    function greet() {
      addBot().innerHTML = manual
        ? `<div class="bubble">안녕하세요! 👋<br>개발·시험 환경의 URL과 로그인 계정을 찾아드려요.<br>
            아래 버튼을 누르거나 <code>/</code>로 시작하는 명령을 입력해 보세요.<br>
            <span class="muted">지금 열린 화면을 설명하는 <b>화면 분석</b>은 확장 프로그램에서 쓸 수 있어요.</span></div>`
        : `<div class="bubble">안녕하세요! 👋 <b>화면 길잡이</b>예요.<br>
            지금 보는 화면이 뭔지, 원하는 작업은 어디로 가야 하는지, 어떤 계정을 쓰면 되는지 알려드려요.<br>
            <b>그냥 물어보세요.</b> 지금 열린 화면을 보고 답하고, 눌러야 할 곳을 화면에 표시해 드려요.<br>
            <span class="muted">예) "쇼핑 접속하고 싶어" · "이 화면 뭐야?" · "주문 조회하려면 어디로 가?"</span><br>
            <span class="muted">등록된 환경·계정은 아래 버튼으로 볼 수 있어요. (말로 묻기는 <code>/설정</code>에서 Gemini 키가 필요해요)</span></div>`;
    }

    const find = (word) => COMMANDS.find((c) => c.name === word || c.alias.includes(word.toLowerCase()));

    // 명령 실행 (caption이 있으면 AI가 이해한 내용을 위에 표시)
    async function dispatch(cmd, args, caption) {
      if (cmd.silent) { cmd.run(); return; }
      const body = addBot();
      let target = body;
      if (caption) {
        body.innerHTML = `<div class="ai-note">🤖 ${esc(caption)}</div><div class="ai-res"></div>`;
        target = body.querySelector(".ai-res");
      }
      await cmd.run(target, args);
      // 결과가 길 때 응답의 시작 부분이 보이도록 스크롤
      body.parentElement.scrollIntoView({ block: "start", behavior: "smooth" });
      input.focus({ preventScroll: true });   // 바로 다음 질문을 입력할 수 있게
    }

    // 자연어 처리: 기본은 "현재 화면 분석". 등록된 환경·계정 조회처럼 보일 때만 Gemini로 명령을 분류한다.
    const squash = (t) => t.replace(/\s+/g, "");
    const looksLikeLookup = (t) =>
      /계정|환경|목록|도움말|지워|지우|설정|진단/.test(t) ||
      aiCtx().projects.some((n) => squash(t).includes(squash(n)));

    async function natural(text) {
      if (!EnvGemini.getKey()) {
        addBot().innerHTML = `<div class="bubble">말로 묻으려면 Gemini 키가 필요해요. <code>/설정</code>에서 입력해 주세요.<br>
          키 없이는 <code>/</code>로 시작하는 명령을 쓸 수 있어요. (<code>/도움말</code>)</div>`;
        return;
      }
      const analysis = find("분석");
      // 조회처럼 보이지 않으면 분류 호출 없이 바로 화면 분석 (빠르고 호출도 한 번)
      if (!looksLikeLookup(text) || !getPage) { await dispatch(analysis, text); return; }

      const box = addBot();
      box.innerHTML = `<div class="bubble thinking">🤖 생각 중…</div>`;
      try {
        const r = await EnvGemini.translate(text, aiCtx());
        box.parentElement.remove();
        const cmd = find(r.command) || analysis;           // 알 수 없으면 분석이 기본
        const args = cmd === analysis && !r.args ? text : (r.args || "").trim();
        await dispatch(cmd, args, `/${cmd.name}${args ? " " + args : ""} (으)로 이해했어요`);
      } catch (e) {
        box.innerHTML = `<div class="bubble err">⚠️ Gemini 호출에 실패했어요: ${esc(e.message)}<br>
          <code>/진단</code>이나 <code>/설정</code>에서 키와 모델 이름을 확인해 보세요.</div>`;
      }
    }

    async function execute(text) {
      const t = text.trim();
      if (!t) return;
      addUser(t);
      if (!t.startsWith("/")) { await natural(t); return; }
      const [word, ...rest] = t.slice(1).split(/\s+/);
      const cmd = find(word);
      if (!cmd) {
        addBot().innerHTML = `<div class="bubble">알 수 없는 명령이에요: <code>/${esc(word)}</code><br><code>/도움말</code>을 입력해 보세요.</div>`;
        scroll(); return;
      }
      await dispatch(cmd, rest.join(" "));
    }

    // 퀵 메뉴 버튼
    const CHIP_ORDER = ["분석", "로그인", "환경", "설정", "진단", "도움말"];
    chips.innerHTML = COMMANDS.filter((c) => c.name !== "지우기" && c.name !== "분석")
      .sort((a, b) => CHIP_ORDER.indexOf(a.name) - CHIP_ORDER.indexOf(b.name))
      .map((c) => `<button type="button" data-cmd="${esc(c.name)}">${c.icon} ${esc(c.name)}</button>`).join("");
    chips.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-cmd]");
      if (!b) return;
      const cmd = find(b.dataset.cmd);
      if (cmd.arg && !cmd.argOptional) { input.value = "/" + cmd.name + " "; input.focus(); updateMenu(); }
      else execute("/" + cmd.name);
    });

    // 스크린샷 확대: 썸네일을 누르면 패널 위에 크게 보여준다 (이미지를 누르면 원본 크기 ↔ 맞춤, 바깥·Esc·닫기로 닫기)
    function closeLightbox() { const lb = document.getElementById("lightbox"); if (lb) lb.remove(); }
    function openLightbox(src) {
      closeLightbox();
      const lb = document.createElement("div");
      lb.id = "lightbox"; lb.className = "lb";
      lb.innerHTML = `<div class="lb-bar"><span>분석에 사용한 화면 · 이미지를 누르면 원본 크기</span><button type="button" data-lb-close>닫기 ✕</button></div>
        <div class="lb-body"><img src="${src}" alt="분석에 사용한 화면"></div>`;
      lb.addEventListener("click", (e) => {
        if (e.target.closest("[data-lb-close]") || e.target.classList.contains("lb-body")) closeLightbox();
        else if (e.target.tagName === "IMG") lb.classList.toggle("full");
      });
      document.body.appendChild(lb);
    }
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLightbox(); });

    feed.addEventListener("click", async (ev) => {
      const shotImg = ev.target.closest("img.shot");
      if (shotImg) { openLightbox(shotImg.src); return; }
      const pr = ev.target.closest("[data-plan-run]");
      if (pr && act) {
        const card = pr.closest(".plan"), out = card.querySelector(".plan-result"), p = plans.get(+pr.dataset.planRun);
        card.querySelectorAll("button").forEach((b) => (b.disabled = true));
        out.textContent = "실행 중…";
        try {
          const results = await act(p.actions, p.url);
          out.innerHTML = results.map((r, i) => `${r.ok ? "✅" : "⚠️"} ${i + 1}. ${esc(r.note)}`).join("<br>");
        } catch (e) { out.textContent = "⚠️ 실행하지 못했어요: " + e.message; }
        if (unhighlight) { try { await unhighlight(); } catch { /* 페이지가 이동한 경우 */ } }
        input.focus({ preventScroll: true });
        return;
      }
      const pc = ev.target.closest("[data-plan-cancel]");
      if (pc) {
        const card = pc.closest(".plan");
        card.querySelectorAll("button").forEach((b) => (b.disabled = true));
        card.querySelector(".plan-result").textContent = "취소했어요.";
        if (unhighlight) { try { await unhighlight(); } catch { /* 무시 */ } }
        return;
      }
      const nb = ev.target.closest("[data-nav]");
      if (nb && browserNav) { try { await browserNav(nb.dataset.nav); } catch { /* 이동할 기록이 없는 경우 */ } return; }
      const hb = ev.target.closest("[data-hl]");
      if (hb && highlight) { try { await highlight(hb.dataset.hl.split(",").map(Number), hlLabels.get(hb.dataset.hl) || []); } catch { /* 탭이 바뀐 경우 등 */ } return; }
      if (ev.target.closest("[data-hl-clear]") && unhighlight) { try { await unhighlight(); } catch { /* 무시 */ } return; }
      const sv = ev.target.closest("[data-save]");
      if (sv) {
        const card = sv.closest(".gem-settings"), out = card.querySelector(".gem-result");
        EnvGemini.save({ key: card.querySelector("[name=key]").value.trim(), model: card.querySelector("[name=model]").value.trim() });
        card.querySelector("[name=key]").value = "";
        out.textContent = "연결 테스트 중…";
        try { await EnvGemini.translate("도움말", aiCtx()); out.textContent = `✅ 연결 성공 (${EnvGemini.getModel()})`; }
        catch (e) { out.textContent = "❌ " + e.message; }
        return;
      }
      const b = ev.target.closest("[data-run]");
      if (b) execute(b.dataset.run);
    });

    // 슬래시 자동완성
    let items = [], active = 0;
    function updateMenu() {
      const v = input.value;
      if (!v.startsWith("/") || /\s/.test(v)) { menu.classList.add("hidden"); items = []; return; }
      const q = v.slice(1).toLowerCase();
      items = COMMANDS.filter((c) => c.name.startsWith(q) || c.alias.some((a) => a.startsWith(q)));
      if (!items.length) { menu.classList.add("hidden"); return; }
      active = Math.min(active, items.length - 1);
      menu.innerHTML = items.map((c, i) => `
        <div class="slash-item ${i === active ? "active" : ""}" data-i="${i}">
          <span class="s-name">${c.icon} /${esc(c.name)}${c.arg ? " <i>" + esc(c.arg) + "</i>" : ""}</span>
          <span class="s-desc">${esc(c.desc)}</span>
        </div>`).join("");
      menu.classList.remove("hidden");
    }
    function pick(c, complete) {
      menu.classList.add("hidden");
      if (c.arg && (complete || !c.argOptional)) { input.value = "/" + c.name + " "; input.focus(); }
      else { input.value = ""; execute("/" + c.name); }
    }
    menu.addEventListener("mousedown", (ev) => {
      const it = ev.target.closest("[data-i]");
      if (it) { ev.preventDefault(); pick(items[+it.dataset.i], false); }
    });
    input.addEventListener("input", () => { active = 0; updateMenu(); });
    input.addEventListener("keydown", (ev) => {
      if (ev.isComposing) return;               // 한글 조합 중 Enter 무시
      const open = !menu.classList.contains("hidden");
      if (open && ev.key === "ArrowDown") { ev.preventDefault(); active = (active + 1) % items.length; updateMenu(); }
      else if (open && ev.key === "ArrowUp") { ev.preventDefault(); active = (active - 1 + items.length) % items.length; updateMenu(); }
      else if (open && (ev.key === "Tab" || ev.key === "Enter")) {
        // 이미 명령 전체를 입력했으면 그대로 실행, 아니면 선택 항목으로 완성
        const exact = items.find((c) => input.value.slice(1) === c.name || c.alias.includes(input.value.slice(1).toLowerCase()));
        if (ev.key === "Enter" && exact) return;   // form submit으로 실행
        ev.preventDefault(); pick(items[active], ev.key === "Tab");
      } else if (open && ev.key === "Escape") menu.classList.add("hidden");
    });
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const v = input.value;
      input.value = ""; menu.classList.add("hidden");
      execute(v);
    });

    greet();
    input.focus();
  }

  // 헤더의 "현재 사이트" 상태 표시 (탭이 바뀔 때마다 갱신)
  function setStatus(url) {
    const el = $("status");
    if (!url) { el.className = "status none"; el.textContent = "사이트 미지정 — /로그인 으로 주소를 지정하세요"; return; }
    const { kind, entries } = EnvMatch.lookup(url || "");
    if (kind === "env") {
      const e = entries[0];
      el.className = "status " + e.type;
      el.innerHTML = `<span class="badge ${e.type}">${esc(EnvMatch.ENV_LABEL[e.type])}</span> ${esc(e.project)}`;
    } else if (kind === "prod") {
      el.className = "status prod"; el.textContent = "⛔ 운영 환경 (미지원)";
    } else {
      el.className = "status none"; el.textContent = "등록되지 않은 사이트";
    }
  }

  window.EnvChat = { mount, setStatus };
})();
