# LLM Parser Feature Skill

## When to use this skill
Changes to natural-language parsing, provider abstraction, prompt/contract/schema.

## Relevant files
- `src/domain/baby-log-parser.js`
- `src/domain/llm-provider.js`
- `src/domain/openai-provider.js`
- `docs/llm-contract.md`
- `docs/architecture.md`
- `tests/baby-log-parser.test.js`

## Rules
- LLM extracts intent and explicit values only.
- Deterministic domain logic fills missing values.
- Provider calls must remain server-side.
- Update `docs/llm-contract.md` if parsing output schema changes.
- Include Korean short-input examples when adding examples.

## Checklist
- Verify parser output schema compatibility.
- Verify provenance source integrity.
- Verify provider calls are not in browser code.
- Add/update parser and inference tests.

## When to update this skill
- Parsing contract, provider boundary, or schema evolves.
