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

## Checklist
- Define unchanged behavior contract.
- Refactor in small safe steps.
- Keep tests green throughout.
- Avoid hidden behavior changes.

## When to update this skill
- Refactor safety practices are updated.
