# Product Orchestrator Skill

## When to use
Any non-trivial product/code change.

## Steps
1. Identify feature area.
2. Identify workflow type.
3. For complex generalized UI/interaction/infrastructure behavior, run third-party discovery before custom implementation.
4. Load relevant feature skill.
5. Load relevant workflow skill.
6. Load relevant quality skill.
7. Make change.
8. Add or update a user-flow scenario test for any new feature.
9. Run required checks.
10. Update docs/skills if reusable knowledge changed.
11. Before final response after any code change, complete PR workflow or explicitly report the blocker: commit intended changes, push the branch, create a new PR or update the existing PR, and include the PR URL in the final response.

## Scenario testing
- Every new feature must add or update a scenario test that exercises the user-visible flow, preferably in `tests/e2e/specs/` with Playwright.
- The scenario should cover entry point, primary action, and success state/data reflection.
- If UI E2E is not appropriate, add the closest integration/domain scenario test and document the reason.

## Third-party discovery
- Before hand-rolling complex generic behavior (gesture/swipe actions, drag/drop, date pickers, rich editors, routing helpers, etc.), check existing dependencies, browser-native capabilities, and reputable third-party packages first.
- Prefer official docs/npm/GitHub primary sources, then compare license, maintenance, bundle/runtime impact, accessibility, framework fit, and testability.
- Use a thin adapter around the selected package when it fits; document why a custom implementation is still needed if no package fits.

## Feature routing
- Baby log creation/history/general event flow -> `skills/features/baby-logs/SKILL.md`
- Baby growth measurements/history/summary -> `skills/features/growth/SKILL.md`
- Sleep start/end/session linking -> `skills/features/sleep/SKILL.md`
- Milk/solid feeding -> `skills/features/feeding/SKILL.md`
- Diaper wet/dirty/mixed parsing -> `skills/features/diaper/SKILL.md`
- Natural language parsing/LLM contract -> `skills/features/llm-parser/SKILL.md`
- SQLite/Turso/storage/sync -> `skills/features/database-sync/SKILL.md`
- Demo/mock task data seeding -> `skills/features/mock-task-seeding/SKILL.md`
- Meal planning/navigation/local meal state -> `skills/features/meal-planner/SKILL.md`

## Workflow routing
- New feature -> `skills/workflows/implement-feature/SKILL.md`
- Bug fix -> `skills/workflows/debug-bug/SKILL.md`
- Refactor -> `skills/workflows/refactor/SKILL.md`

## Quality gates
- Any structured event field/provenance change -> `skills/quality/provenance-review/SKILL.md`
- Any logic/API/storage change -> `skills/quality/test-writer/SKILL.md`
- Any user/family/baby data or secret handling -> `skills/quality/privacy-review/SKILL.md`
