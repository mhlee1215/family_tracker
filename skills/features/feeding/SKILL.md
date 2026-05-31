# Feeding Feature Skill

## When to use this skill
Changes to milk/solid feeding parsing, amount inference, and food name extraction.

## Relevant files
- `src/domain/baby-log-parser.js`
- `src/domain/inference-engine.js`
- `docs/llm-contract.md`
- `tests/baby-log-parser.test.js`
- `tests/inference-engine.test.js`

## Rules
- Minute units near feeding text are durations/timing notes, never milk `amountMl`; ask for clarification when meaning is ambiguous.
- `분유 먹음` maps to `feeding_milk`.
- Food names like `고구마 먹음` map to `feeding_solid`.
- If amount is not explicit, use deterministic default/inference and do not mark `explicit`.
- Preserve explicit provenance for user-entered food/item names.
- Check LLM contract examples when feeding behavior changes.

## Checklist
- Verify event-type mapping for milk vs solid.
- Verify amount provenance when inferred.
- Verify explicit food name extraction provenance.
- Add/update tests for parsing + inference behavior.

## When to update this skill
- New feeding shortcuts, units, or inference defaults are introduced.
