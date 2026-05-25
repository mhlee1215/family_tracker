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
- After code changes, always proceed to PR workflow: if no PR exists, create one; if a PR already exists, update that existing PR instead of creating a new one.

## Checklist
- Define unchanged behavior contract.
- Refactor in small safe steps.
- Keep tests green throughout.
- Avoid hidden behavior changes.
- Complete PR workflow (create new PR or update existing PR).

## When to update this skill
- Refactor safety practices are updated.
