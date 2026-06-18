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




## GitHub PR Semantics Gate
- PR 생성/제출/업데이트 요청의 완료 기준은 GitHub 원격 저장소에 실제 Pull Request가 생성되거나 업데이트되어 URL/번호가 확인되는 것이다.
- 하네스 기록, 로컬 메타데이터, `make_pr` 도구 호출은 실제 GitHub PR의 대체물이 아니며, 필요한 경우에도 GitHub PR 생성과 별도로만 취급한다.
- PR 작업은 커밋 이후 브랜치 push와 `gh pr create` 또는 GitHub API 호출까지 포함한다. 실패하면 실패 상태로 보고하고 완료 처리하지 않는다.
- PR 생성/업데이트 전에 최신 `origin/main`을 fetch하고 작업 브랜치를 rebase해야 한다. 충돌 또는 rebase 실패가 있으면 완료 처리하지 않고 원인과 남은 작업을 보고한다.

## GitHub Auto-Merge Gate
- PR 생성 후에는 사용자가 명시적으로 막지 않는 한 GitHub auto-merge를 예약해야 하며, auto-merge 예약까지 완료되어야 PR 생성/업데이트 작업을 완료로 본다.
- auto-merge 예약 전에는 작업 브랜치가 최신 `origin/main` 위에 rebase되어 있어야 한다.
- GitHub CLI를 사용할 수 있으면 `gh pr merge <PR번호> --auto --squash`를 실행한다. `gh`가 없거나 사용할 수 없으면 GitHub API/MCP의 auto-merge enable 기능을 사용한다.
- auto-merge 예약 전에는 `main` 브랜치 보호 또는 ruleset required checks가 적용되어 있는지 확인한다. required check가 없으면 `--auto`가 즉시 머지할 수 있으므로 사용자에게 설정 누락 가능성을 보고하고 확인한다.
- auto-merge 실행 후 `gh pr view --json state,mergeStateStatus,autoMergeRequest,statusCheckRollup,url`로 상태를 확인한다.
- GitHub API/MCP를 사용한 경우에도 PR metadata, merge state, check rollup/status, 또는 auto-merge 요청 상태를 다시 조회해 예약 여부를 검증한다.
- 정상적인 CI-gated auto-merge 상태는 PR이 `OPEN`으로 남고 `autoMergeRequest`가 존재하며 required check가 pending/running인 상태다.
- 최종 보고에는 PR URL, auto-merge 예약 여부, required checks의 현재 상태를 포함한다.

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
- 차트/그래프 등 데이터 시각화는 축/범례/툴팁/반응형 처리가 포함되므로 직접 SVG/Canvas를 그리기 전에 검증된 차트 라이브러리를 먼저 조사하고, 적합한 후보가 있으면 라이브러리를 우선 채택한다.


## Scenario Test Gate
- 모든 기능 추가는 PR 전에 사용자 흐름 기반 시나리오 테스트를 포함해야 한다. 기본 위치는 `tests/e2e/specs/` Playwright 테스트다.
- 시나리오는 최소한 기능 진입점, 주요 사용자 액션, 성공 상태/데이터 반영을 검증한다.
- UI가 없는 기능은 E2E 대신 통합/도메인 시나리오 테스트를 추가하고, 대체한 이유와 커버한 흐름을 PR 설명에 적는다.
- 새 시나리오를 만들지 않고 기존 시나리오를 확장한 경우, 확장된 assertion/step을 PR 설명과 최종 보고에 명시한다.
- Action log/undo 기능은 undo 가능한 각 트랜잭션 타입(add/edit/delete/complete/reopen 등)을 시나리오 테스트에 포함한다. 직접 UI 편집 진입점이 없는 타입은 API로 상태를 준비한 뒤 UI action log에서 Undo를 실행하고 데이터 반영을 검증한다.

## Dev/Test Account Isolation Policy
- 수동 로컬 개발은 `/api/auth/dev`의 `id=admin-dev`를 사용하며 `family-admin-dev`에 저장한다.
- 자동화 테스트는 `/api/auth/dev`의 `id=admin-test`를 사용하며 `family-admin-test`에 저장한다.
- 레거시 `admin` dev login ID는 테스트/개발 데이터 혼합을 막기 위해 다시 허용하지 않는다.

## Validation Gate (PR 전 필수)
- 코드 변경이 있으면 로컬에서 아래를 모두 통과해야 한다.
  - `npm test`
  - `npm run test:ui`
  - `npm run test:e2e`
  - `npm run test:ci`
- 에이전트 주도 E2E/브라우저 검증은 별도 지시가 없으면 production 환경 기준으로 관련 시나리오/스모크 테스트를 우선 실행한다. pre-merge 브랜치 검증은 로컬 브랜치 앱을 production env/backend로 띄우고, post-merge/current smoke는 production URL(`https://family-tracker-fex9.onrender.com/`)을 사용한다.
- production 환경 검증에서는 실제 사용자 데이터에 영향을 줄 수 있는 destructive 전체 E2E를 임의로 실행하지 않는다. 필요한 경우 `admin-test` 격리 계정이나 API route mock이 적용된 안전한 시나리오로 제한한다.

## Policy Source of Truth
- 에이전트 작업 정책과 반복 가능한 실행/검증 규칙은 README가 아니라 `.agents/skills/family-tracker-orchestrator/SKILL.md`와 이 팀 스펙을 우선 source of truth로 삼는다.
- README는 사용자/운영자 안내가 필요할 때만 보조로 갱신한다.
- 코드 변경 과정에서 새 정책이나 실패 방지 규칙이 생기면 같은 변경 안에서 하네스 오케스트레이션 문서에 반영한다.

## Runtime Policy
- 기본 `npm start` 경로는 Turso 환경 변수(`DATABASE_PROVIDER=turso`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`)가 있는 개발 컨테이너에서도 동작해야 한다.
- Turso 모드의 서버 시작은 `scripts/start-server.js`를 사용해 proxy-aware Node 실행(`--use-env-proxy`, `--dns-result-order=ipv4first`)을 보장한다.
- Turso 런타임/스토리지 경로를 건드린 경우 `npm run check:turso`와 `npm start` 성공 여부를 확인한다.
- Cloudflare Pages 런타임은 `wrangler.toml`, `functions/api/[[path]].js`, `src/server/api/handler.js`를 기준으로 검증한다.
- Cloudflare Pages 배포는 Turso 전용이며, SQLite는 Node 로컬 개발/테스트 백엔드로만 유지한다.
- Pages 로컬 검증은 `.dev.vars`에 Turso/secret 값을 두고 `npm run pages:dev`로 수행한다. `.dev.vars`는 커밋하지 않는다.
- Cloudflare scheduled/background runtime은 Pages와 분리된 Worker config(`wrangler.notifications.toml`)로 검증하며, Web Push 발송은 `web-push`의 request 생성과 Worker `fetch()` 조합을 유지한다.

## Lightweight Refresh Sync Policy
- Automatic refresh behavior must poll a small sync-state endpoint first and avoid full data reloads unless a module version changed.
- Sync-state checks must preserve family/baby scoping and avoid returning record payloads.
- User-initiated Refresh and pull-to-refresh gestures are allowed to perform current-tab full refreshes.
