# Diaper Feature Skill

## When to use this skill
Changes to diaper wet/dirty/mixed parsing and inference (`응가`, `쉬`, 기저귀).

## Relevant files
- `src/domain/baby-log-parser.js`
- `src/domain/inference-engine.js`
- `docs/llm-contract.md`
- `tests/baby-log-parser.test.js`

## Rules
- Preserve dirty/wet distinction.
- Do not let LLM invent unmentioned diaper details.
- Prefer deterministic fallback or clarification-friendly representation for ambiguity.
- Add tests when diaper parsing changes.

## Checklist
- Verify dirty/wet/mixed mapping.
- Verify provenance for inferred details.
- Verify ambiguous inputs are handled safely.
- Add regression tests.

## When to update this skill
- Diaper taxonomy or fallback rules change.
