# Architecture

Family Tracker separates browser UI from product logic.

## Layers

```text
app/
  Browser rendering and event handling.

src/domain/
  Baby log parsing, field inference, sleep-session linking, summaries, and LLM provider boundaries.

src/server/db/
  SQLite-backed local persistence for profiles, raw records, structured events, and module action logs.

tests/
  Unit tests for product logic and persistence hydration.
```

## Local-First Path

The MVP stores data in SQLite under `.family-tracker/family-tracker.sqlite`.

The server talks to a store interface so a hosted database can later replace SQLite without rewriting the browser UI:

```text
sqlite-baby-store.js now
postgres-baby-store.js later
```

## Cloud Path

Action logs store add/edit/delete/complete transactions separately from baby records and task records so user-facing records remain distinct from provenance/audit history. Undoable actions keep server-side before/after snapshots so an action can be reversed without exposing snapshot payloads to browser clients.

Profile records store baby identity, current newborn measurements, and feeding/sleep defaults. Dated growth records preserve each changed height/head/weight/Apgar entry for birth, current, or custom dates so summaries can show growth over time.

Growth moments are stored as structured `milestone` baby events linked to a raw log. The local-first MVP keeps small generated thumbnail previews in event JSON for immediate timeline display, while production original media should live in private object storage such as Cloudflare R2 with only provider/object metadata persisted in the app database.

Schema objects already include family/user-friendly boundaries:

- `family_id`
- `baby_id`
- `author_id`

The local MVP uses default IDs. Cloud sync can later attach those IDs to real accounts. Development auth intentionally keeps two local admin scopes: `admin-dev` uses `family-admin-dev` for manual/dev data, while `admin-test` uses `family-admin-test` for automated tests so seeded or mutated test data cannot mix with dev data.

## Lightweight Sync Refresh

The browser keeps automatic refreshes inexpensive by polling `GET /api/sync/state` only while the app is visible. The endpoint returns small per-module version tokens for baby logs, tasks, and profile/growth data. Full data reloads are reserved for modules whose version changed, while manual refresh and pull-to-refresh remain explicit user-requested full refresh paths.

SQLite and Turso stores compute these versions from family/baby-scoped timestamps and action logs so local-first behavior and family boundaries stay intact.

## LLM Boundary

Provider calls stay server-side:

```text
browser -> /api/logs -> server -> llm-provider -> parser/inference -> store
```

The log route uses the server-side provider abstraction when a non-mock provider is configured with a valid key. Account settings can activate any implemented provider only after a key is saved to the server runtime; the browser submits keys to the app server but never calls an LLM provider directly or receives saved key values back. Button-based baby log shortcuts explicitly request deterministic local parsing because their payloads are controlled UI actions. Free-form natural language submissions use the configured server-side LLM provider when available. If no provider key is available, or if provider parsing fails validation, free-form parsing falls back to deterministic local parsing. Before persistence, parser output is treated as a save decision: clear logs continue to inference and storage, while ambiguous logs return a clarification response and do not create raw logs, structured events, or action-log entries. Each structured event stores parser metadata (`parserInfo`) so the UI can show whether the event came from an LLM model, the local heuristic parser, or a system-generated event.

## Platform Path

1. Web/PWA first.
2. Add cloud auth and sync.
3. Wrap the same web app with Capacitor for iOS and Android when native distribution, push notifications, camera, or voice integrations become useful.

