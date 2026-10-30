# Assistant 0.7.0 implementation plan

**Goal:** Stream answers and continue a requested task after navigation, with a fresh user-confirmed plan for every execution.

**Architecture:** Keep the existing MV3/Gemini/plain-JavaScript structure. Decode SSE responses incrementally, displaying only the JSON answer string until the complete response validates. Store the original task, originating tab, and fresh page snapshot in each in-memory plan; after execution offer a button to re-read the same tab and propose the next step. Never automatically execute model output.

**Constraints:** Preserve environment blocking, action vetting, stop controls, local text-only history, and no real API calls in tests. Do not modify untracked .agents, .codex, AGENTS.md or local-config. Preserve original CRLF on existing files.

## Task 1: streamed answers
- [x] Add failing tests for SSE split across byte boundaries, partial escaped JSON strings, provider errors and aborts.
- [x] Implement SSE consumption and partial answer decoding in shared/gemini.js; translate remains non-streaming. Complete JSON is required before exposing actions.
- [x] Render partial answers in shared/chat.js; no partial persistence or executable plans. Extend browser API fixture to stream delayed chunks and prove visible output precedes completion.

## Task 2: task continuation
- [x] Extend plan state with the user's original task and tab identity.
- [x] Add a post-execution '결과 확인 · 다음 단계' control. Re-read only the same active tab, forbid stale restored controls, and carry original user text through action vetting.
- [x] Pin capture/highlights to the analyzed tab and reject navigation/tab changes during analysis. Report click/Enter navigation as a boundary, not full task completion.
- [x] Test changed tab, navigation, blocked operations and continuation plans. Keep every subsequent execution user-confirmed.

## Task 3: release
- [x] Run npm test, browser integration tests and syntax checks.
- [x] Obtain an independent code review and resolve important findings.
- [x] Update README, capture preview, bump 0.7.0 and commit/push only task files.

**Review focus:** truncated streams cannot create plans; abort cannot persist partial answers; UTF-8 and escaped strings must survive split chunks; switching tabs must never read or execute the wrong task; Enter/navigation must stop the current batch.

Verification: 18 unit tests and both Chrome UI suites passed using local fixtures only. Independent review findings (capture switch-away-and-back; classifier intent rewriting) were reproduced and fixed. Installed-extension and live Gemini integration remain unverified.
