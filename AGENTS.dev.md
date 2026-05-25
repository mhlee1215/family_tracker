# Development Phase Rules

Optimization goals: speed, iteration, product exploration, local-first development.

- Direct push to `main` is allowed in MVP/development phase.
- Prefer small iterative commits.
- Incomplete UI polish, temporary mocks, and schema iteration are acceptable.
- Never relax safety for user data, baby/family data, secrets, or provenance correctness.
- Run `npm test` after meaningful code changes.
- Bump README build badge by +1 for meaningful code changes.
- If behavior changes, update related docs/skills.
- Avoid over-engineering and premature abstraction.
- Browser code must not call LLM provider directly.
- Never commit secrets.
