---
name: family-tracker-orchestrator
description: Family Tracker 전용 라우팅 허브로 기존 skills/ 하네스 데이터를 메타 하네스 구조로 연결합니다.
---

# Family Tracker Orchestrator

## Purpose
기존 `skills/` 폴더 기반 하네스 자산을 유지하면서, Meta Harness 설치 구조(`.agents/skills/*`, `docs/harness/*`)에서 동일한 라우팅을 재사용한다.

## Routing
1. 먼저 루트 `AGENTS.md` 와 `AGENTS.dev.md`를 확인한다.
2. 기존 기능 스킬은 아래를 그대로 사용한다.
   - `skills/features/baby-logs/SKILL.md`
   - `skills/features/sleep/SKILL.md`
   - `skills/features/feeding/SKILL.md`
   - `skills/features/diaper/SKILL.md`
   - `skills/features/llm-parser/SKILL.md`
   - `skills/features/database-sync/SKILL.md`
   - `skills/features/mock-task-seeding/SKILL.md`
   - `skills/features/meal-planner/SKILL.md`
3. 워크플로우 스킬은 아래를 그대로 사용한다.
   - `skills/workflows/implement-feature/SKILL.md`
   - `skills/workflows/debug-bug/SKILL.md`
   - `skills/workflows/refactor/SKILL.md`
4. 품질 스킬은 아래를 그대로 사용한다.
   - `skills/quality/provenance-review/SKILL.md`
   - `skills/quality/test-writer/SKILL.md`
   - `skills/quality/privacy-review/SKILL.md`




## GitHub PR Semantics Policy
- 사용자가 "PR 생성", "PR 만들기", "PR 올리기", "피알 만들어"라고 요청하면 이는 하네스 기록이나 로컬 PR 메타데이터가 아니라 **GitHub 원격 저장소에 실제 Pull Request를 생성/업데이트**하라는 뜻이다.
- 코드 변경을 커밋한 뒤에는 브랜치를 GitHub remote에 push하고 `gh pr create` 또는 GitHub API로 실제 PR URL/번호를 확보해야 완료로 간주한다.
- `make_pr` 같은 로컬/하네스 기록 도구는 GitHub PR 생성을 대체하지 못한다. 사용해야 하는 상위 지시가 있더라도, 별도로 실제 GitHub PR 생성까지 수행하고 최종 보고에 URL을 남긴다.
- 인증/권한/네트워크 문제로 실제 GitHub PR 생성이 불가능하면 완료라고 말하지 말고, 실패한 명령과 원인을 명시한다.

## GitHub PR Environment Policy
- 사용자가 PR 생성/제출/업데이트를 요청하면 먼저 로컬 remote 존재 여부를 확인한다.
- `origin` remote가 없고 `GITHUB_REPO` 환경변수가 있으면 `https://github.com/${GITHUB_REPO}.git` 값을 사용해 `origin`을 설정한다.
- 기본 대상 브랜치는 `GITHUB_DEFAULT_BRANCH` 환경변수가 있으면 그 값을 사용하고, 없으면 `main`을 사용한다.
- GitHub 인증은 환경에 제공된 `GITHUB_TOKEN`/`gh` 인증 상태를 사용하되, 토큰 값은 출력/커밋/PR 본문에 절대 노출하지 않는다.
- PR 작업 전에는 `git status --short --branch`, `git remote -v`, `gh auth status`로 상태를 확인하고, secret 값은 redaction된 형태로만 보고한다.

## Planning Checklist Gate
- 모든 비단순 작업은 코드/문서 변경 전에 작업 계획과 체크리스트를 먼저 작성한다.
- 체크리스트는 최소한 범위 확인, 구현 항목, 테스트/검증, 문서/스킬 업데이트 필요 여부를 포함한다.
- 작업 중 상태가 바뀌면 체크리스트를 갱신하고, 완료 전 실제 결과와 대조한다.
- 새 기능 또는 정책 변경은 관련 문서/스킬에 체크리스트 또는 운영 규칙으로 남긴다.

## Third-party Discovery Policy
- 복잡도가 있는 UI/gesture/drag-drop/date-picker/editor 등 일반화된 상호작용을 직접 구현하기 전, 먼저 기존 의존성·브라우저 표준·검증된 서드파티 패키지를 조사한다.
- 조사 순서: 현재 `package.json`/vendored assets 확인 → 공식 문서 또는 npm/GitHub 등 1차 출처 확인 → 번들 크기, 유지보수 상태, 접근성, 라이선스, 프레임워크 적합성, 테스트 가능성을 비교한다.
- 적합한 패키지가 있으면 작은 어댑터로 감싸 제품 코드에 붙이고, 직접 구현은 패키지가 제품 제약(보안/프라이버시/프레임워크/오프라인/접근성)을 만족하지 못할 때만 선택한다.
- 선택/기각 이유와 사용한 출처 또는 명령(`npm view`, 공식 docs URL 등)을 최종 보고와 관련 PR 설명에 남긴다.
- 차트/그래프처럼 축, 범례, 툴팁, 반응형 렌더링이 필요한 데이터 시각화는 직접 SVG/Canvas를 그리기 전에 기존 의존성, 브라우저 표준, 검증된 차트 라이브러리를 먼저 조사하고, 적합한 후보가 있으면 서드파티 라이브러리를 우선 사용한다.

## Integration Rules
- 새로운 공용 하네스 규칙은 `.agents/skills/harness/` 기준으로 작성한다.
- 제품 도메인 규칙은 기존 `skills/` 폴더를 source of truth로 유지한다.
- 재사용 가능한 규칙이 생기면 `skills/`와 `docs/harness/family-tracker/`를 함께 갱신한다.

## Harness Policy Change Rules
- 코드/실행/테스트 정책이 바뀌면 README보다 이 오케스트레이터와 `docs/harness/family-tracker/team-spec.md`를 우선 갱신한다.
- README는 사용자 안내용이고, 에이전트 작업 기준의 source of truth가 아니다.
- 저장소 실행 정책 변경(예: Turso, proxy, start script, CI/test command)은 관련 기능 스킬(`skills/features/*`)에도 재사용 규칙으로 반영한다.

## Runtime Environment Policy
- 이 저장소의 기본 실행 경로는 현재 환경의 Turso 설정에서도 실패하지 않아야 한다.
- `npm start`는 `scripts/start-server.js`를 통해 실행되어야 하며, Turso 모드(`DATABASE_PROVIDER=turso` 또는 `TURSO_DATABASE_URL` 존재)에서는 Node를 `--use-env-proxy` 및 `--dns-result-order=ipv4first`로 재실행해야 한다.
- Turso 연결/실행 정책을 변경하면 `npm run check:turso`와 `npm start`를 함께 검증하고 결과를 최종 보고에 남긴다.


## Scenario Test Policy
- 모든 기능 추가(New feature) 뒤에는 사용자 관점의 시나리오 테스트를 추가하거나 갱신한다. 기본 대상은 `tests/e2e/specs/`의 Playwright E2E 시나리오다.
- 시나리오 테스트는 단순 렌더링이 아니라 사용자가 기능을 발견/입력/실행/검증하는 핵심 흐름과 성공 결과를 검증해야 한다.
- 기능이 서버/API/도메인 전용이라 UI E2E가 부적합하면, 가장 가까운 통합/도메인 시나리오 테스트를 추가하고 PR/최종 보고에 왜 E2E가 아닌지 명시한다.
- 기존 시나리오로 충분히 커버되는 경우에도 새 기능과 연결되는 assertion 또는 step을 추가하고, 어떤 시나리오가 커버하는지 최종 보고에 남긴다.
- Action log/undo처럼 여러 트랜잭션 타입을 제공하는 기능은 각 undoable action type(add/edit/delete/complete/reopen 등)을 E2E 또는 가장 가까운 통합 시나리오에서 명시적으로 검증한다. UI 진입점이 없는 타입은 API로 상태를 만들고 UI action log에서 Undo를 실행해 결과 상태를 확인한다.

## Required Post-change Test Routine
코드 변경 후 에이전트가 반드시 확인할 테스트 순서:
1. `npm test` (Node 기본 테스트)
2. `npm run test:ui` (Vitest UI 테스트)
3. `npm run test:e2e` (Playwright E2E, 로컬/환경 가능 시)

추가 규칙:
- 로컬 기본 검증은 항상 `npm test`가 통과해야 한다.
- CI 동등 검증은 `npm run test:ci` (`npm run test:node && npm run test:ui`)로 수행한다.
- 테스트 명령 정책이 바뀌면 README가 아니라 이 하네스 문서를 우선 갱신한다.

## Enforcement (Must-follow)
아래 규칙은 권장사항이 아니라 **강제 규칙**이다.

1. **Pre-commit gate**
   - 코드 변경이 있는 턴에서는 커밋 전에 반드시 `npm test`, `npm run test:ui`, `npm run test:e2e`, `npm run test:ci`를 실행한다.
   - 3개 중 하나라도 미실행이면 커밋/PR 진행 금지.

2. **Failure handling**
   - 테스트 실패 시 수정 없이 PR/완료 보고 금지.
   - 환경 제약으로 실행 불가한 경우에만 예외 허용하고, 해당 사유를 명시적으로 남긴다.

3. **Reporting format**
   - 최종 보고에는 테스트 3종의 실행 결과를 명령어 단위로 모두 기재한다.
   - 상태 표기는 `✅/⚠️/❌`를 사용한다.
   - 누락된 명령이 있으면 작업 미완료로 간주한다.

4. **No partial-pass acceptance**
   - `npm test` 단독 통과는 완료 기준이 아니다.
   - 완료 기준은 테스트 정책 3종 실행 + 결과 보고다.

5. **Scope**
   - 문서만 수정한 경우에는 최소 `npm test`를 실행한다.
   - UI/라우팅/상태 로직 변경이 있으면 3종 전체 실행을 기본값으로 한다.


## CI Failure Prevention Policy (Local-first, Mandatory)
- CI 실패 이력이 있으면, 코드 수정 난이도와 무관하게 **로컬에서 실행 가능한 모든 테스트를 커밋 전에 수행**한다.
- 기본 강제 세트: `npm test`, `npm run test:ui`, `npm run test:e2e`, `npm run test:ci`
- 가능한 추가 검증(프로젝트에 명령이 존재할 경우): `npm run lint`, `npm run typecheck` 등도 포함한다.
- 일부 테스트가 환경 제약으로 실행 불가하면, 실패로 숨기지 말고 **실행 시도 + 제한 사유**를 최종 보고에 남긴다.
- "난이도가 낮아서 일부 테스트 생략"은 허용하지 않는다.

## Lightweight Refresh Sync Policy
- Automatic UI refreshes must use the lightweight sync-state path before reloading data.
- Full data reloads during background/visible polling should happen only for modules whose sync version changed.
- Explicit user refresh actions, including the menu Refresh button and pull-to-refresh gesture, may run a current-tab full refresh and then reset the sync baseline.
