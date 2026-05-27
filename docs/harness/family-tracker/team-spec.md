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
