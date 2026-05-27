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

## Integration Rules
- 새로운 공용 하네스 규칙은 `.agents/skills/harness/` 기준으로 작성한다.
- 제품 도메인 규칙은 기존 `skills/` 폴더를 source of truth로 유지한다.
- 재사용 가능한 규칙이 생기면 `skills/`와 `docs/harness/family-tracker/`를 함께 갱신한다.


## Required Post-change Test Routine
코드 변경 후 에이전트가 반드시 확인할 테스트 순서:
1. `npm test` (Node 기본 테스트)
2. `npm run test:ui` (Vitest UI 테스트)
3. `npm run test:e2e` (Playwright E2E, 로컬/환경 가능 시)

추가 규칙:
- 로컬 기본 검증은 항상 `npm test`가 통과해야 한다.
- CI 동등 검증은 `npm run test:ci` (`npm run test:node && npm run test:ui`)로 수행한다.
- 테스트 명령 정책이 바뀌면 README가 아니라 이 하네스 문서를 우선 갱신한다.
