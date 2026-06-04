# Refactor Workflow Skill

## When to use this skill
Behavior-preserving refactors.

## Relevant files
- Target modules and their tests

## Rules
- Public behavior must remain unchanged.
- Do not mix schema/contract changes into refactor-only work.
- Split large refactors into small steps.
- Validate tests before and after.
- Run `npm test` after changes.
- Run `npm run test:e2e` locally before PR.
- After code changes, always proceed to PR workflow before the final response: commit only intended changes, fetch latest `origin/main`, rebase the work branch onto it, push the branch, create a new PR or update the existing PR, enable auto-merge unless explicitly forbidden, and report the PR URL plus auto-merge status. If blocked, state the exact blocker and what remains.

## Checklist
- Define unchanged behavior contract.
- Refactor in small safe steps.
- Keep tests green throughout.
- Run `npm run test:e2e`.
- Avoid hidden behavior changes.
- Complete PR workflow: fetch latest `origin/main`, rebase, push, create or update PR, enable auto-merge unless explicitly forbidden, and report PR URL plus auto-merge status.

## When to update this skill
- Refactor safety practices are updated.
