// 화면과 무관한 매칭 로직 (페이지와 백그라운드 서비스 워커가 함께 사용)
(function () {
  const PACKS = self.ENV_PACKS || [];
  const ENV_LABEL = { dev: "로컬·개발", test: "시험 서버" };

  const hostOf = (u) => { try { return new URL(u).host; } catch { return null; } };

  // 운영 도메인 판별 (어떤 팩이든 하나라도 걸리면 운영으로 간주)
  const isProd = (host) => PACKS.some((p) => (p.prodPatterns || []).some((r) => new RegExp(r).test(host)));

  // 팩 → 평탄화 + 검증 (운영 URL은 거부)
  const rejected = [];
  const ENTRIES = [];
  for (const p of PACKS) {
    for (const e of p.envs) {
      const host = hostOf(e.url);
      if (!host || isProd(host)) { rejected.push(e.url); continue; }
      ENTRIES.push({ project: p.project, type: e.type, url: e.url, host, accounts: e.accounts });
    }
  }

  // URL → { kind: "prod" | "env" | "none", entries }
  function lookup(url) {
    const host = hostOf(url);
    if (!host) return { kind: "none", entries: [] };
    if (isProd(host)) return { kind: "prod", entries: [] };
    const entries = ENTRIES.filter((e) => e.host === host);
    return { kind: entries.length ? "env" : "none", entries };
  }

  self.EnvMatch = { ENV_LABEL, ENTRIES, rejected, isProd, hostOf, lookup };
})();
