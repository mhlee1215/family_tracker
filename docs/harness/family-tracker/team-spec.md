# Family Tracker Harness Team Spec

## Objective
Family Tracker 저장소에서 Meta Harness 기본 설치본과 기존 프로젝트 스킬 자산을 함께 운영한다.

## Roles
- **Orchestrator**: `.agents/skills/family-tracker-orchestrator/SKILL.md`를 통해 작업 라우팅.
- **Feature Specialist**: `skills/features/*`에서 도메인별 구현 규칙 적용.
- **Workflow Specialist**: `skills/workflows/*`에서 작업 유형별 절차 적용.
- **Quality Reviewer**: `skills/quality/*`에서 테스트/개인정보/출처 검증 적용.

## Artifacts
- 글로벌 하네스: `.agents/skills/harness/`
- 코덱스 미러: `.codex/skills/harness/`
- 제품 라우팅: `.agents/skills/family-tracker-orchestrator/SKILL.md`
- 기존 제품 스킬: `skills/`

## Validation Gate (PR 전 필수)
- 코드 변경이 있으면 로컬에서 아래를 모두 통과해야 한다.
  - `npm test`
  - `npm run test:ui`
  - `npm run test:e2e`
  - `npm run test:ci`

## Policy Source of Truth
- 에이전트 작업 정책과 반복 가능한 실행/검증 규칙은 README가 아니라 `.agents/skills/family-tracker-orchestrator/SKILL.md`와 이 팀 스펙을 우선 source of truth로 삼는다.
- README는 사용자/운영자 안내가 필요할 때만 보조로 갱신한다.
- 코드 변경 과정에서 새 정책이나 실패 방지 규칙이 생기면 같은 변경 안에서 하네스 오케스트레이션 문서에 반영한다.

## Runtime Policy
- 기본 `npm start` 경로는 Turso 환경 변수(`DATABASE_PROVIDER=turso`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`)가 있는 개발 컨테이너에서도 동작해야 한다.
- Turso 모드의 서버 시작은 `scripts/start-server.js`를 사용해 proxy-aware Node 실행(`--use-env-proxy`, `--dns-result-order=ipv4first`)을 보장한다.
- Turso 런타임/스토리지 경로를 건드린 경우 `npm run check:turso`와 `npm start` 성공 여부를 확인한다.
