# Agent Router

- Current project phase: development
- Load phase rules from: `AGENTS.dev.md`
- Always load: `skills/product-orchestrator/SKILL.md`

## Routing rules

- Before any non-trivial change, read `skills/product-orchestrator/SKILL.md` first, then only load relevant feature/workflow/quality skills.
- If touching domain logic, parser behavior, storage, or LLM boundary, review `docs/architecture.md` and `docs/llm-contract.md`.

## Maintenance rules

- When project phase changes, update `Current project phase` and active phase file.
- If reusable rule is learned, update related skill.
- If architecture changes, update `docs/architecture.md`.
- If parsing contract changes, update `docs/llm-contract.md`.
- If a new product domain appears, add a new feature skill.
- If the same mistake happens twice, create or update a quality skill.
