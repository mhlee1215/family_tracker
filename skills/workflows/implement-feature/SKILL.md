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
- Run `npm test`.
- Bump README build badge.
- If reusable rule emerges, update skills/docs.

## Checklist
- Confirm scope and matching pattern.
- Implement minimal, coherent slice.
- Add or adjust tests.
- Run `npm test` and fix failures.
- Update badge/docs/skills as required.

## When to update this skill
- Feature delivery workflow standards change.
