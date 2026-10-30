// Snapshot-only validation. Live visibility and element identity belong to the caller.
(function () {
  'use strict';

  const list = value => Array.isArray(value) ? value : [];
  const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const normalize = value => clean(value).toLowerCase();

  function entries(page) {
    const result = [];
    const add = (source, kind, hasPassword) => {
      for (const entry of list(source)) {
        if (!entry || !Number.isInteger(entry.id)) continue;
        const label = clean(entry.label) || clean(entry.t) || (kind === 'field' ? clean(entry.name) : '');
        const item = { kind, label };
        if(entry.ambiguous)item.ambiguous=true;
        if(entry.disabled)item.disabled=true;
        const href = entry.href ?? entry.h;
        if (kind === 'link' && typeof href === 'string') item.href = href;
        if (typeof entry.type === 'string') item.type = normalize(entry.type);
        if (kind === 'field') item.hasPassword = hasPassword;
        result.push({ id: entry.id, item });
      }
    };
    add(page?.nav, 'link');
    add(page?.links, 'link');
    add(page?.buttons, 'button');
    for (const form of list(page?.forms)) {
      const fields = list(form?.fields);
      add(fields, 'field', form?.hasPassword === true || fields.some(field => normalize(field?.type) === 'password'));
    }
    return result;
  }

  function index(page) {
    const result = new Map();
    const duplicateIds = new Set();
    for (const { id, item } of entries(page)) {
      if (result.has(id)) duplicateIds.add(id);
      result.set(id, item);
    }
    // A Map cannot represent ambiguous IDs: omit them rather than choose a winner.
    for (const id of duplicateIds) result.delete(id);
    return result;
  }

  function resolve(candidate, page) {
    if (!Number.isInteger(candidate?.id)) return { ok: false, why: '대상 ID는 정수여야 합니다.' };
    const target = normalize(candidate.target);
    if (!target) return { ok: false, why: '확인할 대상 이름이 비어 있습니다.' };
    const all = entries(page);
    const matches = all.filter(entry => entry.id === candidate.id);
    if (!matches.length) return { ok: false, why: '현재 화면 정보에 해당 ID가 없습니다.' };
    if (matches.length !== 1) return { ok: false, why: '같은 ID가 여러 개라 대상을 구분할 수 없습니다.' };
    const item = matches[0].item;
    if(item.ambiguous)return {ok:false,why:'같은 이름의 실제 화면 요소가 여러 개라 정확히 구분할 수 없습니다.'};
    if(item.disabled)return {ok:false,why:'현재 비활성 상태인 대상입니다.'};
    if (normalize(item.label) !== target) return { ok: false, why: '대상 ID와 전체 이름이 일치하지 않습니다.' };
    if (all.filter(entry => normalize(entry.item.label) === target).length !== 1) {
      return { ok: false, why: '같은 이름의 대상이 여러 개라 정확히 구분할 수 없습니다.' };
    }
    return { ok: true, item };
  }

  function navigationIntent(question) {
    const text = normalize(question);
    if (!text || /요약|번역|summari[sz]e|summary|translat/.test(text)) return false;
    if (/어디|위치|찾아|찾는|찾으|이동|접근|들어가|들어가는|누르|눌러|클릭|where\b|locate\b|navigate\b/.test(text)) return true;
    if (/작동|동작|원리|how\s+.*works?\b/.test(text)) return false;
    return /어떻게|방법|how\s+(?:to|do i|can i)\b/.test(text);
  }

  function guidance(steps, page, answer, question, { readOnly = false } = {}) {
    if (readOnly || !navigationIntent(question)) return [];
    const text = normalize(answer);
    if (!text) return [];
    const fieldsOnly = /검색창|입력칸|입력창|입력 필드|search\s+(?:field|box)|input\s+field/i.test(clean(question))
      && /어디|위치|where\b|locate\b/i.test(clean(question));
    const verified = [], seen = new Set();
    for (const candidate of list(steps)) {
      const resolved = resolve(candidate, page);
      if (!resolved.ok || seen.has(candidate.id)) continue;
      const { item } = resolved;
      if (fieldsOnly && item.kind !== 'field') continue;
      if (!text.includes(normalize(item.label))) continue;
      verified.push({ id: candidate.id, target: item.label, label: item.label });
      seen.add(candidate.id);
      if (verified.length === 2) break;
    }
    return verified;
  }

  window.EnvTargets = { index, resolve, guidance };
})();
