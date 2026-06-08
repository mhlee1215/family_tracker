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
- Keep `src/server/db/store-factory.js` provider imports lazy so Cloudflare Pages/Turso runtimes do not import the SQLite `node:sqlite` module.
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
- For Cloudflare Pages runtime changes, verify `npm run pages:dev` with `.dev.vars` and Turso configuration.
- Add/update persistence tests.

## When to update this skill
- Storage backend contracts or sync behavior changes.

## Lightweight refresh sync
- Automatic browser refresh should use a small sync/version check first (`GET /api/sync/state`) and only reload full module data when a family-scoped module version changes.
- Keep sync-state queries scoped by `family_id` and `baby_id` where applicable, and preserve SQLite/Turso parity when adding modules to the sync response.
- Manual refresh and pull-to-refresh may perform full current-tab reloads because they are explicit user actions.
