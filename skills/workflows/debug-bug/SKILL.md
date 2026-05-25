# Debug Bug Workflow Skill

## When to use this skill
Fixing a bug/regression.

## Relevant files
- `tests/`
- Impacted app/domain/storage files

## Rules
- Start with reproduction or failing test.
- Find root cause and apply minimal fix.
- Add regression test.
- Review provenance and data-safety impact.
- Run `npm test`.

## Checklist
- Reproduce issue (test or clear scenario).
- Identify root cause in code path.
- Apply minimal targeted fix.
- Add regression test.
- Run full tests.

## When to update this skill
- Bug triage or regression standards evolve.
