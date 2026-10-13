# CLAUDE.md

## 코드 탐색은 graft 우선

이 레포는 graft로 색인되어 있다. 코드를 찾거나 이해하거나 수정하기 전에는 Read/Grep/Glob보다 graft를 먼저 사용한다.

- 어디 있는지/어떻게 동작하는지 모를 때: `graft ask "<질문>" --source`
- 모든 사용처가 필요할 때: `graft grep "<문자열>"`
- 파일 구조만 볼 때: `graft skeleton <파일>`
- 변경 전 영향 범위: `graft callers <심볼>`
- 정확한 파일·위치를 이미 알고 편집만 할 때는 Read를 써도 된다.
