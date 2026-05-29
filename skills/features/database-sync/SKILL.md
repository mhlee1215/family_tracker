# Database Sync Feature Skill

## When to use this skill
Changes to SQLite/Turso adapters, persistence schema, hydration, or sync path.

## Relevant files
- `src/server/db/sqlite-baby-store.js`
- `src/server/db/turso-baby-store.js`
- `src/server/db/store-factory.js`
- `docs/architecture.md`
- `scripts/check-turso.js`
- `tests/sqlite-baby-store.test.js`

## Rules
- Preserve local-first behavior.
- Keep server-store interface stable so backend can change without UI rewrite.
- Preserve `family_id`, `baby_id`, `author_id` boundaries.
- Never print or commit tokens/secrets.
- Use `npm run check:turso` for Turso credential/connectivity checks.
- Preserve proxy-aware Turso startup: `npm start` must route through `scripts/start-server.js`, and Turso mode must use `--use-env-proxy` plus `--dns-result-order=ipv4first`.
- Storage/runtime policy changes must be recorded in `.agents/skills/family-tracker-orchestrator/SKILL.md` and `docs/harness/family-tracker/team-spec.md`; README is not the agent source of truth.

## Checklist
- Verify schema compatibility/migration safety.
- Verify family/baby/author scoping in queries.
- Verify SQLite/Turso parity for changed behavior.
- For Turso runtime/startup changes, run `npm run check:turso` and verify `npm start` reaches `Storage provider: turso`.
- Add/update persistence tests.

## When to update this skill
- Storage backend contracts or sync behavior changes.
