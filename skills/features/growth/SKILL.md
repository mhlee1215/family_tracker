# Growth Feature Skill

## When to use this skill
Changes to baby growth measurements, dated growth history, growth summaries, or profile measurement storage.

## Relevant files
- `server.js`
- `src/domain/profile-defaults.js`
- `src/server/db/*.js`
- `app/index.html`
- `app/main.js`
- `app/styles.css`
- `tests/sqlite-baby-store.test.js`
- `README.md`
- `docs/architecture.md`

## Rules
- Treat height, head size, weight, Apgar, birth date, and birth time as sensitive baby data.
- Preserve dated growth history instead of overwriting historical measurements.
- Keep SQLite and Turso schemas in parity for growth records.
- Scope all growth records by `family_id` and `baby_id`, and retain `author_id` for accountability.
- Prefer summaries that show latest values plus change from a birth/earliest baseline.

## Checklist
- Verify each saved measurement has an intended record date (`birth`, `now`, or `custom`).
- Verify historical records remain available after profile values change.
- Add/update storage tests for growth history behavior.
- Update README/API docs when growth endpoints or summary behavior changes.

## When to update this skill
- Growth charting, percentile support, or pediatric reference behavior is introduced.
