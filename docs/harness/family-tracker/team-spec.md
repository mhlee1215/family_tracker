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




## GitHub PR Environment Gate
- PR 생성/제출/업데이트 요청은 환경변수 기반 GitHub 설정을 우선 사용한다.
- `origin` remote가 비어 있으면 `GITHUB_REPO`를 읽어 `https://github.com/${GITHUB_REPO}.git` remote를 설정한다.
- PR base는 `GITHUB_DEFAULT_BRANCH`가 있으면 해당 값을, 없으면 `main`을 사용한다.
- `GITHUB_TOKEN` 또는 GitHub CLI 인증은 작업에 사용할 수 있지만, 토큰/secret 원문은 터미널 출력, 문서, 커밋, PR 설명에 남기지 않는다.
- PR 전에 remote, branch, authentication, working tree 상태를 확인하고 필요한 push/PR 작업을 이어간다.

## Planning Checklist Gate
- 모든 비단순 작업은 코드/문서 변경 전에 작업 계획과 체크리스트를 먼저 작성한다.
- 체크리스트는 최소한 범위 확인, 구현 항목, 테스트/검증, 문서/스킬 업데이트 필요 여부를 포함한다.
- 작업 중 상태가 바뀌면 체크리스트를 갱신하고, 완료 전 실제 결과와 대조한다.
- 새 기능 또는 정책 변경은 관련 문서/스킬에 체크리스트 또는 운영 규칙으로 남긴다.

## Third-party Discovery Gate
- 구현 난이도가 높은 범용 상호작용(예: swipe actions, drag/drop, rich editor, date picker)은 직접 구현하기 전에 기존 의존성, 브라우저 표준, 검증된 서드파티 패키지를 먼저 조사한다.
- 후보 평가는 공식 문서/npm/GitHub 같은 1차 출처를 우선하고, 라이선스·유지보수 상태·번들 영향·프레임워크 적합성·접근성·테스트 가능성을 함께 본다.
- 적합한 후보가 있으면 제품 코드에는 얇은 어댑터와 스타일만 남기고 제스처/복잡 상태 처리는 패키지에 위임한다. 직접 구현을 선택하면 왜 서드파티를 쓰지 않았는지 기록한다.
- PR 전 보고에는 선택한 패키지나 기각한 후보, 확인 명령/출처, 변경된 dependency/vendor asset을 명시한다.


## Scenario Test Gate
- 모든 기능 추가는 PR 전에 사용자 흐름 기반 시나리오 테스트를 포함해야 한다. 기본 위치는 `tests/e2e/specs/` Playwright 테스트다.
- 시나리오는 최소한 기능 진입점, 주요 사용자 액션, 성공 상태/데이터 반영을 검증한다.
- UI가 없는 기능은 E2E 대신 통합/도메인 시나리오 테스트를 추가하고, 대체한 이유와 커버한 흐름을 PR 설명에 적는다.
- 새 시나리오를 만들지 않고 기존 시나리오를 확장한 경우, 확장된 assertion/step을 PR 설명과 최종 보고에 명시한다.

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
