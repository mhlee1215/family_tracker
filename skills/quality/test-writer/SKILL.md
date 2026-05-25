# Test Writer Quality Skill

## When to use this skill
Any logic/API/storage behavior change.

## Relevant files
- `tests/*.test.js`
- Impacted modules under `src/` and `server.js`

## Rules
- Follow Node built-in test runner style.
- Cover product behavior, edge cases, and regression cases.
- Prefer domain-level tests for non-UI-only changes.
- When adding parsing examples, add matching tests.

## Checklist
- Add happy-path coverage.
- Add edge and regression cases.
- Keep tests deterministic and readable.
- Run `npm test`.

## When to update this skill
- Test strategy or coverage expectations change.
