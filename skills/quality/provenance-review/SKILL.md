# Provenance Review Quality Skill

## When to use this skill
Changes to structured fields, parsing, inference, or correction flow.

## Relevant files
- `src/domain/*.js`
- `docs/llm-contract.md`
- `tests/*parser*.test.js`
- `tests/*inference*.test.js`

## Rules
- Verify `explicit/system/inferred/user_corrected` are assigned correctly.
- Never convert non-user-entered values into `explicit`.
- Distinguish LLM extraction from deterministic inference.
- Keep confidence/basis/source semantics consistent.
- Add provenance-focused regression tests.

## Checklist
- Inspect changed fields for provenance correctness.
- Verify basis/confidence/source consistency.
- Add/adjust tests for provenance regressions.

## When to update this skill
- Provenance model semantics or validation standards evolve.
