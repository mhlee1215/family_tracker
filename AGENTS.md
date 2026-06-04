# Agent Router

- Current project phase: development
- Load phase rules from: `AGENTS.dev.md`
- Always load: `skills/product-orchestrator/SKILL.md`

## Routing rules

- Before any non-trivial change, read `skills/product-orchestrator/SKILL.md` first, then only load relevant feature/workflow/quality skills.
- If touching domain logic, parser behavior, storage, or LLM boundary, review `docs/architecture.md` and `docs/llm-contract.md`.

- For any design-related change request (layout, visual style, interaction polish, spacing/typography/colors), review and follow `DESIGN.md` first.
## Maintenance rules

- When project phase changes, update `Current project phase` and active phase file.
- If reusable rule is learned, update related skill.
- If architecture changes, update `docs/architecture.md`.
- If parsing contract changes, update `docs/llm-contract.md`.
- If a new product domain appears, add a new feature skill.
- If the same mistake happens twice, create or update a quality skill.

## PR completion rule

- After any code change, do not send the final response until PR workflow is complete.
- Check current branch and git status, commit only intended changes, fetch latest `origin/main`, rebase the work branch onto it, push the branch, create a new PR or update the existing PR, enable auto-merge unless explicitly forbidden, and include the PR URL plus auto-merge status in the final response.
- If PR creation is impossible, explicitly state the blocker and what remains.
