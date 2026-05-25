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
- After code changes, always proceed to PR workflow: if no PR exists, create one; if a PR already exists, update that existing PR instead of creating a new one.

## Checklist
- Reproduce issue (test or clear scenario).
- Identify root cause in code path.
- Apply minimal targeted fix.
- Add regression test.
- Run full tests.
- Complete PR workflow (create new PR or update existing PR).

## When to update this skill
- Bug triage or regression standards evolve.
