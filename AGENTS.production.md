# Production Phase Rules

Optimization goals: stability, safety, maintainability, migration safety, observability.

- Direct push to `main` is forbidden.
- Feature branch + PR required.
- Schema migration review required.
- Security/privacy review required.
- Full test suite must pass before merge.
- Prefer rollback-safe changes.
- Temporary mocks are forbidden.
- Unchecked schema changes are forbidden.
- Any user/baby/family data handling changes require privacy review.
- Deployment/release changes must include docs updates.
- In production, prioritize correctness and safety over speed.
