# Baby Logs Feature Skill

## When to use this skill
Changes to log creation, log history, today's logs, raw text storage, or structured event generation flow.

## Relevant files
- `server.js`
- `src/domain/baby-log-parser.js`
- `src/domain/inference-engine.js`
- `src/server/db/*.js`
- `app/main.js`
- `README.md`

## Rules
- Preserve raw user text as first-class data.
- Do not break raw-log ↔ structured-events linkage.
- Never mark non-user-entered values as `explicit`.
- If API behavior changes, update README API section and/or docs.

## Checklist
- Verify raw text is stored unchanged.
- Verify event IDs/rawLogId mapping stays valid.
- Verify provenance sources remain correct.
- Add/update tests for changed log behavior.

## When to update this skill
- New log ingestion patterns or API contracts are introduced.
