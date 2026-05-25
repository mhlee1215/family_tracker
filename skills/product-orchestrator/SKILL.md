# Product Orchestrator Skill

## When to use
Any non-trivial product/code change.

## Steps
1. Identify feature area.
2. Identify workflow type.
3. Load relevant feature skill.
4. Load relevant workflow skill.
5. Load relevant quality skill.
6. Make change.
7. Run required checks.
8. Update docs/skills if reusable knowledge changed.

## Feature routing
- Baby log creation/history/general event flow -> `skills/features/baby-logs/SKILL.md`
- Sleep start/end/session linking -> `skills/features/sleep/SKILL.md`
- Milk/solid feeding -> `skills/features/feeding/SKILL.md`
- Diaper wet/dirty/mixed parsing -> `skills/features/diaper/SKILL.md`
- Natural language parsing/LLM contract -> `skills/features/llm-parser/SKILL.md`
- SQLite/Turso/storage/sync -> `skills/features/database-sync/SKILL.md`

## Workflow routing
- New feature -> `skills/workflows/implement-feature/SKILL.md`
- Bug fix -> `skills/workflows/debug-bug/SKILL.md`
- Refactor -> `skills/workflows/refactor/SKILL.md`

## Quality gates
- Any structured event field/provenance change -> `skills/quality/provenance-review/SKILL.md`
- Any logic/API/storage change -> `skills/quality/test-writer/SKILL.md`
- Any user/family/baby data or secret handling -> `skills/quality/privacy-review/SKILL.md`
