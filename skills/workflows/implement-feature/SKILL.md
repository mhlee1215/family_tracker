# Implement Feature Workflow Skill

## When to use this skill
Building a new feature.

## Relevant files
- `app/`
- `src/domain/`
- `src/server/db/`
- `tests/`
- `README.md`

## Rules
- Find existing patterns first and implement with minimal change.
- Keep domain logic in `src/domain/`, UI in `app/`, persistence in `src/server/db/`.
- Add/update tests for behavior changes.
- Add or update a scenario test for the new feature; prefer Playwright E2E under `tests/e2e/specs/` for user-facing flows.
- Run `npm test`.
- Run `npm run test:e2e` locally before PR.
- Bump README build badge.
- If reusable rule emerges, update skills/docs.
- After code changes, always proceed to PR workflow: if no PR exists, create one; if a PR already exists, update that existing PR instead of creating a new one.

## Checklist
- Confirm scope and matching pattern.
- Implement minimal, coherent slice.
- Add or adjust tests.
- Add or update the feature scenario test and verify it covers the user entry point, primary action, and success state.
- Run `npm test` and fix failures.
- Run `npm run test:e2e` and fix failures.
- Update badge/docs/skills as required.
- Complete PR workflow (create new PR or update existing PR).

## When to update this skill
- Feature delivery workflow standards change.
