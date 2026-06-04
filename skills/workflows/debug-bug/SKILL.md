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
- Run `npm run test:e2e` locally before PR.
- After code changes, always proceed to PR workflow before the final response: commit only intended changes, fetch latest `origin/main`, rebase the work branch onto it, push the branch, create a new PR or update the existing PR, enable auto-merge unless explicitly forbidden, and report the PR URL plus auto-merge status. If blocked, state the exact blocker and what remains.

## Checklist
- Reproduce issue (test or clear scenario).
- Identify root cause in code path.
- Apply minimal targeted fix.
- Add regression test.
- Run full tests.
- Run `npm run test:e2e`.
- Check git status and staged diff.
- Commit only intended changes.
- Fetch latest `origin/main`.
- Rebase the work branch onto `origin/main`.
- Push the branch.
- Create a new PR or update the existing PR.
- Enable auto-merge unless explicitly forbidden.
- Include the PR URL and auto-merge status in the final response.

## When to update this skill
- Bug triage or regression standards evolve.
