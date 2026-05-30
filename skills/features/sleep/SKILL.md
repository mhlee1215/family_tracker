# Sleep Feature Skill

## When to use this skill
Changes related to `낮잠`, `잠`, `깸`, sleep start/end, open-session closing, or session linking.

## Relevant files
- `src/domain/sleep-session.js`
- `src/domain/baby-log-parser.js`
- `src/domain/inference-engine.js`
- `tests/sleep-session.test.js`
- `tests/baby-log-parser.test.js`

## Rules
- Keep distinction between sleep start and completed sleep clear.
- `깸` should close an open sleep session when possible.
- Awake-only baby activities (milk feeding, solid feeding, diaper) should auto-close an open sleep session at the activity time.
- Inferred start/end/duration must use correct provenance (`inferred`/`system`).
- Sleep session logic changes require test updates.

## Checklist
- Validate open-session close behavior.
- Validate linked start/end consistency.
- Validate provenance of start/end/duration.
- Add regression tests for changed paths.

## When to update this skill
- Sleep intent mapping or session-linking rules change.
