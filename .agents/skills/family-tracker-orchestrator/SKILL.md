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

## Harness Policy Change Rules
- 코드/실행/테스트 정책이 바뀌면 README보다 이 오케스트레이터와 `docs/harness/family-tracker/team-spec.md`를 우선 갱신한다.
- README는 사용자 안내용이고, 에이전트 작업 기준의 source of truth가 아니다.
- 저장소 실행 정책 변경(예: Turso, proxy, start script, CI/test command)은 관련 기능 스킬(`skills/features/*`)에도 재사용 규칙으로 반영한다.

## Runtime Environment Policy
- 이 저장소의 기본 실행 경로는 현재 환경의 Turso 설정에서도 실패하지 않아야 한다.
- `npm start`는 `scripts/start-server.js`를 통해 실행되어야 하며, Turso 모드(`DATABASE_PROVIDER=turso` 또는 `TURSO_DATABASE_URL` 존재)에서는 Node를 `--use-env-proxy` 및 `--dns-result-order=ipv4first`로 재실행해야 한다.
- Turso 연결/실행 정책을 변경하면 `npm run check:turso`와 `npm start`를 함께 검증하고 결과를 최종 보고에 남긴다.

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
